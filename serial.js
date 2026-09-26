/* ==========================================================================
   One machine = one work order = one serial number (ERPNext "Serial No").
   - every work order carries wo.serial (naming series "sn", e.g. YT3000-26-001)
   - finishing it (Stock Entry › Manufacture) registers the machine in the
     installed-base register (DEPT_DOCS.mc) with the same serial
   - snHistory(serial) pulls every trace of that machine together: requisition
     issues, job-card time, stock entries, QC / NCR / any document that names it,
     and after-sales service
   - QR labels (machine / part / document) and a camera + barcode-gun scanner
     that opens whatever was scanned.
   ========================================================================== */

const SN_QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const SN_JSQR_LIB = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
let snStream = null;
let snScanLoop = null;
let snScanCb = null;

function snEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function snLoad(src, test) {
  if (test()) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = () => (test() ? res() : rej(new Error("lib"))); s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
}

/* ---- serial numbers --------------------------------------------------------------- */

function snAllSerials() {
  const out = new Set();
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => w.serial && out.add(w.serial));
  (typeof DEPT_DOCS !== "undefined" && DEPT_DOCS.mc ? DEPT_DOCS.mc : []).forEach((m) => m.title && out.add(m.title));
  return [...out];
}
function snNext(model, extra) {
  const used = snAllSerials().concat(extra || []);
  if (typeof namingNext === "function") return namingNext("sn", used, null, { model });
  return `${model}-${String(new Date().getFullYear()).slice(2)}-${String(used.length + 1).padStart(3, "0")}`;
}
function snWo(key) { return (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).find((w) => w.wo === key || w.serial === key) || null; }
function snMachine(serial) { return (typeof DEPT_DOCS !== "undefined" && DEPT_DOCS.mc ? DEPT_DOCS.mc : []).find((m) => m.title === serial) || null; }

// Called when a work order's machine is finished and received into FG stock
function snRegister(wo) {
  if (!wo || !wo.serial || typeof DEPT_DOCS === "undefined") return null;
  DEPT_DOCS.mc = DEPT_DOCS.mc || [];
  let m = snMachine(wo.serial);
  if (!m) {
    m = { no: deptNextNumber("mc"), title: wo.serial, model: wo.model, rev: (typeof BOM_META !== "undefined" && BOM_META[wo.model] ? BOM_META[wo.model].rev : ""), wo: wo.wo,
      so: wo.so || "", customer: wo.customer || "", status: DOC_TYPES.mc.statuses[0][0], date: new Date().toISOString().slice(0, 10), createdBy: (authCurrentUser() || {}).id || "",
      note: `ลงทะเบียนอัตโนมัติเมื่อผลิตเสร็จ (${wo.wo})` };
    DEPT_DOCS.mc.push(m);
    if (typeof saveDeptDocs === "function") saveDeptDocs();
    if (typeof auditLog === "function") auditLog("ลงทะเบียนเครื่อง", m.no, `${wo.serial} · ${wo.model} · จาก ${wo.wo}`);
  }
  return m;
}

/* ---- machine history ------------------------------------------------------------- */

function snHistory(key) {
  const wo = snWo(key);
  const serial = wo ? wo.serial : key;
  const mc = snMachine(serial);
  const ev = [];
  const add = (at, kind, title, detail, ref) => { if (at) ev.push({ at: String(at), kind, title, detail: detail || "", ref: ref || "" }); };
  const keys = [wo && wo.wo, serial, mc && mc.no].filter(Boolean);
  if (wo) {
    add(wo.createdAt || (wo.jobs && wo.jobs[0] && wo.jobs[0].logs && wo.jobs[0].logs[0] && wo.jobs[0].logs[0].from), "ผลิต", `ใบสั่งผลิต ${wo.wo}`, `${wo.model} · ${wo.department || ""} · กำหนดส่ง ${wo.dueDate || "-"}`, wo.wo);
    (DEPT_DOCS.mreq || []).filter((d) => d.wo === wo.wo && Array.isArray(d.items)).forEach((d) => {
      add(d.date, "เบิก", `ใบเบิก ${d.no} (${d.status})`, `${d.items.length} รายการ · ผู้ขอ ${d.owner || d.requester || "-"}`, d.no);
      const batches = {};
      d.items.forEach((it) => (it.log || []).forEach((g) => {
        const k = `${String(g.at).slice(0, 16)}|${g.kind}`;
        const b = batches[k] = batches[k] || { at: g.at, kind: g.kind, by: g.by, n: 0, qty: 0, names: [] };
        b.n++; b.qty += Number(g.qty) || 0; if (b.names.length < 4) b.names.push(it.part || it.code);
      }));
      Object.values(batches).forEach((b) => add(b.at, b.kind === "คืนคลัง" ? "คืน" : "จ่าย", `${b.kind} ${b.n} รายการ ตาม ${d.no}`, `${b.names.join(", ")}${b.n > b.names.length ? ` และอีก ${b.n - b.names.length} รายการ` : ""} · โดย ${b.by || "-"}`, d.no));
      if (d.ackAt) add(d.ackAt, "จ่าย", `ผู้รับยืนยันรับของ ${d.no}`, d.ackBy || "", d.no);
    });
    (wo.jobs || []).forEach((j) => {
      (j.logs || []).forEach((l) => add(l.from, "Job Card", `${j.op} (${j.station})`, `${l.by || j.assignee || "-"} · ${l.to ? `ถึง ${new Date(l.to).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}` : "กำลังทำ"}`, j.no));
      (j.downs || []).forEach((d) => add(d.from, "หยุด", `หยุด ${j.op}: ${d.reason}`, d.to ? `${jcFmtMins(jcDownMins(d))}` : "ยังหยุดอยู่", j.no));
      if (j.doneAt) add(j.doneAt, "เสร็จ", `เสร็จขั้นตอน ${j.op}`, `ใช้เวลา ${jcFmtMins(jcMinutes(j))}`, j.no);
    });
    (typeof SX_ENTRIES !== "undefined" ? SX_ENTRIES : []).filter((e) => e.wo === wo.wo || e.ref === wo.wo).forEach((e) => add(e.at, "คลัง", `${(SX_PURPOSES[e.purpose] || {}).label || e.purpose} ${e.no}${e.status === "ยกเลิก" ? " (ยกเลิก)" : ""}`, e.items.map((i) => `${i.key} × ${i.qty}`).join(", "), e.no));
  }
  // any document (QC, NCR, FI, ECR, service…) that names this work order, serial or machine record
  Object.keys(DEPT_DOCS).forEach((t) => (DEPT_DOCS[t] || []).forEach((d) => {
    if (t === "mreq" && d.wo && wo && d.wo === wo.wo) return;
    if (mc && t === "mc" && d.no === mc.no) return;
    const hit = keys.some((k) => Object.keys(d).some((f) => typeof d[f] === "string" && f !== "log" && (d[f] === k || (d[f].length < 400 && d[f].includes(k)))));
    if (hit) add(d.date || d.created || "", DOC_TYPES[t] ? DOC_TYPES[t].abbr || t : t, `${d.no} ${d.title || ""}`, `${DOC_TYPES[t] ? DOC_TYPES[t].name.split(" (")[0] : t} · ${d.status || ""}`, d.no);
  }));
  if (mc) add(mc.delivered || mc.date, "ทะเบียน", `ทะเบียนเครื่อง ${mc.no}`, `${mc.customer ? `ลูกค้า ${mc.customer} · ` : ""}${mc.status}${mc.hours ? ` · ${mc.hours} ชม.` : ""}`, mc.no);
  ev.sort((a, b) => a.at.localeCompare(b.at));
  return { wo, serial, mc, ev };
}

function snOpenHistory(key) {
  const h = snHistory(key);
  if (!h.wo && !h.mc) { showToast(`ไม่พบเครื่อง / ใบสั่งผลิต "${key}"`, "warn"); return; }
  const icon = { "ผลิต": "🏭", "เบิก": "📋", "จ่าย": "📦", "คืน": "↩", "Job Card": "🛠", "หยุด": "⏸", "เสร็จ": "✅", "คลัง": "🏬", "ทะเบียน": "🚜" };
  const w = h.wo;
  const cost = w && typeof jcCost === "function" ? jcCost(w) : null;
  const body = `
    <div class="sn-head">
      <div><div class="sn-serial">${snEsc(h.serial)}</div>
        <div class="muted-inline">${w ? `${snEsc(w.wo)} · ${snEsc(w.model)} · ${snEsc(w.status)}` : snEsc(h.mc.model)}${h.mc ? ` · ทะเบียน ${snEsc(h.mc.no)}${h.mc.customer ? ` · ${snEsc(h.mc.customer)}` : ""}` : ""}</div>
        ${cost ? `<div class="sn-cost">ต้นทุนถึงตอนนี้ <b>${jcBaht(cost.total)}</b> (ค่าดำเนินการ ${jcBaht(cost.actOp)} · วัสดุ ${jcBaht(cost.mat)})</div>` : ""}</div>
      <div class="sn-qr" id="snQr"></div>
    </div>
    <div class="sn-actions"><button type="button" class="btn-secondary" id="snPrint">🏷 พิมพ์ป้าย QR ติดรถ</button>${w ? ` <button type="button" class="btn-secondary" id="snGoJc">🛠 เปิด Job Card</button>` : ""}</div>
    <ol class="sn-timeline">${h.ev.length ? h.ev.map((e) => `<li><span class="sn-ic">${icon[e.kind] || "📄"}</span><div><div class="sn-t"><b>${snEsc(e.title)}</b><span class="muted-inline">${snEsc(snWhen(e.at))}</span></div><div class="muted-inline">${snEsc(e.detail)}</div></div></li>`).join("") : `<li class="muted-inline">ยังไม่มีประวัติ</li>`}</ol>`;
  snModal(`ประวัติรายคัน — ${h.serial}`, body);
  snQrInto(document.getElementById("snQr"), snLink({ serial: h.serial }), 4);
  document.getElementById("snPrint").addEventListener("click", () => snPrintLabels([{ code: h.serial, line1: w ? `${w.model} · ${w.wo}` : h.mc.model, line2: "Y2J — ประวัติรายคัน", link: snLink({ serial: h.serial }) }]));
  const go = document.getElementById("snGoJc");
  if (go) go.addEventListener("click", () => { snCloseModal(); jcWo = w.wo; switchView("workorder"); });
}
function snWhen(at) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return new Date(at + "T00:00:00").toLocaleDateString("th-TH", { dateStyle: "medium" });
  const d = new Date(at);
  return isNaN(d) ? at : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
function snLink(params) {
  const u = new URL(location.href.split("?")[0].split("#")[0]);
  Object.keys(params).forEach((k) => u.searchParams.set(k, params[k]));
  return u.toString();
}

/* ---- modal ------------------------------------------------------------------------ */

function snModal(title, html) {
  let bd = document.getElementById("snBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "snBackdrop";
    bd.innerHTML = `<div class="modal modal-wide sn-modal"><div class="sn-mhead"><h3 id="snTitle"></h3><button type="button" class="btn-link" id="snClose" aria-label="ปิด">✕</button></div><div id="snBody"></div></div>`;
    document.body.appendChild(bd);
    bd.addEventListener("click", (e) => { if (e.target === bd) snCloseModal(); });
    bd.querySelector("#snClose").addEventListener("click", snCloseModal);
  }
  bd.querySelector("#snTitle").textContent = title;
  bd.querySelector("#snBody").innerHTML = html;
  bd.classList.add("open");
}
function snCloseModal() { snStopCam(); const bd = document.getElementById("snBackdrop"); if (bd) bd.classList.remove("open"); }

/* ---- QR codes & labels ------------------------------------------------------------ */

function snQrSvg(text, cell) {
  const qr = qrcode(0, "M");
  qr.addData(unescape(encodeURIComponent(text)));
  qr.make();
  return qr.createSvgTag({ cellSize: cell || 3, margin: 2, scalable: true });
}
function snQrInto(el, text, cell) {
  if (!el) return;
  snLoad(SN_QR_LIB, () => typeof qrcode === "function").then(() => { el.innerHTML = snQrSvg(text, cell); }).catch(() => { el.textContent = "(โหลดตัวสร้าง QR ไม่ได้ — ต่ออินเทอร์เน็ต)"; });
}

// labels: [{ code, line1, line2, link }] — prints a sheet of 50×30 mm stickers
function snPrintLabels(labels) {
  snLoad(SN_QR_LIB, () => typeof qrcode === "function").then(() => {
    const w = window.open("", "_blank");
    if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน", "warn"); return; }
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ป้าย QR</title>
      <style>@page{size:A4;margin:8mm}body{font-family:"IBM Plex Sans Thai","Leelawadee UI",sans-serif;margin:0}
      .g{display:grid;grid-template-columns:repeat(3,62mm);gap:3mm}.l{border:1px dashed #999;border-radius:2mm;height:32mm;display:flex;gap:2mm;align-items:center;padding:2mm;box-sizing:border-box;break-inside:avoid}
      .l svg{width:27mm;height:27mm;flex:none}.c{font:700 11pt "IBM Plex Mono",monospace;word-break:break-all}.s{font-size:8pt;color:#333}</style></head><body>
      <div class="g">${labels.map((l) => `<div class="l">${snQrSvg(l.link || l.code, 3)}<div><div class="c">${snEsc(l.code)}</div><div class="s">${snEsc(l.line1 || "")}</div><div class="s">${snEsc(l.line2 || "")}</div></div></div>`).join("")}</div>
      <script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
    w.document.close();
  }).catch(() => showToast("โหลดตัวสร้าง QR ไม่ได้ — ต่ออินเทอร์เน็ตก่อน", "warn"));
}

/* ---- scanning: camera (BarcodeDetector → jsQR fallback) or barcode gun --------------- */

// onCode(text) receives each decoded value; returns true to keep scanning
function snScan(title, onCode) {
  snScanCb = onCode;
  snModal(title || "สแกน QR / บาร์โค้ด", `
    <div class="sn-cam"><video id="snVideo" playsinline muted></video><div class="sn-aim"></div></div>
    <p class="muted-inline" id="snCamMsg">กำลังเปิดกล้อง… (ต้องอนุญาตการใช้กล้อง)</p>
    <label class="sn-manual">หรือยิงด้วยเครื่องอ่านบาร์โค้ด / พิมพ์รหัส <input id="snManual" class="wo-search" placeholder="WO / Serial / รหัสชิ้นส่วน / เลขเอกสาร" autocomplete="off"></label>`);
  const man = document.getElementById("snManual");
  man.addEventListener("keydown", (e) => { if (e.key === "Enter" && man.value.trim()) { const v = man.value.trim(); man.value = ""; snGot(v); } });
  setTimeout(() => man.focus(), 50);
  snStartCam();
}
function snGot(text) {
  if (!snScanCb) return;
  const keep = snScanCb(text);
  if (navigator.vibrate) navigator.vibrate(60);
  if (!keep) snCloseModal();
}
async function snStartCam() {
  const msg = document.getElementById("snCamMsg");
  const video = document.getElementById("snVideo");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "อุปกรณ์นี้เปิดกล้องจากเว็บไม่ได้ — ใช้ช่องพิมพ์/เครื่องยิงบาร์โค้ดด้านล่าง"; return; }
  try {
    snStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = snStream; await video.play();
  } catch (e) { msg.textContent = "เปิดกล้องไม่ได้ (ไม่ได้อนุญาต หรือเว็บไม่ได้เปิดผ่าน https) — ใช้ช่องพิมพ์ด้านล่าง"; return; }
  let detector = null;
  if ("BarcodeDetector" in window) {
    try { detector = new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "itf", "data_matrix"] }); } catch (e) { detector = null; }
  }
  if (!detector) { try { await snLoad(SN_JSQR_LIB, () => typeof jsQR === "function"); } catch (e) { msg.textContent = "โหลดตัวอ่าน QR ไม่ได้ — ใช้ช่องพิมพ์ด้านล่าง"; return; } }
  msg.textContent = detector ? "เล็งกล้องไปที่ QR หรือบาร์โค้ด" : "เล็งกล้องไปที่ QR (บาร์โค้ดเส้นบนเครื่องนี้ ใช้เครื่องยิงแทน)";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let last = "", lastAt = 0;
  const tick = async () => {
    if (!snStream) return;
    try {
      let val = "";
      if (detector) { const r = await detector.detect(video); if (r && r[0]) val = r[0].rawValue; }
      else if (video.videoWidth) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (r) val = r.data;
      }
      if (val && (val !== last || Date.now() - lastAt > 2500)) { last = val; lastAt = Date.now(); snGot(val); }
    } catch (e) { /* keep trying */ }
    if (snStream) snScanLoop = setTimeout(tick, 180);
  };
  tick();
}
function snStopCam() {
  clearTimeout(snScanLoop);
  if (snStream) snStream.getTracks().forEach((t) => t.stop());
  snStream = null;
}

// What a scanned value is, and where to go with it
function snRoute(raw) {
  let v = String(raw || "").trim();
  try { const u = new URL(v); const p = u.searchParams; v = p.get("serial") || p.get("wo") || p.get("item") || p.get("doc") || v; } catch (e) { /* plain text */ }
  const wo = snWo(v);
  if (wo) {
    const role = typeof currentRole === "function" ? currentRole() : "";
    if (role === "operator" && document.querySelector('.nav-item[data-view="mytasks"]:not([hidden])')) { switchView("mytasks"); setTimeout(() => snOpenHistory(wo.serial || wo.wo), 50); }
    else snOpenHistory(wo.serial || wo.wo);
    return false;
  }
  if (snMachine(v)) { snOpenHistory(v); return false; }
  if (typeof BX_STOCK !== "undefined" && (BX_STOCK[v] || (typeof bxAllParts === "function" && bxAllParts().some((p) => p.key === v)))) {
    snCloseModal();
    const p = bxAllParts().find((x) => x.key === v);
    bxDetailKey = v; bxModel = (p && p.models[0]) || bxModel; bxTab = "tree"; switchView("bomx");
    return false;
  }
  for (const t of Object.keys(DEPT_DOCS || {})) {
    const i = (DEPT_DOCS[t] || []).findIndex((d) => d.no === v);
    if (i >= 0) { snCloseModal(); if (t === "mreq" && typeof bxOpenReq === "function" && Array.isArray(DEPT_DOCS[t][i].items)) { switchView("bomx"); bxOpenReq(v); } else openDocView(t, i); return false; }
  }
  showToast(`ไม่รู้จักรหัส "${v}"`, "warn");
  return true;
}

/* ---- wiring --------------------------------------------------------------------------- */

function initSerial() {
  const actions = document.querySelector(".topbar-actions");
  if (actions && !document.getElementById("snScanBtn")) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "theme-toggle"; b.id = "snScanBtn"; b.title = "สแกน QR / บาร์โค้ด"; b.setAttribute("aria-label", "สแกน QR หรือบาร์โค้ด"); b.textContent = "📷";
    b.addEventListener("click", () => snScan("สแกน — ใบสั่งผลิต / รถ / ชิ้นส่วน / เอกสาร", snRoute));
    actions.insertBefore(b, actions.firstChild);
  }
  // 📷 buttons next to form fields: scan straight into that field
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-scanfor]");
    if (!b) return;
    const target = document.getElementById(b.dataset.scanfor);
    if (!target) return;
    snScan("สแกนใส่ช่องนี้", (raw) => {
      let v = String(raw).trim();
      try { const u = new URL(v); const p = u.searchParams; v = p.get("wo") || p.get("serial") || p.get("item") || p.get("doc") || v; } catch (err) { /* plain */ }
      if (target.tagName === "SELECT") {
        if (![...target.options].some((o) => o.value === v)) { const o = document.createElement("option"); o.value = v; o.textContent = v; target.appendChild(o); }
      }
      target.value = v;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      showToast(`ใส่ ${v} แล้ว`, "good");
      return false;
    });
  });
  // QR on paper documents (scan → open the document)
  const fillQr = () => document.querySelectorAll(".paper-qr[data-qr]:not([data-done])").forEach((el) => { el.dataset.done = "1"; snQrInto(el, snLink({ doc: el.dataset.qr }), 2); });
  new MutationObserver(fillQr).observe(document.body, { childList: true, subtree: true });
  try {
    const p = new URLSearchParams(location.search);
    const s = p.get("serial") || p.get("wo");
    if (s) setTimeout(() => snOpenHistory(s), 300);
    const d = p.get("doc");
    if (d && typeof openDocViewByNo === "function") setTimeout(() => openDocViewByNo(d), 300);
    const it = p.get("item");
    if (it && typeof bxAllParts === "function" && !p.get("bom")) setTimeout(() => snRoute(it), 300);
  } catch (e) { /* ignore */ }
}
