/* ==========================================================================
   ภาพรวม — a customizable board of widgets. Each person picks a preset
   (executive / production / store & purchasing / service) or arranges their
   own: add, remove, reorder and widen widgets. The layout is remembered per
   user on this device. Widgets are live views over the same data as the
   other pages; every number links to the page behind it.
   ========================================================================== */

const OV_STORAGE_PREFIX = "y2j-overview-v1-";

const OV_WIDGETS = {
  hero: { title: "ตัวเลขสำคัญตอนนี้", sub: "กดตัวเลขเพื่อไปยังหน้าที่เกี่ยวข้อง", size: "full" },
  flow: { title: "เส้นทางงาน: คำสั่งซื้อ → ผลิต → ส่งมอบ → บริการ", sub: "จำนวนงานที่อยู่ในแต่ละช่วงตอนนี้ · กรอบแดง = คอขวด (ค้าง/เกินกำหนดมากที่สุด)", size: "full" },
  woProgress: { title: "ความคืบหน้าใบสั่งผลิต", sub: "แถบ = % เบิกวัสดุจริงจากใบเบิก · เรียงตามกำหนดส่ง", size: "half" },
  health: { title: "คะแนนความสอดคล้องของข้อมูล", sub: "ตรวจข้ามทุกโมดูลอัตโนมัติ — 100 = ไม่พบปัญหา", size: "half" },
  stockHealth: { title: "สุขภาพคงคลัง", sub: "แถบ = คงคลัง · เส้นประ = จุดสั่งซื้อ · ขีดเข้ม = ยอดค้างจ่าย", size: "half" },
  reqAging: { title: "ใบเบิกที่ยังไม่ปิด — รอมากี่วัน อยู่ที่ใคร", sub: "เรียงจากรอนานสุด", size: "half" },
  p2pPipeline: { title: "จัดซื้อ 10 ขั้น: งานค้างอยู่ขั้นไหน", sub: "แท่ง = จำนวนคำขอที่อยู่ในขั้นนั้น · ส่วนสีแดง = เกินกำหนด", size: "half" },
  service: { title: "บริการหลังการขาย & เคลม", sub: "เครื่องในมือลูกค้า งานบริการที่เปิด และเคลมที่ยังไม่จบ", size: "half" },
  activity: { title: "ชีพจรการทำงานในระบบ — 14 วันล่าสุด", sub: "สีเข้ม = บันทึก/อนุมัติ/จ่ายของมาก · ขวา = กิจกรรมล่าสุด", size: "full" },
  docsLoad: { title: "เอกสารที่ยังเปิดอยู่ แยกตามแผนก", sub: "งานค้างของแต่ละฝ่าย", size: "half" },
  pilot: { title: "ผลทดสอบนำร่อง (Pilot)", sub: "จากค่าที่วัดจริงในหน้า Pilot เท่านั้น", size: "half" },
  woStatus: { title: "สถานะใบสั่งผลิตทั้งหมด", sub: "นับทุกใบสั่งผลิต แบ่งตามสถานะปัจจุบัน", size: "half" },
  capacity: { title: "Utilization รายไลน์ผลิต — สัปดาห์นี้", sub: "เส้นประ = 100% ของกำลังการผลิต", size: "half" },
  alerts: { title: "แจ้งเตือนความล่าช้าและความเสี่ยง", sub: "รวมทุกความเสี่ยงจากทุกโมดูล", size: "full" },
  legacyStats: { title: "ตัวชี้วัดการวางแผน", sub: "Priority Matrix · Capacity · Master Schedule · Make-or-Buy · ทรัพยากร", size: "full" },
  about: { title: "เกี่ยวกับ Dashboard นี้", sub: "", size: "full" },
  rndProjects: { title: "โครงการ R&D", sub: "ความคืบหน้าเทียบแผน · Milestone ถัดไป", size: "half" },
  rndChanges: { title: "การเปลี่ยนแปลงทางวิศวกรรมที่ยังไม่ครบ", sub: "ECR → EO → BOM → แบบ → WI → หน้างาน", size: "half" },
};

const OV_PRESETS = [
  { id: "exec", name: "ผู้บริหาร", widgets: ["hero", "flow", "rndProjects", "woProgress", "health", "p2pPipeline", "service", "activity", "pilot", "docsLoad", "alerts"] },
  { id: "prod", name: "ฝ่ายผลิต / วางแผน", widgets: ["hero", "woProgress", "reqAging", "stockHealth", "capacity", "woStatus", "legacyStats", "alerts"] },
  { id: "store", name: "คลัง & จัดซื้อ", widgets: ["hero", "reqAging", "stockHealth", "p2pPipeline", "flow", "activity"] },
  { id: "rnd", name: "R&D / วิศวกรรม", widgets: ["rndProjects", "rndChanges", "woProgress", "health", "activity", "docsLoad"] },
  { id: "svc", name: "บริการหลังการขาย", widgets: ["hero", "service", "flow", "stockHealth", "activity"] },
];

let ovLayout = null;   // { preset, items: [{ id, size }] }
let ovEditing = false;

function ovUserId() { const u = typeof authCurrentUser === "function" ? authCurrentUser() : null; return u ? u.id : "guest"; }
function ovDefaultPreset() {
  const u = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  if (!u) return "exec";
  if (["plant", "group", "admin"].includes(u.role)) return "exec";
  if (["wh", "pur"].includes(u.dept)) return "store";
  if (u.dept === "sales") return "svc";
  if (u.dept === "rnd") return "rnd";
  return "prod";
}
function ovFromPreset(id) {
  const p = OV_PRESETS.find((x) => x.id === id) || OV_PRESETS[0];
  return { preset: p.id, items: p.widgets.map((w) => ({ id: w, size: OV_WIDGETS[w].size })) };
}
function ovLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(OV_STORAGE_PREFIX + ovUserId()) || "null");
    if (p && Array.isArray(p.items)) { p.items = p.items.filter((i) => OV_WIDGETS[i.id]); return p; }
  } catch (e) { /* use preset */ }
  return ovFromPreset(ovDefaultPreset());
}
function ovSave() { try { localStorage.setItem(OV_STORAGE_PREFIX + ovUserId(), JSON.stringify(ovLayout)); } catch (e) { /* per-device convenience only */ } }

/* ---- small drawing helpers ---------------------------------------------------- */

const ovEsc = (v) => escapeHtml(v === undefined || v === null ? "" : String(v));
function ovGo(view, label, extra) { return `<button type="button" class="ov-go" data-go="${view}"${extra ? ` data-extra="${ovEsc(extra)}"` : ""}>${label}</button>`; }
function ovCan(view) { const b = document.querySelector(`.nav-item[data-view="${view}"]`); return !!b && !b.hidden; }
function ovNum(n) { return (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("th-TH"); }
function ovTile(label, value, note, view, tone, extra) {
  const inner = `<div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div>`;
  return ovCan(view)
    ? `<button type="button" class="stat-tile ov-tile${tone ? ` bx-tile-${tone}` : ""}" data-go="${view}"${extra ? ` data-extra="${ovEsc(extra)}"` : ""}>${inner}</button>`
    : `<div class="stat-tile ov-tile${tone ? ` bx-tile-${tone}` : ""}">${inner}</div>`;
}
function ovEmpty(text) { return `<p class="muted-note ov-empty">${text}</p>`; }

/* ---- widgets ----------------------------------------------------------------- */

const OV_RENDER = {
  hero() {
    const open = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์");
    const late = WORK_ORDERS.filter((w) => w.status === "ล่าช้า").length;
    const avg = open.length ? Math.round(open.reduce((s, w) => s + (Number(w.issuedPct) || 0), 0) / open.length) : 0;
    const reqs = bxReqs().filter(bxReqVisible).filter((d) => BX_OPEN_REQ.includes(d.status));
    const shortBuy = bxMrpRows().filter((r) => r.net > 0).length;
    const cases = typeof P2P_CASES !== "undefined" ? P2P_CASES.filter((c) => c.status !== "cancelled" && p2pCurrent(c)) : [];
    const p2pLate = cases.filter((c) => p2pState(c) === "late").length;
    const svc = (DEPT_DOCS.svc || []).filter((d) => svIsOpen(d));
    const claims = (DEPT_DOCS.svc || []).filter((d) => svIsClaim(d) && svClaimOpen(d));
    let openDocs = 0;
    Object.keys(DEPT_DOCS).forEach((t) => { if (DOC_TYPES[t]) openDocs += (DEPT_DOCS[t] || []).filter((d) => deptIsOpen(t, d)).length; });
    const ic = typeof icRun === "function" ? icSummary(icRun()) : null;
    const score = ic ? ovScore(ic) : null;
    return `<div class="ov-hero">
      ${ovTile("ใบสั่งผลิตที่ยังไม่เสร็จ", open.length, late ? `ล่าช้า ${late} ใบ` : "ไม่มีงานล่าช้า", "workorder", late ? "bad" : "")}
      ${ovTile("เบิกวัสดุเฉลี่ย", `${avg}%`, "ของใบสั่งผลิตที่ยังไม่เสร็จ", "bomx", "", "track")}
      ${ovTile("ใบเบิกที่ยังไม่ปิด", reqs.length, `รออนุมัติ ${reqs.filter((d) => d.status === "รออนุมัติ").length} · รอคลัง ${reqs.filter((d) => d.status !== "รออนุมัติ").length}`, "bomx", reqs.length ? "warn" : "", "track")}
      ${ovTile("วัสดุที่ต้องสั่ง/ผลิตเพิ่ม", shortBuy, "จากแผนความต้องการวัสดุ (MRP)", "bomx", shortBuy ? "warn" : "", "mrp")}
      ${ovTile("คำขอซื้อ PR→PO ค้าง", cases.length, p2pLate ? `เกินกำหนด ${p2pLate}` : "ตามกำหนดทั้งหมด", "p2p", p2pLate ? "bad" : "")}
      ${ovTile("งานบริการเปิดอยู่", svc.length, `เคลมยังไม่จบ ${claims.length}`, "service", svc.some((d) => d.status === "รออะไหล่") ? "warn" : "")}
      ${ovTile("เอกสารค้างทุกแผนก", openDocs, "ยังไม่ปิด/อนุมัติ", "dept")}
      ${score === null ? "" : ovTile("ความสอดคล้องของข้อมูล", `${score}`, ic.error ? `ผิดพลาด ${ic.error} รายการ` : ic.warn ? `ควรตรวจ ${ic.warn} รายการ` : "ไม่พบปัญหา", ovCan("admin") ? "admin" : "reports", ic.error ? "bad" : ic.warn ? "warn" : "", "integrity")}
    </div>`;
  },

  flow() {
    const so = DEPT_DOCS.so || [];
    const soOpen = so.filter((d) => ["ยืนยันคำสั่งซื้อ", "กำลังผลิต"].includes(d.status)).length;
    const soQuote = so.filter((d) => d.status === "เสนอราคา").length;
    const wos = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์");
    const reqs = bxReqs().filter((d) => BX_OPEN_REQ.includes(d.status));
    const cases = typeof P2P_CASES !== "undefined" ? P2P_CASES.filter((c) => c.status !== "cancelled" && p2pCurrent(c)) : [];
    const fi = (DEPT_DOCS.fi || []).filter((d) => deptIsOpen("fi", d)).length;
    const ncr = (DEPT_DOCS.ncr || []).filter((d) => deptIsOpen("ncr", d)).length;
    const delivered = so.filter((d) => d.status === "ส่งมอบแล้ว").length;
    const mc = (DEPT_DOCS.mc || []).length;
    const svc = (DEPT_DOCS.svc || []).filter((d) => svIsOpen(d));
    const stages = [
      { label: "คำสั่งซื้อ", n: soOpen, note: `เสนอราคา ${soQuote}`, bad: 0, view: "dept" },
      { label: "ใบสั่งผลิต", n: wos.length, note: `ล่าช้า ${wos.filter((w) => w.status === "ล่าช้า").length}`, bad: wos.filter((w) => w.status === "ล่าช้า").length, view: "workorder" },
      { label: "เบิกวัสดุ", n: reqs.length, note: `รอ > 2 วัน ${reqs.filter((d) => bxDaysBetween(d.date, bxToday()) > 2).length}`, bad: reqs.filter((d) => bxDaysBetween(d.date, bxToday()) > 2).length, view: "bomx", extra: "track" },
      { label: "จัดซื้อ", n: cases.length, note: `เกินกำหนด ${cases.filter((c) => p2pState(c) === "late").length}`, bad: cases.filter((c) => p2pState(c) === "late").length, view: "p2p" },
      { label: "ตรวจคุณภาพ", n: fi + ncr, note: `รอตรวจ ${fi} · NCR ${ncr}`, bad: ncr, view: "dept" },
      { label: "ส่งมอบแล้ว", n: delivered, note: `ทะเบียนเครื่อง ${mc} คัน`, bad: 0, view: "service", extra: "machines" },
      { label: "บริการหลังการขาย", n: svc.length, note: `รออะไหล่ ${svc.filter((d) => d.status === "รออะไหล่").length}`, bad: svc.filter((d) => d.status === "รออะไหล่" || /ด่วนมาก/.test(d.priority || "")).length, view: "service" },
    ];
    const maxBad = Math.max(...stages.map((s) => s.bad));
    return `<div class="ov-flow">${stages.map((s, i) => `
      ${i ? '<span class="ov-flow-arrow" aria-hidden="true">›</span>' : ""}
      <button type="button" class="ov-flow-step${maxBad > 0 && s.bad === maxBad ? " ov-bottleneck" : ""}" data-go="${s.view}"${s.extra ? ` data-extra="${s.extra}"` : ""} data-tip="${ovEsc(`${s.label}: ${s.n} · ${s.note}`)}">
        <span class="ov-flow-label">${s.label}</span>
        <span class="ov-flow-n">${s.n}</span>
        <span class="ov-flow-note">${s.note}</span>
        ${maxBad > 0 && s.bad === maxBad ? '<span class="ov-flow-flag">คอขวด</span>' : ""}
      </button>`).join("")}</div>`;
  },

  woProgress() {
    const parseThai = (s) => {
      const m = /(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(s || "");
      if (!m) return "9999";
      const mi = TH_MONTHS.indexOf(m[2]);
      return `${Number(m[3]) - 543}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    };
    const list = WORK_ORDERS.slice().sort((a, b) => (a.status === "เสร็จสมบูรณ์") - (b.status === "เสร็จสมบูรณ์") || parseThai(a.dueDate).localeCompare(parseThai(b.dueDate))).slice(0, 8);
    if (!list.length) return ovEmpty("ยังไม่มีใบสั่งผลิต — ฝ่ายวางแผนเปิดได้ที่หน้า \"ใบสั่งผลิต & BOM\"");
    return `<div class="ov-rows">${list.map((w) => {
      const pct = Math.max(0, Math.min(100, Number(w.issuedPct) || 0));
      const due = parseThai(w.dueDate);
      const left = due !== "9999" ? bxDaysBetween(bxToday(), due) : null;
      const tone = w.status === "ล่าช้า" ? "critical" : w.status === "เสร็จสมบูรณ์" ? "good" : left !== null && left < 7 ? "warning" : "info";
      return `<div class="ov-row${w.status === "เสร็จสมบูรณ์" ? " ov-row-done" : ""}" data-tip="${ovEsc(`${w.wo} · ${w.model} × ${w.qty} · ${w.department} · เบิกวัสดุ ${pct}% · ส่ง ${w.dueDate}`)}">
        <div class="ov-row-head"><strong>${ovEsc(w.wo)}</strong> <span class="muted-inline">${ovEsc(w.model)} × ${ovEsc(w.qty)} · ${ovEsc(w.department)}</span>
          <span class="ov-row-right"><strong>${pct}%</strong> ${bxPill(w.status, tone)} <span class="muted-inline">${left === null ? ovEsc(w.dueDate) : w.status === "เสร็จสมบูรณ์" ? "ส่งแล้ว/เสร็จ" : left < 0 ? `เลย ${-left} วัน` : `อีก ${left} วัน`}</span></span></div>
        <div class="ov-bar"><span style="width:${pct}%"></span></div>
      </div>`;
    }).join("")}</div>${ovGo("workorder", "ดูใบสั่งผลิตทั้งหมด →")}`;
  },

  health() {
    if (typeof icRun !== "function") return "";
    const all = icRun();
    const n = icSummary(all);
    const score = ovScore(n);
    const tone = n.error ? "--status-critical" : n.warn ? "--status-warning" : "--status-good";
    const angle = Math.PI * (1 - score / 100);
    const x = 100 + 80 * Math.cos(angle), y = 100 - 80 * Math.sin(angle);
    const top = all.filter((f) => f.sev !== "info").slice(0, 4);
    return `<div class="ov-health">
      <svg viewBox="0 0 200 118" class="ov-gauge" role="img" aria-label="คะแนน ${score} จาก 100">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--gridline)" stroke-width="16" stroke-linecap="round"/>
        ${score > 0 ? `<path d="M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="var(${tone})" stroke-width="16" stroke-linecap="round"/>` : ""}
        <text x="100" y="92" text-anchor="middle" class="ov-gauge-n">${score}</text>
        <text x="100" y="112" text-anchor="middle" class="ov-gauge-sub">จาก 100</text>
      </svg>
      <div class="ov-health-side">
        <div class="ov-health-counts"><span class="pill pill-critical">ผิดพลาด ${n.error}</span> <span class="pill pill-warning">ควรตรวจ ${n.warn}</span> <span class="pill pill-schedule">ข้อสังเกต ${n.info}</span></div>
        ${top.length ? `<ul class="bx-list">${top.map((f) => `<li>${ovEsc(f.area)}: ${ovEsc(f.msg)}</li>`).join("")}</ul>` : `<p class="ic-ok">✓ ข้อมูลทุกโมดูลสอดคล้องกัน</p>`}
        ${ovCan("admin") ? ovGo("admin", "ดูผลตรวจทั้งหมด →", "integrity") : ovCan("reports") ? ovGo("reports", "เปิดรายงานตรวจสอบระบบ →", "p-audit") : ""}
      </div>
    </div>`;
  },

  stockHealth() {
    const s = bxOutstandingSummary();
    const rows = Object.keys(BX_STOCK).map((k) => {
      const st = BX_STOCK[k];
      const qty = Number(st.qty) || 0, min = Number(st.min) || 0, dem = s.demand[k] || 0;
      const need = Math.max(min, dem, 1);
      return { k, qty, min, dem, ratio: qty / need, st };
    }).sort((a, b) => a.ratio - b.ratio).slice(0, 8);
    if (!rows.length) return ovEmpty("ยังไม่มียอดคงคลัง — คลังสินค้าตั้งยอดได้ที่หน้า BOM & เบิกวัสดุ › คงคลัง");
    const max = Math.max(...rows.map((r) => Math.max(r.qty, r.min, r.dem))) * 1.1 || 1;
    const name = (k) => { let n = k; MACHINE_MODELS.some((m) => { const r = bxRowFor(m, k); if (r) { n = r.line.part; return true; } return false; }); return n; };
    return `<div class="ov-rows">${rows.map((r) => {
      const tone = r.qty < r.dem ? "critical" : r.min && r.qty <= r.min ? "warning" : "good";
      const label = tone === "critical" ? "ไม่พอจ่าย" : tone === "warning" ? "ถึงจุดสั่งซื้อ" : "ปกติ";
      return `<div class="ov-row" data-tip="${ovEsc(`${r.k} ${name(r.k)} · คงคลัง ${r.qty} · จุดสั่งซื้อ ${r.min} · ค้างจ่าย ${r.dem}${r.st.loc ? ` · ที่เก็บ ${r.st.loc}` : ""}`)}">
        <div class="ov-row-head"><span class="mono-cell">${ovEsc(r.k)}</span> <span class="muted-inline">${ovEsc(name(r.k)).slice(0, 34)}</span><span class="ov-row-right">${bxPill(label, tone)} <strong>${ovNum(r.qty)}</strong></span></div>
        <div class="ov-bar ov-bar-${tone}"><span style="width:${(r.qty / max) * 100}%"></span>
          ${r.min ? `<i class="ov-mark ov-mark-min" style="left:${(r.min / max) * 100}%"></i>` : ""}
          ${r.dem ? `<i class="ov-mark ov-mark-dem" style="left:${(r.dem / max) * 100}%"></i>` : ""}</div>
      </div>`;
    }).join("")}</div>${ovGo("bomx", "เปิดคงคลัง →", "stock")}`;
  },

  reqAging() {
    const list = bxReqs().filter(bxReqVisible).filter((d) => BX_OPEN_REQ.includes(d.status))
      .map((d) => ({ d, age: bxDaysBetween(d.date, bxToday()), holder: bxReqHolder(d) })).sort((a, b) => b.age - a.age).slice(0, 8);
    if (!list.length) return ovEmpty("✓ ไม่มีใบเบิกค้าง");
    const max = Math.max(3, ...list.map((r) => r.age));
    return `<div class="ov-rows">${list.map((r) => {
      const tone = /ไม่พอ/.test(r.holder) ? "critical" : r.d.status === "รออนุมัติ" ? "warning" : "info";
      return `<div class="ov-row" data-tip="${ovEsc(`${r.d.no} · ${r.d.wo} · ${r.d.items.length} รายการ · ผู้รับ ${r.d.owner || "-"} · ${r.holder}`)}">
        <div class="ov-row-head"><button type="button" class="bx-link" data-openreq="${ovEsc(r.d.no)}">${ovEsc(r.d.no)}</button> <span class="muted-inline">${ovEsc(r.d.wo)} · ${ovEsc(r.d.owner || "")}</span><span class="ov-row-right"><strong>${r.age} วัน</strong> ${bxPill(r.holder, tone)}</span></div>
        <div class="ov-bar ov-bar-${tone}"><span style="width:${Math.max(3, (r.age / max) * 100)}%"></span></div>
      </div>`;
    }).join("")}</div>${ovGo("bomx", "ติดตามใบเบิกทั้งหมด →", "track")}`;
  },

  p2pPipeline() {
    if (typeof P2P_STAGES === "undefined") return "";
    const cases = P2P_CASES.filter((c) => c.status !== "cancelled" && p2pCurrent(c));
    const data = P2P_STAGES.map((st) => {
      const here = cases.filter((c) => p2pCurrent(c).id === st.id);
      return { st, n: here.length, late: here.filter((c) => p2pState(c) === "late").length, prs: here.map((c) => c.pr).join(", ") };
    });
    if (!cases.length) return ovEmpty("✓ ไม่มีคำขอซื้อค้าง");
    const max = Math.max(1, ...data.map((d) => d.n));
    const w = 34, gap = 10, h = 120;
    return `<svg class="ov-cols" viewBox="0 0 ${data.length * (w + gap)} ${h + 44}" role="img" aria-label="จำนวนคำขอซื้อแต่ละขั้น">
      <line x1="0" y1="${h}" x2="${data.length * (w + gap)}" y2="${h}" stroke="var(--baseline)"/>
      ${data.map((d, i) => {
        const x = i * (w + gap) + gap / 2;
        const bh = (d.n / max) * (h - 16), lh = (d.late / max) * (h - 16);
        return `<g data-tip="${ovEsc(`${d.st.label}: ${d.n} รายการ${d.late ? ` (เกินกำหนด ${d.late})` : ""}${d.prs ? ` · ${d.prs}` : ""}`)}">
          <rect x="${x}" y="0" width="${w}" height="${h + 40}" fill="transparent"/>
          ${d.n ? `<rect x="${x}" y="${h - bh}" width="${w}" height="${bh - lh}" rx="4" fill="var(--series-1)"/>` : ""}
          ${d.late ? `<rect x="${x}" y="${h - lh}" width="${w}" height="${lh}" fill="var(--status-critical)"/>` : ""}
          <text x="${x + w / 2}" y="${h - bh - 4}" text-anchor="middle" class="ov-col-n">${d.n || ""}</text>
          <text x="${x + w / 2}" y="${h + 14}" text-anchor="middle" class="ov-col-l">${ovEsc(d.st.short || d.st.id)}</text>
        </g>`;
      }).join("")}
    </svg>${ovGo("p2p", "ดูรายละเอียดจัดซื้อ →")}`;
  },

  service() {
    const mcs = (DEPT_DOCS.mc || []).filter((m) => m.status !== "หยุดใช้งาน");
    const inW = mcs.filter((m) => svInWarranty(m)).length;
    const open = (DEPT_DOCS.svc || []).filter((d) => svIsOpen(d));
    const claims = (DEPT_DOCS.svc || []).filter((d) => svIsClaim(d) && svClaimOpen(d));
    const byStatus = DOC_TYPES.svc.statuses.filter(([s]) => !(DOC_TYPES.svc.closed || []).includes(s)).map(([s, tone]) => ({ s, tone, n: open.filter((d) => d.status === s).length })).filter((x) => x.n);
    const total = open.length || 1;
    return `<div class="ov-svc">
      <div class="ov-mini">
        <div><span class="ov-mini-n">${mcs.length}</span><span class="ov-mini-l">เครื่องในมือลูกค้า</span></div>
        <div><span class="ov-mini-n">${inW}</span><span class="ov-mini-l">อยู่ในประกัน</span></div>
        <div><span class="ov-mini-n">${open.length}</span><span class="ov-mini-l">งานบริการเปิด</span></div>
        <div><span class="ov-mini-n">${claims.length}</span><span class="ov-mini-l">เคลมยังไม่จบ</span></div>
      </div>
      ${byStatus.length ? `<div class="ov-stack" role="img" aria-label="งานบริการแยกตามสถานะ">${byStatus.map((x) => `<span class="ov-stack-seg ov-tone-${x.tone}" style="flex:${x.n / total}" data-tip="${ovEsc(`${x.s}: ${x.n}`)}"></span>`).join("")}</div>
      <div class="ov-legend">${byStatus.map((x) => `<span><i class="ov-dot ov-tone-${x.tone}"></i>${ovEsc(x.s)} ${x.n}</span>`).join("")}</div>` : ovEmpty("✓ ไม่มีงานบริการเปิด")}
      ${claims.length ? `<div class="ov-claims">${claims.slice(0, 3).map((d) => `<div>${ovEsc(d.no)} · ${ovEsc(d.title).slice(0, 40)} <span class="muted-inline">${ovEsc(d.claimStatus || "ยังไม่ส่งเคลม")}${d.claimAmount ? ` · ${Number(d.claimAmount).toLocaleString("th-TH")} บาท` : ""}</span></div>`).join("")}</div>` : ""}
    </div>${ovGo("service", "เปิดบริการหลังการขาย →")}`;
  },

  activity() {
    const log = typeof auditLoad === "function" ? auditLoad() : [];
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); }
    const recent = log.filter((e) => e.ts && e.ts.slice(0, 10) >= days[0] && !/เข้าสู่ระบบ|ออกจากระบบ/.test(e.action));
    const byUser = {};
    recent.forEach((e) => { (byUser[e.userName] = byUser[e.userName] || {})[e.ts.slice(0, 10)] = ((byUser[e.userName] || {})[e.ts.slice(0, 10)] || 0) + 1; });
    const users = Object.keys(byUser).map((u) => ({ u, n: Object.values(byUser[u]).reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n).slice(0, 7);
    if (!users.length) return ovEmpty("ยังไม่มีการบันทึกงานใน 14 วันที่ผ่านมา");
    const max = Math.max(1, ...users.flatMap((x) => days.map((d) => byUser[x.u][d] || 0)));
    const level = (n) => (n ? Math.min(4, Math.ceil((n / max) * 4)) : 0);
    const feed = log.filter((e) => !/เข้าสู่ระบบ|ออกจากระบบ/.test(e.action)).slice(-7).reverse();
    return `<div class="ov-activity">
      <div class="ov-heat-wrap">
        <table class="ov-heat" aria-label="จำนวนกิจกรรมต่อคนต่อวัน">
          <thead><tr><th></th>${days.map((d, i) => `<th>${i % 2 === 0 ? Number(d.slice(8)) : ""}</th>`).join("")}<th class="num">รวม</th></tr></thead>
          <tbody>${users.map((x) => `<tr><th>${ovEsc(x.u)}</th>${days.map((d) => { const n = byUser[x.u][d] || 0; return `<td><span class="ov-cell ov-l${level(n)}" data-tip="${ovEsc(`${x.u} · ${formatThaiDate(d)} · ${n} รายการ`)}"></span></td>`; }).join("")}<td class="num"><strong>${x.n}</strong></td></tr>`).join("")}</tbody>
        </table>
        <div class="ov-legend"><span>น้อย</span>${[0, 1, 2, 3, 4].map((l) => `<span class="ov-cell ov-l${l}"></span>`).join("")}<span>มาก</span></div>
      </div>
      <ul class="ov-feed">${feed.map((e) => `<li><span class="muted-inline">${fmtDateTime(e.ts)}</span><br><strong>${ovEsc(e.userName)}</strong> ${ovEsc(e.action)} <span class="mono-cell">${ovEsc(e.target)}</span></li>`).join("")}</ul>
    </div>`;
  },

  docsLoad() {
    const rows = DEPT_WORKSPACES.map((ws) => {
      let n = 0, oldest = 0;
      ws.docTypes.forEach((t) => {
        if (!DOC_TYPES[t] || DOC_TYPES[t].special) return;
        (DEPT_DOCS[t] || []).filter((d) => deptIsOpen(t, d)).forEach((d) => { n++; if (d.date) oldest = Math.max(oldest, bxDaysBetween(d.date, bxToday())); });
      });
      return { ws, n, oldest };
    }).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...rows.map((r) => r.n));
    if (!rows.some((r) => r.n)) return ovEmpty("✓ ไม่มีเอกสารค้าง");
    return `<div class="ov-rows">${rows.map((r) => `<div class="ov-row" data-tip="${ovEsc(`${r.ws.name}: ยังเปิด ${r.n} ฉบับ${r.oldest ? ` · เก่าสุด ${r.oldest} วัน` : ""}`)}">
      <div class="ov-row-head"><span>${ovEsc(r.ws.name)}</span><span class="ov-row-right"><strong>${r.n}</strong>${r.oldest ? ` <span class="muted-inline">เก่าสุด ${r.oldest} วัน</span>` : ""}</span></div>
      <div class="ov-bar"><span style="width:${(r.n / max) * 100}%"></span></div></div>`).join("")}</div>${ovGo("dept", "เปิดงานตามแผนก →")}`;
  },

  pilot() {
    if (typeof pilotSummary !== "function") return "";
    const s = pilotSummary();
    if (!s.measured) return `<div class="ov-pilot-empty"><div class="ov-mini-n">0 / ${s.total}</div><p>ยังไม่มีตัวชี้วัดที่วัดครบทั้งก่อนและหลังใช้ระบบ — กรอกค่าจริงระหว่างทดสอบนำร่อง</p>${ovGo("pilot", "กรอกผล Pilot →")}</div>`;
    const kpis = PILOT.kpis.filter((k) => pilotImprovement(k) !== null);
    return `<div class="ov-mini">
        <div><span class="ov-mini-n">${s.measured}/${s.total}</span><span class="ov-mini-l">ตัวชี้วัดที่วัดแล้ว</span></div>
        <div><span class="ov-mini-n">${s.avg === null ? "—" : `${ovNum(s.avg)}%`}</span><span class="ov-mini-l">ดีขึ้นเฉลี่ย</span></div>
        <div><span class="ov-mini-n">${s.hours ? ovNum(s.hours) : "—"}</span><span class="ov-mini-l">ชม./เดือนที่ประหยัด</span></div>
        <div><span class="ov-mini-n">${s.monthly ? Math.round(s.monthly).toLocaleString("th-TH") : "—"}</span><span class="ov-mini-l">บาท/เดือน</span></div>
      </div>
      <div class="ov-rows">${kpis.map((k) => { const imp = pilotImprovement(k); return `<div class="ov-row" data-tip="${ovEsc(`${k.name}: ก่อน ${k.before} → หลัง ${k.after} ${k.unit}`)}"><div class="ov-row-head"><span>${ovEsc(k.name)}</span><span class="ov-row-right"><strong>${imp > 0 ? "+" : ""}${ovNum(imp)}%</strong></span></div><div class="ov-bar ov-bar-good"><span style="width:${Math.max(2, Math.min(100, Math.abs(imp)))}%"></span></div></div>`; }).join("")}</div>
      ${ovGo("pilot", "ดูผล Pilot ทั้งหมด →")}`;
  },

  rndProjects() {
    if (typeof RD === "undefined") return "";
    const list = RD.projects.filter((p) => !["เสร็จแล้ว", "ยกเลิก"].includes(p.status));
    const tq = typeof rdTqOpen === "function" ? rdTqOpen() : [];
    const tqNote = tq.length ? `<div class="ov-row-head"><span>คำถามทางเทคนิค (TQ) รอคำตอบ <strong>${tq.length}</strong>${tq.filter(rdTqLate).length ? ` · ${bxPill(`เลยกำหนด ${tq.filter(rdTqLate).length}`, "critical")}` : ""}</span>${ovGo("rnd", "ตอบ TQ →", "tq")}</div>` : "";
    if (!list.length) return tqNote + ovEmpty("ยังไม่มีโครงการ R&D ที่กำลังทำ") + ovGo("rnd", "สร้างโครงการ →");
    return `<div class="ov-rows">${list.map((p) => {
      const h = rdHealth(p), prog = rdProgress(p), m = rdNextMilestone(p);
      return `<div class="ov-row" data-tip="${ovEsc(`${p.id} ${p.name} · ${prog}% · ${h[0]}${m ? ` · ถัดไป: ${m.name} ${formatThaiDate(m.end)}` : ""}`)}">
        <div class="ov-row-head"><strong>${ovEsc(p.id)}</strong> <span class="muted-inline">${ovEsc(p.name).slice(0, 40)}</span><span class="ov-row-right"><strong>${prog}%</strong> ${bxPill(h[0], h[1])}</span></div>
        <div class="ov-bar ov-bar-${h[1] === "critical" ? "critical" : h[1] === "warning" ? "warning" : "good"}"><span style="width:${prog}%"></span></div>
        ${m ? `<div class="muted-inline">◆ ${ovEsc(m.name)} · ${formatThaiDate(m.end)}</div>` : ""}</div>`;
    }).join("")}</div>${tqNote}${ovGo("rnd", "เปิด R&D Workbench →")}`;
  },
  rndChanges() {
    if (typeof rdOpenChanges !== "function") return "";
    const list = rdOpenChanges();
    if (!list.length) return ovEmpty("✓ ทุก ECR ดำเนินการครบแล้ว");
    return `<div class="ov-rows">${list.slice(0, 6).map((c) => `<div class="ov-row" data-tip="${ovEsc(`${c.ecr.no} ${c.ecr.title} · ค้าง: ${c.pending.map((x) => x.label).join(", ")}`)}">
      <div class="ov-row-head"><strong>${ovEsc(c.ecr.no)}</strong> <span class="muted-inline">${ovEsc(c.ecr.title).slice(0, 36)}</span><span class="ov-row-right">${bxPill(`ต่อไป: ${c.pending[0].label}`, "warning")} <span class="muted-inline">${c.age} วัน</span></span></div>
      <div class="rd-dots">${c.steps.map((s) => `<span class="rd-dot ${s.skip ? "rd-skip" : s.ok ? "rd-ok" : "rd-no"}" title="${ovEsc(s.label)}"></span>`).join("")}</div></div>`).join("")}</div>${ovGo("rnd", "ติดตามการเปลี่ยนแปลง →", "change")}`;
  },
  woStatus() { return `<div class="chart-wrap chart-wrap-md"><canvas id="woStatusChart"></canvas></div>`; },
  capacity() { return `<div class="chart-wrap chart-wrap-md"><canvas id="capacitySnapshotChart"></canvas></div>`; },
  alerts() {
    return `<div class="table-scroll"><table class="data-table" id="alertsTable"><thead><tr><th>ประเภท</th><th>รายละเอียด</th><th>ระดับ</th></tr></thead><tbody></tbody></table>
      <p class="muted-note" id="alertsEmptyNote" style="display:none;">ไม่มีรายการแจ้งเตือนในขณะนี้</p></div>`;
  },
  legacyStats() {
    const t = (label, id, note) => `<div class="stat-tile"><div class="stat-label">${label}</div><div class="stat-value" id="${id}">-</div><div class="stat-note">${note}</div></div>`;
    return `<div class="stat-grid">${t("งานที่ต้องทำก่อน (Do First)", "statDoFirst", "จาก Priority Matrix")}${t("Utilization เฉลี่ยทุกไลน์", "statUtil", "สัปดาห์นี้")}${t("โครงการที่กำลังผลิต", "statActiveProjects", "จาก Master Schedule")}${t("ชิ้นส่วนแนะนำให้ \"ซื้อ\"", "statBuyRec", "จาก Make-or-Buy")}${t("ไลน์ที่ขาดกำลังคน", "statLaborGap", "จาก Resource Management")}${t("เครื่องจักรที่ต้องซ่อมบำรุง", "statMachineIssue", "จาก Resource Management")}</div>`;
  },
  about() {
    return `<p>Y2J ONE เชื่อมงานทุกฝ่ายของโรงงานไว้ในที่เดียว: คำสั่งซื้อ → วางแผน → ใบสั่งผลิต → BOM หลายระดับ → เบิกวัสดุ/คลัง → จัดซื้อ PR→PO → คุณภาพ → ส่งมอบ → บริการหลังการขายและเคลม พร้อมสิทธิ์ตามกลุ่มผู้ใช้ ประวัติการใช้งาน รายงานตามผู้อ่าน และการตรวจความสอดคล้องของข้อมูลข้ามโมดูล</p>`;
  },
};

function ovScore(n) { return Math.max(0, 100 - n.error * 10 - n.warn * 3 - n.info); }

/* ---- board ----------------------------------------------------------------------- */

function initOverview() {
  ovLayout = ovLoad();
  const grid = document.getElementById("ovGrid");
  if (!grid) return;
  // one shared hover tooltip for every widget
  const tip = document.getElementById("ovTip");
  grid.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
  });
  grid.addEventListener("mousemove", (e) => {
    if (tip.hidden) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY + 16}px`;
  });
  grid.addEventListener("mouseleave", () => { tip.hidden = true; });
  document.getElementById("ovEditBtn").addEventListener("click", () => { ovEditing = !ovEditing; renderOverview(); });
  document.getElementById("ovPreset").addEventListener("change", (e) => {
    ovLayout = ovFromPreset(e.target.value);
    ovSave();
    renderOverview();
  });
}

function ovGoTo(view, extra) {
  if (!ovCan(view)) return;
  if (view === "bomx" && extra) bxTab = extra;
  if (view === "service" && extra) svTab = extra;
  if (view === "admin" && extra && typeof adminTab !== "undefined") adminTab = extra;
  if (view === "reports" && extra && typeof rpApplyView === "function") rpApplyView(extra);
  if (view === "rnd" && extra && typeof rdTab !== "undefined") rdTab = extra;
  switchView(view);
}

function renderOverview() {
  const grid = document.getElementById("ovGrid");
  if (!grid || !ovLayout) return;
  const sel = document.getElementById("ovPreset");
  sel.innerHTML = OV_PRESETS.map((p) => `<option value="${p.id}"${p.id === ovLayout.preset ? " selected" : ""}>${p.name}</option>`).join("") + (ovLayout.preset === "custom" ? `<option value="custom" selected>กำหนดเอง</option>` : "");
  const btn = document.getElementById("ovEditBtn");
  btn.textContent = ovEditing ? "✓ เสร็จสิ้นการปรับแต่ง" : "⚙ ปรับแต่งหน้านี้";
  btn.classList.toggle("btn-primary", ovEditing);
  btn.classList.toggle("btn-secondary", !ovEditing);

  grid.classList.toggle("ov-editing", ovEditing);
  grid.innerHTML = ovLayout.items.map((it, i) => {
    const w = OV_WIDGETS[it.id];
    let body;
    try { body = OV_RENDER[it.id](); } catch (e) { body = `<p class="muted-note">แสดงส่วนนี้ไม่ได้ (${ovEsc(e.message)})</p>`; }
    return `<div class="card ov-w ov-${it.size}" data-wid="${it.id}">
      <div class="card-header ov-w-head">
        <div><h3>${w.title}</h3>${w.sub ? `<p class="card-sub">${w.sub}</p>` : ""}</div>
        ${ovEditing ? `<div class="ov-w-tools">
          <button type="button" class="btn-chip" data-ovact="up" data-i="${i}" aria-label="เลื่อนขึ้น"${i === 0 ? " disabled" : ""}>↑</button>
          <button type="button" class="btn-chip" data-ovact="down" data-i="${i}" aria-label="เลื่อนลง"${i === ovLayout.items.length - 1 ? " disabled" : ""}>↓</button>
          <button type="button" class="btn-chip" data-ovact="size" data-i="${i}">${it.size === "full" ? "ครึ่งจอ" : "เต็มจอ"}</button>
          <button type="button" class="btn-chip" data-ovact="hide" data-i="${i}" aria-label="ซ่อน">✕ ซ่อน</button>
        </div>` : ""}
      </div>
      <div class="card-body">${body}</div>
    </div>`;
  }).join("") + (ovEditing ? `<div class="card ov-w ov-full ov-add">
      <div class="card-header"><h3>เพิ่มวิดเจ็ต</h3><p class="card-sub">กดเพื่อเพิ่มท้ายหน้า · เปลี่ยนมุมมองสำเร็จรูปได้ที่ปุ่มด้านบน · การจัดวางจำไว้ในเครื่องนี้สำหรับผู้ใช้แต่ละคน</p></div>
      <div class="card-body ov-add-list">${Object.keys(OV_WIDGETS).filter((id) => !ovLayout.items.some((x) => x.id === id)).map((id) => `<button type="button" class="btn-secondary" data-ovadd="${id}">+ ${OV_WIDGETS[id].title}</button>`).join("") || '<span class="muted-inline">แสดงครบทุกวิดเจ็ตแล้ว</span>'}
        <button type="button" class="btn-secondary" id="ovReset">คืนค่าตามมุมมองสำเร็จรูป</button></div>
    </div>` : "");

  grid.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => ovGoTo(b.dataset.go, b.dataset.extra)));
  grid.querySelectorAll("[data-openreq]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); switchView("bomx"); bxOpenReq(b.dataset.openreq); }));
  grid.querySelectorAll("[data-ovact]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.i);
    const items = ovLayout.items;
    if (b.dataset.ovact === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (b.dataset.ovact === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    if (b.dataset.ovact === "size") items[i].size = items[i].size === "full" ? "half" : "full";
    if (b.dataset.ovact === "hide") items.splice(i, 1);
    ovLayout.preset = "custom";
    ovSave();
    renderOverview();
  }));
  grid.querySelectorAll("[data-ovadd]").forEach((b) => b.addEventListener("click", () => {
    ovLayout.items.push({ id: b.dataset.ovadd, size: OV_WIDGETS[b.dataset.ovadd].size });
    ovLayout.preset = "custom";
    ovSave();
    renderOverview();
  }));
  const reset = document.getElementById("ovReset");
  if (reset) reset.addEventListener("click", () => { ovLayout = ovFromPreset(ovDefaultPreset()); ovSave(); renderOverview(); });

  // widgets drawn by the older modules fill themselves in by element id
  const has = (id) => ovLayout.items.some((x) => x.id === id);
  if (has("woStatus") || has("capacity")) renderOverviewCharts();
  if (has("alerts") && typeof renderAlerts === "function") renderAlerts();
  if (has("legacyStats")) {
    ["updatePriorityStat", "renderCapacityTable", "updateScheduleStat", "updateMobOverviewStat", "updateResourceStats"].forEach((fn) => { try { if (typeof window[fn] === "function") window[fn](); } catch (e) { /* keep "-" */ } });
  }
}
