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
const DEPT_PAGES = { sales: ["service"], qc: ["service"], rnd: ["rnd", "service"], pur: ["p2p", "procurement"], wh: ["p2p"], plan: ["schedule"] };
// Other departments' document types a department head reads by default (least privilege — anything else
// is granted per group or per user in Admin). Sales orders reach planning only; supplier prices stay in purchasing.
const HEAD_RELATED = {
  rnd: ["ncr", "capa", "cc", "svc", "mc", "fi", "iqc", "plan"],
  plan: ["so", "mreq", "dpr", "grn", "stk", "ecr", "eo", "bom", "ncr", "fi", "iqc", "mtr"],
  prod: ["plan", "ecr", "eo", "wi", "dwg", "bom", "tq", "ncr", "capa", "fi", "iqc", "grn", "mtr", "pm"],
  qc: ["grn", "ecr", "eo", "wi", "dwg", "bom", "dpr", "cc", "svc", "mc", "tq"],
  pur: ["mrq", "grn", "iqc", "stk", "ncr", "capa", "mreq"],
  wh: ["mreq", "mrq", "iqc", "dpr"],
  mt: ["saf", "dpr", "ncr"],
  sales: ["plan", "fi", "ncr", "capa"],
};
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
    { id: "g-tech", name: "ช่างประกอบ / ช่างเทคนิค", desc: "เบิกวัสดุตาม BOM ดูใบสั่งผลิตและงานของตัวเอง", modules: ["bomx", "workorder", "mytasks"], docPerms: { mreq: "create", dpr: "create", ncr: "create" }, abilities: ["request"], members: ["op1"] },
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
  if (s === DEMO_PIN && authTrialDefault()) return ""; // trial period: 1234 is the agreed password
  const min = Math.max(4, Number(typeof AUTH !== "undefined" && AUTH && AUTH.loginPolicy && AUTH.loginPolicy.minLen) || 4); // Admin › การเข้าสู่ระบบ
  if (typeof s !== "string" || s.length < min) return `รหัสผ่านต้องยาวอย่างน้อย ${min} ตัว`;
  if (s.length > 32) return "รหัสผ่านยาวได้ไม่เกิน 32 ตัว";
  if (s === DEMO_PIN && !authTrialDefault()) return "ห้ามใช้ 1234 — ตั้งรหัสของตัวเอง";
  return "";
}
// trial period (Admin › การเข้าสู่ระบบ): everyone may sign in with 1234 without being asked to change it
function authTrialDefault() { return !!(typeof AUTH !== "undefined" && AUTH && AUTH.loginPolicy && AUTH.loginPolicy.trial1234); }
function authNeedsNewSecret(user) {
  const demo = typeof Y2JStore !== "undefined" && Y2JStore.config().demo;
  if (demo) return false;
  const onDefault = !user.pw && user.pin === pinHash(DEMO_PIN, user.id);
  if (authTrialDefault() && onDefault) return false;
  return !!(user.mustChange || onDefault);
}
// Password dialog (masked fields, show/hide) — resolves { cur, next } or null when cancelled.
// check(cur) may reject the current password before the dialog closes.
function authPwDialog(title, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let bd = document.getElementById("pwBackdrop");
    if (!bd) { bd = document.createElement("div"); bd.className = "modal-backdrop"; bd.id = "pwBackdrop"; document.body.appendChild(bd); }
    bd.innerHTML = `<form class="modal pw-modal" role="dialog" aria-labelledby="pwTitle" novalidate>
      <h3 id="pwTitle">${escapeHtml(title)}</h3>
      ${opts.note ? `<p class="muted-note">${escapeHtml(opts.note)}</p>` : ""}
      ${opts.needCurrent ? `<label>รหัสผ่านปัจจุบัน<input type="password" id="pwCur" autocomplete="current-password" maxlength="32"></label>` : ""}
      <label>รหัสผ่านใหม่ (4–32 ตัว)<input type="password" id="pwNew" autocomplete="new-password" maxlength="32"></label>
      <label>พิมพ์รหัสผ่านใหม่อีกครั้ง<input type="password" id="pwNew2" autocomplete="new-password" maxlength="32"></label>
      <label class="pw-show"><input type="checkbox" id="pwShow"> แสดงรหัสผ่าน</label>
      <p class="login-error" id="pwErr" hidden></p>
      <div class="modal-actions">${opts.required ? "" : `<button type="button" class="btn-secondary" id="pwCancel">ยกเลิก</button>`}<button type="submit" class="btn-primary">บันทึกรหัสผ่าน</button></div></form>`;
    const q = (id) => bd.querySelector("#" + id);
    const err = (m) => { q("pwErr").textContent = m; q("pwErr").hidden = false; };
    q("pwShow").addEventListener("change", (e) => bd.querySelectorAll("input[id^=pw][type=password], input[id^=pw][type=text]").forEach((i) => { if (i.id !== "pwShow") i.type = e.target.checked ? "text" : "password"; }));
    const done = (v) => { bd.classList.remove("open"); resolve(v); };
    if (q("pwCancel")) q("pwCancel").addEventListener("click", () => done(null));
    bd.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const cur = q("pwCur") ? q("pwCur").value : "";
      const a = q("pwNew").value, b = q("pwNew2").value;
      if (opts.check && !(await opts.check(cur))) { err("รหัสผ่านปัจจุบันไม่ถูกต้อง"); q("pwCur").select(); return; }
      const bad = authSecretProblem(a);
      if (bad) { err(bad); q("pwNew").focus(); return; }
      if (a !== b) { err("รหัสผ่านสองครั้งไม่ตรงกัน"); q("pwNew2").select(); return; }
      done({ cur, next: a });
    });
    bd.classList.add("open");
    setTimeout(() => (q("pwCur") || q("pwNew")).focus(), 30);
  });
}
// resolves true once a new password is stored on the user
async function authPromptNewSecret(user, title, required) {
  const r = await authPwDialog(title, { required, note: "ตั้งรหัสของตัวเอง ตัวอักษรหรือตัวเลขก็ได้ — ใช้ทั้งเข้าระบบและลงนามเอกสาร" });
  if (!r) return false;
  await authSetSecret(user, r.next);
  return true;
}

// Server sign-in (sign-in moved to Apps Script): the device proves the password with the same hash the
// app stores, the server checks it, counts failures, and hands back a session.
function authServerLogin() { return typeof Y2JStore !== "undefined" && Y2JStore.needLogin && Y2JStore.needLogin(); }
async function authLoginOnServer(user, secret) {
  const proof = user.iter ? await pwDerive(secret, user.id, user.iter) : "";
  return Y2JStore.login(user.username, proof, pinHash(secret, user.id));
}
// after a server sign-in the page reloads with the data; a temporary password is replaced right away
async function authAfterServerLogin() {
  let flag = "";
  try { flag = sessionStorage.getItem("y2j-must-change") || ""; sessionStorage.removeItem("y2j-must-change"); } catch (e) { /* ignore */ }
  if (!flag || !AUTH_USER || (typeof Y2JStore !== "undefined" && Y2JStore.config().demo)) return;
  if (await authPromptNewSecret(AUTH_USER, `สวัสดี ${AUTH_USER.name} — ใช้รหัสผ่านชั่วคราวอยู่ ตั้งรหัสใหม่ก่อนใช้งาน`, true)) {
    authSave();
    auditLog("ตั้งรหัสผ่านใหม่", AUTH_USER.username, "ตอนเข้าสู่ระบบครั้งแรก");
    showToast("ตั้งรหัสผ่านแล้ว", "good");
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
      // The public DEMO holds demo-company users only. A company account that reached it (a device that
      // switched between the two) is dropped here, and the cleaned list syncs back to the demo sheet.
      let leaked = false;
      if (typeof Y2JStore !== "undefined" && Y2JStore.config().demo) {
        const keep = AUTH.users.filter((u) => u.company === "demo");
        leaked = keep.length && keep.length < AUTH.users.length;
        if (leaked) AUTH.users = keep;
      }
      // users created before companies existed belong to the original company (admins/executives: group level)
      let migrated = leaked;
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
      // one-time (least privilege review 28 ก.ย.): assembly technicians' group no longer opens the customer-service page
      if (!AUTH.permsV2) {
        const t = (AUTH.groups || []).find((g) => g.id === "g-tech");
        if (t && Array.isArray(t.modules)) t.modules = t.modules.filter((m) => m !== "service");
        AUTH.permsV2 = true;
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
  if (authServerLogin()) {
    AUTH = { users: (Y2JStore.roster() || []).map((u) => Object.assign({}, u)), groups: [], teams: [], serverLogin: true };
    AUTH_USER = null;
    return false;
  }
  let id = null;
  try { id = localStorage.getItem(SESSION_STORAGE_KEY); } catch (e) { /* ignore */ }
  // server sign-in: the person on screen must be the person the server session belongs to — otherwise
  // (signed out while a reload cut in, or someone else's session left behind) start over at the server
  if (typeof Y2JStore !== "undefined" && Y2JStore.secure && Y2JStore.secure() && (!id || id !== Y2JStore.sessionUid())) {
    Y2JStore.dropSession();
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* ignore */ }
    AUTH = { users: [], groups: [], teams: [], serverLogin: true };
    AUTH_USER = null;
    location.reload();
    return false;
  }
  authLoad();
  const u = id ? authUserById(id) : null;
  AUTH_USER = u && u.active ? u : null;
  if (AUTH_USER) setTimeout(authAfterServerLogin, 400);
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

async function authSignOut() {
  auditLog("ออกจากระบบ", AUTH_USER ? AUTH_USER.username : "", "");
  if (typeof Y2JStore !== "undefined" && Y2JStore.secure && Y2JStore.secure()) {
    try { await Y2JStore.flush(); } catch (e) { /* unsent work stays on this device */ }
    await Y2JStore.logout();
  }
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
  // pages that come with a department (customers → sales/QC/R&D, purchasing → purchasing/store, R&D → R&D)
  if (!Array.isArray(u.modules)) (DEPT_PAGES[u.dept] || []).forEach((m) => { if (!list.includes(m)) list.push(m); });
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
    if (CROSS_CREATE_TYPES.includes(type)) return "create";
    // other departments' documents: only the kinds that feed this department's own work
    return (HEAD_RELATED[user.dept] || []).includes(type) ? "view" : "none";
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

// A document names this person: they made it, own it, were assigned to it, or receive from it
function authDocInvolves(doc, u) {
  u = u || AUTH_USER;
  if (!u || !doc) return false;
  return doc.createdBy === u.id || doc.receiver === u.id || doc.owner === u.name || doc.tech === u.name || doc.assignee === u.name
    || doc.requestedBy === u.name || (Array.isArray(doc.assignees) && doc.assignees.includes(u.id));
}
// "May raise it" (repair, defect, safety, requisition … from any department) is not "may read everyone's":
// people whose only right to a type is raising it see the ones that involve them.
function authCreateOnly(type, user) {
  const u = user || AUTH_USER;
  if (!u || ["admin", "plant", "group"].includes(u.role)) return false;
  if (u.role === "depthead" && (HEAD_RELATED[u.dept] || []).includes(type)) return false;
  // approving or issuing requisitions means reading them
  if (type === "mreq" && (authHasAbility("approve", u) || authHasAbility("issue", u))) return false;
  // an explicit "view" or "manage" (per user or group) opens them all; "create" alone stays create-only
  const grants = [(u.docPerms || {})[type]].concat(authUserGroups(u).map((g) => (g.docPerms || {})[type])).filter(Boolean);
  if (grants.some((p) => p === "view" || p === "manage")) return false;
  const ownDept = DEPT_WORKSPACES.find((w) => w.id === u.dept);
  const own = !!ownDept && ownDept.docTypes.includes(type);
  // prices, customers, supplier ratings: staff read the ones they are part of, even in their own department
  if (SENSITIVE_DOC_TYPES.includes(type)) return u.role === "operator";
  if (own) return false;
  return CROSS_CREATE_TYPES.includes(type);
}
function authCanSeeDoc(type, doc) {
  if (!AUTH_USER) return false; // nothing is readable before signing in
  if (authDocInvolves(doc)) return visAllows(doc.visibility, doc.createdBy) || doc.createdBy === AUTH_USER.id || doc.receiver === AUTH_USER.id;
  if (!authCan(type, "view") || authCreateOnly(type)) return false;
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
  if (Y2JStore.isRemote() && Y2JStore.secure && Y2JStore.secure()) {
    box.className = "login-conn login-conn-ok";
    box.innerHTML = Y2JStore.roster()
      ? "🔒 ตรวจรหัสผ่านที่เซิร์ฟเวอร์ — ผิด 5 ครั้งระงับ 15 นาที · ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้ 6 ชั่วโมง"
      : "⚠ ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วโหลดหน้านี้ใหม่";
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
  // server sign-in: true when signed in (the page reloads), or shows the server's message in errEl
  const serverGo = async (user, secret, errEl, btn) => {
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "กำลังตรวจ…"; }
    try {
      const res = await authLoginOnServer(user, secret);
      try {
        const prev = JSON.parse(localStorage.getItem(LOGIN_RECENT_KEY) || "[]");
        localStorage.setItem(LOGIN_RECENT_KEY, JSON.stringify([user.id, ...prev.filter((id) => id !== user.id)].slice(0, 4)));
        localStorage.setItem(SESSION_STORAGE_KEY, res.uid);
        if (res.mustChange) sessionStorage.setItem("y2j-must-change", "1");
      } catch (e) { /* ignore */ }
      location.reload();
      return true;
    } catch (e) {
      errEl.textContent = e.message === "Failed to fetch" ? "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ต" : e.message;
      errEl.hidden = false;
      if (btn) { btn.disabled = false; btn.textContent = label; }
      return false;
    }
  };
  const submit = async () => {
    if (!picked) return;
    const errEl = document.getElementById("loginError");
    if (AUTH.serverLogin) { if (!(await serverGo(picked, pinInput.value, errEl, document.getElementById("loginSubmit")))) pinInput.select(); return; }
    if (!(await authCheckSecret(picked, pinInput.value))) {
      errEl.textContent = "รหัสผ่านไม่ถูกต้อง";
      errEl.hidden = false;
      pinInput.select();
      return;
    }
    await loginFinish(picked);
  };
  const loginFinish = async (user) => {
    if (authNeedsNewSecret(user)) {
      if (!(await authPromptNewSecret(user, `สวัสดี ${user.name} — ใช้รหัสผ่านชั่วคราวอยู่ ตั้งรหัสใหม่ก่อนใช้งาน`, true))) return;
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
    // two ways in, picked by tab and remembered per device: username/employee no. + password, or the people list
    const MODE_KEY = "y2j-login-mode-v1";
    const setMode = (mode) => {
      empForm.hidden = mode !== "pass";
      list.hidden = mode !== "pick";
      if (mode === "pass") pinBox.hidden = true;
      document.querySelectorAll(".login-mode").forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* per-device preference only */ }
      if (mode === "pass") setTimeout(() => document.getElementById("loginEmpNo").focus(), 0);
    };
    document.querySelectorAll(".login-mode").forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    let saved = "";
    try { saved = localStorage.getItem(MODE_KEY) || ""; } catch (e) { /* ignore */ }
    // company policy (Admin › การเข้าสู่ระบบ): employee no. + password only — the people list is not offered (DEMO always shows it)
    const passOnly = !isDemo && AUTH.loginPolicy && AUTH.loginPolicy.modes === "pass";
    document.querySelectorAll('.login-mode[data-mode="pick"]').forEach((b) => { b.hidden = passOnly; });
    setMode(passOnly ? "pass" : saved === "pick" || saved === "pass" ? saved : isDemo ? "pick" : "pass");
    const empGo = async () => {
      const id = document.getElementById("loginEmpNo").value.trim().toLowerCase();
      const pw = document.getElementById("loginEmpPw").value;
      const u = users.find((x) => (x.empNo && x.empNo.toLowerCase() === id) || String(x.username || "").toLowerCase() === id);
      const err = document.getElementById("loginEmpErr");
      if (AUTH.serverLogin) {
        if (!u) { err.textContent = "ไม่พบรหัสพนักงาน / ชื่อผู้ใช้นี้"; err.hidden = false; return; }
        if (!(await serverGo(u, pw, err, document.getElementById("loginEmpBtn")))) document.getElementById("loginEmpPw").select();
        return;
      }
      if (!u || !(await authCheckSecret(u, pw))) { err.textContent = "ชื่อผู้ใช้/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง"; err.hidden = false; document.getElementById("loginEmpPw").select(); return; }
      err.hidden = true;
      await loginFinish(u);
    };
    document.getElementById("loginEmpBtn").onclick = empGo;
    document.getElementById("loginEmpPw").onkeydown = (e) => { if (e.key === "Enter") empGo(); };
    document.getElementById("loginEmpNo").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("loginEmpPw").focus(); };
  }
  document.getElementById("loginSubmit").onclick = submit;
  pinInput.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  loginExtras(users);
}

// 👁 show password, 🪪 scan an employee badge, "forgot password" — added once per page
function loginExtras(users) {
  ["loginEmpPw", "loginPin"].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp || inp.dataset.eye) return;
    inp.dataset.eye = "1";
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn-chip login-eye"; b.textContent = "👁"; b.title = "แสดง / ซ่อนรหัสผ่าน"; b.setAttribute("aria-label", b.title);
    b.addEventListener("click", () => { inp.type = inp.type === "password" ? "text" : "password"; inp.focus(); });
    inp.insertAdjacentElement("afterend", b);
  });
  const form = document.getElementById("loginEmpForm");
  if (form && !document.getElementById("loginBadgeBtn")) {
    const admins = users.filter((u) => u.role === "admin" && !/^u-demo-/.test(u.id)).map((u) => u.name);
    form.insertAdjacentHTML("beforeend", `<div class="login-more">
      <button type="button" class="btn-chip" id="loginBadgeBtn">🪪 สแกนบัตรพนักงาน</button>
      <button type="button" class="btn-link" id="loginForgot">ลืมรหัสผ่าน?</button></div>
      <p class="muted-note" id="loginForgotMsg" hidden>ให้ผู้ดูแลระบบตั้งรหัสชั่วคราวให้ (Admin › ผู้ใช้ › แก้ไข)${admins.length ? `: ${escapeHtml(admins.join(", "))}` : ""} — เข้าระบบด้วยรหัสชั่วคราวแล้วระบบจะให้ตั้งรหัสใหม่ทันที</p>`);
    document.getElementById("loginForgot").addEventListener("click", () => { const m = document.getElementById("loginForgotMsg"); m.hidden = !m.hidden; });
    document.getElementById("loginBadgeBtn").addEventListener("click", () => {
      if (typeof snScan !== "function") return;
      snScan("สแกน QR บนบัตรพนักงาน", (code) => {
        const v = String(code || "").trim().replace(/^forge:u:/i, "");
        const u = users.find((x) => (x.empNo && x.empNo.toLowerCase() === v.toLowerCase()) || String(x.username || "").toLowerCase() === v.toLowerCase());
        if (!u) { showToast(`ไม่รู้จักบัตรนี้ (${v})`, "warn"); return true; }
        if (typeof snCloseModal === "function") snCloseModal();
        document.getElementById("loginEmpNo").value = u.empNo || u.username;
        const pw = document.getElementById("loginEmpPw"); pw.value = ""; pw.focus();
        showToast(`${u.name} — ใส่รหัสผ่าน`, "good");
        return false;
      });
    });
  }
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
    const r = await authPwDialog("เปลี่ยนรหัสผ่าน", { needCurrent: true, check: (cur) => authCheckSecret(AUTH_USER, cur) });
    if (!r) return;
    await authSetSecret(AUTH_USER, r.next);
    authSave();
    auditLog("เปลี่ยนรหัสผ่าน", AUTH_USER.username, "");
    showToast("เปลี่ยนรหัสผ่านแล้ว", "good");
  });
}
