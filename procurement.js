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

function renderPRTable() {
  const tbody = document.querySelector("#prTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const role = currentRole();
  PR_LIST.forEach((pr) => {
    const status = PR_STATUS_META[pr.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const canAct = procCanApprove(role) && pr.status === "รออนุมัติ";
    const actions = canAct
      ? `<button class="btn-chip" data-action="approve" data-pr="${escapeHtml(pr.id)}">อนุมัติ</button>`
        + `<button class="btn-chip" data-action="reject" data-pr="${escapeHtml(pr.id)}">ปฏิเสธ</button>`
      : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(pr.id)}</td>
      <td>${escapeHtml(pr.item)}</td>
      <td>${escapeHtml(pr.requester)}</td>
      <td>${escapeHtml(pr.date)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(pr.status)}</span></td>
      <td class="wo-actions-cell">${actions}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pr = PR_LIST.find((p) => p.id === btn.getAttribute("data-pr"));
      if (!pr) return;
      if (btn.getAttribute("data-action") === "approve") {
        pr.status = "อนุมัติแล้ว";
        afterProcMutation();
        showToast(`อนุมัติ ${pr.id} แล้ว`, "good");
      } else {
        pr.status = "ปฏิเสธ";
        afterProcMutation();
        showToast(`ปฏิเสธ ${pr.id} แล้ว`, "warn");
      }
    });
  });
}

function renderPOTable() {
  const tbody = document.querySelector("#poTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const role = currentRole();
  PO_LIST.forEach((po) => {
    const status = PO_STATUS_META[po.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const canReceive = procCanReceive(role) && (po.status === "รอส่งมอบ" || po.status === "ล่าช้า");
    const actions = canReceive
      ? `<button class="btn-chip" data-action="receive" data-po="${escapeHtml(po.id)}">รับของแล้ว</button>`
      : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(po.id)}</td>
      <td>${escapeHtml(po.supplier)}</td>
      <td>${escapeHtml(po.item)}</td>
      <td>${fmtBaht(po.value)}</td>
      <td>${escapeHtml(po.orderDate)}</td>
      <td>${escapeHtml(po.dueDate)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(po.status)}</span></td>
      <td class="wo-actions-cell">${actions}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-action='receive']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const po = PO_LIST.find((p) => p.id === btn.getAttribute("data-po"));
      if (!po) return;
      po.status = "ส่งมอบแล้ว";
      afterProcMutation();
      showToast(`รับของ ${po.id} แล้ว`, "good");
    });
  });
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
