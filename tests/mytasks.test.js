// งานของฉัน: the Job Card panel shows up for shop-floor people and its buttons really work
// (claim → start → pause with a reason → resume → done), clicking the buttons on the page
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const u = authCurrentUser();
  switchView("mytasks");
  await sleep(80);
  const box = document.getElementById("jcOpBox");
  const cards = [...box.querySelectorAll(".jc-op")];
  const btns = box.querySelectorAll("[data-jc]").length;
  o.push(`${u.id} ${u.role}/${u.dept || "-"} · job cards ${cards.length} · buttons ${btns}`);
  const lead = ["admin", "plant"].includes(u.role) || (u.role === "depthead" && ["prod", "plan"].includes(u.dept));
  const running = WORK_ORDERS.some((w) => w.status !== "เสร็จสมบูรณ์" && (w.jobs || []).some((j) => j.status !== "done"));
  assert(!lead || !running || cards.length > 0, "line lead sees no job cards although the line has open work");
  if (!cards.length) return o;
  assert(btns > 0, "job cards shown without any button to press");
  const q = (sel) => box.querySelector(sel);
  const first = q("[data-jc]");
  const at = `[data-jcwo="${first.dataset.jcwo}"][data-i="${first.dataset.i}"]`;
  const wo = WORK_ORDERS.find((w) => w.wo === first.dataset.jcwo);
  const job = wo.jobs[+first.dataset.i];
  const press = async (act) => { const b = q(`[data-jc="${act}"]${at}`); assert(b, `no ${act} button on ${job.no}`); if (b) b.click(); await sleep(60); };
  if (q(`[data-jc="claim"]${at}`)) { await press("claim"); assert(job.assignee === u.name, "claim did not assign the job"); }
  if (job.status !== "wip") await press("start");
  assert(job.status === "wip", `start did not start ${job.no} (status ${job.status})`);
  const r = q(`.jc-reason${at}`);
  assert(r, "no stop-reason list while running");
  if (r) { r.value = JC_STOP_REASONS[0]; await press("hold"); }
  assert(job.status === "hold", "pause did not pause the job");
  await press("start");
  assert(job.status === "wip", "resume did not restart the job");
  await press("done");
  assert(job.status === "done", "done did not finish the job");
  o.push(`${job.no} ${job.op}: claim/start/pause/resume/done OK`);
  return o;
}
