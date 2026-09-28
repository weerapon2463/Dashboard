// Runs apps-script/Code.gs locally with small stand-ins for the Google services it uses
// (Sheets, Properties, Cache, Lock, Utilities, ContentService), served over HTTP like the
// real web app. Used by the tests to exercise the real server code without touching Google.
//
//   node tests/gas-server.js <port> <data.json> <token> [secure=0|1]
const http = require("http");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const crypto = require("crypto");

const [port = 8790, dataFile, token = "testtoken", secure = "0"] = process.argv.slice(2);

/* ---- Sheets ---------------------------------------------------------------- */
function Range(sheet, r, c, nr, nc) {
  const self = {
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = sheet.rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? "" : row[c - 1 + j]); out.push(o); } return out; },
    getDisplayValues: () => self.getValues().map((row) => row.map(String)),
    setValues: (v) => { v.forEach((row, i) => { const t = sheet.rows[r - 1 + i] = sheet.rows[r - 1 + i] || []; row.forEach((x, j) => { t[c - 1 + j] = x; }); }); return self; },
    setValue: (x) => self.setValues([[x]]),
    setNumberFormat: () => self, setFontWeight: () => self, setBackground: () => self, getBackground: () => "#ffffff",
  };
  return self;
}
function Sheet(name) {
  const sh = {
    name, rows: [], hidden: false,
    getName: () => name,
    getLastRow: () => sh.rows.length,
    getLastColumn: () => sh.rows.reduce((m, r) => Math.max(m, (r || []).length), 0),
    getMaxColumns: () => Math.max(26, sh.getLastColumn()),
    insertColumnsAfter: () => sh,
    getRange: (r, c, nr, nc) => (typeof r === "string" ? Range(sh, 1, 1, 1, 1) : Range(sh, r, c, nr || 1, nc || 1)),
    appendRow: (row) => { sh.rows.push(row.slice()); return sh; },
    setFrozenRows: () => sh, getFrozenRows: () => 1, hideSheet: () => { sh.hidden = true; return sh; }, isSheetHidden: () => sh.hidden,
    clear: () => { sh.rows = []; return sh; }, setColumnWidth: () => sh, getColumnWidth: () => 100, getFilter: () => null,
  };
  return sh;
}
const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = Sheet(n)),
  getSheets: () => Object.values(sheets),
  getId: () => "local-sheet", getName: () => "FORGE local test",
};
const cache = new Map();
const props = new Map([["TOKEN", token], ["SECURE", secure === "1" ? "1" : "0"], ["SHEET_ID", ""]]);
const G = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) },
  CacheService: { getScriptCache: () => ({
    get: (k) => { const e = cache.get(k); if (!e || e.exp < Date.now()) { cache.delete(k); return null; } return e.v; },
    put: (k, v, ttl) => cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }),
    remove: (k) => cache.delete(k),
  }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: { getUuid: () => crypto.randomUUID(), base64Decode: (s) => Buffer.from(s, "base64"), newBlob: () => ({}), computeDigest: () => [], DigestAlgorithm: {} },
  ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  DriveApp: {}, Logger: { log: () => {} }, console,
};
const ctx = vm.createContext(G);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8"), ctx);
vm.runInContext("mirror_ = function () {};", ctx); // report tabs are not needed here

// seed the store from a snapshot ({ key: value })
const store = ss.insertSheet("_store");
store.rows.push(["key", "version", "updatedAt", "updatedBy", "chunks", "data…"]);
if (dataFile) {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  Object.keys(data).forEach((k) => {
    if (!/^y2j-/.test(k)) return;
    const v = String(data[k]);
    const chunks = [];
    for (let i = 0; i < v.length; i += 45000) chunks.push("~" + v.slice(i, i + 45000));
    store.rows.push([k, 1, new Date().toISOString(), "seed", chunks.length, ...chunks]);
  });
}

const stats = { pulls: [], calls: [] };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (out) => {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(out && out.s !== undefined ? out.s : JSON.stringify(out));
  };
  if (u.pathname === "/_stats") return send(Object.assign({ log: (sheets._log || { rows: [] }).rows.map((r) => r.slice(1, 4)) }, stats));
  if (u.pathname === "/_raw") return send(vm.runInContext("readAll_(true, null)", ctx));
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let p = {};
      try { p = JSON.parse(body || "{}"); if (p.action === "pull") stats.pulls.push(p.keys || "*"); } catch (e) { /* ignore */ }
      try {
        const out = ctx.doPost({ postData: { contents: body } });
        stats.calls.push([p.action, p.key || "", out.s.slice(0, 120)]);
        send(out);
      } catch (e) {
        console.error("gas-server error", p.action, p.key, e && e.stack);
        send({ ok: false, error: "server crashed: " + (e && e.message) });
      }
    });
    return;
  }
  const p = Object.fromEntries(u.searchParams);
  if (p.action === "pull") stats.pulls.push(p.keys || "*");
  send(ctx.doGet({ parameter: p }));
}).listen(Number(port), "127.0.0.1", () => console.log(`gas-server on ${port} secure=${props.get("SECURE")}`));
