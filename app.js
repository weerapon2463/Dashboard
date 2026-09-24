/* ==========================================================================
   App shell — navigation, theme toggle, init
   ========================================================================== */

const VIEW_TITLES = {
  overview: "ภาพรวมการผลิต",
  pilot: "ผลการทดสอบนำร่อง (Pilot Test)",
  mytasks: "งานของฉัน",
  priority: "Priority Matrix",
  capacity: "Capacity Planning",
  schedule: "Master Schedule",
  makeorbuy: "Make-or-Buy Decision Support",
  resource: "การบริหารทรัพยากรการผลิต (คน / เครื่องจักร / เครื่องมือ)",
  procurement: "จัดซื้อ (PR / PO / ซัพพลายเออร์)",
  workorder: "ใบสั่งผลิต & BOM",
};

const ROLES = [
  { id: "operator", label: "Operator (พนักงาน)" },
  { id: "depthead", label: "หัวหน้าแผนก" },
  { id: "plant", label: "ผู้จัดการโรงงาน/บริษัท" },
  { id: "group", label: "ผู้บริหารระดับกลุ่ม" },
];

const MODULE_ACCESS = {
  operator: ["overview", "mytasks", "workorder"],
  depthead: ["overview", "pilot", "mytasks", "priority", "workorder", "resource"],
  plant: ["overview", "pilot", "mytasks", "priority", "capacity", "schedule", "makeorbuy", "resource", "procurement", "workorder"],
  group: ["overview", "pilot", "capacity", "schedule", "makeorbuy"],
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

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
  document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || "";
  // Pilot results are real measurements, so the "sample data" badge would mislead there
  const badge = document.querySelector(".data-badge");
  if (badge) badge.hidden = view === "pilot";

  // Re-render the relevant chart in case it needs a resize/redraw
  // (canvas charts drawn while display:none report zero size)
  if (view === "overview") renderOverviewCharts();
  if (view === "pilot" && typeof renderPilot === "function") renderPilot();
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
  const allowed = MODULE_ACCESS[role] || MODULE_ACCESS.group;
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
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initRoleSelect();
  initThemeToggle();
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
  markWOInitialStatus(hadStoredWorkOrders);
  markProcInitialStatus(hadStoredProcurement);
  markMSInitialStatus(hadStoredSchedule);
  markPMInitialStatus(hadStoredPriority);
  markResInitialStatus(hadStoredResource);
  if (hasPilot) markPilotInitialStatus(hadStoredPilot);
});
