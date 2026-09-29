/* ==========================================================================
   Procurement module — PR (Purchase Requisition) / PO (Purchase Order) / Supplier.
   Depthead/plant can approve or reject a PR; operator/depthead/plant can mark
   a PO as received. Changes persist locally and feed back into alerts.
   ========================================================================== */

const PROC_STORAGE_KEY = "y2j-procurement-v1";

function procCanApprove(role) { return role === "depthead" || role === "plant"; }
function procCanReceive(role) { return role === "operator" || role === "depthead" || role === "plant"; }

function loadStoredProcurement() {
  try {
    const raw = localStorage.getItem(PROC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pr) || !Array.isArray(parsed.po)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveProcurement() {
  try {
    localStorage.setItem(PROC_STORAGE_KEY, JSON.stringify({ pr: PR_LIST, po: PO_LIST, suppliers: SUPPLIER_LIST }));
    markProcSaved();
  } catch (e) {
    markProcSaveFailed();
  }
}

function markProcSaved() {
  const el = document.getElementById("prSaveStatus");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm})`;
}

function markProcSaveFailed() {
  const el = document.getElementById("prSaveStatus");
  if (!el) return;
  el.classList.add("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
}

function markProcInitialStatus(hasStored) {
  const el = document.getElementById("prSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดข้อมูลจัดซื้อที่บันทึกไว้ในเบราว์เซอร์นี้ — อนุมัติ/ปฏิเสธ/รับของจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — อนุมัติ/ปฏิเสธ/รับของจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

function initProcurementData() {
  const stored = loadStoredProcurement();
  if (stored) {
    PR_LIST.length = 0;
    stored.pr.forEach((p) => PR_LIST.push(p));
    PO_LIST.length = 0;
    stored.po.forEach((p) => PO_LIST.push(p));
    if (Array.isArray(stored.suppliers) && stored.suppliers.length) {
      SUPPLIER_LIST.length = 0;
      stored.suppliers.forEach((x) => SUPPLIER_LIST.push(x));
    }
    return true;
  }
  return false;
}

function afterProcMutation() {
  saveProcurement();
  renderProcurement();
  if (typeof renderAlerts === "function") renderAlerts();
}

function renderProcurement() {
  renderPRTable();
  renderPOTable();
  renderSupplierTable();
  updateProcurementStats();
}

// PR / PO rows act through the purchase tracking flow (p2p.js) — the same approval rules, steps,
// goods receipt into stock and incoming inspection — never a shortcut that only flips a status (30 ก.ย.)
function procCase(field, id) { return (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).find((c) => c[field] === id) || null; }
function procStepBtn(c, stageId, label) {
  if (!c || typeof p2pCurrent !== "function") return "";
  const cur = p2pCurrent(c);
  if (!cur || cur.id !== stageId || !p2pCanRecord(cur, c)) return "";
  return `<button class="btn-chip" data-p2pstep="${escapeHtml(c.id)}" data-stage="${escapeHtml(stageId)}">${label}</button>`;
}
function procWire(tbody) {
  tbody.querySelectorAll("[data-p2pstep]").forEach((b) => b.addEventListener("click", () => openP2PStep(b.dataset.p2pstep, b.dataset.stage)));
  tbody.querySelectorAll("[data-p2pcase]").forEach((b) => b.addEventListener("click", () => { switchView("p2p"); openP2PCase(b.dataset.p2pcase); }));
}

function renderPRTable() {
  const tbody = document.querySelector("#prTable tbody");
  if (!tbody) return;
  const head = document.querySelector("#prTable thead tr");
  if (head) head.innerHTML = "<th>เลขที่ PR</th><th>รายการ</th><th>ผู้ขอ</th><th>วันที่ขอ</th><th>ตอนนี้อยู่ที่</th><th>สถานะ</th><th>การดำเนินการ</th>";
  tbody.innerHTML = PR_LIST.slice().reverse().map((pr) => {
    const c = procCase("pr", pr.id);
    const cur = c && typeof p2pCurrent === "function" ? p2pCurrent(c) : null;
    const status = PR_STATUS_META[pr.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const who = c && typeof p2pWhoCan === "function" ? p2pWhoCan(c).slice(0, 2).map((u) => u.name).join(" / ") : "";
    const acts = c
      ? `${procStepBtn(c, "approve", "✍ อนุมัติ / ไม่อนุมัติ")}<button class="btn-chip" data-p2pcase="${escapeHtml(c.id)}">ดูการติดตาม</button>`
      : "—";
    return `<tr>
      <td class="mono-cell">${escapeHtml(pr.id)}</td>
      <td>${escapeHtml(pr.item)}${c && c.value && (typeof authCanSeeCost !== "function" || authCanSeeCost()) ? `<div class="pilot-kpi-method">${Number(c.value).toLocaleString("th-TH")} บาท</div>` : ""}</td>
      <td>${escapeHtml(pr.requester)}</td>
      <td>${escapeHtml(pr.date)}</td>
      <td>${cur ? `${escapeHtml(cur.label)}${who ? `<div class="p2p-who">👤 ${escapeHtml(who)}</div>` : ""}` : c ? "ครบทุกขั้น" : "—"}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(pr.status)}</span></td>
      <td class="wo-actions-cell">${acts}</td></tr>`;
  }).join("");
  procWire(tbody);
}

function renderPOTable() {
  const tbody = document.querySelector("#poTable tbody");
  if (!tbody) return;
  const seeCost = typeof authCanSeeCost !== "function" || authCanSeeCost();
  tbody.innerHTML = PO_LIST.slice().reverse().map((po) => {
    const c = procCase("po", po.id);
    const status = PO_STATUS_META[po.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const acts = c
      ? `${procStepBtn(c, "ack", "ผู้ขายยืนยันวันส่ง")}${procStepBtn(c, "grn", "📦 รับของ (GRN)")}${procStepBtn(c, "iqc", "ตรวจรับ (IQC)")}<button class="btn-chip" data-p2pcase="${escapeHtml(c.id)}">ดูการติดตาม</button>`
      : "—";
    return `<tr>
      <td class="mono-cell">${escapeHtml(po.id)}</td>
      <td><button type="button" class="bx-link" data-supname="${escapeHtml(po.supplier)}">${escapeHtml(po.supplier)}</button></td>
      <td>${escapeHtml(po.item)}</td>
      <td>${seeCost ? fmtBaht(po.value) : "—"}</td>
      <td>${escapeHtml(po.orderDate)}</td>
      <td>${escapeHtml(po.dueDate)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(po.status)}</span></td>
      <td class="wo-actions-cell">${acts}</td></tr>`;
  }).join("");
  procWire(tbody);
  tbody.querySelectorAll("[data-supname]").forEach((b) => b.addEventListener("click", () => openSupplier(b.dataset.supname)));
}

function updateProcurementStats() {
  const prPendingCount = PR_LIST.filter((pr) => pr.status === "รออนุมัติ").length;
  const poLateCount = PO_LIST.filter((po) => po.status === "ล่าช้า").length;
  const supplierActiveCount = SUPPLIER_LIST.filter((s) => s.status === "Active").length; // "On Hold" / "เลิกใช้" are not counted

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("procStatPRPending", prPendingCount);
  set("procStatPOLate", poLateCount);
  set("procStatSupplierActive", `${supplierActiveCount} / ${SUPPLIER_LIST.length}`);
}
