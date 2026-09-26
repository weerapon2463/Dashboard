/* ==========================================================================
   Master Schedule — real-calendar Gantt (ERPNext Production Plan style).
   Two kinds of rows:
     · planned lots (MASTER_SCHEDULE, editable): phases with real from/to dates
     · live work orders: one row per machine, built from its job cards —
       actual time per step, what is running / stopped, and the due date
   Old rows that used week numbers (start/dur) are converted to dates once.
   ========================================================================== */

const MS_STORAGE_KEY = "y2j-master-schedule-v1";
const MS_VIEW_KEY = "y2j-ms-view-v1"; // per device: range start + span + toggles
const MS_DEFAULT_WEEKS = [1, 2, 4, 2, 1];
const MS_STATION_COLOR = { CUT: "#8d99ae", WELD: "#e07b00", MC: "#6c5ce7", PAINT: "#1baf7a", ASSY: "#2a78d6", QC: "#e34948" };
const MS_DAY = 86400000;

let msPendingIndex = null;
let msView = (() => { try { return JSON.parse(localStorage.getItem(MS_VIEW_KEY) || "null") || {}; } catch (e) { return {}; } })();

function scheduleCanEdit(role) { return role === "depthead" || role === "plant" || role === "admin"; }
function msIso(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }
function msParse(s) { return s ? new Date(String(s).slice(0, 10) + "T00:00:00").getTime() : NaN; }
function msMonday(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * MS_DAY; }
function msThai(t, withYear) { return new Date(t).toLocaleDateString("th-TH", withYear ? { day: "numeric", month: "short", year: "2-digit" } : { day: "numeric", month: "short" }); }
function msSaveView() { try { localStorage.setItem(MS_VIEW_KEY, JSON.stringify(msView)); } catch (e) { /* per device */ } }

/* ---- persistence + migration ------------------------------------------------ */

function loadStoredSchedule() {
  try {
    const raw = localStorage.getItem(MS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) { return null; }
}
function saveSchedule() {
  try { localStorage.setItem(MS_STORAGE_KEY, JSON.stringify(MASTER_SCHEDULE)); markMSSaved(); } catch (e) { markMSSaveFailed(); }
}
function markMSSaved() {
  const el = document.getElementById("msSaveStatus");
  if (!el) return;
  const now = new Date();
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกแล้ว (ล่าสุด ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")})`;
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
  if (hasStored) el.innerHTML = `<span class="dot"></span>แผนตามวันที่จริง — เพิ่ม/แก้ไข/ลบ บันทึกอัตโนมัติ`;
  else { el.classList.add("stale"); el.innerHTML = `<span class="dot"></span>กำลังแสดงแผนตัวอย่าง — แก้วันที่แล้วระบบบันทึกให้ทันที`; }
}

// week-number rows (old format) → real dates; week 0 = Monday five weeks before this week
function msMigrate(rows) {
  const anchor = msMonday(Date.now()) - 5 * 7 * MS_DAY;
  let changed = false;
  rows.forEach((row, i) => {
    if (!row.id) { row.id = `ms-${Date.now().toString(36)}-${i}`; changed = true; }
    (row.phases || []).forEach((p) => {
      if (p.from) return;
      const from = anchor + (Number(p.start) || 0) * 7 * MS_DAY;
      p.from = msIso(from);
      p.to = msIso(from + Math.max(1, Number(p.dur) || 1) * 7 * MS_DAY - MS_DAY);
      delete p.start; delete p.dur;
      changed = true;
    });
  });
  return changed;
}

function initScheduleData() {
  const stored = loadStoredSchedule();
  if (Array.isArray(stored)) {
    MASTER_SCHEDULE.length = 0;
    stored.forEach((row) => MASTER_SCHEDULE.push(row));
  }
  if (msMigrate(MASTER_SCHEDULE) && Array.isArray(stored)) saveSchedule();
  return Array.isArray(stored);
}
function afterScheduleMutation() { saveSchedule(); renderMasterSchedule(); }

/* ---- range ------------------------------------------------------------------- */

function msRange() {
  const weeks = Number(msView.weeks) || 12;
  const start = msView.start ? msMonday(msParse(msView.start)) : msMonday(Date.now()) - 3 * 7 * MS_DAY;
  return { start, end: start + weeks * 7 * MS_DAY, weeks };
}
function msPct(t, r) { return Math.max(0, Math.min(100, ((t - r.start) / (r.end - r.start)) * 100)); }
function msBar(from, to, r, cls, style, text, title) {
  if (isNaN(from) || isNaN(to) || to < r.start || from >= r.end) return "";
  const l = msPct(from, r), w = Math.max(0.6, msPct(to, r) - l);
  return `<div class="gantt-bar ${cls || ""}" style="left:${l}%;width:${w}%;${style || ""}" title="${escapeHtml(title || text || "")}">${w > 4 ? escapeHtml(text || "") : ""}</div>`;
}

/* ---- live work-order rows ---------------------------------------------------- */

function msWoRows() {
  if (typeof WORK_ORDERS === "undefined") return [];
  return WORK_ORDERS.filter((w) => w.status !== "ยกเลิก").map((w) => {
    const due = w.dueIso ? msParse(w.dueIso) : (typeof ovDue === "function" ? msParse(ovDue(w.dueDate)) : NaN);
    const created = w.createdAt ? msParse(w.createdAt) : NaN;
    const steps = (w.jobs || []).map((j) => {
      const logs = j.logs || [];
      if (!logs.length) return { j, planned: true };
      const from = Math.min(...logs.map((l) => Date.parse(l.from)));
      const to = j.status === "done" ? Math.max(...logs.map((l) => Date.parse(l.to || l.from))) : Date.now();
      return { j, from, to };
    });
    const late = w.status !== "เสร็จสมบูรณ์" && !isNaN(due) && due < msMonday(Date.now()) + ((new Date().getDay() + 6) % 7) * MS_DAY;
    return { w, due, created, steps, late };
  });
}

/* ---- rendering ----------------------------------------------------------------- */

function renderMasterSchedule() {
  const container = document.getElementById("ganttChart");
  if (!container) return;
  const role = currentRole();
  const canEdit = scheduleCanEdit(role);
  const addBtn = document.getElementById("msAddBtn");
  if (addBtn) addBtn.hidden = !canEdit;
  const r = msRange();
  const today = Date.now();
  const showWo = msView.wo !== false;

  // controls
  const ctl = document.getElementById("msControls");
  if (ctl) {
    ctl.innerHTML = `
      <label>เริ่ม <input type="date" id="msStart" value="${msIso(r.start)}"></label>
      <label>ช่วง <select id="msWeeks">${[[8, "8 สัปดาห์"], [12, "3 เดือน"], [26, "6 เดือน"], [52, "1 ปี"]].map(([v, l]) => `<option value="${v}"${v === r.weeks ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button type="button" class="btn-secondary" id="msPrev" aria-label="ย้อนหลัง">◀</button>
      <button type="button" class="btn-secondary" id="msToday">วันนี้</button>
      <button type="button" class="btn-secondary" id="msNext" aria-label="ถัดไป">▶</button>
      <label>เรียงแผน <select id="msSort"><option value="manual"${(msView.sort || "manual") === "manual" ? " selected" : ""}>เรียงเอง (▲▼)</option><option value="start"${msView.sort === "start" ? " selected" : ""}>ตามวันเริ่ม</option><option value="end"${msView.sort === "end" ? " selected" : ""}>ตามวันส่งมอบ</option></select></label>
      <label class="vis-opt"><input type="checkbox" id="msShowWo"${showWo ? " checked" : ""}> แสดงใบสั่งผลิตจริง (จาก Job Card)</label>
      ${showWo ? `<label>เรียงคัน <select id="msWoSort"><option value="due"${(msView.woSort || "due") === "due" ? " selected" : ""}>ตามกำหนดส่ง</option><option value="start"${msView.woSort === "start" ? " selected" : ""}>ตามวันเริ่มผลิต</option><option value="wo"${msView.woSort === "wo" ? " selected" : ""}>ตามเลขใบสั่งผลิต</option></select></label>` : ""}`;
    const setStart = (t) => { msView.start = msIso(t); msSaveView(); renderMasterSchedule(); };
    document.getElementById("msStart").addEventListener("change", (e) => setStart(msParse(e.target.value)));
    document.getElementById("msWeeks").addEventListener("change", (e) => { msView.weeks = Number(e.target.value); msSaveView(); renderMasterSchedule(); });
    document.getElementById("msPrev").addEventListener("click", () => setStart(r.start - Math.max(1, Math.round(r.weeks / 3)) * 7 * MS_DAY));
    document.getElementById("msNext").addEventListener("click", () => setStart(r.start + Math.max(1, Math.round(r.weeks / 3)) * 7 * MS_DAY));
    document.getElementById("msToday").addEventListener("click", () => setStart(msMonday(today) - Math.round(r.weeks / 4) * 7 * MS_DAY));
    document.getElementById("msShowWo").addEventListener("change", (e) => { msView.wo = e.target.checked; msSaveView(); renderMasterSchedule(); });
    document.getElementById("msSort").addEventListener("change", (e) => { msView.sort = e.target.value; msSaveView(); renderMasterSchedule(); });
    const ws = document.getElementById("msWoSort");
    if (ws) ws.addEventListener("change", (e) => { msView.woSort = e.target.value; msSaveView(); renderMasterSchedule(); });
  }

  // header: months + weeks (Monday dates)
  const weeks = [];
  for (let t = r.start; t < r.end; t += 7 * MS_DAY) weeks.push(t);
  const months = [];
  weeks.forEach((t) => { const k = new Date(t).toLocaleDateString("th-TH", { month: "long", year: "numeric" }); const m = months[months.length - 1]; if (m && m.k === k) m.n++; else months.push({ k, n: 1 }); });
  const todayLine = today >= r.start && today < r.end ? `<div class="ms-today" style="left:${msPct(today, r)}%"></div>` : "";
  const weekTicks = `<div class="gantt-header-weeks" style="grid-template-columns:repeat(${weeks.length},1fr)">${weeks.map((t) => `<div class="gantt-week-tick${today >= t && today < t + 7 * MS_DAY ? " ms-this-week" : ""}">${new Date(t).getDate()}</div>`).join("")}</div>`;
  const monthRow = `<div class="ms-months" style="grid-template-columns:${months.map((m) => `${m.n}fr`).join(" ")}">${months.map((m) => `<div>${escapeHtml(m.k)}</div>`).join("")}</div>`;

  let html = `<div class="gantt-header"><div class="ms-corner">แผน / ใบสั่งผลิต</div><div>${monthRow}${weekTicks}</div></div>`;

  // planned lots
  html += `<div class="ms-section">แผนการผลิต (กำหนดเอง)</div>`;
  const first = (row) => Math.min(...(row.phases || []).map((p) => msParse(p.from)));
  const last = (row) => Math.max(...(row.phases || []).map((p) => msParse(p.to)));
  const sortMode = msView.sort || "manual";
  const planned = MASTER_SCHEDULE.map((row, index) => ({ row, index }));
  if (sortMode === "start") planned.sort((a, b) => first(a.row) - first(b.row));
  if (sortMode === "end") planned.sort((a, b) => last(a.row) - last(b.row));
  html += planned.map(({ row, index }, pos) => {
    const bars = (row.phases || []).map((p) => msBar(msParse(p.from), msParse(p.to) + MS_DAY, r, "", `background:${PHASE_COLORS[p.phase] || "#888"}`, p.phase, `${row.model} — ${p.phase}: ${msThai(msParse(p.from), true)} – ${msThai(msParse(p.to), true)}`)).join("");
    const first = Math.min(...(row.phases || []).map((p) => msParse(p.from)));
    const last = Math.max(...(row.phases || []).map((p) => msParse(p.to)));
    const cur = (row.phases || []).find((p) => today >= msParse(p.from) && today < msParse(p.to) + MS_DAY);
    return `<div class="gantt-row">
      <div class="gantt-row-label"><span><b>${escapeHtml(row.model)}</b><small>${isFinite(first) ? `${msThai(first)} – ${msThai(last, true)}` : ""}${cur ? ` · ตอนนี้: ${escapeHtml(cur.phase)}` : ""}</small></span>
        ${canEdit && sortMode === "manual" ? `<span class="ms-ord"><button type="button" class="ord-btn" data-msmove="${index}" data-dir="-1"${pos === 0 ? " disabled" : ""} aria-label="เลื่อนขึ้น">▲</button><button type="button" class="ord-btn" data-msmove="${index}" data-dir="1"${pos === planned.length - 1 ? " disabled" : ""} aria-label="เลื่อนลง">▼</button></span>` : ""}
        ${canEdit ? `<button type="button" class="ms-row-edit ms-edit-ic" data-msedit="${index}" title="แก้ไขวันที่" aria-label="แก้ไข ${escapeHtml(row.model)}">✎</button>` : ""}</div>
      <div class="gantt-track">${bars}${todayLine}</div></div>`;
  }).join("") || `<div class="gantt-row"><div class="gantt-row-label muted-inline">ยังไม่มีแผน</div><div class="gantt-track">${todayLine}</div></div>`;

  // live work orders
  if (showWo) {
    const rows = msWoRows();
    const ws = msView.woSort || "due";
    const startOf = (x) => { const a = x.steps.filter((s) => s.from).map((s) => s.from); return a.length ? Math.min(...a) : (isNaN(x.created) ? 9e15 : x.created); };
    rows.sort((a, b) => ws === "wo" ? a.w.wo.localeCompare(b.w.wo) : ws === "start" ? startOf(a) - startOf(b) : (isNaN(a.due) ? 9e15 : a.due) - (isNaN(b.due) ? 9e15 : b.due));
    html += `<div class="ms-section">ใบสั่งผลิตจริง — 1 แถว = 1 คัน (แท่งเข้ม = เวลาทำจริงจาก Job Card · ◆ = กำหนดส่ง)</div>`;
    html += rows.map(({ w, due, created, steps, late }) => {
      const done = (w.jobs || []).filter((j) => j.status === "done").length;
      let bars = "";
      const firstAct = steps.filter((s) => s.from).map((s) => s.from);
      const spanFrom = !isNaN(created) ? created : firstAct.length ? Math.min(...firstAct) : NaN;
      if (!isNaN(spanFrom) && !isNaN(due)) bars += msBar(spanFrom, due + MS_DAY, r, "ms-span", "", "", `${w.wo}: สั่งผลิต ${msThai(spanFrom, true)} → กำหนดส่ง ${msThai(due, true)}`);
      steps.filter((s) => s.from).forEach(({ j, from, to }) => {
        bars += msBar(from, Math.max(to, from + MS_DAY / 3), r, `ms-step ms-${j.status}`, `background:${MS_STATION_COLOR[j.station] || "#888"}`, j.station, `${w.wo} ${j.op} (${j.station}) · ${j.status === "done" ? "เสร็จ" : j.status === "hold" ? "หยุดอยู่" : "กำลังทำ"} · ${msThai(from, true)} – ${j.status === "done" ? msThai(to, true) : "ปัจจุบัน"}`);
      });
      const dueMark = !isNaN(due) && due >= r.start && due < r.end ? `<div class="ms-due${late ? " ms-due-late" : ""}" style="left:${msPct(due + MS_DAY / 2, r)}%" title="กำหนดส่ง ${msThai(due, true)}">◆</div>` : "";
      return `<div class="gantt-row ms-wo${late ? " ms-late" : ""}${w.status === "เสร็จสมบูรณ์" ? " ms-finished" : ""}">
        <div class="gantt-row-label"><button type="button" class="ms-wo-link" data-mswo="${escapeHtml(w.wo)}"><b>${escapeHtml(w.serial || w.wo)}</b><small>${escapeHtml(w.wo)} · ${done}/${(w.jobs || []).length || "–"} ขั้น · ${late ? "ล่าช้า" : escapeHtml(w.status)}</small></button></div>
        <div class="gantt-track">${bars}${dueMark}${todayLine}</div></div>`;
    }).join("") || `<div class="gantt-row"><div class="gantt-row-label muted-inline">ยังไม่มีใบสั่งผลิต</div><div class="gantt-track">${todayLine}</div></div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll("[data-msedit]").forEach((b) => b.addEventListener("click", () => openScheduleModal(Number(b.dataset.msedit))));
  container.querySelectorAll("[data-msmove]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.msmove), j = i + Number(b.dataset.dir);
    if (j < 0 || j >= MASTER_SCHEDULE.length) return;
    [MASTER_SCHEDULE[i], MASTER_SCHEDULE[j]] = [MASTER_SCHEDULE[j], MASTER_SCHEDULE[i]];
    afterScheduleMutation();
  }));
  container.querySelectorAll("[data-mswo]").forEach((b) => b.addEventListener("click", () => { if (typeof snOpenHistory === "function") snOpenHistory(b.dataset.mswo); }));

  renderGanttLegend();
  updateScheduleStat();
}

function renderGanttLegend() {
  const legend = document.getElementById("ganttLegend");
  if (!legend) return;
  legend.innerHTML = SCHEDULE_PHASES.map((p) => `<span><span class="legend-swatch" style="background:${PHASE_COLORS[p]}"></span>${escapeHtml(p)}</span>`).join("")
    + ` · ขั้นตอนจริง: ${Object.keys(MS_STATION_COLOR).map((k) => `<span><span class="legend-swatch" style="background:${MS_STATION_COLOR[k]}"></span>${k}</span>`).join("")}`
    + `<span>— เส้นแดง = วันนี้ (${msThai(Date.now(), true)})</span>`;
}

function updateScheduleStat() {
  const now = Date.now();
  const activeCount = MASTER_SCHEDULE.filter((row) => (row.phases || []).some((p) => now >= msParse(p.from) && now < msParse(p.to) + MS_DAY)).length;
  const el = document.getElementById("statActiveProjects");
  if (el) el.textContent = activeCount;
}

/* ---- add / edit / delete: real dates per phase ------------------------------------- */

function msFormPhasesHtml(phases) {
  return phases.map((p, i) => `<div class="ms-phase-row">
      <span class="ms-phase-name"><span class="legend-swatch" style="background:${PHASE_COLORS[p.phase]}"></span>${escapeHtml(p.phase)}</span>
      <label>ตั้งแต่ <input type="date" class="ms-from" data-i="${i}" value="${escapeHtml(p.from || "")}"></label>
      <label>ถึง <input type="date" class="ms-to" data-i="${i}" value="${escapeHtml(p.to || "")}"></label>
    </div>`).join("");
}

function msChain(startIso) {
  let t = msParse(startIso);
  return SCHEDULE_PHASES.map((phase, i) => {
    const from = t, to = t + MS_DEFAULT_WEEKS[i] * 7 * MS_DAY - MS_DAY;
    t = to + MS_DAY;
    return { phase, from: msIso(from), to: msIso(to) };
  });
}

function openScheduleModal(index) {
  msPendingIndex = index;
  const isEdit = index !== null && index !== undefined;
  const row = isEdit ? MASTER_SCHEDULE[index] : null;
  document.getElementById("msFormTitle").textContent = isEdit ? `แก้ไขแผน — ${row.model}` : "เพิ่มแผนการผลิตใหม่";
  document.getElementById("msFormModel").value = row ? row.model : "";
  const phases = row ? SCHEDULE_PHASES.map((ph) => (row.phases || []).find((p) => p.phase === ph) || { phase: ph, from: "", to: "" }) : msChain(msIso(msMonday(Date.now()) + 7 * MS_DAY));
  document.getElementById("msFormStart").value = phases[0].from || "";
  document.getElementById("msFormPhases").innerHTML = msFormPhasesHtml(phases);
  document.getElementById("msDeleteBtn").hidden = !isEdit;
  document.getElementById("msFormBackdrop").classList.add("open");
}

function initScheduleInteractions() {
  const addBtn = document.getElementById("msAddBtn");
  if (addBtn) addBtn.addEventListener("click", () => openScheduleModal(null));
  document.getElementById("msFormCancelBtn").addEventListener("click", () => document.getElementById("msFormBackdrop").classList.remove("open"));
  document.getElementById("msFormBackdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open"); });
  // moving the start date shifts every phase by the same number of days
  document.getElementById("msFormStart").addEventListener("change", (e) => {
    const box = document.getElementById("msFormPhases");
    const froms = [...box.querySelectorAll(".ms-from")];
    const tos = [...box.querySelectorAll(".ms-to")];
    const old = msParse(froms[0].value);
    const nu = msParse(e.target.value);
    if (isNaN(nu)) return;
    if (isNaN(old)) { box.innerHTML = msFormPhasesHtml(msChain(e.target.value)); return; }
    const shift = nu - old;
    froms.forEach((f) => { if (f.value) f.value = msIso(msParse(f.value) + shift); });
    tos.forEach((f) => { if (f.value) f.value = msIso(msParse(f.value) + shift); });
  });

  document.getElementById("msFormSaveBtn").addEventListener("click", () => {
    const model = document.getElementById("msFormModel").value.trim();
    if (!model) { document.getElementById("msFormModel").focus(); showToast("ใส่ชื่อรุ่น / ล็อต", "warn"); return; }
    const box = document.getElementById("msFormPhases");
    const phases = [];
    for (let i = 0; i < SCHEDULE_PHASES.length; i++) {
      const from = box.querySelector(`.ms-from[data-i="${i}"]`).value;
      const to = box.querySelector(`.ms-to[data-i="${i}"]`).value;
      if (!from && !to) continue;
      if (!from || !to) { showToast(`${SCHEDULE_PHASES[i]}: ใส่ทั้งวันเริ่มและวันจบ`, "warn"); return; }
      if (msParse(to) < msParse(from)) { showToast(`${SCHEDULE_PHASES[i]}: วันจบต้องไม่ก่อนวันเริ่ม`, "warn"); return; }
      phases.push({ phase: SCHEDULE_PHASES[i], from, to });
    }
    if (!phases.length) { showToast("ใส่วันที่อย่างน้อย 1 ขั้นตอน", "warn"); return; }
    const isEdit = msPendingIndex !== null && msPendingIndex !== undefined;
    const id = isEdit ? MASTER_SCHEDULE[msPendingIndex].id : `ms-${Date.now().toString(36)}`;
    const rec = { id, model, phases };
    if (isEdit) MASTER_SCHEDULE[msPendingIndex] = rec; else MASTER_SCHEDULE.push(rec);
    if (typeof auditLog === "function") auditLog(isEdit ? "แก้ไขแผนการผลิต" : "เพิ่มแผนการผลิต", model, phases.map((p) => `${p.phase} ${p.from}→${p.to}`).join(", "));
    afterScheduleMutation();
    document.getElementById("msFormBackdrop").classList.remove("open");
    showToast(`บันทึกแผนของ ${model} แล้ว`, "good");
  });

  document.getElementById("msDeleteBtn").addEventListener("click", () => {
    if (msPendingIndex === null || msPendingIndex === undefined) return;
    const model = MASTER_SCHEDULE[msPendingIndex].model;
    if (!confirm(`ลบแผน "${model}" ออกจาก Master Schedule?`)) return;
    MASTER_SCHEDULE.splice(msPendingIndex, 1);
    if (typeof auditLog === "function") auditLog("ลบแผนการผลิต", model, "");
    afterScheduleMutation();
    document.getElementById("msFormBackdrop").classList.remove("open");
    showToast(`ลบ ${model} แล้ว`, "warn");
  });
}
