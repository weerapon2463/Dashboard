/* ==========================================================================
   Capacity Planning module — utilization % per production line, per week
   ========================================================================== */

let capacityChartInstance = null;

function statusColor(status) {
  if (status === "critical") return cssVar("--status-critical");
  if (status === "warning") return cssVar("--status-warning");
  return cssVar("--status-good");
}

function populateCapacityFilter() {
  const select = document.getElementById("capacityLineFilter");
  if (!select) return;
  select.innerHTML = "";
  CAPACITY_LINES.forEach((line) => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => renderCapacityChart(select.value));
}

function renderCapacityChart(selectedLine) {
  const line = selectedLine || CAPACITY_LINES[0];
  const canvas = document.getElementById("capacityChart");
  if (!canvas) return;

  const weeks = CAPACITY_DATA[line];
  const utilPcts = weeks.map((w) => Math.round((w.demand / w.capacity) * 100));
  const colors = utilPcts.map((pct) => statusColor(capacityStatus(pct)));

  if (capacityChartInstance) capacityChartInstance.destroy();

  capacityChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: weeks.map((w) => w.week),
      datasets: [{
        label: `Utilization — ${line}`,
        data: utilPcts,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: cssVar("--text-muted") },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Utilization (%)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted"), callback: (v) => v + "%" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const w = weeks[ctx.dataIndex];
              return `${w.week}: แผน ${w.demand} ชม. / กำลังผลิต ${w.capacity} ชม. (${ctx.raw}%)`;
            },
          },
        },
      },
    },
    plugins: [{
      id: "hundredLine",
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const y = scales.y.getPixelForValue(100);
        if (y < chartArea.top || y > chartArea.bottom) return;
        ctx.save();
        ctx.strokeStyle = cssVar("--text-muted");
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.restore();
      },
    }],
  });

  renderCapacityTable();
}

function renderCapacityTable() {
  const tbody = document.querySelector("#capacityTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let utilSum = 0;
  CAPACITY_LINES.forEach((line) => {
    const weeks = CAPACITY_DATA[line];
    const avgCapacity = Math.round(weeks.reduce((s, w) => s + w.capacity, 0) / weeks.length);
    const avgDemand = Math.round(weeks.reduce((s, w) => s + w.demand, 0) / weeks.length);
    const avgUtil = Math.round((avgDemand / avgCapacity) * 100);
    utilSum += avgUtil;
    const status = capacityStatus(avgUtil);
    const pillClass = status === "critical" ? "pill-critical" : status === "warning" ? "pill-warning" : "pill-good";
    const statusLabel = status === "critical" ? "เกินกำลัง" : status === "warning" ? "เกือบเต็ม" : "ปกติ";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${line}</td>
      <td>${avgCapacity}</td>
      <td>${avgDemand}</td>
      <td>${avgUtil}%</td>
      <td><span class="pill ${pillClass}">${statusLabel}</span></td>
    `;
    tbody.appendChild(tr);
  });

  const avgAll = Math.round(utilSum / CAPACITY_LINES.length);
  const el = document.getElementById("statUtil");
  if (el) el.textContent = avgAll + "%";
}
