/* ==========================================================================
   ผู้ขาย (Supplier master) — add / edit / put on hold, contact and terms,
   which parts each supplier provides, and a live record built from the
   rest of the system: POs and on-time delivery (P2P), incoming inspection,
   warranty claims (service), supplier evaluations (SE documents).
   Stored with procurement data (y2j-procurement-v1 → suppliers).
   ========================================================================== */

const SUP_STATUSES = ["Active", "On Hold", "เลิกใช้"];
const SUP_STATUS_TH = { "Active": "ใช้งาน", "On Hold": "พักการสั่งซื้อ", "เลิกใช้": "เลิกใช้" };
let supEditing = null; // supplier name being edited, "" when adding
let supSearch = "";

function supCanManage() {
  if (typeof authCurrentUser === "function" && authCurrentUser()) {
    const u = authCurrentUser();
    return u.role === "admin" || u.role === "plant" || authCan("sev", "manage") || authCan("rfq", "manage");
  }
  return ["depthead", "plant"].includes(currentRole());
}

// Everything the system knows about one supplier
function supRecord(s) {
  const cases = (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).filter((c) => c.supplier === s.name);
  const stats = (typeof p2pSupplierStats === "function" ? p2pSupplierStats() : []).find((x) => x.name === s.name) || { pos: 0, deliveries: 0, onTime: 0, iqc: 0, iqcFail: 0, openLate: 0, lateDays: 0 };
  const claims = (DEPT_DOCS.svc || []).filter((d) => d.supplier === s.name);
  const evals = (DEPT_DOCS.sev || []).filter((d) => d.title === s.name).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lastEval = evals[0];
  const evalScore = lastEval ? (["quality", "delivery", "price"].map((k) => Number(lastEval[k]) || 0).filter(Boolean).reduce((a, b, _, arr) => a + b / arr.length, 0)) : null;
  const parts = String(s.parts || "").split(/[,\s]+/).filter(Boolean);
  const openValue = cases.filter((c) => c.status !== "cancelled" && p2pCurrent(c)).reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  return { cases, stats, claims, evals, lastEval, evalScore, parts, openValue, onTimePct: stats.deliveries ? Math.round((stats.onTime / stats.deliveries) * 100) : null };
}

function renderSupplierTable() {
  const tbody = document.querySelector("#supplierTable tbody");
  if (!tbody) return;
  const addBtn = document.getElementById("supAddBtn");
  if (addBtn) addBtn.hidden = !supCanManage();
  const q = supSearch.trim().toLowerCase();
  const list = SUPPLIER_LIST.filter((s) => !q || [s.name, s.category, s.contact, s.parts].some((v) => String(v || "").toLowerCase().includes(q)));
  tbody.innerHTML = list.map((s) => {
    const r = supRecord(s);
    const tone = s.status === "Active" ? "pill-good" : s.status === "On Hold" ? "pill-warning" : "pill-eliminate";
    const rating = r.evalScore !== null ? r.evalScore : Number(s.rating) || 0;
    return `<tr class="${s.status === "เลิกใช้" ? "row-muted" : ""}">
      <td><button type="button" class="bx-link" data-sup="${escapeHtml(s.name)}"><strong>${escapeHtml(s.name)}</strong></button>${s.contact ? `<div class="pilot-kpi-method">${escapeHtml(s.contact)}${s.phone ? ` · ${escapeHtml(s.phone)}` : ""}</div>` : ""}</td>
      <td>${escapeHtml(s.category || "")}</td>
      <td>${escapeHtml(String(s.leadTime ?? "—"))} วัน</td>
      <td>${rating ? `${rating.toFixed(1)} / 5.0${r.evalScore !== null ? ` <span class="muted-inline">(SE ${escapeHtml(r.lastEval.period || formatThaiDate(r.lastEval.date))})</span>` : ""}` : "—"}</td>
      <td>${r.onTimePct === null ? '<span class="muted-inline">ยังไม่มีการส่ง</span>' : `<span class="${r.onTimePct < 80 ? "bx-neg" : ""}">${r.onTimePct}%</span> <span class="muted-inline">(${r.stats.deliveries} ครั้ง)</span>`}</td>
      <td class="num">${r.stats.iqcFail || 0}</td>
      <td class="num">${r.claims.length || 0}</td>
      <td class="num">${r.cases.filter((c) => c.status !== "cancelled" && p2pCurrent(c)).length}</td>
      <td><span class="pill ${tone}">${escapeHtml(SUP_STATUS_TH[s.status] || s.status)}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="muted-inline">ไม่พบผู้ขาย</td></tr>`;
  tbody.querySelectorAll("[data-sup]").forEach((b) => b.addEventListener("click", () => openSupplier(b.dataset.sup)));
}

function openSupplier(name) {
  const s = SUPPLIER_LIST.find((x) => x.name === name);
  if (!s) return;
  const r = supRecord(s);
  const row = (label, v) => `<tr><th>${label}</th><td>${v || "—"}</td></tr>`;
  const partRows = r.parts.map((code) => {
    let line = null;
    MACHINE_MODELS.some((m) => { const x = typeof bxRowFor === "function" ? bxRowFor(m, code) : null; if (x) { line = x.line; return true; } return false; });
    return `<button type="button" class="rel-chip" data-part="${escapeHtml(code)}">${escapeHtml(code)}${line ? ` — ${escapeHtml(line.part)}` : ""}</button>`;
  }).join("");
  document.getElementById("supBody").innerHTML = `
    <h3>${escapeHtml(s.name)} <span class="pill ${s.status === "Active" ? "pill-good" : s.status === "On Hold" ? "pill-warning" : "pill-eliminate"}">${escapeHtml(SUP_STATUS_TH[s.status] || s.status)}</span></h3>
    <p class="card-sub">${escapeHtml(s.category || "")}</p>
    <div class="bx-detail-grid">
      <table class="data-table bx-kv"><tbody>
        ${row("ผู้ติดต่อ", escapeHtml(s.contact || ""))}
        ${row("โทร / อีเมล", [s.phone, s.email].filter(Boolean).map(escapeHtml).join(" · "))}
        ${row("เลขผู้เสียภาษี", escapeHtml(s.taxId || ""))}
        ${row("ที่อยู่", escapeHtml(s.address || ""))}
        ${row("เงื่อนไขชำระเงิน", escapeHtml(s.terms || ""))}
        ${row("Lead time ตกลง", `${escapeHtml(String(s.leadTime ?? "—"))} วัน`)}
        ${s.note ? row("หมายเหตุ", escapeHtml(s.note)) : ""}
      </tbody></table>
      <div>
        <div class="ov-mini">
          <div><span class="ov-mini-n">${r.stats.pos}</span><span class="ov-mini-l">PO ทั้งหมด</span></div>
          <div><span class="ov-mini-n">${r.onTimePct === null ? "—" : `${r.onTimePct}%`}</span><span class="ov-mini-l">ส่งตรงเวลา</span></div>
          <div><span class="ov-mini-n">${r.stats.iqcFail}</span><span class="ov-mini-l">IQC ไม่ผ่าน</span></div>
          <div><span class="ov-mini-n">${r.claims.length}</span><span class="ov-mini-l">เคลมจากงานบริการ</span></div>
        </div>
        <p class="muted-inline">มูลค่าที่ยังเปิดอยู่ ${r.openValue.toLocaleString("th-TH")} บาท${r.stats.openLate ? ` · กำลังส่งช้า ${r.stats.openLate} รายการ` : ""}</p>
      </div>
    </div>
    <h4 class="bx-h4">ชิ้นส่วนที่ซื้อจากผู้ขายรายนี้</h4>
    ${partRows || '<p class="muted-inline">ยังไม่ได้ระบุรหัสชิ้นส่วน — กด "แก้ไข" เพื่อเพิ่ม</p>'}
    <h4 class="bx-h4">คำขอซื้อ / PO (${r.cases.length})</h4>
    ${r.cases.length ? `<div>${r.cases.map((c) => { const st = p2pCurrent(c); return `<button type="button" class="rel-chip" data-p2pcase="${escapeHtml(c.id)}">${escapeHtml(c.pr)}${c.po ? ` / ${escapeHtml(c.po)}` : ""} · ${escapeHtml(String(c.item).slice(0, 30))} <span class="rel-status">(${escapeHtml(c.status === "cancelled" ? "ยกเลิก" : st ? st.short || st.label : "ครบ")})</span></button>`; }).join("")}</div>` : '<p class="muted-inline">ยังไม่มี</p>'}
    ${r.claims.length ? `<h4 class="bx-h4">เคลมที่เกี่ยวข้อง</h4><div>${r.claims.map((d) => `<button type="button" class="rel-chip" data-docno="${escapeHtml(d.no)}">${escapeHtml(d.no)} — ${escapeHtml(String(d.title).slice(0, 34))} <span class="rel-status">(${escapeHtml(d.claimStatus || "ยังไม่ส่งเคลม")})</span></button>`).join("")}</div>` : ""}
    ${r.evals.length ? `<h4 class="bx-h4">ผลประเมินผู้ขาย (SE)</h4><div>${r.evals.map((d) => `<button type="button" class="rel-chip" data-docno="${escapeHtml(d.no)}">${escapeHtml(d.no)} · ${escapeHtml(d.period || "")} · คุณภาพ ${escapeHtml(d.quality ?? "-")} ส่ง ${escapeHtml(d.delivery ?? "-")} ราคา ${escapeHtml(d.price ?? "-")}</button>`).join("")}</div>` : ""}
    <div class="modal-actions">
      ${supCanManage() ? `<button type="button" class="btn-secondary" id="supEval">+ ประเมินผู้ขาย (SE)</button><button type="button" class="btn-primary" id="supEdit">แก้ไข</button>` : ""}
      <button type="button" class="btn-secondary" id="supClose">ปิด</button>
    </div>`;
  const box = document.getElementById("supBody");
  const bd = document.getElementById("supBackdrop");
  const close = () => bd.classList.remove("open");
  document.getElementById("supClose").addEventListener("click", close);
  const ed = document.getElementById("supEdit");
  if (ed) ed.addEventListener("click", () => openSupplierEditor(s.name));
  const ev = document.getElementById("supEval");
  if (ev) ev.addEventListener("click", () => {
    close();
    openDeptModal("sev", null);
    const t = document.getElementById("deptField_title"); if (t) t.value = s.name;
    const d = document.getElementById("deptField_delivery"); if (d && r.onTimePct !== null) d.value = Math.max(1, Math.min(5, Math.round(r.onTimePct / 20)));
  });
  box.querySelectorAll("[data-docno]").forEach((b) => b.addEventListener("click", () => { close(); openDocViewByNo(b.dataset.docno); }));
  box.querySelectorAll("[data-p2pcase]").forEach((b) => b.addEventListener("click", () => { close(); switchView("p2p"); openP2PCase(b.dataset.p2pcase); }));
  box.querySelectorAll("[data-part]").forEach((b) => b.addEventListener("click", () => {
    close();
    const k = b.dataset.part;
    bxModel = MACHINE_MODELS.find((m) => bxRowFor(m, k)) || bxModel;
    bxDetailKey = k; bxTab = "tree"; switchView("bomx");
  }));
  bd.classList.add("open");
}

function openSupplierEditor(name) {
  supEditing = name || "";
  const s = name ? SUPPLIER_LIST.find((x) => x.name === name) : { name: "", category: "", leadTime: 14, rating: 0, status: "Active" };
  const f = (id, label, v, type, ph) => `<div class="form-field"><label for="sup_${id}">${label}</label><input id="sup_${id}"${type ? ` type="${type}"` : ""} value="${escapeHtml(v ?? "")}"${ph ? ` placeholder="${escapeHtml(ph)}"` : ""}></div>`;
  const codes = typeof bomPartOptions === "function" ? bomPartOptions() : [];
  document.getElementById("supBody").innerHTML = `
    <h3>${name ? `แก้ไขผู้ขาย: ${escapeHtml(name)}` : "เพิ่มผู้ขายใหม่"}</h3>
    <div class="modal-grid">
      ${f("name", "ชื่อผู้ขาย *", s.name, "", "เช่น บจก. ตัวอย่างซัพพลาย")}
      ${f("category", "ประเภทสินค้า", s.category, "", "เช่น ตลับลูกปืน / ซีล")}
      ${f("contact", "ผู้ติดต่อ", s.contact)}
      ${f("phone", "โทรศัพท์", s.phone)}
      ${f("email", "อีเมล", s.email, "email")}
      ${f("taxId", "เลขผู้เสียภาษี", s.taxId)}
      ${f("terms", "เงื่อนไขชำระเงิน", s.terms, "", "เช่น เครดิต 30 วัน")}
      ${f("leadTime", "Lead time ตกลง (วัน)", s.leadTime, "number")}
      ${f("rating", "คะแนนตั้งต้น (1–5) — ถ้ามีผลประเมิน SE จะใช้ค่าจาก SE", s.rating, "number")}
      <div class="form-field"><label for="sup_status">สถานะ</label><select id="sup_status">${SUP_STATUSES.map((x) => `<option value="${x}"${x === s.status ? " selected" : ""}>${escapeHtml(SUP_STATUS_TH[x])}</option>`).join("")}</select></div>
    </div>
    ${f("address", "ที่อยู่", s.address)}
    <div class="form-field"><label for="sup_parts">รหัสชิ้นส่วนที่ซื้อจากผู้ขายนี้ (คั่นด้วย , )</label><input id="sup_parts" list="sup_partlist" value="${escapeHtml(s.parts || "")}" placeholder="เช่น GR-2001-03, GR-2001-04"><datalist id="sup_partlist">${codes.map((p) => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.part)}</option>`).join("")}</datalist></div>
    ${f("note", "หมายเหตุ", s.note)}
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="supCancel">ยกเลิก</button>
      <button type="button" class="btn-primary" id="supSave">บันทึก</button>
    </div>`;
  document.getElementById("supCancel").addEventListener("click", () => document.getElementById("supBackdrop").classList.remove("open"));
  document.getElementById("supSave").addEventListener("click", saveSupplierEditor);
  document.getElementById("supBackdrop").classList.add("open");
  setTimeout(() => document.getElementById("sup_name").focus(), 0);
}

function saveSupplierEditor() {
  const v = (k) => document.getElementById(`sup_${k}`).value.trim();
  const name = v("name");
  if (!name) { document.getElementById("sup_name").focus(); return; }
  if (SUPPLIER_LIST.some((x) => x.name === name && x.name !== supEditing)) { showToast("มีผู้ขายชื่อนี้แล้ว", "warn"); return; }
  const data = {
    name, category: v("category"), contact: v("contact"), phone: v("phone"), email: v("email"), taxId: v("taxId"), terms: v("terms"),
    leadTime: Number(v("leadTime")) || 0, rating: Math.max(0, Math.min(5, Number(v("rating")) || 0)), status: v("status"),
    address: v("address"), parts: v("parts").split(/[,\s]+/).filter(Boolean).join(", "), note: v("note"),
  };
  if (supEditing) {
    const s = SUPPLIER_LIST.find((x) => x.name === supEditing);
    const before = Object.assign({}, s);
    Object.assign(s, data);
    // a rename follows through to purchasing and claims so history stays linked
    if (supEditing !== name) {
      (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).forEach((c) => { if (c.supplier === supEditing) c.supplier = name; });
      PO_LIST.forEach((p) => { if (p.supplier === supEditing) p.supplier = name; });
      (DEPT_DOCS.svc || []).forEach((d) => { if (d.supplier === supEditing) d.supplier = name; });
      (DEPT_DOCS.sev || []).forEach((d) => { if (d.title === supEditing) d.title = name; });
      if (typeof saveP2P === "function") saveP2P();
      saveDeptDocs();
    }
    const fields = [["name", "ชื่อ"], ["category", "ประเภท"], ["contact", "ผู้ติดต่อ"], ["phone", "โทร"], ["email", "อีเมล"], ["terms", "เงื่อนไข"], ["leadTime", "Lead time"], ["rating", "คะแนน"], ["status", "สถานะ"], ["parts", "ชิ้นส่วน"]].map(([key, label]) => ({ key, label }));
    if (typeof auditLog === "function") auditLog("แก้ไขผู้ขาย", name, auditDiff(before, s, fields) || "ไม่มีการเปลี่ยนแปลง");
  } else {
    SUPPLIER_LIST.push(data);
    if (typeof auditLog === "function") auditLog("เพิ่มผู้ขาย", name, `${data.category} · Lead time ${data.leadTime} วัน`);
  }
  saveProcurement();
  document.getElementById("supBackdrop").classList.remove("open");
  renderProcurement();
  openSupplier(name);
  showToast(`บันทึกผู้ขาย "${name}" แล้ว`, "good");
}

function initSuppliers() {
  const bd = document.getElementById("supBackdrop");
  if (!bd) return;
  bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) bd.classList.remove("open"); });
  document.getElementById("supAddBtn").addEventListener("click", () => openSupplierEditor(""));
  document.getElementById("supSearch").addEventListener("input", (e) => { supSearch = e.target.value; renderSupplierTable(); });
}
