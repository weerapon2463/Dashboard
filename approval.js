/* ==========================================================================
   ผู้อนุมัติ (approval.js) — one rule for who approves what, chosen by the company
   (ตั้งค่าแบบฟอร์ม › วิธีกำหนดผู้อนุมัติ):
     rights — anyone with the right to approve that kind of document (default)
     dept   — the head / approvers of the requester's own department
     chain  — the requester's supervisor or anyone above them (Admin › ผู้ใช้ › ผู้บังคับบัญชา)
   In every mode: the requester never approves their own (unless self-approval is switched on),
   managers (plant) and admins may always decide, and when nobody else qualifies the request
   goes to the manager. Used by requisitions, documents, the approver signature and purchase requests.
   ========================================================================== */

const APV_MODES = [
  ["rights", "ตามสิทธิ์ — ใครมีสิทธิ์อนุมัติเอกสารชนิดนั้นก็อนุมัติได้"],
  ["dept", "ตามแผนก — หัวหน้า/ผู้อนุมัติของแผนกผู้ขอ"],
  ["chain", "ตามสายบังคับบัญชา — ผู้บังคับบัญชาของผู้ขอ หรือคนที่สูงขึ้นไปในสาย"],
];

function apvMode() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("y2j-form-settings-v1") || "{}") || {}; } catch (e) { /* default */ }
  return APV_MODES.some((m) => m[0] === s.approvalMode) ? s.approvalMode : "rights";
}
function apvUser(id) { return id && typeof authUserById === "function" ? authUserById(id) : null; }
function apvIsManager(u) { return !!u && (u.role === "admin" || u.role === "plant"); }

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

// may `me` (who holds the base right `right`) approve something requested by `requesterId`?
function apvAllows(me, requesterId, right, type) {
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
  const selfOk = typeof esPolicy === "function" && esPolicy().selfApprove;
  return (typeof AUTH !== "undefined" && AUTH ? AUTH.users : []).filter((u) => u.active !== false && !apvIsManager(u) && u.role !== "group"
    && (u.id !== requesterId || selfOk) && apvHasRight(type, u) && apvAllows(u, requesterId, true, type) && (!extra || extra(u)));
}
// should this request show up in `me`'s inbox? (those who may decide; managers only as the fallback)
function apvRoutesTo(me, type, requesterId, extra) {
  if (!me || !apvHasRight(type, me) || !apvAllows(me, requesterId, true, type)) return false;
  if (me.id === requesterId && !(typeof esPolicy === "function" && esPolicy().selfApprove)) return false;
  if (!apvIsManager(me)) return !extra || extra(me);
  return !apvCandidates(type, requesterId, extra).length;
}
// "waiting for …" — who is expected to approve, in words
function apvWaitingFor(type, requesterId, extra) {
  const c = apvCandidates(type, requesterId, extra);
  if (c.length) return c.slice(0, 3).map((u) => u.name).join(" / ") + (c.length > 3 ? ` และอีก ${c.length - 3} คน` : "");
  return "ผู้จัดการโรงงาน";
}
function apvModeLabel() { return (APV_MODES.find((m) => m[0] === apvMode()) || APV_MODES[0])[1]; }
