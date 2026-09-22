/* ==========================================================================
   Priority Matrix module (Eisenhower-style: Urgency x Impact)
   ========================================================================== */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let priorityChartInstance = null;

function populatePriorityDeptFilter() {
  const select = document.getElementById("priorityDeptFilter");
  if (!select) return;
  const depts = Array.from(new Set(PRIORITY_JOBS.map((j) => j.department))).sort();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "ทั้งหมด (ทุกแผนก)";
  select.appendChild(allOpt);
  depts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => renderPriorityMatrix());
}

function currentPriorityDept() {
  const select = document.getElementById("priorityDeptFilter");
  return select ? select.value : "__all__";
}

function renderPriorityMatrix() {
  const canvas = document.getElementById("priorityChart");
  if (!canvas) return;

  const dept = currentPriorityDept();
  const jobs = dept && dept !== "__all__" ? PRIORITY_JOBS.filter((j) => j.department === dept) : PRIORITY_JOBS;

  const byQuadrant = { doFirst: [], schedule: [], delegate: [], eliminate: [] };
  jobs.forEach((job) => {
    const q = classifyQuadrant(job.urgency, job.impact);
    byQuadrant[q].push({ x: job.urgency, y: job.impact, label: job.name, model: job.model, department: job.department });
  });

  const colorMap = {
    doFirst: cssVar("--series-8"),
    schedule: cssVar("--series-1"),
    delegate: cssVar("--series-4"),
    eliminate: cssVar("--text-muted"),
  };

  const datasets = Object.keys(byQuadrant).map((q) => ({
    label: QUADRANT_META[q].label,
    data: byQuadrant[q],
    backgroundColor: colorMap[q],
    borderColor: colorMap[q],
    pointRadius: 7,
    pointHoverRadius: 9,
  }));

  if (priorityChartInstance) priorityChartInstance.destroy();

  priorityChartInstance = new Chart(canvas.getContext("2d"), {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0, max: 10,
          title: { display: true, text: "ความเร่งด่วน (Urgency)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted") },
        },
        y: {
          min: 0, max: 10,
          title: { display: true, text: "ผลกระทบ (Impact)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted") },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: cssVar("--text-secondary"), usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              return `${d.label} (${d.model} · ${d.department}) — เร่งด่วน ${d.x}, ผลกระทบ ${d.y}`;
            },
          },
        },
        quadrantLines: true,
      },
    },
    plugins: [{
      id: "quadrantLines",
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const midX = scales.x.getPixelForValue(5.5);
        const midY = scales.y.getPixelForValue(5.5);
        ctx.save();
        ctx.strokeStyle = cssVar("--baseline");
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(midX, chartArea.top);
        ctx.lineTo(midX, chartArea.bottom);
        ctx.moveTo(chartArea.left, midY);
        ctx.lineTo(chartArea.right, midY);
        ctx.stroke();
        ctx.restore();
      },
    }],
  });

  renderPriorityTable(jobs);
  updatePriorityStat();
}

function renderPriorityTable(jobs) {
  const tbody = document.querySelector("#priorityTable tbody");
  if (!tbody) return;
  const list = jobs || PRIORITY_JOBS;
  tbody.innerHTML = "";
  list
    .slice()
    .sort((a, b) => (b.urgency + b.impact) - (a.urgency + a.impact))
    .forEach((job) => {
      const q = classifyQuadrant(job.urgency, job.impact);
      const meta = QUADRANT_META[q];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${job.name}</td>
        <td>${job.model}</td>
        <td>${job.department}</td>
        <td>${job.urgency}</td>
        <td>${job.impact}</td>
        <td><span class="pill ${meta.pillClass}">${meta.label}</span></td>
      `;
      tbody.appendChild(tr);
    });
}

function updatePriorityStat() {
  // สถิติในหน้าภาพรวมนับจากงานทั้งหมดของทุกแผนก ไม่ผูกกับตัวกรองแผนกในหน้า Priority Matrix
  const count = PRIORITY_JOBS.filter((j) => classifyQuadrant(j.urgency, j.impact) === "doFirst").length;
  const el = document.getElementById("statDoFirst");
  if (el) el.textContent = count;
}
