/* ==========================================================================
   ตรวจสอบความสอดคล้องของข้อมูล — cross-checks between modules so broken
   links and numbers that disagree are found before anyone relies on them:
   work orders ↔ BOM, requisitions ↔ jobs/BOM/stock, stock, service ↔
   installed base ↔ BOM, claims, purchasing ↔ jobs, document references,
   users ↔ groups/teams/departments. Read-only: it never changes data.
   ========================================================================== */

const IC_SEV = { error: ["ผิดพลาด", "critical"], warn: ["ควรตรวจ", "warning"], info: ["ข้อสังเกต", "info"] };

function icRun() {
  const out = [];
  const add = (sev, area, msg, ref) => out.push({ sev, area, msg, ref: ref || "" });
  const docs = (t) => DEPT_DOCS[t] || [];
  const models = new Set(MACHINE_MODELS);
  const woIds = new Set(WORK_ORDERS.map((w) => w.wo));
  const svcIds = new Set(docs("svc").map((d) => d.no));
  const prefixes = new Set(Object.values(DOC_TYPES).map((d) => d.prefix).filter(Boolean));
  const allDocNos = new Set();
  Object.keys(DEPT_DOCS).forEach((t) => docs(t).forEach((d) => allDocNos.add(d.no)));

  /* ---- BOM ---- */
  MACHINE_MODELS.forEach((m) => {
    const lines = MASTER_BOM[m] || [];
    const meta = BOM_META[m] || {};
    if (!lines.length && meta.status === BOM_RELEASED) add("error", "BOM", `BOM ${m} อนุมัติใช้งานแล้วแต่ไม่มีรายการ`, `bom:${m}`);
    const ids = new Set(lines.map((l) => l.id));
    const codes = {};
    lines.forEach((l) => {
      if (l.parent && !ids.has(l.parent)) add("error", "BOM", `BOM ${m}: "${l.part}" อ้างถึงชุดแม่ที่ไม่มีอยู่`, `bom:${m}`);
      if (!(Number(l.qty) > 0)) add("error", "BOM", `BOM ${m}: "${l.part || "(ไม่มีชื่อ)"}" จำนวนต่อชุดไม่ถูกต้อง (${l.qty})`, `bom:${m}`);
      if (!l.code) add("info", "BOM", `BOM ${m}: "${l.part}" ยังไม่มีรหัสชิ้นส่วน — อ้างอิงข้ามแผนกและเบิกด้วยรหัสไม่ได้`, `bom:${m}`);
      if (l.code) {
        const k = `${l.parent || ""}|${l.code}`;
        if (codes[k]) add("warn", "BOM", `BOM ${m}: รหัส ${l.code} ซ้ำในชุดเดียวกัน`, `bom:${m}`);
        codes[k] = true;
      }
    });
    // parent loops
    lines.forEach((l) => {
      const seen = new Set([l.id]);
      let p = l.parent;
      while (p) {
        if (seen.has(p)) { add("error", "BOM", `BOM ${m}: โครงสร้างวนกลับ (loop) ที่ "${l.part}"`, `bom:${m}`); break; }
        seen.add(p);
        const pl = lines.find((x) => x.id === p);
        p = pl ? pl.parent : "";
      }
    });
    if (meta.status === BOM_DRAFT && WORK_ORDERS.some((w) => w.model === m && w.status !== "เสร็จสมบูรณ์")) add("warn", "BOM", `BOM ${m} Rev.${meta.rev} ยังเป็นร่าง แต่มีใบสั่งผลิตที่กำลังใช้ — ควรอนุมัติก่อนผลิต`, `bom:${m}`);
  });

  /* ---- work orders ---- */
  WORK_ORDERS.forEach((w) => {
    if (!models.has(w.model)) add("error", "ใบสั่งผลิต", `${w.wo}: รุ่น ${w.model} ไม่มี BOM — คำนวณวัสดุ/เบิกไม่ได้`, `wo:${w.wo}`);
    const pct = Number(w.issuedPct);
    if (isNaN(pct) || pct < 0 || pct > 100) add("error", "ใบสั่งผลิต", `${w.wo}: เบิกวัสดุ ${w.issuedPct}% ไม่ถูกต้อง`, `wo:${w.wo}`);
    if (!(Number(w.qty) > 0)) add("error", "ใบสั่งผลิต", `${w.wo}: จำนวนคันไม่ถูกต้อง`, `wo:${w.wo}`);
    const reqs = bxReqs().filter((d) => d.wo === w.wo);
    if (reqs.length && models.has(w.model)) {
      const need = bxRequirement(w.model, Number(w.qty) || 1);
      const use = bxRefUsage(w.wo);
      let tot = 0, got = 0;
      Object.values(need).forEach((n) => { tot += n.req; got += Math.min(n.req, Math.max(0, (use[n.key] || {}).issued || 0)); });
      const calc = tot ? Math.round((got / tot) * 100) : 0;
      if (Math.abs(calc - pct) > 1) add("warn", "ใบสั่งผลิต", `${w.wo}: % เบิกวัสดุที่บันทึก (${pct}%) ไม่ตรงกับใบเบิกจริง (${calc}%)`, `wo:${w.wo}`);
      if (w.status === "เสร็จสมบูรณ์" && reqs.some((d) => BX_OPEN_REQ.includes(d.status))) add("warn", "ใบสั่งผลิต", `${w.wo} ปิดงานแล้ว แต่ยังมีใบเบิกค้าง (${reqs.filter((d) => BX_OPEN_REQ.includes(d.status)).map((d) => d.no).join(", ")})`, `wo:${w.wo}`);
      Object.keys(use).forEach((k) => {
        if (need[k] && use[k].issued > need[k].req) add("warn", "ใบสั่งผลิต", `${w.wo}: เบิก ${k} เกินที่ BOM กำหนด (${bxFmt(use[k].issued)} / ${bxFmt(need[k].req)})`, `wo:${w.wo}`);
      });
    }
    if (w.po && /^SO-/.test(w.po) && !allDocNos.has(w.po)) add("warn", "ใบสั่งผลิต", `${w.wo}: อ้างอิง ${w.po} ที่ไม่มีในระบบ`, `wo:${w.wo}`);
  });

  /* ---- requisitions ---- */
  const users = new Set((typeof AUTH !== "undefined" && AUTH ? AUTH.users : []).map((u) => u.id));
  bxReqs().forEach((d) => {
    const ref = d.wo || "";
    const isWo = /^WO-/.test(ref), isSv = /^SV-/.test(ref);
    if (isWo && !woIds.has(ref)) add("error", "ใบเบิก", `${d.no}: อ้างถึงใบสั่งผลิต ${ref} ที่ไม่มีอยู่`, `mr:${d.no}`);
    if (isSv && !svcIds.has(ref)) add("error", "ใบเบิก", `${d.no}: อ้างถึงงานบริการ ${ref} ที่ไม่มีอยู่`, `mr:${d.no}`);
    if (!isWo && !isSv) add("warn", "ใบเบิก", `${d.no}: ไม่ได้ระบุงานที่เบิก (WO / SV) — ต้นทุนไม่ลงงาน`, `mr:${d.no}`);
    const wo = WORK_ORDERS.find((w) => w.wo === ref);
    if (wo && d.model && wo.model !== d.model) add("error", "ใบเบิก", `${d.no}: รุ่น ${d.model} ไม่ตรงกับ ${ref} (${wo.model})`, `mr:${d.no}`);
    if (d.model && !models.has(d.model)) add("error", "ใบเบิก", `${d.no}: รุ่น ${d.model} ไม่มี BOM`, `mr:${d.no}`);
    if (d.receiver && !users.has(d.receiver)) add("warn", "ใบเบิก", `${d.no}: ผู้รับของไม่มีในรายชื่อผู้ใช้แล้ว`, `mr:${d.no}`);
    const keys = d.model && MASTER_BOM[d.model] ? new Set(bxTree(d.model).filter((r) => r.line).map((r) => bxKey(r.line))) : null;
    d.items.forEach((it) => {
      const req = Number(it.req) || 0, iss = Number(it.issued) || 0, ret = Number(it.ret) || 0;
      if (iss > req) add("error", "ใบเบิก", `${d.no}: ${it.code || it.part} จ่ายเกินที่ขอ (${iss} / ${req})`, `mr:${d.no}`);
      if (ret > iss) add("error", "ใบเบิก", `${d.no}: ${it.code || it.part} คืนมากกว่าที่จ่าย (${ret} / ${iss})`, `mr:${d.no}`);
      if (keys && !keys.has(it.key)) add("warn", "ใบเบิก", `${d.no}: ${it.code || it.part} ไม่มีใน BOM ${d.model} ปัจจุบัน (อาจเปลี่ยน Revision แล้ว)`, `mr:${d.no}`);
      const logged = (it.log || []).filter((g) => g.kind === "จ่าย").reduce((s, g) => s + (Number(g.qty) || 0), 0);
      if ((it.log || []).length && logged !== iss) add("warn", "ใบเบิก", `${d.no}: ${it.code || it.part} ยอดจ่าย (${iss}) ไม่ตรงกับประวัติการจ่าย (${logged})`, `mr:${d.no}`);
    });
    const allIssued = d.items.every((it) => (Number(it.issued) || 0) >= (Number(it.req) || 0));
    const anyIssued = d.items.some((it) => (Number(it.issued) || 0) > 0);
    if (d.status === "จ่ายบางส่วน" && allIssued) add("warn", "ใบเบิก", `${d.no}: สถานะ "จ่ายบางส่วน" แต่จ่ายครบทุกรายการแล้ว`, `mr:${d.no}`);
    if ((d.status === "รออนุมัติ" || d.status === "ปฏิเสธ") && anyIssued) add("error", "ใบเบิก", `${d.no}: สถานะ "${d.status}" แต่มีการจ่ายของแล้ว`, `mr:${d.no}`);
    if (BX_OPEN_REQ.includes(d.status)) {
      const age = bxDaysBetween(d.date, bxToday());
      if (age > 3) add("warn", "ใบเบิก", `${d.no}: ค้าง ${age} วัน (${bxReqHolder(d)})`, `mr:${d.no}`);
    }
  });

  /* ---- stock ---- */
  const s = bxOutstandingSummary();
  Object.keys(BX_STOCK).forEach((k) => {
    const st = BX_STOCK[k];
    if (Number(st.qty) < 0) add("error", "คงคลัง", `${k}: ยอดคงคลังติดลบ (${st.qty})`, `part:${k}`);
  });
  Object.keys(BX_STOCK).forEach((k) => {
    const w = BX_STOCK[k].wh || {};
    if (Number(BX_STOCK[k].qty) >= 0) Object.keys(w).forEach((id) => { if (w[id] < 0) add("warn", "คงคลัง", `${k}: ยอดในคลัง ${id} ติดลบ (${w[id]}) — ควรโอนย้ายหรือตรวจนับ`, `part:${k}`); });
  });
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((wo) => (wo.jobs || []).forEach((j) => {
    const open = (j.logs || []).find((l) => !l.to);
    if (j.status === "wip" && open && Date.now() - Date.parse(open.from) > 12 * 3600e3) add("warn", "Job Card", `${j.no} (${wo.wo} ${j.op}): สถานะกำลังทำค้างเกิน 12 ชม. — ลืมกดพักหรือเสร็จ?`, "");
  }));
  s.short.forEach((k) => {
    let line = null;
    MACHINE_MODELS.some((m) => { const r = bxRowFor(m, k); if (r) { line = r.line; return true; } return false; });
    const onOrder = line ? bxP2POnOrder(line) : 0;
    const gap = s.demand[k] - Number((bxStock(k) || {}).qty || 0);
    if (line && line.source === "ผลิตเอง") add("warn", "คงคลัง", `${k}: ของไม่พอจ่าย ขาด ${bxFmt(gap)} — ชิ้นส่วนผลิตเอง ต้องสั่งผลิตเพิ่ม`, `part:${k}`);
    else if (gap > onOrder) add("warn", "คงคลัง", `${k}: ของไม่พอจ่าย ขาด ${bxFmt(gap)} แต่สั่งซื้ออยู่แค่ ${bxFmt(onOrder)} — ควรเปิด PR`, `part:${k}`);
  });

  /* ---- service / installed base / claims ---- */
  docs("mc").forEach((m) => {
    if (m.model && !models.has(m.model)) add("warn", "ทะเบียนเครื่อง", `${m.no} (${m.title}): รุ่น ${m.model} ไม่มี BOM — เลือกอะไหล่ไม่ได้`, `doc:${m.no}`);
    if (m.rev && BOM_META[m.model] && !(BOM_META[m.model].history || []).some((h) => h.rev === m.rev)) add("warn", "ทะเบียนเครื่อง", `${m.no}: BOM Rev.${m.rev} ไม่มีในประวัติ BOM ${m.model}`, `doc:${m.no}`);
    if (m.wo && /^WO-/.test(m.wo) && !woIds.has(m.wo)) add("info", "ทะเบียนเครื่อง", `${m.no}: อ้างถึง ${m.wo} ที่ไม่มีในรายการใบสั่งผลิตแล้ว`, `doc:${m.no}`);
  });
  const titles = {};
  docs("mc").forEach((m) => { if (titles[m.title]) add("error", "ทะเบียนเครื่อง", `หมายเลขเครื่อง ${m.title} ซ้ำ (${titles[m.title]}, ${m.no})`, `doc:${m.no}`); titles[m.title] = m.no; });
  docs("svc").forEach((d) => {
    const m = d.machine ? docs("mc").find((x) => x.no === d.machine) : null;
    if (d.machine && !m) add("error", "งานบริการ", `${d.no}: อ้างถึงเครื่อง ${d.machine} ที่ไม่มีในทะเบียน`, `doc:${d.no}`);
    if (!d.machine) add("warn", "งานบริการ", `${d.no}: ไม่ได้ระบุเครื่องลูกค้า — ไม่มีประวัติเครื่อง/ประกัน`, `doc:${d.no}`);
    const closed = (DOC_TYPES.svc.closed || []).includes(d.status);
    const openReq = bxReqs().filter((r) => r.wo === d.no && BX_OPEN_REQ.includes(r.status));
    if (closed && openReq.length) add("warn", "งานบริการ", `${d.no} ปิดงานแล้ว แต่ใบเบิกอะไหล่ยังค้าง (${openReq.map((r) => r.no).join(", ")})`, `doc:${d.no}`);
    if (d.status === "รออะไหล่" && !bxReqs().some((r) => r.wo === d.no)) add("warn", "งานบริการ", `${d.no}: สถานะ "รออะไหล่" แต่ยังไม่มีใบเบิกอะไหล่`, `doc:${d.no}`);
    if (d.kind === "เคลมประกัน" && m && typeof svInWarranty === "function" && !svInWarranty(m, d.date)) add("warn", "เคลม", `${d.no}: เคลมประกัน แต่เครื่อง ${m.title} หมดประกันแล้ว ณ วันที่แจ้ง`, `doc:${d.no}`);
    if (d.claimCause === "ชิ้นส่วนจากผู้ขาย" && !d.supplier) add("warn", "เคลม", `${d.no}: สาเหตุจากผู้ขาย แต่ยังไม่ระบุผู้ขาย`, `doc:${d.no}`);
    if (d.claimCause && ["การผลิต / ประกอบ", "การออกแบบ"].includes(d.claimCause) && typeof relatedDocs === "function" && !relatedDocs(d).some((r) => ["ncr", "capa", "ecr"].includes(r.type))) add("info", "เคลม", `${d.no}: สาเหตุภายใน (${d.claimCause}) ยังไม่มี NCR / CAPA / ECR เชื่อมโยง`, `doc:${d.no}`);
  });

  /* ---- purchasing ---- */
  (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).forEach((c) => {
    String(c.wo || "").split(/[,\s]+/).filter((x) => /^WO-/.test(x)).forEach((x) => { if (!woIds.has(x)) add("info", "จัดซื้อ", `${c.pr}: อ้างถึง ${x} ที่ไม่มีในรายการใบสั่งผลิต`, `p2p:${c.id}`); });
    const grn = (c.events || []).filter((e) => e.stage === "grn" && !e.superseded);
    grn.forEach((e) => { if (Number(e.qtyReceived) < Number(c.qty)) add("info", "จัดซื้อ", `${c.pr}: รับของไม่ครบ ${e.qtyReceived}/${c.qty} ${c.unit}`, `p2p:${c.id}`); });
    if (grn.length && !grn.some((e) => e.stockKey) && bxKeyForItem(c.item)) add("warn", "จัดซื้อ", `${c.pr}: รับของแล้วแต่ยอดคงคลังไม่ได้เพิ่ม (${bxKeyForItem(c.item)})`, `p2p:${c.id}`);
  });

  /* ---- signed documents changed afterwards ---- */
  if (typeof esDocHash === "function") Object.keys(DEPT_DOCS).forEach((t) => docs(t).forEach((d) => {
    Object.keys(d.signatures || {}).forEach((slot) => {
      const s = d.signatures[slot];
      if (s && s.hash && s.hash !== esDocHash(t, d)) add("warn", "ลายเซ็น", `${d.no}: เนื้อหาถูกแก้ไขหลัง ${s.name} ลงนาม (${esSlots()[slot]}) — ควรลงนามใหม่`, `doc:${d.no}`);
    });
  }));

  /* ---- document references ---- */
  Object.keys(DEPT_DOCS).forEach((t) => docs(t).forEach((d) => {
    Object.keys(d).forEach((k) => {
      if (["no", "files", "items", "log", "visibility"].includes(k)) return;
      String(d[k] ?? "").match(DOC_NO_PATTERN)?.forEach((no) => {
        if (no === d.no) return;
        const pre = no.split("-")[0];
        if (prefixes.has(pre) && !allDocNos.has(no)) add("warn", "เอกสาร", `${d.no}: อ้างถึง ${no} ที่ไม่มีในระบบ (ลิงก์เสีย)`, `doc:${d.no}`);
      });
    });
  }));

  /* ---- R&D projects & engineering changes ---- */
  if (typeof RD !== "undefined") {
    RD.projects.filter((p) => ["วางแผน", "กำลังดำเนินการ"].includes(p.status)).forEach((p) => {
      const late = (p.tasks || []).filter(rdTaskLate);
      if (p.target && bxToday() > p.target && rdProgress(p) < 100) add("warn", "R&D", `${p.id} ${p.name}: เลยกำหนดเสร็จ (${formatThaiDate(p.target)}) ความคืบหน้า ${rdProgress(p)}%`, "");
      else if (late.length) add("info", "R&D", `${p.id}: งานเลยกำหนด ${late.length} งาน (${late.slice(0, 3).map((t) => t.name).join(", ")})`, "");
      (p.tasks || []).forEach((t) => String(t.ref || "").match(DOC_NO_PATTERN)?.forEach((no) => { if (prefixes.has(no.split("-")[0]) && !allDocNos.has(no)) add("warn", "R&D", `${p.id} งาน "${t.name}": อ้างถึง ${no} ที่ไม่มีในระบบ`, ""); }));
    });
  }
  if (typeof rdTqLate === "function") docs("tq").filter(rdTqLate).forEach((d) => add(/ด่วนมาก/.test(d.priority || "") ? "error" : "warn", "R&D", `${d.no} ยังไม่ได้ตอบ เลยกำหนด ${bxDaysBetween(rdTqDue(d), bxToday())} วัน (${d.fromDept || ""}${/ด่วนมาก/.test(d.priority || "") ? " — หน้างานหยุดรอ" : ""})`, `doc:${d.no}`));
  docs("ecr").filter((d) => d.status === "อนุมัติ").forEach((d) => {
    const eos = docs("eo").filter((e) => e.ref === d.no && e.status !== "ยกเลิก");
    const age = bxDaysBetween(d.date, bxToday());
    if (!eos.length && age > 14) add("warn", "R&D", `${d.no} อนุมัติแล้ว ${age} วัน แต่ยังไม่ออก EO`, `doc:${d.no}`);
  });
  docs("eo").filter((e) => e.status === "มีผลใช้งาน" && e.model && MASTER_BOM[e.model]).forEach((e) => {
    const refs = typeof bomRefsToDoc === "function" ? bomRefsToDoc(e.no).concat(e.ref ? bomRefsToDoc(e.ref) : []) : [];
    if (!refs.length) add("warn", "R&D", `${e.no} มีผลใช้งานแล้ว แต่ BOM ${e.model} ยังไม่มี Revision ที่อ้างถึง`, `doc:${e.no}`);
  });

  /* ---- users / groups ---- */
  if (typeof AUTH !== "undefined" && AUTH) {
    const gids = new Set((AUTH.groups || []).map((g) => g.id));
    const tids = new Set(AUTH.teams.map((t) => t.id));
    const depts = new Set(DEPT_WORKSPACES.map((w) => w.id));
    AUTH.users.filter((u) => u.active).forEach((u) => {
      (u.groups || []).forEach((g) => { if (!gids.has(g)) add("warn", "ผู้ใช้", `${u.name}: อยู่ในกลุ่มที่ถูกลบแล้ว`, `user:${u.id}`); });
      (u.teams || []).forEach((g) => { if (!tids.has(g)) add("warn", "ผู้ใช้", `${u.name}: อยู่ในทีมที่ถูกลบแล้ว`, `user:${u.id}`); });
      if (u.dept && !depts.has(u.dept)) add("warn", "ผู้ใช้", `${u.name}: แผนก "${u.dept}" ไม่มีแล้ว`, `user:${u.id}`);
      if (u.role === "operator" && !u.dept && !(u.groups || []).length) add("info", "ผู้ใช้", `${u.name}: ยังไม่มีแผนกและไม่มีกลุ่ม — เห็นเอกสารน้อยมาก`, `user:${u.id}`);
    });
    (AUTH.groups || []).forEach((g) => { if (!AUTH.users.some((u) => (u.groups || []).includes(g.id))) add("info", "ผู้ใช้", `กลุ่ม "${g.name}" ยังไม่มีสมาชิก`, `group:${g.id}`); });
    BX_SETTINGS.requesters.concat(BX_SETTINGS.issuers).forEach((id) => { if (!users.has(id)) add("warn", "ผู้ใช้", `สิทธิ์การเบิกอ้างถึงผู้ใช้ที่ไม่มีแล้ว (${id})`, ""); });
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev] || a.area.localeCompare(b.area));
}

// Open whatever a finding points at
function icOpen(ref) {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "doc") openDocViewByNo(id);
  else if (kind === "mr") { switchView("bomx"); bxOpenReq(id); }
  else if (kind === "bom") { bxModel = id; bxTab = "tree"; switchView("bomx"); }
  else if (kind === "part") { bxModel = MACHINE_MODELS.find((m) => bxRowFor(m, id)) || bxModel; bxDetailKey = id; bxTab = "tree"; switchView("bomx"); }
  else if (kind === "wo") { switchView("workorder"); const s = document.getElementById("woSearchInput"); if (s) { s.value = id; s.dispatchEvent(new Event("input")); } }
  else if (kind === "p2p") { switchView("p2p"); openP2PCase(id); }
  else if (kind === "user" && typeof openUserEditor === "function") openUserEditor(id);
  else if (kind === "group" && typeof openGroupEditor === "function") openGroupEditor(id);
}

function icTableHtml(list, withLinks) {
  if (!list.length) return `<p class="ic-ok">✓ ข้อมูลทุกโมดูลสอดคล้องกัน ไม่พบปัญหา</p>`;
  return `<table class="data-table"><thead><tr><th>ระดับ</th><th>ส่วนงาน</th><th>สิ่งที่พบ</th>${withLinks ? "<th></th>" : ""}</tr></thead><tbody>${list.map((f) => `<tr>
    <td><span class="pill ${DOC_TONE_PILL[IC_SEV[f.sev][1]]}">${IC_SEV[f.sev][0]}</span></td>
    <td>${escapeHtml(f.area)}</td><td>${escapeHtml(f.msg)}</td>
    ${withLinks ? `<td>${f.ref ? `<button type="button" class="btn-chip" data-icref="${escapeHtml(f.ref)}">เปิด</button>` : ""}</td>` : ""}
  </tr>`).join("")}</tbody></table>`;
}

function icSummary(list) {
  const n = (s) => list.filter((f) => f.sev === s).length;
  return { error: n("error"), warn: n("warn"), info: n("info") };
}
