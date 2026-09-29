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


// Fill the calculator from a real part (30 ก.ย.): buy price = lowest agreed supplier price, else the last
// price actually paid; buy lead time from that supplier; material cost from the part library; quantity
// = what the open work orders still need (BOM × machines).
function mobPickHtml() {
  const parts = typeof bxAllParts === "function" ? bxAllParts() : [];
  return `<div class="form-field mob-pick"><label for="mobPick">เลือกชิ้นส่วนจากระบบ (เติมราคาซื้อ/Lead time/ปริมาณจากข้อมูลจริง)</label>
    <input id="mobPick" list="mobPickList" placeholder="พิมพ์รหัสหรือชื่อชิ้นส่วน"><datalist id="mobPickList">${parts.slice(0, 3000).map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.line.part)}</option>`).join("")}</datalist>
    <small class="muted-inline" id="mobPickNote"></small></div>`;
}
function mobFillFromPart(key) {
  const p = (typeof bxAllParts === "function" ? bxAllParts() : []).find((x) => x.key === key || x.line.code === key);
  const note = document.getElementById("mobPickNote");
  if (!p) { if (note) note.textContent = "ไม่พบรหัสนี้"; return; }
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== "") el.value = v; };
  const src = [];
  set("mobPartName", `${p.line.part} (${p.line.code || p.key})`);
  const offers = (typeof SUPPLIER_LIST !== "undefined" ? SUPPLIER_LIST : []).filter((s) => s.status === "Active")
    .map((s) => ({ s, p: (s.prices || []).find((x) => x.code === p.key || x.code === p.line.code) })).filter((x) => x.p).sort((a, b) => a.p.price - b.p.price);
  if (offers.length) { set("mobBuyPrice", offers[0].p.price); set("mobLeadBuy", offers[0].s.leadTime); src.push(`ราคาซื้อ: ราคาตกลง ${offers[0].s.name}`); }
  else if (typeof supPaid === "function") {
    const paid = supPaid("", p.line.code || p.key);
    if (paid.length) { const last = paid[paid.length - 1]; set("mobBuyPrice", last.price); const s = SUPPLIER_LIST.find((x) => x.name === last.supplier); if (s) set("mobLeadBuy", s.leadTime); src.push(`ราคาซื้อ: ซื้อจริงล่าสุด ${last.po || last.pr}`); }
  }
  const cost = typeof rdCost === "function" ? rdCost(p.key) : 0;
  if (cost) { set("mobMaterialCost", cost); src.push("ต้นทุนวัสดุ: คลังชิ้นส่วน R&D"); }
  if (typeof WORK_ORDERS !== "undefined" && typeof bxTree === "function") {
    let need = 0;
    WORK_ORDERS.filter((w) => w.status !== "เสร็จสมบูรณ์" && w.status !== "ยกเลิก").forEach((w) => {
      bxTree(w.model).forEach((r) => { if (r.line && (r.line.code === p.line.code || (typeof bxKey === "function" && bxKey(r.line) === p.key)) && !r.hasKids) need += (Number(r.per) || 0) * (Number(w.qty) || 1); });
    });
    if (need) { set("mobVolume", Math.round(need)); src.push(`ปริมาณ: ใบสั่งผลิตที่ยังไม่เสร็จต้องใช้ ${Math.round(need)}`); }
  }
  if (note) note.textContent = src.length ? src.join(" · ") + " — ค่าที่เหลือกรอกเอง แล้วกดคำนวณ" : "ยังไม่มีราคา/ต้นทุนของชิ้นนี้ในระบบ — กรอกเอง";
  if (typeof runMobCalculation === "function") runMobCalculation();
}

function initMakeOrBuy() {
  const form = document.getElementById("mobForm");
  if (form && !document.getElementById("mobPick")) {
    form.insertAdjacentHTML("afterbegin", mobPickHtml());
    document.getElementById("mobPick").addEventListener("change", (e) => mobFillFromPart(e.target.value.trim()));
  }
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
