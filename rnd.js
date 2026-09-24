/* ==========================================================================
   R&D Workbench — the engineering team's daily tools in one page:
   project plans with phases/tasks/milestones on a Gantt chart (created from
   templates), engineering-change tracking (ECR → EO → BOM Rev → drawings →
   WI → shop floor), BOM comparison between models/revisions with cost
   difference, a part library (cost/weight/material, roll-up per machine,
   new part codes, missing drawings), field feedback ranked for ECRs, and
   team workload. Stored in y2j-rnd-v1 { projects, parts }.
   ========================================================================== */

const RD_STORAGE_KEY = "y2j-rnd-v1";
const RD_STATUSES = ["วางแผน", "กำลังดำเนินการ", "หยุดชั่วคราว", "เสร็จแล้ว", "ยกเลิก"];
const RD_TYPES = {
  newModel: {
    name: "พัฒนารุ่นใหม่ (New Model)",
    phases: [
      ["แนวคิด & ข้อกำหนด", [["รวบรวมความต้องการลูกค้า/ตลาด", 7], ["กำหนดสเปกเครื่องและเป้าหมายต้นทุน", 7], ["◆ Gate 1: อนุมัติแนวคิด", 0]]],
      ["ออกแบบ", [["ออกแบบโครงสร้างหลัก (3D)", 14], ["ออกแบบระบบขับ / ไฮดรอลิก / ไฟฟ้า", 14], ["จัดทำ BOM ร่าง (Draft)", 5], ["เขียนแบบชิ้นส่วน (DWG)", 10], ["◆ Design Review", 0]]],
      ["ต้นแบบ", [["สั่งซื้อ/ผลิตชิ้นส่วนต้นแบบ", 14], ["ประกอบต้นแบบ", 7], ["◆ ต้นแบบพร้อมทดสอบ", 0]]],
      ["ทดสอบ", [["ทดสอบในโรงงาน", 7], ["ทดสอบภาคสนาม (ไร่อ้อย)", 14], ["แก้ไขตามผลทดสอบ (ECR)", 7], ["◆ อนุมัติผลทดสอบ", 0]]],
      ["ปล่อยผลิต", [["อนุมัติ BOM (Release) และแบบทั้งหมด", 3], ["จัดทำ WI ประกอบ/ทดสอบ", 5], ["อบรมไลน์ผลิตและช่างบริการ", 3], ["◆ ปล่อยผลิต (Start of Production)", 0]]],
    ],
  },
  improve: {
    name: "ปรับปรุง / แก้ปัญหา (ECR)",
    phases: [
      ["วิเคราะห์ปัญหา", [["รวบรวมข้อมูล NCR / เคลม / หน้างาน", 3], ["หาสาเหตุราก (5 Why / Fishbone)", 3]]],
      ["แก้ไข", [["เสนอแนวทางแก้ไข (ECR)", 2], ["◆ อนุมัติ ECR", 0], ["ออกแบบ/ทดลองแก้ไข", 7], ["ออก EO + ปรับ BOM / แบบ / WI", 3]]],
      ["ยืนยันผล", [["แจ้งหน้างานและติดตามล็อตแรก", 7], ["◆ ปิดเรื่อง — ยืนยันว่าไม่เกิดซ้ำ", 0]]],
    ],
  },
  cost: {
    name: "ลดต้นทุน (VA/VE)",
    phases: [
      ["วิเคราะห์ต้นทุน", [["รวบรวมต้นทุนวัสดุต่อคันจาก BOM", 3], ["เลือกชิ้นส่วนเป้าหมาย (Pareto)", 3]]],
      ["หาทางเลือก", [["เสนอวัสดุ/ผู้ขาย/วิธีผลิตทางเลือก", 7], ["ทดสอบคุณภาพทางเลือก", 7], ["◆ อนุมัติทางเลือก", 0]]],
      ["นำไปใช้", [["ออก ECR/EO และปรับ BOM", 3], ["ติดตามต้นทุนจริงล็อตแรก", 14], ["◆ สรุปผลการลดต้นทุน", 0]]],
    ],
  },
  blank: { name: "เปล่า (กำหนดขั้นตอนเอง)", phases: [["งาน", [["งานแรก", 7]]]] },
};

let RD = { projects: [], parts: {} };
let rdTab = "projects";
let rdOpenId = null;
let rdChangeFilter = "open";
let rdCmp = { a: "", ar: "", b: "", br: "", showSame: false };
let rdPartSearch = "";
let rdMineOnly = false;

/* ---- storage & helpers --------------------------------------------------------- */

function rdLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(RD_STORAGE_KEY) || "null");
    RD = p && typeof p === "object" ? { projects: Array.isArray(p.projects) ? p.projects : [], parts: p.parts || {}, codeStd: p.codeStd || null } : { projects: [], parts: {}, codeStd: null };
  } catch (e) { RD = { projects: [], parts: {} }; }
}
function rdSave() {
  try { localStorage.setItem(RD_STORAGE_KEY, JSON.stringify(RD)); } catch (e) { showToast("บันทึกข้อมูล R&D ไม่สำเร็จ", "warn"); }
  if (typeof pcReset === "function") pcReset();
}
const rdEsc = (v) => escapeHtml(v === undefined || v === null ? "" : String(v));
function rdUser() { return typeof authCurrentUser === "function" ? authCurrentUser() : null; }
function rdUsers() { return typeof AUTH !== "undefined" && AUTH ? AUTH.users.filter((u) => u.active) : []; }
function rdUserName(id) { const u = rdUsers().find((x) => x.id === id); return u ? u.name : (id || "—"); }
function rdCanEdit(p) {
  const u = rdUser();
  if (!u) return true;
  if (["admin", "plant"].includes(u.role) || u.dept === "rnd" || authCan("ecr", "manage")) return true;
  return !!p && (p.owner === u.id || (p.team || []).includes(u.id));
}
function rdCanCreate() { const u = rdUser(); return !u || ["admin", "plant"].includes(u.role) || u.dept === "rnd" || authCan("ecr", "manage"); }
function rdAddDays(iso, n) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + Math.round(n)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function rdAudit(action, target, detail) { if (typeof auditLog === "function") auditLog(action, target, detail); }
function rdNextCode() {
  const y = new Date().getFullYear();
  const max = RD.projects.reduce((m, p) => { const x = new RegExp(`^RD-${y}-(\\d+)$`).exec(p.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `RD-${y}-${String(max + 1).padStart(3, "0")}`;
}
function rdDur(t) { return t.milestone ? 0 : Math.max(1, bxDaysBetween(t.start, t.end) + 1); }
function rdProgress(p) {
  const tasks = (p.tasks || []).filter((t) => !t.milestone);
  const tot = tasks.reduce((s, t) => s + rdDur(t), 0);
  return tot ? Math.round(tasks.reduce((s, t) => s + rdDur(t) * (Number(t.progress) || 0), 0) / tot) : 0;
}
function rdTaskLate(t) { return (Number(t.progress) || 0) < 100 && t.end && t.end < bxToday(); }
function rdHealth(p) {
  if (p.status === "เสร็จแล้ว") return ["เสร็จแล้ว", "good"];
  if (p.status === "ยกเลิก") return ["ยกเลิก", "neutral"];
  if (p.status === "หยุดชั่วคราว") return ["หยุดชั่วคราว", "neutral"];
  const prog = rdProgress(p);
  if (p.target && bxToday() > p.target && prog < 100) return ["เลยกำหนด", "critical"];
  const total = Math.max(1, bxDaysBetween(p.start, p.target));
  const elapsed = Math.max(0, Math.min(100, (bxDaysBetween(p.start, bxToday()) / total) * 100));
  if ((p.tasks || []).some((t) => t.milestone && rdTaskLate(t)) || prog + 15 < elapsed) return ["เสี่ยงล่าช้า", "warning"];
  return ["ตามแผน", "info"];
}
function rdNextMilestone(p) { return (p.tasks || []).filter((t) => t.milestone && (Number(t.progress) || 0) < 100).sort((a, b) => String(a.end).localeCompare(String(b.end)))[0] || null; }

// Lay template tasks one after another between start and target
function rdBuildTasks(type, start, target) {
  const tpl = RD_TYPES[type] || RD_TYPES.blank;
  const all = [];
  tpl.phases.forEach(([phase, tasks]) => tasks.forEach(([name, days]) => all.push({ phase, name, days })));
  const total = all.reduce((s, t) => s + t.days, 0) || 1;
  const span = Math.max(1, bxDaysBetween(start, target));
  const k = span / total;
  let cursor = 0;
  return all.map((t, i) => {
    const milestone = t.days === 0 || /^◆/.test(t.name);
    const dur = milestone ? 0 : Math.max(1, Math.round(t.days * k));
    const s = rdAddDays(start, Math.min(span, cursor));
    const e = milestone ? s : rdAddDays(start, Math.min(span, cursor + dur - 1));
    cursor += milestone ? 0 : dur;
    return { id: `T${i + 1}`, phase: t.phase, name: t.name.replace(/^◆\s*/, ""), milestone, start: s, end: e, progress: 0, owner: "", ref: "" };
  });
}

/* ---- page -------------------------------------------------------------------- */

function initRnd() {
  rdLoad();
  document.querySelectorAll("[data-rdtab]").forEach((b) => b.addEventListener("click", () => { rdTab = b.dataset.rdtab; rdOpenId = null; renderRnd(); }));
  const bd = document.getElementById("rdBackdrop");
  if (bd) bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
}

function renderRnd() {
  const pane = document.getElementById("rdPane");
  if (!pane) return;
  document.querySelectorAll("[data-rdtab]").forEach((b) => b.classList.toggle("active", b.dataset.rdtab === rdTab));
  renderRdStats();
  try {
    if (rdTab === "projects") rdOpenId ? renderRdProject(pane) : renderRdPortfolio(pane);
    else if (rdTab === "tq") renderRdTq(pane);
    else if (rdTab === "change") renderRdChanges(pane);
    else if (rdTab === "compare") renderRdCompare(pane);
    else if (rdTab === "parts") renderRdParts(pane);
    else if (rdTab === "feedback") renderRdFeedback(pane);
    else renderRdWorkload(pane);
  } catch (e) { pane.innerHTML = `<div class="card"><div class="card-body"><p class="muted-note">แสดงส่วนนี้ไม่ได้ (${rdEsc(e.message)})</p></div></div>`; }
}

function rdOpenChanges() {
  return (DEPT_DOCS.ecr || []).filter((d) => !["ไม่อนุมัติ", "ปิดแล้ว"].includes(d.status)).map((d) => rdChangeState(d)).filter((c) => c.pending.length);
}

function renderRdStats() {
  const el = document.getElementById("rdStats");
  if (!el) return;
  const active = RD.projects.filter((p) => ["วางแผน", "กำลังดำเนินการ"].includes(p.status));
  const risky = active.filter((p) => ["เลยกำหนด", "เสี่ยงล่าช้า"].includes(rdHealth(p)[0])).length;
  const tasks = active.flatMap((p) => p.tasks || []);
  const late = tasks.filter(rdTaskLate).length;
  const week = rdAddDays(bxToday(), 7);
  const dueWeek = tasks.filter((t) => (Number(t.progress) || 0) < 100 && t.end >= bxToday() && t.end <= week).length;
  const changes = rdOpenChanges().length;
  const noDwg = bxAllParts().filter((p) => p.line.code && p.line.source === "ผลิตเอง" && !drawingForPart(p.line.code)).length;
  const tqOpen = rdTqOpen();
  const tqLate = tqOpen.filter(rdTqLate).length;
  const cnt = document.getElementById("rdTqCount");
  if (cnt) cnt.textContent = tqOpen.length;
  const tile = (label, value, note, tone) => `<div class="stat-tile${tone ? ` bx-tile-${tone}` : ""}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
  el.innerHTML = [
    tile("โครงการที่กำลังทำ", active.length, risky ? `เสี่ยง/เลยกำหนด ${risky}` : "ตามแผนทั้งหมด", risky ? "warn" : ""),
    tile("งานครบกำหนด 7 วันนี้", dueWeek, `เลยกำหนด ${late} งาน`, late ? "bad" : ""),
    tile("TQ รอคำตอบ", tqOpen.length, tqLate ? `เลยกำหนดตอบ ${tqLate}` : "ตอบทันกำหนดทั้งหมด", tqLate ? "bad" : tqOpen.length ? "warn" : ""),
    tile("การเปลี่ยนแปลงที่ยังไม่ครบ", changes, "ECR ที่ยังค้าง EO/BOM/แบบ/WI", changes ? "warn" : ""),
    tile("ชิ้นผลิตเองที่ยังไม่มีแบบ", noDwg, "ควรลงทะเบียนแบบ (DWG)", noDwg ? "warn" : ""),
  ].join("");
}

/* ---- projects: portfolio -------------------------------------------------------- */

function renderRdPortfolio(pane) {
  const list = RD.projects.slice().sort((a, b) => (["เสร็จแล้ว", "ยกเลิก"].includes(a.status) - ["เสร็จแล้ว", "ยกเลิก"].includes(b.status)) || String(a.target).localeCompare(String(b.target)));
  const act = list.filter((p) => !["เสร็จแล้ว", "ยกเลิก"].includes(p.status));
  const minD = act.length ? act.map((p) => p.start).sort()[0] : bxToday();
  const maxD = act.length ? act.map((p) => p.target).sort().slice(-1)[0] : rdAddDays(bxToday(), 90);
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div><h3>แผนงานโครงการ R&D</h3><p class="card-sub">สร้างโครงการจากแม่แบบ ระบบวางขั้นตอนและกำหนดวันให้อัตโนมัติ · สถานะคำนวณจากความคืบหน้าเทียบเวลาที่ผ่านไป · กดชื่อโครงการเพื่อดูแผนงาน (Gantt) และอัปเดตงาน</p></div>
        ${rdCanCreate() ? `<button type="button" class="btn-primary" id="rdNewBtn">+ สร้างโครงการ</button>` : ""}
      </div>
      <div class="card-body table-scroll">
        ${list.length ? `<table class="data-table">
          <thead><tr><th>โครงการ</th><th>ประเภท</th><th>รุ่น</th><th>ผู้รับผิดชอบ</th><th>ความคืบหน้า</th><th>สถานะ</th><th>Milestone ถัดไป</th><th>กำหนดเสร็จ</th></tr></thead>
          <tbody>${list.map((p) => {
            const h = rdHealth(p);
            const prog = rdProgress(p);
            const m = rdNextMilestone(p);
            return `<tr><td><button type="button" class="bx-link" data-rdopen="${rdEsc(p.id)}"><strong>${rdEsc(p.id)}</strong> ${rdEsc(p.name)}</button></td>
              <td>${rdEsc((RD_TYPES[p.type] || {}).name || p.type)}</td><td>${rdEsc(p.model || "—")}</td><td>${rdEsc(rdUserName(p.owner))}</td>
              <td><div class="bx-bar"><span style="width:${prog}%"></span></div> <span class="muted-inline">${prog}%</span></td>
              <td>${bxPill(h[0], h[1])}</td>
              <td>${m ? `${rdEsc(m.name)} <span class="muted-inline">${formatThaiDate(m.end)}</span>` : "—"}</td>
              <td>${p.target ? formatThaiDate(p.target) : "—"}</td></tr>`;
          }).join("")}</tbody></table>` : `<p class="muted-note">ยังไม่มีโครงการ — กด "+ สร้างโครงการ" แล้วเลือกแม่แบบ เช่น พัฒนารุ่นใหม่ ระบบจะสร้างขั้นตอนตั้งแต่แนวคิดจนปล่อยผลิตให้</p>`}
      </div>
    </div>
    ${act.length ? `<div class="card"><div class="card-header"><h3>ภาพรวมทุกโครงการ (Timeline)</h3><p class="card-sub">แถบ = ช่วงโครงการ · ส่วนเข้ม = ความคืบหน้า · เส้นแดง = วันนี้</p></div>
      <div class="card-body">${rdGanttHtml(act.map((p) => ({ label: `${p.id} ${p.name}`, start: p.start, end: p.target, progress: rdProgress(p), tone: rdHealth(p)[1], open: p.id })), minD, maxD)}</div></div>` : ""}`;
  const nb = document.getElementById("rdNewBtn");
  if (nb) nb.addEventListener("click", rdNewProjectModal);
  pane.querySelectorAll("[data-rdopen]").forEach((b) => b.addEventListener("click", () => { rdOpenId = b.dataset.rdopen; renderRnd(); window.scrollTo(0, 0); }));
}

// Gantt: rows [{label, start, end, progress, tone, milestone, late, open}]
function rdGanttHtml(rows, from, to) {
  const span = Math.max(14, bxDaysBetween(from, to) + 1);
  const pos = (iso) => Math.max(0, Math.min(100, (bxDaysBetween(from, iso) / span) * 100));
  const ticks = [];
  const d0 = new Date(`${from}T00:00:00`);
  const step = span > 150 ? 30 : span > 60 ? 14 : 7;
  for (let i = 0; i <= span; i += step) {
    const d = new Date(d0); d.setDate(d.getDate() + i);
    ticks.push(`<span class="rd-tick" style="left:${(i / span) * 100}%">${d.getDate()} ${TH_MONTHS[d.getMonth()]}</span>`);
  }
  const today = bxToday();
  const todayLine = today >= from && today <= to ? `<i class="rd-today" style="left:${pos(today)}%"></i>` : "";
  return `<div class="rd-gantt"><div class="rd-g-row rd-g-head"><div class="rd-g-label"></div><div class="rd-g-track">${ticks.join("")}</div></div>
    ${rows.map((r) => {
      if (r.phase) return `<div class="rd-g-row rd-g-phase"><div class="rd-g-label">${rdEsc(r.phase)}</div><div class="rd-g-track">${todayLine}</div></div>`;
      const left = pos(r.start), width = Math.max(r.milestone ? 0 : 0.8, pos(r.end) + (100 / span) - left);
      const tip = `${r.label} · ${formatThaiDate(r.start)}${r.milestone ? "" : ` – ${formatThaiDate(r.end)}`} · ${r.progress}%`;
      return `<div class="rd-g-row"><div class="rd-g-label">${r.open ? `<button type="button" class="bx-link" data-rdopen="${rdEsc(r.open)}">${rdEsc(r.label)}</button>` : rdEsc(r.label)}</div>
        <div class="rd-g-track">${todayLine}${r.milestone
          ? `<span class="rd-ms rd-tone-${r.late ? "critical" : r.progress >= 100 ? "good" : "info"}" style="left:${left}%" title="${rdEsc(tip)}"></span>`
          : `<span class="rd-bar rd-tone-${r.late ? "critical" : r.tone || "info"}" style="left:${left}%;width:${width}%" title="${rdEsc(tip)}"><span style="width:${r.progress}%"></span></span>`}</div></div>`;
    }).join("")}</div>`;
}

function rdNewProjectModal() {
  const users = rdUsers();
  const me = rdUser();
  const start = bxToday();
  document.getElementById("rdBody").innerHTML = `
    <h3>สร้างโครงการ R&D</h3>
    <div class="modal-grid">
      <div class="form-field"><label for="rdp_name">ชื่อโครงการ *</label><input id="rdp_name" placeholder="เช่น พัฒนารถตัดอ้อย YT8000"></div>
      <div class="form-field"><label for="rdp_type">แม่แบบขั้นตอน</label><select id="rdp_type">${Object.keys(RD_TYPES).map((k) => `<option value="${k}">${rdEsc(RD_TYPES[k].name)}</option>`).join("")}</select></div>
      <div class="form-field"><label for="rdp_model">รุ่นที่เกี่ยวข้อง</label><input id="rdp_model" list="rdp_models" placeholder="รุ่นเดิม หรือชื่อรุ่นใหม่"><datalist id="rdp_models">${MACHINE_MODELS.map((m) => `<option value="${rdEsc(m)}">`).join("")}</datalist></div>
      <div class="form-field"><label for="rdp_owner">หัวหน้าโครงการ</label><select id="rdp_owner">${users.map((u) => `<option value="${u.id}"${me && u.id === me.id ? " selected" : ""}>${rdEsc(u.name)}</option>`).join("")}</select></div>
      <div class="form-field"><label for="rdp_start">เริ่ม</label><input type="date" id="rdp_start" value="${start}"></div>
      <div class="form-field"><label for="rdp_target">กำหนดเสร็จ</label><input type="date" id="rdp_target" value="${rdAddDays(start, 120)}"></div>
      <div class="form-field"><label for="rdp_budget">งบประมาณ (บาท)</label><input type="number" id="rdp_budget" min="0"></div>
      <div class="form-field"><label for="rdp_ref">อ้างอิง (ECR / NCR / CC)</label><input id="rdp_ref" placeholder="เช่น ECR-2026-003"></div>
    </div>
    <div class="form-field"><label for="rdp_goal">เป้าหมาย / ขอบเขต</label><textarea id="rdp_goal" rows="2" placeholder="เช่น เพิ่มกำลังตัด 20% ต้นทุนวัสดุไม่เกิน 1.8 ล้านบาท/คัน"></textarea></div>
    <div class="ue-section-title">ทีมงาน</div>
    <div class="vis-group">${users.map((u) => `<label class="vis-opt"><input type="checkbox" class="rdp-team" value="${u.id}"${u.dept === "rnd" ? " checked" : ""}> ${rdEsc(u.name)}</label>`).join("")}</div>
    <p class="muted-note">ระบบจะสร้างขั้นตอนตามแม่แบบและกระจายวันระหว่างวันเริ่มถึงกำหนดเสร็จให้ แก้ชื่องาน วัน ผู้รับผิดชอบ หรือเพิ่ม/ลบงานได้ภายหลัง</p>
    <div class="modal-actions"><button type="button" class="btn-secondary" id="rdp_cancel">ยกเลิก</button><button type="button" class="btn-primary" id="rdp_save">สร้างโครงการ</button></div>`;
  const bd = document.getElementById("rdBackdrop");
  document.getElementById("rdp_cancel").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("rdp_save").addEventListener("click", () => {
    const v = (k) => document.getElementById(`rdp_${k}`).value.trim();
    if (!v("name")) { document.getElementById("rdp_name").focus(); return; }
    if (!v("start") || !v("target") || v("target") <= v("start")) { showToast("กำหนดเสร็จต้องหลังวันเริ่ม", "warn"); return; }
    const p = {
      id: rdNextCode(), name: v("name"), type: v("type"), model: v("model"), owner: v("owner"),
      team: [...document.querySelectorAll(".rdp-team:checked")].map((i) => i.value), start: v("start"), target: v("target"),
      budget: Number(v("budget")) || 0, ref: v("ref"), goal: v("goal"), status: "กำลังดำเนินการ", createdAt: new Date().toISOString(), createdBy: (rdUser() || {}).id || "",
      tasks: rdBuildTasks(v("type"), v("start"), v("target")),
    };
    p.tasks.forEach((t) => { if (!t.milestone) t.owner = p.owner; });
    RD.projects.push(p);
    rdSave();
    rdAudit("สร้างโครงการ R&D", p.id, `${p.name} · ${RD_TYPES[p.type].name} · ${p.tasks.length} งาน · ${p.start} → ${p.target}`);
    bd.classList.remove("open");
    rdOpenId = p.id;
    renderRnd();
    showToast(`สร้าง ${p.id} แล้ว — ${p.tasks.length} งาน`, "good");
  });
  bd.classList.add("open");
  setTimeout(() => document.getElementById("rdp_name").focus(), 0);
}

/* ---- projects: one project ------------------------------------------------------ */

function renderRdProject(pane) {
  const p = RD.projects.find((x) => x.id === rdOpenId);
  if (!p) { rdOpenId = null; renderRdPortfolio(pane); return; }
  const can = rdCanEdit(p);
  const h = rdHealth(p);
  const prog = rdProgress(p);
  const late = (p.tasks || []).filter(rdTaskLate);
  const users = rdUsers();
  const phases = [];
  (p.tasks || []).forEach((t) => { if (!phases.includes(t.phase)) phases.push(t.phase); });
  const rows = [];
  phases.forEach((ph) => { rows.push({ phase: ph }); (p.tasks || []).filter((t) => t.phase === ph).forEach((t) => rows.push({ label: t.name, start: t.start, end: t.end, progress: Number(t.progress) || 0, milestone: t.milestone, late: rdTaskLate(t), tone: (Number(t.progress) || 0) >= 100 ? "good" : "info" })); });
  const refs = [p.ref].concat((p.tasks || []).map((t) => t.ref)).filter(Boolean).flatMap((r) => String(r).split(/[,\s]+/)).filter(Boolean);
  const linked = [];
  Object.keys(DEPT_DOCS).forEach((t) => (DEPT_DOCS[t] || []).forEach((d) => {
    if (refs.includes(d.no) || Object.values(d).some((v) => typeof v === "string" && v.includes(p.id))) linked.push(d);
  }));
  const daysLeft = bxDaysBetween(bxToday(), p.target);
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div>
          <button type="button" class="bx-link" id="rdBack">← ทุกโครงการ</button>
          <h3>${rdEsc(p.id)} ${rdEsc(p.name)} ${bxPill(h[0], h[1])}</h3>
          <p class="card-sub">${rdEsc((RD_TYPES[p.type] || {}).name || "")}${p.model ? ` · รุ่น ${rdEsc(p.model)}` : ""} · หัวหน้าโครงการ ${rdEsc(rdUserName(p.owner))} · ทีม ${(p.team || []).map(rdUserName).map(rdEsc).join(", ") || "—"}</p>
        </div>
        <div class="pilot-toolbar">
          ${can ? `<select id="rdStatus" aria-label="สถานะโครงการ">${RD_STATUSES.map((s) => `<option${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select>
          <button type="button" class="btn-secondary" id="rdEditInfo">แก้ไขข้อมูลโครงการ</button>` : ""}
        </div>
      </div>
      <div class="card-body">
        <div class="ov-mini">
          <div><span class="ov-mini-n">${prog}%</span><span class="ov-mini-l">ความคืบหน้า (ถ่วงตามระยะเวลางาน)</span></div>
          <div><span class="ov-mini-n">${daysLeft < 0 ? `เลย ${-daysLeft}` : daysLeft} วัน</span><span class="ov-mini-l">ถึงกำหนด ${formatThaiDate(p.target)}</span></div>
          <div><span class="ov-mini-n">${late.length}</span><span class="ov-mini-l">งานเลยกำหนด</span></div>
          <div><span class="ov-mini-n">${p.budget ? Number(p.budget).toLocaleString("th-TH") : "—"}</span><span class="ov-mini-l">งบประมาณ (บาท)</span></div>
        </div>
        ${p.goal ? `<p><strong>เป้าหมาย:</strong> ${rdEsc(p.goal)}</p>` : ""}
        ${rdGanttHtml(rows, p.start, p.target > (p.tasks || []).map((t) => t.end).sort().slice(-1)[0] ? p.target : (p.tasks || []).map((t) => t.end).sort().slice(-1)[0])}
      </div>
    </div>
    <div class="card">
      <div class="card-header card-header-actions"><div><h3>งานในโครงการ</h3><p class="card-sub">แก้ผู้รับผิดชอบ วันที่ และ % ได้ในตาราง — บันทึกทันที · "อ้างอิง" ใส่เลขเอกสาร (ECR, DWG, BOM, WI) เพื่อเชื่อมหลักฐาน</p></div>
        ${can ? `<button type="button" class="btn-secondary" id="rdAddTask">+ เพิ่มงาน</button>` : ""}</div>
      <div class="card-body table-scroll">
        <table class="data-table rd-tasks"><thead><tr><th>ขั้น</th><th>งาน</th><th>ผู้รับผิดชอบ</th><th>เริ่ม</th><th>เสร็จ</th><th>ความคืบหน้า</th><th>อ้างอิง</th>${can ? "<th></th>" : ""}</tr></thead>
        <tbody>${(p.tasks || []).map((t, i) => {
          const lateT = rdTaskLate(t);
          const dis = can ? "" : " disabled";
          return `<tr class="${(Number(t.progress) || 0) >= 100 ? "bx-done-row" : ""}">
            <td class="muted-inline">${rdEsc(t.phase)}</td>
            <td>${t.milestone ? "◆ " : ""}${can ? `<input class="bom-inline rd-in" data-i="${i}" data-k="name" value="${rdEsc(t.name)}" aria-label="ชื่องาน">` : rdEsc(t.name)}${lateT ? ` ${bxPill("เลยกำหนด", "critical")}` : ""}</td>
            <td><select class="bom-inline rd-in" data-i="${i}" data-k="owner" aria-label="ผู้รับผิดชอบ"${dis}><option value="">—</option>${users.map((u) => `<option value="${u.id}"${u.id === t.owner ? " selected" : ""}>${rdEsc(u.name)}</option>`).join("")}</select></td>
            <td><input type="date" class="bom-inline rd-in" data-i="${i}" data-k="start" value="${rdEsc(t.start)}" aria-label="เริ่ม"${dis}></td>
            <td><input type="date" class="bom-inline rd-in" data-i="${i}" data-k="end" value="${rdEsc(t.end)}" aria-label="เสร็จ"${dis}></td>
            <td><select class="bom-inline rd-in" data-i="${i}" data-k="progress" aria-label="ความคืบหน้า"${dis}>${(t.milestone ? [0, 100] : [0, 10, 25, 50, 75, 90, 100]).map((x) => `<option value="${x}"${Number(t.progress) === x ? " selected" : ""}>${t.milestone ? (x ? "ผ่านแล้ว" : "ยังไม่ถึง") : `${x}%`}</option>`).join("")}</select></td>
            <td>${can ? `<input class="bom-inline rd-in" data-i="${i}" data-k="ref" value="${rdEsc(t.ref || "")}" placeholder="เช่น DWG-2026-003" aria-label="อ้างอิง">` : rdEsc(t.ref || "")}</td>
            ${can ? `<td><button type="button" class="btn-chip" data-rddel="${i}">ลบ</button></td>` : ""}
          </tr>`;
        }).join("")}</tbody></table>
      </div>
    </div>
    <div class="card"><div class="card-header"><h3>เอกสารที่เชื่อมกับโครงการ (${linked.length})</h3><p class="card-sub">เอกสารที่ใส่ไว้ในช่องอ้างอิง หรือที่ระบุรหัสโครงการ ${rdEsc(p.id)} ในเนื้อหา</p></div>
      <div class="card-body">${linked.map((d) => `<button type="button" class="rel-chip" data-docno="${rdEsc(d.no)}">${rdEsc(d.no)} — ${rdEsc(String(d.title || "").slice(0, 40))} <span class="rel-status">(${rdEsc(d.status)})</span></button>`).join("") || '<span class="muted-inline">ยังไม่มี — ใส่เลขเอกสารในช่อง "อ้างอิง" ของงาน</span>'}
      ${can ? `<div class="pilot-toolbar rd-actions"><button type="button" class="btn-secondary" data-rdnew="ecr">+ เปิด ECR ของโครงการ</button><button type="button" class="btn-secondary" data-rdnew="dwg">+ ลงทะเบียนแบบ</button><button type="button" class="btn-secondary" data-rdnew="wi">+ WI</button></div>` : ""}</div></div>`;
  document.getElementById("rdBack").addEventListener("click", () => { rdOpenId = null; renderRnd(); });
  pane.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  if (!can) return;
  document.getElementById("rdStatus").addEventListener("change", (e) => {
    const before = p.status; p.status = e.target.value; rdSave();
    rdAudit("แก้ไขโครงการ R&D", p.id, `สถานะ: "${before}" → "${p.status}"`); renderRnd();
  });
  document.getElementById("rdEditInfo").addEventListener("click", () => rdEditProjectModal(p));
  pane.querySelectorAll(".rd-in").forEach((el) => el.addEventListener("change", () => {
    const t = p.tasks[Number(el.dataset.i)];
    const k = el.dataset.k;
    const before = t[k];
    t[k] = k === "progress" ? Number(el.value) : el.value.trim();
    if (k === "start" && t.milestone) t.end = t.start;
    if (k === "end" && t.end < t.start) t.start = t.end;
    if (k === "progress" && t[k] >= 100) t.doneAt = bxToday();
    rdSave();
    rdAudit("อัปเดตงานโครงการ R&D", p.id, `${t.name}: ${k === "progress" ? "ความคืบหน้า" : k === "owner" ? "ผู้รับผิดชอบ" : k === "start" ? "เริ่ม" : k === "end" ? "เสร็จ" : k === "ref" ? "อ้างอิง" : "ชื่อ"} "${k === "owner" ? rdUserName(before) : before ?? ""}" → "${k === "owner" ? rdUserName(t[k]) : t[k]}"`);
    renderRnd();
  }));
  pane.querySelectorAll("[data-rddel]").forEach((b) => b.addEventListener("click", () => {
    const t = p.tasks[Number(b.dataset.rddel)];
    if (!confirm(`ลบงาน "${t.name}"?`)) return;
    p.tasks.splice(Number(b.dataset.rddel), 1); rdSave();
    rdAudit("ลบงานโครงการ R&D", p.id, t.name); renderRnd();
  }));
  document.getElementById("rdAddTask").addEventListener("click", () => {
    const last = (p.tasks || []).slice(-1)[0];
    const phase = prompt("ขั้นตอน (ชื่อเฟส) ของงานใหม่", last ? last.phase : "งาน");
    if (phase === null) return;
    const s = last ? last.end : p.start;
    p.tasks.push({ id: `T${Date.now().toString(36)}`, phase: phase.trim() || "งาน", name: "งานใหม่", milestone: false, start: s, end: rdAddDays(s, 6), progress: 0, owner: p.owner, ref: "" });
    rdSave(); rdAudit("เพิ่มงานโครงการ R&D", p.id, phase); renderRnd();
  });
  pane.querySelectorAll("[data-rdnew]").forEach((b) => b.addEventListener("click", () => {
    const type = b.dataset.rdnew;
    openDeptModal(type, null);
    const set = (k, val) => { const el = document.getElementById(`deptField_${k}`); if (el && val) el.value = val; };
    if (MACHINE_MODELS.includes(p.model)) set("model", p.model);
    if (type === "ecr") { set("title", `[${p.id}] `); set("detail", `โครงการ ${p.id} ${p.name}`); }
    if (type === "dwg") set("title", `[${p.id}] `);
    if (type === "wi") set("title", `[${p.id}] `);
  }));
}

function rdEditProjectModal(p) {
  const users = rdUsers();
  document.getElementById("rdBody").innerHTML = `
    <h3>แก้ไขโครงการ ${rdEsc(p.id)}</h3>
    <div class="modal-grid">
      <div class="form-field"><label for="rde_name">ชื่อโครงการ</label><input id="rde_name" value="${rdEsc(p.name)}"></div>
      <div class="form-field"><label for="rde_model">รุ่น</label><input id="rde_model" value="${rdEsc(p.model || "")}"></div>
      <div class="form-field"><label for="rde_owner">หัวหน้าโครงการ</label><select id="rde_owner">${users.map((u) => `<option value="${u.id}"${u.id === p.owner ? " selected" : ""}>${rdEsc(u.name)}</option>`).join("")}</select></div>
      <div class="form-field"><label for="rde_target">กำหนดเสร็จ</label><input type="date" id="rde_target" value="${rdEsc(p.target)}"></div>
      <div class="form-field"><label for="rde_budget">งบประมาณ (บาท)</label><input type="number" id="rde_budget" value="${rdEsc(p.budget || "")}"></div>
      <div class="form-field"><label for="rde_ref">อ้างอิง</label><input id="rde_ref" value="${rdEsc(p.ref || "")}"></div>
    </div>
    <div class="form-field"><label for="rde_goal">เป้าหมาย / ขอบเขต</label><textarea id="rde_goal" rows="2">${rdEsc(p.goal || "")}</textarea></div>
    <div class="ue-section-title">ทีมงาน</div>
    <div class="vis-group">${users.map((u) => `<label class="vis-opt"><input type="checkbox" class="rde-team" value="${u.id}"${(p.team || []).includes(u.id) ? " checked" : ""}> ${rdEsc(u.name)}</label>`).join("")}</div>
    <div class="modal-actions">${["admin", "plant"].includes((rdUser() || {}).role) ? `<button type="button" class="btn-secondary" id="rde_del">ลบโครงการ</button>` : ""}<button type="button" class="btn-secondary" id="rde_cancel">ยกเลิก</button><button type="button" class="btn-primary" id="rde_save">บันทึก</button></div>`;
  const bd = document.getElementById("rdBackdrop");
  document.getElementById("rde_cancel").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("rde_save").addEventListener("click", () => {
    const v = (k) => document.getElementById(`rde_${k}`).value.trim();
    const before = Object.assign({}, p);
    Object.assign(p, { name: v("name") || p.name, model: v("model"), owner: v("owner"), target: v("target") || p.target, budget: Number(v("budget")) || 0, ref: v("ref"), goal: v("goal"), team: [...document.querySelectorAll(".rde-team:checked")].map((i) => i.value) });
    rdSave();
    rdAudit("แก้ไขโครงการ R&D", p.id, auditDiff(before, p, [{ key: "name", label: "ชื่อ" }, { key: "model", label: "รุ่น" }, { key: "target", label: "กำหนดเสร็จ" }, { key: "budget", label: "งบ" }, { key: "goal", label: "เป้าหมาย" }]) || "ทีมงาน/ผู้รับผิดชอบ");
    bd.classList.remove("open"); renderRnd();
  });
  const del = document.getElementById("rde_del");
  if (del) del.addEventListener("click", () => {
    if (!confirm(`ลบโครงการ ${p.id}? งานทั้งหมดในโครงการจะหายไป (ประวัติการใช้งานยังอยู่)`)) return;
    RD.projects = RD.projects.filter((x) => x !== p); rdSave();
    rdAudit("ลบโครงการ R&D", p.id, p.name); bd.classList.remove("open"); rdOpenId = null; renderRnd();
  });
  bd.classList.add("open");
}

/* ---- technical queries (TQ) ------------------------------------------------------- */

const RD_TQ_WAITING = ["ส่งคำถาม", "R&D กำลังพิจารณา"];
function rdTqOpen() { return (DEPT_DOCS.tq || []).filter((d) => RD_TQ_WAITING.includes(d.status) && (typeof authCanSeeDoc !== "function" || authCanSeeDoc("tq", d))); }
// Due: the asker's date, otherwise 1 day for "หยุดงานรอ", 3 days for the rest
function rdTqDue(d) { return d.need || rdAddDays(d.date || bxToday(), /ด่วนมาก/.test(d.priority || "") ? 1 : 3); }
function rdTqLate(d) { return RD_TQ_WAITING.includes(d.status) && bxToday() > rdTqDue(d); }
let rdTqFilter = "open";

function renderRdTq(pane) {
  const all = (DEPT_DOCS.tq || []).filter((d) => typeof authCanSeeDoc !== "function" || authCanSeeDoc("tq", d));
  const list = all.filter((d) => rdTqFilter === "all" || (rdTqFilter === "open" ? RD_TQ_WAITING.includes(d.status) : !RD_TQ_WAITING.includes(d.status)))
    .sort((a, b) => rdTqLate(b) - rdTqLate(a) || String(rdTqDue(a)).localeCompare(String(rdTqDue(b))));
  const answered = all.filter((d) => !RD_TQ_WAITING.includes(d.status) && d.answeredAt && d.date);
  const avg = answered.length ? answered.reduce((s, d) => s + Math.max(0, bxDaysBetween(d.date, d.answeredAt.slice(0, 10))), 0) / answered.length : null;
  const canAnswer = deptCanManage(currentRole(), "tq");
  const byFrom = {};
  all.forEach((d) => { const k = d.fromDept || "ไม่ระบุ"; byFrom[k] = (byFrom[k] || 0) + 1; });
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div><h3>คำถามทางเทคนิค (TQ) — ถามวิศวกรรม ได้คำตอบทันเวลา</h3><p class="card-sub">ทุกฝ่ายส่งคำถามได้ (ไลน์ผลิต QC จัดซื้อ คลัง ขาย/บริการ) · กำหนดตอบ = วันที่ผู้ถามต้องการ หรือ 1 วันถ้าหยุดงานรอ / 3 วันปกติ · ถ้าคำตอบต้องแก้แบบ กด "ต้องแก้แบบ" ระบบเปิด ECR ให้พร้อมอ้างอิง</p></div>
        <button type="button" class="btn-primary" id="rdNewTq">+ ส่งคำถาม (TQ)</button>
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <label for="rdTqFilter">แสดง:</label><select id="rdTqFilter">${[["open", "รอคำตอบ"], ["done", "ตอบ/ปิดแล้ว"], ["all", "ทั้งหมด"]].map(([v, t]) => `<option value="${v}"${v === rdTqFilter ? " selected" : ""}>${t}</option>`).join("")}</select>
          <span class="muted-inline">เวลาตอบเฉลี่ย ${avg === null ? "—" : `${bxFmt(avg)} วัน`} · ${Object.keys(byFrom).map((k) => `${rdEsc(k)} ${byFrom[k]}`).join(" · ")}</span>
        </div>
        <table class="data-table">
          <thead><tr><th>TQ</th><th>คำถาม</th><th>ชิ้นส่วน / รุ่น</th><th>จาก</th><th>อ้างอิง</th><th>ความเร่งด่วน</th><th>กำหนดตอบ</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${list.map((d) => {
            const late = rdTqLate(d);
            const due = rdTqDue(d);
            return `<tr>
              <td><button type="button" class="rel-chip" data-docno="${rdEsc(d.no)}">${rdEsc(d.no)}</button><div class="muted-inline">${d.date ? formatThaiDate(d.date) : ""}</div></td>
              <td>${rdEsc(d.title)}${d.answer ? `<div class="rd-answer">↳ ${rdEsc(d.answer)}${d.answeredBy ? ` <span class="muted-inline">— ${rdEsc(d.answeredBy)}</span>` : ""}</div>` : ""}</td>
              <td>${d.partCode ? `<span class="mono-cell">${rdEsc(d.partCode)}</span>` : ""}<div class="muted-inline">${rdEsc(d.model || "")}</div></td>
              <td>${rdEsc(d.fromDept || "")}<div class="muted-inline">${rdEsc(d.owner || "")}</div></td>
              <td class="muted-inline">${rdEsc(d.ref || "")}</td>
              <td>${/ด่วนมาก/.test(d.priority || "") ? bxPill("หยุดงานรอ", "critical") : rdEsc(d.priority || "")}</td>
              <td>${formatThaiDate(due)}${late ? ` ${bxPill(`เลย ${bxDaysBetween(due, bxToday())} วัน`, "critical")}` : ""}</td>
              <td>${bxStatusPill("tq", d.status)}</td>
              <td>${canAnswer && RD_TQ_WAITING.includes(d.status) ? `<button type="button" class="btn-chip" data-rdans="${rdEsc(d.no)}">ตอบ</button>` : ""}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="9" class="muted-inline">${rdTqFilter === "open" ? "✓ ไม่มีคำถามค้าง" : "ยังไม่มี TQ"}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("rdTqFilter").addEventListener("change", (e) => { rdTqFilter = e.target.value; renderRnd(); });
  document.getElementById("rdNewTq").addEventListener("click", () => {
    openDeptModal("tq", null);
    const me = rdUser();
    const set = (k, v) => { const el = document.getElementById(`deptField_${k}`); if (el && v) el.value = v; };
    set("date", bxToday());
    if (me) { set("owner", me.name); const map = { prod: "ฝ่ายผลิต", qc: "QC", pur: "จัดซื้อ", wh: "คลังสินค้า", sales: "ขาย / บริการ", plan: "วางแผน" }; set("fromDept", map[me.dept]); }
  });
  pane.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  pane.querySelectorAll("[data-rdans]").forEach((b) => b.addEventListener("click", () => rdAnswerTq(b.dataset.rdans)));
}

function rdAnswerTq(no) {
  const d = (DEPT_DOCS.tq || []).find((x) => x.no === no);
  if (!d) return;
  const me = rdUser();
  document.getElementById("rdBody").innerHTML = `
    <h3>ตอบ ${rdEsc(d.no)}</h3>
    <p class="card-sub">${rdEsc(d.title)}${d.partCode ? ` · ${rdEsc(d.partCode)}` : ""}${d.model ? ` · ${rdEsc(d.model)}` : ""} · ถามโดย ${rdEsc(d.owner || d.fromDept || "")}</p>
    ${d.detail ? `<p class="muted-note">${rdEsc(d.detail)}</p>` : ""}
    <div class="form-field"><label for="rdAnsText">คำตอบ *</label><textarea id="rdAnsText" rows="4" placeholder="เช่น ใช้ได้ ถ้าสเปก C3 และยี่ห้อที่ผ่านการอนุมัติ — แนบแบบ/เอกสารในใบ TQ ได้">${rdEsc(d.answer || "")}</textarea></div>
    <div class="form-field"><label for="rdAnsBy">ผู้ตอบ</label><input id="rdAnsBy" value="${rdEsc(d.answeredBy || (me ? me.name : ""))}"></div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="rdAnsCancel">ยกเลิก</button>
      <button type="button" class="btn-secondary" id="rdAnsWip">รับเรื่อง (กำลังพิจารณา)</button>
      <button type="button" class="btn-secondary" id="rdAnsEcr">ต้องแก้แบบ → เปิด ECR</button>
      <button type="button" class="btn-primary" id="rdAnsOk">ส่งคำตอบ</button>
    </div>`;
  const bd = document.getElementById("rdBackdrop");
  const finish = (status, needText) => {
    const text = document.getElementById("rdAnsText").value.trim();
    if (needText && !text) { document.getElementById("rdAnsText").focus(); return false; }
    const before = d.status;
    if (text) { d.answer = text; d.answeredBy = document.getElementById("rdAnsBy").value.trim(); d.answeredAt = new Date().toISOString(); }
    d.status = status;
    if (me && typeof stampRecord === "function") stampRecord(d, false);
    saveDeptDocs();
    rdAudit("แก้ไขเอกสาร", d.no, `สถานะ: "${before}" → "${status}"${text ? ` · คำตอบ: ${text.slice(0, 80)}` : ""}`);
    bd.classList.remove("open");
    if (typeof renderDept === "function") renderDept();
    renderRnd();
    return true;
  };
  document.getElementById("rdAnsCancel").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("rdAnsWip").addEventListener("click", () => finish("R&D กำลังพิจารณา", false));
  document.getElementById("rdAnsOk").addEventListener("click", () => { if (finish("ตอบแล้ว", true)) showToast(`ตอบ ${d.no} แล้ว`, "good"); });
  document.getElementById("rdAnsEcr").addEventListener("click", () => {
    if (!finish("ต้องแก้แบบ (เปิด ECR)", true)) return;
    openDeptModal("ecr", null);
    const set = (k, v) => { const el = document.getElementById(`deptField_${k}`); if (el && v) el.value = v; };
    set("title", `แก้แบบตาม ${d.no}: ${d.title}`);
    set("model", d.model);
    set("date", bxToday());
    set("detail", `จาก ${d.no} (${d.fromDept || ""}${d.ref ? ` · ${d.ref}` : ""})${d.partCode ? ` ชิ้นส่วน ${d.partCode}` : ""} — ${d.answer || ""}`);
  });
  bd.classList.add("open");
  setTimeout(() => document.getElementById("rdAnsText").focus(), 0);
}

/* ---- engineering changes --------------------------------------------------------- */

function rdChangeState(ecr) {
  const eos = (DEPT_DOCS.eo || []).filter((e) => e.ref === ecr.no && e.status !== "ยกเลิก");
  const nos = [ecr.no].concat(eos.map((e) => e.no));
  const mentions = (d) => nos.some((n) => Object.values(d).some((v) => typeof v === "string" && v.includes(n)));
  const bomRevs = [];
  nos.forEach((n) => (typeof bomRefsToDoc === "function" ? bomRefsToDoc(n) : []).forEach((r) => bomRevs.push(r)));
  const dwgs = (DEPT_DOCS.dwg || []).filter((d) => mentions(d) || eos.some((e) => String(e.parts || "").includes(d.no)));
  const wis = (DEPT_DOCS.wi || []).filter((d) => mentions(d));
  const needs = eos.map((e) => String(e.parts || "")).join(" ");
  const needBom = true; // every approved engineering change is expected to land in a BOM revision
  const needDwg = /DWG|แบบ/.test(needs) || dwgs.length > 0;
  const needWi = /WI/.test(needs) || wis.length > 0;
  const approved = ["อนุมัติ", "ปิดแล้ว"].includes(ecr.status);
  const steps = [
    { k: "ecr", label: "ECR อนุมัติ", ok: approved, info: ecr.status },
    { k: "eo", label: "ออก EO", ok: eos.some((e) => ["อนุมัติแล้ว", "แจ้งหน้างานแล้ว", "มีผลใช้งาน"].includes(e.status)), info: eos.map((e) => `${e.no} (${e.status})`).join(", ") || "ยังไม่มี" },
    { k: "bom", label: "BOM ออก Rev.", ok: bomRevs.length > 0, info: bomRevs.map((r) => `${r.model} Rev.${r.rev}`).join(", ") || (needBom ? "ยังไม่ปรับ" : "ไม่เกี่ยว"), skip: !needBom },
    { k: "dwg", label: "แบบ (DWG)", ok: dwgs.length > 0 && dwgs.every((d) => d.status === "อนุมัติ (Released)"), info: dwgs.map((d) => `${d.no} (${d.status})`).join(", ") || (needDwg ? "ยังไม่มี" : "ไม่เกี่ยว"), skip: !needDwg },
    { k: "wi", label: "WI", ok: wis.length > 0 && wis.every((d) => d.status === "อนุมัติใช้งาน"), info: wis.map((d) => `${d.no} (${d.status})`).join(", ") || (needWi ? "ยังไม่ปรับ" : "ไม่เกี่ยว"), skip: !needWi },
    { k: "floor", label: "แจ้งหน้างาน", ok: eos.some((e) => ["แจ้งหน้างานแล้ว", "มีผลใช้งาน"].includes(e.status)), info: eos.find((e) => e.effective) ? `มีผล ${eos.find((e) => e.effective).effective}` : "" },
  ];
  const pending = ecr.status === "ไม่อนุมัติ" ? [] : steps.filter((s) => !s.ok && !s.skip);
  return { ecr, eos, steps, pending, age: bxDaysBetween(ecr.date, bxToday()) };
}

function renderRdChanges(pane) {
  const all = (DEPT_DOCS.ecr || []).filter((d) => typeof authCanSeeDoc !== "function" || authCanSeeDoc("ecr", d)).map(rdChangeState)
    .filter((c) => rdChangeFilter === "all" || (rdChangeFilter === "open" ? c.pending.length : !c.pending.length))
    .sort((a, b) => b.pending.length - a.pending.length || String(b.ecr.date).localeCompare(String(a.ecr.date)));
  const canEo = deptCanCreate(currentRole(), "eo");
  const canBom = bomCanEdit(currentRole());
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div><h3>ติดตามการเปลี่ยนแปลงทางวิศวกรรม — ECR → EO → BOM → แบบ → WI → หน้างาน</h3><p class="card-sub">ระบบดูจากการอ้างอิงเลขที่เอกสารจริง (EO อ้าง ECR, ประวัติ BOM อ้าง EO/ECR, แบบและ WI ที่อ้างถึง) · ✓ = ทำแล้ว ○ = ยังค้าง — = ไม่เกี่ยวข้อง</p></div>
        ${deptCanCreate(currentRole(), "ecr") ? `<button type="button" class="btn-primary" id="rdNewEcr">+ เปิด ECR</button>` : ""}
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row"><label for="rdChgFilter">แสดง:</label><select id="rdChgFilter">${[["open", "ยังไม่ครบ"], ["done", "ครบแล้ว"], ["all", "ทั้งหมด"]].map(([v, t]) => `<option value="${v}"${v === rdChangeFilter ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <table class="data-table">
          <thead><tr><th>ECR</th><th>รุ่น</th><th class="num">อายุ</th>${all[0] ? all[0].steps.map((s) => `<th>${s.label}</th>`).join("") : "<th>ขั้นตอน</th>"}<th>ต่อไปต้องทำ</th></tr></thead>
          <tbody>${all.map((c) => {
            const next = c.pending[0];
            const act = !next ? "" : next.k === "eo" && canEo ? `<button type="button" class="btn-chip" data-rdeo="${rdEsc(c.ecr.no)}">+ ออก EO</button>`
              : next.k === "bom" && canBom && MACHINE_MODELS.includes(c.ecr.model) ? `<button type="button" class="btn-chip" data-rdrev="${rdEsc(c.ecr.no)}">ออก Rev. BOM ${rdEsc(c.ecr.model)}</button>`
              : next.k === "dwg" ? `<button type="button" class="btn-chip" data-rdgo="dwg">ไปที่ทะเบียนแบบ</button>`
              : next.k === "wi" ? `<button type="button" class="btn-chip" data-rdgo="wi">ไปที่ WI</button>` : "";
            return `<tr>
              <td><button type="button" class="rel-chip" data-docno="${rdEsc(c.ecr.no)}">${rdEsc(c.ecr.no)}</button><div>${rdEsc(c.ecr.title)}</div></td>
              <td>${rdEsc(c.ecr.model || "—")}</td><td class="num">${c.age} วัน</td>
              ${c.steps.map((s) => `<td class="rd-step ${s.skip ? "rd-skip" : s.ok ? "rd-ok" : "rd-no"}" title="${rdEsc(s.info)}">${s.skip ? "—" : s.ok ? "✓" : "○"}<div class="muted-inline">${rdEsc(String(s.info).slice(0, 36))}</div></td>`).join("")}
              <td>${next ? `<strong>${rdEsc(next.label)}</strong> ${act}` : bxPill("ครบทุกขั้น", "good")}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="10" class="muted-inline">ไม่มี ECR ตามตัวกรองนี้</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("rdChgFilter").addEventListener("change", (e) => { rdChangeFilter = e.target.value; renderRnd(); });
  const ne = document.getElementById("rdNewEcr");
  if (ne) ne.addEventListener("click", () => openDeptModal("ecr", null));
  pane.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  pane.querySelectorAll("[data-rdeo]").forEach((b) => b.addEventListener("click", () => {
    const ecr = DEPT_DOCS.ecr.find((d) => d.no === b.dataset.rdeo);
    openDeptModal("eo", null);
    const set = (k, v) => { const el = document.getElementById(`deptField_${k}`); if (el && v) el.value = v; };
    set("title", ecr.title); set("model", ecr.model); set("ref", ecr.no); set("parts", ecr.model ? `BOM ${ecr.model}` : "");
  }));
  pane.querySelectorAll("[data-rdrev]").forEach((b) => b.addEventListener("click", () => {
    const ecr = DEPT_DOCS.ecr.find((d) => d.no === b.dataset.rdrev);
    const eo = (DEPT_DOCS.eo || []).find((e) => e.ref === ecr.no);
    bomModel = ecr.model;
    openBomRevModal();
    const sel = document.getElementById("bomRevRef");
    if (sel) sel.value = eo ? eo.no : ecr.no;
    document.getElementById("bomRevNote").value = ecr.title;
  }));
  pane.querySelectorAll("[data-rdgo]").forEach((b) => b.addEventListener("click", () => { deptCurrent = "rnd"; deptDocType = b.dataset.rdgo; switchView("dept"); }));
}

/* ---- BOM comparison -------------------------------------------------------------- */

function rdBomLines(model, rev) {
  const meta = BOM_META[model] || {};
  if (!rev || rev === meta.rev) return MASTER_BOM[model] || [];
  return ((meta.snapshots || {})[rev] || {}).lines || [];
}
function rdPerMachine(lines) {
  // same numbering/quantity logic as the live tree, on any list of lines
  const saved = MASTER_BOM.__cmp;
  MASTER_BOM.__cmp = lines;
  const rows = bxTree("__cmp").filter((r) => r.line);
  if (saved === undefined) delete MASTER_BOM.__cmp; else MASTER_BOM.__cmp = saved;
  const out = {};
  rows.forEach((r) => { const k = bxKey(r.line); if (!k) return; const o = out[k] = out[k] || { key: k, line: r.line, no: r.no, per: 0 }; o.per += r.per; });
  return out;
}
function rdCost(key) { const p = RD.parts[key]; return p && Number(p.cost) ? Number(p.cost) : null; }

function renderRdCompare(pane) {
  if (!rdCmp.a) rdCmp.a = MACHINE_MODELS[0] || "";
  if (!rdCmp.b) rdCmp.b = MACHINE_MODELS[1] || MACHINE_MODELS[0] || "";
  const revs = (m) => {
    const meta = BOM_META[m] || {};
    const list = Object.keys(meta.snapshots || {});
    if (!list.includes(meta.rev)) list.push(meta.rev);
    return list;
  };
  if (!revs(rdCmp.a).includes(rdCmp.ar)) rdCmp.ar = (BOM_META[rdCmp.a] || {}).rev || "";
  if (!revs(rdCmp.b).includes(rdCmp.br)) rdCmp.br = (BOM_META[rdCmp.b] || {}).rev || "";
  const A = rdPerMachine(rdBomLines(rdCmp.a, rdCmp.ar));
  const B = rdPerMachine(rdBomLines(rdCmp.b, rdCmp.br));
  const keys = [...new Set(Object.keys(A).concat(Object.keys(B)))];
  const rows = keys.map((k) => {
    const a = A[k], b = B[k];
    const st = !a ? "added" : !b ? "removed" : a.per !== b.per ? "changed" : (a.line.part !== b.line.part || (a.line.source || "") !== (b.line.source || "")) ? "changed" : "same";
    const c = rdCost(k);
    return { k, a, b, st, cost: c, diff: c === null ? null : ((b ? b.per : 0) - (a ? a.per : 0)) * c };
  }).sort((x, y) => ["removed", "added", "changed", "same"].indexOf(x.st) - ["removed", "added", "changed", "same"].indexOf(y.st) || x.k.localeCompare(y.k));
  const count = (s) => rows.filter((r) => r.st === s).length;
  const totalA = rows.reduce((s, r) => s + (r.cost !== null && r.a ? r.cost * r.a.per : 0), 0);
  const totalB = rows.reduce((s, r) => s + (r.cost !== null && r.b ? r.cost * r.b.per : 0), 0);
  const priced = rows.filter((r) => r.cost !== null).length;
  const label = { added: ["เพิ่มใน B", "good"], removed: ["ไม่มีใน B", "critical"], changed: ["เปลี่ยน", "warning"], same: ["เหมือนกัน", "neutral"] };
  const sel = (id, list, cur) => `<select id="${id}">${list.map((x) => `<option${x === cur ? " selected" : ""}>${rdEsc(x)}</option>`).join("")}</select>`;
  pane.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>เปรียบเทียบ BOM — ระหว่างรุ่น หรือระหว่าง Revision</h3><p class="card-sub">เทียบจำนวนต่อคันของทุกชิ้นส่วน (รวมชิ้นย่อย) · Revision เก่าดูได้เมื่อระบบเก็บสำเนาไว้แล้ว (เก็บให้อัตโนมัติทุกครั้งที่อนุมัติหรือออก Rev. ใหม่) · ต้นทุนใช้ราคาในแท็บคลังชิ้นส่วน</p></div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <strong>A:</strong> ${sel("rdCa", MACHINE_MODELS, rdCmp.a)} Rev. ${sel("rdCar", revs(rdCmp.a), rdCmp.ar)}
          <strong>B:</strong> ${sel("rdCb", MACHINE_MODELS, rdCmp.b)} Rev. ${sel("rdCbr", revs(rdCmp.b), rdCmp.br)}
          <label class="vis-opt"><input type="checkbox" id="rdCsame"${rdCmp.showSame ? " checked" : ""}> แสดงรายการที่เหมือนกัน</label>
        </div>
        <div class="ov-mini">
          <div><span class="ov-mini-n">${count("added")}</span><span class="ov-mini-l">มีเฉพาะใน B</span></div>
          <div><span class="ov-mini-n">${count("removed")}</span><span class="ov-mini-l">มีเฉพาะใน A</span></div>
          <div><span class="ov-mini-n">${count("changed")}</span><span class="ov-mini-l">จำนวน/ข้อมูลต่างกัน</span></div>
          <div><span class="ov-mini-n">${priced ? `${(totalB - totalA >= 0 ? "+" : "")}${Math.round(totalB - totalA).toLocaleString("th-TH")}` : "—"}</span><span class="ov-mini-l">ต้นทุนวัสดุ B − A (บาท/คัน)${priced < rows.length ? ` · มีราคา ${priced}/${rows.length}` : ""}</span></div>
        </div>
        <table class="data-table">
          <thead><tr><th>ผล</th><th>รหัส</th><th>ชิ้นส่วน</th><th class="num">A ต่อคัน</th><th class="num">B ต่อคัน</th><th class="num">ราคา/หน่วย</th><th class="num">ต้นทุนต่าง</th></tr></thead>
          <tbody>${rows.filter((r) => rdCmp.showSame || r.st !== "same").map((r) => `<tr>
            <td>${bxPill(label[r.st][0], label[r.st][1])}</td><td class="mono-cell">${rdEsc(r.k)}</td><td>${rdEsc((r.b || r.a).line.part)}</td>
            <td class="num">${r.a ? bxFmt(r.a.per) : "—"}</td><td class="num">${r.b ? bxFmt(r.b.per) : "—"}</td>
            <td class="num">${r.cost === null ? "—" : r.cost.toLocaleString("th-TH")}</td>
            <td class="num">${r.diff === null || !r.diff ? "—" : `<span class="${r.diff > 0 ? "bx-neg" : ""}">${r.diff > 0 ? "+" : ""}${Math.round(r.diff).toLocaleString("th-TH")}</span>`}</td></tr>`).join("") || `<tr><td colspan="7" class="muted-inline">ไม่มีความแตกต่าง</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  const on = (id, k) => document.getElementById(id).addEventListener("change", (e) => { rdCmp[k] = e.target.value; if (k === "a") rdCmp.ar = ""; if (k === "b") rdCmp.br = ""; renderRnd(); });
  on("rdCa", "a"); on("rdCar", "ar"); on("rdCb", "b"); on("rdCbr", "br");
  document.getElementById("rdCsame").addEventListener("change", (e) => { rdCmp.showSame = e.target.checked; renderRnd(); });
}

/* ---- part library ------------------------------------------------------------------ */

function rdNextPartCode(prefix, parent) {
  const codes = new Set(bxAllParts().map((p) => p.line.code).filter(Boolean).concat(Object.keys(RD.parts)));
  if (parent) { for (let i = 1; i < 100; i++) { const c = `${parent}-${String(i).padStart(2, "0")}`; if (!codes.has(c)) return c; } }
  const nums = [...codes].map((c) => new RegExp(`^${prefix}-(\\d{4})$`).exec(c)).filter(Boolean).map((m) => Number(m[1]));
  const base = { FR: 4000, BL: 1000, GR: 2000, CV: 5000, HY: 3000, EL: 6000 }[prefix] || 7000;
  return `${prefix}-${String((nums.length ? Math.max(...nums) : base) + 1).padStart(4, "0")}`;
}

function rdRollup(model) {
  const need = bxRequirement(model, 1);
  let cost = 0, weight = 0, priced = 0, weighed = 0;
  const n = Object.keys(need).length;
  Object.values(need).forEach((x) => {
    const p = RD.parts[x.key] || {};
    if (Number(p.cost)) { cost += Number(p.cost) * x.per; priced++; }
    if (Number(p.weight)) { weight += Number(p.weight) * x.per; weighed++; }
  });
  return { cost, weight, priced, weighed, n };
}

function renderRdParts(pane) {
  const can = rdCanCreate();
  const q = rdPartSearch.trim().toLowerCase();
  const parts = bxAllParts().filter((p) => p.line.code || p.key);
  // codes that exist only in the drawing register or the part library also belong here
  const have = new Set(parts.map((p) => p.key));
  (DEPT_DOCS.dwg || []).filter((d) => d.partCode && d.status !== "ยกเลิก").forEach((d) => {
    const k = typeof pcPartNo === "function" ? pcPartNo(d.partCode) : d.partCode;
    if (!have.has(k)) { have.add(k); parts.push({ key: k, line: { code: k, part: d.title || "", source: "" }, models: d.model ? [d.model] : [] }); }
  });
  Object.keys(RD.parts).forEach((k) => { if (!have.has(k)) { have.add(k); parts.push({ key: k, line: { code: k, part: RD.parts[k].name || "", source: "" }, models: [] }); } });
  const byName = {};
  parts.forEach((p) => { const n = bxShortName(p.line.part); if (n) (byName[n] = byName[n] || []).push(p.key); });
  const suppliersOf = (code) => (typeof SUPPLIER_LIST !== "undefined" ? SUPPLIER_LIST : []).filter((s) => String(s.parts || "").split(/[,\s]+/).includes(code)).map((s) => s.name);
  const list = parts.filter((p) => { const pc = typeof pcParse === "function" ? pcParse(p.key) : null; return !q || [p.key, p.line.part, (RD.parts[p.key] || {}).material, pc && pc.groupLabel, pc && `${pc.type} ${pc.typeName}`].some((v) => String(v || "").toLowerCase().includes(q)); })
    .sort((a, b) => a.key.localeCompare(b.key));
  const std = pcStd();
  const prefixes = ["FR", "BL", "GR", "CV", "HY", "EL"];
  pane.innerHTML = `
    <div class="p2p-stack">
      <div class="card">
        <div class="card-header"><h3>ต้นทุนวัสดุ & น้ำหนักต่อคัน (Roll-up)</h3><p class="card-sub">รวมจากชิ้นที่เบิกได้ (ชิ้นย่อย) × จำนวนต่อคัน × ราคา/น้ำหนักในตารางด้านล่าง</p></div>
        <div class="card-body table-scroll"><table class="data-table"><thead><tr><th>รุ่น</th><th>Rev.</th><th class="num">ต้นทุนวัสดุ/คัน</th><th class="num">น้ำหนัก/คัน</th><th>ข้อมูลครบ</th></tr></thead>
          <tbody>${MACHINE_MODELS.map((m) => { const r = rdRollup(m); return `<tr><td>${rdEsc(m)}</td><td>${rdEsc((BOM_META[m] || {}).rev || "")}</td><td class="num">${r.priced ? `${Math.round(r.cost).toLocaleString("th-TH")} บาท` : "—"}</td><td class="num">${r.weighed ? `${bxFmt(r.weight)} กก.` : "—"}</td><td><div class="bx-bar"><span style="width:${r.n ? (r.priced / r.n) * 100 : 0}%"></span></div> <span class="muted-inline">ราคา ${r.priced}/${r.n}</span></td></tr>`; }).join("")}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>สร้างรหัสชิ้นส่วนตามมาตรฐาน (Code R_D Rev.03)</h3><p class="card-sub">รหัสรถ + Item 2 หลัก + Work/Type + 1 (ชิ้นงานใหม่) + P/N 4 หลัก + "-E/O" + "-Rev." เช่น K13A06552-00-01 · P/N นับต่อ แบรนด์ + Item + ประเภท ไม่ออกเลขซ้ำกับรหัสที่มีในระบบ</p></div>
        <div class="card-body">
          <div class="filter-row">
            <label for="rdStdBrand">รหัสรถ:</label><select id="rdStdBrand">${std.brands.map((b) => `<option value="${rdEsc(b[0])}">${rdEsc(b[0])} | ${rdEsc(b[1])}</option>`).join("")}</select>
            <label for="rdStdGroup">Item:</label><select id="rdStdGroup">${std.groups.map((g) => `<option value="${rdEsc(g[0])}">${rdEsc(g[0])} | ${rdEsc(g[1])}</option>`).join("")}</select>
            <label for="rdStdType">ประเภท:</label><select id="rdStdType">${std.types.map((t) => `<option value="${rdEsc(t[0])}">${rdEsc(t[0])} | ${rdEsc(t[1])}</option>`).join("")}</select>
            <button type="button" class="btn-primary" id="rdStdGen">ออกรหัสใหม่</button>
            <strong class="mono-cell" id="rdStdOut"></strong>
          </div>
          <div class="filter-row">
            <label for="rdRevIn">จากรหัส:</label><input id="rdRevIn" class="wo-search" placeholder="เช่น K13A06552-00-01"><button type="button" class="btn-secondary" id="rdRevGen">Rev. ถัดไป</button><button type="button" class="btn-secondary" id="rdEoGen">E/O ถัดไป</button><strong class="mono-cell" id="rdRevOut"></strong>
          </div>
          <details class="rd-legacy"><summary>รหัสแบบเดิม (FR / GR / …)</summary>
            <div class="filter-row">
              <label for="rdPfx">หมวด:</label><select id="rdPfx">${prefixes.map((x) => `<option value="${x}">${x} — ${rdEsc(BOM_GROUP_BY_PREFIX[x])}</option>`).join("")}</select>
              <label for="rdPar">หรือชิ้นย่อยของ:</label><input id="rdPar" list="rdParList" placeholder="รหัสชุดแม่"><datalist id="rdParList">${parts.filter((p) => p.line.code).map((p) => `<option value="${rdEsc(p.line.code)}">${rdEsc(p.line.part)}</option>`).join("")}</datalist>
              <button type="button" class="btn-secondary" id="rdGen">สร้างรหัส</button><strong class="mono-cell" id="rdGenOut"></strong>
            </div>
          </details>
        </div>
      </div>
    </div>
    <div class="p2p-stack">
      <div class="card">
        <div class="card-header"><h3>นำเข้ารายชื่อไฟล์แบบ (Drawing)</h3><p class="card-sub">วางรายชื่อไฟล์ (เช่น K01W05269-00-00.idw บรรทัดละไฟล์) หรือเลือกโฟลเดอร์แบบ — ระบบอ่านเฉพาะชื่อไฟล์ ไม่อัปโหลดไฟล์ · ลงทะเบียนแบบให้ทุกชิ้นพร้อม Rev. จากชื่อไฟล์ (ถ้ามีหลาย Rev. ใช้ Rev. ล่าสุด)</p></div>
        <div class="card-body">
          <textarea id="rdDwgNames" rows="5" class="rd-names" placeholder="K01W05269-00-00.idw&#10;K01S10238-00-01.idw"></textarea>
          <div class="filter-row">
            <label class="btn-secondary rd-file-btn">เลือกโฟลเดอร์แบบ<input type="file" id="rdDwgFolder" webkitdirectory multiple hidden></label>
            <label class="btn-secondary rd-file-btn">เลือกไฟล์<input type="file" id="rdDwgFiles" multiple hidden></label>
            <label for="rdDwgStatus">สถานะ:</label><select id="rdDwgStatus"><option>อนุมัติ (Released)</option><option>รอตรวจแบบ</option><option>กำลังออกแบบ</option></select>
            <label for="rdDwgModel">รุ่น:</label><select id="rdDwgModel"><option value="">—</option>${MACHINE_MODELS.map((m) => `<option>${rdEsc(m)}</option>`).join("")}</select>
            <button type="button" class="btn-secondary" id="rdDwgPreview">ตรวจรายชื่อ</button>
          </div>
          <div id="rdDwgResult"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>มาตรฐานรหัส — แบรนด์ Item และประเภท</h3><p class="card-sub">แก้ไขหรือเพิ่มได้ (บรรทัดละรายการ รูปแบบ "รหัส | ชื่อ") มีผลกับการอ่านรหัส การจัดกลุ่ม BOM และการออกรหัสทั้งระบบ</p></div>
        <div class="card-body">
          <div class="modal-grid">
            <div class="form-field"><label for="rdStdBrands">รหัสรถ / แบรนด์ (1 ตัวอักษร)</label><textarea id="rdStdBrands" rows="4"${can ? "" : " disabled"}>${rdEsc(std.brands.map((b) => `${b[0]} | ${b[1]}`).join("\n"))}</textarea></div>
            <div class="form-field"><label>อ้างอิง</label><div class="muted-inline">ตามเอกสาร P CODE › Code R_D_Rev.03 — ชิ้นส่วนมาตรฐานใช้ P'Code (P1–P7) และรหัสน็อต/สกรู เช่น PHB05-020B-1 ระบบอ่านให้อัตโนมัติ</div></div>
            <div class="form-field"><label for="rdStdGroups">กลุ่ม (2 หลัก)</label><textarea id="rdStdGroups" rows="8"${can ? "" : " disabled"}>${rdEsc(std.groups.map((g) => `${g[0]} | ${g[1]}`).join("\n"))}</textarea></div>
            <div class="form-field"><label for="rdStdTypes">ประเภท (1 ตัวอักษร)</label><textarea id="rdStdTypes" rows="8"${can ? "" : " disabled"}>${rdEsc(std.types.map((t) => `${t[0]} | ${t[1]}`).join("\n"))}</textarea></div>
          </div>
          ${can ? `<div class="modal-actions"><button type="button" class="btn-secondary" id="rdStdReset">คืนค่ามาตรฐานตั้งต้น</button><button type="button" class="btn-primary" id="rdStdSave">บันทึกมาตรฐาน</button></div>` : ""}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>คลังชิ้นส่วน (Part Library)</h3><p class="card-sub">ทุกรหัสจาก BOM ทุกรุ่น · ใส่ราคา น้ำหนัก วัสดุ เพื่อใช้คำนวณต้นทุน/เปรียบเทียบ · ธงเตือน: ชิ้นผลิตเองที่ไม่มีแบบ, ชื่อเดียวกันหลายรหัส</p></div>
      <div class="card-body table-scroll">
        <div class="filter-row"><label for="rdPartQ">ค้นหา:</label><input type="text" id="rdPartQ" class="wo-search" placeholder="รหัส / ชื่อ / วัสดุ" value="${rdEsc(rdPartSearch)}"></div>
        <table class="data-table">
          <thead><tr><th>รหัส</th><th>กลุ่ม / ประเภท</th><th>ชื่อ</th><th>ใช้ในรุ่น</th><th>ทำ/ซื้อ</th><th>แบบ</th><th>ผู้ขาย</th><th class="num">ราคา/หน่วย</th><th class="num">น้ำหนัก (กก.)</th><th>วัสดุ / สเปก</th><th>ธง</th></tr></thead>
          <tbody>${list.map((p) => {
            const m = RD.parts[p.key] || {};
            const dw = p.line.code ? drawingForPart(p.line.code) : null;
            const flags = [];
            if (p.line.source === "ผลิตเอง" && !dw) flags.push(bxPill("ไม่มีแบบ", "warning"));
            const n = bxShortName(p.line.part);
            if (n && (byName[n] || []).length > 1) flags.push(bxPill(`ชื่อซ้ำ ${byName[n].length} รหัส`, "info"));
            const inp = (k, v, num) => can ? `<input class="bom-inline rd-part" data-key="${rdEsc(p.key)}" data-k="${k}"${num ? ' type="number" step="any" min="0"' : ""} value="${rdEsc(v ?? "")}" aria-label="${k} ${rdEsc(p.key)}">` : rdEsc(v ?? "—");
            return `<tr><td class="mono-cell"><button type="button" class="bx-link" data-rdpart="${rdEsc(p.key)}" data-model="${rdEsc(p.models[0] || "")}">${rdEsc(p.key)}</button></td>
              <td>${typeof pcChips === "function" ? pcChips(p.key) || '<span class="muted-inline">ไม่ตรงมาตรฐาน</span>' : ""}</td>
              <td>${can && !p.models.length ? `<input class="bom-inline rd-part" data-key="${rdEsc(p.key)}" data-k="name" value="${rdEsc(p.line.part)}" placeholder="ชื่อชิ้นส่วน" aria-label="ชื่อ ${rdEsc(p.key)}">` : rdEsc(p.line.part)}</td><td class="muted-inline">${rdEsc(p.models.join(", "))}</td><td>${rdEsc(p.line.source || "—")}</td>
              <td>${p.line.code ? bomDrawingCell(p.line) : "—"}</td><td class="muted-inline">${rdEsc(suppliersOf(p.key).join(", "))}</td>
              <td class="num">${inp("cost", m.cost, true)}</td><td class="num">${inp("weight", m.weight, true)}</td><td>${inp("material", m.material)}</td><td>${flags.join(" ")}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </div>`;
  const copy = (code, msg) => { if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => showToast(msg, "good"), () => {}); };
  document.getElementById("rdStdGen").addEventListener("click", () => {
    const code = pcNext(document.getElementById("rdStdBrand").value, document.getElementById("rdStdGroup").value, document.getElementById("rdStdType").value);
    document.getElementById("rdStdOut").textContent = code;
    copy(code, `คัดลอก ${code} แล้ว — ใช้ตอนเพิ่มรายการใน BOM`);
  });
  document.getElementById("rdRevGen").addEventListener("click", () => {
    const n = pcNextRev(document.getElementById("rdRevIn").value.trim());
    document.getElementById("rdRevOut").textContent = n || "รหัสไม่ตรงมาตรฐาน";
    if (n) copy(n, `คัดลอก ${n} แล้ว`);
  });
  document.getElementById("rdEoGen").addEventListener("click", () => {
    const n = pcNextEo(document.getElementById("rdRevIn").value.trim());
    document.getElementById("rdRevOut").textContent = n || "รหัสไม่ตรงมาตรฐาน";
    if (n) copy(n, `คัดลอก ${n} แล้ว — ใช้เมื่อออก EO เปลี่ยนชิ้นงาน`);
  });
  const dwgNames = [];
  const addFiles = (fl) => { [...fl].forEach((f) => dwgNames.push(f.name)); const ta = document.getElementById("rdDwgNames"); ta.value = (ta.value ? ta.value + "\n" : "") + [...fl].map((f) => f.name).join("\n"); rdDwgPreview(); };
  document.getElementById("rdDwgFolder").addEventListener("change", (e) => addFiles(e.target.files));
  document.getElementById("rdDwgFiles").addEventListener("change", (e) => addFiles(e.target.files));
  document.getElementById("rdDwgPreview").addEventListener("click", rdDwgPreview);
  if (document.getElementById("rdStdSave")) {
    const readList = (id, keyRe) => document.getElementById(id).value.split(/\n/).map((x) => x.split("|").map((y) => y.trim())).filter((x) => x[0] && keyRe.test(x[0])).map((x) => [x[0].toUpperCase(), x[1] || ""]);
    document.getElementById("rdStdSave").addEventListener("click", () => {
      const groups = readList("rdStdGroups", /^\d{2}$/), types = readList("rdStdTypes", /^[A-Za-z]$/), brands = readList("rdStdBrands", /^[A-Za-z]$/);
      if (!groups.length || !types.length || !brands.length) { showToast("ต้องมีอย่างน้อย 1 แบรนด์ 1 Item และ 1 ประเภท", "warn"); return; }
      RD.codeStd = { brands, groups, types };
      rdSave();
      rdAudit("แก้มาตรฐานรหัสชิ้นส่วน", "มาตรฐานรหัส", `${brands.map((b) => b[0]).join("/")} · ${groups.length} Item · ${types.length} ประเภท`);
      renderRnd();
      showToast("บันทึกมาตรฐานรหัสแล้ว", "good");
    });
    document.getElementById("rdStdReset").addEventListener("click", () => {
      if (!confirm("คืนค่ามาตรฐานรหัสเป็นค่าตั้งต้น?")) return;
      RD.codeStd = null; rdSave(); rdAudit("แก้มาตรฐานรหัสชิ้นส่วน", "มาตรฐานรหัส", "คืนค่าตั้งต้น"); renderRnd();
    });
  }
  document.getElementById("rdGen").addEventListener("click", () => {
    const code = rdNextPartCode(document.getElementById("rdPfx").value, document.getElementById("rdPar").value.trim());
    document.getElementById("rdGenOut").textContent = code;
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => showToast(`คัดลอก ${code} แล้ว — ใช้ตอนเพิ่มรายการใน BOM`, "good"), () => {});
  });
  document.getElementById("rdPartQ").addEventListener("input", (e) => {
    rdPartSearch = e.target.value; const pos = e.target.selectionStart; renderRnd();
    const el = document.getElementById("rdPartQ"); el.focus(); el.setSelectionRange(pos, pos);
  });
  pane.querySelectorAll(".rd-part").forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.key, f = el.dataset.k;
    const rec = RD.parts[k] = RD.parts[k] || {};
    const before = rec[f];
    rec[f] = f === "material" || f === "name" ? el.value.trim() : Number(el.value) || 0;
    rdSave();
    rdAudit("แก้ข้อมูลชิ้นส่วน", k, `${f === "cost" ? "ราคา" : f === "weight" ? "น้ำหนัก" : f === "name" ? "ชื่อ" : "วัสดุ"}: "${before ?? ""}" → "${rec[f]}"`);
    renderRdStats();
  }));
  wireDrawingChips(pane);
  pane.querySelectorAll("[data-rdpart]").forEach((b) => b.addEventListener("click", () => {
    if (!b.dataset.model) return;
    bxModel = b.dataset.model; bxDetailKey = b.dataset.rdpart; bxTab = "tree"; switchView("bomx");
  }));
}

/* ---- bulk drawing registration from file names ------------------------------------------ */

let rdDwgPlan = [];
function rdDwgPreview() {
  const box = document.getElementById("rdDwgResult");
  const names = document.getElementById("rdDwgNames").value.split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (!names.length) { box.innerHTML = '<p class="muted-inline">ยังไม่มีรายชื่อไฟล์</p>'; rdDwgPlan = []; return; }
  const res = pcParseFileNames(names);
  const bomName = (partNo) => { let n = ""; MACHINE_MODELS.some((m) => (MASTER_BOM[m] || []).some((l) => { if (l.code && pcPartNo(l.code) === partNo) { n = l.part; return true; } return false; })); return n; };
  rdDwgPlan = res.rows.map((r) => {
    const existing = (DEPT_DOCS.dwg || []).filter((d) => d.partCode && pcPartNo(d.partCode) === r.p.partNo && d.status !== "ยกเลิก");
    const top = existing.sort((a, b) => String(b.rev).localeCompare(String(a.rev)))[0];
    const state = !top ? "new" : String(top.rev) === r.rev ? "same" : String(r.rev) > String(top.rev) ? "newer" : "older";
    return Object.assign(r, { state, top, name: bomName(r.p.partNo) || (RD.parts[r.p.partNo] || {}).name || "" });
  });
  const lbl = { new: ["ใหม่", "good"], newer: ["Rev. ใหม่กว่าที่มี", "info"], same: ["มีแล้ว (ข้าม)", "neutral"], older: ["เก่ากว่าที่มี (ข้าม)", "warning"] };
  const add = rdDwgPlan.filter((r) => r.state === "new" || r.state === "newer").length;
  box.innerHTML = `
    <p class="muted-inline">อ่าน ${res.total} ชื่อ · ตรงมาตรฐาน ${res.rows.length} ชิ้น · จะลงทะเบียน ${add} แบบ${res.bad.length ? ` · ไม่ตรงมาตรฐาน ${res.bad.length}: ${rdEsc(res.bad.slice(0, 5).join(", "))}${res.bad.length > 5 ? " …" : ""}` : ""}</p>
    <div class="table-scroll rd-dwg-scroll"><table class="data-table"><thead><tr><th>ไฟล์</th><th>Part No.</th><th>กลุ่ม / ประเภท</th><th>Rev.</th><th>ชื่อใน BOM</th><th>ผล</th></tr></thead>
      <tbody>${rdDwgPlan.map((r) => `<tr><td class="muted-inline">${rdEsc(r.file)}</td><td class="mono-cell">${rdEsc(r.p.partNo)}</td><td>${pcChips(r.p.partNo)}</td><td>${rdEsc(r.rev)}</td><td>${rdEsc(r.name || "—")}</td><td>${bxPill(lbl[r.state][0], lbl[r.state][1])}</td></tr>`).join("")}</tbody></table></div>
    ${add && rdCanCreate() ? `<div class="modal-actions"><button type="button" class="btn-primary" id="rdDwgImport">ลงทะเบียน ${add} แบบ</button></div>` : ""}`;
  const b = document.getElementById("rdDwgImport");
  if (b) b.addEventListener("click", rdDwgImport);
}

function rdDwgImport() {
  const status = document.getElementById("rdDwgStatus").value;
  const model = document.getElementById("rdDwgModel").value;
  const me = rdUser();
  const created = [];
  rdDwgPlan.filter((r) => r.state === "new" || r.state === "newer").forEach((r) => {
    const doc = {
      no: deptNextNumber("dwg"), status, title: r.name || `${r.p.typeName || r.p.type} ${r.p.partNo}`, partCode: r.p.partNo, model,
      rev: r.rev, owner: me ? me.name : "", date: bxToday(), link: r.file, files: [],
    };
    if (me) stampRecord(doc, true);
    DEPT_DOCS.dwg = DEPT_DOCS.dwg || [];
    DEPT_DOCS.dwg.push(doc);
    if (!RD.parts[r.p.partNo]) RD.parts[r.p.partNo] = r.name ? {} : { name: "" };
    created.push(`${doc.no} ${r.p.partNo} Rev.${r.rev}`);
  });
  saveDeptDocs();
  rdSave();
  rdAudit("ลงทะเบียนแบบจากรายชื่อไฟล์", `${created.length} แบบ`, created.slice(0, 20).join(", ") + (created.length > 20 ? " …" : ""));
  if (typeof renderDept === "function") renderDept();
  document.getElementById("rdDwgNames").value = "";
  rdDwgPlan = [];
  renderRnd();
  showToast(`ลงทะเบียนแบบแล้ว ${created.length} รายการ`, "good");
}

/* ---- field feedback ------------------------------------------------------------------ */

function renderRdFeedback(pane) {
  const agg = {};
  const bump = (key, part, kind, ref, w) => {
    const a = agg[key] = agg[key] || { key, part, ncr: new Set(), claim: new Set(), svc: 0, cc: new Set(), score: 0, models: new Set() };
    if (kind === "ncr") a.ncr.add(ref); if (kind === "claim") a.claim.add(ref); if (kind === "cc") a.cc.add(ref); if (kind === "svc") a.svc += w;
    a.score += kind === "svc" ? w : 3;
  };
  const parts = bxAllParts().filter((p) => p.line.code);
  parts.forEach((p) => {
    const re = bxCodeRegex(p.line.code);
    const name = bxShortName(p.line.part);
    const hit = (d) => Object.keys(d).some((k) => !["items", "files", "log", "visibility"].includes(k) && ((re.test(String(d[k] ?? ""))) || (name && ["title", "detail"].includes(k) && String(d[k] ?? "").includes(name))));
    (DEPT_DOCS.ncr || []).filter(hit).forEach((d) => { bump(p.key, p.line.part, "ncr", d.no); if (d.model) agg[p.key].models.add(d.model); });
    (DEPT_DOCS.cc || []).filter(hit).forEach((d) => { bump(p.key, p.line.part, "cc", d.no); if (d.model) agg[p.key].models.add(d.model); });
    (DEPT_DOCS.svc || []).filter((d) => (d.kind === "เคลมประกัน" || d.claimCause) && hit(d)).forEach((d) => bump(p.key, p.line.part, "claim", d.no));
  });
  bxReqs().filter((r) => /^SV-/.test(r.wo || "")).forEach((r) => r.items.forEach((it) => {
    const used = (Number(it.issued) || 0) - (Number(it.ret) || 0);
    if (used > 0) { bump(it.key, it.part, "svc", r.wo, used); if (r.model) agg[it.key].models.add(r.model); }
  }));
  const rows = Object.values(agg).sort((a, b) => b.score - a.score);
  const openEcr = (key) => (DEPT_DOCS.ecr || []).filter((d) => !["ไม่อนุมัติ", "ปิดแล้ว"].includes(d.status) && (d.title + " " + (d.detail || "")).includes(key));
  const canEcr = deptCanCreate(currentRole(), "ecr");
  pane.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>ข้อมูลย้อนกลับจากหน้างานและลูกค้า — ควรแก้ที่ต้นเหตุอะไรก่อน</h3><p class="card-sub">รวม NCR, ข้อร้องเรียน (CC), เคลม และอะไหล่ที่เปลี่ยนในงานบริการ ต่อชิ้นส่วน · คะแนน = เอกสาร × 3 + จำนวนที่เปลี่ยน · กด "เปิด ECR" ระบบใส่หลักฐานให้</p></div>
      <div class="card-body table-scroll">
        <table class="data-table">
          <thead><tr><th>ชิ้นส่วน</th><th>รุ่น</th><th class="num">NCR</th><th class="num">ข้อร้องเรียน</th><th class="num">เคลม</th><th class="num">เปลี่ยนในงานบริการ</th><th class="num">คะแนน</th><th>ECR ที่เปิดอยู่</th><th></th></tr></thead>
          <tbody>${rows.map((r) => { const e = openEcr(r.key); return `<tr>
            <td><span class="mono-cell">${rdEsc(r.key)}</span> ${rdEsc(r.part)}</td><td class="muted-inline">${rdEsc([...r.models].join(", "))}</td>
            <td class="num">${r.ncr.size}</td><td class="num">${r.cc.size}</td><td class="num">${r.claim.size}</td><td class="num">${bxFmt(r.svc)}</td><td class="num"><strong>${bxFmt(r.score)}</strong></td>
            <td>${e.map((d) => `<button type="button" class="rel-chip" data-docno="${rdEsc(d.no)}">${rdEsc(d.no)}</button>`).join("") || "—"}</td>
            <td>${canEcr && !e.length ? `<button type="button" class="btn-chip" data-rdecr="${rdEsc(r.key)}">เปิด ECR</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="9" class="muted-inline">ยังไม่มีข้อมูลย้อนกลับที่ผูกกับรหัสชิ้นส่วน — NCR / เคลม / ข้อร้องเรียนที่ระบุรหัสหรือชื่อชิ้นส่วนจะขึ้นที่นี่</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  pane.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  pane.querySelectorAll("[data-rdecr]").forEach((b) => b.addEventListener("click", () => {
    const r = agg[b.dataset.rdecr];
    openDeptModal("ecr", null);
    const set = (k, v) => { const el = document.getElementById(`deptField_${k}`); if (el && v) el.value = v; };
    set("title", `แก้ไขต้นเหตุ ${r.key} ${r.part}`);
    set("reason", "ปัญหาคุณภาพ");
    if (r.models.size === 1) set("model", [...r.models][0]);
    set("detail", `หลักฐาน: NCR ${[...r.ncr].join(", ") || "-"} · ข้อร้องเรียน ${[...r.cc].join(", ") || "-"} · เคลม ${[...r.claim].join(", ") || "-"} · เปลี่ยนในงานบริการ ${bxFmt(r.svc)} ชิ้น`);
  }));
}

/* ---- team workload ---------------------------------------------------------------------- */

function renderRdWorkload(pane) {
  const me = rdUser();
  const active = RD.projects.filter((p) => ["วางแผน", "กำลังดำเนินการ"].includes(p.status));
  const tasks = active.flatMap((p) => (p.tasks || []).filter((t) => !t.milestone).map((t) => ({ p, t })));
  const week = rdAddDays(bxToday(), 7);
  const by = {};
  tasks.forEach(({ p, t }) => {
    const k = t.owner || "";
    const o = by[k] = by[k] || { open: 0, late: 0, week: 0, done: 0 };
    if ((Number(t.progress) || 0) >= 100) o.done++; else { o.open++; if (rdTaskLate(t)) o.late++; else if (t.end <= week) o.week++; }
  });
  const mine = tasks.filter(({ t }) => !rdMineOnly || (me && t.owner === me.id)).filter(({ t }) => (Number(t.progress) || 0) < 100).sort((a, b) => String(a.t.end).localeCompare(String(b.t.end)));
  const max = Math.max(1, ...Object.values(by).map((o) => o.open));
  pane.innerHTML = `
    <div class="p2p-stack">
      <div class="card">
        <div class="card-header"><h3>ภาระงานของทีม</h3><p class="card-sub">งานที่ยังไม่เสร็จในทุกโครงการที่กำลังทำ · แดง = เลยกำหนด · เหลือง = ครบกำหนดใน 7 วัน</p></div>
        <div class="card-body"><div class="ov-rows">${Object.keys(by).sort((a, b) => by[b].open - by[a].open).map((k) => { const o = by[k]; return `<div class="ov-row">
          <div class="ov-row-head"><strong>${rdEsc(k ? rdUserName(k) : "ยังไม่มอบหมาย")}</strong><span class="ov-row-right"><span class="muted-inline">เสร็จ ${o.done}</span> <strong>${o.open}</strong> งาน</span></div>
          <div class="rd-stack"><span class="ov-tone-critical" style="width:${(o.late / max) * 100}%"></span><span class="ov-tone-warning" style="width:${(o.week / max) * 100}%"></span><span class="ov-tone-info" style="width:${((o.open - o.late - o.week) / max) * 100}%"></span></div></div>`; }).join("") || ovEmpty("ยังไม่มีงานในโครงการ")}</div></div>
      </div>
      <div class="card">
        <div class="card-header card-header-actions"><div><h3>${rdMineOnly ? "งานของฉัน" : "งานที่ยังไม่เสร็จทั้งหมด"}</h3><p class="card-sub">เรียงตามกำหนดเสร็จ · อัปเดต % ได้ทันที</p></div>
          <label class="vis-opt"><input type="checkbox" id="rdMine"${rdMineOnly ? " checked" : ""}> เฉพาะของฉัน</label></div>
        <div class="card-body table-scroll"><table class="data-table"><thead><tr><th>งาน</th><th>โครงการ</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>%</th></tr></thead>
          <tbody>${mine.slice(0, 40).map(({ p, t }) => `<tr><td>${rdEsc(t.name)}${rdTaskLate(t) ? ` ${bxPill("เลยกำหนด", "critical")}` : ""}</td>
            <td><button type="button" class="bx-link" data-rdopen="${rdEsc(p.id)}">${rdEsc(p.id)}</button></td><td>${rdEsc(rdUserName(t.owner))}</td><td>${formatThaiDate(t.end)}</td>
            <td>${rdCanEdit(p) ? `<select class="bom-inline rd-wl" data-p="${rdEsc(p.id)}" data-t="${rdEsc(t.id)}" aria-label="ความคืบหน้า">${[0, 10, 25, 50, 75, 90, 100].map((x) => `<option value="${x}"${Number(t.progress) === x ? " selected" : ""}>${x}%</option>`).join("")}</select>` : `${t.progress}%`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted-inline">ไม่มีงานค้าง</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  document.getElementById("rdMine").addEventListener("change", (e) => { rdMineOnly = e.target.checked; renderRnd(); });
  pane.querySelectorAll("[data-rdopen]").forEach((b) => b.addEventListener("click", () => { rdTab = "projects"; rdOpenId = b.dataset.rdopen; renderRnd(); }));
  pane.querySelectorAll(".rd-wl").forEach((el) => el.addEventListener("change", () => {
    const p = RD.projects.find((x) => x.id === el.dataset.p);
    const t = p && p.tasks.find((x) => x.id === el.dataset.t);
    if (!t) return;
    const before = t.progress;
    t.progress = Number(el.value);
    if (t.progress >= 100) t.doneAt = bxToday();
    rdSave();
    rdAudit("อัปเดตงานโครงการ R&D", p.id, `${t.name}: ความคืบหน้า "${before}" → "${t.progress}"`);
    renderRnd();
  }));
}
