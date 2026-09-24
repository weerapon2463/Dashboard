/* ==========================================================================
   วัดผลจากระบบ — measurements the dashboard can take by itself from the
   timestamps it already records (PR steps, requisition log, work orders,
   service orders, audit trail), limited to the pilot period. They are shown
   with how many records they rest on; a person decides whether to copy one
   into a KPI's "after" value. Nothing is filled in automatically.
   ========================================================================== */

function pmPeriod() {
  const info = (typeof PILOT !== "undefined" && PILOT.info) || {};
  return { from: info.start || "", to: info.end || "" };
}
function pmIn(iso) {
  const { from, to } = pmPeriod();
  const d = String(iso || "").slice(0, 10);
  if (!d) return false;
  return (!from || d >= from) && (!to || d <= to);
}
function pmAvg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; }
function pmHours(a, b) { const x = new Date(a), y = new Date(b); return isNaN(x) || isNaN(y) ? null : (y - x) / 3600000; }
function pmDays(a, b) { return typeof bxDaysBetween === "function" ? bxDaysBetween(String(a).slice(0, 10), String(b).slice(0, 10)) : null; }

// Each measurement: value, unit, number of records, how it is computed, and which KPI (by name) it can fill
function pmMeasure() {
  const out = [];
  const cases = typeof P2P_CASES !== "undefined" ? P2P_CASES : [];
  const ev = (c, st) => (c.events || []).find((e) => e.stage === st && !e.superseded);

  const prApprove = [];
  const prToGrn = [];
  cases.forEach((c) => {
    const pr = ev(c, "pr");
    if (!pr || !pmIn(pr.at)) return;
    const ap = ev(c, "approve");
    if (ap && ap.result !== "reject") prApprove.push(pmDays(pr.at, ap.at));
    const grn = ev(c, "grn");
    if (grn) prToGrn.push(pmDays(pr.at, grn.at));
  });
  out.push({ id: "prApprove", label: "เวลาอนุมัติ PR เฉลี่ย", unit: "วัน", value: pmAvg(prApprove), n: prApprove.length, how: "วันที่เปิด PR → วันที่อนุมัติ (หน้าติดตามจัดซื้อ)", kpi: /อนุมัติ PR/ });
  out.push({ id: "prGrn", label: "รอบเวลา PR → รับของเข้าคลัง", unit: "วัน", value: pmAvg(prToGrn), n: prToGrn.length, how: "วันที่เปิด PR → วันที่รับของ (GRN)", kpi: null });

  const reqs = typeof bxReqs === "function" ? bxReqs().filter((d) => pmIn(d.date)) : [];
  const toApprove = [], toIssue = [];
  let waited = 0;
  reqs.forEach((d) => {
    const log = d.log || [];
    const asked = (log.find((g) => g.kind === "สั่งเบิก") || {}).at;
    const ok = (log.find((g) => g.kind === "อนุมัติ") || {}).at;
    const issues = d.items.flatMap((it) => (it.log || []).filter((g) => g.kind === "จ่าย").map((g) => g.at)).sort();
    if (asked && ok) toApprove.push(pmHours(asked, ok));
    if (asked && issues.length) toIssue.push(pmHours(asked, issues[0]));
    // the first issue did not cover everything → someone waited for material
    if (issues.length) {
      const first = issues[0];
      const firstShort = d.items.some((it) => {
        const q = (it.log || []).filter((g) => g.kind === "จ่าย" && g.at === first).reduce((s, g) => s + (Number(g.qty) || 0), 0);
        return q < (Number(it.req) || 0);
      });
      if (firstShort) waited++;
    }
  });
  out.push({ id: "reqApprove", label: "เวลาอนุมัติใบเบิก", unit: "ชั่วโมง", value: pmAvg(toApprove.filter((x) => x !== null)), n: toApprove.length, how: "สั่งเบิก → หัวหน้าอนุมัติ (ประวัติในใบเบิก)", kpi: null });
  out.push({ id: "reqIssue", label: "เวลาตั้งแต่สั่งเบิกจนได้ของ", unit: "ชั่วโมง", value: pmAvg(toIssue.filter((x) => x !== null)), n: toIssue.length, how: "สั่งเบิก → คลังจ่ายของครั้งแรก", kpi: null });
  out.push({ id: "reqWait", label: "ใบเบิกที่ต้องรอของ (จ่ายไม่ครบในครั้งแรก)", unit: "ครั้ง", value: reqs.length ? waited : null, n: reqs.length, how: "นับใบเบิกที่ครั้งแรกคลังจ่ายได้ไม่ครบทุกรายการ — ใกล้เคียง \"หยุดรอวัสดุ\"", kpi: /หยุดรอวัสดุ/ });

  const late = WORK_ORDERS.filter((w) => w.status === "ล่าช้า").length;
  out.push({ id: "woLate", label: "ใบสั่งผลิตที่ล่าช้า (ตอนนี้)", unit: "ใบ", value: WORK_ORDERS.length ? late : null, n: WORK_ORDERS.length, how: "นับใบสั่งผลิตสถานะ \"ล่าช้า\" ณ ขณะนี้", kpi: /ใบสั่งผลิตที่ล่าช้า/ });

  const svc = (DEPT_DOCS.svc || []).filter((d) => pmIn(d.date) && d.appt);
  const resp = svc.map((d) => pmDays(d.date, d.appt)).filter((x) => x !== null && x >= 0);
  out.push({ id: "svcResp", label: "งานบริการ: รับแจ้ง → นัดหมาย", unit: "วัน", value: pmAvg(resp), n: resp.length, how: "วันที่รับแจ้ง → วันนัดหมายช่างบริการ", kpi: null });

  const log = (typeof auditLoad === "function" ? auditLoad() : []).filter((e) => pmIn(e.ts) && !/เข้าสู่ระบบ|ออกจากระบบ/.test(e.action));
  const users = new Set(log.map((e) => e.user).filter(Boolean));
  const days = new Set(log.map((e) => e.ts.slice(0, 10)));
  out.push({ id: "useUsers", label: "ผู้ใช้ที่บันทึกงานในระบบจริง", unit: "คน", value: log.length ? users.size : null, n: log.length, how: "จากประวัติการใช้งาน (ไม่นับการเข้า/ออกระบบ)", kpi: null });
  out.push({ id: "useRecords", label: "รายการที่บันทึกผ่านระบบ", unit: "รายการ/วัน", value: days.size ? log.length / days.size : null, n: log.length, how: `เฉลี่ยต่อวันที่มีการใช้งาน (${days.size} วัน)`, kpi: null });
  return out;
}

function renderPilotMeasured() {
  const box = document.getElementById("pilotMeasured");
  if (!box || typeof PILOT === "undefined") return;
  const { from, to } = pmPeriod();
  const canEdit = pilotCanEdit(currentRole());
  const list = pmMeasure();
  const kpiFor = (m) => m.kpi ? PILOT.kpis.findIndex((k) => m.kpi.test(k.name)) : -1;
  box.innerHTML = `
    <div class="card-header">
      <h3>วัดผลจากระบบ (อัตโนมัติ)</h3>
      <p class="card-sub">คำนวณจากเวลาที่ระบบบันทึกไว้จริง ${from ? `ช่วง ${formatThaiDate(from)} – ${to ? formatThaiDate(to) : "วันนี้"}` : "— <strong>ใส่วันที่เริ่มทดสอบด้านบนก่อน</strong> ไม่เช่นนั้นจะรวมข้อมูลทั้งหมดในระบบ (รวมข้อมูลจำลอง)"} · ใช้เป็นค่า "หลังใช้ระบบ" ได้ ส่วนค่า "ก่อนใช้" ยังต้องวัดจากวิธีทำงานเดิม</p>
    </div>
    <div class="card-body table-scroll">
      <table class="data-table">
        <thead><tr><th>ตัวชี้วัด</th><th class="num">ค่าที่วัดได้</th><th class="num">จากข้อมูล</th><th>วิธีคำนวณ</th><th></th></tr></thead>
        <tbody>${list.map((m) => {
          const ki = kpiFor(m);
          const k = ki >= 0 ? PILOT.kpis[ki] : null;
          const val = m.value === null ? null : Math.round(m.value * 100) / 100;
          return `<tr>
            <td>${escapeHtml(m.label)}</td>
            <td class="num">${val === null ? '<span class="muted-inline">ยังไม่มีข้อมูล</span>' : `<strong>${val.toLocaleString("th-TH")}</strong> ${escapeHtml(m.unit)}`}</td>
            <td class="num">${m.n} รายการ</td>
            <td class="muted-inline">${escapeHtml(m.how)}</td>
            <td>${k && val !== null && canEdit ? `<button type="button" class="btn-chip" data-pmuse="${m.id}" data-k="${ki}">ใช้เป็น "หลังใช้" ของ: ${escapeHtml(k.name.slice(0, 26))}</button>${k.after !== null && k.after !== undefined && k.after !== "" ? `<div class="muted-inline">ค่าปัจจุบัน ${escapeHtml(String(k.after))}</div>` : ""}` : ""}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
  box.querySelectorAll("[data-pmuse]").forEach((b) => b.addEventListener("click", () => {
    const m = list.find((x) => x.id === b.dataset.pmuse);
    const k = PILOT.kpis[Number(b.dataset.k)];
    const val = Math.round(m.value * 100) / 100;
    if (!confirm(`ใส่ค่า "หลังใช้ระบบ" = ${val} ${m.unit} ให้ "${k.name}"?\n(คำนวณจาก ${m.n} รายการในระบบ${from ? ` ช่วง ${formatThaiDate(from)} เป็นต้นไป` : " ทั้งหมด"})`)) return;
    const before = k.after;
    k.after = val;
    k.afterSource = `วัดจากระบบ: ${m.how} (${m.n} รายการ${from ? `, ตั้งแต่ ${from}` : ""})`;
    savePilot();
    if (typeof auditLog === "function") auditLog("บันทึกผล Pilot จากระบบ", k.name, `หลังใช้: "${before ?? ""}" → "${val}" ${m.unit} · ${k.afterSource}`);
    renderPilot();
    showToast("บันทึกค่าหลังใช้ระบบแล้ว", "good");
  }));
}
