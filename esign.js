/* ==========================================================================
   ลงนามเอกสารอิเล็กทรอนิกส์ — each user keeps one signature (drawn with a
   finger/mouse/pen or uploaded as a picture). A document is signed into one
   of the form's three boxes (ผู้จัดทำ / ผู้ตรวจสอบ / ผู้อนุมัติ — names from
   the form designer) after re-entering the PIN. The signature stores a copy
   of the image, who/when, and a fingerprint of the document's content: if
   the content changes after signing, the paper shows that the signature no
   longer matches. Every sign/withdraw goes to the audit trail.
   ========================================================================== */

let esPadCtx = null;
let esPadDirty = false;
let esPending = null; // { type, index, slot }

/* ---- signature pad ------------------------------------------------------------ */

function esOpenPad(after) {
  const me = authCurrentUser();
  if (!me) return;
  const body = document.getElementById("esBody");
  body.innerHTML = `
    <h3>ลายเซ็นของฉัน — ${escapeHtml(me.name)}</h3>
    <p class="card-sub">เซ็นในกรอบด้วยนิ้ว ปากกา หรือเมาส์ หรืออัปโหลดรูปลายเซ็น (พื้นขาว) · ใช้ลงนามเอกสารทุกฉบับ ต้องใส่ PIN ทุกครั้งที่ลงนาม</p>
    ${me.signature ? `<div class="es-current"><span class="muted-inline">ลายเซ็นปัจจุบัน:</span> <img src="${me.signature}" alt="ลายเซ็นปัจจุบัน"></div>` : ""}
    <canvas id="esCanvas" class="es-canvas" width="600" height="200" aria-label="กรอบเซ็นชื่อ"></canvas>
    <div class="modal-actions es-pad-actions">
      <label class="btn-secondary rd-file-btn">อัปโหลดรูป<input type="file" id="esUpload" accept="image/*" hidden></label>
      <button type="button" class="btn-secondary" id="esClear">ล้าง</button>
      <button type="button" class="btn-secondary" id="esCancel">ยกเลิก</button>
      <button type="button" class="btn-primary" id="esSave">บันทึกลายเซ็น</button>
    </div>`;
  const cv = document.getElementById("esCanvas");
  esPadCtx = cv.getContext("2d");
  esPadClear();
  let drawing = false, last = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height }; };
  cv.addEventListener("pointerdown", (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    esPadCtx.lineWidth = e.pressure && e.pointerType === "pen" ? 1.5 + e.pressure * 3 : 3;
    esPadCtx.beginPath(); esPadCtx.moveTo(last.x, last.y); esPadCtx.lineTo(p.x, p.y); esPadCtx.stroke();
    last = p; esPadDirty = true; e.preventDefault();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => cv.addEventListener(ev, () => { drawing = false; }));
  document.getElementById("esClear").addEventListener("click", esPadClear);
  document.getElementById("esCancel").addEventListener("click", () => document.getElementById("esBackdrop").classList.remove("open"));
  document.getElementById("esUpload").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      esPadClear();
      const k = Math.min(cv.width / img.width, cv.height / img.height);
      esPadCtx.drawImage(img, (cv.width - img.width * k) / 2, (cv.height - img.height * k) / 2, img.width * k, img.height * k);
      esPadDirty = true;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });
  document.getElementById("esSave").addEventListener("click", () => {
    if (!esPadDirty) { showToast("ยังไม่ได้เซ็น", "warn"); return; }
    const data = esTrim(cv);
    if (!data) { showToast("ยังไม่ได้เซ็น", "warn"); return; }
    // keep the previous image so documents already signed with it still show it
    if (me.signature && me.signature !== data) {
      me.sigHistory = me.sigHistory || {};
      me.sigHistory[esSigKey(me.signature)] = me.signature;
      const keys = Object.keys(me.sigHistory);
      if (keys.length > 6) delete me.sigHistory[keys[0]];
    }
    me.signature = data;
    me.signatureAt = new Date().toISOString();
    authSave();
    auditLog("บันทึกลายเซ็น", me.username, "ตั้ง/เปลี่ยนลายเซ็นสำหรับลงนามเอกสาร");
    document.getElementById("esBackdrop").classList.remove("open");
    showToast("บันทึกลายเซ็นแล้ว", "good");
    if (typeof after === "function") after();
  });
  document.getElementById("esBackdrop").classList.add("open");
}

function esPadClear() {
  const cv = esPadCtx.canvas;
  esPadCtx.fillStyle = "#fff";
  esPadCtx.fillRect(0, 0, cv.width, cv.height);
  esPadCtx.strokeStyle = "#0b2a6b";
  esPadCtx.lineCap = "round";
  esPadCtx.lineJoin = "round";
  esPadDirty = false;
}

// Crop to the ink and scale to at most 300×100 so every signature stays small
function esTrim(cv) {
  const ctx = cv.getContext("2d");
  const { width: w, height: h } = cv;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return "";
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const k = Math.min(1, 300 / cw, 100 / ch);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const o = out.getContext("2d");
  o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(cv, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/* ---- signing documents ------------------------------------------------------------ */

function esSlots() { const fs = formSettings(); return [fs.sig1, fs.sig2, fs.sig3]; }

// Fingerprint of what the signer agreed to: the form's fields (+ requested lines), not status or files
function esDocHash(type, doc) {
  const def = DOC_TYPES[type];
  const parts = (def ? def.fields : []).map((f) => `${f.key}=${doc[f.key] ?? ""}`);
  if (Array.isArray(doc.items)) doc.items.forEach((it) => parts.push(`${it.key}:${it.req}`));
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// Why this user may not sign this box ("" = may sign). Rules (separation of duties):
//  · one person, one box — also the same signature image can't appear twice (one person, two accounts)
//  · boxes in order: ผู้จัดทำ → ผู้ตรวจสอบ → ผู้อนุมัติ
//  · ผู้จัดทำ = the creator; ผู้ตรวจสอบ = can manage this document type; ผู้อนุมัติ = has approval authority
// Company policy (Admin › ออกแบบฟอร์ม). ERPNext calls the second one "Allow Self Approval".
// Defaults allow both: a small team often has one person who prepares, checks and approves.
function esPolicy() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("y2j-form-settings-v1") || "{}") || {}; } catch (e) { /* defaults */ }
  return { multiSign: s.multiSign !== false, selfApprove: s.selfApprove !== false };
}

// Signature images live once on the user (current + history); a signed box stores only a short key.
// Storing the picture in every signed document filled the browser's storage.
function esSigKey(img) {
  const s = String(img || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + "-" + s.length.toString(36);
}
function esSigImg(s) {
  if (!s) return "";
  if (s.img) return s.img;   // documents signed before this change
  const u = typeof authUserById === "function" ? authUserById(s.uid) : null;
  if (!u) return "";
  if (u.signature && esSigKey(u.signature) === s.sig) return u.signature;
  return (u.sigHistory && u.sigHistory[s.sig]) || u.signature || "";
}

function esWhyNot(type, doc, slot) {
  const me = authCurrentUser();
  if (!me) return "ยังไม่ได้เข้าระบบ";
  const sigs = doc.signatures || {};
  if (sigs[slot]) return "ช่องนี้ลงนามแล้ว";
  const pol = esPolicy();
  if (!pol.multiSign && Object.values(sigs).some((s) => s && s.uid === me.id)) return "คุณลงนามในเอกสารนี้แล้ว — นโยบายบริษัท: หนึ่งคนลงนามได้หนึ่งช่อง";
  if (me.signature && Object.values(sigs).some((s) => s && s.uid !== me.id && (s.sig ? s.sig === esSigKey(me.signature) : s.img === me.signature))) return "ลายเซ็นนี้ถูกใช้ในเอกสารนี้แล้ว (บัญชีอื่น)";
  if (slot > 0 && !sigs[slot - 1]) return `ต้องรอ "${esSlots()[slot - 1]}" ลงนามก่อน`;
  const role = currentRole();
  if (slot === 0) {
    if (doc.createdBy) return doc.createdBy === me.id ? "" : "ช่องผู้จัดทำ ลงนามได้เฉพาะผู้สร้างเอกสาร";
    return deptCanCreate(role, type) ? "" : "ไม่มีสิทธิ์จัดทำเอกสารชนิดนี้";
  }
  const manage = deptCanManage(role, type) || (type === "mreq" && typeof authHasAbility === "function" && authHasAbility("approve"));
  if (slot === 1) return manage ? "" : "ไม่มีสิทธิ์ตรวจสอบเอกสารชนิดนี้";
  const approver = ["admin", "plant", "group", "depthead"].includes(me.role) || (typeof authHasAbility === "function" && authHasAbility("approve"));
  return manage && approver ? "" : "ช่องผู้อนุมัติ ลงนามได้เฉพาะผู้มีอำนาจอนุมัติ (หัวหน้าแผนกขึ้นไป)";
}
function esCanSign(type, doc, slot) { return !esWhyNot(type, doc, slot); }
function esSignable(type, doc) { return [0, 1, 2].filter((s) => esCanSign(type, doc, s)); }

// Boxes for the paper form (replaces the blank lines when the document has signatures or can be signed)
function esPaperBoxes(type, doc) {
  const slots = esSlots();
  const hash = esDocHash(type, doc);
  const box = (i) => {
    const s = (doc.signatures || {})[i];
    if (!s) {
      const name = i === 0 ? doc.owner || doc.requester || "" : "";
      return `<div class="sig-box"><div class="sig-line">${name ? escapeHtml(name) : "&nbsp;"}</div><div class="sig-label">${escapeHtml(slots[i])}</div><div class="sig-date">วันที่ ____/____/______</div></div>`;
    }
    const changed = s.hash && s.hash !== hash;
    return `<div class="sig-box sig-signed${changed ? " sig-changed" : ""}">
      <div class="sig-line"><img class="sig-img" src="${esSigImg(s)}" alt="ลายเซ็น ${escapeHtml(s.name)}"></div>
      <div class="sig-name">(${escapeHtml(s.name)})</div>
      <div class="sig-label">${escapeHtml(slots[i])}${s.position ? ` · ${escapeHtml(s.position)}` : ""}</div>
      <div class="sig-date">ลงนาม ${fmtDateTime(s.at)}</div>
      ${changed ? `<div class="sig-warn">⚠ เอกสารถูกแก้ไขหลังลงนาม</div>` : `<div class="sig-ok">✓ ลงนามอิเล็กทรอนิกส์</div>`}
    </div>`;
  };
  return `<div class="paper-sigs">${box(0)}${box(1)}${box(2)}</div>`;
}

function esStartSign(type, index) {
  const doc = DEPT_DOCS[type][index];
  const me = authCurrentUser();
  if (!doc || !me) return;
  const slots = esSignable(type, doc);
  if (!slots.length) { showToast(esWhyNot(type, doc, [0, 1, 2].find((s) => !(doc.signatures || {})[s]) ?? 0) || "ไม่มีช่องที่คุณลงนามได้ในเอกสารนี้", "warn"); return; }
  if (!me.signature) { closeDocView(); esOpenPad(() => esStartSign(type, index)); showToast("ตั้งลายเซ็นก่อน แล้วค่อยลงนาม", "warn"); return; }
  esPending = { type, index };
  const labels = esSlots();
  document.getElementById("esBody").innerHTML = `
    <h3>ลงนาม ${escapeHtml(doc.no)}</h3>
    <p class="card-sub">${escapeHtml(String(doc.title || ""))}</p>
    <div class="form-field"><label for="esSlot">ลงนามในฐานะ</label><select id="esSlot">${slots.map((s) => `<option value="${s}">${escapeHtml(labels[s])}</option>`).join("")}</select></div>
    <div class="es-preview"><img src="${me.signature}" alt="ลายเซ็นของฉัน"><div>(${escapeHtml(me.name)})${me.position ? ` · ${escapeHtml(me.position)}` : ""}</div></div>
    <div class="form-field"><label for="esPin">ยืนยันด้วยรหัสผ่าน</label><input type="password" id="esPin" autocomplete="current-password" maxlength="32"></div>
    <p class="muted-note">การลงนามบันทึกชื่อ วันเวลา และลายนิ้วมือของเนื้อหาเอกสาร — ถ้ามีการแก้ไขเนื้อหาภายหลัง ลายเซ็นจะแสดงว่า "ถูกแก้ไขหลังลงนาม"</p>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="esChange">เปลี่ยนลายเซ็น</button>
      <button type="button" class="btn-secondary" id="esCancel2">ยกเลิก</button>
      <button type="button" class="btn-primary" id="esConfirm">ลงนาม</button>
    </div>`;
  document.getElementById("esCancel2").addEventListener("click", () => document.getElementById("esBackdrop").classList.remove("open"));
  document.getElementById("esChange").addEventListener("click", () => esOpenPad(() => esStartSign(type, index)));
  document.getElementById("esConfirm").addEventListener("click", esConfirmSign);
  document.getElementById("esPin").addEventListener("keydown", (e) => { if (e.key === "Enter") esConfirmSign(); });
  closeDocView(true);
  document.getElementById("esBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("esPin").focus(), 0);
}

async function esConfirmSign() {
  if (!esPending) return;
  const { type, index } = esPending;
  const doc = DEPT_DOCS[type][index];
  const me = authCurrentUser();
  const pin = document.getElementById("esPin").value;
  if (!(await authCheckSecret(me, pin))) { showToast("รหัสผ่านไม่ถูกต้อง", "warn"); document.getElementById("esPin").select(); return; }
  const slot = Number(document.getElementById("esSlot").value);
  if (!esCanSign(type, doc, slot)) { showToast("ลงนามช่องนี้ไม่ได้", "warn"); return; }
  doc.signatures = doc.signatures || {};
  doc.signatures[slot] = { uid: me.id, name: me.name, position: me.position || "", at: new Date().toISOString(), sig: esSigKey(me.signature), hash: esDocHash(type, doc) };
  saveDeptDocs();
  auditLog("ลงนามเอกสาร", doc.no, `${esSlots()[slot]} · ${me.name}`);
  document.getElementById("esBackdrop").classList.remove("open");
  esPending = null;
  if (typeof renderDept === "function") renderDept();
  openDocView(type, index);
  showToast(`ลงนาม ${doc.no} แล้ว`, "good");
}

// The signer (or an admin) may withdraw a signature — recorded in the audit trail
function esWithdraw(type, index, slot) {
  const doc = DEPT_DOCS[type][index];
  const me = authCurrentUser();
  const s = (doc.signatures || {})[slot];
  if (!s || !me || (s.uid !== me.id && me.role !== "admin")) return;
  if ((doc.signatures || {})[slot + 1]) { showToast(`ถอนไม่ได้ — "${esSlots()[slot + 1]}" ลงนามต่อจากช่องนี้แล้ว ต้องถอนช่องถัดไปก่อน`, "warn"); return; }
  if (!confirm(`ถอนลายเซ็นช่อง "${esSlots()[slot]}" ของ ${s.name}?`)) return;
  delete doc.signatures[slot];
  saveDeptDocs();
  auditLog("ถอนลายเซ็นเอกสาร", doc.no, `${esSlots()[slot]} · ${s.name}`);
  openDocView(type, index);
}

function initEsign() {
  const bd = document.getElementById("esBackdrop");
  if (bd) bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
}
