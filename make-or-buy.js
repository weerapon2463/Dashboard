/* ==========================================================================
   Make-or-Buy Decision Support module
   ========================================================================== */

let mobChartInstance = null;

const MOB_STORAGE_KEY = "y2j-mob-inputs-v1";

function saveMobForm(p) {
  try { localStorage.setItem(MOB_STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

function restoreMobForm() {
  try {
    const raw = localStorage.getItem(MOB_STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    const fields = {
      mobPartName: p.name, mobMaterialCost: p.material, mobLaborCost: p.labor,
      mobFixedCost: p.fixed, mobBuyPrice: p.buyPrice, mobShipping: p.shipping,
      mobVolume: p.volume, mobLeadMake: p.leadMake, mobLeadBuy: p.leadBuy,
    };
    Object.keys(fields).forEach((id) => {
      const el = document.getElementById(id);
      if (el && fields[id] !== undefined && fields[id] !== null) el.value = fields[id];
    });
  } catch (e) { /* ignore — form just keeps its default sample values */ }
}

function readMobForm() {
  return {
    name: document.getElementById("mobPartName").value || "ชิ้นส่วน",
    material: Number(document.getElementById("mobMaterialCost").value) || 0,
    labor: Number(document.getElementById("mobLaborCost").value) || 0,
    fixed: Number(document.getElementById("mobFixedCost").value) || 0,
    buyPrice: Number(document.getElementById("mobBuyPrice").value) || 0,
    shipping: Number(document.getElementById("mobShipping").value) || 0,
    volume: Number(document.getElementById("mobVolume").value) || 1,
    leadMake: Number(document.getElementById("mobLeadMake").value) || 0,
    leadBuy: Number(document.getElementById("mobLeadBuy").value) || 0,
  };
}

function fmtBaht(n) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " บาท";
}

function renderMobResult(p, result) {
  const el = document.getElementById("mobResult");
  if (!el) return;

  const recClass = result.recommendation === "make" ? "make" : "buy";
  const recText = result.recommendation === "make" ? "แนะนำ: ผลิตเอง (Make)" : "แนะนำ: ซื้อจากซัพพลายเออร์ (Buy)";
  const leadNote = p.leadMake > p.leadBuy
    ? `หมายเหตุ: ผลิตเองใช้เวลานานกว่า ${p.leadMake - p.leadBuy} วัน หากงานเร่งด่วนอาจต้องพิจารณาซื้อแม้ต้นทุนสูงกว่า`
    : `หมายเหตุ: ผลิตเองใช้เวลาไม่นานกว่าซื้อ ด้าน lead time ไม่เป็นอุปสรรค`;
  const breakevenText = result.breakeven
    ? `จุดคุ้มทุน (Break-even): ${result.breakeven.toLocaleString("th-TH")} ชิ้น — หากสั่งผลิตมากกว่านี้ การผลิตเองจะคุ้มค่ากว่า`
    : `ต้นทุนต่อหน่วยของการผลิตเองไม่ต่ำกว่าการซื้อ จึงไม่มีจุดคุ้มทุนที่ทำให้ผลิตเองคุ้มค่ากว่า`;

  el.innerHTML = `
    <div class="recommend ${recClass}">${recText}</div>
    <div>ที่ปริมาณ ${p.volume.toLocaleString("th-TH")} ชิ้น: ผลิตเองรวม ${fmtBaht(result.makeTotal)} · ซื้อรวม ${fmtBaht(result.buyTotal)}</div>
    <div>ต้นทุนต่อหน่วย — ผลิตเอง ${fmtBaht(result.makeUnit)} / ซื้อ ${fmtBaht(result.buyUnit)}</div>
    <div>${breakevenText}</div>
    <div>${leadNote}</div>
  `;
}

function renderMobChart(p, result) {
  const canvas = document.getElementById("mobChart");
  if (!canvas) return;
  if (mobChartInstance) mobChartInstance.destroy();

  mobChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["ผลิตเอง (Make)", "ซื้อ (Buy)"],
      datasets: [{
        label: `ต้นทุนรวมที่ ${p.volume.toLocaleString("th-TH")} ชิ้น`,
        data: [result.makeTotal, result.buyTotal],
        backgroundColor: [cssVar("--series-1"), cssVar("--series-2")],
        borderRadius: 6,
        barThickness: 60,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "ต้นทุนรวม (บาท)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted"), callback: (v) => v.toLocaleString("th-TH") },
        },
        y: { grid: { display: false }, ticks: { color: cssVar("--text-primary") } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => fmtBaht(ctx.raw) },
        },
      },
    },
  });
}

function runMobCalculation() {
  const p = readMobForm();
  saveMobForm(p);
  const result = computeMakeOrBuy(p);
  renderMobResult(p, result);
  renderMobChart(p, result);
}

function updateMobOverviewStat() {
  const buyCount = MOB_SAMPLE_PARTS.filter((p) => computeMakeOrBuy(p).recommendation === "buy").length;
  const el = document.getElementById("statBuyRec");
  if (el) el.textContent = `${buyCount} / ${MOB_SAMPLE_PARTS.length}`;
}

function renderMobSampleTable() {
  const tbody = document.querySelector("#mobSampleTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  MOB_SAMPLE_PARTS.forEach((p) => {
    const result = computeMakeOrBuy(p);
    const pillClass = result.recommendation === "make" ? "pill-schedule" : "pill-delegate";
    const label = result.recommendation === "make" ? "ผลิตเอง" : "ซื้อ";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>${p.volume.toLocaleString("th-TH")}</td>
      <td>${fmtBaht(result.makeTotal)}</td>
      <td>${fmtBaht(result.buyTotal)}</td>
      <td><span class="pill ${pillClass}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function initMakeOrBuy() {
  const form = document.getElementById("mobForm");
  if (!form) return;
  restoreMobForm();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runMobCalculation();
  });
  runMobCalculation();
  updateMobOverviewStat();
  renderMobSampleTable();
}
