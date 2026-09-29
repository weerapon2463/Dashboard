/* ==========================================================================
   Capacity Planning — load per workstation per week, from real data (30 ก.ย.)
     • stations = the workstations of the routing (CUT, WELD, MC, PAINT, ASSY, QC …)
     • capacity  = people × hours/day × days/week, set per station (BX_SETTINGS.workstations)
     • past weeks  = hours actually logged on job cards
     • coming weeks = hours still to do on unfinished work orders: each job's plan time minus
       what is already logged, laid out in routing order between today and the due date
       (a work order already past its due date loads the current week)
   ========================================================================== */

let capacityChartInstance = null;
const CAP_PAST = 4, CAP_NEXT = 8, CAP_DAY = 86400000;
const CAP_LOG_MAX_H = 10; // one work session counts at most 10 h (a forgotten stop button)

function statusColor(status) {
  if (status === "critical") return cssVar("--status-critical");
  if (status === "warning") return cssVar("--status-warning");
  return cssVar("--status-good");
}

function capMonday(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * CAP_DAY; }
function capStations() {
  const ws = typeof jcWorkstations === "function" ? jcWorkstations() : [];
  return ws.map((w) => {
    const people = Number(w.people) > 0 ? Number(w.people) : 1;
    const hpd = Number(w.hpd) > 0 ? Number(w.hpd) : 8;
    const days = Number(w.days) > 0 ? Number(w.days) : 6;
    return { w, id: w.id, name: w.name || w.id, people, hpd, days, cap: people * hpd * days };
  });
}

// the whole model: weeks, and per station the hours per week and who/what makes them up
function capModel() {
  const now = Date.now();
  const w0 = capMonday(now);
  const weeks = [];
  for (let i = -CAP_PAST; i < CAP_NEXT; i++) {
    const start = w0 + i * 7 * CAP_DAY;
    const d = new Date(start);
    weeks.push({ start, end: start + 7 * CAP_DAY, past: i < 0, now: i === 0, label: `${d.getDate()} ${d.toLocaleDateString("th-TH", { month: "short" })}` });
  }
  const stations = capStations();
  const byId = {};
  stations.forEach((s) => { s.load = weeks.map(() => 0); s.parts = weeks.map(() => []); byId[s.id] = s; });
  const addSpan = (st, from, to, hours, what) => {
    const s = byId[st];
    if (!s || !(hours > 0) || !(to > from)) return;
    weeks.forEach((wk, i) => {
      const ov = Math.min(to, wk.end) - Math.max(from, wk.start);
      if (ov <= 0) return;
      const h = hours * ov / (to - from);
      s.load[i] += h;
      if (h >= 0.5) s.parts[i].push({ what, h });
    });
  };
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((wo) => {
    if (wo.status === "ยกเลิก") return;
    const jobs = wo.jobs || [];
    // hours already worked (past weeks)
    jobs.forEach((j) => (j.logs || []).forEach((l) => {
      const a = Date.parse(l.from); let b = l.to ? Date.parse(l.to) : now;
      if (!(b > a)) return;
      b = Math.min(b, a + CAP_LOG_MAX_H * 3600000);
      const h = (b - a) / 3600000;
      addSpan(j.station, a, b, h, `${wo.wo} ${j.station} (ทำแล้ว)`);
    }));
    if (wo.status === "เสร็จสมบูรณ์") return;
    // hours still to do, laid out in routing order from now to the due date
    const logged = (j) => (j.logs || []).reduce((m, l) => { const a = Date.parse(l.from); const b = l.to ? Date.parse(l.to) : now; return m + Math.max(0, Math.min(b - a, CAP_LOG_MAX_H * 3600000)) / 60000; }, 0);
    const rest = jobs.filter((j) => j.status !== "done").map((j) => ({ j, mins: Math.max(Number(j.planMins) || 0 ? (Number(j.planMins) - logged(j)) : 0, (Number(j.planMins) || 0) * 0.15) }));
    const total = rest.reduce((m, x) => m + x.mins, 0);
    if (!total) return;
    const due = wo.dueIso ? Date.parse(wo.dueIso + "T17:00:00") : NaN;
    const from = Math.max(now, w0);
    const to = !isNaN(due) && due > from + CAP_DAY ? due : w0 + 7 * CAP_DAY; // overdue: all of it this week
    let t = from;
    rest.forEach((x) => {
      const span = (to - from) * x.mins / total;
      addSpan(x.j.station, t, t + span, x.mins / 60, `${wo.wo} ${wo.model} · ${x.j.op}${!isNaN(due) && due < now ? " (เลยกำหนดส่ง)" : ""}`);
      t += span;
    });
  });
  stations.forEach((s) => {
    s.load = s.load.map((h) => Math.round(h * 10) / 10);
    s.pct = s.load.map((h) => (s.cap ? Math.round((h / s.cap) * 100) : 0));
    const fut = s.pct.slice(CAP_PAST, CAP_PAST + 4);
    s.next4 = fut.length ? Math.round(fut.reduce((a, b) => a + b, 0) / fut.length) : 0;
    s.peak = Math.max(...s.pct.slice(CAP_PAST));
    s.peakWeek = s.pct.indexOf(s.peak, CAP_PAST);
    s.needPeople = Math.ceil((s.load.slice(CAP_PAST, CAP_PAST + 4).reduce((a, b) => a + b, 0) / 4) / (s.hpd * s.days) * 10) / 10;
  });
  return { weeks, stations };
}

function capLabel(p) { return p > 100 ? "เกินกำลัง" : p >= 90 ? "เกือบเต็ม" : "ปกติ"; }
function capPill(p) { return p > 100 ? "pill-critical" : p >= 90 ? "pill-warning" : "pill-good"; }

function populateCapacityFilter() {
  const select = document.getElementById("capacityLineFilter");
  if (!select) return;
  const m = capModel();
  const prev = select.value;
  select.innerHTML = m.stations.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.id)} — ${escapeHtml(s.name)}</option>`).join("");
  if (m.stations.some((s) => s.id === prev)) select.value = prev;
  else if (m.stations.length) select.value = m.stations.slice().sort((a, b) => b.peak - a.peak)[0].id; // start on the busiest station
  if (!select.dataset.wired) { select.dataset.wired = "1"; select.addEventListener("change", () => renderCapacityChart(select.value)); }
}

function renderCapacityChart(selected) {
  const canvas = document.getElementById("capacityChart");
  if (!canvas || typeof Chart === "undefined") return;
  const m = capModel();
  const sel = document.getElementById("capacityLineFilter");
  if (sel && !sel.options.length) populateCapacityFilter();
  const s = m.stations.find((x) => x.id === (selected || (sel && sel.value))) || m.stations[0];
  if (!s) return;
  const colors = s.pct.map((p, i) => m.weeks[i].past ? cssVar("--text-muted") : statusColor(capacityStatus(p)));
  if (capacityChartInstance) capacityChartInstance.destroy();
  capacityChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: m.weeks.map((w) => `${w.now ? "สัปดาห์นี้ " : ""}${w.label}${w.past ? " (จริง)" : ""}`),
      datasets: [
        { label: "ชั่วโมงงาน", data: s.load, backgroundColor: colors, borderRadius: 4 },
        { type: "line", label: `กำลังการผลิต ${s.cap} ชม./สัปดาห์`, data: m.weeks.map(() => s.cap), borderColor: cssVar("--status-critical"), borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grace: "10%", title: { display: true, text: "ชั่วโมง / สัปดาห์", color: cssVar("--text-muted") }, ticks: { color: cssVar("--text-muted") }, grid: { color: cssVar("--gridline") } },
        x: { ticks: { color: cssVar("--text-secondary"), maxRotation: 0, autoSkip: false, font: { size: 10 } }, grid: { display: false } },
      },
      plugins: {
        legend: { labels: { color: cssVar("--text-secondary") } },
        tooltip: { callbacks: {
          label: (ctx) => ctx.datasetIndex ? ctx.dataset.label : `${ctx.raw} ชม. = ${s.pct[ctx.dataIndex]}% ของกำลัง${m.weeks[ctx.dataIndex].past ? " (ทำจริง)" : " (งานที่ยังต้องทำ)"}`,
          afterLabel: (ctx) => ctx.datasetIndex ? "" : s.parts[ctx.dataIndex].sort((a, b) => b.h - a.h).slice(0, 5).map((p) => `• ${p.what}: ${Math.round(p.h * 10) / 10} ชม.`).join("\n"),
        } },
      },
    },
  });
  capRenderHeat(m);
}

// every station × week at a glance, plus the station settings (people, hours, days)
function capRenderHeat(m) {
  const card = document.getElementById("capacityTable");
  if (!card) return;
  let box = document.getElementById("capHeat");
  if (!box) { box = document.createElement("div"); box.id = "capHeat"; box.className = "table-scroll"; card.parentElement.insertBefore(box, card); }
  box.innerHTML = `<table class="data-table cap-heat"><thead><tr><th>สถานี</th>${m.weeks.map((w) => `<th class="num${w.now ? " cap-now" : ""}">${escapeHtml(w.label)}${w.past ? "<br><small>จริง</small>" : ""}</th>`).join("")}</tr></thead><tbody>
    ${m.stations.map((s) => `<tr><td><b>${escapeHtml(s.id)}</b> <small class="muted-inline">${escapeHtml(s.name)}</small></td>${s.pct.map((p, i) => {
      const past = m.weeks[i].past;
      const cls = past ? "cap-past" : p > 100 ? "cap-over" : p >= 90 ? "cap-warn" : p > 0 ? "cap-ok" : "";
      const tip = `${s.id} สัปดาห์ ${m.weeks[i].label}: ${s.load[i]} ชม. / ${s.cap} ชม.${s.parts[i].length ? " — " + s.parts[i].sort((a, b) => b.h - a.h).slice(0, 4).map((x) => `${x.what} ${Math.round(x.h * 10) / 10} ชม.`).join(", ") : ""}`;
      return `<td class="num ${cls}" title="${escapeHtml(tip)}">${p ? `${p}%` : "·"}</td>`;
    }).join("")}</tr>`).join("")}
  </tbody></table>
  <p class="muted-inline">สีเทา = สัปดาห์ที่ผ่านมา (ชั่วโมงที่ทำจริงจาก Job Card) · เขียว &lt; 90% · เหลือง 90–100% · แดง &gt; 100% · ชี้ที่ช่องเพื่อดูว่างานไหนใช้กำลัง</p>`;
}

function renderCapacityTable() {
  const tbody = document.querySelector("#capacityTable tbody");
  if (!tbody) return;
  const m = capModel();
  const canEdit = ["plant", "admin", "depthead"].includes(currentRole());
  const head = document.querySelector("#capacityTable thead tr");
  if (head) head.innerHTML = "<th>สถานี</th><th>กำลังการผลิต (คน × ชม./วัน × วัน/สัปดาห์)</th><th>ชม./สัปดาห์</th><th>ภาระ 4 สัปดาห์ข้างหน้า</th><th>สูงสุด</th><th>ต้องการคน</th><th>สถานะ</th>";
  tbody.innerHTML = m.stations.map((s, i) => {
    const inp = (f, v) => canEdit ? `<input type="number" min="1" step="1" class="bom-inline cap-in" data-i="${i}" data-f="${f}" value="${v}" style="width:56px">` : v;
    return `<tr><td><b>${escapeHtml(s.id)}</b> ${escapeHtml(s.name)}</td>
      <td>${inp("people", s.people)} คน × ${inp("hpd", s.hpd)} ชม. × ${inp("days", s.days)} วัน</td>
      <td class="num">${s.cap}</td>
      <td class="num">${s.next4}%</td>
      <td class="num">${s.peak}%${s.peakWeek >= 0 ? ` <small class="muted-inline">(${escapeHtml(m.weeks[s.peakWeek].label)})</small>` : ""}</td>
      <td class="num">${s.needPeople} <small class="muted-inline">มี ${s.people}</small></td>
      <td><span class="pill ${capPill(Math.max(s.next4, s.pct[CAP_PAST]))}">${capLabel(Math.max(s.next4, s.pct[CAP_PAST]))}</span></td></tr>`;
  }).join("") || `<tr><td colspan="7" class="muted-inline">ยังไม่มีสถานีงาน — ตั้งได้ที่ใบสั่งผลิต › Job Card › สถานีงาน</td></tr>`;
  tbody.querySelectorAll(".cap-in").forEach((el) => el.addEventListener("change", () => {
    const s = m.stations[+el.dataset.i];
    const v = Math.max(1, Math.round(Number(el.value) || 1));
    const was = s.w[el.dataset.f];
    s.w[el.dataset.f] = v;
    if (typeof bxSaveStock === "function") bxSaveStock();
    if (typeof auditLog === "function") auditLog("ตั้งกำลังการผลิต", s.id, `${el.dataset.f}: ${was ?? "-"} → ${v}`);
    renderCapacityTable(); renderCapacityChart(s.id);
    if (typeof renderResource === "function") renderResource();
  }));
  const all = m.stations.length ? Math.round(m.stations.reduce((a, s) => a + s.next4, 0) / m.stations.length) : 0;
  const el = document.getElementById("statUtil");
  if (el) el.textContent = all + "%";
}
