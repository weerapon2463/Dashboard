/* ==========================================================================
   บริการหลังการขาย — installed base (MC documents), service orders (SV),
   warranty status, spare parts drawn from each machine's BOM (through the
   requisition flow in bomx.js), warranty-claim follow-up with suppliers,
   and feedback of frequently replaced parts to R&D.
   ========================================================================== */

let svTab = "orders";
let svFilter = "open";
let svSearch = "";
let svClaimFilter = "open";
let svOpenNo = null;       // service order shown in the modal
let svOpenMachineNo = null;

const SV_REPAIR_KINDS = ["ซ่อม (Breakdown)", "เคลมประกัน"];
const SV_CLAIM_DONE = ["ได้รับเปลี่ยน / คืนเงินแล้ว", "ผู้ขายปฏิเสธ", "ไม่เคลมผู้ขาย (รับผิดชอบเอง)"];

function svDocs(type) { return (DEPT_DOCS[type] || []).filter((d) => typeof authCanSeeDoc !== "function" || authCanSeeDoc(type, d)); }
function svIndex(type, no) { return (DEPT_DOCS[type] || []).findIndex((d) => d.no === no); }
function svMachine(doc) { return (DEPT_DOCS.mc || []).find((m) => m.no === doc.machine) || null; }
function svModel(doc) { const m = svMachine(doc); return doc.model || (m && m.model) || ""; }
function svCustomer(doc) { const m = svMachine(doc); return doc.customer || (m && m.customer) || ""; }
function svIsOpen(doc) { return !(DOC_TYPES.svc.closed || []).includes(doc.status); }
function svAddMonths(iso, n) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return "";
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function svWarrantyEnd(mc) { return mc ? mc.warranty || svAddMonths(mc.delivered, 12) : ""; }
function svInWarranty(mc, atIso) { const e = svWarrantyEnd(mc); return !!e && (atIso || bxToday()) <= e; }
function svWarrantyPill(mc, atIso) {
  const e = svWarrantyEnd(mc);
  if (!e) return bxPill("ไม่ทราบ", "neutral");
  if (!svInWarranty(mc, atIso)) return bxPill(`หมดประกัน ${formatThaiDate(e)}`, "neutral");
  const left = bxDaysBetween(bxToday(), e);
  return bxPill(`ในประกัน ถึง ${formatThaiDate(e)}`, left <= 60 ? "warning" : "good");
}
function svTickets(mc) { return svDocs("svc").filter((d) => d.machine === mc.no); }
function svLastPmDate(mc) {
  const pm = svTickets(mc).filter((d) => /PM|ตรวจเช็ค/.test(d.kind || "") && !svIsOpen(d) && d.status !== "ยกเลิก")
    .map((d) => d.appt || d.date).filter(Boolean).sort();
  return pm.length ? pm[pm.length - 1] : mc.delivered || "";
}
function svNextPm(mc) { return svAddMonths(svLastPmDate(mc), 6); }
function svReqsFor(no) { return (typeof bxReqs === "function" ? bxReqs() : []).filter((d) => d.wo === no && bxReqVisible(d)); }
function svPartsSummary(no) {
  const reqs = svReqsFor(no);
  if (!reqs.length) return "";
  const open = reqs.filter((d) => BX_OPEN_REQ.includes(d.status));
  return open.length ? bxPill(`รออะไหล่ ${open.length} ใบ`, "critical") : bxPill(`เบิกแล้ว ${reqs.length} ใบ`, "good");
}
function svIsClaim(d) { return d.kind === "เคลมประกัน" || !!d.claimCause; }
function svClaimOpen(d) { return !SV_CLAIM_DONE.includes(d.claimStatus || "") && d.status !== "ยกเลิก"; }

function initService() {
  document.querySelectorAll("[data-svtab]").forEach((b) => b.addEventListener("click", () => { svTab = b.dataset.svtab; renderService(); }));
  const bd = document.getElementById("svBackdrop");
  if (bd) bd.addEventListener("click", (e) => { if (e.target === e.currentTarget) svCloseModal(); });
}

function svCloseModal() {
  document.getElementById("svBackdrop").classList.remove("open");
  svOpenNo = null;
  svOpenMachineNo = null;
}

function renderService() {
  const pane = document.getElementById("svPane");
  if (!pane || !DOC_TYPES.svc) return;
  document.querySelectorAll("[data-svtab]").forEach((b) => b.classList.toggle("active", b.dataset.svtab === svTab));
  renderSvStats();
  if (svTab === "orders") renderSvOrders(pane);
  else if (svTab === "machines") renderSvMachines(pane);
  else if (svTab === "claims") renderSvClaims(pane);
  else renderSvParts(pane);
  if (document.getElementById("svBackdrop").classList.contains("open")) {
    if (svOpenNo) svRenderOrderModal(); else if (svOpenMachineNo) svRenderMachineModal();
  }
}

function renderSvStats() {
  const el = document.getElementById("svStats");
  if (!el) return;
  const mcs = svDocs("mc").filter((m) => m.status !== "หยุดใช้งาน");
  const inW = mcs.filter((m) => svInWarranty(m)).length;
  const open = svDocs("svc").filter(svIsOpen);
  const urgent = open.filter((d) => d.status === "รออะไหล่" || /ด่วนมาก/.test(d.priority || "")).length;
  const claims = svDocs("svc").filter((d) => svIsClaim(d) && svClaimOpen(d));
  const claimValue = claims.reduce((s, d) => s + bxNum(d.claimAmount), 0);
  const in30 = svAddMonths(bxToday(), 1);
  const pmDue = mcs.filter((m) => { const n = svNextPm(m); return n && n <= in30; }).length;
  const tile = (label, value, note, tone) => `<div class="stat-tile${tone ? ` bx-tile-${tone}` : ""}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
  el.innerHTML = [
    tile("เครื่องในมือลูกค้า", mcs.length, `อยู่ในประกัน ${inW} คัน`),
    tile("งานบริการเปิดอยู่", open.length, `รับแจ้ง ${open.filter((d) => d.status === "รับแจ้ง").length} · นัดแล้ว ${open.filter((d) => d.status === "นัดหมายแล้ว").length}`, open.length ? "warn" : ""),
    tile("ด่วนมาก / รออะไหล่", urgent, "เครื่องลูกค้าหยุด หรือรอของ", urgent ? "bad" : ""),
    tile("งานเคลมที่ยังไม่จบ", claims.length, `มูลค่าเรียกคืนจากผู้ขาย ${claimValue.toLocaleString("th-TH")} บาท`, claims.length ? "warn" : ""),
    tile("PM / ตรวจเช็คถึงกำหนด", pmDue, "ภายใน 30 วัน (รอบ 6 เดือน)", pmDue ? "warn" : ""),
    tile("ใบงานปิดแล้ว", svDocs("svc").filter((d) => d.status === "ปิดงาน").length, "ลูกค้ารับรองผลแล้ว"),
  ].join("");
  const cc = document.getElementById("svClaimCount");
  if (cc) cc.textContent = claims.length;
}

/* ---- tab: service orders --------------------------------------------------- */

function renderSvOrders(pane) {
  const role = currentRole();
  const q = svSearch.trim().toLowerCase();
  const list = svDocs("svc").filter((d) => {
    if (svFilter === "open" && !svIsOpen(d)) return false;
    if (svFilter === "urgent" && !(svIsOpen(d) && (d.status === "รออะไหล่" || /ด่วนมาก/.test(d.priority || "")))) return false;
    if (svFilter === "warranty" && !(svIsOpen(d) && svInWarranty(svMachine(d), d.date))) return false;
    if (svFilter === "closed" && svIsOpen(d)) return false;
    const m = svMachine(d);
    if (q && ![d.no, d.title, d.tech, d.kind, svCustomer(d), svModel(d), m && m.title].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const filters = [["open", "ยังไม่ปิด"], ["urgent", "ด่วนมาก / รออะไหล่"], ["warranty", "อยู่ในประกัน"], ["closed", "ปิดแล้ว"], ["all", "ทั้งหมด"]];
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div>
          <h3>งานบริการ — รับแจ้ง → นัดหมาย → ดำเนินการ → ลูกค้ารับรอง → ปิดงาน</h3>
          <p class="card-sub">กดเลขที่เพื่อดูรายละเอียด เลื่อนสถานะ เบิกอะไหล่ตาม BOM ของเครื่อง และดูประวัติเครื่อง</p>
        </div>
        ${deptCanCreate(role, "svc") ? `<button class="btn-primary" type="button" id="svNewOrder">+ แจ้งงานบริการ</button>` : ""}
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <label for="svFilter">แสดง:</label>
          <select id="svFilter">${filters.map(([v, t]) => `<option value="${v}"${v === svFilter ? " selected" : ""}>${t}</option>`).join("")}</select>
          <label for="svSearch">ค้นหา:</label>
          <input type="text" id="svSearch" class="wo-search" placeholder="SV / ลูกค้า / หมายเลขเครื่อง / ช่าง" value="${bxEsc(svSearch)}">
        </div>
        <table class="data-table">
          <thead><tr><th>เลขที่</th><th>งาน</th><th>เครื่อง / ลูกค้า</th><th>ประเภท</th><th>ความเร่งด่วน</th><th>ช่าง</th><th>นัดหมาย</th><th class="num">รอมา</th><th>ประกัน</th><th>อะไหล่</th><th>สถานะ</th></tr></thead>
          <tbody>${list.map((d) => {
            const m = svMachine(d);
            const age = svIsOpen(d) ? bxDaysBetween(d.date, bxToday()) : "";
            return `<tr>
              <td><button type="button" class="bx-link" data-svorder="${bxEsc(d.no)}">${bxEsc(d.no)}</button></td>
              <td>${bxEsc(d.title)}</td>
              <td>${m ? `<button type="button" class="bx-link" data-svmachine="${bxEsc(m.no)}">${bxEsc(m.title)}</button>` : "—"}<div class="muted-inline">${bxEsc(svCustomer(d))} · ${bxEsc(svModel(d))}</div></td>
              <td>${bxEsc(d.kind || "—")}</td>
              <td>${/ด่วนมาก/.test(d.priority || "") ? bxPill(d.priority, "critical") : bxEsc(d.priority || "—")}</td>
              <td>${bxEsc(d.tech || "—")}</td>
              <td>${d.appt ? formatThaiDate(d.appt) : "—"}</td>
              <td class="num">${age === "" ? "" : `<span class="${age >= 3 ? "bx-neg" : ""}">${age} วัน</span>`}</td>
              <td>${m ? (svInWarranty(m, d.date) ? bxPill("ในประกัน", "good") : bxPill("นอกประกัน", "neutral")) : "—"}</td>
              <td>${svPartsSummary(d.no)}</td>
              <td>${bxStatusPill("svc", d.status)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="11" class="muted-inline">ไม่มีงานบริการตามตัวกรองนี้</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("svFilter").addEventListener("change", (e) => { svFilter = e.target.value; renderService(); });
  document.getElementById("svSearch").addEventListener("input", (e) => {
    svSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderService();
    const el = document.getElementById("svSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  const nb = document.getElementById("svNewOrder");
  if (nb) nb.addEventListener("click", () => svNewOrder(""));
  svWire(pane);
}

function svWire(root) {
  root.querySelectorAll("[data-svorder]").forEach((b) => b.addEventListener("click", () => svOpenOrder(b.dataset.svorder)));
  root.querySelectorAll("[data-svmachine]").forEach((b) => b.addEventListener("click", () => svOpenMachine(b.dataset.svmachine)));
  root.querySelectorAll("button.rel-chip[data-docno]").forEach((b) => b.addEventListener("click", () => { svCloseModal(); openDocViewByNo(b.dataset.docno); }));
  root.querySelectorAll("[data-openreq]").forEach((b) => b.addEventListener("click", () => { svCloseModal(); bxOpenReq(b.dataset.openreq); }));
  root.querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.detail;
    svCloseModal();
    bxModel = MACHINE_MODELS.find((m) => bxRowFor(m, k)) || bxModel;
    bxDetailKey = k; bxTab = "tree";
    switchView("bomx");
  }));
}

function svNewOrder(machineNo) {
  svCloseModal();
  openDeptModal("svc", null);
  const set = (k, v) => { const el = document.getElementById(`deptField_${k}`); if (el && v !== undefined) el.value = v; };
  set("date", bxToday());
  if (machineNo) set("machine", machineNo);
}

/* ---- service order modal ------------------------------------------------------- */

function svOpenOrder(no) {
  svOpenNo = no;
  svOpenMachineNo = null;
  svRenderOrderModal();
  document.getElementById("svBackdrop").classList.add("open");
}

function svRenderOrderModal() {
  const idx = svIndex("svc", svOpenNo);
  const box = document.getElementById("svBody");
  if (idx < 0 || !box) return;
  const d = DEPT_DOCS.svc[idx];
  const m = svMachine(d);
  const role = currentRole();
  const canManage = deptCanManage(role, "svc");
  const next = deptNextStatus("svc", d.status);
  const flow = DOC_TYPES.svc.flow;
  const pos = flow.indexOf(d.status);
  const reqs = svReqsFor(d.no);
  const related = typeof relatedDocs === "function" ? relatedDocs(d) : [];
  const model = svModel(d);
  const bomRev = m && m.rev ? m.rev : "";
  const curRev = BOM_META[model] ? BOM_META[model].rev : "";
  const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  box.innerHTML = `
    <h3>${bxEsc(d.no)} ${bxStatusPill("svc", d.status)}</h3>
    <p class="card-sub">${bxEsc(d.title)}</p>
    <div class="paper-flow bx-flow">${flow.map((s, i) => `<span class="flow-step${i < pos ? " done" : ""}${i === pos ? " current" : ""}">${bxEsc(s)}</span>`).join('<span class="flow-arrow">→</span>')}${pos < 0 ? `<span class="flow-step current off">${bxEsc(d.status)}</span>` : ""}</div>
    <div class="bx-detail-grid">
      <table class="data-table bx-kv"><tbody>
        ${row("เครื่อง", m ? `<button type="button" class="bx-link" data-svmachine="${bxEsc(m.no)}">${bxEsc(m.title)}</button> (${bxEsc(m.no)})` : "—")}
        ${row("ลูกค้า", bxEsc(svCustomer(d) || "—"))}
        ${row("รุ่น / BOM", `${bxEsc(model || "—")}${bomRev ? ` · ส่งมอบ Rev.${bxEsc(bomRev)}` : ""}${curRev && bomRev && curRev !== bomRev ? ` <span class="pill pill-warning">ปัจจุบัน Rev.${bxEsc(curRev)}</span>` : ""}`)}
        ${row("ประกัน", m ? svWarrantyPill(m, d.date) : "—")}
        ${row("ประเภทงาน", bxEsc(d.kind || "—"))}
        ${row("ความเร่งด่วน", bxEsc(d.priority || "—"))}
      </tbody></table>
      <table class="data-table bx-kv"><tbody>
        ${row("ช่างบริการ", bxEsc(d.tech || "ยังไม่มอบหมาย"))}
        ${row("รับแจ้ง / นัดหมาย", `${formatThaiDate(d.date)} / ${d.appt ? formatThaiDate(d.appt) : "—"}`)}
        ${row("ค่าบริการ", d.cost ? `${bxNum(d.cost).toLocaleString("th-TH")} บาท` : "—")}
        ${svIsClaim(d) ? row("เคลม", `${bxEsc(d.claimCause || "ยังไม่ระบุสาเหตุ")}${d.supplier ? ` · ${bxEsc(d.supplier)}` : ""} · ${bxEsc(d.claimStatus || "ยังไม่ส่งเคลม")}${d.claimRef ? ` (${bxEsc(d.claimRef)})` : ""}${d.claimAmount ? ` · ${bxNum(d.claimAmount).toLocaleString("th-TH")} บาท` : ""}`) : ""}
        ${d.detail ? row("สาเหตุ / การแก้ไข", bxEsc(d.detail)) : ""}
      </tbody></table>
    </div>
    <h4 class="bx-h4">อะไหล่ที่เบิกสำหรับงานนี้</h4>
    ${reqs.length ? `<table class="data-table"><thead><tr><th>ใบเบิก</th><th>รายการ</th><th>ผู้รับของ</th><th>สถานะ</th></tr></thead><tbody>${reqs.map((r) => `<tr><td><button type="button" class="bx-link" data-openreq="${bxEsc(r.no)}">${bxEsc(r.no)}</button></td><td>${r.items.map((it) => `${bxEsc(it.code || "")} ${bxEsc(it.part)} × ${bxFmt(it.req)} (จ่าย ${bxFmt(it.issued)})`).join("<br>")}</td><td>${bxEsc(r.owner || "")}</td><td>${bxStatusPill("mreq", r.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ยังไม่ได้เบิกอะไหล่</p>`}
    ${related.length ? `<h4 class="bx-h4">เอกสารที่เกี่ยวข้อง</h4><div>${related.map((r) => `<button type="button" class="rel-chip" data-docno="${bxEsc(r.doc.no)}"><span class="rel-dir">${bxEsc(r.dir)}</span> ${bxEsc(r.doc.no)} — ${bxEsc(String(r.doc.title || "").slice(0, 36))} <span class="rel-status">(${bxEsc(r.doc.status)})</span></button>`).join("")}</div>` : ""}
    <div class="modal-actions">
      ${canManage && next ? `<button type="button" class="btn-primary" id="svNext">→ ${bxEsc(next)}</button>` : ""}
      ${canManage && svIsOpen(d) && d.status !== "รออะไหล่" ? `<button type="button" class="btn-secondary" id="svWaitParts">รออะไหล่</button>` : ""}
      ${svIsOpen(d) && bxCanRequest() && model ? `<button type="button" class="btn-secondary" id="svPick">เบิกอะไหล่จาก BOM ${bxEsc(model)}</button>` : ""}
      ${canManage ? `<button type="button" class="btn-secondary" id="svEdit">แก้ไข</button>` : ""}
      <button type="button" class="btn-secondary" id="svPaper">📄 ใบงาน / PDF</button>
      <button type="button" class="btn-secondary" id="svClose">ปิด</button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  $("svClose").addEventListener("click", svCloseModal);
  $("svPaper").addEventListener("click", () => { svCloseModal(); openDocView("svc", idx); });
  if ($("svEdit")) $("svEdit").addEventListener("click", () => { svCloseModal(); openDeptModal("svc", idx); });
  if ($("svNext")) $("svNext").addEventListener("click", () => svSetStatus(d, next));
  if ($("svWaitParts")) $("svWaitParts").addEventListener("click", () => svSetStatus(d, "รออะไหล่"));
  if ($("svPick")) $("svPick").addEventListener("click", () => { svCloseModal(); bxRef = d.no; bxTab = "pick"; switchView("bomx"); });
  svWire(box);
}

function svSetStatus(d, status) {
  const before = d.status;
  d.status = status;
  if (typeof stampRecord === "function" && bxUser()) stampRecord(d, false);
  if (typeof auditLog === "function") auditLog("แก้ไขเอกสาร", d.no, `สถานะ: "${before}" → "${status}"`);
  // a repair in progress puts the customer's machine "under repair"; closing the last one puts it back
  const m = svMachine(d);
  if (m && SV_REPAIR_KINDS.includes(d.kind)) {
    const mBefore = m.status;
    if (["กำลังดำเนินการ", "รออะไหล่"].includes(status)) m.status = "อยู่ระหว่างซ่อม";
    else if (!svIsOpen(d) || status === "เสร็จ รอลูกค้ารับรอง") {
      const others = svTickets(m).filter((x) => x !== d && svIsOpen(x) && SV_REPAIR_KINDS.includes(x.kind) && ["กำลังดำเนินการ", "รออะไหล่"].includes(x.status));
      if (!others.length && m.status === "อยู่ระหว่างซ่อม") m.status = "ใช้งานปกติ";
    }
    if (m.status !== mBefore && typeof auditLog === "function") auditLog("แก้ไขเอกสาร", m.no, `สถานะ: "${mBefore}" → "${m.status}" (ตาม ${d.no})`);
  }
  saveDeptDocs();
  if (typeof renderDept === "function") renderDept();
  if (typeof renderBomx === "function") renderBomx();
  renderService();
  showToast(`${d.no}: ${status}`, "good");
}

/* ---- tab: installed base ------------------------------------------------------ */

function renderSvMachines(pane) {
  const role = currentRole();
  const q = svSearch.trim().toLowerCase();
  const list = svDocs("mc").filter((m) => !q || [m.no, m.title, m.customer, m.model, m.location].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => String(b.delivered).localeCompare(String(a.delivered)));
  pane.innerHTML = `
    <div class="card">
      <div class="card-header card-header-actions">
        <div>
          <h3>ทะเบียนเครื่องลูกค้า (Installed Base)</h3>
          <p class="card-sub">หมายเลขเครื่องทุกคันที่ส่งมอบ พร้อม BOM Rev. ที่ส่งมอบ (ใช้เลือกอะไหล่ให้ตรงรุ่น) วันหมดประกัน และรอบ PM ถัดไป</p>
        </div>
        ${deptCanCreate(role, "mc") ? `<button class="btn-primary" type="button" id="svNewMachine">+ ลงทะเบียนเครื่อง</button>` : ""}
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row"><label for="svSearch">ค้นหา:</label><input type="text" id="svSearch" class="wo-search" placeholder="หมายเลขเครื่อง / ลูกค้า / รุ่น / จังหวัด" value="${bxEsc(svSearch)}"></div>
        <table class="data-table">
          <thead><tr><th>หมายเลขเครื่อง</th><th>รุ่น / BOM</th><th>ลูกค้า / สถานที่</th><th>ส่งมอบ</th><th>ประกัน</th><th class="num">ชม.ใช้งาน</th><th class="num">งานเปิด</th><th>PM ถัดไป</th><th>สถานะ</th></tr></thead>
          <tbody>${list.map((m) => {
            const t = svTickets(m);
            const nextPm = svNextPm(m);
            return `<tr>
              <td><button type="button" class="bx-link" data-svmachine="${bxEsc(m.no)}">${bxEsc(m.title)}</button><div class="muted-inline">${bxEsc(m.no)}</div></td>
              <td>${bxEsc(m.model || "—")}${m.rev ? ` <span class="muted-inline">Rev.${bxEsc(m.rev)}</span>` : ""}</td>
              <td>${bxEsc(m.customer || "—")}<div class="muted-inline">${bxEsc(m.location || "")}</div></td>
              <td>${m.delivered ? formatThaiDate(m.delivered) : "—"}</td>
              <td>${svWarrantyPill(m)}</td>
              <td class="num">${m.hours ? bxFmt(m.hours) : "—"}</td>
              <td class="num">${t.filter(svIsOpen).length || ""}</td>
              <td>${nextPm ? `<span class="${nextPm <= bxToday() ? "bx-neg" : ""}">${formatThaiDate(nextPm)}</span>` : "—"}</td>
              <td>${bxStatusPill("mc", m.status)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="9" class="muted-inline">ยังไม่มีเครื่องในทะเบียน</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("svSearch").addEventListener("input", (e) => {
    svSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderService();
    const el = document.getElementById("svSearch"); el.focus(); el.setSelectionRange(pos, pos);
  });
  const nb = document.getElementById("svNewMachine");
  if (nb) nb.addEventListener("click", () => {
    openDeptModal("mc", null);
    const el = document.getElementById("deptField_delivered"); if (el) el.value = bxToday();
  });
  svWire(pane);
}

function svOpenMachine(no) {
  svOpenMachineNo = no;
  svOpenNo = null;
  svRenderMachineModal();
  document.getElementById("svBackdrop").classList.add("open");
}

function svRenderMachineModal() {
  const idx = svIndex("mc", svOpenMachineNo);
  const box = document.getElementById("svBody");
  if (idx < 0 || !box) return;
  const m = DEPT_DOCS.mc[idx];
  const role = currentRole();
  const tickets = svTickets(m).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const parts = {};
  tickets.forEach((t) => svReqsFor(t.no).forEach((r) => r.items.forEach((it) => {
    const p = parts[it.key] = parts[it.key] || { it, qty: 0, jobs: [] };
    p.qty += bxNum(it.issued) - bxNum(it.ret);
    if (!p.jobs.includes(t.no)) p.jobs.push(t.no);
  })));
  const ccs = svDocs("cc").filter((c) => (m.customer && c.customer === m.customer && (!c.model || c.model === m.model)) || tickets.some((t) => t.cc === c.no));
  const curRev = BOM_META[m.model] ? BOM_META[m.model].rev : "";
  const end = svWarrantyEnd(m);
  const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  box.innerHTML = `
    <h3>${bxEsc(m.title)} ${bxStatusPill("mc", m.status)}</h3>
    <p class="card-sub">${bxEsc(m.no)} · ${bxEsc(m.model || "")} · ${bxEsc(m.customer || "")}</p>
    <div class="bx-detail-grid">
      <table class="data-table bx-kv"><tbody>
        ${row("ลูกค้า / สถานที่", `${bxEsc(m.customer || "—")}<div class="muted-inline">${bxEsc(m.location || "")}</div>`)}
        ${row("ส่งมอบ", m.delivered ? formatThaiDate(m.delivered) : "—")}
        ${row("ประกัน", `${svWarrantyPill(m)}${end && svInWarranty(m) ? ` <span class="muted-inline">เหลือ ${bxDaysBetween(bxToday(), end)} วัน</span>` : ""}`)}
        ${row("ชั่วโมงใช้งาน", m.hours ? bxFmt(m.hours) : "—")}
      </tbody></table>
      <table class="data-table bx-kv"><tbody>
        ${row("BOM ที่ส่งมอบ", `${bxEsc(m.model || "")} Rev.${bxEsc(m.rev || "?")}${curRev && m.rev && curRev !== m.rev ? ` <span class="pill pill-warning">ปัจจุบัน Rev.${bxEsc(curRev)} — ตรวจการเปลี่ยนแปลงก่อนเบิกอะไหล่</span>` : ""}`)}
        ${row("อ้างอิง", `${m.so ? `<button type="button" class="rel-chip" data-docno="${bxEsc(m.so)}">${bxEsc(m.so)}</button>` : ""}${m.wo ? ` ${bxEsc(m.wo)}` : ""}` || "—")}
        ${row("PM / ตรวจเช็คครั้งถัดไป", svNextPm(m) ? formatThaiDate(svNextPm(m)) : "—")}
        ${row("ผู้ดูแลลูกค้า", bxEsc(m.owner || "—"))}
      </tbody></table>
    </div>
    <h4 class="bx-h4">ประวัติบริการ (${tickets.length})</h4>
    ${tickets.length ? `<table class="data-table"><thead><tr><th>เลขที่</th><th>วันที่</th><th>งาน</th><th>ประเภท</th><th>ช่าง</th><th>สถานะ</th></tr></thead><tbody>${tickets.map((t) => `<tr><td><button type="button" class="bx-link" data-svorder="${bxEsc(t.no)}">${bxEsc(t.no)}</button></td><td>${formatThaiDate(t.date)}</td><td>${bxEsc(t.title)}</td><td>${bxEsc(t.kind || "")}</td><td>${bxEsc(t.tech || "")}</td><td>${bxStatusPill("svc", t.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted-inline">ยังไม่มีงานบริการ</p>`}
    <h4 class="bx-h4">อะไหล่ที่เปลี่ยนให้เครื่องนี้</h4>
    ${Object.keys(parts).length ? `<ul class="bx-list">${Object.values(parts).map((p) => `<li><button type="button" class="bx-link" data-detail="${bxEsc(p.it.key)}">${bxEsc(p.it.code || "")} ${bxEsc(p.it.part)}</button> × ${bxFmt(p.qty)} ${bxEsc(p.it.unit || "")} <span class="muted-inline">(${bxEsc(p.jobs.join(", "))})</span></li>`).join("")}</ul>` : `<p class="muted-inline">ยังไม่มีการเปลี่ยนอะไหล่ผ่านระบบ</p>`}
    ${ccs.length ? `<h4 class="bx-h4">ข้อร้องเรียนของลูกค้ารายนี้</h4><div>${ccs.map((c) => `<button type="button" class="rel-chip" data-docno="${bxEsc(c.no)}">${bxEsc(c.no)} — ${bxEsc(c.title)} <span class="rel-status">(${bxEsc(c.status)})</span></button>`).join("")}</div>` : ""}
    <div class="modal-actions">
      ${deptCanCreate(role, "svc") ? `<button type="button" class="btn-primary" id="svMNew">+ แจ้งงานบริการเครื่องนี้</button>` : ""}
      ${m.model && MASTER_BOM[m.model] ? `<button type="button" class="btn-secondary" id="svMBom">📄 BOM ${bxEsc(m.model)}</button>` : ""}
      ${deptCanManage(role, "mc") ? `<button type="button" class="btn-secondary" id="svMEdit">แก้ไข</button>` : ""}
      <button type="button" class="btn-secondary" id="svMPaper">📄 ทะเบียนเครื่อง / PDF</button>
      <button type="button" class="btn-secondary" id="svMClose">ปิด</button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  $("svMClose").addEventListener("click", svCloseModal);
  $("svMPaper").addEventListener("click", () => { svCloseModal(); openDocView("mc", idx); });
  if ($("svMNew")) $("svMNew").addEventListener("click", () => svNewOrder(m.no));
  if ($("svMBom")) $("svMBom").addEventListener("click", () => { svCloseModal(); openBomSheet(m.model); });
  if ($("svMEdit")) $("svMEdit").addEventListener("click", () => { svCloseModal(); openDeptModal("mc", idx); });
  svWire(box);
}

/* ---- tab: warranty claims --------------------------------------------------------- */

function renderSvClaims(pane) {
  const all = svDocs("svc").filter(svIsClaim);
  const list = all.filter((d) => svClaimFilter === "all" || (svClaimFilter === "open" ? svClaimOpen(d) : !svClaimOpen(d)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const bySupplier = {};
  all.filter((d) => d.supplier).forEach((d) => {
    const s = bySupplier[d.supplier] = bySupplier[d.supplier] || { n: 0, open: 0, amount: 0, got: 0 };
    s.n += 1;
    if (svClaimOpen(d)) s.open += 1;
    s.amount += bxNum(d.claimAmount);
    if (d.claimStatus === "ได้รับเปลี่ยน / คืนเงินแล้ว") s.got += bxNum(d.claimAmount);
  });
  const byCause = {};
  all.forEach((d) => { const c = d.claimCause || "ยังไม่ระบุสาเหตุ"; byCause[c] = (byCause[c] || 0) + 1; });
  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>ติดตามงานเคลม — ลูกค้าเคลมเรา → เราแก้ไขให้ลูกค้า → เคลมต่อกับผู้ขาย</h3>
        <p class="card-sub">ทุกใบงานประเภท "เคลมประกัน" หรือที่ระบุสาเหตุเคลม · แก้สาเหตุ/ผู้ขาย/สถานะเคลมได้ที่ปุ่ม "แก้ไข" ในใบงาน · สาเหตุจากการผลิตหรือการออกแบบควรเปิด NCR / ECR เพื่อไม่ให้เกิดซ้ำ</p>
      </div>
      <div class="card-body table-scroll">
        <div class="filter-row">
          <label for="svClaimFilter">แสดง:</label>
          <select id="svClaimFilter">${[["open", "ยังไม่จบ"], ["done", "จบแล้ว"], ["all", "ทั้งหมด"]].map(([v, t]) => `<option value="${v}"${v === svClaimFilter ? " selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <table class="data-table">
          <thead><tr><th>ใบงาน</th><th>อาการ</th><th>เครื่อง / ลูกค้า</th><th>สาเหตุ</th><th>ผู้ขาย</th><th>สถานะเคลมผู้ขาย</th><th class="num">มูลค่า</th><th class="num">เปิดมา</th><th>งานบริการ</th><th>เอกสารแก้ไข/ป้องกัน</th></tr></thead>
          <tbody>${list.map((d) => {
            const m = svMachine(d);
            const rel = (typeof relatedDocs === "function" ? relatedDocs(d) : []).filter((r) => ["ncr", "capa", "ecr", "eo", "cc"].includes(r.type));
            const cs = d.claimStatus || "ยังไม่ส่งเคลม";
            const tone = cs === "ได้รับเปลี่ยน / คืนเงินแล้ว" ? "good" : cs === "ผู้ขายปฏิเสธ" ? "critical" : SV_CLAIM_DONE.includes(cs) ? "neutral" : cs === "ยังไม่ส่งเคลม" ? "warning" : "info";
            return `<tr>
              <td><button type="button" class="bx-link" data-svorder="${bxEsc(d.no)}">${bxEsc(d.no)}</button></td>
              <td>${bxEsc(d.title)}</td>
              <td>${m ? bxEsc(m.title) : "—"}<div class="muted-inline">${bxEsc(svCustomer(d))}</div></td>
              <td>${bxEsc(d.claimCause || "—")}</td>
              <td>${bxEsc(d.supplier || "—")}${d.claimRef ? `<div class="muted-inline">${bxEsc(d.claimRef)}</div>` : ""}</td>
              <td>${bxPill(cs, tone)}</td>
              <td class="num">${d.claimAmount ? bxNum(d.claimAmount).toLocaleString("th-TH") : "—"}</td>
              <td class="num">${svClaimOpen(d) ? `${bxDaysBetween(d.date, bxToday())} วัน` : ""}</td>
              <td>${bxStatusPill("svc", d.status)}</td>
              <td>${rel.map((r) => `<button type="button" class="rel-chip" data-docno="${bxEsc(r.doc.no)}">${bxEsc(r.doc.no)}</button>`).join("") || `<span class="muted-inline">—</span>`}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="10" class="muted-inline">ไม่มีงานเคลมตามตัวกรองนี้</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="p2p-stack">
      <div class="card">
        <div class="card-header"><h3>เคลมแยกตามผู้ขาย</h3><p class="card-sub">ใช้ประกอบการประเมินผู้ขาย (SE) ร่วมกับผลส่งตรงเวลาและ IQC</p></div>
        <div class="card-body table-scroll"><table class="data-table"><thead><tr><th>ผู้ขาย</th><th class="num">เคลม</th><th class="num">ยังไม่จบ</th><th class="num">มูลค่าเรียกคืน</th><th class="num">ได้คืนแล้ว</th></tr></thead>
          <tbody>${Object.keys(bySupplier).map((k) => `<tr><td>${bxEsc(k)}</td><td class="num">${bySupplier[k].n}</td><td class="num">${bySupplier[k].open}</td><td class="num">${bySupplier[k].amount.toLocaleString("th-TH")}</td><td class="num">${bySupplier[k].got.toLocaleString("th-TH")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted-inline">ยังไม่มีเคลมที่ระบุผู้ขาย</td></tr>`}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>เคลมแยกตามสาเหตุ</h3><p class="card-sub">สาเหตุภายใน (ผลิต/ออกแบบ) = โอกาสปรับปรุง</p></div>
        <div class="card-body table-scroll"><table class="data-table"><thead><tr><th>สาเหตุ</th><th class="num">จำนวน</th></tr></thead>
          <tbody>${Object.keys(byCause).sort((a, b) => byCause[b] - byCause[a]).map((k) => `<tr><td>${bxEsc(k)}</td><td class="num">${byCause[k]}</td></tr>`).join("") || `<tr><td colspan="2" class="muted-inline">ยังไม่มีงานเคลม</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  document.getElementById("svClaimFilter").addEventListener("change", (e) => { svClaimFilter = e.target.value; renderService(); });
  svWire(pane);
}

/* ---- tab: parts used + feedback to R&D --------------------------------------------- */

function renderSvParts(pane) {
  const svcNos = new Set(svDocs("svc").map((d) => d.no));
  const parts = {};
  bxReqs().filter((r) => svcNos.has(r.wo) && bxReqVisible(r) && r.status !== "ปฏิเสธ").forEach((r) => r.items.forEach((it) => {
    const p = parts[it.key] = parts[it.key] || { it, used: 0, pending: 0, jobs: new Set(), models: new Set() };
    p.used += bxNum(it.issued) - bxNum(it.ret);
    p.pending += bxItemOutstanding(r, it);
    p.jobs.add(r.wo);
    if (r.model) p.models.add(r.model);
  }));
  const rows = Object.values(parts).sort((a, b) => b.jobs.size - a.jobs.size || b.used - a.used);
  const byKind = {};
  svDocs("svc").forEach((d) => { const k = `${svModel(d) || "?"}|${d.kind || "?"}`; byKind[k] = (byKind[k] || 0) + 1; });
  const canEcr = deptCanCreate(currentRole(), "ecr");
  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>อะไหล่ที่ใช้ในงานบริการ — ส่งข้อมูลย้อนกลับให้วิศวกรรม</h3>
        <p class="card-sub">ชิ้นที่ต้องเปลี่ยนซ้ำหลายงานควรตรวจสาเหตุและเปิดคำขอเปลี่ยนแปลงทางวิศวกรรม (ECR) · ค้างจ่าย = ใบเบิกอะไหล่ที่คลังยังจ่ายไม่ครบ</p>
      </div>
      <div class="card-body table-scroll">
        <table class="data-table">
          <thead><tr><th>ชิ้นส่วน</th><th>รุ่น</th><th class="num">งานที่ใช้</th><th class="num">เปลี่ยนไปแล้ว</th><th class="num">ค้างจ่าย</th><th>คงคลัง</th><th></th></tr></thead>
          <tbody>${rows.map((p) => `<tr>
            <td><button type="button" class="bx-link" data-detail="${bxEsc(p.it.key)}">${bxEsc(p.it.code || "")} ${bxEsc(p.it.part)}</button></td>
            <td>${bxEsc([...p.models].join(", "))}</td>
            <td class="num">${p.jobs.size}</td><td class="num">${bxFmt(p.used)}</td>
            <td class="num">${p.pending ? `<strong class="bx-neg">${bxFmt(p.pending)}</strong>` : "0"}</td>
            <td>${bxStockCell(p.it.key)}</td>
            <td>${canEcr ? `<button type="button" class="btn-chip" data-ecr="${bxEsc(p.it.key)}">เปิด ECR</button>` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="7" class="muted-inline">ยังไม่มีการเบิกอะไหล่ให้งานบริการ</td></tr>`}</tbody>
        </table>
        <h4 class="bx-h4">งานบริการแยกตามรุ่นและประเภท</h4>
        <table class="data-table"><thead><tr><th>รุ่น</th><th>ประเภทงาน</th><th class="num">จำนวนงาน</th></tr></thead>
          <tbody>${Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a]).map((k) => { const [mo, ki] = k.split("|"); return `<tr><td>${bxEsc(mo)}</td><td>${bxEsc(ki)}</td><td class="num">${byKind[k]}</td></tr>`; }).join("")}</tbody></table>
      </div>
    </div>`;
  pane.querySelectorAll("[data-ecr]").forEach((b) => b.addEventListener("click", () => {
    const p = parts[b.dataset.ecr];
    openDeptModal("ecr", null);
    const t = document.getElementById("deptField_title");
    if (t && p) t.value = `ทบทวนการออกแบบ ${p.it.code || ""} ${p.it.part} — เปลี่ยนในงานบริการ ${p.jobs.size} งาน (${[...p.jobs].join(", ")})`;
  }));
  svWire(pane);
}
