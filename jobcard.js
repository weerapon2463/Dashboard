/* ==========================================================================
   Routing + Job Cards — modelled on ERPNext (Routing → Operation /
   Workstation → Job Card with time logs). Each model has a routing (steps,
   station, planned minutes per unit) kept in BOM_META[model].routing; a work
   order gets one job card per step (wo.jobs), and operators start / pause /
   finish them so actual time per step is recorded.
   ========================================================================== */

const JC_DEFAULT_ROUTING = [
  { op: "ตัด / พับเหล็ก", station: "CUT", mins: "" },
  { op: "เชื่อมประกอบโครง", station: "WELD", mins: "" },
  { op: "กลึง / แมชชีน", station: "MC", mins: "" },
  { op: "พ่นสี", station: "PAINT", mins: "" },
  { op: "ประกอบ", station: "ASSY", mins: "" },
  { op: "ทดสอบ / QC ก่อนส่งมอบ", station: "QC", mins: "" },
];
// ERPNext Job Card statuses: Open / Work In Progress / On Hold / Completed
const JC_STATUS = { open: ["รอเริ่ม", "neutral"], wip: ["กำลังทำ", "warning"], hold: ["หยุดชั่วคราว", "critical"], done: ["เสร็จ", "good"] };

let jcWo = "";
let jcMine = false;

function jcRole() { return typeof currentRole === "function" ? currentRole() : "plant"; }
function jcCanPlan() { return typeof woCanAdd === "function" ? woCanAdd(jcRole()) : true; }
function jcCanRun() { return typeof woCanClaimOrUpdate === "function" ? woCanClaimOrUpdate(jcRole()) : true; }
function jcMe() { return (typeof authCurrentUser === "function" && authCurrentUser() && authCurrentUser().name) || (typeof getMyName === "function" && getMyName()) || "ผู้ใช้"; }
function jcEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function jcNum(v) { return Number(v) || 0; }

function jcRouting(model) {
  const m = typeof BOM_META !== "undefined" ? BOM_META[model] : null;
  return m && Array.isArray(m.routing) && m.routing.length ? m.routing : null;
}

function jcMinutes(job) {
  return (job.logs || []).reduce((s, l) => s + Math.max(0, ((l.to ? Date.parse(l.to) : Date.now()) - Date.parse(l.from)) / 60000), 0);
}
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
function jcSave(wo, what, detail) {
  if (typeof saveWorkOrders === "function") saveWorkOrders();
  if (typeof auditLog === "function") auditLog(what, wo.wo, detail);
  renderJobCards();
}

function jcCreate(wo) {
  const r = jcRouting(wo.model) || JC_DEFAULT_ROUTING;
  const made = [];
  wo.jobs = r.map((s, i) => {
    const no = jcNextNo(made);
    made.push(no);
    return { id: `${wo.wo}-${i + 1}`, no, seq: i + 1, op: s.op, station: s.station || "", planMins: jcNum(s.mins) * jcNum(wo.qty || 1), status: "open", assignee: "", qtyDone: 0, logs: [] };
  });
  jcSave(wo, "สร้าง Job Card", `${wo.jobs.length} ขั้นตอน ตาม Routing ${wo.model}${jcRouting(wo.model) ? "" : " (แม่แบบเริ่มต้น)"}`);
}

function jcAct(wo, job, act, qty) {
  const now = new Date().toISOString();
  const open = (job.logs || []).find((l) => !l.to);
  const before = JC_STATUS[job.status][0];
  job.logs = job.logs || [];
  if (act === "start") {
    if (!open) job.logs.push({ from: now, by: jcMe() });
    if (!job.assignee) job.assignee = jcMe();
    job.status = "wip";
  } else if (act === "hold") {
    if (open) open.to = now;
    job.status = "hold";
  } else if (act === "done") {
    if (open) open.to = now;
    job.qtyDone = qty > 0 ? qty : jcNum(wo.qty);
    job.status = "done";
    job.doneAt = now;
  } else if (act === "reopen") {
    job.status = "hold";
  }
  jcSave(wo, "อัปเดต Job Card", `${job.no} ${job.op}: ${before} → ${JC_STATUS[job.status][0]}${act === "done" ? ` · เสร็จ ${job.qtyDone} · ใช้เวลา ${jcFmtMins(jcMinutes(job))}` : ""}`);
}

function renderJobCards() {
  const el = document.getElementById("jcBody");
  if (!el || typeof WORK_ORDERS === "undefined") return;
  const me = jcMe();
  const wos = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์" || w.wo === jcWo);
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
    body = `<div class="jc-sum">ขั้นตอนเสร็จ <b>${done}/${jobs.length}</b> · เวลาจริงรวม <b>${jcFmtMins(act)}</b>${plan ? ` จากแผน ${jcFmtMins(plan)}` : ""} · ผลิตเสร็จเข้าคลังแล้ว <b>${jcNum(wo.produced)}/${jcNum(wo.qty)}</b></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>#</th><th>Job Card</th><th>ขั้นตอน</th><th>สถานี</th><th>ผู้รับผิดชอบ</th><th class="num">แผน</th><th class="num">จริง</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${jobs.map((j, i) => {
        const prevOpen = jobs.slice(0, i).some((p) => p.status !== "done");
        const run = jcCanRun();
        const btns = !run ? "" : j.status === "done"
          ? `<span class="muted-inline">เสร็จ ${jcEsc(j.qtyDone)} · ${jcEsc(String(j.doneAt || "").slice(0, 10))}</span>${jcCanPlan() ? ` <button type="button" class="btn-link" data-jc="reopen" data-i="${i}">เปิดใหม่</button>` : ""}`
          : `${j.status !== "wip" ? `<button type="button" class="btn-link" data-jc="start" data-i="${i}">▶ เริ่ม</button>` : `<button type="button" class="btn-link" data-jc="hold" data-i="${i}">⏸ พัก</button>`}
             <input type="number" class="bom-inline jc-qty" data-i="${i}" min="0" step="1" value="${jcEsc(wo.qty)}" aria-label="จำนวนที่เสร็จ" title="จำนวนที่เสร็จ">
             <button type="button" class="btn-link" data-jc="done" data-i="${i}">✔ เสร็จ</button>`;
        return `<tr${j.status === "wip" ? ` class="jc-wip"` : ""}><td>${j.seq}</td><td class="mono-cell">${jcEsc(j.no)}</td>
          <td>${jcEsc(j.op)}${prevOpen && j.status === "wip" ? ` <span class="muted-inline" title="ขั้นก่อนหน้ายังไม่เสร็จ">⚠ ขั้นก่อนยังไม่เสร็จ</span>` : ""}</td><td>${jcEsc(j.station)}</td>
          <td>${jcCanPlan() ? `<select class="bom-inline jc-who" data-i="${i}"><option value="">—</option>${[...new Set(users.concat(j.assignee ? [j.assignee] : []))].map((n) => `<option${n === j.assignee ? " selected" : ""}>${jcEsc(n)}</option>`).join("")}</select>` : jcEsc(j.assignee || "—")}</td>
          <td class="num">${j.planMins ? jcFmtMins(j.planMins) : "—"}</td>
          <td class="num"><span class="${j.planMins && jcMinutes(j) > j.planMins ? "bx-neg" : ""}">${(j.logs || []).length ? jcFmtMins(jcMinutes(j)) : "—"}</span></td>
          <td>${jcPill(j.status)}</td><td class="jc-btns">${btns}</td></tr>`;
      }).join("")}</tbody></table></div>
      ${done === jobs.length && jcNum(wo.produced) < jcNum(wo.qty) && typeof renderSxTab === "function" ? `<p><button type="button" class="btn-primary" id="jcToStock">ทุกขั้นตอนเสร็จ — บันทึกผลิตเสร็จเข้าคลังสินค้าสำเร็จรูป →</button></p>` : ""}`;
  }

  el.innerHTML = `
    <div class="filter-row"><label for="jcWoSel">ใบสั่งผลิต:</label>
      <select id="jcWoSel">${wos.map((w) => `<option value="${jcEsc(w.wo)}"${w.wo === jcWo ? " selected" : ""}>${jcEsc(w.wo)} · ${jcEsc(w.model)} × ${jcEsc(w.qty)} (${(w.jobs || []).filter((j) => j.status === "done").length}/${(w.jobs || []).length || "–"} ขั้น)</option>`).join("")}</select>
      <label class="vis-opt"><input type="checkbox" id="jcMine"${jcMine ? " checked" : ""}> งานของฉัน (${mine.length})</label></div>
    ${mineHtml}
    ${body}
    ${wo ? jcRoutingEditor(wo.model) : ""}`;
  jcWire(el, wo);
}

function jcPill(st) {
  const s = JC_STATUS[st] || JC_STATUS.open;
  return `<span class="pill ${(typeof DOC_TONE_PILL !== "undefined" && DOC_TONE_PILL[s[1]]) || "pill-eliminate"}">${s[0]}</span>`;
}

function jcRoutingEditor(model) {
  const r = jcRouting(model);
  const rows = r || JC_DEFAULT_ROUTING;
  const can = jcCanPlan();
  return `<details class="jc-routing"><summary>Routing ของ ${jcEsc(model)} — ${r ? `${r.length} ขั้นตอน` : "ยังไม่ตั้ง (ใช้แม่แบบเริ่มต้น)"}</summary>
    <p class="card-sub">ลำดับขั้นตอนการผลิตของรุ่นนี้ · เวลาแผนเป็นนาทีต่อ 1 คัน (Job Card คูณจำนวนในใบสั่งผลิตให้) · ใช้กับใบสั่งผลิตที่สร้าง Job Card หลังจากนี้</p>
    <table class="data-table"><thead><tr><th>#</th><th>ขั้นตอน (Operation)</th><th>สถานี (Workstation)</th><th class="num">นาที/คัน</th><th></th></tr></thead><tbody>
    ${rows.map((s, i) => `<tr><td>${i + 1}</td>
      <td>${can ? `<input class="bom-inline jc-r" data-i="${i}" data-f="op" value="${jcEsc(s.op)}">` : jcEsc(s.op)}</td>
      <td>${can ? `<input class="bom-inline jc-r" data-i="${i}" data-f="station" value="${jcEsc(s.station)}">` : jcEsc(s.station)}</td>
      <td class="num">${can ? `<input class="bom-inline jc-r" type="number" min="0" data-i="${i}" data-f="mins" value="${jcEsc(s.mins)}">` : jcEsc(s.mins)}</td>
      <td>${can ? `<button type="button" class="btn-link" data-jcrdel="${i}" aria-label="ลบขั้นตอน">✕</button>` : ""}</td></tr>`).join("")}
    </tbody></table>
    ${can ? `<button type="button" class="btn-secondary" id="jcRAdd">+ เพิ่มขั้นตอน</button> <button type="button" class="btn-primary" id="jcRSave">บันทึก Routing</button>` : ""}
  </details>`;
}

function jcWire(el, wo) {
  document.getElementById("jcWoSel").addEventListener("change", (e) => { jcWo = e.target.value; renderJobCards(); });
  document.getElementById("jcMine").addEventListener("change", (e) => { jcMine = e.target.checked; renderJobCards(); });
  el.querySelectorAll("[data-jcgo]").forEach((b) => b.addEventListener("click", () => { jcWo = b.dataset.jcgo; renderJobCards(); }));
  if (!wo) return;
  const c = document.getElementById("jcCreate");
  if (c) c.addEventListener("click", () => jcCreate(wo));
  el.querySelectorAll("[data-jc]").forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.i;
    const q = el.querySelector(`.jc-qty[data-i="${i}"]`);
    jcAct(wo, wo.jobs[i], b.dataset.jc, q ? jcNum(q.value) : 0);
  }));
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
  // routing editor works on a draft copy until saved
  const details = el.querySelector(".jc-routing");
  if (!details || !jcCanPlan()) return;
  if (jcRDraftModel === wo.model && jcRDraft) details.open = true;
  const draft = () => { if (jcRDraftModel !== wo.model || !jcRDraft) { jcRDraftModel = wo.model; jcRDraft = JSON.parse(JSON.stringify(jcRouting(wo.model) || JC_DEFAULT_ROUTING)); } return jcRDraft; };
  if (jcRDraftModel === wo.model && jcRDraft) {
    // re-render inputs from the draft
    details.querySelector("tbody").innerHTML = jcRDraft.map((s, i) => `<tr><td>${i + 1}</td>
      <td><input class="bom-inline jc-r" data-i="${i}" data-f="op" value="${jcEsc(s.op)}"></td>
      <td><input class="bom-inline jc-r" data-i="${i}" data-f="station" value="${jcEsc(s.station)}"></td>
      <td class="num"><input class="bom-inline jc-r" type="number" min="0" data-i="${i}" data-f="mins" value="${jcEsc(s.mins)}"></td>
      <td><button type="button" class="btn-link" data-jcrdel="${i}" aria-label="ลบขั้นตอน">✕</button></td></tr>`).join("");
  }
  details.querySelectorAll(".jc-r").forEach((inp) => inp.addEventListener("input", () => { draft()[+inp.dataset.i][inp.dataset.f] = inp.value; }));
  details.querySelectorAll("[data-jcrdel]").forEach((b) => b.addEventListener("click", () => { draft().splice(+b.dataset.jcrdel, 1); renderJobCards(); }));
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
let jcRDraft = null;
let jcRDraftModel = "";
