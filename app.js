/* ==========================================================================
   App shell — navigation, theme toggle, init
   ========================================================================== */

const VIEW_TITLES = {
  overview: "ภาพรวมการผลิต",
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
  operator: ["overview", "workorder"],
  depthead: ["overview", "priority", "workorder", "resource"],
  plant: ["overview", "priority", "capacity", "schedule", "makeorbuy", "resource", "procurement", "workorder"],
  group: ["overview", "capacity", "schedule", "makeorbuy"],
};

const ROLE_STORAGE_KEY = "y2j-role-v1";
const THEME_STORAGE_KEY = "y2j-theme-v1";

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
  document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || "";

  // Re-render the relevant chart in case it needs a resize/redraw
  // (canvas charts drawn while display:none report zero size)
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

  select.addEventListener("change", () => {
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, select.value);
    } catch (e) { /* ignore — role choice simply won't persist across reloads */ }
    applyModuleAccess(select.value);
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
  renderAlerts();
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initRoleSelect();
  initThemeToggle();
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
  renderAlerts();
});
