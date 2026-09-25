/* =========================================================================
   แผนงาน & Schedule: everyone keeps their own schedule, or someone else creates
   the job and assigns it. Each item has date + time, assignees (who does it),
   co-editors (who may change it), tags, a checklist, visibility (who may see it)
   and an activity log that drives the 🔔 notifications of the people involved.
   ========================================================================= */

const PLANS_STORAGE_KEY = "y2j-plans-v1";
const PLAN_STATUSES = [["วางแผน", "info"], ["กำลังทำ", "warning"], ["เสร็จแล้ว", "good"], ["ระงับ", "neutral"]];
const PLAN_TAG_SUGGEST = ["ประชุม", "ตรวจงาน", "เร่งด่วน", "R&D", "ผลิต", "QC", "จัดซื้อ", "ลูกค้า", "Pilot", "อบรม"];
const PLAN_SEEN_PREFIX = "y2j-notify-seen-";

let PLANS = [];
let plansTab = "mine";       // mine | assigned | shared | all
let plansMode = "week";      // week | list
let plansWeek = null;        // Monday (YYYY-MM-DD) of the week shown
let plansTag = "";
let plansDept = "";          // department shown in the "แผนก" tab ("" = my own)
let plansMasterBy = "dept";  // Master tab rows: dept | person
let planEditingId = null;

const pad2 = (n) => String(n).padStart(2, "0");
function planIsoDay(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function planMonday(iso) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return planIsoDay(d); }
function planAddDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return planIsoDay(d); }

function planSamples() {
  const iso = (d) => `2026-${d}T08:00:00`;
  const act = (at, by, text, to) => ({ at: iso(at), by, text, to });
  return [
    {
      id: "p-1", owner: "u-rnd", assignees: ["u-rnd", "u-qc"], editors: ["u-qc"], tags: ["R&D", "QC"],
      title: "ปิดงานเปลี่ยนใบมีด SK5 (EO-2026-001) ให้ครบทุกเครื่อง YT6500",
      detail: "อัปเดต WI, ตรวจรับใบมีดล็อตใหม่, แจ้งหน้างาน", start: "2026-09-08", startTime: "08:30", due: "2026-10-10", endTime: "16:30", status: "กำลังทำ",
      items: [{ text: "ออก EO และแจ้งหน้างาน", done: true }, { text: "WI-2026-001 Rev.C ผ่านทบทวน", done: false }, { text: "ตรวจรับใบมีด SK5 ล็อตแรก", done: true }, { text: "ติดตามผลกับลูกค้า CC-2026-001", done: false }],
      visibility: { mode: "custom", teams: ["t-yt6500"], depts: [], users: [] }, createdAt: iso("09-08"), updatedAt: iso("09-23"),
      activity: [act("09-08", "u-rnd", "มอบหมายงานนี้ให้คุณ", ["u-qc"])],
    },
    {
      id: "p-2", owner: "u-qc", assignees: ["u-qc"], editors: [], tags: ["QC"],
      title: "ลด NCR งานเชื่อมให้เหลือ 0 ภายในเดือนตุลาคม",
      detail: "ติดตาม CAPA-2026-001 และตรวจค่ากระแสเชื่อมทุกต้นกะ", start: "2026-09-20", startTime: "", due: "2026-10-31", endTime: "", status: "กำลังทำ",
      items: [{ text: "ออก WI-2026-003 ค่ากระแสมาตรฐาน", done: true }, { text: "อบรมช่างเชื่อมทุกกะ", done: false }, { text: "สรุปผล 2 สัปดาห์", done: false }],
      visibility: { mode: "dept", ownerDept: "qc" }, createdAt: iso("09-20"), updatedAt: iso("09-22"), activity: [],
    },
    {
      id: "p-3", owner: "u-plant", assignees: ["u-plant", "u-prod", "u-rnd"], editors: ["u-prod"], tags: ["Pilot", "เร่งด่วน"],
      title: "ทดสอบนำร่อง (Pilot) Y2J ONE กับโครงการ YT6500",
      detail: "เก็บค่าก่อน-หลัง ทุกแผนกใช้ระบบจริง 2 วัน", start: "2026-09-26", startTime: "08:00", due: "2026-09-27", endTime: "17:00", status: "วางแผน",
      items: [{ text: "สำรองข้อมูลก่อนเริ่ม", done: true }, { text: "เก็บค่าก่อนใช้ระบบ", done: false }, { text: "ใช้ระบบกับ YT6500 จริง", done: false }, { text: "กรอกผลในหน้า Pilot", done: false }],
      visibility: { mode: "custom", teams: ["t-award"], depts: [], users: [] }, createdAt: iso("09-20"), updatedAt: iso("09-24"),
      activity: [act("09-24", "u-plant", "มอบหมายงานนี้ให้คุณ", ["u-prod", "u-rnd"])],
    },
    {
      id: "p-4", owner: "u-prod", assignees: ["u-prod"], editors: [], tags: ["อบรม"],
      title: "แผนส่วนตัว: ฝึกช่างใหม่ 2 คนให้ประกอบโครงฐานได้",
      detail: "", start: "2026-09-15", startTime: "", due: "2026-11-15", endTime: "", status: "วางแผน",
      items: [{ text: "สอนตาม WI โครงฐาน", done: false }, { text: "ประเมินฝีมือ", done: false }],
      visibility: { mode: "private" }, createdAt: iso("09-15"), updatedAt: iso("09-15"), activity: [],
    },
  ];
}

function initPlansData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLANS_STORAGE_KEY) || "null");
    PLANS = Array.isArray(parsed) ? parsed : planSamples();
  } catch (e) { PLANS = planSamples(); }
  PLANS.forEach(planNormalize);
}

// plans saved by earlier versions: owner was the only person, no times/tags/activity
function planNormalize(p) {
  if (!Array.isArray(p.assignees)) p.assignees = p.owner ? [p.owner] : [];
  if (!Array.isArray(p.editors)) p.editors = [];
  if (!Array.isArray(p.tags)) p.tags = [];
  if (!Array.isArray(p.activity)) p.activity = [];
  if (p.startTime === undefined) p.startTime = "";
  if (p.endTime === undefined) p.endTime = "";
  return p;
}

function savePlans() {
  try { localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(PLANS)); } catch (e) { showToast("บันทึกแผนไม่สำเร็จ", "warn"); }
  planBellRender();
}

function planProgress(p) {
  const items = p.items || [];
  if (p.status === "เสร็จแล้ว") return 100;
  if (!items.length) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

function planInvolved(p) { return [...new Set([p.owner].concat(p.assignees || [], p.editors || []))].filter(Boolean); }
function planVisibleTo(p, u) { return planInvolved(p).includes(u.id) || visAllows(p.visibility, p.owner, u); }
function planCanEdit(p, u) { return !!u && (p.owner === u.id || (p.editors || []).includes(u.id) || u.role === "admin"); }
function planCanWork(p, u) { return planCanEdit(p, u) || (!!u && (p.assignees || []).includes(u.id)); } // tick items / status

function planUsers() {
  const co = typeof orgCurrentId === "function" ? orgCurrentId() : "";
  return AUTH.users.filter((u) => u.active && (u.role === "admin" || u.role === "group" || !u.company || u.company === co));
}
function planWhen(p) {
  const s = p.start ? formatThaiDate(p.start) + (p.startTime ? ` ${p.startTime}` : "") : "—";
  const same = p.start && p.due === p.start;
  const e = p.due ? (same ? (p.endTime ? p.endTime : "") : formatThaiDate(p.due) + (p.endTime ? ` ${p.endTime}` : "")) : "";
  return e ? `${s} → ${e}` : s;
}

// record what happened and who should hear about it (everyone involved except the actor)
function planLog(p, text, to) {
  const me = authCurrentUser();
  const rcpt = (to || planInvolved(p)).filter((id) => id && (!me || id !== me.id));
  p.activity = (p.activity || []).concat([{ at: new Date().toISOString(), by: me ? me.id : "", text, to: rcpt }]).slice(-30);
}

/* ---- rendering ------------------------------------------------------------ */

function renderPlans() {
  const me = authCurrentUser();
  if (!me) return;
  if (!plansWeek) plansWeek = planMonday(planIsoDay(new Date()));
  const mine = PLANS.filter((p) => p.owner === me.id);
  const assigned = PLANS.filter((p) => p.owner !== me.id && ((p.assignees || []).includes(me.id) || (p.editors || []).includes(me.id)));
  const shared = PLANS.filter((p) => !planInvolved(p).includes(me.id) && planVisibleTo(p, me));
  document.getElementById("planCountMine").textContent = mine.length;
  document.getElementById("planCountAssigned").textContent = assigned.length;
  document.getElementById("planCountShared").textContent = shared.length;
  // department schedule: every task someone of that department owns or works on — only those this user may see
  const dept = plansDept || me.dept || "";
  const deptOf = (id) => (authUserById(id) || {}).dept;
  const deptList = PLANS.filter((p) => planVisibleTo(p, me) && [p.owner].concat(p.assignees || []).some((id) => deptOf(id) === dept));
  document.getElementById("planCountDept").textContent = PLANS.filter((p) => planVisibleTo(p, me) && [p.owner].concat(p.assignees || []).some((id) => deptOf(id) === (me.dept || ""))).length;
  const dsel = document.getElementById("planDeptSel");
  dsel.hidden = plansTab !== "dept";
  if (!dsel.options.length) dsel.innerHTML = DEPT_WORKSPACES.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");
  dsel.value = dept;
  const msel = document.getElementById("planMasterBy");
  msel.hidden = plansTab !== "master";
  msel.value = plansMasterBy;
  // Master: everyone plans on their own; this puts every department's (or person's) plans side by side
  const masterList = PLANS.filter((p) => planVisibleTo(p, me));
  document.getElementById("planCountMaster").textContent = masterList.length;
  document.getElementById("planTabAll").hidden = !authIsAdmin();
  document.querySelectorAll(".plan-tab").forEach((b) => { const on = b.dataset.tab === plansTab; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  document.querySelectorAll(".plan-mode").forEach((b) => { const on = b.dataset.mode === plansMode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });

  // "mine" in the calendar = everything I own or am assigned to: my whole schedule
  let list = plansTab === "mine" ? (plansMode === "week" ? mine.concat(assigned) : mine) : plansTab === "assigned" ? assigned : plansTab === "shared" ? shared : plansTab === "dept" ? deptList : plansTab === "master" ? masterList : PLANS.slice();
  const tags = [...new Set(list.flatMap((p) => p.tags || []))].sort();
  document.getElementById("planTagBar").innerHTML = tags.length
    ? `<button type="button" class="btn-chip${plansTag ? "" : " active"}" data-ptag="">ทุกแท็ก</button>` + tags.map((t) => `<button type="button" class="btn-chip${plansTag === t ? " active" : ""}" data-ptag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("")
    : "";
  if (plansTag) list = list.filter((p) => (p.tags || []).includes(plansTag));

  const wrap = document.getElementById("planList");
  const weekBar = document.getElementById("planWeekBar");
  weekBar.hidden = plansMode !== "week";
  if (plansTab === "master") {
    planRenderMaster(wrap, list, me, deptOf);
  } else if (plansMode === "week") {
    const days = [...Array(7)].map((_, i) => planAddDays(plansWeek, i));
    document.getElementById("planWeekLabel").textContent = `${formatThaiDate(days[0])} – ${formatThaiDate(days[6])}`;
    const today = planIsoDay(new Date());
    const DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
    wrap.className = "plan-week";
    wrap.innerHTML = days.map((d, i) => {
      const items = list.filter((p) => p.start && p.start <= d && (p.due || p.start) >= d)
        .sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
      return `<div class="plan-day${d === today ? " plan-today" : ""}">
        <div class="plan-day-head"><span>${DOW[i]}</span> <strong>${Number(d.slice(8))}</strong></div>
        ${items.map((p) => planChip(p, d, me)).join("") || '<div class="plan-day-empty">—</div>'}
        <button type="button" class="plan-day-add" data-newday="${d}" aria-label="เพิ่มงานวันที่ ${formatThaiDate(d)}">+</button>
      </div>`;
    }).join("");
  } else {
    wrap.className = "plan-grid";
    list.sort((a, b) => (a.start || "").localeCompare(b.start || "") || (a.startTime || "").localeCompare(b.startTime || ""));
    wrap.innerHTML = list.map((p) => planCard(p, me)).join("");
  }
  const empty = document.getElementById("planEmpty");
  empty.hidden = plansMode === "week" || list.length > 0;
  empty.textContent = plansTab === "mine" ? "ยังไม่มีแผน — กด \"+ สร้างงาน / นัดหมาย\" เพื่อเริ่ม" : plansTab === "assigned" ? "ยังไม่มีงานที่คนอื่นมอบหมายให้คุณ" : "ยังไม่มีแผนที่แชร์ให้คุณ";

  wrap.querySelectorAll("[data-item]").forEach((cb) => cb.addEventListener("change", () => planTick(cb.dataset.plan, Number(cb.dataset.item), cb.checked)));
  wrap.querySelectorAll("[data-planedit]").forEach((b) => b.addEventListener("click", () => openPlanEditor(b.dataset.planedit)));
  wrap.querySelectorAll("[data-newday]").forEach((b) => b.addEventListener("click", () => openPlanEditor(null, b.dataset.newday)));
  document.querySelectorAll("#planTagBar [data-ptag]").forEach((b) => b.addEventListener("click", () => { plansTag = b.dataset.ptag; renderPlans(); }));
}

// rows × days (week) or grouped cards (list): one row per department or per person
function planRenderMaster(wrap, list, me, deptOf) {
  const days = [...Array(7)].map((_, i) => planAddDays(plansWeek, i));
  document.getElementById("planWeekLabel").textContent = `${formatThaiDate(days[0])} – ${formatThaiDate(days[6])}`;
  const today = planIsoDay(new Date());
  const DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
  const people = (p) => [p.owner].concat(p.assignees || []);
  const inWeek = (p) => p.start && p.start <= days[6] && (p.due || p.start) >= days[0];
  let rows;
  if (plansMasterBy === "person") {
    const ids = [...new Set(list.flatMap((p) => (p.assignees && p.assignees.length ? p.assignees : [p.owner])))];
    rows = ids.map((id) => ({ key: id, label: authUserName(id), sub: authDeptName(deptOf(id)), items: list.filter((p) => (p.assignees && p.assignees.length ? p.assignees : [p.owner]).includes(id)) }))
      .sort((a, b) => a.sub.localeCompare(b.sub) || a.label.localeCompare(b.label));
  } else {
    rows = DEPT_WORKSPACES.map((w) => ({ key: w.id, label: w.name, sub: "", items: list.filter((p) => people(p).some((id) => deptOf(id) === w.id)) }));
  }
  if (plansMode === "week") {
    wrap.className = "plan-master-wrap";
    wrap.innerHTML = `<div class="plan-master">
      <div class="pm-head pm-corner">${plansMasterBy === "person" ? "บุคคล" : "แผนก"}</div>
      ${days.map((d, i) => `<div class="pm-head${d === today ? " plan-today" : ""}">${DOW[i]} <strong>${Number(d.slice(8))}</strong></div>`).join("")}
      ${rows.filter((r) => plansMasterBy === "dept" || r.items.some(inWeek)).map((r) => {
        const n = r.items.filter(inWeek).length;
        return `<div class="pm-row-head"><strong>${escapeHtml(r.label)}</strong>${r.sub ? `<span>${escapeHtml(r.sub)}</span>` : ""}<span class="pm-count${n > 6 ? " pm-busy" : ""}">${n} งานสัปดาห์นี้</span></div>
        ${days.map((d) => {
          const items = r.items.filter((p) => p.start && p.start <= d && (p.due || p.start) >= d).sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
          return `<div class="pm-cell${d === today ? " pm-today" : ""}">${items.map((p) => planChip(p, d, me)).join("")}</div>`;
        }).join("")}`;
      }).join("") || ""}
    </div>`;
  } else {
    wrap.className = "plan-master-list";
    wrap.innerHTML = rows.filter((r) => r.items.length).map((r) => `<section class="pm-group"><h4>${escapeHtml(r.label)}${r.sub ? ` <span class="muted-inline">${escapeHtml(r.sub)}</span>` : ""} <span class="dept-tab-count">${r.items.length}</span></h4>
      <div class="plan-grid">${r.items.slice().sort((a, b) => (a.start || "").localeCompare(b.start || "")).map((p) => planCard(p, me)).join("")}</div></section>`).join("")
      || '<p class="muted-note">ยังไม่มีแผนงานที่คุณมองเห็น</p>';
  }
}

function planPeople(p) {
  return (p.assignees || []).map((id) => `<span class="plan-person" title="ผู้รับผิดชอบ">${escapeHtml(authUserName(id))}</span>`).join("");
}

function planChip(p, day, me) {
  const tone = (PLAN_STATUSES.find((s) => s[0] === p.status) || [0, "neutral"])[1];
  const time = p.start === day && p.startTime ? p.startTime + (p.due === day && p.endTime ? `–${p.endTime}` : "") : p.start < day ? "ต่อเนื่อง" : "ทั้งวัน";
  const assignedToMe = p.owner !== me.id && (p.assignees || []).includes(me.id);
  return `<button type="button" class="plan-chip plan-chip-${tone}" data-planedit="${escapeHtml(p.id)}" title="${escapeHtml(p.title)} · ${escapeHtml(planWhen(p))}">
    <span class="plan-chip-time">${escapeHtml(time)}${assignedToMe ? " · 📌 มอบหมาย" : ""}</span>
    <span class="plan-chip-title">${escapeHtml(p.title)}</span>
    ${(p.tags || []).length ? `<span class="plan-chip-tags">${p.tags.map((t) => "#" + escapeHtml(t)).join(" ")}</span>` : ""}
  </button>`;
}

function planCard(p, me) {
  const pct = planProgress(p);
  const tone = (PLAN_STATUSES.find((s) => s[0] === p.status) || [0, "neutral"])[1];
  const today = planIsoDay(new Date());
  const overdue = p.due && p.due < today && p.status !== "เสร็จแล้ว";
  const canWork = planCanWork(p, me);
  return `<article class="plan-card">
    <div class="plan-card-head">
      <span class="pill ${DOC_TONE_PILL[tone]}">${escapeHtml(p.status)}</span>
      <span class="plan-vis" title="ใครเห็นแผนนี้">${escapeHtml(visLabel(p.visibility))}</span>
    </div>
    <h4 class="plan-title">${escapeHtml(p.title)}</h4>
    ${p.detail ? `<p class="plan-detail">${escapeHtml(p.detail)}</p>` : ""}
    <div class="plan-meta">🗓 <span class="${overdue ? "plan-overdue" : ""}">${escapeHtml(planWhen(p))}${overdue ? " (เลยกำหนด)" : ""}</span></div>
    <div class="plan-meta">✍ สร้างโดย ${escapeHtml(authUserName(p.owner))}${(p.editors || []).length ? ` · ร่วมแก้ไข ${p.editors.map((id) => escapeHtml(authUserName(id))).join(", ")}` : ""}</div>
    <div class="plan-people">${planPeople(p)}</div>
    ${(p.tags || []).length ? `<div class="plan-tags">${p.tags.map((t) => `<span class="plan-tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    <div class="plan-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้า"><span style="width:${pct}%"></span></div>
    <div class="plan-pct">${pct}%</div>
    <ul class="plan-items">${(p.items || []).map((it, i) => `<li><label><input type="checkbox" data-plan="${escapeHtml(p.id)}" data-item="${i}"${it.done ? " checked" : ""}${canWork ? "" : " disabled"}> <span class="${it.done ? "plan-done" : ""}">${escapeHtml(it.text)}</span></label></li>`).join("")}</ul>
    <div class="plan-foot"><span class="muted-inline">แก้ไขล่าสุด ${fmtDateTime(p.updatedAt)}</span><button class="btn-chip" type="button" data-planedit="${escapeHtml(p.id)}">${planCanEdit(p, me) ? "แก้ไข" : "ดูรายละเอียด"}</button></div>
  </article>`;
}

function planTick(id, i, done) {
  const p = PLANS.find((x) => x.id === id);
  const me = authCurrentUser();
  if (!p || !planCanWork(p, me)) return;
  const it = p.items[i];
  it.done = done;
  p.updatedAt = new Date().toISOString();
  if (planProgress(p) === 100 && p.status !== "เสร็จแล้ว" && p.items.length) { p.status = "เสร็จแล้ว"; planLog(p, "ทำงานเสร็จครบทุกข้อ"); }
  else if (p.status === "วางแผน" && done) p.status = "กำลังทำ";
  if (done) planLog(p, `ทำเสร็จ: ${it.text}`);
  savePlans();
  auditLog(done ? "ทำเครื่องหมายเสร็จ" : "ยกเลิกเครื่องหมายเสร็จ", `แผน: ${p.title.slice(0, 40)}`, it.text);
  renderPlans();
}

/* ---- editor --------------------------------------------------------------- */

function planPeoplePicker(id, selected) {
  return planUsers().map((u) => `<label class="vis-opt"><input type="checkbox" data-pp="${id}" value="${escapeHtml(u.id)}"${selected.includes(u.id) ? " checked" : ""}> ${escapeHtml(u.name)}${u.position ? ` <span class="muted-inline">${escapeHtml(u.position)}</span>` : ""}</label>`).join("");
}
function planPicked(id) { return [...document.querySelectorAll(`[data-pp="${id}"]:checked`)].map((i) => i.value); }

function openPlanEditor(id, day) {
  const me = authCurrentUser();
  planEditingId = id || null;
  const p = id ? PLANS.find((x) => x.id === id) : planNormalize({ owner: me.id, title: "", detail: "", start: day || planIsoDay(new Date()), startTime: "", due: day || "", endTime: "", status: "วางแผน", items: [], assignees: [me.id], editors: [], tags: [], visibility: { mode: "private" } });
  const canEdit = !id || planCanEdit(p, me);
  const canWork = !id || planCanWork(p, me);
  document.getElementById("planEdTitle").textContent = !id ? "สร้างงาน / นัดหมาย" : canEdit ? "แก้ไขงาน" : "รายละเอียดงาน";
  const set = (k, v) => { const el = document.getElementById(k); el.value = v; el.disabled = !canEdit; };
  set("pl_title", p.title);
  set("pl_detail", p.detail || "");
  set("pl_start", p.start || "");
  set("pl_startTime", p.startTime || "");
  set("pl_due", p.due || "");
  set("pl_endTime", p.endTime || "");
  set("pl_tags", (p.tags || []).join(", "));
  set("pl_items", (p.items || []).map((i) => (i.done ? "[x] " : "") + i.text).join("\n"));
  const st = document.getElementById("pl_status");
  st.innerHTML = PLAN_STATUSES.map((s) => `<option${s[0] === p.status ? " selected" : ""}>${s[0]}</option>`).join("");
  st.disabled = !canWork;
  document.getElementById("pl_tagSuggest").innerHTML = PLAN_TAG_SUGGEST.map((t) => `<option value="${escapeHtml(t)}">`).join("");
  document.getElementById("pl_assignees").innerHTML = planPeoplePicker("as", p.assignees || []);
  document.getElementById("pl_editors").innerHTML = planPeoplePicker("ed", p.editors || []);
  document.querySelectorAll("#pl_assignees input, #pl_editors input").forEach((i) => { i.disabled = !canEdit; });
  document.getElementById("planVisBox").innerHTML = canEdit ? visEditorHtml("plan", p.visibility) : `<p class="muted-inline">การมองเห็น: ${escapeHtml(visLabel(p.visibility))}</p>`;
  if (canEdit) visEditorWire("plan");
  document.getElementById("pl_owner").textContent = id ? `สร้างโดย ${authUserName(p.owner)} · ผู้รับผิดชอบ ผู้ร่วมแก้ไข และผู้สร้างจะได้รับแจ้งเตือนเมื่อมีการเปลี่ยนแปลง` : "ผู้ที่ถูกมอบหมายและผู้ร่วมแก้ไขจะได้รับแจ้งเตือน 🔔 ทันที";
  document.getElementById("pl_activity").innerHTML = id && (p.activity || []).length
    ? `<div class="vis-group-title">ความเคลื่อนไหว</div><ul class="plan-activity">${p.activity.slice().reverse().slice(0, 8).map((a) => `<li><span class="muted-inline">${fmtDateTime(a.at)}</span> ${escapeHtml(authUserName(a.by))}: ${escapeHtml(a.text)}</li>`).join("")}</ul>` : "";
  document.getElementById("planDeleteBtn").hidden = !id || !(p.owner === me.id || me.role === "admin");
  document.getElementById("planSaveBtn").hidden = !canWork;
  document.getElementById("planEdBackdrop").classList.add("open");
}

function savePlanEditor() {
  const me = authCurrentUser();
  const old = planEditingId ? PLANS.find((x) => x.id === planEditingId) : null;
  if (old && !planCanEdit(old, me)) {
    // assignees who may not edit can still move the status
    const status = document.getElementById("pl_status").value;
    if (status !== old.status) { old.status = status; old.updatedAt = new Date().toISOString(); planLog(old, `เปลี่ยนสถานะเป็น "${status}"`); savePlans(); auditLog("แก้ไขแผน", `แผน: ${old.title.slice(0, 40)}`, `สถานะ → ${status}`); }
    document.getElementById("planEdBackdrop").classList.remove("open");
    renderPlans();
    return;
  }
  const title = document.getElementById("pl_title").value.trim();
  if (!title) { document.getElementById("pl_title").focus(); return; }
  const start = document.getElementById("pl_start").value;
  const due = document.getElementById("pl_due").value || start;
  const startTime = document.getElementById("pl_startTime").value;
  const endTime = document.getElementById("pl_endTime").value;
  if (!start) { document.getElementById("pl_start").focus(); showToast("ใส่วันที่เริ่ม", "warn"); return; }
  if (due < start || (due === start && startTime && endTime && endTime <= startTime)) { showToast("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม", "warn"); document.getElementById("pl_due").focus(); return; }
  const assignees = planPicked("as");
  if (!assignees.length) { showToast("เลือกผู้รับผิดชอบอย่างน้อย 1 คน", "warn"); return; }
  const items = document.getElementById("pl_items").value.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => ({ done: /^\[x\]\s*/i.test(l), text: l.replace(/^\[x\]\s*/i, "") }));
  const tags = [...new Set(document.getElementById("pl_tags").value.split(/[,#\n]/).map((t) => t.trim()).filter(Boolean))];
  const data = {
    title, detail: document.getElementById("pl_detail").value.trim(), start, startTime, due, endTime,
    status: document.getElementById("pl_status").value, items, tags, assignees, editors: planPicked("ed"),
    visibility: visEditorRead("plan", me.dept), updatedAt: new Date().toISOString(),
  };
  if (old) {
    const added = assignees.filter((id) => !(old.assignees || []).includes(id));
    const changes = auditDiff(old, data, [{ key: "title", label: "ชื่อ" }, { key: "status", label: "สถานะ" }, { key: "start", label: "เริ่ม" }, { key: "startTime", label: "เวลาเริ่ม" }, { key: "due", label: "สิ้นสุด" }, { key: "endTime", label: "เวลาสิ้นสุด" }]);
    Object.assign(old, data);
    if (added.length) planLog(old, "มอบหมายงานนี้ให้คุณ", added);
    if (changes) planLog(old, `แก้ไข: ${changes}`, planInvolved(old).filter((id) => !added.includes(id)));
    auditLog("แก้ไขแผน", `แผน: ${title.slice(0, 40)}`, changes || "แก้ไขรายละเอียด");
  } else {
    const p = planNormalize(Object.assign({ id: "p-" + Date.now().toString(36), owner: me.id, createdAt: data.updatedAt, activity: [] }, data));
    PLANS.push(p);
    const others = assignees.filter((id) => id !== me.id);
    if (others.length) planLog(p, "มอบหมายงานนี้ให้คุณ", others);
    const eds = data.editors.filter((id) => id !== me.id && !others.includes(id));
    if (eds.length) planLog(p, "เพิ่มคุณเป็นผู้ร่วมแก้ไข", eds);
    auditLog("สร้างแผน", `แผน: ${title.slice(0, 40)}`, `${visLabel(data.visibility)}${others.length ? ` · มอบหมาย ${others.map(authUserName).join(", ")}` : ""}`);
  }
  savePlans();
  document.getElementById("planEdBackdrop").classList.remove("open");
  renderPlans();
  showToast("บันทึกแล้ว — แจ้งเตือนผู้เกี่ยวข้องแล้ว", "good");
}

function deletePlan() {
  const p = PLANS.find((x) => x.id === planEditingId);
  if (!p || !confirm(`ลบ "${p.title}"?`)) return;
  PLANS = PLANS.filter((x) => x.id !== p.id);
  savePlans();
  auditLog("ลบแผน", `แผน: ${p.title.slice(0, 40)}`, "");
  document.getElementById("planEdBackdrop").classList.remove("open");
  renderPlans();
}

/* ---- 🔔 notifications ------------------------------------------------------ */

function planSeenAt() { try { return localStorage.getItem(PLAN_SEEN_PREFIX + (authCurrentUser() || {}).id) || ""; } catch (e) { return ""; } }
function planNotifications() {
  const me = authCurrentUser();
  if (!me) return [];
  const out = [];
  const now = new Date();
  const todayIso = planIsoDay(now);
  PLANS.forEach((p) => {
    (p.activity || []).forEach((a) => { if ((a.to || []).includes(me.id)) out.push({ at: a.at, id: p.id, text: `${authUserName(a.by)}: ${a.text}`, title: p.title }); });
    // reminders: my open jobs starting today/tomorrow or overdue
    if (p.status !== "เสร็จแล้ว" && (p.assignees || []).includes(me.id)) {
      if (p.start === todayIso || p.start === planAddDays(todayIso, 1)) out.push({ at: `${p.start}T${p.startTime || "00:00"}:00`, id: p.id, text: `${p.start === todayIso ? "วันนี้" : "พรุ่งนี้"}${p.startTime ? " " + p.startTime + " น." : ""}`, title: p.title, remind: true });
      else if (p.due && p.due < todayIso) out.push({ at: `${p.due}T23:59:00`, id: p.id, text: "เลยกำหนดแล้ว", title: p.title, remind: true, late: true });
    }
  });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
}

function planBellRender() {
  const btn = document.getElementById("notifyBtn");
  if (!btn) return;
  const me = authCurrentUser();
  btn.hidden = !me;
  if (!me) return;
  const seen = planSeenAt();
  const list = planNotifications();
  const unread = list.filter((n) => n.remind || n.at > seen).length;
  const badge = document.getElementById("notifyCount");
  badge.textContent = unread > 9 ? "9+" : String(unread);
  badge.hidden = !unread;
  btn.setAttribute("aria-label", `การแจ้งเตือน ${unread} รายการใหม่`);
  const panel = document.getElementById("notifyPanel");
  panel.innerHTML = `<div class="notify-head"><strong>การแจ้งเตือน</strong><button type="button" class="btn-chip" id="notifyReadAll">อ่านแล้วทั้งหมด</button></div>`
    + (list.length ? `<ul class="notify-list">${list.map((n) => `<li><button type="button" class="notify-item${n.remind || n.at > seen ? " notify-new" : ""}${n.late ? " notify-late" : ""}" data-nplan="${escapeHtml(n.id)}">
        <span class="notify-title">${n.remind ? "⏰ " : ""}${escapeHtml(n.title)}</span>
        <span class="notify-text">${escapeHtml(n.text)}</span>
        ${n.remind ? "" : `<span class="notify-at">${fmtDateTime(n.at)}</span>`}</button></li>`).join("")}</ul>`
      : `<p class="muted-note">ยังไม่มีการแจ้งเตือน</p>`);
  panel.querySelector("#notifyReadAll").addEventListener("click", () => {
    try { localStorage.setItem(PLAN_SEEN_PREFIX + me.id, new Date().toISOString()); } catch (e) { /* per-device */ }
    planBellRender();
  });
  panel.querySelectorAll("[data-nplan]").forEach((b) => b.addEventListener("click", () => {
    panel.hidden = true; btn.setAttribute("aria-expanded", "false");
    switchView("plans");
    openPlanEditor(b.dataset.nplan);
  }));
}

function initPlans() {
  initPlansData();
  document.querySelectorAll(".plan-tab").forEach((b) => b.addEventListener("click", () => { plansTab = b.dataset.tab; plansTag = ""; renderPlans(); }));
  document.querySelectorAll(".plan-mode").forEach((b) => b.addEventListener("click", () => { plansMode = b.dataset.mode; renderPlans(); }));
  document.getElementById("planPrevWeek").addEventListener("click", () => { plansWeek = planAddDays(plansWeek, -7); renderPlans(); });
  document.getElementById("planNextWeek").addEventListener("click", () => { plansWeek = planAddDays(plansWeek, 7); renderPlans(); });
  document.getElementById("planDeptSel").addEventListener("change", (e) => { plansDept = e.target.value; renderPlans(); });
  document.getElementById("planMasterBy").addEventListener("change", (e) => { plansMasterBy = e.target.value; renderPlans(); });
  document.getElementById("planThisWeek").addEventListener("click", () => { plansWeek = planMonday(planIsoDay(new Date())); renderPlans(); });
  document.getElementById("planAddBtn").addEventListener("click", () => openPlanEditor(null));
  const bd = document.getElementById("planEdBackdrop");
  bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  document.getElementById("planCancelBtn").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("planSaveBtn").addEventListener("click", savePlanEditor);
  document.getElementById("planDeleteBtn").addEventListener("click", deletePlan);
  const btn = document.getElementById("notifyBtn");
  const panel = document.getElementById("notifyPanel");
  btn.addEventListener("click", (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", String(!panel.hidden)); });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
  planBellRender();
  setInterval(planBellRender, 60000); // reminders move with the clock; synced changes arrive in the background
}
