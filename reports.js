/* ==========================================================================
   รายงาน — pick a ready-made view for executives / department heads / the
   store / purchasing / service / QC / engineering, or tick your own set of
   report blocks with filters (model, period), save it as a named view
   (private or shared with everyone) and open it as a PDF-ready document.
   Every block respects the viewer's document visibility.
   ========================================================================== */

const RP_STORAGE_KEY = "y2j-reports-v1";

const RP_PRESETS = [
  { id: "p-exec", name: "ผู้บริหาร — ภาพรวมรายสัปดาห์", sections: ["exec", "wo", "p2p", "supplier", "service", "claims", "quality"] },
  { id: "p-prod", name: "หัวหน้าฝ่ายผลิต — งาน วัสดุ คุณภาพ", sections: ["wo", "req", "mrp", "quality", "docs"] },
  { id: "p-plan", name: "ฝ่ายวางแผน — ใบสั่งผลิตและความต้องการวัสดุ", sections: ["wo", "mrp", "p2p"] },
  { id: "p-store", name: "คลังสินค้า — ใบเบิก ค้างจ่าย คงคลัง", sections: ["req", "stock", "mrp"] },
  { id: "p-pur", name: "จัดซื้อ — PR/PO ผู้ขาย ของที่ต้องสั่ง", sections: ["mrp", "p2p", "supplier"] },
  { id: "p-svc", name: "บริการหลังการขาย — งานบริการ เคลม อะไหล่", sections: ["service", "claims", "stock"] },
  { id: "p-qc", name: "QC — ของเสีย เคลม ผู้ขาย", sections: ["quality", "claims", "supplier"] },
  { id: "p-eng", name: "วิศวกรรม — BOM การเปลี่ยนแปลง เคลม", sections: ["bom", "claims", "quality"] },
];

const RP_SECTIONS = [
  ["exec", "ตัวชี้วัดหลัก (KPI)"],
  ["wo", "ใบสั่งผลิต — สถานะ / ล่าช้า / เบิกวัสดุ"],
  ["req", "ใบเบิกวัสดุ — ค้างอนุมัติ / ค้างจ่าย"],
  ["mrp", "ความต้องการวัสดุ — ของที่ต้องสั่งเพิ่ม"],
  ["stock", "คงคลัง — ไม่พอจ่าย / ถึงจุดสั่งซื้อ"],
  ["p2p", "จัดซื้อ PR → PO → รับของ — ค้าง / เกินกำหนด"],
  ["supplier", "ผลงานผู้ขาย + เคลม"],
  ["docs", "เอกสารค้างตามแผนก"],
  ["quality", "คุณภาพ — NCR / CAPA ที่ยังเปิด"],
  ["service", "บริการหลังการขาย — งานเปิด"],
  ["claims", "งานเคลม — ติดตามกับผู้ขาย"],
  ["bom", "สถานะ BOM ทุกรุ่น"],
  ["activity", "กิจกรรมล่าสุดในระบบ (ผู้จัดการ/ผู้ดูแล)"],
];

let RP_VIEWS = [];
let rpViewId = "p-exec";
let rpSections = RP_PRESETS[0].sections.slice();
let rpModel = "";
let rpPeriod = "30";

function rpLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(RP_STORAGE_KEY) || "null");
    RP_VIEWS = p && Array.isArray(p.views) ? p.views : [];
  } catch (e) { RP_VIEWS = []; }
}
function rpSave() {
  try { localStorage.setItem(RP_STORAGE_KEY, JSON.stringify({ views: RP_VIEWS })); } catch (e) { showToast("บันทึกมุมมองรายงานไม่สำเร็จ", "warn"); }
}
function rpMe() { return typeof authCurrentUser === "function" ? authCurrentUser() : null; }
function rpMyViews() {
  const me = rpMe();
  return RP_VIEWS.filter((v) => v.shared || !me || v.owner === me.id);
}
function rpSince() {
  if (rpPeriod === "all") return "";
  const d = new Date();
  d.setDate(d.getDate() - Number(rpPeriod));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rpInPeriod(iso) { const s = rpSince(); return !s || !iso || String(iso).slice(0, 10) >= s; }
function rpModelOk(m) { return !rpModel || !m || m === rpModel; }
function rpVisible(type) { return (DEPT_DOCS[type] || []).filter((d) => typeof authCanSeeDoc !== "function" || authCanSeeDoc(type, d)); }
function rpTable(head, rows, empty) {
  return `<table class="data-table rp-table"><thead><tr>${head.map((h) => `<th${h.startsWith("#") ? ' class="num"' : ""}>${escapeHtml(h.replace(/^#/, ""))}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${head.length}" class="muted-inline">${escapeHtml(empty || "ไม่มีรายการ")}</td></tr>`}</tbody></table>`;
}
function rpTd(v, num) { return `<td${num ? ' class="num"' : ""}>${v}</td>`; }

/* ---- blocks ------------------------------------------------------------------- */

const RP_BLOCKS = {
  exec() {
    const wos = WORK_ORDERS.filter((w) => rpModelOk(w.model));
    const open = wos.filter((w) => w.status !== "เสร็จสมบูรณ์");
    const late = wos.filter((w) => w.status === "ล่าช้า").length;
    const avgIss = open.length ? Math.round(open.reduce((s, w) => s + bxNum(w.issuedPct), 0) / open.length) : 0;
    const cases = typeof P2P_CASES !== "undefined" ? P2P_CASES : [];
    const p2pOpen = cases.filter((c) => c.status !== "cancelled" && p2pCurrent(c)).length;
    const p2pLate = cases.filter((c) => p2pState(c) === "late").length;
    const reqs = bxReqs().filter(bxReqVisible).filter((d) => BX_OPEN_REQ.includes(d.status) && rpModelOk(d.model));
    const savedModel = bxMrpModel;
    bxMrpModel = rpModel;
    const shortage = bxMrpRows().filter((r) => r.net > 0).length;
    bxMrpModel = savedModel;
    const svc = rpVisible("svc").filter((d) => svIsOpen(d) && rpModelOk(svModel(d)));
    const claims = rpVisible("svc").filter((d) => svIsClaim(d) && svClaimOpen(d) && rpModelOk(svModel(d)));
    const ncr = rpVisible("ncr").filter((d) => deptIsOpen("ncr", d) && rpModelOk(d.model));
    const tile = (label, value, note, tone) => `<div class="stat-tile${tone ? ` bx-tile-${tone}` : ""}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
    return `<div class="stat-grid rp-kpis">
      ${tile("ใบสั่งผลิตที่ยังไม่เสร็จ", open.length, `ล่าช้า ${late} ใบ`, late ? "bad" : "")}
      ${tile("เบิกวัสดุเฉลี่ย", `${avgIss}%`, "ของใบสั่งผลิตที่ยังไม่เสร็จ")}
      ${tile("ใบเบิกที่ยังไม่ปิด", reqs.length, `รออนุมัติ ${reqs.filter((d) => d.status === "รออนุมัติ").length}`, reqs.length ? "warn" : "")}
      ${tile("วัสดุที่ต้องสั่งเพิ่ม", shortage, "จากแผนความต้องการวัสดุ", shortage ? "warn" : "")}
      ${tile("คำขอซื้อ (PR/PO) ค้าง", p2pOpen, `เกินกำหนด ${p2pLate}`, p2pLate ? "bad" : "")}
      ${tile("NCR ที่ยังเปิด", ncr.length, "ของเสีย/ไม่เป็นไปตามข้อกำหนด", ncr.length ? "warn" : "")}
      ${tile("งานบริการเปิดอยู่", svc.length, `รออะไหล่ ${svc.filter((d) => d.status === "รออะไหล่").length}`, "")}
      ${tile("งานเคลมยังไม่จบ", claims.length, `${claims.reduce((s, d) => s + bxNum(d.claimAmount), 0).toLocaleString("th-TH")} บาท`, claims.length ? "warn" : "")}
      ${tile("BOM ที่ยังเป็นร่าง", MACHINE_MODELS.filter((m) => BOM_META[m] && BOM_META[m].status === BOM_DRAFT).length, `จาก ${MACHINE_MODELS.length} รุ่น`)}
    </div>`;
  },
  wo() {
    const rank = { "ล่าช้า": 0, "กำลังผลิต": 1, "วางแผน": 2, "เสร็จสมบูรณ์": 3 };
    const list = WORK_ORDERS.filter((w) => rpModelOk(w.model)).slice().sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
    return rpTable(["ใบสั่งผลิต", "PO ลูกค้า", "รุ่น", "ไลน์", "#คัน", "#เบิกวัสดุ", "กำหนดส่ง", "ผู้รับผิดชอบ", "สถานะ"],
      list.map((w) => `<tr>${rpTd(escapeHtml(w.wo))}${rpTd(escapeHtml(w.po || ""))}${rpTd(escapeHtml(w.model))}${rpTd(escapeHtml(w.department))}${rpTd(w.qty, 1)}${rpTd(`${bxNum(w.issuedPct)}%`, 1)}${rpTd(escapeHtml(w.dueDate || ""))}${rpTd(escapeHtml(w.assignee || "—"))}${rpTd(`<span class="pill ${WO_STATUS_META[w.status] || "pill-good"}">${escapeHtml(w.status)}</span>`)}</tr>`));
  },
  req() {
    const list = bxReqs().filter(bxReqVisible).filter((d) => BX_OPEN_REQ.includes(d.status) && rpModelOk(d.model));
    return rpTable(["ใบเบิก", "งาน", "รุ่น", "ผู้รับของ", "#รอมา (วัน)", "#ค้างจ่าย (รายการ)", "อยู่ที่", "สถานะ"],
      list.map((d) => `<tr>${rpTd(escapeHtml(d.no))}${rpTd(escapeHtml(d.wo))}${rpTd(escapeHtml(d.model || ""))}${rpTd(escapeHtml(d.owner || ""))}${rpTd(bxDaysBetween(d.date, bxToday()), 1)}${rpTd(d.items.filter((it) => bxItemOutstanding(d, it) > 0).length, 1)}${rpTd(escapeHtml(bxReqHolder(d)))}${rpTd(bxStatusPill("mreq", d.status))}</tr>`), "ไม่มีใบเบิกค้าง");
  },
  mrp() {
    const saved = bxMrpModel;
    bxMrpModel = rpModel;
    const rows = bxMrpRows().filter((r) => r.net > 0);
    bxMrpModel = saved;
    return rpTable(["ชิ้นส่วน", "ทำ/ซื้อ", "#ยังต้องเบิก", "#คงคลัง", "#สั่งซื้ออยู่", "#ต้องสั่งเพิ่ม", "ใบสั่งผลิตที่รอ"],
      rows.map((r) => `<tr>${rpTd(`${escapeHtml(r.line.code || "")} ${escapeHtml(r.line.part)}`)}${rpTd(escapeHtml(r.line.source || ""))}${rpTd(bxFmt(r.remain), 1)}${rpTd(r.tracked ? bxFmt(r.have) : "—", 1)}${rpTd(bxFmt(r.onOrder), 1)}${rpTd(`<strong>${bxFmt(r.net)}</strong>`, 1)}${rpTd(escapeHtml(r.wos.join(", ")))}</tr>`), "ไม่มีวัสดุที่ต้องสั่งเพิ่ม");
  },
  stock() {
    const s = bxOutstandingSummary();
    const rows = bxAllParts().map((p) => {
      const st = bxStock(p.key);
      if (!st) return null;
      const dem = s.demand[p.key] || 0;
      const after = bxNum(st.qty) - dem;
      if (!(after < 0 || (st.min && after <= bxNum(st.min)))) return null;
      return `<tr>${rpTd(escapeHtml(p.line.code || ""))}${rpTd(escapeHtml(p.line.part))}${rpTd(escapeHtml(st.loc || ""))}${rpTd(bxFmt(st.qty), 1)}${rpTd(bxFmt(dem), 1)}${rpTd(st.min ? bxFmt(st.min) : "—", 1)}${rpTd(after < 0 ? bxPill("ไม่พอจ่าย", "critical") : bxPill("ถึงจุดสั่งซื้อ", "warning"))}</tr>`;
    }).filter(Boolean);
    return rpTable(["รหัส", "ชื่อ", "ที่เก็บ", "#คงคลัง", "#ค้างจ่าย", "#จุดสั่งซื้อ", "สถานะ"], rows, "คงคลังเพียงพอทุกรายการ");
  },
  p2p() {
    const cases = (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).filter((c) => c.status !== "cancelled" && p2pCurrent(c))
      .filter((c) => rpInPeriod((c.events || [])[0] && c.events[0].at) || p2pState(c) === "late")
      .sort((a, b) => (p2pState(a) === "late" ? 0 : 1) - (p2pState(b) === "late" ? 0 : 1) || p2pWaitDays(b) - p2pWaitDays(a));
    const holders = p2pHolderStats();
    return rpTable(["PR / PO", "รายการ", "ผู้ขาย", "ขั้นตอน", "อยู่ที่", "#รอมา (วัน)", "ต้องใช้", "สถานะ"],
      cases.map((c) => { const st = p2pCurrent(c); const s = p2pState(c); return `<tr>${rpTd(`${escapeHtml(c.pr)}${c.po ? ` / ${escapeHtml(c.po)}` : ""}`)}${rpTd(escapeHtml(c.item))}${rpTd(escapeHtml(c.supplier || "—"))}${rpTd(escapeHtml(st.label))}${rpTd(escapeHtml(p2pHolder(c)))}${rpTd(p2pWaitDays(c), 1)}${rpTd(c.needBy ? formatThaiDate(c.needBy) : "—")}${rpTd(s === "late" ? bxPill("เกินกำหนด", "critical") : s === "risk" ? bxPill("ใกล้กำหนด", "warning") : bxPill("ตามแผน", "good"))}</tr>`; }), "ไม่มีคำขอซื้อค้าง")
      + `<div class="rp-sub">งานค้างอยู่ที่ใคร</div>`
      + rpTable(["ผู้ถืองาน", "#งาน", "#เกินกำหนด", "#ค้างนานสุด (วัน)"], holders.map((h) => `<tr>${rpTd(escapeHtml(h.holder))}${rpTd(h.count, 1)}${rpTd(h.late, 1)}${rpTd(h.oldest, 1)}</tr>`));
  },
  supplier() {
    const claims = {};
    rpVisible("svc").filter((d) => d.supplier).forEach((d) => { claims[d.supplier] = (claims[d.supplier] || 0) + 1; });
    const stats = p2pSupplierStats();
    const names = new Set(stats.map((s) => s.name).concat(Object.keys(claims)));
    return rpTable(["ผู้ขาย", "#PO", "#ส่งแล้ว", "#ตรงเวลา", "#IQC ไม่ผ่าน", "#กำลังช้าอยู่", "#เคลม"],
      [...names].map((n) => { const s = stats.find((x) => x.name === n) || { pos: 0, deliveries: 0, onTime: 0, iqcFail: 0, openLate: 0 }; return `<tr>${rpTd(escapeHtml(n))}${rpTd(s.pos, 1)}${rpTd(s.deliveries, 1)}${rpTd(s.deliveries ? `${Math.round((s.onTime / s.deliveries) * 100)}%` : "—", 1)}${rpTd(s.iqcFail, 1)}${rpTd(s.openLate, 1)}${rpTd(claims[n] || 0, 1)}</tr>`; }));
  },
  docs() {
    const rows = [];
    DEPT_WORKSPACES.forEach((ws) => ws.docTypes.forEach((t) => {
      const def = DOC_TYPES[t];
      if (!def || def.special) return;
      const list = rpVisible(t).filter((d) => rpModelOk(d.model));
      const open = list.filter((d) => deptIsOpen(t, d));
      const recent = list.filter((d) => rpInPeriod(d.date || d.createdAt)).length;
      if (!list.length) return;
      rows.push(`<tr>${rpTd(escapeHtml(ws.name))}${rpTd(escapeHtml(def.name))}${rpTd(open.length ? `<strong>${open.length}</strong>` : 0, 1)}${rpTd(recent, 1)}${rpTd(list.length, 1)}${rpTd(escapeHtml(open.slice(0, 4).map((d) => d.no).join(", ")))}</tr>`);
    }));
    return rpTable(["แผนก", "เอกสาร", "#ยังเปิด", "#ออกในช่วงนี้", "#ทั้งหมด", "ตัวอย่างที่ยังเปิด"], rows);
  },
  quality() {
    const rows = ["ncr", "capa", "iqc", "fi"].flatMap((t) => rpVisible(t).filter((d) => deptIsOpen(t, d) && rpModelOk(d.model)).map((d) =>
      `<tr>${rpTd(escapeHtml(d.no))}${rpTd(escapeHtml(d.title || ""))}${rpTd(escapeHtml(d.model || ""))}${rpTd(escapeHtml(d.owner || ""))}${rpTd(d.date ? formatThaiDate(d.date) : "—")}${rpTd(bxStatusPill(t, d.status))}</tr>`));
    return rpTable(["เลขที่", "เรื่อง", "รุ่น", "ผู้รับผิดชอบ", "วันที่", "สถานะ"], rows, "ไม่มีเรื่องคุณภาพค้าง");
  },
  service() {
    const list = rpVisible("svc").filter((d) => svIsOpen(d) && rpModelOk(svModel(d)));
    return rpTable(["ใบงาน", "งาน", "เครื่อง / ลูกค้า", "ประเภท", "ช่าง", "#รอมา (วัน)", "ประกัน", "สถานะ"],
      list.map((d) => { const m = svMachine(d); return `<tr>${rpTd(escapeHtml(d.no))}${rpTd(escapeHtml(d.title))}${rpTd(`${escapeHtml(m ? m.title : "—")}<div class="muted-inline">${escapeHtml(svCustomer(d))}</div>`)}${rpTd(escapeHtml(d.kind || ""))}${rpTd(escapeHtml(d.tech || "—"))}${rpTd(bxDaysBetween(d.date, bxToday()), 1)}${rpTd(m && svInWarranty(m, d.date) ? "ในประกัน" : "นอกประกัน")}${rpTd(bxStatusPill("svc", d.status))}</tr>`; }), "ไม่มีงานบริการค้าง");
  },
  claims() {
    const list = rpVisible("svc").filter((d) => svIsClaim(d) && rpModelOk(svModel(d)) && (svClaimOpen(d) || rpInPeriod(d.date)));
    return rpTable(["ใบงาน", "อาการ", "สาเหตุ", "ผู้ขาย", "สถานะเคลม", "#มูลค่า (บาท)", "งานบริการ"],
      list.map((d) => `<tr>${rpTd(escapeHtml(d.no))}${rpTd(escapeHtml(d.title))}${rpTd(escapeHtml(d.claimCause || "—"))}${rpTd(escapeHtml(d.supplier || "—"))}${rpTd(escapeHtml(d.claimStatus || "ยังไม่ส่งเคลม"))}${rpTd(d.claimAmount ? bxNum(d.claimAmount).toLocaleString("th-TH") : "—", 1)}${rpTd(bxStatusPill("svc", d.status))}</tr>`), "ไม่มีงานเคลม");
  },
  bom() {
    return rpTable(["รุ่น", "Revision", "สถานะ", "#รายการ", "#ชิ้นที่เบิกได้", "แก้ไขล่าสุด", "อ้างอิง"],
      MACHINE_MODELS.filter((m) => rpModelOk(m)).map((m) => {
        const meta = BOM_META[m] || {};
        const last = (meta.history || [])[meta.history.length - 1] || {};
        const t = bxTree(m);
        return `<tr>${rpTd(escapeHtml(m))}${rpTd(escapeHtml(meta.rev || ""))}${rpTd(escapeHtml(meta.status || ""))}${rpTd((MASTER_BOM[m] || []).length, 1)}${rpTd(t.filter((r) => r.line && !r.hasKids).length, 1)}${rpTd(`${last.date ? formatThaiDate(last.date) : "—"} ${escapeHtml(last.note || "")}`)}${rpTd(escapeHtml(last.ref || ""))}</tr>`;
      }));
  },
  activity() {
    const me = rpMe();
    if (me && !(me.role === "admin" || me.role === "plant")) return `<p class="muted-inline">เฉพาะผู้จัดการโรงงานและผู้ดูแลระบบ</p>`;
    const log = (typeof auditLoad === "function" ? auditLoad() : []).filter((e) => rpInPeriod(e.ts)).slice(-40).reverse();
    return rpTable(["วันเวลา", "ผู้ใช้", "การกระทำ", "เรื่อง", "รายละเอียด"],
      log.map((e) => `<tr>${rpTd(fmtDateTime(e.ts))}${rpTd(escapeHtml(e.userName))}${rpTd(escapeHtml(e.action))}${rpTd(escapeHtml(e.target))}${rpTd(escapeHtml(String(e.detail || "").slice(0, 120)))}</tr>`), "ไม่มีกิจกรรมในช่วงนี้");
  },
};

/* ---- page --------------------------------------------------------------------- */

function initReports() {
  rpLoad();
  const me = rpMe();
  // sensible default per role
  if (me) {
    const byDept = { prod: "p-prod", plan: "p-plan", wh: "p-store", pur: "p-pur", sales: "p-svc", qc: "p-qc", rnd: "p-eng" };
    const pick = me.role === "group" || me.role === "plant" || me.role === "admin" ? "p-exec" : byDept[me.dept] || "p-prod";
    rpApplyView(pick);
  }
}

function rpApplyView(id) {
  const v = RP_PRESETS.find((p) => p.id === id) || RP_VIEWS.find((p) => p.id === id);
  if (!v) return;
  rpViewId = id;
  rpSections = v.sections.slice();
  if (v.model !== undefined) rpModel = v.model;
  if (v.period !== undefined) rpPeriod = v.period;
}

function rpReportHtml() {
  const title = (RP_PRESETS.find((p) => p.id === rpViewId) || RP_VIEWS.find((p) => p.id === rpViewId) || { name: "รายงานกำหนดเอง" }).name;
  const periodText = rpPeriod === "all" ? "ทั้งหมด" : `${rpPeriod} วันล่าสุด`;
  return {
    title,
    meta: `ข้อมูล ณ ${fmtDateTime(new Date().toISOString())} · รุ่น: ${rpModel || "ทุกรุ่น"} · ช่วงเวลา: ${periodText}${rpMe() ? ` · ผู้ออกรายงาน: ${rpMe().name}` : ""}`,
    body: rpSections.map((s) => {
      const label = (RP_SECTIONS.find((x) => x[0] === s) || [s, s])[1];
      let html;
      try { html = RP_BLOCKS[s] ? RP_BLOCKS[s]() : ""; } catch (e) { html = `<p class="muted-inline">แสดงส่วนนี้ไม่ได้ (${escapeHtml(e.message)})</p>`; }
      return `<section class="rp-block"><h4 class="rp-block-title">${escapeHtml(label)}</h4><div class="table-scroll">${html}</div></section>`;
    }).join(""),
  };
}

function renderReports() {
  const box = document.getElementById("rpPane");
  if (!box) return;
  const me = rpMe();
  const mine = rpMyViews();
  const cur = RP_VIEWS.find((v) => v.id === rpViewId);
  const canDelete = cur && (!me || cur.owner === me.id || me.role === "admin");
  const r = rpReportHtml();
  box.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div>
          <h3>เลือกมุมมองรายงาน</h3>
          <p class="card-sub">เลือกมุมมองสำเร็จรูปตามผู้อ่าน หรือเลือกหัวข้อเอง แล้วบันทึกเป็นมุมมองของทีม · เปิดเป็นเอกสารเพื่อดาวน์โหลด PDF / ส่งต่อ / พิมพ์</p>
        </div>
        <div class="pilot-toolbar">
          <button type="button" class="btn-primary" id="rpPaper">📄 เปิดเป็นเอกสาร / PDF</button>
        </div>
      </div>
      <div class="card-body">
        <div class="filter-row">
          <label for="rpView">มุมมอง:</label>
          <select id="rpView">
            <optgroup label="สำเร็จรูป">${RP_PRESETS.map((p) => `<option value="${p.id}"${p.id === rpViewId ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</optgroup>
            ${mine.length ? `<optgroup label="มุมมองที่บันทึกไว้">${mine.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === rpViewId ? " selected" : ""}>${escapeHtml(v.name)}${v.shared ? " (ทุกคน)" : " (ส่วนตัว)"}</option>`).join("")}</optgroup>` : ""}
            ${rpViewId === "custom" ? `<option value="custom" selected>กำหนดเอง (ยังไม่บันทึก)</option>` : ""}
          </select>
          <label for="rpModel">รุ่น:</label>
          <select id="rpModel"><option value="">ทุกรุ่น</option>${MACHINE_MODELS.map((m) => `<option${m === rpModel ? " selected" : ""}>${escapeHtml(m)}</option>`).join("")}</select>
          <label for="rpPeriod">ช่วงเวลา:</label>
          <select id="rpPeriod">${[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"], ["365", "1 ปี"], ["all", "ทั้งหมด"]].map(([v, t]) => `<option value="${v}"${v === rpPeriod ? " selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="rp-sections">${RP_SECTIONS.map(([id, label]) => `<label class="vis-opt"><input type="checkbox" data-rpsec="${id}"${rpSections.includes(id) ? " checked" : ""}> ${escapeHtml(label)}</label>`).join("")}</div>
        <div class="filter-row rp-save-row">
          <input type="text" id="rpName" class="wo-search" placeholder="ตั้งชื่อมุมมองใหม่ เช่น รายงานประชุมเช้าไลน์ 2">
          <label class="vis-opt"><input type="checkbox" id="rpShared"> ให้ทุกคนเห็นมุมมองนี้</label>
          <button type="button" class="btn-secondary" id="rpSaveView">บันทึกเป็นมุมมอง</button>
          ${canDelete ? `<button type="button" class="btn-secondary" id="rpDelView">ลบมุมมองนี้</button>` : ""}
        </div>
      </div>
    </div>
    <div class="card rp-output">
      <div class="card-header"><h3>${escapeHtml(r.title)}</h3><p class="card-sub">${escapeHtml(r.meta)}</p></div>
      <div class="card-body">${r.body || `<p class="muted-note">เลือกอย่างน้อย 1 หัวข้อ</p>`}</div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  $("rpView").addEventListener("change", (e) => { rpApplyView(e.target.value); renderReports(); });
  $("rpModel").addEventListener("change", (e) => { rpModel = e.target.value; renderReports(); });
  $("rpPeriod").addEventListener("change", (e) => { rpPeriod = e.target.value; renderReports(); });
  box.querySelectorAll("[data-rpsec]").forEach((c) => c.addEventListener("change", () => {
    rpSections = RP_SECTIONS.map((s) => s[0]).filter((id) => box.querySelector(`[data-rpsec="${id}"]`).checked);
    rpViewId = "custom";
    renderReports();
  }));
  $("rpSaveView").addEventListener("click", () => {
    const name = $("rpName").value.trim();
    if (!name) { $("rpName").focus(); showToast("ตั้งชื่อมุมมองก่อน", "warn"); return; }
    if (!rpSections.length) { showToast("เลือกอย่างน้อย 1 หัวข้อ", "warn"); return; }
    const v = { id: `v${Date.now().toString(36)}`, name, sections: rpSections.slice(), model: rpModel, period: rpPeriod, shared: $("rpShared").checked, owner: me ? me.id : "", createdAt: new Date().toISOString() };
    RP_VIEWS.push(v);
    rpSave();
    if (typeof auditLog === "function") auditLog("บันทึกมุมมองรายงาน", name, `${v.shared ? "ทุกคน" : "ส่วนตัว"} · ${v.sections.length} หัวข้อ`);
    rpViewId = v.id;
    renderReports();
    showToast(`บันทึกมุมมอง "${name}" แล้ว`, "good");
  });
  if ($("rpDelView")) $("rpDelView").addEventListener("click", () => {
    if (!confirm(`ลบมุมมอง "${cur.name}"?`)) return;
    RP_VIEWS = RP_VIEWS.filter((v) => v.id !== cur.id);
    rpSave();
    rpApplyView("p-exec");
    renderReports();
  });
  $("rpPaper").addEventListener("click", () => {
    const rep = rpReportHtml();
    docViewCurrent = null;
    docViewFileName = `รายงาน-${rep.title.split(" ")[0]}-${bxToday()}`;
    showPaper(`${paperHeader(rep.title, "Management Report", "", `RPT-${bxToday().replace(/-/g, "")}`, bxToday(), "รายงาน", "info")}<p class="rp-paper-meta">${escapeHtml(rep.meta)}</p>${rep.body}${paperFooter("RPT-01")}`,
      paperOutputActions().concat([{ label: "ปิด", onClick: () => closeDocView() }]));
  });
}
