/* ==========================================================================
   Mock / sample data for the Production Dashboard.
   Replace with real data feeds (Stock/BOM system, floor reports) in Phase 2.
   ========================================================================== */

const MACHINE_MODELS = ["YT3000", "YT6500", "YT7500", "W250", "W350", "AX5000"];

// ---- Priority Matrix -------------------------------------------------
// urgency, impact: 1-10 scale
const PRIORITY_JOBS = [
  { name: "ส่งมอบ YT6500 ล็อตพิเศษลูกค้า A", model: "YT6500", urgency: 9, impact: 9 },
  { name: "แก้ปัญหาไฮดรอลิกรั่ว YT3000", model: "YT3000", urgency: 8, impact: 8 },
  { name: "ประกอบสายไฟ AX5000 ชุดใหม่", model: "AX5000", urgency: 4, impact: 7 },
  { name: "จัดซื้อชุดเกียร์ W350", model: "W350", urgency: 7, impact: 5 },
  { name: "ทดสอบต้นแบบ YT7500", model: "YT7500", urgency: 5, impact: 9 },
  { name: "อัปเดตเอกสาร QC ใบมีดตัดอ้อย", model: "YT3000", urgency: 2, impact: 3 },
  { name: "ปรับปรุงไลน์ประกอบ W250", model: "W250", urgency: 3, impact: 6 },
  { name: "ฝึกอบรมพนักงานใหม่ไลน์ 2", model: "W250", urgency: 2, impact: 4 },
  { name: "เคลมอะไหล่ล็อต YT6500 เดือน ส.ค.", model: "YT6500", urgency: 6, impact: 3 },
  { name: "จัดทำ Spec ชิ้นส่วน AX5000 รุ่นถัดไป", model: "AX5000", urgency: 3, impact: 8 },
  { name: "ซ่อมบำรุงเครื่อง CNC สาย 1", model: "YT3000", urgency: 8, impact: 4 },
  { name: "รีวิวต้นทุนวัสดุไตรมาส 4", model: "W350", urgency: 2, impact: 2 },
];

function classifyQuadrant(urgency, impact) {
  if (urgency >= 5.5 && impact >= 5.5) return "doFirst";
  if (urgency < 5.5 && impact >= 5.5) return "schedule";
  if (urgency >= 5.5 && impact < 5.5) return "delegate";
  return "eliminate";
}

const QUADRANT_META = {
  doFirst:   { label: "ทำก่อน (Do First)",      pillClass: "pill-doFirst",   color: "var(--series-8)" },
  schedule:  { label: "วางแผน (Schedule)",       pillClass: "pill-schedule",  color: "var(--series-1)" },
  delegate:  { label: "มอบหมาย (Delegate)",      pillClass: "pill-delegate",  color: "var(--series-4)" },
  eliminate: { label: "ทบทวน/ตัดออก (Eliminate)", pillClass: "pill-eliminate", color: "var(--text-muted)" },
};

// ---- Capacity Planning -------------------------------------------------
// 8 weeks of capacity (hours available) vs planned demand (hours) per line
const CAPACITY_LINES = ["ไลน์ประกอบ 1", "ไลน์ประกอบ 2", "ไลน์เชื่อม", "ไลน์ทดสอบ"];

function seedRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const CAPACITY_DATA = {};
CAPACITY_LINES.forEach((line, li) => {
  const rand = seedRandom(li * 97 + 13);
  const baseCapacity = 320 + li * 20; // hours/week available
  const weeks = [];
  for (let w = 1; w <= 8; w++) {
    const demandFactor = 0.7 + rand() * 0.5; // 0.7 - 1.2
    weeks.push({
      week: `W${w}`,
      capacity: baseCapacity,
      demand: Math.round(baseCapacity * demandFactor),
    });
  }
  CAPACITY_DATA[line] = weeks;
});

function capacityStatus(utilPct) {
  if (utilPct > 100) return "critical";
  if (utilPct >= 90) return "warning";
  return "good";
}

// ---- Master Schedule -------------------------------------------------
// week offsets from project start, per model, per phase
const SCHEDULE_PHASES = ["ออกแบบ", "จัดซื้อ", "ประกอบ", "ทดสอบ", "ส่งมอบ"];
const PHASE_COLORS = {
  "ออกแบบ": "var(--series-7)",
  "จัดซื้อ": "var(--series-4)",
  "ประกอบ": "var(--series-1)",
  "ทดสอบ": "var(--series-3)",
  "ส่งมอบ": "var(--series-6)",
};

const MASTER_SCHEDULE = [
  { model: "YT3000", phases: [ {phase:"ออกแบบ", start:0, dur:1}, {phase:"จัดซื้อ", start:1, dur:2}, {phase:"ประกอบ", start:3, dur:4}, {phase:"ทดสอบ", start:7, dur:2}, {phase:"ส่งมอบ", start:9, dur:1} ] },
  { model: "YT6500", phases: [ {phase:"ออกแบบ", start:1, dur:2}, {phase:"จัดซื้อ", start:3, dur:3}, {phase:"ประกอบ", start:6, dur:5}, {phase:"ทดสอบ", start:11, dur:2}, {phase:"ส่งมอบ", start:13, dur:1} ] },
  { model: "YT7500", phases: [ {phase:"ออกแบบ", start:2, dur:3}, {phase:"จัดซื้อ", start:5, dur:3}, {phase:"ประกอบ", start:8, dur:5}, {phase:"ทดสอบ", start:13, dur:3}, {phase:"ส่งมอบ", start:16, dur:1} ] },
  { model: "W250",   phases: [ {phase:"ออกแบบ", start:0, dur:1}, {phase:"จัดซื้อ", start:1, dur:1}, {phase:"ประกอบ", start:2, dur:3}, {phase:"ทดสอบ", start:5, dur:1}, {phase:"ส่งมอบ", start:6, dur:1} ] },
  { model: "W350",   phases: [ {phase:"ออกแบบ", start:1, dur:1}, {phase:"จัดซื้อ", start:2, dur:2}, {phase:"ประกอบ", start:4, dur:3}, {phase:"ทดสอบ", start:7, dur:1}, {phase:"ส่งมอบ", start:8, dur:1} ] },
  { model: "AX5000", phases: [ {phase:"ออกแบบ", start:3, dur:2}, {phase:"จัดซื้อ", start:5, dur:2}, {phase:"ประกอบ", start:7, dur:4}, {phase:"ทดสอบ", start:11, dur:2}, {phase:"ส่งมอบ", start:13, dur:1} ] },
];
const SCHEDULE_TOTAL_WEEKS = 18;

// ---- Make-or-Buy sample parts (for the reference table on the module) ----
const MOB_SAMPLE_PARTS = [
  { name: "ใบมีดตัดอ้อย (Cane Blade)", material: 850, labor: 420, fixed: 45000, buyPrice: 1650, shipping: 60, volume: 200 },
  { name: "ชุดเฟืองขับ (Drive Gear Set)", material: 2100, labor: 950, fixed: 120000, buyPrice: 4200, shipping: 150, volume: 60 },
  { name: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", material: 180, labor: 90, fixed: 8000, buyPrice: 320, shipping: 15, volume: 500 },
  { name: "โครงเหล็กฐานเครื่อง (Base Frame)", material: 5200, labor: 2800, fixed: 200000, buyPrice: 9800, shipping: 400, volume: 30 },
];

function computeMakeOrBuy(p) {
  const makeUnit = p.material + p.labor;
  const buyUnit = p.buyPrice + p.shipping;
  const makeTotal = p.fixed + makeUnit * p.volume;
  const buyTotal = buyUnit * p.volume;
  const denom = buyUnit - makeUnit;
  const breakeven = denom > 0 ? Math.ceil(p.fixed / denom) : null;
  const recommendation = makeTotal <= buyTotal ? "make" : "buy";
  return { makeUnit, buyUnit, makeTotal, buyTotal, breakeven, recommendation };
}
