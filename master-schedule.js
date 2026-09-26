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
let msDraft = [];   // phases being edited in the modal: [{ phase, from, to, color }]
const MS_PHASE_HEX = { "ออกแบบ": "#6c5ce7", "จัดซื้อ": "#e0a100", "ประกอบ": "#2a78d6", "ทดสอบ": "#1baf7a", "ส่งมอบ": "#138a13" };
const MS_EXTRA_HEX = ["#e07b00", "#d55181", "#00a3a3", "#8d6e63", "#7a8b99", "#c0392b", "#5e8f00"];
function msColor(p) {
  if (p.color) return p.color;
  if (MS_PHASE_HEX[p.phase]) return MS_PHASE_HEX[p.phase];
  let h = 0; for (const c of String(p.phase || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MS_EXTRA_HEX[h % MS_EXTRA_HEX.length];
}
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
    const bars = (row.phases || []).map((p) => msBar(msParse(p.from), msParse(p.to) + MS_DAY, r, "", `background:${msColor(p)}`, p.phase, `${row.model} — ${p.phase}: ${msThai(msParse(p.from), true)} – ${msThai(msParse(p.to), true)}`)).join("");
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
  const used = [];
  MASTER_SCHEDULE.forEach((row) => (row.phases || []).forEach((p) => { if (!used.some((u) => u.phase === p.phase && msColor(u) === msColor(p))) used.push(p); }));
  legend.innerHTML = (used.length ? used : SCHEDULE_PHASES.map((phase) => ({ phase }))).map((p) => `<span><span class="legend-swatch" style="background:${msColor(p)}"></span>${escapeHtml(p.phase)}</span>`).join("")
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
  const names = [...new Set(SCHEDULE_PHASES.concat(...MASTER_SCHEDULE.map((r) => (r.phases || []).map((p) => p.phase))))];
  return `<datalist id="msPhaseNames">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>` + phases.map((p, i) => `<div class="ms-phase-row">
      <span class="ms-phase-name"><input type="color" class="ms-color" data-i="${i}" value="${escapeHtml(msColor(p))}" aria-label="สีขั้นตอน"><input class="ms-name" data-i="${i}" list="msPhaseNames" value="${escapeHtml(p.phase || "")}" placeholder="ชื่อขั้นตอน" aria-label="ชื่อขั้นตอน"></span>
      <label>ตั้งแต่ <input type="date" class="ms-from" data-i="${i}" value="${escapeHtml(p.from || "")}"></label>
      <label>ถึง <input type="date" class="ms-to" data-i="${i}" value="${escapeHtml(p.to || "")}"></label>
      <span class="ms-phase-tools"><button type="button" class="ord-btn" data-msph="up" data-i="${i}"${i === 0 ? " disabled" : ""} aria-label="เลื่อนขึ้น">▲</button><button type="button" class="ord-btn" data-msph="down" data-i="${i}"${i === phases.length - 1 ? " disabled" : ""} aria-label="เลื่อนลง">▼</button><button type="button" class="ord-btn" data-msph="del" data-i="${i}" aria-label="ลบขั้นตอน">✕</button></span>
    </div>`).join("") + `<button type="button" class="btn-secondary" id="msPhaseAdd">+ เพิ่มขั้นตอน</button>`;
}
// read what is typed in the modal back into the draft
function msReadForm() {
  const box = document.getElementById("msFormPhases");
  msDraft = [...box.querySelectorAll(".ms-phase-row")].map((row, i) => ({
    phase: row.querySelector(".ms-name").value.trim(), from: row.querySelector(".ms-from").value, to: row.querySelector(".ms-to").value, color: row.querySelector(".ms-color").value,
  }));
  return msDraft;
}
function msRenderForm() {
  const box = document.getElementById("msFormPhases");
  box.innerHTML = msFormPhasesHtml(msDraft);
  box.querySelectorAll("[data-msph]").forEach((b) => b.addEventListener("click", () => {
    msReadForm();
    const i = Number(b.dataset.i);
    if (b.dataset.msph === "del") msDraft.splice(i, 1);
    else { const j = b.dataset.msph === "up" ? i - 1 : i + 1; [msDraft[i], msDraft[j]] = [msDraft[j], msDraft[i]]; }
    msRenderForm();
  }));
  document.getElementById("msPhaseAdd").addEventListener("click", () => {
    msReadForm();
    const last = msDraft[msDraft.length - 1];
    const from = last && last.to ? msIso(msParse(last.to) + MS_DAY) : msIso(msMonday(Date.now()));
    msDraft.push({ phase: "", from, to: msIso(msParse(from) + 6 * MS_DAY), color: MS_EXTRA_HEX[msDraft.length % MS_EXTRA_HEX.length] });
    msRenderForm();
    const names = document.querySelectorAll("#msFormPhases .ms-name");
    if (names.length) names[names.length - 1].focus();
  });
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
  const phases = row ? JSON.parse(JSON.stringify(row.phases || [])) : msChain(msIso(msMonday(Date.now()) + 7 * MS_DAY));
  document.getElementById("msFormStart").value = phases[0].from || "";
  msDraft = phases.map((p) => Object.assign({ color: msColor(p) }, p));
  msRenderForm();
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
    if (isNaN(old)) { msDraft = msChain(e.target.value); msRenderForm(); return; }
    const shift = nu - old;
    froms.forEach((f) => { if (f.value) f.value = msIso(msParse(f.value) + shift); });
    tos.forEach((f) => { if (f.value) f.value = msIso(msParse(f.value) + shift); });
  });

  document.getElementById("msFormSaveBtn").addEventListener("click", () => {
    const model = document.getElementById("msFormModel").value.trim();
    if (!model) { document.getElementById("msFormModel").focus(); showToast("ใส่ชื่อรุ่น / ล็อต", "warn"); return; }
    const phases = [];
    for (const p of msReadForm()) {
      if (!p.phase && !p.from && !p.to) continue;
      if (!p.phase) { showToast("ตั้งชื่อขั้นตอนให้ครบ", "warn"); return; }
      if (!p.from || !p.to) { showToast(`${p.phase}: ใส่ทั้งวันเริ่มและวันจบ`, "warn"); return; }
      if (msParse(p.to) < msParse(p.from)) { showToast(`${p.phase}: วันจบต้องไม่ก่อนวันเริ่ม`, "warn"); return; }
      const rec = { phase: p.phase, from: p.from, to: p.to };
      if (p.color && p.color.toLowerCase() !== String(MS_PHASE_HEX[p.phase] || "").toLowerCase()) rec.color = p.color;
      phases.push(rec);
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
