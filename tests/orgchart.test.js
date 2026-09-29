// ผังองค์กร: import the Y2J chart (checked names), totals like the paper chart, supervisors/levels applied,
// approval by chain of command follows the chart. Runs on a local copy only (nothing is synced).
async function run(ctx) {
  const { assert } = ctx;
  const o = [];
  const step = (what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `${what}${detail ? ` — ${detail}` : ""}`); };
  const realToast = showToast; showToast = () => {};
  AUTH_USER = AUTH.users.find((u) => u.username === "demo-admin");
  const usersBefore = AUTH.users.length;
  adminTab = "orgchart"; renderAdmin();
  step("หน้าผังองค์กรเปิดได้ (ยังว่าง)", /ยังไม่มีผังองค์กร/.test(document.getElementById("orgChartPanel").textContent));
  document.getElementById("ogTemplate").click();
  const rows = document.querySelectorAll("#ogImpBody [data-names]");
  step("หน้าตรวจชื่อก่อนนำเข้า แสดงทุกตำแหน่ง", rows.length === OG_Y2J_TEMPLATE.length, `${rows.length} ตำแหน่ง`);
  document.getElementById("ogImpGo").click();
  const pos = ogPos();
  step("นำเข้าผังแล้ว", pos.length === OG_Y2J_TEMPLATE.length);
  const md = pos.find((p) => p.title === "กรรมการผู้จัดการใหญ่");
  const gm = pos.find((p) => p.title === "ผู้จัดการทั่วไป");
  const t1 = ogTotals(md), t2 = ogTotals(gm);
  step("ยอดรวมตรงผังกระดาษ: กรรมการผู้จัดการใหญ่ 29/26", t1.planned === 29 && t1.actual === 26, `${t1.planned}/${t1.actual}`);
  step("ผู้จัดการทั่วไป 28/25", t2.planned === 28 && t2.actual === 25, `${t2.planned}/${t2.actual}`);
  const pm = pos.find((p) => p.title === "ผู้จัดการฝ่ายผลิต"), sm = pos.find((p) => p.title === "ผู้จัดการฝ่ายขายและสำนักงาน");
  step("ฝ่ายผลิต 15/15 · ฝ่ายขายและสำนักงาน 7/5", ogTotals(pm).planned === 15 && ogTotals(pm).actual === 15 && ogTotals(sm).planned === 7 && ogTotals(sm).actual === 5);
  step("สร้างบัญชีให้คนที่ยังไม่มี (ไม่รวมที่ปรึกษา)", AUTH.users.length - usersBefore === 26, `${AUTH.users.length - usersBefore} บัญชีใหม่`);
  const U = (n) => ogUserByName(n);
  const tech = U("นายเอกลักษณ์ อินจัน"), unit = U("นายวรวิทย์ น้ำเพชร"), grp = U("นายชาติชาย น้ำเพชร"), rndEng = U("นายวีระพล จุ้ยม่วง"), rndHead = U("นายกิตติภูมิ ภูริเวชวิวัฒน์");
  step("ช่าง → หัวหน้าหน่วย → หัวหน้ากลุ่มงาน (สายบังคับบัญชา)", tech.reportsTo === unit.id && unit.reportsTo === grp.id);
  step("วิศวกร R&D → หัวหน้าแผนก R&D · ระดับ/แผนก/ตำแหน่งตามผัง", rndEng.reportsTo === rndHead.id && rndEng.dept === "rnd" && rndEng.position === "วิศวกร R&D" && rndHead.level === 3);
  const adv = pos.find((p) => p.title === "ที่ปรึกษา R&D");
  step("ที่ปรึกษาไม่นับอัตรากำลังและไม่มีบัญชี", adv.advisory && !adv.people[0].uid);
  // approval by chain of command follows the chart
  const fs = JSON.parse(localStorage.getItem("y2j-form-settings-v1") || "{}"); fs.approvalMode = "chain"; localStorage.setItem("y2j-form-settings-v1", JSON.stringify(fs));
  step("อนุมัติตามสายบังคับบัญชา: หัวหน้าหน่วยอนุมัติงานของช่างได้ · หัวหน้าหน่วยอื่นไม่ได้", apvAllows(unit, tech.id, true, "mreq") && !apvAllows(U("นายอุทธา ปัญญาแก้ว"), tech.id, true, "mreq"));
  renderAdminOrgChart();
  step("ผังแสดงชื่อ ยอด และตำแหน่งว่าง", /ว่าง/.test(document.getElementById("orgChartPanel").textContent) && document.querySelectorAll("#orgChartPanel .og-card").length === pos.length);
  showToast = realToast;
  return o;
}
