/* ==========================================================================
   Work Orders (ใบสั่งผลิต) grouped as projects by PO, Master BOM, and
   material issuance (เบิกวัสดุประกอบ) tracking.
   ========================================================================== */

function renderWorkOrders() {
  const lineFilter = document.getElementById("woLineFilter");
  renderWOTable(lineFilter ? lineFilter.value : "__all__");
  const bomFilter = document.getElementById("bomModelFilter");
  renderBOMTable(bomFilter ? bomFilter.value : MACHINE_MODELS[0]);
  renderIssuanceTable();
  updateWorkOrderStats();
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
  select.addEventListener("change", () => renderWOTable(select.value));
}

function renderWOTable(lineFilter) {
  const tbody = document.querySelector("#woTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = lineFilter && lineFilter !== "__all__"
    ? WORK_ORDERS.filter((w) => w.department === lineFilter)
    : WORK_ORDERS;
  list.forEach((wo) => {
    const pillClass = WO_STATUS_META[wo.status] || "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${wo.wo}</td>
      <td>${wo.po}</td>
      <td>${wo.model}</td>
      <td>${wo.department}</td>
      <td>${wo.qty}</td>
      <td>${wo.issuedPct}%</td>
      <td>${wo.dueDate}</td>
      <td><span class="pill ${pillClass}">${wo.status}</span></td>
    `;
    tbody.appendChild(tr);
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
