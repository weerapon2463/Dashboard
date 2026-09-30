// งานของฉัน: every inbox row opens a page that has something to act on — no error, no empty screen,
// and the page it lands on is one this person may open
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const u = authCurrentUser();
  switchView("mytasks");
  await sleep(60);
  const items = mtCollect();
  const allowed = new Set([...document.querySelectorAll(".nav-item:not([hidden])")].map((b) => b.dataset.view));
  const bad = [];
  for (const x of items) {
    const errs = window.__errs.length;
    try { x.act(); } catch (e) { bad.push(`${x.title}: ${e.message}`); continue; }
    await sleep(40);
    const view = document.querySelector(".view.active");
    const id = view ? view.id.replace("view-", "") : "?";
    const modal = document.querySelector(".modal-backdrop.open");
    if (window.__errs.length > errs) bad.push(`${x.title}: page error ${window.__errs.slice(errs).join(" | ")}`);
    else if (!allowed.has(id) && !modal) bad.push(`${x.title}: opened "${id}" which this user cannot open`);
    else if (!modal && view && view.textContent.replace(/\s+/g, "").length < 40) bad.push(`${x.title}: landed on an empty page (${id})`);
    document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
    switchView("mytasks");
  }
  o.push(`${u.id}: ${items.length} inbox rows opened · ${bad.length} problems`);
  bad.slice(0, 10).forEach((b) => o.push("  ✗ " + b));
  assert(!bad.length, bad.length + " inbox rows do not open properly");
  return o;
}
