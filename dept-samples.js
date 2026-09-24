/* ==========================================================================
   Sample documents for every department register (3 per type). They reuse
   the PO / WO / PR numbers, machines and suppliers from data.js so the
   examples tell one connected story across modules, e.g.
     CC-001 blade wear → ECR-001 → EO-001 → WI-001 / DWG-001 / BOM YT6500 Rev.B
     IQC-001 gear set fails → NCR-002 → CAPA-002, GRN-001 returned to supplier
   ========================================================================== */

const DOC_SAMPLES = {
  tq: [
    { no: "TQ-2026-001", status: "ตอบแล้ว", title: "ค่าแรงบิดขันโบลท์ยึดโครง M16 ไม่ระบุในแบบ", model: "YT3000", partCode: "FR-4001-03", fromDept: "ฝ่ายผลิต", ref: "WO-2026-081", priority: "ด่วน", need: "2026-09-20", owner: "หัวหน้าไลน์ประกอบ 1", date: "2026-09-18", detail: "แบบ DWG ระบุเกรด 8.8 แต่ไม่มีค่าแรงบิด", answer: "ใช้ 210 N·m ขันไขว้ 2 รอบ — จะเพิ่มในแบบ Rev. ถัดไปและ WI-2026-003", answeredBy: "หัวหน้าฝ่าย R&D" },
    { no: "TQ-2026-002", status: "ส่งคำถาม", title: "ใช้ตลับลูกปืนยี่ห้ออื่นแทน 6208-2RS ได้หรือไม่ (ของขาดตลาด)", model: "YT6500", partCode: "GR-2001-03", fromDept: "จัดซื้อ", ref: "", priority: "ด่วน", need: "2026-09-26", owner: "เจ้าหน้าที่จัดซื้อ", date: "2026-09-23", detail: "ผู้ขายเดิมส่งไม่ทัน เสนอยี่ห้อทดแทนสเปกเท่ากัน", answer: "", answeredBy: "" },
  ],
  ecr: [
    { no: "ECR-2026-001", status: "อนุมัติ", title: "เปลี่ยนวัสดุใบมีดตัดอ้อยเป็นเหล็ก SK5 ชุบแข็ง", model: "YT6500", reason: "ปัญหาคุณภาพ", owner: "วิศวกรออกแบบ", date: "2026-09-02", detail: "ลูกค้าแจ้งใบมีดสึกเร็ว (CC-2026-001) อายุใช้งานเหลือ ~60% ของที่กำหนด — ต้นทุน +180 บาท/ชิ้น, ใช้กับงานที่ยังไม่ประกอบใบมีดได้ทันที" },
    { no: "ECR-2026-002", status: "รอพิจารณา", title: "ย้ายตำแหน่งแคลมป์ยึดสายไฮดรอลิกหลบโซ่ลำเลียง", model: "YT7500", reason: "ปรับปรุงการผลิต", owner: "หัวหน้าไลน์ประกอบ 2", date: "2026-09-15", detail: "ประกอบยาก สายเสียดสีโซ่ระหว่างทดสอบ — ต้องแก้แบบแคลมป์ (DWG-2026-002)" },
    { no: "ECR-2026-003", status: "ร่าง", title: "เปลี่ยนขั้วต่อสายไฟชุดควบคุมเป็นแบบกันน้ำ IP67", model: "W250", reason: "ลูกค้าร้องขอ", owner: "ฝ่ายขาย", date: "2026-09-21", detail: "ลูกค้าแจ้งขั้วต่อชื้นน้ำหลังล้างเครื่อง (CC-2026-002)" },
  ],
  eo: [
    { no: "EO-2026-001", status: "แจ้งหน้างานแล้ว", title: "ใช้ใบมีด SK5 ชุบแข็งแทนรุ่นเดิม", model: "YT6500", ref: "ECR-2026-001", effective: "WO-2026-089 เป็นต้นไป", parts: "BOM YT6500 Rev.B, WI-2026-001, DWG-2026-001", owner: "วิศวกรออกแบบ", date: "2026-09-08" },
    { no: "EO-2026-002", status: "มีผลใช้งาน", title: "เปลี่ยนสลักชุดยึดเครื่องยนต์เป็นเกรด 10.9", model: "W350", ref: "", effective: "ล็อต 3 เป็นต้นไป", parts: "BOM W350 Rev.B", owner: "วิศวกรออกแบบ", date: "2026-07-10" },
    { no: "EO-2026-003", status: "ร่าง", title: "แคลมป์ยึดสายไฮดรอลิกตำแหน่งใหม่", model: "YT7500", ref: "ECR-2026-002", effective: "รอ ECR อนุมัติ", parts: "DWG-2026-002, BOM YT7500", owner: "วิศวกรออกแบบ", date: "2026-09-23" },
  ],
  wi: [
    { no: "WI-2026-001", status: "รอทบทวน", title: "การติดตั้งใบมีดตัดอ้อยและขันแรงบิด", model: "YT6500", line: "ไลน์ประกอบ 2", rev: "C", ref: "EO-2026-001", owner: "วิศวกรออกแบบ", date: "2026-09-20", link: "" },
    { no: "WI-2026-002", status: "อนุมัติใช้งาน", title: "ขั้นตอนทดสอบแรงดันระบบไฮดรอลิก", model: "", line: "ไลน์ทดสอบ", rev: "A", ref: "", owner: "หัวหน้าไลน์ทดสอบ", date: "2026-06-01", link: "" },
    { no: "WI-2026-003", status: "อนุมัติใช้งาน", title: "การเชื่อมโครงฐาน — ค่ากระแส/แรงดันมาตรฐาน", model: "", line: "ไลน์เชื่อม", rev: "B", ref: "", owner: "หัวหน้าไลน์เชื่อม", date: "2026-09-22", link: "" },
  ],
  dwg: [
    { no: "DWG-2026-001", status: "อนุมัติ (Released)", title: "ใบมีดตัดอ้อย SK5 ชุบแข็ง", partCode: "BL-1001B", model: "YT6500", rev: "B", owner: "วิศวกรออกแบบ", date: "2026-09-05", link: "" },
    { no: "DWG-2026-002", status: "รอตรวจแบบ", title: "แคลมป์ยึดสายไฮดรอลิก (ตำแหน่งใหม่)", partCode: "", model: "YT7500", rev: "A", owner: "วิศวกรออกแบบ", date: "2026-09-18", link: "" },
    { no: "DWG-2026-003", status: "กำลังออกแบบ", title: "กล่องขั้วต่อสายไฟกันน้ำ IP67", partCode: "", model: "W250", rev: "A", owner: "วิศวกรไฟฟ้า", date: "2026-09-22", link: "" },
    { no: "DWG-2026-004", status: "อนุมัติ (Released)", title: "ใบมีดตัดอ้อย (มาตรฐาน)", partCode: "BL-1001", model: "", rev: "A", owner: "วิศวกรออกแบบ", date: "2026-01-12", link: "" },
    { no: "DWG-2026-005", status: "อนุมัติ (Released)", title: "ปลอกสายไฮดรอลิก", partCode: "HY-3001", model: "", rev: "A", owner: "วิศวกรออกแบบ", date: "2026-01-15", link: "" },
    { no: "DWG-2026-006", status: "อนุมัติ (Released)", title: "ชุดยึดเครื่องยนต์", partCode: "FR-4010", model: "", rev: "C", owner: "วิศวกรออกแบบ", date: "2026-07-08", link: "" },
    { no: "DWG-2026-007", status: "อนุมัติ (Released)", title: "โซ่ลำเลียงอ้อย — ข้อโซ่และหมุด", partCode: "CV-5001", model: "", rev: "B", owner: "วิศวกรออกแบบ", date: "2026-04-20", link: "" },
  ],
  plan: [
    { no: "PLN-2026-001", status: "เสร็จตามแผน", title: "สัปดาห์ที่ 38", model: "YT3000", qty: 2, line: "ไลน์ประกอบ 1", owner: "ฝ่ายวางแผน", date: "2026-09-14" },
    { no: "PLN-2026-002", status: "กำลังดำเนินการ", title: "สัปดาห์ที่ 39", model: "YT6500", qty: 1, line: "ไลน์ประกอบ 2", owner: "ฝ่ายวางแผน", date: "2026-09-21" },
    { no: "PLN-2026-003", status: "อนุมัติแผน", title: "สัปดาห์ที่ 40", model: "YT7500", qty: 1, line: "ไลน์ประกอบ 2", owner: "ฝ่ายวางแผน", date: "2026-09-28" },
  ],
  mrq: [
    { no: "MRQ-2026-001", status: "ของครบแล้ว", title: "ใบมีดตัดอ้อย SK5 (ตาม EO-2026-001)", model: "YT6500", qty: 4, need: "2026-09-30", owner: "ฝ่ายวางแผน", date: "2026-09-09" },
    { no: "MRQ-2026-002", status: "ส่งจัดซื้อแล้ว", title: "โซ่ลำเลียงอ้อย (Conveyor Chain)", model: "YT6500", qty: 2, need: "2026-10-05", owner: "ฝ่ายวางแผน", date: "2026-09-18" },
    { no: "MRQ-2026-003", status: "ร่าง", title: "ชุดซีลกระบอกไฮดรอลิก", model: "YT7500", qty: 12, need: "2026-10-12", owner: "ฝ่ายวางแผน", date: "2026-09-24" },
  ],
  dpr: [
    { no: "DPR-2026-001", status: "รับทราบแล้ว", title: "ประกอบโครงฐาน YT6500 (WO-2026-082)", line: "ไลน์ประกอบ 2", date: "2026-09-23", output: 1, manpower: 11, owner: "หัวหน้าไลน์ประกอบ 2", detail: "รอโซ่ลำเลียง 2 ชม." },
    { no: "DPR-2026-002", status: "รับทราบแล้ว", title: "เชื่อมโครงฐาน YT3000 (WO-2026-081)", line: "ไลน์เชื่อม", date: "2026-09-23", output: 2, manpower: 6, owner: "หัวหน้าไลน์เชื่อม", detail: "หุ่นยนต์เชื่อม #1 ซ่อมอยู่ (MT-2026-001) ใช้เชื่อมมือแทน ช้ากว่าปกติ ~30%" },
    { no: "DPR-2026-003", status: "ส่งแล้ว", title: "ประกอบระบบไฮดรอลิก AX5000 (WO-2026-084)", line: "ไลน์ประกอบ 3", date: "2026-09-24", output: 1, manpower: 8, owner: "หัวหน้าไลน์ประกอบ 3", detail: "" },
  ],
  mreq: [
    { no: "MR-2026-001", status: "จ่ายของแล้ว", title: "ใบมีดตัดอ้อย (Cane Blade)", wo: "WO-2026-081", qty: 2, line: "ไลน์ประกอบ 1", owner: "ช่างประกอบ ไลน์ 1", date: "2026-09-22" },
    { no: "MR-2026-002", status: "รออนุมัติ", title: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", wo: "WO-2026-083", qty: 22, line: "ไลน์ประกอบ 1", owner: "ช่างประกอบ ไลน์ 1", date: "2026-09-23" },
    { no: "MR-2026-003", status: "อนุมัติ", title: "ชุดซีลกระบอกไฮดรอลิก", wo: "WO-2026-087", qty: 6, line: "ไลน์ประกอบ 2", owner: "ช่างประกอบ ไลน์ 2", date: "2026-09-24" },
    { no: "MR-2026-004", status: "จ่ายบางส่วน", title: "ใบมีดตัดอ้อย SK5 และอีก 2 รายการ", wo: "WO-2026-082", model: "YT6500", purpose: "ผลิต", qty: 39, line: "ไลน์ประกอบ 2", owner: "ช่างประกอบ ไลน์ 2", date: "2026-09-22",
      items: [
        { key: "BL-1001B", code: "BL-1001B", part: "ใบมีดตัดอ้อย (Cane Blade)", unit: "ชิ้น", req: 6, issued: 6, ret: 0, log: [{ at: "2026-09-22T09:10:00", by: "คลังสินค้า", kind: "จ่าย", qty: 6 }] },
        { key: "CV-5001", code: "CV-5001", part: "โซ่ลำเลียงอ้อย (Conveyor Chain)", unit: "เส้น", req: 3, issued: 1, ret: 0, log: [{ at: "2026-09-22T09:10:00", by: "คลังสินค้า", kind: "จ่าย", qty: 1 }] },
        { key: "HY-3001", code: "HY-3001", part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", unit: "ชิ้น", req: 30, issued: 30, ret: 0, log: [{ at: "2026-09-22T09:12:00", by: "คลังสินค้า", kind: "จ่าย", qty: 30 }] },
      ] },
    { no: "MR-2026-005", status: "อนุมัติ", title: "ขั้วต่อสายไฟชุดควบคุม (อะไหล่งานบริการ)", wo: "SV-2026-002", model: "W250", purpose: "บริการ", qty: 3, line: "", owner: "ช่างบริการ 1", date: "2026-09-20",
      items: [{ key: "EL-6001", code: "EL-6001", part: "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)", unit: "ชุด", req: 3, issued: 0, ret: 0, log: [] }] },
    { no: "MR-2026-006", status: "รออนุมัติ", title: "ชุดยึดเครื่องยนต์ และอีก 1 รายการ", wo: "WO-2026-085", model: "YT3000", purpose: "ผลิต", qty: 54, line: "ไลน์ประกอบ 1", owner: "ช่างประกอบ ไลน์ 1", date: "2026-09-24",
      items: [
        { key: "FR-4010", code: "FR-4010", part: "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)", unit: "ชุด", req: 6, issued: 0, ret: 0, log: [] },
        { key: "HY-3001", code: "HY-3001", part: "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)", unit: "ชิ้น", req: 48, issued: 0, ret: 0, log: [] },
      ] },
    { no: "MR-2026-007", status: "จ่ายของแล้ว", title: "ใบมีดตัดอ้อย SK5 (เคลมประกัน)", wo: "SV-2026-001", model: "YT6500", purpose: "บริการ", qty: 2, line: "", owner: "ช่างบริการ 1", date: "2026-09-01",
      items: [{ key: "BL-1001B", code: "BL-1001B", part: "ใบมีดตัดอ้อย (Cane Blade)", unit: "ชิ้น", req: 2, issued: 2, ret: 0, log: [{ at: "2026-09-01T14:00:00", by: "คลังสินค้า", kind: "จ่าย", qty: 2 }] }] },
  ],
  saf: [
    { no: "SAF-2026-001", status: "ปิดแล้ว", title: "เศษโลหะกระเด็นเข้าตาขณะเจียรรอยเชื่อม", line: "ไลน์เชื่อม", severity: "บาดเจ็บเล็กน้อย", owner: "หัวหน้าไลน์เชื่อม", date: "2026-09-05", detail: "อบรมการใช้ PPE ทั้งไลน์ เปลี่ยนแว่นเป็นแบบครอบ (PR-2026-0149)" },
    { no: "SAF-2026-002", status: "กำลังแก้ไข", title: "สายลมพาดทางเดินหน้าเครื่อง CNC สาย 1", line: "ไลน์ประกอบ 1", severity: "เกือบเกิดเหตุ (Near Miss)", owner: "ช่างประกอบ ไลน์ 1", date: "2026-09-18", detail: "เดินสายใหม่ขึ้นรางแขวน ติดป้ายเตือนชั่วคราว" },
    { no: "SAF-2026-003", status: "เปิด", title: "สีหกบริเวณทางเดินหน้าห้องพ่นสี พื้นลื่น", line: "ไลน์พ่นสี", severity: "เกือบเกิดเหตุ (Near Miss)", owner: "พนักงานพ่นสี", date: "2026-09-23", detail: "" },
  ],
  ncr: [
    { no: "NCR-2026-001", status: "กำลังแก้ไข", title: "รอยเชื่อมโครงฐานไม่เต็มแนว", model: "YT3000", found: "ระหว่างผลิต", disposition: "แก้ไข (Rework)", wo: "WO-2026-081", owner: "หัวหน้าไลน์เชื่อม", date: "2026-09-19", detail: "กระแสเชื่อมต่ำกว่ากำหนด ช่วงใช้เชื่อมมือแทนหุ่นยนต์" },
    { no: "NCR-2026-002", status: "เปิด", title: "ชุดเฟืองขับขนาดรูเพลาไม่ตรงแบบ", model: "YT6500", found: "ตรวจรับวัตถุดิบ", disposition: "คืนผู้ขาย", wo: "PO-2026-0313", owner: "QC", date: "2026-09-22", detail: "สุ่มตรวจ 5 จาก 20 ชุด ไม่ผ่าน 3 ชุด (IQC-2026-001)" },
    { no: "NCR-2026-003", status: "ปิดแล้ว", title: "ความหนาสีต่ำกว่าสเปก (<80 ไมครอน)", model: "W350", found: "ระหว่างผลิต", disposition: "แก้ไข (Rework)", wo: "WO-2026-086", owner: "หัวหน้าไลน์พ่นสี", date: "2026-09-06", detail: "แรงดันปืนพ่นต่ำ ปรับแล้วพ่นซ้ำ" },
  ],
  capa: [
    { no: "CAPA-2026-001", status: "กำลังดำเนินการ", title: "กำหนดค่ากระแสเชื่อมมาตรฐานและตรวจทุกต้นกะ", ref: "NCR-2026-001", owner: "หัวหน้าไลน์เชื่อม", due: "2026-10-03", detail: "ออก WI-2026-003 Rev.B แล้ว รอติดตามผล 2 สัปดาห์" },
    { no: "CAPA-2026-002", status: "เปิด", title: "ให้ผู้ขายส่งผลตรวจขนาดเฟืองมาพร้อมของทุกล็อต", ref: "NCR-2026-002", owner: "ฝ่ายจัดซื้อ + QC", due: "2026-10-10", detail: "" },
    { no: "CAPA-2026-003", status: "ปิดแล้ว", title: "วัดความหนาสีทุกคันด้วยเกจก่อนออกจากห้องพ่น", ref: "NCR-2026-003", owner: "หัวหน้าไลน์พ่นสี", due: "2026-09-15", detail: "ติดตาม 2 สัปดาห์ ไม่พบปัญหาซ้ำ" },
  ],
  iqc: [
    { no: "IQC-2026-001", status: "ไม่ผ่าน", title: "ชุดเฟืองขับ (Drive Gear Set)", po: "PO-2026-0313", supplier: "หจก. เกียร์ทรานสมิชชั่น", qty: 20, owner: "QC", date: "2026-09-22" },
    { no: "IQC-2026-002", status: "ผ่าน", title: "สีพ่นกันสนิม (Epoxy Primer) 200 ลิตร", po: "PO-2026-0315", supplier: "บจก. สีเคมีภัณฑ์ไทย", qty: 200, owner: "QC", date: "2026-09-10" },
    { no: "IQC-2026-003", status: "รอตรวจ", title: "เหล็กแผ่นโครงสร้าง SS400 หนา 6 มม.", po: "PO-2026-0311", supplier: "บจก. เหล็กไทยรุ่งเรือง", qty: 40, owner: "QC", date: "2026-09-24" },
  ],
  fi: [
    { no: "FI-2026-001", status: "ผ่าน", title: "W350-2026-007", model: "W350", wo: "WO-2026-086", owner: "QC", date: "2026-09-09", detail: "" },
    { no: "FI-2026-002", status: "ไม่ผ่าน-ส่งแก้ไข", title: "W350-2026-008", model: "W350", wo: "WO-2026-086", owner: "QC", date: "2026-09-09", detail: "ไฟท้ายไม่ติด — ขั้วต่อหลวม ส่งกลับไลน์ประกอบ 3" },
    { no: "FI-2026-003", status: "รอตรวจ", title: "AX5000-2026-003", model: "AX5000", wo: "WO-2026-084", owner: "QC", date: "2026-09-24", detail: "" },
  ],
  rfq: [
    { no: "RFQ-2026-001", status: "เลือกผู้ขายแล้ว", title: "Servo Motor สำหรับหุ่นยนต์เชื่อม", pr: "PR-2026-0144", suppliers: "3 ราย", selected: "บจก. ออโต้เมชั่นเซอร์วิส — ส่งเร็วสุด 7 วัน", amount: 138000, owner: "ฝ่ายจัดซื้อ", date: "2026-09-15" },
    { no: "RFQ-2026-002", status: "เปรียบเทียบ", title: "สีพ่นกันสนิม (Epoxy Primer) 200 ลิตร", pr: "PR-2026-0145", suppliers: "บจก. สีเคมีภัณฑ์ไทย + 2 ราย", selected: "", amount: 64000, owner: "ฝ่ายจัดซื้อ", date: "2026-09-17" },
    { no: "RFQ-2026-003", status: "ขอราคา", title: "ชั้นวางพาเลทคลังสินค้าเพิ่มเติม", pr: "PR-2026-0150", suppliers: "3 ราย", selected: "", amount: "", owner: "ฝ่ายจัดซื้อ", date: "2026-09-23" },
  ],
  sev: [
    { no: "SE-2026-001", status: "ประเมินแล้ว", title: "บจก. เหล็กไทยรุ่งเรือง", period: "ไตรมาส 3/2569", quality: 5, delivery: 4, price: 4, owner: "ฝ่ายจัดซื้อ", date: "2026-09-20", visibility: { mode: "custom", teams: [], depts: ["pur"], users: ["u-plant"] } },
    { no: "SE-2026-002", status: "ประเมินแล้ว", title: "บจก. ไฮดรอลิกซัพพลาย", period: "ไตรมาส 3/2569", quality: 4, delivery: 2, price: 4, owner: "ฝ่ายจัดซื้อ", date: "2026-09-20", visibility: { mode: "custom", teams: [], depts: ["pur"], users: ["u-plant"] } },
    { no: "SE-2026-003", status: "ร่าง", title: "หจก. เกียร์ทรานสมิชชั่น", period: "ไตรมาส 3/2569", quality: 2, delivery: 4, price: 4, owner: "ฝ่ายจัดซื้อ", date: "2026-09-23", visibility: { mode: "custom", teams: [], depts: ["pur"], users: ["u-plant"] } },
  ],
  grn: [
    { no: "GRN-2026-001", status: "ส่งคืนผู้ขาย", title: "ชุดเฟืองขับ (Drive Gear Set)", po: "PO-2026-0313", supplier: "หจก. เกียร์ทรานสมิชชั่น", qty: 20, owner: "คลังสินค้า", date: "2026-09-22" },
    { no: "GRN-2026-002", status: "รับเข้าคลังแล้ว", title: "สีพ่นกันสนิม (Epoxy Primer)", po: "PO-2026-0315", supplier: "บจก. สีเคมีภัณฑ์ไทย", qty: 200, owner: "คลังสินค้า", date: "2026-09-10" },
    { no: "GRN-2026-003", status: "รอ QC ตรวจ", title: "เหล็กแผ่นโครงสร้าง SS400", po: "PO-2026-0311", supplier: "บจก. เหล็กไทยรุ่งเรือง", qty: 40, owner: "คลังสินค้า", date: "2026-09-24" },
  ],
  stk: [
    { no: "STK-2026-001", status: "ปรับยอดแล้ว", title: "ชั้น A — ชิ้นส่วนไฮดรอลิก", items: 120, diff: 3, owner: "คลังสินค้า", date: "2026-09-01" },
    { no: "STK-2026-002", status: "กำลังนับ", title: "ชั้น B — เฟือง/ระบบขับ", items: 85, diff: "", owner: "คลังสินค้า", date: "2026-09-24" },
    { no: "STK-2026-003", status: "วางแผน", title: "วัสดุสิ้นเปลืองงานเชื่อมและสี", items: "", diff: "", owner: "คลังสินค้า", date: "2026-09-30" },
  ],
  mtr: [
    { no: "MT-2026-001", status: "กำลังซ่อม", title: "แกน 3 ไม่เคลื่อนที่ Servo Alarm", machine: "หุ่นยนต์เชื่อม (Welding Robot) #1", line: "ไลน์เชื่อม", priority: "ด่วน", owner: "หัวหน้าไลน์เชื่อม", date: "2026-09-15" },
    { no: "MT-2026-002", status: "รออะไหล่", title: "หัวตัดสึก ตัดแผ่นเหล็กไม่ขาด", machine: "เครื่องตัดเลเซอร์แผ่นเหล็ก (Laser Cutter)", line: "ไลน์ประกอบ 1", priority: "ด่วนมาก (ไลน์หยุด)", owner: "ช่างประกอบ ไลน์ 1", date: "2026-09-19" },
    { no: "MT-2026-003", status: "ซ่อมเสร็จ", title: "น้ำมันรั่วที่ข้อต่อกระบอกยก", machine: "ลิฟต์ยกไฮดรอลิก ไลน์ประกอบ 2", line: "ไลน์ประกอบ 2", priority: "ปกติ", owner: "ช่างประกอบ ไลน์ 2", date: "2026-09-08" },
  ],
  pm: [
    { no: "PM-2026-001", status: "ตามแผน", title: "ตรวจเช็คและเปลี่ยนน้ำมันหล่อลื่น", machine: "เครื่อง CNC กัดชิ้นส่วน สาย 1", freq: "รายเดือน", due: "2026-10-05", owner: "ฝ่ายซ่อมบำรุง" },
    { no: "PM-2026-002", status: "เลยกำหนด", title: "เปลี่ยนไส้กรองอากาศห้องพ่นสี", machine: "ห้องพ่นสีอบแห้ง (Paint Booth)", freq: "ราย 3 เดือน", due: "2026-09-20", owner: "ฝ่ายซ่อมบำรุง" },
    { no: "PM-2026-003", status: "ทำแล้ว", title: "ตรวจสลิง ตะขอ และเบรกเครน", machine: "เครน 5 ตัน ไลน์ประกอบ", freq: "รายเดือน", due: "2026-09-15", owner: "ฝ่ายซ่อมบำรุง" },
  ],
  so: [
    { no: "SO-2026-001", status: "กำลังผลิต", title: "บริษัท น้ำตาลพิษณุโลก จำกัด", model: "YT6500", qty: 3, due: "2026-11-15", owner: "ฝ่ายขาย", date: "2026-08-20" },
    { no: "SO-2026-002", status: "ยืนยันคำสั่งซื้อ", title: "สหกรณ์ชาวไร่อ้อย จ.นครสวรรค์", model: "YT3000", qty: 5, due: "2026-10-30", owner: "ฝ่ายขาย", date: "2026-09-05" },
    { no: "SO-2026-003", status: "เสนอราคา", title: "ไร่อ้อยเอกชน จ.กาญจนบุรี", model: "W250", qty: 2, due: "2026-12-15", owner: "ฝ่ายขาย", date: "2026-09-22" },
  ],
  cc: [
    { no: "CC-2026-001", status: "ปิดเรื่อง", title: "ใบมีดตัดอ้อยสึกเร็วผิดปกติ", customer: "ลูกค้าไร่อ้อย จ.กำแพงเพชร", model: "YT6500", owner: "ฝ่ายขาย", date: "2026-08-28", detail: "ส่งต่อวิศวกรรม → ECR-2026-001 / EO-2026-001 เปลี่ยนเป็นใบมีด SK5 และเปลี่ยนให้ลูกค้าฟรี" },
    { no: "CC-2026-002", status: "กำลังแก้ไข", title: "ขั้วต่อสายไฟชื้นน้ำหลังล้างเครื่อง", customer: "ไร่อ้อยเอกชน จ.กาญจนบุรี", model: "W250", owner: "ฝ่ายขาย", date: "2026-09-19", detail: "ส่งต่อวิศวกรรม → ECR-2026-003" },
    { no: "CC-2026-003", status: "รับเรื่อง", title: "ขอคู่มือบำรุงรักษาฉบับภาษาไทย", customer: "สหกรณ์ชาวไร่อ้อย จ.นครสวรรค์", model: "YT3000", owner: "ฝ่ายขาย", date: "2026-09-24", detail: "" },
  ],
  mc: [
    { no: "MC-2025-011", status: "อยู่ระหว่างซ่อม", title: "YT6500-2410-003", model: "YT6500", customer: "ไร่ส่งเสริม จ.พิษณุโลก", location: "อ.วังทอง จ.พิษณุโลก", delivered: "2025-01-15", warranty: "2026-01-15", rev: "A", so: "", wo: "", hours: 1850, owner: "ฝ่ายขาย", date: "2025-01-15" },
    { no: "MC-2026-001", status: "ใช้งานปกติ", title: "YT6500-2503-001", model: "YT6500", customer: "ลูกค้าไร่อ้อย จ.กำแพงเพชร", location: "อ.ขาณุวรลักษบุรี จ.กำแพงเพชร", delivered: "2026-03-20", warranty: "2027-03-20", rev: "A", so: "", wo: "", hours: 420, owner: "ฝ่ายขาย", date: "2026-03-20" },
    { no: "MC-2026-002", status: "ใช้งานปกติ", title: "YT3000-2502-004", model: "YT3000", customer: "สหกรณ์ชาวไร่อ้อย จ.นครสวรรค์", location: "อ.ตาคลี จ.นครสวรรค์", delivered: "2026-02-10", warranty: "", rev: "A", so: "", wo: "", hours: 610, owner: "ฝ่ายขาย", date: "2026-02-10" },
    { no: "MC-2026-003", status: "อยู่ระหว่างซ่อม", title: "W250-2504-002", model: "W250", customer: "ไร่อ้อยเอกชน จ.กาญจนบุรี", location: "อ.ท่าม่วง จ.กาญจนบุรี", delivered: "2026-04-05", warranty: "", rev: "A", so: "", wo: "", hours: 380, owner: "ฝ่ายขาย", date: "2026-04-05" },
    { no: "MC-2026-004", status: "ใช้งานปกติ", title: "AX5000-2506-001", model: "AX5000", customer: "กลุ่มเกษตรกร จ.สุพรรณบุรี", location: "อ.ด่านช้าง จ.สุพรรณบุรี", delivered: "2026-06-30", warranty: "", rev: "A", so: "", wo: "WO-2026-084", hours: 95, owner: "ฝ่ายขาย", date: "2026-06-30" },
  ],
  svc: [
    { no: "SV-2026-001", status: "ปิดงาน", title: "เปลี่ยนใบมีดเป็น SK5 ตาม EO-2026-001 (ใบมีดสึกเร็ว)", machine: "MC-2026-001", customer: "", model: "", kind: "เคลมประกัน", priority: "ด่วน", tech: "ช่างบริการ 1", appt: "2026-09-01", date: "2026-08-28", cost: 0, cc: "CC-2026-001", claimCause: "การออกแบบ", supplier: "", claimStatus: "ไม่เคลมผู้ขาย (รับผิดชอบเอง)", claimRef: "", claimAmount: 0, detail: "เปลี่ยนใบมีด 2 ใบ (MR-2026-007) ลูกค้ารับรองผล 2 ก.ย." },
    { no: "SV-2026-002", status: "รออะไหล่", title: "ขั้วต่อสายไฟชื้นน้ำ เครื่องดับเป็นช่วงหลังล้างเครื่อง", machine: "MC-2026-003", customer: "", model: "", kind: "เคลมประกัน", priority: "ด่วนมาก (เครื่องหยุด)", tech: "ช่างบริการ 1", appt: "2026-09-21", date: "2026-09-19", cost: 0, cc: "CC-2026-002", claimCause: "ชิ้นส่วนจากผู้ขาย", supplier: "บจก. ไทยไวร์ริ่ง ซัพพลาย", claimStatus: "ส่งเคลมผู้ขายแล้ว", claimRef: "TW-CLM-0925", claimAmount: 4500, detail: "รอขั้วต่อชุดใหม่ (MR-2026-005) — วิศวกรรมกำลังเปลี่ยนเป็นแบบกันน้ำตาม ECR-2026-003" },
    { no: "SV-2026-003", status: "นัดหมายแล้ว", title: "ตรวจเช็คก่อนเปิดฤดูหีบ 2569/70", machine: "MC-2026-002", customer: "", model: "", kind: "ตรวจเช็คก่อนฤดูหีบ", priority: "ปกติ", tech: "ช่างบริการ 2", appt: "2026-10-05", date: "2026-09-20", cost: 3500, cc: "", detail: "" },
    { no: "SV-2026-004", status: "กำลังดำเนินการ", title: "โซ่ลำเลียงหย่อน มีเสียงดังขณะทำงาน", machine: "MC-2025-011", customer: "", model: "", kind: "ซ่อม (Breakdown)", priority: "ด่วน", tech: "ช่างบริการ 2", appt: "2026-09-23", date: "2026-09-22", cost: 8500, cc: "", detail: "นอกประกัน — เสนอราคาเปลี่ยนโซ่ 1 เส้น ลูกค้าอนุมัติแล้ว" },
    { no: "SV-2026-005", status: "รับแจ้ง", title: "ขออบรมการใช้งานให้พนักงานขับใหม่ 3 คน", machine: "MC-2026-004", customer: "", model: "", kind: "อบรมการใช้งาน", priority: "ปกติ", tech: "", appt: "", date: "2026-09-24", cost: 0, cc: "", detail: "" },
  ],
};

// Part codes for the built-in BOMs (Make/Buy is derived from the Make-or-Buy calculation)
const BOM_PART_CODES = {
  "ใบมีดตัดอ้อย (Cane Blade)": "BL-1001",
  "ชุดเฟืองขับ (Drive Gear Set)": "GR-2001",
  "ปลอกสายไฮดรอลิก (Hydraulic Hose Fitting)": "HY-3001",
  "ชุดซีลกระบอกไฮดรอลิก (Hydraulic Cylinder Seal Kit)": "HY-3005",
  "โครงเหล็กฐานเครื่อง (Base Frame)": "FR-4001",
  "ชุดยึดเครื่องยนต์ (Engine Mount Bracket)": "FR-4010",
  "โซ่ลำเลียงอ้อย (Conveyor Chain)": "CV-5001",
  "ขั้วต่อสายไฟชุดควบคุม (Wiring Harness Connector Set)": "EL-6001",
};

// Revision history examples tied to the EOs above
const BOM_SAMPLE_META = {
  YT6500: {
    rev: "B",
    status: "ใช้งาน (Released)",
    history: [
      { rev: "A", date: "2026-03-01", note: "BOM เริ่มต้น", ref: "" },
      { rev: "B", date: "2026-09-08", note: "เปลี่ยนใบมีดเป็น SK5 ชุบแข็ง (BL-1001 → BL-1001B)", ref: "EO-2026-001" },
    ],
  },
  W350: {
    rev: "B",
    status: "ใช้งาน (Released)",
    history: [
      { rev: "A", date: "2026-02-15", note: "BOM เริ่มต้น", ref: "" },
      { rev: "B", date: "2026-07-10", note: "สลักชุดยึดเครื่องยนต์เปลี่ยนเป็นเกรด 10.9", ref: "EO-2026-002" },
    ],
  },
  YT7500: {
    rev: "C",
    status: "ร่าง (Draft)",
    history: [
      { rev: "A", date: "2026-01-20", note: "BOM เริ่มต้น", ref: "" },
      { rev: "B", date: "2026-05-02", note: "เพิ่มโซ่ลำเลียงเป็น 2 เส้น", ref: "" },
      { rev: "C", date: "2026-09-23", note: "เตรียมเปลี่ยนแคลมป์ยึดสายไฮดรอลิก — รอ ECR อนุมัติ", ref: "ECR-2026-002" },
    ],
  },
};

// Sub-parts for the built-in assemblies (multi-level BOM example) — keyed by the parent part code
const BOM_SAMPLE_CHILDREN = {
  "FR-4001": [
    { code: "FR-4001-01", part: "แผ่นเหล็กฐาน SS400 หนา 6 มม.", qty: 4, unit: "แผ่น", source: "ซื้อ", station: "ไลน์เชื่อม", op: "ตัด/พับ" },
    { code: "FR-4001-02", part: "ท่อเหล็กเหลี่ยม 100x100 หนา 4 มม.", qty: 6, unit: "เส้น", source: "ซื้อ", station: "ไลน์เชื่อม", op: "ตัด/เชื่อม" },
    { code: "FR-4001-03", part: "ชุดโบลท์ยึดโครง M16 เกรด 8.8", qty: 24, unit: "ตัว", source: "ซื้อ", station: "ไลน์ประกอบ 1", op: "ประกอบโครง" },
    { code: "FR-4001-04", part: "สีรองพื้นกันสนิม", qty: 3, unit: "ลิตร", source: "ซื้อ", station: "ไลน์พ่นสี", op: "พ่นสี" },
  ],
  "GR-2001": [
    { code: "GR-2001-01", part: "เฟืองขับหลัก (Main Gear)", qty: 1, unit: "ชิ้น", source: "ผลิตเอง", station: "ไลน์ประกอบ 2", op: "ประกอบชุดขับ" },
    { code: "GR-2001-02", part: "เพลาขับ (Drive Shaft)", qty: 1, unit: "ชิ้น", source: "ผลิตเอง", station: "ไลน์ประกอบ 2", op: "ประกอบชุดขับ" },
    { code: "GR-2001-03", part: "ตลับลูกปืน 6208-2RS", qty: 2, unit: "ชิ้น", source: "ซื้อ", station: "ไลน์ประกอบ 2", op: "ประกอบชุดขับ" },
    { code: "GR-2001-04", part: "ซีลน้ำมัน 40x62x8", qty: 2, unit: "ชิ้น", source: "ซื้อ", station: "ไลน์ประกอบ 2", op: "ประกอบชุดขับ" },
  ],
};

// Where each top-level part is used on the line (who takes it next) — sample defaults
const BOM_SAMPLE_STATION = { FR: "ไลน์เชื่อม", BL: "ไลน์ประกอบ 1", GR: "ไลน์ประกอบ 2", CV: "ไลน์ประกอบ 2", HY: "ไลน์ประกอบ 3", EL: "ไลน์ทดสอบ" };

// Stock on hand (sample) — warehouse keeps it current on the BOM & requisition page
const STOCK_SAMPLE = {
  "BL-1001": { qty: 6, loc: "A-01-1" }, "BL-1001B": { qty: 4, loc: "A-01-2" }, "GR-2001": { qty: 3, loc: "B-02-1" },
  "GR-2001-01": { qty: 5, loc: "B-02-2" }, "GR-2001-02": { qty: 5, loc: "B-02-3" }, "GR-2001-03": { qty: 20, loc: "B-03-1" }, "GR-2001-04": { qty: 16, loc: "B-03-2" },
  "HY-3001": { qty: 60, loc: "C-01-1" }, "HY-3005": { qty: 5, loc: "C-01-3" }, "FR-4001": { qty: 1, loc: "ลานโครง" },
  "FR-4001-01": { qty: 30, loc: "ลานเหล็ก" }, "FR-4001-02": { qty: 40, loc: "ลานเหล็ก" }, "FR-4001-03": { qty: 300, loc: "D-01-1" }, "FR-4001-04": { qty: 12, loc: "ห้องสี" },
  "FR-4010": { qty: 2, loc: "B-04-1" }, "CV-5001": { qty: 0, loc: "E-01-1" }, "EL-6001": { qty: 1, loc: "F-01-1" },
};
