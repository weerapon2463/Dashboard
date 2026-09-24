/* ==========================================================================
   BOM Manager (R&D) — create a BOM for a new model (blank or copied from an
   existing one), edit lines while in Draft, release it, and issue a new
   Revision against an ECR/EO when it must change. Writes straight into
   MASTER_BOM / MACHINE_MODELS so the Work Orders BOM view stays in sync.
   ========================================================================== */

const BOM_STORAGE_KEY = "y2j-bom-v1";
const BOM_UNITS = ["ชิ้น", "ชุด", "เส้น", "ตัว", "แผ่น", "เมตร", "กก.", "ลิตร"];
const BOM_SOURCES = ["ซื้อ", "ผลิตเอง"];
const BOM_RELEASED = "ใช้งาน (Released)";
const BOM_DRAFT = "ร่าง (Draft)";

let BOM_META = {}; // model -> { rev, status, history: [{ rev, date, note, ref }] }
let bomModel = null;

function bomCanEdit(role) {
  if (typeof authCurrentUser === "function" && authCurrentUser()) return authCan("bom", "manage");
  return role === "depthead" || role === "plant";
}
function bomAudit(action, detail) {
  if (typeof auditLog === "function") auditLog(action, `BOM ${bomModel}`, detail);
}

/* ---- persistence ------------------------------------------------------ */

function bomDefaultMeta(model) {
  return { rev: "A", status: BOM_RELEASED, history: [{ rev: "A", date: "", note: "BOM เริ่มต้น", ref: "" }] };
}

function initBomData() {
  let hadStored = false;
  try {
    const raw = localStorage.getItem(BOM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.bom && Array.isArray(parsed.models)) {
      MACHINE_MODELS.length = 0;
      parsed.models.forEach((m) => MACHINE_MODELS.push(m));
      Object.keys(MASTER_BOM).forEach((k) => { delete MASTER_BOM[k]; });
      Object.assign(MASTER_BOM, parsed.bom);
      BOM_META = parsed.meta || {};
      hadStored = true;
    }
  } catch (e) { /* keep built-in sample BOMs */ }
  if (!hadStored) bomApplySamples();
  if (!hadStored) { MACHINE_MODELS.forEach((m) => { if (MASTER_BOM[m]) bomEnsureStructure(m); }); bomAddSampleChildren(); }
  MACHINE_MODELS.forEach((m) => {
    if (!MASTER_BOM[m]) MASTER_BOM[m] = [];
    if (!BOM_META[m]) BOM_META[m] = bomDefaultMeta(m);
    bomEnsureStructure(m);
  });
  bomModel = MACHINE_MODELS[0] || null;
  return hadStored;
}

/* ---- multi-level structure ------------------------------------------------ */

const BOM_GROUP_BY_PREFIX = {
  FR: "โครงสร้างและตัวถัง (Frame)", BL: "ชุดตัด (Cutting)", GR: "ระบบขับเคลื่อน (Drive)",
  CV: "ระบบลำเลียง (Conveyor)", HY: "ระบบไฮดรอลิก (Hydraulic)", EL: "ระบบไฟฟ้าและควบคุม (Electrical)",
};
const BOM_GROUP_DEFAULT = "ทั่วไป";

function bomNewLineId() { return "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function bomGroupForCode(code) {
  return BOM_GROUP_BY_PREFIX[String(code || "").slice(0, 2).toUpperCase()] || BOM_GROUP_DEFAULT;
}

// Older flat BOMs: give every line a stable id (index-based so every device derives the same ids
// before the first save), no parent, and a group from its part-code prefix.
function bomEnsureStructure(model) {
  const lines = MASTER_BOM[model] || [];
  const used = new Set(lines.map((l) => l.id).filter(Boolean));
  lines.forEach((l, i) => {
    if (!l.id) {
      let id = `L${i + 1}`;
      while (used.has(id)) id += "x";
      l.id = id;
      used.add(id);
    }
    if (l.parent === undefined || l.parent === null) l.parent = "";
    if (l.parent && !lines.some((p) => p.id === l.parent)) l.parent = "";
    if (!l.parent && !l.group) l.group = bomGroupForCode(l.code);
    if (l.station === undefined) l.station = "";
  });
}

// Add the sample sub-parts under matching assemblies (all models) — returns how many lines were added
function bomAddSampleChildren(onlyModel) {
  if (typeof BOM_SAMPLE_CHILDREN === "undefined") return 0;
  let added = 0;
  MACHINE_MODELS.filter((m) => !onlyModel || m === onlyModel).forEach((m) => {
    const lines = MASTER_BOM[m] || [];
    lines.slice().forEach((l) => {
      if (!l.parent && !l.station && typeof BOM_SAMPLE_STATION !== "undefined") l.station = BOM_SAMPLE_STATION[String(l.code || "").slice(0, 2)] || "";
      const kids = BOM_SAMPLE_CHILDREN[l.code];
      if (!kids || lines.some((c) => c.parent === l.id)) return;
      const at = lines.indexOf(l) + 1;
      lines.splice(at, 0, ...kids.map((k) => Object.assign({ id: bomNewLineId(), parent: l.id, note: "" }, k)));
      added += kids.length;
    });
  });
  return added;
}

function bomHasChildren(model, id) { return (MASTER_BOM[model] || []).some((l) => l.parent === id); }

function bomApplySamples() {
  const mobByName = {};
  MOB_SAMPLE_PARTS.forEach((p) => { mobByName[p.name] = computeMakeOrBuy(p).recommendation === "make" ? "ผลิตเอง" : "ซื้อ"; });
  Object.keys(MASTER_BOM).forEach((m) => {
    MASTER_BOM[m].forEach((l) => {
      if (!l.code) l.code = BOM_PART_CODES[l.part] || "";
      if (!l.source) l.source = mobByName[l.part] || "ซื้อ";
      if (l.note === undefined) l.note = "";
    });
  });
  // YT6500 Rev.B carries the SK5 blade from EO-2026-001
  const blade = (MASTER_BOM.YT6500 || []).find((l) => l.code === "BL-1001");
  if (blade) { blade.code = "BL-1001B"; blade.note = "SK5 ชุบแข็ง ตาม EO-2026-001"; }
  Object.keys(BOM_SAMPLE_META).forEach((m) => {
    if (MASTER_BOM[m]) BOM_META[m] = JSON.parse(JSON.stringify(BOM_SAMPLE_META[m]));
  });
}

function saveBom() {
  try {
    localStorage.setItem(BOM_STORAGE_KEY, JSON.stringify({ models: MACHINE_MODELS, bom: MASTER_BOM, meta: BOM_META }));
    const el = document.getElementById("deptSaveStatus");
    if (el) {
      const now = new Date();
      el.classList.remove("stale");
      el.innerHTML = `<span class="dot"></span>บันทึก BOM อัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")})`;
    }
  } catch (e) {
    showToast("บันทึก BOM ไม่สำเร็จ", "warn");
  }
}

// Keep the Work Orders page (BOM filter, BOM table, new-WO model list) in step
function bomSyncOtherViews() {
  const filter = document.getElementById("bomModelFilter");
  if (filter) {
    const prev = filter.value;
    filter.innerHTML = MACHINE_MODELS.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    filter.value = MACHINE_MODELS.includes(prev) ? prev : MACHINE_MODELS[0];
    renderBOMTable(filter.value);
  }
  if (typeof populateWOFormSelects === "function") populateWOFormSelects();
}

function afterBomMutation() {
  saveBom();
  bomSyncOtherViews();
  renderBomEditor();
  if (typeof renderDeptDocGrid === "function") renderDeptDocGrid();
  if (typeof renderBomx === "function") renderBomx();
}

function bomSummaryText() {
  const released = MACHINE_MODELS.filter((m) => BOM_META[m] && BOM_META[m].status === BOM_RELEASED).length;
  return `${MACHINE_MODELS.length} รุ่น · Released ${released}`;
}

function bomNextRev(rev) {
  if (/^[A-Y]$/.test(rev)) return String.fromCharCode(rev.charCodeAt(0) + 1);
  return rev + "1";
}

function bomDeleteLine(model, i) {
  const lines = MASTER_BOM[model];
  const gone = lines[i];
  lines.splice(i, 1);
  lines.forEach((l) => {
    if (gone.id && l.parent === gone.id) {
      l.parent = gone.parent || "";
      if (!l.parent) l.group = gone.group || bomGroupForCode(l.code);
    }
  });
}

/* ---- rendering --------------------------------------------------------- */

function renderBomEditor() {
  const card = document.getElementById("bomEditor");
  if (!card || card.hidden) return;
  if (!MACHINE_MODELS.includes(bomModel)) bomModel = MACHINE_MODELS[0];
  if (!bomModel) {
    // no models yet (new company): only "create BOM" makes sense
    document.getElementById("bomEdModel").innerHTML = "";
    document.getElementById("bomEdBadge").innerHTML = "";
    document.getElementById("bomEdStats").textContent = "ยังไม่มี BOM — กด \"+ สร้าง BOM รุ่นใหม่\" เพื่อเริ่ม";
    ["bomReleaseBtn", "bomRevBtn", "bomAddLineBtn", "bomLockNote", "bomSheetBtn"].forEach((id) => { document.getElementById(id).hidden = true; });
    document.getElementById("bomNewBtn").hidden = !bomCanEdit(currentRole());
    document.querySelector("#bomEdTable tbody").innerHTML = "";
    document.getElementById("bomEmptyNote").hidden = false;
    document.getElementById("bomHistory").innerHTML = "";
    return;
  }
  document.getElementById("bomSheetBtn").hidden = false;
  bomShowSheetLink();

  const sel = document.getElementById("bomEdModel");
  sel.innerHTML = MACHINE_MODELS.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)} — Rev.${escapeHtml(BOM_META[m].rev)}</option>`).join("");
  sel.value = bomModel;

  const meta = BOM_META[bomModel];
  const lines = MASTER_BOM[bomModel] || [];
  const canEdit = bomCanEdit(currentRole());
  const isDraft = meta.status === BOM_DRAFT;
  const editable = canEdit && isDraft;

  document.getElementById("bomEdBadge").innerHTML =
    `<span class="pill ${isDraft ? "pill-warning" : "pill-good"}">Rev.${escapeHtml(meta.rev)} · ${escapeHtml(meta.status)}</span>`;
  const make = lines.filter((l) => l.source === "ผลิตเอง").length;
  document.getElementById("bomEdStats").textContent =
    `${lines.length} รายการ · ผลิตเอง ${make} · ซื้อ ${lines.length - make}`;

  document.getElementById("bomNewBtn").hidden = !canEdit;
  document.getElementById("bomReleaseBtn").hidden = !editable;
  document.getElementById("bomRevBtn").hidden = !(canEdit && !isDraft);
  document.getElementById("bomAddLineBtn").hidden = !editable;
  document.getElementById("bomLockNote").hidden = !(canEdit && !isDraft);

  const tbody = document.querySelector("#bomEdTable tbody");
  tbody.innerHTML = "";
  const itemNos = typeof bxItemNumbers === "function" ? bxItemNumbers(bomModel) : {};
  lines.forEach((l, i) => {
    const tr = document.createElement("tr");
    const no = itemNos[l.id] ? `<span class="bx-itemno">${escapeHtml(itemNos[l.id])}</span>` : i + 1;
    if (editable) {
      const opts = (list, v) => list.map((o) => `<option${o === v ? " selected" : ""}>${escapeHtml(o)}</option>`).join("");
      tr.innerHTML = `
        <td>${no}</td>
        <td><input class="bom-inline bom-code" data-i="${i}" data-k="code" value="${escapeHtml(l.code || "")}" placeholder="รหัส" aria-label="รหัสชิ้นส่วน"></td>
        <td><input class="bom-inline bom-part" data-i="${i}" data-k="part" value="${escapeHtml(l.part || "")}" aria-label="ชื่อชิ้นส่วน"></td>
        <td><input class="bom-inline bom-qty" type="number" min="0" step="any" data-i="${i}" data-k="qty" value="${escapeHtml(String(l.qty ?? ""))}" aria-label="จำนวนต่อคัน"></td>
        <td><select class="bom-inline" data-i="${i}" data-k="unit" aria-label="หน่วย">${opts(BOM_UNITS.includes(l.unit) ? BOM_UNITS : [l.unit, ...BOM_UNITS], l.unit)}</select></td>
        <td><select class="bom-inline" data-i="${i}" data-k="source" aria-label="ผลิตเองหรือซื้อ">${opts(BOM_SOURCES, l.source || "ซื้อ")}</select></td>
        <td>${bomDrawingCell(l)}</td>
        <td><input class="bom-inline" data-i="${i}" data-k="note" value="${escapeHtml(l.note || "")}" aria-label="หมายเหตุ"></td>
        <td><button class="btn-chip" type="button" data-del="${i}" aria-label="ลบรายการ ${i + 1}">ลบ</button></td>
      `;
    } else {
      tr.innerHTML = `
        <td>${no}</td>
        <td class="mono-cell">${escapeHtml(l.code || "—")}</td>
        <td>${escapeHtml(l.part || "")}</td>
        <td>${escapeHtml(String(l.qty ?? ""))}</td>
        <td>${escapeHtml(l.unit || "")}</td>
        <td>${escapeHtml(l.source || "—")}</td>
        <td>${bomDrawingCell(l)}</td>
        <td>${escapeHtml(l.note || "")}</td>
        <td></td>
      `;
    }
    tbody.appendChild(tr);
  });
  document.getElementById("bomEmptyNote").hidden = lines.length > 0;
  wireDrawingChips(tbody);

  tbody.querySelectorAll(".bom-inline").forEach((el) => el.addEventListener("change", () => {
    const line = MASTER_BOM[bomModel][Number(el.dataset.i)];
    const prev = line[el.dataset.k];
    line[el.dataset.k] = el.dataset.k === "qty" ? Number(el.value) || 0 : el.value.trim();
    bomAudit("แก้ไขรายการ BOM", `Rev.${BOM_META[bomModel].rev} แถว ${Number(el.dataset.i) + 1} ${el.getAttribute("aria-label")}: "${prev ?? ""}" → "${line[el.dataset.k]}"`);
    saveBom();
    bomSyncOtherViews();
    const s = MASTER_BOM[bomModel];
    const mk = s.filter((x) => x.source === "ผลิตเอง").length;
    document.getElementById("bomEdStats").textContent = `${s.length} รายการ · ผลิตเอง ${mk} · ซื้อ ${s.length - mk}`;
  }));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.del);
    const name = MASTER_BOM[bomModel][i].part || `รายการที่ ${i + 1}`;
    if (!confirm(`ลบ "${name}" ออกจาก BOM ${bomModel}?`)) return;
    bomDeleteLine(bomModel, i);
    bomAudit("ลบรายการ BOM", `Rev.${BOM_META[bomModel].rev}: ${name}`);
    afterBomMutation();
  }));

  const hist = document.getElementById("bomHistory");
  hist.innerHTML = meta.history.slice().reverse().map((h) => `
    <li><strong>Rev.${escapeHtml(h.rev)}</strong>${h.date ? ` · ${formatThaiDate(h.date)}` : ""} — ${escapeHtml(h.note || "")}${h.ref ? ` <span class="pill pill-schedule">${escapeHtml(h.ref)}</span>` : ""}</li>
  `).join("");
}

/* ---- link to this BOM's own Google Sheet file (Sheets storage mode) ------------- */

let bomFilesCache = null; // { at, files: { model: url } }

async function bomShowSheetLink() {
  const link = document.getElementById("bomSheetLink");
  if (!link) return;
  link.hidden = true;
  if (typeof Y2JStore === "undefined" || !Y2JStore.isRemote()) return;
  try {
    if (!bomFilesCache || Date.now() - bomFilesCache.at > 60000 || !bomFilesCache.files[bomModel]) {
      const res = await Y2JStore.bomFiles();
      bomFilesCache = { at: Date.now(), files: res.files || {} };
    }
    const url = bomFilesCache.files[bomModel];
    if (url) { link.href = url; link.hidden = false; }
  } catch (e) { /* offline — no link */ }
}

/* ---- actions ------------------------------------------------------------ */

function openBomNewModal() {
  document.getElementById("bomNewModel").value = "";
  document.getElementById("bomNewCopy").innerHTML = `<option value="">เริ่มจาก BOM ว่าง</option>`
    + MACHINE_MODELS.map((m) => `<option value="${escapeHtml(m)}">คัดลอกจาก ${escapeHtml(m)} (Rev.${escapeHtml(BOM_META[m].rev)})</option>`).join("");
  document.getElementById("bomNewBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("bomNewModel").focus(), 0);
}

function saveBomNew() {
  const input = document.getElementById("bomNewModel");
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (MACHINE_MODELS.includes(name)) { showToast(`มีรุ่น ${name} อยู่แล้ว`, "warn"); input.focus(); return; }
  const from = document.getElementById("bomNewCopy").value;
  MACHINE_MODELS.push(name);
  MASTER_BOM[name] = from ? MASTER_BOM[from].map((l) => Object.assign({}, l)) : [];
  BOM_META[name] = {
    rev: "A",
    status: BOM_DRAFT,
    history: [{ rev: "A", date: new Date().toISOString().slice(0, 10), note: from ? `สร้างใหม่ โดยคัดลอกจาก ${from}` : "สร้าง BOM ใหม่", ref: "" }],
  };
  bomModel = name;
  bomAudit("สร้าง BOM", from ? `คัดลอกจาก ${from}` : "BOM ว่าง");
  document.getElementById("bomNewBackdrop").classList.remove("open");
  afterBomMutation();
  showToast(`สร้าง BOM ${name} (ร่าง) แล้ว — แก้ไขรายการแล้วกด "อนุมัติใช้งาน"`, "good");
}

function openBomRevModal() {
  const meta = BOM_META[bomModel];
  document.getElementById("bomRevLabel").textContent = `${bomModel}: Rev.${meta.rev} → Rev.${bomNextRev(meta.rev)}`;
  const refs = [];
  ["eo", "ecr"].forEach((t) => (DEPT_DOCS[t] || []).forEach((d) => refs.push(`<option value="${escapeHtml(d.no)}">${escapeHtml(d.no)} — ${escapeHtml(d.title || "")}</option>`)));
  document.getElementById("bomRevRef").innerHTML = `<option value="">— ไม่ระบุ —</option>` + refs.join("");
  document.getElementById("bomRevNote").value = "";
  document.getElementById("bomRevBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("bomRevNote").focus(), 0);
}

function saveBomRev() {
  const note = document.getElementById("bomRevNote").value.trim();
  if (!note) { document.getElementById("bomRevNote").focus(); return; }
  const meta = BOM_META[bomModel];
  meta.rev = bomNextRev(meta.rev);
  meta.status = BOM_DRAFT;
  meta.history.push({ rev: meta.rev, date: new Date().toISOString().slice(0, 10), note, ref: document.getElementById("bomRevRef").value });
  document.getElementById("bomRevBackdrop").classList.remove("open");
  bomAudit("ออก Revision ใหม่", `Rev.${meta.rev}: ${note}${meta.history[meta.history.length - 1].ref ? ` (${meta.history[meta.history.length - 1].ref})` : ""}`);
  afterBomMutation();
  showToast(`เปิด Rev.${meta.rev} ของ ${bomModel} เพื่อแก้ไขแล้ว`, "good");
}

function releaseBom() {
  const meta = BOM_META[bomModel];
  const lines = MASTER_BOM[bomModel] || [];
  if (!lines.length) { showToast("BOM ยังไม่มีรายการ — เพิ่มรายการก่อนอนุมัติ", "warn"); return; }
  if (lines.some((l) => !l.part || !(Number(l.qty) > 0))) { showToast("มีรายการที่ยังไม่มีชื่อชิ้นส่วนหรือจำนวน", "warn"); return; }
  if (!confirm(`อนุมัติใช้งาน BOM ${bomModel} Rev.${meta.rev}? หลังอนุมัติจะแก้ไขได้โดยออก Revision ใหม่เท่านั้น`)) return;
  meta.status = BOM_RELEASED;
  bomAudit("อนุมัติใช้งาน BOM", `Rev.${meta.rev}`);
  const last = meta.history[meta.history.length - 1];
  if (last && last.rev === meta.rev) last.date = new Date().toISOString().slice(0, 10);
  afterBomMutation();
  showToast(`BOM ${bomModel} Rev.${meta.rev} อนุมัติใช้งานแล้ว`, "good");
}

function exportBomCsv() {
  const meta = BOM_META[bomModel];
  const header = ["ลำดับ", "รหัสชิ้นส่วน", "ชื่อชิ้นส่วน", "จำนวน/คัน", "หน่วย", "ผลิตเอง/ซื้อ", "หมายเหตุ"];
  const rows = (MASTER_BOM[bomModel] || []).map((l, i) => [i + 1, l.code || "", l.part || "", l.qty ?? "", l.unit || "", l.source || "", l.note || ""]);
  const lines = [[`BOM ${bomModel}`, `Rev.${meta.rev}`, meta.status], header, ...rows].map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bom-${bomModel}-rev${meta.rev}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`ส่งออก BOM ${bomModel} แล้ว`, "good");
}

function initBomInteractions() {
  document.getElementById("bomEdModel").addEventListener("change", (e) => { bomModel = e.target.value; renderBomEditor(); });
  document.getElementById("bomNewBtn").addEventListener("click", openBomNewModal);
  document.getElementById("bomReleaseBtn").addEventListener("click", releaseBom);
  document.getElementById("bomRevBtn").addEventListener("click", openBomRevModal);
  document.getElementById("bomExportBtn").addEventListener("click", exportBomCsv);
  document.getElementById("bomSheetBtn").addEventListener("click", () => openBomSheet(bomModel));
  document.getElementById("bomAddLineBtn").addEventListener("click", () => {
    MASTER_BOM[bomModel].push({ id: bomNewLineId(), parent: "", group: BOM_GROUP_DEFAULT, station: "", code: "", part: "", qty: 1, unit: "ชิ้น", source: "ซื้อ", note: "" });
    bomAudit("เพิ่มรายการ BOM", `Rev.${BOM_META[bomModel].rev} แถว ${MASTER_BOM[bomModel].length}`);
    afterBomMutation();
    const parts = document.querySelectorAll("#bomEdTable .bom-part");
    if (parts.length) parts[parts.length - 1].focus();
  });
  document.getElementById("bomNewSaveBtn").addEventListener("click", saveBomNew);
  document.getElementById("bomRevSaveBtn").addEventListener("click", saveBomRev);
  ["bomNewBackdrop", "bomRevBackdrop"].forEach((id) => {
    const bd = document.getElementById(id);
    bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
    bd.querySelector("[data-close]").addEventListener("click", () => bd.classList.remove("open"));
  });
}
