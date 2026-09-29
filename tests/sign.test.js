// Signing: pick the box yourself (on the paper or in the list), boxes you cannot sign say why,
// and ลงนามแทน — a head signs for someone else with who + why, the approver box only for managers.
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const U = (n) => AUTH.users.find((u) => u.username === n);
  const as = (n) => { AUTH_USER = U(n); return AUTH_USER; };
  const step = (who, what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} [${who}] ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `[${who}] ${what}${detail ? ` — ${detail}` : ""}`); };
  const toasts = []; const realToast = showToast; showToast = (m) => toasts.push(String(m));
  const realCheck = authCheckSecret; authCheckSecret = async () => true;
  const sigBefore = {};
  ["demo-weld", "demo-prod", "demo-exec"].forEach((n) => { sigBefore[n] = U(n).signature; if (!U(n).signature) U(n).signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="; });
  const type = "dpr";
  DEPT_DOCS[type] = DEPT_DOCS[type] || [];
  const doc = { no: "DPR-SIGN-T1", title: "ทดสอบลงนาม", status: DOC_TYPES[type].statuses[0][0], date: "2026-09-29", owner: U("demo-weld").name, createdBy: "u-demo-weld" };
  DEPT_DOCS[type].push(doc);
  const idx = DEPT_DOCS[type].length - 1;
  const radios = () => [...document.querySelectorAll('#esBody input[name="esSlot"]')].map((r) => `${r.value}${r.disabled ? "×" : ""}${r.checked ? "●" : ""}`).join(" ");
  const sign = async (val, forId, why) => {
    const r = document.querySelector(`#esBody input[name="esSlot"][value="${val}"]`);
    r.checked = true; r.dispatchEvent(new Event("change"));
    if (forId !== undefined) { document.getElementById("esProxyFor").value = forId; document.getElementById("esProxyWhy").value = why || ""; }
    document.getElementById("esPin").value = "x";
    await esConfirmSign(); await sleep(50);
  };

  as("demo-prod");
  esStartSign(type, idx);
  step("หัวหน้าผลิต", "หน้าลงนามแสดงครบ 3 ช่อง", document.querySelectorAll('#esBody input[name="esSlot"]').length === 3, radios());
  step("หัวหน้าผลิต", "ช่องผู้จัดทำ = ลงนามแทนได้ · ผู้อนุมัติยังไม่ถึงคิว (บอกเหตุผล)", /p0/.test(radios()) && /2×/.test(radios()) && /รอ/.test(document.getElementById("esBody").textContent));
  await sign("p0", "", "");
  step("หัวหน้าผลิต", "ลงนามแทนต้องเลือกว่าแทนใคร", !(doc.signatures || {})[0], toasts[toasts.length - 1]);
  await sign("p0", "u-demo-weld", "");
  step("หัวหน้าผลิต", "ลงนามแทนต้องมีเหตุผล", !(doc.signatures || {})[0], toasts[toasts.length - 1]);
  await sign("p0", "u-demo-weld", "ช่างลาป่วย");
  const s0 = (doc.signatures || {})[0] || {};
  step("หัวหน้าผลิต", "ลงนามแทนผู้จัดทำ (ช่างเชื่อม) สำเร็จ", s0.uid === "u-demo-prod" && s0.onBehalf && s0.onBehalf.uid === "u-demo-weld" && s0.reason === "ช่างลาป่วย");

  esStartSign(type, idx, 1);
  step("หัวหน้าผลิต", "เลือกช่องผู้ตรวจสอบเอง (ส่งช่องที่ต้องการมา)", /1●/.test(radios()), radios());
  await sign("1");
  step("หัวหน้าผลิต", "ลงนามช่องผู้ตรวจสอบ", ((doc.signatures || {})[1] || {}).uid === "u-demo-prod" && !doc.signatures[1].onBehalf);
  step("หัวหน้าผลิต", "ช่องผู้อนุมัติ: ไม่มีตัวเลือกลงนามแทน (ลงเองตามสิทธิ์ หรือเฉพาะผู้จัดการ/ผู้บริหารลงแทน)", !esCanProxy(type, doc, 2), esProxyWhyNot(type, doc, 2));

  as("demo-weld");
  step("ช่างเชื่อม", "พนักงานลงนามแทนใครไม่ได้", ![0, 1, 2].some((s) => esCanProxy(type, doc, s)));

  as("demo-exec");
  openDocView(type, idx);
  const box = document.querySelector('#docPaper [data-essign="2"]');
  step("ผู้จัดการ", "กดช่องผู้อนุมัติบนใบเอกสารได้", !!box);
  step("ผู้จัดการ", "ใบเอกสารแสดง \"ลงนามแทน ช่างเชื่อม · เหตุผล\"", /ลงนามแทน .*ช่างลาป่วย/.test(document.getElementById("docPaper").textContent));
  box.click(); await sleep(50);
  step("ผู้จัดการ", "กดช่องแล้วเปิดหน้าลงนามที่ช่องนั้น", /2●/.test(radios()), radios());
  document.getElementById("esBackdrop").classList.remove("open");

  // restore
  DEPT_DOCS[type].splice(idx, 1);
  Object.keys(sigBefore).forEach((n) => { if (sigBefore[n] === undefined) delete U(n).signature; else U(n).signature = sigBefore[n]; });
  authCheckSecret = realCheck; showToast = realToast;
  document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  if (typeof closeDocView === "function") closeDocView();
  as("demo-admin");
  return o;
}
