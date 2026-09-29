// ลำดับขั้น: position levels + multi-step approval (approval.js) — requisition in 2 steps, PR steps by amount,
// one person one step, rejection restarts, the Admin screen itself.
async function run(ctx) {
  const { assert } = ctx;
  const o = [];
  const U = (n) => AUTH.users.find((u) => u.username === n);
  const as = (n) => { AUTH_USER = U(n); return AUTH_USER; };
  const FS = "y2j-form-settings-v1";
  const fsBefore = localStorage.getItem(FS);
  const fs = JSON.parse(fsBefore || "{}"); delete fs.selfApprove; fs.approvalMode = "dept";
  const setSteps = (steps) => { fs.apvSteps = steps; localStorage.setItem(FS, JSON.stringify(fs)); };
  const toasts = [];
  const realToast = showToast;
  showToast = (m) => { toasts.push(String(m)); };
  const lastToast = () => toasts[toasts.length - 1] || "";
  const close = () => document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  const inbox = (n, re) => { as(n); return mtCollect().filter((x) => re.test(`${x.title} ${x.detail || ""}`)); };
  const step = (who, what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} [${who}] ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `[${who}] ${what}${detail ? ` — ${detail}` : ""}`); };
  const levelsBefore = AUTH.users.map((u) => [u.id, u.level]);
  const newMR = (who) => {
    as(who);
    const w = WORK_ORDERS.find((x) => x.wo === "WO-2026-084");
    const rows = flReqRows(w, w.jobs.find((j) => j.station === "QC") || w.jobs[w.jobs.length - 1]).filter((x) => x.left > 0).slice(0, 1);
    const pane = document.createElement("div");
    rows.forEach((x) => { const i = document.createElement("input"); i.className = "bx-qty"; i.dataset.key = x.key; i.value = 1; pane.appendChild(i); });
    bxSubmitReq({ ref: w.wo, model: w.model, qty: 1, kind: "ผลิต", line: w.department }, pane);
    close();
    return bxReqs()[bxReqs().length - 1];
  };

  o.push("— ระดับตำแหน่ง —");
  step("ระบบ", "ระดับเริ่มต้น 6 ขั้น, ระดับตามบทบาท", apvLevels().length === 6 && apvLevelOf(U("demo-weld")) === 1 && apvLevelOf(U("demo-prod")) === 3 && apvLevelOf(U("demo-exec")) >= 5,
    `ช่างเชื่อม ${apvLevelName(apvLevelOf(U("demo-weld")))} · หัวหน้าผลิต ${apvLevelName(apvLevelOf(U("demo-prod")))} · ${U("demo-exec").name.split(" ")[0]} ${apvLevelName(apvLevelOf(U("demo-exec")))}`);

  o.push("— ใบเบิก 2 ขั้น: หัวหน้าแผนก (แผนกเดียวกัน) → ผู้จัดการโรงงาน —");
  setSteps({ mreq: [{ level: 3, scope: "dept" }, { level: 5, scope: "any" }] });
  const mr = newMR("demo-weld");
  step("ช่างเชื่อม", `ขอเบิก ${mr.no}`, mr.status === "รออนุมัติ", apvWaitingFor("mreq", mr.createdBy, null, mr));
  step("ระบบ", "ขั้น 1 ส่งถึงหัวหน้าผลิต ไม่ใช่ผู้จัดการ", inbox("demo-prod", new RegExp(mr.no)).length === 1 && !inbox("demo-exec", new RegExp(mr.no)).length);
  as("demo-exec"); bxReqAction(mr, "อนุมัติ", "");
  step("ผู้จัดการ", "ข้ามขั้น 1 ไม่ได้? (ผู้จัดการอนุมัติแทนได้เมื่อระดับถึง)", (mr.apv || []).length === 1 && mr.status === "รออนุมัติ", lastToast());
  mr.apv = []; // back to step 1 for the normal path
  as("demo-prod"); bxReqAction(mr, "อนุมัติ", "ตรวจแล้ว");
  step("หัวหน้าผลิต", "อนุมัติขั้น 1 — ใบยังรออนุมัติขั้น 2", mr.status === "รออนุมัติ" && mr.apv.length === 1 && /ขั้น 1\/2/.test(lastToast()), lastToast());
  step("หัวหน้าผลิต", "อนุมัติซ้ำขั้น 2 เองไม่ได้ (คนเดียวหนึ่งขั้น)", !bxMayDecide(mr));
  step("ระบบ", "ขั้น 2 ย้ายไปกล่องงานผู้จัดการโรงงาน", inbox("demo-exec", new RegExp(mr.no)).length === 1 && !inbox("demo-prod", new RegExp(mr.no)).length);
  as("demo-exec"); bxReqAction(mr, "อนุมัติ", "");
  step("ผู้จัดการ", "อนุมัติขั้นสุดท้าย → ใบเบิกอนุมัติ", mr.status === "อนุมัติ" && mr.apv.length === 2, (mr.log || []).slice(-1)[0].note);

  const mr2 = newMR("demo-weld");
  as("demo-prod"); bxReqAction(mr2, "อนุมัติ", "");
  as("demo-exec"); bxReqAction(mr2, "ปฏิเสธ", "ของยังมีในไลน์");
  step("ผู้จัดการ", "ปฏิเสธที่ขั้น 2 → เริ่มนับขั้นใหม่", mr2.status === "ปฏิเสธ" && !(mr2.apv || []).length);

  o.push("— ตั้งระดับรายคน: หัวหน้างานอนุมัติขั้น 1 ได้ —");
  setSteps({ mreq: [{ level: 2, scope: "any" }] });
  const mr3 = newMR("demo-weld");
  as("demo-mc");
  step("ช่างกลึง", "ระดับพนักงาน อนุมัติไม่ได้", !bxMayDecide(mr3));
  U("demo-mc").level = 2;
  step("ช่างกลึง", "ตั้งเป็นหัวหน้างาน → อนุมัติขั้นนี้ได้", bxMayDecide(mr3));
  bxReqAction(mr3, "อนุมัติ", "");
  step("ช่างกลึง", "อนุมัติ 1 ขั้น = อนุมัติแล้ว", mr3.status === "อนุมัติ");
  delete U("demo-mc").level;

  o.push("— ใบขอซื้อตามวงเงิน —");
  setSteps({ pr: [{ level: 3, scope: "any" }, { level: 5, scope: "any", over: 50000 }] });
  const mk = (id, value) => { const c = { id, pr: id, item: "ลูกปืน", qty: 4, unit: "ตัว", requester: authDeptName("prod"), value, status: "open", events: [{ stage: "pr", at: p2pToday(), by: U("demo-plan").name }], issues: [] }; P2P_CASES.push(c); return c; };
  const small = mk("PR-LV-1", 8000), big = mk("PR-LV-2", 80000);
  step("ระบบ", "PR 8,000 บาท = 1 ขั้น · PR 80,000 บาท = 2 ขั้น", apvSteps("pr", small).length === 1 && apvSteps("pr", big).length === 2);
  as("demo-plan"); step("ผู้เปิด PR", "อนุมัติของตัวเองไม่ได้", !p2pCanRecord(p2pStage("approve"), big));
  as("demo-prod");
  openP2PStep(big.id, "approve"); document.getElementById("p2pStepResult").value = "approve"; saveP2PStep(); close();
  step("หัวหน้าผลิต", "อนุมัติขั้น 1 ของ PR 80,000 — ยังไม่ผ่านขั้นอนุมัติ", !p2pEvent(big, "approve") && big.apv.length === 1, lastToast());
  step("ระบบ", "PR ส่งต่อถึงผู้จัดการ", inbox("demo-exec", /PR-LV-2/).length === 1);
  as("demo-exec");
  openP2PStep(big.id, "approve"); document.getElementById("p2pStepResult").value = "approve"; saveP2PStep(); close();
  step("ผู้จัดการ", "อนุมัติขั้น 2 → PR อนุมัติ ไปขั้นขอราคา", !!p2pEvent(big, "approve") && p2pCurrent(big).id !== "approve");
  as("demo-prod");
  openP2PStep(small.id, "approve"); document.getElementById("p2pStepResult").value = "approve"; saveP2PStep(); close();
  step("หัวหน้าผลิต", "PR 8,000 อนุมัติจบในขั้นเดียว", !!p2pEvent(small, "approve"));
  openP2PCase(big.id);
  step("ระบบ", "ใบติดตามจัดซื้อแสดงลำดับขั้นอนุมัติ", /ลำดับขั้นอนุมัติ/.test(document.body.innerHTML));
  close();
  P2P_CASES.splice(P2P_CASES.indexOf(small), 1); P2P_CASES.splice(P2P_CASES.indexOf(big), 1);

  o.push("— หน้าตั้งค่า Admin › ลำดับขั้น —");
  setSteps({});
  as("demo-admin");
  adminTab = "levels"; renderAdmin();
  const panel = document.getElementById("levelsPanel");
  step("ผู้ดูแลระบบ", "หน้าลำดับขั้นแสดงระดับ + รายชื่อ + ชนิดเอกสาร", panel.querySelectorAll(".apv-lvname").length === 6 && panel.querySelectorAll(".apv-ulevel").length > 5 && panel.querySelectorAll(".apv-kind").length >= 3);
  panel.querySelector('.apv-kind[data-kind="mreq"] [data-add]').click();
  panel.querySelector('.apv-kind[data-kind="mreq"] [data-add]').click();
  step("ผู้ดูแลระบบ", "กด + เพิ่มขั้น 2 ครั้ง → ใบเบิก 2 ขั้น (หัวหน้าแผนก → สูงขึ้น)", (apvStepsAll().mreq || []).length === 2 && apvStepsAll().mreq[1].level > apvStepsAll().mreq[0].level, JSON.stringify(apvStepsAll().mreq));
  step("ผู้ดูแลระบบ", "มีตัวอย่างผู้อนุมัติแต่ละขั้น", /ขั้น 1:/.test(panel.textContent) && /ขั้น 2:/.test(panel.textContent));
  const sel = panel.querySelector('.apv-ulevel[data-uid="u-demo-mc"]');
  sel.value = "2"; sel.dispatchEvent(new Event("change"));
  step("ผู้ดูแลระบบ", "ตั้งระดับช่างกลึง = หัวหน้างาน", U("demo-mc").level === 2);
  const lv = document.querySelector("#levelsPanel .apv-lvname");
  lv.value = "พนักงานปฏิบัติการ"; lv.dispatchEvent(new Event("change"));
  step("ผู้ดูแลระบบ", "เปลี่ยนชื่อระดับ 1", apvLevelName(1) === "พนักงานปฏิบัติการ");

  // restore
  levelsBefore.forEach(([id, l]) => { const u = AUTH.users.find((x) => x.id === id); if (l === undefined) delete u.level; else u.level = l; });
  if (fsBefore === null) localStorage.removeItem(FS); else localStorage.setItem(FS, fsBefore);
  showToast = realToast;
  as("demo-admin");
  return o;
}
