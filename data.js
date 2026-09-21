/* ==========================================================================
   Mock / sample data for the Production Dashboard.
   Replace with real data feeds (Stock/BOM system, floor reports) in Phase 2.
   ========================================================================== */

const MACHINE_MODELS = ["YT3000", "YT6500", "YT7500", "W250", "W350", "AX5000"];

// ---- Priority Matrix -------------------------------------------------
// urgency, impact: 1-10 scale
const PRIORITY_JOBS = [
  { name: "ส่งมอบ YT6500 ล็อตพิเศษลูกค้า A", model: "YT6500", urgency: 9, impact: 9 },
  { name: "แก้ปัญหาไฮดรอลิกรั่ว YT3000 สายผลิต 1", model: "YT3000", urgency: 8, impact: 8 },
  { name: "เคลมประกันเครื่องยนต์ YT7500 ลูกค้าโรงงานน้ำตาลพิษณุโลก", model: "YT7500", urgency: 8, impact: 9 },
  { name: "สายพานลำเลียงอ้อย AX5000 หยุดกะทันหันหน้างาน", model: "AX5000", urgency: 9, impact: 7 },
  { name: "ตรวจรอยร้าวโครงเหล็กฐาน W350 ก่อนส่งมอบ", model: "W350", urgency: 7, impact: 8 },
  { name: "เร่งประกอบ YT6500 ชุดส่งออกเวียดนาม", model: "YT6500", urgency: 8, impact: 7 },
  { name: "ทดสอบต้นแบบ YT7500 รุ่นใบมีดคู่", model: "YT7500", urgency: 5, impact: 9 },
  { name: "ออกแบบชุดควบคุมไฮดรอลิกรุ่นใหม่ AX5000", model: "AX5000", urgency: 4, impact: 8 },
  { name: "วางแผนจัดซื้อเหล็กโครงสร้างไตรมาสหน้า", model: "W250", urgency: 3, impact: 7 },
  { name: "ปรับปรุงกระบวนการพ่นสีกันสนิม W350", model: "W350", urgency: 4, impact: 6 },
  { name: "จัดทำ Spec ชิ้นส่วน AX5000 รุ่นถัดไป", model: "AX5000", urgency: 3, impact: 8 },
  { name: "เคลมอะไหล่ล็อต YT6500 เดือน ส.ค.", model: "YT6500", urgency: 6, impact: 3 },
  { name: "ซ่อมบำรุงเครื่อง CNC สาย 1", model: "YT3000", urgency: 8, impact: 4 },
  { name: "เปลี่ยนใบมีดตัดอ้อยชำรุด สาย 2", model: "YT3000", urgency: 7, impact: 4 },
  { name: "ประกอบสายไฟ AX5000 ชุดใหม่", model: "AX5000", urgency: 6, impact: 4 },
  { name: "ตรวจเช็คแรงดันยางล้อ W250 ก่อนส่งทดสอบสนาม", model: "W250", urgency: 6, impact: 3 },
  { name: "อัปเดตเอกสาร QC ใบมีดตัดอ้อย", model: "YT3000", urgency: 2, impact: 3 },
  { name: "ฝึกอบรมพนักงานใหม่ไลน์ประกอบ 2", model: "W250", urgency: 2, impact: 4 },
  { name: "รีวิวต้นทุนวัสดุไตรมาส 4", model: "W350", urgency: 2, impact: 2 },
  { name: "จัดเก็บภาพถ่ายทดสอบสนามเก่าเข้าคลังเอกสาร", model: "YT7500", urgency: 1, impact: 2 },
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
const MOB_SAMPLE_PARTS = [
  { name: "ใบมีดตัดอ้อย (Cane Blade)", material: 850, labor: 420, fixed: 45000, buyPrice: 1650, shipping: 60, volume: 200 },
  { name: "ชุดเฟืองขับ (Drive Gear Set)", material: 2100, labor: 950, fixed: 120000, buyPrice: 4200, shipping: 150, volume: 60 },
  { name: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", material: 180, labor: 90, fixed: 8000, buyPrice: 320, shipping: 15, volume: 500 },
  { name: "โครงเหล็กฐานเครื่อง (Base Frame)", material: 5200, labor: 2800, fixed: 200000, buyPrice: 9800, shipping: 400, volume: 30 },
  { name: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", material: 1200, labor: 550, fixed: 60000, buyPrice: 2400, shipping: 100, volume: 80 },
  { name: "โซ่ลำเลียงอ้อย (Conveyor Chain)", material: 650, labor: 300, fixed: 30000, buyPrice: 1150, shipping: 80, volume: 150 },
  { name: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", material: 220, labor: 120, fixed: 12000, buyPrice: 380, shipping: 20, volume: 400 },
  { name: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", material: 90, labor: 60, fixed: 5000, buyPrice: 160, shipping: 10, volume: 600 },
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
const LABOR_PLAN = [
  { line: "ไลน์ประกอบ 1", required: 18, actual: 16, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์ประกอบ 2", required: 16, actual: 16, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์ประกอบ 3", required: 14, actual: 12, shift: "1 กะ (เช้า)" },
  { line: "ไลน์เชื่อม", required: 12, actual: 9, shift: "2 กะ (เช้า-บ่าย)" },
  { line: "ไลน์พ่นสี", required: 8, actual: 8, shift: "1 กะ (เช้า)" },
  { line: "ไลน์ทดสอบ", required: 6, actual: 5, shift: "1 กะ (เช้า)" },
];

function laborStatus(gap) {
  if (gap <= -3) return "critical";
  if (gap < 0) return "warning";
  return "good";
}

// เครื่องจักร/อุปกรณ์หลักในสายการผลิต (ไม่ใช่รุ่นรถตัดอ้อยที่ผลิต แต่เป็นเครื่องมือที่ใช้ผลิต)
const MACHINE_STATUS = [
  { name: "เครื่อง CNC กัดชิ้นส่วน สาย 1", status: "ใช้งานปกติ", util: 82, note: "บำรุงรักษาถัดไป 5 ต.ค. 2569" },
  { name: "เครื่อง CNC กัดชิ้นส่วน สาย 2", status: "ใช้งานปกติ", util: 75, note: "บำรุงรักษาถัดไป 12 ต.ค. 2569" },
  { name: "หุ่นยนต์เชื่อม (Welding Robot) #1", status: "ซ่อมบำรุง", util: 0, note: "อยู่ระหว่างซ่อม คาดเสร็จ 24 ก.ย. 2569" },
  { name: "หุ่นยนต์เชื่อม (Welding Robot) #2", status: "ใช้งานปกติ", util: 91, note: "บำรุงรักษาถัดไป 18 ต.ค. 2569" },
  { name: "ห้องพ่นสีอบแห้ง (Paint Booth)", status: "ใช้งานปกติ", util: 88, note: "บำรุงรักษาถัดไป 1 พ.ย. 2569" },
  { name: "เครน 5 ตัน ไลน์ประกอบ", status: "ใช้งานปกติ", util: 60, note: "บำรุงรักษาถัดไป 15 พ.ย. 2569" },
  { name: "รถโฟล์คลิฟท์ #3", status: "เสีย", util: 0, note: "รออะไหล่ล้อไฮดรอลิก" },
];
const MACHINE_STATUS_META = { "ใช้งานปกติ": "good", "ซ่อมบำรุง": "warning", "เสีย": "critical" };

const TOOL_CALIBRATION = [
  { name: "เวอร์เนียคาลิปเปอร์ ชุด A", lastCal: "1 มี.ค. 2569", nextCal: "1 ก.ย. 2569", status: "เกินกำหนด" },
  { name: "ไมโครมิเตอร์ ชุด B", lastCal: "10 ก.ค. 2569", nextCal: "10 ม.ค. 2570", status: "ปกติ" },
  { name: "เครื่องวัดแรงบิด (Torque Wrench) #1", lastCal: "5 ส.ค. 2569", nextCal: "5 ก.พ. 2570", status: "ปกติ" },
  { name: "เกจวัดความดันไฮดรอลิก", lastCal: "20 มิ.ย. 2569", nextCal: "20 ธ.ค. 2569", status: "ใกล้ครบกำหนด" },
  { name: "เครื่องมือวัดกระแสไฟเชื่อม", lastCal: "15 ก.ค. 2569", nextCal: "15 ม.ค. 2570", status: "ปกติ" },
];
const TOOL_STATUS_META = { "ปกติ": "good", "ใกล้ครบกำหนด": "warning", "เกินกำหนด": "critical" };

// ---- Procurement: PR / PO / Supplier ----------------------------------
const PR_LIST = [
  { id: "PR-2026-0142", item: "เหล็กแผ่นโครงสร้าง SS400 หนา 6 มม.", requester: "ไลน์ประกอบ 1", date: "10 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0143", item: "ชุดเฟืองขับ (Drive Gear Set) x60", requester: "ฝ่ายจัดซื้อ", date: "12 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0144", item: "Servo Motor สำหรับหุ่นยนต์เชื่อม", requester: "ฝ่ายซ่อมบำรุง", date: "15 ก.ย. 2569", status: "อนุมัติแล้ว" },
  { id: "PR-2026-0145", item: "สีพ่นกันสนิม (Epoxy Primer) 200 ลิตร", requester: "ไลน์พ่นสี", date: "16 ก.ย. 2569", status: "รออนุมัติ" },
  { id: "PR-2026-0146", item: "ล้อไฮดรอลิกรถโฟล์คลิฟท์", requester: "ฝ่ายซ่อมบำรุง", date: "18 ก.ย. 2569", status: "ปฏิเสธ" },
  { id: "PR-2026-0147", item: "ใบมีดตัดอ้อย (Cane Blade) x200", requester: "ไลน์ประกอบ 2", date: "19 ก.ย. 2569", status: "อนุมัติแล้ว" },
];
const PR_STATUS_META = { "รออนุมัติ": "warning", "อนุมัติแล้ว": "good", "ปฏิเสธ": "critical" };

const PO_LIST = [
  { id: "PO-2026-0311", supplier: "บจก. เหล็กไทยรุ่งเรือง", item: "เหล็กแผ่นโครงสร้าง SS400", value: 285000, orderDate: "11 ก.ย. 2569", dueDate: "25 ก.ย. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0312", supplier: "บจก. ไฮดรอลิกซัพพลาย", item: "ปลอกสายไฮดรอลิก x500", value: 90000, orderDate: "5 ก.ย. 2569", dueDate: "19 ก.ย. 2569", status: "ล่าช้า" },
  { id: "PO-2026-0313", supplier: "หจก. เกียร์ทรานสมิชชั่น", item: "ชุดเฟืองขับ x60", value: 252000, orderDate: "14 ก.ย. 2569", dueDate: "5 ต.ค. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0314", supplier: "บจก. ออโต้เมชั่นเซอร์วิส", item: "Servo Motor หุ่นยนต์เชื่อม", value: 138000, orderDate: "16 ก.ย. 2569", dueDate: "23 ก.ย. 2569", status: "รอส่งมอบ" },
  { id: "PO-2026-0315", supplier: "บจก. สีเคมีภัณฑ์ไทย", item: "สีพ่นกันสนิม 200 ลิตร", value: 64000, orderDate: "1 ก.ย. 2569", dueDate: "10 ก.ย. 2569", status: "ส่งมอบแล้ว" },
  { id: "PO-2026-0316", supplier: "บจก. วาย ทู เจ พาร์ทเนอร์", item: "ใบมีดตัดอ้อย x200", value: 170000, orderDate: "20 ก.ย. 2569", dueDate: "4 ต.ค. 2569", status: "รอส่งมอบ" },
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
];
const SUPPLIER_STATUS_META = { "Active": "good", "On Hold": "warning" };

// ---- Work Orders (ใบสั่งผลิต) grouped as projects by PO --------------------
// เชื่อมโยงกับ PO_LIST (จัดซื้อ) เพื่อให้ดูเป็น "โปรเจกต์" ตามใบสั่งซื้อแต่ละใบ
const WORK_ORDERS = [
  { wo: "WO-2026-081", po: "PO-2026-0311", model: "YT3000", qty: 5, status: "กำลังผลิต", issuedPct: 80, dueDate: "9 ต.ค. 2569" },
  { wo: "WO-2026-082", po: "PO-2026-0313", model: "YT6500", qty: 3, status: "กำลังผลิต", issuedPct: 60, dueDate: "5 ต.ค. 2569" },
  { wo: "WO-2026-083", po: "PO-2026-0312", model: "YT3000", qty: 4, status: "ล่าช้า", issuedPct: 45, dueDate: "19 ก.ย. 2569" },
  { wo: "WO-2026-084", po: "PO-2026-0314", model: "AX5000", qty: 2, status: "กำลังผลิต", issuedPct: 70, dueDate: "23 ก.ย. 2569" },
  { wo: "WO-2026-085", po: "PO-2026-0316", model: "YT3000", qty: 6, status: "วางแผน", issuedPct: 0, dueDate: "4 ต.ค. 2569" },
  { wo: "WO-2026-086", po: "PO-2026-0315", model: "W350", qty: 3, status: "เสร็จสมบูรณ์", issuedPct: 100, dueDate: "10 ก.ย. 2569" },
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
  ],
  YT6500: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 2, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 2, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 10, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", qty: 1, unit: "ชุด" },
  ],
  YT7500: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 2, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 2, unit: "ชุด" },
    { part: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", qty: 6, unit: "ชุด" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 2, unit: "เส้น" },
  ],
  W250: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 1, unit: "ชิ้น" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 6, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 3, unit: "ชุด" },
  ],
  W350: [
    { part: "ใบมีดตัดอ้อย (Cane Blade)", qty: 1, unit: "ชิ้น" },
    { part: "ชุดเฟืองขับ (Drive Gear Set)", qty: 1, unit: "ชุด" },
    { part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", qty: 6, unit: "ชิ้น" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
    { part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", qty: 1, unit: "ชุด" },
  ],
  AX5000: [
    { part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", qty: 3, unit: "เส้น" },
    { part: "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)", qty: 4, unit: "ชุด" },
    { part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", qty: 6, unit: "ชุด" },
    { part: "โครงเหล็กฐานเครื่อง (Base Frame)", qty: 1, unit: "ชุด" },
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
];
const ISSUANCE_STATUS_META = { "เบิกครบ": "pill-good", "เบิกบางส่วน": "pill-warning", "รอเบิก": "pill-critical" };
