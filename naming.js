/* ==========================================================================
   Naming series — document number patterns an admin can change, ERPNext
   style: parts separated by "." — YYYY / YY / MM / DD (ค.ศ.), BE (พ.ศ.) and a
   run of # for the running number, e.g. "PR-.YYYY.-.####" → PR-2026-0001.
   The next number continues from the highest one already used with the same
   prefix, so changing a pattern never reuses an old number.
   ========================================================================== */

const NAMING_KEY = "y2j-naming-v1";

function namingSeries() {
  const out = [
    { id: "wo", name: "ใบสั่งผลิต (Work Order)", def: "WO-.YYYY.-.###" },
    { id: "pr", name: "ใบขอซื้อ (PR)", def: "PR-.YYYY.-.####" },
    { id: "po", name: "ใบสั่งซื้อ (PO)", def: "PO-.YYYY.-.####" },
    { id: "se", name: "เคลื่อนไหวคลัง (Stock Entry)", def: "SE-.YYYY.-.####" },
    { id: "jc", name: "Job Card (ขั้นตอนการผลิต)", def: "JC-.YYYY.-.####" },
  ];
  if (typeof DOC_TYPES !== "undefined") Object.keys(DOC_TYPES).forEach((t) => {
    const d = DOC_TYPES[t];
    if (d && d.prefix && !d.special) out.push({ id: `doc:${t}`, name: `${d.name || d.abbr || t}`, def: `${d.prefix}-.YYYY.-.###` });
  });
  return out;
}

function namingStored() {
  try { return JSON.parse(localStorage.getItem(NAMING_KEY) || "{}") || {}; } catch (e) { return {}; }
}

function namingPattern(id) {
  const s = namingStored()[id];
  if (s) return s;
  const d = namingSeries().find((x) => x.id === id);
  return d ? d.def : `${String(id).toUpperCase()}-.YYYY.-.###`;
}

function namingParse(pattern, date) {
  const d = date || new Date();
  const y = String(d.getFullYear());
  const pad = (n) => String(n).padStart(2, "0");
  const map = { YYYY: y, YY: y.slice(2), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), BE: String(d.getFullYear() + 543) };
  let pre = "", suf = "", width = 0;
  String(pattern).split(".").forEach((p) => {
    if (!width && /^#+$/.test(p)) { width = p.length; return; }
    const v = map[p] !== undefined ? map[p] : p;
    if (width) suf += v; else pre += v;
  });
  return { pre, suf, width: width || 3 };
}

function namingNext(id, existing, pattern) {
  const { pre, suf, width } = namingParse(pattern || namingPattern(id));
  let max = 0;
  (existing || []).forEach((n) => {
    n = String(n || "");
    if (!n.startsWith(pre) || !n.endsWith(suf) || n.length <= pre.length + suf.length) return;
    const mid = n.slice(pre.length, n.length - suf.length);
    if (/^\d+$/.test(mid)) max = Math.max(max, Number(mid));
  });
  return pre + String(max + 1).padStart(width, "0") + suf;
}

// numbers already used by a series (for the preview in admin)
function namingUsed(id) {
  if (id === "wo") return (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).map((w) => w.wo);
  if (id === "se") return (typeof SX_ENTRIES !== "undefined" ? SX_ENTRIES : []).map((e) => e.no);
  if (id === "jc") return (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).flatMap((w) => (w.jobs || []).map((j) => j.no));
  if (id === "pr" || id === "po") {
    const cases = typeof P2P_CASES !== "undefined" ? P2P_CASES : [];
    const list = id === "pr" ? (typeof PR_LIST !== "undefined" ? PR_LIST : []) : (typeof PO_LIST !== "undefined" ? PO_LIST : []);
    return list.map((p) => p.id).concat(cases.map((c) => c[id]));
  }
  if (id.startsWith("doc:") && typeof DEPT_DOCS !== "undefined") return (DEPT_DOCS[id.slice(4)] || []).map((d) => d.no);
  return [];
}

/* ---- admin tab --------------------------------------------------------------------- */

function renderAdminNaming() {
  const el = document.getElementById("namingPanel");
  if (!el) return;
  const stored = namingStored();
  el.innerHTML = `
    <p class="card-sub">รูปแบบเลขที่เอกสารแบบ ERPNext — คั่นแต่ละส่วนด้วยจุด: <code>YYYY</code> ปี ค.ศ. · <code>BE</code> ปี พ.ศ. · <code>YY</code> · <code>MM</code> เดือน · <code>DD</code> วัน · <code>####</code> เลขรัน (จำนวน # = จำนวนหลัก) · ตัวอย่าง <code>PR-.BE.-.MM.-.###</code> → PR-2569-09-001 · เลขรันต่อจากเลขที่ใช้ไปแล้วที่มีหัวเดียวกัน ไม่ซ้ำของเดิม</p>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>เอกสาร</th><th>รูปแบบ</th><th>เลขถัดไป</th><th></th></tr></thead><tbody>
    ${namingSeries().map((s) => `<tr><td>${escapeHtml(s.name)}</td>
      <td><input class="bom-inline nm-pat" data-id="${escapeHtml(s.id)}" value="${escapeHtml(stored[s.id] || s.def)}" aria-label="รูปแบบ ${escapeHtml(s.name)}"></td>
      <td class="mono-cell nm-prev">${escapeHtml(namingNext(s.id, namingUsed(s.id)))}</td>
      <td>${stored[s.id] ? `<button type="button" class="btn-link" data-nmreset="${escapeHtml(s.id)}">ค่าเดิม (${escapeHtml(s.def)})</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
  el.querySelectorAll(".nm-pat").forEach((inp) => {
    inp.addEventListener("input", () => {
      const ok = /#/.test(inp.value);
      inp.closest("tr").querySelector(".nm-prev").textContent = ok ? namingNext(inp.dataset.id, namingUsed(inp.dataset.id), inp.value) : "ต้องมี # อย่างน้อย 1 ตัว";
    });
    inp.addEventListener("change", () => {
      const v = inp.value.trim();
      if (!/#/.test(v)) { showToast("รูปแบบต้องมี # สำหรับเลขรัน", "warn"); return; }
      const all = namingStored();
      const prev = all[inp.dataset.id] || namingPattern(inp.dataset.id);
      all[inp.dataset.id] = v;
      try { localStorage.setItem(NAMING_KEY, JSON.stringify(all)); } catch (e) { showToast("บันทึกไม่สำเร็จ", "warn"); return; }
      if (typeof auditLog === "function") auditLog("ตั้งรูปแบบเลขเอกสาร", inp.dataset.id, `"${prev}" → "${v}"`);
      showToast("บันทึกรูปแบบเลขเอกสารแล้ว", "good");
      renderAdminNaming();
    });
  });
  el.querySelectorAll("[data-nmreset]").forEach((b) => b.addEventListener("click", () => {
    const all = namingStored();
    delete all[b.dataset.nmreset];
    try { localStorage.setItem(NAMING_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
    if (typeof auditLog === "function") auditLog("ตั้งรูปแบบเลขเอกสาร", b.dataset.nmreset, "กลับเป็นค่าเริ่มต้น");
    renderAdminNaming();
  }));
}
