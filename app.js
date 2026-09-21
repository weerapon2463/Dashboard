/* ==========================================================================
   App shell — navigation, theme toggle, init
   ========================================================================== */

const VIEW_TITLES = {
  overview: "ภาพรวมการผลิต",
  priority: "Priority Matrix",
  capacity: "Capacity Planning",
  schedule: "Master Schedule",
  makeorbuy: "Make-or-Buy Decision Support",
};

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
  document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || "";

  if (view === "priority") renderPriorityMatrix();
  if (view === "capacity") renderCapacityChart(document.getElementById("capacityLineFilter").value);
  if (view === "schedule") renderMasterSchedule();
  if (view === "makeorbuy") runMobCalculation();
}

function initNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
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
    refreshAllCharts();
  });
}

function refreshAllCharts() {
  renderPriorityMatrix();
  const lineSelect = document.getElementById("capacityLineFilter");
  renderCapacityChart(lineSelect ? lineSelect.value : undefined);
  renderMasterSchedule();
  if (document.getElementById("mobResult").innerHTML.trim()) runMobCalculation();
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initThemeToggle();
  populateCapacityFilter();

  renderPriorityMatrix();
  renderCapacityChart(CAPACITY_LINES[0]);
  renderMasterSchedule();
  initMakeOrBuy();
});
