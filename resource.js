/* ==========================================================================
   Resource Management module — คน (Labor) / เครื่องจักร (Machines) / เครื่องมือ (Tools)
   ========================================================================== */

function renderResource() {
  renderLaborTable();
  renderMachineTable();
  renderToolTable();
  updateResourceStats();
}

function renderLaborTable() {
  const tbody = document.querySelector("#laborTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  LABOR_PLAN.forEach((row) => {
    const gap = row.actual - row.required;
    const status = laborStatus(gap);
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const label = status === "critical" ? "ขาดกำลังคนมาก" : status === "warning" ? "ขาดกำลังคน" : "เพียงพอ";
    const gapText = gap > 0 ? `+${gap}` : `${gap}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.line}</td>
      <td>${row.required}</td>
      <td>${row.actual}</td>
      <td>${gapText}</td>
      <td>${row.shift}</td>
      <td><span class="pill ${pillClass}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMachineTable() {
  const tbody = document.querySelector("#machineTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  MACHINE_STATUS.forEach((m) => {
    const status = MACHINE_STATUS_META[m.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${m.department}</td>
      <td><span class="pill ${pillClass}">${m.status}</span></td>
      <td>${m.util}%</td>
      <td>${m.note}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderToolTable() {
  const tbody = document.querySelector("#toolTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  TOOL_CALIBRATION.forEach((t) => {
    const status = TOOL_STATUS_META[t.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.department}</td>
      <td>${t.lastCal}</td>
      <td>${t.nextCal}</td>
      <td><span class="pill ${pillClass}">${t.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateResourceStats() {
  const laborGapCount = LABOR_PLAN.filter((l) => l.actual - l.required < 0).length;
  const machineIssueCount = MACHINE_STATUS.filter((m) => m.status !== "ใช้งานปกติ").length;
  const toolOverdueCount = TOOL_CALIBRATION.filter((t) => t.status === "เกินกำหนด").length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("resStatLaborGap", laborGapCount);
  set("resStatMachineIssue", machineIssueCount);
  set("resStatToolOverdue", toolOverdueCount);
  // ภาพรวม (overview) ใช้ตัวเลขชุดเดียวกัน
  set("statLaborGap", laborGapCount);
  set("statMachineIssue", machineIssueCount);
}
