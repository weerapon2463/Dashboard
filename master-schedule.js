/* ==========================================================================
   Master Schedule module — simple CSS-grid Gantt chart. Depthead/plant roles
   can add, edit, and delete projects/lots; changes persist locally.
   ========================================================================== */

const SCHEDULE_NOW_WEEK = 5; // demo "current week" marker
const MS_STORAGE_KEY = "y2j-master-schedule-v1";

let msPendingIndex = null; // index into MASTER_SCHEDULE being edited, or null when adding

function scheduleCanEdit(role) { return role === "depthead" || role === "plant"; }

/* ---- persistence ------------------------------------------------------ */

function loadStoredSchedule() {
  try {
    const raw = localStorage.getItem(MS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function saveSchedule() {
  try {
    localStorage.setItem(MS_STORAGE_KEY, JSON.stringify(MASTER_SCHEDULE));
    markMSSaved();
  } catch (e) {
    markMSSaveFailed();
  }
}

function markMSSaved() {
  const el = document.getElementById("msSaveStatus");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm})`;
}

function markMSSaveFailed() {
  const el = document.getElementById("msSaveStatus");
  if (!el) return;
  el.classList.add("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
}

function markMSInitialStatus(hasStored) {
  const el = document.getElementById("msSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดแผนการผลิตที่บันทึกไว้ในเบราว์เซอร์นี้ — เพิ่ม/แก้ไข/ลบจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — เพิ่ม/แก้ไข/ลบจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

function initScheduleData() {
  const stored = loadStoredSchedule();
  if (stored && stored.length) {
    MASTER_SCHEDULE.length = 0;
    stored.forEach((row) => MASTER_SCHEDULE.push(row));
    return true;
  }
  return false;
}

function afterScheduleMutation() {
  saveSchedule();
  renderMasterSchedule();
}

/* ---- rendering ---------------------------------------------------------- */

function renderMasterSchedule() {
  const container = document.getElementById("ganttChart");
  if (!container) return;
  container.innerHTML = "";

  const role = currentRole();
  const canEdit = scheduleCanEdit(role);
  const addBtn = document.getElementById("msAddBtn");
  if (addBtn) addBtn.hidden = !canEdit;

  const header = document.createElement("div");
  header.className = "gantt-header";
  const headerSpacer = document.createElement("div");
  header.appendChild(headerSpacer);
  const headerWeeks = document.createElement("div");
  headerWeeks.className = "gantt-header-weeks";
  headerWeeks.style.gridTemplateColumns = `repeat(${SCHEDULE_TOTAL_WEEKS}, 1fr)`;
  for (let w = 0; w < SCHEDULE_TOTAL_WEEKS; w++) {
    const tick = document.createElement("div");
    tick.className = "gantt-week-tick";
    tick.textContent = "W" + (w + 1);
    headerWeeks.appendChild(tick);
  }
  header.appendChild(headerWeeks);
  container.appendChild(header);

  MASTER_SCHEDULE.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "gantt-row";

    const label = document.createElement("div");
    label.className = "gantt-row-label";
    const labelText = document.createElement("span");
    labelText.textContent = row.model;
    label.appendChild(labelText);

    if (canEdit) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-chip ms-row-edit";
      editBtn.textContent = "แก้ไข";
      editBtn.addEventListener("click", () => openScheduleModal(index));
      label.appendChild(editBtn);
    }
    rowEl.appendChild(label);

    const track = document.createElement("div");
    track.className = "gantt-track";

    row.phases.forEach((p) => {
      const bar = document.createElement("div");
      bar.className = "gantt-bar";
      const leftPct = (p.start / SCHEDULE_TOTAL_WEEKS) * 100;
      const widthPct = (p.dur / SCHEDULE_TOTAL_WEEKS) * 100;
      bar.style.left = leftPct + "%";
      bar.style.width = widthPct + "%";
      bar.style.background = PHASE_COLORS[p.phase];
      bar.textContent = p.phase;
      bar.title = `${row.model} — ${p.phase}: สัปดาห์ ${p.start + 1}-${p.start + p.dur}`;
      track.appendChild(bar);
    });

    const nowMarker = document.createElement("div");
    const nowLeftPct = (SCHEDULE_NOW_WEEK / SCHEDULE_TOTAL_WEEKS) * 100;
    nowMarker.style.position = "absolute";
    nowMarker.style.left = nowLeftPct + "%";
    nowMarker.style.top = "0";
    nowMarker.style.bottom = "0";
    nowMarker.style.width = "2px";
    nowMarker.style.background = cssVar("--text-primary");
    nowMarker.style.opacity = "0.35";
    track.appendChild(nowMarker);

    rowEl.appendChild(track);
    container.appendChild(rowEl);
  });

  renderGanttLegend();
  updateScheduleStat();
}

function renderGanttLegend() {
  const legend = document.getElementById("ganttLegend");
  if (!legend) return;
  legend.innerHTML = "";
  SCHEDULE_PHASES.forEach((phase) => {
    const span = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = PHASE_COLORS[phase];
    span.appendChild(swatch);
    span.appendChild(document.createTextNode(phase));
    legend.appendChild(span);
  });
  const nowSpan = document.createElement("span");
  nowSpan.textContent = `— เส้นแนวตั้ง = สัปดาห์ปัจจุบัน (W${SCHEDULE_NOW_WEEK + 1})`;
  legend.appendChild(nowSpan);
}

function updateScheduleStat() {
  const activeCount = MASTER_SCHEDULE.filter((row) =>
    row.phases.some((p) => SCHEDULE_NOW_WEEK >= p.start && SCHEDULE_NOW_WEEK < p.start + p.dur)
  ).length;
  const el = document.getElementById("statActiveProjects");
  if (el) el.textContent = activeCount;
}

/* ---- add / edit / delete ------------------------------------------------ */

const MS_DUR_FIELD_BY_PHASE = {
  "ออกแบบ": "msFormDurDesign",
  "จัดซื้อ": "msFormDurProcure",
  "ประกอบ": "msFormDurAssemble",
  "ทดสอบ": "msFormDurTest",
  "ส่งมอบ": "msFormDurDeliver",
};

function buildPhasesFromForm(startWeek) {
  let cursor = startWeek;
  return SCHEDULE_PHASES.map((phase) => {
    const dur = Math.max(1, Number(document.getElementById(MS_DUR_FIELD_BY_PHASE[phase]).value) || 1);
    const entry = { phase, start: cursor, dur };
    cursor += dur;
    return entry;
  });
}

function openScheduleModal(index) {
  msPendingIndex = index;
  const isEdit = index !== null && index !== undefined;
  const row = isEdit ? MASTER_SCHEDULE[index] : null;

  document.getElementById("msFormTitle").textContent = isEdit ? "แก้ไขโครงการ" : "เพิ่มโครงการใหม่";
  document.getElementById("msFormModel").value = row ? row.model : "";
  document.getElementById("msFormStart").value = row ? row.phases[0].start : SCHEDULE_NOW_WEEK;
  SCHEDULE_PHASES.forEach((phase, i) => {
    const fieldId = MS_DUR_FIELD_BY_PHASE[phase];
    const defaultDur = [1, 2, 4, 2, 1][i];
    document.getElementById(fieldId).value = row ? row.phases[i].dur : defaultDur;
  });
  document.getElementById("msDeleteBtn").hidden = !isEdit;
  document.getElementById("msFormBackdrop").classList.add("open");
}

function initScheduleInteractions() {
  const addBtn = document.getElementById("msAddBtn");
  if (addBtn) addBtn.addEventListener("click", () => openScheduleModal(null));

  document.getElementById("msFormCancelBtn").addEventListener("click", () => {
    document.getElementById("msFormBackdrop").classList.remove("open");
  });
  document.getElementById("msFormBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });

  document.getElementById("msFormSaveBtn").addEventListener("click", () => {
    const model = document.getElementById("msFormModel").value.trim();
    if (!model) { document.getElementById("msFormModel").focus(); return; }
    const startWeek = Math.max(0, Number(document.getElementById("msFormStart").value) || 0);
    const phases = buildPhasesFromForm(startWeek);
    const lastPhase = phases[phases.length - 1];
    const endWeek = lastPhase.start + lastPhase.dur;

    if (msPendingIndex !== null && msPendingIndex !== undefined) {
      MASTER_SCHEDULE[msPendingIndex] = { model, phases };
    } else {
      MASTER_SCHEDULE.push({ model, phases });
    }
    afterScheduleMutation();
    document.getElementById("msFormBackdrop").classList.remove("open");
    showToast(`บันทึกแผนของ ${model} แล้ว`, "good");
    if (endWeek > SCHEDULE_TOTAL_WEEKS) {
      showToast(`หมายเหตุ: ${model} วิ่งเลยสัปดาห์ที่ ${SCHEDULE_TOTAL_WEEKS} ที่แสดงในตาราง (ถึง W${endWeek})`, "warn");
    }
  });

  document.getElementById("msDeleteBtn").addEventListener("click", () => {
    if (msPendingIndex === null || msPendingIndex === undefined) return;
    const model = MASTER_SCHEDULE[msPendingIndex].model;
    if (!confirm(`ลบโครงการ "${model}" ออกจากแผนการผลิต?`)) return;
    MASTER_SCHEDULE.splice(msPendingIndex, 1);
    afterScheduleMutation();
    document.getElementById("msFormBackdrop").classList.remove("open");
    showToast(`ลบ ${model} แล้ว`, "warn");
  });
}
