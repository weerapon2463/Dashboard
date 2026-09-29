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
  TOOL_CALIBRATION.forEach((x) => { x.status = resToolStatus(x); });
  renderLaborTable();
  renderMachineLive();
  renderMachineTable();
  renderToolTable();
  updateResourceStats();
}

// People per workstation: needed = the coming 4 weeks' load (capacity-planning.js) ÷ one person's week,
// have = people set for the station (same number as Capacity), who = the people on its job cards (30 ก.ย.)
function resStations() {
  if (typeof capModel !== "function") return [];
  const m = capModel();
  const who = {};
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => (w.jobs || []).forEach((j) => {
    if (!j.station) return;
    (who[j.station] = who[j.station] || new Set());
    if (j.assignee) who[j.station].add(j.assignee);
    (j.logs || []).forEach((l) => { if (l.by) who[j.station].add(l.by); });
  }));
  return m.stations.map((s) => {
    const need = Math.ceil(s.needPeople);
    return { s, need, have: s.people, gap: s.people - need, who: [...(who[s.id] || [])] };
  });
}
function renderLaborTable() {
  const tbody = document.querySelector("#laborTable tbody");
  if (!tbody) return;
  const head = document.querySelector("#laborTable thead tr");
  if (head) head.innerHTML = "<th>สถานี</th><th>ต้องการ (คน)</th><th>มีจริง (คน)</th><th>ผลต่าง</th><th>คนที่ทำงานสถานีนี้ (จาก Job Card)</th><th>สถานะ</th>";
  const canEdit = laborCanEdit(currentRole()) || currentRole() === "admin";
  const rows = resStations();
  tbody.innerHTML = rows.map((r, i) => {
    const status = laborStatus(r.gap);
    const pill = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const label = status === "critical" ? "ขาดกำลังคนมาก" : status === "warning" ? "ขาดกำลังคน" : "เพียงพอ";
    return `<tr><td><b>${escapeHtml(r.s.id)}</b> ${escapeHtml(r.s.name)}</td>
      <td class="num">${r.need} <small class="muted-inline">(${r.s.next4}% ของ ${r.s.people} คน)</small></td>
      <td>${canEdit ? `<input type="number" class="wo-search labor-actual-input" style="min-width:70px;width:80px;padding:5px 8px;" min="1" value="${r.have}" data-i="${i}">` : r.have}</td>
      <td class="num">${r.gap > 0 ? `+${r.gap}` : r.gap}</td>
      <td>${r.who.length ? escapeHtml(r.who.join(", ")) : `<span class="muted-inline">ยังไม่มีใครลงเวลา</span>`}</td>
      <td><span class="pill ${pill}">${label}</span></td></tr>`;
  }).join("") || `<tr><td colspan="6" class="muted-inline">ยังไม่มีสถานีงาน</td></tr>`;
  if (canEdit) tbody.querySelectorAll(".labor-actual-input").forEach((input) => input.addEventListener("change", () => {
    const r = rows[+input.dataset.i];
    const val = Math.max(1, Math.round(Number(input.value) || 1));
    r.s.w.people = val;
    if (typeof bxSaveStock === "function") bxSaveStock();
    if (typeof auditLog === "function") auditLog("ตั้งกำลังการผลิต", r.s.id, `คน: ${r.have} → ${val}`);
    renderResource();
    showToast(`${r.s.id}: ${val} คน — กำลังการผลิตอัปเดตตามแล้ว`, "good");
  }));
}

// machines stopped right now: job cards stopped for a machine reason, and open repair requests
function renderMachineLive() {
  const card = document.getElementById("machineTable");
  if (!card) return;
  let box = document.getElementById("resMachineLive");
  if (!box) { box = document.createElement("div"); box.id = "resMachineLive"; card.parentElement.insertBefore(box, card); }
  const stops = [];
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => (w.jobs || []).forEach((j) => (j.downs || []).forEach((d) => {
    if (!d.to && /เครื่อง|machine/i.test(d.reason || "")) stops.push(`${j.station} · ${w.wo} ${j.op}: ${d.reason} ตั้งแต่ ${new Date(d.from).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}${d.by ? ` (${d.by})` : ""}`);
  })));
  const mtDef = typeof DOC_TYPES !== "undefined" && DOC_TYPES.mt;
  const mts = (typeof DEPT_DOCS !== "undefined" && DEPT_DOCS.mt || []).filter((d) => !(mtDef && (mtDef.closed || []).includes(d.status)) && !/เสร็จ|ปิด|ยกเลิก/.test(d.status || ""));
  box.innerHTML = `<div class="res-live${stops.length || mts.length ? " res-live-bad" : ""}"><b>ตอนนี้จากระบบ:</b> ${stops.length ? `⚠ เครื่องจักรหยุด ${stops.length} งาน — ${escapeHtml(stops.join(" · "))}` : "ไม่มีงานที่หยุดเพราะเครื่องจักร"} · ใบแจ้งซ่อมที่ยังเปิด ${mts.length} ใบ${mts.length ? `: ${escapeHtml(mts.slice(0, 4).map((d) => `${d.no} ${d.title || ""} (${d.status})`).join(" · "))}` : ""}</div>`;
}

// calibration status from the due date itself (not a stored word that goes stale)
function resParseThai(s) {
  const m = String(s || "").match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (!m) return NaN;
  const mi = TH_MONTHS_RES.indexOf(m[2]);
  return mi < 0 ? NaN : new Date(Number(m[3]) - 543, mi, Number(m[1])).getTime();
}
function resToolStatus(t) {
  const due = resParseThai(t.nextCal);
  if (isNaN(due)) return t.status;
  const days = (due - Date.now()) / 86400000;
  return days < 0 ? "เกินกำหนด" : days <= 30 ? "ใกล้ครบกำหนด" : "ปกติ";
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
  TOOL_CALIBRATION.forEach((x) => { x.status = resToolStatus(x); });
  const laborGapCount = resStations().filter((r) => r.gap < 0).length;
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
