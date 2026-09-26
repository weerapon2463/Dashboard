/* ==========================================================================
   Mock / sample data for the Production Dashboard.
   Replace with real data feeds (Stock/BOM system, floor reports) in Phase 2.
   ========================================================================== */

const MACHINE_MODELS = ["YT3000", "YT6500", "YT7500", "W250", "W350", "AX5000"];

// รายชื่อแผนก/ไลน์ผลิตทั้งหมด ใช้ร่วมกันหลายโมดูลเพื่อให้ข้อมูลแยกแผนกได้ชัดเจนและสอดคล้องกัน
const DEPARTMENTS = [
  "ไลน์ประกอบ 1",
  "ไลน์ประกอบ 2",
  "ไลน์ประกอบ 3",
  "ไลน์เชื่อม",
  "ไลน์พ่นสี",
  "ไลน์ทดสอบ",
  "ฝ่ายจัดซื้อ",
  "ฝ่ายซ่อมบำรุง",
  "ฝ่ายวิศวกรรม/R&D",
  "ฝ่าย QC/ตรวจสอบคุณภาพ",
  "ฝ่ายขาย/ลูกค้าสัมพันธ์",
  "คลังสินค้า/พัสดุ",
];

// ---- Priority Matrix -------------------------------------------------
// urgency, impact: 1-10 scale. แต่ละงานระบุแผนกเจ้าของงาน (department) เพื่อกรองดูรายแผนกได้
const PRIORITY_JOBS = [
  { name: "ส่งมอบ YT6500 ล็อตพิเศษลูกค้า A", model: "YT6500", department: "ฝ่ายขาย/ลูกค้าสัมพันธ์", urgency: 9, impact: 9 },
  { name: "แก้ปัญหาไฮดรอลิกรั่ว YT3000 สายผลิต 1", model: "YT3000", department: "ไลน์ประกอบ 1", urgency: 8, impact: 8 },
  { name: "เคลมประกันเครื่องยนต์ YT7500 ลูกค้าโรงงานน้ำตาลพิษณุโลก", model: "YT7500", department: "ฝ่ายขาย/ลูกค้าสัมพันธ์", urgency: 8, impact: 9 },
  { name: "สายพานลำเลียงอ้อย AX5000 หยุดกะทันหันหน้างาน", model: "AX5000", department: "ฝ่ายซ่อมบำรุง", urgency: 9, impact: 7 },
  { name: "ตรวจรอยร้าวโครงเหล็กฐาน W350 ก่อนส่งมอบ", model: "W350", department: "ฝ่าย QC/ตรวจสอบคุณภาพ", urgency: 7, impact: 8 },
  { name: "เร่งประกอบ YT6500 ชุดส่งออกเวียดนาม", model: "YT6500", department: "ไลน์ประกอบ 2", urgency: 8, impact: 7 },
  { name: "ทดสอบต้นแบบ YT7500 รุ่นใบมีดคู่", model: "YT7500", department: "ไลน์ทดสอบ", urgency: 5, impact: 9 },
  { name: "ออกแบบชุดควบคุมไฮดรอลิกรุ่นใหม่ AX5000", model: "AX5000", department: "ฝ่ายวิศวกรรม/R&D", urgency: 4, impact: 8 },
  { name: "วางแผนจัดซื้อเหล็กโครงสร้างไตรมาสหน้า", model: "W250", department: "ฝ่ายจัดซื้อ", urgency: 3, impact: 7 },
  { name: "ปรับปรุงกระบวนการพ่นสีกันสนิม W350", model: "W350", department: "ไลน์พ่นสี", urgency: 4, impact: 6 },
  { name: "จัดทำ Spec ชิ้นส่วน AX5000 รุ่นถัดไป", model: "AX5000", department: "ฝ่ายวิศวกรรม/R&D", urgency: 3, impact: 8 },
  { name: "เคลมอะไหล่ล็อต YT6500 เดือน ส.ค.", model: "YT6500", department: "ฝ่ายขาย/ลูกค้าสัมพันธ์", urgency: 6, impact: 3 },
  { name: "ซ่อมบำรุงเครื่อง CNC สาย 1", model: "YT3000", department: "ฝ่ายซ่อมบำรุง", urgency: 8, impact: 4 },
  { name: "เปลี่ยนใบมีดตัดอ้อยชำรุด สาย 2", model: "YT3000", department: "ไลน์ประกอบ 2", urgency: 7, impact: 4 },
  { name: "ประกอบสายไฟ AX5000 ชุดใหม่", model: "AX5000", department: "ไลน์ประกอบ 3", urgency: 6, impact: 4 },
  { name: "ตรวจเช็คแรงดันยางล้อ W250 ก่อนส่งทดสอบสนาม", model: "W250", department: "ไลน์ทดสอบ", urgency: 6, impact: 3 },
  { name: "อัปเดตเอกสาร QC ใบมีดตัดอ้อย", model: "YT3000", department: "ฝ่าย QC/ตรวจสอบคุณภาพ", urgency: 2, impact: 3 },
  { name: "ฝึกอบรมพนักงานใหม่ไลน์ประกอบ 2", model: "W250", department: "ไลน์ประกอบ 2", urgency: 2, impact: 4 },
  { name: "รีวิวต้นทุนวัสดุไตรมาส 4", model: "W350", department: "ฝ่ายจัดซื้อ", urgency: 2, impact: 2 },
  { name: "จัดเก็บภาพถ่ายทดสอบสนามเก่าเข้าคลังเอกสาร", model: "YT7500", department: "คลังสินค้า/พัสดุ", urgency: 1, impact: 2 },
  { name: "เชื่อมซ่อมโครงสร้างฐาน YT7500 ที่แตกร้าวหน้างานลูกค้า", model: "YT7500", department: "ไลน์เชื่อม", urgency: 9, impact: 8 },
  { name: "ตรวจสอบรอยเชื่อมหุ่นยนต์เชื่อม #2 ก่อนส่งมอบล็อตใหญ่", model: "YT6500", department: "ไลน์เชื่อม", urgency: 7, impact: 7 },
  { name: "เบิกจ่ายวัสดุคงคลังสำหรับใบสั่งผลิตเร่งด่วน", model: "YT3000", department: "คลังสินค้า/พัสดุ", urgency: 8, impact: 6 },
  { name: "ตรวจนับสต๊อกอะไหล่ประจำไตรมาส", model: "W250", department: "คลังสินค้า/พัสดุ", urgency: 3, impact: 4 },
  { name: "สอบเทียบเครื่องมือวัดที่เกินกำหนด", model: "YT3000", department: "ฝ่ายซ่อมบำรุง", urgency: 7, impact: 5 },
  { name: "เจรจาต่อรองราคาเหล็กกับซัพพลายเออร์รายใหม่", model: "W350", department: "ฝ่ายจัดซื้อ", urgency: 4, impact: 6 },
  { name: "ประเมินความเสี่ยงซัพพลายเชนก่อนฤดูเก็บเกี่ยว", model: "AX5000", department: "ฝ่ายจัดซื้อ", urgency: 5, impact: 8 },
  { name: "ตรวจสอบคุณภาพสีพ่นล็อตใหม่ก่อนใช้งานจริง", model: "W350", department: "ฝ่าย QC/ตรวจสอบคุณภาพ", urgency: 6, impact: 6 },
  { name: "ปรับปรุง Line Balance ไลน์ประกอบ 3", model: "AX5000", department: "ไลน์ประกอบ 3", urgency: 4, impact: 7 },
  { name: "อบรมความปลอดภัยประจำปีไลน์เชื่อม/พ่นสี", model: "YT6500", department: "ไลน์เชื่อม", urgency: 2, impact: 5 },
  { name: "ติดตามข้อร้องเรียนลูกค้าเรื่องเสียงเครื่องยนต์ W250", model: "W250", department: "ฝ่ายขาย/ลูกค้าสัมพันธ์", urgency: 6, impact: 7 },
  { name: "วางแผนกำลังคนไลน์ทดสอบช่วงพีค", model: "YT7500", department: "ไลน์ทดสอบ", urgency: 5, impact: 6 },
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
// 10 weeks of capacity (hours available) vs planned demand (hours) per line.
// Demand is hand-tuned to tell a realistic story: lines trending from
// comfortable toward the harvest-season peak, with the welding line
// ("ไลน์เชื่อม") emerging as the clear bottleneck by week 7-8.
const CAPACITY_LINES = ["ไลน์ประกอบ 1", "ไลน์ประกอบ 2", "ไลน์ประกอบ 3", "ไลน์เชื่อม", "ไลน์พ่นสี", "ไลน์ทดสอบ"];

const CAPACITY_WEEKLY_DEMAND = {
  "ไลน์ประกอบ 1": { capacity: 320, demand: [250, 260, 270, 285, 295, 300, 310, 320, 330, 340] },
  "ไลน์ประกอบ 2": { capacity: 300, demand: [230, 235, 245, 250, 260, 265, 275, 280, 290, 300] },
  "ไลน์ประกอบ 3": { capacity: 280, demand: [210, 215, 220, 225, 230, 225, 235, 240, 245, 250] },
  "ไลน์เชื่อม":    { capacity: 260, demand: [220, 225, 235, 245, 255, 265, 275, 285, 295, 305] },
  "ไลน์พ่นสี":     { capacity: 240, demand: [180, 185, 190, 195, 200, 205, 210, 215, 220, 225] },
  "ไลน์ทดสอบ":    { capacity: 200, demand: [150, 155, 160, 170, 180, 190, 195, 205, 210, 215] },
};

const CAPACITY_DATA = {};
CAPACITY_LINES.forEach((line) => {
  const cfg = CAPACITY_WEEKLY_DEMAND[line];
  CAPACITY_DATA[line] = cfg.demand.map((demand, i) => ({
    week: `W${i + 1}`,
    capacity: cfg.capacity,
    demand,
  }));
});

function capacityStatus(utilPct) {
  if (utilPct > 100) return "critical";
  if (utilPct >= 90) return "warning";
  return "good";
}

// ---- Master Schedule -------------------------------------------------
// week offsets from project start, per production order, per phase.
// Spans a 24-week (~6 month) production outlook with multiple concurrent
// batches for the higher-demand models (YT3000, YT6500).
// Product name — the company name and logo come from each company's settings (org.js)
const APP_NAME = "FORGE";
const APP_TAGLINE = "ระบบบริหารโรงงานครบวงจร";

const SCHEDULE_PHASES = ["ออกแบบ", "จัดซื้อ", "ประกอบ", "ทดสอบ", "ส่งมอบ"];
const PHASE_COLORS = {
  "ออกแบบ": "var(--series-7)",
  "จัดซื้อ": "var(--series-4)",
  "ประกอบ": "var(--series-1)",
  "ทดสอบ": "var(--series-3)",
  "ส่งมอบ": "var(--series-6)",
};

const MASTER_SCHEDULE = [
  { model: "YT3000 (ล็อต 1)", phases: [ {phase:"ออกแบบ", start:0, dur:1}, {phase:"จัดซื้อ", start:1, dur:2}, {phase:"ประกอบ", start:3, dur:4}, {phase:"ทดสอบ", start:7, dur:2}, {phase:"ส่งมอบ", start:9, dur:1} ] },
  { model: "YT3000 (ล็อต 2)", phases: [ {phase:"ออกแบบ", start:8, dur:1}, {phase:"จัดซื้อ", start:9, dur:2}, {phase:"ประกอบ", start:11, dur:4}, {phase:"ทดสอบ", start:15, dur:2}, {phase:"ส่งมอบ", start:17, dur:1} ] },
  { model: "YT6500 (ลูกค้า A)", phases: [ {phase:"ออกแบบ", start:1, dur:2}, {phase:"จัดซื้อ", start:3, dur:3}, {phase:"ประกอบ", start:6, dur:5}, {phase:"ทดสอบ", start:11, dur:2}, {phase:"ส่งมอบ", start:13, dur:1} ] },
  { model: "YT6500 (ส่งออกเวียดนาม)", phases: [ {phase:"ออกแบบ", start:10, dur:2}, {phase:"จัดซื้อ", start:12, dur:3}, {phase:"ประกอบ", start:15, dur:5}, {phase:"ทดสอบ", start:20, dur:2}, {phase:"ส่งมอบ", start:22, dur:1} ] },
  { model: "YT7500 (ต้นแบบใบมีดคู่)", phases: [ {phase:"ออกแบบ", start:2, dur:3}, {phase:"จัดซื้อ", start:5, dur:3}, {phase:"ประกอบ", start:8, dur:5}, {phase:"ทดสอบ", start:13, dur:3}, {phase:"ส่งมอบ", start:16, dur:1} ] },
  { model: "W250",   phases: [ {phase:"ออกแบบ", start:0, dur:1}, {phase:"จัดซื้อ", start:1, dur:1}, {phase:"ประกอบ", start:2, dur:3}, {phase:"ทดสอบ", start:5, dur:1}, {phase:"ส่งมอบ", start:6, dur:1} ] },
  { model: "W350",   phases: [ {phase:"ออกแบบ", start:1, dur:1}, {phase:"จัดซื้อ", start:2, dur:2}, {phase:"ประกอบ", start:4, dur:3}, {phase:"ทดสอบ", start:7, dur:1}, {phase:"ส่งมอบ", start:8, dur:1} ] },
  { model: "AX5000", phases: [ {phase:"ออกแบบ", start:3, dur:2}, {phase:"จัดซื้อ", start:5, dur:2}, {phase:"ประกอบ", start:7, dur:4}, {phase:"ทดสอบ", start:11, dur:2}, {phase:"ส่งมอบ", start:13, dur:1} ] },
];
const SCHEDULE_TOTAL_WEEKS = 24;

// ---- Make-or-Buy sample parts (for the reference table on the module) ----
// category สอดคล้องกับหมวดหมู่ในรายชื่อซัพพลายเออร์ (SUPPLIER_LIST) เพื่อเชื่อมโยงข้อมูลข้ามโมดูล
const MOB_SAMPLE_PARTS = [
  { name: "ใบมีดตัดอ้อย (Cane Blade)", category: "ชิ้นส่วนตัด/มีด", material: 850, labor: 420, fixed: 45000, buyPrice: 1650, shipping: 60, volume: 200 },
  { name: "ชุดเฟืองขับ (Drive Gear Set)", category: "เฟือง/ระบบขับ", material: 2100, labor: 950, fixed: 120000, buyPrice: 4200, shipping: 150, volume: 60 },
  { name: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", category: "ไฮดรอลิก", material: 180, labor: 90, fixed: 8000, buyPrice: 320, shipping: 15, volume: 500 },
  { name: "โครงเหล็กฐานเครื่อง (Base Frame)", category: "เหล็ก/โครงสร้าง", material: 5200, labor: 2800, fixed: 200000, buyPrice: 9800, shipping: 400, volume: 30 },
  { name: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", category: "เหล็ก/โครงสร้าง", material: 1200, labor: 550, fixed: 60000, buyPrice: 2400, shipping: 100, volume: 80 },
  { name: "โซ่ลำเลียงอ้อย (Conveyor Chain)", category: "ชิ้นส่วนลำเลียง/โซ่", material: 650, labor: 300, fixed: 30000, buyPrice: 1150, shipping: 80, volume: 150 },
  { name: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", category: "ไฮดรอลิก", material: 220, labor: 120, fixed: 12000, buyPrice: 380, shipping: 20, volume: 400 },
  { name: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", category: "อะไหล่หุ่นยนต์/ไฟฟ้า", material: 90, labor: 60, fixed: 5000, buyPrice: 160, shipping: 10, volume: 600 },
  { name: "ล้อยางตัดอ้อย (Track Wheel)", category: "ยาง/ล้อ/ช่วงล่าง", material: 3200, labor: 1100, fixed: 90000, buyPrice: 5800, shipping: 250, volume: 40 },
  { name: "ชุดกรองน้ำมันไฮดรอลิก (Hydraulic Filter Kit)", category: "ไฮดรอลิก", material: 320, labor: 140, fixed: 15000, buyPrice: 580, shipping: 25, volume: 250 },
  { name: "แผ่นกันสะเก็ดเชื่อม (Welding Spatter Shield)", category: "วัสดุสิ้นเปลืองงานเชื่อม", material: 60, labor: 40, fixed: 3000, buyPrice: 110, shipping: 8, volume: 800 },
  { name: "หน้ากากเชื่อมนิรภัย (Welding Helmet)", category: "อุปกรณ์ความปลอดภัย (PPE)", material: 380, labor: 90, fixed: 10000, buyPrice: 650, shipping: 30, volume: 120 },
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

// ---- Resource Management: คน / เครื่องจักร / เครื่องมือ -------------------
// รวมทั้งไลน์ผลิตและแผนกสนับสนุน (คลังสินค้า, QC) เพื่อให้เห็นภาพกำลังคนทั้งโรงงาน
const LABOR_PLAN = [
  { line: "ไลน์ประกอบ 1", required: 18, actual: 16, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์ประกอบ 2", required: 16, actual: 16, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์ประกอบ 3", required: 14, actual: 12, shift: "1 กะ (เช้า)" },
  { line: "ไลน์เชื่อม", required: 12, actual: 9, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์พ่นสี", required: 8, actual: 8, shift: "1 กะ (เช้า)" },
  { line: "ไลน์ทดสอบ", required: 6, actual: 5, shift: "1 กะ (เช้า)" },
  { line: "คลังสินค้า/พัสดุ", required: 6, actual: 6, shift: "1 กะ (เช้า)" },
  { line: "ฝ่าย QC/ตรวจสอบคุณภาพ", required: 8, actual: 6, shift: "2 กะ (เช้า-บ่าย)" },
];

function laborStatus(gap) {
  if (gap <= -3) return "critical";
  if (gap < 0) return "warning";
  return "good";
}

// เครื่องจักร/อุปกรณ์หลักในสายการผลิต (ไม่ใช่รุ่นรถตัดอ้อยที่ผลิต แต่เป็นเครื่องมือที่ใช้ผลิต)
// department ระบุแผนก/ไลน์ที่เป็นเจ้าของหรือใช้งานเครื่องจักรนั้น
const MACHINE_STATUS = [
  { name: "เครื่อง CNC กัดชิ้นส่วน สาย 1", department: "ไลน์ประกอบ 1", status: "ใช้งานปกติ", util: 82, note: "บำรุงรักษาถัดไป 5 ต.ค. 2569" },
  { name: "เครื่อง CNC กัดชิ้นส่วน สาย 2", department: "ไลน์ประกอบ 2", status: "ใช้งานปกติ", util: 75, note: "บำรุงรักษาถัดไป 12 ต.ค. 2569" },
  { name: "เครื่องตัดเลเซอร์แผ่นเหล็ก (Laser Cutter)", department: "ไลน์ประกอบ 1", status: "ซ่อมบำรุง", util: 0, note: "รอชิ้นส่วนอะไหล่หัวตัด คาดเสร็จ 28 ก.ย. 2569" },
  { name: "หุ่นยนต์เชื่อม (Welding Robot) #1", department: "ไลน์เชื่อม", status: "ซ่อมบำรุง", util: 0, note: "อยู่ระหว่างซ่อม คาดเสร็จ 24 ก.ย. 2569" },
  { name: "หุ่นยนต์เชื่อม (Welding Robot) #2", department: "ไลน์เชื่อม", status: "ใช้งานปกติ", util: 91, note: "บำรุงรักษาถัดไป 18 ต.ค. 2569" },
  { name: "ห้องพ่นสีอบแห้ง (Paint Booth)", department: "ไลน์พ่นสี", status: "ใช้งานปกติ", util: 88, note: "บำรุงรักษาถัดไป 1 พ.ย. 2569" },
  { name: "เครื่องทดสอบแรงดันไฮดรอลิก (Test Bench)", department: "ไลน์ทดสอบ", status: "ใช้งานปกติ", util: 70, note: "บำรุงรักษาถัดไป 20 ต.ค. 2569" },
  { name: "ลิฟต์ยกไฮดรอลิก ไลน์ประกอบ 2", department: "ไลน์ประกอบ 2", status: "ใช้งานปกติ", util: 65, note: "บำรุงรักษาถัดไป 30 ต.ค. 2569" },
  { name: "เครน 5 ตัน ไลน์ประกอบ", department: "ไลน์ประกอบ 3", status: "ใช้งานปกติ", util: 60, note: "บำรุงรักษาถัดไป 15 พ.ย. 2569" },
  { name: "รถโฟล์คลิฟท์ #1", department: "คลังสินค้า/พัสดุ", status: "ใช้งานปกติ", util: 55, note: "บำรุงรักษาถัดไป 8 พ.ย. 2569" },
  { name: "รถโฟล์คลิฟท์ #3", department: "คลังสินค้า/พัสดุ", status: "เสีย", util: 0, note: "รออะไหล่ล้อไฮดรอลิก" },
];
const MACHINE_STATUS_META = { "ใช้งานปกติ": "good", "ซ่อมบำรุง": "warning", "เสีย": "critical" };

// department ระบุแผนกที่ดูแล/ใช้งานเครื่องมือวัดชิ้นนั้น
const TOOL_CALIBRATION = [
  { name: "เวอร์เนียคาลิปเปอร์ ชุด A", department: "ไลน์ประกอบ 1", lastCal: "1 มี.ค. 2569", nextCal: "1 ก.ย. 2569", status: "เกินกำหนด" },
  { name: "เวอร์เนียคาลิปเปอร์ ชุด C", department: "ไลน์ประกอบ 3", lastCal: "20 ก.ค. 2569", nextCal: "20 ม.ค. 2570", status: "ปกติ" },
  { name: "ไมโครมิเตอร์ ชุด B", department: "ไลน์ประกอบ 2", lastCal: "10 ก.ค. 2569", nextCal: "10 ม.ค. 2570", status: "ปกติ" },
  { name: "เครื่องวัดแรงบิด (Torque Wrench) #1", department: "ไลน์เชื่อม", lastCal: "5 ส.ค. 2569", nextCal: "5 ก.พ. 2570", status: "ปกติ" },
  { name: "เกจวัดความดันไฮดรอลิก", department: "ไลน์ทดสอบ", lastCal: "20 มิ.ย. 2569", nextCal: "20 ธ.ค. 2569", status: "ใกล้ครบกำหนด" },
  { name: "เครื่องมือวัดกระแสไฟเชื่อม", department: "ไลน์เชื่อม", lastCal: "15 ก.ค. 2569", nextCal: "15 ม.ค. 2570", status: "ปกติ" },
  { name: "เครื่องวัดความหนาสีพ่น (Coating Thickness Gauge)", department: "ไลน์พ่นสี", lastCal: "1 ส.ค. 2569", nextCal: "1 ก.พ. 2570", status: "ปกติ" },
  { name: "ตาชั่งดิจิทัลชั่งวัสดุ", department: "คลังสินค้า/พัสดุ", lastCal: "15 พ.ค. 2569", nextCal: "15 พ.ย. 2569", status: "ใกล้ครบกำหนด" },
];
const TOOL_STATUS_META = { "ปกติ": "good", "ใกล้ครบกำหนด": "warning", "เกินกำหนด": "critical" };

// ---- Procurement: PR / PO / Supplier ----------------------------------
const PR_LIST = [
  { id: "PR-2026-0142", item: "เหล็กแผ่นโครงสร้าง SS400 หนา 6 มม.", requester: "ไลน์ประกอบ 1", date: "10 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0143", item: "ชุดเฟืองขับ (Drive Gear Set) x60", requester: "ฝ่ายจัดซื้อ", date: "12 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0144", item: "Servo Motor สำหรับหุ่นยนต์เชื่อม", requester: "ฝ่ายซ่อมบำรุง", date: "15 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0145", item: "สีพ่นกันสนิม (Epoxy Primer) 200 ลิตร", requester: "ไลน์พ่นสี", date: "16 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0146", item: "ล้อไฮดรอลิกรถโฟล์คลิฟท์", requester: "คลังสินค้า/พัสดุ", date: "18 ก.ย. 2569", status: "ปฏิเสธ" },
  { id: "PR-2026-0147", item: "ใบมีดตัดอ้อย (Cane Blade) x200", requester: "ไลน์ประกอบ 2", date: "19 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0148", item: "ลวดเชื่อม CO2 เบอร์ 1.2 มม.", requester: "ไลน์เชื่อม", date: "20 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0149", item: "อุปกรณ์ป้องกันภัยส่วนบุคคล (PPE) ชุดใหม่", requester: "ฝ่ายซ่อมบำรุง", date: "21 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0150", item: "ชั้นวางพาเลทคลังสินค้าเพิ่มเติม", requester: "คลังสินค้า/พัสดุ", date: "22 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0151", item: "ยางล้อทดสอบสนาม W250/W350", requester: "ไลน์ทดสอบ", date: "23 ก.ย. 2569", status: "อนุมัติแล้ว" },
];
const PR_STATUS_META = { "รออนุมัติ": "warning", "อนุมัติแล้ว": "good", "ปฏิเสธ": "critical" };

const PO_LIST = [
  { id: "PO-2026-0311", supplier: "บจก. เหล็กไทยรุ่งเรือง", item: "เหล็กแผ่นโครงสร้าง SS400", value: 285000, orderDate: "11 ก.ย. 2569", dueDate: "25 ก.ย. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0312", supplier: "บจก. ไฮดรอลิกซัพพลาย", item: "ปลอกสายไฮดรอลิก x500", value: 90000, orderDate: "5 ก.ย. 2569", dueDate: "19 ก.ย. 2569", status: "ล่าช้า" },
  { id: "PO-2026-0313", supplier: "หจก. เกียร์ทรานสมิชชั่น", item: "ชุดเฟืองขับ x60", value: 252000, orderDate: "14 ก.ย. 2569", dueDate: "5 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0314", supplier: "บจก. ออโต้เมชั่นเซอร์วิส", item: "Servo Motor หุ่นยนต์เชื่อม", value: 138000, orderDate: "16 ก.ย. 2569", dueDate: "23 ก.ย. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0315", supplier: "บจก. สีเคมีภัณฑ์ไทย", item: "สีพ่นกันสนิม 200 ลิตร", value: 64000, orderDate: "1 ก.ย. 2569", dueDate: "10 ก.ย. 2569", status: "ส่งมอบแล้ว" },
  { id: "PO-2026-0316", supplier: "บจก. วาย ทู เจ พาร์ทเนอร์", item: "ใบมีดตัดอ้อย x200", value: 170000, orderDate: "20 ก.ย. 2569", dueDate: "4 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0317", supplier: "บจก. เชื่อมไทยอุตสาหกรรม", item: "ลวดเชื่อม CO2 x500 กก.", value: 112000, orderDate: "21 ก.ย. 2569", dueDate: "1 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0318", supplier: "หจก. อะไหล่ยานยนต์ภาคเหนือ", item: "ยางล้อทดสอบสนาม x20", value: 96000, orderDate: "23 ก.ย. 2569", dueDate: "13 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0319", supplier: "บจก. เซฟตี้เกียร์ไทย", item: "อุปกรณ์ PPE ชุดใหม่", value: 45000, orderDate: "21 ก.ย. 2569", dueDate: "28 ก.ย. 2569", status: "ล่าช้า" },
  { id: "PO-2026-0320", supplier: "บจก. คลังภัณฑ์เมทัลเวิร์ค", item: "ชั้นวางพาเลท x10 ชุด", value: 78000, orderDate: "22 ก.ย. 2569", dueDate: "6 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0321", supplier: "หจก. เกียร์ทรานสมิชชั่น", item: "ชุดซีลกระบอกไฮดรอลิก x30 (YT7500)", value: 45000, orderDate: "24 ก.ย. 2569", dueDate: "8 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0322", supplier: "บจก. เหล็กไทยรุ่งเรือง", item: "เหล็กแผ่นโครงสร้าง SS400 (W250)", value: 95000, orderDate: "20 ก.ย. 2569", dueDate: "4 ต.ค. 2569", status: "รอส่งมอบ" },
];
const PO_STATUS_META = { "รอส่งมอบ": "warning", "ส่งมอบแล้ว": "good", "ล่าช้า": "critical" };

const SUPPLIER_LIST = [
  { name: "บจก. เหล็กไทยรุ่งเรือง", category: "เหล็ก/โครงสร้าง", leadTime: 14, rating: 4.5, status: "Active" },
  { name: "บจก. ไฮดรอลิกซัพพลาย", category: "ไฮดรอลิก", leadTime: 10, rating: 3.8, status: "Active" },
  { name: "หจก. เกียร์ทรานสมิชชั่น", category: "เฟือง/ระบบขับ", leadTime: 21, rating: 4.2, status: "Active" },
  { name: "บจก. ออโต้เมชั่นเซอร์วิส", category: "อะไหล่หุ่นยนต์/ไฟฟ้า", leadTime: 7, rating: 4.7, status: "Active" },
  { name: "บจก. สีเคมีภัณฑ์ไทย", category: "สี/เคมีภัณฑ์", leadTime: 9, rating: 4.0, status: "Active" },
  { name: "บจก. วาย ทู เจ พาร์ทเนอร์", category: "ชิ้นส่วนตัด/มีด", leadTime: 12, rating: 4.3, status: "Active" },
  { name: "หจก. อะไหล่ยานยนต์ภาคเหนือ", category: "ยาง/ล้อ/ช่วงล่าง", leadTime: 18, rating: 3.2, status: "On Hold" },
  { name: "บจก. เชื่อมไทยอุตสาหกรรม", category: "วัสดุสิ้นเปลืองงานเชื่อม", leadTime: 8, rating: 4.1, status: "Active" },
  { name: "บจก. เซฟตี้เกียร์ไทย", category: "อุปกรณ์ความปลอดภัย (PPE)", leadTime: 6, rating: 4.4, status: "Active" },
  { name: "บจก. คลังภัณฑ์เมทัลเวิร์ค", category: "อุปกรณ์คลังสินค้า", leadTime: 15, rating: 3.9, status: "Active" },
];
const SUPPLIER_STATUS_META = { "Active": "good", "On Hold": "warning" };

// ---- Work Orders (ใบสั่งผลิต) grouped as projects by PO --------------------
// เชื่อมโยงกับ PO_LIST (จัดซื้อ) เพื่อให้ดูเป็น "โปรเจกต์" ตามใบสั่งซื้อแต่ละใบ
// department ระบุไลน์ประกอบที่รับผิดชอบผลิตใบสั่งผลิตนั้น เพื่อกรองดูงานแยกตามไลน์ได้
const WORK_ORDERS = [
  { wo: "WO-2026-081", po: "PO-2026-0311", model: "YT3000", department: "ไลน์ประกอบ 1", qty: 5, status: "กำลังผลิต", issuedPct: 80, dueDate: "9 ต.ค. 2569" },
  { wo: "WO-2026-082", po: "PO-2026-0313", model: "YT6500", department: "ไลน์ประกอบ 2", qty: 3, status: "กำลังผลิต", issuedPct: 60, dueDate: "5 ต.ค. 2569" },
  { wo: "WO-2026-083", po: "PO-2026-0312", model: "YT3000", department: "ไลน์ประกอบ 1", qty: 4, status: "ล่าช้า", issuedPct: 45, dueDate: "19 ก.ย. 2569" },
  { wo: "WO-2026-084", po: "PO-2026-0314", model: "AX5000", department: "ไลน์ประกอบ 3", qty: 2, status: "กำลังผลิต", issuedPct: 70, dueDate: "23 ก.ย. 2569" },
  { wo: "WO-2026-085", po: "PO-2026-0316", model: "YT3000", department: "ไลน์ประกอบ 1", qty: 6, status: "วางแผน", issuedPct: 0, dueDate: "4 ต.ค. 2569" },
  { wo: "WO-2026-086", po: "PO-2026-0315", model: "W350", department: "ไลน์ประกอบ 3", qty: 3, status: "เสร็จสมบูรณ์", issuedPct: 100, dueDate: "10 ก.ย. 2569" },
  { wo: "WO-2026-087", po: "PO-2026-0321", model: "YT7500", department: "ไลน์ประกอบ 2", qty: 2, status: "กำลังผลิต", issuedPct: 50, dueDate: "15 ต.ค. 2569" },
  { wo: "WO-2026-088", po: "PO-2026-0322", model: "W250", department: "ไลน์ประกอบ 3", qty: 4, status: "วางแผน", issuedPct: 0, dueDate: "10 ต.ค. 2569" },
  { wo: "WO-2026-089", po: "PO-2026-0313", model: "YT6500", department: "ไลน์ประกอบ 2", qty: 2, status: "วางแผน", issuedPct: 0, dueDate: "20 ต.ค. 2569" },
  { wo: "WO-2026-090", po: "PO-2026-0311", model: "YT3000", department: "ไลน์ประกอบ 1", qty: 3, status: "กำลังผลิต", issuedPct: 30, dueDate: "18 ต.ค. 2569" },
];
// ค่าในนี้คือชื่อคลาส pill เต็ม (ไม่ใช่แค่ good/warning/critical) เพื่อให้มีสถานะ "วางแผน" แบบกลาง ๆ ได้
const WO_STATUS_META = { "วางแผน": "pill-schedule", "กำลังผลิต": "pill-good", "ล่าช้า": "pill-critical", "เสร็จสมบูรณ์": "pill-good" };

// ---- Master BOM (บิลวัสดุหลัก) ต่อรุ่นเครื่องจักร --------------------------
// อ้างอิงชื่อชิ้นส่วนชุดเดียวกับ MOB_SAMPLE_PARTS เพื่อให้เชื่อมโยงกับโมดูล Make-or-Buy ได้
const MASTER_BOM = {
  YT3000: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 2, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 1, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 8, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 4, unit: "ชุด" },
    { part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", qty: 1, unit: "ชุด" },
  ],
  YT6500: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 2, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 2, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 10, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", qty: 1, unit: "ชุด" },
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 1, unit: "เส้น" },
  ],
  YT7500: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 2, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 2, unit: "ชุด" },
    { part: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", qty: 6, unit: "ชุด" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 2, unit: "เส้น" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 4, unit: "ชุด" },
  ],
  W250: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 1, unit: "ชิ้น" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 6, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 3, unit: "ชุด" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 1, unit: "ชุด" },
  ],
  W350: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 1, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 1, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 6, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", qty: 1, unit: "ชุด" },
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 1, unit: "เส้น" },
  ],
  AX5000: [
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 3, unit: "เส้น" },
    { part: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", qty: 4, unit: "ชุด" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 6, unit: "ชุด" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 12, unit: "ชิ้น" },
  ],
};

// ---- การเบิกวัสดุประกอบตามใบสั่งผลิต (Material Issuance) -------------------
const MATERIAL_ISSUANCE = [
  { wo: "WO-2026-081", part: "ใบมีดตัดอ้อย (Cane Blade)", required: 10, issued: 8, status: "เบิกบางส่วน" },
  { wo: "WO-2026-081", part: "ชุดเฟืองขับ (Drive Gear Set)", required: 5, issued: 5, status: "เบิกครบ" },
  { wo: "WO-2026-082", part: "ชุดเฟืองขับ (Drive Gear Set)", required: 6, issued: 6, status: "เบิกครบ" },
  { wo: "WO-2026-083", part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", required: 32, issued: 10, status: "เบิกบางส่วน" },
  { wo: "WO-2026-083", part: "โครงเหล็กฐานเครื่อง (Base Frame)", required: 4, issued: 0, status: "รอเบิก" },
  { wo: "WO-2026-084", part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", required: 6, issued: 5, status: "เบิกบางส่วน" },
  { wo: "WO-2026-085", part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", required: 6, issued: 0, status: "รอเบิก" },
  { wo: "WO-2026-086", part: "โครงเหล็กฐานเครื่อง (Base Frame)", required: 3, issued: 3, status: "เบิกครบ" },
  { wo: "WO-2026-087", part: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", required: 12, issued: 6, status: "เบิกบางส่วน" },
  { wo: "WO-2026-088", part: "โครงเหล็กฐานเครื่อง (Base Frame)", required: 4, issued: 0, status: "รอเบิก" },
  { wo: "WO-2026-089", part: "ชุดเฟืองขับ (Drive Gear Set)", required: 4, issued: 4, status: "เบิกครบ" },
  { wo: "WO-2026-090", part: "ใบมีดตัดอ้อย (Cane Blade)", required: 6, issued: 4, status: "เบิกบางส่วน" },
];
const ISSUANCE_STATUS_META = { "เบิกครบ": "pill-good", "เบิกบางส่วน": "pill-warning", "รอเบิก": "pill-critical" };
