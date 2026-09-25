/* ==========================================================================
   BOM & เบิกวัสดุ — multi-level BOM (group › assembly › sub-part) with a
   citable item number per line, where-used and every related document;
   technicians pick lines to requisition against a work order or service
   order; the store approves/issues/returns against those lines; outstanding
   (ค้างเบิก / ค้างจ่าย), shortages, material planning (MRP → MRQ / PR) and
   stock on hand. Requisitions are ordinary MR documents (DEPT_DOCS.mreq)
   carrying an `items` list, so they share permissions, audit and paper view.
   ========================================================================== */

const BX_STOCK_KEY = "y2j-stock-v1";
const BX_OPEN_REQ = ["รออนุมัติ", "อนุมัติ", "จ่ายบางส่วน"];

let BX_STOCK = {};                          // key -> { qty, loc, min }
let BX_SETTINGS = { requesters: [], issuers: [] }; // user ids; empty requesters = everyone allowed by role
let bxModel = null;
let bxTab = "tree";
let bxRef = "";
let bxDetailKey = "";
let bxTreeSearch = "";
// Which assemblies are open in the multi-level BOM ("model|lineId"); remembered on this device
const BX_OPEN_KEY = "y2j-bomx-open-v1";
let bxOpen = (() => { try { return new Set(JSON.parse(localStorage.getItem(BX_OPEN_KEY) || "[]")); } catch (e) { return new Set(); } })();
function bxSaveOpen() { try { localStorage.setItem(BX_OPEN_KEY, JSON.stringify([...bxOpen].slice(-500))); } catch (e) { /* per-device only */ } }
function bxIsOpen(model, id) { return bxOpen.has(`${model}|${id}`); }
let bxPickSearch = "";
let bxReqFilter = "open";
let bxReqSearch = "";
let bxMrpModel = "";
let bxMrpShortOnly = true;
let bxStockSearch = "";
let bxEditing = null;   // { model, id | null }
let bxReqOpenNo = null;

/* ---- small helpers ------------------------------------------------------- */

function bxToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function bxDaysBetween(a, b) {
  const x = new Date(`${a}T00:00:00`), y = new Date(`${b}T00:00:00`);
  if (isNaN(x) || isNaN(y)) return 0;
  return Math.round((y - x) / 86400000);
}
function bxNum(v) { return Number(v) || 0; }
function bxFmt(n) { return (Math.round(bxNum(n) * 100) / 100).toLocaleString("th-TH"); }
function bxKey(l) { return (l.code || "").trim() || (l.part || "").trim(); }
function bxShortName(part) {
  const s = String(part || "").split(" (")[0].trim();
  return s.length >= 4 ? s : "";
}
function bxUser() { return typeof authCurrentUser === "function" ? authCurrentUser() : null; }
function bxUserName() { const u = bxUser(); return u ? u.name : (typeof getMyName === "function" && getMyName()) || "ผู้ใช้"; }
function bxCan(type, level) {
  if (bxUser()) return authCan(type, level);
  const r = currentRole();
  if (level === "manage") return r === "depthead" || r === "plant";
  return r !== "group";
}
function bxIsAdminish() { const u = bxUser(); return !u || u.role === "admin" || u.role === "plant"; }
function bxAbility(a) { return typeof authHasAbility === "function" && authHasAbility(a); }
function bxCanRequest() {
  const u = bxUser();
  if (bxAbility("request")) return true;
  if (u && BX_SETTINGS.requesters.length && !bxIsAdminish() && !bxCan("mreq", "manage") && !BX_SETTINGS.requesters.includes(u.id)) return false;
  return bxCan("mreq", "create");
}
function bxCanApprove() { return bxCan("mreq", "manage") || bxAbility("approve"); }
function bxCanIssue() {
  const u = bxUser();
  if ((u && BX_SETTINGS.issuers.includes(u.id)) || bxAbility("issue")) return true;
  return bxCan("mreq", "manage") || bxCan("stk", "create") || bxCan("grn", "create");
}
function bxCanStock() { return bxCan("stk", "create") || bxIsAdminish() || bxAbility("stock"); }
function bxCanSettings() { return bxCan("stk", "manage") || bxIsAdminish() || bxAbility("stock"); }
function bxViewAllowed(view) {
  const b = document.querySelector(`.nav-item[data-view="${view}"]`);
  return !!b && !b.hidden;
}
function bxPill(text, tone) { return `<span class="pill ${DOC_TONE_PILL[tone] || "pill-eliminate"}">${escapeHtml(text)}</span>`; }
function bxStatusPill(type, status) { return bxPill(status, typeof deptStatusTone === "function" ? deptStatusTone(type, status) : "neutral"); }
function bxEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }

/* ---- stock ------------------------------------------------------------------ */

function bxLoadStock() {
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(BX_STOCK_KEY) || "null"); } catch (e) { parsed = null; }
  if (parsed && parsed.items) {
    BX_STOCK = parsed.items;
    BX_SETTINGS = Object.assign({ requesters: [], issuers: [] }, parsed.settings || {});
  } else {
    BX_STOCK = JSON.parse(JSON.stringify(typeof STOCK_SAMPLE !== "undefined" ? STOCK_SAMPLE : {}));
    BX_SETTINGS = { requesters: [], issuers: [] };
  }
}
function bxSaveStock() {
  try { localStorage.setItem(BX_STOCK_KEY, JSON.stringify({ items: BX_STOCK, settings: BX_SETTINGS })); }
  catch (e) { showToast("บันทึกข้อมูลคงคลังไม่สำเร็จ", "warn"); }
}
function bxStock(key) { return BX_STOCK[key] || null; }
function bxStockCell(key) {
  const s = bxStock(key);
  if (!s) return `<span class="muted-inline">—</span>`;
  const low = s.min && bxNum(s.qty) <= bxNum(s.min);
  return `<span class="${bxNum(s.qty) <= 0 ? "bx-neg" : low ? "bx-low" : ""}">${bxFmt(s.qty)}</span>${s.loc ? ` <span class="muted-inline">@${bxEsc(s.loc)}</span>` : ""}`;
}

/* ---- BOM tree ------------------------------------------------------------- */

function bxGroupRank(g) {
  const k = /^(\d{2}) \|/.exec(g); // standard groups "01 | CHASSIS" … in number order, first
  if (k) return Number(k[1]);
  const order = Object.values(BOM_GROUP_BY_PREFIX);
  const i = order.indexOf(g);
  return 100 + (i < 0 ? order.length + (g === BOM_GROUP_DEFAULT ? 1 : 0) : i);
}

// Ordered rows: group headers, then each line with its item number, depth and quantity per machine
// The tree is rebuilt only when the BOM changes (saveBom bumps the version) — large BOMs have 1,000+ lines
let BX_TREE_V = 0;
const BX_TREE_CACHE = new Map();
function bxTreeInvalidate() { BX_TREE_V++; BX_TREE_CACHE.clear(); }

function bxTree(model) {
  const lines = MASTER_BOM[model] || [];
  const cacheable = !String(model).startsWith("__");
  const sig = `${BX_TREE_V}|${lines.length}`;
  const hit = cacheable && BX_TREE_CACHE.get(model);
  if (hit && hit.sig === sig && hit.lines === lines) return hit.rows;
  const rows = bxTreeBuild(lines);
  if (cacheable) BX_TREE_CACHE.set(model, { sig, lines, rows });
  return rows;
}

function bxTreeBuild(lines) {
  const ids = new Set(lines.map((l) => l.id));
  const kidsOf = new Map();
  lines.forEach((l) => { if (l.parent && ids.has(l.parent)) { if (!kidsOf.has(l.parent)) kidsOf.set(l.parent, []); kidsOf.get(l.parent).push(l); } });
  const tops = lines.filter((l) => !l.parent || !ids.has(l.parent));
  const groups = [];
  tops.forEach((l) => { const g = l.group || BOM_GROUP_DEFAULT; if (!groups.includes(g)) groups.push(g); });
  groups.sort((a, b) => bxGroupRank(a) - bxGroupRank(b));
  const rows = [];
  const seen = new Set();
  groups.forEach((g, gi) => {
    rows.push({ isGroup: true, group: g, no: String(gi + 1), depth: 0 });
    const walk = (list, prefix, depth, mult, path) => list.forEach((l, i) => {
      if (seen.has(l.id) || depth > 10) return;
      seen.add(l.id);
      const no = `${prefix}.${i + 1}`;
      const per = bxNum(l.qty) * mult;
      const kids = kidsOf.get(l.id) || [];
      rows.push({ line: l, no, depth, per, hasKids: kids.length > 0, kidCount: kids.length, group: g, path });
      walk(kids, no, depth + 1, per, path.concat([l]));
    });
    walk(tops.filter((l) => (l.group || BOM_GROUP_DEFAULT) === g), String(gi + 1), 1, 1, []);
  });
  return rows;
}

function bxItemNumbers(model) {
  const out = {};
  bxTree(model).forEach((r) => { if (r.line) out[r.line.id] = r.no; });
  return out;
}

function bxRowFor(model, key) { return bxTree(model).find((r) => r.line && bxKey(r.line) === key) || null; }

// What one job needs: leaf lines (sub-parts) × quantity, merged by part key
function bxRequirement(model, qty) {
  const out = {};
  bxTree(model).filter((r) => r.line && !r.hasKids).forEach((r) => {
    const k = bxKey(r.line);
    if (!k) return;
    const o = out[k] = out[k] || { key: k, line: r.line, no: r.no, per: 0, req: 0 };
    o.per += r.per;
    o.req += r.per * qty;
  });
  return out;
}

function bxWhereUsed(key) {
  const out = [];
  MACHINE_MODELS.forEach((m) => bxTree(m).forEach((r) => {
    if (r.line && bxKey(r.line) === key) out.push({ model: m, meta: BOM_META[m] || {}, row: r });
  }));
  return out;
}

/* ---- requisitions ------------------------------------------------------------ */

function bxReqs() { return (DEPT_DOCS.mreq || []).filter((d) => Array.isArray(d.items)); }
function bxReqIndex(no) { return (DEPT_DOCS.mreq || []).findIndex((d) => d.no === no); }
function bxReqVisible(d) { return typeof authCanSeeDoc !== "function" || authCanSeeDoc("mreq", d); }
function bxItemOutstanding(d, it) {
  return BX_OPEN_REQ.includes(d.status) ? Math.max(0, bxNum(it.req) - bxNum(it.issued)) : 0;
}

// Per part key for one job: net issued, still waiting at the store, total asked for
function bxRefUsage(ref) {
  const out = {};
  bxReqs().filter((d) => d.wo === ref && d.status !== "ปฏิเสธ").forEach((d) => d.items.forEach((it) => {
    const o = out[it.key] = out[it.key] || { issued: 0, pending: 0, requested: 0, docs: [] };
    const net = bxNum(it.issued) - bxNum(it.ret);
    const pend = bxItemOutstanding(d, it);
    o.issued += net;
    o.pending += pend;
    o.requested += net + pend;
    if (!o.docs.includes(d.no)) o.docs.push(d.no);
  }));
  return out;
}

function bxMachineOf(doc) { return (DEPT_DOCS.mc || []).find((m) => m.no === doc.machine) || null; }

// Jobs a technician can draw material against: open work orders and open service orders
function bxRefs() {
  const wos = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์").map((w) => ({
    ref: w.wo, model: w.model, qty: bxNum(w.qty) || 1, kind: "ผลิต", line: w.department || "",
    label: `${w.wo} · ${w.model} × ${w.qty} คัน · ${w.department}`,
  }));
  const svcDef = DOC_TYPES.svc;
  const svcs = svcDef ? (DEPT_DOCS.svc || []).filter((d) => !(svcDef.closed || []).includes(d.status)).map((d) => {
    const m = bxMachineOf(d);
    const model = d.model || (m && m.model) || "";
    return { ref: d.no, model, qty: 1, kind: "บริการ", line: "", label: `${d.no} · ${model} ${m ? m.title : ""} · ${d.title}` };
  }) : [];
  return wos.concat(svcs);
}
function bxRefInfo(ref) { return bxRefs().find((r) => r.ref === ref) || null; }

function bxReqHolder(d) {
  if (d.status === "รออนุมัติ") return "หัวหน้าแผนกผู้เบิก";
  if (d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน") {
    const short = d.items.some((it) => { const s = bxStock(it.key); return s && bxNum(s.qty) < bxItemOutstanding(d, it); });
    return short ? "คลังสินค้า (ของไม่พอ)" : "คลังสินค้า";
  }
  return "—";
}

function bxUpdateWoProgress(ref) {
  const wo = WORK_ORDERS.find((w) => w.wo === ref);
  if (!wo) return;
  const need = bxRequirement(wo.model, bxNum(wo.qty) || 1);
  const use = bxRefUsage(ref);
  let tot = 0, got = 0;
  Object.values(need).forEach((n) => { tot += n.req; got += Math.min(n.req, Math.max(0, (use[n.key] || {}).issued || 0)); });
  if (!tot) return;
  wo.issuedPct = Math.round((got / tot) * 100);
  if (typeof afterWOMutation === "function") afterWOMutation(); else if (typeof saveWorkOrders === "function") saveWorkOrders();
}

// Rows for the "การเบิกวัสดุประกอบ" table on the Work Orders page (jobs that use item-based requisitions)
function bxWoIssuanceRows() {
  const refs = new Set(bxReqs().map((d) => d.wo));
  const rows = [];
  WORK_ORDERS.filter((w) => refs.has(w.wo)).forEach((w) => {
    const need = bxRequirement(w.model, bxNum(w.qty) || 1);
    const use = bxRefUsage(w.wo);
    Object.values(need).forEach((n) => {
      const issued = Math.max(0, (use[n.key] || {}).issued || 0);
      rows.push({ wo: w.wo, part: `${n.line.code ? n.line.code + " " : ""}${n.line.part}`, required: n.req, issued, status: issued >= n.req ? "เบิกครบ" : issued > 0 ? "เบิกบางส่วน" : "รอเบิก" });
    });
  });
  return rows;
}

/* ---- purchasing & documents linked to a part --------------------------------- */

function bxCodeRegex(code) {
  return new RegExp(`(^|[^A-Za-z0-9-])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`);
}
function bxP2PFor(line) {
  if (typeof P2P_CASES === "undefined") return [];
  const re = line.code ? bxCodeRegex(line.code) : null;
  const name = bxShortName(line.part);
  return P2P_CASES.filter((c) => c.status !== "cancelled" && ((re && re.test(c.item || "")) || (name && String(c.item || "").includes(name))));
}
function bxP2POnOrder(line) {
  return bxP2PFor(line).filter((c) => typeof p2pStageDone === "function" && !p2pStageDone(c, "grn")).reduce((s, c) => s + bxNum(c.qty), 0);
}
function bxP2PChip(c) {
  const st = typeof p2pCurrent === "function" ? p2pCurrent(c) : null;
  const state = typeof p2pState === "function" ? p2pState(c) : "ok";
  return `<button type="button" class="rel-chip bx-p2p-chip${state === "late" ? " bx-late" : ""}" data-p2p="${bxEsc(c.id)}">${bxEsc(c.pr)}${c.po ? ` / ${bxEsc(c.po)}` : ""} · ${bxEsc(st ? st.short || st.label : "รับของครบ")}${c.supplier ? ` · ${bxEsc(c.supplier)}` : ""}</button>`;
}

function bxRelatedDocs(line) {
  const re = line.code ? bxCodeRegex(line.code) : null;
  const name = bxShortName(line.part);
  const key = bxKey(line);
  const out = [];
  Object.keys(DEPT_DOCS).forEach((t) => (DEPT_DOCS[t] || []).forEach((d, i) => {
    if (typeof authCanSeeDoc === "function" && !authCanSeeDoc(t, d)) return;
    let hit = !!(line.code && d.partCode === line.code);
    if (!hit && Array.isArray(d.items)) hit = d.items.some((it) => it.key === key);
    if (!hit) {
      hit = Object.keys(d).some((k) => {
        if (k === "items" || k === "files" || k === "visibility" || k === "log") return false;
        const v = String(d[k] ?? "");
        return (re && re.test(v)) || (name && (k === "title" || k === "detail") && v.includes(name));
      });
    }
    if (hit) out.push({ type: t, index: i, doc: d });
  }));
  return out;
}

/* ---- page ------------------------------------------------------------------ */

function initBomx() {
  bxLoadStock();
  bxModel = MACHINE_MODELS[0] || null;
  document.querySelectorAll("[data-bxtab]").forEach((b) => b.addEventListener("click", () => { bxTab = b.dataset.bxtab; renderBomx(); }));
  ["bxLineBackdrop", "bxReqBackdrop"].forEach((id) => {
    const bd = document.getElementById(id);
    if (!bd) return;
    bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  });
}

function renderBomx() {
  const pane = document.getElementById("bxPane");
  if (!pane) return;
  if (!MACHINE_MODELS.includes(bxModel)) bxModel = MACHINE_MODELS[0] || null;
  document.querySelectorAll("[data-bxtab]").forEach((b) => b.classList.toggle("active", b.dataset.bxtab === bxTab));
  renderBxStats();
  if (bxTab === "tree") renderBxTree(pane);
  else if (bxTab === "pick") renderBxPick(pane);
  else if (bxTab === "track") renderBxTrack(pane);
  else if (bxTab === "mrp") renderBxMrp(pane);
  else renderBxStockTab(pane);
  if (bxReqOpenNo && document.getElementById("bxReqBackdrop").classList.contains("open")) bxRenderReqModal();
}

function bxOutstandingSummary() {
  const reqs = bxReqs().filter(bxReqVisible);
  const waitApprove = reqs.filter((d) => d.status === "รออนุมัติ").length;
  const waitIssue = reqs.filter((d) => d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน").length;
  const demand = {};
  reqs.forEach((d) => d.items.forEach((it) => {
    const o = bxItemOutstanding(d, it);
    if (o > 0) demand[it.key] = (demand[it.key] || 0) + o;
  }));
  const lines = Object.keys(demand).length;
  const short = Object.keys(demand).filter((k) => { const s = bxStock(k); return s && bxNum(s.qty) < demand[k]; });
  return { reqs, waitApprove, waitIssue, demand, lines, short };
}

function renderBxStats() {
  const el = document.getElementById("bxStats");
  if (!el) return;
  const s = bxOutstandingSummary();
  const woOpen = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์");
  const woIncomplete = woOpen.filter((w) => bxNum(w.issuedPct) < 100).length;
  const partCount = MACHINE_MODELS.reduce((n, m) => n + (MASTER_BOM[m] || []).length, 0);
  const tile = (label, value, note, tone) => `<div class="stat-tile${tone ? ` bx-tile-${tone}` : ""}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
  el.innerHTML = [
    tile("BOM ทั้งหมด", `${MACHINE_MODELS.length} รุ่น`, `${partCount} รายการ (รวมชิ้นย่อย)`),
    tile("ใบเบิกรออนุมัติ", s.waitApprove, "รอหัวหน้าแผนกผู้เบิก", s.waitApprove ? "warn" : ""),
    tile("ใบเบิกรอคลังจ่าย", s.waitIssue, `${s.lines} รายการค้างจ่าย`, s.waitIssue ? "warn" : ""),
    tile("ของไม่พอจ่าย", s.short.length, "คงคลังน้อยกว่ายอดค้างจ่าย", s.short.length ? "bad" : ""),
    tile("ใบสั่งผลิตที่ยังเบิกไม่ครบ", woIncomplete, `จาก ${woOpen.length} ใบที่ยังไม่เสร็จ`),
    tile("งานบริการที่ใช้อะไหล่", s.reqs.filter((d) => /^SV-/.test(d.wo || "") && BX_OPEN_REQ.includes(d.status)).length, "ใบเบิกอะไหล่ที่ยังไม่ปิด"),
  ].join("");
  const cnt = document.getElementById("bxTrackCount");
  if (cnt) cnt.textContent = s.waitApprove + s.waitIssue;
}

/* ---- tab: BOM tree ---------------------------------------------------------- */

function renderBxTree(pane) {
  if (!bxModel) {
    pane.innerHTML = `<div class="card"><div class="card-body"><p class="muted-note">ยังไม่มี BOM — สร้างรุ่นใหม่ได้ที่ งานตามแผนก › R&D › BOM</p></div></div>`;
    return;
  }
  const meta = BOM_META[bxModel];
  const canEdit = bomCanEdit(currentRole());
  const isDraft = meta.status === BOM_DRAFT;
  const editable = canEdit && isDraft;
  const rows = bxTree(bxModel);
  const q = bxTreeSearch.trim().toLowerCase();
  const match = (r) => !q || [r.line.code, r.line.part, r.line.station, r.line.op, r.no].some((v) => String(v || "").toLowerCase().includes(q));
  // a part picked from elsewhere (link, search result) opens its assemblies
  const focus = bxDetailKey ? rows.find((r) => r.line && bxKey(r.line) === bxDetailKey) : null;
  if (focus && focus.path.some((p) => !bxIsOpen(bxModel, p.id))) { focus.path.forEach((p) => bxOpen.add(`${bxModel}|${p.id}`)); bxSaveOpen(); }
  let shown;
  if (q) {
    // searching: every match plus the assemblies above it, whatever is collapsed
    const hits = rows.filter((r) => r.line && match(r));
    const anc = new Set();
    hits.forEach((r) => r.path.forEach((p) => anc.add(p.id)));
    shown = (r) => match(r) || anc.has(r.line.id);
  } else {
    shown = (r) => r.path.every((p) => bxIsOpen(bxModel, p.id));
  }
  const lineRows = rows.filter((r) => r.line && shown(r));
  const visible = rows.filter((r) => r.isGroup ? lineRows.some((x) => x.group === r.group) : lineRows.includes(r));
  const assyIds = rows.filter((r) => r.line && r.hasKids).map((r) => r.line.id);
  const openCount = assyIds.filter((id) => bxIsOpen(bxModel, id)).length;
  const leafCount = rows.filter((r) => r.line && !r.hasKids).length;
  const assyCount = rows.filter((r) => r.line && r.hasKids).length;

  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div>
          <h3>โครงสร้าง BOM หลายระดับ — กลุ่มงาน › ชุดประกอบ › ชิ้นย่อย</h3>
          <p class="card-sub">ทุกบรรทัดมีเลขข้อสำหรับอ้างอิง (เช่น BOM-${bxEsc(bxModel)} Rev.${bxEsc(meta.rev)} ข้อ 1.1.2) · "ใช้ที่" = ไลน์/สถานีที่รับชิ้นนี้ไปใช้ต่อ · กดชื่อชิ้นส่วนเพื่อดูว่าใช้ในรุ่นไหน เอกสารทุกแผนก การเบิก และ PR/PO</p>
        </div>
        <div class="pilot-toolbar">
          ${editable ? `<button class="btn-primary" type="button" id="bxAddTop">+ เพิ่มรายการ</button>` : ""}
          ${editable ? `<button class="btn-secondary" type="button" id="bxRelease">อนุมัติใช้งาน (Release)</button>` : ""}
          ${canEdit && !isDraft ? `<button class="btn-secondary" type="button" id="bxNewRev">ออก Revision ใหม่เพื่อแก้ไข</button>` : ""}
          <button class="btn-secondary" type="button" id="bxSheet">📄 เอกสาร BOM</button>
          ${canEdit && typeof bsAvailable === "function" && bsAvailable() ? `<button class="btn-secondary" type="button" id="bxImportSheet">📥 นำเข้าจาก Google Sheet</button>` : ""}
        </div>
      </div>
      <div class="card-body">
        <div class="filter-row">
          <label for="bxModelSel">รุ่น:</label>
          <select id="bxModelSel">${MACHINE_MODELS.map((m) => `<option value="${bxEsc(m)}"${m === bxModel ? " selected" : ""}>${bxEsc(m)} — Rev.${bxEsc(BOM_META[m].rev)}</option>`).join("")}</select>
          ${bxPill(`Rev.${meta.rev} · ${meta.status}`, isDraft ? "warning" : "good")}
          <span class="muted-inline">${rows.filter((r) => r.isGroup).length} กลุ่มงาน · ${assyCount} ชุดประกอบ · ${leafCount} ชิ้นที่เบิกได้</span>
          <label for="bxTreeSearch">ค้นหา:</label>
          <input type="text" id="bxTreeSearch" class="wo-search" placeholder="รหัส / ชื่อ / สถานี / เลขข้อ" value="${bxEsc(bxTreeSearch)}">
        </div>
        ${assyIds.length ? `<div class="filter-row bx-tree-tools">
          <button type="button" class="btn-chip" id="bxExpandAll">▾ ขยายทั้งหมด</button>
          <button type="button" class="btn-chip" id="bxCollapseAll">▸ ย่อทั้งหมด (เฉพาะตัวหลัก)</button>
          <span class="muted-inline">แสดง ${lineRows.length} จาก ${rows.filter((r) => r.line).length} รายการ · เปิดอยู่ ${openCount}/${assyIds.length} ชุดประกอบ${q ? " · กำลังค้นหา: แสดงทุกรายการที่ตรง" : ""}</span>
        </div>` : ""}
        ${canEdit && !isDraft ? `<p class="muted-note">🔒 BOM นี้อนุมัติใช้งานแล้ว — แก้ไขโครงสร้างได้หลังกด "ออก Revision ใหม่เพื่อแก้ไข" (บันทึกประวัติและอ้างอิง ECR/EO ให้)</p>` : ""}
        ${canEdit && !rows.some((r) => r.line && r.line.parent) ? `<p class="muted-note">BOM นี้ยังไม่มีชิ้นย่อย — ${editable ? `กด "+ ชิ้นย่อย" ที่ชุดประกอบ หรือ <button type="button" class="btn-chip" id="bxSampleKids">เติมชิ้นย่อยตัวอย่าง</button>` : "ออก Revision ใหม่เพื่อเพิ่มชิ้นย่อย"}</p>` : ""}
        <div class="table-scroll">
          <table class="data-table bx-tree">
            <thead><tr><th>ข้อ</th><th>รหัส</th><th>ชื่อชิ้นส่วน</th><th class="num">ต่อชุดแม่</th><th class="num">รวม/คัน</th><th>หน่วย</th><th>ทำ/ซื้อ</th><th>ใช้ที่ (ผู้รับไปใช้ต่อ)</th><th>แบบ</th><th>คงคลัง</th><th>อ้างอิง</th>${editable ? "<th></th>" : ""}</tr></thead>
            <tbody>
              ${visible.map((r) => r.isGroup
                ? `<tr class="bx-group-row"><td class="bx-itemno">${bxEsc(r.no)}</td><td colspan="${editable ? 11 : 10}"><strong>${bxEsc(r.group)}</strong>${editable ? ` <button type="button" class="btn-chip" data-addgroup="${bxEsc(r.group)}">+ เพิ่มในกลุ่มนี้</button>` : ""}</td></tr>`
                : bxTreeRowHtml(r, editable)).join("") || `<tr><td colspan="12" class="muted-inline">ไม่พบรายการ</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div id="bxDetail"></div>
  `;
  const $ = (id) => document.getElementById(id);
  $("bxModelSel").addEventListener("change", (e) => { bxModel = e.target.value; bxDetailKey = ""; renderBomx(); });
  $("bxTreeSearch").addEventListener("input", (e) => {
    bxTreeSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderBomx();
    const el = $("bxTreeSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  $("bxSheet").addEventListener("click", () => openBomSheet(bxModel));
  if ($("bxImportSheet")) $("bxImportSheet").addEventListener("click", () => bomImportFromSheet(bxModel));
  if ($("bxAddTop")) $("bxAddTop").addEventListener("click", () => bxOpenLineModal(bxModel, null, "", ""));
  if ($("bxRelease")) $("bxRelease").addEventListener("click", () => { bomModel = bxModel; releaseBom(); });
  if ($("bxNewRev")) $("bxNewRev").addEventListener("click", () => { bomModel = bxModel; openBomRevModal(); });
  if ($("bxSampleKids")) $("bxSampleKids").addEventListener("click", () => {
    const n = bomAddSampleChildren(bxModel);
    if (!n) { showToast("ไม่มีชุดประกอบที่ตรงกับตัวอย่างชิ้นย่อยในรุ่นนี้", "warn"); return; }
    bomModel = bxModel;
    bomAudit("เติมชิ้นย่อยตัวอย่าง", `${n} รายการ`);
    afterBomMutation();
    showToast(`เพิ่มชิ้นย่อยตัวอย่าง ${n} รายการ`, "good");
  });
  pane.querySelectorAll("[data-addgroup]").forEach((b) => b.addEventListener("click", () => bxOpenLineModal(bxModel, null, "", b.dataset.addgroup)));
  pane.querySelectorAll("[data-tog]").forEach((b) => b.addEventListener("click", () => {
    const k = `${bxModel}|${b.dataset.tog}`;
    if (bxOpen.has(k)) {
      // closing an assembly also closes everything inside it
      bxOpen.delete(k);
      bxDescendants(bxModel, b.dataset.tog).forEach((id) => bxOpen.delete(`${bxModel}|${id}`));
    } else bxOpen.add(k);
    bxSaveOpen();
    renderBomx();
  }));
  if ($("bxExpandAll")) $("bxExpandAll").addEventListener("click", () => { assyIds.forEach((id) => bxOpen.add(`${bxModel}|${id}`)); bxSaveOpen(); renderBomx(); });
  if ($("bxCollapseAll")) $("bxCollapseAll").addEventListener("click", () => { assyIds.forEach((id) => bxOpen.delete(`${bxModel}|${id}`)); bxSaveOpen(); renderBomx(); });
  pane.querySelectorAll("[data-addkid]").forEach((b) => b.addEventListener("click", () => bxOpenLineModal(bxModel, null, b.dataset.addkid, "")));
  pane.querySelectorAll("[data-editline]").forEach((b) => b.addEventListener("click", () => bxOpenLineModal(bxModel, b.dataset.editline)));
  pane.querySelectorAll("[data-delline]").forEach((b) => b.addEventListener("click", () => bxDeleteLine(bxModel, b.dataset.delline)));
  pane.querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () => {
    bxDetailKey = b.dataset.detail;
    renderBxDetail();
    const d = $("bxDetail"); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  wireDrawingChips(pane.querySelector(".bx-tree"));
  renderBxDetail();
}

function bxTreeRowHtml(r, editable) {
  const l = r.line;
  const key = bxKey(l);
  const docs = bxRelatedDocs(l).length;
  const p2p = bxP2PFor(l).length;
  return `<tr class="${r.hasKids ? "bx-assy-row" : ""}${key && key === bxDetailKey ? " bx-selected" : ""}">
    <td class="bx-itemno">${bxEsc(r.no)}</td>
    <td class="mono-cell">${bxEsc(l.code || "—")}${typeof pcChips === "function" && (pcParse(l.code) || pcParseStd(l.code)) ? `<div>${pcChips(l.code)}</div>` : ""}</td>
    <td><span class="bx-indent" style="padding-left:${(r.depth - 1) * 20}px">${r.hasKids
      ? `<button type="button" class="bx-tog" data-tog="${bxEsc(l.id)}" aria-expanded="${bxIsOpen(bxModel, l.id)}" aria-label="${bxIsOpen(bxModel, l.id) ? "ย่อ" : "ขยาย"} ${bxEsc(l.part)}">${bxIsOpen(bxModel, l.id) ? "▾" : "▸"}</button>`
      : `<span class="bx-tog-space">${r.depth > 1 ? "└" : ""}</span>`}<button type="button" class="bx-link" data-detail="${bxEsc(key)}">${bxEsc(l.part || "(ไม่มีชื่อ)")}</button>${r.hasKids ? ` <span class="pill pill-schedule">ชุดประกอบ · ${r.kidCount} รายการ</span>` : ""}</span></td>
    <td class="num">${bxFmt(l.qty)}</td>
    <td class="num"><strong>${bxFmt(r.per)}</strong></td>
    <td>${bxEsc(l.unit || "")}</td>
    <td>${bxEsc(l.source || "—")}</td>
    <td>${l.station ? bxEsc(l.station) : `<span class="muted-inline">—</span>`}${l.op ? `<div class="muted-inline">${bxEsc(l.op)}</div>` : ""}</td>
    <td>${bomDrawingCell(l)}</td>
    <td>${bxStockCell(key)}</td>
    <td>${docs ? `<span class="pill pill-schedule">${docs} เอกสาร</span>` : ""}${p2p ? ` <span class="pill pill-delegate">${p2p} PR/PO</span>` : ""}</td>
    ${editable ? `<td class="wo-actions-cell"><button type="button" class="btn-chip" data-addkid="${bxEsc(l.id)}">+ ชิ้นย่อย</button><button type="button" class="btn-chip" data-editline="${bxEsc(l.id)}">แก้ไข</button><button type="button" class="btn-chip" data-delline="${bxEsc(l.id)}">ลบ</button></td>` : ""}
  </tr>`;
}

/* ---- part detail: where-used + documents from every department -------------- */

function renderBxDetail() {
  const box = document.getElementById("bxDetail");
  if (!box) return;
  const row = bxDetailKey ? bxRowFor(bxModel, bxDetailKey) : null;
  if (!row) { box.innerHTML = ""; return; }
  const l = row.line;
  const key = bxKey(l);
  const meta = BOM_META[bxModel];
  const used = bxWhereUsed(key);
  const kids = (MASTER_BOM[bxModel] || []).filter((c) => c.parent === l.id);
  const itemNos = bxItemNumbers(bxModel);
  const docs = bxRelatedDocs(l);
  const byDept = {};
  docs.forEach((d) => {
    const ws = deptOfType(d.type);
    const name = ws ? ws.name : "อื่น ๆ";
    (byDept[name] = byDept[name] || []).push(d);
  });
  const p2p = bxP2PFor(l);
  const reqRows = [];
  bxReqs().filter(bxReqVisible).forEach((d) => d.items.forEach((it) => { if (it.key === key) reqRows.push({ d, it }); }));
  const s = bxStock(key);
  const refText = `BOM-${bxModel} Rev.${meta.rev} ข้อ ${row.no}${l.code ? ` · ${l.code}` : ""} · ${l.part}`;
  const pathText = row.path.map((p) => `${itemNos[p.id] || ""} ${p.part}`).join(" › ");

  box.innerHTML = `
    <div class="card bx-detail-card">
      <div class="card-header card-header-actions">
        <div>
          <h3>${bxEsc(l.code || "")} ${bxEsc(l.part)}</h3>${typeof pcChips === "function" ? `<div>${pcChips(l.code)}</div>` : ""}
          <p class="card-sub">อ้างอิง: <strong>${bxEsc(refText)}</strong></p>
        </div>
        <div class="pilot-toolbar">
          <button type="button" class="btn-secondary" id="bxCopyRef">🔗 คัดลอกลิงก์อ้างอิง</button>
          <button type="button" class="btn-secondary" id="bxCloseDetail">ปิด</button>
        </div>
      </div>
      <div class="card-body bx-detail-grid">
        <div>
          <h4 class="bx-h4">ข้อมูลชิ้นส่วน</h4>
          <table class="data-table bx-kv"><tbody>
            <tr><th>อยู่ภายใต้</th><td>${pathText ? bxEsc(pathText) : `กลุ่มงาน: ${bxEsc(row.group)}`}</td></tr>
            <tr><th>จำนวน</th><td>${bxFmt(l.qty)} ${bxEsc(l.unit)} ต่อชุดแม่ · <strong>${bxFmt(row.per)} ${bxEsc(l.unit)} ต่อคัน</strong></td></tr>
            <tr><th>ผลิตเอง / ซื้อ</th><td>${bxEsc(l.source || "—")}</td></tr>
            <tr><th>ใช้ที่ (ผู้รับไปใช้ต่อ)</th><td>${bxEsc(l.station || "—")}${l.op ? ` · ขั้นตอน: ${bxEsc(l.op)}` : ""}</td></tr>
            <tr><th>แบบ (Drawing)</th><td>${bomDrawingCell(l)}</td></tr>
            <tr><th>คงคลัง</th><td>${s ? `${bxFmt(s.qty)} ${bxEsc(l.unit)}${s.loc ? ` · ที่เก็บ ${bxEsc(s.loc)}` : ""}${s.min ? ` · จุดสั่งซื้อ ${bxFmt(s.min)}` : ""}` : "ยังไม่ได้ตั้งยอดในคลัง"}</td></tr>
            ${l.note ? `<tr><th>หมายเหตุ</th><td>${bxEsc(l.note)}</td></tr>` : ""}
          </tbody></table>
          ${kids.length ? `<h4 class="bx-h4">ชิ้นย่อยในชุดนี้ (${kids.length})</h4><ul class="bx-list">${kids.map((k) => `<li><span class="bx-itemno">${bxEsc(itemNos[k.id] || "")}</span> <button type="button" class="bx-link" data-detail="${bxEsc(bxKey(k))}">${bxEsc(k.code || "")} ${bxEsc(k.part)}</button> × ${bxFmt(k.qty)} ${bxEsc(k.unit)}</li>`).join("")}</ul>` : ""}
          <h4 class="bx-h4">ใช้ในรุ่นไหนบ้าง (Where-used)</h4>
          <table class="data-table"><thead><tr><th>รุ่น</th><th>ข้อ</th><th>อยู่ภายใต้</th><th class="num">ต่อคัน</th><th>ใช้ที่</th></tr></thead><tbody>
            ${used.map((u) => `<tr><td>${bxEsc(u.model)} <span class="muted-inline">Rev.${bxEsc(u.meta.rev || "")}</span></td><td class="bx-itemno">${bxEsc(u.row.no)}</td><td>${bxEsc(u.row.path.map((p) => p.part).join(" › ") || u.row.group)}</td><td class="num">${bxFmt(u.row.per)}</td><td>${bxEsc(u.row.line.station || "—")}</td></tr>`).join("")}
          </tbody></table>
        </div>
        <div>
          <h4 class="bx-h4">เอกสารที่เกี่ยวข้องจากทุกแผนก (${docs.length})</h4>
          ${Object.keys(byDept).length ? Object.keys(byDept).map((dn) => `<div class="bx-docgroup"><div class="bx-docgroup-title">${bxEsc(dn)}</div>${byDept[dn].map((d) => `<button type="button" class="rel-chip" data-docno="${bxEsc(d.doc.no)}">${bxEsc(d.doc.no)} — ${bxEsc(String(d.doc.title || "").slice(0, 38))} <span class="rel-status">(${bxEsc(d.doc.status)})</span></button>`).join("")}</div>`).join("") : `<p class="muted-inline">ยังไม่มีเอกสารที่อ้างถึงรหัส/ชื่อชิ้นส่วนนี้</p>`}
          <h4 class="bx-h4">จัดซื้อ — PR / PO / ผู้ขาย (${p2p.length})</h4>
          ${p2p.length ? `<div>${p2p.map(bxP2PChip).join("")}</div>` : `<p class="muted-inline">ไม่มีคำขอซื้อที่เกี่ยวกับชิ้นส่วนนี้</p>`}
          <h4 class="bx-h4">ประวัติการเบิก (${reqRows.length})</h4>
          ${reqRows.length ? `<table class="data-table"><thead><tr><th>ใบเบิก</th><th>งาน</th><th class="num">ขอ</th><th class="num">จ่าย</th><th class="num">คืน</th><th>สถานะ</th></tr></thead><tbody>${reqRows.map(({ d, it }) => `<tr><td><button type="button" class="bx-link" data-openreq="${bxEsc(d.no)}">${bxEsc(d.no)}</button></td><td>${bxEsc(d.wo)}</td><td class="num">${bxFmt(it.req)}</td><td class="num">${bxFmt(it.issued)}</td><td class="num">${bxFmt(it.ret)}</td><td>${bxStatusPill("mreq", d.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ยังไม่มีการเบิกผ่านระบบ</p>`}
        </div>
      </div>
    </div>`;
  document.getElementById("bxCloseDetail").addEventListener("click", () => { bxDetailKey = ""; renderBomx(); });
  document.getElementById("bxCopyRef").addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}?bom=${encodeURIComponent(bxModel)}&item=${encodeURIComponent(key)}`;
    const text = `${refText}\n${url}`;
    const done = () => showToast("คัดลอกข้อความอ้างอิงและลิงก์แล้ว — วางในไลน์/อีเมล/เอกสารได้เลย", "good");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => showToast(url, "good"));
    else showToast(url, "good");
  });
  bxWireCommon(box);
}

// Chips/links shared by several panes
function bxWireCommon(root) {
  wireDrawingChips(root);
  root.querySelectorAll("[data-detail]").forEach((b) => {
    if (b.closest(".bx-tree")) return;
    b.addEventListener("click", () => {
      const k = b.dataset.detail;
      if (!bxRowFor(bxModel, k)) bxModel = MACHINE_MODELS.find((m) => bxRowFor(m, k)) || bxModel;
      bxDetailKey = k; bxTab = "tree";
      document.getElementById("bxReqBackdrop").classList.remove("open");
      if (!document.getElementById("view-bomx").classList.contains("active")) switchView("bomx"); else renderBomx();
    });
  });
  root.querySelectorAll("[data-p2p]").forEach((b) => b.addEventListener("click", () => {
    if (!bxViewAllowed("p2p")) { showToast("บัญชีนี้ไม่มีสิทธิ์เปิดหน้าติดตามจัดซื้อ", "warn"); return; }
    document.getElementById("bxReqBackdrop").classList.remove("open");
    switchView("p2p");
    openP2PCase(b.dataset.p2p);
  }));
  root.querySelectorAll("[data-openreq]").forEach((b) => b.addEventListener("click", () => bxOpenReq(b.dataset.openreq)));
  root.querySelectorAll("[data-pickref]").forEach((b) => b.addEventListener("click", () => { bxRef = b.dataset.pickref; bxTab = "pick"; renderBomx(); window.scrollTo(0, 0); }));
}

/* ---- add / edit / delete BOM lines ------------------------------------------ */

function bxDescendants(model, id) {
  const lines = MASTER_BOM[model] || [];
  const out = new Set();
  const walk = (pid) => lines.filter((l) => l.parent === pid).forEach((l) => { if (!out.has(l.id)) { out.add(l.id); walk(l.id); } });
  walk(id);
  return out;
}

function bxOpenLineModal(model, id, parent, group) {
  const lines = MASTER_BOM[model] || [];
  const line = id ? lines.find((l) => l.id === id) : null;
  const par = line ? line.parent || "" : parent || "";
  const parLine = par ? lines.find((l) => l.id === par) : null;
  const l = line || { code: "", part: "", qty: 1, unit: "ชิ้น", source: "ซื้อ", station: parLine ? parLine.station || "" : "", op: "", note: "", group: group || (parLine ? parLine.group : "") || BOM_GROUP_DEFAULT };
  bxEditing = { model, id: id || null };
  const nos = bxItemNumbers(model);
  const exclude = id ? bxDescendants(model, id) : new Set();
  if (id) exclude.add(id);
  const groups = new Set(Object.values(BOM_GROUP_BY_PREFIX).concat([BOM_GROUP_DEFAULT]));
  lines.forEach((x) => { if (x.group) groups.add(x.group); });
  const stations = new Set(PROD_LINES);
  Object.values(MASTER_BOM).forEach((ls) => ls.forEach((x) => { if (x.station) stations.add(x.station); }));
  const opt = (v, cur, label) => `<option value="${bxEsc(v)}"${v === cur ? " selected" : ""}>${bxEsc(label || v)}</option>`;
  document.getElementById("bxLineBody").innerHTML = `
    <h3>${line ? `แก้ไขรายการ ${bxEsc(nos[id] || "")}` : parLine ? `เพิ่มชิ้นย่อยใต้ ${bxEsc(nos[par] || "")} ${bxEsc(parLine.part)}` : "เพิ่มรายการระดับบน"}</h3>
    <p class="card-sub">BOM-${bxEsc(model)} Rev.${bxEsc(BOM_META[model].rev)} (ร่าง) — การแก้ไขทุกครั้งบันทึกในประวัติการใช้งาน</p>
    <div class="modal-grid">
      <div class="form-field"><label for="bxl_code">รหัสชิ้นส่วน</label><input id="bxl_code" value="${bxEsc(l.code)}" placeholder="เช่น K13A06552-00"><div class="muted-inline" id="bxl_codeHint"></div></div>
      <div class="form-field"><label for="bxl_part">ชื่อชิ้นส่วน *</label><input id="bxl_part" value="${bxEsc(l.part)}"></div>
      <div class="form-field"><label for="bxl_qty">จำนวนต่อชุดแม่ *</label><input id="bxl_qty" type="number" min="0" step="any" value="${bxEsc(l.qty)}"></div>
      <div class="form-field"><label for="bxl_unit">หน่วย</label><select id="bxl_unit">${(BOM_UNITS.includes(l.unit) ? BOM_UNITS : [l.unit].concat(BOM_UNITS)).map((u) => opt(u, l.unit)).join("")}</select></div>
      <div class="form-field"><label for="bxl_source">ผลิตเอง / ซื้อ</label><select id="bxl_source">${BOM_SOURCES.map((u) => opt(u, l.source || "ซื้อ")).join("")}</select></div>
      <div class="form-field"><label for="bxl_parent">อยู่ภายใต้</label><select id="bxl_parent">${opt("", par, "— ระดับบน (อยู่ในกลุ่มงาน) —")}${bxTree(model).filter((r) => r.line && !exclude.has(r.line.id)).map((r) => opt(r.line.id, par, `${r.no} ${"· ".repeat(r.depth - 1)}${r.line.part}`)).join("")}</select></div>
      <div class="form-field" id="bxl_groupBox"${par ? " hidden" : ""}><label for="bxl_group">กลุ่มงาน</label><input id="bxl_group" list="bxl_groups" value="${bxEsc(l.group || BOM_GROUP_DEFAULT)}"><datalist id="bxl_groups">${[...groups].map((g) => `<option value="${bxEsc(g)}">`).join("")}</datalist></div>
      <div class="form-field"><label for="bxl_station">ใช้ที่ (ไลน์/สถานีที่รับไปใช้ต่อ)</label><input id="bxl_station" list="bxl_stations" value="${bxEsc(l.station || "")}"><datalist id="bxl_stations">${[...stations].map((g) => `<option value="${bxEsc(g)}">`).join("")}</datalist></div>
      <div class="form-field"><label for="bxl_op">ขั้นตอน / งานที่ใช้</label><input id="bxl_op" value="${bxEsc(l.op || "")}" placeholder="เช่น ประกอบชุดขับ"></div>
      <div class="form-field"><label for="bxl_note">หมายเหตุ</label><input id="bxl_note" value="${bxEsc(l.note || "")}"></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="bxl_cancel">ยกเลิก</button>
      <button type="button" class="btn-primary" id="bxl_save">บันทึก</button>
    </div>`;
  document.getElementById("bxl_parent").addEventListener("change", (e) => { document.getElementById("bxl_groupBox").hidden = !!e.target.value; });
  const hint = () => {
    const c = document.getElementById("bxl_code").value.trim();
    const p = typeof pcParse === "function" ? pcParse(c) : null;
    const el = document.getElementById("bxl_codeHint");
    if (!c) { el.textContent = "ไม่ใส่ก็ได้ — สร้างรหัสตามมาตรฐานได้ที่ R&D Workbench › คลังชิ้นส่วน"; return; }
    if (!p) { el.innerHTML = pcParseStd(c) ? pcChips(c) : `<span class="bx-low">ไม่ตรงมาตรฐานรหัส (เช่น K13A06552-00 หรือ P2xxxx) — ยังบันทึกได้</span>`; return; }
    el.innerHTML = `${pcChips(c)}${p.known ? "" : ' <span class="bx-low">แบรนด์ Item หรือประเภทไม่อยู่ในมาตรฐาน</span>'}`;
    const gi = document.getElementById("bxl_group");
    if (gi && (!gi.value || gi.value === BOM_GROUP_DEFAULT || Object.values(BOM_GROUP_BY_PREFIX).includes(gi.value) || /^\d{2} \|/.test(gi.value))) gi.value = p.groupLabel;
    const src = document.getElementById("bxl_source");
    if (src && p.type === "A" && !id) src.value = "ผลิตเอง";
  };
  document.getElementById("bxl_code").addEventListener("input", hint);
  hint();
  document.getElementById("bxl_cancel").addEventListener("click", () => document.getElementById("bxLineBackdrop").classList.remove("open"));
  document.getElementById("bxl_save").addEventListener("click", bxSaveLine);
  document.getElementById("bxLineBackdrop").classList.add("open");
  setTimeout(() => document.getElementById(line ? "bxl_qty" : "bxl_code").focus(), 0);
}

function bxSaveLine() {
  if (!bxEditing) return;
  const { model, id } = bxEditing;
  const v = (k) => document.getElementById(`bxl_${k}`).value.trim();
  const part = v("part");
  const qty = Number(v("qty"));
  if (!part) { document.getElementById("bxl_part").focus(); return; }
  if (!(qty > 0)) { document.getElementById("bxl_qty").focus(); return; }
  const lines = MASTER_BOM[model];
  const parent = v("parent");
  const data = { code: v("code"), part, qty, unit: v("unit"), source: v("source"), parent, station: v("station"), op: v("op"), note: v("note") };
  if (!parent) data.group = v("group") || BOM_GROUP_DEFAULT;
  const rev = BOM_META[model].rev;
  bomModel = model;
  if (id) {
    const line = lines.find((l) => l.id === id);
    const before = Object.assign({}, line);
    Object.assign(line, data);
    if (parent) delete line.group;
    const fields = [["code", "รหัส"], ["part", "ชื่อ"], ["qty", "จำนวน"], ["unit", "หน่วย"], ["source", "ผลิต/ซื้อ"], ["parent", "อยู่ภายใต้"], ["group", "กลุ่มงาน"], ["station", "ใช้ที่"], ["op", "ขั้นตอน"], ["note", "หมายเหตุ"]]
      .map(([key, label]) => ({ key, label }));
    const diff = typeof auditDiff === "function" ? auditDiff(before, line, fields) : "";
    bomAudit("แก้ไขรายการ BOM", `Rev.${rev} ${part}${diff ? `: ${diff}` : ""}`);
  } else {
    const line = Object.assign({ id: bomNewLineId() }, data);
    // insert after the parent's last descendant so the flat list stays readable
    let at = lines.length;
    if (parent) {
      const desc = bxDescendants(model, parent);
      desc.add(parent);
      lines.forEach((l, i) => { if (desc.has(l.id)) at = i + 1; });
    }
    lines.splice(at, 0, line);
    if (parent) { bxOpen.add(`${model}|${parent}`); bxSaveOpen(); }
    bomAudit("เพิ่มรายการ BOM", `Rev.${rev} ${parent ? "ชิ้นย่อย" : "ระดับบน"}: ${data.code ? data.code + " " : ""}${part}`);
  }
  document.getElementById("bxLineBackdrop").classList.remove("open");
  bxEditing = null;
  afterBomMutation();
  showToast("บันทึกรายการ BOM แล้ว", "good");
}

function bxDeleteLine(model, id) {
  const lines = MASTER_BOM[model];
  const i = lines.findIndex((l) => l.id === id);
  if (i < 0) return;
  const kids = lines.filter((l) => l.parent === id).length;
  if (!confirm(`ลบ "${lines[i].part}" ออกจาก BOM ${model}?${kids ? `\nชิ้นย่อย ${kids} รายการจะย้ายขึ้นไปอยู่ระดับเดียวกับรายการนี้` : ""}`)) return;
  const name = lines[i].part;
  bomModel = model;
  bomDeleteLine(model, i);
  bomAudit("ลบรายการ BOM", `Rev.${BOM_META[model].rev}: ${name}`);
  if (bxDetailKey && !bxRowFor(model, bxDetailKey)) bxDetailKey = "";
  afterBomMutation();
}

/* ---- tab: pick lines to requisition ------------------------------------------ */

function renderBxPick(pane) {
  const refs = bxRefs();
  if (bxRef && !refs.some((r) => r.ref === bxRef)) bxRef = "";
  const ctx = bxRef ? bxRefInfo(bxRef) : null;
  const canReq = bxCanRequest();
  const users = typeof AUTH !== "undefined" && AUTH ? AUTH.users.filter((u) => u.active) : [];
  const me = bxUser();
  const allowedReceivers = users.filter((u) => !BX_SETTINGS.requesters.length || BX_SETTINGS.requesters.includes(u.id) || u.role === "depthead" || u.role === "plant");
  let body = "";
  if (!ctx) {
    body = `<p class="muted-note">เลือกใบสั่งผลิตหรือใบงานบริการด้านบน — ระบบจะแสดงรายการตาม BOM ของรุ่นนั้นพร้อมจำนวนที่ต้องใช้ ที่เบิกไปแล้ว และที่ยังค้าง</p>`;
  } else if (!MASTER_BOM[ctx.model]) {
    body = `<p class="muted-note">ไม่พบ BOM ของรุ่น ${bxEsc(ctx.model || "(ไม่ระบุรุ่น)")} — ระบุรุ่นในใบงานก่อน</p>`;
  } else {
    const isService = ctx.kind === "บริการ";
    const use = bxRefUsage(ctx.ref);
    const need = isService ? {} : bxRequirement(ctx.model, ctx.qty);
    const q = bxPickSearch.trim().toLowerCase();
    const rows = bxTree(ctx.model).filter((r) => r.isGroup || isService || !r.hasKids);
    const match = (r) => !q || [r.line.code, r.line.part, r.line.station, r.no].some((v) => String(v || "").toLowerCase().includes(q));
    const vis = rows.filter((r) => r.isGroup ? rows.some((x) => x.line && x.group === r.group && match(x)) : match(r));
    const reqs = bxReqs().filter((d) => d.wo === ctx.ref && bxReqVisible(d));
    body = `
      ${reqs.length ? `<div class="bx-reqchips">ใบเบิกของงานนี้: ${reqs.map((d) => `<button type="button" class="rel-chip" data-openreq="${bxEsc(d.no)}">${bxEsc(d.no)} <span class="rel-status">(${bxEsc(d.status)})</span></button>`).join("")}</div>` : ""}
      <div class="table-scroll">
        <table class="data-table bx-pick">
          <thead><tr><th><input type="checkbox" id="bxPickAll" aria-label="เลือกทั้งหมด"></th><th>ข้อ</th><th>รหัส</th><th>ชื่อชิ้นส่วน</th><th>ใช้ที่</th>
            ${isService ? "" : `<th class="num">ต่อคัน</th><th class="num">ต้องใช้</th>`}
            <th class="num">เบิกแล้ว</th><th class="num">รอจ่าย</th>${isService ? "" : `<th class="num">ยังไม่ได้ขอ</th>`}<th>คงคลัง</th><th class="num">ขอเบิก</th></tr></thead>
          <tbody>
            ${vis.map((r) => {
              if (r.isGroup) return `<tr class="bx-group-row"><td></td><td class="bx-itemno">${bxEsc(r.no)}</td><td colspan="${isService ? 8 : 10}"><strong>${bxEsc(r.group)}</strong></td></tr>`;
              const l = r.line;
              const k = bxKey(l);
              const u = use[k] || { issued: 0, pending: 0, requested: 0 };
              const req = need[k] ? need[k].req : 0;
              const notAsked = Math.max(0, req - u.requested);
              const def = isService ? 1 : notAsked;
              const done = !isService && req > 0 && u.issued >= req;
              return `<tr class="${done ? "bx-done-row" : ""}">
                <td><input type="checkbox" class="bx-pick-chk" data-key="${bxEsc(k)}" data-def="${def}" aria-label="เลือก ${bxEsc(l.part)}"${!canReq ? " disabled" : ""}></td>
                <td class="bx-itemno">${bxEsc(r.no)}</td>
                <td class="mono-cell">${bxEsc(l.code || "—")}</td>
                <td><span style="padding-left:${(r.depth - 1) * 14}px">${bxEsc(l.part)}</span>${r.hasKids ? ` <span class="pill pill-schedule">ทั้งชุด</span>` : ""}</td>
                <td>${bxEsc(l.station || "—")}</td>
                ${isService ? "" : `<td class="num">${bxFmt(r.per)}</td><td class="num">${bxFmt(req)}</td>`}
                <td class="num">${bxFmt(u.issued)}</td>
                <td class="num">${u.pending ? `<strong class="bx-low">${bxFmt(u.pending)}</strong>` : "0"}</td>
                ${isService ? "" : `<td class="num">${notAsked ? `<strong>${bxFmt(notAsked)}</strong>` : done ? "✓ ครบ" : "0"}</td>`}
                <td>${bxStockCell(k)}</td>
                <td class="num"><input type="number" min="0" step="any" class="bx-qty" data-key="${bxEsc(k)}" data-no="${bxEsc(r.no)}" value="" placeholder="0" aria-label="จำนวนขอเบิก ${bxEsc(l.part)}"${!canReq ? " disabled" : ""}></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${canReq ? `
      <div class="bx-submit-row">
        <div class="form-field"><label for="bxReceiver">ผู้รับของ / ช่างที่ได้รับมอบหมาย</label>
          <select id="bxReceiver">${allowedReceivers.map((u) => `<option value="${bxEsc(u.id)}"${me && u.id === me.id ? " selected" : ""}>${bxEsc(u.name)}${u.position ? ` (${bxEsc(u.position)})` : ""}</option>`).join("") || `<option value="">${bxEsc(bxUserName())}</option>`}</select></div>
        <div class="form-field"><label for="bxReqNote">หมายเหตุถึงคลัง</label><input id="bxReqNote" placeholder="เช่น ต้องใช้ก่อน 10:00 น."></div>
        <div class="pilot-toolbar">
          ${isService ? "" : `<button type="button" class="btn-secondary" id="bxPickRemaining">เลือกทุกรายการที่ยังไม่ได้ขอ</button>`}
          <button type="button" class="btn-primary" id="bxSubmitReq">ส่งใบเบิก (<span id="bxPickCount">0</span> รายการ)</button>
        </div>
      </div>` : `<p class="muted-note">บัญชีนี้ไม่มีสิทธิ์สั่งเบิก — หัวหน้าแผนกหรือคลังสินค้ากำหนดผู้มีสิทธิ์เบิกได้ที่แท็บ "คงคลัง / สิทธิ์การเบิก"</p>`}`;
  }
  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>เลือกเบิกวัสดุตามรายการ BOM</h3>
        <p class="card-sub">ช่าง/หัวหน้าเลือกงาน → ระบบคำนวณ BOM × จำนวนคัน แสดงที่เบิกแล้ว รอจ่าย และที่ยังไม่ได้ขอ → ติ๊กรายการ ใส่จำนวน เลือกผู้รับของ แล้วส่งใบเบิกให้หัวหน้าอนุมัติและคลังจ่ายของ · งานผลิตเบิกระดับชิ้นย่อย งานบริการเบิกได้ทั้งชุด</p>
      </div>
      <div class="card-body">
        <div class="filter-row">
          <label for="bxRefSel">งาน:</label>
          <select id="bxRefSel"><option value="">— เลือกใบสั่งผลิต / ใบงานบริการ —</option>
            <optgroup label="ใบสั่งผลิต (ยังไม่เสร็จ)">${refs.filter((r) => r.kind === "ผลิต").map((r) => `<option value="${bxEsc(r.ref)}"${r.ref === bxRef ? " selected" : ""}>${bxEsc(r.label)}</option>`).join("")}</optgroup>
            <optgroup label="งานบริการหลังการขาย (ยังไม่ปิด)">${refs.filter((r) => r.kind === "บริการ").map((r) => `<option value="${bxEsc(r.ref)}"${r.ref === bxRef ? " selected" : ""}>${bxEsc(r.label)}</option>`).join("")}</optgroup>
          </select>
          ${ctx ? `<label for="bxPickSearch">ค้นหา:</label><input type="text" id="bxPickSearch" class="wo-search" placeholder="รหัส / ชื่อ / สถานี" value="${bxEsc(bxPickSearch)}">` : ""}
        </div>
        ${body}
      </div>
    </div>`;
  document.getElementById("bxRefSel").addEventListener("change", (e) => { bxRef = e.target.value; bxPickSearch = ""; renderBomx(); });
  const search = document.getElementById("bxPickSearch");
  if (search) search.addEventListener("input", (e) => {
    bxPickSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderBomx();
    const el = document.getElementById("bxPickSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  const count = () => {
    const n = [...pane.querySelectorAll(".bx-qty")].filter((i) => Number(i.value) > 0).length;
    const el = document.getElementById("bxPickCount"); if (el) el.textContent = n;
  };
  pane.querySelectorAll(".bx-pick-chk").forEach((c) => c.addEventListener("change", () => {
    const inp = pane.querySelector(`.bx-qty[data-key="${CSS.escape(c.dataset.key)}"]`);
    if (inp) inp.value = c.checked ? (Number(c.dataset.def) > 0 ? c.dataset.def : 1) : "";
    count();
  }));
  pane.querySelectorAll(".bx-qty").forEach((inp) => inp.addEventListener("input", () => {
    const c = pane.querySelector(`.bx-pick-chk[data-key="${CSS.escape(inp.dataset.key)}"]`);
    if (c) c.checked = Number(inp.value) > 0;
    count();
  }));
  const all = document.getElementById("bxPickAll");
  if (all) all.addEventListener("change", () => {
    pane.querySelectorAll(".bx-pick-chk:not(:disabled)").forEach((c) => {
      if (all.checked && Number(c.dataset.def) <= 0 && ctx && ctx.kind !== "บริการ") return;
      c.checked = all.checked; c.dispatchEvent(new Event("change"));
    });
  });
  const rem = document.getElementById("bxPickRemaining");
  if (rem) rem.addEventListener("click", () => {
    pane.querySelectorAll(".bx-pick-chk:not(:disabled)").forEach((c) => { c.checked = Number(c.dataset.def) > 0; c.dispatchEvent(new Event("change")); });
  });
  const sub = document.getElementById("bxSubmitReq");
  if (sub) sub.addEventListener("click", () => bxSubmitReq(ctx, pane));
  bxWireCommon(pane);
}

function bxSubmitReq(ctx, pane) {
  if (!ctx || !bxCanRequest()) return;
  const tree = bxTree(ctx.model);
  const items = [];
  pane.querySelectorAll(".bx-qty").forEach((inp) => {
    const qty = Number(inp.value);
    if (!(qty > 0)) return;
    const r = tree.find((x) => x.line && bxKey(x.line) === inp.dataset.key);
    if (!r) return;
    items.push({ key: bxKey(r.line), code: r.line.code || "", part: r.line.part, unit: r.line.unit || "", item: r.no, lineId: r.line.id, req: qty, issued: 0, ret: 0, log: [] });
  });
  if (!items.length) { showToast("ยังไม่ได้เลือกรายการหรือใส่จำนวน", "warn"); return; }
  const recvSel = document.getElementById("bxReceiver");
  const recvId = recvSel ? recvSel.value : "";
  const recv = recvId && typeof authUserById === "function" ? authUserById(recvId) : null;
  const note = (document.getElementById("bxReqNote") || {}).value || "";
  const me = bxUser();
  const doc = {
    no: deptNextNumber("mreq"),
    status: "รออนุมัติ",
    title: `${items[0].part}${items.length > 1 ? ` และอีก ${items.length - 1} รายการ` : ""}`,
    wo: ctx.ref, model: ctx.model, purpose: ctx.kind, qty: items.reduce((s, it) => s + it.req, 0),
    line: ctx.line, owner: recv ? recv.name : bxUserName(), receiver: recvId, requestedBy: bxUserName(),
    date: bxToday(), note: note.trim(), items,
    log: [{ at: new Date().toISOString(), by: bxUserName(), kind: "สั่งเบิก", note: recv && me && recv.id !== me.id ? `มอบหมายให้ ${recv.name} รับของ` : "" }],
  };
  if (me) stampRecord(doc, true);
  if (typeof auditLog === "function") auditLog("สร้างเอกสาร", doc.no, `MR: ${ctx.ref} · ${items.length} รายการ${recv ? ` · ผู้รับ ${recv.name}` : ""}`);
  DEPT_DOCS.mreq = DEPT_DOCS.mreq || [];
  DEPT_DOCS.mreq.push(doc);
  saveDeptDocs();
  if (typeof renderDept === "function") renderDept();
  renderBomx();
  bxOpenReq(doc.no);
  showToast(`ส่งใบเบิก ${doc.no} แล้ว — รอหัวหน้าอนุมัติ`, "good");
}

/* ---- requisition modal: approve / issue / return --------------------------- */

function bxOpenReq(no) {
  const i = bxReqIndex(no);
  if (i < 0) { showToast(`ไม่พบใบเบิก ${no}`, "warn"); return; }
  if (!bxReqVisible(DEPT_DOCS.mreq[i])) { showToast("ไม่มีสิทธิ์ดูใบเบิกนี้", "warn"); return; }
  bxReqOpenNo = no;
  bxRenderReqModal();
  document.getElementById("bxReqBackdrop").classList.add("open");
}

function bxRenderReqModal() {
  const i = bxReqIndex(bxReqOpenNo);
  const box = document.getElementById("bxReqBody");
  if (i < 0 || !box) return;
  const d = DEPT_DOCS.mreq[i];
  if (!Array.isArray(d.items)) { document.getElementById("bxReqBackdrop").classList.remove("open"); openDocView("mreq", i); return; }
  const open = BX_OPEN_REQ.includes(d.status);
  const me = bxUser();
  const canApprove = bxCanApprove() && d.status === "รออนุมัติ";
  const canIssue = bxCanIssue() && (d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน");
  const isReceiver = me && (d.receiver === me.id || d.createdBy === me.id);
  const canReturn = (bxCanIssue() || isReceiver) && d.items.some((it) => bxNum(it.issued) - bxNum(it.ret) > 0);
  const logs = [].concat(d.log || []).concat(...d.items.map((it) => (it.log || []).map((g) => Object.assign({ part: `${it.code || ""} ${it.part}` }, g))))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const age = open ? bxDaysBetween(d.date, bxToday()) : null;
  const ref = d.wo || "";
  box.innerHTML = `
    <div class="bx-req-head">
      <div>
        <h3>${bxEsc(d.no)} ${bxStatusPill("mreq", d.status)}</h3>
        <p class="card-sub">งาน <strong>${bxEsc(ref)}</strong> · รุ่น ${bxEsc(d.model || "—")} · ${bxEsc(d.purpose || "")} · สั่งเบิกโดย ${bxEsc(d.requestedBy || authUserName(d.createdBy))} · ผู้รับของ <strong>${bxEsc(d.owner || "—")}</strong> · ${formatThaiDate(d.date)}${age !== null ? ` · รอมา ${age} วัน · อยู่ที่: ${bxEsc(bxReqHolder(d))}` : ""}</p>
        ${d.note ? `<p class="muted-note">หมายเหตุ: ${bxEsc(d.note)}</p>` : ""}
      </div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>ข้อ</th><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th class="num">ขอ</th><th class="num">จ่ายแล้ว</th><th class="num">คืน</th><th class="num">ค้างจ่าย</th><th>คงคลัง</th>${canIssue ? `<th class="num">จ่ายครั้งนี้</th>` : ""}${canReturn ? `<th class="num">คืนคลัง</th>` : ""}</tr></thead>
        <tbody>${d.items.map((it, k) => {
          const out = bxItemOutstanding(d, it);
          const s = bxStock(it.key);
          const defIssue = s ? Math.max(0, Math.min(out, bxNum(s.qty))) : out;
          return `<tr>
            <td class="bx-itemno">${bxEsc(it.item || "")}</td>
            <td class="mono-cell"><button type="button" class="bx-link" data-detail="${bxEsc(it.key)}">${bxEsc(it.code || "—")}</button></td>
            <td>${bxEsc(it.part)}</td><td>${bxEsc(it.unit)}</td>
            <td class="num">${bxFmt(it.req)}</td><td class="num">${bxFmt(it.issued)}</td><td class="num">${bxFmt(it.ret)}</td>
            <td class="num">${out ? `<strong class="bx-low">${bxFmt(out)}</strong>` : "0"}</td>
            <td>${bxStockCell(it.key)}${s && out > bxNum(s.qty) ? ` <span class="pill pill-critical">ไม่พอ</span>` : ""}</td>
            ${canIssue ? `<td class="num"><input type="number" min="0" step="any" class="bx-issue" data-k="${k}" value="${out ? defIssue : ""}" aria-label="จ่ายครั้งนี้"${out ? "" : " disabled"}></td>` : ""}
            ${canReturn ? `<td class="num"><input type="number" min="0" step="any" class="bx-return" data-k="${k}" value="" placeholder="0" aria-label="คืนคลัง"${bxNum(it.issued) - bxNum(it.ret) > 0 ? "" : " disabled"}></td>` : ""}
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    ${canApprove || canIssue || canReturn ? `<div class="form-field"><label for="bxReqActNote">หมายเหตุการดำเนินการ</label><input id="bxReqActNote" placeholder="เช่น เหตุผลที่ปฏิเสธ / จ่ายแทนด้วยรหัสใหม่"></div>` : ""}
    <div class="bx-log">
      <div class="bx-docgroup-title">ประวัติ: ใครทำอะไร เมื่อไร</div>
      ${logs.length ? `<ul class="bx-list">${logs.map((g) => `<li>${fmtDateTime(g.at)} · <strong>${bxEsc(g.by)}</strong> · ${bxEsc(g.kind)}${g.part ? ` ${bxEsc(g.part)}` : ""}${g.qty ? ` × ${bxFmt(g.qty)}` : ""}${g.note ? ` — ${bxEsc(g.note)}` : ""}</li>`).join("")}</ul>` : `<p class="muted-inline">ยังไม่มีการดำเนินการ</p>`}
    </div>
    <div class="modal-actions">
      ${canApprove ? `<button type="button" class="btn-secondary" id="bxReject">ปฏิเสธ</button><button type="button" class="btn-primary" id="bxApprove">อนุมัติ</button>` : ""}
      ${canIssue ? `<button type="button" class="btn-primary" id="bxIssue">บันทึกจ่ายของ</button>` : ""}
      ${canIssue && d.status === "จ่ายบางส่วน" ? `<button type="button" class="btn-secondary" id="bxCloseShort">ปิดใบเบิก (ไม่จ่ายส่วนที่เหลือ)</button>` : ""}
      ${canReturn ? `<button type="button" class="btn-secondary" id="bxReturn">บันทึกคืนคลัง</button>` : ""}
      <button type="button" class="btn-secondary" id="bxReqPaper">📄 ใบเบิก / PDF</button>
      <button type="button" class="btn-secondary" id="bxReqClose">ปิด</button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const note = () => ($("bxReqActNote") ? $("bxReqActNote").value.trim() : "");
  $("bxReqClose").addEventListener("click", () => { document.getElementById("bxReqBackdrop").classList.remove("open"); bxReqOpenNo = null; });
  $("bxReqPaper").addEventListener("click", () => { document.getElementById("bxReqBackdrop").classList.remove("open"); openDocView("mreq", bxReqIndex(d.no)); });
  if ($("bxApprove")) $("bxApprove").addEventListener("click", () => bxReqAction(d, "อนุมัติ", note()));
  if ($("bxReject")) $("bxReject").addEventListener("click", () => {
    if (!note()) { showToast("ใส่เหตุผลที่ปฏิเสธในช่องหมายเหตุก่อน", "warn"); $("bxReqActNote").focus(); return; }
    bxReqAction(d, "ปฏิเสธ", note());
  });
  if ($("bxIssue")) $("bxIssue").addEventListener("click", () => bxIssue(d, note()));
  if ($("bxCloseShort")) $("bxCloseShort").addEventListener("click", () => {
    if (!confirm("ปิดใบเบิกนี้โดยไม่จ่ายส่วนที่ค้าง? ยอดค้างจะไม่ถูกนับอีก (เปิดใบเบิกใหม่ได้ภายหลัง)")) return;
    bxReqAction(d, "จ่ายของแล้ว", note() || "ปิดยอดค้าง");
  });
  if ($("bxReturn")) $("bxReturn").addEventListener("click", () => bxReturn(d, note()));
  bxWireCommon(box);
}

function bxAfterReqChange(d) {
  if (bxUser()) stampRecord(d, false);
  saveDeptDocs();
  bxSaveStock();
  bxUpdateWoProgress(d.wo);
  if (typeof renderDept === "function") renderDept();
  if (typeof renderService === "function") renderService();
  renderBomx();
  bxRenderReqModal();
}

function bxReqAction(d, status, note) {
  const before = d.status;
  d.status = status;
  d.log = d.log || [];
  d.log.push({ at: new Date().toISOString(), by: bxUserName(), kind: status === "จ่ายของแล้ว" ? "ปิดใบเบิก" : status, note });
  if (typeof auditLog === "function") auditLog("แก้ไขเอกสาร", d.no, `สถานะ: "${before}" → "${status}"${note ? ` · ${note}` : ""}`);
  bxAfterReqChange(d);
  showToast(`${d.no}: ${status}`, status === "ปฏิเสธ" ? "warn" : "good");
}

function bxIssue(d, note) {
  const inputs = [...document.querySelectorAll("#bxReqBody .bx-issue")];
  const plan = [];
  for (const inp of inputs) {
    const n = Number(inp.value);
    if (!(n > 0)) continue;
    const it = d.items[Number(inp.dataset.k)];
    const out = bxItemOutstanding(d, it);
    if (n > out) { showToast(`${it.part}: จ่ายได้ไม่เกิน ${bxFmt(out)}`, "warn"); inp.focus(); return; }
    const s = bxStock(it.key);
    if (s && n > bxNum(s.qty)) { showToast(`${it.part}: คงคลังมีแค่ ${bxFmt(s.qty)}`, "warn"); inp.focus(); return; }
    plan.push({ it, n, s });
  }
  if (!plan.length) { showToast("ใส่จำนวนที่จ่ายครั้งนี้ก่อน", "warn"); return; }
  const at = new Date().toISOString();
  plan.forEach(({ it, n, s }) => {
    it.issued = bxNum(it.issued) + n;
    it.log = it.log || [];
    it.log.push({ at, by: bxUserName(), kind: "จ่าย", qty: n, note: d.owner ? `ให้ ${d.owner}${note ? ` · ${note}` : ""}` : note });
    if (s) s.qty = bxNum(s.qty) - n;
  });
  const before = d.status;
  d.status = d.items.every((it) => bxNum(it.issued) >= bxNum(it.req)) ? "จ่ายของแล้ว" : "จ่ายบางส่วน";
  if (typeof auditLog === "function") auditLog("จ่ายของตามใบเบิก", d.no, `${plan.map(({ it, n }) => `${it.code || it.part} × ${n}`).join(", ")} · สถานะ "${before}" → "${d.status}"`);
  bxAfterReqChange(d);
  showToast(`บันทึกจ่ายของ ${d.no} แล้ว (${d.status})`, "good");
}

function bxReturn(d, note) {
  const plan = [];
  for (const inp of document.querySelectorAll("#bxReqBody .bx-return")) {
    const n = Number(inp.value);
    if (!(n > 0)) continue;
    const it = d.items[Number(inp.dataset.k)];
    const max = bxNum(it.issued) - bxNum(it.ret);
    if (n > max) { showToast(`${it.part}: คืนได้ไม่เกิน ${bxFmt(max)}`, "warn"); inp.focus(); return; }
    plan.push({ it, n });
  }
  if (!plan.length) { showToast("ใส่จำนวนที่คืนก่อน", "warn"); return; }
  const at = new Date().toISOString();
  plan.forEach(({ it, n }) => {
    it.ret = bxNum(it.ret) + n;
    it.log = it.log || [];
    it.log.push({ at, by: bxUserName(), kind: "คืนคลัง", qty: n, note });
    const s = bxStock(it.key);
    if (s) s.qty = bxNum(s.qty) + n;
  });
  if (typeof auditLog === "function") auditLog("คืนของเข้าคลัง", d.no, plan.map(({ it, n }) => `${it.code || it.part} × ${n}`).join(", "));
  bxAfterReqChange(d);
  showToast(`บันทึกคืนคลังแล้ว`, "good");
}

/* ---- tab: tracking (requisitions, outstanding per job, shortages) ------------ */

function renderBxTrack(pane) {
  const s = bxOutstandingSummary();
  const me = bxUser();
  const q = bxReqSearch.trim().toLowerCase();
  const filters = [["open", "ยังไม่ปิด"], ["approve", "รออนุมัติ"], ["issue", "รอคลังจ่าย"], ["mine", "ของฉัน"], ["all", "ทั้งหมด"]];
  const list = s.reqs.filter((d) => {
    if (bxReqFilter === "open" && !BX_OPEN_REQ.includes(d.status)) return false;
    if (bxReqFilter === "approve" && d.status !== "รออนุมัติ") return false;
    if (bxReqFilter === "issue" && !(d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน")) return false;
    if (bxReqFilter === "mine" && !(me && (d.createdBy === me.id || d.receiver === me.id))) return false;
    if (q && ![d.no, d.wo, d.model, d.owner, d.title].concat(d.items.map((it) => `${it.code} ${it.part}`)).some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));

  const refsWithReq = new Set(s.reqs.map((d) => d.wo));
  const woRows = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์").map((w) => {
    const need = Object.values(bxRequirement(w.model, bxNum(w.qty) || 1));
    const use = bxRefUsage(w.wo);
    const full = need.filter((n) => (use[n.key] || {}).issued >= n.req).length;
    const notAsked = need.filter((n) => ((use[n.key] || {}).requested || 0) < n.req).length;
    const pending = need.filter((n) => (use[n.key] || {}).pending > 0).length;
    return { w, need: need.length, full, notAsked, pending, tracked: refsWithReq.has(w.wo) };
  });
  const shortRows = Object.keys(s.demand).map((k) => {
    const st = bxStock(k);
    let line = null;
    MACHINE_MODELS.some((m) => { const r = bxRowFor(m, k); if (r) { line = r.line; return true; } return false; });
    const any = s.reqs.find((d) => d.items.some((it) => it.key === k));
    const it = any ? any.items.find((x) => x.key === k) : null;
    const l = line || { code: it ? it.code : "", part: it ? it.part : k, unit: it ? it.unit : "" };
    const have = st ? bxNum(st.qty) : null;
    return { k, l, demand: s.demand[k], have, short: have === null ? null : Math.max(0, s.demand[k] - have), p2p: bxP2PFor(l) };
  }).sort((a, b) => (b.short || 0) - (a.short || 0));

  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>ใบเบิกวัสดุ — อยู่ขั้นไหน อยู่ที่ใคร รอมากี่วัน</h3>
        <p class="card-sub">รออนุมัติ → หัวหน้าแผนกผู้เบิก · อนุมัติ/จ่ายบางส่วน → คลังสินค้า · กดเลขที่เพื่ออนุมัติ จ่ายของ คืนของ หรือพิมพ์ใบเบิก</p>
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <label for="bxReqFilter">แสดง:</label>
          <select id="bxReqFilter">${filters.map(([v, t]) => `<option value="${v}"${v === bxReqFilter ? " selected" : ""}>${t}</option>`).join("")}</select>
          <label for="bxReqSearch">ค้นหา:</label>
          <input type="text" id="bxReqSearch" class="wo-search" placeholder="MR / WO / SV / รหัส / ชื่อชิ้นส่วน / ผู้รับ" value="${bxEsc(bxReqSearch)}">
        </div>
        <table class="data-table">
          <thead><tr><th>เลขที่</th><th>งาน</th><th>รุ่น</th><th>ผู้รับของ</th><th>วันที่</th><th class="num">รอมา</th><th class="num">รายการ</th><th>จ่ายแล้ว</th><th>อยู่ที่</th><th>สถานะ</th></tr></thead>
          <tbody>${list.map((d) => {
            const req = d.items.reduce((n, it) => n + bxNum(it.req), 0);
            const iss = d.items.reduce((n, it) => n + Math.min(bxNum(it.req), bxNum(it.issued)), 0);
            const pct = req ? Math.round((iss / req) * 100) : 0;
            const open = BX_OPEN_REQ.includes(d.status);
            const age = open ? bxDaysBetween(d.date, bxToday()) : "";
            return `<tr>
              <td><button type="button" class="bx-link" data-openreq="${bxEsc(d.no)}">${bxEsc(d.no)}</button></td>
              <td>${bxEsc(d.wo)}</td><td>${bxEsc(d.model || "")}</td><td>${bxEsc(d.owner || "")}</td><td>${formatThaiDate(d.date)}</td>
              <td class="num">${age === "" ? "" : `<span class="${age >= 2 ? "bx-neg" : ""}">${age} วัน</span>`}</td>
              <td class="num">${d.items.length}</td>
              <td><div class="bx-bar" title="${pct}%"><span style="width:${pct}%"></span></div> <span class="muted-inline">${pct}%</span></td>
              <td>${bxEsc(bxReqHolder(d))}</td><td>${bxStatusPill("mreq", d.status)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="10" class="muted-inline">ไม่มีใบเบิกตามตัวกรองนี้</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="p2p-stack">
      <div class="card">
        <div class="card-header">
          <h3>ค้างเบิกตามใบสั่งผลิต</h3>
          <p class="card-sub">นับเฉพาะชิ้นที่เบิกได้ (ชิ้นย่อย) × จำนวนคัน · กด "เลือกเบิก" เพื่อเบิกส่วนที่ยังไม่ได้ขอ</p>
        </div>
        <div class="card-body table-scroll">
          <table class="data-table">
            <thead><tr><th>ใบสั่งผลิต</th><th>รุ่น × คัน</th><th class="num">รายการ</th><th class="num">ครบแล้ว</th><th class="num">รอคลังจ่าย</th><th class="num">ยังไม่ได้ขอ</th><th>เบิกแล้ว</th><th></th></tr></thead>
            <tbody>${woRows.map((r) => `<tr>
              <td>${bxEsc(r.w.wo)}<div class="muted-inline">${bxEsc(r.w.department)}</div></td><td>${bxEsc(r.w.model)} × ${bxEsc(r.w.qty)}</td>
              <td class="num">${r.need}</td><td class="num">${r.full}</td><td class="num">${r.pending}</td><td class="num">${r.notAsked ? `<strong>${r.notAsked}</strong>` : 0}</td>
              <td><div class="bx-bar"><span style="width:${Math.min(100, bxNum(r.w.issuedPct))}%"></span></div> <span class="muted-inline">${bxNum(r.w.issuedPct)}%${r.tracked ? "" : "*"}</span></td>
              <td>${bxCanRequest() ? `<button type="button" class="btn-chip" data-pickref="${bxEsc(r.w.wo)}">เลือกเบิก</button>` : ""}</td>
            </tr>`).join("")}</tbody>
          </table>
          <p class="muted-note">* ยังไม่มีใบเบิกผ่านระบบ — % มาจากที่บันทึกในหน้าใบสั่งผลิต</p>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>ของไม่พอจ่าย / ต้องตามของ</h3>
          <p class="card-sub">ยอดค้างจ่ายของใบเบิกที่ยังเปิดอยู่ เทียบคงคลัง พร้อม PR/PO ที่กำลังตามอยู่</p>
        </div>
        <div class="card-body table-scroll">
          <table class="data-table">
            <thead><tr><th>ชิ้นส่วน</th><th class="num">ค้างจ่าย</th><th class="num">คงคลัง</th><th class="num">ขาด</th><th>PR / PO</th></tr></thead>
            <tbody>${shortRows.map((r) => `<tr>
              <td><button type="button" class="bx-link" data-detail="${bxEsc(r.k)}">${bxEsc(r.l.code || "")} ${bxEsc(r.l.part)}</button></td>
              <td class="num">${bxFmt(r.demand)}</td><td class="num">${r.have === null ? "—" : bxFmt(r.have)}</td>
              <td class="num">${r.short ? `<strong class="bx-neg">${bxFmt(r.short)}</strong>` : r.short === 0 ? "0" : "—"}</td>
              <td>${r.p2p.map(bxP2PChip).join("") || (r.short ? `<button type="button" class="btn-chip" data-openpr="${bxEsc(r.k)}" data-qty="${r.short}">+ เปิด PR</button>` : "")}</td>
            </tr>`).join("") || `<tr><td colspan="5" class="muted-inline">ไม่มียอดค้างจ่าย</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  document.getElementById("bxReqFilter").addEventListener("change", (e) => { bxReqFilter = e.target.value; renderBomx(); });
  document.getElementById("bxReqSearch").addEventListener("input", (e) => {
    bxReqSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderBomx();
    const el = document.getElementById("bxReqSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  pane.querySelectorAll("[data-openpr]").forEach((b) => b.addEventListener("click", () => {
    const r = shortRows.find((x) => x.k === b.dataset.openpr);
    if (r) bxOpenPR(r.l, Number(b.dataset.qty), "");
  }));
  bxWireCommon(pane);
}

function bxOpenPR(line, qty, wo) {
  if (!bxViewAllowed("p2p") || typeof openP2PNew !== "function") { showToast("บัญชีนี้ไม่มีสิทธิ์เปิดคำขอซื้อ", "warn"); return; }
  switchView("p2p");
  openP2PNew();
  document.getElementById("p2pNewItem").value = `${line.code ? line.code + " " : ""}${line.part}`;
  document.getElementById("p2pNewQty").value = qty || "";
  document.getElementById("p2pNewUnit").value = line.unit || "ชิ้น";
  document.getElementById("p2pNewWo").value = wo || "";
  document.getElementById("p2pNewNote").value = "ของไม่พอจ่ายตามใบเบิก / แผนความต้องการวัสดุ (จากหน้า BOM & เบิกวัสดุ)";
}

/* ---- tab: material planning (MRP) for the planning department ---------------- */

function bxMrpRows() {
  const rows = {};
  WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์" && (!bxMrpModel || w.model === bxMrpModel)).forEach((w) => {
    const need = bxRequirement(w.model, bxNum(w.qty) || 1);
    const use = bxRefUsage(w.wo);
    Object.values(need).forEach((n) => {
      const remain = Math.max(0, n.req - Math.max(0, (use[n.key] || {}).issued || 0));
      const r = rows[n.key] = rows[n.key] || { key: n.key, line: n.line, gross: 0, remain: 0, wos: [] };
      r.gross += n.req;
      r.remain += remain;
      if (remain > 0) r.wos.push(`${w.wo} (${bxFmt(remain)})`);
    });
  });
  return Object.values(rows).map((r) => {
    const st = bxStock(r.key);
    const have = st ? bxNum(st.qty) : 0;
    const onOrder = bxP2POnOrder(r.line);
    const net = Math.max(0, r.remain - have - onOrder);
    return Object.assign(r, { have, tracked: !!st, onOrder, net, p2p: bxP2PFor(r.line), min: st ? bxNum(st.min) : 0 });
  }).sort((a, b) => b.net - a.net || String(a.line.code).localeCompare(String(b.line.code)));
}

function renderBxMrp(pane) {
  const rows = bxMrpRows();
  const shown = bxMrpShortOnly ? rows.filter((r) => r.net > 0) : rows;
  const canMrq = bxCan("mrq", "create");
  const openMrq = (DEPT_DOCS.mrq || []).filter((d) => deptIsOpen("mrq", d));
  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>วางแผนความต้องการวัสดุ (MRP) — ฝ่ายวางแผนการผลิต</h3>
        <p class="card-sub">ความต้องการคงเหลือ = BOM × จำนวนคันของทุกใบสั่งผลิตที่ยังไม่เสร็จ − ที่เบิกไปแล้ว → หักคงคลังและของที่สั่งซื้ออยู่ (PR/PO ที่ยังไม่รับของ) = ต้องสั่งเพิ่ม · ออกใบแจ้งความต้องการ (MRQ) ให้จัดซื้อ หรือเปิด PR ได้ทันที</p>
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <label for="bxMrpModel">รุ่น:</label>
          <select id="bxMrpModel"><option value="">ทุกรุ่น</option>${MACHINE_MODELS.map((m) => `<option${m === bxMrpModel ? " selected" : ""}>${bxEsc(m)}</option>`).join("")}</select>
          <label class="vis-opt"><input type="checkbox" id="bxMrpShort"${bxMrpShortOnly ? " checked" : ""}> เฉพาะที่ต้องสั่งเพิ่ม</label>
          <span class="muted-inline">${rows.filter((r) => r.net > 0).length} รายการต้องสั่งเพิ่ม จาก ${rows.length}</span>
        </div>
        <table class="data-table">
          <thead><tr><th>ชิ้นส่วน</th><th>ทำ/ซื้อ</th><th class="num">ต้องใช้รวม</th><th class="num">ยังต้องเบิก</th><th class="num">คงคลัง</th><th class="num">สั่งซื้ออยู่</th><th class="num">ต้องสั่งเพิ่ม</th><th>ใบสั่งผลิตที่รอ</th><th>PR / PO</th><th></th></tr></thead>
          <tbody>${shown.map((r) => `<tr>
            <td><button type="button" class="bx-link" data-detail="${bxEsc(r.key)}">${bxEsc(r.line.code || "")} ${bxEsc(r.line.part)}</button></td>
            <td>${bxEsc(r.line.source || "—")}</td>
            <td class="num">${bxFmt(r.gross)}</td><td class="num">${bxFmt(r.remain)}</td>
            <td class="num">${r.tracked ? bxFmt(r.have) : "—"}</td><td class="num">${bxFmt(r.onOrder)}</td>
            <td class="num">${r.net ? `<strong class="bx-neg">${bxFmt(r.net)}</strong>` : "0"}</td>
            <td class="muted-inline">${bxEsc(r.wos.join(", "))}</td>
            <td>${r.p2p.map(bxP2PChip).join("")}</td>
            <td class="wo-actions-cell">${r.net ? `${canMrq ? `<button type="button" class="btn-chip" data-mrq="${bxEsc(r.key)}">ออก MRQ</button>` : ""}${r.line.source !== "ผลิตเอง" ? `<button type="button" class="btn-chip" data-openpr="${bxEsc(r.key)}">+ เปิด PR</button>` : ""}` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="10" class="muted-inline">${bxMrpShortOnly ? "ไม่มีรายการที่ต้องสั่งเพิ่ม 🎉" : "ไม่มีใบสั่งผลิตที่ยังไม่เสร็จ"}</td></tr>`}</tbody>
        </table>
        ${openMrq.length ? `<h4 class="bx-h4">ใบแจ้งความต้องการวัสดุ (MRQ) ที่ยังเปิดอยู่</h4><div>${openMrq.map((d) => `<button type="button" class="rel-chip" data-docno="${bxEsc(d.no)}">${bxEsc(d.no)} — ${bxEsc(d.title)} × ${bxEsc(d.qty)} <span class="rel-status">(${bxEsc(d.status)})</span></button>`).join("")}</div>` : ""}
      </div>
    </div>`;
  document.getElementById("bxMrpModel").addEventListener("change", (e) => { bxMrpModel = e.target.value; renderBomx(); });
  document.getElementById("bxMrpShort").addEventListener("change", (e) => { bxMrpShortOnly = e.target.checked; renderBomx(); });
  pane.querySelectorAll("[data-openpr]").forEach((b) => b.addEventListener("click", () => {
    const r = rows.find((x) => x.key === b.dataset.openpr);
    if (r) bxOpenPR(r.line, r.net, r.wos.map((w) => w.split(" ")[0]).join(", "));
  }));
  pane.querySelectorAll("[data-mrq]").forEach((b) => b.addEventListener("click", () => {
    const r = rows.find((x) => x.key === b.dataset.mrq);
    if (!r) return;
    const models = [...new Set(WORK_ORDERS.filter((w) => r.wos.some((x) => x.startsWith(w.wo))).map((w) => w.model))];
    const doc = {
      no: deptNextNumber("mrq"), status: DOC_TYPES.mrq.statuses[0][0],
      title: `${r.line.code ? r.line.code + " " : ""}${r.line.part} (สำหรับ ${r.wos.map((w) => w.split(" ")[0]).join(", ")})`,
      model: models.length === 1 ? models[0] : "", qty: r.net, need: "", owner: bxUserName(), date: bxToday(),
    };
    if (bxUser()) stampRecord(doc, true);
    if (typeof auditLog === "function") auditLog("สร้างเอกสาร", doc.no, `MRQ จากแผนความต้องการวัสดุ: ${doc.title} × ${r.net}`);
    DEPT_DOCS.mrq = DEPT_DOCS.mrq || [];
    DEPT_DOCS.mrq.push(doc);
    saveDeptDocs();
    if (typeof renderDept === "function") renderDept();
    renderBomx();
    showToast(`ออก ${doc.no} แล้ว — ส่งจัดซื้อได้จากหน้าเอกสารฝ่ายวางแผน`, "good");
  }));
  bxWireCommon(pane);
}

/* ---- tab: stock on hand + who may requisition / issue ------------------------- */

function bxAllParts() {
  const map = new Map();
  MACHINE_MODELS.forEach((m) => bxTree(m).forEach((r) => {
    if (!r.line) return;
    const k = bxKey(r.line);
    if (!k) return;
    const e = map.get(k) || { key: k, line: r.line, models: [] };
    if (!e.models.includes(m)) e.models.push(m);
    map.set(k, e);
  }));
  Object.keys(BX_STOCK).forEach((k) => { if (!map.has(k)) map.set(k, { key: k, line: { code: k, part: k, unit: "" }, models: [] }); });
  return [...map.values()].sort((a, b) => String(a.line.code || a.key).localeCompare(String(b.line.code || b.key)));
}

function renderBxStockTab(pane) {
  const s = bxOutstandingSummary();
  const can = bxCanStock();
  const q = bxStockSearch.trim().toLowerCase();
  const parts = bxAllParts().filter((p) => !q || [p.key, p.line.part, (bxStock(p.key) || {}).loc].some((v) => String(v || "").toLowerCase().includes(q)));
  const users = typeof AUTH !== "undefined" && AUTH ? AUTH.users.filter((u) => u.active && u.role !== "admin") : [];
  const canSet = bxCanSettings();
  const chk = (group, u) => `<label class="vis-opt"><input type="checkbox" data-bxset="${group}" value="${bxEsc(u.id)}"${BX_SETTINGS[group].includes(u.id) ? " checked" : ""}${canSet ? "" : " disabled"}> ${bxEsc(u.name)}</label>`;
  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>สิทธิ์การเบิก — ใครสั่งเบิกได้ ใครจ่ายของได้</h3>
        <p class="card-sub">ไม่ติ๊กใครเลย = ทุกคนที่มีสิทธิ์สร้างใบเบิกตามแผนก (ค่าเริ่มต้น) · ติ๊กแล้ว = เฉพาะช่างที่เลือก (หัวหน้าแผนก/ผู้จัดการยังสั่งเบิกและมอบหมายช่างรับของได้เสมอ) · ผู้จ่ายของ = คลังสินค้าและหัวหน้าแผนก รวมถึงคนที่ติ๊กเพิ่ม · สมาชิกกลุ่มผู้ใช้ที่มีสิทธิ์ "สั่งเบิก" / "จ่ายของ" (Admin › กลุ่มผู้ใช้) ได้สิทธิ์นั้นเสมอ${typeof AUTH !== "undefined" && AUTH && AUTH.groups ? ` — ${AUTH.groups.filter((g) => (g.abilities || []).some((a) => a === "request" || a === "issue")).map((g) => bxEsc(g.name)).join(", ")}` : ""}</p>
      </div>
      <div class="card-body bx-detail-grid">
        <div><div class="vis-group-title">ช่าง / ผู้มีสิทธิ์สั่งเบิก</div><div class="bx-userlist">${users.map((u) => chk("requesters", u)).join("")}</div></div>
        <div><div class="vis-group-title">ผู้จ่ายของเพิ่มเติม (นอกจากคลังสินค้า)</div><div class="bx-userlist">${users.map((u) => chk("issuers", u)).join("")}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>คงคลัง (Stock on hand) ${can ? "" : `<span class="muted-inline">— ดูอย่างเดียว</span>`}</h3>
        <p class="card-sub">จ่ายของ/คืนของตามใบเบิกจะตัด/เพิ่มยอดให้อัตโนมัติ · ปรับยอดหลังตรวจนับ (STK) หรือรับของ (GRN) ได้ที่นี่ ทุกการปรับบันทึกในประวัติ</p>
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row"><label for="bxStockSearch">ค้นหา:</label><input type="text" id="bxStockSearch" class="wo-search" placeholder="รหัส / ชื่อ / ที่เก็บ" value="${bxEsc(bxStockSearch)}"></div>
        <table class="data-table">
          <thead><tr><th>รหัส</th><th>ชื่อชิ้นส่วน</th><th>ใช้ในรุ่น</th><th>ที่เก็บ</th><th class="num">คงคลัง</th><th class="num">จุดสั่งซื้อ</th><th class="num">ค้างจ่าย</th><th class="num">หลังจ่ายครบ</th><th>สถานะ</th></tr></thead>
          <tbody>${parts.map((p) => {
            const st = bxStock(p.key) || {};
            const dem = s.demand[p.key] || 0;
            const after = bxNum(st.qty) - dem;
            const status = !bxStock(p.key) ? bxPill("ยังไม่ตั้งยอด", "neutral") : after < 0 ? bxPill("ไม่พอจ่าย", "critical") : st.min && after <= bxNum(st.min) ? bxPill("ถึงจุดสั่งซื้อ", "warning") : bxPill("ปกติ", "good");
            const inp = (f, v, type) => can ? `<input class="bom-inline bx-stock-in" data-key="${bxEsc(p.key)}" data-f="${f}" ${type === "n" ? `type="number" step="any"` : ""} value="${bxEsc(v ?? "")}" aria-label="${f} ${bxEsc(p.line.part)}">` : bxEsc(v ?? "—");
            return `<tr>
              <td class="mono-cell"><button type="button" class="bx-link" data-stockdetail="${bxEsc(p.key)}" data-model="${bxEsc(p.models[0] || "")}">${bxEsc(p.line.code || "—")}</button></td>
              <td>${bxEsc(p.line.part)}</td><td class="muted-inline">${bxEsc(p.models.join(", "))}</td>
              <td>${inp("loc", st.loc)}</td><td class="num">${inp("qty", st.qty, "n")}</td><td class="num">${inp("min", st.min, "n")}</td>
              <td class="num">${dem ? bxFmt(dem) : "0"}</td><td class="num">${bxStock(p.key) ? `<span class="${after < 0 ? "bx-neg" : ""}">${bxFmt(after)}</span>` : "—"}</td>
              <td>${status}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("bxStockSearch").addEventListener("input", (e) => {
    bxStockSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderBomx();
    const el = document.getElementById("bxStockSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  pane.querySelectorAll("[data-bxset]").forEach((c) => c.addEventListener("change", () => {
    const g = c.dataset.bxset;
    BX_SETTINGS[g] = [...pane.querySelectorAll(`[data-bxset="${g}"]:checked`)].map((x) => x.value);
    bxSaveStock();
    if (typeof auditLog === "function") auditLog("ตั้งค่าสิทธิ์การเบิก", g === "requesters" ? "ผู้มีสิทธิ์สั่งเบิก" : "ผู้จ่ายของ", BX_SETTINGS[g].map((id) => authUserName(id)).join(", ") || "ทุกคนตามสิทธิ์แผนก");
    showToast("บันทึกสิทธิ์การเบิกแล้ว", "good");
  }));
  pane.querySelectorAll(".bx-stock-in").forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.key;
    const f = el.dataset.f;
    const st = BX_STOCK[k] = BX_STOCK[k] || { qty: 0, loc: "" };
    const prev = st[f];
    st[f] = f === "loc" ? el.value.trim() : Number(el.value) || 0;
    bxSaveStock();
    if (typeof auditLog === "function") auditLog("ปรับยอดคงคลัง", k, `${f === "qty" ? "คงคลัง" : f === "min" ? "จุดสั่งซื้อ" : "ที่เก็บ"}: "${prev ?? ""}" → "${st[f]}"`);
    renderBxStats();
  }));
  pane.querySelectorAll("[data-stockdetail]").forEach((b) => b.addEventListener("click", () => {
    if (!b.dataset.model) return;
    bxModel = b.dataset.model; bxDetailKey = b.dataset.stockdetail; bxTab = "tree"; renderBomx();
  }));
}

/* ---- goods receipt from purchasing (P2P) moves stock ------------------------------ */

// Which stocked / BOM part a purchase request is for: part code in the item text first, then the part name
function bxKeyForItem(text) {
  const t = String(text || "");
  const parts = bxAllParts();
  const byCode = parts.filter((p) => p.line.code && bxCodeRegex(p.line.code).test(t)).sort((a, b) => b.line.code.length - a.line.code.length)[0];
  if (byCode) return byCode.key;
  const byName = parts.find((p) => { const n = bxShortName(p.line.part); return n && t.includes(n); });
  return byName ? byName.key : "";
}

function bxReceiveFromP2P(c, ev) {
  const key = bxKeyForItem(c.item);
  const n = bxNum(ev.qtyReceived);
  if (!key || !(n > 0)) return "";
  const st = BX_STOCK[key] = BX_STOCK[key] || { qty: 0, loc: "" };
  st.qty = bxNum(st.qty) + n;
  ev.stockKey = key;
  ev.stockQty = n;
  bxSaveStock();
  if (typeof renderBomx === "function") renderBomx();
  return ` · เข้าคลัง ${key} +${bxFmt(n)} (คงคลัง ${bxFmt(st.qty)})`;
}

function bxReverseFromP2P(c, ev) {
  if (!ev.stockKey || !(bxNum(ev.stockQty) > 0)) return "";
  const st = BX_STOCK[ev.stockKey] = BX_STOCK[ev.stockKey] || { qty: 0, loc: "" };
  st.qty = bxNum(st.qty) - bxNum(ev.stockQty);
  bxSaveStock();
  return ` · ตัดคืนจากคลัง ${ev.stockKey} −${bxFmt(ev.stockQty)} (ของไม่ผ่านตรวจ)`;
}

/* ---- deep link ?bom=<model>&item=<key> ---------------------------------------- */

function bxHandleDeepLink() {
  let p;
  try { p = new URLSearchParams(location.search); } catch (e) { return; }
  const m = p.get("bom");
  if (!m || !bxViewAllowed("bomx")) return;
  if (MACHINE_MODELS.includes(m)) bxModel = m;
  bxDetailKey = p.get("item") || "";
  bxTab = "tree";
  switchView("bomx");
  setTimeout(() => { const d = document.getElementById("bxDetail"); if (d && d.scrollIntoView) d.scrollIntoView({ block: "start" }); }, 60);
}
