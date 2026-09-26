/* ==========================================================================
   Work Orders (ใบสั่งผลิต) grouped as projects by PO, Master BOM, and
   material issuance (เบิกวัสดุประกอบ) tracking. Operator/depthead/plant roles
   can claim, update progress on, and add work orders — persisted locally.
   ========================================================================== */

const WO_STORAGE_KEY = "y2j-workorders-v1";
const MY_NAME_STORAGE_KEY = "y2j-my-name-v1";
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

let woPendingId = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatThaiDate(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr + "T00:00:00");
  if (isNaN(d.getTime())) return isoStr;
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function currentRole() {
  return (typeof getStoredRole === "function") ? getStoredRole() : "plant";
}
function woCanAdd(role) { return role === "depthead" || role === "plant"; }
function woCanClaimOrUpdate(role) { return role === "operator" || role === "depthead" || role === "plant"; }

/* ---- persistence ---------------------------------------------------- */

function loadStoredWorkOrders() {
  try {
    const raw = localStorage.getItem(WO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function saveWorkOrders() {
  try {
    localStorage.setItem(WO_STORAGE_KEY, JSON.stringify(WORK_ORDERS));
    markWOSaved();
  } catch (e) {
    markWOSaveFailed();
  }
}

function markWOSaved() {
  const el = document.getElementById("woSaveStatus");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm})`;
}

function markWOSaveFailed() {
  const el = document.getElementById("woSaveStatus");
  if (!el) return;
  el.classList.add("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
}

function initWorkOrderData() {
  const stored = loadStoredWorkOrders();
  if (Array.isArray(stored)) {
    WORK_ORDERS.length = 0;
    stored.forEach((w) => WORK_ORDERS.push(w));
    return true;
  }
  return false;
}

function afterWOMutation() {
  saveWorkOrders();
  populateWOLineFilter();
  renderWorkOrders();
  renderMyTasks();
  if (typeof renderAlerts === "function") renderAlerts();
}

/* ---- "งานของฉัน" — personal workspace filtered to claimed work orders ---- */

function getMyName() {
  if (typeof authCurrentUser === "function" && authCurrentUser()) return authCurrentUser().name;
  try { return localStorage.getItem(MY_NAME_STORAGE_KEY) || ""; } catch (e) { return ""; }
}

function setMyName(name) {
  try { localStorage.setItem(MY_NAME_STORAGE_KEY, name); } catch (e) { /* ignore */ }
}

function renderMyTasks() {
  const label = document.getElementById("myTasksIdentityLabel");
  const tbody = document.querySelector("#myTasksTable tbody");
  if (!label || !tbody) return; // view not present (shouldn't happen, but keep this file usable standalone)

  const name = getMyName();
  label.textContent = name ? `คุณคือ: ${name}` : `ยังไม่ได้ระบุชื่อ — กด "ระบุชื่อ / เปลี่ยนชื่อ" เพื่อดูงานของคุณ`;

  const mine = name
    ? WORK_ORDERS.filter((w) => (w.assignee || "").trim().toLowerCase() === name.trim().toLowerCase())
    : [];
  const done = mine.filter((w) => w.status === "เสร็จสมบูรณ์").length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("myTasksStatTotal", mine.length);
  set("myTasksStatActive", mine.length - done);
  set("myTasksStatDone", done);

  tbody.innerHTML = "";
  const emptyNote = document.getElementById("myTasksEmptyNote");
  if (!name) {
    if (emptyNote) { emptyNote.style.display = "block"; emptyNote.textContent = "ระบุชื่อก่อนเพื่อดูงานของคุณ"; }
    return;
  }
  if (mine.length === 0) {
    if (emptyNote) {
      emptyNote.style.display = "block";
      emptyNote.textContent = 'ยังไม่มีงานที่รับไว้ — ไปที่ "ใบสั่งผลิต & BOM" แล้วกด "รับงาน" ได้เลย';
    }
    return;
  }
  if (emptyNote) emptyNote.style.display = "none";

  mine.forEach((wo) => {
    const pillClass = WO_STATUS_META[wo.status] || "pill-good";
    const canUpdate = wo.status !== "เสร็จสมบูรณ์";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(wo.wo)}</td>
      <td>${escapeHtml(wo.model)}</td>
      <td>${escapeHtml(wo.department)}</td>
      <td>${wo.issuedPct}%</td>
      <td>${escapeHtml(wo.dueDate)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(wo.status)}</span></td>
      <td>${canUpdate ? `<button class="btn-chip" data-action="update" data-wo="${escapeHtml(wo.wo)}">อัปเดต</button>` : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-action='update']").forEach((btn) => {
    btn.addEventListener("click", () => openUpdateModal(btn.getAttribute("data-wo")));
  });
}

function initMyTasksIdentity() {
  const btn = document.getElementById("myTasksIdentityBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = window.prompt("ชื่อของคุณ (ใช้กรองงานที่คุณรับผิดชอบในหน้า \"งานของฉัน\")", getMyName());
    if (next === null) return;
    setMyName(next.trim());
    renderMyTasks();
  });
}

/* ---- rendering -------------------------------------------------------- */

function renderWorkOrders() {
  const lineFilter = document.getElementById("woLineFilter");
  renderWOTable(lineFilter ? lineFilter.value : "__all__");
  const bomFilter = document.getElementById("bomModelFilter");
  renderBOMTable(bomFilter ? bomFilter.value : MACHINE_MODELS[0]);
  renderIssuanceTable();
  updateWorkOrderStats();
  if (typeof renderJobCards === "function") renderJobCards();

  const addBtn = document.getElementById("woAddBtn");
  if (addBtn) addBtn.hidden = !woCanAdd(currentRole());
}

function populateBOMFilter() {
  const select = document.getElementById("bomModelFilter");
  if (!select) return;
  select.innerHTML = "";
  MACHINE_MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => renderBOMTable(select.value));
  const lv = document.getElementById("bomLevelFilter");
  if (lv) lv.addEventListener("change", () => woBomLevel(Number(lv.value)));
}

function populateWOLineFilter() {
  const select = document.getElementById("woLineFilter");
  if (!select) return;
  const previous = select.value;
  const lines = Array.from(new Set(WORK_ORDERS.map((w) => w.department))).sort();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "ทั้งหมด (ทุกไลน์)";
  select.appendChild(allOpt);
  lines.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    select.appendChild(opt);
  });
  select.value = lines.includes(previous) ? previous : "__all__";
  select.addEventListener("change", () => renderWOTable(select.value));
}

function woMatchesSearch(wo, term) {
  if (!term) return true;
  const haystack = [wo.wo, wo.po, wo.model, wo.department, wo.assignee || ""].join(" ").toLowerCase();
  return haystack.includes(term);
}

function renderWOTable(lineFilter) {
  const tbody = document.querySelector("#woTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const role = currentRole();
  const searchInput = document.getElementById("woSearchInput");
  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const list = (lineFilter && lineFilter !== "__all__"
    ? WORK_ORDERS.filter((w) => w.department === lineFilter)
    : WORK_ORDERS
  ).filter((w) => woMatchesSearch(w, term));

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="muted-note" style="text-align:center;padding:18px 4px;">ไม่พบใบสั่งผลิตที่ตรงกับคำค้นหา</td></tr>`;
    return;
  }

  list.forEach((wo) => {
    const pillClass = WO_STATUS_META[wo.status] || "pill-good";
    const tr = document.createElement("tr");
    const canClaim = woCanClaimOrUpdate(role) && wo.status === "วางแผน";
    const canUpdate = woCanClaimOrUpdate(role) && (wo.status === "กำลังผลิต" || wo.status === "ล่าช้า");
    let actions = "";
    if (canClaim) actions += `<button class="btn-chip" data-action="claim" data-wo="${escapeHtml(wo.wo)}">รับงาน</button>`;
    if (canUpdate) actions += `<button class="btn-chip" data-action="update" data-wo="${escapeHtml(wo.wo)}">อัปเดต</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(wo.wo)}</td>
      <td>${escapeHtml(wo.po)}</td>
      <td>${escapeHtml(wo.model)}</td>
      <td>${escapeHtml(wo.department)}</td>
      <td>${wo.qty}</td>
      <td>${wo.issuedPct}%</td>
      <td>${escapeHtml(wo.dueDate)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(wo.status)}</span></td>
      <td>${wo.assignee ? escapeHtml(wo.assignee) : "—"}</td>
      <td class="wo-actions-cell">${actions || "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const woId = btn.getAttribute("data-wo");
      if (btn.getAttribute("data-action") === "claim") openClaimModal(woId);
      else openUpdateModal(woId);
    });
  });
}

// Master BOM as a tree: group (01 CHASSIS …) › main assembly › sub-assembly › part.
// Opens on the main items; ▸ opens one assembly, the level picker opens every assembly down to a level.
let woBomModel = null;
function renderBOMTable(model) {
  const tbody = document.querySelector("#bomTable tbody");
  if (!tbody) return;
  if (model) woBomModel = model;
  model = woBomModel;
  tbody.innerHTML = "";
  const list = MASTER_BOM[model] || [];
  if (typeof bxTree !== "function") return;
  const tree = bxTree(model);
  const ids = new Set(list.map((l) => l.id));
  const hidden = new Set();
  const visible = tree.filter((r) => {
    if (r.isGroup) return true;
    const p = r.line.parent;
    if (p && ids.has(p) && (hidden.has(p) || !bxIsOpen(model, p))) { hidden.add(r.line.id); return false; }
    return true;
  });
  const size = {};
  tree.forEach((r) => { if (r.line) size[r.group] = (size[r.group] || 0) + 1; });
  const info = document.getElementById("bomTableInfo");
  if (info) info.textContent = `${model} · ${list.length.toLocaleString("th-TH")} รายการ · แสดง ${visible.filter((r) => r.line).length}`;
  tbody.innerHTML = visible.map((r) => {
    if (r.isGroup) return `<tr class="bom-group-row"><td colspan="6"><strong>${escapeHtml(r.no)} · ${escapeHtml(r.group)}</strong> <span class="muted-inline">${size[r.group] || 0} รายการ</span></td></tr>`;
    const l = r.line;
    const open = r.hasKids && bxIsOpen(model, l.id);
    const tog = r.hasKids
      ? `<button type="button" class="bx-tog" data-wtog="${escapeHtml(l.id)}" aria-expanded="${open}" aria-label="${open ? "ย่อ" : "ขยาย"} ${escapeHtml(l.part || "")}">${open ? "▾" : "▸"}</button>`
      : `<span class="bx-tog-space">${r.depth > 1 ? "└" : ""}</span>`;
    return `<tr${r.hasKids ? ' class="bom-assy-row"' : ""}>
      <td><span class="bx-itemno">${escapeHtml(r.no)}</span></td>
      <td class="mono-cell">${escapeHtml(l.code || "—")}</td>
      <td><div class="bom-part-cell"><span class="bom-indent" style="padding-left:${(r.depth - 1) * 18}px">${tog}</span><span>${escapeHtml(l.part || "")}</span>${r.hasKids ? ` <span class="pill pill-schedule">${r.kidCount} รายการย่อย</span>` : ""}</div></td>
      <td class="num">${escapeHtml(String(l.qty ?? ""))}</td>
      <td class="num"><strong>${escapeHtml(String(Math.round(r.per * 100) / 100))}</strong></td>
      <td>${escapeHtml(l.unit || "")}</td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll("[data-wtog]").forEach((b) => b.addEventListener("click", () => {
    const k = `${model}|${b.dataset.wtog}`;
    if (bxOpen.has(k)) bxOpen.delete(k); else bxOpen.add(k);
    bxSaveOpen();
    renderBOMTable();
  }));
}

function woBomLevel(lv) {
  if (!woBomModel || typeof bxTree !== "function") return;
  bxTree(woBomModel).filter((r) => r.line && r.hasKids).forEach((r) => {
    const k = `${woBomModel}|${r.line.id}`;
    if (r.depth < lv) bxOpen.add(k); else bxOpen.delete(k);
  });
  bxSaveOpen();
  renderBOMTable();
}

function renderIssuanceTable() {
  const tbody = document.querySelector("#issuanceTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const tracked = typeof bxWoIssuanceRows === "function" ? bxWoIssuanceRows() : [];
  const trackedWos = new Set(tracked.map((r) => r.wo));
  // built-in sample rows only for work orders that still exist and have no requisitions in the system
  const woIds = new Set(WORK_ORDERS.map((w) => w.wo));
  tracked.concat(MATERIAL_ISSUANCE.filter((r) => woIds.has(r.wo) && !trackedWos.has(r.wo))).forEach((row) => {
    const pillClass = ISSUANCE_STATUS_META[row.status] || "pill-good";
    const remaining = row.required - row.issued;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.wo)}</td>
      <td>${escapeHtml(row.part)}</td>
      <td>${row.required}</td>
      <td>${row.issued}</td>
      <td>${remaining}</td>
      <td><span class="pill ${pillClass}">${row.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateWorkOrderStats() {
  // สถิติในหน้าภาพรวมนับจากใบสั่งผลิตทั้งหมดของทุกไลน์ ไม่ผูกกับตัวกรองแผนกในตาราง
  const lateCount = WORK_ORDERS.filter((w) => w.status === "ล่าช้า").length;
  const avgIssuedPct = WORK_ORDERS.length ? Math.round(WORK_ORDERS.reduce((s, w) => s + (Number(w.issuedPct) || 0), 0) / WORK_ORDERS.length) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("woStatLate", lateCount);
  set("woStatAvgIssued", `${avgIssuedPct}%`);
  set("woStatTotal", WORK_ORDERS.length);
}

/* ---- claim / update / add actions ------------------------------------ */

function openClaimModal(woId) {
  woPendingId = woId;
  const wo = WORK_ORDERS.find((w) => w.wo === woId);
  document.getElementById("woClaimWoLabel").textContent = wo ? `${wo.wo} · ${wo.model} · ${wo.department}` : "";
  document.getElementById("woClaimName").value = "";
  document.getElementById("woClaimBackdrop").classList.add("open");
}

function openUpdateModal(woId) {
  woPendingId = woId;
  const wo = WORK_ORDERS.find((w) => w.wo === woId);
  const label = wo ? `${wo.wo} · ${wo.model} · ${wo.department}${wo.assignee ? " · ผู้รับผิดชอบ: " + wo.assignee : ""}` : "";
  document.getElementById("woUpdateWoLabel").textContent = label;
  document.getElementById("woUpdatePct").value = wo ? wo.issuedPct : 0;
  document.getElementById("woUpdateBackdrop").classList.add("open");
}

function generateWONumber() {
  if (typeof namingNext === "function") return namingNext("wo", WORK_ORDERS.map((w) => w.wo));
  const nums = WORK_ORDERS.map((w) => {
    const m = /WO-\d+-(\d+)/.exec(w.wo);
    return m ? Number(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 80) + 1;
  return `WO-2026-${String(next).padStart(3, "0")}`;
}

function populateWOFormSelects() {
  const modelSel = document.getElementById("woFormModel");
  const deptSel = document.getElementById("woFormDept");
  if (modelSel) {
    modelSel.innerHTML = "";
    MACHINE_MODELS.forEach((m) => {
      const o = document.createElement("option");
      o.value = m; o.textContent = m;
      modelSel.appendChild(o);
    });
  }
  if (deptSel) {
    deptSel.innerHTML = "";
    CAPACITY_LINES.forEach((l) => {
      const o = document.createElement("option");
      o.value = l; o.textContent = l;
      deptSel.appendChild(o);
    });
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

function exportWorkOrdersCSV() {
  const lineFilter = document.getElementById("woLineFilter");
  const searchInput = document.getElementById("woSearchInput");
  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const lineVal = lineFilter ? lineFilter.value : "__all__";
  const list = (lineVal && lineVal !== "__all__" ? WORK_ORDERS.filter((w) => w.department === lineVal) : WORK_ORDERS)
    .filter((w) => woMatchesSearch(w, term));

  const headers = ["เลขที่ใบสั่งผลิต", "อ้างอิง PO", "รุ่นเครื่องจักร", "แผนก/ไลน์ผลิต", "จำนวน", "เบิกวัสดุแล้ว(%)", "กำหนดส่งมอบ", "สถานะ", "ผู้รับผิดชอบ"];
  const rows = list.map((w) => [w.wo, w.po, w.model, w.department, w.qty, w.issuedPct, w.dueDate, w.status, w.assignee || ""]);
  const csvLines = [headers, ...rows].map((row) => row.map((cell) => {
    const s = String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  const csv = "﻿" + csvLines.join("\r\n"); // BOM so Excel reads Thai text correctly
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `work-orders-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initWorkOrderInteractions() {
  populateWOFormSelects();
  initMyTasksIdentity();

  const searchInput = document.getElementById("woSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const lineFilter = document.getElementById("woLineFilter");
      renderWOTable(lineFilter ? lineFilter.value : "__all__");
    });
  }

  const exportBtn = document.getElementById("woExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportWorkOrdersCSV();
      showToast("ส่งออกไฟล์ CSV แล้ว", "good");
    });
  }

  const addBtn = document.getElementById("woAddBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      document.getElementById("woFormPo").value = "";
      document.getElementById("woFormQty").value = 1;
      document.getElementById("woFormDue").value = "";
      document.getElementById("woAddBackdrop").classList.add("open");
    });
  }

  const addSaveBtn = document.getElementById("woAddSaveBtn");
  if (addSaveBtn) {
    addSaveBtn.addEventListener("click", () => {
      const po = document.getElementById("woFormPo").value.trim();
      const model = document.getElementById("woFormModel").value;
      const department = document.getElementById("woFormDept").value;
      const qty = Math.max(1, Number(document.getElementById("woFormQty").value) || 1);
      const dueIso = document.getElementById("woFormDue").value;
      if (!MASTER_BOM[model] || !(MASTER_BOM[model] || []).length) showToast(`รุ่น ${model} ยังไม่มี BOM — เบิกวัสดุตามรายการไม่ได้จนกว่าจะสร้าง BOM`, "warn");
      else if (BOM_META[model] && BOM_META[model].status !== BOM_RELEASED) showToast(`BOM ${model} ยังเป็นร่าง — ควรอนุมัติก่อนเริ่มผลิต`, "warn");
      const newWoId = generateWONumber();
      WORK_ORDERS.unshift({
        wo: newWoId,
        po: po || "-",
        model,
        department,
        qty,
        status: "วางแผน",
        issuedPct: 0,
        dueDate: dueIso ? formatThaiDate(dueIso) : "-",
      });
      if (typeof auditLog === "function") auditLog("สร้างใบสั่งผลิต", newWoId, `${model} × ${qty} · ${department}${po ? ` · อ้างอิง ${po}` : ""}`);
      afterWOMutation();
      closeModal("woAddBackdrop");
      showToast(`เพิ่มใบสั่งผลิต ${newWoId} แล้ว`, "good");
    });
  }

  const claimSaveBtn = document.getElementById("woClaimSaveBtn");
  if (claimSaveBtn) {
    claimSaveBtn.addEventListener("click", () => {
      const wo = WORK_ORDERS.find((w) => w.wo === woPendingId);
      if (!wo) return;
      const name = document.getElementById("woClaimName").value.trim();
      if (!name) { document.getElementById("woClaimName").focus(); return; }
      wo.assignee = name;
      wo.status = "กำลังผลิต";
      afterWOMutation();
      closeModal("woClaimBackdrop");
      showToast(`รับงาน ${wo.wo} แล้ว — เริ่มผลิตได้เลย`, "good");
    });
  }

  const updateSaveBtn = document.getElementById("woUpdateSaveBtn");
  if (updateSaveBtn) {
    updateSaveBtn.addEventListener("click", () => {
      const wo = WORK_ORDERS.find((w) => w.wo === woPendingId);
      if (!wo) return;
      let pct = Number(document.getElementById("woUpdatePct").value);
      if (isNaN(pct)) pct = wo.issuedPct;
      // jobs drawing material through BOM requisitions: the % comes from what the store actually issued
      if (typeof bxReqs === "function" && bxReqs().some((d) => d.wo === wo.wo)) {
        closeModal("woUpdateBackdrop");
        showToast(`${wo.wo}: % เบิกวัสดุคำนวณจากใบเบิกจริง (${wo.issuedPct}%) — แก้ได้ที่หน้า BOM & เบิกวัสดุ`, "warn");
        return;
      }
      pct = Math.max(0, Math.min(100, pct));
      wo.issuedPct = pct;
      if (pct >= 100) wo.status = "เสร็จสมบูรณ์";
      else if (wo.status === "เสร็จสมบูรณ์") wo.status = "กำลังผลิต";
      afterWOMutation();
      closeModal("woUpdateBackdrop");
      showToast(`อัปเดต ${wo.wo} เป็น ${pct}% แล้ว`, pct >= 100 ? "good" : undefined);
    });
  }

  const updateCompleteBtn = document.getElementById("woUpdateCompleteBtn");
  if (updateCompleteBtn) {
    updateCompleteBtn.addEventListener("click", () => {
      const wo = WORK_ORDERS.find((w) => w.wo === woPendingId);
      if (!wo) return;
      const reqs = typeof bxReqs === "function" ? bxReqs().filter((d) => d.wo === wo.wo) : [];
      const open = reqs.filter((d) => BX_OPEN_REQ.includes(d.status));
      if (open.length && !confirm(`${wo.wo} ยังมีใบเบิกค้าง (${open.map((d) => d.no).join(", ")}) — ปิดงานเลยหรือไม่?`)) return;
      if (!reqs.length) wo.issuedPct = 100; // tracked jobs keep the % the requisitions show
      wo.status = "เสร็จสมบูรณ์";
      if (typeof auditLog === "function") auditLog("ปิดใบสั่งผลิต", wo.wo, `${wo.model} × ${wo.qty} · เบิกวัสดุ ${wo.issuedPct}%${open.length ? ` · ใบเบิกค้าง ${open.map((d) => d.no).join(", ")}` : ""}`);
      afterWOMutation();
      closeModal("woUpdateBackdrop");
      showToast(`${wo.wo} เสร็จสมบูรณ์แล้ว`, "good");
    });
  }

  [["woAddCancelBtn", "woAddBackdrop"], ["woClaimCancelBtn", "woClaimBackdrop"], ["woUpdateCancelBtn", "woUpdateBackdrop"]]
    .forEach(([btnId, backdropId]) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener("click", () => closeModal(backdropId));
    });

  ["woAddBackdrop", "woClaimBackdrop", "woUpdateBackdrop"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", (e) => { if (e.target === el) el.classList.remove("open"); });
  });
}

function markWOInitialStatus(hasStored) {
  const el = document.getElementById("woSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดข้อมูลใบสั่งผลิตที่บันทึกไว้ในเบราว์เซอร์นี้ — รับงาน/อัปเดต/เพิ่มจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — รับงาน/อัปเดต/เพิ่มจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}
