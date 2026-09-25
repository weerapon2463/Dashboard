/* =========================================================================
   BOM ← Google Sheets: R&D edits a model's BOM file in Google Sheets (same columns
   the dashboard writes), then imports it here. The import shows what changed and
   becomes a Draft revision, so it still goes through Release like any other edit.
   The dashboard never overwrites a file that has edits not imported yet (Code.gs).
   ========================================================================= */

let bsState = null; // { model, res, lines, diff, errors }

function bsEsc(s) { return typeof escapeHtml === "function" ? escapeHtml(s) : String(s ?? ""); }

function bsAvailable() {
  return typeof Y2JStore !== "undefined" && Y2JStore.isRemote() && bomCanEdit(currentRole());
}

// path key per line: codes/names from the top so the same part under two parents stays distinct
function bsPathKeys(lines) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const memo = new Map();
  const key = (l, guard = 0) => {
    if (memo.has(l.id)) return memo.get(l.id);
    const own = (l.code || "").trim() || (l.part || "").trim();
    const p = l.parent && byId.get(l.parent);
    const k = (p && guard < 12 ? key(p, guard + 1) + " › " : "") + own;
    memo.set(l.id, k);
    return k;
  };
  const out = new Map();
  lines.forEach((l) => {
    let k = key(l);
    while (out.has(k)) k += " #";   // same part twice under one parent
    out.set(k, l);
  });
  return out;
}

function bsSource(s) {
  const t = String(s || "").trim();
  if (!t) return "ซื้อ";
  return /ผลิต|make|in.?house/i.test(t) ? "ผลิตเอง" : "ซื้อ";
}

// sheet rows → dashboard lines (ids kept for parts that were already there)
function bsBuildLines(model, rows) {
  const errors = [];
  const oldKeys = bsPathKeys(MASTER_BOM[model] || []);
  const lines = [];
  const usedIds = new Set();
  const stack = [];          // stack[depth-1] = line at that depth
  let group = "";
  const tmpKey = new Map();  // new line → path key
  const usedKeys = new Set();
  rows.forEach((r) => {
    if (r.group) { group = r.group; stack.length = 0; return; }
    let level = Math.max(1, Math.floor(Number(r.level) || 1));
    if (String(r.levelRaw || "").trim() && !(Number(r.levelRaw) >= 1)) errors.push(`แถว ${r.row}: ระดับ "${r.levelRaw}" ไม่ใช่ตัวเลข — ถือเป็นระดับ 1`);
    if (level > stack.length + 1) {
      errors.push(`แถว ${r.row}: ระดับ ${level} ข้ามจากระดับ ${stack.length} — จัดไว้ใต้รายการก่อนหน้า`);
      level = stack.length + 1;
    }
    if (!r.part) errors.push(`แถว ${r.row}: ไม่มีชื่อชิ้นส่วน`);
    if (!(Number(r.qty) > 0)) errors.push(`แถว ${r.row}: จำนวน "${r.qtyRaw ?? r.qty}" ต้องมากกว่า 0`);
    stack.length = level - 1;
    const parent = stack[level - 2] || null;
    const own = (r.code || "").trim() || (r.part || "").trim();
    let k = (parent ? tmpKey.get(parent) + " › " : "") + own;
    while (usedKeys.has(k)) k += " #";
    usedKeys.add(k);
    const old = oldKeys.get(k);
    const line = {
      id: old && !usedIds.has(old.id) ? old.id : bomNewLineId(),
      parent: parent ? parent.id : "",
      code: r.code || "", part: r.part || "", qty: Number(r.qty) || 0, unit: r.unit || "ชิ้น",
      source: bsSource(r.source), station: r.station || "", op: r.op || "", note: r.note || "",
    };
    if (!parent) line.group = group || bomGroupForCode(line.code);
    usedIds.add(line.id);
    tmpKey.set(line, k);
    lines.push(line);
    stack.push(line);
  });
  return { lines, errors, keys: tmpKey };
}

function bsDiff(model, built) {
  const before = bsPathKeys(MASTER_BOM[model] || []);
  const after = new Map([...built.keys.entries()].map(([l, k]) => [k, l]));
  const added = [], removed = [], changed = [];
  const F = [["part", "ชื่อ"], ["qty", "จำนวน"], ["unit", "หน่วย"], ["source", "ผลิต/ซื้อ"], ["station", "ใช้ที่"], ["op", "ขั้นตอน"], ["note", "หมายเหตุ"]];
  after.forEach((l, k) => {
    const o = before.get(k);
    if (!o) { added.push({ k, l }); return; }
    const d = F.filter(([f]) => String(o[f] ?? "").trim() !== String(l[f] ?? "").trim() && !(f === "qty" && Number(o.qty) === Number(l.qty)))
      .map(([f, label]) => `${label}: ${o[f] ?? ""} → ${l[f] ?? ""}`);
    if (d.length) changed.push({ k, l, d });
  });
  before.forEach((l, k) => { if (!after.has(k)) removed.push({ k, l }); });
  return { added, removed, changed };
}

function bsModal() {
  let bd = document.getElementById("bsBackdrop");
  if (bd) return bd;
  bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.id = "bsBackdrop";
  bd.innerHTML = `<div class="modal bs-modal" role="dialog" aria-modal="true" aria-labelledby="bsTitle">
    <h3 id="bsTitle">นำเข้า BOM จาก Google Sheet</h3>
    <div id="bsBody"></div>
    <div class="modal-actions">
      <button class="btn-secondary" type="button" data-close>ยกเลิก</button>
      <button class="btn-primary" type="button" id="bsApply" hidden>นำเข้าเป็น Draft</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  bd.querySelector("[data-close]").addEventListener("click", () => bd.classList.remove("open"));
  bd.querySelector("#bsApply").addEventListener("click", bsApply);
  return bd;
}

async function bomImportFromSheet(model) {
  if (!bsAvailable()) { showToast("ต้องเชื่อม Google Sheets และมีสิทธิ์แก้ไข BOM", "warn"); return; }
  const bd = bsModal();
  const body = bd.querySelector("#bsBody");
  const apply = bd.querySelector("#bsApply");
  apply.hidden = true;
  bd.querySelector("#bsTitle").textContent = `นำเข้า BOM ${model} จาก Google Sheet`;
  body.innerHTML = `<p class="card-sub">กำลังอ่านไฟล์ BOM-${bsEsc(model)} จาก Google Sheets…</p>`;
  bd.classList.add("open");
  let res;
  try { res = await Y2JStore.bomRead(model); } catch (e) {
    body.innerHTML = `<p class="card-sub">อ่านไม่สำเร็จ: ${bsEsc(e.message)}</p>`;
    return;
  }
  const built = bsBuildLines(model, res.rows || []);
  const diff = bsDiff(model, built);
  bsState = { model, res, lines: built.lines, diff, errors: built.errors };
  const meta = BOM_META[model];
  const blocking = built.errors.filter((e) => /ไม่มีชื่อ|ต้องมากกว่า 0/.test(e));
  const total = diff.added.length + diff.removed.length + diff.changed.length;
  const list = (arr, fmt) => arr.slice(0, 40).map(fmt).join("") + (arr.length > 40 ? `<li class="muted-note">… อีก ${arr.length - 40} รายการ</li>` : "");
  body.innerHTML = `
    <p class="card-sub">ไฟล์: <a href="${bsEsc(res.url)}" target="_blank" rel="noopener">BOM-${bsEsc(model)}</a> · แก้ไขล่าสุดใน Drive ${bsEsc(String(res.updated || "").replace("T", " ").slice(0, 16))} UTC · ${built.lines.length} รายการในไฟล์</p>
    ${res.edited ? "" : `<p class="muted-note">ไฟล์ยังเหมือนที่ Dashboard เขียนไว้ล่าสุด</p>`}
    <div class="bs-stats">
      <span class="pill pill-good">เพิ่ม ${diff.added.length}</span>
      <span class="pill pill-schedule">แก้ ${diff.changed.length}</span>
      <span class="pill pill-critical">ลบ ${diff.removed.length}</span>
    </div>
    ${built.errors.length ? `<div class="bs-err"><strong>${blocking.length ? "ต้องแก้ในไฟล์ก่อนนำเข้า" : "ข้อสังเกต"}</strong><ul>${built.errors.slice(0, 30).map((e) => `<li>${bsEsc(e)}</li>`).join("")}${built.errors.length > 30 ? `<li>… อีก ${built.errors.length - 30}</li>` : ""}</ul></div>` : ""}
    <div class="bs-lists">
      ${diff.added.length ? `<h4>เพิ่ม</h4><ul>${list(diff.added, (x) => `<li><code>${bsEsc(x.l.code || "—")}</code> ${bsEsc(x.l.part)} × ${bsEsc(x.l.qty)} ${bsEsc(x.l.unit)}</li>`)}</ul>` : ""}
      ${diff.changed.length ? `<h4>แก้</h4><ul>${list(diff.changed, (x) => `<li><code>${bsEsc(x.l.code || "—")}</code> ${bsEsc(x.l.part)} — ${bsEsc(x.d.join(" · "))}</li>`)}</ul>` : ""}
      ${diff.removed.length ? `<h4>ลบ</h4><ul>${list(diff.removed, (x) => `<li><code>${bsEsc(x.l.code || "—")}</code> ${bsEsc(x.l.part)}</li>`)}</ul>` : ""}
    </div>
    <p class="card-sub">${!total ? "ไม่มีความแตกต่างจาก BOM ปัจจุบัน" : meta.status === BOM_RELEASED
      ? `BOM ${bsEsc(model)} อนุมัติแล้ว (Rev.${bsEsc(meta.rev)}) — นำเข้าจะเปิด <strong>Rev.${bsEsc(bomNextRev(meta.rev))} (Draft)</strong> ให้ตรวจแล้วกดอนุมัติ`
      : `นำเข้าแทนรายการใน Rev.${bsEsc(meta.rev)} (Draft) — ตรวจแล้วกดอนุมัติเมื่อพร้อม`}</p>`;
  apply.textContent = total ? "นำเข้าเป็น Draft" : "รับทราบ — ให้ Dashboard เขียนไฟล์ใหม่";
  apply.hidden = blocking.length > 0 || (!total && !res.edited);
}

function bsApply() {
  if (!bsState) return;
  const { model, res, lines, diff } = bsState;
  const meta = BOM_META[model];
  bomModel = model;
  const summary = `เพิ่ม ${diff.added.length} · แก้ ${diff.changed.length} · ลบ ${diff.removed.length}`;
  if (!diff.added.length && !diff.changed.length && !diff.removed.length) {
    // edited in Sheets but nothing that changes the BOM (formatting, computed columns): let the file be rewritten
    meta.sheetStamp = res.stamp;
    saveBom();
    document.getElementById("bsBackdrop").classList.remove("open");
    showToast("ไม่มีรายการเปลี่ยน — Dashboard จะเขียนไฟล์ Google Sheet ใหม่ในการบันทึกครั้งนี้", "good");
    bsState = null;
    return;
  }
  if (meta.status === BOM_RELEASED) {
    bomSnapshot(model, false); // the outgoing revision as it was released
    meta.rev = bomNextRev(meta.rev);
    meta.status = BOM_DRAFT;
    meta.history.push({ rev: meta.rev, date: new Date().toISOString().slice(0, 10), note: `นำเข้าจาก Google Sheet (${summary})`, ref: "" });
    bomAudit("ออก Revision ใหม่", `Rev.${meta.rev}: นำเข้าจาก Google Sheet`);
  }
  MASTER_BOM[model].length = 0;
  lines.forEach((l) => MASTER_BOM[model].push(l));
  meta.sheetStamp = res.stamp; // lets the next save overwrite the file with this (now imported) content
  bomAudit("นำเข้า BOM จาก Google Sheet", `Rev.${meta.rev}: ${summary}`);
  afterBomMutation();
  document.getElementById("bsBackdrop").classList.remove("open");
  if (typeof bomFilesCache !== "undefined") bomFilesCache = null;
  showToast(`นำเข้า BOM ${model} แล้ว (${summary}) — Rev.${meta.rev} รออนุมัติ`, "good");
  bsState = null;
}
