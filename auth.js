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
const LOGIN_RECENT_KEY = "y2j-login-recent-v1"; // per device, not synced: last users who signed in here
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
  ["cost", "ดูต้นทุน / มูลค่า / ราคา (ข้อมูลลับ)"],
];
// Documents that carry prices, customers or supplier ratings: other departments' heads do not see them by default
const SENSITIVE_DOC_TYPES = ["so", "rfq", "sev"];
// Cost, stock value, prices, hour rates, the management TV board: managers and groups granted "cost"
function authCanSeeCost(user) {
  const u = user || AUTH_USER;
  if (!u) return true;
  return ["admin", "plant", "group"].includes(u.role) || authHasAbility("cost", u);
}
// Management cost view (unit cost per machine, cost vs plan, management TV): managers, or "cost" + "reports" together
function authCanSeeMgmtCost(user) {
  const u = user || AUTH_USER;
  if (!u) return true;
  return ["admin", "plant", "group"].includes(u.role) || (authHasAbility("cost", u) && authHasAbility("reports", u));
}

// Starting groups — admin can rename, change or delete them (Admin › กลุ่มผู้ใช้)
function authDefaultGroups() {
  return [
    { id: "g-rnd", name: "วิศวกร R&D", desc: "วางแผนโครงการพัฒนา ดูแล BOM แบบ ECR/EO WI และข้อมูลชิ้นส่วน", modules: ["rnd", "bomx", "dept", "reports", "service"], docPerms: { tq: "manage", ecr: "manage", eo: "create", dwg: "manage", wi: "manage", bom: "manage" }, abilities: [], members: ["rnd"] },
    { id: "g-tech", name: "ช่างประกอบ / ช่างเทคนิค", desc: "เบิกวัสดุตาม BOM ดูใบสั่งผลิตและงานของตัวเอง", modules: ["bomx", "workorder", "mytasks", "service"], docPerms: { mreq: "create", dpr: "create", ncr: "create" }, abilities: ["request"], members: ["op1"] },
    { id: "g-lead", name: "หัวหน้างาน / ผู้อนุมัติเบิก", desc: "อนุมัติใบเบิก สั่งเบิกแทนและมอบหมายช่างรับของ", modules: ["bomx", "workorder", "reports"], docPerms: { mreq: "manage", dpr: "manage" }, abilities: ["request", "approve"], members: ["prod"] },
    { id: "g-store", name: "คลังสินค้า", desc: "จ่ายของตามใบเบิก รับของเข้าคลัง ปรับยอดคงคลัง", modules: ["bomx", "workorder", "p2p"], docPerms: { grn: "manage", stk: "manage", mreq: "create" }, abilities: ["issue", "stock"], members: ["store"] },
    { id: "g-svc", name: "ช่างบริการหลังการขาย", desc: "เปิด/อัปเดตงานบริการ เบิกอะไหล่ตาม BOM ของเครื่องลูกค้า", modules: ["service", "bomx"], docPerms: { svc: "manage", mc: "create", cc: "create", mreq: "create" }, abilities: ["request"], members: ["svc1"] },
    { id: "g-pur", name: "จัดซื้อ", desc: "PR → PO → ผู้ขาย และของที่ต้องสั่งเพิ่ม", modules: ["p2p", "procurement", "bomx", "reports"], docPerms: { rfq: "manage", sev: "manage", mrq: "view" }, abilities: ["cost"], members: ["pur"] },
    { id: "g-exec", name: "ผู้บริหาร / ผู้ดูรายงาน", desc: "ดูภาพรวม รายงาน และกิจกรรมทั้งระบบ", modules: ["overview", "pilot", "reports", "bomx", "service", "p2p"], docPerms: {}, abilities: ["reports", "cost"], members: ["exec", "plant"] },
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

// Passwords: PBKDF2-SHA256 via WebCrypto, stored as user.pw = "p2$<iterations>$<hex>". The old short
// PIN hash (user.pin) is still accepted until the person sets a password. mustChange = the admin gave a
// temporary password (or it is still the default 1234) — asked to set their own at the next sign-in.
const PW_ITER = 120000;
async function pwDerive(secret, salt, iter) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`forge:${salt}`), iterations: iter }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function authCheckSecret(user, secret) {
  if (!user || !secret) return false;
  if (user.pw) {
    const [, iter, hex] = String(user.pw).split("$");
    return (await pwDerive(secret, user.id, Number(iter) || PW_ITER)) === hex;
  }
  return pinHash(secret, user.id) === user.pin;
}
async function authSetSecret(user, secret) {
  user.pw = `p2$${PW_ITER}$${await pwDerive(secret, user.id, PW_ITER)}`;
  user.pin = "";
  user.pwAt = new Date().toISOString();
  delete user.mustChange;
}
function authSecretProblem(s) {
  if (typeof s !== "string" || s.length < 4) return "รหัสผ่านต้องยาวอย่างน้อย 4 ตัว";
  if (s.length > 32) return "รหัสผ่านยาวได้ไม่เกิน 32 ตัว";
  if (s === DEMO_PIN) return "ห้ามใช้ 1234 — ตั้งรหัสของตัวเอง";
  return "";
}
function authNeedsNewSecret(user) {
  const demo = typeof Y2JStore !== "undefined" && Y2JStore.config().demo;
  return !demo && (user.mustChange || (!user.pw && user.pin === pinHash(DEMO_PIN, user.id)));
}
// ask twice with prompt(); resolves true once a new password is stored on the user
async function authPromptNewSecret(user, title) {
  for (;;) {
    const a = prompt(`${title}
ตั้งรหัสผ่านใหม่ (4–32 ตัว ตัวอักษรหรือตัวเลขก็ได้)`);
    if (a === null) return false;
    const bad = authSecretProblem(a);
    if (bad) { alert(bad); continue; }
    const b = prompt("พิมพ์รหัสผ่านใหม่อีกครั้ง");
    if (b === null) return false;
    if (a !== b) { alert("รหัสผ่านสองครั้งไม่ตรงกัน"); continue; }
    await authSetSecret(user, a);
    return true;
  }
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
      // one-time: "cost" (prices / stock value / unit cost) is split from general viewing — give it to executives and purchasing
      if (!AUTH.costAbility) {
        (AUTH.groups || []).forEach((g) => { if ((g.id === "g-exec" || g.id === "g-pur") && !(g.abilities || []).includes("cost")) g.abilities = (g.abilities || []).concat("cost"); });
        AUTH.costAbility = true;
        migrated = true;
      }
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
    if (SENSITIVE_DOC_TYPES.includes(type)) return "none";
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
    card.insertAdjacentHTML("beforeend", `<div class="login-build" id="loginBuild">เวอร์ชัน ${escapeHtml(v)} · ${Y2JStore.config().demo ? "ระบบทดลอง" : Y2JStore.isRemote() ? "ข้อมูลบริษัท" : "เฉพาะเครื่องนี้"} · <a href="./?reset=1">ล้างข้อมูลในเครื่องนี้</a><br>${typeof APP_NAME !== "undefined" ? APP_NAME : "FORGE"} พัฒนาโดย ${typeof APP_DEVELOPER !== "undefined" ? APP_DEVELOPER : ""}</div>`);
  }
  if (Y2JStore.isRemote() && Y2JStore.config().demo) {
    box.className = "login-conn login-conn-demo";
    box.innerHTML = `<span>🧪 ระบบทดลอง (ข้อมูลจำลอง) — เลือกผู้ใช้ด้านล่าง PIN 1234</span>
      <button type="button" class="btn-chip login-code-toggle" id="loginCodeToggle">พนักงาน Y2J: ใส่รหัสบริษัท</button>
      <div class="login-conn-row" id="loginCodeRow" hidden><input id="loginCode" type="password" autocomplete="off" autocapitalize="characters" placeholder="รหัสบริษัท เช่น Y2J-XXXX-XXXX" aria-label="รหัสบริษัท"><button type="button" class="btn-primary" id="loginCodeBtn">เข้าข้อมูลบริษัท</button></div>
      <span class="login-conn-err" id="loginCodeErr" hidden></span>`;
    const row = document.getElementById("loginCodeRow");
    document.getElementById("loginCodeToggle").addEventListener("click", () => { row.hidden = !row.hidden; if (!row.hidden) document.getElementById("loginCode").focus(); });
    const go = async () => {
      const err = document.getElementById("loginCodeErr");
      const btn = document.getElementById("loginCodeBtn");
      err.hidden = true; btn.disabled = true; btn.textContent = "กำลังตรวจ…";
      try { await Y2JStore.unlockCompany(document.getElementById("loginCode").value); }
      catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = "เข้าข้อมูลบริษัท"; }
    };
    document.getElementById("loginCodeBtn").addEventListener("click", go);
    document.getElementById("loginCode").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
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
  const isDemo = typeof Y2JStore !== "undefined" && Y2JStore.config().demo;
  const users = AUTH.users.filter((u) => u.active);
  // sections: executives first, then departments in workspace order, then everyone else
  const deptOrder = (typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES : []).map((w) => w.id);
  const rank = { group: 0, plant: 1, admin: 2, depthead: 3, operator: 4 };
  const secOf = (u) => (["group", "plant", "admin"].includes(u.role) || !u.dept ? "exec" : u.dept);
  const secIds = ["exec", ...deptOrder, ...new Set(users.map(secOf))].filter((id, i, a) => a.indexOf(id) === i && users.some((u) => secOf(u) === id));
  const secName = (id) => (id === "exec" ? "ผู้บริหาร & ดูแลระบบ" : authDeptName(id));
  const recent = (() => { try { return JSON.parse(localStorage.getItem(LOGIN_RECENT_KEY) || "[]"); } catch (e) { return []; } })()
    .map((id) => users.find((u) => u.id === id)).filter(Boolean).slice(0, 4);
  const card = (u, sec) => `
    <button type="button" class="login-user" data-uid="${escapeHtml(u.id)}" data-sec="${secIds.indexOf(sec) % 8 + 1}"
      data-q="${escapeHtml([u.name, u.empNo, u.position, authRoleLabel(u.role), secName(sec)].join(" ").toLowerCase())}">
      <span class="login-avatar">${escapeHtml(u.name.slice(0, 1))}</span>
      <span class="login-user-text"><strong>${escapeHtml(u.name)}</strong><span>${u.empNo ? `<b class="login-emp">${escapeHtml(u.empNo)}</b> · ` : ""}${escapeHtml(u.position || authRoleLabel(u.role))}</span></span>
      ${u.role === "depthead" ? '<span class="login-tag">หัวหน้า</span>' : ""}
    </button>`;
  list.innerHTML = `
    ${users.length > 1 ? `<input type="search" class="login-search" id="loginSearch" placeholder="พิมพ์รหัสพนักงาน ชื่อ ตำแหน่ง หรือแผนก…" aria-label="ค้นหาผู้ใช้ หรือใส่รหัสพนักงาน" autocomplete="off">` : ""}
    ${recent.length ? `<section class="login-sec login-sec-recent"><h4>ใช้ล่าสุดในเครื่องนี้</h4><div class="login-grid">${recent.map((u) => card(u, secOf(u))).join("")}</div></section>` : ""}
    ${secIds.map((id) => {
      const us = users.filter((u) => secOf(u) === id).sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.name.localeCompare(b.name, "th"));
      return `<section class="login-sec" data-secid="${escapeHtml(id)}"><h4>${escapeHtml(secName(id))} <span>${us.length}</span></h4><div class="login-grid">${us.map((u) => card(u, id)).join("")}</div></section>`;
    }).join("")}
    <p class="login-empty" id="loginEmpty" hidden>ไม่พบผู้ใช้ที่ค้นหา</p>`;
  const search = document.getElementById("loginSearch");
  if (search) search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let any = false;
    list.querySelectorAll(".login-sec").forEach((sec) => {
      let n = 0;
      sec.querySelectorAll(".login-user").forEach((b) => { const hit = !q || b.dataset.q.includes(q); b.hidden = !hit; if (hit) n++; });
      sec.hidden = !n || (q && sec.classList.contains("login-sec-recent"));
      if (!sec.hidden) any = true;
    });
    document.getElementById("loginEmpty").hidden = any;
  });
  let picked = null;
  const pinBox = document.getElementById("loginPinBox");
  // exact employee number + Enter picks that person straight away
  if (search) search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = search.value.trim().toUpperCase();
    const vis = [...list.querySelectorAll(".login-sec:not(.login-sec-recent) .login-user:not([hidden])")];
    const hit = users.find((u) => u.empNo && u.empNo === q) ? list.querySelector(`.login-sec:not(.login-sec-recent) [data-uid="${CSS.escape(users.find((u) => u.empNo === q).id)}"]`) : vis.length === 1 ? vis[0] : null;
    if (hit) { e.preventDefault(); hit.click(); }
  });
  const pinInput = document.getElementById("loginPin");
  list.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", () => {
    list.querySelectorAll(".login-user").forEach((x) => x.classList.toggle("active", x.dataset.uid === b.dataset.uid));
    picked = authUserById(b.dataset.uid);
    document.getElementById("loginPickedName").textContent = `${picked.name}${picked.position ? ` (${picked.position})` : ""}`;
    pinBox.hidden = false;
    // demo accounts all share the published PIN — fill it so visitors can hop between roles quickly
    pinInput.value = isDemo ? "1234" : "";
    document.getElementById("loginError").hidden = true;
    pinBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
    (isDemo ? document.getElementById("loginSubmit") : pinInput).focus();
  }));
  const submit = async () => {
    if (!picked) return;
    if (!(await authCheckSecret(picked, pinInput.value))) {
      document.getElementById("loginError").hidden = false;
      pinInput.select();
      return;
    }
    await loginFinish(picked);
  };
  const loginFinish = async (user) => {
    if (authNeedsNewSecret(user)) {
      if (!(await authPromptNewSecret(user, `สวัสดี ${user.name} — ใช้รหัสผ่านชั่วคราวอยู่`))) return;
      authSave();
      auditLog("ตั้งรหัสผ่านใหม่", user.username, "ตอนเข้าสู่ระบบครั้งแรก");
    }
    picked = user;
    try {
      const prev = JSON.parse(localStorage.getItem(LOGIN_RECENT_KEY) || "[]");
      localStorage.setItem(LOGIN_RECENT_KEY, JSON.stringify([picked.id, ...prev.filter((id) => id !== picked.id)].slice(0, 4)));
    } catch (e) { /* per-device convenience only */ }
    authSignIn(picked, "login");
  };
  // sign in with employee number or username + password
  const empForm = document.getElementById("loginEmpForm");
  if (empForm) {
    // user + password everywhere; the demo also keeps the one-click list below it
    empForm.hidden = false;
    document.getElementById("loginPickToggle").hidden = isDemo;
    list.hidden = !isDemo;
    document.getElementById("loginStepPick").hidden = !isDemo;
    document.getElementById("loginPickToggle").onclick = () => { list.hidden = !list.hidden; document.getElementById("loginStepPick").hidden = list.hidden; };
    const empGo = async () => {
      const id = document.getElementById("loginEmpNo").value.trim().toLowerCase();
      const pw = document.getElementById("loginEmpPw").value;
      const u = users.find((x) => (x.empNo && x.empNo.toLowerCase() === id) || x.username === id);
      const err = document.getElementById("loginEmpErr");
      if (!u || !(await authCheckSecret(u, pw))) { err.hidden = false; document.getElementById("loginEmpPw").select(); return; }
      err.hidden = true;
      await loginFinish(u);
    };
    document.getElementById("loginEmpBtn").onclick = empGo;
    document.getElementById("loginEmpPw").onkeydown = (e) => { if (e.key === "Enter") empGo(); };
    document.getElementById("loginEmpNo").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("loginEmpPw").focus(); };
    if (!isDemo) setTimeout(() => document.getElementById("loginEmpNo").focus(), 0);
  }
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
    <button type="button" class="btn-chip" id="changePinBtn">เปลี่ยนรหัสผ่าน</button>
    <button type="button" class="btn-chip" id="logoutBtn">ออกจากระบบ</button>`;
  document.getElementById("logoutBtn").addEventListener("click", authSignOut);
  document.getElementById("mySignBtn").addEventListener("click", () => { if (typeof esOpenPad === "function") esOpenPad(renderUserChip); });
  document.getElementById("changePinBtn").addEventListener("click", async () => {
    const cur = prompt("รหัสผ่าน (หรือ PIN) ปัจจุบัน");
    if (cur === null) return;
    if (!(await authCheckSecret(AUTH_USER, cur))) { showToast("รหัสผ่านปัจจุบันไม่ถูกต้อง", "warn"); return; }
    if (!(await authPromptNewSecret(AUTH_USER, "เปลี่ยนรหัสผ่าน"))) return;
    authSave();
    auditLog("เปลี่ยนรหัสผ่าน", AUTH_USER.username, "");
    showToast("เปลี่ยนรหัสผ่านแล้ว", "good");
  });
}
