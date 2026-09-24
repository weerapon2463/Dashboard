/* ==========================================================================
   Storage location — "this browser" (default) or a shared Google Sheet.

   Every module keeps using localStorage exactly as before. This file sits
   underneath: in Sheets mode it pulls the shared datasets before the app
   starts, sends every change to the Apps Script web app (apps-script/Code.gs),
   polls for other people's changes, and merges record-by-record when two
   people saved the same dataset at the same time. Must load before all
   other scripts.
   ========================================================================== */

const Y2JStore = (() => {
  const CONFIG_KEY = "y2j-storage-config"; // per device
  const META_KEY = "y2j-sync-meta";        // per device: last synced version + base copy per key
  const SHARED = [
    "y2j-auth-v1", "y2j-audit-v1", "y2j-dept-docs-v1", "y2j-bom-v1", "y2j-p2p-v1", "y2j-plans-v1", "y2j-pilot-v1",
    "y2j-workorders-v1", "y2j-procurement-v1", "y2j-master-schedule-v1", "y2j-priority-jobs-v1", "y2j-resource-v1",
    "y2j-form-settings-v1", "y2j-org-v1", "y2j-stock-v1", "y2j-reports-v1",
  ];
  // Datasets that belong to one company. Users/teams/companies and the audit log are group-wide.
  const COMPANY_SCOPED = SHARED.filter((k) => k !== "y2j-auth-v1" && k !== "y2j-audit-v1");
  const COMPANY_KEY = "y2j-company-v1"; // per device: which company this browser is working in
  const DEFAULT_COMPANY = "y2j";
  const POLL_MS = 30000;

  const origSet = Storage.prototype.setItem;
  const origGet = Storage.prototype.getItem;
  const ls = window.localStorage;
  const rawSet = (k, v) => { try { origSet.call(ls, k, v); } catch (e) { /* quota */ } };
  const rawGet = (k) => { try { return origGet.call(ls, k); } catch (e) { return null; } };
  const readJson = (k, dflt) => { try { return JSON.parse(rawGet(k) || "null") || dflt; } catch (e) { return dflt; } };

  let cfg = readJson(CONFIG_KEY, { mode: "local", url: "", token: "" });
  let company = rawGet(COMPANY_KEY) || DEFAULT_COMPANY;
  if (!/^[a-z0-9]{2,12}$/.test(company)) company = DEFAULT_COMPANY;
  // The original company keeps the plain keys, so data saved before companies existed stays put
  const phys = (k) => (company !== DEFAULT_COMPANY && COMPANY_SCOPED.includes(k) ? `${k}--c-${company}` : k);
  const baseOf = (pk) => String(pk).split("--c-")[0];
  const isShared = (pk) => SHARED.includes(baseOf(pk));
  let meta = readJson(META_KEY, { keys: {}, pending: [] });
  const dirty = new Set(meta.pending || []);
  let pushTimer = null;
  let pushing = false;
  let status = { state: "local", at: "", error: "" };
  let remoteChangedBy = "";

  // One-time setup link: ?sheet=<web app url>&key=<secret> configures this device and is removed from the address bar
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("sheet") && q.get("key")) {
      cfg = { mode: "sheets", url: q.get("sheet"), token: q.get("key") };
      rawSet(CONFIG_KEY, JSON.stringify(cfg));
      history.replaceState(null, "", location.pathname + location.hash);
    }
  } catch (e) { /* ignore */ }

  const isRemote = () => cfg.mode === "sheets" && !!cfg.url && !!cfg.token;
  const saveMeta = () => { meta.pending = [...dirty]; rawSet(META_KEY, JSON.stringify(meta)); };
  const who = () => {
    try {
      const auth = JSON.parse(rawGet("y2j-auth-v1") || "{}");
      const sid = rawGet("y2j-session-v1");
      const u = (auth.users || []).find((x) => x.id === sid);
      return u ? u.name : "";
    } catch (e) { return ""; }
  };

  // Every module keeps using the plain key names; here they are mapped to the current company's copy,
  // and saves of shared datasets are queued for Google Sheets.
  const origRemove = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (k) {
    return origGet.call(this, this === ls ? phys(k) : k);
  };
  Storage.prototype.removeItem = function (k) {
    return origRemove.call(this, this === ls ? phys(k) : k);
  };
  Storage.prototype.setItem = function (k, v) {
    const pk = this === ls ? phys(k) : k;
    origSet.call(this, pk, v);
    if (this === ls && isRemote() && isShared(pk)) {
      dirty.add(pk);
      saveMeta();
      schedulePush();
    }
  };
  const localSharedKeys = () => {
    const out = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (isShared(k)) out.push(k); }
    return out;
  };

  /* ---- transport ---------------------------------------------------------- */

  async function api(action, params, post, url, token) {
    const u = url || cfg.url;
    const t = token || cfg.token;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), post ? 45000 : 20000);
    try {
      let res;
      if (post) {
        // text/plain keeps it a "simple" request: no CORS preflight, which Apps Script can't answer
        res = await fetch(u, { method: "POST", body: JSON.stringify(Object.assign({ action, token: t }, params)), signal: ctrl.signal });
      } else {
        const qs = new URLSearchParams(Object.assign({ action, token: t }, params)).toString();
        res = await fetch(`${u}${u.includes("?") ? "&" : "?"}${qs}`, { signal: ctrl.signal });
      }
      const data = await res.json();
      if (!data.ok && !data.conflict) throw new Error(data.error || "error");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---- 3-way merge ----------------------------------------------------------- */

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  function recKey(o) {
    if (!isObj(o)) return undefined;
    if (o.id !== undefined) return "id:" + o.id;
    if (o.no !== undefined) return "no:" + o.no;
    if (o.wo !== undefined) return "wo:" + o.wo;
    if (o.pr !== undefined) return "pr:" + o.pr;
    if (o.username !== undefined) return "u:" + o.username;
    if (o.ts !== undefined) return `ts:${o.ts}|${o.user}|${o.action}|${o.target}`;
    return undefined;
  }
  function merge3(base, local, remote) {
    if (eq(local, base)) return remote;
    if (eq(remote, base)) return local;
    if (eq(local, remote)) return local;
    if (Array.isArray(local) && Array.isArray(remote)) {
      const b = Array.isArray(base) ? base : [];
      const prim = (arr) => arr.every((x) => typeof x !== "object" || x === null);
      if (prim(local) && prim(remote)) {
        const out = remote.filter((x) => !(b.includes(x) && !local.includes(x)));
        local.forEach((x) => { if (!out.includes(x) && !(b.includes(x) && !remote.includes(x))) out.push(x); });
        return out;
      }
      const all = [...b, ...local, ...remote];
      if (!all.every((x) => recKey(x) !== undefined)) return local; // no record ids → this device wins
      const B = new Map(b.map((x) => [recKey(x), x]));
      const L = new Map(local.map((x) => [recKey(x), x]));
      const R = new Map(remote.map((x) => [recKey(x), x]));
      const order = [...remote.map(recKey), ...local.map(recKey).filter((k) => !R.has(k))];
      const out = [];
      order.forEach((k) => {
        const bv = B.get(k), lv = L.get(k), rv = R.get(k);
        if (lv === undefined && bv !== undefined) { if (rv !== undefined && !eq(rv, bv)) out.push(rv); return; }
        if (rv === undefined && bv !== undefined) { if (lv !== undefined && !eq(lv, bv)) out.push(lv); return; }
        if (lv !== undefined && rv !== undefined) out.push(merge3(bv, lv, rv));
        else out.push(lv !== undefined ? lv : rv);
      });
      return out;
    }
    if (isObj(local) && isObj(remote)) {
      const b = isObj(base) ? base : {};
      const out = {};
      new Set([...Object.keys(local), ...Object.keys(remote)]).forEach((k) => {
        const inL = k in local, inR = k in remote, inB = k in b;
        if (!inL && inB && eq(remote[k], b[k])) return;
        if (!inR && inB && eq(local[k], b[k])) return;
        if (!inL) { out[k] = remote[k]; return; }
        if (!inR) { out[k] = local[k]; return; }
        out[k] = merge3(b[k], local[k], remote[k]);
      });
      return out;
    }
    return local;
  }
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  /* ---- pull / push -------------------------------------------------------------- */

  function applyRemote(key, entry) {
    rawSet(key, entry.value);
    meta.keys[key] = { version: entry.version, base: entry.value };
  }

  async function pullAll() {
    const res = await api("pull", {});
    const data = res.data || {};
    const keys = new Set([...Object.keys(data).filter(isShared), ...localSharedKeys()]);
    keys.forEach((key) => {
      const entry = data[key];
      const local = rawGet(key);
      if (!entry) {
        if (local !== null) dirty.add(key); // first connection: upload what this device has
        return;
      }
      if (dirty.has(key) && local !== null) {
        // offline edits from last session: merge them onto the server copy, then push
        const baseStr = meta.keys[key] ? meta.keys[key].base : null;
        const merged = merge3(parse(baseStr), parse(local), parse(entry.value));
        rawSet(key, JSON.stringify(merged));
        meta.keys[key] = { version: entry.version, base: entry.value };
      } else {
        applyRemote(key, entry);
      }
    });
    saveMeta();
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 700);
    setStatus("saving");
  }

  async function flush() {
    if (pushing || !isRemote()) return;
    pushing = true;
    try {
      for (const key of [...dirty]) {
        let attempts = 0;
        while (attempts++ < 4) {
          const value = rawGet(key);
          if (value === null) { dirty.delete(key); break; }
          const m = meta.keys[key] || { version: 0, base: null };
          const res = await api("push", { key, value, baseVersion: m.version, by: who() }, true);
          if (res.ok) {
            meta.keys[key] = { version: res.version, base: value };
            if (rawGet(key) === value) dirty.delete(key);
            break;
          }
          // someone else saved first: merge record-by-record and try again
          const cur = res.current || { value: "null", version: 0 };
          const merged = merge3(parse(m.base), parse(value), parse(cur.value));
          rawSet(key, JSON.stringify(merged));
          meta.keys[key] = { version: cur.version, base: cur.value };
          remoteChangedBy = remoteChangedBy || "ผู้ใช้อื่น";
        }
        saveMeta();
      }
      setStatus(dirty.size ? "saving" : "synced");
      if (remoteChangedBy) onRemoteChange();
    } catch (e) {
      setStatus("offline", e.message);
      setTimeout(() => { if (dirty.size) flush(); }, 15000);
    } finally {
      pushing = false;
      if (dirty.size && status.state !== "offline") schedulePush();
    }
  }

  async function poll() {
    if (!isRemote() || document.hidden || pushing) return;
    try {
      const res = await api("versions", {});
      const changed = Object.keys(res.versions).filter((k) => isShared(k) && res.versions[k].version > ((meta.keys[k] || {}).version || 0) && !dirty.has(k));
      if (changed.length) {
        const pulled = await api("pull", { keys: changed.join(",") });
        changed.forEach((k) => { if (pulled.data[k]) applyRemote(k, pulled.data[k]); });
        saveMeta();
        remoteChangedBy = changed.map((k) => res.versions[k].updatedBy).filter(Boolean)[0] || "ผู้ใช้อื่น";
        onRemoteChange();
      }
      if (status.state === "offline" && !dirty.size) setStatus("synced");
    } catch (e) {
      setStatus("offline", e.message);
    }
  }

  // Other people's changes are in localStorage now; modules hold in-memory copies, so reload
  // when nobody is mid-edit, otherwise offer a button.
  function onRemoteChange() {
    const busy = document.querySelector(".modal-backdrop.open")
      || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
    if (!busy && !dirty.size) { reloadKeepingView(); return; }
    const bar = document.getElementById("syncBanner");
    if (bar) {
      bar.hidden = false;
      bar.querySelector("span").textContent = `มีข้อมูลใหม่จาก ${remoteChangedBy} — บันทึกงานที่ทำอยู่แล้วกดโหลด`;
    }
  }

  function reloadKeepingView() {
    try {
      const active = document.querySelector(".nav-item.active");
      if (active) sessionStorage.setItem("y2j-return-view", active.dataset.view);
    } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---- status chip ------------------------------------------------------------------ */

  function setStatus(state, error) {
    status = { state, at: new Date().toISOString(), error: error || "" };
    const chip = document.getElementById("syncChip");
    if (!chip) return;
    const t = new Date();
    const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    chip.hidden = !isRemote();
    chip.className = `sync-chip sync-${state}`;
    chip.textContent = state === "saving" ? "⏳ กำลังบันทึกลง Sheets…" : state === "offline" ? "⚠ ออฟไลน์ — เก็บไว้ในเครื่องก่อน" : `☁ Google Sheets · ${hm}`;
    chip.title = error || "ข้อมูลแชร์ร่วมกันผ่าน Google Sheets";
  }

  /* ---- startup ------------------------------------------------------------------------ */

  function ready() {
    if (!isRemote()) return Promise.resolve({ mode: "local" });
    const overlay = document.getElementById("syncOverlay");
    if (overlay) overlay.hidden = false;
    const done = (r) => { if (overlay) overlay.hidden = true; return r; };
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ mode: "sheets", offline: true }), 12000));
    return Promise.race([pullAll().then(() => ({ mode: "sheets" })), timeout])
      .catch((e) => ({ mode: "sheets", offline: true, error: e.message }))
      .then((r) => {
        setStatus(r.offline ? "offline" : "synced", r.error);
        if (dirty.size) schedulePush();
        setInterval(poll, POLL_MS);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
        window.addEventListener("online", () => { if (dirty.size) flush(); else poll(); });
        const bar = document.getElementById("syncBanner");
        if (bar) bar.querySelector("button").addEventListener("click", reloadKeepingView);
        return done(r);
      });
  }

  /* ---- files (Google Drive via the web app) --------------------------------------------- */

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function uploadFile(id, blob, name) {
    if (!isRemote()) return null;
    const data = await blobToBase64(blob);
    return api("upload", { id, name: name || blob.name || "file", type: blob.type || "", data }, true);
  }

  async function fetchFile(id) {
    if (!isRemote()) return null;
    const res = await api("file", { id });
    const bin = atob(res.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: res.type || "application/octet-stream" });
  }

  /* ---- admin actions ------------------------------------------------------------------------ */

  async function test(url, token) {
    return api("ping", {}, false, url, token);
  }

  function connect(url, token) {
    cfg = { mode: "sheets", url, token };
    rawSet(CONFIG_KEY, JSON.stringify(cfg));
    meta = { keys: {}, pending: [] };
    dirty.clear();
    saveMeta();
    reloadKeepingView();
  }

  function disconnect() {
    cfg = { mode: "local", url: cfg.url, token: cfg.token };
    rawSet(CONFIG_KEY, JSON.stringify(cfg));
    reloadKeepingView();
  }

  // Overwrite the sheet with this device's data (first-time migration or recovery)
  async function forceUpload() {
    let n = 0;
    for (const key of localSharedKeys()) {
      const value = rawGet(key);
      if (value === null) continue;
      const res = await api("push", { key, value, force: true, by: who() }, true);
      meta.keys[key] = { version: res.version, base: value };
      dirty.delete(key);
      n++;
    }
    saveMeta();
    setStatus("synced");
    return n;
  }

  function setupLink() {
    if (!cfg.url || !cfg.token) return "";
    const base = location.origin + location.pathname;
    return `${base}?sheet=${encodeURIComponent(cfg.url)}&key=${encodeURIComponent(cfg.token)}`;
  }

  function setCompany(id) {
    rawSet(COMPANY_KEY, id);
    try { sessionStorage.removeItem("y2j-return-view"); } catch (e) { /* ignore */ }
    location.reload();
  }

  return {
    ready, test, connect, disconnect, forceUpload, setupLink, uploadFile, fetchFile, flush,
    company: () => company, setCompany,
    bomFiles: () => api("bomfiles", { company }),
    isRemote, config: () => Object.assign({}, cfg), status: () => Object.assign({ pending: [...dirty] }, status),
    sharedKeys: SHARED, merge3,
  };
})();
