/* ==========================================================================
   Document view — shows any department document (and a model's BOM) as a
   printable paper form: company header, document number, fields, status
   stamp, related documents, attachments, and signature boxes.
   Also: file attachments (IndexedDB, so photos/PDFs survive reloads on this
   device) and quick drawing registration (drop files → drawing records).
   ========================================================================== */

const FORM_SETTINGS_KEY = "y2j-form-settings-v1";
const FORM_DEFAULTS = {
  companyTh: "",
  companyEn: "Y2J Machinery Co., Ltd.",
  address: "",
  logo: "",          // data URL; empty = the "Y2J" mark
  sig1: "ผู้จัดทำ",
  sig2: "ผู้ตรวจสอบ",
  sig3: "ผู้อนุมัติ",
  footer: "",
  showFlow: true,
};
const HTML2PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
const DOC_NO_PATTERN = /\b[A-Z]{2,4}-\d{4}-\d{3,4}\b/g;
const ATTACH_MAX_BYTES = 15 * 1024 * 1024;

let docViewCurrent = null; // { kind: "doc", type, index } | { kind: "bom", model }
let docViewUrls = [];      // object URLs to revoke when the view closes
let dwgRegRows = [];       // pending rows in the drawing-registration modal
let docViewFileName = "document"; // base name for the generated PDF

function formSettings() {
  const c = typeof orgCurrent === "function" && typeof AUTH !== "undefined" && AUTH ? orgCurrent() : null;
  const companyDefaults = c ? { companyEn: c.name, logo: c.logo || "" } : {};
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(FORM_SETTINGS_KEY) || "{}") || {}; } catch (e) { /* defaults */ }
  const fs = Object.assign({}, FORM_DEFAULTS, companyDefaults, stored);
  if (!stored.logo && c && c.logo) fs.logo = c.logo; // an uploaded company logo always shows unless the form has its own
  return fs;
}

/* ---- file storage (IndexedDB) ------------------------------------------ */

const Y2JFiles = (() => {
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) { reject(new Error("no indexedDB")); return; }
        const req = indexedDB.open("y2j-files", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  // Never leave the UI waiting forever if storage is blocked (private mode, policy)
  function withTimeout(p) {
    return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("storage timeout")), 5000))]);
  }
  function tx(mode, fn) {
    return withTimeout(db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction("files", mode);
      const req = fn(t.objectStore("files"));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    })));
  }
  return {
    put: (id, blob) => tx("readwrite", (s) => s.put(blob, id)),
    get: (id) => tx("readonly", (s) => s.get(id)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
})();

function newFileId() {
  return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Store files and return their metadata for doc.files; skips files that are too big
async function storeFiles(fileList) {
  const saved = [];
  for (const f of fileList) {
    if (f.size > ATTACH_MAX_BYTES) { showToast(`${f.name} ใหญ่เกิน 15 MB — ข้าม`, "warn"); continue; }
    const id = newFileId();
    let stored = false;
    try { await Y2JFiles.put(id, f); stored = true; } catch (e) { /* no local storage — Drive may still work */ }
    try {
      if (typeof Y2JStore !== "undefined" && Y2JStore.isRemote()) {
        showToast(`กำลังอัปโหลด ${f.name} ไป Google Drive…`);
        await Y2JStore.uploadFile(id, f, f.name);
        stored = true;
      }
      if (!stored) throw new Error("no storage");
      saved.push({ id, name: f.name, type: f.type || "", size: f.size });
    } catch (e) {
      showToast("เบราว์เซอร์นี้เก็บไฟล์ไม่ได้ (เช่นโหมดส่วนตัว) — ใช้ช่องลิงก์ไฟล์แทน", "warn");
      break;
    }
  }
  return saved;
}

/* ---- lookups ------------------------------------------------------------ */

// Only documents the signed-in user may see are found (keeps confidential docs out of links)
function findDocByNo(no) {
  for (const t of Object.keys(DEPT_DOCS)) {
    const i = (DEPT_DOCS[t] || []).findIndex((d) => d.no === no);
    if (i >= 0) {
      const doc = DEPT_DOCS[t][i];
      if (typeof authCanSeeDoc === "function" && !authCanSeeDoc(t, doc)) return null;
      return { type: t, index: i, doc };
    }
  }
  return null;
}

function deptOfType(type) {
  return DEPT_WORKSPACES.find((w) => w.docTypes.includes(type));
}

// Documents this one mentions, plus documents that mention this one
function relatedDocs(doc) {
  const out = new Map();
  Object.values(doc).forEach((v) => {
    String(v ?? "").match(DOC_NO_PATTERN)?.forEach((no) => {
      if (no !== doc.no) { const hit = findDocByNo(no); if (hit) out.set(no, { ...hit, dir: "อ้างถึง" }); }
    });
  });
  Object.keys(DEPT_DOCS).forEach((t) => (DEPT_DOCS[t] || []).forEach((d, i) => {
    if (d === doc || out.has(d.no)) return;
    if (typeof authCanSeeDoc === "function" && !authCanSeeDoc(t, d)) return;
    if (Object.values(d).some((v) => String(v ?? "").includes(doc.no))) out.set(d.no, { type: t, index: i, doc: d, dir: "ถูกอ้างถึงโดย" });
  }));
  return [...out.values()];
}

function bomRefsToDoc(no) {
  const refs = [];
  Object.keys(BOM_META).forEach((m) => (BOM_META[m].history || []).forEach((h) => {
    if (h.ref === no) refs.push({ model: m, rev: h.rev });
  }));
  return refs;
}

// Latest non-cancelled drawing registered for a BOM part code
function drawingForPart(code) {
  if (!code) return null;
  const norm = (c) => (typeof pcPartNo === "function" ? pcPartNo(c) : c);
  const key = norm(code);
  const list = (DEPT_DOCS.dwg || []).filter((d) => d.partCode && norm(d.partCode) === key && d.status !== "ยกเลิก");
  if (!list.length) return null;
  return list.sort((a, b) => String(b.rev || "").localeCompare(String(a.rev || "")) || String(b.no).localeCompare(String(a.no)))[0];
}

function bomDrawingCell(line) {
  const d = drawingForPart(line.code);
  if (d) {
    const ok = d.status === "อนุมัติ (Released)";
    return `<button class="btn-chip dwg-chip${ok ? "" : " dwg-chip-pending"}" type="button" data-docno="${escapeHtml(d.no)}" title="${escapeHtml(d.status)}">${escapeHtml(d.no)} Rev.${escapeHtml(d.rev || "-")}</button>`;
  }
  if (line.code && deptCanCreate(currentRole(), "dwg")) {
    return `<button class="btn-chip" type="button" data-regpart="${escapeHtml(line.code)}">+ ลงทะเบียนแบบ</button>`;
  }
  return `<span class="muted-inline">—</span>`;
}

// Wire drawing chips inside any container (BOM Manager table, BOM sheet)
function wireDrawingChips(root) {
  root.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  root.querySelectorAll("[data-regpart]").forEach((b) => b.addEventListener("click", () => openDwgRegModal(b.dataset.regpart)));
}

/* ---- paper shell --------------------------------------------------------- */

function stampClass(tone) {
  return { good: "stamp-good", critical: "stamp-critical", warning: "stamp-warning", info: "stamp-info" }[tone] || "stamp-neutral";
}

function paperHeader(formTitle, formEn, deptName, no, dateIso, status, tone) {
  const fs = formSettings();
  return `
    <div class="paper-head">
      <div class="paper-brand">
        ${fs.logo ? `<img class="paper-logo-img" src="${escapeHtml(fs.logo)}" alt="โลโก้บริษัท">` : `<div class="paper-logo">Y2J</div>`}
        <div>
          ${fs.companyTh ? `<div class="paper-company">${escapeHtml(fs.companyTh)}</div>` : ""}
          <div class="${fs.companyTh ? "paper-company-en" : "paper-company"}">${escapeHtml(fs.companyEn)}</div>
          ${fs.address ? `<div class="paper-address">${escapeHtml(fs.address)}</div>` : ""}
          <div class="paper-dept">${escapeHtml(deptName || "")}</div>
        </div>
      </div>
      <div class="paper-docbox">
        <div class="paper-docno-label">เลขที่เอกสาร</div>
        <div class="paper-docno">${escapeHtml(no)}</div>
        <div class="paper-docdate">วันที่ ${dateIso ? formatThaiDate(dateIso) : "—"}</div>
      </div>
    </div>
    <div class="paper-titlebar">
      <div>
        <div class="paper-title">${escapeHtml(formTitle)}</div>
        ${formEn ? `<div class="paper-title-en">${escapeHtml(formEn)}</div>` : ""}
      </div>
      <div class="paper-stamp ${stampClass(tone)}">${escapeHtml(status)}</div>
    </div>`;
}

function paperSignatures(names) {
  const box = (label, name) => `
    <div class="sig-box">
      <div class="sig-line">${name ? escapeHtml(name) : "&nbsp;"}</div>
      <div class="sig-label">${label}</div>
      <div class="sig-date">วันที่ ____/____/______</div>
    </div>`;
  const fs = formSettings();
  return `<div class="paper-sigs">${box(escapeHtml(fs.sig1), names[0])}${box(escapeHtml(fs.sig2), names[1])}${box(escapeHtml(fs.sig3), names[2])}</div>`;
}

function paperFooter(formCode) {
  const now = new Date();
  const fs = formSettings();
  return `<div class="paper-foot"><span>${escapeHtml(formCode)}</span>${fs.footer ? `<span>${escapeHtml(fs.footer)}</span>` : ""}<span>ออกจาก Production Dashboard · ${formatThaiDate(now.toISOString().slice(0, 10))}</span></div>`;
}

function paperOutputActions() {
  const acts = [
    { label: "⬇ ดาวน์โหลด PDF", primary: true, onClick: () => exportPaperPdf("download") },
  ];
  if (navigator.canShare && navigator.share) acts.push({ label: "📤 ส่งต่อ PDF", onClick: () => exportPaperPdf("share") });
  acts.push({ label: "🖨 พิมพ์", onClick: printDocView });
  if (typeof authIsAdmin === "function" ? (authIsAdmin() || authLegacyRole() === "plant") : deptCanManage(currentRole())) acts.push({ label: "🎨 ออกแบบฟอร์ม", onClick: openFormDesigner });
  return acts;
}

function showPaper(html, actions) {
  closeDocView(true);
  document.getElementById("docPaper").innerHTML = html;
  const bar = document.getElementById("docViewActions");
  bar.innerHTML = "";
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.primary ? "btn-primary" : "btn-secondary";
    if (a.id) b.id = a.id;
    b.textContent = a.label;
    b.addEventListener("click", a.onClick);
    bar.appendChild(b);
  });
  document.getElementById("docViewBackdrop").classList.add("open");
  document.getElementById("docViewBackdrop").scrollTop = 0;
}

function closeDocView(keepState) {
  docViewUrls.forEach((u) => URL.revokeObjectURL(u));
  docViewUrls = [];
  document.getElementById("docViewBackdrop").classList.remove("open");
  if (!keepState) docViewCurrent = null;
}

function printDocView() {
  document.body.classList.add("printing-doc");
  window.print();
}

/* ---- department document view ----------------------------------------- */

function openDocViewByNo(no) {
  const hit = findDocByNo(no);
  if (hit) openDocView(hit.type, hit.index);
  else showToast(`ไม่พบเอกสาร ${no}`, "warn");
}

function openDocView(type, index) {
  const def = DOC_TYPES[type];
  const doc = DEPT_DOCS[type][index];
  if (!def || !doc) return;
  docViewCurrent = { kind: "doc", type, index };
  const ws = deptOfType(type);
  const tone = deptStatusTone(type, doc.status);
  const nameParts = def.name.split(" — ");
  const formTitle = nameParts.length > 1 ? nameParts[1] : def.name;
  const formEn = nameParts.length > 1 ? nameParts[0] : "";

  const shortFields = def.fields.filter((f) => f.type !== "textarea" && f.key !== "link");
  const longFields = def.fields.filter((f) => f.type === "textarea");
  const val = (f) => {
    const v = doc[f.key];
    if (v === undefined || v === null || v === "") return `<span class="paper-empty">—</span>`;
    if (f.type === "date") return formatThaiDate(v);
    if (f.type === "number") return Number(v).toLocaleString("th-TH");
    if (f.type === "ref" || f.type === "part") return escapeHtml(v);
    return escapeHtml(String(v));
  };

  const related = relatedDocs(doc);
  const bomRefs = bomRefsToDoc(doc.no);
  const relatedHtml = related.length || bomRefs.length
    ? `<div class="paper-section-title">เอกสารที่เกี่ยวข้อง</div>
       <div class="paper-related">
         ${related.map((r) => `<button type="button" class="rel-chip" data-docno="${escapeHtml(r.doc.no)}"><span class="rel-dir">${r.dir}</span> ${escapeHtml(r.doc.no)} — ${escapeHtml(String(r.doc.title || "").slice(0, 40))} <span class="rel-status">(${escapeHtml(r.doc.status)})</span></button>`).join("")}
         ${bomRefs.map((b) => `<button type="button" class="rel-chip" data-bommodel="${escapeHtml(b.model)}"><span class="rel-dir">ใช้ใน</span> BOM ${escapeHtml(b.model)} Rev.${escapeHtml(b.rev)}</button>`).join("")}
       </div>`
    : "";

  const linkHtml = doc.link
    ? `<div class="paper-row paper-row-wide"><div class="paper-label">ลิงก์ไฟล์เอกสาร</div><div class="paper-value"><a href="${escapeHtml(doc.link)}" target="_blank" rel="noopener">${escapeHtml(doc.link)}</a></div></div>`
    : "";

  // flow progress: where the document is in its workflow
  const flow = def.flow || [];
  const pos = flow.indexOf(doc.status);
  const flowHtml = flow.length > 1 && formSettings().showFlow
    ? `<div class="paper-flow">${flow.map((s, i) => `<span class="flow-step${i < pos ? " done" : ""}${i === pos ? " current" : ""}">${escapeHtml(s)}</span>`).join('<span class="flow-arrow">→</span>')}${pos < 0 ? `<span class="flow-step current off">${escapeHtml(doc.status)}</span>` : ""}</div>`
    : "";

  const hasAuth = typeof authCurrentUser === "function" && authCurrentUser();
  const confidential = doc.visibility && doc.visibility.mode && doc.visibility.mode !== "all";
  const history = hasAuth ? auditFor(doc.no) : [];
  const historyHtml = hasAuth ? `
    <div class="paper-section-title no-print-pdf">ข้อมูลเอกสารและประวัติการแก้ไข</div>
    <div class="paper-textbox paper-history">
      <div>สร้างโดย <strong>${escapeHtml(authUserName(doc.createdBy))}</strong>${doc.createdAt ? ` เมื่อ ${fmtDateTime(doc.createdAt)}` : ""}${doc.updatedAt && doc.updatedAt !== doc.createdAt ? ` · แก้ไขล่าสุดโดย <strong>${escapeHtml(authUserName(doc.updatedBy))}</strong> เมื่อ ${fmtDateTime(doc.updatedAt)}` : ""}</div>
      <div>การมองเห็น: ${escapeHtml(visLabel(doc.visibility))}</div>
      ${history.length ? `<table class="paper-table paper-table-compact"><thead><tr><th>วันเวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>สิ่งที่เปลี่ยน</th></tr></thead><tbody>${history.slice(0, 30).map((h) => `<tr><td>${fmtDateTime(h.ts)}</td><td>${escapeHtml(h.userName)}</td><td>${escapeHtml(h.action)}</td><td>${escapeHtml(h.detail)}</td></tr>`).join("")}</tbody></table>` : `<div class="paper-empty">ยังไม่มีการแก้ไขในระบบ (ข้อมูลตั้งต้น)</div>`}
    </div>` : "";

  const html = `
    ${confidential ? `<div class="paper-conf">${escapeHtml(visLabel(doc.visibility))}</div>` : ""}
    ${paperHeader(formTitle, formEn, ws ? ws.name : "", doc.no, doc.date || doc.due || "", doc.status, tone)}
    ${flowHtml}
    <div class="paper-grid">
      ${shortFields.map((f) => `<div class="paper-row"><div class="paper-label">${escapeHtml(f.label)}</div><div class="paper-value">${val(f)}</div></div>`).join("")}
      ${linkHtml}
    </div>
    ${longFields.map((f) => `<div class="paper-section-title">${escapeHtml(f.label)}</div><div class="paper-textbox">${doc[f.key] ? escapeHtml(doc[f.key]).replace(/\n/g, "<br>") : '<span class="paper-empty">—</span>'}</div>`).join("")}
    ${Array.isArray(doc.items) ? `<div class="paper-section-title">รายการเบิก${doc.receiver || doc.requestedBy ? ` — สั่งเบิกโดย ${escapeHtml(doc.requestedBy || "")} · ผู้รับของ ${escapeHtml(doc.owner || "")}` : ""}</div>
      <table class="paper-table"><thead><tr><th>ข้อ BOM</th><th>รหัส</th><th>รายการ</th><th class="num">ขอ</th><th class="num">จ่าย</th><th class="num">คืน</th><th>หน่วย</th></tr></thead>
      <tbody>${doc.items.map((it) => `<tr><td>${escapeHtml(it.item || "")}</td><td class="mono-cell">${escapeHtml(it.code || "")}</td><td>${escapeHtml(it.part || "")}</td><td class="num">${escapeHtml(String(it.req ?? ""))}</td><td class="num">${escapeHtml(String(it.issued ?? 0))}</td><td class="num">${escapeHtml(String(it.ret ?? 0))}</td><td>${escapeHtml(it.unit || "")}</td></tr>`).join("")}</tbody></table>` : ""}
    ${type === "dwg" ? `<div class="paper-section-title">แบบ (Drawing)</div><div id="dwgPreview" class="dwg-preview"><span class="paper-empty">${(doc.files || []).length ? "กำลังโหลดไฟล์แบบ…" : "ยังไม่ได้แนบไฟล์แบบ — กด \"แนบไฟล์\" ด้านล่าง"}</span></div>` : ""}
    ${relatedHtml}
    <div class="paper-section-title">ไฟล์แนบ</div>
    <div id="docAttachments" class="paper-attach"><span class="paper-empty">${(doc.files || []).length ? "กำลังโหลด…" : "ไม่มีไฟล์แนบ"}</span></div>
    ${paperSignatures([doc.owner || doc.requester || "", "", ""])}
    ${paperFooter(`FM-${def.prefix}-01 Rev.0`)}
    ${historyHtml}
  `;

  const role = currentRole();
  const actions = paperOutputActions();
  if (deptCanCreate(role, type)) actions.push({ label: "📎 แนบไฟล์ / ถ่ายรูป", onClick: () => document.getElementById("docAttachInput").click() });
  if (deptCanManage(role, type)) actions.push({ label: "แก้ไขข้อมูล", onClick: () => { closeDocView(); openDeptModal(type, index); } });
  actions.push({ label: "ปิด", onClick: () => closeDocView() });
  docViewFileName = doc.no;
  showPaper(html, actions);

  const paper = document.getElementById("docPaper");
  paper.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => openDocViewByNo(b.dataset.docno)));
  paper.querySelectorAll("[data-bommodel]").forEach((b) => b.addEventListener("click", () => openBomSheet(b.dataset.bommodel)));
  renderDocAttachments(type, doc);
}

async function renderDocAttachments(type, doc) {
  const box = document.getElementById("docAttachments");
  const preview = document.getElementById("dwgPreview");
  const files = doc.files || [];
  if (!box || !files.length) return;
  const canDelete = deptCanManage(currentRole(), type);
  const items = [];
  let previewDone = false;
  for (const f of files) {
    let url = null;
    try {
      let blob = null;
      try { blob = await Y2JFiles.get(f.id); } catch (e) { /* not on this device */ }
      if (!blob && typeof Y2JStore !== "undefined" && Y2JStore.isRemote()) {
        blob = await Y2JStore.fetchFile(f.id);
        if (blob) { try { await Y2JFiles.put(f.id, blob); } catch (e) { /* cache is optional */ } }
      }
      if (blob) { url = URL.createObjectURL(blob); docViewUrls.push(url); }
    } catch (e) { /* file unavailable on this device */ }
    const isImg = (f.type || "").startsWith("image/");
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (preview && !previewDone && url && (isImg || isPdf)) {
      preview.innerHTML = isImg
        ? `<img src="${url}" alt="${escapeHtml(f.name)}">`
        : `<iframe src="${url}" title="${escapeHtml(f.name)}"></iframe>`;
      previewDone = true;
    }
    items.push(`
      <div class="attach-item">
        ${isImg && url ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${escapeHtml(f.name)}"></a>` : `<div class="attach-icon">${isPdf ? "PDF" : "ไฟล์"}</div>`}
        <div class="attach-meta">
          ${url ? `<a href="${url}" target="_blank" rel="noopener" download="${escapeHtml(f.name)}">${escapeHtml(f.name)}</a>` : `${escapeHtml(f.name)} <span class="paper-empty">(ไฟล์อยู่ในเครื่องอื่น)</span>`}
          <span>${fmtBytes(f.size || 0)}</span>
          ${canDelete ? `<button type="button" class="btn-chip attach-del" data-fid="${escapeHtml(f.id)}">ลบ</button>` : ""}
        </div>
      </div>`);
  }
  if (preview && !previewDone) preview.innerHTML = `<span class="paper-empty">ไฟล์แบบนี้แสดงตัวอย่างไม่ได้ — ดาวน์โหลดจากรายการไฟล์แนบ</span>`;
  box.innerHTML = items.join("");
  box.querySelectorAll("[data-fid]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("ลบไฟล์แนบนี้?")) return;
    const removed = (doc.files || []).find((f) => f.id === b.dataset.fid);
    doc.files = (doc.files || []).filter((f) => f.id !== b.dataset.fid);
    try { await Y2JFiles.del(b.dataset.fid); } catch (e) { /* ignore */ }
    if (typeof auditLog === "function") auditLog("ลบไฟล์แนบ", doc.no, removed ? removed.name : "");
    saveDeptDocs();
    reopenCurrentDoc();
  }));
}

function reopenCurrentDoc() {
  if (docViewCurrent && docViewCurrent.kind === "doc") openDocView(docViewCurrent.type, docViewCurrent.index);
  else if (docViewCurrent && docViewCurrent.kind === "p2p" && typeof openP2PCase === "function") openP2PCase(docViewCurrent.id);
  else if (docViewCurrent && docViewCurrent.kind === "bom") {
    const sel = document.getElementById("bomSheetQty");
    openBomSheet(docViewCurrent.model, sel ? sel.value : undefined);
  }
}

/* ---- PDF export & sharing ----------------------------------------------- */

function loadHtml2pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = HTML2PDF_URL;
    sc.onload = () => (window.html2pdf ? resolve(window.html2pdf) : reject(new Error("html2pdf missing")));
    sc.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(sc);
  });
}

async function exportPaperPdf(mode) {
  const paper = document.getElementById("docPaper");
  const name = `${docViewFileName}.pdf`;
  showToast("กำลังสร้างไฟล์ PDF…");
  let lib;
  try {
    lib = await loadHtml2pdf();
  } catch (e) {
    showToast("โหลดตัวสร้าง PDF ไม่ได้ (ต้องต่ออินเทอร์เน็ต) — ใช้ปุ่มพิมพ์แล้วเลือก \"บันทึกเป็น PDF\" แทน", "warn");
    return;
  }
  paper.classList.add("pdf-capture");
  const opt = {
    margin: [8, 8, 10, 8],
    filename: name,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".paper-row", "tr", ".sig-box", ".attach-item", ".paper-textbox", ".paper-titlebar"] },
  };
  try {
    if (mode === "share") {
      const blob = await lib().set(opt).from(paper).outputPdf("blob");
      const file = new File([blob], name, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: docViewFileName });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        showToast("อุปกรณ์นี้แชร์ไฟล์ตรงไม่ได้ — ดาวน์โหลด PDF ให้แทนแล้ว", "good");
      }
    } else {
      await lib().set(opt).from(paper).save();
      showToast(`ดาวน์โหลด ${name} แล้ว`, "good");
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // user closed the share sheet
    showToast("สร้าง PDF ไม่สำเร็จ — ลองใช้ปุ่มพิมพ์แล้วเลือกบันทึกเป็น PDF", "warn");
  } finally {
    paper.classList.remove("pdf-capture");
  }
}

/* ---- form designer (letterhead & signatures) ----------------------------- */

let formDesignerLogo = "";

function openFormDesigner() {
  const fs = formSettings();
  ["companyTh", "companyEn", "address", "sig1", "sig2", "sig3", "footer"].forEach((k) => {
    document.getElementById(`fs_${k}`).value = fs[k] || "";
  });
  document.getElementById("fs_showFlow").checked = !!fs.showFlow;
  formDesignerLogo = fs.logo || "";
  renderFormLogoPreview();
  document.getElementById("formSetBackdrop").classList.add("open");
}

function renderFormLogoPreview() {
  const box = document.getElementById("fsLogoPreview");
  box.innerHTML = formDesignerLogo ? `<img src="${escapeHtml(formDesignerLogo)}" alt="โลโก้">` : `<div class="paper-logo">Y2J</div>`;
  document.getElementById("fsLogoRemove").hidden = !formDesignerLogo;
}

// Shrink the logo so it fits comfortably in localStorage
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 240;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

function saveFormDesigner() {
  const next = { logo: formDesignerLogo, showFlow: document.getElementById("fs_showFlow").checked };
  ["companyTh", "companyEn", "address", "sig1", "sig2", "sig3", "footer"].forEach((k) => {
    next[k] = document.getElementById(`fs_${k}`).value.trim();
  });
  if (!next.companyEn && !next.companyTh) next.companyEn = FORM_DEFAULTS.companyEn;
  ["sig1", "sig2", "sig3"].forEach((k) => { if (!next[k]) next[k] = FORM_DEFAULTS[k]; });
  try {
    localStorage.setItem(FORM_SETTINGS_KEY, JSON.stringify(next));
    if (typeof auditLog === "function") auditLog("ออกแบบฟอร์มเอกสาร", "หัวกระดาษ", [next.companyTh, next.companyEn].filter(Boolean).join(" / "));
  } catch (e) {
    showToast("บันทึกไม่สำเร็จ — โลโก้อาจใหญ่เกินไป", "warn");
    return;
  }
  document.getElementById("formSetBackdrop").classList.remove("open");
  reopenCurrentDoc();
  showToast("บันทึกรูปแบบเอกสารแล้ว — ใช้กับเอกสารทุกฉบับ", "good");
}

function initFormDesigner() {
  const bd = document.getElementById("formSetBackdrop");
  bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  document.getElementById("fsCancelBtn").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("fsSaveBtn").addEventListener("click", saveFormDesigner);
  document.getElementById("fsResetBtn").addEventListener("click", () => {
    if (!confirm("คืนค่ารูปแบบเอกสารเริ่มต้น?")) return;
    try { localStorage.removeItem(FORM_SETTINGS_KEY); } catch (e) { /* ignore */ }
    bd.classList.remove("open");
    reopenCurrentDoc();
  });
  const logoInput = document.getElementById("fsLogoFile");
  logoInput.addEventListener("change", async () => {
    const f = logoInput.files[0];
    logoInput.value = "";
    if (!f) return;
    try { formDesignerLogo = await readLogo(f); renderFormLogoPreview(); } catch (e) { showToast("อ่านรูปโลโก้ไม่ได้", "warn"); }
  });
  document.getElementById("fsLogoRemove").addEventListener("click", () => { formDesignerLogo = ""; renderFormLogoPreview(); });
}

async function attachToCurrentDoc(fileList) {
  if (!docViewCurrent || docViewCurrent.kind !== "doc" || !fileList.length) return;
  const doc = DEPT_DOCS[docViewCurrent.type][docViewCurrent.index];
  const saved = await storeFiles(fileList);
  if (!saved.length) return;
  doc.files = (doc.files || []).concat(saved);
  if (typeof stampRecord === "function") { stampRecord(doc, false); auditLog("แนบไฟล์", doc.no, saved.map((f) => f.name).join(", ")); }
  saveDeptDocs();
  reopenCurrentDoc();
  renderDept();
  showToast(`แนบไฟล์ ${saved.length} ไฟล์กับ ${doc.no} แล้ว`, "good");
}

/* ---- BOM sheet ----------------------------------------------------------- */

function openBomSheet(model, qtyKey) {
  const meta = BOM_META[model];
  const lines = MASTER_BOM[model] || [];
  if (!meta) return;
  docViewCurrent = { kind: "bom", model };
  const openWos = WORK_ORDERS.filter((w) => w.model === model && w.status !== "เสร็จสมบูรณ์");
  const totalOpen = openWos.reduce((s, w) => s + Number(w.qty || 0), 0);
  const options = [{ key: "1", label: "1 คัน", qty: 1 }]
    .concat(openWos.map((w) => ({ key: w.wo, label: `${w.wo} — ${w.qty} คัน (${w.status})`, qty: Number(w.qty) || 1 })))
    .concat(openWos.length > 1 ? [{ key: "all", label: `รวมทุกใบสั่งผลิตที่ยังไม่เสร็จ — ${totalOpen} คัน`, qty: totalOpen }] : []);
  const pick = options.find((o) => o.key === qtyKey) || options[0];
  const n = pick.qty;
  const isDraft = meta.status === BOM_DRAFT;
  const released = meta.history.slice().reverse().find((h) => h.rev === meta.rev);
  const make = lines.filter((l) => l.source === "ผลิตเอง").length;

  const html = `
    ${paperHeader("ใบรายการวัสดุ (Bill of Materials)", `BOM — ${model}`, "R&D / วิศวกรรม", `BOM-${model}`, released ? released.date : "", `Rev.${meta.rev} · ${meta.status}`, isDraft ? "warning" : "good")}
    <div class="paper-grid">
      <div class="paper-row"><div class="paper-label">รุ่นเครื่องจักร</div><div class="paper-value">${escapeHtml(model)}</div></div>
      <div class="paper-row"><div class="paper-label">Revision</div><div class="paper-value">${escapeHtml(meta.rev)}</div></div>
      <div class="paper-row"><div class="paper-label">จำนวนรายการ</div><div class="paper-value">${lines.length} รายการ (ผลิตเอง ${make} · ซื้อ ${lines.length - make})</div></div>
      <div class="paper-row"><div class="paper-label">คำนวณสำหรับ</div><div class="paper-value">
        <select id="bomSheetQty" class="paper-select" aria-label="คำนวณจำนวนสำหรับ">${options.map((o) => `<option value="${escapeHtml(o.key)}"${o.key === pick.key ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
        <span class="print-only">${escapeHtml(pick.label)}</span>
      </div></div>
    </div>
    <table class="paper-table">
      <thead><tr><th>#</th><th>รหัสชิ้นส่วน</th><th>ชื่อชิ้นส่วน</th><th class="num">ต่อคัน</th><th class="num">รวม ×${n}</th><th>หน่วย</th><th>ผลิตเอง/ซื้อ</th><th>แบบ (Drawing)</th><th>หมายเหตุ</th></tr></thead>
      <tbody>
        ${lines.map((l, i) => `<tr>
          <td>${i + 1}</td>
          <td class="mono-cell">${escapeHtml(l.code || "—")}</td>
          <td>${escapeHtml(l.part || "")}</td>
          <td class="num">${escapeHtml(String(l.qty ?? ""))}</td>
          <td class="num"><strong>${(Number(l.qty) || 0) * n}</strong></td>
          <td>${escapeHtml(l.unit || "")}</td>
          <td>${escapeHtml(l.source || "—")}</td>
          <td>${bomDrawingCell(l)}</td>
          <td>${escapeHtml(l.note || "")}</td>
        </tr>`).join("") || `<tr><td colspan="9" class="paper-empty">ยังไม่มีรายการ</td></tr>`}
      </tbody>
    </table>
    ${openWos.length ? `<div class="paper-section-title">ใบสั่งผลิตที่ใช้ BOM นี้ (ยังไม่เสร็จ)</div><div class="paper-textbox">${openWos.map((w) => `${escapeHtml(w.wo)} · ${escapeHtml(w.department)} · ${w.qty} คัน · ส่งมอบ ${escapeHtml(w.dueDate)} · ${escapeHtml(w.status)}`).join("<br>")}</div>` : ""}
    <div class="paper-section-title">ประวัติการแก้ไข (Revision History)</div>
    <table class="paper-table paper-table-compact">
      <thead><tr><th>Rev.</th><th>วันที่</th><th>รายละเอียด</th><th>อ้างอิง</th></tr></thead>
      <tbody>${meta.history.slice().reverse().map((h) => `<tr><td>${escapeHtml(h.rev)}</td><td>${h.date ? formatThaiDate(h.date) : "—"}</td><td>${escapeHtml(h.note || "")}</td><td>${h.ref ? `<button type="button" class="rel-chip" data-docno="${escapeHtml(h.ref)}">${escapeHtml(h.ref)}</button>` : "—"}</td></tr>`).join("")}</tbody>
    </table>
    ${paperSignatures(["", "", ""])}
    ${paperFooter("FM-BOM-01 Rev.0")}
  `;
  docViewFileName = `BOM-${model}-Rev${meta.rev}${n > 1 ? `-x${n}` : ""}`;
  showPaper(html, paperOutputActions().concat([
    { label: "ส่งออก CSV", onClick: () => { bomModel = model; exportBomCsv(); } },
    { label: "ปิด", onClick: () => closeDocView() },
  ]));
  const paper = document.getElementById("docPaper");
  wireDrawingChips(paper);
  paper.querySelector("#bomSheetQty").addEventListener("change", (e) => openBomSheet(model, e.target.value));
}

/* ---- drawing registration ----------------------------------------------- */

function bomPartOptions() {
  const seen = new Map();
  Object.keys(MASTER_BOM).forEach((m) => (MASTER_BOM[m] || []).forEach((l) => {
    if (l.code && !seen.has(l.code)) seen.set(l.code, { code: l.code, part: l.part, model: m });
  }));
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function newDwgRow(file, partCode) {
  const part = bomPartOptions().find((p) => p.code === partCode);
  const base = file ? file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() : "";
  return { file, title: part ? part.part : base, partCode: partCode || "", model: part ? part.model : "", rev: "A" };
}

function openDwgRegModal(partCode) {
  if (!deptCanCreate(currentRole(), "dwg")) return;
  dwgRegRows = [newDwgRow(null, partCode)];
  renderDwgRegRows();
  document.getElementById("dwgRegBackdrop").classList.add("open");
}

function addDwgFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  // the first file fills an empty starter row instead of adding a new one
  if (dwgRegRows.length === 1 && !dwgRegRows[0].file) {
    const first = dwgRegRows[0];
    first.file = files.shift();
    if (!first.title) first.title = newDwgRow(first.file).title;
  }
  files.forEach((f) => dwgRegRows.push(newDwgRow(f)));
  renderDwgRegRows();
}

function renderDwgRegRows() {
  const parts = bomPartOptions();
  const wrap = document.getElementById("dwgRegRows");
  wrap.innerHTML = dwgRegRows.map((r, i) => `
    <div class="dwg-row">
      <div class="dwg-row-file">${r.file ? `📄 ${escapeHtml(r.file.name)} <span class="muted-inline">${fmtBytes(r.file.size)}</span>` : `<span class="muted-inline">ไม่มีไฟล์ (บันทึกเฉพาะข้อมูลแบบได้)</span>`}
        ${dwgRegRows.length > 1 ? `<button type="button" class="btn-chip" data-rm="${i}">นำออก</button>` : ""}</div>
      <div class="dwg-row-fields">
        <div class="form-field"><label for="dwgTitle${i}">ชื่อชิ้นส่วน / แบบ *</label><input id="dwgTitle${i}" data-i="${i}" data-k="title" value="${escapeHtml(r.title)}" placeholder="เช่น ใบมีดตัดอ้อย SK5 ชุบแข็ง"></div>
        <div class="form-field"><label for="dwgPart${i}">ชิ้นส่วนใน BOM</label><select id="dwgPart${i}" data-i="${i}" data-k="partCode"><option value="">— ไม่ผูกกับ BOM —</option>${parts.map((p) => `<option value="${escapeHtml(p.code)}"${p.code === r.partCode ? " selected" : ""}>${escapeHtml(p.code)} — ${escapeHtml(p.part)}</option>`).join("")}</select></div>
        <div class="form-field"><label for="dwgModel${i}">รุ่น</label><select id="dwgModel${i}" data-i="${i}" data-k="model"><option value="">ใช้ได้หลายรุ่น</option>${MACHINE_MODELS.map((m) => `<option${m === r.model ? " selected" : ""}>${escapeHtml(m)}</option>`).join("")}</select></div>
        <div class="form-field dwg-rev"><label for="dwgRev${i}">Rev.</label><input id="dwgRev${i}" data-i="${i}" data-k="rev" value="${escapeHtml(r.rev)}"></div>
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-k]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    const row = dwgRegRows[Number(el.dataset.i)];
    row[el.dataset.k] = el.value;
    if (el.dataset.k === "partCode" && el.value) {
      const p = parts.find((x) => x.code === el.value);
      if (p) {
        if (!row.title || row.title === (row.file ? newDwgRow(row.file).title : "")) row.title = p.part;
        if (!row.model) row.model = p.model;
        renderDwgRegRows();
      }
    }
  }));
  wrap.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    dwgRegRows.splice(Number(b.dataset.rm), 1);
    renderDwgRegRows();
  }));
  document.getElementById("dwgRegSaveBtn").textContent = `ลงทะเบียน ${dwgRegRows.length} แบบ`;
}

async function saveDwgReg() {
  const missing = dwgRegRows.findIndex((r) => !r.title.trim());
  if (missing >= 0) { document.getElementById(`dwgTitle${missing}`).focus(); return; }
  const btn = document.getElementById("dwgRegSaveBtn");
  btn.disabled = true;
  const owner = typeof authCurrentUser === "function" && authCurrentUser() ? authCurrentUser().name : (typeof getMyName === "function" ? getMyName() : "");
  const created = [];
  for (const r of dwgRegRows) {
    const files = r.file ? await storeFiles([r.file]) : [];
    const doc = {
      no: deptNextNumber("dwg"),
      status: "รอตรวจแบบ",
      title: r.title.trim(),
      partCode: r.partCode,
      model: r.model,
      rev: (r.rev || "A").trim(),
      owner: owner || "",
      date: new Date().toISOString().slice(0, 10),
      link: "",
      files,
    };
    if (typeof stampRecord === "function") { stampRecord(doc, true); auditLog("ลงทะเบียนแบบ", doc.no, `${doc.title}${doc.partCode ? ` (${doc.partCode})` : ""}${files.length ? ` · ไฟล์ ${files[0].name}` : ""}`); }
    DEPT_DOCS.dwg = DEPT_DOCS.dwg || [];
    DEPT_DOCS.dwg.push(doc);
    created.push(doc.no);
  }
  btn.disabled = false;
  saveDeptDocs();
  document.getElementById("dwgRegBackdrop").classList.remove("open");
  deptCurrent = "rnd";
  deptDocType = "dwg";
  renderDept();
  if (typeof renderBomEditor === "function") renderBomEditor();
  showToast(`ลงทะเบียนแบบแล้ว: ${created.join(", ")}`, "good");
}

/* ---- wiring --------------------------------------------------------------- */

function initDocView() {
  initFormDesigner();
  const backdrop = document.getElementById("docViewBackdrop");
  backdrop.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDocView(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop.classList.contains("open")) closeDocView();
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-doc"));

  const attachInput = document.getElementById("docAttachInput");
  attachInput.addEventListener("change", () => {
    attachToCurrentDoc([...attachInput.files]);
    attachInput.value = "";
  });

  const reg = document.getElementById("dwgRegBackdrop");
  reg.addEventListener("click", (e) => { if (e.target === e.currentTarget) reg.classList.remove("open"); });
  document.getElementById("dwgRegCancelBtn").addEventListener("click", () => reg.classList.remove("open"));
  document.getElementById("dwgRegSaveBtn").addEventListener("click", saveDwgReg);
  const fileInput = document.getElementById("dwgRegFiles");
  fileInput.addEventListener("change", () => { addDwgFiles(fileInput.files); fileInput.value = ""; });
  const drop = document.getElementById("dwgDrop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addDwgFiles(e.dataTransfer.files));
}
