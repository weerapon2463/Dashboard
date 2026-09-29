// Store operations: item outside the BOM, Min/Max, requisition without a work order
// (approve → issue), reorder up to Max, stock count (blind → submit → approve by someone else → ledger).
async function run(ctx) {
  const { assert, sleep } = ctx;
  const o = [];
  const U = (n) => AUTH.users.find((u) => u.username === n);
  const as = (n) => { AUTH_USER = U(n); return AUTH_USER; };
  const step = (who, what, ok, detail) => { o.push(`${ok ? "✓" : "✗"} [${who}] ${what}${detail ? ` — ${detail}` : ""}`); assert(ok, `[${who}] ${what}${detail ? ` — ${detail}` : ""}`); };
  const toasts = []; const realToast = showToast; showToast = (m) => toasts.push(String(m));
  const realConfirm = window.confirm; window.confirm = () => true;
  const $ = (id) => document.getElementById(id);
  const set = (id, v) => { $(id).value = v; };
  const code = "CON-TEST-GLOVE";

  o.push("— ของนอก BOM + Min/Max —");
  as("demo-store"); switchView("bomx"); bxTab = "stock"; renderBomx();
  step("คลัง", "มีฟอร์มเพิ่มของนอก BOM", !!$("stNewSave"));
  set("stNewCode", code.toLowerCase()); set("stNewName", "ถุงมือหนังงานเชื่อม (ทดสอบ)"); set("stNewUnit", "คู่"); set("stNewLoc", "C-01-1"); set("stNewMin", "20"); set("stNewMax", "10");
  $("stNewSave").click();
  step("คลัง", "Max น้อยกว่า Min ไม่ได้", !BX_STOCK[code], toasts[toasts.length - 1]);
  set("stNewMax", "100"); $("stNewSave").click();
  step("คลัง", "เพิ่มของนอก BOM (รหัสเป็นตัวใหญ่)", !!BX_STOCK[code] && BX_STOCK[code].nonBom && BX_STOCK[code].max === 100);
  bxMove(code, "MAIN", 50, { vt: "ทดสอบ", v: "T" }, "รับเข้า", "");
  bxSaveStock(); renderBomx();
  step("คลัง", "ตารางคงคลังมีคอลัมน์ Max และของใหม่", /Max/.test($("bomxPane") ? $("bomxPane").textContent : document.body.textContent) && bxAllParts().some((p) => p.key === code && p.line.part.includes("ถุงมือ")));

  o.push("— เบิกทั่วไป (ไม่อ้างใบสั่งผลิต) —");
  as("demo-weld"); bxTab = "pick"; bxRef = "@gen:cons"; stGenSearch = code; renderBomx();
  const qin = document.querySelector(`.bx-qty[data-key="${code}"]`);
  step("ช่างเชื่อม", "เลือก \"เบิกทั่วไป — วัสดุสิ้นเปลือง\" แล้วเห็นของนอก BOM", !!qin);
  qin.value = 6; qin.dispatchEvent(new Event("input"));
  $("bxSubmitReq").click();
  step("ช่างเชื่อม", "ต้องบอกว่าเบิกไปใช้ทำอะไร", /ใช้ทำอะไร/.test(toasts[toasts.length - 1]));
  set("stGenWhy", "งานเชื่อมโครง YT3000 ถุงมือขาด");
  const nBefore = bxReqs().length;
  $("bxSubmitReq").click();
  const mr = bxReqs()[bxReqs().length - 1];
  step("ช่างเชื่อม", "ส่งใบเบิกทั่วไปได้", bxReqs().length === nBefore + 1 && mr.wo === "" && mr.genUse && mr.costDept && mr.items[0].key === code, `${mr.no} · ${mr.purpose} · ลงแผนก ${mr.costDept}`);
  document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));
  as("demo-prod"); bxReqAction(mr, "อนุมัติ", "");
  step("หัวหน้าผลิต", "อนุมัติใบเบิกทั่วไป", mr.status === "อนุมัติ", lastOr(toasts));
  as("demo-store"); bxOpenReq(mr.no);
  document.querySelector("#bxReqBody .bx-issue").value = 6;
  $("bxIssue").click();
  step("คลัง", "จ่ายของตามใบเบิกทั่วไป → ตัดสต็อก", mr.status === "จ่ายของแล้ว" && bxNum(BX_STOCK[code].qty) === 44, `คงเหลือ ${BX_STOCK[code].qty}`);
  document.querySelectorAll(".modal-backdrop.open").forEach((b) => b.classList.remove("open"));

  o.push("— สั่งซื้อซ้ำถึง Max —");
  BX_STOCK[code].min = 45;
  const sug = stSuggest(BX_STOCK[code], 44);
  step("ระบบ", "ต่ำกว่า Min → เสนอสั่งจนถึง Max", sug === 56, `เสนอสั่ง ${sug}`);
  bxMove(code, "MAIN", 80, { vt: "ทดสอบ", v: "T2" }, "รับเข้า", "");
  step("ระบบ", "เกิน Max ขึ้นสถานะ \"เกิน Max\"", /เกิน Max/.test(stLevelPill(BX_STOCK[code], bxNum(BX_STOCK[code].qty))));
  bxMove(code, "MAIN", -80, { vt: "ทดสอบ", v: "T3" }, "คืน", "");

  o.push("— ตรวจนับสต็อก —");
  as("demo-store"); bxTab = "sx"; sxSub = "count"; stCountOpen = ""; renderBomx();
  set("stcWh", "MAIN"); set("stcQ", code.toLowerCase()); set("stcMode", "all");
  $("stcNew").click();
  const sc = stCounts()[stCounts().length - 1];
  step("คลัง", `สร้างใบตรวจนับ ${sc.no}`, sc.lines.length === 1 && sc.lines[0].sys === 44 && sc.status === "กำลังนับ");
  step("คลัง", "นับแบบไม่เห็นยอดในระบบ", !/ยอดในระบบ/.test(document.querySelector("#sxPane thead").textContent));
  const ci = document.querySelector(".stc-n"); ci.value = 41; ci.dispatchEvent(new Event("change"));
  $("stcSubmit").click();
  step("คลัง", "ส่งผลนับ → รออนุมัติ", sc.status === "รออนุมัติ" && sc.countedBy);
  step("คลัง", "คนนับอนุมัติผลนับตัวเองไม่ได้", !stMayApproveCount(sc) && !$("stcApprove"));
  as("demo-exec");
  step("ผู้จัดการ", "ผลตรวจนับเข้ากล่องงาน", mtCollect().some((x) => x.title.includes(sc.no)));
  renderBomx();
  step("ผู้จัดการ", "เห็นยอดในระบบและผลต่าง -3", /ยอดในระบบ/.test(document.querySelector("#sxPane thead").textContent) && /-3/.test($("sxPane").textContent));
  $("stcApprove").click();
  const e = SX_ENTRIES[SX_ENTRIES.length - 1];
  step("ผู้จัดการ", "อนุมัติ → ปรับยอดในสมุดคุมคลัง", sc.status === "ปรับยอดแล้ว" && sxBal(code, "MAIN") === 41 && e.purpose === "reconcile" && e.ref === sc.no, `${sc.entryNo} · คงเหลือ ${sxBal(code, "MAIN")}`);

  showToast = realToast; window.confirm = realConfirm;
  as("demo-admin");
  return o;
  function lastOr(t) { return t[t.length - 1] || ""; }
}
