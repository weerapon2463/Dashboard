/* ==========================================================================
   งานของฉัน — one inbox per signed-in person (ERPNext ToDo / assignments).
   Collects everything waiting on this person across modules, most urgent
   first, and every row opens the exact screen to act on it:
     job cards · requisitions to approve / issue / receive · purchasing steps
     they hold · documents waiting for their review or still open under their
     name · assigned plans · service jobs · late work orders.
   ========================================================================== */

let mtFilter = "all";

function mtEsc(v) { return escapeHtml(v === undefined || v === null ? "" : String(v)); }
function mtMe() { return typeof authCurrentUser === "function" ? authCurrentUser() : null; }
function mtDays(fromIso) {
  if (!fromIso) return 0;
  const d = Math.floor((Date.now() - Date.parse(String(fromIso).length === 10 ? fromIso + "T00:00:00" : fromIso)) / 86400000);
  return isNaN(d) ? 0 : Math.max(0, d);
}

function mtCollect() {
  const u = mtMe();
  if (!u) return [];
  const out = [];
  const add = (o) => out.push(Object.assign({ tone: "neutral", score: 0 }, o));
  const selfOk = typeof esPolicy === "function" && esPolicy().selfApprove;

  /* requisitions */
  if (typeof bxReqs === "function") bxReqs().filter((d) => typeof bxReqVisible !== "function" || bxReqVisible(d)).forEach((d) => {
    const age = mtDays(d.date);
    const mineReq = d.createdBy === u.id || d.receiver === u.id;
    if (d.status === "รออนุมัติ" && bxCanApprove() && (d.createdBy !== u.id || selfOk || u.role === "admin"))
      add({ group: "อนุมัติ", icon: "✍", title: `อนุมัติใบเบิก ${d.no}`, detail: `${d.wo} · ${d.items.length} รายการ · ขอโดย ${d.owner || "-"}`, tone: age >= 1 ? "warning" : "neutral", score: 70 + age, age, act: () => { switchView("bomx"); bxOpenReq(d.no); } });
    const storeMan = u.dept === "wh" || (BX_SETTINGS.issuers || []).includes(u.id) || (typeof authHasAbility === "function" && authHasAbility("issue"));
    if ((d.status === "อนุมัติ" || d.status === "จ่ายบางส่วน") && storeMan && bxCanIssue() && !(d.receiver === u.id && !selfOk && u.role !== "admin")) {
      const short = /ไม่พอ/.test(bxReqHolder(d));
      add({ group: "จ่ายของ", icon: "📦", title: `จ่ายของตามใบเบิก ${d.no}`, detail: `${d.wo} · ผู้รับ ${d.owner || "-"}${short ? " · ของไม่พอบางรายการ" : ""}`, tone: short ? "critical" : age >= 1 ? "warning" : "neutral", score: 65 + age * 3, age, act: () => { switchView("bomx"); bxOpenReq(d.no); } });
    }
    if (d.receiver === u.id && typeof bxNeedsAck === "function" && bxNeedsAck(d))
      add({ group: "รับของ", icon: "✔", title: `ยืนยันรับของ ${d.no}`, detail: `คลังจ่ายแล้ว — ตรวจของแล้วกดยืนยัน (${d.wo})`, tone: "warning", score: 75, age, act: () => { switchView("bomx"); bxOpenReq(d.no); } });
    else if (mineReq && ["รออนุมัติ", "อนุมัติ", "จ่ายบางส่วน"].includes(d.status))
      add({ group: "ติดตาม", icon: "⏳", title: `ใบเบิกของฉัน ${d.no} — ${d.status}`, detail: `อยู่ที่: ${bxReqHolder(d)} · รอมา ${age} วัน`, tone: age >= 2 ? "warning" : "neutral", score: 20 + age, age, act: () => { switchView("bomx"); bxOpenReq(d.no); } });
  });

  /* purchasing steps this person can record */
  if (typeof P2P_CASES !== "undefined" && typeof p2pCurrent === "function") P2P_CASES.forEach((c) => {
    const st = p2pCurrent(c);
    if (!st || st.id === "ship" || st.id === "pr") return;
    const may = st.who === "approver" ? (st.id === "approve" && (u.role === "plant" ? (c.value || 0) > 100000 : u.role === "depthead" && (c.value || 0) <= 100000))
      : st.who !== "any" && u.dept === st.who;
    if (!may) return;
    const state = p2pState(c);
    add({ group: "จัดซื้อ", icon: "🛒", title: `${st.label} — ${c.pr}`, detail: `${c.item} × ${c.qty} ${c.unit}${c.wo ? ` · ${c.wo}` : ""}`, tone: state === "late" ? "critical" : state === "risk" ? "warning" : "neutral", score: state === "late" ? 80 : state === "risk" ? 55 : 35, age: p2pWaitDays(c), act: () => { switchView("p2p"); openP2PCase(c.id); } });
  });

  /* documents: waiting for my review, or still open under my name */
  if (typeof DEPT_DOCS !== "undefined") Object.keys(DEPT_DOCS).forEach((t) => {
    const def = DOC_TYPES[t];
    if (!def || def.special || t === "mreq") return;
    (DEPT_DOCS[t] || []).forEach((d) => {
      if (typeof authCanSeeDoc === "function" && !authCanSeeDoc(t, d)) return;
      if (!deptIsOpen(t, d)) return;
      const waiting = /^รอ/.test(d.status || "") && d.createdBy !== u.id && deptCanManage(u.role, t);
      const mine = d.createdBy === u.id || d.owner === u.name || d.tech === u.name;
      if (!waiting && !mine) return;
      const age = mtDays(d.date);
      add({ group: waiting ? "อนุมัติ" : "เอกสารของฉัน", icon: waiting ? "✍" : "📄", title: `${waiting ? "ตรวจ / อนุมัติ " : ""}${d.no} ${d.title || ""}`, detail: `${def.name.split(" (")[0]} · ${d.status}${age ? ` · ${age} วัน` : ""}`,
        tone: waiting && age >= 2 ? "warning" : "neutral", score: waiting ? 60 + age : 10 + Math.min(age, 20), age, act: () => openDocViewByNo(d.no) });
    });
  });

  /* plans assigned to me */
  if (typeof PLANS !== "undefined") PLANS.filter((p) => (p.assignees || []).includes(u.id) && !/เสร็จ|ยกเลิก/.test(p.status || "")).forEach((p) => {
    const late = p.due && p.due < new Date().toISOString().slice(0, 10);
    add({ group: "แผนงาน", icon: "🗒", title: p.title, detail: `กำหนด ${p.due ? formatThaiDate(p.due) : "-"}${p.endTime ? ` ${p.endTime}` : ""} · ${(p.items || []).filter((i) => i.done).length}/${(p.items || []).length} ข้อ`, tone: late ? "critical" : "neutral", score: late ? 50 : 25, act: () => { switchView("plans"); if (typeof openPlanEditor === "function") openPlanEditor(p.id); } });
  });

  /* late work orders for production leads / planners / managers */
  if (["depthead", "plant", "admin"].includes(u.role) && ["prod", "plan", ""].includes(u.dept || "") && typeof WORK_ORDERS !== "undefined")
    WORK_ORDERS.filter((w) => w.status === "ล่าช้า").forEach((w) => add({ group: "ใบสั่งผลิต", icon: "🏭", title: `${w.wo} ${w.serial || w.model} ล่าช้า`, detail: `กำหนด ${w.dueDate} · ${(w.jobs || []).filter((j) => j.status === "done").length}/${(w.jobs || []).length || "–"} ขั้น · เบิก ${w.issuedPct}%`, tone: "critical", score: 85, act: () => { jcWo = w.wo; switchView("workorder"); } }));

  return out.sort((a, b) => b.score - a.score);
}

function renderMyInbox() {
  const box = document.getElementById("myInbox");
  if (!box) return;
  const u = mtMe();
  if (!u) { box.innerHTML = ""; return; }
  const all = mtCollect();
  // "ทั้งหมด" = things to act on; my open documents and requests I'm only following live in their own tabs
  const FYI = ["เอกสารของฉัน", "ติดตาม"];
  const todo = all.filter((x) => !FYI.includes(x.group) || x.tone !== "neutral");
  const groups = [...new Set(all.map((x) => x.group))];
  if (mtFilter !== "all" && mtFilter !== "urgent" && !groups.includes(mtFilter)) mtFilter = "all";
  const list = (mtFilter === "all" ? todo : all.filter((x) => mtFilter === "urgent" ? x.tone === "critical" || x.tone === "warning" : x.group === mtFilter)).slice(0, 60);
  const urgent = all.filter((x) => x.tone === "critical" || x.tone === "warning").length;
  const jobsLive = typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS.reduce((n, w) => n + (w.jobs || []).filter((j) => j.assignee === u.name && j.status !== "done").length, 0) : 0;
  const hello = new Date().getHours() < 12 ? "สวัสดีตอนเช้า" : new Date().getHours() < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
  box.innerHTML = `
    <div class="card mt-card">
      <div class="card-header"><h3>${hello}, ${mtEsc(u.name)}</h3>
        <p class="card-sub">${mtEsc(u.position || "")} · งานทุกอย่างที่รอคุณจากทุกแผนก เรียงเรื่องด่วนก่อน — กดรายการเพื่อไปทำงานนั้นได้ทันที</p></div>
      <div class="card-body">
        <div class="mt-stats">
          <div class="mt-stat"><b>${todo.length}</b><span>งานที่ต้องทำ</span></div>
          <div class="mt-stat mt-stat-bad"><b>${urgent}</b><span>ด่วน / เลยกำหนด</span></div>
          <div class="mt-stat"><b>${jobsLive}</b><span>Job Card ค้าง</span></div>
        </div>
        <div class="dept-tabs mt-filters">
          <button type="button" class="dept-tab${mtFilter === "all" ? " active" : ""}" data-mtf="all">ต้องทำ <span class="dept-tab-count">${todo.length}</span></button>
          <button type="button" class="dept-tab${mtFilter === "urgent" ? " active" : ""}" data-mtf="urgent">ด่วน <span class="dept-tab-count">${urgent}</span></button>
          ${groups.map((g) => `<button type="button" class="dept-tab${mtFilter === g ? " active" : ""}" data-mtf="${mtEsc(g)}">${mtEsc(g)} <span class="dept-tab-count">${all.filter((x) => x.group === g).length}</span></button>`).join("")}
        </div>
        ${list.length ? `<ul class="mt-list">${list.map((x, i) => `<li class="mt-item mt-${x.tone}"><button type="button" data-mti="${all.indexOf(x)}">
            <span class="mt-ic">${x.icon}</span><span class="mt-body"><b>${mtEsc(x.title)}</b><span class="muted-inline">${mtEsc(x.detail)}</span></span>
            <span class="mt-tag">${mtEsc(x.group)}</span><span class="mt-go">›</span></button></li>`).join("")}</ul>`
          : `<p class="mt-empty">✓ ไม่มีงานค้างในหมวดนี้</p>`}
      </div>
    </div>`;
  box.querySelectorAll("[data-mtf]").forEach((b) => b.addEventListener("click", () => { mtFilter = b.dataset.mtf; renderMyInbox(); }));
  box.querySelectorAll("[data-mti]").forEach((b) => b.addEventListener("click", () => { const x = all[+b.dataset.mti]; if (x && x.act) x.act(); }));
}
