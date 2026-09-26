/* ==========================================================================
   Pilot Test — record real before/after measurements from the pilot project,
   compute % improvement and estimated cost saving, and collect user feedback.
   Starts with suggested KPIs but NO sample numbers: every value shown here
   must come from the actual pilot, never from mock data.
   ========================================================================== */

const PILOT_STORAGE_KEY = "y2j-pilot-v1";

const PILOT_UNITS = ["ชั่วโมง", "นาที", "วัน", "ครั้ง", "ใบ", "ไฟล์", "คะแนน (1–5)", "%", "บาท"];

// Units that can be converted to labor hours for the cost-saving estimate
const PILOT_HOUR_FACTOR = { "ชั่วโมง": 1, "นาที": 1 / 60 };

function defaultPilotData() {
  const kpi = (name, unit, direction, method) => ({
    name, unit, direction, method,
    before: null, after: null, timesPerMonth: null, people: null,
  });
  return {
    info: { project: "", start: "", end: "", team: "", scope: "" },
    laborRate: 150,
    kpis: [
      kpi("เวลาจัดทำ/ปรับแผนการผลิต (Master Schedule)", "ชั่วโมง", "lower", "จับเวลาตั้งแต่เริ่มรวบรวมข้อมูลจนได้แผนที่ใช้งานได้"),
      kpi("เวลาค้นหาสถานะใบสั่งผลิต/โครงการ 1 รายการ", "นาที", "lower", "จับเวลาตอบคำถาม \"งานนี้ถึงไหนแล้ว\" จริง 5–10 ครั้งแล้วเฉลี่ย"),
      kpi("เวลาประชุมติดตามงานประจำสัปดาห์", "ชั่วโมง", "lower", "ระยะเวลาประชุมจริงต่อสัปดาห์"),
      kpi("เวลาอนุมัติ PR เฉลี่ย", "วัน", "lower", "วันที่ขอ → วันที่อนุมัติ เฉลี่ยทุก PR ในช่วงทดสอบ"),
      kpi("จำนวนใบสั่งผลิตที่ล่าช้า", "ใบ", "lower", "นับจากรายการใบสั่งผลิตของโครงการนำร่อง"),
      kpi("จำนวนครั้งที่ต้องหยุดรอวัสดุระหว่างประกอบ", "ครั้ง", "lower", "นับจากบันทึกหน้างาน"),
      kpi("จำนวนไฟล์/เอกสารที่ต้องเปิดเพื่อตอบคำถามผู้บริหาร", "ไฟล์", "lower", "นับจริงจากการตอบคำถามสถานะการผลิต 1 ครั้ง"),
      kpi("ความพึงพอใจของผู้ใช้งาน", "คะแนน (1–5)", "higher", "แบบสอบถามผู้ใช้หลังทดสอบ"),
    ],
    feedback: [],
  };
}

let PILOT = defaultPilotData();
let pilotChartInstance = null;
let pilotPendingIndex = null;

function pilotCanEdit(role) { return role === "depthead" || role === "plant"; }

/* ---- persistence ------------------------------------------------------ */

function initPilotData() {
  try {
    const raw = localStorage.getItem(PILOT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.kpis)) {
      PILOT = Object.assign(defaultPilotData(), parsed);
      return true;
    }
  } catch (e) { /* fall through to defaults */ }
  return false;
}

function savePilot() {
  try {
    localStorage.setItem(PILOT_STORAGE_KEY, JSON.stringify(PILOT));
    const el = document.getElementById("pilotSaveStatus");
    if (!el) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    el.classList.remove("stale");
    el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm}) — แนะนำกด "สำรองข้อมูล" เก็บไฟล์ไว้ด้วย`;
  } catch (e) {
    const el = document.getElementById("pilotSaveStatus");
    if (!el) return;
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — กด "สำรองข้อมูล" ทันทีเพื่อไม่ให้ข้อมูลหาย`;
  }
}

function markPilotInitialStatus(hasStored) {
  const el = document.getElementById("pilotSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดผลการทดสอบที่บันทึกไว้ในเบราว์เซอร์นี้ — แก้ไขแล้วบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>ยังไม่มีผลการทดสอบ — กรอกค่าก่อน/หลังจากโครงการนำร่องจริง ระบบบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

/* ---- calculations ------------------------------------------------------ */

function pilotNum(v) {
  return v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v);
}

function pilotImprovement(k) {
  const before = pilotNum(k.before);
  const after = pilotNum(k.after);
  if (before === null || after === null || before === 0) return null;
  const pct = k.direction === "higher" ? (after - before) / before : (before - after) / before;
  return pct * 100;
}

// Estimated baht saved per month for one KPI, or null when it can't be priced
function pilotMonthlySaving(k, laborRate) {
  const before = pilotNum(k.before);
  const after = pilotNum(k.after);
  const times = pilotNum(k.timesPerMonth);
  if (before === null || after === null || !times || k.direction !== "lower") return null;
  const diff = before - after;
  if (k.unit === "บาท") return diff * times;
  const factor = PILOT_HOUR_FACTOR[k.unit];
  if (!factor) return null;
  const people = pilotNum(k.people) || 1;
  return diff * factor * times * people * (pilotNum(laborRate) || 0);
}

function pilotMonthlyHours(k) {
  const before = pilotNum(k.before);
  const after = pilotNum(k.after);
  const times = pilotNum(k.timesPerMonth);
  const factor = PILOT_HOUR_FACTOR[k.unit];
  if (before === null || after === null || !times || !factor || k.direction !== "lower") return null;
  return (before - after) * factor * times * (pilotNum(k.people) || 1);
}

function pilotSummary() {
  const measured = PILOT.kpis.filter((k) => pilotImprovement(k) !== null);
  const avg = measured.length
    ? measured.reduce((s, k) => s + pilotImprovement(k), 0) / measured.length
    : null;
  let monthly = 0, hours = 0, priced = 0;
  PILOT.kpis.forEach((k) => {
    const s = pilotMonthlySaving(k, PILOT.laborRate);
    if (s !== null) { monthly += s; priced++; }
    const h = pilotMonthlyHours(k);
    if (h !== null) hours += h;
  });
  return { measured: measured.length, total: PILOT.kpis.length, avg, monthly, hours, priced };
}

function fmtNum(v, digits) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("th-TH", { maximumFractionDigits: digits === undefined ? 2 : digits });
}

function fmtPct(v) {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/* ---- rendering --------------------------------------------------------- */

function renderPilot() {
  const canEdit = pilotCanEdit(currentRole());
  renderPilotInfo(canEdit);
  renderPilotStats();
  renderPilotTable(canEdit);
  renderPilotChart();
  renderPilotFeedback(canEdit);
  if (typeof renderPilotMeasured === "function") renderPilotMeasured();

  document.querySelectorAll(".pilot-edit-only").forEach((el) => { el.hidden = !canEdit; });
}

function renderPilotInfo(canEdit) {
  const map = { pilotProject: "project", pilotStart: "start", pilotEnd: "end", pilotTeam: "team", pilotScope: "scope" };
  Object.keys(map).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.activeElement !== el) el.value = PILOT.info[map[id]] || "";
    el.disabled = !canEdit;
  });
  const rate = document.getElementById("pilotLaborRate");
  if (rate) {
    if (document.activeElement !== rate) rate.value = PILOT.laborRate ?? "";
    rate.disabled = !canEdit;
  }
}

function renderPilotStats() {
  const s = pilotSummary();
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("pilotStatMeasured", `${s.measured} / ${s.total}`);
  set("pilotStatAvg", s.avg === null ? "—" : fmtPct(s.avg));
  set("pilotStatHours", s.hours ? fmtNum(s.hours, 1) : "—");
  set("pilotStatSaving", s.priced ? fmtNum(s.monthly * 12, 0) : "—");
}

function renderPilotTable(canEdit) {
  const tbody = document.querySelector("#pilotKpiTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  PILOT.kpis.forEach((k, i) => {
    const imp = pilotImprovement(k);
    const saving = pilotMonthlySaving(k, PILOT.laborRate);
    let pill = `<span class="pill pill-eliminate">รอข้อมูล</span>`;
    if (imp !== null) {
      pill = imp > 0
        ? `<span class="pill pill-good">▲ ดีขึ้น ${fmtPct(imp)}</span>`
        : imp < 0
          ? `<span class="pill pill-critical">▼ แย่ลง ${fmtPct(imp)}</span>`
          : `<span class="pill pill-eliminate">เท่าเดิม</span>`;
    }
    const numInput = (field, val) => canEdit
      ? `<input type="number" step="any" class="pilot-inline" data-index="${i}" data-field="${field}" value="${val ?? ""}" aria-label="${field === "before" ? "ก่อนใช้" : "หลังใช้"} — ${escapeHtml(k.name)}">`
      : fmtNum(pilotNum(val));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="pilot-kpi-name">
        <div>${escapeHtml(k.name)}</div>
        <div class="pilot-kpi-method">${escapeHtml(k.method || "")}</div>
      </td>
      <td>${escapeHtml(k.unit)}<div class="pilot-kpi-method">${k.direction === "higher" ? "ยิ่งมากยิ่งดี" : "ยิ่งน้อยยิ่งดี"}</div></td>
      <td>${numInput("before", k.before)}</td>
      <td>${numInput("after", k.after)}</td>
      <td>${pill}</td>
      <td>${saving === null ? "—" : fmtNum(saving, 0)}</td>
      <td>${canEdit ? `<button class="btn-chip" data-action="edit" data-index="${i}">แก้ไข</button>` : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!canEdit) return;
  tbody.querySelectorAll(".pilot-inline").forEach((input) => {
    input.addEventListener("change", () => {
      const k = PILOT.kpis[Number(input.dataset.index)];
      k[input.dataset.field] = pilotNum(input.value);
      savePilot();
      // Re-render after focus has moved (e.g. Tab to the next cell), then put
      // focus back on the same cell so fast keyboard entry isn't interrupted
      setTimeout(() => {
        const a = document.activeElement;
        const next = a && a.classList.contains("pilot-inline") ? `[data-index="${a.dataset.index}"][data-field="${a.dataset.field}"]` : null;
        renderPilot();
        if (next) {
          const el = document.querySelector(`#pilotKpiTable .pilot-inline${next}`);
          if (el) el.focus();
        }
      }, 0);
    });
  });
  tbody.querySelectorAll("[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openPilotModal(Number(btn.dataset.index)));
  });
}

function renderPilotChart() {
  const canvas = document.getElementById("pilotChart");
  const empty = document.getElementById("pilotChartEmpty");
  if (!canvas) return;
  const rows = PILOT.kpis
    .map((k) => ({ name: k.name, pct: pilotImprovement(k) }))
    .filter((r) => r.pct !== null);

  if (pilotChartInstance) { pilotChartInstance.destroy(); pilotChartInstance = null; }
  canvas.parentElement.hidden = rows.length === 0;
  if (empty) empty.hidden = rows.length !== 0;
  if (!rows.length) return;

  const good = cssVar("--series-1");
  const bad = cssVar("--status-critical");
  const shortName = (n) => (n.length > 28 ? n.slice(0, 27) + "…" : n);

  pilotChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: rows.map((r) => shortName(r.name)),
      datasets: [{
        data: rows.map((r) => Math.round(r.pct * 10) / 10),
        backgroundColor: rows.map((r) => (r.pct >= 0 ? good : bad)),
        borderRadius: 4,
        barThickness: 18,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 56, right: 56 } },
      scales: {
        x: { ticks: { color: cssVar("--text-muted"), callback: (v) => v + "%" }, grid: { color: cssVar("--gridline") } },
        y: { ticks: { color: cssVar("--text-secondary"), font: { size: 11 } }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => rows[items[0].dataIndex].name,
            label: (ctx) => `${ctx.raw >= 0 ? "ดีขึ้น" : "แย่ลง"} ${fmtPct(ctx.raw)} เทียบกับก่อนใช้ Dashboard`,
          },
        },
      },
    },
    plugins: [{
      id: "pilotValueLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = cssVar("--text-primary");
        ctx.font = "600 11.5px inherit";
        ctx.textBaseline = "middle";
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const v = rows[i].pct;
          ctx.textAlign = v >= 0 ? "left" : "right";
          ctx.fillText(fmtPct(v), bar.x + (v >= 0 ? 6 : -6), bar.y);
        });
        ctx.restore();
      },
    }],
  });
}

function renderPilotFeedback(canEdit) {
  const list = document.getElementById("pilotFeedbackList");
  if (!list) return;
  list.innerHTML = "";
  if (!PILOT.feedback.length) {
    list.innerHTML = `<p class="muted-note">ยังไม่มีความคิดเห็น — บันทึกคำพูดจริงของผู้ใช้ระหว่างทดสอบ ใช้เป็นหลักฐานการนำไปใช้งานได้</p>`;
    return;
  }
  PILOT.feedback.forEach((f, i) => {
    const div = document.createElement("div");
    div.className = "pilot-quote";
    div.innerHTML = `
      <div class="pilot-quote-text">“${escapeHtml(f.text)}”</div>
      <div class="pilot-quote-meta">— ${escapeHtml(f.who || "ไม่ระบุชื่อ")}${f.date ? " · " + escapeHtml(f.date) : ""}
        ${canEdit ? `<button class="btn-chip" data-action="del-fb" data-index="${i}">ลบ</button>` : ""}</div>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-action='del-fb']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("ลบความคิดเห็นนี้?")) return;
      PILOT.feedback.splice(Number(btn.dataset.index), 1);
      savePilot();
      renderPilot();
    });
  });
}

/* ---- KPI add / edit / delete ------------------------------------------- */

function openPilotModal(index) {
  pilotPendingIndex = index;
  const isEdit = index !== null && index !== undefined;
  const k = isEdit ? PILOT.kpis[index] : { name: "", unit: "ชั่วโมง", direction: "lower", method: "", before: null, after: null, timesPerMonth: null, people: null };
  document.getElementById("pilotFormTitle").textContent = isEdit ? "แก้ไขตัวชี้วัด" : "เพิ่มตัวชี้วัด";
  document.getElementById("pilotFormName").value = k.name;
  document.getElementById("pilotFormUnit").value = k.unit;
  document.getElementById("pilotFormDirection").value = k.direction;
  document.getElementById("pilotFormMethod").value = k.method || "";
  document.getElementById("pilotFormBefore").value = k.before ?? "";
  document.getElementById("pilotFormAfter").value = k.after ?? "";
  document.getElementById("pilotFormTimes").value = k.timesPerMonth ?? "";
  document.getElementById("pilotFormPeople").value = k.people ?? "";
  document.getElementById("pilotDeleteBtn").hidden = !isEdit;
  document.getElementById("pilotFormBackdrop").classList.add("open");
}

/* ---- export / backup ---------------------------------------------------- */

function pilotDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPilotCsv() {
  const header = ["ตัวชี้วัด", "หน่วย", "ทิศทางที่ดี", "วิธีวัด", "ก่อนใช้", "หลังใช้", "เปลี่ยนแปลง (%)", "ครั้ง/เดือน", "จำนวนคน", "ประหยัด (บาท/เดือน)"];
  const rows = PILOT.kpis.map((k) => {
    const imp = pilotImprovement(k);
    const saving = pilotMonthlySaving(k, PILOT.laborRate);
    return [k.name, k.unit, k.direction === "higher" ? "มากขึ้น" : "น้อยลง", k.method || "",
      k.before ?? "", k.after ?? "", imp === null ? "" : imp.toFixed(1),
      k.timesPerMonth ?? "", k.people ?? "", saving === null ? "" : Math.round(saving)];
  });
  const lines = [header, ...rows].map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  const stamp = new Date().toISOString().slice(0, 10);
  pilotDownload("﻿" + lines.join("\r\n"), `pilot-results-${stamp}.csv`, "text/csv;charset=utf-8;");
  showToast("ส่งออกผลการทดสอบเป็น CSV แล้ว", "good");
}

function pilotSummaryText() {
  const s = pilotSummary();
  const info = PILOT.info;
  const lines = [];
  lines.push(`ผลการทดสอบนำร่อง ${APP_NAME} — ${info.project || "(ระบุโครงการ)"}`);
  if (info.start || info.end) lines.push(`ช่วงทดสอบ: ${info.start || "?"} ถึง ${info.end || "?"}`);
  if (info.team) lines.push(`ผู้ร่วมทดสอบ: ${info.team}`);
  if (info.scope) lines.push(`ขอบเขต: ${info.scope}`);
  lines.push("");
  PILOT.kpis.forEach((k) => {
    const imp = pilotImprovement(k);
    if (imp === null) return;
    lines.push(`• ${k.name}: ${fmtNum(pilotNum(k.before))} → ${fmtNum(pilotNum(k.after))} ${k.unit} (${imp >= 0 ? "ดีขึ้น" : "แย่ลง"} ${Math.abs(imp).toFixed(1)}%)`);
  });
  lines.push("");
  if (s.avg !== null) lines.push(`ค่าเฉลี่ยการปรับปรุง: ${fmtPct(s.avg)} จาก ${s.measured} ตัวชี้วัด`);
  if (s.hours) lines.push(`เวลาที่ประหยัดได้: ประมาณ ${fmtNum(s.hours, 1)} ชั่วโมง-คน/เดือน`);
  if (s.priced) lines.push(`ประมาณการประหยัดต้นทุน: ${fmtNum(s.monthly, 0)} บาท/เดือน (≈ ${fmtNum(s.monthly * 12, 0)} บาท/ปี) ที่ค่าแรง ${fmtNum(PILOT.laborRate, 0)} บาท/ชม.`);
  if (PILOT.feedback.length) {
    lines.push("");
    lines.push("เสียงจากผู้ใช้งาน:");
    PILOT.feedback.forEach((f) => lines.push(`“${f.text}” — ${f.who || "ไม่ระบุชื่อ"}`));
  }
  return lines.join("\n");
}

function copyPilotSummary() {
  const text = pilotSummaryText();
  const done = () => showToast("คัดลอกสรุปผลแล้ว — วางในเอกสารประกวดได้เลย", "good");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { alert(text); }
  document.body.removeChild(ta);
}

function backupPilot() {
  const stamp = new Date().toISOString().slice(0, 10);
  pilotDownload(JSON.stringify(PILOT, null, 2), `pilot-backup-${stamp}.json`, "application/json");
  showToast("ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว", "good");
}

function restorePilot(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.kpis)) throw new Error("bad file");
      if (!confirm("นำเข้าข้อมูลจากไฟล์นี้? ข้อมูล Pilot ปัจจุบันในเบราว์เซอร์นี้จะถูกแทนที่")) return;
      PILOT = Object.assign(defaultPilotData(), parsed);
      savePilot();
      renderPilot();
      showToast("นำเข้าข้อมูลสำรองแล้ว", "good");
    } catch (e) {
      showToast("ไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์สำรองจากหน้านี้ (.json)", "warn");
    }
  };
  reader.readAsText(file);
}

/* ---- wiring ------------------------------------------------------------- */

function initPilotInteractions() {
  const infoMap = { pilotProject: "project", pilotStart: "start", pilotEnd: "end", pilotTeam: "team", pilotScope: "scope" };
  Object.keys(infoMap).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      PILOT.info[infoMap[id]] = el.value.trim();
      savePilot();
      if ((id === "pilotStart" || id === "pilotEnd") && typeof renderPilotMeasured === "function") renderPilotMeasured();
    });
  });
  const rate = document.getElementById("pilotLaborRate");
  if (rate) rate.addEventListener("change", () => {
    PILOT.laborRate = pilotNum(rate.value) ?? 0;
    savePilot();
    renderPilot();
  });

  document.getElementById("pilotAddBtn").addEventListener("click", () => openPilotModal(null));
  document.getElementById("pilotExportBtn").addEventListener("click", exportPilotCsv);
  document.getElementById("pilotCopyBtn").addEventListener("click", copyPilotSummary);
  document.getElementById("pilotPrintBtn").addEventListener("click", () => {
    document.body.classList.add("printing-pilot");
    window.print();
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-pilot"));
  document.getElementById("pilotBackupBtn").addEventListener("click", backupPilot);
  const restoreInput = document.getElementById("pilotRestoreInput");
  document.getElementById("pilotRestoreBtn").addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", () => {
    if (restoreInput.files[0]) restorePilot(restoreInput.files[0]);
    restoreInput.value = "";
  });

  const unitSelect = document.getElementById("pilotFormUnit");
  PILOT_UNITS.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    unitSelect.appendChild(opt);
  });

  const backdrop = document.getElementById("pilotFormBackdrop");
  document.getElementById("pilotFormCancelBtn").addEventListener("click", () => backdrop.classList.remove("open"));
  backdrop.addEventListener("click", (e) => { if (e.target === e.currentTarget) backdrop.classList.remove("open"); });

  document.getElementById("pilotFormSaveBtn").addEventListener("click", () => {
    const name = document.getElementById("pilotFormName").value.trim();
    if (!name) { document.getElementById("pilotFormName").focus(); return; }
    const entry = {
      name,
      unit: unitSelect.value,
      direction: document.getElementById("pilotFormDirection").value,
      method: document.getElementById("pilotFormMethod").value.trim(),
      before: pilotNum(document.getElementById("pilotFormBefore").value),
      after: pilotNum(document.getElementById("pilotFormAfter").value),
      timesPerMonth: pilotNum(document.getElementById("pilotFormTimes").value),
      people: pilotNum(document.getElementById("pilotFormPeople").value),
    };
    if (pilotPendingIndex !== null && pilotPendingIndex !== undefined) {
      PILOT.kpis[pilotPendingIndex] = entry;
    } else {
      PILOT.kpis.push(entry);
    }
    savePilot();
    renderPilot();
    backdrop.classList.remove("open");
    showToast(`บันทึกตัวชี้วัด "${name}" แล้ว`, "good");
  });

  document.getElementById("pilotDeleteBtn").addEventListener("click", () => {
    if (pilotPendingIndex === null || pilotPendingIndex === undefined) return;
    const name = PILOT.kpis[pilotPendingIndex].name;
    if (!confirm(`ลบตัวชี้วัด "${name}"?`)) return;
    PILOT.kpis.splice(pilotPendingIndex, 1);
    savePilot();
    renderPilot();
    backdrop.classList.remove("open");
    showToast(`ลบ "${name}" แล้ว`, "warn");
  });

  document.getElementById("pilotFeedbackAddBtn").addEventListener("click", () => {
    const textEl = document.getElementById("pilotFeedbackText");
    const whoEl = document.getElementById("pilotFeedbackWho");
    const text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    PILOT.feedback.push({ text, who: whoEl.value.trim(), date: new Date().toISOString().slice(0, 10) });
    textEl.value = "";
    whoEl.value = "";
    savePilot();
    renderPilot();
    showToast("บันทึกความคิดเห็นแล้ว", "good");
  });
}
