/* ==========================================================================
   Users, login, permissions, document visibility and audit trail.

   PROTOTYPE NOTE: everything here lives in this browser's localStorage, so it
   organises who-sees-what for day-to-day use and demonstrates the design,
   but it is NOT real security (anyone with the device can read storage) and
   it does not sync between devices. Moving AUTH_STORE / audit / documents to
   a shared backend (e.g. Google Sheets + Apps Script, Firebase) is the next
   step for true multi-user use.
   ========================================================================== */

const AUTH_STORAGE_KEY = "y2j-auth-v1";
const SESSION_STORAGE_KEY = "y2j-session-v1";
const AUDIT_STORAGE_KEY = "y2j-audit-v1";
const AUDIT_MAX = 3000;
const DEMO_PIN = "1234";

const AUTH_ROLES = [
  { id: "admin", label: "ผู้ดูแลระบบ (Admin)" },
  { id: "plant", label: "ผู้จัดการโรงงาน/บริษัท" },
  { id: "depthead", label: "หัวหน้าแผนก" },
  { id: "operator", label: "พนักงาน (Operator)" },
  { id: "group", label: "ผู้บริหารระดับกลุ่ม" },
];

const PERM_LEVELS = [
  { id: "none", label: "ไม่เห็น" },
  { id: "view", label: "ดูได้" },
  { id: "create", label: "สร้าง/เสนอได้" },
  { id: "manage", label: "จัดการ/อนุมัติ" },
];
const PERM_RANK = { none: 0, view: 1, create: 2, manage: 3 };

// Anyone may raise these, whatever their department (repair, defect, safety, material, change request)
const CROSS_CREATE_TYPES = ["mtr", "ncr", "saf", "mreq", "ecr", "svc", "tq"];

const ALL_VIEWS = [
  ["overview", "ภาพรวม"], ["pilot", "ผลทดสอบนำร่อง"], ["dept", "งานตามแผนก / เอกสาร"], ["plans", "แผนงาน & Schedule"],
  ["mytasks", "งานของฉัน"], ["priority", "Priority Matrix"], ["capacity", "Capacity Planning"], ["schedule", "Master Schedule"],
  ["makeorbuy", "Make-or-Buy"], ["resource", "ทรัพยากรการผลิต"], ["p2p", "ติดตามจัดซื้อ (PR→PO→รับของ)"], ["procurement", "จัดซื้อ"], ["workorder", "ใบสั่งผลิต & BOM"],
  ["rnd", "R&D Workbench"], ["bomx", "BOM & เบิกวัสดุ"], ["service", "บริการหลังการขาย"], ["reports", "รายงาน"],
  ["admin", "ผู้ดูแลระบบ (Admin)"],
];

// Special rights a user group can grant on top of page/document permissions
const GROUP_ABILITIES = [
  ["request", "สั่งเบิกวัสดุ"],
  ["approve", "อนุมัติใบเบิก"],
  ["issue", "จ่ายของตามใบเบิก (คลัง)"],
  ["stock", "ปรับยอดคงคลัง / ตั้งสิทธิ์การเบิก"],
  ["reports", "ดูรายงานกิจกรรมทั้งระบบ"],
];

// Starting groups — admin can rename, change or delete them (Admin › กลุ่มผู้ใช้)
function authDefaultGroups() {
  return [
    { id: "g-rnd", name: "วิศวกร R&D", desc: "วางแผนโครงการพัฒนา ดูแล BOM แบบ ECR/EO WI และข้อมูลชิ้นส่วน", modules: ["rnd", "bomx", "dept", "reports", "service"], docPerms: { tq: "manage", ecr: "manage", eo: "create", dwg: "manage", wi: "manage", bom: "manage" }, abilities: [], members: ["rnd"] },
    { id: "g-tech", name: "ช่างประกอบ / ช่างเทคนิค", desc: "เบิกวัสดุตาม BOM ดูใบสั่งผลิตและงานของตัวเอง", modules: ["bomx", "workorder", "mytasks", "service"], docPerms: { mreq: "create", dpr: "create", ncr: "create" }, abilities: ["request"], members: ["op1"] },
    { id: "g-lead", name: "หัวหน้างาน / ผู้อนุมัติเบิก", desc: "อนุมัติใบเบิก สั่งเบิกแทนและมอบหมายช่างรับของ", modules: ["bomx", "workorder", "reports"], docPerms: { mreq: "manage", dpr: "manage" }, abilities: ["request", "approve"], members: ["prod"] },
    { id: "g-store", name: "คลังสินค้า", desc: "จ่ายของตามใบเบิก รับของเข้าคลัง ปรับยอดคงคลัง", modules: ["bomx", "workorder", "p2p"], docPerms: { grn: "manage", stk: "manage", mreq: "create" }, abilities: ["issue", "stock"], members: ["store"] },
    { id: "g-svc", name: "ช่างบริการหลังการขาย", desc: "เปิด/อัปเดตงานบริการ เบิกอะไหล่ตาม BOM ของเครื่องลูกค้า", modules: ["service", "bomx"], docPerms: { svc: "manage", mc: "create", cc: "create", mreq: "create" }, abilities: ["request"], members: ["svc1"] },
    { id: "g-pur", name: "จัดซื้อ", desc: "PR → PO → ผู้ขาย และของที่ต้องสั่งเพิ่ม", modules: ["p2p", "procurement", "bomx", "reports"], docPerms: { rfq: "manage", sev: "manage", mrq: "view" }, abilities: [], members: ["pur"] },
    { id: "g-exec", name: "ผู้บริหาร / ผู้ดูรายงาน", desc: "ดูภาพรวม รายงาน และกิจกรรมทั้งระบบ", modules: ["overview", "pilot", "reports", "bomx", "service", "p2p"], docPerms: {}, abilities: ["reports"], members: ["exec", "plant"] },
  ];
}

// Put users into the starting groups by username (used once, when groups are first introduced)
function authApplyDefaultMembers(auth) {
  const defs = authDefaultGroups();
  auth.groups = defs.map(({ members, ...g }) => g);
  auth.users.forEach((u) => {
    u.groups = defs.filter((g) => g.members.includes(u.username)).map((g) => g.id);
  });
}

let AUTH = null;        // { users, teams, groups }
let AUTH_USER = null;   // the signed-in user object (from AUTH.users)

/* ---- hashing (obfuscation only — see prototype note) --------------------- */

function pinHash(pin, salt) {
  let h = 2166136261;
  const s = `${salt}:${pin}:y2j`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/* ---- store --------------------------------------------------------------- */

function authSeed() {
  // company "" = group level (may open every company)
  const u = (id, username, name, role, dept, position, teams) => ({
    id, username, name, role, dept, position, teams, active: true,
    company: role === "admin" || role === "group" ? "" : "y2j",
    pin: pinHash(DEMO_PIN, id), modules: null, docPerms: {}, createdAt: "2026-09-24T08:00:00", lastLogin: "",
  });
  const seed = {
    users: [
      u("u-admin", "admin", "ผู้ดูแลระบบ", "admin", "", "IT / ผู้ดูแลระบบ", []),
      u("u-plant", "plant", "ผู้จัดการโรงงาน", "plant", "", "ผู้จัดการโรงงาน", ["t-yt6500", "t-award"]),
      u("u-rnd", "rnd", "หัวหน้าฝ่าย R&D", "depthead", "rnd", "หัวหน้าฝ่ายวิศวกรรม", ["t-yt6500", "t-qcc"]),
      u("u-qc", "qc", "หัวหน้า QC", "depthead", "qc", "หัวหน้าฝ่ายควบคุมคุณภาพ", ["t-qcc"]),
      u("u-prod", "prod", "หัวหน้าไลน์ประกอบ 1", "depthead", "prod", "หัวหน้าไลน์ผลิต", ["t-yt6500"]),
      u("u-op1", "op1", "ช่างประกอบ ไลน์ 1", "operator", "prod", "ช่างประกอบ", []),
      u("u-pur", "pur", "เจ้าหน้าที่จัดซื้อ", "operator", "pur", "เจ้าหน้าที่จัดซื้อ", []),
      u("u-exec", "exec", "ผู้บริหารกลุ่ม", "group", "", "ผู้บริหารระดับกลุ่ม", ["t-award"]),
    ],
    teams: [
      { id: "t-yt6500", name: "ทีมโครงการ YT6500" },
      { id: "t-qcc", name: "ทีมปรับปรุงคุณภาพ (QCC)" },
      { id: "t-award", name: "คณะทำงาน PS Innovation Award" },
    ],
  };
  authApplyDefaultMembers(seed);
  return seed;
}

function authLoad() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.users) && parsed.users.length) {
      AUTH = parsed;
      // users created before companies existed belong to the original company (admins/executives: group level)
      let migrated = false;
      AUTH.users.forEach((u) => {
        if (u.company === undefined) { u.company = u.role === "admin" || u.role === "group" ? "" : "y2j"; migrated = true; }
      });
      if (!Array.isArray(AUTH.groups)) { authApplyDefaultMembers(AUTH); migrated = true; }
      // groups added in later versions arrive once, with their default members
      authDefaultGroups().forEach((g) => {
        const seen = AUTH.groupsSeen = AUTH.groupsSeen || AUTH.groups.map((x) => x.id);
        if (seen.includes(g.id)) return;
        const { members, ...grp } = g;
        if (!authGroupById(g.id)) AUTH.groups.push(grp);
        AUTH.users.forEach((u) => { if (members.includes(u.username) && !(u.groups || []).includes(g.id)) u.groups = (u.groups || []).concat(g.id); });
        seen.push(g.id);
        migrated = true;
      });
      if (migrated) authSave();
      return;
    }
  } catch (e) { /* fall through */ }
  AUTH = authSeed();
  authSave();
}

function authSave() {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(AUTH)); } catch (e) { showToast("บันทึกข้อมูลผู้ใช้ไม่สำเร็จ", "warn"); }
}

function authGroupById(id) { return (AUTH.groups || []).find((g) => g.id === id) || null; }
function authUserGroups(user) {
  const u = user || AUTH_USER;
  return u ? (u.groups || []).map(authGroupById).filter(Boolean) : [];
}
function authHasAbility(ability, user) {
  const u = user || AUTH_USER;
  if (!u) return false;
  if (u.role === "admin") return true;
  return authUserGroups(u).some((g) => (g.abilities || []).includes(ability));
}

function authUserById(id) { return AUTH.users.find((u) => u.id === id) || null; }
function authTeamById(id) { return AUTH.teams.find((t) => t.id === id) || null; }
function authCurrentUser() { return AUTH_USER; }
function authIsAdmin() { return !!AUTH_USER && AUTH_USER.role === "admin"; }
function authRoleLabel(role) { return (AUTH_ROLES.find((r) => r.id === role) || {}).label || role; }
function authDeptName(id) {
  if (!id) return "ส่วนกลาง";
  const ws = typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES.find((w) => w.id === id) : null;
  return ws ? ws.name : id;
}

// Role used by the older role-gated modules (admin behaves like plant manager there)
function authLegacyRole() {
  if (!AUTH_USER) return null;
  return AUTH_USER.role === "admin" ? "plant" : AUTH_USER.role;
}

/* ---- session ------------------------------------------------------------- */

// Returns true when a valid user is signed in
function authInit() {
  authLoad();
  let id = null;
  try { id = localStorage.getItem(SESSION_STORAGE_KEY); } catch (e) { /* ignore */ }
  const u = id ? authUserById(id) : null;
  AUTH_USER = u && u.active ? u : null;
  return !!AUTH_USER;
}

function authSignIn(user, via) {
  try { localStorage.setItem(SESSION_STORAGE_KEY, user.id); } catch (e) { /* ignore */ }
  user.lastLogin = new Date().toISOString();
  authSave();
  AUTH_USER = user;
  auditLog(via === "impersonate" ? "เข้าใช้แทนผู้ใช้" : "เข้าสู่ระบบ", user.username, via === "impersonate" ? `ผู้ดูแลเข้าใช้เป็น ${user.name}` : "");
  location.reload();
}

function authSignOut() {
  auditLog("ออกจากระบบ", AUTH_USER ? AUTH_USER.username : "", "");
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}

/* ---- permissions ----------------------------------------------------------- */

function roleDefaultModules(role) {
  if (role === "admin") return ALL_VIEWS.map((v) => v[0]);
  const base = MODULE_ACCESS[role] || MODULE_ACCESS.group;
  return base.concat(["plans"]);
}

function authAllowedModules(user) {
  const u = user || AUTH_USER;
  if (!u) return null;
  const list = Array.isArray(u.modules) ? u.modules.slice() : roleDefaultModules(u.role);
  // pages granted by the user's groups are added to the role defaults (not to a hand-picked list)
  if (!Array.isArray(u.modules)) authUserGroups(u).forEach((g) => (g.modules || []).forEach((m) => { if (!list.includes(m)) list.push(m); }));
  if (!Array.isArray(u.modules) && u.dept === "rnd" && !list.includes("rnd")) list.push("rnd");
  if (u.role === "admin" && !list.includes("admin")) list.push("admin");
  if (u.role !== "admin") return list.filter((v) => v !== "admin");
  return list;
}

function roleDefaultDocPerm(user, type) {
  const role = user.role;
  if (role === "admin" || role === "plant") return "manage";
  if (role === "group") return "view";
  const ownDept = DEPT_WORKSPACES.find((w) => w.id === user.dept);
  const own = !!ownDept && ownDept.docTypes.includes(type);
  if (role === "depthead") {
    if (own) return "manage";
    return CROSS_CREATE_TYPES.includes(type) ? "create" : "view";
  }
  // operator
  if (own) return "create";
  return CROSS_CREATE_TYPES.includes(type) ? "create" : "none";
}

// Role default raised by any group the user belongs to (a per-user setting still overrides both)
function authDefaultDocPerm(user, type) {
  let best = roleDefaultDocPerm(user, type);
  authUserGroups(user).forEach((g) => {
    const p = (g.docPerms || {})[type];
    if (p && PERM_RANK[p] > PERM_RANK[best]) best = p;
  });
  return best;
}

function authDocPerm(type, user) {
  const u = user || AUTH_USER;
  if (!u) return "manage";
  const set = u.docPerms && u.docPerms[type];
  return set || authDefaultDocPerm(u, type);
}

function authCan(type, level) {
  return PERM_RANK[authDocPerm(type)] >= PERM_RANK[level];
}

/* ---- document visibility --------------------------------------------------- */

const VIS_MODES = [
  { id: "all", label: "ทุกคนที่มีสิทธิ์ดูเอกสารชนิดนี้", icon: "🌐" },
  { id: "dept", label: "เฉพาะแผนกของผู้สร้าง", icon: "🏢" },
  { id: "custom", label: "ลับ — เฉพาะทีม/แผนก/บุคคลที่เลือก", icon: "🔒" },
  { id: "private", label: "ส่วนตัว — เฉพาะผู้สร้าง", icon: "👤" },
];

function visLabel(vis) {
  const m = VIS_MODES.find((x) => x.id === ((vis && vis.mode) || "all")) || VIS_MODES[0];
  if (m.id === "custom" && vis) {
    const parts = []
      .concat((vis.teams || []).map((t) => (authTeamById(t) || {}).name).filter(Boolean))
      .concat((vis.depts || []).map(authDeptName))
      .concat((vis.users || []).map((u) => (authUserById(u) || {}).name).filter(Boolean));
    return `${m.icon} ลับ: ${parts.join(", ") || "ยังไม่ได้เลือก"}`;
  }
  if (m.id === "dept" && vis) return `${m.icon} เฉพาะ${authDeptName(vis.ownerDept)}`;
  return `${m.icon} ${m.id === "all" ? "ทั่วไป" : m.label}`;
}

// Can `user` see an item carrying `vis` created by `createdBy`?
function visAllows(vis, createdBy, user) {
  const u = user || AUTH_USER;
  if (!u) return true;
  if (u.role === "admin") return true;
  if (createdBy && createdBy === u.id) return true;
  const mode = (vis && vis.mode) || "all";
  if (mode === "all") return true;
  if (mode === "private") return false;
  if (mode === "dept") return !!vis.ownerDept && vis.ownerDept === u.dept;
  if (mode === "custom") {
    return (vis.users || []).includes(u.id)
      || (vis.depts || []).includes(u.dept)
      || (vis.teams || []).some((t) => (u.teams || []).includes(t));
  }
  return true;
}

function authCanSeeDoc(type, doc) {
  if (!AUTH_USER) return true;
  if (!authCan(type, "view") && doc.createdBy !== AUTH_USER.id) return false;
  return visAllows(doc.visibility, doc.createdBy);
}

// Visibility editor used by document and plan forms
function visEditorHtml(prefix, vis) {
  const v = vis || { mode: "all" };
  const chk = (group, id, label, on) => `<label class="vis-opt"><input type="checkbox" data-vis-${prefix}="${group}" value="${escapeHtml(id)}"${on ? " checked" : ""}> ${escapeHtml(label)}</label>`;
  return `
    <div class="form-field">
      <label for="${prefix}VisMode">การมองเห็น / ชั้นความลับ</label>
      <select id="${prefix}VisMode">${VIS_MODES.map((m) => `<option value="${m.id}"${m.id === (v.mode || "all") ? " selected" : ""}>${m.icon} ${escapeHtml(m.label)}</option>`).join("")}</select>
    </div>
    <div class="vis-custom" id="${prefix}VisCustom"${v.mode === "custom" ? "" : " hidden"}>
      <div class="vis-group"><div class="vis-group-title">ทีม</div>${AUTH.teams.map((t) => chk("teams", t.id, t.name, (v.teams || []).includes(t.id))).join("") || '<span class="muted-inline">ยังไม่มีทีม</span>'}</div>
      <div class="vis-group"><div class="vis-group-title">แผนก</div>${DEPT_WORKSPACES.map((w) => chk("depts", w.id, w.name, (v.depts || []).includes(w.id))).join("")}</div>
      <div class="vis-group"><div class="vis-group-title">บุคคล</div>${AUTH.users.filter((u) => u.active).map((u) => chk("users", u.id, u.name, (v.users || []).includes(u.id))).join("")}</div>
    </div>`;
}

function visEditorWire(prefix) {
  const sel = document.getElementById(`${prefix}VisMode`);
  if (!sel) return;
  sel.addEventListener("change", () => { document.getElementById(`${prefix}VisCustom`).hidden = sel.value !== "custom"; });
}

function visEditorRead(prefix, ownerDept) {
  const sel = document.getElementById(`${prefix}VisMode`);
  if (!sel) return undefined;
  const pick = (g) => [...document.querySelectorAll(`[data-vis-${prefix}="${g}"]:checked`)].map((i) => i.value);
  const mode = sel.value;
  const vis = { mode };
  if (mode === "dept") vis.ownerDept = ownerDept || (AUTH_USER && AUTH_USER.dept) || "";
  if (mode === "custom") { vis.teams = pick("teams"); vis.depts = pick("depts"); vis.users = pick("users"); }
  return vis;
}

/* ---- audit trail ----------------------------------------------------------- */

function auditLoad() {
  try { return JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || "[]"); } catch (e) { return []; }
}

function auditLog(action, target, detail) {
  const log = auditLoad();
  log.push({
    ts: new Date().toISOString(),
    user: AUTH_USER ? AUTH_USER.id : "",
    userName: AUTH_USER ? AUTH_USER.name : "(ไม่ระบุ)",
    company: typeof Y2JStore !== "undefined" ? Y2JStore.company() : "",
    action, target: target || "", detail: detail || "",
  });
  while (log.length > AUDIT_MAX) log.shift();
  try { localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(log)); } catch (e) { /* storage full — drop silently */ }
}

// Human-readable list of field changes between two versions of a record
function auditDiff(before, after, fields) {
  const changes = [];
  fields.forEach((f) => {
    const a = before[f.key] ?? "";
    const b = after[f.key] ?? "";
    if (String(a) !== String(b)) changes.push(`${f.label}: "${a || "—"}" → "${b || "—"}"`);
  });
  return changes.join(" · ");
}

function auditFor(target) {
  return auditLoad().filter((e) => e.target === target).reverse();
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${formatThaiDate(iso.slice(0, 10))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Stamp who/when on a record being created or edited
function stampRecord(rec, isNew) {
  const now = new Date().toISOString();
  const who = AUTH_USER ? AUTH_USER.id : "";
  if (isNew) { rec.createdBy = who; rec.createdAt = now; }
  rec.updatedBy = who;
  rec.updatedAt = now;
}

function authUserName(id) {
  const u = id ? authUserById(id) : null;
  return u ? u.name : (id ? id : "ข้อมูลตัวอย่าง");
}

/* ---- login screen + user chip ---------------------------------------------- */

// Which data this device shows: the shared Google Sheet, or only its own sample data.
// A device that was never connected lists the built-in sample users — say so, and let it connect here.
function renderLoginConn() {
  const box = document.getElementById("loginConn");
  if (!box || typeof Y2JStore === "undefined") return;
  // which build this device is running (asset version) — tells stale caches apart at a glance
  const card = document.querySelector(".login-card");
  if (card && !document.getElementById("loginBuild")) {
    const src = (document.querySelector('script[src*="storage.js"]') || {}).src || "";
    const v = (src.match(/[?&]v=([^&]+)/) || [])[1] || "";
    card.insertAdjacentHTML("beforeend", `<div class="login-build" id="loginBuild">เวอร์ชัน ${escapeHtml(v)} · ${Y2JStore.config().demo ? "ระบบทดลอง" : Y2JStore.isRemote() ? "ข้อมูลบริษัท" : "เฉพาะเครื่องนี้"} · <a href="./?reset=1">ล้างข้อมูลในเครื่องนี้</a></div>`);
  }
  if (Y2JStore.isRemote() && Y2JStore.config().demo) {
    box.className = "login-conn login-conn-demo";
    box.innerHTML = "🧪 ระบบทดลอง (ข้อมูลจำลอง) — เลือกผู้ใช้ด้านล่าง PIN 1234";
    return;
  }
  if (Y2JStore.isRemote()) {
    const st = Y2JStore.status();
    box.className = "login-conn login-conn-ok";
    box.innerHTML = `☁ เชื่อมข้อมูลกลาง (Google Sheets) แล้ว${st.at ? ` · อัปเดต ${escapeHtml(String(st.at).slice(11, 16))}` : ""} — ทุกเครื่องที่เชื่อมเห็นข้อมูลชุดเดียวกัน`;
    return;
  }
  box.className = "login-conn login-conn-warn";
  box.innerHTML = "⚠ เครื่องนี้ใช้ข้อมูลเฉพาะในเครื่อง — กด \"ล้างข้อมูลในเครื่องนี้\" ด้านล่างเพื่อเข้าระบบทดลอง หรือเปิดลิงก์ตั้งค่าจากผู้ดูแลระบบเพื่อใช้ข้อมูลบริษัท";
}

function renderLoginScreen() {
  const scr = document.getElementById("loginScreen");
  scr.hidden = false;
  document.querySelector(".app-shell").hidden = true;
  renderLoginConn();
  const list = document.getElementById("loginUsers");
  list.innerHTML = AUTH.users.filter((u) => u.active).map((u) => `
    <button type="button" class="login-user" data-uid="${escapeHtml(u.id)}">
      <span class="login-avatar">${escapeHtml(u.name.slice(0, 1))}</span>
      <span class="login-user-text"><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(authRoleLabel(u.role))} · ${escapeHtml(authDeptName(u.dept))}</span></span>
    </button>`).join("");
  let picked = null;
  const pinBox = document.getElementById("loginPinBox");
  const pinInput = document.getElementById("loginPin");
  list.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", () => {
    list.querySelectorAll(".login-user").forEach((x) => x.classList.toggle("active", x === b));
    picked = authUserById(b.dataset.uid);
    document.getElementById("loginPickedName").textContent = picked.name;
    pinBox.hidden = false;
    pinInput.value = "";
    document.getElementById("loginError").hidden = true;
    pinInput.focus();
  }));
  const submit = () => {
    if (!picked) return;
    if (pinHash(pinInput.value.trim(), picked.id) !== picked.pin) {
      document.getElementById("loginError").hidden = false;
      pinInput.select();
      return;
    }
    authSignIn(picked, "login");
  };
  document.getElementById("loginSubmit").onclick = submit;
  pinInput.onkeydown = (e) => { if (e.key === "Enter") submit(); };
}

function renderUserChip() {
  const chip = document.getElementById("userChip");
  if (!chip || !AUTH_USER) return;
  chip.hidden = false;
  chip.innerHTML = `
    <span class="login-avatar small">${escapeHtml(AUTH_USER.name.slice(0, 1))}</span>
    <span class="user-chip-text"><strong>${escapeHtml(AUTH_USER.name)}</strong><span>${escapeHtml(authRoleLabel(AUTH_USER.role))}</span></span>
    <button type="button" class="btn-chip" id="mySignBtn" title="ลายเซ็นสำหรับลงนามเอกสาร">✍ ลายเซ็น${AUTH_USER.signature ? "" : " (ยังไม่ตั้ง)"}</button>
    <button type="button" class="btn-chip" id="changePinBtn">เปลี่ยน PIN</button>
    <button type="button" class="btn-chip" id="logoutBtn">ออกจากระบบ</button>`;
  document.getElementById("logoutBtn").addEventListener("click", authSignOut);
  document.getElementById("mySignBtn").addEventListener("click", () => { if (typeof esOpenPad === "function") esOpenPad(renderUserChip); });
  document.getElementById("changePinBtn").addEventListener("click", () => {
    const oldPin = prompt("PIN ปัจจุบัน");
    if (oldPin === null) return;
    if (pinHash(oldPin.trim(), AUTH_USER.id) !== AUTH_USER.pin) { showToast("PIN ปัจจุบันไม่ถูกต้อง", "warn"); return; }
    const next = prompt("PIN ใหม่ (ตัวเลข 4–6 หลัก)");
    if (next === null) return;
    if (!/^\d{4,6}$/.test(next.trim())) { showToast("PIN ต้องเป็นตัวเลข 4–6 หลัก", "warn"); return; }
    AUTH_USER.pin = pinHash(next.trim(), AUTH_USER.id);
    authSave();
    auditLog("เปลี่ยน PIN", AUTH_USER.username, "");
    showToast("เปลี่ยน PIN แล้ว", "good");
  });
}
