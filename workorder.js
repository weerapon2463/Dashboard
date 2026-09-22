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
  if (stored && stored.length) {
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

function renderBOMTable(model) {
  const tbody = document.querySelector("#bomTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = MASTER_BOM[model] || [];
  list.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.part}</td>
      <td>${row.qty}</td>
      <td>${row.unit}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderIssuanceTable() {
  const tbody = document.querySelector("#issuanceTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  MATERIAL_ISSUANCE.forEach((row) => {
    const pillClass = ISSUANCE_STATUS_META[row.status] || "pill-good";
    const remaining = row.required - row.issued;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.wo}</td>
      <td>${row.part}</td>
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
  const avgIssuedPct = Math.round(WORK_ORDERS.reduce((s, w) => s + w.issuedPct, 0) / WORK_ORDERS.length);

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
      wo.issuedPct = 100;
      wo.status = "เสร็จสมบูรณ์";
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
