/* ==========================================================================
   ผู้อนุมัติ (approval.js) — one rule for who approves what, chosen by the company
   (ตั้งค่าแบบฟอร์ม › วิธีกำหนดผู้อนุมัติ):
     rights — anyone with the right to approve that kind of document (default)
     dept   — the head / approvers of the requester's own department
     chain  — the requester's supervisor or anyone above them (Admin › ผู้ใช้ › ผู้บังคับบัญชา)
   In every mode: the requester never approves their own (unless self-approval is switched on),
   managers (plant) and admins may always decide, and when nobody else qualifies the request
   goes to the manager. Used by requisitions, documents, the approver signature and purchase requests.

   ลำดับขั้น (Admin › ลำดับขั้น & การอนุมัติ):
     levels — the company's position ladder (พนักงาน < หัวหน้างาน < หัวหน้าแผนก < …), each person
              has a level (user.level; blank = from their role)
     steps  — optional approval steps per kind of document: each step needs someone at a minimum
              level, from the requester's department / chain of command / anywhere; purchase-request
              steps may apply only above an amount. Steps are approved in order, one person per step;
              the document is approved when the last step is. No steps = the single-step rule above.
   ========================================================================== */

const APV_MODES = [
  ["rights", "ตามสิทธิ์ — ใครมีสิทธิ์อนุมัติเอกสารชนิดนั้นก็อนุมัติได้"],
  ["dept", "ตามแผนก — หัวหน้า/ผู้อนุมัติของแผนกผู้ขอ"],
  ["chain", "ตามสายบังคับบัญชา — ผู้บังคับบัญชาของผู้ขอ หรือคนที่สูงขึ้นไปในสาย"],
];
const APV_LEVELS_DEFAULT = ["พนักงาน / ช่าง", "หัวหน้างาน / โฟร์แมน", "หัวหน้าแผนก", "ผู้จัดการฝ่าย", "ผู้จัดการโรงงาน", "ผู้บริหาร"];
const APV_ROLE_LEVEL = { operator: 1, depthead: 3, plant: 5, admin: 5, group: 6 };
const APV_SCOPES = [
  ["dept", "แผนกเดียวกับผู้ขอ"],
  ["chain", "ในสายบังคับบัญชาของผู้ขอ"],
  ["any", "ใครก็ได้ในระดับนี้"],
];
// kinds of document that can have their own steps; "doc" = every other document with an approval status
const APV_STEP_KINDS = [["mreq", "ใบเบิกวัสดุ"], ["pr", "ใบขอซื้อ (PR)"], ["doc", "เอกสารอื่นทุกชนิด (ค่าเริ่มต้น)"]];

function apvSettings() {
  try { return JSON.parse(localStorage.getItem("y2j-form-settings-v1") || "{}") || {}; } catch (e) { return {}; }
}
function apvSaveSettings(patch, what, detail) {
  const next = Object.assign(apvSettings(), patch);
  try { localStorage.setItem("y2j-form-settings-v1", JSON.stringify(next)); } catch (e) { showToast("บันทึกไม่สำเร็จ", "warn"); return false; }
  if (typeof auditLog === "function") auditLog("ตั้งลำดับขั้นอนุมัติ", what, detail || "");
  return true;
}

function apvMode() {
  const s = apvSettings();
  return APV_MODES.some((m) => m[0] === s.approvalMode) ? s.approvalMode : "rights";
}
function apvUser(id) { return id && typeof authUserById === "function" ? authUserById(id) : null; }
function apvIsManager(u) { return !!u && (u.role === "admin" || u.role === "plant"); }
function apvSelfOk() { return typeof esPolicy === "function" && esPolicy().selfApprove; }

/* ---- levels ------------------------------------------------------------------ */

function apvLevels() {
  const l = apvSettings().levels;
  return Array.isArray(l) && l.length >= 2 ? l : APV_LEVELS_DEFAULT;
}
function apvRoleLevel(role) { return Math.min(apvLevels().length, APV_ROLE_LEVEL[role] || 1); }
function apvLevelOf(u) {
  if (!u) return 0;
  const n = apvLevels().length;
  return u.level >= 1 ? Math.min(n, Number(u.level)) : apvRoleLevel(u.role);
}
function apvLevelName(n) { return apvLevels()[n - 1] || `ระดับ ${n}`; }

// the requester's supervisors, nearest first (inactive people are skipped, loops are cut)
function apvChain(uid) {
  const out = [];
  const seen = new Set([uid]);
  let u = apvUser(uid);
  while (u && u.reportsTo && !seen.has(u.reportsTo)) {
    seen.add(u.reportsTo);
    const s = apvUser(u.reportsTo);
    if (!s) break;
    if (s.active !== false) out.push(s);
    u = s;
  }
  return out;
}

/* ---- approval steps -------------------------------------------------------------- */

function apvStepsAll() { const s = apvSettings().apvSteps; return s && typeof s === "object" ? s : {}; }
function apvStepsRaw(type) {
  const all = apvStepsAll();
  if (Array.isArray(all[type])) return all[type];
  return type === "mreq" || type === "pr" ? [] : (all.doc || []);
}
function apvAmount(type, d) { return type === "pr" ? Number(d && d.value) || 0 : 0; }
// the steps that apply to this document (an amount-limited step only when the amount reaches it)
function apvSteps(type, d) { return apvStepsRaw(type).filter((st) => !(Number(st.over) > 0) || apvAmount(type, d) >= Number(st.over)); }
function apvMulti(type, d) { return !!d && apvSteps(type, d).length > 0; }
function apvNext(type, d) {
  const steps = apvSteps(type, d);
  const i = (d.apv || []).length;
  return i < steps.length ? { i, step: steps[i], total: steps.length } : null;
}
function apvStepFits(u, step, requesterId) {
  if (!u || u.active === false) return false;
  if (u.id === requesterId && !apvSelfOk() && u.role !== "admin") return false;
  if (u.role === "admin") return true;
  if (apvLevelOf(u) < Number(step.level || 1)) return false;
  if (apvIsManager(u) || step.scope === "any") return true;
  const req = apvUser(requesterId);
  if (step.scope === "chain") return apvChain(requesterId).some((s) => s.id === u.id);
  return !!req && !!req.dept && req.dept === u.dept; // dept
}
// may `u` approve the current step of this document? (one person approves one step only)
function apvMayAct(u, type, d, requesterId) {
  const nx = apvNext(type, d);
  if (!nx || !u) return false;
  if ((d.apv || []).some((a) => a.uid === u.id) && u.role !== "admin") return false;
  return apvStepFits(u, nx.step, requesterId);
}
function apvStepCandidates(type, d, requesterId) {
  const nx = apvNext(type, d);
  if (!nx) return [];
  // the nearest level that qualifies (a head before the plant manager, the plant manager before the group CEO)
  const all = (typeof AUTH !== "undefined" && AUTH ? AUTH.users : []).filter((u) => u.role !== "admin" && apvMayAct(u, type, d, requesterId));
  if (!all.length) return [];
  const min = Math.min(...all.map(apvLevelOf));
  return all.filter((u) => apvLevelOf(u) === min);
}
// record the current step; returns { complete, label }
function apvRecord(type, d, u, note) {
  const nx = apvNext(type, d);
  if (!nx) return { complete: true, label: "" };
  d.apv = d.apv || [];
  d.apv.push({ step: nx.i + 1, level: nx.step.level, uid: u.id, name: u.name, position: u.position || "", at: new Date().toISOString(), note: note || "" });
  const complete = nx.i + 1 >= nx.total;
  return { complete, label: `อนุมัติขั้น ${nx.i + 1}/${nx.total} (${apvLevelName(nx.step.level)})` };
}
function apvReset(d) { if (d && d.apv && d.apv.length) d.apv = []; }
// "ขั้น 2/3 · ผู้จัดการฝ่ายขึ้นไป" — or "" when the document has no steps / is done
function apvProgress(type, d) {
  const nx = apvMulti(type, d) ? apvNext(type, d) : null;
  return nx ? `ขั้น ${nx.i + 1}/${nx.total} · ${apvLevelName(nx.step.level)}ขึ้นไป` : "";
}
function apvHistoryHtml(type, d) {
  const steps = apvSteps(type, d);
  if (!steps.length) return "";
  const esc = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s);
  return `<ol class="apv-trail">${steps.map((st, i) => {
    const a = (d.apv || [])[i];
    return `<li class="${a ? "done" : i === (d.apv || []).length ? "now" : ""}"><b>ขั้น ${i + 1}</b> ${esc(apvLevelName(st.level))}ขึ้นไป · ${esc((APV_SCOPES.find((s) => s[0] === st.scope) || APV_SCOPES[0])[1])}${Number(st.over) > 0 ? ` · เกิน ${Number(st.over).toLocaleString("th-TH")} บาท` : ""}
      — ${a ? `✓ ${esc(a.name)}${a.position ? ` (${esc(a.position)})` : ""} ${typeof fmtDateTime === "function" ? fmtDateTime(a.at) : a.at}${a.note ? ` · ${esc(a.note)}` : ""}` : i === (d.apv || []).length ? "รออนุมัติ" : "ยังไม่ถึง"}</li>`;
  }).join("")}</ol>`;
}

/* ---- single-step rule (and the multi-step rule when a document is passed) ---------- */

// may `me` (who holds the base right `right`) approve something requested by `requesterId`?
function apvAllows(me, requesterId, right, type, doc) {
  if (doc && apvMulti(type, doc)) return apvMayAct(me, type, doc, requesterId);
  if (!me) return !!right;
  if (me.role === "admin") return true;
  if (!right) return false;
  if (me.role === "plant") return true;
  const mode = apvMode();
  if (mode === "rights") return true;
  const req = apvUser(requesterId);
  if (mode === "dept") {
    if (req && req.dept && me.dept === req.dept) return true;
    // documents (not requisitions) may also be approved by the department that owns that kind of document
    const owner = type && type !== "mreq" && typeof DEPT_WORKSPACES !== "undefined" ? DEPT_WORKSPACES.find((w) => w.docTypes.includes(type)) : null;
    return !!owner && me.dept === owner.id;
  }
  return apvChain(requesterId).some((s) => s.id === me.id); // chain
}

// the base right to approve a kind of document for any person (not only the one signed in)
function apvHasRight(type, u) {
  if (!u || typeof authDocPerm !== "function") return false;
  if (["admin", "plant"].includes(u.role)) return true;
  if (type === "mreq" && typeof authHasAbility === "function" && authHasAbility("approve", u)) return true;
  return authDocPerm(type, u) === "manage";
}
// people other than managers who could decide this request (to route it: managers only when nobody else can)
function apvCandidates(type, requesterId, extra) {
  return (typeof AUTH !== "undefined" && AUTH ? AUTH.users : []).filter((u) => u.active !== false && !apvIsManager(u) && u.role !== "group"
    && (u.id !== requesterId || apvSelfOk()) && apvHasRight(type, u) && apvAllows(u, requesterId, true, type) && (!extra || extra(u)));
}
// should this request show up in `me`'s inbox? (those who may decide; managers only as the fallback)
function apvRoutesTo(me, type, requesterId, extra, doc) {
  if (doc && apvMulti(type, doc)) {
    if (!apvMayAct(me, type, doc, requesterId) || (extra && !extra(me))) return false;
    const c = apvStepCandidates(type, doc, requesterId);
    return c.some((u) => u.id === me.id) || (!c.length && me.role === "admin");
  }
  if (!me || !apvHasRight(type, me) || !apvAllows(me, requesterId, true, type)) return false;
  if (me.id === requesterId && !apvSelfOk()) return false;
  if (!apvIsManager(me)) return !extra || extra(me);
  return !apvCandidates(type, requesterId, extra).length;
}
// "waiting for …" — who is expected to approve, in words
function apvWaitingFor(type, requesterId, extra, doc) {
  const names = (c) => c.slice(0, 3).map((u) => u.name).join(" / ") + (c.length > 3 ? ` และอีก ${c.length - 3} คน` : "");
  if (doc && apvMulti(type, doc)) {
    const c = apvStepCandidates(type, doc, requesterId);
    return `${apvProgress(type, doc)}${c.length ? ` — ${names(c)}` : " — ยังไม่มีใครอยู่ในระดับนี้ (ตั้งระดับที่ Admin › ลำดับขั้น)"}`;
  }
  const c = apvCandidates(type, requesterId, extra);
  return c.length ? names(c) : "ผู้จัดการโรงงาน";
}
function apvModeLabel() { return (APV_MODES.find((m) => m[0] === apvMode()) || APV_MODES[0])[1]; }

/* ---- Admin › ลำดับขั้น & การอนุมัติ ------------------------------------------------ */

let apvPreviewUser = "";

function renderAdminLevels() {
  const el = document.getElementById("levelsPanel");
  if (!el || typeof AUTH === "undefined") return;
  const esc = escapeHtml;
  const levels = apvLevels();
  const users = AUTH.users.filter((u) => u.active !== false);
  const all = apvStepsAll();
  const kinds = APV_STEP_KINDS.concat(Object.keys(all).filter((k) => !APV_STEP_KINDS.some((x) => x[0] === k) && typeof DOC_TYPES !== "undefined" && DOC_TYPES[k])
    .map((k) => [k, `${DOC_TYPES[k].abbr} — ${DOC_TYPES[k].name.split(" (")[0]} (เฉพาะชนิดนี้)`]));
  const levelOpts = (sel) => levels.map((n, i) => `<option value="${i + 1}"${i + 1 === Number(sel) ? " selected" : ""}>${i + 1}. ${esc(n)}</option>`).join("");
  if (!apvPreviewUser || !users.some((u) => u.id === apvPreviewUser)) apvPreviewUser = (users.find((u) => apvLevelOf(u) === 1) || users[0] || {}).id || "";
  const preview = (kind) => {
    const steps = apvStepsRaw(kind === "doc" ? "__doc" : kind);
    if (!steps.length) return "";
    const fake = { value: 1e12, apv: [] };
    const req = apvUser(apvPreviewUser);
    const t = kind === "doc" ? "__doc" : kind;
    return `<div class="apv-preview">ตัวอย่างถ้า <b>${esc(req ? req.name : "-")}</b> เป็นผู้ขอ: ${steps.map((st, i) => {
      fake.apv = new Array(i).fill({ uid: "" });
      const c = apvStepCandidates(t, fake, apvPreviewUser);
      return `<span class="apv-chip">ขั้น ${i + 1}: ${c.length ? esc(c.slice(0, 4).map((u) => u.name).join(" / ")) + (c.length > 4 ? ` +${c.length - 4}` : "") : `<span class="bx-low">ไม่มีใครเข้าเงื่อนไข</span>`}</span>`;
    }).join(" → ")}</div>`;
  };
  el.innerHTML = `
    <p class="card-sub">ตั้ง <b>ระดับตำแหน่ง</b> ของบริษัท แล้วกำหนดว่าเอกสารแต่ละชนิดต้องผ่านการอนุมัติกี่ขั้น ขั้นละระดับไหน — อนุมัติตามลำดับ ขั้นละ 1 คน คนเดียวอนุมัติ 2 ขั้นไม่ได้ ผู้ขออนุมัติของตัวเองไม่ได้ · ชนิดที่ไม่ได้ตั้งขั้น ใช้วิธีเดิม (ขั้นเดียว: ${esc(apvModeLabel().split(" — ")[0])})</p>

    <div class="apv-grid">
      <section class="card apv-card">
        <h3>1 · ระดับตำแหน่ง (ต่ำ → สูง)</h3>
        <ol class="apv-levels">${levels.map((n, i) => `<li><input class="bom-inline apv-lvname" data-i="${i}" value="${esc(n)}" aria-label="ชื่อระดับ ${i + 1}">
          <span class="muted-inline">${users.filter((u) => apvLevelOf(u) === i + 1).length} คน</span>
          ${levels.length > 2 && i === levels.length - 1 ? `<button type="button" class="btn-link" id="apvLvDel">ลบ</button>` : ""}</li>`).join("")}</ol>
        <div class="filter-row"><button type="button" class="btn-secondary" id="apvLvAdd"${levels.length >= 10 ? " disabled" : ""}>+ เพิ่มระดับบนสุด</button>
          ${Array.isArray(apvSettings().levels) ? `<button type="button" class="btn-link" id="apvLvReset">ใช้ค่าเริ่มต้น</button>` : ""}</div>
      </section>

      <section class="card apv-card">
        <h3>2 · ระดับของแต่ละคน</h3>
        <p class="muted-inline">ไม่ได้ตั้ง = ตามบทบาท (พนักงาน ${apvRoleLevel("operator")} · หัวหน้าแผนก ${apvRoleLevel("depthead")} · ผู้จัดการโรงงาน ${apvRoleLevel("plant")} · ผู้บริหารกลุ่ม ${apvRoleLevel("group")})</p>
        <div class="table-scroll apv-users"><table class="data-table"><thead><tr><th>ชื่อ</th><th>แผนก</th><th>ผู้บังคับบัญชา</th><th>ระดับ</th></tr></thead><tbody>
        ${users.slice().sort((a, b) => apvLevelOf(b) - apvLevelOf(a) || String(a.dept).localeCompare(String(b.dept))).map((u) => `<tr>
          <td>${esc(u.name)}${u.position ? `<br><small class="muted-inline">${esc(u.position)}</small>` : ""}</td>
          <td>${esc(u.dept && typeof authDeptName === "function" ? authDeptName(u.dept) : "ส่วนกลาง")}</td>
          <td>${esc((apvUser(u.reportsTo) || {}).name || "—")}</td>
          <td><select class="apv-ulevel" data-uid="${esc(u.id)}" aria-label="ระดับของ ${esc(u.name)}"><option value="">ตามบทบาท (${esc(apvLevelName(apvRoleLevel(u.role)))})</option>${levelOpts(u.level)}</select></td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted-inline">ผู้บังคับบัญชาตั้งที่แท็บ "ผู้ใช้งาน & สิทธิ์" › แก้ไขผู้ใช้</p>
      </section>
    </div>

    <section class="card apv-card">
      <h3>3 · ขั้นการอนุมัติ</h3>
      <div class="filter-row"><label for="apvPrevUser">ดูตัวอย่างจากผู้ขอ:</label><select id="apvPrevUser">${users.map((u) => `<option value="${esc(u.id)}"${u.id === apvPreviewUser ? " selected" : ""}>${esc(u.name)} — ${esc(apvLevelName(apvLevelOf(u)))}</option>`).join("")}</select></div>
      ${kinds.map(([k, label]) => {
        const steps = Array.isArray(all[k]) ? all[k] : [];
        return `<div class="apv-kind" data-kind="${esc(k)}">
          <div class="apv-kind-head"><b>${esc(label)}</b>${steps.length ? ` <span class="pill pill-schedule">${steps.length} ขั้น</span>` : ` <span class="muted-inline">— ขั้นเดียวตามวิธีเดิม</span>`}
            ${k !== "mreq" && k !== "pr" && k !== "doc" ? `<button type="button" class="btn-link" data-apvdropkind="${esc(k)}">ลบชนิดนี้ (กลับไปใช้ค่าเริ่มต้น)</button>` : ""}</div>
          ${steps.map((st, i) => `<div class="apv-step">
            <span class="apv-stepno">ขั้น ${i + 1}</span>
            <label>ระดับ ≥ <select data-f="level" data-i="${i}">${levelOpts(st.level)}</select></label>
            <label>จาก <select data-f="scope" data-i="${i}">${APV_SCOPES.map((s) => `<option value="${s[0]}"${s[0] === (st.scope || "dept") ? " selected" : ""}>${esc(s[1])}</option>`).join("")}</select></label>
            ${k === "pr" ? `<label>เมื่อมูลค่า ≥ <input type="number" min="0" step="1000" data-f="over" data-i="${i}" value="${Number(st.over) > 0 ? Number(st.over) : ""}" placeholder="ทุกใบ"> บาท</label>` : ""}
            <span class="apv-stepbtns"><button type="button" class="btn-link" data-mv="-1" data-i="${i}"${i ? "" : " disabled"} aria-label="เลื่อนขึ้น">▲</button><button type="button" class="btn-link" data-mv="1" data-i="${i}"${i < steps.length - 1 ? "" : " disabled"} aria-label="เลื่อนลง">▼</button><button type="button" class="btn-link" data-del="${i}">ลบ</button></span>
          </div>`).join("")}
          <div class="filter-row"><button type="button" class="btn-secondary" data-add="1">+ เพิ่มขั้น</button></div>
          ${preview(k)}
        </div>`;
      }).join("")}
      <div class="filter-row"><label for="apvAddKind">ตั้งขั้นเฉพาะเอกสารชนิด:</label><select id="apvAddKind"><option value="">— เลือก —</option>${typeof DOC_TYPES !== "undefined" ? Object.keys(DOC_TYPES).filter((t) => !DOC_TYPES[t].special && t !== "mreq" && !all[t]).map((t) => `<option value="${esc(t)}">${esc(DOC_TYPES[t].abbr)} — ${esc(DOC_TYPES[t].name.split(" (")[0])}</option>`).join("") : ""}</select></div>
      <p class="muted-inline">ผู้จัดการโรงงาน/Admin อนุมัติแทนได้เมื่อระดับถึง · ใบที่อยู่ระหว่างอนุมัติเมื่อเปลี่ยนขั้น จะใช้ขั้นใหม่ต่อจากขั้นที่อนุมัติไปแล้ว · ปฏิเสธ = เริ่มนับขั้นใหม่</p>
    </section>`;

  // levels
  el.querySelectorAll(".apv-lvname").forEach((inp) => inp.addEventListener("change", () => {
    const l = apvLevels().slice();
    const v = inp.value.trim();
    if (!v) { showToast("ชื่อระดับต้องไม่ว่าง", "warn"); renderAdminLevels(); return; }
    const was = l[+inp.dataset.i];
    l[+inp.dataset.i] = v;
    if (apvSaveSettings({ levels: l }, "ระดับตำแหน่ง", `"${was}" → "${v}"`)) renderAdminLevels();
  }));
  const add = document.getElementById("apvLvAdd");
  if (add) add.addEventListener("click", () => { const l = apvLevels().concat([`ระดับ ${apvLevels().length + 1}`]); if (apvSaveSettings({ levels: l }, "ระดับตำแหน่ง", `เพิ่มระดับ ${l.length}`)) renderAdminLevels(); });
  const del = document.getElementById("apvLvDel");
  if (del) del.addEventListener("click", () => {
    const l = apvLevels().slice(0, -1);
    if (AUTH.users.some((u) => Number(u.level) > l.length) && !confirm("มีผู้ใช้อยู่ระดับนี้ — จะถูกลดเป็นระดับสูงสุดที่เหลือ ลบต่อ?")) return;
    if (apvSaveSettings({ levels: l }, "ระดับตำแหน่ง", `ลบระดับ ${l.length + 1}`)) renderAdminLevels();
  });
  const reset = document.getElementById("apvLvReset");
  if (reset) reset.addEventListener("click", () => { if (apvSaveSettings({ levels: undefined }, "ระดับตำแหน่ง", "ค่าเริ่มต้น")) renderAdminLevels(); });

  // people
  el.querySelectorAll(".apv-ulevel").forEach((sel) => sel.addEventListener("change", () => {
    const u = apvUser(sel.dataset.uid);
    if (!u) return;
    const was = apvLevelName(apvLevelOf(u));
    if (sel.value) u.level = Number(sel.value); else delete u.level;
    authSave();
    if (typeof auditLog === "function") auditLog("แก้ไขผู้ใช้", u.name, `ระดับ: ${was} → ${apvLevelName(apvLevelOf(u))}`);
    showToast(`${u.name}: ${apvLevelName(apvLevelOf(u))}`, "good");
    renderAdminLevels();
  }));

  // steps
  const saveKind = (k, steps, detail) => {
    const s = Object.assign({}, apvStepsAll());
    if (steps) s[k] = steps; else delete s[k];
    if (apvSaveSettings({ apvSteps: s }, k, detail)) renderAdminLevels();
  };
  el.querySelectorAll(".apv-kind").forEach((box) => {
    const k = box.dataset.kind;
    const cur = () => (Array.isArray(apvStepsAll()[k]) ? apvStepsAll()[k] : []).map((x) => Object.assign({}, x));
    box.querySelectorAll("[data-f]").forEach((inp) => inp.addEventListener("change", () => {
      const steps = cur();
      const st = steps[+inp.dataset.i];
      if (!st) return;
      st[inp.dataset.f] = inp.dataset.f === "scope" ? inp.value : Number(inp.value) || 0;
      saveKind(k, steps, `ขั้น ${+inp.dataset.i + 1}: ${inp.dataset.f} = ${inp.value || "-"}`);
    }));
    box.querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", () => {
      const steps = cur(); const i = +b.dataset.i, j = i + Number(b.dataset.mv);
      if (!steps[j]) return;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      saveKind(k, steps, `สลับขั้น ${i + 1} ↔ ${j + 1}`);
    }));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const steps = cur(); steps.splice(+b.dataset.del, 1);
      saveKind(k, steps.length || !APV_STEP_KINDS.some((x) => x[0] === k) ? steps : null, `ลบขั้น ${+b.dataset.del + 1}`);
    }));
    box.querySelector("[data-add]").addEventListener("click", () => {
      const steps = cur();
      const last = steps[steps.length - 1];
      const level = Math.min(apvLevels().length, last ? Number(last.level) + 1 : apvRoleLevel("depthead"));
      steps.push({ level, scope: last ? "any" : "dept", over: 0 });
      saveKind(k, steps, `เพิ่มขั้น ${steps.length}: ${apvLevelName(level)}`);
    });
  });
  el.querySelectorAll("[data-apvdropkind]").forEach((b) => b.addEventListener("click", () => saveKind(b.dataset.apvdropkind, null, "ลบการตั้งค่าเฉพาะชนิด")));
  const addKind = document.getElementById("apvAddKind");
  if (addKind) addKind.addEventListener("change", () => { if (addKind.value) saveKind(addKind.value, [{ level: apvRoleLevel("depthead"), scope: "dept", over: 0 }], "ตั้งขั้นเฉพาะชนิด"); });
  const pv = document.getElementById("apvPrevUser");
  if (pv) pv.addEventListener("change", () => { apvPreviewUser = pv.value; renderAdminLevels(); });
}
