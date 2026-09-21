/* ==========================================================================
   Procurement module — PR (Purchase Requisition) / PO (Purchase Order) / Supplier
   ========================================================================== */

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
  PR_LIST.forEach((pr) => {
    const status = PR_STATUS_META[pr.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${pr.id}</td>
      <td>${pr.item}</td>
      <td>${pr.requester}</td>
      <td>${pr.date}</td>
      <td><span class="pill ${pillClass}">${pr.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPOTable() {
  const tbody = document.querySelector("#poTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  PO_LIST.forEach((po) => {
    const status = PO_STATUS_META[po.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${po.id}</td>
      <td>${po.supplier}</td>
      <td>${po.item}</td>
      <td>${fmtBaht(po.value)}</td>
      <td>${po.orderDate}</td>
      <td>${po.dueDate}</td>
      <td><span class="pill ${pillClass}">${po.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSupplierTable() {
  const tbody = document.querySelector("#supplierTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  SUPPLIER_LIST.forEach((s) => {
    const status = SUPPLIER_STATUS_META[s.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.category}</td>
      <td>${s.leadTime} วัน</td>
      <td>${s.rating.toFixed(1)} / 5.0</td>
      <td><span class="pill ${pillClass}">${s.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateProcurementStats() {
  const prPendingCount = PR_LIST.filter((pr) => pr.status === "รออนุมัติ").length;
  const poLateCount = PO_LIST.filter((po) => po.status === "ล่าช้า").length;
  const supplierActiveCount = SUPPLIER_LIST.filter((s) => s.status === "Active").length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("procStatPRPending", prPendingCount);
  set("procStatPOLate", poLateCount);
  set("procStatSupplierActive", `${supplierActiveCount} / ${SUPPLIER_LIST.length}`);
}
