// Staff and officers try the system one person, one condition at a time — through the real buttons and,
// where a rule matters, by calling the action directly (as a stale screen or a script would).
// Every decision point: who may, who may not, what is required, what the other person then sees.
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const U = (n) => AUTH.users.find((u) => u.username === n);
  const as = (n) => { AUTH_USER = U(n); return AUTH_USER; };
  const toasts = [];
  const realToast = showToast;
  showToast = (m, t) => { toasts.push(String(m)); };
  const lastToast = () => toasts[toasts.length - 1] || "";
  const btn = (id) => document.getElementById(id);
  const close = () => document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  const inbox = (n, re) => { as(n); return mtCollect().filter((x) => re.test(`${x.title} ${x.detail || ""}`)); };
  const step = (who, what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} [${who}] ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `[${who}] ${what}${detail ? ` — ${detail}` : ""}`); };
  const newMR = (who, n) => {
    as(who);
    const w = WORK_ORDERS.find((x) => x.wo === "WO-2026-084");
    const rows = flReqRows(w, w.jobs.find((j) => j.station === "QC") || w.jobs[w.jobs.length - 1]).filter((x) => x.left > 0).slice(0, n || 2);
    const pane = document.createElement("div");
    rows.forEach((x) => { const i = document.createElement("input"); i.className = "bx-qty"; i.dataset.key = x.key; i.value = 2; pane.appendChild(i); });
    bxSubmitReq({ ref: w.wo, model: w.model, qty: 1, kind: "ผลิต", line: w.department }, pane);
    close();
    return bxReqs()[bxReqs().length - 1];
  };
  const signPw = async (pw) => { btn("bxPwIn").value = pw; document.querySelector("#bxPwBackdrop form").dispatchEvent(new Event("submit", { cancelable: true })); await sleep(300); };

  /* ================= ใบเบิกวัสดุ ================= */
  o.push("— ใบเบิกวัสดุ —");
  let mr = newMR("demo-weld");
  step("ช่างเชื่อม", `ขอเบิก ${mr.no}`, mr.status === "รออนุมัติ" && mr.receiver === "u-demo-weld", `${mr.items.length} รายการ ผู้รับ = ผู้ขอ`);
  as("demo-weld"); bxReqAction(mr, "อนุมัติ", "");
  step("ช่างเชื่อม", "พยายามอนุมัติใบเบิกของตัวเอง (เรียกคำสั่งตรง)", mr.status === "รออนุมัติ", lastToast());
  as("demo-store"); bxReqAction(mr, "อนุมัติ", "");
  step("คลัง", "พยายามอนุมัติ (ไม่ใช่หน้าที่)", mr.status === "รออนุมัติ", lastToast());
  as("demo-prod"); bxOpenReq(mr.no); btn("bxReject").click();
  step("หัวหน้าผลิต", "กดปฏิเสธโดยไม่ใส่เหตุผล", mr.status === "รออนุมัติ", lastToast());
  btn("bxReqActNote").value = "ใช้รหัสผิดรุ่น"; btn("bxReject").click(); close();
  step("หัวหน้าผลิต", "ปฏิเสธพร้อมเหตุผล", mr.status === "ปฏิเสธ");
  step("ช่างเชื่อม", "เห็นแจ้งผลว่าถูกปฏิเสธ + เหตุผล", inbox("demo-weld", new RegExp(`${mr.no} ถูกปฏิเสธ.*ใช้รหัสผิดรุ่น`)).length === 1);
  step("คลัง", "ไม่เห็นใบที่ถูกปฏิเสธในงานจ่ายของ", !inbox("demo-store", new RegExp(mr.no)).length);

  mr = newMR("demo-weld");
  as("demo-prod"); bxOpenReq(mr.no); btn("bxApprove").click(); close();
  step("หัวหน้าผลิต", `อนุมัติ ${mr.no}`, mr.status === "อนุมัติ");
  as("demo-weld"); bxOpenReq(mr.no);
  step("ช่างเชื่อม", "ไม่มีปุ่มจ่ายของให้ตัวเอง", !btn("bxIssue")); close();
  as("demo-weld"); bxIssue(mr, "");
  step("ช่างเชื่อม", "พยายามจ่ายของให้ตัวเอง (เรียกคำสั่งตรง)", !mr.items.some((it) => it.issued > 0), lastToast());
  as("demo-store"); bxOpenReq(mr.no);
  const inputs = [...document.querySelectorAll("#bxReqBody .bx-issue")];
  inputs.forEach((i) => { i.value = 99; });
  btn("bxIssue").click();
  step("คลัง", "จ่ายเกินจำนวนที่ขอ", !mr.items.some((it) => it.issued > it.req), lastToast());
  inputs.forEach((i, k) => { i.value = k === 0 ? 1 : ""; });
  btn("bxIssue").click(); close();
  const partial = mr.status === "จ่ายบางส่วน" || (mr.status === "อนุมัติ" && /ได้แค่|ไม่พอ/.test(lastToast()));
  step("คลัง", "จ่ายบางส่วน (1 ชิ้นจากรายการแรก)", partial, `${mr.status}${/ได้แค่/.test(lastToast()) ? " · " + lastToast() : ""}`);
  if (mr.status === "จ่ายบางส่วน") {
    step("คลัง", "ใบที่จ่ายยังไม่ครบยังอยู่ในงานจ่ายของ", inbox("demo-store", new RegExp(`จ่ายของตามใบเบิก ${mr.no}`)).length === 1);
    step("ช่างเชื่อม", "ได้งานยืนยันรับของ (ส่วนที่จ่ายแล้ว)", inbox("demo-weld", new RegExp(`ยืนยันรับของ ${mr.no}`)).length === 1);
    as("demo-weld"); bxOpenReq(mr.no); btn("bxAck").click(); await sleep(50); await signPw("9999"); close();
    step("ช่างเชื่อม", "ยืนยันรับด้วยรหัสผ่านผิด", bxNeedsAck(mr));
    as("demo-weld"); bxOpenReq(mr.no); btn("bxAck").click(); await sleep(50); await signPw("1234"); close();
    step("ช่างเชื่อม", "ยืนยันรับด้วยรหัสผ่านตัวเอง", !bxNeedsAck(mr), `หลักฐาน #${(mr.log.find((g) => g.signed) || {}).proof}`);
    as("demo-store"); bxOpenReq(mr.no); btn("bxCloseShort").click(); close();
    step("คลัง", "ปิดใบเบิกโดยไม่จ่ายส่วนที่ค้าง", mr.status === "จ่ายของแล้ว");
    as("demo-weld"); bxOpenReq(mr.no);
    const ret = document.querySelector("#bxReqBody .bx-return:not([disabled])");
    if (ret) { ret.value = 1; btn("bxReturn").click(); }
    close();
    step("ช่างเชื่อม", "คืนของที่เหลือเข้าคลัง", mr.items.some((it) => it.ret > 0), ret ? "" : "ไม่มีปุ่มคืน");
  }

  const mtMR = newMR("demo-mt", 1);
  const who = AUTH.users.filter((u) => u.active && inbox(u.username, new RegExp(`อนุมัติใบเบิก ${mtMR.no}`)).length).map((u) => u.username);
  step("ช่างซ่อมบำรุง", `ขอเบิก ${mtMR.no} (แผนกที่ไม่มีหัวหน้า)`, who.length && !who.includes("demo-mt"), `ผู้อนุมัติ: ${who.join(", ")}`);

  /* ================= จัดซื้อ ================= */
  o.push("— จัดซื้อ —");
  as("demo-plan");
  const pr = { id: "P2P-ROLE-1", pr: "PR-ROLE-1", item: "ลูกปืน 6205", qty: 10, unit: "ชิ้น", requester: authDeptName("prod"), needBy: "", wo: "", supplier: "", po: "", value: 30000, promised: "", status: "open", events: [{ stage: "pr", at: p2pToday(), by: U("demo-plan").name }], issues: [] };
  P2P_CASES.push(pr);
  as("demo-qc"); openP2PStep(pr.id, "approve"); saveP2PStep(); close();
  step("หัวหน้า QC", "พยายามอนุมัติ PR ของฝ่ายผลิต", !p2pEvent(pr, "approve"), lastToast());
  as("demo-prod"); openP2PStep(pr.id, "approve"); btn("p2pStepResult").value = "reject"; btn("p2pStepNote").value = ""; saveP2PStep();
  step("หัวหน้าผลิต", "ไม่อนุมัติโดยไม่ใส่เหตุผล", !p2pEvent(pr, "approve"), lastToast());
  btn("p2pStepNote").value = "ของเดิมยังพอใช้ 2 เดือน"; saveP2PStep(); close();
  step("หัวหน้าผลิต", "ไม่อนุมัติพร้อมเหตุผล", pr.status === "cancelled");
  step("ผู้วางแผน (ผู้ขอ)", "เห็นแจ้งผล PR ไม่อนุมัติ + เหตุผล", inbox("demo-plan", /PR-ROLE-1 ไม่อนุมัติ.*ของเดิมยังพอใช้/).length === 1);

  const pr2 = Object.assign({}, pr, { id: "P2P-ROLE-2", pr: "PR-ROLE-2", status: "open", events: [{ stage: "pr", at: p2pToday(), by: U("demo-plan").name }], issues: [] });
  P2P_CASES.push(pr2);
  as("demo-prod"); openP2PStep(pr2.id, "approve"); btn("p2pStepResult").value = "approve"; saveP2PStep(); close();
  step("หัวหน้าผลิต", "อนุมัติ PR 30,000 ฿", p2pEvent(pr2, "approve") && p2pEvent(pr2, "approve").result === "approve");
  const next = p2pCurrent(pr2);
  step("จัดซื้อ", `ขั้นต่อไป "${next.label}" เข้ากล่องงานจัดซื้อ`, inbox("demo-pur", /PR-ROLE-2/).length === 1);
  as("demo-weld"); openP2PStep(pr2.id, next.id); saveP2PStep(); close();
  step("ช่างเชื่อม", `พยายามบันทึกขั้น "${next.label}"`, p2pCurrent(pr2).id === next.id, lastToast());

  /* ================= Job Card ================= */
  o.push("— Job Card —");
  const w = WORK_ORDERS.find((x) => (x.jobs || []).some((j) => j.status !== "done" && j.assignee === U("demo-mc").name));
  const j = w.jobs.find((x) => x.status !== "done" && x.assignee === U("demo-mc").name);
  const st0 = j.status;
  as("demo-weld"); jcAct(w, j, "start", 0, "");
  step("ช่างเชื่อม", `พยายามเริ่มงานของช่างกลึง (${j.op})`, j.status === st0, lastToast());
  as("demo-mc"); jcAct(w, j, "start", 0, ""); jcAct(w, j, "done", (Number(w.qty) || 1) + 5, "");
  step("ช่างกลึง", "บันทึกเสร็จเกินจำนวนที่สั่ง", j.status !== "done", lastToast());
  as("demo-mc"); jcAct(w, j, "reopen", 0, "");
  step("ช่างกลึง", "พยายามเปิดงานใหม่ (หน้าที่หัวหน้า)", !/Rework/.test(JSON.stringify(j.downs || []).slice(-80)) || j.status === "wip", lastToast());
  as("demo-prod"); const before = j.assignee; jcAct(w, j, "hold", 0, "พักเบรก / เปลี่ยนกะ");
  step("หัวหน้าผลิต", "หยุดงานแทนช่าง (หัวหน้าทำได้)", j.status === "hold" && j.assignee === before);

  /* ================= เอกสาร ================= */
  o.push("— เอกสาร —");
  as("demo-op");
  step("ช่างประกอบ", "สร้างใบขายได้ไหม (SO)", !deptCanCreate("operator", "so"), "ไม่ได้ ✓");
  step("ช่างประกอบ", "แจ้งของเสียได้ (NCR)", deptCanCreate("operator", "ncr"));
  const ncr = { no: "NCR-ROLE-1", title: "รอยเชื่อมร้าว", status: DOC_TYPES.ncr.statuses[0][0], createdBy: "u-demo-op", owner: U("demo-op").name, date: new Date().toISOString().slice(0, 10) };
  DEPT_DOCS.ncr.push(ncr);
  const iN = DEPT_DOCS.ncr.length - 1;
  const later = DOC_TYPES.ncr.statuses.slice(1);
  const approveStatus = (later.find((s) => /^(ปิด|อนุมัติ)/.test(s[0])) || later[later.length - 1])[0];
  as("demo-op"); openDeptModal("ncr", iN);
  step("ช่างประกอบ", "ช่องเปลี่ยนสถานะเอกสารของตัวเองถูกล็อก", btn("deptDocStatus").disabled);
  const opt = document.createElement("option"); opt.value = approveStatus; btn("deptDocStatus").appendChild(opt); btn("deptDocStatus").disabled = false; btn("deptDocStatus").value = approveStatus; saveDeptModal(); close();
  step("ช่างประกอบ", `แก้หน้าจอเพื่อเปลี่ยนเป็น "${approveStatus}" เอง`, ncr.status !== approveStatus, lastToast());
  as("demo-qc"); openDeptModal("ncr", iN); btn("deptDocStatus").value = approveStatus; saveDeptModal(); close();
  step("หัวหน้า QC", `เปลี่ยน NCR เป็น "${approveStatus}"`, ncr.status === approveStatus);
  DEPT_DOCS.ncr.splice(iN, 1);

  /* ================= ลายเซ็น ================= */
  o.push("— ลายเซ็นเอกสาร —");
  const doc = { no: "ECR-ROLE-1", title: "ทดสอบ", status: "ร่าง", createdBy: "u-demo-op", signatures: {} };
  as("demo-rnd"); step("หัวหน้า R&D", "ลงช่องผู้จัดทำแทนคนสร้าง", !!esWhyNot("ecr", doc, 0), esWhyNot("ecr", doc, 0));
  as("demo-op"); step("ช่างประกอบ", "ลงช่องผู้จัดทำของตัวเอง", !esWhyNot("ecr", doc, 0));
  step("ช่างประกอบ", "ข้ามไปลงช่องผู้อนุมัติ", !!esWhyNot("ecr", doc, 2), esWhyNot("ecr", doc, 2));
  doc.signatures[0] = { uid: "u-demo-op", name: U("demo-op").name };
  as("demo-weld"); step("ช่างเชื่อม", "ลงช่องผู้ตรวจสอบ", !!esWhyNot("ecr", doc, 1), esWhyNot("ecr", doc, 1));
  as("demo-rnd"); step("หัวหน้า R&D", "ลงช่องผู้ตรวจสอบ", !esWhyNot("ecr", doc, 1));

  /* ================= หน้าที่ใช้ได้ ================= */
  o.push("— หน้าที่เปิดได้ —");
  [["demo-weld", "pilot", false], ["demo-weld", "admin", false], ["demo-store", "p2p", true], ["demo-sales", "service", true], ["demo-op", "service", false], ["demo-qc", "service", true], ["demo-mt", "reports", false], ["demo-exec", "pilot", true]].forEach(([n, page, yes]) => {
    const has = authAllowedModules(U(n)).includes(page);
    step(n, `${yes ? "ต้องเปิด" : "ต้องไม่เห็น"}หน้า ${page}`, has === yes);
  });

  showToast = realToast;
  as("demo-admin");
  return o;
}
