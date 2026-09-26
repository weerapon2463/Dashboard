/* ==========================================================================
   Routing + Job Cards + Workstations + Downtime + WO cost sheet — modelled on
   ERPNext (Routing → Operation / Workstation (hour rate) → Job Card with time
   logs, Downtime Entry stop reasons, Work Order operating + material cost).
   Routing per model lives in BOM_META[model].routing, workstations in
   BX_SETTINGS.workstations, job cards on each work order (wo.jobs).
   ========================================================================== */

const JC_DEFAULT_ROUTING = [
  { op: "ตัด / พับเหล็ก", station: "CUT", mins: "" },
  { op: "เชื่อมประกอบโครง", station: "WELD", mins: "" },
  { op: "กลึง / แมชชีน", station: "MC", mins: "" },
  { op: "พ่นสี", station: "PAINT", mins: "" },
  { op: "ประกอบ", station: "ASSY", mins: "" },
  { op: "ทดสอบ / QC ก่อนส่งมอบ", station: "QC", mins: "" },
];
const JC_WS_NAMES = { CUT: "ตัด / พับ", WELD: "เชื่อม", MC: "กลึง / แมชชีน", PAINT: "พ่นสี", ASSY: "ประกอบ", QC: "ทดสอบ / QC" };
// ERPNext Job Card statuses: Open / Work In Progress / On Hold / Completed
const JC_STATUS = { open: ["รอเริ่ม", "neutral"], wip: ["กำลังทำ", "warning"], hold: ["หยุดชั่วคราว", "critical"], done: ["เสร็จ", "good"] };
// ERPNext Downtime Entry stop reasons + the ones that matter on this shop floor
const JC_STOP_REASONS = ["รอวัสดุ / ชิ้นส่วนไม่ครบ", "รอแบบ / ข้อมูลจาก R&D", "เครื่องจักรเสีย", "ตั้งเครื่องนาน (Set up)", "รอ QC ตรวจ", "งานแก้ไข (Rework)", "ไฟฟ้าดับ", "พักเบรก / เปลี่ยนกะ", "อื่น ๆ"];

let jcWo = "";
let jcMine = false;
let jcRDraft = null;
let jcRDraftModel = "";

function jcRole() { return typeof currentRole === "function" ? currentRole() : "plant"; }
function jcCanPlan() { return typeof woCanAdd === "function" ? woCanAdd(jcRole()) : true; }
function jcCanRun() { return typeof woCanClaimOrUpdate === "function" ? woCanClaimOrUpdate(jcRole()) : true; }
function jcMe() { return (typeof authCurrentUser === "function" && authCurrentUser() && authCurrentUser().name) || (typeof getMyName === "function" && getMyName()) || "ผู้ใช้"; }
function jcEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function jcNum(v) { return Number(v) || 0; }
function jcBaht(n) { return `${Math.round(jcNum(n)).toLocaleString("th-TH")} ฿`; }

function jcRouting(model) {
  const m = typeof BOM_META !== "undefined" ? BOM_META[model] : null;
  return m && Array.isArray(m.routing) && m.routing.length ? m.routing : null;
}

/* ---- workstations (hour rate) ---------------------------------------------------- */

function jcWorkstations() {
  if (typeof BX_SETTINGS === "undefined") return [];
  if (!Array.isArray(BX_SETTINGS.workstations)) BX_SETTINGS.workstations = [];
  const list = BX_SETTINGS.workstations;
  const ids = new Set(list.map((w) => w.id));
  const used = new Set(JC_DEFAULT_ROUTING.map((s) => s.station));
  (typeof MACHINE_MODELS !== "undefined" ? MACHINE_MODELS : []).forEach((m) => (jcRouting(m) || []).forEach((s) => s.station && used.add(s.station)));
  used.forEach((id) => { if (!ids.has(id)) list.push({ id, name: JC_WS_NAMES[id] || id, rate: "" }); });
  return list;
}
function jcRate(station) { const w = jcWorkstations().find((x) => x.id === station); return w ? jcNum(w.rate) : 0; }

/* ---- time ------------------------------------------------------------------------ */

function jcMinutes(job) {
  return (job.logs || []).reduce((s, l) => s + Math.max(0, ((l.to ? Date.parse(l.to) : Date.now()) - Date.parse(l.from)) / 60000), 0);
}
function jcDownMins(d) { return Math.max(0, ((d.to ? Date.parse(d.to) : Date.now()) - Date.parse(d.from)) / 60000); }
function jcClock(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); }
function jcFmtMins(m) {
  m = Math.round(m);
  return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m} น.`;
}
function jcAllNos() { return WORK_ORDERS.flatMap((w) => (w.jobs || []).map((j) => j.no)); }
function jcNextNo(extra) {
  const used = jcAllNos().concat(extra || []);
  if (typeof namingNext === "function") return namingNext("jc", used);
  return `JC-${new Date().getFullYear()}-${String(used.length + 1).padStart(4, "0")}`;
}
function jcRefresh() {
  renderJobCards();
  if (document.getElementById("jcOpBox")) renderJcOperator();
}
function jcSave(wo, what, detail) {
  if (typeof saveWorkOrders === "function") saveWorkOrders();
  if (typeof auditLog === "function") auditLog(what, wo.wo, detail);
  jcRefresh();
}

/* ---- actions ----------------------------------------------------------------------- */

function jcCreate(wo) {
  const r = jcRouting(wo.model) || JC_DEFAULT_ROUTING;
  const made = [];
  wo.jobs = r.map((s, i) => {
    const no = jcNextNo(made);
    made.push(no);
    return { id: `${wo.wo}-${i + 1}`, no, seq: i + 1, op: s.op, station: s.station || "", planMins: jcNum(s.mins) * jcNum(wo.qty || 1), status: "open", assignee: "", qtyDone: 0, logs: [], downs: [] };
  });
  jcSave(wo, "สร้าง Job Card", `${wo.jobs.length} ขั้นตอน ตาม Routing ${wo.model}${jcRouting(wo.model) ? "" : " (แม่แบบเริ่มต้น)"}`);
}

function jcAct(wo, job, act, qty, reason) {
  const now = new Date().toISOString();
  job.logs = job.logs || [];
  job.downs = job.downs || [];
  const open = job.logs.find((l) => !l.to);
  const down = job.downs.find((d) => !d.to);
  const before = JC_STATUS[job.status][0];
  if (act === "start") {
    if (down) down.to = now;
    if (!open) job.logs.push({ from: now, by: jcMe() });
    if (!job.assignee) job.assignee = jcMe();
    job.status = "wip";
  } else if (act === "hold") {
    if (open) open.to = now;
    if (!down) job.downs.push({ from: now, reason: reason || "อื่น ๆ", by: jcMe() });
    job.status = "hold";
  } else if (act === "done") {
    if (open) open.to = now;
    if (down) down.to = now;
    job.qtyDone = qty > 0 ? qty : jcNum(wo.qty);
    job.status = "done";
    job.doneAt = now;
  } else if (act === "reopen") {
    job.status = "hold";
    job.downs.push({ from: now, reason: "งานแก้ไข (Rework)", by: jcMe() });
  } else if (act === "claim") {
    job.assignee = jcMe();
  }
  const note = act === "done" ? ` · เสร็จ ${job.qtyDone} · ใช้เวลา ${jcFmtMins(jcMinutes(job))}` : act === "hold" ? ` · ${reason || ""}` : act === "claim" ? ` · รับงานโดย ${job.assignee}` : "";
  jcSave(wo, act === "claim" ? "รับ Job Card" : "อัปเดต Job Card", `${job.no} ${job.op}: ${before} → ${JC_STATUS[job.status][0]}${note}`);
}

// action buttons shared by the work-order card and the operator screen
function jcButtons(wo, i, big) {
  const j = wo.jobs[i];
  const cls = big ? "btn-primary jc-big" : "btn-link";
  const cls2 = big ? "btn-secondary jc-big" : "btn-link";
  const at = `data-jcwo="${jcEsc(wo.wo)}" data-i="${i}"`;
  if (!jcCanRun()) return "";
  if (j.status === "done") return `<span class="muted-inline">เสร็จ ${jcEsc(j.qtyDone)} · ${jcEsc(String(j.doneAt || "").slice(0, 10))}</span>${!big && jcCanPlan() ? ` <button type="button" class="btn-link" data-jc="reopen" ${at}>เปิดใหม่</button>` : ""}`;
  if (!j.assignee && big) return `<button type="button" class="${cls}" data-jc="claim" ${at}>รับงานนี้</button>`;
  const hold = j.status === "wip"
    ? `<select class="bom-inline jc-reason" ${at} aria-label="เหตุผลที่หยุด"><option value="">— สาเหตุที่หยุด —</option>${JC_STOP_REASONS.map((r) => `<option>${jcEsc(r)}</option>`).join("")}</select><button type="button" class="${cls2}" data-jc="hold" ${at}>⏸ พัก</button>`
    : `<button type="button" class="${cls}" data-jc="start" ${at}>▶ ${j.status === "hold" ? "ทำต่อ" : "เริ่ม"}</button>`;
  return `${hold} <label class="jc-qtylab">จำนวนเสร็จ <input type="number" class="bom-inline jc-qty" ${at} min="0" step="1" value="${jcEsc(wo.qty)}" aria-label="จำนวนที่เสร็จ"></label> <button type="button" class="${cls2}" data-jc="done" ${at}>✔ เสร็จ</button>`;
}

function jcWireButtons(root) {
  root.querySelectorAll("[data-jc]").forEach((b) => b.addEventListener("click", () => {
    const wo = WORK_ORDERS.find((w) => w.wo === b.dataset.jcwo);
    if (!wo) return;
    const i = +b.dataset.i;
    const q = root.querySelector(`.jc-qty[data-jcwo="${b.dataset.jcwo}"][data-i="${i}"]`);
    const r = root.querySelector(`.jc-reason[data-jcwo="${b.dataset.jcwo}"][data-i="${i}"]`);
    if (b.dataset.jc === "hold" && r && !r.value) { showToast("เลือกสาเหตุที่หยุดก่อน", "warn"); r.focus(); return; }
    if (b.dataset.jc === "done" && q && !(jcNum(q.value) > 0)) { showToast("ใส่จำนวนที่เสร็จ", "warn"); q.focus(); return; }
    jcAct(wo, wo.jobs[i], b.dataset.jc, q ? jcNum(q.value) : 0, r ? r.value : "");
  }));
}

function jcPill(st) {
  const s = JC_STATUS[st] || JC_STATUS.open;
  return `<span class="pill ${(typeof DOC_TONE_PILL !== "undefined" && DOC_TONE_PILL[s[1]]) || "pill-eliminate"}">${s[0]}</span>`;
}

/* ---- cost sheet (ERPNext Work Order: operating cost + material cost) ------------- */

function jcCost(wo) {
  const jobs = wo.jobs || [];
  const planOp = jobs.reduce((s, j) => s + jcNum(j.planMins) / 60 * jcRate(j.station), 0);
  const actOp = jobs.reduce((s, j) => s + jcMinutes(j) / 60 * jcRate(j.station), 0);
  const mat = typeof sxWoMaterialCost === "function" ? sxWoMaterialCost(wo.wo) : 0;
  const down = {};
  jobs.forEach((j) => (j.downs || []).forEach((d) => { down[d.reason] = (down[d.reason] || 0) + jcDownMins(d); }));
  return { planOp, actOp, mat, total: actOp + mat, down, rated: jobs.some((j) => jcRate(j.station) > 0) };
}

/* ---- work-order card --------------------------------------------------------------- */

function renderJobCards() {
  const el = document.getElementById("jcBody");
  if (!el || typeof WORK_ORDERS === "undefined") return;
  const me = jcMe();
  const wos = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์" || w.wo === jcWo || (w.jobs || []).length);
  if (!jcWo || !WORK_ORDERS.some((w) => w.wo === jcWo)) jcWo = (wos[0] || {}).wo || "";
  const wo = WORK_ORDERS.find((w) => w.wo === jcWo);
  const users = typeof AUTH !== "undefined" && AUTH ? AUTH.users.filter((u) => u.active && u.role !== "admin").map((u) => u.name) : [];

  const mine = WORK_ORDERS.flatMap((w) => (w.jobs || []).filter((j) => j.assignee === me && j.status !== "done").map((j) => ({ w, j })));
  const mineHtml = jcMine ? `<div class="jc-mine">${mine.length ? `<table class="data-table"><thead><tr><th>Job Card</th><th>ใบสั่งผลิต</th><th>ขั้นตอน</th><th>สถานะ</th></tr></thead><tbody>${mine.map(({ w, j }) => `<tr><td><button type="button" class="bx-link" data-jcgo="${jcEsc(w.wo)}">${jcEsc(j.no)}</button></td><td>${jcEsc(w.wo)} · ${jcEsc(w.model)}</td><td>${jcEsc(j.op)}</td><td>${jcPill(j.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ไม่มีงานค้างที่มอบหมายให้ ${jcEsc(me)}</p>`}</div>` : "";

  let body = "";
  if (!wo) body = `<p class="muted-inline">ยังไม่มีใบสั่งผลิต</p>`;
  else if (!(wo.jobs || []).length) {
    const r = jcRouting(wo.model);
    body = `<p class="muted-inline">${jcEsc(wo.wo)} ยังไม่มี Job Card · Routing ของ ${jcEsc(wo.model)}: ${r ? r.map((s) => jcEsc(s.op)).join(" → ") : "ยังไม่ตั้ง (จะใช้แม่แบบเริ่มต้น 6 ขั้นตอน)"}</p>
      ${jcCanPlan() ? `<button type="button" class="btn-primary" id="jcCreate">สร้าง Job Card จาก Routing</button>` : ""}`;
  } else {
    const jobs = wo.jobs;
    const done = jobs.filter((j) => j.status === "done").length;
    const plan = jobs.reduce((s, j) => s + jcNum(j.planMins), 0);
    const act = jobs.reduce((s, j) => s + jcMinutes(j), 0);
    const c = jcCost(wo);
    const downTot = Object.values(c.down).reduce((s, v) => s + v, 0);
    body = `<div class="jc-sum">ขั้นตอนเสร็จ <b>${done}/${jobs.length}</b> · เวลาทำงานจริง <b>${jcFmtMins(act)}</b>${plan ? ` จากแผน ${jcFmtMins(plan)}` : ""} · เวลาหยุด <b>${jcFmtMins(downTot)}</b> · ผลิตเสร็จเข้าคลังแล้ว <b>${jcNum(wo.produced)}/${jcNum(wo.qty)}</b></div>
      <div class="table-scroll"><table class="data-table jc-table"><thead><tr><th>#</th><th>ขั้นตอน</th><th>ผู้รับผิดชอบ</th><th class="num">เวลาจริง / แผน</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${jobs.map((j, i) => {
        const prevOpen = jobs.slice(0, i).some((p) => p.status !== "done");
        const dm = (j.downs || []).reduce((s, d) => s + jcDownMins(d), 0);
        const openDown = (j.downs || []).find((d) => !d.to);
        return `<tr${j.status === "wip" ? ` class="jc-wip"` : ""}><td>${j.seq}</td>
          <td><b>${jcEsc(j.op)}</b><div class="muted-inline">${jcEsc(j.no)} · ${jcEsc(j.station)}</div>${prevOpen && j.status === "wip" ? `<div class="muted-inline" title="ขั้นก่อนหน้ายังไม่เสร็จ">⚠ ขั้นก่อนยังไม่เสร็จ</div>` : ""}</td>
          <td>${jcCanPlan() ? `<select class="bom-inline jc-who" data-i="${i}"><option value="">—</option>${[...new Set(users.concat(j.assignee ? [j.assignee] : []))].map((n) => `<option${n === j.assignee ? " selected" : ""}>${jcEsc(n)}</option>`).join("")}</select>` : jcEsc(j.assignee || "—")}</td>
          <td class="num"><span class="${j.planMins && jcMinutes(j) > j.planMins ? "bx-neg" : ""}">${(j.logs || []).length ? jcFmtMins(jcMinutes(j)) : "—"}</span><div class="muted-inline">แผน ${j.planMins ? jcFmtMins(j.planMins) : "—"}${dm ? ` · หยุด ${jcFmtMins(dm)}` : ""}</div></td>
          <td>${jcPill(j.status)}${openDown ? `<div class="muted-inline">${jcEsc(openDown.reason)}</div>` : ""}</td><td class="jc-btns">${jcButtons(wo, i, false)}</td></tr>`;
      }).join("")}</tbody></table></div>
      ${jcCostHtml(wo, c)}
      ${done === jobs.length && jcNum(wo.produced) < jcNum(wo.qty) && typeof renderSxTab === "function" ? `<p><button type="button" class="btn-primary" id="jcToStock">ทุกขั้นตอนเสร็จ — บันทึกผลิตเสร็จเข้าคลังสินค้าสำเร็จรูป →</button></p>` : ""}`;
  }

  el.innerHTML = `
    <div class="filter-row"><label for="jcWoSel">ใบสั่งผลิต:</label>
      <select id="jcWoSel">${wos.map((w) => `<option value="${jcEsc(w.wo)}"${w.wo === jcWo ? " selected" : ""}>${jcEsc(w.wo)} · ${jcEsc(w.model)} × ${jcEsc(w.qty)} (${(w.jobs || []).filter((j) => j.status === "done").length}/${(w.jobs || []).length || "–"} ขั้น)</option>`).join("")}</select>
      <label class="vis-opt"><input type="checkbox" id="jcMine"${jcMine ? " checked" : ""}> งานของฉัน (${mine.length})</label></div>
    ${mineHtml}
    ${body}
    ${wo ? jcRoutingEditor(wo.model) : ""}
    ${jcWsEditor()}`;
  jcWire(el, wo);
}

function jcCostHtml(wo, c) {
  const n = Math.max(1, jcNum(wo.qty));
  const downRows = Object.keys(c.down).sort((a, b) => c.down[b] - c.down[a]);
  return `<div class="jc-cost">
    <div><div class="vis-group-title">ต้นทุนใบสั่งผลิต (Cost sheet)</div>
      <table class="data-table jc-cost-t"><tbody>
        <tr><td>ค่าดำเนินการตามแผน (เวลาแผน × ค่าสถานี)</td><td class="num">${c.rated ? jcBaht(c.planOp) : "—"}</td></tr>
        <tr><td>ค่าดำเนินการจริง (เวลาจริง × ค่าสถานี)</td><td class="num">${c.rated ? jcBaht(c.actOp) : "—"}</td></tr>
        <tr><td>ค่าวัสดุที่เบิกไปใช้ (มูลค่าตามคลัง)</td><td class="num">${jcBaht(c.mat)}</td></tr>
        <tr><th>รวมต้นทุนจริงถึงตอนนี้</th><th class="num">${jcBaht(c.total)}</th></tr>
        <tr><td>เฉลี่ยต่อคัน (÷ ${n})</td><td class="num">${jcBaht(c.total / n)}</td></tr>
      </tbody></table>
      ${c.rated ? "" : `<p class="muted-inline">ยังไม่ได้ตั้งค่าใช้จ่ายต่อชั่วโมงของสถานีงาน — ตั้งได้ที่ "สถานีงาน" ด้านล่าง</p>`}</div>
    <div><div class="vis-group-title">เวลาหยุดตามสาเหตุ (Downtime)</div>
      ${downRows.length ? `<table class="data-table"><tbody>${downRows.map((r) => `<tr><td>${jcEsc(r)}</td><td class="num">${jcFmtMins(c.down[r])}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ยังไม่มีการหยุดงาน</p>`}</div>
  </div>`;
}

function jcRoutingEditor(model) {
  const r = jcRouting(model);
  const rows = jcRDraftModel === model && jcRDraft ? jcRDraft : (r || JC_DEFAULT_ROUTING);
  const can = jcCanPlan();
  const open = jcRDraftModel === model && jcRDraft ? " open" : "";
  return `<details class="jc-routing"${open}><summary>Routing ของ ${jcEsc(model)} — ${r ? `${r.length} ขั้นตอน` : "ยังไม่ตั้ง (ใช้แม่แบบเริ่มต้น)"}</summary>
    <p class="card-sub">ลำดับขั้นตอนการผลิตของรุ่นนี้ · เวลาแผนเป็นนาทีต่อ 1 คัน (Job Card คูณจำนวนในใบสั่งผลิตให้) · ใช้กับใบสั่งผลิตที่สร้าง Job Card หลังจากนี้</p>
    <table class="data-table"><thead><tr><th>#</th><th>ขั้นตอน (Operation)</th><th>สถานี (Workstation)</th><th class="num">นาที/คัน</th><th></th></tr></thead><tbody>
    ${rows.map((s, i) => `<tr><td>${i + 1}</td>
      <td>${can ? `<input class="bom-inline jc-r" data-i="${i}" data-f="op" value="${jcEsc(s.op)}">` : jcEsc(s.op)}</td>
      <td>${can ? `<input class="bom-inline jc-r" data-i="${i}" data-f="station" value="${jcEsc(s.station)}" list="jcWsList">` : jcEsc(s.station)}</td>
      <td class="num">${can ? `<input class="bom-inline jc-r" type="number" min="0" data-i="${i}" data-f="mins" value="${jcEsc(s.mins)}">` : jcEsc(s.mins)}</td>
      <td>${can ? `<button type="button" class="btn-link" data-jcrdel="${i}" aria-label="ลบขั้นตอน">✕</button>` : ""}</td></tr>`).join("")}
    </tbody></table>
    <datalist id="jcWsList">${jcWorkstations().map((w) => `<option value="${jcEsc(w.id)}">${jcEsc(w.name)}</option>`).join("")}</datalist>
    ${can ? `<button type="button" class="btn-secondary" id="jcRAdd">+ เพิ่มขั้นตอน</button> <button type="button" class="btn-primary" id="jcRSave">บันทึก Routing</button>` : ""}
  </details>`;
}

function jcWsEditor() {
  const can = jcCanPlan();
  return `<details class="jc-routing"><summary>สถานีงาน (Workstation) — ค่าใช้จ่ายต่อชั่วโมง</summary>
    <p class="card-sub">ค่าแรง + ค่าเครื่องจักร + ค่าไฟ ต่อชั่วโมงของแต่ละสถานี (แบบ Workstation hour rate ของ ERPNext) ใช้คิดต้นทุนดำเนินการของใบสั่งผลิต · ใส่ตัวเลขจริงของบริษัท ถ้ายังไม่ทราบให้เว้นว่างไว้</p>
    <table class="data-table"><thead><tr><th>รหัส</th><th>ชื่อสถานี</th><th class="num">บาท/ชั่วโมง</th></tr></thead><tbody>
    ${jcWorkstations().map((w, i) => `<tr><td class="mono-cell">${jcEsc(w.id)}</td>
      <td>${can ? `<input class="bom-inline jc-ws" data-i="${i}" data-f="name" value="${jcEsc(w.name)}">` : jcEsc(w.name)}</td>
      <td class="num">${can ? `<input class="bom-inline jc-ws" type="number" min="0" data-i="${i}" data-f="rate" value="${jcEsc(w.rate)}">` : jcEsc(w.rate || "—")}</td></tr>`).join("")}
    </tbody></table></details>`;
}

function jcWire(el, wo) {
  document.getElementById("jcWoSel").addEventListener("change", (e) => { jcWo = e.target.value; renderJobCards(); });
  document.getElementById("jcMine").addEventListener("change", (e) => { jcMine = e.target.checked; renderJobCards(); });
  el.querySelectorAll("[data-jcgo]").forEach((b) => b.addEventListener("click", () => { jcWo = b.dataset.jcgo; renderJobCards(); }));
  el.querySelectorAll(".jc-ws").forEach((inp) => inp.addEventListener("change", () => {
    const w = jcWorkstations()[+inp.dataset.i];
    const prev = w[inp.dataset.f];
    w[inp.dataset.f] = inp.dataset.f === "rate" ? (inp.value === "" ? "" : jcNum(inp.value)) : inp.value.trim();
    if (typeof bxSaveStock === "function") bxSaveStock();
    if (typeof auditLog === "function") auditLog("ตั้งค่าสถานีงาน", w.id, `${inp.dataset.f === "rate" ? "บาท/ชม." : "ชื่อ"}: "${prev ?? ""}" → "${w[inp.dataset.f]}"`);
    renderJobCards();
  }));
  if (!wo) return;
  const c = document.getElementById("jcCreate");
  if (c) c.addEventListener("click", () => jcCreate(wo));
  jcWireButtons(el);
  el.querySelectorAll(".jc-who").forEach((s) => s.addEventListener("change", () => {
    const j = wo.jobs[+s.dataset.i]; const prev = j.assignee; j.assignee = s.value;
    jcSave(wo, "มอบหมาย Job Card", `${j.no} ${j.op}: "${prev || "-"}" → "${j.assignee || "-"}"`);
  }));
  const toStock = document.getElementById("jcToStock");
  if (toStock) toStock.addEventListener("click", () => {
    bxTab = "sx"; sxSub = "entry";
    sxDraft = Object.assign(sxNewDraft("manufacture"), { wo: wo.wo, woQty: Math.max(1, jcNum(wo.qty) - jcNum(wo.produced)) });
    switchView("bomx");
  });
  if (!jcCanPlan() || !document.getElementById("jcRSave")) return;
  const draft = () => { if (jcRDraftModel !== wo.model || !jcRDraft) { jcRDraftModel = wo.model; jcRDraft = JSON.parse(JSON.stringify(jcRouting(wo.model) || JC_DEFAULT_ROUTING)); } return jcRDraft; };
  el.querySelectorAll(".jc-r").forEach((inp) => inp.addEventListener("input", () => { draft()[+inp.dataset.i][inp.dataset.f] = inp.value; }));
  el.querySelectorAll("[data-jcrdel]").forEach((b) => b.addEventListener("click", () => { draft().splice(+b.dataset.jcrdel, 1); renderJobCards(); }));
  document.getElementById("jcRAdd").addEventListener("click", () => { draft().push({ op: "", station: "", mins: "" }); renderJobCards(); });
  document.getElementById("jcRSave").addEventListener("click", () => {
    const rows = draft().map((s) => ({ op: String(s.op || "").trim(), station: String(s.station || "").trim().toUpperCase(), mins: jcNum(s.mins) || "" })).filter((s) => s.op);
    if (!rows.length) { showToast("ต้องมีอย่างน้อย 1 ขั้นตอน", "warn"); return; }
    if (!BOM_META[wo.model]) BOM_META[wo.model] = bomDefaultMeta(wo.model);
    BOM_META[wo.model].routing = rows;
    if (typeof saveBom === "function") saveBom();
    if (typeof auditLog === "function") auditLog("บันทึก Routing", wo.model, rows.map((s) => s.op).join(" → "));
    jcRDraft = null; jcRDraftModel = "";
    showToast(`บันทึก Routing ${wo.model} แล้ว`, "good");
    renderJobCards();
  });
}

/* ---- operator screen (งานของฉัน): big buttons for the shop floor -------------------- */

function renderJcOperator() {
  const box = document.getElementById("jcOpBox");
  if (!box || typeof WORK_ORDERS === "undefined") return;
  const me = jcMe();
  const live = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์");
  const mine = [];
  const free = [];
  live.forEach((w) => (w.jobs || []).forEach((j, i) => {
    if (j.status === "done") return;
    if (j.assignee === me) mine.push({ w, j, i });
    else if (!j.assignee && !(w.jobs.slice(0, i).some((p) => p.status === "open" && !p.assignee))) free.push({ w, j, i });
  }));
  const order = { wip: 0, hold: 1, open: 2 };
  mine.sort((a, b) => order[a.j.status] - order[b.j.status]);
  const card = ({ w, j, i }) => {
    const openLog = (j.logs || []).find((l) => !l.to);
    const openDown = (j.downs || []).find((d) => !d.to);
    return `<div class="jc-op${j.status === "wip" ? " jc-op-wip" : ""}">
      <div class="jc-op-head"><b>${jcEsc(j.op)}</b> ${jcPill(j.status)}</div>
      <div class="muted-inline">${jcEsc(w.wo)} · ${jcEsc(w.model)} × ${jcEsc(w.qty)} · สถานี ${jcEsc(j.station || "—")} · ${jcEsc(j.no)}</div>
      <div class="jc-op-time">${openLog ? `เริ่มรอบนี้ ${jcEsc(jcClock(openLog.from))} น. · ` : ""}ทำไปแล้ว ${jcFmtMins(jcMinutes(j))}${j.planMins ? ` / แผน ${jcFmtMins(j.planMins)}` : ""}${openDown ? ` · หยุด: ${jcEsc(openDown.reason)}` : ""}</div>
      <div class="jc-op-btns">${jcButtons(w, i, true)}</div></div>`;
  };
  box.innerHTML = `<div class="card"><div class="card-header"><h3>Job Card ของฉัน — ${jcEsc(me)}</h3>
      <p class="card-sub">กด ▶ เมื่อเริ่มทำ · ⏸ เมื่อต้องหยุด (เลือกสาเหตุ) · ✔ เมื่อเสร็จ ระบบจับเวลาให้เอง</p></div>
    <div class="card-body">${mine.length ? `<div class="jc-op-grid">${mine.map(card).join("")}</div>` : `<p class="muted-inline">ไม่มีงานที่มอบหมายให้คุณตอนนี้</p>`}
    ${free.length ? `<div class="vis-group-title jc-free-t">งานที่ยังไม่มีคนรับ (${free.length})</div><div class="jc-op-grid">${free.slice(0, 8).map(card).join("")}</div>` : ""}</div></div>`;
  jcWireButtons(box);
}
