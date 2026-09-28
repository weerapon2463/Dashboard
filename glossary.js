/* ==========================================================================
   คำย่อ (glossary.js) — the short English codes the system uses (WO, MR, GRN…)
   explained in plain Thai: a ❓ button opens the list, and short labels that
   contain a code get a hover/long-press tooltip with its meaning.
   ========================================================================== */

const GLOSSARY = [
  ["WO", "ใบสั่งผลิต", "Work Order — สั่งให้ผลิตรถ 1 คัน / 1 ล็อต"],
  ["SO", "ใบสั่งขาย", "Sales Order — ลูกค้าสั่งซื้อ"],
  ["BOM", "รายการชิ้นส่วนของรถ", "Bill of Materials — รถ 1 คันใช้ชิ้นส่วนอะไร กี่ชิ้น"],
  ["MR", "ใบเบิกวัสดุ", "Material Request — ขอเบิกของจากคลัง"],
  ["MRQ", "ใบขอให้จัดหา", "Material Requisition — ของไม่พอ ขอให้จัดซื้อ"],
  ["PR", "ใบขอซื้อ", "Purchase Request"],
  ["PO", "ใบสั่งซื้อ", "Purchase Order — ส่งให้ผู้ขาย"],
  ["GRN", "ใบรับของ", "Goods Receipt Note — ของจากผู้ขายมาถึงแล้ว"],
  ["IQC", "ตรวจของก่อนรับเข้า", "Incoming Quality Control"],
  ["QC", "ตรวจคุณภาพ", "Quality Control"],
  ["QI", "พื้นที่รอตรวจ", "Quality Inspection — ของรอ QC ยังใช้ไม่ได้"],
  ["NCR", "ใบแจ้งของเสีย / ไม่ตรงสเปก", "Non-Conformance Report"],
  ["CAPA", "ใบแก้ไขและป้องกัน", "Corrective and Preventive Action"],
  ["ECR", "ใบขอเปลี่ยนแบบ", "Engineering Change Request"],
  ["EO", "คำสั่งเปลี่ยนแบบ", "Engineering Order — อนุมัติให้เปลี่ยนแล้ว"],
  ["TQ", "คำถามทางเทคนิค", "Technical Query — ถาม R&D"],
  ["WI", "วิธีการทำงาน", "Work Instruction"],
  ["DWG", "แบบงาน", "Drawing"],
  ["SE", "รายการเคลื่อนไหวของคลัง", "Stock Entry — รับ / จ่าย / โอน / ผลิตเสร็จ"],
  ["P2P", "ขั้นตอนจัดซื้อทั้งหมด", "Procure-to-Pay — ขอซื้อจนถึงจ่ายเงิน"],
  ["SLA", "เวลาที่ควรเสร็จ", "Service Level Agreement — ขั้นนี้ควรใช้เวลาไม่เกินกี่วัน"],
  ["RFQ", "ขอใบเสนอราคา", "Request for Quotation"],
  ["SV", "งานบริการ / ซ่อม", "Service order"],
  ["SVC", "งานบริการ / ซ่อม", "Service order"],
  ["MC", "ทะเบียนเครื่องลูกค้า", "Machine — รถที่ส่งมอบแล้ว"],
  ["FG", "สินค้าสำเร็จรูป", "Finished Goods — รถที่ประกอบเสร็จ"],
  ["KPI", "ตัวชี้วัด", "Key Performance Indicator"],
  ["MRP", "คำนวณของที่ต้องใช้", "Material Requirements Planning — ของขาดเท่าไร ต้องซื้อเมื่อไร"],
  ["Job Card", "ใบงานรายขั้นตอน", "ตัด เชื่อม พ่นสี ประกอบ… จับเวลาแต่ละขั้น"],
  ["Rev", "ฉบับแก้ไข", "Revision — ฉบับที่ของแบบ / BOM"],
  ["Serial", "เลขเครื่อง", "เลขประจำรถแต่ละคัน"],
  ["Routing", "ลำดับขั้นตอนการผลิต", "รถแต่ละรุ่นผ่านสถานีไหนบ้าง"],
  ["Pilot", "ทดลองใช้จริง", "ช่วงนำร่องเพื่อวัดผลก่อน / หลัง"],
];
const GL_RE = new RegExp(`(^|[^A-Za-z])(${GLOSSARY.map((g) => g[0].replace(/ /g, "\\s")).sort((a, b) => b.length - a.length).join("|")})(?=$|[^A-Za-z])`, "g");

function glEsc(v) { return escapeHtml(String(v)); }

function glOpen() {
  let bd = document.getElementById("glBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "glBackdrop";
    bd.innerHTML = `<div class="modal gl-modal" role="dialog" aria-labelledby="glTitle"><div class="sn-mhead"><h3 id="glTitle">คำย่อในระบบ แปลว่าอะไร</h3><button type="button" class="btn-link" id="glClose" aria-label="ปิด">✕</button></div>
      <input id="glSearch" class="wo-search" placeholder="พิมพ์คำที่อยากรู้ เช่น GRN หรือ ใบเบิก" autocomplete="off"><dl id="glList" class="gl-list"></dl></div>`;
    document.body.appendChild(bd);
    const close = () => bd.classList.remove("open");
    bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
    bd.querySelector("#glClose").addEventListener("click", close);
    bd.querySelector("#glSearch").addEventListener("input", (e) => glRender(e.target.value));
  }
  glRender("");
  bd.classList.add("open");
  setTimeout(() => bd.querySelector("#glSearch").focus(), 30);
}
function glRender(q) {
  q = String(q || "").trim().toLowerCase();
  const rows = GLOSSARY.filter((g) => !q || g.join(" ").toLowerCase().includes(q));
  document.getElementById("glList").innerHTML = rows.length
    ? rows.map((g) => `<div class="gl-row"><dt>${glEsc(g[0])}</dt><dd><b>${glEsc(g[1])}</b><small>${glEsc(g[2])}</small></dd></div>`).join("")
    : `<p class="muted-inline">ไม่พบคำนี้ — ถามผู้ดูแลระบบได้</p>`;
}

// short labels (table heads, pills, buttons, tabs) that contain a code get its Thai meaning as a tooltip
function glTitles(root) {
  (root || document).querySelectorAll("th, .pill, .nav-item, button, .tab, h3, label, .card-sub b").forEach((el) => {
    if (el.dataset.gl || el.title) return;
    const t = el.textContent || "";
    if (t.length > 60) return;
    const found = [];
    t.replace(GL_RE, (m, pre, code) => { const g = GLOSSARY.find((x) => x[0].toLowerCase() === code.replace(/\s+/g, " ").toLowerCase()); if (g && !found.includes(g)) found.push(g); return m; });
    el.dataset.gl = "1";
    if (found.length) el.title = found.map((g) => `${g[0]} = ${g[1]}`).join(" · ");
  });
}

function initGlossary() {
  const acts = document.querySelector(".topbar-actions");
  if (acts && !document.getElementById("glBtn")) {
    const b = document.createElement("button");
    b.type = "button"; b.id = "glBtn"; b.className = "theme-toggle";
    b.title = "คำย่อในระบบ แปลว่าอะไร"; b.setAttribute("aria-label", b.title);
    b.textContent = "❓";
    b.addEventListener("click", glOpen);
    acts.insertBefore(b, document.getElementById("densityBtn") || null);
  }
  const main = document.querySelector(".main");
  if (!main || typeof MutationObserver === "undefined") return;
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => glTitles(main), 400); }).observe(main, { childList: true, subtree: true });
  glTitles(document);
}
