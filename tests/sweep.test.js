// every page and the main dialogs a user can reach open without errors
async function run(ctx) {
  const o = [];
  const u = authCurrentUser();
  const errs0 = window.__errs.length;
  const views = [...document.querySelectorAll(".nav-item:not([hidden])")].map((b) => b.dataset.view);
  const empty = [];
  for (const v of views) {
    try { switchView(v); } catch (e) { window.__errs.push(`view ${v}: ${e.message}`); }
    await sleep(120);
    const el = document.getElementById("view-" + v);
    if (el && el.textContent.replace(/\s+/g, "").length < 40) empty.push(v);
  }
  // deeper actions
  const tryDo = async (name, fn) => { try { await fn(); } catch (e) { window.__errs.push(`${name}: ${e.message}`); } await sleep(60); };
  if (views.includes("bomx")) for (const t of ["tree", "pick", "track", "mrp", "stock", "sx"]) await tryDo("bomx " + t, () => { switchView("bomx"); bxTab = t; if (t === "pick") bxRef = (WORK_ORDERS.find((w) => w.status !== "เสร็จสมบูรณ์") || {}).wo || ""; renderBomx(); if (t === "sx") ["ledger", "wh", "reorder", "entry"].forEach((s) => { sxSub = s; renderBomx(); }); });
  if (views.includes("dept")) await tryDo("docs", () => { let n = 0; Object.keys(DOC_TYPES).forEach((t) => { if (DOC_TYPES[t].special) return; const i = (DEPT_DOCS[t] || []).findIndex((d) => authCanSeeDoc(t, d)); if (i >= 0) { openDocView(t, i); n++; } }); document.getElementById("docViewBackdrop").classList.remove("open"); o.push("docs opened " + n); });
  if (views.includes("workorder")) await tryDo("jobcards", () => { switchView("workorder"); WORK_ORDERS.forEach((w) => { jcWo = w.wo; renderJobCards(); }); });
  await tryDo("history", () => { const w = WORK_ORDERS.find((x) => x.serial); snOpenHistory(w.serial); snCloseModal(); });
  if (views.includes("p2p")) await tryDo("p2p", () => { switchView("p2p"); if (P2P_CASES[0]) openP2PCase(P2P_CASES[P2P_CASES.length - 1].id); });
  if (views.includes("mytasks")) await tryDo("inbox", () => { switchView("mytasks"); const items = mtCollect(); o.push(`inbox ${items.length} [${[...new Set(items.map((x) => x.group))].join(",")}] jc ${document.querySelectorAll("#jcOpBox .jc-op").length}`); items.slice(0, 3).forEach((x) => { try { x.act(); } catch (e) { window.__errs.push("inbox act " + x.title + ": " + e.message); } }); document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open")); });
  await tryDo("tv", () => { tvEnter("floor"); tvSlide = 1; tvRender(); tvEnter("exec"); tvSlide = 1; tvRender(); tvLeave(); });
  if (views.includes("admin")) await tryDo("admin", () => { switchView("admin"); ["users", "groups", "teams", "integrity", "audit", "org", "naming", "storage"].forEach((t) => { adminTab = t; renderAdmin(); }); });
  if (views.includes("reports")) await tryDo("reports", () => switchView("reports"));
  o.unshift(`${u.id} ${u.role}/${u.dept || "-"} views ${views.length} [${views.join(",")}]${empty.length ? " EMPTY " + empty.join(",") : ""}`);
  ctx.assert(!empty.length, "empty pages: " + empty.join(","));
  return o;
}
