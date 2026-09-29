// ภาพรวม builds itself from each person's rights: no preset to pick, nothing they cannot open.
async function run(ctx) {
  const { assert } = ctx;
  const o = [];
  const step = (what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `${what}${detail ? ` — ${detail}` : ""}`); };
  const board = (username) => {
    AUTH_USER = AUTH.users.find((u) => u.username === username);
    try { localStorage.removeItem(OV_STORAGE_PREFIX + AUTH_USER.id); } catch (e) { /* ignore */ }
    ovLayout = ovLoad();
    switchView("overview"); renderOverview();
    return [...document.querySelectorAll("#ovGrid [data-wid]")].map((x) => x.dataset.wid);
  };
  const ok = (u, ids) => ids.every((id) => ovAllowed(id)) && ids.every((id) => !OV_NEED[id] || Array.isArray(OV_NEED[id]) ? (OV_NEED[id] || []).length === 0 || OV_NEED[id].some((v) => authAllowedModules(u).includes(v)) : true);

  const ex = board("demo-exec");
  step("ผู้จัดการโรงงาน: เห็นภาพรวมเต็ม รวมต้นทุน", ex.includes("execCost") && ex.includes("p2pPipeline") && ex.includes("woProgress"), ex.join(", "));
  step("ไม่มีตัวเลือกมุมมอง (แสดงตามสิทธิ์)", /แสดงตามสิทธิ์ของคุณ/.test(document.getElementById("view-overview").textContent) && !document.querySelector("#ovPreset:not([hidden])"));

  const op = board("demo-op");
  const u = AUTH_USER;
  step("พนักงานผลิต: ไม่เห็นต้นทุน / จัดซื้อ / รายงาน", !op.includes("execCost") && !op.includes("p2pPipeline") && !op.includes("activity") && !op.includes("health"), op.join(", "));
  step("พนักงานผลิต: ทุกส่วนที่เห็นเปิดหน้าได้จริง", ok(u, op));

  const st = board("demo-store");
  step("คลัง: เห็นคงคลัง/ใบเบิก", st.includes("stockHealth") && st.includes("reqAging") && !st.includes("execCost"), st.join(", "));

  const rnd = board("demo-rnd");
  step("R&D: เห็นโครงการ R&D", rnd.includes("rndProjects") && !rnd.includes("execCost"), rnd.join(", "));

  // a saved layout from before (preset) is replaced by the automatic board
  AUTH_USER = AUTH.users.find((x) => x.username === "demo-op");
  localStorage.setItem(OV_STORAGE_PREFIX + AUTH_USER.id, JSON.stringify({ preset: "exec", v2: true, v3: true, items: [{ id: "execCost", size: "full" }, { id: "p2pPipeline", size: "half" }] }));
  ovLayout = ovLoad(); renderOverview();
  const again = [...document.querySelectorAll("#ovGrid [data-wid]")].map((x) => x.dataset.wid);
  step("มุมมองเก่าที่บันทึกไว้ (ผู้บริหาร) ถูกแทนด้วยแบบตามสิทธิ์", !again.includes("execCost") && !again.includes("p2pPipeline"), again.join(", "));

  AUTH_USER = AUTH.users.find((x) => x.username === "demo-admin");
  return o;
}
