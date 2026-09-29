/* ==========================================================================
   Admin › การเข้าสู่ระบบ (loginadmin.js) — the admin sets everyone's sign-in:
     • username and employee number (what people type to sign in)
     • a password: temporary (the person sets their own at the next sign-in) or permanent
     • temporary passwords generated for one person or everyone still on the default,
       shown once on a slip to hand out (only the hash is stored)
     • company policy: how people sign in (list + password, or employee no. + password only)
       and the minimum password length — AUTH.loginPolicy
   ========================================================================== */

let laSlips = []; // [{ name, username, empNo, pw }] — plain temporary passwords live only on this screen

function laPolicy() { return Object.assign({ modes: "both", minLen: 4 }, (typeof AUTH !== "undefined" && AUTH && AUTH.loginPolicy) || {}); }
function laPwState(u) {
  if (u.mustChange) return ["รหัสชั่วคราว — ต้องเปลี่ยนตอนเข้า", "warning"];
  if (!u.pw && !u.pin) return ["—", "neutral"]; // server sign-in: hashes are not on this device
  if (!u.pw && u.pin === pinHash(DEMO_PIN, u.id)) return [authTrialDefault() ? "1234 (ช่วงทดลอง)" : "ยังใช้รหัสเริ่มต้น 1234", authTrialDefault() ? "warning" : "critical"];
  return [`ตั้งแล้ว${u.pwAt ? ` ${formatThaiDate(String(u.pwAt).slice(0, 10))}` : ""}`, "good"];
}
function laRandom() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}
async function laSetPassword(u, pw, mustChange, why) {
  await authSetSecret(u, pw);
  if (mustChange) u.mustChange = true;
  authSave();
  auditLog("ตั้งรหัสผ่านผู้ใช้", u.username, `${u.name} · ${mustChange ? "รหัสชั่วคราว (ต้องเปลี่ยนตอนเข้าครั้งถัดไป)" : "รหัสถาวร"}${why ? ` · ${why}` : ""}`);
}

function renderAdminLogins() {
  const el = document.getElementById("loginsPanel");
  if (!el || !authIsAdmin()) return;
  const pol = laPolicy();
  const users = AUTH.users.slice().sort((a, b) => (b.active !== false) - (a.active !== false) || String(a.dept).localeCompare(String(b.dept)) || a.name.localeCompare(b.name));
  const onDefault = users.filter((u) => u.active !== false && !u.pw && u.pin === pinHash(DEMO_PIN, u.id));
  el.innerHTML = `
    <section class="card apv-card">
      <h3>นโยบายการเข้าสู่ระบบ (ทั้งบริษัท)</h3>
      <div class="la-policy">
        <label>วิธีเข้าสู่ระบบ<select id="laModes">
          <option value="both"${pol.modes === "both" ? " selected" : ""}>เลือกชื่อจากรายชื่อ หรือพิมพ์รหัสพนักงาน — แล้วใส่รหัสผ่าน</option>
          <option value="pass"${pol.modes === "pass" ? " selected" : ""}>พิมพ์รหัสพนักงาน/ชื่อผู้ใช้ + รหัสผ่านเท่านั้น (ไม่แสดงรายชื่อ)</option></select></label>
        <label>รหัสผ่านยาวอย่างน้อย<select id="laMinLen">${[4, 6, 8].map((n) => `<option value="${n}"${pol.minLen === n ? " selected" : ""}>${n} ตัว</option>`).join("")}</select></label>
      </div>
      <p class="muted-inline">ระบบทดลอง (DEMO) แสดงรายชื่อเสมอเพื่อให้กรรมการลองได้</p>
      <div class="la-trial${pol.trial1234 ? " on" : ""}">
        ${pol.trial1234
          ? `<b>⚠ ช่วงทดลองใช้: ทุกคนเข้าด้วยรหัส 1234 ได้ และไม่ถูกบังคับเปลี่ยน</b> — ใครก็เข้าบัญชีคนอื่นได้ถ้ารู้รหัสพนักงาน · เมื่อจบช่วงทดลอง กดปุ่มด้านขวา ทุกคนจะต้องตั้งรหัสของตัวเองตอนเข้าครั้งถัดไป
             <button type="button" class="btn-primary" id="laTrialEnd">จบช่วงทดลอง — ให้ทุกคนตั้งรหัสของตัวเอง</button>`
          : `<b>ช่วงทดลองใช้ (Pilot)</b> — ตั้งให้ทุกคนเข้าด้วยรหัส 1234 ไปก่อน ไม่ต้องเปลี่ยนรหัส (ปิดได้ภายหลัง)
             <button type="button" class="btn-secondary" id="laTrialStart">ตั้งรหัส 1234 ให้ทุกคน</button>`}
      </div>
    </section>

    <section class="card apv-card">
      <h3>ผู้ใช้ทุกคน — ชื่อผู้ใช้ · รหัสพนักงาน · รหัสผ่าน</h3>
      <div class="filter-row">
        <button type="button" class="btn-secondary" id="laBulk"${onDefault.length ? "" : " disabled"}>🎲 สุ่มรหัสชั่วคราวให้ทุกคนที่ยังใช้ 1234 (${onDefault.length} คน)</button>
        ${laSlips.length ? `<button type="button" class="btn-primary" id="laPrint">🖨 พิมพ์ใบแจ้งรหัส (${laSlips.length} คน)</button><button type="button" class="btn-link" id="laClear">ล้างรายการรหัสที่แสดง</button>` : ""}
      </div>
      ${laSlips.length ? `<div class="la-slips">⚠ รหัสชั่วคราวแสดงครั้งเดียว — พิมพ์/แจ้งพนักงานก่อนออกจากหน้านี้ · ${laSlips.map((s) => `<span class="apv-chip">${escapeHtml(s.name)}: <code>${escapeHtml(s.empNo || s.username)}</code> / <b><code>${escapeHtml(s.pw)}</code></b></span>`).join(" ")}</div>` : ""}
      <div class="table-scroll"><table class="data-table la-table"><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>รหัสพนักงาน</th><th>รหัสผ่าน</th><th>เข้าล่าสุด</th><th>ใช้งาน</th><th></th></tr></thead><tbody>
      ${users.map((u) => {
        const [st, tone] = laPwState(u);
        return `<tr class="${u.active === false ? "la-off" : ""}" data-uid="${escapeHtml(u.id)}">
          <td>${escapeHtml(u.name)}<br><small class="muted-inline">${escapeHtml(u.position || authRoleLabel(u.role))} · ${escapeHtml(authDeptName(u.dept))}</small></td>
          <td><input class="bom-inline la-user" value="${escapeHtml(u.username)}" aria-label="ชื่อผู้ใช้ ${escapeHtml(u.name)}"></td>
          <td><input class="bom-inline la-emp" value="${escapeHtml(u.empNo || "")}" placeholder="—" aria-label="รหัสพนักงาน ${escapeHtml(u.name)}"></td>
          <td>${bxPillSafe(st, tone)}</td>
          <td class="muted-inline">${u.lastLogin ? escapeHtml(fmtDateTime(u.lastLogin)) : "ยังไม่เคยเข้า"}</td>
          <td><input type="checkbox" class="la-active"${u.active !== false ? " checked" : ""}${u.id === AUTH_USER.id ? " disabled" : ""} aria-label="ใช้งาน ${escapeHtml(u.name)}"></td>
          <td class="la-acts"><button type="button" class="btn-link" data-lapw="${escapeHtml(u.id)}">ตั้งรหัสผ่าน</button><button type="button" class="btn-link" data-lartmp="${escapeHtml(u.id)}">สุ่มรหัสชั่วคราว</button></td></tr>`;
      }).join("")}</tbody></table></div>
    </section>`;

  const savePolicy = () => {
    AUTH.loginPolicy = Object.assign({}, AUTH.loginPolicy || {}, { modes: document.getElementById("laModes").value, minLen: Number(document.getElementById("laMinLen").value) || 4 });
    authSave();
    auditLog("ตั้งนโยบายเข้าสู่ระบบ", "ทั้งบริษัท", `${AUTH.loginPolicy.modes === "pass" ? "รหัสพนักงาน+รหัสผ่านเท่านั้น" : "รายชื่อหรือรหัสพนักงาน"} · รหัสผ่าน ≥ ${AUTH.loginPolicy.minLen} ตัว`);
    showToast("บันทึกนโยบายการเข้าสู่ระบบแล้ว", "good");
  };
  document.getElementById("laModes").addEventListener("change", savePolicy);
  document.getElementById("laMinLen").addEventListener("change", savePolicy);

  const row = (el2) => authUserById(el2.closest("tr").dataset.uid);
  el.querySelectorAll(".la-user").forEach((inp) => inp.addEventListener("change", () => {
    const u = row(inp); const v = inp.value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,20}$/.test(v)) { showToast("ชื่อผู้ใช้: a-z, 0-9, . _ - ยาว 2–20 ตัว", "warn"); inp.value = u.username; return; }
    if (AUTH.users.some((x) => x.username === v && x !== u)) { showToast("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "warn"); inp.value = u.username; return; }
    const was = u.username; u.username = v; authSave();
    auditLog("แก้ไขผู้ใช้", v, `${u.name} · ชื่อผู้ใช้: "${was}" → "${v}"`);
    showToast(`${u.name}: ชื่อผู้ใช้ ${v}`, "good");
  }));
  el.querySelectorAll(".la-emp").forEach((inp) => inp.addEventListener("change", () => {
    const u = row(inp); const v = inp.value.trim().toUpperCase();
    if (v && !/^[A-Z0-9-]{2,16}$/.test(v)) { showToast("รหัสพนักงาน: ตัวเลข/ตัวอักษรอังกฤษ ยาว 2–16 ตัว", "warn"); inp.value = u.empNo || ""; return; }
    if (v && AUTH.users.some((x) => x.empNo === v && x !== u)) { showToast("รหัสพนักงานนี้ถูกใช้แล้ว", "warn"); inp.value = u.empNo || ""; return; }
    const was = u.empNo || ""; if (v) u.empNo = v; else delete u.empNo; authSave();
    auditLog("แก้ไขผู้ใช้", u.username, `${u.name} · รหัสพนักงาน: "${was}" → "${v}"`);
    showToast(`${u.name}: รหัสพนักงาน ${v || "(ไม่มี)"}`, "good");
  }));
  el.querySelectorAll(".la-active").forEach((c) => c.addEventListener("change", () => {
    const u = row(c);
    if (!c.checked && u.role === "admin" && !AUTH.users.some((x) => x !== u && x.active !== false && x.role === "admin")) { showToast("ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน", "warn"); c.checked = true; return; }
    u.active = c.checked; authSave();
    auditLog("แก้ไขผู้ใช้", u.username, `${u.name} · ${c.checked ? "เปิดใช้งาน" : "ปิดใช้งาน (เข้าระบบไม่ได้)"}`);
    renderAdminLogins();
  }));

  // set a password (the dialog lives outside the panel, so a refresh of the panel never loses it)
  laEnsureDialog();
  el.querySelectorAll("[data-lapw]").forEach((b) => b.addEventListener("click", () => laOpenPwDialog(b.dataset.lapw)));
  // temporary passwords
  const temp = laTempPassword;
  el.querySelectorAll("[data-lartmp]").forEach((b) => b.addEventListener("click", async () => { await temp(authUserById(b.dataset.lartmp)); renderAdminLogins(); }));
  const bulk = document.getElementById("laBulk");
  if (bulk) bulk.addEventListener("click", async () => {
    const todo = AUTH.users.filter((u) => u.active !== false && !u.pw && u.pin === pinHash(DEMO_PIN, u.id)); // as of now, not as of drawing
    if (!confirm(`สุ่มรหัสชั่วคราวให้ ${todo.length} คนที่ยังใช้ 1234? ทุกคนต้องเปลี่ยนรหัสของตัวเองตอนเข้าครั้งถัดไป`)) return;
    for (const u of todo) await temp(u); // eslint-disable-line no-await-in-loop
    renderAdminLogins();
  });
  const ts = document.getElementById("laTrialStart");
  if (ts) ts.addEventListener("click", () => {
    const list = AUTH.users.filter((u) => u.active !== false);
    if (!confirm(`ตั้งรหัสผ่านของทุกคน (${list.length} คน รวมผู้ดูแลระบบ) เป็น 1234 ในช่วงทดลองใช้? รหัสที่ตั้งไว้เดิมจะใช้ไม่ได้`)) return;
    list.forEach((u) => { u.pin = pinHash(DEMO_PIN, u.id); u.pw = ""; delete u.mustChange; u.pwAt = new Date().toISOString(); });
    AUTH.loginPolicy = Object.assign({}, AUTH.loginPolicy || {}, { trial1234: true });
    authSave();
    auditLog("ตั้งนโยบายเข้าสู่ระบบ", "ทั้งบริษัท", `ช่วงทดลองใช้: ตั้งรหัส 1234 ให้ ${list.length} คน ไม่บังคับเปลี่ยน`);
    showToast(`ทุกคนเข้าด้วย 1234 ได้แล้ว (${list.length} คน)`, "good");
    renderAdminLogins();
  });
  const te = document.getElementById("laTrialEnd");
  if (te) te.addEventListener("click", () => {
    if (!confirm("จบช่วงทดลอง? ทุกคนที่ยังใช้ 1234 จะต้องตั้งรหัสของตัวเองตอนเข้าครั้งถัดไป")) return;
    AUTH.loginPolicy = Object.assign({}, AUTH.loginPolicy || {}, { trial1234: false });
    authSave();
    auditLog("ตั้งนโยบายเข้าสู่ระบบ", "ทั้งบริษัท", "จบช่วงทดลองใช้: ยกเลิกรหัส 1234 — ทุกคนต้องตั้งรหัสของตัวเอง");
    showToast("จบช่วงทดลองแล้ว — ทุกคนจะถูกขอให้ตั้งรหัสของตัวเองตอนเข้าครั้งถัดไป", "good");
    renderAdminLogins();
  });
  const pr = document.getElementById("laPrint");
  if (pr) pr.addEventListener("click", laPrintSlips);
  const cl = document.getElementById("laClear");
  if (cl) cl.addEventListener("click", () => { laSlips = []; renderAdminLogins(); });
}
function laEnsureDialog() {
  if (document.getElementById("laPwBackdrop")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="modal-backdrop" id="laPwBackdrop"><div class="modal"><h3 id="laPwTitle">ตั้งรหัสผ่าน</h3>
      <div class="form-field"><label for="laPw1">รหัสผ่านใหม่</label><input type="password" id="laPw1" autocomplete="new-password" maxlength="32"></div>
      <div class="form-field"><label for="laPw2">ยืนยันรหัสผ่าน</label><input type="password" id="laPw2" autocomplete="new-password" maxlength="32"></div>
      <label class="fs-check"><input type="checkbox" id="laShow"> แสดงรหัส</label>
      <label class="fs-check"><input type="checkbox" id="laMust" checked> ให้พนักงานเปลี่ยนเป็นรหัสของตัวเองเมื่อเข้าครั้งถัดไป (แนะนำ)</label>
      <div class="form-field"><label for="laWhy">เหตุผล (บันทึกในประวัติ)</label><input id="laWhy" maxlength="80" placeholder="เช่น ลืมรหัสผ่าน / พนักงานใหม่"></div>
      <div class="modal-actions"><button type="button" class="btn-secondary" id="laPwCancel">ยกเลิก</button><button type="button" class="btn-primary" id="laPwSave">บันทึกรหัสผ่าน</button></div>
    </div></div>`;
  const bd = wrap.firstElementChild;
  document.body.appendChild(bd);
  document.getElementById("laShow").addEventListener("change", (e) => { ["laPw1", "laPw2"].forEach((id) => { document.getElementById(id).type = e.target.checked ? "text" : "password"; }); });
  document.getElementById("laPwCancel").addEventListener("click", () => bd.classList.remove("open"));
  document.getElementById("laPwSave").addEventListener("click", laSavePwDialog);
}
function laOpenPwDialog(uid) {
  laEnsureDialog();
  const u = authUserById(uid);
  if (!u) return;
  const bd = document.getElementById("laPwBackdrop");
  bd.dataset.uid = u.id;
  document.getElementById("laPwTitle").textContent = `ตั้งรหัสผ่าน — ${u.name} (${u.empNo || u.username})`;
  ["laPw1", "laPw2", "laWhy"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("laMust").checked = u.id !== AUTH_USER.id;
  bd.classList.add("open");
  setTimeout(() => document.getElementById("laPw1").focus(), 0);
}
async function laSavePwDialog() {
  const bd = document.getElementById("laPwBackdrop");
  const u = authUserById(bd.dataset.uid);
  if (!u) { bd.classList.remove("open"); return; }
  const p1 = document.getElementById("laPw1").value, p2 = document.getElementById("laPw2").value;
  const bad = authSecretProblem(p1);
  if (bad) { showToast(bad, "warn"); document.getElementById("laPw1").focus(); return; }
  if (p1 !== p2) { showToast("รหัสผ่านสองช่องไม่ตรงกัน", "warn"); document.getElementById("laPw2").focus(); return; }
  const btn = document.getElementById("laPwSave");
  btn.disabled = true;
  try { await laSetPassword(u, p1, document.getElementById("laMust").checked, document.getElementById("laWhy").value.trim()); }
  finally { btn.disabled = false; }
  bd.classList.remove("open");
  showToast(`ตั้งรหัสผ่านของ ${u.name} แล้ว`, "good");
  if (typeof renderAdminLogins === "function") renderAdminLogins();
}

// a random temporary password for one person, kept on this screen only to hand out
async function laTempPassword(u) {
  const pw = laRandom();
  await laSetPassword(u, pw, true, "สุ่มรหัสชั่วคราว");
  laSlips = laSlips.filter((s) => s.username !== u.username).concat([{ name: u.name, username: u.username, empNo: u.empNo || "", pw }]);
  return pw;
}
function bxPillSafe(text, tone) { return `<span class="pill pill-${tone === "critical" ? "critical" : tone === "warning" ? "warning" : tone === "good" ? "good" : "neutral"}">${escapeHtml(text)}</span>`; }

function laPrintSlips() {
  const w = window.open("", "_blank");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน", "warn"); return; }
  const site = location.href.split("?")[0].split("#")[0];
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบแจ้งรหัสผ่าน</title>
    <style>body{font-family:"IBM Plex Sans Thai","Leelawadee UI",sans-serif;margin:10mm}.g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
    .s{border:1px dashed #666;border-radius:3mm;padding:5mm;break-inside:avoid}.s b{font-size:13pt}code{font:700 14pt "IBM Plex Mono",monospace}small{color:#444}</style></head><body><div class="g">
    ${laSlips.map((s) => `<div class="s"><b>${escapeHtml(s.name)}</b><br>เข้าระบบที่ <small>${escapeHtml(site)}</small><br>รหัสพนักงาน / ชื่อผู้ใช้: <code>${escapeHtml(s.empNo || s.username)}</code><br>รหัสผ่านชั่วคราว: <code>${escapeHtml(s.pw)}</code><br><small>เข้าครั้งแรกระบบจะให้ตั้งรหัสผ่านของตัวเอง · ห้ามบอกรหัสผ่านผู้อื่น</small></div>`).join("")}
    </div><script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
}
