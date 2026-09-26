/* ==========================================================================
   Workflow — ERPNext-style: each document type has states (name + colour),
   the main path shown as steps, which states count as closed, and who may
   move a document into a state. Admin › ขั้นตอนการทำงาน edits them per
   company (y2j-workflow-v1); DOC_TYPES is overlaid at start-up so every page
   (lists, steppers, status pickers, service desk) follows the edited flow.
   States the code relies on (approval, issue, close…) keep their names —
   colour, order, main path and permissions stay editable.
   ========================================================================== */

const WF_KEY = "y2j-workflow-v1";
const WF_TONES = [["neutral", "เทา"], ["info", "ฟ้า"], ["warning", "เหลือง"], ["good", "เขียว"], ["critical", "แดง"]];
// names other modules test for — renaming them would silently break those features
const WF_LOCKED = new Set(["R&D กำลังพิจารณา", "กำลังดำเนินการ", "กำลังผลิต", "จ่ายของแล้ว", "จ่ายบางส่วน", "ซ่อมเสร็จ", "ตอบแล้ว", "ตามแผน",
  "ต้องแก้แบบ (เปิด ECR)", "นัดหมายแล้ว", "ปฏิเสธ", "ปิด", "ปิดงาน", "ปิดแล้ว", "ผ่าน", "มีผลใช้งาน", "ยกเลิก", "ยืนยันคำสั่งซื้อ", "รอ QC ตรวจ",
  "รอตรวจ", "รอตรวจแบบ", "รอพิจารณา", "รออนุมัติ", "รออะไหล่", "รับแจ้ง", "ล่าช้า", "วางแผน", "ส่งคำถาม", "ส่งมอบแล้ว", "หยุดใช้งาน", "อนุมัติ",
  "อนุมัติ (Released)", "อนุมัติแล้ว", "อนุมัติใช้งาน", "อยู่ระหว่างซ่อม", "เปิด", "เลยกำหนด", "เสนอราคา", "เสร็จ รอลูกค้ารับรอง", "แจ้งซ่อม",
  "แจ้งหน้างานแล้ว", "ใช้งานปกติ", "ไม่ผ่าน", "ไม่อนุมัติ"]);

// built-in definitions, captured before any override is applied
const WF_DEFAULTS = {};
if (typeof DOC_TYPES !== "undefined") Object.keys(DOC_TYPES).forEach((t) => {
  const d = DOC_TYPES[t];
  if (Array.isArray(d.statuses)) WF_DEFAULTS[t] = { statuses: d.statuses.map((s) => s.slice()), flow: (d.flow || []).slice(), closed: (d.closed || []).slice() };
});

let wfType = "";
let wfDraft = null;

function wfStored() {
  try { return JSON.parse(localStorage.getItem(WF_KEY) || "{}") || {}; } catch (e) { return {}; }
}

function wfStatesFromDefault(t) {
  const d = WF_DEFAULTS[t];
  if (!d) return [];
  return d.statuses.map(([name, tone]) => ({ name, tone, inFlow: d.flow.includes(name), closed: d.closed.includes(name), who: [] }));
}

function wfStates(t) {
  const s = wfStored()[t];
  return s && Array.isArray(s.states) && s.states.length ? s.states : wfStatesFromDefault(t);
}

// Overlay the saved workflows onto DOC_TYPES — called once the shared data is loaded
function wfApply() {
  if (typeof DOC_TYPES === "undefined") return;
  Object.keys(WF_DEFAULTS).forEach((t) => {
    const def = DOC_TYPES[t];
    const states = wfStates(t);
    def.statuses = states.map((s) => [s.name, s.tone || "neutral"]);
    def.flow = states.filter((s) => s.inFlow).map((s) => s.name);
    def.closed = states.filter((s) => s.closed).map((s) => s.name);
  });
}

// May the signed-in user move a document of this type into this state?
function wfCanSet(type, status) {
  const st = wfStates(type).find((s) => s.name === status);
  if (!st || !Array.isArray(st.who) || !st.who.length) return true;
  const me = typeof authCurrentUser === "function" ? authCurrentUser() : null;
  if (!me) return false;
  if (me.role === "admin") return true;
  return st.who.includes(me.role) || (me.groups || []).some((g) => st.who.includes(`g:${g}`));
}

function wfFlowText(type) {
  return ((DOC_TYPES[type] || {}).flow || []).join(" → ");
}

/* ---- admin editor ------------------------------------------------------------------ */

function wfTypeOptions() {
  const ws = typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES : [];
  const seen = new Set();
  const groups = ws.map((w) => {
    const types = (w.docTypes || []).filter((t) => WF_DEFAULTS[t] && !seen.has(t));
    types.forEach((t) => seen.add(t));
    return types.length ? `<optgroup label="${escapeHtml(w.name)}">${types.map((t) => `<option value="${t}"${t === wfType ? " selected" : ""}>${escapeHtml(DOC_TYPES[t].name || t)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const rest = Object.keys(WF_DEFAULTS).filter((t) => !seen.has(t));
  return groups + (rest.length ? `<optgroup label="อื่น ๆ">${rest.map((t) => `<option value="${t}"${t === wfType ? " selected" : ""}>${escapeHtml(DOC_TYPES[t].name || t)}</option>`).join("")}</optgroup>` : "");
}

function wfWhoOptions() {
  const roles = (typeof AUTH_ROLES !== "undefined" ? AUTH_ROLES : []).filter((r) => r.id !== "admin").map((r) => ({ id: r.id, label: r.label }));
  const groups = (typeof AUTH !== "undefined" && AUTH.groups ? AUTH.groups : []).map((g) => ({ id: `g:${g.id}`, label: `กลุ่ม: ${g.name}` }));
  return roles.concat(groups);
}

function wfDocCount(type, name) {
  return ((typeof DEPT_DOCS !== "undefined" && DEPT_DOCS[type]) || []).filter((d) => d.status === name).length;
}

function renderAdminWorkflow() {
  const el = document.getElementById("workflowPanel");
  if (!el) return;
  if (!wfType || !WF_DEFAULTS[wfType]) wfType = WF_DEFAULTS.svc ? "svc" : Object.keys(WF_DEFAULTS)[0];
  if (!wfDraft || wfDraft.type !== wfType) wfDraft = { type: wfType, states: JSON.parse(JSON.stringify(wfStates(wfType))).map((x) => Object.assign(x, { orig: x.name })) };
  const custom = !!wfStored()[wfType];
  const who = wfWhoOptions();
  const tonePill = (tone, text) => `<span class="pill pill-${tone}">${escapeHtml(text)}</span>`;
  const st = wfDraft.states;
  el.innerHTML = `
    <p class="card-sub">กำหนดขั้นตอนของเอกสารแต่ละชนิดแบบ ERPNext Workflow — สถานะ · สี · เส้นทางหลัก (แสดงเป็นขั้น ๆ) · สถานะที่ถือว่าปิดงาน · ใครเปลี่ยนเป็นสถานะนั้นได้ (ว่าง = ทุกคนที่แก้เอกสารชนิดนี้ได้) · สถานะที่มี 🔒 ระบบใช้ทำงานอัตโนมัติ จึงเปลี่ยนชื่อ/ลบไม่ได้ แต่ปรับอย่างอื่นได้</p>
    <div class="filter-row">
      <label for="wfTypeSel">เอกสาร:</label><select id="wfTypeSel">${wfTypeOptions()}</select>
      ${custom ? '<span class="pill pill-info">ปรับแต่งแล้ว</span>' : '<span class="pill pill-neutral">ค่าเริ่มต้น</span>'}
    </div>
    <div class="paper-flow bx-flow wf-preview">${st.filter((s) => s.inFlow).map((s) => `<span class="flow-step">${escapeHtml(s.name)}</span>`).join('<span class="flow-arrow">→</span>') || '<span class="muted-inline">ยังไม่มีขั้นในเส้นทางหลัก</span>'}</div>
    <div class="table-scroll"><table class="data-table wf-table"><thead><tr>
      <th>ลำดับ</th><th>สถานะ</th><th>สี</th><th title="แสดงเป็นขั้นในเส้นทางหลัก">เส้นทางหลัก</th><th title="เอกสารในสถานะนี้ถือว่าปิดแล้ว">ปิดงาน</th><th>ผู้เปลี่ยนเป็นสถานะนี้ได้</th><th>เอกสาร</th><th></th>
    </tr></thead><tbody>
    ${st.map((s, i) => {
      const locked = WF_LOCKED.has(s.orig || s.name) && !s.isNew;
      const n = s.isNew ? 0 : wfDocCount(wfType, s.orig || s.name);
      return `<tr>
        <td class="wf-order"><button type="button" class="btn-link" data-wfup="${i}" ${i ? "" : "disabled"} aria-label="เลื่อนขึ้น">▲</button><button type="button" class="btn-link" data-wfdown="${i}" ${i < st.length - 1 ? "" : "disabled"} aria-label="เลื่อนลง">▼</button></td>
        <td><input class="bom-inline wf-name" data-i="${i}" value="${escapeHtml(s.name)}" ${locked ? 'disabled title="ระบบใช้ชื่อนี้ — เปลี่ยนชื่อไม่ได้"' : ""} aria-label="ชื่อสถานะ">${locked ? " 🔒" : ""}</td>
        <td><select class="wf-tone" data-i="${i}" aria-label="สี">${WF_TONES.map(([v, l]) => `<option value="${v}"${v === s.tone ? " selected" : ""}>${l}</option>`).join("")}</select> ${tonePill(s.tone || "neutral", "ตัวอย่าง")}</td>
        <td><input type="checkbox" class="wf-flow" data-i="${i}" ${s.inFlow ? "checked" : ""} aria-label="อยู่ในเส้นทางหลัก"></td>
        <td><input type="checkbox" class="wf-closed" data-i="${i}" ${s.closed ? "checked" : ""} aria-label="ถือว่าปิดงาน"></td>
        <td><details class="wf-who"><summary>${(s.who || []).length ? escapeHtml(who.filter((w) => s.who.includes(w.id)).map((w) => w.label).join(", ")) : "ทุกคนที่มีสิทธิ์"}</summary>
          ${who.map((w) => `<label><input type="checkbox" class="wf-whochk" data-i="${i}" value="${escapeHtml(w.id)}" ${(s.who || []).includes(w.id) ? "checked" : ""}> ${escapeHtml(w.label)}</label>`).join("")}</details></td>
        <td class="num">${n}</td>
        <td>${locked ? "" : `<button type="button" class="btn-link" data-wfdel="${i}">ลบ</button>`}</td>
      </tr>`;
    }).join("")}
    </tbody></table></div>
    <div class="filter-row wf-actions">
      <button type="button" class="btn-chip" id="wfAdd">+ เพิ่มสถานะ</button>
      <button type="button" class="btn-primary" id="wfSave">บันทึก Workflow</button>
      ${custom ? '<button type="button" class="btn-link" id="wfReset">กลับเป็นค่าเริ่มต้น</button>' : ""}
    </div>`;

  const redraw = () => renderAdminWorkflow();
  document.getElementById("wfTypeSel").addEventListener("change", (e) => { wfType = e.target.value; wfDraft = null; redraw(); });
  el.querySelectorAll(".wf-name").forEach((inp) => inp.addEventListener("change", () => { st[+inp.dataset.i].name = inp.value.trim(); redraw(); }));
  el.querySelectorAll(".wf-tone").forEach((sel) => sel.addEventListener("change", () => { st[+sel.dataset.i].tone = sel.value; redraw(); }));
  el.querySelectorAll(".wf-flow").forEach((c) => c.addEventListener("change", () => { st[+c.dataset.i].inFlow = c.checked; redraw(); }));
  el.querySelectorAll(".wf-closed").forEach((c) => c.addEventListener("change", () => { st[+c.dataset.i].closed = c.checked; }));
  el.querySelectorAll(".wf-whochk").forEach((c) => c.addEventListener("change", () => {
    const s = st[+c.dataset.i];
    s.who = [...el.querySelectorAll(`.wf-whochk[data-i="${c.dataset.i}"]:checked`)].map((x) => x.value);
    const sum = c.closest("details").querySelector("summary");
    sum.textContent = s.who.length ? who.filter((w) => s.who.includes(w.id)).map((w) => w.label).join(", ") : "ทุกคนที่มีสิทธิ์";
  }));
  const move = (i, d) => { const [x] = st.splice(i, 1); st.splice(i + d, 0, x); redraw(); };
  el.querySelectorAll("[data-wfup]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.wfup, -1)));
  el.querySelectorAll("[data-wfdown]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.wfdown, 1)));
  el.querySelectorAll("[data-wfdel]").forEach((b) => b.addEventListener("click", () => {
    const s = st[+b.dataset.wfdel];
    const n = s.isNew ? 0 : wfDocCount(wfType, s.orig || s.name);
    if (n) { showToast(`มีเอกสาร ${n} ใบอยู่ในสถานะ "${s.orig || s.name}" — ย้ายเอกสารไปสถานะอื่นก่อนลบ`, "warn"); return; }
    st.splice(+b.dataset.wfdel, 1);
    redraw();
  }));
  document.getElementById("wfAdd").addEventListener("click", () => { st.push({ name: "", tone: "info", inFlow: true, closed: false, who: [], isNew: true }); redraw(); });
  document.getElementById("wfSave").addEventListener("click", wfSaveDraft);
  const reset = document.getElementById("wfReset");
  if (reset) reset.addEventListener("click", () => {
    const defNames = new Set(wfStatesFromDefault(wfType).map((s) => s.name));
    const stray = wfStates(wfType).filter((s) => !defNames.has(s.name) && wfDocCount(wfType, s.name));
    if (stray.length) { showToast(`ยังมีเอกสารในสถานะที่เพิ่มเอง (${stray.map((s) => s.name).join(", ")}) — ย้ายก่อนกลับค่าเริ่มต้น`, "warn"); return; }
    const all = wfStored();
    delete all[wfType];
    try { localStorage.setItem(WF_KEY, JSON.stringify(all)); } catch (e) { showToast("บันทึกไม่สำเร็จ", "warn"); return; }
    if (typeof auditLog === "function") auditLog("ตั้ง Workflow", DOC_TYPES[wfType].name || wfType, "กลับเป็นค่าเริ่มต้น");
    wfApply(); wfDraft = null; redraw();
    showToast("กลับเป็นค่าเริ่มต้นแล้ว", "good");
  });
}

function wfSaveDraft() {
  const st = wfDraft.states;
  const names = st.map((s) => s.name);
  if (names.some((n) => !n)) { showToast("ทุกสถานะต้องมีชื่อ", "warn"); return; }
  if (new Set(names).size !== names.length) { showToast("ชื่อสถานะซ้ำกัน", "warn"); return; }
  if (!st.some((s) => s.inFlow)) { showToast("ต้องมีอย่างน้อย 1 ขั้นในเส้นทางหลัก", "warn"); return; }
  const renamed = st.filter((x) => !x.isNew && x.orig && x.orig !== x.name).map((x) => [x.orig, x.name]);
  // documents follow renamed states
  if (renamed.length && typeof DEPT_DOCS !== "undefined" && DEPT_DOCS[wfType]) {
    let moved = 0;
    DEPT_DOCS[wfType].forEach((d) => { const r = renamed.find(([a]) => a === d.status); if (r) { d.status = r[1]; moved++; } });
    if (moved && typeof saveDeptDocs === "function") saveDeptDocs();
  }
  const clean = st.map((s) => ({ name: s.name, tone: s.tone || "neutral", inFlow: !!s.inFlow, closed: !!s.closed, who: (s.who || []).slice() }));
  const all = wfStored();
  all[wfType] = { states: clean, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(WF_KEY, JSON.stringify(all)); } catch (e) { showToast("บันทึกไม่สำเร็จ", "warn"); return; }
  if (typeof auditLog === "function") auditLog("ตั้ง Workflow", DOC_TYPES[wfType].name || wfType,
    `${clean.filter((s) => s.inFlow).map((s) => s.name).join(" → ")}${renamed.length ? ` · เปลี่ยนชื่อ ${renamed.map(([a, b]) => `${a}→${b}`).join(", ")}` : ""}`);
  wfApply();
  wfDraft = null;
  renderAdminWorkflow();
  showToast("บันทึก Workflow แล้ว — ทุกหน้าใช้ขั้นตอนใหม่", "good");
}
