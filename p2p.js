/* ==========================================================================
   Procure-to-Pay tracker — follows each purchase from PR to payment, one
   stage at a time, recording who did each step and when. From that it
   answers: where is every job, who is holding it, how long it has waited
   against the stage target, which supplier is late, and what needs action.
   ========================================================================== */

const P2P_STORAGE_KEY = "y2j-p2p-v1";
const DAY_MS = 86400000;

let P2P_CASES = [];
let p2pFilter = { status: "open", stage: "", supplier: "", term: "" };
let p2pStepCtx = null; // { caseId, stage }

/* ---- persistence --------------------------------------------------------- */

function initP2PData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(P2P_STORAGE_KEY) || "null");
    P2P_CASES = Array.isArray(parsed) ? parsed : JSON.parse(JSON.stringify(P2P_SAMPLE_CASES));
  } catch (e) { P2P_CASES = JSON.parse(JSON.stringify(P2P_SAMPLE_CASES)); }
}

function saveP2P() {
  try { localStorage.setItem(P2P_STORAGE_KEY, JSON.stringify(P2P_CASES)); } catch (e) { showToast("บันทึกข้อมูลจัดซื้อไม่สำเร็จ", "warn"); }
}

/* ---- date helpers --------------------------------------------------------- */

function p2pToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function p2pDays(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.round((new Date(toIso + "T00:00:00") - new Date(fromIso + "T00:00:00")) / DAY_MS);
}
function p2pAddDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function p2pDate(iso) { return iso ? formatThaiDate(iso) : "—"; }

/* ---- case state -------------------------------------------------------------- */

function p2pStage(id) { return P2P_STAGES.find((s) => s.id === id); }
function p2pActive(c) { return (c.events || []).filter((e) => !e.superseded); }
function p2pEvent(c, stageId) {
  const list = p2pActive(c).filter((e) => e.stage === stageId);
  return list[list.length - 1] || null;
}
function p2pStageDone(c, stageId) {
  const e = p2pEvent(c, stageId);
  return !!e && e.result !== "fail" && e.result !== "reject";
}
function p2pCurrent(c) {
  if (c.status === "cancelled") return null;
  return P2P_STAGES.find((s) => !p2pStageDone(c, s.id)) || null;
}
// Days a step took = time since the event just before it (events are chronological), so a
// re-confirmation after a rejected delivery is measured from the rejection, not the first PO
function p2pTook(c, e) {
  const i = (c.events || []).indexOf(e);
  return i > 0 ? Math.max(0, p2pDays(c.events[i - 1].at, e.at)) : null;
}

function p2pEnteredAt(c) {
  const ev = p2pActive(c);
  return ev.length ? ev[ev.length - 1].at : null;
}
function p2pPromised(c) {
  const acks = p2pActive(c).filter((e) => e.promised);
  return acks.length ? acks[acks.length - 1].promised : (c.promised || "");
}
function p2pDeadline(c, stage) {
  if (!stage) return null;
  if (stage.id === "ship") return p2pPromised(c) || null;
  const since = p2pEnteredAt(c);
  return since ? p2pAddDays(since, stage.sla || 0) : null;
}
// ok | risk | late | done | cancelled
function p2pState(c) {
  if (c.status === "cancelled") return "cancelled";
  const st = p2pCurrent(c);
  if (!st) return "done";
  const dl = p2pDeadline(c, st);
  if (!dl) return "ok";
  const left = p2pDays(p2pToday(), dl);
  if (left < 0) return "late";
  if ((st.id === "ship" && left <= 3) || (st.sla >= 2 && left <= 1)) return "risk";
  return "ok";
}
function p2pHolder(c) {
  const st = p2pCurrent(c);
  if (!st) return "—";
  if (st.id === "ship") return `ผู้ขาย: ${c.supplier || "?"}`;
  if (st.id === "approve") return (c.value || 0) > 100000 ? "ผู้จัดการโรงงาน" : `หัวหน้า${c.requester}`;
  return st.holder;
}
function p2pWaitDays(c) {
  const since = p2pEnteredAt(c);
  return since ? p2pDays(since, p2pToday()) : 0;
}

const P2P_STATE_META = {
  ok: { label: "ตามแผน", pill: "pill-good" },
  risk: { label: "ใกล้เกินกำหนด", pill: "pill-warning" },
  late: { label: "เกินกำหนด", pill: "pill-critical" },
  done: { label: "ปิดงานแล้ว", pill: "pill-eliminate" },
  cancelled: { label: "ยกเลิก", pill: "pill-eliminate" },
};

/* ---- exceptions: what needs action ------------------------------------------ */

const P2P_ACTIONS = {
  approve: "ติดตามผู้อนุมัติ หรือส่งต่อผู้มีอำนาจแทน",
  rfq: "เร่งขอราคา / ใช้ผู้ขายตามสัญญาหากเร่งด่วน",
  po: "ออก PO วันนี้",
  ack: "โทรขอคำยืนยันวันส่งจากผู้ขายเป็นลายลักษณ์อักษร",
  ship: "Expedite ผู้ขาย และเตรียมแหล่งสำรอง — แจ้งฝ่ายวางแผนปรับลำดับงาน",
  grn: "รับของเข้าระบบวันนี้",
  iqc: "ตรวจให้เสร็จภายในวัน — ไลน์รอใช้",
  issue: "จ่ายของให้ไลน์ตามใบเบิก",
  pay: "ตรวจ 3-way match และส่งจ่าย",
};

function p2pExceptions(c) {
  const out = [];
  if (c.status === "cancelled") return out;
  const st = p2pCurrent(c);
  const today = p2pToday();
  const state = p2pState(c);
  if (st && state === "late") {
    const over = p2pDays(p2pDeadline(c, st), today);
    out.push({
      sev: st.id === "pay" ? "warning" : "critical",
      text: st.id === "ship"
        ? `ผู้ขายส่งช้ากว่านัด ${over} วัน (นัด ${p2pDate(p2pPromised(c))})`
        : `ค้างที่ "${st.label}" ${p2pWaitDays(c)} วัน — เกินเป้าหมาย ${st.sla} วัน`,
      owner: p2pHolder(c), action: P2P_ACTIONS[st.id],
    });
  }
  const promised = p2pPromised(c);
  const received = p2pStageDone(c, "grn");
  if (c.needBy && promised && !received && promised > c.needBy) {
    out.push({
      sev: "critical",
      text: `วันส่ง ${p2pDate(promised)} ช้ากว่าวันที่ต้องใช้ ${p2pDate(c.needBy)} (${p2pDays(c.needBy, promised)} วัน)${c.wo ? ` — กระทบ ${c.wo}` : ""}`,
      owner: "ฝ่ายจัดซื้อ + ฝ่ายวางแผน", action: "เจรจาเลื่อนวันส่ง / แหล่งสำรอง / ปรับแผนผลิต",
    });
  } else if (c.needBy && !received && c.needBy < today && st && ["pr", "approve", "rfq", "po", "ack", "ship"].includes(st.id)) {
    out.push({
      sev: "critical",
      text: `เลยวันที่ต้องใช้ (${p2pDate(c.needBy)}) มาแล้ว ${p2pDays(c.needBy, today)} วัน ยังไม่ได้รับของ${c.wo ? ` — ${c.wo} รออยู่` : ""}`,
      owner: p2pHolder(c), action: "เร่งทุกขั้นที่เหลือ และแจ้งผลกระทบต่อแผนผลิต",
    });
  }
  const grn = p2pEvent(c, "grn");
  if (grn && grn.qtyReceived !== undefined && grn.qtyReceived !== "" && Number(grn.qtyReceived) < Number(c.qty)) {
    out.push({ sev: "warning", text: `รับของไม่ครบ ${grn.qtyReceived}/${c.qty} ${c.unit}`, owner: "ฝ่ายจัดซื้อ", action: "แจ้งผู้ขายส่งส่วนที่ขาด / ปรับ PO" });
  }
  const sup = SUPPLIER_LIST.find((s) => s.name === c.supplier);
  if (sup && sup.status !== "Active" && st && ["rfq", "po", "ack", "ship"].includes(st.id)) {
    out.push({ sev: "warning", text: `ผู้ขายสถานะ ${sup.status}`, owner: "ฝ่ายจัดซื้อ", action: "ทบทวนการใช้ผู้ขายรายนี้" });
  }
  (c.issues || []).filter((i) => !i.resolved).forEach((i) => {
    out.push({ sev: i.type === "คุณภาพไม่ผ่าน" || i.type === "ส่งช้า" ? "critical" : "warning", text: `${i.type}: ${i.note}`, owner: i.by || "—", action: "ติดตามจนปิดประเด็น", manual: true });
  });
  return out;
}

// Stage timing can be "on plan" while the case still has an urgent problem (e.g. the
// confirmed delivery misses the need-by date) — show that instead of a reassuring label
function p2pDisplay(c) {
  const state = p2pState(c);
  if ((state === "ok" || state === "risk") && p2pExceptions(c).some((x) => x.sev === "critical")) {
    return { label: "มีประเด็นเร่งด่วน", pill: "pill-critical", tone: "critical" };
  }
  const m = P2P_STATE_META[state];
  return { label: m.label, pill: m.pill, tone: state === "late" ? "critical" : state === "risk" ? "warning" : state === "ok" ? "info" : "neutral" };
}

function p2pAllExceptions() {
  const all = [];
  P2P_CASES.forEach((c) => p2pExceptions(c).forEach((x) => all.push(Object.assign({ c }, x))));
  return all.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "critical" ? -1 : 1));
}

/* ---- analytics ---------------------------------------------------------------- */

function p2pStageStats() {
  return P2P_STAGES.map((st, idx) => {
    const durations = [];
    P2P_CASES.forEach((c) => {
      if (idx === 0) return;
      (c.events || []).filter((e) => e.stage === st.id).forEach((e) => {
        const d = p2pTook(c, e);
        if (d !== null) durations.push(d);
      });
    });
    const open = P2P_CASES.filter((c) => { const cur = p2pCurrent(c); return cur && cur.id === st.id; });
    return {
      st,
      avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      done: durations.length,
      now: open.length,
      late: open.filter((c) => p2pState(c) === "late").length,
    };
  });
}

function p2pHolderStats() {
  const map = new Map();
  P2P_CASES.forEach((c) => {
    const st = p2pCurrent(c);
    if (!st || c.status === "cancelled") return;
    const h = p2pHolder(c);
    const row = map.get(h) || { holder: h, count: 0, late: 0, oldest: 0, cases: [] };
    row.count++;
    if (p2pState(c) === "late") row.late++;
    row.oldest = Math.max(row.oldest, p2pWaitDays(c));
    row.cases.push(c.pr);
    map.set(h, row);
  });
  return [...map.values()].sort((a, b) => b.late - a.late || b.oldest - a.oldest);
}

function p2pSupplierStats() {
  const map = new Map();
  const today = p2pToday();
  P2P_CASES.forEach((c) => {
    if (!c.supplier) return;
    const row = map.get(c.supplier) || { name: c.supplier, pos: 0, deliveries: 0, onTime: 0, lateDays: 0, iqc: 0, iqcFail: 0, openLate: 0 };
    if (c.po) row.pos++;
    // every delivery, including ones later rejected, counts for on-time performance
    let promisedAt = c.promised || "";
    (c.events || []).forEach((e) => {
      if (e.promised) promisedAt = e.promised;
      if (e.stage === "grn") {
        row.deliveries++;
        const d = promisedAt ? p2pDays(promisedAt, e.at) : 0;
        if (d <= 0) row.onTime++; else row.lateDays += d;
      }
      if (e.stage === "iqc") { row.iqc++; if (e.result === "fail") row.iqcFail++; }
    });
    const cur = p2pCurrent(c);
    if (cur && cur.id === "ship" && p2pPromised(c) && p2pPromised(c) < today) row.openLate++;
    map.set(c.supplier, row);
  });
  return [...map.values()].sort((a, b) => (b.openLate + b.iqcFail) - (a.openLate + a.iqcFail));
}

/* ---- rendering -------------------------------------------------------------- */

function p2pStepper(c) {
  const cur = p2pCurrent(c);
  const state = p2pState(c);
  return `<span class="p2p-stepper" aria-label="ขั้นตอน">${P2P_STAGES.map((s) => {
    let cls = "";
    if (c.status === "cancelled") cls = "cancel";
    else if (p2pStageDone(c, s.id)) cls = "done";
    else if (cur && cur.id === s.id) cls = `cur ${state}`;
    return `<span class="p2p-dot ${cls}" title="${escapeHtml(s.label)}"></span>`;
  }).join("")}</span>`;
}

function renderP2P() {
  const today = p2pToday();
  const open = P2P_CASES.filter((c) => c.status !== "cancelled" && p2pCurrent(c));
  const late = open.filter((c) => p2pState(c) === "late");
  const sup = p2pSupplierStats();
  // deliveries still outstanding past the promised date count as late, not as "not yet measured"
  const deliveries = sup.reduce((s, r) => s + r.deliveries + r.openLate, 0);
  const onTime = sup.reduce((s, r) => s + r.onTime, 0);
  const cycle = P2P_CASES.map((c) => { const a = p2pEvent(c, "pr"), b = p2pEvent(c, "grn"); return a && b ? p2pDays(a.at, b.at) : null; }).filter((x) => x !== null);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("p2pStatOpen", open.length);
  set("p2pStatLate", late.length);
  set("p2pStatOnTime", deliveries ? `${Math.round((onTime / deliveries) * 100)}%` : "—");
  set("p2pStatCycle", cycle.length ? `${(cycle.reduce((a, b) => a + b, 0) / cycle.length).toFixed(1)} วัน` : "—");

  // Issues that need action
  const ex = p2pAllExceptions();
  document.getElementById("p2pIssueCount").textContent = ex.length;
  document.getElementById("p2pIssues").innerHTML = ex.length ? ex.map((x) => `
    <div class="p2p-issue p2p-issue-${x.sev}">
      <div class="p2p-issue-main">
        <span class="p2p-issue-sev">${x.sev === "critical" ? "● ด่วน" : "● ติดตาม"}</span>
        <button type="button" class="link-btn" data-case="${escapeHtml(x.c.id)}">${escapeHtml(x.c.pr)}</button>
        <span class="p2p-issue-item">${escapeHtml(x.c.item)}</span>
      </div>
      <div class="p2p-issue-text">${escapeHtml(x.text)}</div>
      <div class="p2p-issue-meta">ผู้รับผิดชอบ: <strong>${escapeHtml(x.owner)}</strong> · ควรทำ: ${escapeHtml(x.action)}</div>
    </div>`).join("") : '<p class="muted-note">ไม่มีประเด็นค้าง</p>';

  // Bottleneck by stage
  const stats = p2pStageStats();
  const maxAvg = Math.max(1, ...stats.map((s) => Math.max(s.avg || 0, s.st.sla || 0)));
  document.querySelector("#p2pStageTable tbody").innerHTML = stats.filter((s) => s.st.id !== "pr").map((s) => {
    const over = s.avg !== null && s.st.sla !== null && s.avg > s.st.sla;
    return `<tr>
      <td>${escapeHtml(s.st.label)}<div class="pilot-kpi-method">${escapeHtml(s.st.holder)}</div></td>
      <td class="p2p-bar-cell">
        <div class="p2p-bar-track">
          ${s.avg !== null ? `<span class="p2p-bar${over ? " over" : ""}" style="width:${Math.min(100, (s.avg / maxAvg) * 100)}%"></span>` : ""}
          ${s.st.sla !== null ? `<span class="p2p-sla" style="left:${Math.min(100, (s.st.sla / maxAvg) * 100)}%" title="เป้าหมาย ${s.st.sla} วัน"></span>` : ""}
        </div>
      </td>
      <td class="num">${s.avg === null ? "—" : s.avg.toFixed(1)}${over ? ' <span class="p2p-over">เกิน</span>' : ""}</td>
      <td class="num">${s.st.sla === null ? "ตามนัด" : s.st.sla}</td>
      <td class="num">${s.now}</td>
      <td class="num">${s.late ? `<strong class="p2p-late-num">${s.late}</strong>` : "0"}</td>
    </tr>`;
  }).join("");

  // Who is holding work
  document.querySelector("#p2pHolderTable tbody").innerHTML = p2pHolderStats().map((h) => `<tr>
    <td>${escapeHtml(h.holder)}</td>
    <td class="num">${h.count}</td>
    <td class="num">${h.late ? `<strong class="p2p-late-num">${h.late}</strong>` : "0"}</td>
    <td class="num">${h.oldest} วัน</td>
    <td class="p2p-case-list">${h.cases.map((n) => escapeHtml(n)).join(", ")}</td>
  </tr>`).join("");

  // Supplier scorecard
  document.querySelector("#p2pSupplierTable tbody").innerHTML = sup.map((r) => {
    const base = r.deliveries + r.openLate;
    const ot = base ? Math.round((r.onTime / base) * 100) : null;
    return `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.pos}</td>
      <td class="num">${r.deliveries}</td>
      <td class="num">${ot === null ? "—" : `<span class="${ot < 80 ? "p2p-late-num" : ""}">${ot}%</span>`}</td>
      <td class="num">${r.deliveries - r.onTime ? (r.lateDays / Math.max(1, r.deliveries - r.onTime)).toFixed(1) : "0"}</td>
      <td class="num">${r.iqc ? `${r.iqcFail}/${r.iqc}` : "—"}</td>
      <td class="num">${r.openLate ? `<strong class="p2p-late-num">${r.openLate}</strong>` : "0"}</td>
    </tr>`;
  }).join("");

  renderP2PCaseTable();
  document.querySelectorAll("#view-p2p [data-case]").forEach((b) => b.addEventListener("click", () => openP2PCase(b.dataset.case)));
}

function renderP2PCaseTable() {
  const supSel = document.getElementById("p2pSupplierFilter");
  const suppliers = [...new Set(P2P_CASES.map((c) => c.supplier).filter(Boolean))].sort();
  const prevSup = supSel.value;
  supSel.innerHTML = `<option value="">ทุกผู้ขาย</option>` + suppliers.map((s) => `<option${s === prevSup ? " selected" : ""}>${escapeHtml(s)}</option>`).join("");
  const stSel = document.getElementById("p2pStageFilter");
  if (!stSel.options.length) stSel.innerHTML = `<option value="">ทุกขั้นตอน</option>` + P2P_STAGES.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("");

  const f = p2pFilter;
  const rows = P2P_CASES.filter((c) => {
    const state = p2pState(c);
    if (f.status === "open" && (state === "done" || state === "cancelled")) return false;
    if (f.status === "late" && state !== "late") return false;
    if (f.status === "closed" && state !== "done" && state !== "cancelled") return false;
    const cur = p2pCurrent(c);
    if (f.stage && (!cur || cur.id !== f.stage)) return false;
    if (f.supplier && c.supplier !== f.supplier) return false;
    if (f.term && !`${c.pr} ${c.po} ${c.item} ${c.supplier} ${c.requester} ${c.wo}`.toLowerCase().includes(f.term)) return false;
    return true;
  }).sort((a, b) => {
    const rank = { late: 0, risk: 1, ok: 2, done: 3, cancelled: 4 };
    return rank[p2pState(a)] - rank[p2pState(b)] || p2pWaitDays(b) - p2pWaitDays(a);
  });

  document.querySelector("#p2pCaseTable tbody").innerHTML = rows.map((c) => {
    const cur = p2pCurrent(c);
    const meta = p2pDisplay(c);
    return `<tr>
      <td><button type="button" class="link-btn mono-cell" data-case="${escapeHtml(c.id)}">${escapeHtml(c.pr)}</button>${c.po ? `<div class="pilot-kpi-method">${escapeHtml(c.po)}</div>` : ""}</td>
      <td class="dept-title-cell">${escapeHtml(c.item)}<div class="pilot-kpi-method">${escapeHtml(c.qty)} ${escapeHtml(c.unit)}${c.wo ? ` · ${escapeHtml(c.wo)}` : ""}</div></td>
      <td>${escapeHtml(c.requester)}</td>
      <td>${escapeHtml(c.supplier || "—")}</td>
      <td>${p2pStepper(c)}<div class="pilot-kpi-method">${cur ? escapeHtml(cur.label) : meta.label}</div></td>
      <td>${escapeHtml(cur ? p2pHolder(c) : "—")}</td>
      <td class="num">${cur ? `${p2pWaitDays(c)} วัน` : "—"}</td>
      <td>${cur ? p2pDate(p2pDeadline(c, cur)) : "—"}</td>
      <td>${p2pDate(c.needBy)}</td>
      <td><span class="pill ${meta.pill}">${meta.label}</span></td>
    </tr>`;
  }).join("");
  document.getElementById("p2pCaseEmpty").hidden = rows.length > 0;
  document.querySelectorAll("#p2pCaseTable [data-case]").forEach((b) => b.addEventListener("click", () => openP2PCase(b.dataset.case)));
}

/* ---- permissions ------------------------------------------------------------ */

function p2pCanRecord(stage) {
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  if (!u) return ["depthead", "plant"].includes(currentRole());
  if (u.role === "admin" || u.role === "plant") return true;
  if (stage.who === "any") return u.role !== "group";
  if (stage.who === "approver") return u.role === "depthead" && stage.id === "approve";
  return u.dept === stage.who;
}

function p2pUserName() {
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  return u ? u.name : (typeof getMyName === "function" && getMyName()) || "ผู้ใช้";
}

/* ---- case sheet (printable) ------------------------------------------------ */

function openP2PCase(id) {
  const c = P2P_CASES.find((x) => x.id === id);
  if (!c) return;
  const cur = p2pCurrent(c);
  const state = p2pState(c);
  const meta = P2P_STATE_META[state];
  const ex = p2pExceptions(c);

  const rows = P2P_STAGES.map((s) => {
    const e = p2pEvent(c, s.id);
    let status, cls;
    if (c.status === "cancelled" && !e) { status = "—"; cls = ""; }
    else if (e && e.result === "reject") { status = "ไม่อนุมัติ"; cls = "late"; }
    else if (e) { status = "เสร็จ"; cls = "done"; }
    else if (cur && cur.id === s.id) { status = `กำลังรอ (${p2pWaitDays(c)} วัน)`; cls = state; }
    else { status = "รอดำเนินการ"; cls = ""; }
    const took = e ? p2pTook(c, e) : null;
    const over = took !== null && s.sla !== null && took > s.sla;
    const extra = e ? [e.ref, e.ncr, e.promised ? `นัดส่ง ${p2pDate(e.promised)}` : "", e.qtyReceived !== undefined ? `รับ ${e.qtyReceived} ${c.unit}` : "", e.result === "pass" ? "ผ่าน" : e.result === "fail" ? "ไม่ผ่าน" : ""].filter(Boolean).join(" · ") : "";
    return `<tr class="p2p-tl-${cls}">
      <td><strong>${escapeHtml(s.label)}</strong></td>
      <td>${escapeHtml(status)}</td>
      <td>${e ? escapeHtml(e.by) : `<span class="paper-empty">${escapeHtml(s.id === "ship" ? `ผู้ขาย: ${c.supplier || "?"}` : s.holder)}</span>`}</td>
      <td>${e ? p2pDate(e.at) : (cur && cur.id === s.id ? `กำหนด ${p2pDate(p2pDeadline(c, s))}` : "")}</td>
      <td class="num">${took === null ? "" : `${took}${s.sla !== null ? ` / ${s.sla}` : ""}${over ? " ⚠" : ""}`}</td>
      <td>${escapeHtml([extra, e ? e.note : ""].filter(Boolean).join(" — "))}</td>
    </tr>`;
  }).join("");
  const superseded = (c.events || []).filter((e) => e.superseded);

  const html = `
    ${paperHeader("ใบติดตามการจัดซื้อ", "Procure-to-Pay Tracking Sheet", "ฝ่ายจัดซื้อ", c.pr, p2pEvent(c, "pr") ? p2pEvent(c, "pr").at : "", p2pDisplay(c).label, p2pDisplay(c).tone)}
    <div class="paper-grid">
      <div class="paper-row"><div class="paper-label">รายการ</div><div class="paper-value">${escapeHtml(c.item)}</div></div>
      <div class="paper-row"><div class="paper-label">จำนวน</div><div class="paper-value">${escapeHtml(c.qty)} ${escapeHtml(c.unit)}</div></div>
      <div class="paper-row"><div class="paper-label">ผู้ขอ / แผนก</div><div class="paper-value">${escapeHtml(c.requester)}</div></div>
      <div class="paper-row"><div class="paper-label">ใช้กับงาน</div><div class="paper-value">${escapeHtml(c.wo || "—")}</div></div>
      <div class="paper-row"><div class="paper-label">ผู้ขาย</div><div class="paper-value">${escapeHtml(c.supplier || "—")}</div></div>
      <div class="paper-row"><div class="paper-label">เลขที่ PO / มูลค่า</div><div class="paper-value">${escapeHtml(c.po || "—")}${c.value ? ` · ${Number(c.value).toLocaleString("th-TH")} บาท` : ""}</div></div>
      <div class="paper-row"><div class="paper-label">วันที่ต้องใช้</div><div class="paper-value">${p2pDate(c.needBy)}</div></div>
      <div class="paper-row"><div class="paper-label">ผู้ขายนัดส่ง</div><div class="paper-value">${p2pDate(p2pPromised(c))}</div></div>
      <div class="paper-row paper-row-wide"><div class="paper-label">ตอนนี้อยู่ที่</div><div class="paper-value"><strong>${cur ? `${escapeHtml(cur.label)} — ${escapeHtml(p2pHolder(c))}` : meta.label}</strong>${cur ? ` · รอมาแล้ว ${p2pWaitDays(c)} วัน · กำหนด ${p2pDate(p2pDeadline(c, cur))}` : ""}</div></div>
    </div>
    ${ex.length ? `<div class="paper-section-title">ประเด็นที่ต้องจัดการ</div><div class="paper-textbox">${ex.map((x) => `<div class="p2p-sheet-issue ${x.sev}">● ${escapeHtml(x.text)}<br><span>ผู้รับผิดชอบ: ${escapeHtml(x.owner)} · ควรทำ: ${escapeHtml(x.action)}</span></div>`).join("")}</div>` : ""}
    <div class="paper-section-title">ลำดับขั้นตอน — ใครทำ เมื่อไร ใช้เวลากี่วัน (จริง / เป้าหมาย)</div>
    <table class="paper-table paper-table-compact">
      <thead><tr><th>ขั้นตอน</th><th>สถานะ</th><th>ผู้ดำเนินการ</th><th>วันที่</th><th class="num">วัน</th><th>รายละเอียด / เอกสาร</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${superseded.length ? `<div class="paper-section-title">ประวัติรอบก่อน (ถูกแทนที่)</div><div class="paper-textbox">${superseded.map((e) => `${p2pDate(e.at)} · ${escapeHtml(p2pStage(e.stage).label)} · ${escapeHtml(e.by)}${e.result === "fail" ? " · ไม่ผ่าน" : ""}${e.note ? ` — ${escapeHtml(e.note)}` : ""}`).join("<br>")}</div>` : ""}
    ${(c.issues || []).length ? `<div class="paper-section-title">บันทึกปัญหา</div><div class="paper-textbox">${c.issues.map((i, n) => `${p2pDate(i.at)} · <strong>${escapeHtml(i.type)}</strong> — ${escapeHtml(i.note)} (${escapeHtml(i.by)}) ${i.resolved ? `<span class="pill pill-good">ปิดแล้ว ${p2pDate(i.resolvedAt)}</span>` : `<button type="button" class="rel-chip" data-resolve="${n}">ปิดประเด็น</button>`}`).join("<br>")}</div>` : ""}
    ${paperSignatures([p2pEvent(c, "pr") ? p2pEvent(c, "pr").by : "", "", ""])}
    ${paperFooter("FM-P2P-01 Rev.0")}
  `;

  const actions = [];
  if (cur && c.status !== "cancelled") {
    if (p2pCanRecord(cur)) actions.push({ label: `✔ บันทึก: ${cur.label}`, primary: true, onClick: () => openP2PStep(c.id, cur.id) });
  }
  if (cur) actions.push({ label: "⚠ แจ้งปัญหา", onClick: () => openP2PIssue(c.id) });
  docViewFileName = `${c.pr}-tracking`;
  showPaper(html, paperOutputActions().concat(actions, [{ label: "ปิด", onClick: () => closeDocView() }]));
  docViewCurrent = { kind: "p2p", id: c.id };
  document.querySelectorAll("#docPaper [data-resolve]").forEach((b) => b.addEventListener("click", () => {
    const iss = c.issues[Number(b.dataset.resolve)];
    iss.resolved = true;
    iss.resolvedAt = p2pToday();
    iss.resolvedBy = p2pUserName();
    saveP2P();
    if (typeof auditLog === "function") auditLog("ปิดประเด็นจัดซื้อ", c.pr, `${iss.type}: ${iss.note}`);
    openP2PCase(c.id);
    renderP2P();
  }));
}

/* ---- record a stage ---------------------------------------------------------- */

function p2pNextNumber(prefix, list) {
  let max = 0;
  list.forEach((n) => { const m = String(n || "").match(new RegExp(`^${prefix}-2026-(\\d+)$`)); if (m) max = Math.max(max, Number(m[1])); });
  return `${prefix}-2026-${String(max + 1).padStart(4, "0")}`;
}

function openP2PStep(caseId, stageId) {
  const c = P2P_CASES.find((x) => x.id === caseId);
  const st = p2pStage(stageId);
  p2pStepCtx = { caseId, stage: stageId };
  document.getElementById("p2pStepTitle").textContent = `${st.label} — ${c.pr}`;
  document.getElementById("p2pStepControl").textContent = `จุดควบคุม: ${st.control}`;
  const f = [];
  const field = (id, label, input) => f.push(`<div class="form-field"><label for="${id}">${label}</label>${input}</div>`);
  field("p2pStepDate", "วันที่ดำเนินการ", `<input type="date" id="p2pStepDate" value="${p2pToday()}">`);
  if (st.id === "approve") field("p2pStepResult", "ผลการพิจารณา", `<select id="p2pStepResult"><option value="approve">อนุมัติ</option><option value="reject">ไม่อนุมัติ</option></select>`);
  if (st.id === "rfq") {
    field("p2pStepSupplier", "ผู้ขายที่เลือก *", `<select id="p2pStepSupplier"><option value="">— เลือก —</option>${SUPPLIER_LIST.filter((s) => s.status !== "เลิกใช้" || s.name === c.supplier).map((s) => `<option value="${escapeHtml(s.name)}"${s.name === c.supplier ? " selected" : ""}>${escapeHtml(s.name)}${s.status === "On Hold" ? " (พักการสั่งซื้อ)" : ""}</option>`).join("")}</select>`);
    field("p2pStepValue", "มูลค่าที่ตกลง (บาท)", `<input type="number" id="p2pStepValue" value="${escapeHtml(c.value || "")}">`);
    field("p2pStepRef", "อ้างอิง RFQ (ถ้ามี)", `<input id="p2pStepRef" placeholder="เช่น RFQ-2026-004">`);
  }
  if (st.id === "po") {
    field("p2pStepRef", "เลขที่ PO *", `<input id="p2pStepRef" value="${escapeHtml(c.po || p2pNextNumber("PO", PO_LIST.map((p) => p.id).concat(P2P_CASES.map((x) => x.po))))}">`);
    field("p2pStepValue", "มูลค่า PO (บาท)", `<input type="number" id="p2pStepValue" value="${escapeHtml(c.value || "")}">`);
  }
  if (st.id === "ack") field("p2pStepPromised", "วันที่ผู้ขายยืนยันจะส่ง *", `<input type="date" id="p2pStepPromised" value="${escapeHtml(p2pPromised(c))}">`);
  if (st.id === "grn") {
    field("p2pStepQty", `จำนวนที่รับจริง (${escapeHtml(c.unit)}) *`, `<input type="number" id="p2pStepQty" value="${escapeHtml(c.qty)}">`);
    field("p2pStepRef", "เลขที่ใบรับของ (GRN)", `<input id="p2pStepRef" placeholder="เช่น GRN-2026-004">`);
  }
  if (st.id === "iqc") {
    field("p2pStepResult", "ผลตรวจ", `<select id="p2pStepResult"><option value="pass">ผ่าน</option><option value="fail">ไม่ผ่าน — ส่งคืน / รอของทดแทน</option></select>`);
    field("p2pStepRef", "เลขที่ IQC / NCR", `<input id="p2pStepRef" placeholder="เช่น IQC-2026-004">`);
  }
  if (st.id === "pay") field("p2pStepRef", "เลขที่ใบแจ้งหนี้", `<input id="p2pStepRef">`);
  field("p2pStepNote", "หมายเหตุ", `<input id="p2pStepNote">`);
  document.getElementById("p2pStepFields").innerHTML = f.join("");
  document.getElementById("p2pStepBackdrop").classList.add("open");
}

function saveP2PStep() {
  const { caseId, stage } = p2pStepCtx;
  const c = P2P_CASES.find((x) => x.id === caseId);
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const ev = { stage, at: val("p2pStepDate") || p2pToday(), by: p2pUserName(), note: val("p2pStepNote") };
  let auditDetail = p2pStage(stage).label;

  if (stage === "approve") {
    ev.result = val("p2pStepResult");
    if (ev.result === "reject") { c.status = "cancelled"; auditDetail = "ไม่อนุมัติ PR"; }
    const pr = PR_LIST.find((p) => p.id === c.pr);
    if (pr) pr.status = ev.result === "reject" ? "ปฏิเสธ" : "อนุมัติแล้ว";
  }
  if (stage === "rfq") {
    const sup = val("p2pStepSupplier");
    if (!sup) { document.getElementById("p2pStepSupplier").focus(); return; }
    c.supplier = sup;
    if (val("p2pStepValue")) c.value = Number(val("p2pStepValue"));
    if (val("p2pStepRef")) ev.ref = val("p2pStepRef");
    auditDetail = `เลือกผู้ขาย ${sup}`;
  }
  if (stage === "po") {
    const po = val("p2pStepRef");
    if (!po) { document.getElementById("p2pStepRef").focus(); return; }
    c.po = po;
    if (val("p2pStepValue")) c.value = Number(val("p2pStepValue"));
    ev.ref = po;
    if (!PO_LIST.some((p) => p.id === po)) {
      PO_LIST.push({ id: po, supplier: c.supplier, item: c.item, value: Number(c.value) || 0, orderDate: formatThaiDate(ev.at), dueDate: c.needBy ? formatThaiDate(c.needBy) : "-", status: "รอส่งมอบ" });
    }
    auditDetail = `ออก ${po} ให้ ${c.supplier}`;
  }
  if (stage === "ack") {
    const d = val("p2pStepPromised");
    if (!d) { document.getElementById("p2pStepPromised").focus(); return; }
    ev.promised = d;
    c.promised = d;
    auditDetail = `ผู้ขายยืนยันส่ง ${p2pDate(d)}`;
  }
  if (stage === "grn") {
    ev.qtyReceived = Number(val("p2pStepQty"));
    if (val("p2pStepRef")) ev.ref = val("p2pStepRef");
    const po = PO_LIST.find((p) => p.id === c.po);
    if (po) po.status = "ส่งมอบแล้ว";
    auditDetail = `รับของ ${ev.qtyReceived}/${c.qty} ${c.unit}`;
    if (typeof bxReceiveFromP2P === "function") auditDetail += bxReceiveFromP2P(c, ev);
  }
  if (stage === "iqc") {
    ev.result = val("p2pStepResult");
    if (val("p2pStepRef")) ev.ref = val("p2pStepRef");
    auditDetail = ev.result === "fail" ? "IQC ไม่ผ่าน — รอของทดแทน" : "IQC ผ่าน";
  }
  if (stage === "pay" && val("p2pStepRef")) ev.ref = val("p2pStepRef");

  c.events.push(ev);
  if (stage === "iqc" && ev.result === "fail") {
    // the delivery is rejected: keep its history but reopen shipping for the replacement
    c.events.forEach((e) => {
      if (e.stage === "grn" && !e.superseded && typeof bxReverseFromP2P === "function") auditDetail += bxReverseFromP2P(c, e);
      if (["ship", "grn", "iqc"].includes(e.stage)) e.superseded = true;
    });
    c.issues = c.issues || [];
    c.issues.push({ type: "คุณภาพไม่ผ่าน", note: `ตรวจรับไม่ผ่าน${ev.ref ? ` (${ev.ref})` : ""} — ${ev.note || "รอของทดแทน"}`, at: ev.at, by: ev.by, resolved: false });
  }
  saveP2P();
  if (typeof saveProcurement === "function") saveProcurement();
  if (typeof auditLog === "function") auditLog("บันทึกขั้นตอนจัดซื้อ", c.pr, auditDetail + (ev.note ? ` · ${ev.note}` : ""));
  document.getElementById("p2pStepBackdrop").classList.remove("open");
  renderP2P();
  if (typeof renderProcurement === "function") renderProcurement();
  if (typeof renderAlerts === "function") renderAlerts();
  openP2PCase(c.id);
  showToast(`${c.pr}: ${auditDetail}`, "good");
}

/* ---- issues & new PR ---------------------------------------------------------- */

function openP2PIssue(caseId) {
  p2pStepCtx = { caseId, stage: "__issue" };
  document.getElementById("p2pIssueType").innerHTML = P2P_ISSUE_TYPES.map((t) => `<option>${escapeHtml(t)}</option>`).join("");
  document.getElementById("p2pIssueNote").value = "";
  document.getElementById("p2pIssueBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("p2pIssueNote").focus(), 0);
}

function saveP2PIssue() {
  const c = P2P_CASES.find((x) => x.id === p2pStepCtx.caseId);
  const note = document.getElementById("p2pIssueNote").value.trim();
  if (!note) { document.getElementById("p2pIssueNote").focus(); return; }
  const type = document.getElementById("p2pIssueType").value;
  c.issues = c.issues || [];
  c.issues.push({ type, note, at: p2pToday(), by: p2pUserName(), resolved: false });
  saveP2P();
  if (typeof auditLog === "function") auditLog("แจ้งปัญหาจัดซื้อ", c.pr, `${type}: ${note}`);
  document.getElementById("p2pIssueBackdrop").classList.remove("open");
  renderP2P();
  openP2PCase(c.id);
}

function openP2PNew() {
  ["p2pNewItem", "p2pNewQty", "p2pNewWo", "p2pNewValue", "p2pNewNote"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("p2pNewUnit").value = "ชิ้น";
  document.getElementById("p2pNewNeed").value = p2pAddDays(p2pToday(), 14);
  document.getElementById("p2pNewBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("p2pNewItem").focus(), 0);
}

function saveP2PNew() {
  const item = document.getElementById("p2pNewItem").value.trim();
  const qty = Number(document.getElementById("p2pNewQty").value);
  if (!item) { document.getElementById("p2pNewItem").focus(); return; }
  if (!(qty > 0)) { document.getElementById("p2pNewQty").focus(); return; }
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  const requester = u ? (u.dept ? authDeptName(u.dept) : u.name) : "ผู้ใช้";
  const pr = p2pNextNumber("PR", PR_LIST.map((p) => p.id).concat(P2P_CASES.map((c) => c.pr)));
  const id = `P2P-2026-${String(P2P_CASES.length + 1).padStart(3, "0")}`;
  const c = {
    id, pr, item, qty, unit: document.getElementById("p2pNewUnit").value.trim() || "ชิ้น",
    requester, needBy: document.getElementById("p2pNewNeed").value, wo: document.getElementById("p2pNewWo").value.trim(),
    supplier: "", po: "", value: Number(document.getElementById("p2pNewValue").value) || 0, promised: "", status: "open",
    events: [{ stage: "pr", at: p2pToday(), by: p2pUserName(), note: document.getElementById("p2pNewNote").value.trim() }],
    issues: [],
  };
  P2P_CASES.push(c);
  PR_LIST.push({ id: pr, item: `${item} x${qty}`, requester, date: formatThaiDate(p2pToday()), status: "รออนุมัติ" });
  saveP2P();
  if (typeof saveProcurement === "function") saveProcurement();
  if (typeof auditLog === "function") auditLog("เปิดคำขอซื้อ", pr, `${item} ${qty} ${c.unit} · ต้องใช้ ${p2pDate(c.needBy)}`);
  document.getElementById("p2pNewBackdrop").classList.remove("open");
  renderP2P();
  if (typeof renderProcurement === "function") renderProcurement();
  showToast(`เปิด ${pr} แล้ว — รออนุมัติ`, "good");
}

/* ---- SOP sheet ------------------------------------------------------------------ */

function openP2PSop() {
  const html = `
    ${paperHeader("ขั้นตอนการจัดซื้อมาตรฐาน", "Procure-to-Pay SOP", "ฝ่ายจัดซื้อ", "SOP-PUR-01", p2pToday(), "ฉบับใช้งาน", "good")}
    <p>ทุกคำขอซื้อเดินตามขั้นตอนเดียวกัน แต่ละขั้นมีผู้รับผิดชอบและเวลาเป้าหมายชัดเจน ระบบบันทึกว่าใครทำเมื่อไร เพื่อให้เห็นทันทีว่างานค้างที่ใคร ช้าเพราะอะไร</p>
    <table class="paper-table">
      <thead><tr><th>#</th><th>ขั้นตอน</th><th>ผู้รับผิดชอบ</th><th class="num">เป้าหมาย (วัน)</th><th>จุดควบคุม / สิ่งที่ต้องตรวจ</th></tr></thead>
      <tbody>${P2P_STAGES.map((s, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(s.label)}</strong></td><td>${escapeHtml(s.holder)}</td><td class="num">${s.sla === null ? "ตามวันที่ผู้ขายยืนยัน" : s.sla}</td><td>${escapeHtml(s.control)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="paper-section-title">ตัวชี้วัดที่ติดตาม</div>
    <div class="paper-textbox">
      • รอบเวลา PR → รับของ (วัน) · • ส่งตรงเวลา (On-time delivery) % ต่อผู้ขาย · • อัตราตรวจรับไม่ผ่าน (IQC reject) ต่อผู้ขาย<br>
      • จำนวนงานเกินกำหนดแยกตามขั้นตอนและผู้ถืองาน · • คำขอที่วันส่งช้ากว่าวันที่ต้องใช้ (กระทบแผนผลิต)
    </div>
    <div class="paper-section-title">กฎการยกระดับ (Escalation)</div>
    <div class="paper-textbox">
      • เกินเป้าหมายของขั้นตอน → ระบบขึ้นในรายการ "ประเด็นที่ต้องจัดการ" พร้อมชื่อผู้ถืองาน<br>
      • ผู้ขายส่งช้า หรือวันส่งช้ากว่าวันที่ต้องใช้ → จัดซื้อแจ้งฝ่ายวางแผนภายในวันเดียวกัน<br>
      • IQC ไม่ผ่าน → เปิด NCR ส่งคืน และระบบนับรอบส่งใหม่ในผลงานผู้ขาย<br>
      • ผู้ขายส่งตรงเวลาต่ำกว่า 80% หรือ IQC ไม่ผ่านซ้ำ → ทบทวนในการประเมินผู้ขาย (SE)
    </div>
    ${paperSignatures(["ผู้จัดการฝ่ายจัดซื้อ", "", "ผู้จัดการโรงงาน"])}
    ${paperFooter("SOP-PUR-01 Rev.0")}
  `;
  docViewFileName = "SOP-PUR-01-procure-to-pay";
  showPaper(html, paperOutputActions().concat([{ label: "ปิด", onClick: () => closeDocView() }]));
}

/* ---- wiring --------------------------------------------------------------------- */

function initP2P() {
  initP2PData();
  document.getElementById("p2pNewBtn").addEventListener("click", openP2PNew);
  document.getElementById("p2pSopBtn").addEventListener("click", openP2PSop);
  const bind = (id, key, ev) => document.getElementById(id).addEventListener(ev || "change", (e) => { p2pFilter[key] = key === "term" ? e.target.value.trim().toLowerCase() : e.target.value; renderP2PCaseTable(); });
  bind("p2pStatusFilter", "status");
  bind("p2pStageFilter", "stage");
  bind("p2pSupplierFilter", "supplier");
  bind("p2pSearch", "term", "input");
  [["p2pStepBackdrop", "p2pStepCancel", "p2pStepSave", saveP2PStep], ["p2pIssueBackdrop", "p2pIssueCancel", "p2pIssueSave", saveP2PIssue], ["p2pNewBackdrop", "p2pNewCancel", "p2pNewSave", saveP2PNew]].forEach(([bd, cancel, save, fn]) => {
    const el = document.getElementById(bd);
    el.addEventListener("click", (e) => { if (e.target === e.currentTarget) el.classList.remove("open"); });
    document.getElementById(cancel).addEventListener("click", () => el.classList.remove("open"));
    document.getElementById(save).addEventListener("click", fn);
  });
}
