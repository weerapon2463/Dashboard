/* ==========================================================================
   Organisation — companies in the group (each with its own logo and fully
   separate data), the current company switcher, and each company's own
   departments (which documents they keep, which tools they use).

   Data separation is done by storage.js: company-scoped datasets are stored
   under "<key>--c-<companyId>" (the original company "y2j" keeps the plain
   keys, so existing data is untouched).
   ========================================================================== */

const ORG_STORAGE_KEY = "y2j-org-v1";         // per company: { departments: [...] }
const DEFAULT_COMPANY_ID = "y2j";
// Snapshot of the built-in departments before any company's custom list replaces them
const DEFAULT_DEPTS = JSON.parse(JSON.stringify(DEPT_WORKSPACES));

let orgEditingCompany = null;
let orgEditingDept = null;
let orgPendingLogo = "";

/* ---- companies (stored with users in the global auth store) ------------------- */

function orgCompanies() {
  if (!AUTH.companies || !AUTH.companies.length) {
    AUTH.companies = [{ id: DEFAULT_COMPANY_ID, name: "Y2J Machinery Co., Ltd.", short: "Y2J", logo: "" }];
    authSave();
  }
  return AUTH.companies;
}
function orgCompany(id) { return orgCompanies().find((c) => c.id === id) || null; }
function orgCurrentId() { return typeof Y2JStore !== "undefined" ? Y2JStore.company() : DEFAULT_COMPANY_ID; }
function orgCurrent() { return orgCompany(orgCurrentId()) || orgCompanies()[0]; }

// Which companies may this user open? Users with no company are group-level (all companies)
function orgAllowedCompanies(user) {
  const u = user || authCurrentUser();
  const all = orgCompanies().map((c) => c.id);
  if (!u) return all;
  if (u.role === "admin" || !u.company) return all;
  return all.includes(u.company) ? [u.company] : [all[0]];
}

// Called right after sign-in; returns false when the page is about to reload into another company
function orgEnsureCompany() {
  const allowed = orgAllowedCompanies();
  if (!allowed.includes(orgCurrentId())) {
    Y2JStore.setCompany(allowed[0]);
    return false;
  }
  return true;
}

/* ---- departments per company ------------------------------------------------------ */

function orgLoadDepartments() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORG_STORAGE_KEY) || "null");
    if (stored && Array.isArray(stored.departments) && stored.departments.length) return stored.departments;
  } catch (e) { /* fall back to defaults */ }
  return JSON.parse(JSON.stringify(DEFAULT_DEPTS));
}

function orgSaveDepartments(list) {
  localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify({ departments: list }));
}

// Replace the in-memory department list with this company's list (before any module uses it)
function applyOrgSettings() {
  const list = orgLoadDepartments().filter((w) => Array.isArray(w.docTypes))
    .map((w) => Object.assign({ tools: [], desc: "" }, w, { docTypes: w.docTypes.filter((t) => DOC_TYPES[t]) }));
  DEPT_WORKSPACES.length = 0;
  list.forEach((w) => DEPT_WORKSPACES.push(w));
  applyBranding();
  renderCompanySwitcher();
}

/* ---- branding ---------------------------------------------------------------------- */

function applyBranding() {
  const c = orgCurrent();
  if (!c) return;
  document.querySelectorAll(".brand-mark").forEach((el) => {
    el.innerHTML = c.logo ? `<img src="${escapeHtml(c.logo)}" alt="${escapeHtml(c.short)}">` : escapeHtml(c.short || "Y2J");
    el.classList.toggle("has-logo", !!c.logo);
  });
  document.querySelectorAll(".footer-sub").forEach((el) => { el.textContent = c.name; });
  const sub = document.querySelector(".sidebar .brand-sub");
  if (sub) sub.textContent = c.name;
  document.title = `${typeof APP_NAME !== "undefined" ? APP_NAME : "FORGE"} | ${c.short || c.name}`;
}

function renderCompanySwitcher() {
  const wrap = document.getElementById("companyPicker");
  const sel = document.getElementById("companySelect");
  if (!wrap || !sel || !authCurrentUser()) return;
  const allowed = orgAllowedCompanies();
  wrap.hidden = allowed.length < 2;
  sel.innerHTML = allowed.map((id) => { const c = orgCompany(id); return `<option value="${escapeHtml(id)}">${escapeHtml(c ? c.short + " — " + c.name : id)}</option>`; }).join("");
  sel.value = orgCurrentId();
}

/* ---- empty datasets for a company that starts from scratch ---------------------------- */

function orgEmptyDatasets() {
  const docs = {};
  Object.keys(DOC_TYPES).forEach((t) => { if (!DOC_TYPES[t].special) docs[t] = []; });
  return {
    "y2j-dept-docs-v1": docs,
    "y2j-p2p-v1": [],
    "y2j-plans-v1": [],
    "y2j-workorders-v1": [],
    "y2j-procurement-v1": { pr: [], po: [] },
    "y2j-master-schedule-v1": [],
    "y2j-priority-jobs-v1": [],
    "y2j-resource-v1": { labor: [], machine: [], tool: [] },
    "y2j-bom-v1": { models: [], bom: {}, meta: {} },
    "y2j-stock-v1": { items: {}, settings: { requesters: [], issuers: [] }, ledger: [], entries: [] },
  };
}

// Simulated data belongs to the DEMO only. On company data (shared Sheet, not the demo), a dataset that
// does not exist yet starts empty — otherwise each module would fill it with built-in samples and the
// first sync would upload them into the company's Sheet.
function orgSeedEmptyDatasets() {
  if (typeof Y2JStore === "undefined" || !Y2JStore.isRemote() || Y2JStore.config().demo) return;
  Object.entries(orgEmptyDatasets()).forEach(([k, v]) => {
    try { if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full — module falls back */ }
  });
}

/* ---- admin: organisation tab --------------------------------------------------------- */

function renderAdminOrg() {
  const cur = orgCurrent();
  document.getElementById("orgCompanyTable").querySelector("tbody").innerHTML = orgCompanies().map((c) => {
    const users = AUTH.users.filter((u) => u.company === c.id).length;
    return `<tr>
      <td><span class="org-logo">${c.logo ? `<img src="${escapeHtml(c.logo)}" alt="">` : escapeHtml(c.short)}</span></td>
      <td><strong>${escapeHtml(c.name)}</strong>${c.id === cur.id ? ' <span class="pill pill-schedule">กำลังดูอยู่</span>' : ""}<div class="pilot-kpi-method">รหัส ${escapeHtml(c.id)}</div></td>
      <td class="num">${users}</td>
      <td class="wo-actions-cell">
        <button class="btn-chip" type="button" data-orgedit="${escapeHtml(c.id)}">แก้ไข / โลโก้</button>
        ${c.id !== cur.id ? `<button class="btn-chip" type="button" data-orgswitch="${escapeHtml(c.id)}">สลับไปบริษัทนี้</button>` : ""}
      </td>
    </tr>`;
  }).join("");
  document.querySelectorAll("[data-orgedit]").forEach((b) => b.addEventListener("click", () => openCompanyEditor(b.dataset.orgedit)));
  document.querySelectorAll("[data-orgswitch]").forEach((b) => b.addEventListener("click", () => Y2JStore.setCompany(b.dataset.orgswitch)));

  document.getElementById("orgDeptTitle").textContent = `ฝ่าย / แผนก ของ ${cur.name}`;
  document.getElementById("orgDeptTable").querySelector("tbody").innerHTML = DEPT_WORKSPACES.map((w) => {
    const users = AUTH.users.filter((u) => u.dept === w.id && (u.company || DEFAULT_COMPANY_ID) === cur.id).length;
    return `<tr>
      <td><strong>${escapeHtml(w.name)}</strong><div class="pilot-kpi-method">${escapeHtml(w.desc || "")}</div></td>
      <td class="dept-title-cell">${w.docTypes.map((t) => `<span class="pill pill-eliminate">${escapeHtml(DOC_TYPES[t].abbr)}</span>`).join(" ") || "—"}</td>
      <td class="num">${users}</td>
      <td class="wo-actions-cell"><button class="btn-chip" type="button" data-deptedit="${escapeHtml(w.id)}">แก้ไข</button></td>
    </tr>`;
  }).join("");
  document.querySelectorAll("[data-deptedit]").forEach((b) => b.addEventListener("click", () => openDeptEditor(b.dataset.deptedit)));
}

function orgLogoPreview() {
  document.getElementById("coLogoPreview").innerHTML = orgPendingLogo
    ? `<img src="${escapeHtml(orgPendingLogo)}" alt="โลโก้">`
    : `<span>${escapeHtml(document.getElementById("co_short").value || "Y2J")}</span>`;
  document.getElementById("coLogoRemove").hidden = !orgPendingLogo;
}

function openCompanyEditor(id) {
  orgEditingCompany = id || null;
  const c = id ? orgCompany(id) : { id: "", name: "", short: "", logo: "" };
  document.getElementById("coTitle").textContent = id ? `แก้ไขบริษัท: ${c.name}` : "เพิ่มบริษัทในกลุ่ม";
  document.getElementById("co_name").value = c.name;
  document.getElementById("co_short").value = c.short;
  document.getElementById("co_id").value = c.id;
  document.getElementById("co_id").disabled = !!id;
  document.getElementById("coStartBox").hidden = !!id;
  orgPendingLogo = c.logo || "";
  orgLogoPreview();
  document.getElementById("companyBackdrop").classList.add("open");
}

function saveCompanyEditor() {
  const name = document.getElementById("co_name").value.trim();
  const short = document.getElementById("co_short").value.trim().slice(0, 8);
  if (!name) { document.getElementById("co_name").focus(); return; }
  if (!short) { document.getElementById("co_short").focus(); return; }
  if (orgEditingCompany) {
    const c = orgCompany(orgEditingCompany);
    const changes = [c.name !== name ? `ชื่อ → ${name}` : "", c.short !== short ? `ตัวย่อ → ${short}` : "", c.logo !== orgPendingLogo ? "เปลี่ยนโลโก้" : ""].filter(Boolean).join(" · ");
    Object.assign(c, { name, short, logo: orgPendingLogo });
    authSave();
    auditLog("แก้ไขบริษัท", c.id, changes || "ไม่มีการเปลี่ยนแปลง");
  } else {
    const id = document.getElementById("co_id").value.trim().toLowerCase();
    if (!/^[a-z0-9]{2,12}$/.test(id)) { showToast("รหัสบริษัท: a-z หรือ 0-9 ยาว 2–12 ตัว", "warn"); document.getElementById("co_id").focus(); return; }
    if (orgCompany(id)) { showToast("รหัสบริษัทนี้ถูกใช้แล้ว", "warn"); return; }
    const start = document.querySelector('input[name="coStart"]:checked').value;
    orgCompanies().push({ id, name, short, logo: orgPendingLogo });
    authSave();
    if (start === "empty") {
      // write empty datasets under the new company's keys so it doesn't show Y2J's sample data
      Object.entries(orgEmptyDatasets()).forEach(([k, v]) => localStorage.setItem(`${k}--c-${id}`, JSON.stringify(v)));
    }
    auditLog("เพิ่มบริษัท", id, `${name} · เริ่มจาก${start === "empty" ? "ข้อมูลว่าง" : "ข้อมูลตัวอย่าง"}`);
  }
  document.getElementById("companyBackdrop").classList.remove("open");
  applyBranding();
  renderCompanySwitcher();
  renderAdminOrg();
  showToast("บันทึกบริษัทแล้ว", "good");
}

/* ---- admin: department editor ----------------------------------------------------------- */

function openDeptEditor(id) {
  orgEditingDept = id || null;
  const w = id ? DEPT_WORKSPACES.find((x) => x.id === id) : { name: "", desc: "", docTypes: [], tools: [] };
  document.getElementById("dpTitle").textContent = id ? `แก้ไขฝ่าย: ${w.name}` : "เพิ่มฝ่าย / แผนก";
  document.getElementById("dp_name").value = w.name;
  document.getElementById("dp_desc").value = w.desc || "";
  // document types grouped by the built-in department that normally owns them
  const groups = DEFAULT_DEPTS.map((d) => ({ name: d.name, types: d.docTypes }));
  document.getElementById("dp_types").innerHTML = groups.map((g) => `
    <div class="vis-group"><div class="vis-group-title">${escapeHtml(g.name)}</div>
      ${g.types.map((t) => `<label class="vis-opt"><input type="checkbox" value="${t}"${w.docTypes.includes(t) ? " checked" : ""}> ${escapeHtml(DOC_TYPES[t].abbr)} — ${escapeHtml(DOC_TYPES[t].name.split(" — ").pop())}</label>`).join("")}
    </div>`).join("");
  const toolViews = ALL_VIEWS.filter((v) => !["overview", "dept", "plans", "admin", "pilot"].includes(v[0]));
  const toolLabel = (t) => (w.tools || []).find((x) => x.view === t);
  document.getElementById("dp_tools").innerHTML = toolViews.map((v) => `<label class="vis-opt"><input type="checkbox" value="${v[0]}"${toolLabel(v[0]) ? " checked" : ""}> ${escapeHtml(v[1])}</label>`).join("");
  document.getElementById("dpDeleteBtn").hidden = !id;
  document.getElementById("deptEdBackdrop").classList.add("open");
}

function saveDeptEditor() {
  const name = document.getElementById("dp_name").value.trim();
  if (!name) { document.getElementById("dp_name").focus(); return; }
  const docTypes = [...document.querySelectorAll("#dp_types input:checked")].map((i) => i.value);
  const tools = [...document.querySelectorAll("#dp_tools input:checked")].map((i) => ({ view: i.value, label: (ALL_VIEWS.find((v) => v[0] === i.value) || [0, i.value])[1] }));
  const list = DEPT_WORKSPACES.map((w) => Object.assign({}, w));
  const data = { name, desc: document.getElementById("dp_desc").value.trim(), docTypes, tools };
  if (orgEditingDept) {
    Object.assign(list.find((w) => w.id === orgEditingDept), data);
    auditLog("แก้ไขฝ่าย", name, `เอกสาร ${docTypes.length} ชนิด`);
  } else {
    list.push(Object.assign({ id: "d" + Date.now().toString(36) }, data));
    auditLog("เพิ่มฝ่าย", name, `เอกสาร ${docTypes.length} ชนิด`);
  }
  orgSaveDepartments(list);
  applyOrgSettings();
  document.getElementById("deptEdBackdrop").classList.remove("open");
  renderAdminOrg();
  if (typeof renderDept === "function") renderDept();
  showToast(`บันทึกฝ่าย "${name}" แล้ว`, "good");
}

function deleteDeptEditor() {
  const w = DEPT_WORKSPACES.find((x) => x.id === orgEditingDept);
  if (!w) return;
  const users = AUTH.users.filter((u) => u.dept === w.id).length;
  if (!confirm(`ลบฝ่าย "${w.name}"?${users ? ` มีผู้ใช้ ${users} คนสังกัดฝ่ายนี้ — ต้องย้ายฝ่ายให้ในหน้าผู้ใช้` : ""} (เอกสารที่มีอยู่ยังเก็บไว้ ถ้าฝ่ายอื่นใช้เอกสารชนิดเดียวกันจะยังเห็น)`)) return;
  orgSaveDepartments(DEPT_WORKSPACES.filter((x) => x.id !== w.id));
  auditLog("ลบฝ่าย", w.name, "");
  applyOrgSettings();
  document.getElementById("deptEdBackdrop").classList.remove("open");
  renderAdminOrg();
  if (typeof renderDept === "function") renderDept();
}

/* ---- wiring --------------------------------------------------------------------------- */

function initOrg() {
  const sel = document.getElementById("companySelect");
  if (sel) sel.addEventListener("change", () => {
    auditLog("สลับบริษัท", sel.value, orgCompany(sel.value) ? orgCompany(sel.value).name : "");
    Y2JStore.setCompany(sel.value);
  });
  document.getElementById("orgAddCompanyBtn").addEventListener("click", () => openCompanyEditor(null));
  document.getElementById("orgAddDeptBtn").addEventListener("click", () => openDeptEditor(null));
  document.getElementById("orgResetDeptBtn").addEventListener("click", () => {
    if (!confirm("คืนค่าฝ่าย/แผนกเป็นชุดมาตรฐาน 8 ฝ่าย?")) return;
    orgSaveDepartments(JSON.parse(JSON.stringify(DEFAULT_DEPTS)));
    auditLog("คืนค่าฝ่ายมาตรฐาน", orgCurrentId(), "");
    applyOrgSettings();
    renderAdminOrg();
  });
  [["companyBackdrop", "coCancelBtn", "coSaveBtn", saveCompanyEditor], ["deptEdBackdrop", "dpCancelBtn", "dpSaveBtn", saveDeptEditor]].forEach(([bd, c, s, fn]) => {
    const el = document.getElementById(bd);
    el.addEventListener("click", (e) => { if (e.target === e.currentTarget) el.classList.remove("open"); });
    document.getElementById(c).addEventListener("click", () => el.classList.remove("open"));
    document.getElementById(s).addEventListener("click", fn);
  });
  document.getElementById("dpDeleteBtn").addEventListener("click", deleteDeptEditor);
  document.getElementById("co_short").addEventListener("input", orgLogoPreview);
  const logoInput = document.getElementById("coLogoFile");
  logoInput.addEventListener("change", async () => {
    const f = logoInput.files[0];
    logoInput.value = "";
    if (!f) return;
    try { orgPendingLogo = await readLogo(f); orgLogoPreview(); } catch (e) { showToast("อ่านรูปโลโก้ไม่ได้", "warn"); }
  });
  document.getElementById("coLogoRemove").addEventListener("click", () => { orgPendingLogo = ""; orgLogoPreview(); });
}
