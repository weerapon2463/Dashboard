/* ==========================================================================
   มาตรฐานรหัสชิ้นส่วน R&D — ตามเอกสาร "Code R_D_Rev.03" ของบริษัท
     K 13 A 0 6552 - 00 - 01
     │ │  │ │ │      │    └ Rev. (การแก้ไขแบบ)
     │ │  │ │ │      └ E/O  (Engineering Order)
     │ │  │ │ └ P/N 4 หลัก
     │ │  │ └ 0 = รหัสเก่าที่มีอยู่แล้ว / 1 = ชิ้นงานที่สร้างขึ้นใหม่
     │ │  └ Work/Type (A Assembly, W Weldment, S Single part …)
     │ └ Item = ลำดับไอเทมในรถตัดอ้อย (01 CHASSIS … 15 ELECTRICAL)
     └ รหัสรถ = แบรนด์ (T TIGER, K KUMIKI …)
   Part number used by BOM and drawings = everything up to the E/O (K13A06552-00);
   the revision is the drawing revision. Standard parts use P-codes (P2xxxx …) and
   bolt/nut codes (PHB05-020B-1 …). Lists are editable in R&D Workbench.
   ========================================================================== */

const PC_DEFAULT = {
  brands: [["T", "TIGER"], ["K", "KUMIKI"], ["B", "YT3000"]],
  groups: [
    ["01", "CHASSIS"], ["02", "CROP"], ["03", "ELEVATOR"], ["04", "PRIMARY EXT"], ["05", "SHREDDER TOPPER"], ["06", "CABIN"],
    ["07", "TRANSMISSION"], ["09", "ENGINE BOX"], ["10", "ROLLER"], ["11", "CHOPPER DRUM"], ["12", "PLATFORM & GUARDRAILS"],
    ["13", "BASE CUTTER"], ["14", "HYDRAULIC CYLINDER"], ["15", "ELECTRICAL"],
  ],
  types: [
    ["A", "ASSEMBLY"], ["C", "CASTING"], ["E", "ELECTRICAL"], ["G", "GAS CUTTING"], ["H", "HYDRAULIC"],
    ["M", "MACHINE"], ["P", "PAINT / COLOUR"], ["S", "SINGLE PART"], ["W", "WELDMENT"],
  ],
};
// Standard parts (P'Code) — first digit after P is the group
const PC_STD_GROUPS = { 1: "P'Code เดิม", 2: "P'Code เดิม", 3: "Parts STD ทั่วไป / ชิ้นงานใหม่", 4: "Sticker / Nameplate", 5: "ไฟฟ้า / อิเล็กทรอนิกส์", 6: "ของเหลว / น้ำมัน / น้ำยาหล่อเย็น", 7: "Fitting Hyd. / ท่อ Hose" };
const PC_FASTENERS = { HB: "HEX BOLT", B: "HEX BOLT (นิ้ว)", CS: "BOLT COUNTER SUNK", BT: "BOLT หัวจมกลม", ST: "STUD BOLT", SS: "ตัวหนอน", HN: "HEX NUT", NN: "NYLON NUT", SC: "SOCKET BOLT", SW: "SPRING WASHER", PW: "WASHER", GN: "GREASE NIPPLE", SP: "SPECIAL PART" };
const PC_GRADES = { A: "non steel", B: "8.8", C: "10.9", D: "12.9", E: "A2 SUS (10.9)", F: "A4 SUS (12.9)" };
let PC_CACHE = null;

function pcStd() {
  if (PC_CACHE) return PC_CACHE;
  let saved = null;
  try { const r = JSON.parse(localStorage.getItem("y2j-rnd-v1") || "null"); saved = r && r.codeStd; } catch (e) { saved = null; }
  // settings saved by the first version (single "prefix") fall back to the brand list
  if (saved && !Array.isArray(saved.brands)) saved = Object.assign({}, saved, { brands: PC_DEFAULT.brands });
  PC_CACHE = Object.assign({}, PC_DEFAULT, saved || {});
  return PC_CACHE;
}
function pcReset() { PC_CACHE = null; }
const PC_RE = /^([A-Za-z])(\d{2})([A-Za-z])([01])(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:\.[A-Za-z0-9]+)?$/;

// Returns null when the text is not a part code of the standard
function pcParse(code) {
  const m = PC_RE.exec(String(code || "").trim());
  if (!m) return null;
  const s = pcStd();
  const brand = m[1].toUpperCase(), type = m[3].toUpperCase();
  const b = s.brands.find((x) => x[0] === brand);
  const g = s.groups.find((x) => x[0] === m[2]);
  const t = s.types.find((x) => x[0] === type);
  const eo = m[6] || "00";
  return {
    brand, brandName: b ? b[1] : "", group: m[2], groupName: g ? g[1] : "", groupLabel: `${m[2]} | ${g ? g[1] : "ไม่อยู่ในมาตรฐาน"}`,
    type, typeName: t ? t[1] : "", isNew: m[4] === "1", pn: m[5], num: m[4] + m[5], eo, rev: m[7] === undefined ? null : m[7],
    partNo: `${brand}${m[2]}${type}${m[4]}${m[5]}-${eo}`, known: !!b && !!g && !!t,
  };
}
// Standard part / fastener codes → description, or null
function pcParseStd(code) {
  const c = String(code || "").trim().toUpperCase();
  let m = /^P(\d)(\d{4})$/.exec(c);
  if (m) return { kind: "std", label: `P${m[1]} · ${PC_STD_GROUPS[m[1]] || "ว่าง"}` };
  m = /^P([A-Z]{1,2})(\d{2})-(\d{3})([A-F])?(?:-(\d))?$/.exec(c);
  if (m && PC_FASTENERS[m[1]]) return { kind: "fastener", label: `${PC_FASTENERS[m[1]]} M${Number(m[2])}${Number(m[3]) ? `×${Number(m[3])}` : ""}${m[4] ? ` · ${PC_GRADES[m[4]]}` : ""}${m[5] !== undefined ? ` · ชุบ ${m[5]}` : ""}` };
  return null;
}
// Part number without the revision (what the BOM and the drawing register share)
function pcPartNo(code) { const p = pcParse(code); return p ? p.partNo : String(code || "").trim(); }

function pcKnownCodes(extra) {
  const out = new Set(extra || []);
  Object.keys(typeof MASTER_BOM !== "undefined" ? MASTER_BOM : {}).forEach((m) => (MASTER_BOM[m] || []).forEach((l) => { if (l.code) out.add(l.code); }));
  (typeof DEPT_DOCS !== "undefined" ? DEPT_DOCS.dwg || [] : []).forEach((d) => { if (d.partCode) out.add(d.partCode); });
  if (typeof BX_STOCK !== "undefined") Object.keys(BX_STOCK).forEach((k) => out.add(k));
  if (typeof RD !== "undefined" && RD.parts) Object.keys(RD.parts).forEach((k) => out.add(k));
  return [...out];
}

// Next new part code (flag 1) for brand + item + type: P/N counted within that brand/item/type
function pcNext(brand, group, type, extra) {
  let max = 0;
  pcKnownCodes(extra).forEach((c) => { const p = pcParse(c); if (p && p.brand === brand && p.group === group && p.type === type && p.isNew) max = Math.max(max, Number(p.pn)); });
  return `${brand}${group}${type}1${String(max + 1).padStart(4, "0")}-00`;
}
function pcNextRev(code) {
  const p = pcParse(code);
  if (!p) return "";
  return `${p.partNo}-${String((p.rev === null ? -1 : Number(p.rev)) + 1).padStart(2, "0")}`;
}
function pcNextEo(code) {
  const p = pcParse(code);
  if (!p) return "";
  return `${p.brand}${p.group}${p.type}${p.num}-${String(Number(p.eo) + 1).padStart(2, "0")}-00`;
}

function pcChips(code) {
  const p = pcParse(code);
  if (!p) {
    const s = pcParseStd(code);
    return s ? `<span class="pc-chip pc-std" title="ชิ้นส่วนมาตรฐาน">STD</span><span class="pc-chip">${escapeHtml(s.label)}</span>` : "";
  }
  return `<span class="pc-chip pc-brand" title="แบรนด์">${escapeHtml(p.brand)} ${escapeHtml(p.brandName || "?")}</span>`
    + `<span class="pc-chip" title="${escapeHtml(p.groupLabel)}">${escapeHtml(p.group)} ${escapeHtml(p.groupName || "?")}</span>`
    + `<span class="pc-chip pc-type" title="${escapeHtml(p.type)} = ${escapeHtml(p.typeName || "ไม่อยู่ในมาตรฐาน")}">${escapeHtml(p.type)} ${escapeHtml(p.typeName || "?")}</span>`
    + (p.isNew ? `<span class="pc-chip" title="1 = ชิ้นงานที่สร้างขึ้นใหม่">ใหม่</span>` : "")
    + (p.eo !== "00" ? `<span class="pc-chip" title="Engineering Order">E/O ${escapeHtml(p.eo)}</span>` : "")
    + (p.rev !== null ? `<span class="pc-chip">Rev.${escapeHtml(p.rev)}</span>` : "");
}

// File names (Inventor .idw/.iam/.ipt, PDF, DWG …) → parsed rows; the highest revision of each part wins
function pcParseFileNames(names) {
  const rows = [];
  const bad = [];
  names.map((n) => String(n).trim().split(/[\\/]/).pop()).filter(Boolean).forEach((name) => {
    const base = name.replace(/\.[A-Za-z0-9]+$/, "");
    const p = pcParse(base);
    if (!p) { bad.push(name); return; }
    rows.push({ file: name, p, rev: p.rev === null ? "00" : p.rev });
  });
  const best = {};
  rows.forEach((r) => { const cur = best[r.p.partNo]; if (!cur || r.rev > cur.rev) best[r.p.partNo] = r; });
  return { rows: Object.values(best).sort((a, b) => a.p.partNo.localeCompare(b.p.partNo)), bad, total: names.length };
}
