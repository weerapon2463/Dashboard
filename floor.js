/* ==========================================================================
   โหมดหน้างาน (floor.js) — one simple screen for people on the shop floor:
   my job cards with huge start / stop / done buttons, stop reasons as tap-chips,
   scan, report a problem, and the few inbox items that need them. Thai only.
   Per device (y2j-floor-v1); production operators start in it by default.
   ========================================================================== */

const FLOOR_KEY = "y2j-floor-v1";
let floorPendingStop = null; // "WO|i" of the card whose stop reasons are showing
let floorPendingDone = null;
let floorTimer = null;

function flEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function flUser() { return typeof authCurrentUser === "function" ? authCurrentUser() : null; }
function flDefaultOn() { const u = flUser(); return !!u && u.role === "operator" && u.dept === "prod"; }
function flPref() { try { return localStorage.getItem(FLOOR_KEY); } catch (e) { return null; } }
function flIsOn() { const p = flPref(); return p === "on" || (p === null && flDefaultOn()); }
function flSetPref(on) { try { localStorage.setItem(FLOOR_KEY, on ? "on" : "off"); } catch (e) { /* per device only */ } }

function floorEnter() {
  flSetPref(true);
  document.documentElement.setAttribute("data-floor", "1");
  document.documentElement.removeAttribute("data-floor-away");
  window.scrollTo(0, 0);
  renderFloor();
}
function floorExit() {
  flSetPref(false);
  document.documentElement.removeAttribute("data-floor");
  document.documentElement.removeAttribute("data-floor-away");
}
// a floor action that needs a full page (requisition, a document): show it, with a big way back
function floorAway(fn) {
  document.documentElement.setAttribute("data-floor-away", "1");
  try { fn(); } catch (e) { /* the page shows its own errors */ }
  window.scrollTo(0, 0);
}

function flJobs() {
  if (typeof WORK_ORDERS === "undefined") return { mine: [], free: [] };
  const me = jcMe();
  const mine = [], free = [];
  WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์").forEach((w) => (w.jobs || []).forEach((j, i) => {
    if (j.status === "done") return;
    if (j.assignee === me) mine.push({ w, j, i });
    else if (!j.assignee && !w.jobs.slice(0, i).some((p) => p.status !== "done")) free.push({ w, j, i });
  }));
  // running first, then stopped, then jobs that can start now, then ones still waiting for an earlier step
  const ready = (x) => x.w.jobs.slice(0, x.i).every((p) => p.status === "done");
  const order = (x) => ({ wip: 0, hold: 1 }[x.j.status] ?? (ready(x) ? 2 : 3));
  mine.sort((a, b) => order(a) - order(b));
  return { mine, free };
}

function flCard({ w, j, i }) {
  const key = `${w.wo}|${i}`;
  const openLog = (j.logs || []).find((l) => !l.to);
  const openDown = (j.downs || []).find((d) => !d.to);
  const at = `data-wo="${flEsc(w.wo)}" data-i="${i}"`;
  const mins = jcMinutes(j);
  const over = j.planMins && mins > j.planMins;
  const prev = j.status === "open" ? w.jobs.slice(0, i).reverse().find((p) => p.status !== "done") : null;
  let btns;
  if (prev && j.assignee) btns = "";
  else if (!j.assignee) btns = `<button type="button" class="fl-btn fl-go" data-fl="claim" ${at}>✋ รับงานนี้</button>`;
  else if (floorPendingStop === key) {
    btns = `<div class="fl-ask">หยุดเพราะอะไร?</div><div class="fl-chips">${JC_STOP_REASONS.map((r) => `<button type="button" class="fl-chip" data-fl="hold" data-reason="${flEsc(r)}" ${at}>${flEsc(r)}</button>`).join("")}</div>
      <button type="button" class="fl-btn fl-plain" data-fl="cancel">ยกเลิก</button>`;
  } else if (floorPendingDone === key) {
    btns = `<div class="fl-ask">ทำเสร็จกี่ชิ้น?</div><div class="fl-qty"><button type="button" class="fl-step" data-fl="minus">−</button><output id="flQty">${flEsc(w.qty || 1)}</output><button type="button" class="fl-step" data-fl="plus">+</button></div>
      <button type="button" class="fl-btn fl-go" data-fl="done" ${at}>✔ ยืนยันเสร็จ</button><button type="button" class="fl-btn fl-plain" data-fl="cancel">ยกเลิก</button>`;
  } else if (j.status === "wip") {
    btns = `<button type="button" class="fl-btn fl-stop" data-fl="askstop" ${at}>⏸ หยุด</button><button type="button" class="fl-btn fl-go" data-fl="askdone" ${at}>✔ เสร็จแล้ว</button>`;
  } else {
    btns = `<button type="button" class="fl-btn fl-go" data-fl="start" ${at}>▶ ${j.status === "hold" ? "ทำต่อ" : "เริ่มงาน"}</button>`;
  }
  const tone = j.status === "wip" ? "fl-wip" : j.status === "hold" ? "fl-hold" : prev ? "fl-later" : "";
  return `<article class="fl-card ${tone}">
    <div class="fl-state">${j.status === "wip" ? "● กำลังทำ" : j.status === "hold" ? "■ หยุดอยู่" : "○ รอเริ่ม"}</div>
    <h3 class="fl-op">${flEsc(j.op)}</h3>
    <div class="fl-sub">รถ ${flEsc(w.model)}${w.serial ? ` · เลขเครื่อง ${flEsc(w.serial)}` : ""} · ใบสั่งผลิต ${flEsc(w.wo)}</div>
    <div class="fl-time${over ? " fl-over" : ""}">${openLog ? `เริ่ม ${flEsc(jcClock(openLog.from))} น. · ` : ""}ทำไปแล้ว <b>${flEsc(jcFmtMins(mins))}</b>${j.planMins ? ` จากแผน ${flEsc(jcFmtMins(j.planMins))}` : ""}</div>
    ${prev ? `<div class="fl-wait">ยังไม่ถึงคิว — รอ ${flEsc(prev.op)} ${flEsc(JC_STATUS[prev.status][0])}${prev.assignee ? ` (${flEsc(prev.assignee)})` : ""}</div>` : ""}
    ${openDown ? `<div class="fl-why">หยุดเพราะ: ${flEsc(openDown.reason)} (ตั้งแต่ ${flEsc(jcClock(openDown.from))} น.)</div>` : ""}
    ${btns ? `<div class="fl-actions">${btns}</div>` : ""}
    ${j.assignee && j.status !== "done" ? `<button type="button" class="fl-link" data-fl="req" ${at}>📦 ขอเบิกของสำหรับงานนี้</button>` : ""}
  </article>`;
}

function renderFloor() {
  let el = document.getElementById("view-floor");
  if (!el) {
    el = document.createElement("section");
    el.id = "view-floor";
    el.className = "floor";
    document.querySelector(".main").appendChild(el);
  }
  if (!flIsOn()) return;
  const u = flUser();
  const { mine, free } = flJobs();
  const inbox = typeof mtCollect === "function" ? mtCollect().filter((x) => x.group !== "งานของฉัน").sort((a, b) => b.score - a.score).slice(0, 4) : [];
  const now = new Date();
  const first = String((u && u.name) || "").trim().split(/\s+/)[0] || "";
  const sync = typeof Y2JStore !== "undefined" ? Y2JStore.status() : { state: "local" };
  const syncTxt = { synced: "✓ ข้อมูลส่งถึงทุกคนแล้ว", saving: "กำลังส่งข้อมูล…", error: "⚠ ยังส่งข้อมูลไม่ได้ (จะลองใหม่เอง)", offline: "⚠ ไม่มีเน็ต — บันทึกไว้ในเครื่องก่อน" }[sync.state] || "";
  el.innerHTML = `
    <header class="fl-head">
      <div><div class="fl-hello">สวัสดี ${flEsc(first)} 👋</div>
        <div class="fl-date">${flEsc(now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" }))} · ${flEsc(jcClock(now.toISOString()))} น.${syncTxt ? ` · <span class="fl-sync fl-sync-${flEsc(sync.state)}">${syncTxt}</span>` : ""}</div></div>
      <button type="button" class="fl-btn fl-plain fl-exit" data-fl="exit">หน้าจอเต็ม ↗</button>
    </header>
    <div class="fl-tiles">
      <button type="button" class="fl-tile" data-fl="scan"><span>📷</span>สแกน QR</button>
      <button type="button" class="fl-tile" data-fl="problem"><span>⚠️</span>แจ้งปัญหา / ของเสีย</button>
      <button type="button" class="fl-tile" data-fl="plans"><span>🗒</span>งานที่ได้รับมอบหมาย</button>
    </div>
    <h2 class="fl-h">งานของฉัน${mine.length ? ` (${mine.length})` : ""}</h2>
    ${mine.length ? `<div class="fl-grid">${mine.map(flCard).join("")}</div>` : `<p class="fl-empty">ตอนนี้ยังไม่มีงานของคุณ — รับงานจากรายการด้านล่าง หรือถามหัวหน้างาน</p>`}
    ${inbox.length ? `<h2 class="fl-h">รอคุณดำเนินการ</h2><div class="fl-inbox">${inbox.map((x, n) => `<button type="button" class="fl-row" data-fl="inbox" data-n="${n}"><span class="fl-row-i">${flEsc(x.icon || "•")}</span><span><b>${flEsc(x.title)}</b><small>${flEsc(x.detail || "")}</small></span><span aria-hidden="true">›</span></button>`).join("")}</div>` : ""}
    ${free.length ? `<h2 class="fl-h">งานรอคนรับ (${free.length})</h2><div class="fl-grid">${free.slice(0, 6).map(flCard).join("")}</div>` : ""}`;
  el._inbox = inbox;
  flWire(el);
}

function flFind(b) {
  const w = (WORK_ORDERS || []).find((x) => x.wo === b.dataset.wo);
  return w ? { w, j: w.jobs[+b.dataset.i], i: +b.dataset.i } : null;
}

function flWire(el) {
  el.querySelectorAll("[data-fl]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.fl;
    const t = b.dataset.wo ? flFind(b) : null;
    if (a === "exit") { floorExit(); return; }
    if (a === "scan") { if (typeof snScan === "function") snScan("สแกน QR ที่ตัวรถ / ใบงาน / ชิ้นส่วน", (code) => { floorAway(() => snRoute(code)); return false; }); return; }
    if (a === "plans") { floorAway(() => switchView("plans")); return; }
    if (a === "problem") { flProblem(); return; }
    if (a === "inbox") { const x = el._inbox[+b.dataset.n]; if (x && x.act) floorAway(x.act); return; }
    if (a === "cancel") { floorPendingStop = floorPendingDone = null; renderFloor(); return; }
    if (a === "minus" || a === "plus") { const o = document.getElementById("flQty"); o.textContent = Math.max(1, (+o.textContent || 1) + (a === "plus" ? 1 : -1)); return; }
    if (!t) return;
    if (a === "askstop") { floorPendingStop = `${t.w.wo}|${t.i}`; floorPendingDone = null; renderFloor(); return; }
    if (a === "askdone") { floorPendingDone = `${t.w.wo}|${t.i}`; floorPendingStop = null; renderFloor(); return; }
    if (a === "req") { floorAway(() => jcRequestFor(t.w, t.j)); return; }
    const qty = a === "done" ? +(document.getElementById("flQty") || {}).textContent || 1 : 0;
    floorPendingStop = floorPendingDone = null;
    jcAct(t.w, t.j, a, qty, b.dataset.reason || "");
    showToast({ start: "เริ่มจับเวลาแล้ว", hold: "บันทึกการหยุดแล้ว — หัวหน้างานเห็นทันที", done: "บันทึกงานเสร็จแล้ว 👍", claim: "รับงานแล้ว" }[a] || "บันทึกแล้ว", "good");
  }));
}

// report a problem: stop the running job with a reason, or open a non-conformance report
function flProblem() {
  const { mine } = flJobs();
  const run = mine.find((x) => x.j.status === "wip");
  if (run) { floorPendingStop = `${run.w.wo}|${run.i}`; floorPendingDone = null; renderFloor(); showToast("เลือกสาเหตุที่ต้องหยุดงาน", "warn"); return; }
  if (typeof openDeptModal === "function" && typeof DOC_TYPES !== "undefined" && DOC_TYPES.ncr && typeof authCan === "function" && authCan("ncr", "create")) openDeptModal("ncr", null);
  else showToast("แจ้งหัวหน้างานโดยตรง (บัญชีนี้เปิดใบแจ้งปัญหาไม่ได้)", "warn");
}

function initFloor() {
  const acts = document.querySelector(".topbar-actions");
  if (acts && !document.getElementById("floorBtn")) {
    const b = document.createElement("button");
    b.type = "button"; b.id = "floorBtn"; b.className = "theme-toggle floor-toggle";
    b.title = "โหมดหน้างาน — ปุ่มใหญ่ ใช้ง่าย สำหรับพนักงานหน้างาน";
    b.textContent = "👷";
    b.addEventListener("click", floorEnter);
    acts.insertBefore(b, acts.firstChild);
  }
  if (!document.getElementById("floorBack")) {
    const back = document.createElement("button");
    back.type = "button"; back.id = "floorBack"; back.className = "floor-back";
    back.textContent = "👷 กลับหน้างาน";
    back.addEventListener("click", () => { document.documentElement.removeAttribute("data-floor-away"); window.scrollTo(0, 0); renderFloor(); });
    document.body.appendChild(back);
  }
  // re-draw after any job-card change (here or synced from another device)
  if (typeof jcRefresh === "function" && !jcRefresh._floor) {
    const orig = jcRefresh;
    jcRefresh = function () { orig(); if (flIsOn()) renderFloor(); };
    jcRefresh._floor = true;
  }
  if (flIsOn()) { document.documentElement.setAttribute("data-floor", "1"); renderFloor(); }
  clearInterval(floorTimer);
  floorTimer = setInterval(() => {
    const on = document.documentElement.getAttribute("data-floor") && !document.documentElement.getAttribute("data-floor-away");
    if (on && !floorPendingStop && !floorPendingDone) renderFloor();
  }, 30000);
}
