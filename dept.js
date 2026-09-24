/* ==========================================================================
   Department workspaces — tabs per department, a card per document type the
   department should keep, and a generic register (add / edit / advance
   status / search / CSV) driven by DOC_TYPES in dept-data.js.
   ========================================================================== */

const DEPT_STORAGE_KEY = "y2j-dept-docs-v1";
const DEPT_VIEW_STORAGE_KEY = "y2j-dept-view-v1";

let DEPT_DOCS = {};
let deptCurrent = "rnd";
let deptDocType = "ecr";
let deptEditing = null; // { type, index } or { type, index: null } when adding

// With a signed-in user, permissions come from the user's per-document-type
// rights (auth.js / Admin page). Without one (older cached page), fall back to
// the role rules: anyone but executives can file; heads and plant manage.
function deptCanCreate(role, type) {
  if (typeof authCurrentUser === "function" && authCurrentUser()) return authCan(type || deptDocType, "create");
  return role !== "group";
}
function deptCanManage(role, type) {
  if (typeof authCurrentUser === "function" && authCurrentUser()) return authCan(type || deptDocType, "manage");
  return role === "depthead" || role === "plant";
}
function deptVisibleDocs(type) {
  const list = DEPT_DOCS[type] || [];
  return typeof authCanSeeDoc === "function" ? list.filter((d) => authCanSeeDoc(type, d)) : list;
}
function deptTypeVisible(type) {
  if (typeof authCurrentUser !== "function" || !authCurrentUser()) return true;
  return authCan(type, "view") || (DEPT_DOCS[type] || []).some((d) => d.createdBy === authCurrentUser().id);
}

/* ---- persistence ------------------------------------------------------ */

function deptSampleDocs() {
  const out = {};
  Object.keys(DOC_TYPES).forEach((t) => {
    if (DOC_TYPES[t].special) return;
    out[t] = (DOC_SAMPLES[t] || []).map((d) => Object.assign({}, d));
  });
  return out;
}

function initDeptData() {
  DEPT_DOCS = deptSampleDocs();
  let hadStored = false;
  try {
    const raw = localStorage.getItem(DEPT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach((t) => { if (Array.isArray(parsed[t]) && DOC_TYPES[t]) DEPT_DOCS[t] = parsed[t]; });
        hadStored = true;
      }
    }
    const view = JSON.parse(localStorage.getItem(DEPT_VIEW_STORAGE_KEY) || "null");
    if (view && DEPT_WORKSPACES.some((w) => w.id === view.dept)) {
      deptCurrent = view.dept;
      const ws = DEPT_WORKSPACES.find((w) => w.id === view.dept);
      deptDocType = ws.docTypes.includes(view.doc) ? view.doc : ws.docTypes[0];
    }
  } catch (e) { /* keep samples */ }
  return hadStored;
}

function saveDeptDocs() {
  const el = document.getElementById("deptSaveStatus");
  try {
    localStorage.setItem(DEPT_STORAGE_KEY, JSON.stringify(DEPT_DOCS));
    if (!el) return;
    const now = new Date();
    el.classList.remove("stale");
    el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")})`;
  } catch (e) {
    if (!el) return;
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
  }
}

function markDeptInitialStatus(hasStored) {
  const el = document.getElementById("deptSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดเอกสารที่บันทึกไว้ในเบราว์เซอร์นี้ — เพิ่ม/แก้ไขจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — เพิ่ม/แก้ไขจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

function saveDeptView() {
  try { localStorage.setItem(DEPT_VIEW_STORAGE_KEY, JSON.stringify({ dept: deptCurrent, doc: deptDocType })); } catch (e) { /* ignore */ }
}

/* ---- helpers ------------------------------------------------------------ */

function deptStatusTone(type, status) {
  const hit = (DOC_TYPES[type].statuses || []).find((s) => s[0] === status);
  return hit ? hit[1] : "neutral";
}

function deptIsOpen(type, doc) {
  return !(DOC_TYPES[type].closed || []).includes(doc.status);
}

function deptNextStatus(type, status) {
  const flow = DOC_TYPES[type].flow || [];
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

function deptNextNumber(type) {
  const prefix = `${DOC_TYPES[type].prefix}-${new Date().getFullYear()}-`;
  let max = 0;
  (DEPT_DOCS[type] || []).forEach((d) => {
    if (d.no && d.no.startsWith(prefix)) max = Math.max(max, Number(d.no.slice(prefix.length)) || 0);
  });
  return prefix + String(max + 1).padStart(3, "0");
}

function deptCellText(field, value) {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "date") return formatThaiDate(value);
  if (field.type === "number") return Number(value).toLocaleString("th-TH");
  return escapeHtml(String(value));
}

function deptOpenCount(type) {
  return deptVisibleDocs(type).filter((d) => deptIsOpen(type, d)).length;
}

/* ---- rendering --------------------------------------------------------- */

function renderDept() {
  // Make sure the remembered department / document type is one this user may see
  const visibleWs = DEPT_WORKSPACES.filter((w) => w.docTypes.some(deptTypeVisible));
  if (visibleWs.length && !visibleWs.some((w) => w.id === deptCurrent)) deptCurrent = visibleWs[0].id;
  const curWs = DEPT_WORKSPACES.find((w) => w.id === deptCurrent);
  if (curWs && !deptTypeVisible(deptDocType)) deptDocType = curWs.docTypes.find(deptTypeVisible) || curWs.docTypes[0];
  if (curWs && !curWs.docTypes.includes(deptDocType)) deptDocType = curWs.docTypes.find(deptTypeVisible) || curWs.docTypes[0];
  renderDeptSummary();
  renderDeptTabs();
  renderDeptHeader();
  renderDeptDocGrid();
  renderDeptRegister();
}

function renderDeptSummary() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  let open = 0;
  Object.keys(DEPT_DOCS).forEach((t) => { open += deptOpenCount(t); });
  set("deptStatOpen", open);
  set("deptStatChange", deptVisibleDocs("ecr").filter((d) => d.status === "รอพิจารณา").length
    + deptVisibleDocs("eo").filter((d) => d.status === "รออนุมัติ").length);
  set("deptStatNcr", deptOpenCount("ncr"));
  set("deptStatRepair", deptOpenCount("mtr"));
}

function renderDeptTabs() {
  const wrap = document.getElementById("deptTabs");
  if (!wrap) return;
  wrap.innerHTML = "";
  DEPT_WORKSPACES.forEach((ws) => {
    if (!ws.docTypes.some(deptTypeVisible)) return;
    const open = ws.docTypes.reduce((s, t) => s + (DOC_TYPES[t].special ? 0 : deptOpenCount(t)), 0);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dept-tab${ws.id === deptCurrent ? " active" : ""}`;
    btn.setAttribute("aria-pressed", ws.id === deptCurrent ? "true" : "false");
    btn.innerHTML = `${escapeHtml(ws.name)}${open ? ` <span class="dept-tab-count">${open}</span>` : ""}`;
    btn.addEventListener("click", () => {
      deptCurrent = ws.id;
      deptDocType = ws.docTypes.find(deptTypeVisible) || ws.docTypes[0];
      saveDeptView();
      renderDept();
    });
    wrap.appendChild(btn);
  });
}

function renderDeptHeader() {
  const ws = DEPT_WORKSPACES.find((w) => w.id === deptCurrent);
  const el = document.getElementById("deptHeader");
  if (!ws || !el) return;
  const allowed = (typeof authAllowedModules === "function" && authAllowedModules()) || MODULE_ACCESS[currentRole()] || [];
  const tools = ws.tools.filter((t) => allowed.includes(t.view));
  el.innerHTML = `
    <h3>${escapeHtml(ws.name)}</h3>
    <p class="card-sub">${escapeHtml(ws.desc)}</p>
    ${tools.length ? `<div class="dept-tools"><span>เครื่องมือในระบบที่เกี่ยวข้อง:</span>${tools.map((t) => `<button class="btn-chip" type="button" data-view="${t.view}">${escapeHtml(t.label)} →</button>`).join("")}</div>` : ""}
  `;
  el.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
}

function renderDeptDocGrid() {
  const ws = DEPT_WORKSPACES.find((w) => w.id === deptCurrent);
  const grid = document.getElementById("deptDocGrid");
  if (!ws || !grid) return;
  grid.innerHTML = "";
  ws.docTypes.filter(deptTypeVisible).forEach((t) => {
    const def = DOC_TYPES[t];
    let meta;
    if (def.special) {
      meta = typeof bomSummaryText === "function" ? bomSummaryText() : "";
    } else {
      const all = deptVisibleDocs(t).length;
      const open = deptOpenCount(t);
      meta = all ? `เปิดอยู่ ${open} · ทั้งหมด ${all}` : "ยังไม่มีเอกสาร";
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = `dept-doc-card${t === deptDocType ? " active" : ""}`;
    card.setAttribute("aria-pressed", t === deptDocType ? "true" : "false");
    card.innerHTML = `
      <span class="dept-doc-abbr">${escapeHtml(def.abbr)}</span>
      <span class="dept-doc-name">${escapeHtml(def.name)}</span>
      <span class="dept-doc-purpose">${escapeHtml(def.purpose)}</span>
      <span class="dept-doc-meta">${escapeHtml(meta)}</span>
    `;
    card.addEventListener("click", () => {
      deptDocType = t;
      saveDeptView();
      renderDeptDocGrid();
      renderDeptRegister();
    });
    grid.appendChild(card);
  });
}

function renderDeptRegister() {
  const def = DOC_TYPES[deptDocType];
  const register = document.getElementById("deptRegister");
  const bomCard = document.getElementById("bomEditor");
  if (!def || !register) return;

  if (def.special) {
    register.hidden = true;
    if (bomCard) bomCard.hidden = false;
    if (typeof renderBomEditor === "function") renderBomEditor();
    return;
  }
  register.hidden = false;
  if (bomCard) bomCard.hidden = true;

  const role = currentRole();
  document.getElementById("deptRegTitle").textContent = def.name;
  document.getElementById("deptRegSub").textContent = def.purpose;
  const addBtn = document.getElementById("deptAddBtn");
  addBtn.hidden = !deptCanCreate(role);
  addBtn.textContent = `+ สร้าง ${def.abbr} ใหม่`;
  document.getElementById("deptSampleBtn").hidden = !deptCanManage(role);
  document.getElementById("dwgRegBtn").hidden = !(deptDocType === "dwg" && deptCanCreate(role));

  // status filter options follow the selected document type
  const statusSel = document.getElementById("deptStatusFilter");
  const prevStatus = statusSel.dataset.type === deptDocType ? statusSel.value : "__open__";
  statusSel.innerHTML = `<option value="__open__">เฉพาะที่ยังเปิดอยู่</option><option value="__all__">ทั้งหมด</option>`
    + def.statuses.map((s) => `<option value="${escapeHtml(s[0])}">${escapeHtml(s[0])}</option>`).join("");
  statusSel.value = prevStatus;
  if (statusSel.value !== prevStatus) statusSel.value = "__open__";
  statusSel.dataset.type = deptDocType;

  const term = (document.getElementById("deptSearch").value || "").trim().toLowerCase();
  const fieldsByKey = {};
  def.fields.forEach((f) => { fieldsByKey[f.key] = f; });
  const titleField = def.fields[0];

  const thead = document.querySelector("#deptTable thead");
  thead.innerHTML = `<tr><th>เลขที่</th><th>${escapeHtml(titleField.label)}</th>${def.cols.map((k) => `<th>${escapeHtml(fieldsByKey[k].label)}</th>`).join("")}<th>สถานะ</th><th>การดำเนินการ</th></tr>`;

  const tbody = document.querySelector("#deptTable tbody");
  tbody.innerHTML = "";
  const docs = deptVisibleDocs(deptDocType);
  const canManage = deptCanManage(role);
  const rows = (DEPT_DOCS[deptDocType] || [])
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => docs.includes(d))
    .filter(({ d }) => {
      if (statusSel.value === "__open__" && !deptIsOpen(deptDocType, d)) return false;
      if (statusSel.value !== "__open__" && statusSel.value !== "__all__" && d.status !== statusSel.value) return false;
      if (!term) return true;
      return Object.values(d).some((v) => String(v ?? "").toLowerCase().includes(term));
    })
    .reverse(); // newest first

  rows.forEach(({ d, i }) => {
    const next = deptNextStatus(deptDocType, d.status);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono-cell">${escapeHtml(d.no)}</td>
      <td class="dept-title-cell"><button type="button" class="link-btn" data-action="view" data-index="${i}">${escapeHtml(d[titleField.key] || "")}</button>${(d.files || []).length ? ` <span class="attach-count" title="ไฟล์แนบ">📎${d.files.length}</span>` : ""}${d.visibility && d.visibility.mode && d.visibility.mode !== "all" ? ` <span class="conf-badge" title="${escapeHtml(typeof visLabel === "function" ? visLabel(d.visibility) : "")}">${d.visibility.mode === "private" ? "👤 ส่วนตัว" : d.visibility.mode === "dept" ? "🏢 เฉพาะแผนก" : "🔒 ลับ"}</span>` : ""}</td>
      ${def.cols.map((k) => `<td>${deptCellText(fieldsByKey[k], d[k])}</td>`).join("")}
      <td><span class="pill ${DOC_TONE_PILL[deptStatusTone(deptDocType, d.status)]}">${escapeHtml(d.status)}</span></td>
      <td class="wo-actions-cell">
        ${canManage && next ? `<button class="btn-chip" type="button" data-action="next" data-index="${i}">→ ${escapeHtml(next)}</button>` : ""}
        <button class="btn-chip" type="button" data-action="view" data-index="${i}">ดูเอกสาร</button>
        ${canManage ? `<button class="btn-chip" type="button" data-action="open" data-index="${i}">แก้ไข</button>` : ""}
      </td>
    `;
    tbody.appendChild(tr);
  });

  const empty = document.getElementById("deptEmptyNote");
  empty.hidden = rows.length > 0;
  empty.textContent = docs.length
    ? "ไม่มีเอกสารตามตัวกรองนี้ — ลองเลือก \"ทั้งหมด\""
    : `ยังไม่มี ${def.abbr} — กด "+ สร้าง ${def.abbr} ใหม่" เพื่อเริ่มใช้งาน`;

  tbody.querySelectorAll("[data-action='next']").forEach((b) => b.addEventListener("click", () => {
    const doc = DEPT_DOCS[deptDocType][Number(b.dataset.index)];
    const next = deptNextStatus(deptDocType, doc.status);
    if (!next) return;
    const prev = doc.status;
    doc.status = next;
    if (typeof stampRecord === "function") { stampRecord(doc, false); auditLog("เปลี่ยนสถานะ", doc.no, `${prev} → ${next}`); }
    saveDeptDocs();
    renderDept();
    showToast(`${doc.no} → ${next}`, "good");
  }));
  tbody.querySelectorAll("[data-action='open']").forEach((b) => b.addEventListener("click", () => openDeptModal(deptDocType, Number(b.dataset.index))));
  tbody.querySelectorAll("[data-action='view']").forEach((b) => b.addEventListener("click", () => openDocView(deptDocType, Number(b.dataset.index))));
}

/* ---- modal ------------------------------------------------------------- */

function deptFieldExample(type, key) {
  const hit = (DOC_SAMPLES[type] || []).find((d) => d[key] !== undefined && d[key] !== "");
  return hit ? `เช่น ${hit[key]}` : "";
}

function deptFieldInput(field, value, disabled, example) {
  const id = `deptField_${field.key}`;
  const ph = example ? ` placeholder="${escapeHtml(example)}"` : "";
  const dis = disabled ? " disabled" : "";
  const v = value === undefined || value === null ? "" : String(value);
  const opts = (list, withEmpty) => (withEmpty ? `<option value="">—</option>` : "")
    + list.map((o) => {
      const val = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      return `<option value="${escapeHtml(val)}"${val === v ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  let input;
  switch (field.type) {
    case "textarea":
      input = `<textarea id="${id}" rows="3"${ph}${dis}>${escapeHtml(v)}</textarea>`;
      break;
    case "number":
      input = `<input type="number" step="any" id="${id}" value="${escapeHtml(v)}"${ph}${dis}>`;
      break;
    case "date":
      input = `<input type="date" id="${id}" value="${escapeHtml(v)}"${dis}>`;
      break;
    case "select":
      input = `<select id="${id}"${dis}>${opts(field.options, true)}</select>`;
      break;
    case "model":
      input = `<select id="${id}"${dis}>${opts(MACHINE_MODELS, true)}</select>`;
      break;
    case "line":
      input = `<select id="${id}"${dis}>${opts(PROD_LINES, true)}</select>`;
      break;
    case "part": {
      const parts = (typeof bomPartOptions === "function" ? bomPartOptions() : []).map((p) => ({ value: p.code, label: `${p.code} — ${p.part}` }));
      if (v && !parts.some((p) => p.value === v)) parts.unshift({ value: v, label: v });
      input = `<select id="${id}"${dis}>${opts(parts, true)}</select>`;
      break;
    }
    case "ref": {
      const refs = (DEPT_DOCS[field.refType] || []).map((d) => ({ value: d.no, label: `${d.no} — ${d[DOC_TYPES[field.refType].fields[0].key] || ""}` }));
      if (v && !refs.some((r) => r.value === v)) refs.unshift({ value: v, label: v });
      input = `<select id="${id}"${dis}>${opts(refs, true)}</select>`;
      break;
    }
    default:
      input = `<input type="text" id="${id}" value="${escapeHtml(v)}"${ph}${dis}>`;
  }
  return `<div class="form-field"><label for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label>${input}</div>`;
}

function openDeptModal(type, index) {
  const def = DOC_TYPES[type];
  const isEdit = index !== null && index !== undefined;
  const role = currentRole();
  const readOnly = isEdit && !deptCanManage(role, type);
  const doc = isEdit ? DEPT_DOCS[type][index] : { no: deptNextNumber(type), status: def.statuses[0][0], date: new Date().toISOString().slice(0, 10) };
  deptEditing = { type, index: isEdit ? index : null };

  document.getElementById("deptDocTitle").textContent = isEdit ? `${doc.no}` : `สร้าง ${def.abbr} ใหม่`;
  document.getElementById("deptDocSub").textContent = isEdit ? def.name : `เลขที่เอกสาร: ${doc.no} (ออกให้อัตโนมัติ)`;
  document.getElementById("deptDocFields").innerHTML = def.fields.map((f) => deptFieldInput(f, doc[f.key], readOnly, deptFieldExample(type, f.key))).join("");
  const visBox = document.getElementById("deptDocVisBox");
  const meta = document.getElementById("deptDocMeta");
  if (visBox && typeof visEditorHtml === "function" && authCurrentUser()) {
    // Only the creator, a manager of this type, or admin may change who can see the document
    const me = authCurrentUser();
    const mayChangeVis = !readOnly && (!isEdit || doc.createdBy === me.id || deptCanManage(role, type));
    visBox.innerHTML = mayChangeVis ? visEditorHtml("doc", doc.visibility) : `<div class="muted-inline">การมองเห็น: ${escapeHtml(visLabel(doc.visibility))}</div>`;
    if (mayChangeVis) visEditorWire("doc");
    meta.innerHTML = isEdit
      ? `สร้างโดย <strong>${escapeHtml(authUserName(doc.createdBy))}</strong>${doc.createdAt ? ` เมื่อ ${fmtDateTime(doc.createdAt)}` : ""}${doc.updatedAt ? ` · แก้ไขล่าสุดโดย <strong>${escapeHtml(authUserName(doc.updatedBy))}</strong> เมื่อ ${fmtDateTime(doc.updatedAt)}` : ""}`
      : `ผู้สร้าง: <strong>${escapeHtml(me.name)}</strong>`;
  } else if (visBox) { visBox.innerHTML = ""; meta.innerHTML = ""; }

  const statusSel = document.getElementById("deptDocStatus");
  statusSel.innerHTML = def.statuses.map((s) => `<option value="${escapeHtml(s[0])}"${s[0] === doc.status ? " selected" : ""}>${escapeHtml(s[0])}</option>`).join("");
  // New documents always start at the first status; changing status is a manager action
  statusSel.disabled = readOnly || !isEdit || !deptCanManage(role, type);

  document.getElementById("deptDocSaveBtn").hidden = readOnly;
  document.getElementById("deptDocDeleteBtn").hidden = !isEdit || !deptCanManage(role, type);
  document.getElementById("deptDocCancelBtn").textContent = readOnly ? "ปิด" : "ยกเลิก";
  document.getElementById("deptDocBackdrop").classList.add("open");
  const first = document.getElementById(`deptField_${def.fields[0].key}`);
  if (first && !readOnly) setTimeout(() => first.focus(), 0);
}

function closeDeptModal() {
  document.getElementById("deptDocBackdrop").classList.remove("open");
  deptEditing = null;
}

function saveDeptModal() {
  if (!deptEditing) return;
  const { type, index } = deptEditing;
  const def = DOC_TYPES[type];
  const entry = {};
  for (const f of def.fields) {
    const el = document.getElementById(`deptField_${f.key}`);
    let val = el ? el.value.trim() : "";
    if (f.required && !val) { el.focus(); return; }
    if (f.type === "number") val = val === "" ? "" : Number(val);
    entry[f.key] = val;
  }
  const hasAuth = typeof authCurrentUser === "function" && authCurrentUser();
  const vis = hasAuth ? visEditorRead("doc", authCurrentUser().dept) : undefined;
  if (index === null) {
    entry.no = deptNextNumber(type);
    entry.status = def.statuses[0][0];
    if (vis) entry.visibility = vis;
    if (hasAuth) { stampRecord(entry, true); auditLog("สร้างเอกสาร", entry.no, `${def.abbr}: ${entry[def.fields[0].key]}${vis && vis.mode !== "all" ? ` · ${visLabel(vis)}` : ""}`); }
    DEPT_DOCS[type] = DEPT_DOCS[type] || [];
    DEPT_DOCS[type].push(entry);
  } else {
    const doc = DEPT_DOCS[type][index];
    const before = Object.assign({}, doc);
    Object.assign(doc, entry);
    doc.status = document.getElementById("deptDocStatus").value;
    if (vis) doc.visibility = vis;
    if (hasAuth) {
      const changes = [auditDiff(before, doc, def.fields.concat([{ key: "status", label: "สถานะ" }]))];
      if (vis && JSON.stringify(before.visibility || { mode: "all" }) !== JSON.stringify(vis)) changes.push(`การมองเห็น → ${visLabel(vis)}`);
      stampRecord(doc, false);
      auditLog("แก้ไขเอกสาร", doc.no, changes.filter(Boolean).join(" · ") || "บันทึกโดยไม่มีการเปลี่ยนแปลง");
    }
  }
  saveDeptDocs();
  closeDeptModal();
  renderDept();
  showToast(index === null ? `สร้าง ${entry.no} แล้ว` : `บันทึก ${DEPT_DOCS[type][index].no} แล้ว`, "good");
}

function deleteDeptDoc() {
  if (!deptEditing || deptEditing.index === null) return;
  const { type, index } = deptEditing;
  const doc = DEPT_DOCS[type][index];
  if (!confirm(`ลบ ${doc.no} ?`)) return;
  DEPT_DOCS[type].splice(index, 1);
  if (typeof auditLog === "function") auditLog("ลบเอกสาร", doc.no, `${DOC_TYPES[type].abbr}: ${doc[DOC_TYPES[type].fields[0].key] || ""}`);
  saveDeptDocs();
  closeDeptModal();
  renderDept();
  showToast(`ลบ ${doc.no} แล้ว`, "warn");
}

function fillDeptSamples() {
  const def = DOC_TYPES[deptDocType];
  const samples = DOC_SAMPLES[deptDocType] || [];
  const list = DEPT_DOCS[deptDocType] = DEPT_DOCS[deptDocType] || [];
  const missing = samples.filter((sd) => !list.some((d) => d.no === sd.no));
  if (!missing.length) { showToast(`ตัวอย่าง ${def.abbr} มีครบแล้ว`, "good"); return; }
  missing.forEach((sd) => list.push(Object.assign({}, sd)));
  if (typeof auditLog === "function") auditLog("เติมข้อมูลตัวอย่าง", def.abbr, missing.map((m) => m.no).join(", "));
  list.sort((a, b) => String(a.no).localeCompare(String(b.no)));
  document.getElementById("deptStatusFilter").value = "__all__";
  saveDeptDocs();
  renderDept();
  showToast(`เพิ่มตัวอย่าง ${def.abbr} ${missing.length} รายการ`, "good");
}

/* ---- export ------------------------------------------------------------ */

function exportDeptCsv() {
  const def = DOC_TYPES[deptDocType];
  if (!def || def.special) return;
  const header = ["เลขที่", ...def.fields.map((f) => f.label), "สถานะ"];
  const rows = deptVisibleDocs(deptDocType).map((d) => [d.no, ...def.fields.map((f) => d[f.key] ?? ""), d.status]);
  const lines = [header, ...rows].map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${def.prefix.toLowerCase()}-register-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`ส่งออกทะเบียน ${def.abbr} เป็น CSV แล้ว`, "good");
}

/* ---- wiring ------------------------------------------------------------- */

function initDeptInteractions() {
  document.getElementById("deptAddBtn").addEventListener("click", () => openDeptModal(deptDocType, null));
  document.getElementById("deptExportBtn").addEventListener("click", exportDeptCsv);
  document.getElementById("deptSampleBtn").addEventListener("click", fillDeptSamples);
  document.getElementById("dwgRegBtn").addEventListener("click", () => openDwgRegModal(""));
  document.getElementById("deptSearch").addEventListener("input", renderDeptRegister);
  document.getElementById("deptStatusFilter").addEventListener("change", renderDeptRegister);
  document.getElementById("deptDocCancelBtn").addEventListener("click", closeDeptModal);
  document.getElementById("deptDocSaveBtn").addEventListener("click", saveDeptModal);
  document.getElementById("deptDocDeleteBtn").addEventListener("click", deleteDeptDoc);
  document.getElementById("deptDocBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDeptModal();
  });
}
