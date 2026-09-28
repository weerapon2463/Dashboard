// Pilot stopwatch: typed + timed trials, averages, "ใส่ใน KPI" only after 3 + 3 trials
async function run(ctx) {
  const { assert, sleep } = ctx;
  switchView("pilot");
  const box = () => document.getElementById("pilotTimer");
  assert(box(), "stopwatch card missing");
  const sel = box().querySelector("#ptKpi");
  const k = PILOT.kpis.findIndex((x) => x.unit === "นาที");
  sel.value = String(k); sel.dispatchEvent(new Event("change"));
  const name = PILOT.kpis[k].name;
  PILOT.trials = (PILOT.trials || []).filter((t) => t.kpi !== name);
  const add = (m, v) => { box().querySelector(`[data-pm="${m}"]`).click(); box().querySelector("#ptVal").value = v; box().querySelector("#ptAddBtn").click(); };
  add("old", 30); add("old", 20);
  add("new", 5);
  assert(!box().querySelector(`[data-ptuse="${k}"]`), "KPI button offered before 3 + 3 trials");
  add("old", 25); add("new", 6);
  box().querySelector("#ptStart").click(); await sleep(1200);
  box().querySelector("#ptStop").click();
  const s = ptStats().find((x) => x.k.name === name);
  assert(s && s.n1 === 3 && s.n2 === 3 && s.a === 25, `averages wrong ${JSON.stringify(s && { n1: s.n1, n2: s.n2, a: s.a })}`);
  box().querySelector(`[data-ptuse="${k}"]`).click();
  assert(PILOT.kpis[k].before === 25 && /วัดจริง/.test(PILOT.kpis[k].method), "KPI not filled from the trials");
  assert(JSON.parse(localStorage.getItem("y2j-pilot-v1")).trials.length === PILOT.trials.length, "trials not saved");
  return [`${name}: ${s.a} → ${Math.round(s.b * 100) / 100} ${PILOT.kpis[k].unit} (${Math.round(s.imp)}%)`];
}
