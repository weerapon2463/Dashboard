/* ==========================================================================
   Stock ledger, warehouses, stock entries and reorder — modelled on ERPNext
   (Stock Ledger Entry / Warehouse / Stock Entry / Item Reorder).
   Every movement is one ledger row with an id; balances (BX_STOCK[k].qty and
   .wh) are rebuilt from the ledger on load, so movements recorded on two
   devices merge cleanly and stock can always be traced back to a document.
   ========================================================================== */

const SX_WH_DEFAULT = [
  { id: "MAIN", name: "คลังหลัก (วัตถุดิบ / ชิ้นส่วน)" },
  { id: "WIP", name: "งานระหว่างผลิต (WIP)" },
  { id: "FG", name: "สินค้าสำเร็จรูป" },
  { id: "QI", name: "รอตรวจรับ (QC)" },
  { id: "SCRAP", name: "ของเสีย / รอทำลาย" },
];
// ERPNext Stock Entry purposes we use
const SX_PURPOSES = {
  receipt: { label: "รับเข้าคลัง", en: "Material Receipt", to: true },
  issue: { label: "เบิกออก / ใช้ไป", en: "Material Issue", from: true },
  transfer: { label: "โอนย้ายระหว่างคลัง", en: "Material Transfer", from: true, to: true },
  manufacture: { label: "ผลิตเสร็จ → รับสินค้าสำเร็จรูปเข้าคลัง", en: "Manufacture", to: true, wo: true },
  reconcile: { label: "ปรับยอดตามการตรวจนับ", en: "Stock Reconciliation", to: true, count: true },
};
const SX_DEF_TO = { receipt: "MAIN", transfer: "WIP", manufacture: "FG", reconcile: "MAIN" };

let sxSub = "entry";
let sxDraft = null;
let sxLedgerQ = "";
let sxLedgerWh = "";

function sxR3(n) { return Math.round(bxNum(n) * 1000) / 1000; }
function sxId(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function sxWarehouses() {
  if (!Array.isArray(BX_SETTINGS.warehouses) || !BX_SETTINGS.warehouses.length) BX_SETTINGS.warehouses = SX_WH_DEFAULT.map((w) => Object.assign({}, w));
  return BX_SETTINGS.warehouses;
}
function sxWhName(id) { const w = sxWarehouses().find((x) => x.id === id); return w ? w.name : id; }
function sxBal(key, wh) { const st = BX_STOCK[key]; return st && st.wh ? bxNum(st.wh[wh]) : 0; }
function sxPartName(key) {
  const st = BX_STOCK[key];
  if (st && st.name) return st.name;
  const p = bxAllParts().find((x) => x.key === key);
  return p ? p.line.part : key;
}

// Rebuild balances from the ledger. Stock that was set before the ledger existed becomes an opening entry.
function sxRebuild() {
  const has = new Set(SX_LEDGER.map((e) => e.key));
  Object.keys(BX_STOCK).forEach((k) => {
    const q = sxR3(BX_STOCK[k].qty);
    if (!has.has(k) && q) SX_LEDGER.push({ id: `open-${k}`, at: new Date().toISOString(), by: "ระบบ", key: k, wh: "MAIN", qty: q, vt: "ยอดยกมา", v: "", kind: "ยอดยกมา", note: "ยอดคงคลังก่อนเริ่มใช้สมุดคุมคลัง" });
  });
  const bal = {};
  SX_LEDGER.forEach((e) => { const b = bal[e.key] = bal[e.key] || {}; b[e.wh] = bxNum(b[e.wh]) + bxNum(e.qty); });
  Object.keys(bal).forEach((k) => {
    const st = BX_STOCK[k] = BX_STOCK[k] || { qty: 0, loc: "" };
    st.wh = {};
    let tot = 0;
    Object.keys(bal[k]).forEach((w) => { const v = sxR3(bal[k][w]); if (v) st.wh[w] = v; tot += v; });
    st.qty = sxR3(tot);
  });
}

// The one place stock quantities change. qty > 0 = in, < 0 = out.
function bxMove(key, wh, qty, ref, kind, note) {
  qty = sxR3(qty);
  if (!key || !qty) return null;
  const e = { id: sxId("SLE"), at: new Date().toISOString(), by: bxUserName(), key, wh: wh || "MAIN", qty, vt: (ref && ref.vt) || "", v: (ref && ref.v) || "", kind: kind || "", note: note || "" };
  SX_LEDGER.push(e);
  const st = BX_STOCK[key] = BX_STOCK[key] || { qty: 0, loc: "" };
  st.wh = st.wh || {};
  st.wh[e.wh] = sxR3(bxNum(st.wh[e.wh]) + qty);
  if (!st.wh[e.wh]) delete st.wh[e.wh];
  st.qty = sxR3(bxNum(st.qty) + qty);
  return e;
}

// Warehouse to issue from: the main store if it has enough, otherwise the one holding the most
function sxPickWh(key, need) {
  const st = BX_STOCK[key];
  if (!st || !st.wh || sxBal(key, "MAIN") >= need) return "MAIN";
  const best = Object.keys(st.wh).filter((w) => w !== "SCRAP" && w !== "QI").sort((a, b) => st.wh[b] - st.wh[a])[0];
  return best || "MAIN";
}

function sxWhBreakdown(key) {
  const st = BX_STOCK[key];
  if (!st || !st.wh) return "";
  const ws = Object.keys(st.wh);
  if (!ws.length || (ws.length === 1 && ws[0] === "MAIN")) return "";
  return `<div class="muted-inline sx-whline">${ws.map((w) => `${bxEsc(w)} ${bxFmt(st.wh[w])}`).join(" · ")}</div>`;
}

function sxNextNo() {
  const list = SX_ENTRIES.map((e) => e.no);
  if (typeof namingNext === "function") return namingNext("se", list);
  const pre = `SE-${new Date().getFullYear()}-`;
  const max = list.reduce((m, n) => (String(n).startsWith(pre) ? Math.max(m, Number(String(n).slice(pre.length)) || 0) : m), 0);
  return pre + String(max + 1).padStart(4, "0");
}

/* ---- tab ------------------------------------------------------------------------- */

function renderSxTab(pane) {
  const subs = [["entry", "บันทึกเคลื่อนไหว (Stock Entry)"], ["ledger", "สมุดคุมคลัง (Stock Ledger)"], ["wh", "คลังสินค้า (Warehouse)"], ["reorder", "จุดสั่งซื้อซ้ำ (Reorder)"]];
  pane.innerHTML = `<div class="dept-tabs sx-subtabs">${subs.map(([k, l]) => `<button type="button" class="dept-tab${sxSub === k ? " active" : ""}" data-sxsub="${k}">${l}</button>`).join("")}</div><div id="sxPane"></div>`;
  pane.querySelectorAll("[data-sxsub]").forEach((b) => b.addEventListener("click", () => { sxSub = b.dataset.sxsub; renderSxTab(pane); }));
  const p = document.getElementById("sxPane");
  if (sxSub === "ledger") sxRenderLedger(p);
  else if (sxSub === "wh") sxRenderWh(p);
  else if (sxSub === "reorder") sxRenderReorder(p);
  else sxRenderEntry(p);
}

function sxWhOptions(sel) { return sxWarehouses().map((w) => `<option value="${bxEsc(w.id)}"${w.id === sel ? " selected" : ""}>${bxEsc(w.id)} — ${bxEsc(w.name)}</option>`).join(""); }

function sxNewDraft(purpose) {
  const p = purpose || "receipt";
  return { purpose: p, from: "MAIN", to: SX_DEF_TO[p] || "MAIN", ref: "", wo: "", woQty: 1, note: "", items: [{ key: "", qty: "" }] };
}

function sxRenderEntry(p) {
  const can = bxCanStock();
  if (!sxDraft) sxDraft = sxNewDraft();
  const d = sxDraft;
  const P = SX_PURPOSES[d.purpose];
  const openWo = WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์" || d.wo === w.wo);
  const form = !can ? `<p class="muted-inline">บัญชีนี้ดูได้อย่างเดียว — การบันทึกเคลื่อนไหวคลังต้องมีสิทธิ์คลังสินค้า</p>` : `
    <div class="sx-form">
      <label>ประเภท<select id="sxPurpose">${Object.keys(SX_PURPOSES).map((k) => `<option value="${k}"${k === d.purpose ? " selected" : ""}>${SX_PURPOSES[k].label} (${SX_PURPOSES[k].en})</option>`).join("")}</select></label>
      ${P.from ? `<label>จากคลัง<select id="sxFrom">${sxWhOptions(d.from)}</select></label>` : ""}
      ${P.to ? `<label>${P.count ? "คลังที่ตรวจนับ" : "เข้าคลัง"}<select id="sxTo">${sxWhOptions(d.to)}</select></label>` : ""}
      ${P.wo ? `<label>ใบสั่งผลิต<select id="sxWo"><option value="">— เลือก —</option>${openWo.map((w) => `<option value="${bxEsc(w.wo)}"${w.wo === d.wo ? " selected" : ""}>${bxEsc(w.wo)} · ${bxEsc(w.model)} (ผลิตแล้ว ${bxFmt(w.produced || 0)}/${bxFmt(w.qty)})</option>`).join("")}</select></label>
        <label>จำนวนที่ผลิตเสร็จ<input id="sxWoQty" type="number" min="1" step="1" value="${bxEsc(d.woQty)}"></label>`
        : `<label>อ้างอิงเอกสาร<input id="sxRef" placeholder="เช่น PO / WO / ใบส่งของ" value="${bxEsc(d.ref)}"></label>`}
      <label class="sx-wide">หมายเหตุ<input id="sxNote" value="${bxEsc(d.note)}"></label>
    </div>
    ${P.wo ? `<p class="card-sub">รับ "สินค้าสำเร็จรูป ${bxEsc((WORK_ORDERS.find((w) => w.wo === d.wo) || {}).model || "")}" เข้าคลัง และเพิ่มยอดผลิตเสร็จของใบสั่งผลิต · วัตถุดิบถูกตัดคลังไปแล้วตอนจ่ายตามใบเบิก จึงไม่ตัดซ้ำ</p>` : `
    <table class="data-table sx-items"><thead><tr><th>รหัสชิ้นส่วน</th><th>ชื่อ</th><th class="num">${P.count ? "ยอดในระบบ" : P.from ? "คงเหลือในคลังต้นทาง" : "คงคลังรวม"}</th><th class="num">${P.count ? "นับได้จริง" : "จำนวน"}</th>${P.count ? `<th class="num">ต่าง</th>` : ""}<th></th></tr></thead>
      <tbody>${d.items.map((it, i) => {
        const cur = P.count ? sxBal(it.key, d.to) : P.from ? sxBal(it.key, d.from) : bxNum((bxStock(it.key) || {}).qty);
        const diff = P.count && it.qty !== "" ? bxNum(it.qty) - cur : null;
        return `<tr><td><input class="bom-inline sx-key" list="sxPartList" data-i="${i}" value="${bxEsc(it.key)}" placeholder="พิมพ์รหัส"></td>
          <td>${it.key ? bxEsc(sxPartName(it.key)) : ""}</td><td class="num">${it.key ? bxFmt(cur) : ""}</td>
          <td class="num"><input class="bom-inline sx-qty" type="number" step="any" data-i="${i}" value="${bxEsc(it.qty)}"></td>
          ${P.count ? `<td class="num">${diff === null ? "" : `<span class="${diff < 0 ? "bx-neg" : ""}">${diff > 0 ? "+" : ""}${bxFmt(diff)}</span>`}</td>` : ""}
          <td><button type="button" class="btn-link sx-del" data-i="${i}" aria-label="ลบแถว">✕</button></td></tr>`;
      }).join("")}</tbody></table>
    <datalist id="sxPartList">${bxAllParts().map((x) => `<option value="${bxEsc(x.key)}">${bxEsc(x.line.part)}</option>`).join("")}</datalist>
    <button type="button" class="btn-secondary" id="sxAddRow">+ เพิ่มรายการ</button>`}
    <div class="sx-actions"><button type="button" class="btn-primary" id="sxSubmit">บันทึก ${bxEsc(sxNextNo())}</button> <button type="button" class="btn-secondary" id="sxReset">ล้างฟอร์ม</button></div>`;
  const list = SX_ENTRIES.slice().reverse().slice(0, 100);
  p.innerHTML = `
    <div class="card"><div class="card-header"><h3>บันทึกการเคลื่อนไหวคลัง (Stock Entry)</h3>
      <p class="card-sub">แบบเดียวกับ ERPNext: ทุกการรับ/จ่าย/โอน/ปรับยอด เป็นเอกสารหนึ่งใบ และลงสมุดคุมคลังทีละรายการ · แก้ย้อนหลังไม่ได้ ถ้าผิดให้ "ยกเลิก" ระบบจะลงรายการกลับให้ · การจ่ายตามใบเบิก และรับของจากจัดซื้อ (GRN) ลงสมุดคุมคลังให้อัตโนมัติ</p></div>
      <div class="card-body">${form}</div></div>
    <div class="card"><div class="card-header"><h3>เอกสารเคลื่อนไหวคลังล่าสุด</h3></div>
      <div class="card-body table-scroll">${list.length ? `<table class="data-table"><thead><tr><th>เลขที่</th><th>วันที่</th><th>ประเภท</th><th>คลัง</th><th>รายการ</th><th>อ้างอิง</th><th>โดย</th><th>สถานะ</th><th></th></tr></thead><tbody>${list.map((e) => `<tr>
        <td class="mono-cell">${bxEsc(e.no)}</td><td>${bxEsc(String(e.at).slice(0, 10))}</td><td>${bxEsc((SX_PURPOSES[e.purpose] || {}).label || e.purpose)}</td>
        <td>${[e.from, e.to].filter(Boolean).map(bxEsc).join(" → ")}</td>
        <td>${e.items.slice(0, 3).map((it) => `${bxEsc(it.key)} ${it.diff !== undefined ? (it.diff > 0 ? "+" : "") + bxFmt(it.diff) : "× " + bxFmt(it.qty)}`).join("<br>")}${e.items.length > 3 ? `<br><span class="muted-inline">+${e.items.length - 3} รายการ</span>` : ""}</td>
        <td>${bxEsc(e.wo || e.ref || "")}</td><td>${bxEsc(e.by)}</td>
        <td>${e.status === "ยกเลิก" ? bxPill("ยกเลิก", "critical") : bxPill("บันทึกแล้ว", "good")}</td>
        <td>${can && e.status !== "ยกเลิก" ? `<button type="button" class="btn-link" data-sxcancel="${bxEsc(e.no)}">ยกเลิก</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ยังไม่มีเอกสาร</p>`}</div></div>`;
  if (can) sxWireEntry(p);
  p.querySelectorAll("[data-sxcancel]").forEach((b) => b.addEventListener("click", () => sxCancel(b.dataset.sxcancel)));
}

function sxWireEntry(p) {
  const d = sxDraft;
  const rerender = () => sxRenderEntry(p);
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const keep = () => {
    if (val("sxFrom") !== undefined) d.from = val("sxFrom");
    if (val("sxTo") !== undefined) d.to = val("sxTo");
    if (val("sxRef") !== undefined) d.ref = val("sxRef");
    if (val("sxWo") !== undefined) d.wo = val("sxWo");
    if (val("sxWoQty") !== undefined) d.woQty = val("sxWoQty");
    d.note = val("sxNote") || "";
  };
  document.getElementById("sxPurpose").addEventListener("change", (e) => { keep(); d.purpose = e.target.value; d.to = SX_DEF_TO[d.purpose] || "MAIN"; rerender(); });
  ["sxFrom", "sxTo", "sxWo"].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener("change", () => { keep(); rerender(); }); });
  ["sxRef", "sxNote", "sxWoQty"].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener("input", keep); });
  p.querySelectorAll(".sx-key").forEach((el) => el.addEventListener("change", () => { keep(); d.items[+el.dataset.i].key = el.value.trim(); rerender(); }));
  p.querySelectorAll(".sx-qty").forEach((el) => el.addEventListener("change", () => { keep(); d.items[+el.dataset.i].qty = el.value; rerender(); }));
  p.querySelectorAll(".sx-del").forEach((el) => el.addEventListener("click", () => { keep(); d.items.splice(+el.dataset.i, 1); if (!d.items.length) d.items.push({ key: "", qty: "" }); rerender(); }));
  const add = document.getElementById("sxAddRow");
  if (add) add.addEventListener("click", () => { keep(); d.items.push({ key: "", qty: "" }); rerender(); });
  document.getElementById("sxReset").addEventListener("click", () => { sxDraft = sxNewDraft(d.purpose); rerender(); });
  document.getElementById("sxSubmit").addEventListener("click", () => { keep(); sxSubmit(); });
}

function sxSubmit() {
  const d = sxDraft;
  const P = SX_PURPOSES[d.purpose];
  if (P.from && P.to && d.from === d.to) { showToast("คลังต้นทางกับปลายทางต้องไม่ใช่คลังเดียวกัน", "warn"); return; }
  let items = [];
  let wo = null;
  if (P.wo) {
    wo = WORK_ORDERS.find((w) => w.wo === d.wo);
    const n = bxNum(d.woQty);
    if (!wo) { showToast("เลือกใบสั่งผลิตก่อน", "warn"); return; }
    if (!(n > 0)) { showToast("ใส่จำนวนที่ผลิตเสร็จ", "warn"); return; }
    items = [{ key: `FG-${wo.model}`, qty: n }];
  } else {
    items = d.items.filter((it) => it.key && it.qty !== "" && (P.count ? bxNum(it.qty) >= 0 : bxNum(it.qty) > 0)).map((it) => ({ key: it.key, qty: sxR3(it.qty) }));
    if (!items.length) { showToast("ใส่รหัสชิ้นส่วนและจำนวนอย่างน้อย 1 รายการ", "warn"); return; }
    const keys = items.map((it) => it.key);
    if (new Set(keys).size !== keys.length) { showToast("มีรหัสซ้ำในเอกสารเดียวกัน — รวมเป็นแถวเดียว", "warn"); return; }
    if (P.from) {
      const short = items.find((it) => it.qty > sxBal(it.key, d.from));
      if (short) { showToast(`${short.key}: คลัง ${d.from} มีแค่ ${bxFmt(sxBal(short.key, d.from))}`, "warn"); return; }
    }
  }
  const no = sxNextNo();
  const ref = { vt: "Stock Entry", v: no };
  const kind = P.label;
  items.forEach((it) => {
    if (d.purpose === "reconcile") {
      it.diff = sxR3(it.qty - sxBal(it.key, d.to));
      bxMove(it.key, d.to, it.diff, ref, kind, d.note);
    } else {
      if (P.from) bxMove(it.key, d.from, -it.qty, ref, kind, d.note);
      if (P.to) bxMove(it.key, d.to, it.qty, ref, kind, d.note);
    }
  });
  if (wo) {
    const st = BX_STOCK[`FG-${wo.model}`];
    if (st && !st.name) st.name = `สินค้าสำเร็จรูป ${wo.model}`;
    wo.produced = sxR3(bxNum(wo.produced) + items[0].qty);
    if (typeof saveWorkOrders === "function") saveWorkOrders();
  }
  const entry = { no, purpose: d.purpose, at: new Date().toISOString(), by: bxUserName(), from: P.from ? d.from : "", to: P.to ? d.to : "", ref: d.ref || "", wo: wo ? wo.wo : "", note: d.note || "", items, status: "บันทึกแล้ว" };
  SX_ENTRIES.push(entry);
  bxSaveStock();
  if (typeof auditLog === "function") auditLog("บันทึกเคลื่อนไหวคลัง", no, `${P.label}: ${items.map((it) => `${it.key} ${it.diff !== undefined ? (it.diff > 0 ? "+" : "") + it.diff : "× " + it.qty}`).join(", ")}`);
  showToast(`บันทึก ${no} แล้ว`, "good");
  sxDraft = sxNewDraft(d.purpose);
  renderBomx();
}

// ERPNext-style cancel: never edit the ledger, post the opposite rows instead
function sxCancel(no) {
  const e = SX_ENTRIES.find((x) => x.no === no);
  if (!e || e.status === "ยกเลิก") return;
  const rows = SX_LEDGER.filter((r) => r.v === no && r.vt === "Stock Entry");
  const neg = rows.find((r) => r.qty > 0 && sxBal(r.key, r.wh) < r.qty);
  if (neg) { showToast(`ยกเลิกไม่ได้: ${neg.key} ในคลัง ${neg.wh} ถูกใช้ไปแล้ว (เหลือ ${bxFmt(sxBal(neg.key, neg.wh))})`, "warn"); return; }
  rows.forEach((r) => bxMove(r.key, r.wh, -r.qty, { vt: "ยกเลิก Stock Entry", v: no }, "ยกเลิก", ""));
  e.status = "ยกเลิก";
  e.cancelledBy = bxUserName();
  e.cancelledAt = new Date().toISOString();
  if (e.wo) {
    const wo = WORK_ORDERS.find((w) => w.wo === e.wo);
    if (wo) { wo.produced = Math.max(0, sxR3(bxNum(wo.produced) - e.items[0].qty)); if (typeof saveWorkOrders === "function") saveWorkOrders(); }
  }
  bxSaveStock();
  if (typeof auditLog === "function") auditLog("ยกเลิกเอกสารคลัง", no, `ลงรายการกลับ ${rows.length} บรรทัด`);
  showToast(`ยกเลิก ${no} แล้ว — ลงรายการกลับในสมุดคุมคลัง`, "good");
  renderBomx();
}

/* ---- stock ledger ------------------------------------------------------------------ */

function sxRenderLedger(p) {
  // running balance per item + warehouse, in time order
  const run = {};
  const rows = SX_LEDGER.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).map((e) => {
    const k = `${e.key}|${e.wh}`;
    run[k] = sxR3(bxNum(run[k]) + bxNum(e.qty));
    return Object.assign({}, e, { bal: run[k] });
  });
  const q = sxLedgerQ.trim().toLowerCase();
  const shown = rows.filter((e) => (!sxLedgerWh || e.wh === sxLedgerWh) && (!q || [e.key, e.v, e.vt, e.by, e.kind, e.note].some((v) => String(v || "").toLowerCase().includes(q)))).reverse();
  p.innerHTML = `<div class="card"><div class="card-header"><h3>สมุดคุมคลัง (Stock Ledger)</h3>
      <p class="card-sub">ทุกการเคลื่อนไหวของของในคลัง เรียงล่าสุดก่อน · ยอดคงเหลือ = ยอดในคลังนั้นหลังรายการนี้ · ${SX_LEDGER.length.toLocaleString("th-TH")} รายการ</p></div>
    <div class="card-body table-scroll">
      <div class="filter-row"><label for="sxLq">ค้นหา:</label><input id="sxLq" class="wo-search" placeholder="รหัส / เลขเอกสาร / ผู้บันทึก" value="${bxEsc(sxLedgerQ)}">
        <label for="sxLw">คลัง:</label><select id="sxLw"><option value="">ทุกคลัง</option>${sxWhOptions(sxLedgerWh)}</select></div>
      ${shown.length ? `<table class="data-table"><thead><tr><th>เวลา</th><th>รหัส</th><th>ชื่อ</th><th>คลัง</th><th class="num">เข้า</th><th class="num">ออก</th><th class="num">คงเหลือ</th><th>เอกสาร</th><th>ประเภท</th><th>โดย</th></tr></thead><tbody>${shown.slice(0, 300).map((e) => `<tr>
        <td>${bxEsc(String(e.at).slice(0, 16).replace("T", " "))}</td><td class="mono-cell">${bxEsc(e.key)}</td><td>${bxEsc(sxPartName(e.key))}</td><td>${bxEsc(e.wh)}</td>
        <td class="num">${e.qty > 0 ? bxFmt(e.qty) : ""}</td><td class="num">${e.qty < 0 ? `<span class="bx-neg">${bxFmt(-e.qty)}</span>` : ""}</td>
        <td class="num">${bxFmt(e.bal)}</td><td class="mono-cell">${bxEsc(e.v)}</td><td>${bxEsc(e.kind || e.vt)}${e.note ? `<div class="muted-inline">${bxEsc(e.note)}</div>` : ""}</td><td>${bxEsc(e.by)}</td></tr>`).join("")}</tbody></table>
        ${shown.length > 300 ? `<p class="muted-inline">แสดง 300 จาก ${shown.length} รายการ — ค้นหาให้แคบลง</p>` : ""}` : `<p class="muted-inline">ไม่มีรายการ</p>`}
    </div></div>`;
  const inp = document.getElementById("sxLq");
  inp.addEventListener("input", () => { sxLedgerQ = inp.value; const pos = inp.selectionStart; sxRenderLedger(p); const el = document.getElementById("sxLq"); el.focus(); el.setSelectionRange(pos, pos); });
  document.getElementById("sxLw").addEventListener("change", (e) => { sxLedgerWh = e.target.value; sxRenderLedger(p); });
}

/* ---- warehouses ------------------------------------------------------------------- */

function sxRenderWh(p) {
  const can = bxCanSettings();
  const whs = sxWarehouses();
  const sum = {};
  Object.keys(BX_STOCK).forEach((k) => { const w = BX_STOCK[k].wh || {}; Object.keys(w).forEach((id) => { const s = sum[id] = sum[id] || { items: 0, qty: 0 }; if (w[id]) { s.items++; s.qty += w[id]; } }); });
  p.innerHTML = `<div class="card"><div class="card-header"><h3>คลังสินค้า (Warehouse)</h3>
      <p class="card-sub">แยกยอดตามคลัง เช่น คลังหลัก งานระหว่างผลิต สินค้าสำเร็จรูป · ยอดของชิ้นส่วนแต่ละตัวในแต่ละคลังดูได้ที่สมุดคุมคลัง</p></div>
    <div class="card-body table-scroll"><table class="data-table"><thead><tr><th>รหัสคลัง</th><th>ชื่อคลัง</th><th class="num">จำนวนรายการ</th><th class="num">จำนวนรวม</th></tr></thead><tbody>
      ${whs.map((w, i) => `<tr><td class="mono-cell">${bxEsc(w.id)}</td><td>${can ? `<input class="bom-inline sx-whname" data-i="${i}" value="${bxEsc(w.name)}">` : bxEsc(w.name)}</td>
        <td class="num">${(sum[w.id] || {}).items || 0}</td><td class="num">${bxFmt((sum[w.id] || {}).qty || 0)}</td></tr>`).join("")}
      ${Object.keys(sum).filter((id) => !whs.some((w) => w.id === id)).map((id) => `<tr><td class="mono-cell">${bxEsc(id)}</td><td class="muted-inline">(ไม่อยู่ในรายชื่อคลัง)</td><td class="num">${sum[id].items}</td><td class="num">${bxFmt(sum[id].qty)}</td></tr>`).join("")}
    </tbody></table>
    ${can ? `<div class="filter-row"><input id="sxWhId" class="wo-search" placeholder="รหัสคลัง เช่น L1" maxlength="12"><input id="sxWhName" class="wo-search" placeholder="ชื่อคลัง"><button type="button" class="btn-secondary" id="sxWhAdd">+ เพิ่มคลัง</button></div>` : ""}
    </div></div>`;
  if (!can) return;
  p.querySelectorAll(".sx-whname").forEach((el) => el.addEventListener("change", () => {
    const w = whs[+el.dataset.i]; const prev = w.name; w.name = el.value.trim() || prev; bxSaveStock();
    if (typeof auditLog === "function") auditLog("แก้ชื่อคลัง", w.id, `"${prev}" → "${w.name}"`);
  }));
  document.getElementById("sxWhAdd").addEventListener("click", () => {
    const id = document.getElementById("sxWhId").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const name = document.getElementById("sxWhName").value.trim();
    if (!id || !name) { showToast("ใส่รหัสและชื่อคลัง", "warn"); return; }
    if (whs.some((w) => w.id === id)) { showToast("มีรหัสคลังนี้แล้ว", "warn"); return; }
    whs.push({ id, name }); bxSaveStock();
    if (typeof auditLog === "function") auditLog("เพิ่มคลัง", id, name);
    sxRenderWh(p);
  });
}

/* ---- reorder (ERPNext Item Reorder: level + qty) --------------------------------- */

function sxRenderReorder(p) {
  const can = bxCanStock();
  const s = bxOutstandingSummary();
  const rows = bxAllParts().map((x) => {
    const st = bxStock(x.key);
    if (!st || !(bxNum(st.min) > 0)) return null;
    const onOrder = bxP2POnOrder(x.line);
    const dem = s.demand[x.key] || 0;
    const projected = bxNum(st.qty) - dem + onOrder;
    const suggest = projected <= bxNum(st.min) ? Math.max(bxNum(st.rq) || 0, bxNum(st.min) * 2 - projected) : 0;
    return { x, st, onOrder, dem, projected, suggest };
  }).filter(Boolean).sort((a, b) => (b.suggest > 0) - (a.suggest > 0) || a.projected - b.projected);
  const need = rows.filter((r) => r.suggest > 0);
  p.innerHTML = `<div class="card"><div class="card-header"><h3>จุดสั่งซื้อซ้ำ (Reorder) — ต้องสั่ง ${need.length} รายการ</h3>
      <p class="card-sub">ยอดคาดการณ์ = คงคลัง − ค้างจ่ายตามใบเบิก + กำลังสั่งซื้อ · ถ้าไม่เกินจุดสั่งซื้อ ระบบเสนอให้สั่ง "จำนวนสั่งซ้ำ" (ถ้าไม่ตั้ง จะเสนอให้กลับไปที่ 2 เท่าของจุดสั่งซื้อ) · ตั้งจุดสั่งซื้อได้ที่แท็บคงคลัง</p></div>
    <div class="card-body table-scroll">${rows.length ? `<table class="data-table"><thead><tr><th>รหัส</th><th>ชื่อ</th><th class="num">คงคลัง</th><th class="num">ค้างจ่าย</th><th class="num">กำลังสั่ง</th><th class="num">คาดการณ์</th><th class="num">จุดสั่งซื้อ</th><th class="num">จำนวนสั่งซ้ำ</th><th class="num">เสนอสั่ง</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="mono-cell">${bxEsc(r.x.key)}</td><td>${bxEsc(r.x.line.part)}</td><td class="num">${bxFmt(r.st.qty)}</td><td class="num">${bxFmt(r.dem)}</td><td class="num">${bxFmt(r.onOrder)}</td>
        <td class="num"><span class="${r.projected < 0 ? "bx-neg" : ""}">${bxFmt(r.projected)}</span></td><td class="num">${bxFmt(r.st.min)}</td>
        <td class="num">${can ? `<input class="bom-inline sx-rq" type="number" min="0" step="any" data-key="${bxEsc(r.x.key)}" value="${bxEsc(r.st.rq || "")}">` : bxFmt(r.st.rq || 0)}</td>
        <td class="num">${r.suggest > 0 ? `<b>${bxFmt(r.suggest)}</b>` : "—"}</td>
        <td>${r.suggest > 0 ? `<button type="button" class="btn-link" data-sxpr="${bxEsc(r.x.key)}" data-n="${r.suggest}">เปิด PR</button>` : ""}</td></tr>`).join("")}
    </tbody></table>` : `<p class="muted-inline">ยังไม่มีชิ้นส่วนที่ตั้งจุดสั่งซื้อ — ตั้งได้ที่แท็บ "คงคลัง / สิทธิ์การเบิก" คอลัมน์จุดสั่งซื้อ</p>`}</div></div>`;
  p.querySelectorAll(".sx-rq").forEach((el) => el.addEventListener("change", () => {
    const st = bxStock(el.dataset.key); if (!st) return;
    const prev = st.rq; st.rq = bxNum(el.value); bxSaveStock();
    if (typeof auditLog === "function") auditLog("ตั้งจำนวนสั่งซ้ำ", el.dataset.key, `"${prev ?? ""}" → "${st.rq}"`);
    sxRenderReorder(p);
  }));
  p.querySelectorAll("[data-sxpr]").forEach((b) => b.addEventListener("click", () => {
    const x = bxAllParts().find((y) => y.key === b.dataset.sxpr);
    if (x) bxOpenPR(x.line, Number(b.dataset.n), "");
  }));
}
