/* ==========================================================================
   Admin page — manage users (profile, role, department, teams, PIN, which
   pages they see and what they may do with each document type), teams, and
   browse / export the audit trail.
   ========================================================================== */

let adminTab = "users";
let adminEditingUser = null; // user id, or "" when adding
let adminEditingTeam = null;

function renderAdmin() {
  if (!authIsAdmin()) return;
  document.querySelectorAll(".admin-tab").forEach((b) => {
    const on = b.dataset.tab === adminTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.querySelectorAll(".admin-panel").forEach((p) => { p.hidden = p.dataset.panel !== adminTab; });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("adminStatUsers", AUTH.users.filter((u) => u.active).length);
  set("adminStatTeams", AUTH.teams.length);
  const log = auditLoad();
  const today = new Date().toISOString().slice(0, 10);
  set("adminStatToday", log.filter((e) => e.ts.slice(0, 10) === today).length);
  set("adminStatConf", Object.keys(DEPT_DOCS).reduce((s, t) => s + (DEPT_DOCS[t] || []).filter((d) => d.visibility && d.visibility.mode !== "all").length, 0));
  if (adminTab === "users") renderAdminUsers();
  if (adminTab === "teams") renderAdminTeams();
  if (adminTab === "groups") renderAdminGroups();
  if (adminTab === "integrity") renderAdminIntegrity();
  if (adminTab === "audit") renderAdminAudit();
  if (adminTab === "storage") renderAdminStorage();
  if (adminTab === "org" && typeof renderAdminOrg === "function") renderAdminOrg();
  if (adminTab === "naming" && typeof renderAdminNaming === "function") renderAdminNaming();
}

/* ---- storage location ------------------------------------------------------ */

function renderAdminStorage() {
  if (typeof Y2JStore === "undefined") return;
  const c = Y2JStore.config();
  const st = Y2JStore.status();
  const remote = Y2JStore.isRemote();
  document.getElementById("stUrl").value = c.url || "";
  document.getElementById("stToken").value = c.token || "";
  document.getElementById("stConnectedActions").hidden = !remote;
  document.getElementById("stConnectBtn").textContent = remote ? "บันทึกการตั้งค่าใหม่" : "เชื่อมต่อ Google Sheets";
  document.getElementById("storageStatus").innerHTML = remote
    ? `<div class="storage-mode storage-sheets">☁ ตอนนี้เก็บข้อมูลที่ <strong>Google Sheets</strong> — ทุกเครื่องที่เชื่อมต่อเห็นข้อมูลชุดเดียวกัน</div>
       <div class="muted-inline">สถานะ: ${st.state === "synced" ? "ซิงก์แล้ว" : st.state === "saving" ? "กำลังบันทึก" : "ออฟไลน์ — จะส่งเมื่อเน็ตกลับมา"}${st.pending.length ? ` · รอส่ง ${st.pending.length} ชุดข้อมูล` : ""}${st.error ? ` · ${escapeHtml(st.error)}` : ""}</div>`
    : `<div class="storage-mode storage-local">💻 ตอนนี้เก็บข้อมูลใน <strong>เบราว์เซอร์เครื่องนี้</strong> เท่านั้น — เครื่องอื่นจะไม่เห็นข้อมูลเดียวกัน</div>`;
}

async function adminStorageTest() {
  const url = document.getElementById("stUrl").value.trim();
  const token = document.getElementById("stToken").value.trim();
  const out = document.getElementById("stTestResult");
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { out.textContent = "URL ต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec"; return null; }
  if (!token) { out.textContent = "กรุณาใส่รหัสลับจากแท็บ _ตั้งค่า"; return null; }
  out.textContent = "กำลังทดสอบ…";
  try {
    const r = await Y2JStore.test(url, token);
    out.textContent = `✔ เชื่อมต่อได้ — ไฟล์ "${r.name}" (มีข้อมูล ${r.keys} ชุด)`;
    return r;
  } catch (e) {
    out.textContent = `✖ เชื่อมต่อไม่ได้: ${e.message === "Failed to fetch" ? "ตรวจ URL / ตั้งค่า Deploy เป็น 'ทุกคน' / อินเทอร์เน็ต" : e.message}`;
    return null;
  }
}

/* ---- users ------------------------------------------------------------------ */

function renderAdminUsers() {
  const tbody = document.querySelector("#adminUserTable tbody");
  tbody.innerHTML = AUTH.users.map((u) => {
    const custom = Object.keys(u.docPerms || {}).length || Array.isArray(u.modules);
    return `<tr class="${u.active ? "" : "row-muted"}">
      <td><strong>${escapeHtml(u.name)}</strong><div class="pilot-kpi-method">${escapeHtml(u.position || "")}</div></td>
      <td class="mono-cell">${escapeHtml(u.username)}</td>
      <td>${escapeHtml(authRoleLabel(u.role))}</td>
      <td>${escapeHtml(authDeptName(u.dept))}<div class="pilot-kpi-method">${u.company ? escapeHtml((typeof orgCompany === "function" && orgCompany(u.company) || {}).short || u.company) : "ทุกบริษัท (กลุ่ม)"}</div></td>
      <td>${authUserGroups(u).map((g) => `<span class="pill pill-schedule">${escapeHtml(g.name)}</span>`).join(" ")} ${(u.teams || []).map((t) => (authTeamById(t) || {}).name).filter(Boolean).map((n) => `<span class="pill pill-eliminate">${escapeHtml(n)}</span>`).join(" ") || (authUserGroups(u).length ? "" : "—")}</td>
      <td>${custom ? '<span class="pill pill-schedule">กำหนดเอง</span>' : '<span class="muted-inline">ตามบทบาท</span>'}</td>
      <td>${u.active ? '<span class="pill pill-good">ใช้งาน</span>' : '<span class="pill pill-critical">ปิดใช้งาน</span>'}</td>
      <td>${u.lastLogin ? fmtDateTime(u.lastLogin) : "—"}</td>
      <td class="wo-actions-cell">
        <button class="btn-chip" type="button" data-edit="${escapeHtml(u.id)}">แก้ไข / สิทธิ์</button>
        ${u.active && u.id !== AUTH_USER.id ? `<button class="btn-chip" type="button" data-as="${escapeHtml(u.id)}">เข้าใช้เป็นผู้ใช้นี้</button>` : ""}
      </td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openUserEditor(b.dataset.edit)));
  tbody.querySelectorAll("[data-as]").forEach((b) => b.addEventListener("click", () => {
    const u = authUserById(b.dataset.as);
    if (confirm(`เข้าใช้ระบบเป็น "${u.name}" เพื่อดูสิ่งที่ผู้ใช้นี้เห็น? (ออกจากระบบแล้วเข้าใหม่ด้วยบัญชี admin เพื่อกลับ)`)) authSignIn(u, "impersonate");
  }));
}

function permSelect(type, value, roleDefault) {
  return `<select class="perm-select perm-${value}" data-perm="${escapeHtml(type)}" aria-label="สิทธิ์ ${escapeHtml(type)}">
    <option value="">ตามบทบาท/กลุ่ม (${escapeHtml(PERM_LEVELS.find((p) => p.id === roleDefault).label)})</option>
    ${PERM_LEVELS.map((p) => `<option value="${p.id}"${p.id === value ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
  </select>`;
}

function openUserEditor(id) {
  const isNew = !id;
  const u = isNew
    ? { id: "", username: "", name: "", role: "operator", dept: "prod", position: "", teams: [], active: true, modules: null, docPerms: {} }
    : authUserById(id);
  adminEditingUser = isNew ? "" : id;
  document.getElementById("userEdTitle").textContent = isNew ? "เพิ่มผู้ใช้งาน" : `แก้ไขผู้ใช้: ${u.name}`;
  document.getElementById("ue_name").value = u.name;
  document.getElementById("ue_username").value = u.username;
  document.getElementById("ue_position").value = u.position || "";
  document.getElementById("ue_role").innerHTML = AUTH_ROLES.map((r) => `<option value="${r.id}"${r.id === u.role ? " selected" : ""}>${escapeHtml(r.label)}</option>`).join("");
  document.getElementById("ue_company").innerHTML = `<option value="">ทุกบริษัท (ระดับกลุ่ม)</option>`
    + (typeof orgCompanies === "function" ? orgCompanies() : []).map((c) => `<option value="${escapeHtml(c.id)}"${c.id === (isNew ? orgCurrentId() : u.company) ? " selected" : ""}>${escapeHtml(c.short)} — ${escapeHtml(c.name)}</option>`).join("");
  document.getElementById("ue_dept").innerHTML = `<option value="">ส่วนกลาง (ไม่สังกัดแผนก)</option>` + DEPT_WORKSPACES.map((w) => `<option value="${w.id}"${w.id === u.dept ? " selected" : ""}>${escapeHtml(w.name)}</option>`).join("");
  document.getElementById("ue_pin").value = "";
  document.getElementById("ue_pin").placeholder = isNew ? `ไม่กรอก = ${DEMO_PIN}` : "ไม่กรอก = ใช้ PIN เดิม";
  document.getElementById("ue_active").checked = u.active !== false;
  document.getElementById("ue_active").disabled = !isNew && u.id === AUTH_USER.id;
  document.getElementById("ue_groups").innerHTML = (AUTH.groups || []).map((g) => `<label class="vis-opt" title="${escapeHtml(g.desc || "")}"><input type="checkbox" value="${g.id}"${(u.groups || []).includes(g.id) ? " checked" : ""}> ${escapeHtml(g.name)}</label>`).join("") || '<span class="muted-inline">ยังไม่มีกลุ่ม — สร้างได้ที่แท็บ "กลุ่มผู้ใช้"</span>';
  document.getElementById("ue_teams").innerHTML = AUTH.teams.map((t) => `<label class="vis-opt"><input type="checkbox" value="${t.id}"${(u.teams || []).includes(t.id) ? " checked" : ""}> ${escapeHtml(t.name)}</label>`).join("") || '<span class="muted-inline">ยังไม่มีทีม — สร้างได้ที่แท็บ "ทีม"</span>';
  renderUserEditorPerms(u);
  document.getElementById("userEdBackdrop").classList.add("open");
}

// Page + document permissions depend on role/department, so re-render when those change
function renderUserEditorPerms(u) {
  const groupBoxes = document.querySelectorAll("#ue_groups input");
  const draft = Object.assign({}, u, {
    role: document.getElementById("ue_role").value || u.role,
    dept: document.getElementById("ue_dept").value,
    groups: groupBoxes.length ? [...groupBoxes].filter((i) => i.checked).map((i) => i.value) : (u.groups || []),
  });
  const mods = Array.isArray(u.modules) ? u.modules : authAllowedModules(Object.assign({}, draft, { modules: null }));
  const customMods = Array.isArray(u.modules);
  document.getElementById("ue_modCustom").checked = customMods;
  document.getElementById("ue_modules").innerHTML = ALL_VIEWS
    .filter((v) => v[0] !== "admin" || draft.role === "admin")
    .map((v) => `<label class="vis-opt"><input type="checkbox" value="${v[0]}"${mods.includes(v[0]) ? " checked" : ""}${customMods ? "" : " disabled"}> ${escapeHtml(v[1])}</label>`).join("");

  document.getElementById("ue_perms").innerHTML = DEPT_WORKSPACES.map((ws) => `
    <div class="perm-dept">
      <div class="perm-dept-title">${escapeHtml(ws.name)}</div>
      ${ws.docTypes.map((t) => {
        const cur = (u.docPerms || {})[t] || "";
        return `<div class="perm-row"><span>${escapeHtml(DOC_TYPES[t].abbr)} — ${escapeHtml(DOC_TYPES[t].name.split(" — ").pop())}</span>${permSelect(t, cur, authDefaultDocPerm(draft, t))}</div>`;
      }).join("")}
    </div>`).join("");
}

function readUserEditor() {
  const u = adminEditingUser ? authUserById(adminEditingUser) : null;
  const name = document.getElementById("ue_name").value.trim();
  const username = document.getElementById("ue_username").value.trim().toLowerCase();
  if (!name) { document.getElementById("ue_name").focus(); return null; }
  if (!/^[a-z0-9._-]{2,20}$/.test(username)) { showToast("ชื่อผู้ใช้: a-z, 0-9, . _ - ยาว 2–20 ตัว", "warn"); document.getElementById("ue_username").focus(); return null; }
  if (AUTH.users.some((x) => x.username === username && x !== u)) { showToast("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "warn"); return null; }
  const pin = document.getElementById("ue_pin").value.trim();
  if (pin && !/^\d{4,6}$/.test(pin)) { showToast("PIN ต้องเป็นตัวเลข 4–6 หลัก", "warn"); return null; }
  const docPerms = {};
  document.querySelectorAll("#ue_perms [data-perm]").forEach((s) => { if (s.value) docPerms[s.dataset.perm] = s.value; });
  const modules = document.getElementById("ue_modCustom").checked
    ? [...document.querySelectorAll("#ue_modules input:checked")].map((i) => i.value)
    : null;
  return {
    name, username, pinPlain: pin,
    position: document.getElementById("ue_position").value.trim(),
    role: document.getElementById("ue_role").value,
    dept: document.getElementById("ue_dept").value,
    company: document.getElementById("ue_company").value,
    active: document.getElementById("ue_active").checked,
    teams: [...document.querySelectorAll("#ue_teams input:checked")].map((i) => i.value),
    groups: [...document.querySelectorAll("#ue_groups input:checked")].map((i) => i.value),
    modules, docPerms,
  };
}

function saveUserEditor() {
  const read = readUserEditor();
  if (!read) return;
  const { pinPlain, ...data } = read; // never store the plain PIN
  if (!adminEditingUser) {
    const id = "u-" + Date.now().toString(36);
    const u = Object.assign({ id, createdAt: new Date().toISOString(), lastLogin: "" }, data);
    u.pin = pinHash(pinPlain || DEMO_PIN, id);
    AUTH.users.push(u);
    auditLog("เพิ่มผู้ใช้", u.username, `${u.name} · ${authRoleLabel(u.role)} · ${authDeptName(u.dept)}`);
  } else {
    const u = authUserById(adminEditingUser);
    const fields = [
      { key: "name", label: "ชื่อ" }, { key: "username", label: "ชื่อผู้ใช้" }, { key: "position", label: "ตำแหน่ง" },
      { key: "role", label: "บทบาท" }, { key: "dept", label: "แผนก" }, { key: "company", label: "บริษัท" }, { key: "active", label: "สถานะ" },
    ];
    const before = Object.assign({}, u, { teams: (u.teams || []).join(","), groups: (u.groups || []).join(","), modules: JSON.stringify(u.modules), docPerms: JSON.stringify(u.docPerms || {}) });
    Object.assign(u, data);
    if (pinPlain) u.pin = pinHash(pinPlain, u.id);
    const after = Object.assign({}, u, { teams: (u.teams || []).join(","), groups: (u.groups || []).join(","), modules: JSON.stringify(u.modules), docPerms: JSON.stringify(u.docPerms || {}) });
    const changes = [auditDiff(before, after, fields)];
    if (before.teams !== after.teams) changes.push("ทีม: เปลี่ยน");
    if (before.groups !== after.groups) changes.push(`กลุ่ม: ${authUserGroups(u).map((g) => g.name).join(", ") || "ไม่มี"}`);
    if (before.modules !== after.modules) changes.push("สิทธิ์เข้าหน้า: เปลี่ยน");
    if (before.docPerms !== after.docPerms) changes.push("สิทธิ์เอกสาร: เปลี่ยน");
    if (pinPlain) changes.push("รีเซ็ต PIN");
    auditLog("แก้ไขผู้ใช้", u.username, changes.filter(Boolean).join(" · ") || "ไม่มีการเปลี่ยนแปลง");
  }
  authSave();
  document.getElementById("userEdBackdrop").classList.remove("open");
  renderAdmin();
  showToast("บันทึกผู้ใช้แล้ว — มีผลเมื่อผู้ใช้เข้าสู่ระบบครั้งถัดไป", "good");
}

/* ---- user groups (reusable permission sets) --------------------------------------- */

let adminEditingGroup = null;

function renderAdminGroups() {
  const wrap = document.getElementById("adminGroupList");
  const pageName = (id) => (ALL_VIEWS.find((v) => v[0] === id) || [id, id])[1];
  wrap.innerHTML = (AUTH.groups || []).map((g) => {
    const members = AUTH.users.filter((u) => (u.groups || []).includes(g.id));
    const perms = Object.keys(g.docPerms || {});
    return `<div class="team-card">
      <div class="team-card-head"><strong>${escapeHtml(g.name)}</strong><button class="btn-chip" type="button" data-group="${escapeHtml(g.id)}">แก้ไข</button></div>
      ${g.desc ? `<div class="pilot-kpi-method">${escapeHtml(g.desc)}</div>` : ""}
      <div class="grp-line"><span class="grp-label">สมาชิก ${members.length} คน:</span> ${members.map((m) => `<span class="pill pill-eliminate">${escapeHtml(m.name)}</span>`).join(" ") || '<span class="muted-inline">ยังไม่มี</span>'}</div>
      <div class="grp-line"><span class="grp-label">หน้า:</span> ${(g.modules || []).map((m) => escapeHtml(pageName(m))).join(" · ") || "—"}</div>
      <div class="grp-line"><span class="grp-label">สิทธิ์พิเศษ:</span> ${(g.abilities || []).map((a) => `<span class="pill pill-schedule">${escapeHtml((GROUP_ABILITIES.find((x) => x[0] === a) || [a, a])[1])}</span>`).join(" ") || "—"}</div>
      <div class="grp-line"><span class="grp-label">สิทธิ์เอกสาร:</span> ${perms.map((t) => `${escapeHtml((DOC_TYPES[t] || { abbr: t }).abbr)}=${escapeHtml((PERM_LEVELS.find((p) => p.id === g.docPerms[t]) || {}).label || g.docPerms[t])}`).join(", ") || "ตามบทบาท"}</div>
    </div>`;
  }).join("") || '<p class="muted-note">ยังไม่มีกลุ่ม</p>';
  wrap.querySelectorAll("[data-group]").forEach((b) => b.addEventListener("click", () => openGroupEditor(b.dataset.group)));
}

function openGroupEditor(id) {
  adminEditingGroup = id || "";
  const g = id ? authGroupById(id) : { name: "", desc: "", modules: [], docPerms: {}, abilities: [] };
  if (!g) return;
  const chk = (cls, val, label, on) => `<label class="vis-opt"><input type="checkbox" class="${cls}" value="${escapeHtml(val)}"${on ? " checked" : ""}> ${escapeHtml(label)}</label>`;
  document.getElementById("groupEdBody").innerHTML = `
    <h3>${id ? `แก้ไขกลุ่ม: ${escapeHtml(g.name)}` : "สร้างกลุ่มผู้ใช้ใหม่"}</h3>
    <div class="modal-grid">
      <div class="form-field"><label for="ge_name">ชื่อกลุ่ม *</label><input id="ge_name" value="${escapeHtml(g.name)}" placeholder="เช่น ช่างเชื่อม ไลน์ 2"></div>
      <div class="form-field"><label for="ge_desc">คำอธิบาย</label><input id="ge_desc" value="${escapeHtml(g.desc || "")}" placeholder="กลุ่มนี้ทำอะไร"></div>
    </div>
    <div class="ue-section-title">สมาชิก</div>
    <div class="vis-group">${AUTH.users.filter((u) => u.active).map((u) => chk("ge-mem", u.id, `${u.name} (${authDeptName(u.dept)})`, id && (u.groups || []).includes(id))).join("")}</div>
    <div class="ue-section-title">สิทธิ์พิเศษ</div>
    <div class="vis-group">${GROUP_ABILITIES.map(([a, label]) => chk("ge-abl", a, label, (g.abilities || []).includes(a))).join("")}</div>
    <div class="ue-section-title">หน้าที่เพิ่มให้สมาชิก <span class="muted-inline">(รวมกับหน้าตามบทบาท)</span></div>
    <div class="vis-group">${ALL_VIEWS.filter((v) => v[0] !== "admin").map((v) => chk("ge-mod", v[0], v[1], (g.modules || []).includes(v[0]))).join("")}</div>
    <div class="ue-section-title">สิทธิ์ต่อเอกสาร <span class="muted-inline">(ว่าง = ไม่เพิ่ม ใช้ตามบทบาท · ถ้าตั้งไว้และสูงกว่าบทบาทจะใช้ของกลุ่ม)</span></div>
    <div class="perm-grid">${DEPT_WORKSPACES.map((ws) => `<div class="perm-dept"><div class="perm-dept-title">${escapeHtml(ws.name)}</div>${ws.docTypes.map((t) => `<div class="perm-row"><span>${escapeHtml(DOC_TYPES[t].abbr)} — ${escapeHtml(DOC_TYPES[t].name.split(" — ").pop())}</span>
      <select class="perm-select ge-perm" data-perm="${escapeHtml(t)}" aria-label="สิทธิ์ ${escapeHtml(t)}"><option value="">—</option>${PERM_LEVELS.map((p) => `<option value="${p.id}"${(g.docPerms || {})[t] === p.id ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}</select></div>`).join("")}</div>`).join("")}</div>
    <div class="modal-actions">
      ${id ? `<button type="button" class="btn-secondary" id="ge_delete">ลบกลุ่ม</button>` : ""}
      <button type="button" class="btn-secondary" id="ge_cancel">ยกเลิก</button>
      <button type="button" class="btn-primary" id="ge_save">บันทึก</button>
    </div>`;
  const bd = document.getElementById("groupEdBackdrop");
  document.getElementById("ge_cancel").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("ge_save").addEventListener("click", saveGroupEditor);
  if (id) document.getElementById("ge_delete").addEventListener("click", deleteGroup);
  bd.classList.add("open");
}

function saveGroupEditor() {
  const name = document.getElementById("ge_name").value.trim();
  if (!name) { document.getElementById("ge_name").focus(); return; }
  AUTH.groups = AUTH.groups || [];
  let id = adminEditingGroup;
  let g = id ? authGroupById(id) : null;
  if (!g) { id = "g-" + Date.now().toString(36); g = { id }; AUTH.groups.push(g); }
  const vals = (cls) => [...document.querySelectorAll(`#groupEdBody .${cls}:checked`)].map((i) => i.value);
  const docPerms = {};
  document.querySelectorAll("#groupEdBody .ge-perm").forEach((s) => { if (s.value) docPerms[s.dataset.perm] = s.value; });
  Object.assign(g, { name, desc: document.getElementById("ge_desc").value.trim(), modules: vals("ge-mod"), abilities: vals("ge-abl"), docPerms });
  const members = vals("ge-mem");
  AUTH.users.forEach((u) => {
    const has = (u.groups || []).includes(id);
    if (members.includes(u.id) && !has) u.groups = (u.groups || []).concat(id);
    if (!members.includes(u.id) && has) u.groups = u.groups.filter((x) => x !== id);
  });
  authSave();
  auditLog(adminEditingGroup ? "แก้ไขกลุ่มผู้ใช้" : "สร้างกลุ่มผู้ใช้", name, `สมาชิก ${members.length} คน · หน้า ${g.modules.length} · สิทธิ์พิเศษ ${g.abilities.map((a) => (GROUP_ABILITIES.find((x) => x[0] === a) || [a, a])[1]).join(", ") || "-"} · เอกสาร ${Object.keys(docPerms).length} ชนิด`);
  document.getElementById("groupEdBackdrop").classList.remove("open");
  renderAdmin();
  showToast(`บันทึกกลุ่ม "${name}" แล้ว — มีผลเมื่อสมาชิกโหลดหน้าใหม่`, "good");
}

function deleteGroup() {
  const g = authGroupById(adminEditingGroup);
  if (!g || !confirm(`ลบกลุ่ม "${g.name}"? สมาชิกจะเหลือสิทธิ์ตามบทบาทและที่ตั้งรายคน`)) return;
  AUTH.groups = AUTH.groups.filter((x) => x.id !== g.id);
  AUTH.users.forEach((u) => { u.groups = (u.groups || []).filter((x) => x !== g.id); });
  authSave();
  auditLog("ลบกลุ่มผู้ใช้", g.name, "");
  document.getElementById("groupEdBackdrop").classList.remove("open");
  renderAdmin();
}

/* ---- consistency check ------------------------------------------------------------ */

function renderAdminIntegrity() {
  if (typeof icRun !== "function") return;
  const all = icRun();
  const sev = document.getElementById("icSev").value;
  const list = all.filter((f) => sev === "all" || f.sev === "error" || (sev === "warn" && f.sev === "warn"));
  const n = icSummary(all);
  document.getElementById("icSummary").textContent = `ผิดพลาด ${n.error} · ควรตรวจ ${n.warn} · ข้อสังเกต ${n.info} (ตรวจเมื่อ ${fmtDateTime(new Date().toISOString())})`;
  const box = document.getElementById("icResult");
  box.innerHTML = icTableHtml(list, true);
  box.querySelectorAll("[data-icref]").forEach((b) => b.addEventListener("click", () => icOpen(b.dataset.icref)));
}

/* ---- teams ------------------------------------------------------------------ */

function renderAdminTeams() {
  const wrap = document.getElementById("adminTeamList");
  wrap.innerHTML = AUTH.teams.map((t) => {
    const members = AUTH.users.filter((u) => (u.teams || []).includes(t.id));
    return `<div class="team-card">
      <div class="team-card-head"><strong>${escapeHtml(t.name)}</strong><button class="btn-chip" type="button" data-team="${escapeHtml(t.id)}">แก้ไข</button></div>
      <div class="pilot-kpi-method">${members.length} คน</div>
      <div class="team-members">${members.map((m) => `<span class="pill pill-eliminate">${escapeHtml(m.name)}</span>`).join(" ") || '<span class="muted-inline">ยังไม่มีสมาชิก</span>'}</div>
    </div>`;
  }).join("") || '<p class="muted-note">ยังไม่มีทีม</p>';
  wrap.querySelectorAll("[data-team]").forEach((b) => b.addEventListener("click", () => openTeamEditor(b.dataset.team)));
}

function openTeamEditor(id) {
  adminEditingTeam = id || "";
  const t = id ? authTeamById(id) : { name: "" };
  document.getElementById("teamEdTitle").textContent = id ? "แก้ไขทีม" : "สร้างทีมใหม่";
  document.getElementById("te_name").value = t.name;
  document.getElementById("te_members").innerHTML = AUTH.users.filter((u) => u.active).map((u) => `<label class="vis-opt"><input type="checkbox" value="${u.id}"${id && (u.teams || []).includes(id) ? " checked" : ""}> ${escapeHtml(u.name)} <span class="muted-inline">(${escapeHtml(authDeptName(u.dept))})</span></label>`).join("");
  document.getElementById("teamDeleteBtn").hidden = !id;
  document.getElementById("teamEdBackdrop").classList.add("open");
}

function saveTeamEditor() {
  const name = document.getElementById("te_name").value.trim();
  if (!name) { document.getElementById("te_name").focus(); return; }
  let id = adminEditingTeam;
  if (!id) { id = "t-" + Date.now().toString(36); AUTH.teams.push({ id, name }); }
  else authTeamById(id).name = name;
  const members = [...document.querySelectorAll("#te_members input:checked")].map((i) => i.value);
  AUTH.users.forEach((u) => {
    const has = (u.teams || []).includes(id);
    if (members.includes(u.id) && !has) u.teams = (u.teams || []).concat(id);
    if (!members.includes(u.id) && has) u.teams = u.teams.filter((x) => x !== id);
  });
  authSave();
  auditLog(adminEditingTeam ? "แก้ไขทีม" : "สร้างทีม", name, `สมาชิก ${members.length} คน`);
  document.getElementById("teamEdBackdrop").classList.remove("open");
  renderAdmin();
}

function deleteTeam() {
  const t = authTeamById(adminEditingTeam);
  if (!t || !confirm(`ลบทีม "${t.name}"? เอกสาร/แผนที่แชร์ให้ทีมนี้จะไม่แสดงกับสมาชิกทีมอีก`)) return;
  AUTH.teams = AUTH.teams.filter((x) => x.id !== t.id);
  AUTH.users.forEach((u) => { u.teams = (u.teams || []).filter((x) => x !== t.id); });
  authSave();
  auditLog("ลบทีม", t.name, "");
  document.getElementById("teamEdBackdrop").classList.remove("open");
  renderAdmin();
}

/* ---- audit ------------------------------------------------------------------ */

function renderAdminAudit() {
  const log = auditLoad().slice().reverse();
  const userSel = document.getElementById("auditUser");
  if (!userSel.dataset.filled) {
    userSel.innerHTML = `<option value="">ทุกคน</option>` + AUTH.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("");
    userSel.dataset.filled = "1";
  }
  const actSel = document.getElementById("auditAction");
  const acts = [...new Set(log.map((e) => e.action))].sort();
  const prevAct = actSel.value;
  actSel.innerHTML = `<option value="">ทุกการกระทำ</option>` + acts.map((a) => `<option${a === prevAct ? " selected" : ""}>${escapeHtml(a)}</option>`).join("");
  const term = document.getElementById("auditSearch").value.trim().toLowerCase();
  const rows = log.filter((e) => (!userSel.value || e.user === userSel.value)
    && (!actSel.value || e.action === actSel.value)
    && (!term || `${e.target} ${e.detail} ${e.userName}`.toLowerCase().includes(term)));
  document.querySelector("#auditTable tbody").innerHTML = rows.slice(0, 500).map((e) => `<tr>
    <td>${fmtDateTime(e.ts)}</td>
    <td>${escapeHtml(e.userName)}</td>
    <td><span class="pill pill-eliminate">${escapeHtml(e.action)}</span></td>
    <td class="mono-cell">${/^[A-Z]{2,4}-\d{4}-\d{3}$/.test(e.target) ? `<button class="link-btn" type="button" data-docno="${escapeHtml(e.target)}">${escapeHtml(e.target)}</button>` : escapeHtml(e.target)}</td>
    <td class="audit-detail">${escapeHtml(e.detail)}</td>
  </tr>`).join("");
  document.querySelectorAll("#auditTable [data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  document.getElementById("auditEmpty").hidden = rows.length > 0;
  document.getElementById("auditCount").textContent = `${rows.length.toLocaleString("th-TH")} รายการ${rows.length > 500 ? " (แสดง 500 ล่าสุด)" : ""}`;
}

function exportAuditCsv() {
  const header = ["วันเวลา", "ผู้ใช้", "การกระทำ", "เป้าหมาย", "รายละเอียด"];
  const rows = auditLoad().slice().reverse().map((e) => [e.ts, e.userName, e.action, e.target, e.detail]);
  const lines = [header, ...rows].map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---- wiring ----------------------------------------------------------------- */

function initAdmin() {
  document.querySelectorAll(".admin-tab").forEach((b) => b.addEventListener("click", () => { adminTab = b.dataset.tab; renderAdmin(); }));
  document.getElementById("adminAddUserBtn").addEventListener("click", () => openUserEditor(""));
  document.getElementById("adminAddTeamBtn").addEventListener("click", () => openTeamEditor(""));
  document.getElementById("auditExportBtn").addEventListener("click", exportAuditCsv);
  document.getElementById("stTestBtn").addEventListener("click", adminStorageTest);
  document.getElementById("stConnectBtn").addEventListener("click", async () => {
    const r = await adminStorageTest();
    if (!r) return;
    const msg = r.keys ? `Sheets นี้มีข้อมูลอยู่แล้ว ${r.keys} ชุด — เครื่องนี้จะโหลดข้อมูลจาก Sheets (ข้อมูลที่ Sheets ยังไม่มีจะอัปโหลดขึ้นไป) ดำเนินการต่อ?` : "Sheets ยังว่าง — จะอัปโหลดข้อมูลในเครื่องนี้ขึ้นไปเป็นข้อมูลตั้งต้น ดำเนินการต่อ?";
    if (!confirm(msg)) return;
    auditLog("เปลี่ยนที่เก็บข้อมูล", "Google Sheets", r.name);
    Y2JStore.connect(document.getElementById("stUrl").value.trim(), document.getElementById("stToken").value.trim());
  });
  document.getElementById("stLocalBtn").addEventListener("click", () => {
    if (!confirm("กลับไปเก็บข้อมูลในเบราว์เซอร์นี้? เครื่องนี้จะหยุดซิงก์กับ Sheets (ข้อมูลใน Sheets ยังอยู่)")) return;
    auditLog("เปลี่ยนที่เก็บข้อมูล", "เบราว์เซอร์นี้", "");
    Y2JStore.disconnect();
  });
  document.getElementById("stSyncBtn").addEventListener("click", async () => { await Y2JStore.flush(); renderAdminStorage(); showToast("ซิงก์แล้ว", "good"); });
  document.getElementById("stForceBtn").addEventListener("click", async () => {
    if (!confirm("เขียนทับข้อมูลทั้งหมดใน Sheets ด้วยข้อมูลของเครื่องนี้? (ใช้เมื่อย้ายข้อมูลครั้งแรก หรือกู้คืน)")) return;
    try { const n = await Y2JStore.forceUpload(); auditLog("อัปโหลดข้อมูลทับ Sheets", "Google Sheets", `${n} ชุดข้อมูล`); showToast(`อัปโหลด ${n} ชุดข้อมูลแล้ว`, "good"); }
    catch (e) { showToast(`อัปโหลดไม่สำเร็จ: ${e.message}`, "warn"); }
    renderAdminStorage();
  });
  document.getElementById("stLinkBtn").addEventListener("click", () => {
    const link = Y2JStore.setupLink();
    const done = () => showToast("คัดลอกลิงก์แล้ว — ส่งให้ทีมเฉพาะคนในบริษัท (มีรหัสลับอยู่ในลิงก์)", "good");
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt("คัดลอกลิงก์นี้", link));
    else prompt("คัดลอกลิงก์นี้", link);
  });
  document.getElementById("stCopyScriptBtn").addEventListener("click", async () => {
    try {
      const code = await (await fetch("./apps-script/Code.gs", { cache: "no-store" })).text();
      await navigator.clipboard.writeText(code);
      showToast("คัดลอกสคริปต์แล้ว — ไปวางใน Apps Script", "good");
    } catch (e) { window.open("./apps-script/Code.gs", "_blank"); }
  });
  ["auditUser", "auditAction"].forEach((id) => document.getElementById(id).addEventListener("change", renderAdminAudit));
  document.getElementById("auditSearch").addEventListener("input", renderAdminAudit);

  const ue = document.getElementById("userEdBackdrop");
  ue.addEventListener("click", (e) => { if (e.target === e.currentTarget) ue.classList.remove("open"); });
  document.getElementById("userEdCancelBtn").addEventListener("click", () => ue.classList.remove("open"));
  document.getElementById("userEdSaveBtn").addEventListener("click", saveUserEditor);
  const rerender = () => {
    const u = adminEditingUser ? authUserById(adminEditingUser) : { docPerms: {}, modules: null };
    const draftPerms = {};
    document.querySelectorAll("#ue_perms [data-perm]").forEach((s) => { if (s.value) draftPerms[s.dataset.perm] = s.value; });
    const custom = document.getElementById("ue_modCustom").checked;
    const mods = custom ? [...document.querySelectorAll("#ue_modules input:checked")].map((i) => i.value) : null;
    renderUserEditorPerms(Object.assign({}, u, { docPerms: draftPerms, modules: mods }));
  };
  document.getElementById("ue_role").addEventListener("change", () => {
    document.getElementById("ue_modCustom").checked = false;
    rerender();
  });
  document.getElementById("ue_dept").addEventListener("change", rerender);
  document.getElementById("ue_groups").addEventListener("change", rerender);
  document.getElementById("adminAddGroupBtn").addEventListener("click", () => openGroupEditor(""));
  const ge = document.getElementById("groupEdBackdrop");
  ge.addEventListener("click", (e) => { if (e.target === e.currentTarget) ge.classList.remove("open"); });
  document.getElementById("icRunBtn").addEventListener("click", renderAdminIntegrity);
  document.getElementById("icSev").addEventListener("change", renderAdminIntegrity);
  document.getElementById("ue_modCustom").addEventListener("change", () => {
    const on = document.getElementById("ue_modCustom").checked;
    document.querySelectorAll("#ue_modules input").forEach((i) => { i.disabled = !on; });
  });
  document.getElementById("ue_permReset").addEventListener("click", () => {
    document.querySelectorAll("#ue_perms [data-perm]").forEach((s) => { s.value = ""; });
  });
  document.getElementById("ue_permAll").addEventListener("change", (e) => {
    if (!e.target.value) return;
    document.querySelectorAll("#ue_perms [data-perm]").forEach((s) => { s.value = e.target.value; });
    e.target.value = "";
  });

  const te = document.getElementById("teamEdBackdrop");
  te.addEventListener("click", (e) => { if (e.target === e.currentTarget) te.classList.remove("open"); });
  document.getElementById("teamEdCancelBtn").addEventListener("click", () => te.classList.remove("open"));
  document.getElementById("teamEdSaveBtn").addEventListener("click", saveTeamEditor);
  document.getElementById("teamDeleteBtn").addEventListener("click", deleteTeam);
}
