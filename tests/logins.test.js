// Admin › การเข้าสู่ระบบ: the admin sets everyone's username, employee number and password
// (temporary or permanent), generates temporary passwords, and sets the company sign-in policy.
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const U = (id) => AUTH.users.find((u) => u.id === id);
  const step = (what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `${what}${detail ? ` — ${detail}` : ""}`); };
  const toasts = []; const realToast = showToast; showToast = (m) => toasts.push(String(m));
  const realConfirm = window.confirm; window.confirm = () => true;
  const $ = (id) => document.getElementById(id);
  const until = async (f, ms) => { for (let i = 0; i < (ms || 8000) / 100 && !f(); i++) await sleep(100); };
  const rowOf = (id) => document.querySelector(`#loginsPanel tr[data-uid="${id}"]`);
  // PBKDF2 is very slow in headless Chrome; the admin flow is under test here, not the hash (auth has its own checks)
  const realDerive = pwDerive; pwDerive = async (s, salt, iter) => `t${iter}:${salt}:${s}`;
  AUTH_USER = U("u-demo-admin");
  adminTab = "logins"; renderAdmin();
  step("หน้าการเข้าสู่ระบบแสดงผู้ใช้ทุกคน", document.querySelectorAll("#loginsPanel tr[data-uid]").length === AUTH.users.length);

  const mc = U("u-demo-mc");
  let inp = rowOf(mc.id).querySelector(".la-user"); inp.value = "Weld 2!"; inp.dispatchEvent(new Event("change"));
  step("ชื่อผู้ใช้ผิดรูปแบบถูกปฏิเสธ", mc.username !== "weld 2!", toasts[toasts.length - 1]);
  inp = rowOf(mc.id).querySelector(".la-user"); inp.value = "mc.wittaya"; inp.dispatchEvent(new Event("change"));
  step("เปลี่ยนชื่อผู้ใช้", mc.username === "mc.wittaya");
  inp = rowOf(mc.id).querySelector(".la-emp"); inp.value = (U("u-demo-weld").empNo || "390001"); inp.dispatchEvent(new Event("change"));
  step("รหัสพนักงานซ้ำคนอื่นไม่ได้", !U("u-demo-weld").empNo || mc.empNo !== U("u-demo-weld").empNo, toasts[toasts.length - 1]);
  inp = rowOf(mc.id).querySelector(".la-emp"); inp.value = "p777"; inp.dispatchEvent(new Event("change"));
  step("ตั้งรหัสพนักงาน (ตัวใหญ่)", mc.empNo === "P777");

  rowOf(mc.id).querySelector("[data-lapw]").click();
  $("laPw1").value = "abc123"; $("laPw2").value = "abc124"; $("laPwSave").click(); await sleep(50);
  step("รหัสผ่านสองช่องไม่ตรงกัน → ไม่บันทึก", /ไม่ตรงกัน/.test(toasts[toasts.length - 1]));
  $("laPw2").value = "abc123"; $("laMust").checked = false; $("laWhy").value = "ทดสอบ"; $("laPwSave").click(); await until(() => toasts.some((x) => /ตั้งรหัสผ่านของ/.test(x)), 30000);
  step("ตั้งรหัสถาวรให้ช่างกลึง", await authCheckSecret(mc, "abc123") && !mc.mustChange && /^p2\$/.test(mc.pw));
  step("ตั้งรหัสถาวรให้ช่างกลึง", await authCheckSecret(mc, "abc123") && !mc.mustChange && /^p2\$/.test(mc.pw));
  rowOf(mc.id).querySelector("[data-lartmp]").click(); await until(() => laSlips.some((s) => s.username === "mc.wittaya"), 30000);
  step("สุ่มรหัสชั่วคราว → ต้องเปลี่ยนตอนเข้า + แสดงใบแจ้งรหัส", mc.mustChange && laSlips.some((s) => s.username === "mc.wittaya"));
  step("รหัสชั่วคราวใช้เข้าได้จริง", await authCheckSecret(mc, laSlips.find((s) => s.username === "mc.wittaya").pw));

  const defaults = AUTH.users.filter((u) => u.active !== false && !u.pw && u.pin === pinHash(DEMO_PIN, u.id)).length;
  const t0 = Date.now();
  const isDef = (u) => u.active !== false && !u.pw && u.pin === pinHash(DEMO_PIN, u.id);
  if ($("laBulk") && !$("laBulk").disabled) { $("laBulk").click(); await until(() => !AUTH.users.some(isDef) && laSlips.length > defaults, 240000); }
  step("สุ่มรหัสให้ทุกคนที่ยังใช้ 1234", !AUTH.users.some(isDef), `${defaults} คน · เหลือ ${AUTH.users.filter(isDef).length} · slips ${laSlips.length} · ${Math.round((Date.now() - t0) / 1000)} วิ · btn=${!!$("laBulk")}/${$("laBulk") && $("laBulk").disabled}`);

  $("laMinLen").value = "6"; $("laMinLen").dispatchEvent(new Event("change"));
  step("นโยบาย: รหัสผ่าน ≥ 6 ตัว", AUTH.loginPolicy.minLen === 6 && !!authSecretProblem("12345") && !authSecretProblem("123456"));
  $("laModes").value = "pass"; $("laModes").dispatchEvent(new Event("change"));
  step("นโยบาย: รหัสพนักงาน + รหัสผ่านเท่านั้น", AUTH.loginPolicy.modes === "pass");

  const others = AUTH.users.filter((u) => u.role === "admin" && u.id !== AUTH_USER.id && u.active !== false);
  others.forEach((u) => { u.active = false; });
  renderAdminLogins();
  step("ปิดใช้งานตัวเองไม่ได้ (ช่องถูกล็อก)", rowOf(AUTH_USER.id).querySelector(".la-active").disabled);
  others.forEach((u) => { u.active = true; });
  const cb = rowOf(mc.id).querySelector(".la-active"); cb.checked = false; cb.dispatchEvent(new Event("change"));
  step("ปิดใช้งานช่างกลึง", U("u-demo-mc").active === false);

  AUTH.users.forEach((u) => { u.active = true; });
  renderAdminLogins();
  $("laTrialStart").click();
  step("ช่วงทดลอง: ตั้งรหัส 1234 ให้ทุกคน", AUTH.users.every((u) => !u.pw && u.pin === pinHash(DEMO_PIN, u.id) && !u.mustChange) && AUTH.loginPolicy.trial1234);
  step("ช่วงทดลอง: 1234 ใช้ได้และไม่ถูกบังคับเปลี่ยน", await authCheckSecret(U("u-demo-weld"), "1234") && (() => { const cfg = Y2JStore.config(); const was = cfg.demo; cfg.demo = false; const r = !authNeedsNewSecret(U("u-demo-weld")); cfg.demo = was; return r; })() && !authSecretProblem("1234"));
  step("ช่วงทดลอง: หน้าแสดงคำเตือน", /ช่วงทดลองใช้: ทุกคนเข้าด้วยรหัส 1234/.test($("loginsPanel").textContent));
  $("laTrialEnd").click();
  step("จบช่วงทดลอง: ทุกคนต้องตั้งรหัสเอง + ห้ามใช้ 1234", !AUTH.loginPolicy.trial1234 && !!authSecretProblem("1234"));
  showToast = realToast; window.confirm = realConfirm; pwDerive = realDerive;
  return o;
}
