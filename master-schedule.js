/* ==========================================================================
   Master Schedule module — simple CSS-grid Gantt chart
   ========================================================================== */

const SCHEDULE_NOW_WEEK = 5; // demo "current week" marker

function renderMasterSchedule() {
  const container = document.getElementById("ganttChart");
  if (!container) return;
  container.innerHTML = "";

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

  MASTER_SCHEDULE.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "gantt-row";

    const label = document.createElement("div");
    label.className = "gantt-row-label";
    label.textContent = row.model;
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
