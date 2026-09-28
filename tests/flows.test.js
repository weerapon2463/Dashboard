// Every hand-off, one person at a time, on simulated data: who gets the next step in their inbox,
// who may act on it (the real buttons), who must not — plus a who-sees-what matrix of documents.
// Runs signed in as the demo admin and switches the signed-in person in place (nothing is synced).
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const U = (username) => AUTH.users.find((u) => u.username === username);
  const as = (username) => { AUTH_USER = U(username); return AUTH_USER; };
  const inbox = (username, re) => { as(username); return mtCollect().filter((x) => re.test(x.title + " " + (x.detail || ""))); };
  const people = AUTH.users.filter((u) => u.active && /^u-demo-/.test(u.id));
  const closeModals = () => document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  const btn = (id) => document.getElementById(id);

  /* ---- 1. requisition: operator asks → head approves → store issues → operator confirms ---- */
  as("demo-weld");
  const w = WORK_ORDERS.find((x) => x.wo === "WO-2026-084");
  const job = w.jobs.find((j) => j.station === "QC") || w.jobs[w.jobs.length - 1];
  const rows = flReqRows(w, job).filter((x) => x.left > 0).slice(0, 2);
  assert(rows.length, "no kit left to request for the flow test");
  const pane = document.createElement("div");
  rows.forEach((x) => { const i = document.createElement("input"); i.className = "bx-qty"; i.dataset.key = x.key; i.value = 1; pane.appendChild(i); });
  bxSubmitReq({ ref: w.wo, model: w.model, qty: 1, kind: "ผลิต", line: w.department }, pane);
  closeModals();
  const mr = bxReqs()[bxReqs().length - 1];
  assert(mr.status === "รออนุมัติ" && mr.createdBy === "u-demo-weld", "requisition not created by the operator");
  o.push(`MR ${mr.no} by ${U("demo-weld").name}`);
  const approvers = people.filter((p) => inbox(p.username, new RegExp(`อนุมัติใบเบิก ${mr.no}`)).length).map((p) => p.username);
  o.push(`  → approve inbox: ${approvers.join(", ")}`);
  assert(approvers.includes("demo-prod"), "production head does not get the requisition to approve");
  assert(!approvers.includes("demo-weld"), "the requester is asked to approve their own requisition");
  assert(!approvers.some((a) => /qc|pur|sales|rnd|mt/.test(a)), "a head of another department is asked to approve");
  const seers = people.filter((p) => { as(p.username); return bxReqVisible(mr); }).map((p) => p.username);
  o.push(`  → can see it: ${seers.join(", ")}`);
  assert(!seers.some((s) => /demo-(sales|svc|rnd|qc|pur)$/.test(s)), "people outside production/store/planning can read the requisition");
  as("demo-weld"); bxOpenReq(mr.no);
  assert(!btn("bxApprove"), "requester sees an approve button on their own requisition");
  closeModals();
  as("demo-prod"); bxOpenReq(mr.no);
  assert(btn("bxApprove"), "production head has no approve button"); btn("bxApprove").click(); closeModals();
  assert(mr.status === "อนุมัติ", "approval not recorded");
  const issuers = people.filter((p) => inbox(p.username, new RegExp(`จ่ายของตามใบเบิก ${mr.no}`)).length).map((p) => p.username);
  o.push(`  → issue inbox: ${issuers.join(", ")}`);
  assert(issuers.includes("demo-store"), "store does not get the approved requisition");
  as("demo-weld"); bxOpenReq(mr.no); assert(!btn("bxIssue"), "requester can issue their own requisition"); closeModals();
  as("demo-store"); bxOpenReq(mr.no);
  assert(btn("bxIssue"), "store has no issue button");
  document.querySelectorAll("#bxReqBody .bx-issue").forEach((i) => { if (!i.disabled) i.value = i.value || 1; });
  btn("bxIssue").click(); closeModals();
  o.push(`  → after store: ${mr.status}`);
  if (/จ่าย/.test(mr.status)) {
    const ackers = people.filter((p) => inbox(p.username, new RegExp(`ยืนยันรับของ ${mr.no}`)).length).map((p) => p.username);
    o.push(`  → confirm-receipt inbox: ${ackers.join(", ")}`);
    assert(ackers.length === 1 && ackers[0] === "demo-weld", "confirm-receipt does not go to the receiver only");
    as("demo-weld"); bxOpenReq(mr.no); assert(btn("bxAck"), "receiver has no confirm button");
    btn("bxAck").click(); await sleep(50);
    btn("bxPwIn").value = "0000"; document.querySelector("#bxPwBackdrop form").dispatchEvent(new Event("submit", { cancelable: true })); await sleep(300);
    assert(bxNeedsAck(mr), "receipt confirmed with a wrong password");
    btn("bxAck").click(); await sleep(50);
    btn("bxPwIn").value = "1234"; document.querySelector("#bxPwBackdrop form").dispatchEvent(new Event("submit", { cancelable: true })); await sleep(300);
    closeModals();
    const signed = (mr.log || []).find((g) => g.kind === "ผู้รับยืนยันรับของ");
    const issuedEv = (mr.log || []).find((g) => g.kind === "คลังจ่ายของ");
    assert(signed && signed.signed && signed.proof && signed.uid === "u-demo-weld", "receipt has no signed evidence");
    assert(issuedEv && issuedEv.proof && issuedEv.uid === "u-demo-store", "issue has no evidence of who issued");
    o.push(`  → evidence: issued by ${issuedEv.by} #${issuedEv.proof} · received ✍ ${signed.by} #${signed.proof}`);
    openDocView("mreq", bxReqIndex(mr.no));
    assert(/ประวัติการอนุมัติ \/ จ่าย \/ รับของ/.test(document.getElementById("docPaper").textContent), "printed requisition has no hand-over record");
    closeModals();
    assert(!people.some((p) => inbox(p.username, new RegExp(`ยืนยันรับของ ${mr.no}`)).length), "confirm-receipt still pending after confirming");
  } else o.push("  (stock short in demo — issue step checked up to the store)");

  /* ---- 2. purchase request approval: amount and department decide who approves ---- */
  as("demo-plan");
  const mk = (value, requester) => {
    const c = { id: "P2P-TEST-" + value, pr: "PR-TEST-" + value, item: "ทดสอบ", qty: 1, unit: "ชิ้น", requester, needBy: "", wo: "", supplier: "", po: "", value, promised: "", status: "open",
      events: [{ stage: "pr", at: p2pToday(), by: U("demo-plan").name }], issues: [] };
    P2P_CASES.push(c); return c;
  };
  const small = mk(50000, authDeptName("prod"));
  const big = mk(250000, authDeptName("prod"));
  const own = mk(20000, authDeptName("plan"));
  const route = (c) => people.filter((p) => inbox(p.username, new RegExp(c.pr)).length && mtCollect().some((x) => x.group === "จัดซื้อ" && x.title.includes(c.pr))).map((p) => p.username);
  const may = (c) => people.filter((p) => { as(p.username); return p2pCanRecord(p2pStage("approve"), c); }).map((p) => p.username);
  o.push(`PR 50,000 from production → inbox ${route(small).join(",")} · may approve ${may(small).join(",")}`);
  o.push(`PR 250,000 from production → inbox ${route(big).join(",")} · may approve ${may(big).join(",")}`);
  o.push(`PR 20,000 opened by the planning head → may approve ${may(own).join(",")}`);
  // default approval mode "by right": any head may approve up to the limit, but the inbox goes to the requesting department's head
  assert(route(small).includes("demo-prod") && !route(small).includes("demo-qc"), "small PR not routed to the requesting department's head only");
  assert(may(small).includes("demo-prod") && !may(small).some((x) => /weld|store|pur|sales/.test(x)), "people without the right may approve");
  assert(route(big).includes("demo-exec") && !may(big).includes("demo-prod"), "large PR not routed to the manager");
  assert(!may(own).includes("demo-plan"), "the person who opened a PR may approve it");
  P2P_CASES.splice(P2P_CASES.indexOf(small), 3);

  /* ---- 3. documents waiting for approval: who gets each kind ---- */
  // (requisitions have their own flow above)
  const kinds = Object.keys(DOC_TYPES).filter((t) => t !== "mreq" && !DOC_TYPES[t].special && (DOC_TYPES[t].statuses || []).some((s) => /^รอ/.test(s[0])));
  kinds.forEach((t) => {
    const st = DOC_TYPES[t].statuses.find((s) => /^รอ/.test(s[0]))[0];
    const creator = people.find((p) => { as(p.username); return p.role === "operator" && authCan(t, "create"); }) || U("demo-admin");
    const d = { no: `TEST-${t}`, title: "ทดสอบเส้นทางอนุมัติ", status: st, date: new Date().toISOString().slice(0, 10), createdBy: creator.id, owner: creator.name };
    (DEPT_DOCS[t] = DEPT_DOCS[t] || []).push(d);
    const to = people.filter((p) => p.id !== creator.id && inbox(p.username, new RegExp(`TEST-${t}`)).length).map((p) => p.username);
    const heads = to.filter((x) => !/admin|exec|ceo/.test(x));
    o.push(`${t} "${st}" by ${creator.username} → ${heads.join(",") || "(managers only)"}`);
    assert(heads.length, `${t}: "${st}" reaches managers only — nobody in the department that must act`);
    to.forEach((x) => { as(x); const it = mtCollect().find((i) => i.title.includes(`TEST-${t}`)); assert(authCan(t, "manage") || (it && it.group === "ส่งต่อถึงแผนก"), `${t}: ${x} is asked to approve without the right to`); });
    DEPT_DOCS[t].pop();
  });

  /* ---- 4. who sees what: documents readable per person (should follow their job) ---- */
  const types = Object.keys(DOC_TYPES).filter((t) => !DOC_TYPES[t].special && (DEPT_DOCS[t] || []).length);
  people.forEach((p) => {
    as(p.username);
    const seen = types.filter((t) => DEPT_DOCS[t].some((d) => authCanSeeDoc(t, d)));
    const pages = authAllowedModules(p);
    o.push(`${p.username.padEnd(11)} ${p.role}/${p.dept || "-"} · pages ${pages.length} · doc types ${seen.length}/${types.length}: ${seen.join(" ")}`);
    if (p.role === "operator") {
      ["so", "rfq", "sev"].forEach((t) => assert(!(DEPT_DOCS[t] || []).some((d) => authCanSeeDoc(t, d) && d.createdBy !== p.id), `${p.username} (operator) reads ${t} documents`));
      if (p.dept !== "sales") assert(!(DEPT_DOCS.svc || []).some((d) => authCanSeeDoc("svc", d) && !authDocInvolves(d, p)), `${p.username} reads customers' service orders`);
      if (!authUserGroups(p).some((g) => (g.modules || []).includes("service")) && p.dept !== "sales") assert(!pages.includes("service"), `${p.username} (operator) has the customer-service page`);
    }
    if (p.role === "depthead" && p.dept !== "sales" && p.dept !== "pur") ["rfq", "sev"].forEach((t) => assert(!(DEPT_DOCS[t] || []).some((d) => authCanSeeDoc(t, d)), `${p.username} (head of ${p.dept}) reads supplier prices (${t})`));
  });
  as("demo-store"); assert(bxReqs().filter(bxReqVisible).length === bxReqs().length, "store cannot see every requisition it must issue");
  as("demo-admin");
  return o;
}
