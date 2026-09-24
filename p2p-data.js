/* ==========================================================================
   Procure-to-Pay (P2P) — the standard purchasing process, one owner and a
   time target (SLA) per stage, and sample cases that tie together the PR /
   PO / supplier / GRN / IQC / NCR / work-order data used elsewhere.
   ========================================================================== */

// who: which department (DEPT_WORKSPACES id) records the stage; "approver" = heads/plant; "any" = anyone
const P2P_STAGES = [
  {
    id: "pr", short: "PR", label: "เปิดคำขอซื้อ (PR)", who: "any", holder: "ผู้ขอ / แผนกผู้ใช้", sla: 0,
    control: "ระบุสเปก จำนวน วันที่ต้องใช้ (Need-by) และใบสั่งผลิต/งานที่ใช้ ให้ครบก่อนส่ง",
  },
  {
    id: "approve", short: "อนุมัติ", label: "อนุมัติ PR", who: "approver", holder: "หัวหน้าแผนก / ผู้จัดการโรงงาน", sla: 2,
    control: "ตรวจความจำเป็นและงบประมาณภายใน 2 วันทำการ — เกิน 100,000 บาท ผู้จัดการโรงงานอนุมัติ",
  },
  {
    id: "rfq", short: "RFQ", label: "ขอราคา / เลือกผู้ขาย", who: "pur", holder: "ฝ่ายจัดซื้อ", sla: 3,
    control: "มูลค่าเกิน 50,000 บาท ขอราคาอย่างน้อย 3 ราย บันทึกเหตุผลที่เลือก — ผู้ขายรายเดียวต้องระบุเหตุผล",
  },
  {
    id: "po", short: "PO", label: "ออกใบสั่งซื้อ (PO)", who: "pur", holder: "ฝ่ายจัดซื้อ", sla: 1,
    control: "PO ต้องอ้างอิง PR ระบุราคา จำนวน วันส่ง และเงื่อนไขการตรวจรับ",
  },
  {
    id: "ack", short: "ยืนยัน", label: "ผู้ขายยืนยัน PO และวันส่ง", who: "pur", holder: "ฝ่ายจัดซื้อ (ติดตามผู้ขาย)", sla: 2,
    control: "ผู้ขายยืนยันราคา/จำนวน/วันส่งเป็นลายลักษณ์อักษรภายใน 2 วัน — วันส่งช้ากว่าวันที่ต้องใช้ต้องแจ้งฝ่ายวางแผนทันที",
  },
  {
    id: "ship", short: "จัดส่ง", label: "ผู้ขายจัดส่ง", who: "pur", holder: "ผู้ขาย (จัดซื้อติดตาม)", sla: null,
    control: "จัดซื้อโทรติดตาม (Expedite) 3 วันก่อนวันส่ง และทันทีที่เลยกำหนด",
  },
  {
    id: "grn", short: "รับของ", label: "รับของเข้าคลัง (GRN)", who: "wh", holder: "คลังสินค้า", sla: 1,
    control: "นับจำนวนเทียบ PO บันทึกของขาด/เกิน/เสียหาย ในวันที่รับ",
  },
  {
    id: "iqc", short: "IQC", label: "ตรวจรับคุณภาพ (IQC)", who: "qc", holder: "QC", sla: 1,
    control: "สุ่มตรวจตามสเปก ไม่ผ่าน → เปิด NCR และแจ้งผู้ขายส่งทดแทน ของห้ามถึงไลน์",
  },
  {
    id: "issue", short: "พร้อมใช้", label: "เข้าคลัง / จ่ายให้ไลน์", who: "wh", holder: "คลังสินค้า", sla: 1,
    control: "จัดเก็บตามตำแหน่ง จ่ายแบบ FIFO ตามใบเบิกที่อ้างอิงใบสั่งผลิต",
  },
  {
    id: "pay", short: "จ่ายเงิน", label: "วางบิล / จ่ายเงิน (3-way match)", who: "approver", holder: "บัญชี / การเงิน", sla: 30,
    control: "จ่ายเมื่อ PO, ใบรับของ (GRN) และใบแจ้งหนี้ตรงกันทั้งราคาและจำนวน",
  },
];

const P2P_ISSUE_TYPES = ["ส่งช้า", "ของขาด/ไม่ครบ", "คุณภาพไม่ผ่าน", "ราคาไม่ตรง PO", "สเปกไม่ชัด", "รออนุมัติงบ", "อื่น ๆ"];

// Events: { stage, at (ISO date), by, note, ...stage data }. An IQC "fail" sends the case
// back to "ship" (waiting for replacement) — earlier ship/grn/iqc events are kept, marked superseded.
const P2P_SAMPLE_CASES = [
  {
    id: "P2P-2026-001", pr: "PR-2026-0142", item: "เหล็กแผ่นโครงสร้าง SS400 หนา 6 มม.", qty: 40, unit: "แผ่น",
    requester: "ไลน์ประกอบ 1", needBy: "2026-09-26", wo: "WO-2026-081", supplier: "บจก. เหล็กไทยรุ่งเรือง",
    po: "PO-2026-0311", value: 285000, promised: "2026-09-25", status: "open",
    events: [
      { stage: "pr", at: "2026-09-10", by: "หัวหน้าไลน์ประกอบ 1", note: "ใช้ทำโครงฐาน YT3000 ล็อต WO-2026-081" },
      { stage: "approve", at: "2026-09-10", by: "ผู้จัดการโรงงาน", note: "เกิน 100,000 — ผู้จัดการโรงงานอนุมัติ" },
      { stage: "rfq", at: "2026-09-11", by: "เจ้าหน้าที่จัดซื้อ", note: "ผู้ขายประจำ ราคาตามสัญญาปี 2569" },
      { stage: "po", at: "2026-09-11", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-12", by: "เจ้าหน้าที่จัดซื้อ", note: "ยืนยันส่ง 25 ก.ย.", promised: "2026-09-25" },
      { stage: "ship", at: "2026-09-24", by: "เจ้าหน้าที่จัดซื้อ", note: "รถผู้ขายออกเช้า" },
      { stage: "grn", at: "2026-09-24", by: "คลังสินค้า", note: "GRN-2026-003 ครบ 40 แผ่น", ref: "GRN-2026-003", qtyReceived: 40 },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-002", pr: "PR-2026-0138", item: "ชุดเฟืองขับ (Drive Gear Set)", qty: 20, unit: "ชุด",
    requester: "ไลน์ประกอบ 2", needBy: "2026-09-28", wo: "WO-2026-082", supplier: "หจก. เกียร์ทรานสมิชชั่น",
    po: "PO-2026-0313", value: 84000, promised: "2026-10-01", status: "open",
    events: [
      { stage: "pr", at: "2026-09-08", by: "หัวหน้าไลน์ประกอบ 1", note: "สำหรับ YT6500 (WO-2026-082)" },
      { stage: "approve", at: "2026-09-09", by: "ผู้จัดการโรงงาน", note: "" },
      { stage: "rfq", at: "2026-09-12", by: "เจ้าหน้าที่จัดซื้อ", note: "ผู้ขายรายเดียว (Sole source) — แบบเฉพาะรุ่น" },
      { stage: "po", at: "2026-09-14", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-15", by: "เจ้าหน้าที่จัดซื้อ", note: "ยืนยันส่ง 22 ก.ย.", promised: "2026-09-22" },
      { stage: "ship", at: "2026-09-21", by: "เจ้าหน้าที่จัดซื้อ", note: "", superseded: true },
      { stage: "grn", at: "2026-09-22", by: "คลังสินค้า", note: "GRN-2026-001", ref: "GRN-2026-001", qtyReceived: 20, superseded: true },
      { stage: "iqc", at: "2026-09-22", by: "หัวหน้า QC", note: "รูเพลาไม่ตรงแบบ 3 ใน 5 ชุดที่สุ่ม — ส่งคืนทั้งล็อต", result: "fail", ref: "IQC-2026-001", ncr: "NCR-2026-002", superseded: true },
      { stage: "ack", at: "2026-09-23", by: "เจ้าหน้าที่จัดซื้อ", note: "ผู้ขายรับของคืน นัดส่งทดแทน 1 ต.ค.", promised: "2026-10-01" },
    ],
    issues: [
      { type: "คุณภาพไม่ผ่าน", note: "IQC-2026-001 ไม่ผ่าน → NCR-2026-002 ส่งคืนผู้ขาย รอของทดแทน", at: "2026-09-22", by: "หัวหน้า QC", resolved: false },
    ],
  },
  {
    id: "P2P-2026-003", pr: "PR-2026-0143", item: "ชุดเฟืองขับ (Drive Gear Set) x60 — สต็อกไตรมาส 4", qty: 60, unit: "ชุด",
    requester: "ฝ่ายจัดซื้อ", needBy: "2026-10-20", wo: "", supplier: "", po: "", value: 252000, promised: "", status: "open",
    events: [
      { stage: "pr", at: "2026-09-12", by: "เจ้าหน้าที่จัดซื้อ", note: "สต็อกสำรองตามแผนผลิต Q4" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-004", pr: "PR-2026-0144", item: "Servo Motor สำหรับหุ่นยนต์เชื่อม", qty: 1, unit: "ตัว",
    requester: "ฝ่ายซ่อมบำรุง", needBy: "2026-09-22", wo: "MT-2026-001", supplier: "บจก. ออโต้เมชั่นเซอร์วิส",
    po: "PO-2026-0314", value: 138000, promised: "2026-09-23", status: "open",
    events: [
      { stage: "pr", at: "2026-09-15", by: "ฝ่ายซ่อมบำรุง", note: "หุ่นยนต์เชื่อม #1 หยุด (MT-2026-001) — ด่วน" },
      { stage: "approve", at: "2026-09-15", by: "ผู้จัดการโรงงาน", note: "อนุมัติด่วน" },
      { stage: "rfq", at: "2026-09-15", by: "เจ้าหน้าที่จัดซื้อ", note: "RFQ-2026-001 เลือกรายที่ส่งเร็วสุด", ref: "RFQ-2026-001" },
      { stage: "po", at: "2026-09-16", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-17", by: "เจ้าหน้าที่จัดซื้อ", note: "ยืนยันส่ง 23 ก.ย.", promised: "2026-09-23" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-005", pr: "PR-2026-0145", item: "สีพ่นกันสนิม (Epoxy Primer) 200 ลิตร", qty: 200, unit: "ลิตร",
    requester: "ไลน์พ่นสี", needBy: "2026-10-05", wo: "", supplier: "", po: "", value: 64000, promised: "", status: "open",
    events: [
      { stage: "pr", at: "2026-09-16", by: "หัวหน้าไลน์พ่นสี", note: "สต็อกเหลือ 1 สัปดาห์" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-006", pr: "PR-2026-0146", item: "ล้อไฮดรอลิกรถโฟล์คลิฟท์", qty: 2, unit: "ล้อ",
    requester: "คลังสินค้า/พัสดุ", needBy: "2026-09-30", wo: "", supplier: "", po: "", value: 18000, promised: "", status: "cancelled",
    events: [
      { stage: "pr", at: "2026-09-18", by: "คลังสินค้า", note: "รถโฟล์คลิฟท์ #3 เสีย" },
      { stage: "approve", at: "2026-09-19", by: "ผู้จัดการโรงงาน", note: "ไม่อนุมัติ — ใช้ล้อสำรองในสต็อกซ่อมบำรุงก่อน", result: "reject" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-007", pr: "PR-2026-0147", item: "ใบมีดตัดอ้อย (Cane Blade) x200", qty: 200, unit: "ชิ้น",
    requester: "ไลน์ประกอบ 2", needBy: "2026-10-06", wo: "WO-2026-085", supplier: "บจก. วาย ทู เจ พาร์ทเนอร์",
    po: "PO-2026-0316", value: 170000, promised: "2026-10-04", status: "open",
    events: [
      { stage: "pr", at: "2026-09-19", by: "หัวหน้าไลน์ประกอบ 1", note: "" },
      { stage: "approve", at: "2026-09-19", by: "ผู้จัดการโรงงาน", note: "" },
      { stage: "rfq", at: "2026-09-20", by: "เจ้าหน้าที่จัดซื้อ", note: "ราคาตามสัญญา" },
      { stage: "po", at: "2026-09-20", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-21", by: "เจ้าหน้าที่จัดซื้อ", note: "ยืนยันส่ง 4 ต.ค.", promised: "2026-10-04" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-008", pr: "PR-2026-0148", item: "ลวดเชื่อม CO2 เบอร์ 1.2 มม. x500 กก.", qty: 500, unit: "กก.",
    requester: "ไลน์เชื่อม", needBy: "2026-10-01", wo: "", supplier: "บจก. เชื่อมไทยอุตสาหกรรม",
    po: "PO-2026-0317", value: 112000, promised: "", status: "open",
    events: [
      { stage: "pr", at: "2026-09-20", by: "หัวหน้าไลน์เชื่อม", note: "" },
      { stage: "approve", at: "2026-09-20", by: "ผู้จัดการโรงงาน", note: "" },
      { stage: "rfq", at: "2026-09-21", by: "เจ้าหน้าที่จัดซื้อ", note: "ผู้ขายประจำ" },
      { stage: "po", at: "2026-09-21", by: "เจ้าหน้าที่จัดซื้อ", note: "ส่ง PO ทางอีเมลแล้ว ยังไม่ได้รับการยืนยัน" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-009", pr: "PR-2026-0135", item: "สีพ่นกันสนิม (Epoxy Primer) ล็อตก่อนหน้า", qty: 200, unit: "ลิตร",
    requester: "ไลน์พ่นสี", needBy: "2026-09-12", wo: "", supplier: "บจก. สีเคมีภัณฑ์ไทย",
    po: "PO-2026-0315", value: 64000, promised: "2026-09-10", status: "open",
    events: [
      { stage: "pr", at: "2026-08-28", by: "หัวหน้าไลน์พ่นสี", note: "" },
      { stage: "approve", at: "2026-08-29", by: "ผู้จัดการโรงงาน", note: "" },
      { stage: "rfq", at: "2026-08-31", by: "เจ้าหน้าที่จัดซื้อ", note: "เปรียบเทียบ 3 ราย" },
      { stage: "po", at: "2026-09-01", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-02", by: "เจ้าหน้าที่จัดซื้อ", note: "", promised: "2026-09-10" },
      { stage: "ship", at: "2026-09-10", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "grn", at: "2026-09-10", by: "คลังสินค้า", note: "GRN-2026-002 ครบ", ref: "GRN-2026-002", qtyReceived: 200 },
      { stage: "iqc", at: "2026-09-10", by: "หัวหน้า QC", note: "IQC-2026-002 ผ่าน", result: "pass", ref: "IQC-2026-002" },
      { stage: "issue", at: "2026-09-11", by: "คลังสินค้า", note: "จ่ายให้ไลน์พ่นสี" },
    ],
    issues: [],
  },
  {
    id: "P2P-2026-010", pr: "PR-2026-0141", item: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting) x500", qty: 500, unit: "ชิ้น",
    requester: "ไลน์ประกอบ 1", needBy: "2026-09-17", wo: "WO-2026-083", supplier: "บจก. ไฮดรอลิกซัพพลาย",
    po: "PO-2026-0312", value: 90000, promised: "2026-09-19", status: "open",
    events: [
      { stage: "pr", at: "2026-09-02", by: "หัวหน้าไลน์ประกอบ 1", note: "" },
      { stage: "approve", at: "2026-09-04", by: "ผู้จัดการโรงงาน", note: "" },
      { stage: "rfq", at: "2026-09-05", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "po", at: "2026-09-05", by: "เจ้าหน้าที่จัดซื้อ", note: "" },
      { stage: "ack", at: "2026-09-06", by: "เจ้าหน้าที่จัดซื้อ", note: "ผู้ขายยืนยัน 19 ก.ย. — ช้ากว่าวันที่ต้องใช้ 2 วัน", promised: "2026-09-19" },
    ],
    issues: [
      { type: "ส่งช้า", note: "ผู้ขายแจ้งวัตถุดิบขาด เลื่อนเป็นสัปดาห์หน้า (ยังไม่ยืนยันวัน)", at: "2026-09-20", by: "เจ้าหน้าที่จัดซื้อ", resolved: false },
    ],
  },
  {
    id: "P2P-2026-011", pr: "PR-2026-0150", item: "ชั้นวางพาเลทคลังสินค้าเพิ่มเติม x10 ชุด", qty: 10, unit: "ชุด",
    requester: "คลังสินค้า/พัสดุ", needBy: "2026-10-15", wo: "", supplier: "", po: "", value: 78000, promised: "", status: "open",
    events: [
      { stage: "pr", at: "2026-09-22", by: "คลังสินค้า", note: "รองรับสต็อก Q4" },
    ],
    issues: [],
  },
];
