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
    // open to anyone who has the web-app address: is sign-in on, the names to pick from, sign in / out
    if (p.action === "hello") return json_({ ok: true, secure: secure_() });
    if (p.action === "roster") return json_(secure_() ? roster_() : { ok: false, error: "ยังไม่ได้เปิดการเข้าระบบผ่านเซิร์ฟเวอร์" });
    if (p.action === "login") return json_(secure_() ? login_(p) : { ok: false, error: "ยังไม่ได้เปิดการเข้าระบบผ่านเซิร์ฟเวอร์" });
    if (p.action === "logout") return json_(logout_(p));
    const who = whoIs_(p, token);
    if (!who) return json_(secure_() ? { ok: false, auth: "required", error: "กรุณาเข้าสู่ระบบใหม่" } : { ok: false, error: "รหัสลับไม่ถูกต้อง" });
    if (ADMIN_ACTIONS_.indexOf(p.action) >= 0 && !who.admin) return json_({ ok: false, error: "เฉพาะผู้ดูแลระบบ" });
    switch (p.action) {
      case "ping": return json_({ ok: true, name: sheet_().getName(), keys: Object.keys(readAll_(false)).length, secure: secure_(), me: who.name || "" });
      case "versions": return json_({ ok: true, versions: versions_() });
      case "pull": return json_({ ok: true, data: readFor_(who, p.keys ? String(p.keys).split(",") : null) });
      case "push": return json_(push_(p, who));
      case "secure": return json_(setSecure_(p, who));
      case "signinlog": return json_(signinLog_(p));
      case "revokeall": return json_(revokeAll_(who));
      case "unlock": return json_(unlock_(p, who));
      case "upload": return json_(upload_(p));
      case "file": return json_(file_(p.id));
      case "bomfiles": return json_(bomFiles_(p.company === "y2j" ? "" : p.company));
      case "bomread": return json_(bomRead_(p.company === "y2j" ? "" : p.company, String(p.model || "")));
      case "rebuild": return json_(rebuildTabs_());
      case "organize": return json_(organize_(String(p.folder || "")));
      case "store": return json_(store_(p));
      case "inspect": return json_(inspect_());
      case "renameroot": return json_(renameRoot_(String(p.name || "")));
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

function push_(p, who) {
  const key = String(p.key || "");
  if (!/^y2j-[a-z0-9-]+$/.test(key)) return { ok: false, error: "bad key" };
  let value = String(p.value == null ? "" : p.value);
  who = who || { master: true, admin: true };
  const guarded = !who.master && (key === AUTH_KEY_ || key === AUDIT_KEY_ || isDocsKey_(key));
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = storeSheet_();
    const rows = readRows_(false);
    const cur = rows.filter((r) => r.key === key)[0];
    const curVersion = cur ? cur.version : 0;
    // optimistic concurrency: the client must have seen the latest version (or force)
    if (!p.force && Number(p.baseVersion || 0) !== curVersion) {
      const now = readFor_(who, [key])[key];
      return { ok: false, conflict: true, current: now || { value: "", version: 0 } };
    }
    if (guarded) {
      const curValue = cur ? readAll_(true, [key])[key].value : "";
      const g = key === AUTH_KEY_ ? guardAuth_(value, curValue, who) : key === AUDIT_KEY_ ? guardAudit_(value, curValue, who) : guardDocs_(value, curValue, who);
      if (g.error) return { ok: false, error: g.error };
      value = JSON.stringify(g.value);
    }
    const by = who.master ? String(p.by || "") : who.name;
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(CHUNK_MARK + value.slice(i, i + CHUNK));
    if (!chunks.length) chunks.push(CHUNK_MARK);
    const version = curVersion + 1;
    const rowIdx = cur ? cur.row : sh.getLastRow() + 1;
    const width = Math.max(sh.getLastColumn(), 5 + chunks.length);
    // ISO text, not a Date: the row is text-formatted so a Date would be re-parsed in the wrong timezone
    const line = [key, version, new Date().toISOString(), by, chunks.length].concat(chunks);
    while (line.length < width) line.push("");
    if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
    sh.getRange(rowIdx, 1, 1, width).setNumberFormat("@").setValues([line]);
    SpreadsheetApp.flush();
    try { mirror_(key, value); } catch (err) { /* report tabs are best-effort */ }
    // what was stored differs from what was sent (guarded keys): hand it back so the device matches
    return guarded ? { ok: true, version: version, value: key === AUTH_KEY_ ? stripAuth_(value, who.uid) : isDocsKey_(key) ? docsFor_(value, who.user) : value } : { ok: true, version: version };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ sign-in on the server */
// Script Property SECURE = "1": devices no longer keep the master key. People sign in here and get a
// session (6 hours, renewed while used) that every request carries. Nobody receives another person's
// password hash; users, rights and companies change only from an admin's session; the audit log only
// grows, stamped with the signed-in person; sign-ins go to the "_log" tab.
const AUTH_KEY_ = "y2j-auth-v1";
const AUDIT_KEY_ = "y2j-audit-v1";
const AUDIT_MAX_ = 3000;
const SESSION_TTL_ = 21600;
const MAX_FAILS_ = 5;
const LOCK_MIN_ = 15;
const OWN_FIELDS_ = ["pw", "pin", "pwAt", "mustChange", "signature", "signatureAt", "sigHistory", "lastLogin"];
const ADMIN_ACTIONS_ = ["rebuild", "organize", "store", "inspect", "renameroot", "secure", "signinlog", "revokeall", "unlock"];

function props_() { return PropertiesService.getScriptProperties(); }
function secure_() { return props_().getProperty("SECURE") === "1"; }
function parse_(s, dflt) { try { return s ? JSON.parse(s) : dflt; } catch (err) { return dflt; } }
function authData_() { const e = readAll_(true, [AUTH_KEY_])[AUTH_KEY_]; return parse_(e && e.value, { users: [] }); }
// same short hash the app used for PINs before passwords (FNV-1a) — to spot the default 1234
function pinHash_(pin, salt) {
  let h = 2166136261;
  const s = salt + ":" + pin + ":y2j";
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function findUser_(auth, name) {
  const id = String(name || "").trim().toLowerCase();
  if (!id) return null;
  return (auth.users || []).filter((u) => u.active && (String(u.username || "").toLowerCase() === id || (u.empNo && String(u.empNo).toLowerCase() === id) || u.id === id))[0] || null;
}
function session_(sid) {
  if (!sid) return null;
  const c = CacheService.getScriptCache();
  const raw = c.get("S_" + sid);
  if (!raw) return null;
  const s = parse_(raw, null);
  // "sign every device out" bumps the generation: older sessions stop working
  if (!s || String(s.gen || "0") !== String(props_().getProperty("SESSION_GEN") || "0")) { c.remove("S_" + sid); return null; }
  c.put("S_" + sid, raw, SESSION_TTL_); // sliding: stays valid while the device is in use
  return s;
}

/* ---- back office: sign-in history, sign everyone out, unlock an account ---- */
function signinLog_(p) {
  const sh = sheet_().getSheetByName("_log");
  if (!sh || sh.getLastRow() < 2) return { ok: true, rows: [] };
  const n = Math.min(Number(p.limit) || 300, 2000);
  const last = sh.getLastRow();
  const from = Math.max(2, last - n + 1);
  const rows = sh.getRange(from, 1, last - from + 1, 4).getValues().map((r) => [r[0] instanceof Date ? r[0].toISOString() : String(r[0]), String(r[1]), String(r[2]), String(r[3])]);
  return { ok: true, rows: rows.reverse() };
}
function revokeAll_(who) {
  const g = Number(props_().getProperty("SESSION_GEN") || "0") + 1;
  props_().setProperty("SESSION_GEN", String(g));
  log_("ให้ทุกเครื่องออกจากระบบ", who.name, "");
  return { ok: true, gen: g };
}
function unlock_(p, who) {
  const name = String(p.user || "").trim().toLowerCase();
  if (!name) return { ok: false, error: "ไม่ระบุผู้ใช้" };
  CacheService.getScriptCache().remove("F_" + name);
  const u = findUser_(authData_(), name);
  if (u) { CacheService.getScriptCache().remove("F_" + String(u.username || "").toLowerCase()); if (u.empNo) CacheService.getScriptCache().remove("F_" + String(u.empNo).toLowerCase()); }
  log_("ปลดล็อกบัญชี", who.name, name);
  return { ok: true };
}
function log_(event, who, detail) {
  try {
    const ss = sheet_();
    let sh = ss.getSheetByName("_log");
    if (!sh) { sh = ss.insertSheet("_log"); sh.appendRow(["เวลา", "เหตุการณ์", "ผู้ใช้", "รายละเอียด"]); sh.setFrozenRows(1); sh.getRange("A1:D1").setFontWeight("bold"); }
    sh.appendRow([new Date(), event, String(who || ""), String(detail || "").slice(0, 500)]);
  } catch (err) { /* logging never blocks a request */ }
}

// names for the sign-in screen: no hashes, no signatures
function roster_() {
  return { ok: true, secure: secure_(), users: (authData_().users || []).filter((u) => u.active).map((u) => ({
    id: u.id, username: u.username, name: u.name, empNo: u.empNo || "", role: u.role, dept: u.dept || "", position: u.position || "",
    company: u.company === undefined ? "" : u.company, active: true, iter: u.pw ? Number(String(u.pw).split("$")[1]) || 0 : 0,
  })) };
}

function login_(p) {
  const name = String(p.user || "").trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const fk = "F_" + name;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= MAX_FAILS_) { log_("เข้าระบบถูกระงับชั่วคราว", name, ""); return { ok: false, locked: true, error: "ใส่รหัสผิดเกิน " + MAX_FAILS_ + " ครั้ง — ลองใหม่ใน " + LOCK_MIN_ + " นาที หรือให้ผู้ดูแลตั้งรหัสใหม่" }; }
  const u = findUser_(authData_(), name);
  const good = !!u && (u.pw ? String(u.pw).split("$")[2] === String(p.proof || "") : !!u.pin && u.pin === String(p.proofPin || ""));
  if (!good) {
    cache.put(fk, String(fails + 1), LOCK_MIN_ * 60);
    log_("เข้าระบบไม่สำเร็จ", name, "ครั้งที่ " + (fails + 1));
    return { ok: false, error: fails + 1 >= MAX_FAILS_ ? "ใส่รหัสผิดเกิน " + MAX_FAILS_ + " ครั้ง — ระงับ " + LOCK_MIN_ + " นาที" : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือ " + (MAX_FAILS_ - fails - 1) + " ครั้ง)" };
  }
  cache.remove(fk);
  const sid = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  cache.put("S_" + sid, JSON.stringify({ uid: u.id, name: u.name, gen: props_().getProperty("SESSION_GEN") || "0" }), SESSION_TTL_);
  log_("เข้าระบบ", u.username, u.name);
  return { ok: true, session: sid, uid: u.id, name: u.name,
    mustChange: !!u.mustChange || (!u.pw && u.pin === pinHash_("1234", u.id)) };
}

function logout_(p) {
  const s = session_(p.session);
  if (s) log_("ออกจากระบบ", s.name, "");
  CacheService.getScriptCache().remove("S_" + String(p.session || ""));
  return { ok: true };
}

// who is asking: the master key (setup, backups) or a signed-in person, looked up fresh each time
function whoIs_(p, token) {
  if (p.token && p.token === token) return { master: true, admin: true, name: String(p.by || "") };
  if (!secure_()) return null;
  const s = session_(p.session);
  if (!s) return null;
  const u = (authData_().users || []).filter((x) => x.id === s.uid && x.active)[0];
  if (!u) return null;
  return { uid: u.id, name: u.name, admin: u.role === "admin", user: u };
}

// a person's copy of the users list: everyone else's password hashes removed
function stripAuth_(value, uid) {
  const a = parse_(value, null);
  if (!a || !a.users) return value;
  a.users.forEach((u) => { if (u.id !== uid) { delete u.pw; delete u.pin; } });
  return JSON.stringify(a);
}
function readFor_(who, keys) {
  const data = readAll_(true, keys);
  if (who.master) return data;
  if (data[AUTH_KEY_]) data[AUTH_KEY_].value = stripAuth_(data[AUTH_KEY_].value, who.uid);
  Object.keys(data).forEach((k) => { if (isDocsKey_(k)) data[k].value = docsFor_(data[k].value, who.user); });
  return data;
}

// Documents marked private / department-only / confidential (same rules as the app's visAllows):
// only the people they are meant for receive them at all.
function isDocsKey_(k) { return k === "y2j-dept-docs-v1" || k.indexOf("y2j-dept-docs-v1--c-") === 0; }
function visOk_(doc, u) {
  if (!u || u.role === "admin" || !doc) return true;
  if (doc.createdBy === u.id || doc.receiver === u.id) return true;
  const v = doc.visibility || {};
  const mode = v.mode || "all";
  if (mode === "all") return true;
  if (mode === "private") return false;
  if (mode === "dept") return !!v.ownerDept && v.ownerDept === u.dept;
  if (mode === "custom") return (v.users || []).indexOf(u.id) >= 0 || (v.depts || []).indexOf(u.dept) >= 0 || (v.teams || []).some((t) => (u.teams || []).indexOf(t) >= 0);
  return true;
}
function docsFor_(value, u) {
  const all = parse_(value, null);
  if (!all || typeof all !== "object") return value;
  Object.keys(all).forEach((t) => { if (Array.isArray(all[t])) all[t] = all[t].filter((d) => visOk_(d, u)); });
  return JSON.stringify(all);
}
// a save from someone who never received the hidden documents keeps them as they are
function guardDocs_(value, curValue, who) {
  const next = parse_(value, null);
  const cur = parse_(curValue, {});
  if (!next || typeof next !== "object") return { error: "ข้อมูลเอกสารไม่ถูกต้อง" };
  Object.keys(cur).forEach((t) => {
    if (!Array.isArray(cur[t])) return;
    const hidden = cur[t].filter((d) => !visOk_(d, who.user));
    if (!hidden.length) return;
    const nos = {};
    hidden.forEach((d) => { nos[d.no] = 1; });
    next[t] = (Array.isArray(next[t]) ? next[t] : []).filter((d) => !nos[d.no]).concat(hidden);
  });
  return { value: next };
}

// what the server keeps when a signed-in person saves the users list / the audit log
function guardAuth_(value, curValue, who) {
  const next = parse_(value, null);
  const cur = parse_(curValue, { users: [] });
  if (!next || !Array.isArray(next.users)) return { error: "ข้อมูลผู้ใช้ไม่ถูกต้อง" };
  const byId = {};
  (cur.users || []).forEach((u) => { byId[u.id] = u; });
  if (who.admin) {
    // hashes the admin's device never saw stay as they are; a new password the admin set is taken
    next.users.forEach((u) => { const c = byId[u.id]; if (c && !("pw" in u) && !("pin" in u)) { if ("pw" in c) u.pw = c.pw; if ("pin" in c) u.pin = c.pin; } });
    if (!next.users.some((u) => u.active && u.role === "admin")) return { error: "ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน" };
    const changed = next.users.filter((u) => { const c = byId[u.id]; return !c || c.role !== u.role || c.active !== u.active || JSON.stringify(c.groups || []) !== JSON.stringify(u.groups || []) || JSON.stringify(c.modules || null) !== JSON.stringify(u.modules || null); });
    if (changed.length) log_("แก้ไขผู้ใช้/สิทธิ์", who.name, changed.map((u) => u.username + (byId[u.id] ? "" : " (ใหม่)")).join(", "));
    return { value: next };
  }
  // everyone else: only their own password and signature
  const mine = next.users.filter((u) => u.id === who.uid)[0];
  const c = byId[who.uid];
  if (mine && c) {
    OWN_FIELDS_.forEach((f) => { if (f in mine) c[f] = mine[f]; else if (f === "mustChange") delete c[f]; });
    if (mine.pw && mine.pw !== (byId[who.uid] || {}).pw) log_("เปลี่ยนรหัสผ่าน", who.name, "");
  }
  return { value: cur };
}
function guardAudit_(value, curValue, who) {
  const next = parse_(value, []);
  const cur = parse_(curValue, []);
  if (!Array.isArray(next)) return { error: "bad audit" };
  const k = (e) => [e.ts, e.user, e.action, e.target].join("|");
  const seen = {};
  cur.forEach((e) => { seen[k(e)] = 1; });
  next.forEach((e) => {
    if (!e || seen[k(e)]) return;
    const row = Object.assign({}, e, { user: who.uid, userName: who.name, serverAt: new Date().toISOString() });
    cur.push(row);
    seen[k(e)] = 1;
  });
  while (cur.length > AUDIT_MAX_) cur.shift();
  return { value: cur };
}

// turn server sign-in on/off. Turning it on replaces the master key, so every device that held the old
// one (setup links, company code) is sent to the sign-in screen.
function setSecure_(p, who) {
  if (!who.master && !who.admin) return { ok: false, error: "เฉพาะผู้ดูแลระบบ" };
  const props = props_();
  if (p.on === true || p.on === "1" || p.on === "true") {
    const admins = (authData_().users || []).filter((u) => u.active && u.role === "admin");
    if (!admins.length) return { ok: false, error: "ต้องมีผู้ดูแลระบบอย่างน้อย 1 คนก่อน" };
    const token = Utilities.getUuid().replace(/-/g, "").slice(0, 24);
    props.setProperty("TOKEN", token);
    props.setProperty("SECURE", "1");
    try { sheet_().getSheetByName(CONFIG_SHEET).getRange("B1").setValue(token); } catch (err) { /* tab optional */ }
    log_("เปิดการเข้าระบบผ่านเซิร์ฟเวอร์", who.name, "เปลี่ยนรหัสลับแล้ว");
    return { ok: true, secure: true, token: token };
  }
  props.setProperty("SECURE", "0");
  log_("ปิดการเข้าระบบผ่านเซิร์ฟเวอร์", who.name, "");
  return { ok: true, secure: false, token: props.getProperty("TOKEN") };
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
  const props = PropertiesService.getScriptProperties();
  models.forEach((m) => {
    const mt = meta[m] || {};
    const lines = bom[m] || [];
    const hist = mt.history || [];
    const last = hist[hist.length - 1] || {};
    const tree = bomTree_(lines);
    const content = bomContentFromTree_(tree);
    const sig = hash_(JSON.stringify([mt.rev, mt.status, mt.sheetStamp || "", hist, content, tree.map((r) => (r.line && drawings[r.line.code] ? drawings[r.line.code].no + drawings[r.line.code].rev : ""))]));
    const stKey = bomStateProp_(co, m);
    const state = JSON.parse(props.getProperty(stKey) || "{}");
    const fileId = props.getProperty(bomFileProp_(co, m));
    const make0 = lines.filter((l) => l.source === "ผลิตเอง").length;
    const indexRow = (url, note) => index.push(["BOM-" + m, mt.rev || "", mt.status || "", lines.length, make0, lines.length - make0, last.date || "", url, note || ""]);
    if (fileId && state.w === sig) { indexRow("https://docs.google.com/spreadsheets/d/" + fileId + "/edit", state.pending ? "มีการแก้ใน Sheet ที่ยังไม่นำเข้า" : ""); return; }
    const ss = bomFile_(co, m, "BOM-" + m + " — " + (comp.short || comp.name));
    const sh = ss.getSheetByName("BOM") || ss.getSheets()[0];
    if (state.s) {
      const cur = hash_(JSON.stringify(bomReadSheet_(sh).content));
      if (cur !== state.s && cur !== mt.sheetStamp) {
        // someone edited this file in Google Sheets and it has not been imported into the dashboard yet
        state.pending = true;
        props.setProperty(stKey, JSON.stringify(state));
        indexRow(ss.getUrl(), "มีการแก้ใน Sheet ที่ยังไม่นำเข้า");
        return;
      }
    }
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
    const rows = tree.map((r) => {
      if (r.group) return [r.no, "กลุ่มงาน", "", r.group, "", "", "", "", "", "", "", ""].map(safe);
      const l = r.line;
      const dw = drawings[l.code];
      return [r.no, r.depth, l.code || "", "  ".repeat(r.depth - 1) + (l.part || ""), l.qty, r.per, l.unit || "", l.source || "", l.station || "", l.op || "",
        dw ? dw.no + " Rev." + (dw.rev || "-") : "", l.note || ""].map(safe);
    });
    const top = head.length + 2;
    sh.getRange(top, 1, 1, header.length).setValues([header]).setFontWeight("bold").setBackground("#e8eef7");
    if (rows.length) {
      sh.getRange(top + 1, 1, rows.length, 1).setNumberFormat("@"); // before the values, so "1.10" stays text
      sh.getRange(top + 1, 1, rows.length, header.length).setValues(rows).setFontWeight("normal").setBackground(null);
      rows.forEach((r, i) => { if (r[1] === "กลุ่มงาน") sh.getRange(top + 1 + i, 1, 1, header.length).setFontWeight("bold").setBackground("#f1f3f4"); });
    }
    sh.setFrozenRows(top);
    sh.autoResizeColumns(1, header.length);
    // revision history on a second tab
    const hs = ss.getSheetByName("ประวัติ Revision") || ss.insertSheet("ประวัติ Revision");
    hs.clear();
    hs.getRange(1, 1, 1, 4).setValues([["Rev.", "วันที่", "รายละเอียด", "อ้างอิง"]]).setFontWeight("bold").setBackground("#e8eef7");
    if (hist.length) hs.getRange(2, 1, hist.length, 4).setValues(hist.slice().reverse().map((h) => [h.rev || "", h.date || "", h.note || "", h.ref || ""].map(safe)));
    SpreadsheetApp.flush();
    props.setProperty(stKey, JSON.stringify({ w: sig, s: hash_(JSON.stringify(bomReadSheet_(sh).content)), at: new Date().toISOString() }));
    indexRow(ss.getUrl(), "");
  });
  writeTab_(tab("BOM (สารบัญ)"), ["เลขที่ BOM", "Revision", "สถานะ", "จำนวนรายการ", "ผลิตเอง", "ซื้อ", "แก้ไขล่าสุด", "ไฟล์ Google Sheet", "หมายเหตุ"], index);

  // models removed from the dashboard: trash their files (recoverable from Drive trash for 30 days)
  const prefix = "BOMFILE_" + (co || "y2j") + "_";
  Object.keys(props.getProperties()).forEach((k) => {
    if (k.indexOf(prefix) !== 0) return;
    const model = k.slice(prefix.length);
    if (models.indexOf(model) >= 0) return;
    try { DriveApp.getFileById(props.getProperty(k)).setTrashed(true); } catch (err) { /* already gone */ }
    props.deleteProperty(k);
    props.deleteProperty(bomStateProp_(co, model));
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
  const kids = {};
  lines.forEach((l) => { if (l.parent && ids[l.parent]) (kids[l.parent] = kids[l.parent] || []).push(l); });
  const walk = (list, prefix, depth, mult) => list.forEach((l, i) => {
    if (seen[l.id] || depth > 10) return;
    seen[l.id] = true;
    const no = prefix + "." + (i + 1);
    const per = (Number(l.qty) || 0) * mult;
    out.push({ line: l, no: no, depth: depth, per: per });
    walk(kids[l.id] || [], no, depth + 1, per);
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
  const edited = {};
  Object.keys(out).forEach((m) => {
    try {
      const st = JSON.parse(props[bomStateProp_(co, m)] || "{}");
      if (!st.at) return;
      const upd = DriveApp.getFileById(props[prefix + m]).getLastUpdated().getTime();
      if (st.pending || upd - new Date(st.at).getTime() > 120000) edited[m] = true;
    } catch (err) { /* unknown */ }
  });
  return { ok: true, files: out, edited: edited, folder: PropertiesService.getScriptProperties().getProperty("BOM_FOLDER_ID") || "" };
}

function bomStateProp_(co, model) { return "BOMSTATE_" + (co || "y2j") + "_" + model; }

function hash_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8));
}

// The comparable content of a BOM table: group rows and item rows (computed columns left out)
function bomContentFromTree_(tree) {
  return tree.map((r) => r.group
    ? ["G", String(r.group).trim()]
    : [r.depth, String(r.line.code || "").trim(), String(r.line.part || "").trim(), Number(r.line.qty) || 0, String(r.line.unit || "").trim(),
      String(r.line.source || "").trim(), String(r.line.station || "").trim(), String(r.line.op || "").trim(), String(r.line.note || "").trim()]);
}

// Read the BOM tab as people may have edited it: columns found by their header text, so a column
// moved or added in Sheets still reads. Group rows = "กลุ่มงาน" in the level column.
function bomReadSheet_(sh) {
  const v = sh.getDataRange().getValues();
  let h = -1;
  for (let i = 0; i < Math.min(v.length, 40); i++) { if (v[i].map((x) => String(x).trim()).indexOf("รหัสชิ้นส่วน") >= 0) { h = i; break; } }
  if (h < 0) return { content: [], rows: [], error: "ไม่พบหัวตาราง (คอลัมน์ \"รหัสชิ้นส่วน\")" };
  const hd = v[h].map((x) => String(x).trim());
  const col = (name) => hd.indexOf(name);
  const c = { level: col("ระดับ"), code: col("รหัสชิ้นส่วน"), part: col("ชื่อชิ้นส่วน"), qty: col("จำนวน/ชุดแม่"), unit: col("หน่วย"),
    source: col("ผลิตเอง/ซื้อ"), station: col("ใช้ที่ (ผู้รับไปใช้ต่อ)"), op: col("ขั้นตอน"), note: col("หมายเหตุ") };
  const get = (row, k) => (c[k] >= 0 ? String(row[c[k]] === null || row[c[k]] === undefined ? "" : row[c[k]]).trim() : "");
  const content = [];
  const rows = [];
  for (let i = h + 1; i < v.length; i++) {
    const row = v[i];
    const level = get(row, "level");
    if (level === "กลุ่มงาน") {
      const g = get(row, "part");
      if (g) { content.push(["G", g]); rows.push({ row: i + 1, group: g }); }
      continue;
    }
    const code = get(row, "code"), part = get(row, "part");
    if (!code && !part) continue;
    const qtyRaw = get(row, "qty").replace(/,/g, "");
    const item = { row: i + 1, level: Number(level) || 1, levelRaw: level, code: code, part: part, qty: qtyRaw === "" ? 0 : Number(qtyRaw), qtyRaw: qtyRaw,
      unit: get(row, "unit"), source: get(row, "source"), station: get(row, "station"), op: get(row, "op"), note: get(row, "note") };
    content.push([item.level, code, part, isNaN(item.qty) ? qtyRaw : item.qty, item.unit, item.source, item.station, item.op, item.note]);
    rows.push(item);
  }
  return { content: content, rows: rows };
}

function bomRead_(co, model) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(bomFileProp_(co, model));
  if (!id) return { ok: false, error: "ยังไม่มีไฟล์ Google Sheet ของ BOM " + model };
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName("BOM") || ss.getSheets()[0];
  const r = bomReadSheet_(sh);
  if (r.error) return { ok: false, error: r.error };
  const st = JSON.parse(props.getProperty(bomStateProp_(co, model)) || "{}");
  const stamp = hash_(JSON.stringify(r.content));
  return { ok: true, model: model, url: ss.getUrl(), rows: r.rows, stamp: stamp, edited: !!st.s && stamp !== st.s,
    updated: DriveApp.getFileById(id).getLastUpdated().toISOString() };
}

/* ------------------------------------------------------------------ */

function writeTab_(name, header, rows) {
  const ss = sheet_();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  // text typed by users must never run as a formula in the report tabs
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const safe = (v) => {
    if (typeof v !== "string") return v;
    if (iso.test(v)) { const d = new Date(v); if (!isNaN(d)) return Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd HH:mm"); }
    return /^[=+\-@]/.test(v) ? "'" + v : v;
  };
  const data = [header].concat(rows.length ? rows.map((r) => r.map(safe)) : [header.map(() => "")]);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, data.length, header.length).setValues(data);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#1f4e79").setFontColor("#ffffff").setVerticalAlignment("middle");
  sh.setFrozenRows(1);
  sh.getRange(1, 1, data.length, header.length).createFilter();
  sh.autoResizeColumns(1, header.length);
  for (let c = 1; c <= header.length; c++) { if (sh.getColumnWidth(c) > 360) sh.setColumnWidth(c, 360); }
  const note = "สร้างอัตโนมัติจาก Dashboard — แก้ข้อมูลที่ Dashboard (แก้ในแท็บนี้จะถูกเขียนทับ)";
  sh.getRange(1, 1).setNote(note);
}

// "2/3 · ผู้จัดทำ: A · ผู้ตรวจสอบ: B" — slot labels come from the form settings when present
function sigText_(sigs) {
  if (!sigs) return "";
  const labels = ["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"];
  const got = [0, 1, 2].filter((i) => sigs[i]);
  return got.length ? got.length + "/3 · " + got.map((i) => labels[i] + ": " + (sigs[i].name || "")).join(" · ") : "";
}

// Rebuild every readable tab from the stored data (after a layout change, or on request)
function rebuildTabs_() {
  const all = readAll_(true);
  const done = [];
  Object.keys(all).forEach((k) => {
    try { mirror_(k, all[k].value); done.push(k); } catch (err) { done.push(k + " ✗ " + err.message); }
  });
  return { ok: true, rebuilt: done };
}

/* ------------------------------------------------------------------ one Drive folder for everything */

// Sub-folders of the organisation's root folder (ROOT_FOLDER_ID). The BOM and attachment folders keep
// their ids when moved, so files the dashboard creates later still land in the right place.
const ROOT_SUBS_ = {
  db: "01 ฐานข้อมูลหลัก (Google Sheet)",
  bom: "02 BOM แยกรุ่น",
  files: "03 ไฟล์แนบเอกสาร",
  award: "04 เอกสารส่งประกวด",
  backup: "05 สำรองข้อมูล",
};

function rootSub_(root, name) {
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function organize_(folderId) {
  const props = PropertiesService.getScriptProperties();
  const id = folderId || props.getProperty("ROOT_FOLDER_ID");
  if (!id) return { ok: false, error: "ไม่ได้ระบุโฟลเดอร์" };
  const root = DriveApp.getFolderById(id);
  props.setProperty("ROOT_FOLDER_ID", id);
  const done = [];
  const step = (label, fn) => { try { fn(); done.push("✓ " + label); } catch (err) { done.push("✗ " + label + ": " + err.message); } };
  const db = rootSub_(root, ROOT_SUBS_.db);
  step("ย้าย Google Sheet หลัก", () => DriveApp.getFileById(sheet_().getId()).moveTo(db));
  step("ย้ายโฟลเดอร์ BOM", () => { const f = bomFolder_(); f.moveTo(root); f.setName(ROOT_SUBS_.bom); });
  step("ย้ายโฟลเดอร์ไฟล์แนบ", () => { const f = folder_(); f.moveTo(root); f.setName(ROOT_SUBS_.files); });
  step("สร้างโฟลเดอร์เอกสารส่งประกวด", () => rootSub_(root, ROOT_SUBS_.award));
  step("สร้างโฟลเดอร์สำรองข้อมูล", () => rootSub_(root, ROOT_SUBS_.backup));
  return { ok: true, root: root.getName(), done: done, url: root.getUrl() };
}

// Save one file (base64) into a sub-folder of the root folder, replacing a file with the same name
function store_(p) {
  const id = PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID");
  if (!id) return { ok: false, error: "ยังไม่ได้ตั้งโฟลเดอร์หลัก (organize)" };
  const sub = rootSub_(DriveApp.getFolderById(id), ROOT_SUBS_[p.sub] || ROOT_SUBS_.backup);
  const name = String(p.name || "file");
  const old = sub.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.type || "application/octet-stream", name);
  const f = sub.createFile(blob);
  return { ok: true, name: name, url: f.getUrl() };
}

// Read-only look at every tab: size, header, filter/frozen rows, column widths and two sample rows
function inspect_() {
  const out = [];
  sheet_().getSheets().forEach((sh) => {
    const rows = sh.getLastRow(), cols = sh.getLastColumn();
    const o = { name: sh.getName(), hidden: sh.isSheetHidden(), rows: rows, cols: cols, frozen: sh.getFrozenRows(), filter: !!sh.getFilter() };
    if (!o.hidden && rows && cols) {
      const n = Math.min(cols, 16);
      const v = sh.getRange(1, 1, Math.min(rows, 3), n).getDisplayValues();
      o.header = v[0];
      o.sample = v.slice(1).map((r) => r.map((x) => String(x).slice(0, 40)));
      o.widths = [];
      for (let c = 1; c <= n; c++) o.widths.push(sh.getColumnWidth(c));
      o.headerBg = sh.getRange(1, 1).getBackground();
    }
    out.push(o);
  });
  return { ok: true, file: sheet_().getName(), tabs: out };
}

function renameRoot_(name) {
  const id = PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID");
  if (!id || !name) return { ok: false, error: "ไม่มีโฟลเดอร์หลักหรือชื่อใหม่" };
  const f = DriveApp.getFolderById(id);
  const old = f.getName();
  f.setName(name);
  return { ok: true, from: old, to: name };
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
      sigText_(doc.signatures),
    ])));
    writeTab_(tab("เอกสาร"), ["ชนิด", "เลขที่", "เรื่อง", "สถานะ", "รุ่น", "ผู้รับผิดชอบ", "วันที่", "การมองเห็น", "สร้างโดย", "สร้างเมื่อ", "แก้ล่าสุดโดย", "แก้เมื่อ", "ไฟล์แนบ", "ลายเซ็น"], rows);
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
    const names = {};
    try {
      const bk = "y2j-bom-v1" + (co ? "--c-" + co : "");
      const b = JSON.parse(readAll_(true, [bk])[bk].value).bom || {};
      Object.keys(b).forEach((m) => (b[m] || []).forEach((l) => { const k = String(l.code || "").trim() || String(l.part || "").trim(); if (k && !names[k]) names[k] = [l.part || "", []]; if (k) names[k][1].push(m); }));
    } catch (err) { /* no BOM */ }
    writeTab_(tab("คงคลัง"), ["รหัส", "ชื่อชิ้นส่วน", "ใช้ในรุ่น", "ที่เก็บ", "คงคลัง", "จุดสั่งซื้อ", "สถานะ"],
      Object.keys(items).sort().map((k) => { const it = items[k]; const q = Number(it.qty) || 0, mn = Number(it.min) || 0; const n = names[k] || ["", []];
        return [k, n[0], n[1].filter((m, i, a) => a.indexOf(m) === i).join(", "), it.loc || "", q, mn || "", q <= 0 ? "หมด" : mn && q <= mn ? "ถึงจุดสั่งซื้อ" : "ปกติ"]; }));
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
    writeTab_(tab("แผนงาน"), ["งาน / นัดหมาย", "วันเริ่ม", "เวลาเริ่ม", "วันสิ้นสุด", "เวลาสิ้นสุด", "ผู้รับผิดชอบ", "ผู้ร่วมแก้ไข", "สร้างโดย", "สถานะ", "ความคืบหน้า", "แท็ก", "การมองเห็น", "แก้ล่าสุด"],
      (d || []).slice().sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")) || String(a.startTime || "").localeCompare(String(b.startTime || ""))).map((p) => {
        const items = p.items || [];
        const pct = p.status === "เสร็จแล้ว" ? 100 : items.length ? Math.round(items.filter((i) => i.done).length / items.length * 100) : 0;
        return [p.title, p.start || "", p.startTime || "", p.due || "", p.endTime || "", (p.assignees || [p.owner]).map(who).join(", "), (p.editors || []).map(who).join(", "),
          who(p.owner), p.status, pct + "%", (p.tags || []).map((t) => "#" + t).join(" "), VIS_[(p.visibility && p.visibility.mode) || "all"] || "", p.updatedAt || ""];
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
