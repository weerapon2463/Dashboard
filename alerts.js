/* ==========================================================================
   Delay & risk alerts (แจ้งเตือนความล่าช้าและความเสี่ยง) — an executive
   summary computed from every other module's data, shown on the overview.
   ========================================================================== */

function computeAlerts() {
  const alerts = [];

  PO_LIST.filter((po) => po.status === "ล่าช้า").forEach((po) => {
    alerts.push({
      type: "จัดซื้อ (PO)",
      detail: `${po.id} — ${po.item} จาก ${po.supplier} ส่งมอบล่าช้ากว่ากำหนด (${po.dueDate})`,
      severity: "critical",
    });
  });

  WORK_ORDERS.filter((wo) => wo.status === "ล่าช้า").forEach((wo) => {
    alerts.push({
      type: "ใบสั่งผลิต (WO)",
      detail: `${wo.wo} (อ้างอิง ${wo.po}) — ${wo.model} จำนวน ${wo.qty} คัน ล่าช้ากว่ากำหนดส่งมอบ (${wo.dueDate})`,
      severity: "critical",
    });
  });

  TOOL_CALIBRATION.filter((t) => t.status === "เกินกำหนด").forEach((t) => {
    alerts.push({
      type: "เครื่องมือวัด",
      detail: `${t.name} เกินกำหนดสอบเทียบ (ครบกำหนด ${t.nextCal})`,
      severity: "critical",
    });
  });

  MACHINE_STATUS.filter((m) => m.status !== "ใช้งานปกติ").forEach((m) => {
    alerts.push({
      type: "เครื่องจักร",
      detail: `${m.name} — ${m.status} (${m.note})`,
      severity: m.status === "เสีย" ? "critical" : "warning",
    });
  });

  LABOR_PLAN.filter((l) => l.actual - l.required < 0).forEach((l) => {
    const gap = l.actual - l.required;
    alerts.push({
      type: "กำลังคน",
      detail: `${l.line} ขาดกำลังคน ${Math.abs(gap)} คน (ต้องการ ${l.required} มี ${l.actual})`,
      severity: gap <= -3 ? "critical" : "warning",
    });
  });

  PR_LIST.filter((pr) => pr.status === "รออนุมัติ").forEach((pr) => {
    alerts.push({
      type: "จัดซื้อ (PR)",
      detail: `${pr.id} — ${pr.item} รออนุมัติจาก ${pr.requester}`,
      severity: "warning",
    });
  });

  alerts.sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));
  return alerts;
}

function renderAlerts() {
  const tbody = document.querySelector("#alertsTable tbody");
  if (!tbody) return;

  const alerts = computeAlerts();
  tbody.innerHTML = "";
  alerts.forEach((a) => {
    const pillClass = a.severity === "critical" ? "pill-critical" : "pill-warning";
    const label = a.severity === "critical" ? "วิกฤต" : "เฝ้าระวัง";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.type}</td>
      <td>${a.detail}</td>
      <td><span class="pill ${pillClass}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });

  const table = document.getElementById("alertsTable");
  const emptyNote = document.getElementById("alertsEmptyNote");
  if (table) table.style.display = alerts.length ? "" : "none";
  if (emptyNote) emptyNote.style.display = alerts.length ? "none" : "block";
}
