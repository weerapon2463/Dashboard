// TV boards follow the person: default board by job, management board only with the right,
// the team board shows only the viewer's department, by name and position.
async function run(ctx) {
  const { assert } = ctx;
  const o = [];
  const as = (username) => { AUTH_USER = AUTH.users.find((u) => u.username === username); return AUTH_USER; };
  const expect = { "demo-weld": "floor", "demo-prod": "floor", "demo-plan": "floor", "demo-store": "team", "demo-pur": "team", "demo-qc": "team", "demo-mt": "team", "demo-sales": "team", "demo-rnd": "team", "demo-exec": "exec", "demo-ceo": "exec" };
  Object.keys(expect).forEach((name) => {
    const u = as(name);
    tvEnter("exec");
    const got = tvMode;
    const text = document.getElementById("tvRoot").textContent;
    o.push(`${name.padEnd(11)} default ${tvDefaultMode()} · asked for exec → ${got}`);
    assert(tvDefaultMode() === expect[name], `${name}: default board ${tvDefaultMode()} (expected ${expect[name]})`);
    if (!tvCanExec()) assert(got !== "exec" && !/มูลค่าคงคลัง|ต้นทุนใบสั่งผลิต/.test(text), `${name} opened the management board`);
    assert(text.includes(u.name), `${name}: board does not say who opened it`);
    if (u.dept) {
      tvEnter("team");
      const team = document.getElementById("tvRoot").textContent;
      assert(!AUTH.users.some((x) => x.active && x.dept && x.dept !== u.dept && x.role !== "admin" && team.includes(x.name)), `${name}: team board shows people of another department`);
      o.push(`            team: ${tvTeamItems().map((r) => `${r.u.name.split(" ")[0]} ${r.items.length}`).join(", ")}`);
    }
    tvEnter("mine");
    const mine = document.getElementById("tvRoot").textContent;
    AUTH_USER = u; const n = mtCollect().length;
    const flat = mine.replace(/\s+/g, "");
    assert(tvMode === "mine" && flat.includes(`จอของ${u.name.replace(/\s+/g, "")}`) && flat.includes(`งานรอฉัน${n}`), `${name}: personal board wrong (mode ${tvMode}; ${flat.slice(0, 160)})`);
    tvLeave();
  });
  as("demo-admin");
  return o;
}
