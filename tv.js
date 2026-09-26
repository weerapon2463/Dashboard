/* ==========================================================================
   TV mode — a full-screen, read-from-across-the-room board that rotates by
   itself. Two audiences:
     floor : the shop floor team — who is working on what at each station,
             what is stopped and why, how far each work order has got
     exec  : management — headline numbers, cost vs plan, downtime causes and
             the ranked decisions list from the overview
   Open from the 📺 button, or bookmark ?tv=floor / ?tv=exec on the TV itself.
   Data refreshes every 30 s (other devices' changes arrive through sync).
   ========================================================================== */

let tvMode = "";
let tvSlide = 0;
let tvTimer = null;
let tvTick = null;
let tvWake = null;
const TV_SLIDE_MS = 20000;
const TV_STATIONS_FALLBACK = ["CUT", "WELD", "MC", "PAINT", "ASSY", "QC"];

function tvEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function tvN(v) { return Number(v) || 0; }
function tvBaht(n) {
  n = tvN(n);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)} ล้าน฿`;
  return `${Math.round(n).toLocaleString("th-TH")} ฿`;
}
function tvCanExec() {
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  if (!u) return false;
  return ["admin", "plant", "group", "depthead"].includes(u.role) || (typeof authHasAbility === "function" && authHasAbility("reports"));
}
function tvOpenWos() { return (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).filter((w) => w.status !== "เสร็จสมบูรณ์"); }
function tvDaysLeft(w) {
  if (typeof ovDue !== "function" || typeof bxDaysBetween !== "function") return null;
  const d = ovDue(w.dueDate);
  return d && d !== "9999" ? bxDaysBetween(bxToday(), d) : null;
}
function tvDownIn(fromMs) {
  const by = {};
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => (w.jobs || []).forEach((j) => (j.downs || []).forEach((d) => {
    const a = Math.max(fromMs, Date.parse(d.from));
    const b = d.to ? Date.parse(d.to) : Date.now();
    if (b > a) by[d.reason] = (by[d.reason] || 0) + (b - a) / 60000;
  })));
  return by;
}

/* ---- enter / leave --------------------------------------------------------------- */

function tvEnter(mode) {
  if (mode === "exec" && !tvCanExec()) mode = "floor";
  tvMode = mode;
  tvSlide = 0;
  let root = document.getElementById("tvRoot");
  if (!root) { root = document.createElement("div"); root.id = "tvRoot"; document.body.appendChild(root); }
  root.hidden = false;
  document.documentElement.classList.add("tv-on");
  // keep the mode in the address so a sync reload (or a TV power cycle on a bookmark) comes back to it
  try { const u = new URL(location.href); u.searchParams.set("tv", mode); history.replaceState(null, "", u); } catch (e) { /* ignore */ }
  tvRender();
  clearInterval(tvTimer); clearInterval(tvTick);
  tvTimer = setInterval(() => { tvSlide++; tvRender(); }, TV_SLIDE_MS);
  tvTick = setInterval(() => { const c = document.getElementById("tvClock"); if (c) c.textContent = tvClock(); }, 1000);
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* needs a tap */ }
  try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { tvWake = w; }).catch(() => {}); } catch (e) { /* not supported */ }
}

function tvLeave() {
  clearInterval(tvTimer); clearInterval(tvTick);
  tvTimer = tvTick = null;
  tvMode = "";
  const root = document.getElementById("tvRoot");
  if (root) root.hidden = true;
  document.documentElement.classList.remove("tv-on");
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
  try { if (tvWake) tvWake.release(); } catch (e) { /* ignore */ }
  tvWake = null;
  try { const u = new URL(location.href); if (u.searchParams.has("tv")) { u.searchParams.delete("tv"); history.replaceState(null, "", u); } } catch (e) { /* ignore */ }
}

function tvClock() {
  const d = new Date();
  return `${d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/* ---- frame ---------------------------------------------------------------------------- */

function tvRender() {
  const root = document.getElementById("tvRoot");
  if (!root || !tvMode) return;
  const slides = tvMode === "exec" ? [["ภาพรวมวันนี้", tvExecKpi], ["ต้นทุน & เวลาหยุด", tvExecCost]] : [["สถานีงานตอนนี้", tvFloorStations], ["ความคืบหน้าใบสั่งผลิต", tvFloorOrders]];
  const i = tvSlide % slides.length;
  const co = typeof orgCurrent === "function" && orgCurrent() ? orgCurrent().name : "Y2J ONE";
  let body = "";
  try { body = slides[i][1](); } catch (e) { body = `<p class="tv-empty">แสดงหน้านี้ไม่ได้ (${tvEsc(e.message)})</p>`; }
  root.innerHTML = `
    <div class="tv-frame tv-${tvMode}">
      <header class="tv-head">
        <div class="tv-brand"><span class="tv-mark">Y2J</span><div><div class="tv-co">${tvEsc(co)}</div><div class="tv-kind">${tvMode === "exec" ? "จอผู้บริหาร" : "จอหน้างาน"} · ${tvEsc(slides[i][0])}</div></div></div>
        <div class="tv-dots">${slides.map((s, k) => `<button type="button" class="tv-dot${k === i ? " on" : ""}" data-tvslide="${k}" aria-label="${tvEsc(s[0])}"></button>`).join("")}</div>
        <div class="tv-right"><div class="tv-clock" id="tvClock">${tvClock()}</div>
          <select class="tv-switch" id="tvSwitch" aria-label="เลือกจอ"><option value="floor"${tvMode === "floor" ? " selected" : ""}>จอหน้างาน</option>${tvCanExec() ? `<option value="exec"${tvMode === "exec" ? " selected" : ""}>จอผู้บริหาร</option>` : ""}</select>
          <button type="button" class="tv-exit" id="tvExit" aria-label="ออกจากโหมดทีวี">✕</button></div>
      </header>
      <main class="tv-body">${body}</main>
      <div class="tv-progress" style="animation-duration:${TV_SLIDE_MS}ms"></div>
    </div>`;
  document.getElementById("tvExit").addEventListener("click", tvLeave);
  document.getElementById("tvSwitch").addEventListener("change", (e) => tvEnter(e.target.value));
  root.querySelectorAll("[data-tvslide]").forEach((b) => b.addEventListener("click", () => { tvSlide = +b.dataset.tvslide; clearInterval(tvTimer); tvTimer = setInterval(() => { tvSlide++; tvRender(); }, TV_SLIDE_MS); tvRender(); }));
}

/* ---- floor: stations board ------------------------------------------------------------ */

function tvFloorStations() {
  const live = [];
  const queue = {};
  tvOpenWos().forEach((w) => (w.jobs || []).forEach((j) => {
    if (j.status === "wip" || j.status === "hold") live.push({ w, j });
    else if (j.status === "open") queue[j.station] = (queue[j.station] || 0) + 1;
  }));
  const ws = typeof jcWorkstations === "function" ? jcWorkstations() : TV_STATIONS_FALLBACK.map((id) => ({ id, name: id }));
  const stations = ws.filter((s) => live.some((x) => x.j.station === s.id) || queue[s.id]);
  if (!stations.length) return `<p class="tv-empty">ยังไม่มี Job Card ที่เปิดอยู่ — สร้างได้ที่หน้าใบสั่งผลิต</p>`;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const downToday = Object.values(tvDownIn(today0.getTime())).reduce((s, v) => s + v, 0);
  const waitIssue = typeof bxReqs === "function" ? bxReqs().filter((d) => d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน").length : 0;
  const card = ({ w, j }) => {
    const mins = typeof jcMinutes === "function" ? jcMinutes(j) : 0;
    const pct = j.planMins ? Math.min(100, Math.round(mins / j.planMins * 100)) : 0;
    const down = (j.downs || []).find((d) => !d.to);
    return `<div class="tv-job tv-job-${j.status}">
      <div class="tv-job-top"><b>${tvEsc(w.wo)}</b><span>${tvEsc(w.model)} × ${tvEsc(w.qty)}</span></div>
      <div class="tv-job-op">${tvEsc(j.op)}</div>
      <div class="tv-job-who">${tvEsc(j.assignee || "ยังไม่มีคนรับ")}</div>
      ${down ? `<div class="tv-job-stop">⏸ ${tvEsc(down.reason)} · ${jcFmtMins(jcDownMins(down))}</div>` : `<div class="tv-bar"><i style="width:${pct}%"></i></div><div class="tv-job-time">${jcFmtMins(mins)}${j.planMins ? ` / ${jcFmtMins(j.planMins)}` : ""}</div>`}
    </div>`;
  };
  return `<div class="tv-strip">
      <div class="tv-chip">กำลังทำ <b>${live.filter((x) => x.j.status === "wip").length}</b></div>
      <div class="tv-chip tv-chip-bad">หยุดอยู่ <b>${live.filter((x) => x.j.status === "hold").length}</b></div>
      <div class="tv-chip">หยุดวันนี้รวม <b>${jcFmtMins(downToday)}</b></div>
      <div class="tv-chip">ใบเบิกรอคลังจ่าย <b>${waitIssue}</b></div></div>
    <div class="tv-stations" style="--cols:${Math.min(stations.length, 6)}">${stations.map((s) => {
      const here = live.filter((x) => x.j.station === s.id).sort((a, b) => (a.j.status === "hold") - (b.j.status === "hold"));
      return `<section class="tv-station"><h2><span>${tvEsc(s.id)}</span>${tvEsc(s.name)}</h2>
        ${here.map(card).join("") || `<div class="tv-idle">ว่าง</div>`}
        ${queue[s.id] ? `<div class="tv-queue">รอเริ่ม ${queue[s.id]} งาน</div>` : ""}</section>`;
    }).join("")}</div>`;
}

/* ---- floor: order progress -------------------------------------------------------------- */

function tvFloorOrders() {
  const wos = tvOpenWos().slice().sort((a, b) => (tvDaysLeft(a) ?? 999) - (tvDaysLeft(b) ?? 999)).slice(0, 8);
  if (!wos.length) return `<p class="tv-empty">ไม่มีใบสั่งผลิตที่เปิดอยู่</p>`;
  return `<div class="tv-orders">${wos.map((w) => {
    const left = tvDaysLeft(w);
    const jobs = w.jobs || [];
    const late = w.status === "ล่าช้า" || (left !== null && left < 0);
    return `<div class="tv-order${late ? " tv-late" : ""}">
      <div class="tv-order-id"><b>${tvEsc(w.wo)}</b><span>${tvEsc(w.model)} × ${tvEsc(w.qty)} · ${tvEsc(w.department || "")}</span></div>
      <div class="tv-steps">${jobs.length ? jobs.map((j) => `<span class="tv-step tv-step-${j.status}" title="${tvEsc(j.op)}">${tvEsc(j.station || j.seq)}</span>`).join("") : `<span class="tv-nosteps">ยังไม่มี Job Card · เบิกวัสดุ ${tvN(w.issuedPct)}%</span>`}</div>
      <div class="tv-order-due">${left === null ? tvEsc(w.dueDate || "") : late ? `<b>ล่าช้า ${Math.abs(left)} วัน</b>` : `ส่งใน <b>${left}</b> วัน`}<span>ผลิตเสร็จ ${tvN(w.produced)}/${tvN(w.qty)}</span></div>
    </div>`;
  }).join("")}</div>
  <div class="tv-legend"><span class="tv-step tv-step-done">เสร็จ</span><span class="tv-step tv-step-wip">กำลังทำ</span><span class="tv-step tv-step-hold">หยุด</span><span class="tv-step tv-step-open">รอเริ่ม</span></div>`;
}

/* ---- exec: headline numbers + decisions ---------------------------------------------------- */

function tvExecKpi() {
  const open = tvOpenWos();
  const late = open.filter((w) => w.status === "ล่าช้า" || (tvDaysLeft(w) ?? 1) < 0).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const fg = (typeof SX_ENTRIES !== "undefined" ? SX_ENTRIES : []).filter((e) => e.purpose === "manufacture" && e.status !== "ยกเลิก" && Date.parse(e.at) >= monthStart.getTime()).reduce((s, e) => s + tvN(e.items[0] && e.items[0].qty), 0);
  let plan = 0, act = 0;
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => (w.jobs || []).forEach((j) => { if (j.status === "done" && j.planMins) { plan += j.planMins; act += jcMinutes(j); } }));
  const eff = act ? Math.round(plan / act * 100) : null;
  const down7 = Object.values(tvDownIn(Date.now() - 7 * 86400000)).reduce((s, v) => s + v, 0);
  const tile = (label, value, note, tone) => `<div class="tv-kpi${tone ? ` tv-kpi-${tone}` : ""}"><div class="tv-kpi-l">${label}</div><div class="tv-kpi-v">${value}</div><div class="tv-kpi-n">${note}</div></div>`;
  let decide = "";
  try { decide = typeof OV_RENDER !== "undefined" ? OV_RENDER.decide() : ""; } catch (e) { decide = ""; }
  return `<div class="tv-kpis">
      ${tile("ใบสั่งผลิตที่เปิดอยู่", open.length, `ล่าช้า ${late} ใบ`, late ? "bad" : "")}
      ${tile("ผลิตเสร็จเข้าคลังเดือนนี้", `${fg} คัน`, "จากบันทึกผลิตเสร็จ (Stock Entry)")}
      ${tile("ประสิทธิภาพเวลา (แผน ÷ จริง)", eff === null ? "—" : `${eff}%`, "ขั้นตอนที่เสร็จแล้ว", eff !== null && eff < 85 ? "bad" : eff !== null && eff >= 100 ? "good" : "")}
      ${tile("เวลาหยุด 7 วัน", jcFmtMins(down7), "รวมทุกสาเหตุ", down7 > 600 ? "bad" : "")}
      ${tile("มูลค่าคงคลัง", typeof sxStockValue === "function" ? tvBaht(sxStockValue()) : "—", "ถัวเฉลี่ยเคลื่อนที่")}
    </div>
    <section class="tv-panel"><h2>สิ่งที่ต้องตัดสินใจวันนี้</h2><div class="tv-decide">${decide}</div></section>`;
}

/* ---- exec: cost sheet + downtime causes ----------------------------------------------------- */

function tvExecCost() {
  const wos = (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).filter((w) => (w.jobs || []).length).slice(0, 8);
  const down = tvDownIn(Date.now() - 30 * 86400000);
  const reasons = Object.keys(down).sort((a, b) => down[b] - down[a]).slice(0, 6);
  const max = Math.max(1, ...reasons.map((r) => down[r]));
  return `<div class="tv-split">
    <section class="tv-panel"><h2>ต้นทุนใบสั่งผลิต</h2>${wos.length ? `<table class="tv-table"><thead><tr><th>ใบสั่งผลิต</th><th>ขั้นเสร็จ</th><th class="num">ค่าดำเนินการ จริง/แผน</th><th class="num">ค่าวัสดุ</th><th class="num">ต่อคัน</th></tr></thead><tbody>
      ${wos.map((w) => { const c = jcCost(w); const done = w.jobs.filter((j) => j.status === "done").length; const over = c.planOp && c.actOp > c.planOp;
        return `<tr><td><b>${tvEsc(w.wo)}</b> <span class="tv-mut">${tvEsc(w.model)}×${tvEsc(w.qty)}</span></td><td>${done}/${w.jobs.length}</td>
          <td class="num"><span class="${over ? "tv-bad" : ""}">${tvBaht(c.actOp)}</span> <span class="tv-mut">/ ${tvBaht(c.planOp)}</span></td><td class="num">${tvBaht(c.mat)}</td><td class="num">${tvBaht(c.total / Math.max(1, tvN(w.qty)))}</td></tr>`; }).join("")}
      </tbody></table>` : `<p class="tv-empty">ยังไม่มีใบสั่งผลิตที่ใช้ Job Card</p>`}</section>
    <section class="tv-panel"><h2>สาเหตุการหยุดงาน 30 วัน</h2>${reasons.length ? `<div class="tv-bars">${reasons.map((r) => `<div class="tv-hbar"><span>${tvEsc(r)}</span><div><i style="width:${Math.round(down[r] / max * 100)}%"></i></div><b>${jcFmtMins(down[r])}</b></div>`).join("")}</div>` : `<p class="tv-empty">ไม่มีการหยุดงาน</p>`}</section>
  </div>`;
}

/* ---- wiring --------------------------------------------------------------------------------- */

function initTv() {
  const actions = document.querySelector(".topbar-actions");
  if (actions && !document.getElementById("tvBtn")) {
    const wrap = document.createElement("span");
    wrap.className = "tv-launch";
    wrap.innerHTML = `<button type="button" class="theme-toggle" id="tvBtn" title="โหมดจอทีวี" aria-label="โหมดจอทีวี">📺</button>
      <span class="tv-menu" id="tvMenu" hidden><button type="button" data-tv="floor">จอหน้างาน (ทีม / พนักงาน)</button><button type="button" data-tv="exec" id="tvExecBtn">จอผู้บริหาร</button></span>`;
    actions.insertBefore(wrap, actions.firstChild);
    const menu = wrap.querySelector("#tvMenu");
    wrap.querySelector("#tvBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.querySelector("#tvExecBtn").hidden = !tvCanExec();
      menu.hidden = !menu.hidden;
    });
    menu.querySelectorAll("[data-tv]").forEach((b) => b.addEventListener("click", () => { menu.hidden = true; tvEnter(b.dataset.tv); }));
    document.addEventListener("click", () => { menu.hidden = true; });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tvMode) tvLeave(); });
  document.addEventListener("visibilitychange", () => {
    if (tvMode && document.visibilityState === "visible" && navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { tvWake = w; }).catch(() => {});
  });
  try {
    const m = new URLSearchParams(location.search).get("tv");
    if (m === "floor" || m === "exec") tvEnter(m);
  } catch (e) { /* ignore */ }
}
