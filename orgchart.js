/* ==========================================================================
   ผังองค์กร (orgchart.js) — Admin › 🏢 ผังองค์กร
   Positions (not only people): title, parent, planned head-count, level, department,
   advisory (dotted, not counted, not in the approval chain) and the people holding it
   (linked to user accounts when they have one). Totals per box = planned / actual of the
   whole branch, like the company's paper chart. "ตั้งสายบังคับบัญชาจากผัง" writes each
   linked person's supervisor (the nearest holder above), level, department and position
   title — so approvals by chain of command / level follow the chart.
   Stored in AUTH.org (saved with users; only admins change it).
   ========================================================================== */

let ogEditing = null;

function ogData() { if (!AUTH.org || !Array.isArray(AUTH.org.positions)) AUTH.org = { positions: [] }; return AUTH.org; }
function ogPos() { return ogData().positions; }
function ogById(id) { return ogPos().find((p) => p.id === id) || null; }
function ogKids(id) { return ogPos().filter((p) => (p.parent || "") === (id || "")); }
function ogNorm(s) { return String(s || "").replace(/^(นาย|นางสาว|นาง|น\.ส\.|Mr\.?|Ms\.?|Mrs\.?)\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase(); }
function ogUserByName(name) { const n = ogNorm(name); return n ? AUTH.users.find((u) => ogNorm(u.name) === n) || null : null; }
// planned / actual of a branch (advisory boxes are shown but not counted, like the paper chart)
function ogTotals(p) {
  let planned = p.advisory ? 0 : Number(p.planned) || 0;
  let actual = p.advisory ? 0 : (p.people || []).filter((x) => x.name).length;
  ogKids(p.id).forEach((k) => { const t = ogTotals(k); planned += t.planned; actual += t.actual; });
  return { planned, actual };
}
function ogId() { return "pos-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function renderAdminOrgChart() {
  const el = document.getElementById("orgChartPanel");
  if (!el) return;
  const roots = ogKids("");
  const levelName = (n) => (typeof apvLevelName === "function" ? apvLevelName(n) : `ระดับ ${n}`);
  const card = (p) => {
    const t = ogTotals(p);
    const vac = Math.max(0, (Number(p.planned) || 0) - (p.people || []).filter((x) => x.name).length);
    const kids = ogKids(p.id);
    return `<li><div class="og-card${p.advisory ? " og-adv" : ""}">
      <div class="og-head"><b>${escapeHtml(p.title)}</b>${p.advisory ? "" : `<span class="og-n og-plan" title="อัตรากำลังตามแผน (ทั้งสาย)">${t.planned}</span><span class="og-n ${t.actual < t.planned ? "og-short" : "og-full"}" title="มีจริง (ทั้งสาย)">${t.actual}</span>`}</div>
      <div class="og-people">${(p.people || []).filter((x) => x.name).map((x) => `<span class="${x.uid ? "og-linked" : "og-free"}" title="${x.uid ? "มีบัญชีผู้ใช้" : "ยังไม่มีบัญชีผู้ใช้"}">${escapeHtml(x.name)}</span>`).join("") || ""}${vac ? `<span class="og-vac">ว่าง ${vac}</span>` : ""}</div>
      <div class="og-meta">${p.advisory ? "ที่ปรึกษา (เส้นประ)" : escapeHtml(levelName(p.level || 1))}${p.dept && typeof authDeptName === "function" ? ` · ${escapeHtml(authDeptName(p.dept))}` : ""}
        <button type="button" class="btn-link" data-ogedit="${escapeHtml(p.id)}">แก้ไข</button><button type="button" class="btn-link" data-ogadd="${escapeHtml(p.id)}">+ ตำแหน่งใต้</button></div>
    </div>${kids.length ? `<ul>${kids.map(card).join("")}</ul>` : ""}</li>`;
  };
  const all = roots.reduce((a, r) => { const t = ogTotals(r); return { planned: a.planned + t.planned, actual: a.actual + t.actual }; }, { planned: 0, actual: 0 });
  el.innerHTML = `
    <p class="card-sub">ผังตำแหน่งของบริษัท — แต่ละกล่องบอกอัตรากำลังตามแผน / มีจริง ของทั้งสายใต้กล่องนั้น · ชื่อสีเข้ม = มีบัญชีผู้ใช้ · กด "ตั้งสายบังคับบัญชาจากผัง" แล้วผู้บังคับบัญชา ระดับ แผนก และตำแหน่งของทุกคนจะตรงกับผัง (ใช้กับลำดับขั้นอนุมัติ)</p>
    <div class="filter-row">
      <button type="button" class="btn-primary" id="ogApply"${ogPos().length ? "" : " disabled"}>✔ ตั้งสายบังคับบัญชาจากผัง</button>
      <button type="button" class="btn-secondary" id="ogAddRoot">+ ตำแหน่งบนสุด</button>
      <button type="button" class="btn-secondary" id="ogTemplate">📥 นำเข้าผังวายทูเจ (ตรวจชื่อก่อนนำเข้า)</button>
      <button type="button" class="btn-secondary" id="ogPrint">🖨 พิมพ์ผัง</button>
      ${ogPos().length ? `<span class="muted-inline">รวม ${ogPos().length} ตำแหน่ง · อัตรากำลัง ${all.planned} · มีจริง ${all.actual} · ว่าง ${all.planned - all.actual}</span>` : ""}
    </div>
    ${roots.length ? `<ul class="og-tree">${roots.map(card).join("")}</ul>` : `<p class="muted-inline">ยังไม่มีผังองค์กร — เพิ่มตำแหน่งบนสุด หรือนำเข้าผังวายทูเจ</p>`}`;
  el.querySelectorAll("[data-ogedit]").forEach((b) => b.addEventListener("click", () => ogOpenEditor(b.dataset.ogedit)));
  el.querySelectorAll("[data-ogadd]").forEach((b) => b.addEventListener("click", () => ogOpenEditor("", b.dataset.ogadd)));
  document.getElementById("ogAddRoot").addEventListener("click", () => ogOpenEditor("", ""));
  document.getElementById("ogApply").addEventListener("click", ogApply);
  document.getElementById("ogTemplate").addEventListener("click", () => ogOpenImport(OG_Y2J_TEMPLATE));
  document.getElementById("ogPrint").addEventListener("click", () => {
    const w = window.open("", "_blank");
    if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์", "warn"); return; }
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ผังองค์กร</title><style>body{font-family:"IBM Plex Sans Thai","Leelawadee UI",sans-serif;font-size:10pt;margin:10mm}ul{list-style:none;padding-left:18px;border-left:1px solid #999;margin:4px 0}li{margin:4px 0}.og-card{border:1px solid #666;border-radius:4px;padding:4px 8px;display:inline-block}.og-n{display:inline-block;min-width:20px;text-align:center;margin-left:6px;border:1px solid #666}.og-people span{margin-right:8px}.og-meta button{display:none}.og-vac{color:#b42318}</style></head><body><h2>ผังองค์กร</h2>${el.querySelector(".og-tree") ? el.querySelector(".og-tree").outerHTML : ""}<script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
    w.document.close();
  });
}

function ogOpenEditor(id, parent) {
  const p = id ? ogById(id) : { id: "", title: "", parent: parent || "", planned: 1, level: 1, dept: "", advisory: false, people: [] };
  ogEditing = id || "";
  let bd = document.getElementById("ogBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "ogBackdrop";
    bd.innerHTML = `<div class="modal"><h3 id="ogTitle"></h3><div id="ogBody"></div>
      <div class="modal-actions"><button type="button" class="btn-link" id="ogDel">ลบตำแหน่ง</button><button type="button" class="btn-secondary" id="ogCancel">ยกเลิก</button><button type="button" class="btn-primary" id="ogSave">บันทึก</button></div></div>`;
    document.body.appendChild(bd);
    bd.querySelector("#ogCancel").addEventListener("click", () => bd.classList.remove("open"));
    bd.querySelector("#ogSave").addEventListener("click", ogSaveEditor);
    bd.querySelector("#ogDel").addEventListener("click", ogDelete);
  }
  const under = new Set();
  const walk = (x) => { under.add(x); ogKids(x).forEach((k) => walk(k.id)); };
  if (id) walk(id);
  const levels = typeof apvLevels === "function" ? apvLevels() : ["1", "2", "3", "4", "5", "6"];
  bd.querySelector("#ogTitle").textContent = id ? `แก้ไขตำแหน่ง — ${p.title}` : "เพิ่มตำแหน่ง";
  bd.querySelector("#ogBody").innerHTML = `
    <div class="form-field"><label for="og_title">ชื่อตำแหน่ง *</label><input id="og_title" value="${escapeHtml(p.title)}" maxlength="80"></div>
    <div class="form-field"><label for="og_parent">อยู่ใต้ตำแหน่ง</label><select id="og_parent"><option value="">— บนสุด —</option>${ogPos().filter((x) => !under.has(x.id)).map((x) => `<option value="${escapeHtml(x.id)}"${x.id === p.parent ? " selected" : ""}>${escapeHtml(x.title)}</option>`).join("")}</select></div>
    <div class="og-row">
      <div class="form-field"><label for="og_planned">อัตรากำลัง (คน)</label><input id="og_planned" type="number" min="0" value="${Number(p.planned) || 0}"></div>
      <div class="form-field"><label for="og_level">ระดับ</label><select id="og_level">${levels.map((n, i) => `<option value="${i + 1}"${i + 1 === Number(p.level || 1) ? " selected" : ""}>${i + 1}. ${escapeHtml(n)}</option>`).join("")}</select></div>
      <div class="form-field"><label for="og_dept">แผนก</label><select id="og_dept"><option value="">— ไม่ระบุ —</option>${(typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES : []).map((w) => `<option value="${escapeHtml(w.id)}"${w.id === p.dept ? " selected" : ""}>${escapeHtml(w.name)}</option>`).join("")}</select></div>
    </div>
    <label class="fs-check"><input type="checkbox" id="og_adv"${p.advisory ? " checked" : ""}> ที่ปรึกษา (เส้นประ — ไม่นับอัตรากำลัง ไม่อยู่ในสายอนุมัติ)</label>
    <div class="form-field"><label for="og_people">ผู้ดำรงตำแหน่ง (บรรทัดละคน · ระบบจับคู่กับบัญชีผู้ใช้จากชื่อ)</label><textarea id="og_people" rows="4">${escapeHtml((p.people || []).map((x) => x.name).join("\n"))}</textarea><small class="muted-inline" id="og_match"></small></div>`;
  const ta = bd.querySelector("#og_people");
  const match = () => { const names = ta.value.split("\n").map((s) => s.trim()).filter(Boolean); bd.querySelector("#og_match").textContent = names.length ? names.map((n) => `${n}: ${ogUserByName(n) ? "✓ มีบัญชี" : "ยังไม่มีบัญชี"}`).join(" · ") : ""; };
  ta.addEventListener("input", match); match();
  bd.querySelector("#ogDel").hidden = !id;
  bd.classList.add("open");
}
function ogSaveEditor() {
  const $ = (i) => document.getElementById(i);
  const title = $("og_title").value.trim();
  if (!title) { $("og_title").focus(); return; }
  const people = $("og_people").value.split("\n").map((s) => s.trim()).filter(Boolean).map((name) => { const u = ogUserByName(name); return { name: u ? u.name : name, uid: u ? u.id : "" }; });
  const data = { title, parent: $("og_parent").value, planned: Math.max(0, Number($("og_planned").value) || 0), level: Number($("og_level").value) || 1, dept: $("og_dept").value, advisory: $("og_adv").checked, people };
  if (data.planned < people.length) data.planned = people.length;
  if (ogEditing) Object.assign(ogById(ogEditing), data); else ogPos().push(Object.assign({ id: ogId() }, data));
  authSave();
  auditLog("แก้ไขผังองค์กร", title, `${people.length}/${data.planned} คน`);
  document.getElementById("ogBackdrop").classList.remove("open");
  renderAdminOrgChart();
}
function ogDelete() {
  const p = ogById(ogEditing);
  if (!p) return;
  if (ogKids(p.id).length && !confirm(`"${p.title}" มีตำแหน่งย่อย ${ogKids(p.id).length} ตำแหน่ง — ย้ายขึ้นไปอยู่ใต้ตำแหน่งแม่ แล้วลบ?`)) return;
  ogKids(p.id).forEach((k) => { k.parent = p.parent || ""; });
  ogData().positions = ogPos().filter((x) => x.id !== p.id);
  authSave();
  auditLog("แก้ไขผังองค์กร", p.title, "ลบตำแหน่ง");
  document.getElementById("ogBackdrop").classList.remove("open");
  renderAdminOrgChart();
}

// write the chart into the users: supervisor = nearest holder above (advisors skipped), level, dept, position
function ogApply() {
  const pos = ogPos();
  const holderAbove = (p) => {
    let q = p.parent ? ogById(p.parent) : null;
    while (q) {
      const h = !q.advisory && (q.people || []).find((x) => x.uid && AUTH.users.some((u) => u.id === x.uid && u.active !== false));
      if (h) return h.uid;
      q = q.parent ? ogById(q.parent) : null;
    }
    return "";
  };
  let n = 0;
  const changes = [];
  pos.forEach((p) => (p.people || []).forEach((x) => {
    const u = x.uid && AUTH.users.find((y) => y.id === x.uid);
    if (!u) return;
    const next = { position: p.title, level: p.advisory ? u.level : p.level, reportsTo: p.advisory ? u.reportsTo : holderAbove(p), dept: p.dept || u.dept };
    if (next.reportsTo === u.id) next.reportsTo = "";
    const diff = Object.keys(next).filter((k) => (u[k] || "") !== (next[k] || ""));
    if (!diff.length) return;
    Object.assign(u, next);
    n++;
    changes.push(`${u.name}: ${diff.join(",")}`);
  }));
  authSave();
  auditLog("ตั้งสายบังคับบัญชาจากผัง", "ผังองค์กร", `${n} คน${changes.length ? ` · ${changes.slice(0, 20).join(" · ")}` : ""}`);
  showToast(n ? `อัปเดตผู้บังคับบัญชา/ระดับ/ตำแหน่งของ ${n} คนตามผังแล้ว` : "ข้อมูลผู้ใช้ตรงกับผังอยู่แล้ว", "good");
  renderAdminOrgChart();
}

/* ---- import a chart (the Y2J paper chart, transcribed — names are checked before import) --- */

// [key, title, parent key, planned, level, dept, advisory, names]
const OG_Y2J_TEMPLATE = [
  ["md", "กรรมการผู้จัดการใหญ่", "", 1, 6, "", false, ["นายชาญ ฉันท์วิภว"]],
  ["adv1", "ที่ปรึกษา กรรมการผู้จัดการ", "md", 3, 5, "", true, ["นายสุชิต ฉันท์วิภว", "นายประพันธ์ศักดิ์ วังไพศูรย์", "นายอนันต์ สมุทรษารักษ์"]],
  ["gm", "ผู้จัดการทั่วไป", "md", 1, 5, "", false, ["นายอภิวัฒน์ บุญทวี"]],
  ["adv2", "ที่ปรึกษา R&D", "gm", 1, 4, "rnd", true, ["นายสิริวัฒน์ แดงบุปผา"]],
  ["pm", "ผู้จัดการฝ่ายผลิต", "gm", 1, 4, "prod", false, ["นายทรงศักดิ์ ค่าจันดา"]],
  ["pg", "หัวหน้ากลุ่มงานผลิต", "pm", 1, 3, "prod", false, ["นายชาติชาย น้ำเพชร"]],
  ["u1", "หัวหน้าหน่วยผลิต 1", "pg", 1, 2, "prod", false, ["นายวรวิทย์ น้ำเพชร"]],
  ["t1", "ช่างหน่วยผลิต 1", "u1", 3, 1, "prod", false, ["นายเอกลักษณ์ อินจัน", "นายกิตติศักดิ์ เต็มใหญ่", "นายเกียรติไกร ทองสอนกระเดื่อง"]],
  ["u2", "หัวหน้าหน่วยผลิต 2", "pg", 1, 2, "prod", false, ["นายอุทธา ปัญญาแก้ว"]],
  ["t2", "ช่างหน่วยผลิต 2", "u2", 3, 1, "prod", false, ["นายชาตรี ศรีสะอาด", "นายณัฐวุฒิ ศรีสะอาด", "นายภูวนนท์ ชิวาพนารี"]],
  ["u3", "หัวหน้าหน่วยผลิต 3", "pg", 1, 2, "prod", false, ["นายวีระชน ชอบหนองบอน"]],
  ["t3", "ช่างหน่วยผลิต 3", "u3", 3, 1, "prod", false, ["นายวิทยา แตงขาวนา", "นายมงคล ปั้นท่าหลวง", "นายพิษณุพล มากยุ้ย"]],
  ["el", "ช่างไฟฟ้า", "pg", 1, 1, "prod", false, ["นายตะวันฉาย เขียวมุ่ม"]],
  ["sm", "ผู้จัดการฝ่ายขายและสำนักงาน", "gm", 1, 4, "sales", false, ["นางสาวมณีย์ ยศรีบัญวัฒน์"]],
  ["se", "วิศวกรบริการหลังการขาย", "sm", 1, 1, "sales", false, ["นายชวิร ชุ้งสกุล"]],
  ["sl", "วิศวกรขาย", "sm", 1, 1, "sales", false, []],
  ["pe", "วิศวกรพัสดุ", "sm", 1, 2, "wh", false, ["นายภัทรพล คันตระกูล"]],
  ["po", "เจ้าหน้าที่พัสดุ", "pe", 1, 1, "wh", false, ["นายศรันทร์ บรรคาสุข"]],
  ["ad", "เจ้าหน้าที่ธุรการ", "sm", 1, 1, "sales", false, ["นางสาวศิริพร หอมทอง"]],
  ["ac", "เจ้าหน้าที่บัญชี", "sm", 1, 1, "", false, []],
  ["rh", "หัวหน้าแผนก R&D", "gm", 1, 3, "rnd", false, ["นายกิตติภูมิ ภูริเวชวิวัฒน์"]],
  ["re", "วิศวกร R&D", "rh", 1, 1, "rnd", false, ["นายวีระพล จุ้ยม่วง"]],
  ["qa", "วิศวกร QA&QC", "gm", 2, 2, "qc", false, ["นายไพศูรย์ ชื่นอิ่ม"]],
  ["co", "ผู้จัดการฝ่ายประสานงาน", "gm", 1, 4, "plan", false, ["นายมารุต ทองสุข"]],
];

function ogOpenImport(tpl) {
  let bd = document.getElementById("ogImpBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "ogImpBackdrop";
    bd.innerHTML = `<div class="modal modal-wide"><h3>นำเข้าผังองค์กร — ตรวจชื่อทุกบรรทัดก่อนนำเข้า</h3><div id="ogImpBody"></div>
      <div class="modal-actions"><button type="button" class="btn-secondary" id="ogImpCancel">ยกเลิก</button><button type="button" class="btn-primary" id="ogImpGo">นำเข้า</button></div></div>`;
    document.body.appendChild(bd);
    bd.querySelector("#ogImpCancel").addEventListener("click", () => bd.classList.remove("open"));
    bd.querySelector("#ogImpGo").addEventListener("click", () => ogDoImport(tpl));
  }
  const depts = typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES : [];
  bd.querySelector("#ogImpBody").innerHTML = `
    <p class="muted-note">⚠ ชื่อถอดจากภาพผังองค์กร อาจสะกดผิด — แก้ในช่องให้ถูกก่อนกดนำเข้า (บรรทัดละคน) · ตำแหน่งที่มีอยู่แล้วชื่อเดียวกันจะถูกแทนที่</p>
    <div class="table-scroll"><table class="data-table og-imp"><thead><tr><th>ตำแหน่ง</th><th>อยู่ใต้</th><th>อัตรา</th><th>แผนก</th><th>ผู้ดำรงตำแหน่ง</th><th>บัญชี</th></tr></thead><tbody>
    ${tpl.map((r, i) => `<tr><td><b>${escapeHtml(r[1])}</b>${r[6] ? " <small class=\"muted-inline\">(ที่ปรึกษา)</small>" : ""}</td><td class="muted-inline">${escapeHtml((tpl.find((x) => x[0] === r[2]) || [0, "—"])[1])}</td><td class="num">${r[3]}</td>
      <td><select data-dept="${i}"><option value="">—</option>${depts.map((w) => `<option value="${escapeHtml(w.id)}"${w.id === r[5] ? " selected" : ""}>${escapeHtml(w.name)}</option>`).join("")}</select></td>
      <td><textarea data-names="${i}" rows="${Math.max(1, r[7].length)}">${escapeHtml(r[7].join("\n"))}</textarea></td>
      <td class="muted-inline" data-acc="${i}"></td></tr>`).join("")}
    </tbody></table></div>
    <label class="fs-check"><input type="checkbox" id="ogImpCreate" checked> สร้างบัญชีผู้ใช้ให้คนที่ยังไม่มี (ยกเว้นที่ปรึกษา) — รหัสผ่าน 1234 ${typeof authTrialDefault === "function" && authTrialDefault() ? "(ช่วงทดลองใช้)" : "(ต้องเปลี่ยนตอนเข้าครั้งแรก)"} · ตั้งรหัสพนักงานได้ที่ Admin › การเข้าสู่ระบบ</label>
    <label class="fs-check"><input type="checkbox" id="ogImpApply" checked> ตั้งสายบังคับบัญชา ระดับ แผนก ตำแหน่ง ของทุกคนตามผังหลังนำเข้า</label>`;
  const acc = () => bd.querySelectorAll("[data-names]").forEach((ta) => {
    const names = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
    bd.querySelector(`[data-acc="${ta.dataset.names}"]`).textContent = names.map((n) => (ogUserByName(n) ? "✓ มี" : "ใหม่")).join(" / ") || "ว่าง";
  });
  bd.querySelectorAll("[data-names]").forEach((ta) => ta.addEventListener("input", acc));
  acc();
  bd.classList.add("open");
}

function ogRoleFor(level) { return level >= 5 ? "plant" : level >= 3 ? "depthead" : "operator"; }
function ogDoImport(tpl) {
  const bd = document.getElementById("ogImpBackdrop");
  const create = bd.querySelector("#ogImpCreate").checked;
  const keyToId = {};
  tpl.forEach((r) => { const ex = ogPos().find((p) => p.title === r[1]); keyToId[r[0]] = ex ? ex.id : ogId(); });
  let made = 0;
  let seq = AUTH.users.reduce((m, u) => { const x = String(u.username || "").match(/^emp(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  tpl.forEach((r, i) => {
    const names = bd.querySelector(`[data-names="${i}"]`).value.split("\n").map((s) => s.trim()).filter(Boolean);
    const dept = bd.querySelector(`[data-dept="${i}"]`).value;
    const people = names.map((name) => {
      let u = ogUserByName(name);
      if (!u && create && !r[6]) {
        seq += 1;
        const id = "u-" + Date.now().toString(36) + i + seq;
        u = { id, username: `emp${String(seq).padStart(2, "0")}`, name, position: r[1], role: ogRoleFor(r[4]), dept: dept || "prod", company: typeof orgCurrentId === "function" ? orgCurrentId() : "", teams: [], groups: [], active: true, modules: null, docPerms: {}, createdAt: new Date().toISOString(), lastLogin: "",
          pin: pinHash(DEMO_PIN, id) };
        if (!(typeof authTrialDefault === "function" && authTrialDefault())) u.mustChange = true;
        AUTH.users.push(u);
        made++;
      }
      return { name: u ? u.name : name, uid: u ? u.id : "" };
    });
    const data = { id: keyToId[r[0]], title: r[1], parent: r[2] ? keyToId[r[2]] : "", planned: Math.max(r[3], people.length), level: r[4], dept, advisory: r[6], people };
    const ex = ogById(data.id);
    if (ex) Object.assign(ex, data); else ogPos().push(data);
  });
  authSave();
  auditLog("นำเข้าผังองค์กร", "ผังองค์กร", `${tpl.length} ตำแหน่ง · สร้างบัญชีใหม่ ${made} คน`);
  bd.classList.remove("open");
  if (bd.querySelector("#ogImpApply").checked) ogApply();
  showToast(`นำเข้าผังแล้ว ${tpl.length} ตำแหน่ง${made ? ` · สร้างบัญชีใหม่ ${made} คน (ชื่อผู้ใช้ emp01…)` : ""}`, "good");
  renderAdminOrgChart();
}
