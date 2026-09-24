/**
 * Y2J Production Dashboard — Google Sheets backend (Google Apps Script)
 *
 * Setup (once):
 *   1. Open the Google Sheet → Extensions → Apps Script → paste this file as Code.gs → Save.
 *   2. Select the function "setup" → Run → allow the permissions it asks for.
 *      It creates the "_ตั้งค่า" tab with your secret key (and the Drive folder for attachments).
 *   3. Deploy → New deployment → type "Web app":
 *        Execute as: Me   ·   Who has access: Anyone
 *      → Deploy → copy the Web app URL (ends with /exec).
 *   4. In the dashboard: Admin → ที่เก็บข้อมูล → paste the URL and the secret key → ทดสอบ → เชื่อมต่อ.
 *
 * Data model: the dashboard stores each dataset (documents, purchasing, users, audit log …) as one
 * JSON value per key in the hidden "_store" tab (split across cells, a cell holds max 50,000 chars).
 * Human-readable report tabs (เอกสาร, จัดซื้อ, ผู้ใช้, ประวัติ, …) are rebuilt on every save —
 * they are for reading/reporting; edits there are overwritten, make changes in the dashboard.
 */

const STORE_SHEET = "_store";
const CONFIG_SHEET = "_ตั้งค่า";
const CHUNK = 45000;
// Every stored chunk starts with "~" so Sheets never turns a piece of JSON that happens to begin
// with "=", "+", "-" or digits into a formula or a number. Stripped again when reading.
const CHUNK_MARK = "~";
const FILE_FOLDER = "Y2J Dashboard — ไฟล์แนบ";
// Left empty in the public repo. An automated deploy (clasp) fills it in so the first request
// completes setup by itself; with it empty, run setup() manually as described above.
const PRESET_TOKEN = "";

/* ------------------------------------------------------------------ setup */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty("TOKEN");
  if (!token) {
    token = PRESET_TOKEN || Utilities.getUuid().replace(/-/g, "").slice(0, 24);
    props.setProperty("TOKEN", token);
  }
  props.setProperty("SHEET_ID", ss.getId());
  storeSheet_();
  const cfg = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
  cfg.clear();
  cfg.getRange(1, 1, 6, 2).setValues([
    ["รหัสลับ (Secret key) — ใส่ในหน้า Admin ของ Dashboard", token],
    ["โฟลเดอร์ไฟล์แนบใน Google Drive", folder_().getUrl()],
    ["ขั้นต่อไป", "Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → คัดลอก URL"],
    ["หมายเหตุ", "อย่าแชร์รหัสลับนี้กับคนนอก — ใครมีทั้ง URL และรหัสลับจะอ่าน/เขียนข้อมูลได้"],
    ["ตั้งค่าเมื่อ", new Date()],
    ["Sheet ID", ss.getId()],
  ]);
  cfg.setColumnWidth(1, 380);
  cfg.setColumnWidth(2, 520);
  cfg.getRange("A1:A6").setFontWeight("bold");
  cfg.getRange("B1").setFontWeight("bold").setBackground("#fff3c4");
  Logger.log("Secret key: " + token);
  return token;
}

/* ------------------------------------------------------------------ http */

function doGet(e) {
  return handle_(e.parameter || {});
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (err) { return json_({ ok: false, error: "bad json" }); }
  return handle_(body);
}

function handle_(p) {
  try {
    let token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token && PRESET_TOKEN && p.token === PRESET_TOKEN) token = setup(); // first request after an automated deploy
    if (!token) return json_({ ok: false, error: "ยังไม่ได้รัน setup() ใน Apps Script" });
    if (p.token !== token) return json_({ ok: false, error: "รหัสลับไม่ถูกต้อง" });
    switch (p.action) {
      case "ping": return json_({ ok: true, name: sheet_().getName(), keys: Object.keys(readAll_(false)).length });
      case "versions": return json_({ ok: true, versions: versions_() });
      case "pull": return json_({ ok: true, data: readAll_(true, p.keys ? String(p.keys).split(",") : null) });
      case "push": return json_(push_(p));
      case "upload": return json_(upload_(p));
      case "file": return json_(file_(p.id));
      case "bomfiles": return json_(bomFiles_(p.company === "y2j" ? "" : p.company));
      default: return json_({ ok: false, error: "unknown action" });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ store */

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function storeSheet_() {
  const ss = sheet_();
  let sh = ss.getSheetByName(STORE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(STORE_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([["key", "version", "updatedAt", "updatedBy", "chunks", "data…"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

// row objects: { row, key, version, updatedAt, updatedBy, value? }
function readRows_(withValues) {
  const sh = storeSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = Math.max(5, sh.getLastColumn());
  const vals = sh.getRange(2, 1, last - 1, width).getValues();
  return vals.map((r, i) => {
    const o = { row: i + 2, key: String(r[0]), version: Number(r[1]) || 0, updatedAt: r[2] instanceof Date ? r[2].toISOString() : String(r[2] || ""), updatedBy: String(r[3] || "") };
    if (withValues) o.value = r.slice(5, 5 + (Number(r[4]) || 0)).map((c) => { const t = String(c); return t.charAt(0) === CHUNK_MARK ? t.slice(1) : t; }).join("");
    return o;
  }).filter((o) => o.key);
}

function readAll_(withValues, onlyKeys) {
  const out = {};
  readRows_(withValues).forEach((o) => {
    if (onlyKeys && onlyKeys.indexOf(o.key) < 0) return;
    out[o.key] = withValues ? { value: o.value, version: o.version, updatedAt: o.updatedAt, updatedBy: o.updatedBy } : { version: o.version };
  });
  return out;
}

function versions_() {
  const out = {};
  readRows_(false).forEach((o) => { out[o.key] = { version: o.version, updatedBy: o.updatedBy, updatedAt: o.updatedAt }; });
  return out;
}

function push_(p) {
  const key = String(p.key || "");
  if (!/^y2j-[a-z0-9-]+$/.test(key)) return { ok: false, error: "bad key" };
  const value = String(p.value == null ? "" : p.value);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = storeSheet_();
    const rows = readRows_(false);
    const cur = rows.filter((r) => r.key === key)[0];
    const curVersion = cur ? cur.version : 0;
    // optimistic concurrency: the client must have seen the latest version (or force)
    if (!p.force && Number(p.baseVersion || 0) !== curVersion) {
      const now = readAll_(true, [key])[key];
      return { ok: false, conflict: true, current: now || { value: "", version: 0 } };
    }
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(CHUNK_MARK + value.slice(i, i + CHUNK));
    if (!chunks.length) chunks.push(CHUNK_MARK);
    const version = curVersion + 1;
    const rowIdx = cur ? cur.row : sh.getLastRow() + 1;
    const width = Math.max(sh.getLastColumn(), 5 + chunks.length);
    // ISO text, not a Date: the row is text-formatted so a Date would be re-parsed in the wrong timezone
    const line = [key, version, new Date().toISOString(), String(p.by || ""), chunks.length].concat(chunks);
    while (line.length < width) line.push("");
    if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
    sh.getRange(rowIdx, 1, 1, width).setNumberFormat("@").setValues([line]);
    SpreadsheetApp.flush();
    try { mirror_(key, value); } catch (err) { /* report tabs are best-effort */ }
    return { ok: true, version: version };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ files (Google Drive) */

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* recreate */ } }
  const f = DriveApp.createFolder(FILE_FOLDER);
  props.setProperty("FOLDER_ID", f.getId());
  return f;
}

function upload_(p) {
  if (!p.id || !p.data) return { ok: false, error: "missing file" };
  const bytes = Utilities.base64Decode(p.data);
  const blob = Utilities.newBlob(bytes, p.type || "application/octet-stream", p.id + "__" + (p.name || "file"));
  const file = folder_().createFile(blob);
  return { ok: true, fileId: file.getId(), url: file.getUrl() };
}

function file_(id) {
  const it = folder_().searchFiles("title contains '" + String(id).replace(/'/g, "") + "__'");
  if (!it.hasNext()) return { ok: false, error: "not found" };
  const f = it.next();
  const blob = f.getBlob();
  return { ok: true, name: f.getName().split("__").slice(1).join("__"), type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ------------------------------------------------------------------ readable report tabs */

// One separate Google Sheet FILE per BOM (model) in a Drive folder, plus an index tab with links in
// this spreadsheet. Files of models that no longer exist are moved to the Drive trash.
function bomFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("BOM_FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* recreate */ } }
  const f = DriveApp.createFolder("Y2J Dashboard — BOM");
  props.setProperty("BOM_FOLDER_ID", f.getId());
  return f;
}

function companyInfo_(co) {
  try {
    const auth = JSON.parse(readAll_(true, ["y2j-auth-v1"])["y2j-auth-v1"].value);
    const c = (auth.companies || []).filter((x) => x.id === (co || "y2j"))[0];
    if (c) return c;
  } catch (err) { /* fall through */ }
  return { id: co || "y2j", name: co ? co : "Y2J Machinery Co., Ltd.", short: co ? co.toUpperCase() : "Y2J" };
}

function bomFileProp_(co, model) { return "BOMFILE_" + (co || "y2j") + "_" + model; }

function bomFile_(co, model, title) {
  const props = PropertiesService.getScriptProperties();
  const key = bomFileProp_(co, model);
  const id = props.getProperty(key);
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) { if (f.getName() !== title) f.setName(title); return SpreadsheetApp.openById(id); }
    } catch (err) { /* recreate below */ }
  }
  const ss = SpreadsheetApp.create(title);
  DriveApp.getFileById(ss.getId()).moveTo(bomFolder_());
  props.setProperty(key, ss.getId());
  return ss;
}

function mirrorBom_(d, co, tab) {
  const models = d.models || [];
  const meta = d.meta || {};
  const bom = d.bom || {};
  const comp = companyInfo_(co);
  const safe = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v);
  // drawing registered for each part code (latest non-cancelled), from the same company's documents
  const drawings = {};
  try {
    const docsKey = "y2j-dept-docs-v1" + (co ? "--c-" + co : "");
    const docs = JSON.parse(readAll_(true, [docsKey])[docsKey].value);
    (docs.dwg || []).filter((x) => x.partCode && x.status !== "ยกเลิก").forEach((x) => {
      const cur = drawings[x.partCode];
      if (!cur || String(x.rev) > String(cur.rev)) drawings[x.partCode] = x;
    });
  } catch (err) { /* no drawings yet */ }

  const index = [];
  models.forEach((m) => {
    const mt = meta[m] || {};
    const lines = bom[m] || [];
    const hist = mt.history || [];
    const last = hist[hist.length - 1] || {};
    const ss = bomFile_(co, m, "BOM-" + m + " — " + (comp.short || comp.name));
    const sh = ss.getSheets()[0];
    sh.setName("BOM");
    sh.clear();
    const head = [
      ["ใบรายการวัสดุ (Bill of Materials)", ""],
      ["บริษัท", comp.name],
      ["เลขที่ BOM", "BOM-" + m],
      ["รุ่นเครื่องจักร", m],
      ["Revision", mt.rev || ""],
      ["สถานะ", mt.status || ""],
      ["แก้ไขล่าสุด", (last.date || "") + (last.note ? " — " + last.note : "") + (last.ref ? " (" + last.ref + ")" : "")],
      ["อัปเดตจาก Dashboard", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    ];
    sh.getRange(1, 1, head.length, 2).setValues(head.map((r) => r.map(safe)));
    sh.getRange(1, 1).setFontWeight("bold").setFontSize(14);
    sh.getRange(2, 1, head.length - 1, 1).setFontWeight("bold").setBackground("#f1f3f4");
    const header = ["ข้อ", "ระดับ", "รหัสชิ้นส่วน", "ชื่อชิ้นส่วน", "จำนวน/ชุดแม่", "รวม/คัน", "หน่วย", "ผลิตเอง/ซื้อ", "ใช้ที่ (ผู้รับไปใช้ต่อ)", "ขั้นตอน", "แบบ (Drawing)", "หมายเหตุ"];
    const rows = bomTree_(lines).map((r) => {
      if (r.group) return [r.no, "กลุ่มงาน", "", r.group, "", "", "", "", "", "", "", ""].map(safe);
      const l = r.line;
      const dw = drawings[l.code];
      return [r.no, r.depth, l.code || "", "  ".repeat(r.depth - 1) + (l.part || ""), l.qty, r.per, l.unit || "", l.source || "", l.station || "", l.op || "",
        dw ? dw.no + " Rev." + (dw.rev || "-") : "", l.note || ""].map(safe);
    });
    const top = head.length + 2;
    sh.getRange(top, 1, 1, header.length).setValues([header]).setFontWeight("bold").setBackground("#e8eef7");
    if (rows.length) {
      sh.getRange(top + 1, 1, rows.length, header.length).setValues(rows).setFontWeight("normal").setBackground(null);
      sh.getRange(top + 1, 1, rows.length, 1).setNumberFormat("@");
      rows.forEach((r, i) => { if (r[1] === "กลุ่มงาน") sh.getRange(top + 1 + i, 1, 1, header.length).setFontWeight("bold").setBackground("#f1f3f4"); });
    }
    sh.setFrozenRows(top);
    sh.autoResizeColumns(1, header.length);
    // revision history on a second tab
    const hs = ss.getSheetByName("ประวัติ Revision") || ss.insertSheet("ประวัติ Revision");
    hs.clear();
    hs.getRange(1, 1, 1, 4).setValues([["Rev.", "วันที่", "รายละเอียด", "อ้างอิง"]]).setFontWeight("bold").setBackground("#e8eef7");
    if (hist.length) hs.getRange(2, 1, hist.length, 4).setValues(hist.slice().reverse().map((h) => [h.rev || "", h.date || "", h.note || "", h.ref || ""].map(safe)));
    const make = lines.filter((l) => l.source === "ผลิตเอง").length;
    index.push(["BOM-" + m, mt.rev || "", mt.status || "", lines.length, make, lines.length - make, last.date || "", ss.getUrl()]);
  });
  writeTab_(tab("BOM (สารบัญ)"), ["เลขที่ BOM", "Revision", "สถานะ", "จำนวนรายการ", "ผลิตเอง", "ซื้อ", "แก้ไขล่าสุด", "ไฟล์ Google Sheet"], index);

  // models removed from the dashboard: trash their files (recoverable from Drive trash for 30 days)
  const props = PropertiesService.getScriptProperties();
  const prefix = "BOMFILE_" + (co || "y2j") + "_";
  Object.keys(props.getProperties()).forEach((k) => {
    if (k.indexOf(prefix) !== 0) return;
    const model = k.slice(prefix.length);
    if (models.indexOf(model) >= 0) return;
    try { DriveApp.getFileById(props.getProperty(k)).setTrashed(true); } catch (err) { /* already gone */ }
    props.deleteProperty(k);
  });
  // earlier versions put one tab per BOM in this spreadsheet — remove those
  const main = sheet_();
  main.getSheets().forEach((sh) => {
    const n = sh.getName();
    const mine = co ? n.indexOf("BOM-") === 0 && n.slice(-(" (" + co + ")").length) === " (" + co + ")" : n.indexOf("BOM-") === 0 && !/ \([a-z0-9]{2,12}\)$/.test(n);
    if (mine && main.getSheets().length > 1) main.deleteSheet(sh);
  });
}

// Same numbering as the dashboard: group › assembly › sub-part, with quantity per machine
const BOM_GROUP_BY_PREFIX_ = { FR: "โครงสร้างและตัวถัง (Frame)", BL: "ชุดตัด (Cutting)", GR: "ระบบขับเคลื่อน (Drive)", CV: "ระบบลำเลียง (Conveyor)", HY: "ระบบไฮดรอลิก (Hydraulic)", EL: "ระบบไฟฟ้าและควบคุม (Electrical)" };
function bomTree_(lines) {
  const ids = {};
  lines.forEach((l, i) => { if (!l.id) l.id = "L" + (i + 1); ids[l.id] = true; });
  const groupOf = (l) => l.group || BOM_GROUP_BY_PREFIX_[String(l.code || "").slice(0, 2).toUpperCase()] || "ทั่วไป";
  const order = Object.keys(BOM_GROUP_BY_PREFIX_).map((k) => BOM_GROUP_BY_PREFIX_[k]);
  const tops = lines.filter((l) => !l.parent || !ids[l.parent]);
  const groups = [];
  tops.forEach((l) => { const g = groupOf(l); if (groups.indexOf(g) < 0) groups.push(g); });
  const rank = (g) => { const i = order.indexOf(g); return i < 0 ? 99 : i; };
  groups.sort((a, b) => rank(a) - rank(b));
  const out = [];
  const seen = {};
  const walk = (list, prefix, depth, mult) => list.forEach((l, i) => {
    if (seen[l.id] || depth > 10) return;
    seen[l.id] = true;
    const no = prefix + "." + (i + 1);
    const per = (Number(l.qty) || 0) * mult;
    out.push({ line: l, no: no, depth: depth, per: per });
    walk(lines.filter((c) => c.parent === l.id), no, depth + 1, per);
  });
  groups.forEach((g, gi) => {
    out.push({ group: g, no: String(gi + 1) });
    walk(tops.filter((l) => groupOf(l) === g), String(gi + 1), 1, 1);
  });
  return out;
}

function bomFiles_(co) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const prefix = "BOMFILE_" + (co || "y2j") + "_";
  const out = {};
  Object.keys(props).forEach((k) => {
    if (k.indexOf(prefix) === 0) out[k.slice(prefix.length)] = "https://docs.google.com/spreadsheets/d/" + props[k] + "/edit";
  });
  return { ok: true, files: out, folder: PropertiesService.getScriptProperties().getProperty("BOM_FOLDER_ID") || "" };
}

/* ------------------------------------------------------------------ */

function writeTab_(name, header, rows) {
  const ss = sheet_();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  // text typed by users must never run as a formula in the report tabs
  const safe = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v);
  const data = [header].concat(rows.length ? rows.map((r) => r.map(safe)) : [header.map(() => "")]);
  sh.getRange(1, 1, data.length, header.length).setValues(data);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#e8eef7");
  sh.setFrozenRows(1);
  const note = "สร้างอัตโนมัติจาก Dashboard — แก้ข้อมูลที่ Dashboard (แก้ในแท็บนี้จะถูกเขียนทับ)";
  sh.getRange(1, 1).setNote(note);
}

function userNames_() {
  const map = {};
  try {
    const auth = JSON.parse(readAll_(true, ["y2j-auth-v1"])["y2j-auth-v1"].value);
    (auth.users || []).forEach((u) => { map[u.id] = u.name; });
  } catch (err) { /* no users yet */ }
  return map;
}

const VIS_ = { all: "ทั่วไป", dept: "เฉพาะแผนก", custom: "ลับ (เฉพาะที่เลือก)", private: "ส่วนตัว" };
const STAGE_ = { pr: "เปิด PR", approve: "อนุมัติ PR", rfq: "ขอราคา", po: "ออก PO", ack: "ผู้ขายยืนยัน", ship: "จัดส่ง", grn: "รับของ", iqc: "ตรวจรับ", issue: "จ่ายให้ไลน์", pay: "จ่ายเงิน" };

function mirror_(key, value) {
  let d;
  try { d = JSON.parse(value); } catch (err) { return; }
  // other companies' datasets are stored as "<key>--c-<company>" → their report tabs get a "(company)" suffix
  const co = key.indexOf("--c-") >= 0 ? key.split("--c-")[1] : "";
  const base = key.split("--c-")[0];
  const tab = (name) => (co ? name + " (" + co + ")" : name);
  key = base;
  const names = key === "y2j-auth-v1" ? {} : userNames_();
  const who = (id) => names[id] || id || "";
  if (key === "y2j-dept-docs-v1") {
    const rows = [];
    Object.keys(d).forEach((t) => (d[t] || []).forEach((doc) => rows.push([
      t.toUpperCase(), doc.no || "", doc.title || "", doc.status || "", doc.model || "", doc.owner || "", doc.date || doc.due || "",
      VIS_[(doc.visibility && doc.visibility.mode) || "all"] || "", who(doc.createdBy), doc.createdAt || "", who(doc.updatedBy), doc.updatedAt || "", (doc.files || []).length,
    ])));
    writeTab_(tab("เอกสาร"), ["ชนิด", "เลขที่", "เรื่อง", "สถานะ", "รุ่น", "ผู้รับผิดชอบ", "วันที่", "การมองเห็น", "สร้างโดย", "สร้างเมื่อ", "แก้ล่าสุดโดย", "แก้เมื่อ", "ไฟล์แนบ"], rows);
  }
  if (key === "y2j-dept-docs-v1") {
    const mcByNo = {};
    (d.mc || []).forEach((m) => { mcByNo[m.no] = m; });
    const reqRows = [];
    (d.mreq || []).filter((r) => r.items && r.items.length).forEach((r) => r.items.forEach((it) => {
      const out = ["รออนุมัติ", "อนุมัติ", "จ่ายบางส่วน"].indexOf(r.status) >= 0 ? Math.max(0, (Number(it.req) || 0) - (Number(it.issued) || 0)) : 0;
      reqRows.push([r.no, r.status, r.wo || "", r.model || "", r.purpose || "", r.owner || "", r.requestedBy || who(r.createdBy), r.date || "",
        it.item || "", it.code || "", it.part || "", it.unit || "", Number(it.req) || 0, Number(it.issued) || 0, Number(it.ret) || 0, out]);
    }));
    writeTab_(tab("ใบเบิกวัสดุ"), ["ใบเบิก", "สถานะ", "งาน (WO/SV)", "รุ่น", "ประเภท", "ผู้รับของ", "สั่งเบิกโดย", "วันที่", "ข้อ BOM", "รหัส", "รายการ", "หน่วย", "ขอ", "จ่ายแล้ว", "คืน", "ค้างจ่าย"], reqRows);
    const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
    const warrantyEnd = (m) => {
      if (!m) return "";
      if (m.warranty) return m.warranty;
      if (!m.delivered) return "";
      const x = new Date(m.delivered + "T00:00:00");
      x.setFullYear(x.getFullYear() + 1);
      return Utilities.formatDate(x, "Asia/Bangkok", "yyyy-MM-dd");
    };
    writeTab_(tab("ทะเบียนเครื่องลูกค้า"), ["เลขทะเบียน", "หมายเลขเครื่อง", "รุ่น", "BOM Rev.", "ลูกค้า", "สถานที่", "ส่งมอบ", "ประกันถึง", "ในประกัน", "ชั่วโมงใช้งาน", "SO", "WO", "สถานะ"],
      (d.mc || []).map((m) => { const e = warrantyEnd(m); return [m.no, m.title || "", m.model || "", m.rev || "", m.customer || "", m.location || "", m.delivered || "", e, e && today <= e ? "ใช่" : "ไม่", m.hours || "", m.so || "", m.wo || "", m.status || ""]; }));
    writeTab_(tab("งานบริการ & เคลม"), ["ใบงาน", "สถานะ", "งาน", "เครื่อง", "ลูกค้า", "รุ่น", "ประเภท", "ความเร่งด่วน", "ช่าง", "รับแจ้ง", "นัดหมาย", "ค่าบริการ", "สาเหตุเคลม", "ผู้ขาย", "สถานะเคลม", "เลขที่เคลม", "มูลค่าเคลม"],
      (d.svc || []).map((v) => { const m = mcByNo[v.machine]; return [v.no, v.status || "", v.title || "", m ? m.title : (v.machine || ""), v.customer || (m && m.customer) || "", v.model || (m && m.model) || "", v.kind || "", v.priority || "", v.tech || "", v.date || "", v.appt || "", v.cost || "", v.claimCause || "", v.supplier || "", v.claimStatus || "", v.claimRef || "", v.claimAmount || ""]; }));
  }
  if (key === "y2j-stock-v1") {
    const items = d.items || {};
    writeTab_(tab("คงคลัง"), ["รหัส", "ที่เก็บ", "คงคลัง", "จุดสั่งซื้อ", "สถานะ"],
      Object.keys(items).sort().map((k) => { const it = items[k]; const q = Number(it.qty) || 0, mn = Number(it.min) || 0; return [k, it.loc || "", q, mn || "", q <= 0 ? "หมด" : mn && q <= mn ? "ถึงจุดสั่งซื้อ" : "ปกติ"]; }));
  }
  if (key === "y2j-procurement-v1" && d.suppliers) {
    writeTab_(tab("ผู้ขาย"), ["ผู้ขาย", "ประเภท", "ผู้ติดต่อ", "โทร", "อีเมล", "เงื่อนไขชำระ", "Lead time (วัน)", "คะแนน", "ชิ้นส่วนที่ซื้อ", "สถานะ"],
      d.suppliers.map((x) => [x.name, x.category || "", x.contact || "", x.phone || "", x.email || "", x.terms || "", x.leadTime || "", x.rating || "", x.parts || "", x.status || ""]));
  }
  if (key === "y2j-p2p-v1") {
    writeTab_(tab("จัดซื้อ"), ["PR", "รายการ", "จำนวน", "หน่วย", "ผู้ขอ", "ผู้ขาย", "PO", "มูลค่า", "วันที่ต้องใช้", "นัดส่ง", "ขั้นล่าสุด", "เมื่อ", "โดย", "สถานะ", "ประเด็นค้าง"],
      (d || []).map((c) => {
        const ev = (c.events || []).filter((e) => !e.superseded);
        const last = ev[ev.length - 1] || {};
        return [c.pr, c.item, c.qty, c.unit, c.requester, c.supplier || "", c.po || "", c.value || "", c.needBy || "", c.promised || "",
          STAGE_[last.stage] || last.stage || "", last.at || "", last.by || "", c.status === "cancelled" ? "ยกเลิก" : "",
          (c.issues || []).filter((i) => !i.resolved).map((i) => i.type + ": " + i.note).join(" | ")];
      }));
  }
  if (key === "y2j-audit-v1") {
    writeTab_(tab("ประวัติ"), ["วันเวลา", "ผู้ใช้", "การกระทำ", "เป้าหมาย", "รายละเอียด"],
      (d || []).slice().reverse().map((e) => [e.ts, e.userName, e.action, e.target, e.detail]));
  }
  if (key === "y2j-auth-v1") {
    const teams = {};
    (d.teams || []).forEach((t) => { teams[t.id] = t.name; });
    writeTab_(tab("ผู้ใช้"), ["ชื่อ", "ชื่อผู้ใช้", "ตำแหน่ง", "บทบาท", "แผนก", "ทีม", "ใช้งาน", "เข้าระบบล่าสุด"],
      (d.users || []).map((u) => [u.name, u.username, u.position || "", u.role, u.dept || "ส่วนกลาง", (u.teams || []).map((t) => teams[t] || t).join(", "), u.active ? "ใช่" : "ไม่", u.lastLogin || ""]));
  }
  if (key === "y2j-plans-v1") {
    writeTab_(tab("แผนงาน"), ["แผน", "เจ้าของ", "สถานะ", "เริ่ม", "กำหนดเสร็จ", "ความคืบหน้า", "การมองเห็น"],
      (d || []).map((p) => {
        const items = p.items || [];
        const pct = p.status === "เสร็จแล้ว" ? 100 : items.length ? Math.round(items.filter((i) => i.done).length / items.length * 100) : 0;
        return [p.title, who(p.owner), p.status, p.start || "", p.due || "", pct + "%", VIS_[(p.visibility && p.visibility.mode) || "all"] || ""];
      }));
  }
  if (key === "y2j-pilot-v1") {
    writeTab_(tab("Pilot"), ["ตัวชี้วัด", "หน่วย", "ทิศทางที่ดี", "ก่อนใช้", "หลังใช้", "ครั้ง/เดือน", "จำนวนคน"],
      (d.kpis || []).map((k) => [k.name, k.unit, k.direction === "higher" ? "มากขึ้น" : "น้อยลง", k.before == null ? "" : k.before, k.after == null ? "" : k.after, k.timesPerMonth == null ? "" : k.timesPerMonth, k.people == null ? "" : k.people]));
  }
  if (key === "y2j-bom-v1") mirrorBom_(d, co, tab);
  if (key === "y2j-workorders-v1") {
    writeTab_(tab("ใบสั่งผลิต"), ["เลขที่", "PO", "รุ่น", "ไลน์", "จำนวน", "สถานะ", "เบิกวัสดุ %", "กำหนดส่ง", "ผู้รับผิดชอบ"],
      (d || []).map((w) => [w.wo, w.po, w.model, w.department, w.qty, w.status, w.issuedPct, w.dueDate, w.assignee || w.claimedBy || ""]));
  }
}
