/* ==========================================================================
   Store operations (stockops.js) — what the store does every day besides
   BOM requisitions:
     • items outside the BOM (consumables, maintenance spares, tools) in the stock master
     • Min / Max per item (reorder up to Max; over-Max flagged)
     • requisitions not tied to a work order (maintenance, consumables, tools, R&D…),
       charged to a department — same approve → issue → receive flow as BOM requisitions
     • stock count sheets (ERPNext Stock Reconciliation): pick a warehouse and what to count,
       blind count on the floor, variance reviewed and approved by someone other than the
       counter, then posted to the ledger as one reconciliation entry (cancellable)
   Counts live in BX_SETTINGS.counts (saved with the stock).
   ========================================================================== */

const ST_GEN_PURPOSES = [
  ["mt", "ซ่อมบำรุงเครื่องจักร / อาคาร"],
  ["cons", "วัสดุสิ้นเปลือง (ถุงมือ ใบเจียร ลวดเชื่อม ฯลฯ)"],
  ["tool", "เครื่องมือ / อุปกรณ์"],
  ["rnd", "งานทดลอง / R&D"],
  ["other", "อื่น ๆ (ระบุเหตุผล)"],
];
const ST_ITEM_GROUPS = ["วัสดุสิ้นเปลือง", "อะไหล่ซ่อมบำรุง", "เครื่องมือ", "สี / เคมี", "อื่น ๆ"];

let stGenSearch = "";
let stCountOpen = "";

function stGenRefs() {
  return ST_GEN_PURPOSES.map(([id, label]) => ({ ref: `@gen:${id}`, model: "", qty: 1, kind: "ทั่วไป", line: "", label: `เบิกทั่วไป — ${label}` }));
}
function stIsGen(ctx) { return !!ctx && ctx.kind === "ทั่วไป"; }

/* ---- general requisition (not tied to a work order) ------------------------------ */

function stGenPickBody(ctx, canReq, receiversHtml) {
  const me = bxUser();
  const q = stGenSearch.trim().toLowerCase();
  const parts = bxAllParts();
  // items outside the BOM first (that is what these requisitions are mostly for), then anything matching
  const list = parts.filter((p) => !q || [p.key, p.line.code, p.line.part, (bxStock(p.key) || {}).loc, (bxStock(p.key) || {}).group].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => (!!(bxStock(b.key) || {}).nonBom - !!(bxStock(a.key) || {}).nonBom) || (bxNum((bxStock(b.key) || {}).qty) > 0) - (bxNum((bxStock(a.key) || {}).qty) > 0));
  const shown = list.slice(0, 80);
  const depts = typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES : [];
  return `
    <p class="muted-note">เบิกของที่ไม่ได้ใช้กับใบสั่งผลิต — เช่น ซ่อมเครื่องจักร วัสดุสิ้นเปลือง เครื่องมือ · ผ่านการอนุมัติและจ่ายของแบบเดียวกับใบเบิกตาม BOM · ค่าใช้จ่ายลงแผนกที่เลือก</p>
    <div class="filter-row"><label for="stGenSearch">ค้นหาของ:</label><input type="text" id="stGenSearch" class="wo-search" placeholder="รหัส / ชื่อ / ที่เก็บ / กลุ่ม" value="${bxEsc(stGenSearch)}">
      <span class="muted-inline">${list.length > shown.length ? `แสดง ${shown.length} จาก ${list.length} รายการ — พิมพ์ค้นหาให้แคบลง` : `${list.length} รายการ`}</span></div>
    <div class="table-scroll">
      <table class="data-table bx-pick">
        <thead><tr><th></th><th>รหัส</th><th>ชื่อ</th><th>กลุ่ม</th><th>หน่วย</th><th>คงคลัง</th><th class="num">ขอเบิก</th></tr></thead>
        <tbody>${shown.map((p) => {
          const st = bxStock(p.key) || {};
          return `<tr><td><input type="checkbox" class="bx-pick-chk" data-key="${bxEsc(p.key)}" data-def="1" aria-label="เลือก ${bxEsc(p.line.part)}"${canReq ? "" : " disabled"}></td>
            <td class="mono-cell">${bxEsc(p.line.code || p.key)}</td><td>${bxEsc(p.line.part)}</td>
            <td class="muted-inline">${bxEsc(st.group || (p.models.length ? `BOM ${p.models.slice(0, 2).join(", ")}` : ""))}</td><td>${bxEsc(p.line.unit || st.unit || "")}</td>
            <td>${bxStockCell(p.key)}</td>
            <td class="num"><input type="number" min="0" step="any" class="bx-qty" data-key="${bxEsc(p.key)}" value="" placeholder="0" aria-label="จำนวนขอเบิก ${bxEsc(p.line.part)}"${canReq ? "" : " disabled"}></td></tr>`;
        }).join("") || `<tr><td colspan="7" class="muted-inline">ไม่พบ — คลังเพิ่มของนอก BOM ได้ที่แท็บ "คงคลัง"</td></tr>`}</tbody>
      </table>
    </div>
    ${canReq ? `
    <div class="bx-submit-row">
      <div class="form-field"><label for="stGenWhy">ใช้ทำอะไร / เครื่องไหน *</label><input id="stGenWhy" maxlength="160" placeholder="เช่น เปลี่ยนสายพานเครื่องตัด CUT-02"></div>
      <div class="form-field"><label for="stGenDept">ค่าใช้จ่ายลงแผนก</label><select id="stGenDept">${depts.map((w) => `<option value="${bxEsc(w.id)}"${me && w.id === me.dept ? " selected" : ""}>${bxEsc(w.name)}</option>`).join("")}</select></div>
      ${receiversHtml}
      <div class="form-field"><label for="bxReqNote">หมายเหตุถึงคลัง</label><input id="bxReqNote" placeholder="เช่น ต้องใช้ก่อน 10:00 น."></div>
      <div class="pilot-toolbar"><button type="button" class="btn-primary" id="bxSubmitReq">ส่งใบเบิก (<span id="bxPickCount">0</span> รายการ)</button></div>
    </div>` : `<p class="muted-note">บัญชีนี้ไม่มีสิทธิ์สั่งเบิก</p>`}`;
}
function stWireGenPick(pane) {
  const s = document.getElementById("stGenSearch");
  if (s) s.addEventListener("input", (e) => {
    stGenSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderBomx();
    const el = document.getElementById("stGenSearch"); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
}
// items for a general requisition: any stock/BOM item by key
function stGenItems(pane) {
  const byKey = new Map(bxAllParts().map((p) => [p.key, p]));
  const items = [];
  pane.querySelectorAll(".bx-qty").forEach((inp) => {
    const qty = Number(inp.value);
    const p = qty > 0 && byKey.get(inp.dataset.key);
    if (!p) return;
    const st = bxStock(p.key) || {};
    items.push({ key: p.key, code: p.line.code || p.key, part: p.line.part, unit: p.line.unit || st.unit || "", item: "", req: qty, issued: 0, ret: 0, log: [] });
  });
  return items;
}

/* ---- items outside the BOM + Min / Max ---------------------------------------------- */

function stAddItemHtml() {
  if (!bxCanSettings()) return "";
  return `<details class="st-additem"><summary>+ เพิ่มของนอก BOM (วัสดุสิ้นเปลือง / อะไหล่ซ่อมบำรุง / เครื่องมือ)</summary>
    <div class="st-addgrid">
      <label>รหัส *<input id="stNewCode" maxlength="40" placeholder="เช่น CON-GLOVE-01"></label>
      <label>ชื่อ *<input id="stNewName" maxlength="120" placeholder="เช่น ถุงมือหนังงานเชื่อม"></label>
      <label>หน่วย<input id="stNewUnit" maxlength="20" placeholder="คู่ / ใบ / ม้วน"></label>
      <label>กลุ่ม<select id="stNewGroup">${ST_ITEM_GROUPS.map((g) => `<option>${bxEsc(g)}</option>`).join("")}</select></label>
      <label>ที่เก็บ<input id="stNewLoc" maxlength="30" placeholder="เช่น A-03-2"></label>
      <label>Min<input id="stNewMin" type="number" min="0" step="any"></label>
      <label>Max<input id="stNewMax" type="number" min="0" step="any"></label>
      <button type="button" class="btn-primary" id="stNewSave">บันทึก</button>
    </div></details>`;
}
function stWireAddItem() {
  const b = document.getElementById("stNewSave");
  if (!b) return;
  b.addEventListener("click", () => {
    const v = (id) => (document.getElementById(id) || {}).value.trim();
    const code = v("stNewCode").toUpperCase(), name = v("stNewName");
    if (!code) { document.getElementById("stNewCode").focus(); return; }
    if (!name) { document.getElementById("stNewName").focus(); return; }
    if (BX_STOCK[code] || bxAllParts().some((p) => p.key === code)) { showToast(`รหัส ${code} มีอยู่แล้ว`, "warn"); return; }
    const min = bxNum(v("stNewMin")), max = bxNum(v("stNewMax"));
    if (max && min && max < min) { showToast("Max ต้องไม่น้อยกว่า Min", "warn"); return; }
    BX_STOCK[code] = { qty: 0, wh: {}, loc: v("stNewLoc"), min, max, name, unit: v("stNewUnit"), code, group: v("stNewGroup"), nonBom: true };
    bxSaveStock();
    if (typeof auditLog === "function") auditLog("เพิ่มของในคลัง", code, `${name} · ${v("stNewGroup")}`);
    showToast(`เพิ่ม ${code} แล้ว — รับเข้าคลังได้ที่แท็บเคลื่อนไหวคลัง`, "good");
    renderBomx();
  });
}
// status of an item against Min / Max after what is still owed on requisitions
function stLevelPill(st, after) {
  if (!st) return bxPill("ยังไม่ตั้งยอด", "neutral");
  if (after < 0) return bxPill("ไม่พอจ่าย", "critical");
  if (st.min && after <= bxNum(st.min)) return bxPill("ถึงจุดสั่งซื้อ (Min)", "warning");
  if (st.max && bxNum(st.qty) > bxNum(st.max)) return bxPill("เกิน Max", "schedule");
  return bxPill("ปกติ", "good");
}
// reorder suggestion: up to Max when set, otherwise the reorder qty / twice the Min (as before)
function stSuggest(st, projected) {
  if (!(projected <= bxNum(st.min))) return 0;
  if (bxNum(st.max) > 0) return Math.max(0, bxNum(st.max) - projected);
  return Math.max(bxNum(st.rq) || 0, bxNum(st.min) * 2 - projected);
}

/* ---- stock count (ตรวจนับสต็อก) ---------------------------------------------------- */

function stCounts() { if (!Array.isArray(BX_SETTINGS.counts)) BX_SETTINGS.counts = []; return BX_SETTINGS.counts; }
function stCountNo() {
  const y = new Date().getFullYear();
  const pre = `SC-${y}-`;
  const max = stCounts().reduce((m, c) => (String(c.no).startsWith(pre) ? Math.max(m, Number(String(c.no).slice(pre.length)) || 0) : m), 0);
  return pre + String(max + 1).padStart(4, "0");
}
function stCountFind(no) { return stCounts().find((c) => c.no === no) || null; }
function stCountVar(c) {
  const lines = c.lines.filter((l) => l.counted !== null && l.counted !== "" && l.counted !== undefined);
  const diff = lines.filter((l) => sxR3(bxNum(l.counted) - bxNum(l.sys)) !== 0);
  const value = diff.reduce((s, l) => s + (bxNum(l.counted) - bxNum(l.sys)) * sxRate(l.key), 0);
  return { counted: lines.length, total: c.lines.length, diff, value };
}
function stMayApproveCount(c) {
  const me = bxUser();
  if (!bxCanSettings()) return false;
  if (me && me.role === "admin") return true;
  return !me || (c.countedById !== me.id && c.createdById !== me.id); // the counter does not approve their own count
}

function stRenderCounts(p) {
  const can = bxCanStock();
  const list = stCounts().slice().reverse();
  const open = stCountOpen && stCountFind(stCountOpen);
  if (open) { stRenderCount(p, open); return; }
  p.innerHTML = `
    <div class="card"><div class="card-header"><h3>ตรวจนับสต็อก (Stock Count)</h3>
      <p class="card-sub">สร้างใบตรวจนับ → คนนับกรอกจำนวนที่นับได้ (ไม่เห็นยอดในระบบ) → ส่งให้หัวหน้าคลังตรวจผลต่าง → อนุมัติแล้วระบบปรับยอดในสมุดคุมคลังให้ (ยกเลิกย้อนได้) · นับวนเป็นรอบ (Cycle Count) ได้โดยเลือกเฉพาะที่เก็บ/กลุ่ม หรือสุ่มทีละส่วน</p></div>
    ${can ? `<div class="card-body st-countnew">
      <label>คลัง<select id="stcWh">${sxWhOptions("MAIN")}</select></label>
      <label>ที่เก็บขึ้นต้นด้วย<input id="stcLoc" placeholder="เช่น A-03 (ว่าง = ทุกที่)"></label>
      <label>กลุ่ม / คำค้น<input id="stcQ" placeholder="เช่น สิ้นเปลือง / K01"></label>
      <label>เลือก<select id="stcMode"><option value="stock">เฉพาะที่มียอดในคลังนี้</option><option value="all">ทุกรายการที่ตรงเงื่อนไข</option><option value="sample">สุ่ม 20 รายการ (นับวน)</option></select></label>
      <label class="fs-check"><input type="checkbox" id="stcBlind" checked> ซ่อนยอดในระบบจากคนนับ</label>
      <button type="button" class="btn-primary" id="stcNew">+ สร้างใบตรวจนับ</button>
    </div>` : ""}
    <div class="card-body table-scroll">${list.length ? `<table class="data-table"><thead><tr><th>เลขที่</th><th>คลัง</th><th>ขอบเขต</th><th class="num">รายการ</th><th class="num">นับแล้ว</th><th class="num">ผลต่าง</th><th>สถานะ</th><th>ผู้นับ / ผู้อนุมัติ</th></tr></thead><tbody>
      ${list.map((c) => { const v = stCountVar(c); return `<tr><td><button type="button" class="bx-link" data-stc="${bxEsc(c.no)}">${bxEsc(c.no)}</button></td><td>${bxEsc(c.wh)}</td><td class="muted-inline">${bxEsc(c.scope || "ทั้งหมด")}</td>
        <td class="num">${v.total}</td><td class="num">${v.counted}</td><td class="num">${v.diff.length ? `<b class="bx-low">${v.diff.length}</b>` : "0"}</td><td>${bxPill(c.status, c.status === "ปรับยอดแล้ว" ? "good" : c.status === "รออนุมัติ" ? "warning" : c.status === "ยกเลิก" ? "neutral" : "schedule")}</td>
        <td class="muted-inline">${bxEsc(c.countedBy || "—")}${c.approvedBy ? ` / ${bxEsc(c.approvedBy)}` : ""}</td></tr>`; }).join("")}
    </tbody></table>` : `<p class="muted-inline">ยังไม่มีใบตรวจนับ</p>`}</div></div>`;
  p.querySelectorAll("[data-stc]").forEach((b) => b.addEventListener("click", () => { stCountOpen = b.dataset.stc; stRenderCounts(p); }));
  const nb = document.getElementById("stcNew");
  if (nb) nb.addEventListener("click", () => {
    const wh = document.getElementById("stcWh").value;
    const loc = document.getElementById("stcLoc").value.trim().toLowerCase();
    const q = document.getElementById("stcQ").value.trim().toLowerCase();
    const mode = document.getElementById("stcMode").value;
    let parts = bxAllParts().filter((x) => {
      const st = bxStock(x.key) || {};
      if (loc && !String(st.loc || "").toLowerCase().startsWith(loc)) return false;
      if (q && ![x.key, x.line.part, st.group].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return mode === "all" ? true : sxBal(x.key, wh) !== 0;
    });
    if (mode === "sample") parts = parts.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, 20).map((x) => x[1]);
    if (!parts.length) { showToast("ไม่มีรายการตรงเงื่อนไข — ลองเลือก \"ทุกรายการ\" หรือเปลี่ยนคำค้น", "warn"); return; }
    if (parts.length > 400 && !confirm(`ใบนี้มี ${parts.length} รายการ — แบ่งนับเป็นส่วน ๆ (ตามที่เก็บ) จะง่ายกว่า สร้างต่อ?`)) return;
    parts.sort((a, b) => String((bxStock(a.key) || {}).loc || "~").localeCompare(String((bxStock(b.key) || {}).loc || "~")));
    const me = bxUser();
    const c = { no: stCountNo(), wh, scope: [loc && `ที่เก็บ ${loc.toUpperCase()}*`, q && `"${q}"`, mode === "sample" ? "สุ่ม 20" : mode === "stock" ? "มียอด" : ""].filter(Boolean).join(" · "),
      blind: document.getElementById("stcBlind").checked, status: "กำลังนับ", at: new Date().toISOString(), createdBy: bxUserName(), createdById: me ? me.id : "",
      lines: parts.map((x) => ({ key: x.key, sys: sxBal(x.key, wh), counted: null, note: "" })) };
    stCounts().push(c);
    bxSaveStock();
    if (typeof auditLog === "function") auditLog("สร้างใบตรวจนับ", c.no, `${wh} · ${c.lines.length} รายการ${c.scope ? ` · ${c.scope}` : ""}`);
    stCountOpen = c.no;
    stRenderCounts(p);
  });
}

function stRenderCount(p, c) {
  const can = bxCanStock();
  const editing = c.status === "กำลังนับ" && can;
  const reviewing = c.status === "รออนุมัติ";
  const showSys = !(c.blind && c.status === "กำลังนับ"); // blind count: nobody sees the system quantity while counting
  const v = stCountVar(c);
  const seeCost = typeof authCanSeeCost === "function" ? authCanSeeCost() : true;
  const mayApprove = reviewing && stMayApproveCount(c);
  p.innerHTML = `
    <div class="card"><div class="card-header">
      <h3>${bxEsc(c.no)} · คลัง ${bxEsc(c.wh)} ${bxPill(c.status, c.status === "ปรับยอดแล้ว" ? "good" : reviewing ? "warning" : "schedule")}</h3>
      <p class="card-sub">${bxEsc(c.scope || "ทุกรายการ")} · สร้างโดย ${bxEsc(c.createdBy)} ${typeof fmtDateTime === "function" ? fmtDateTime(c.at) : ""}${c.countedBy ? ` · นับโดย ${bxEsc(c.countedBy)}` : ""}${c.approvedBy ? ` · อนุมัติโดย ${bxEsc(c.approvedBy)}${c.entryNo ? ` → ${bxEsc(c.entryNo)}` : ""}` : ""}
        · นับแล้ว ${v.counted}/${v.total} · ผลต่าง ${v.diff.length} รายการ${seeCost && (reviewing || c.status === "ปรับยอดแล้ว") ? ` · มูลค่าผลต่าง ${sxBaht(v.value)}` : ""}${c.blind && editing ? " · 🙈 นับแบบไม่เห็นยอดในระบบ" : ""}</p></div>
    <div class="card-body">
      <div class="filter-row"><button type="button" class="btn-secondary" id="stcBack">← รายการใบตรวจนับ</button><button type="button" class="btn-secondary" id="stcPrint">🖨 พิมพ์ใบนับ</button>
        ${editing ? `<button type="button" class="btn-secondary" id="stcScan">📷 สแกนแล้วนับ</button>` : ""}</div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>ที่เก็บ</th><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th>${showSys ? `<th class="num">ยอดในระบบ</th>` : ""}<th class="num">นับได้</th>${showSys ? `<th class="num">ผลต่าง</th>` : ""}<th>หมายเหตุ</th></tr></thead><tbody>
      ${c.lines.map((l, i) => {
        const st = bxStock(l.key) || {};
        const has = l.counted !== null && l.counted !== "" && l.counted !== undefined;
        const d = has ? sxR3(bxNum(l.counted) - bxNum(l.sys)) : null;
        return `<tr class="${has && d ? "st-var" : ""}"><td>${bxEsc(st.loc || "—")}</td><td class="mono-cell">${bxEsc(l.key)}</td><td>${bxEsc(sxPartName(l.key))}</td><td>${bxEsc(st.unit || "")}</td>
          ${showSys ? `<td class="num">${bxFmt(l.sys)}</td>` : ""}
          <td class="num">${editing ? `<input type="number" min="0" step="any" class="bom-inline stc-n" data-i="${i}" value="${has ? bxEsc(l.counted) : ""}" aria-label="นับได้ ${bxEsc(l.key)}">` : has ? bxFmt(l.counted) : "—"}</td>
          ${showSys ? `<td class="num">${d === null ? "" : d ? `<b class="${d < 0 ? "bx-neg" : "bx-low"}">${d > 0 ? "+" : ""}${bxFmt(d)}</b>` : "0"}</td>` : ""}
          <td>${editing ? `<input class="bom-inline stc-note" data-i="${i}" value="${bxEsc(l.note || "")}" placeholder="เช่น ชำรุด 2">` : bxEsc(l.note || "")}</td></tr>`;
      }).join("")}</tbody></table></div>
      <div class="modal-actions">
        ${editing ? `<button type="button" class="btn-secondary" id="stcCancel">ยกเลิกใบนับ</button><button type="button" class="btn-primary" id="stcSubmit">ส่งผลนับให้ตรวจ (${v.counted}/${v.total})</button>` : ""}
        ${reviewing && mayApprove ? `<button type="button" class="btn-secondary" id="stcRecount">ส่งกลับให้นับใหม่</button><button type="button" class="btn-primary" id="stcApprove">อนุมัติและปรับยอด (${v.diff.length} รายการ)</button>` : ""}
        ${reviewing && !mayApprove ? `<p class="muted-note">🔒 รอหัวหน้าคลัง/ผู้มีสิทธิ์ตั้งค่าคลังอนุมัติ — คนนับอนุมัติผลนับของตัวเองไม่ได้</p>` : ""}
      </div>
    </div></div>`;
  const $ = (id) => document.getElementById(id);
  $("stcBack").addEventListener("click", () => { stCountOpen = ""; stRenderCounts(p); });
  $("stcPrint").addEventListener("click", () => stPrintCount(c));
  p.querySelectorAll(".stc-n").forEach((el) => el.addEventListener("change", () => {
    const l = c.lines[+el.dataset.i];
    l.counted = el.value === "" ? null : bxNum(el.value);
    l.at = new Date().toISOString(); l.by = bxUserName();
    bxSaveStock();
  }));
  p.querySelectorAll(".stc-note").forEach((el) => el.addEventListener("change", () => { c.lines[+el.dataset.i].note = el.value.trim(); bxSaveStock(); }));
  if ($("stcScan")) $("stcScan").addEventListener("click", () => snScan(`สแกนของที่นับ — ${c.no}`, (raw) => {
    let k = String(raw).trim();
    try { const u = new URL(k); k = u.searchParams.get("item") || k; } catch (e) { /* plain code */ }
    const i = c.lines.findIndex((l) => l.key === k);
    if (i < 0) { showToast(`${k} ไม่อยู่ในใบนับนี้`, "warn"); return true; }
    c.lines[i].counted = bxNum(c.lines[i].counted) + 1; c.lines[i].at = new Date().toISOString(); c.lines[i].by = bxUserName();
    bxSaveStock();
    showToast(`${k}: นับได้ ${c.lines[i].counted}`, "good");
    return true;
  }));
  if ($("stcSubmit")) $("stcSubmit").addEventListener("click", () => {
    const left = c.lines.filter((l) => l.counted === null || l.counted === "").length;
    if (left && !confirm(`ยังไม่ได้นับ ${left} รายการ — รายการที่ไม่ได้นับจะไม่ถูกปรับยอด ส่งต่อ?`)) return;
    const me = bxUser();
    c.status = "รออนุมัติ"; c.countedBy = bxUserName(); c.countedById = me ? me.id : ""; c.submittedAt = new Date().toISOString();
    bxSaveStock();
    if (typeof auditLog === "function") auditLog("ส่งผลตรวจนับ", c.no, `นับ ${stCountVar(c).counted}/${c.lines.length} · ผลต่าง ${stCountVar(c).diff.length} รายการ`);
    showToast(`${c.no}: ส่งผลนับแล้ว — รอหัวหน้าคลังอนุมัติ`, "good");
    stRenderCount(p, c);
  });
  if ($("stcCancel")) $("stcCancel").addEventListener("click", () => {
    if (!confirm(`ยกเลิกใบตรวจนับ ${c.no}?`)) return;
    c.status = "ยกเลิก"; bxSaveStock();
    if (typeof auditLog === "function") auditLog("ยกเลิกใบตรวจนับ", c.no, "");
    stCountOpen = ""; stRenderCounts(p);
  });
  if ($("stcRecount")) $("stcRecount").addEventListener("click", () => {
    c.status = "กำลังนับ"; bxSaveStock();
    if (typeof auditLog === "function") auditLog("ส่งกลับให้นับใหม่", c.no, "");
    stRenderCount(p, c);
  });
  if ($("stcApprove")) $("stcApprove").addEventListener("click", () => stApproveCount(c, p));
}

// post the variances as one reconciliation entry: the difference between what was counted and the
// system quantity at the time of counting (movements since then are kept, not overwritten)
function stApproveCount(c, p) {
  if (c.status !== "รออนุมัติ" || !stMayApproveCount(c)) { showToast("บัญชีนี้อนุมัติใบตรวจนับนี้ไม่ได้", "warn"); return; }
  const v = stCountVar(c);
  const no = v.diff.length ? sxNextNo() : "";
  const ref = { vt: "Stock Entry", v: no };
  const items = v.diff.map((l) => {
    const diff = sxR3(bxNum(l.counted) - bxNum(l.sys));
    bxMove(l.key, c.wh, diff, ref, "ปรับยอดตามการตรวจนับ", `${c.no}${l.note ? ` · ${l.note}` : ""}`);
    return { key: l.key, qty: sxR3(sxBal(l.key, c.wh)), diff };
  });
  if (no) SX_ENTRIES.push({ no, purpose: "reconcile", at: new Date().toISOString(), by: bxUserName(), from: "", to: c.wh, ref: c.no, wo: "", note: `ตามใบตรวจนับ ${c.no}`, items, status: "บันทึกแล้ว" });
  c.status = "ปรับยอดแล้ว"; c.approvedBy = bxUserName(); c.approvedAt = new Date().toISOString(); c.entryNo = no; c.value = sxR2(v.value);
  bxSaveStock();
  if (typeof auditLog === "function") auditLog("อนุมัติผลตรวจนับ", c.no, `${v.diff.length} รายการ${no ? ` → ${no}` : ""} · มูลค่าผลต่าง ${Math.round(v.value).toLocaleString("th-TH")} บาท`);
  showToast(`${c.no}: ปรับยอดแล้ว${no ? ` (${no})` : " — ไม่มีผลต่าง"}`, "good");
  renderBomx();
}

function stPrintCount(c) {
  const w = window.open("", "_blank");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน", "warn"); return; }
  const sys = !c.blind || c.status !== "กำลังนับ";
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบตรวจนับ ${bxEsc(c.no)}</title>
    <style>body{font-family:"IBM Plex Sans Thai","Leelawadee UI",sans-serif;margin:12mm;font-size:10.5pt}h1{font-size:15pt;margin:0}table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}.n{text-align:right}.b{min-width:22mm}code{font-family:"IBM Plex Mono",monospace}</style></head><body>
    <h1>ใบตรวจนับสต็อก — ${bxEsc(c.no)}</h1><div>คลัง ${bxEsc(c.wh)} · ${bxEsc(c.scope || "ทุกรายการ")} · พิมพ์ ${new Date().toLocaleString("th-TH")}</div>
    <table><thead><tr><th>ที่เก็บ</th><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th>${sys ? `<th class="n">ในระบบ</th>` : ""}<th class="b">นับได้</th><th>หมายเหตุ</th></tr></thead><tbody>
    ${c.lines.map((l) => { const st = bxStock(l.key) || {}; return `<tr><td><b>${bxEsc(st.loc || "—")}</b></td><td><code>${bxEsc(l.key)}</code></td><td>${bxEsc(sxPartName(l.key))}</td><td>${bxEsc(st.unit || "")}</td>${sys ? `<td class="n">${bxFmt(l.sys)}</td>` : ""}<td>${l.counted !== null && l.counted !== undefined && l.counted !== "" ? bxFmt(l.counted) : ""}</td><td></td></tr>`; }).join("")}
    </tbody></table><p>ผู้นับ ____________________ วันที่ ________ &nbsp; ผู้ตรวจทาน ____________________ &nbsp; หัวหน้าคลัง (อนุมัติ) ____________________</p>
    <script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
}
