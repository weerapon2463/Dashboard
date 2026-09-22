/* ==========================================================================
   Overview — at-a-glance charts summarizing Work Order status and capacity
   utilization across all lines, so the executive view isn't just numbers.
   ========================================================================== */

let woStatusChartInstance = null;
let capacitySnapshotChartInstance = null;

const WO_STATUS_ORDER = ["วางแผน", "กำลังผลิต", "ล่าช้า", "เสร็จสมบูรณ์"];

function woStatusColor(status) {
  // Palette validated with scripts/validate_palette.js (dataviz skill): blue/aqua/red
  // clear CVD + contrast checks in both themes; gray is an intentional neutral
  // outside the hue-identity set (not-started has no status signal to encode).
  if (status === "ล่าช้า") return cssVar("--status-critical");
  if (status === "เสร็จสมบูรณ์") return cssVar("--series-3");
  if (status === "กำลังผลิต") return cssVar("--series-1");
  return cssVar("--text-muted"); // วางแผน — not started yet
}

function renderWOStatusChart() {
  const canvas = document.getElementById("woStatusChart");
  if (!canvas) return;

  const counts = WO_STATUS_ORDER.map((s) => WORK_ORDERS.filter((w) => w.status === s).length);
  const colors = WO_STATUS_ORDER.map(woStatusColor);

  if (woStatusChartInstance) woStatusChartInstance.destroy();
  woStatusChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: WO_STATUS_ORDER,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { color: cssVar("--text-muted"), stepSize: 1, precision: 0 }, grid: { color: cssVar("--gridline") } },
        y: { ticks: { color: cssVar("--text-secondary") }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.raw} ใบสั่งผลิต` },
        },
      },
    },
    plugins: [{
      id: "woStatusValueLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = cssVar("--text-primary");
        ctx.font = "600 12px inherit";
        ctx.textBaseline = "middle";
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const val = counts[i];
          ctx.fillText(String(val), bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    }],
  });
}

function renderCapacitySnapshotChart() {
  const canvas = document.getElementById("capacitySnapshotChart");
  if (!canvas) return;

  const rows = CAPACITY_LINES.map((line) => {
    const weeks = CAPACITY_DATA[line];
    const latest = weeks[weeks.length - 1];
    const pct = Math.round((latest.demand / latest.capacity) * 100);
    return { line, pct };
  });
  const colors = rows.map((r) => statusColor(capacityStatus(r.pct)));

  if (capacitySnapshotChartInstance) capacitySnapshotChartInstance.destroy();
  capacitySnapshotChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: rows.map((r) => r.line),
      datasets: [{
        data: rows.map((r) => r.pct),
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 16,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { color: cssVar("--text-muted"), callback: (v) => v + "%" }, grid: { color: cssVar("--gridline") } },
        y: { ticks: { color: cssVar("--text-secondary"), font: { size: 11 } }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `Utilization: ${ctx.raw}% (สัปดาห์ล่าสุด)` },
        },
      },
    },
    plugins: [{
      id: "capacitySnapshotLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = cssVar("--text-primary");
        ctx.font = "600 11.5px inherit";
        ctx.textBaseline = "middle";
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          ctx.fillText(rows[i].pct + "%", bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    }, {
      id: "capacitySnapshotHundredLine",
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const x = scales.x.getPixelForValue(100);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        ctx.strokeStyle = cssVar("--text-muted");
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      },
    }],
  });
}

function renderOverviewCharts() {
  renderWOStatusChart();
  renderCapacitySnapshotChart();
}
