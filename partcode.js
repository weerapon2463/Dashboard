/* ==========================================================================
   มาตรฐานรหัสชิ้นส่วน (company part-number standard), e.g. K01W05269-00-00
     K      prefix
     01     group    (01 CHASSIS … 15 ELECTRICAL)
     W      type     (A ASSEMBLY, W WELDMENT, S SINGLE PART …)
     05269  running number (5 digits)
     -00    variant / dash number        → part number = K01W05269-00
     -00    revision (drawing file name) → Rev.00, Rev.01 …
   The lists are editable by R&D (stored in y2j-rnd-v1.codeStd); these are
   the defaults given by the engineering team.
   ========================================================================== */

const PC_DEFAULT = {
  prefix: "K",
  numDigits: 5,
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
let PC_CACHE = null;

function pcStd() {
  if (PC_CACHE) return PC_CACHE;
  let saved = null;
  try { const r = JSON.parse(localStorage.getItem("y2j-rnd-v1") || "null"); saved = r && r.codeStd; } catch (e) { saved = null; }
  PC_CACHE = Object.assign({}, PC_DEFAULT, saved || {});
  return PC_CACHE;
}
function pcReset() { PC_CACHE = null; }
function pcRegex() {
  const s = pcStd();
  const p = String(s.prefix || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${p}(\\d{2})([A-Za-z])(\\d{${Number(s.numDigits) || 5}})(?:-(\\d{2}))?(?:-(\\d{2}))?(?:\\.[A-Za-z0-9]+)?$`);
}

// Returns null when the text does not follow the standard
function pcParse(code) {
  const m = pcRegex().exec(String(code || "").trim());
  if (!m) return null;
  const s = pcStd();
  const type = m[2].toUpperCase();
  const g = s.groups.find((x) => x[0] === m[1]);
  const t = s.types.find((x) => x[0] === type);
  const variant = m[4] || "00";
  return {
    group: m[1], groupName: g ? g[1] : "", groupLabel: `${m[1]} | ${g ? g[1] : "ไม่อยู่ในมาตรฐาน"}`,
    type, typeName: t ? t[1] : "", num: m[3], variant, rev: m[5] === undefined ? null : m[5],
    partNo: `${s.prefix}${m[1]}${type}${m[3]}-${variant}`, known: !!g && !!t,
  };
}
// Part number without the revision (what the BOM and the drawing register should share)
function pcPartNo(code) { const p = pcParse(code); return p ? p.partNo : String(code || "").trim(); }

// Every code the system knows about (BOM, stock, drawings, part library, extra list)
function pcKnownCodes(extra) {
  const out = new Set(extra || []);
  Object.keys(typeof MASTER_BOM !== "undefined" ? MASTER_BOM : {}).forEach((m) => (MASTER_BOM[m] || []).forEach((l) => { if (l.code) out.add(l.code); }));
  (typeof DEPT_DOCS !== "undefined" ? DEPT_DOCS.dwg || [] : []).forEach((d) => { if (d.partCode) out.add(d.partCode); });
  if (typeof BX_STOCK !== "undefined") Object.keys(BX_STOCK).forEach((k) => out.add(k));
  if (typeof RD !== "undefined" && RD.parts) Object.keys(RD.parts).forEach((k) => out.add(k));
  return [...out];
}

// Next free part number for a group + type. Running numbers are counted per type across all groups,
// so the same number is never issued twice for one type.
function pcNext(group, type, extra) {
  const s = pcStd();
  const digits = Number(s.numDigits) || 5;
  let max = 0;
  pcKnownCodes(extra).forEach((c) => { const p = pcParse(c); if (p && p.type === type) max = Math.max(max, Number(p.num)); });
  return `${s.prefix}${group}${type}${String(max + 1).padStart(digits, "0")}-00`;
}
function pcNextRev(code) {
  const p = pcParse(code);
  if (!p) return "";
  return `${p.partNo}-${String((p.rev === null ? -1 : Number(p.rev)) + 1).padStart(2, "0")}`;
}

// Small labels: group · type (· Rev)
function pcChips(code) {
  const p = pcParse(code);
  if (!p) return "";
  return `<span class="pc-chip" title="${escapeHtml(p.groupLabel)}">${escapeHtml(p.group)} ${escapeHtml(p.groupName || "?")}</span><span class="pc-chip pc-type" title="${escapeHtml(p.type)} = ${escapeHtml(p.typeName || "ไม่อยู่ในมาตรฐาน")}">${escapeHtml(p.type)} ${escapeHtml(p.typeName || "?")}</span>${p.rev !== null ? `<span class="pc-chip">Rev.${escapeHtml(p.rev)}</span>` : ""}`;
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
