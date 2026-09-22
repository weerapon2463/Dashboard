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

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const stored = null; // no persistent storage in this demo; session-only via in-memory var
  let manualTheme = null;

  btn.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    if (current === "dark") {
      root.setAttribute("data-theme", "light");
      manualTheme = "light";
    } else {
      root.setAttribute("data-theme", "dark");
      manualTheme = "dark";
    }
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
