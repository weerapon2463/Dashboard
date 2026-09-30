/* ==========================================================================
   แท็บระบบทดลอง — try the DEMO on a device that is set up for company data.

   A browser keeps one localStorage per site, so the demo and the company would
   share it: the demo's sample data could land in the company's copy and be
   uploaded to the company Sheet. A tab opened with ?demo=1 is marked (for this
   tab only, in sessionStorage) and every localStorage key it touches gets the
   prefix below, so it sees an empty device, joins the DEMO like a new device,
   and never reads or writes the company's keys. Other tabs are untouched.
   Must load before storage.js.
   ========================================================================== */

(function () {
  const FLAG = "forge-demo-tab";
  const PREFIX = "forge-demo-tab::";
  let on = false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("demo") === "1") sessionStorage.setItem(FLAG, "1");
    if (q.get("demo") === "0") sessionStorage.removeItem(FLAG);
    if (q.has("demo")) {
      q.delete("demo");
      const rest = q.toString();
      history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
    }
    on = sessionStorage.getItem(FLAG) === "1";
  } catch (e) { on = false; }
  window.FORGE_DEMO_TAB = on;
  if (!on) return;

  const ls = window.localStorage;
  const P = Storage.prototype;
  const get = P.getItem, set = P.setItem, del = P.removeItem, key = P.key;
  P.getItem = function (k) { return get.call(this, this === ls ? PREFIX + k : k); };
  P.setItem = function (k, v) { return set.call(this, this === ls ? PREFIX + k : k, v); };
  P.removeItem = function (k) { return del.call(this, this === ls ? PREFIX + k : k); };
  // storage.js lists and clears keys through these, so it only ever sees this tab's own
  window.FORGE_LS_KEYS = function () {
    const out = [];
    for (let i = 0; i < ls.length; i++) { const k = key.call(ls, i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); }
    return out;
  };
  window.FORGE_LS_CLEAR = function () { window.FORGE_LS_KEYS().forEach((k) => del.call(ls, PREFIX + k)); };
  window.forgeLeaveDemoTab = function () {
    window.FORGE_LS_CLEAR();
    try { sessionStorage.removeItem(FLAG); } catch (e) { /* ignore */ }
    location.href = location.pathname;
  };
  // always say which data this tab is on
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div");
    b.id = "demoTabBadge";
    b.setAttribute("role", "status");
    b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;font-size:13px;background:#1d4ed8;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    b.innerHTML = '🧪 แท็บทดลอง — ข้อมูลจำลอง แยกจากบริษัท <button type="button" style="border:0;border-radius:999px;padding:2px 8px;cursor:pointer;background:#fff;color:#1d4ed8;font:inherit">ออก</button>';
    b.querySelector("button").addEventListener("click", window.forgeLeaveDemoTab);
    document.body.appendChild(b);
  });
})();
