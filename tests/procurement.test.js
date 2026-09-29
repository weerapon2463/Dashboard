// จัดซื้อ / ซัพพลายเออร์: PR/PO act through the tracking flow (no shortcut approve / receive), supplier
// master with AVL, certificate, hold reason, agreed prices, supplier comparison and CSV.
async function run(ctx) {
  const { assert } = ctx;
  const o = [];
  const U = (n) => AUTH.users.find((u) => u.username === n);
  const as = (n) => { AUTH_USER = U(n); return AUTH_USER; };
  const step = (who, what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} [${who}] ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `[${who}] ${what}${detail ? ` — ${detail}` : ""}`); };
  const toasts = []; const realToast = showToast; showToast = (m) => toasts.push(String(m));
  const $ = (id) => document.getElementById(id);
  const close = () => document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  const waiting = P2P_CASES.find((c) => { const s = p2pCurrent(c); return s && s.id === "approve" && c.status !== "cancelled"; });
  const rowOf = (id) => [...document.querySelectorAll("#prTable tbody tr")].find((tr) => tr.textContent.includes(id));

  as("demo-weld"); switchView("procurement"); renderProcurement();
  step("ช่างเชื่อม", `ไม่มีปุ่มอนุมัติ ${waiting.pr} (ไม่มีสิทธิ์)`, !rowOf(waiting.pr) || !rowOf(waiting.pr).querySelector('[data-stage="approve"]'));
  const approver = AUTH.users.find((u) => u.active !== false && p2pInboxTo(waiting, u));
  as(approver.username); renderProcurement();
  const btn = rowOf(waiting.pr).querySelector('[data-stage="approve"]');
  step(approver.name, `มีปุ่มอนุมัติ ${waiting.pr} (คนที่ระบบส่งงานให้)`, !!btn);
  btn.click();
  step(approver.name, "กดแล้วเปิดหน้าบันทึกขั้นอนุมัติของระบบติดตามจัดซื้อ (ใช้กฎเดียวกัน)", $("p2pStepBackdrop").classList.contains("open") && !!$("p2pStepResult"));
  close();
  step("ระบบ", "ตาราง PR บอกตอนนี้อยู่ที่ใคร", /👤/.test(rowOf(waiting.pr).textContent));
  step("ระบบ", "ไม่มีปุ่ม \"รับของแล้ว\" ลัดขั้นตอนอีก", !/รับของแล้ว/.test($("poTable").textContent));

  as("demo-pur"); renderProcurement();
  const sup = SUPPLIER_LIST[0];
  openSupplierEditor(sup.name);
  $("sup_status").value = "On Hold"; $("sup_holdReason").value = "";
  saveSupplierEditor();
  step("จัดซื้อ", "พักการสั่งซื้อต้องใส่เหตุผล", sup.status === "Active" || sup.status === undefined || /เหตุผล/.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);
  $("sup_status").value = "Active"; $("sup_avl").checked = true; $("sup_certExp").value = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  $("sup_prices").value = "K01S0012-00 | 450 | ชิ้น | 10\nผิดรูปแบบ";
  saveSupplierEditor();
  step("จัดซื้อ", "บันทึก AVL + ใบรับรอง + ราคาตกลง (ข้ามบรรทัดผิด)", sup.avl && sup.prices.length === 1 && sup.prices[0].price === 450, JSON.stringify(sup.prices));
  step("ระบบ", "ใบรับรองใกล้หมดอายุขึ้นเตือน", supCertState(sup) === "ใกล้หมดอายุ");
  const other = SUPPLIER_LIST[1];
  other.prices = [{ code: "K01S0012-00", price: 420, unit: "ชิ้น" }];
  supCompare("K01S0012-00");
  step("จัดซื้อ", "เทียบผู้ขายรหัสเดียวกัน — ถูกกว่าอยู่บนและแนะนำ", /แนะนำ/.test($("supBody").textContent) && $("supBody").querySelector("tbody tr").textContent.includes(other.name));
  close(); renderProcurement();
  step("จัดซื้อ", "ตัวกรองสถานะ + ปุ่มส่งออก CSV", !!$("supStatusFilter") && !!$("supCsv"));
  as("demo-store"); openSupplier(sup.name);
  step("คลัง", "ไม่เห็นราคาและบัญชีธนาคาร (ไม่มีสิทธิ์ดูต้นทุน)", !/ราคาตกลง/.test($("supBody").textContent) && !/บัญชีธนาคาร/.test($("supBody").textContent));
  close();
  showToast = realToast;
  as("demo-admin");
  return o;
}
