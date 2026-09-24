/* ==========================================================================
   App shell — navigation, theme toggle, init
   ========================================================================== */

const VIEW_TITLES = {
  overview: "ภาพรวมการผลิต",
  pilot: "ผลการทดสอบนำร่อง (Pilot Test)",
  dept: "งานตามแผนก / เอกสารที่เกี่ยวข้อง",
  mytasks: "งานของฉัน",
  priority: "Priority Matrix",
  capacity: "Capacity Planning",
  schedule: "Master Schedule",
  makeorbuy: "Make-or-Buy Decision Support",
  resource: "การบริหารทรัพยากรการผลิต (คน / เครื่องจักร / เครื่องมือ)",
  procurement: "จัดซื้อ (PR / PO / ซัพพลายเออร์)",
  workorder: "ใบสั่งผลิต & BOM",
  bomx: "BOM หลายระดับ · เบิกวัสดุ · ค้างเบิก · เอกสารอ้างอิง",
  service: "บริการหลังการขาย — ทะเบียนเครื่อง · งานบริการ · เคลม · อะไหล่",
  reports: "รายงาน — มุมมองสำหรับทีมงานและผู้บริหาร",
  plans: "แผนงานของฉัน",
  p2p: "ติดตามจัดซื้อ — PR → PO → ส่งของ → รับของ → ตรวจรับ → จ่ายเงิน",
  admin: "ผู้ดูแลระบบ — ผู้ใช้ สิทธิ์ และประวัติการใช้งาน",
};

const ROLES = [
  { id: "operator", label: "Operator (พนักงาน)" },
  { id: "depthead", label: "หัวหน้าแผนก" },
  { id: "plant", label: "ผู้จัดการโรงงาน/บริษัท" },
  { id: "group", label: "ผู้บริหารระดับกลุ่ม" },
];

const MODULE_ACCESS = {
  operator: ["overview", "dept", "p2p", "mytasks", "workorder", "bomx", "service", "reports"],
  depthead: ["overview", "pilot", "dept", "p2p", "mytasks", "priority", "workorder", "bomx", "service", "reports", "resource"],
  plant: ["overview", "pilot", "dept", "p2p", "mytasks", "priority", "capacity", "schedule", "makeorbuy", "resource", "procurement", "workorder", "bomx", "service", "reports"],
  group: ["overview", "pilot", "dept", "p2p", "capacity", "schedule", "makeorbuy", "bomx", "service", "reports"],
};

const ROLE_STORAGE_KEY = "y2j-role-v1";
const THEME_STORAGE_KEY = "y2j-theme-v1";

function showToast(message, type) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast${type ? " toast-" + type : ""}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

// Pilot results are real measurements, so the "sample data" badge would mislead there. With Google Sheets
// connected the data is real; only pages still built on fixed example figures keep the badge.
function updateDataBadge(view) {
  const badge = document.querySelector(".data-badge");
  if (!badge) return;
  const remote = typeof Y2JStore !== "undefined" && Y2JStore.isRemote();
  badge.hidden = view === "pilot" || (remote && !["capacity", "makeorbuy"].includes(view));
  badge.textContent = remote ? "หน้านี้ยังใช้ข้อมูลตัวอย่าง" : "ข้อมูลตัวอย่าง (Sample Data)";
}

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
  document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || "";
  updateDataBadge(view);

  // Re-render the relevant chart in case it needs a resize/redraw
  // (canvas charts drawn while display:none report zero size)
  if (view === "overview") { if (typeof renderOverview === "function") renderOverview(); else renderOverviewCharts(); }
  if (view === "pilot" && typeof renderPilot === "function") renderPilot();
  if (view === "dept" && typeof renderDept === "function") renderDept();
  if (view === "plans" && typeof renderPlans === "function") renderPlans();
  if (view === "p2p" && typeof renderP2P === "function") renderP2P();
  if (view === "bomx" && typeof renderBomx === "function") renderBomx();
  if (view === "service" && typeof renderService === "function") renderService();
  if (view === "reports" && typeof renderReports === "function") renderReports();
  if (view === "admin" && typeof renderAdmin === "function") renderAdmin();
  if (view === "mytasks") renderMyTasks();
  if (view === "priority") renderPriorityMatrix();
  if (view === "capacity") renderCapacityChart(document.getElementById("capacityLineFilter").value);
  if (view === "schedule") renderMasterSchedule();
  if (view === "makeorbuy") runMobCalculation();
  if (view === "resource") renderResource();
  if (view === "procurement") renderProcurement();
  if (view === "workorder") renderWorkOrders();
}

function initNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function getStoredRole() {
  // A signed-in user's role always wins over the old "มุมมอง" selector
  if (typeof authLegacyRole === "function" && authLegacyRole()) return authLegacyRole();
  // Default to "plant" (full module access) so a first-time visitor — e.g. a
  // competition judge — sees everything; role filtering only kicks in once
  // someone deliberately switches the "มุมมอง" selector.
  try {
    const stored = localStorage.getItem(ROLE_STORAGE_KEY);
    return MODULE_ACCESS[stored] ? stored : "plant";
  } catch (e) {
    return "plant";
  }
}

function applyModuleAccess(role) {
  const allowed = (typeof authAllowedModules === "function" && authAllowedModules()) || MODULE_ACCESS[role] || MODULE_ACCESS.group;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.hidden = !allowed.includes(btn.dataset.view);
  });
  // If the view currently open just became hidden for this role, jump to the first visible one
  const activeBtn = document.querySelector(".nav-item.active");
  if (activeBtn && activeBtn.hidden) {
    const firstVisible = document.querySelector(".nav-item:not([hidden])");
    switchView(firstVisible ? firstVisible.dataset.view : "overview");
  }
}

function initRoleSelect() {
  const select = document.getElementById("roleSelect");
  if (!select) return;
  ROLES.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.label;
    select.appendChild(opt);
  });
  const role = getStoredRole();
  select.value = role;
  applyModuleAccess(role);

  window.addEventListener("pageshow", () => {
    const r = getStoredRole();
    if (select.value !== r) { select.value = r; applyModuleAccess(r); }
  });

  select.addEventListener("change", () => {
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, select.value);
    } catch (e) { /* ignore — role choice simply won't persist across reloads */ }
    applyModuleAccess(select.value);
    // Role-gated action buttons need a refresh
    if (typeof renderWorkOrders === "function") renderWorkOrders();
    if (typeof renderProcurement === "function") renderProcurement();
    if (typeof renderMasterSchedule === "function") renderMasterSchedule();
    if (typeof renderPriorityMatrix === "function") renderPriorityMatrix();
    if (typeof renderResource === "function") renderResource();
    if (typeof renderPilot === "function") renderPilot();
    if (typeof renderDept === "function") renderDept();
  });
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const root = document.documentElement;

  let stored = null;
  try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* ignore */ }
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  btn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) { /* ignore */ }
    // Redraw charts so canvas colors (read from CSS vars) update
    refreshAllCharts();
  });
}

function refreshAllCharts() {
  renderPriorityMatrix();
  const lineSelect = document.getElementById("capacityLineFilter");
  renderCapacityChart(lineSelect ? lineSelect.value : undefined);
  renderMasterSchedule();
  if (document.getElementById("mobResult").innerHTML.trim()) runMobCalculation();
  renderResource();
  renderProcurement();
  renderWorkOrders();
  renderMyTasks();
  renderOverviewCharts();
  renderAlerts();
  if (typeof renderPilot === "function") renderPilot();
  if (typeof renderDept === "function") renderDept();
}

// Start only after the storage layer has pulled shared data (Google Sheets mode) — modules
// read localStorage during init, so it must already hold the latest copy.
document.addEventListener("DOMContentLoaded", () => {
  const ready = typeof Y2JStore !== "undefined" ? Y2JStore.ready() : Promise.resolve();
  ready.then(appStart, appStart);
});

function appStart() {
  // Login gate: nothing else starts until a user signs in (the page reloads after sign-in)
  if (typeof authInit === "function") {
    if (!authInit()) {
      initThemeToggle();
      renderLoginScreen();
      return;
    }
    renderUserChip();
    if (typeof applyOrgSettings === "function") {
      if (!orgEnsureCompany()) return; // reloading into a company this user may open
      applyOrgSettings();
      initOrg();
    }
    const picker = document.querySelector(".role-picker");
    if (picker) picker.hidden = true;
  }
  initNav();
  initRoleSelect();
  initThemeToggle();
  const hasDept = typeof initDeptData === "function" && typeof initBomData === "function";
  if (hasDept) initBomData();
  const hadStoredWorkOrders = initWorkOrderData();
  initWorkOrderInteractions();
  const hadStoredProcurement = initProcurementData();
  const hadStoredSchedule = initScheduleData();
  initScheduleInteractions();
  const hadStoredPriority = initPriorityData();
  initPriorityInteractions();
  const hadStoredResource = initResourceData();
  // Guarded: if a cached older index.html lacks pilot.js, the rest of the app must still start
  const hasPilot = typeof initPilotData === "function";
  const hadStoredPilot = hasPilot ? initPilotData() : false;
  if (hasPilot) initPilotInteractions();
  const hadStoredDept = hasDept ? initDeptData() : false;
  if (hasDept) { initDeptInteractions(); initBomInteractions(); }
  if (hasDept && typeof initDocView === "function") initDocView();
  if (typeof initPlans === "function") initPlans();
  if (typeof initP2P === "function") { initP2P(); renderP2P(); renderAlerts(); }
  if (typeof initAdmin === "function") initAdmin();
  if (typeof initSuppliers === "function") initSuppliers();
  if (hasDept && typeof initBomx === "function") initBomx();
  if (hasDept && typeof initService === "function") initService();
  if (hasDept && typeof initReports === "function") initReports();
  if (hasDept && typeof initOverview === "function") initOverview();
  populateCapacityFilter();
  populateBOMFilter();
  populatePriorityDeptFilter();
  populateWOLineFilter();

  renderPriorityMatrix();
  renderCapacityChart(CAPACITY_LINES[0]);
  renderMasterSchedule();
  initMakeOrBuy();
  renderResource();
  renderProcurement();
  renderWorkOrders();
  renderMyTasks();
  renderOverviewCharts();
  renderAlerts();
  if (hasPilot) renderPilot();
  if (typeof renderOverview === "function") renderOverview();
  if (hasDept) renderDept();
  markWOInitialStatus(hadStoredWorkOrders);
  markProcInitialStatus(hadStoredProcurement);
  markMSInitialStatus(hadStoredSchedule);
  markPMInitialStatus(hadStoredPriority);
  markResInitialStatus(hadStoredResource);
  if (hasPilot) markPilotInitialStatus(hadStoredPilot);
  if (hasDept) markDeptInitialStatus(hadStoredDept);

  // After a sync reload, return to the page the user was on
  try {
    const back = sessionStorage.getItem("y2j-return-view");
    sessionStorage.removeItem("y2j-return-view");
    const btn = back && document.querySelector(`.nav-item[data-view="${back}"]`);
    if (btn && !btn.hidden) switchView(back);
  } catch (e) { /* ignore */ }
  // Link straight to a page (?view=bomx&tab=mrp) — used by the concept page and shared links
  try {
    const q = new URLSearchParams(location.search);
    const v = q.get("view");
    const nav = v && document.querySelector(`.nav-item[data-view="${v}"]`);
    if (nav && !nav.hidden) {
      const tab = q.get("tab");
      if (tab && v === "bomx" && typeof bxTab !== "undefined") bxTab = tab;
      if (tab && v === "service" && typeof svTab !== "undefined") svTab = tab;
      switchView(v);
    }
  } catch (e) { /* ignore */ }
  const activeNav = document.querySelector(".nav-item.active");
  updateDataBadge(activeNav ? activeNav.dataset.view : "overview");
  // Shared link to one BOM item (?bom=<model>&item=<part code>)
  if (hasDept && typeof bxHandleDeepLink === "function") bxHandleDeepLink();
}
