// โหมดหน้างาน: opens by itself for production operators, start → stop (reason) → resume → done,
// quick requisition, stop alert reaches the production head, glossary
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const H = document.documentElement;
  const f = document.getElementById("view-floor");
  const u = authCurrentUser();
  const floorUser = u.role === "operator" && u.dept === "prod";
  assert(!!H.getAttribute("data-floor") === floorUser, `floor mode default wrong for ${u.role}/${u.dept}`);
  if (!floorUser) { document.getElementById("floorBtn").click(); await sleep(50); }
  assert(getComputedStyle(f).display === "block", "floor screen not shown");
  assert(getComputedStyle(document.querySelector(".sidebar")).display === "none", "sidebar still visible in floor mode");
  const click = (sel) => { const b = f.querySelector(sel); assert(b, "missing " + sel); if (b) b.click(); return b; };

  // pick a card that can be worked now (running, stopped, or ready)
  const card = [...f.querySelectorAll(".fl-card")].find((c) => c.querySelector('[data-fl="askstop"],[data-fl="start"],[data-fl="claim"]'));
  if (!card) { o.push("no workable job for this user"); return o; }
  const btn = card.querySelector("[data-wo]");
  const wo = WORK_ORDERS.find((w) => w.wo === btn.dataset.wo);
  const job = wo.jobs[+btn.dataset.i];
  if (card.querySelector('[data-fl="claim"]')) click(`[data-fl="claim"][data-wo="${wo.wo}"][data-i="${btn.dataset.i}"]`);
  if (job.status !== "wip") click(`[data-fl="start"][data-wo="${wo.wo}"][data-i="${btn.dataset.i}"]`);
  assert(job.status === "wip", "start did not start the job");
  click(`[data-fl="askstop"][data-wo="${wo.wo}"]`);
  assert(f.querySelectorAll(".fl-chip").length === JC_STOP_REASONS.length, "stop reasons not shown as chips");
  const chip = [...f.querySelectorAll(".fl-chip")].find((c) => /เครื่องจักร/.test(c.dataset.reason));
  chip.click();
  assert(job.status === "hold" && (job.downs || []).some((d) => !d.to && /เครื่องจักร/.test(d.reason)), "stop not recorded with its reason");
  const head = AUTH.users.find((x) => x.role === "depthead" && x.dept === "prod");
  if (head) assert(jcStopNotifications(head).some((n) => n.wo === wo.wo), "production head not alerted");
  const mt = AUTH.users.find((x) => x.dept === "mt");
  if (mt) assert(jcStopInbox(mt).some((n) => /เครื่องจักร/.test(n.title)), "maintenance not alerted about a machine stop");
  click(`[data-fl="start"][data-wo="${wo.wo}"]`);
  click(`[data-fl="askdone"][data-wo="${wo.wo}"]`);
  click('[data-fl="plus"]');
  click(`[data-fl="done"][data-wo="${wo.wo}"]`);
  assert(job.status === "done" && job.qtyDone === (Number(wo.qty) || 1) + 1, "done / quantity not recorded");
  o.push(`${wo.wo} ${job.op}: start → stop → resume → done ✓`);

  // quick requisition opens with the right station's kits
  const req = f.querySelector('[data-fl="req"]');
  if (req) {
    req.click(); await sleep(50);
    const bd = document.getElementById("flReqBackdrop");
    assert(bd && bd.classList.contains("open"), "requisition dialog did not open");
    o.push("requisition rows " + bd.querySelectorAll(".fl-req-row").length);
    bd.classList.remove("open");
  }
  // away and back
  click('[data-fl="exit"]');
  assert(!H.getAttribute("data-floor"), "exit did not leave floor mode");
  // glossary
  document.getElementById("glBtn").click();
  assert(document.querySelectorAll("#glList .gl-row").length >= 30, "glossary list too short");
  return o;
}
