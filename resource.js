/* ==========================================================================
   Resource Management module — คน (Labor) / เครื่องจักร (Machines) / เครื่องมือ (Tools)
   Labor headcount is editable by depthead/plant; machine status can be
   reported by anyone with floor access; tool calibration can be confirmed
   by anyone. Changes persist locally.
   ========================================================================== */

const RES_STORAGE_KEY = "y2j-resource-v1";
const TOOL_CAL_CYCLE_MONTHS = 6;
const TH_MONTHS_RES = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function laborCanEdit(role) { return role === "depthead" || role === "plant"; }
function machineCanEdit(role) { return role === "operator" || role === "depthead" || role === "plant"; }
function toolCanEdit(role) { return role === "operator" || role === "depthead" || role === "plant"; }

/* ---- persistence ------------------------------------------------------ */

function loadStoredResource() {
  try {
    const raw = localStorage.getItem(RES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.labor) || !Array.isArray(parsed.machine) || !Array.isArray(parsed.tool)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveResource() {
  try {
    localStorage.setItem(RES_STORAGE_KEY, JSON.stringify({ labor: LABOR_PLAN, machine: MACHINE_STATUS, tool: TOOL_CALIBRATION }));
    markResSaved();
  } catch (e) {
    markResSaveFailed();
  }
}

function markResSaved() {
  const el = document.getElementById("resSaveStatus");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm})`;
}

function markResSaveFailed() {
  const el = document.getElementById("resSaveStatus");
  if (!el) return;
  el.classList.add("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
}

function markResInitialStatus(hasStored) {
  const el = document.getElementById("resSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดข้อมูลทรัพยากรที่บันทึกไว้ในเบราว์เซอร์นี้ — แก้ไขจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — แก้ไขจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

function initResourceData() {
  const stored = loadStoredResource();
  if (stored) {
    LABOR_PLAN.length = 0;
    stored.labor.forEach((r) => LABOR_PLAN.push(r));
    MACHINE_STATUS.length = 0;
    stored.machine.forEach((r) => MACHINE_STATUS.push(r));
    TOOL_CALIBRATION.length = 0;
    stored.tool.forEach((r) => TOOL_CALIBRATION.push(r));
    return true;
  }
  return false;
}

function afterResourceMutation() {
  saveResource();
  renderResource();
}

/* ---- rendering ---------------------------------------------------------- */

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
  const canEdit = laborCanEdit(currentRole());
  LABOR_PLAN.forEach((row, index) => {
    const gap = row.actual - row.required;
    const status = laborStatus(gap);
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const label = status === "critical" ? "ขาดกำลังคนมาก" : status === "warning" ? "ขาดกำลังคน" : "เพียงพอ";
    const gapText = gap > 0 ? `+${gap}` : `${gap}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.line)}</td>
      <td>${row.required}</td>
      <td>${canEdit ? `<input type="number" class="wo-search labor-actual-input" style="min-width:70px;width:80px;padding:5px 8px;" min="0" value="${row.actual}" data-index="${index}">` : row.actual}</td>
      <td>${gapText}</td>
      <td>${escapeHtml(row.shift)}</td>
      <td><span class="pill ${pillClass}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });

  if (canEdit) {
    tbody.querySelectorAll(".labor-actual-input").forEach((input) => {
      input.addEventListener("change", () => {
        const index = Number(input.getAttribute("data-index"));
        const val = Math.max(0, Number(input.value) || 0);
        LABOR_PLAN[index].actual = val;
        afterResourceMutation();
        showToast(`อัปเดตกำลังคน ${LABOR_PLAN[index].line} เป็น ${val} คนแล้ว`, "good");
      });
    });
  }
}

function renderMachineTable() {
  const tbody = document.querySelector("#machineTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const canEdit = machineCanEdit(currentRole());
  const statuses = Object.keys(MACHINE_STATUS_META);
  MACHINE_STATUS.forEach((m, index) => {
    const status = MACHINE_STATUS_META[m.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const tr = document.createElement("tr");
    const statusCell = canEdit
      ? `<select class="machine-status-select" data-index="${index}">${statuses.map((s) => `<option value="${s}"${s === m.status ? " selected" : ""}>${s}</option>`).join("")}</select>`
      : `<span class="pill ${pillClass}">${escapeHtml(m.status)}</span>`;
    tr.innerHTML = `
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.department)}</td>
      <td>${statusCell}</td>
      <td>${m.util}%</td>
      <td>${escapeHtml(m.note)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (canEdit) {
    tbody.querySelectorAll(".machine-status-select").forEach((select) => {
      select.addEventListener("change", () => {
        const index = Number(select.getAttribute("data-index"));
        MACHINE_STATUS[index].status = select.value;
        if (select.value === "ใช้งานปกติ") MACHINE_STATUS[index].note = "กลับมาใช้งานปกติแล้ว";
        afterResourceMutation();
        showToast(`อัปเดตสถานะ ${MACHINE_STATUS[index].name} เป็น "${select.value}" แล้ว`, select.value === "เสีย" ? "warn" : "good");
      });
    });
  }
}

function renderToolTable() {
  const tbody = document.querySelector("#toolTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const canEdit = toolCanEdit(currentRole());
  TOOL_CALIBRATION.forEach((t, index) => {
    const status = TOOL_STATUS_META[t.status] || "good";
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const needsCal = t.status === "เกินกำหนด" || t.status === "ใกล้ครบกำหนด";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.department)}</td>
      <td>${escapeHtml(t.lastCal)}</td>
      <td>${escapeHtml(t.nextCal)}</td>
      <td><span class="pill ${pillClass}">${escapeHtml(t.status)}</span></td>
      <td>${canEdit && needsCal ? `<button class="btn-chip" data-action="calibrate" data-index="${index}">สอบเทียบแล้ว</button>` : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  if (canEdit) {
    tbody.querySelectorAll("[data-action='calibrate']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-index"));
        const t = TOOL_CALIBRATION[index];
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + TOOL_CAL_CYCLE_MONTHS, now.getDate());
        t.lastCal = `${now.getDate()} ${TH_MONTHS_RES[now.getMonth()]} ${now.getFullYear() + 543}`;
        t.nextCal = `${next.getDate()} ${TH_MONTHS_RES[next.getMonth()]} ${next.getFullYear() + 543}`;
        t.status = "ปกติ";
        afterResourceMutation();
        showToast(`สอบเทียบ ${t.name} เสร็จแล้ว — รอบถัดไป ${t.nextCal}`, "good");
      });
    });
  }
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
