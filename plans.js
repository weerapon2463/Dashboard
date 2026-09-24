/* ==========================================================================
   Personal plans — each user keeps their own plans (goal, dates, progress,
   checklist) and chooses who else may see each one: nobody, their
   department, chosen teams / departments / people, or everyone.
   ========================================================================== */

const PLANS_STORAGE_KEY = "y2j-plans-v1";
const PLAN_STATUSES = [["วางแผน", "info"], ["กำลังทำ", "warning"], ["เสร็จแล้ว", "good"], ["ระงับ", "neutral"]];

let PLANS = [];
let plansTab = "mine";
let planEditingId = null;

function planSamples() {
  const iso = (d) => `2026-${d}T08:00:00`;
  return [
    {
      id: "p-1", owner: "u-rnd", title: "ปิดงานเปลี่ยนใบมีด SK5 (EO-2026-001) ให้ครบทุกเครื่อง YT6500",
      detail: "อัปเดต WI, ตรวจรับใบมีดล็อตใหม่, แจ้งหน้างาน", start: "2026-09-08", due: "2026-10-10", status: "กำลังทำ",
      items: [{ text: "ออก EO และแจ้งหน้างาน", done: true }, { text: "WI-2026-001 Rev.C ผ่านทบทวน", done: false }, { text: "ตรวจรับใบมีด SK5 ล็อตแรก", done: true }, { text: "ติดตามผลกับลูกค้า CC-2026-001", done: false }],
      visibility: { mode: "custom", teams: ["t-yt6500"], depts: [], users: [] }, createdAt: iso("09-08"), updatedAt: iso("09-23"),
    },
    {
      id: "p-2", owner: "u-qc", title: "ลด NCR งานเชื่อมให้เหลือ 0 ภายในเดือนตุลาคม",
      detail: "ติดตาม CAPA-2026-001 และตรวจค่ากระแสเชื่อมทุกต้นกะ", start: "2026-09-20", due: "2026-10-31", status: "กำลังทำ",
      items: [{ text: "ออก WI-2026-003 ค่ากระแสมาตรฐาน", done: true }, { text: "อบรมช่างเชื่อมทุกกะ", done: false }, { text: "สรุปผล 2 สัปดาห์", done: false }],
      visibility: { mode: "dept", ownerDept: "qc" }, createdAt: iso("09-20"), updatedAt: iso("09-22"),
    },
    {
      id: "p-3", owner: "u-plant", title: "เตรียมส่งผลงาน PS Innovation Award 2026",
      detail: "ทดสอบนำร่อง 26–27 ก.ย. → สรุปตัวเลขจริง → ส่ง 30 ก.ย.", start: "2026-09-20", due: "2026-09-30", status: "กำลังทำ",
      items: [{ text: "เก็บค่าก่อนใช้ Dashboard", done: false }, { text: "ทดสอบกับโครงการ YT6500", done: false }, { text: "กรอกผลในหน้า Pilot และส่งออก PDF", done: false }, { text: "ส่งเอกสารประกวด", done: false }],
      visibility: { mode: "custom", teams: ["t-award"], depts: [], users: [] }, createdAt: iso("09-20"), updatedAt: iso("09-24"),
    },
    {
      id: "p-4", owner: "u-prod", title: "แผนส่วนตัว: ฝึกช่างใหม่ 2 คนให้ประกอบโครงฐานได้",
      detail: "", start: "2026-09-15", due: "2026-11-15", status: "วางแผน",
      items: [{ text: "สอนตาม WI โครงฐาน", done: false }, { text: "ประเมินฝีมือ", done: false }],
      visibility: { mode: "private" }, createdAt: iso("09-15"), updatedAt: iso("09-15"),
    },
  ];
}

function initPlansData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLANS_STORAGE_KEY) || "null");
    PLANS = Array.isArray(parsed) ? parsed : planSamples();
  } catch (e) { PLANS = planSamples(); }
}

function savePlans() {
  try { localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(PLANS)); } catch (e) { showToast("บันทึกแผนไม่สำเร็จ", "warn"); }
}

function planProgress(p) {
  const items = p.items || [];
  if (p.status === "เสร็จแล้ว") return 100;
  if (!items.length) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

function planVisibleTo(p, u) {
  return p.owner === u.id || visAllows(p.visibility, p.owner, u);
}

function renderPlans() {
  const me = authCurrentUser();
  if (!me) return;
  document.querySelectorAll(".plan-tab").forEach((b) => {
    const on = b.dataset.tab === plansTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.getElementById("planTabAll").hidden = !authIsAdmin();
  const mine = PLANS.filter((p) => p.owner === me.id);
  const shared = PLANS.filter((p) => p.owner !== me.id && planVisibleTo(p, me));
  const list = plansTab === "mine" ? mine : plansTab === "shared" ? shared : PLANS;
  document.getElementById("planCountMine").textContent = mine.length;
  document.getElementById("planCountShared").textContent = shared.length;

  const wrap = document.getElementById("planList");
  const today = new Date().toISOString().slice(0, 10);
  wrap.innerHTML = list.map((p) => {
    const pct = planProgress(p);
    const tone = (PLAN_STATUSES.find((s) => s[0] === p.status) || [0, "neutral"])[1];
    const overdue = p.due && p.due < today && p.status !== "เสร็จแล้ว";
    const canEdit = p.owner === me.id || authIsAdmin();
    return `<article class="plan-card">
      <div class="plan-card-head">
        <span class="pill ${DOC_TONE_PILL[tone]}">${escapeHtml(p.status)}</span>
        <span class="plan-vis" title="ใครเห็นแผนนี้">${escapeHtml(visLabel(p.visibility))}</span>
      </div>
      <h4 class="plan-title">${escapeHtml(p.title)}</h4>
      ${p.detail ? `<p class="plan-detail">${escapeHtml(p.detail)}</p>` : ""}
      <div class="plan-meta">👤 ${escapeHtml(authUserName(p.owner))} · ${p.start ? formatThaiDate(p.start) : "—"} → <span class="${overdue ? "plan-overdue" : ""}">${p.due ? formatThaiDate(p.due) : "—"}${overdue ? " (เลยกำหนด)" : ""}</span></div>
      <div class="plan-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้า"><span style="width:${pct}%"></span></div>
      <div class="plan-pct">${pct}%</div>
      <ul class="plan-items">${(p.items || []).map((it, i) => `<li><label><input type="checkbox" data-plan="${escapeHtml(p.id)}" data-item="${i}"${it.done ? " checked" : ""}${canEdit ? "" : " disabled"}> <span class="${it.done ? "plan-done" : ""}">${escapeHtml(it.text)}</span></label></li>`).join("")}</ul>
      <div class="plan-foot"><span class="muted-inline">แก้ไขล่าสุด ${fmtDateTime(p.updatedAt)}</span>${canEdit ? `<button class="btn-chip" type="button" data-planedit="${escapeHtml(p.id)}">แก้ไข</button>` : ""}</div>
    </article>`;
  }).join("");
  document.getElementById("planEmpty").hidden = list.length > 0;
  document.getElementById("planEmpty").textContent = plansTab === "mine" ? "ยังไม่มีแผน — กด \"+ สร้างแผน\" เพื่อเริ่ม" : "ยังไม่มีแผนที่แชร์ให้คุณ";

  wrap.querySelectorAll("[data-item]").forEach((cb) => cb.addEventListener("change", () => {
    const p = PLANS.find((x) => x.id === cb.dataset.plan);
    const it = p.items[Number(cb.dataset.item)];
    it.done = cb.checked;
    p.updatedAt = new Date().toISOString();
    if (planProgress(p) === 100 && p.status !== "เสร็จแล้ว" && p.items.length) p.status = "เสร็จแล้ว";
    else if (p.status === "วางแผน" && cb.checked) p.status = "กำลังทำ";
    savePlans();
    auditLog(cb.checked ? "ทำเครื่องหมายเสร็จ" : "ยกเลิกเครื่องหมายเสร็จ", `แผน: ${p.title.slice(0, 40)}`, it.text);
    renderPlans();
  }));
  wrap.querySelectorAll("[data-planedit]").forEach((b) => b.addEventListener("click", () => openPlanEditor(b.dataset.planedit)));
}

function openPlanEditor(id) {
  planEditingId = id || null;
  const p = id ? PLANS.find((x) => x.id === id) : { title: "", detail: "", start: new Date().toISOString().slice(0, 10), due: "", status: "วางแผน", items: [], visibility: { mode: "private" } };
  document.getElementById("planEdTitle").textContent = id ? "แก้ไขแผน" : "สร้างแผนใหม่";
  document.getElementById("pl_title").value = p.title;
  document.getElementById("pl_detail").value = p.detail || "";
  document.getElementById("pl_start").value = p.start || "";
  document.getElementById("pl_due").value = p.due || "";
  document.getElementById("pl_status").innerHTML = PLAN_STATUSES.map((s) => `<option${s[0] === p.status ? " selected" : ""}>${s[0]}</option>`).join("");
  document.getElementById("pl_items").value = (p.items || []).map((i) => (i.done ? "[x] " : "") + i.text).join("\n");
  document.getElementById("planVisBox").innerHTML = visEditorHtml("plan", p.visibility);
  visEditorWire("plan");
  document.getElementById("planDeleteBtn").hidden = !id;
  document.getElementById("planEdBackdrop").classList.add("open");
}

function savePlanEditor() {
  const title = document.getElementById("pl_title").value.trim();
  if (!title) { document.getElementById("pl_title").focus(); return; }
  const me = authCurrentUser();
  const items = document.getElementById("pl_items").value.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => ({ done: /^\[x\]\s*/i.test(l), text: l.replace(/^\[x\]\s*/i, "") }));
  const data = {
    title,
    detail: document.getElementById("pl_detail").value.trim(),
    start: document.getElementById("pl_start").value,
    due: document.getElementById("pl_due").value,
    status: document.getElementById("pl_status").value,
    items,
    visibility: visEditorRead("plan", me.dept),
    updatedAt: new Date().toISOString(),
  };
  if (planEditingId) {
    const p = PLANS.find((x) => x.id === planEditingId);
    const changes = auditDiff(p, data, [{ key: "title", label: "ชื่อแผน" }, { key: "status", label: "สถานะ" }, { key: "due", label: "กำหนดเสร็จ" }]);
    const visChanged = JSON.stringify(p.visibility) !== JSON.stringify(data.visibility);
    Object.assign(p, data);
    auditLog("แก้ไขแผน", `แผน: ${title.slice(0, 40)}`, [changes, visChanged ? `การมองเห็น → ${visLabel(data.visibility)}` : ""].filter(Boolean).join(" · ") || "แก้ไขรายละเอียด");
  } else {
    PLANS.push(Object.assign({ id: "p-" + Date.now().toString(36), owner: me.id, createdAt: data.updatedAt }, data));
    auditLog("สร้างแผน", `แผน: ${title.slice(0, 40)}`, visLabel(data.visibility));
  }
  savePlans();
  document.getElementById("planEdBackdrop").classList.remove("open");
  plansTab = "mine";
  renderPlans();
  showToast("บันทึกแผนแล้ว", "good");
}

function deletePlan() {
  const p = PLANS.find((x) => x.id === planEditingId);
  if (!p || !confirm(`ลบแผน "${p.title}"?`)) return;
  PLANS = PLANS.filter((x) => x.id !== p.id);
  savePlans();
  auditLog("ลบแผน", `แผน: ${p.title.slice(0, 40)}`, "");
  document.getElementById("planEdBackdrop").classList.remove("open");
  renderPlans();
}

function initPlans() {
  initPlansData();
  document.querySelectorAll(".plan-tab").forEach((b) => b.addEventListener("click", () => { plansTab = b.dataset.tab; renderPlans(); }));
  document.getElementById("planAddBtn").addEventListener("click", () => openPlanEditor(null));
  const bd = document.getElementById("planEdBackdrop");
  bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  document.getElementById("planCancelBtn").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("planSaveBtn").addEventListener("click", savePlanEditor);
  document.getElementById("planDeleteBtn").addEventListener("click", deletePlan);
}
