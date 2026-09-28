/* ==========================================================================
   จับเวลาวัดผลจริง (pilot-timer.js) — collect real before/after numbers for the
   Pilot KPIs: time the same task done the old way and with FORGE (stopwatch or
   typed value), see the averages, then copy them into the KPI table.
   Trials live in PILOT.trials (y2j-pilot-v1, synced). Nothing is filled into the
   KPIs automatically — a person presses "ใส่ใน KPI" after enough trials.
   ========================================================================== */

const PT_RUN_KEY = "y2j-pilot-run-v1"; // per device: the stopwatch that is running now
const PT_MIN_TRIALS = 3;
const PT_SECONDS = { "นาที": 60, "ชั่วโมง": 3600, "วัน": 86400 };
let ptKpi = 0;
let ptMethod = "old";
let ptTick = null;

function ptEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function ptTrials() { if (!Array.isArray(PILOT.trials)) PILOT.trials = []; return PILOT.trials; }
function ptRun() { try { return JSON.parse(localStorage.getItem(PT_RUN_KEY) || "null"); } catch (e) { return null; } }
function ptSetRun(r) { try { if (r) localStorage.setItem(PT_RUN_KEY, JSON.stringify(r)); else localStorage.removeItem(PT_RUN_KEY); } catch (e) { /* ignore */ } }
function ptClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:` + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
}
function ptAvg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function ptRound(v) { return v === null ? null : Math.round(v * 100) / 100; }

function ptStats() {
  return PILOT.kpis.map((k, i) => {
    const t = ptTrials().filter((x) => x.kpi === k.name);
    const old = t.filter((x) => x.method === "old").map((x) => x.value);
    const neu = t.filter((x) => x.method === "new").map((x) => x.value);
    const a = ptAvg(old), b = ptAvg(neu);
    const imp = a && b !== null ? (k.direction === "higher" ? (b - a) / a : (a - b) / a) * 100 : null;
    return { k, i, n1: old.length, n2: neu.length, a, b, imp, sim: t.some((x) => x.sim) };
  }).filter((s) => s.n1 || s.n2);
}

function ptSave(what) { savePilot(); if (typeof auditLog === "function" && what) auditLog("จับเวลาวัดผล Pilot", "pilot", what); renderPilot(); }

function ptAdd(value, how) {
  const k = PILOT.kpis[ptKpi];
  if (!k || !(value >= 0)) return;
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  const note = (document.getElementById("ptNote") || {}).value || "";
  ptTrials().push({ id: "t" + Date.now().toString(36), kpi: k.name, unit: k.unit, method: ptMethod, value: ptRound(value), how, note: note.trim(), at: new Date().toISOString(), by: u ? u.name : "" });
  ptSave(`${k.name}: ${ptMethod === "old" ? "แบบเดิม" : "ใช้ FORGE"} ${ptRound(value)} ${k.unit} (${how})`);
  showToast("บันทึกผลการวัดแล้ว", "good");
}

function renderPilotTimer() {
  let box = document.getElementById("pilotTimer");
  const anchor = document.getElementById("pilotMeasured");
  if (!box && anchor) { box = document.createElement("div"); box.className = "card"; box.id = "pilotTimer"; anchor.parentNode.insertBefore(box, anchor); }
  if (!box || typeof PILOT === "undefined") return;
  const canEdit = pilotCanEdit(currentRole());
  if (ptKpi >= PILOT.kpis.length) ptKpi = 0;
  const k = PILOT.kpis[ptKpi] || { unit: "" };
  const timeUnit = !!PT_SECONDS[k.unit];
  const run = ptRun();
  const stats = ptStats();
  const recent = ptTrials().slice(-8).reverse();
  box.innerHTML = `
    <div class="card-header"><h3>⏱ จับเวลาวัดผลจริง — ก่อน / หลังใช้ระบบ</h3>
      <p class="card-sub">ทำงานเดิมซ้ำด้วยวิธีเก่า ${PT_MIN_TRIALS} ครั้งขึ้นไป แล้วด้วย FORGE อีก ${PT_MIN_TRIALS} ครั้งขึ้นไป · ระบบเฉลี่ยให้ แล้วกด "ใส่ใน KPI" · ตัวเลขนี้คือหลักฐานที่กรรมการให้น้ำหนักมากที่สุด</p></div>
    <div class="card-body">
      ${canEdit ? `<div class="pt-form">
        <label>ตัวชี้วัด <select id="ptKpi">${PILOT.kpis.map((x, i) => `<option value="${i}"${i === ptKpi ? " selected" : ""}>${ptEsc(x.name)} (${ptEsc(x.unit)})</option>`).join("")}</select></label>
        <div class="pt-seg" role="group" aria-label="วิธีทำงาน">
          <button type="button" class="${ptMethod === "old" ? "on" : ""}" data-pm="old">แบบเดิม (ก่อนใช้ระบบ)</button>
          <button type="button" class="${ptMethod === "new" ? "on" : ""}" data-pm="new">ใช้ FORGE</button></div>
        <label>หมายเหตุ <input id="ptNote" placeholder="เช่น ใบเบิก WO-081 ช่างเชื่อม 2 คน"></label>
        ${timeUnit ? `<div class="pt-watch">
          <output id="ptClock">${run ? ptClock((Date.now() - run.from) / 1000) : "0:00"}</output>
          ${run ? `<button type="button" class="btn-primary pt-big" id="ptStop">■ หยุด &amp; บันทึก</button><button type="button" class="btn-link" id="ptCancel">ยกเลิก</button>
            <div class="muted-inline">กำลังจับ: ${ptEsc(run.kpi)} · ${run.method === "old" ? "แบบเดิม" : "ใช้ FORGE"}</div>`
          : `<button type="button" class="btn-primary pt-big" id="ptStart">▶ เริ่มจับเวลา</button>`}
        </div>` : ""}
        <div class="pt-manual">หรือใส่ค่าเอง <input type="number" id="ptVal" min="0" step="any" placeholder="${ptEsc(k.unit)}"> ${ptEsc(k.unit)} <button type="button" class="btn-secondary" id="ptAddBtn">บันทึก</button></div>
      </div>` : `<p class="muted-inline">หัวหน้าแผนก / ผู้จัดการ เป็นผู้บันทึกผลการวัด</p>`}
      ${stats.length ? `<div class="table-scroll"><table class="data-table pt-table"><thead><tr><th>ตัวชี้วัด</th><th class="num">แบบเดิม</th><th class="num">ใช้ FORGE</th><th class="num">ดีขึ้น</th><th></th></tr></thead><tbody>
        ${stats.map((s) => `<tr><td>${ptEsc(s.k.name)}${s.sim ? ' <span class="pill pill-eliminate">มีข้อมูลจำลอง</span>' : ""}</td>
          <td class="num">${s.a !== null ? `${ptRound(s.a)} ${ptEsc(s.k.unit)}` : "—"}<small> · ${s.n1} ครั้ง</small></td>
          <td class="num">${s.b !== null ? `${ptRound(s.b)} ${ptEsc(s.k.unit)}` : "—"}<small> · ${s.n2} ครั้ง</small></td>
          <td class="num ${s.imp > 0 ? "pt-good" : s.imp < 0 ? "pt-bad" : ""}">${s.imp !== null ? `${Math.round(s.imp)}%` : "—"}</td>
          <td>${canEdit ? (s.n1 >= PT_MIN_TRIALS && s.n2 >= PT_MIN_TRIALS ? `<button type="button" class="btn-link" data-ptuse="${s.i}">ใส่ใน KPI</button>` : `<span class="muted-inline">วัดให้ครบ ${PT_MIN_TRIALS} ครั้งทั้งสองแบบ</span>`) : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted-inline">ยังไม่มีผลการวัด — เริ่มจากงานที่ทำบ่อย เช่น ทำใบเบิกวัสดุ หรือหาสถานะใบสั่งผลิต</p>`}
      ${recent.length ? `<details class="pt-recent"><summary>ผลวัดล่าสุด (${ptTrials().length} ครั้ง)</summary><ul>${recent.map((t) => `<li>${ptEsc(fmtDateTime(t.at))} · ${ptEsc(t.kpi)} · <b>${t.method === "old" ? "แบบเดิม" : "FORGE"} ${ptEsc(t.value)} ${ptEsc(t.unit)}</b> · ${ptEsc(t.by)}${t.note ? ` · ${ptEsc(t.note)}` : ""}${t.sim && !/จำลอง/.test(t.note || "") ? " · ข้อมูลจำลอง" : ""}${canEdit ? ` <button type="button" class="btn-link" data-ptdel="${ptEsc(t.id)}" aria-label="ลบผลวัดนี้">ลบ</button>` : ""}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  ptWire(box);
  clearInterval(ptTick);
  if (run) ptTick = setInterval(() => { const o = document.getElementById("ptClock"); if (!o) { clearInterval(ptTick); return; } o.textContent = ptClock((Date.now() - run.from) / 1000); }, 1000);
}

function ptWire(box) {
  const sel = box.querySelector("#ptKpi");
  if (sel) sel.addEventListener("change", () => { ptKpi = +sel.value; renderPilotTimer(); });
  box.querySelectorAll("[data-pm]").forEach((b) => b.addEventListener("click", () => { ptMethod = b.dataset.pm; renderPilotTimer(); }));
  const on = (id, fn) => { const e = box.querySelector("#" + id); if (e) e.addEventListener("click", fn); };
  on("ptStart", () => { const k = PILOT.kpis[ptKpi]; ptSetRun({ from: Date.now(), kpiIdx: ptKpi, kpi: k.name, method: ptMethod }); renderPilotTimer(); });
  on("ptCancel", () => { ptSetRun(null); renderPilotTimer(); });
  on("ptStop", () => {
    const r = ptRun(); if (!r) return;
    ptSetRun(null);
    ptKpi = PILOT.kpis.findIndex((x) => x.name === r.kpi); if (ptKpi < 0) { renderPilotTimer(); return; }
    ptMethod = r.method;
    ptAdd((Date.now() - r.from) / 1000 / PT_SECONDS[PILOT.kpis[ptKpi].unit], "จับเวลา");
  });
  on("ptAddBtn", () => {
    const v = parseFloat((box.querySelector("#ptVal") || {}).value);
    if (!(v >= 0)) { showToast("ใส่ค่าที่วัดได้ก่อน", "warn"); return; }
    ptAdd(v, "ใส่ค่าเอง");
  });
  box.querySelectorAll("[data-ptdel]").forEach((b) => b.addEventListener("click", () => {
    const i = ptTrials().findIndex((t) => t.id === b.dataset.ptdel);
    if (i < 0 || !window.confirm("ลบผลวัดนี้?")) return;
    const [t] = ptTrials().splice(i, 1);
    ptSave(`ลบผลวัด ${t.kpi} ${t.value} ${t.unit}`);
  }));
  box.querySelectorAll("[data-ptuse]").forEach((b) => b.addEventListener("click", () => {
    const s = ptStats().find((x) => x.i === +b.dataset.ptuse);
    if (!s) return;
    if (!window.confirm(`ใส่ค่าเฉลี่ยใน KPI "${s.k.name}"?\nก่อน ${ptRound(s.a)} → หลัง ${ptRound(s.b)} ${s.k.unit}`)) return;
    s.k.before = ptRound(s.a); s.k.after = ptRound(s.b);
    const tag = `วัดจริง: แบบเดิม ${s.n1} ครั้ง / FORGE ${s.n2} ครั้ง (จับเวลา)`;
    s.k.method = String(s.k.method || "").replace(/ · วัดจริง:.*$/, "") + " · " + (s.sim ? "ข้อมูลจำลอง — " : "") + tag;
    ptSave(`ใส่ค่าเฉลี่ยใน KPI ${s.k.name}: ${s.k.before} → ${s.k.after} ${s.k.unit}`);
    showToast("ใส่ใน KPI แล้ว", "good");
  }));
}
