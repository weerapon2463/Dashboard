/* ==========================================================================
   Priority Matrix module (Eisenhower-style: Urgency x Impact)
   ========================================================================== */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let priorityChartInstance = null;
let pmPendingIndex = null; // index into PRIORITY_JOBS being edited, or null when adding
const PM_STORAGE_KEY = "y2j-priority-jobs-v1";

function priorityCanEdit(role) { return role === "depthead" || role === "plant"; }

/* ---- persistence ------------------------------------------------------ */

function loadStoredPriorityJobs() {
  try {
    const raw = localStorage.getItem(PM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function savePriorityJobs() {
  try {
    localStorage.setItem(PM_STORAGE_KEY, JSON.stringify(PRIORITY_JOBS));
    markPMSaved();
  } catch (e) {
    markPMSaveFailed();
  }
}

function markPMSaved() {
  const el = document.getElementById("pmSaveStatus");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.classList.remove("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกอัตโนมัติในเบราว์เซอร์นี้แล้ว (ล่าสุด ${hh}:${mm})`;
}

function markPMSaveFailed() {
  const el = document.getElementById("pmSaveStatus");
  if (!el) return;
  el.classList.add("stale");
  el.innerHTML = `<span class="dot"></span>บันทึกไม่สำเร็จ — ข้อมูลจะหายเมื่อโหลดหน้าใหม่`;
}

function markPMInitialStatus(hasStored) {
  const el = document.getElementById("pmSaveStatus");
  if (!el) return;
  if (hasStored) {
    el.innerHTML = `<span class="dot"></span>โหลดรายการงานที่บันทึกไว้ในเบราว์เซอร์นี้ — เพิ่ม/แก้ไข/ลบจะบันทึกอัตโนมัติ`;
  } else {
    el.classList.add("stale");
    el.innerHTML = `<span class="dot"></span>กำลังแสดงข้อมูลตัวอย่าง — เพิ่ม/แก้ไข/ลบจะเริ่มบันทึกอัตโนมัติในเบราว์เซอร์นี้`;
  }
}

function initPriorityData() {
  const stored = loadStoredPriorityJobs();
  if (Array.isArray(stored)) {
    PRIORITY_JOBS.length = 0;
    stored.forEach((j) => PRIORITY_JOBS.push(j));
    return true;
  }
  return false;
}

function afterPriorityMutation() {
  savePriorityJobs();
  populatePriorityDeptFilter();
  renderPriorityMatrix();
}

function populatePriorityDeptFilter() {
  const select = document.getElementById("priorityDeptFilter");
  if (!select) return;
  const previous = select.value;
  const depts = Array.from(new Set(pmAllJobs().map((j) => j.department).filter(Boolean))).sort();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "ทั้งหมด (ทุกแผนก)";
  select.appendChild(allOpt);
  depts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  });
  select.value = depts.includes(previous) ? previous : "__all__";
  select.addEventListener("change", () => renderPriorityMatrix());
}

// Items the system already knows are urgent — scored from real data, refreshed every time (30 ก.ย.)
//   work orders: urgency from days to the due date, impact higher for a customer order / a stopped step
//   job cards stopped now · open NCRs by age · purchases late (worse when a work order waits on them)
function pmAutoJobs() {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (iso) => iso ? Math.round((Date.parse(iso + "T00:00:00") - today.getTime()) / 86400000) : null;
  const clamp = (n) => Math.max(1, Math.min(10, n));
  (typeof WORK_ORDERS !== "undefined" ? WORK_ORDERS : []).forEach((w) => {
    if (w.status === "เสร็จสมบูรณ์" || w.status === "ยกเลิก") return;
    const d = days(w.dueIso);
    const stopped = (w.jobs || []).some((j) => j.status === "hold");
    let urg = d === null ? 3 : d < 0 ? 10 : d <= 3 ? 9 : d <= 7 ? 8 : d <= 14 ? 6 : d <= 30 ? 4 : 2;
    let imp = w.so || (w.po && w.po !== "สต็อก") ? 8 : 5;
    if (stopped) { urg += 1; imp += 1; }
    out.push({ auto: true, name: `${w.wo} ${w.serial || ""} — ${d === null ? "ไม่มีกำหนดส่ง" : d < 0 ? `เลยกำหนดส่ง ${-d} วัน` : `ส่งใน ${d} วัน`}${stopped ? " · มีขั้นตอนหยุดอยู่" : ""}`, model: w.model, department: w.department || "ฝ่ายผลิต", urgency: clamp(urg), impact: clamp(imp), go: { view: "workorder", hist: w.wo } });
    (w.jobs || []).forEach((j) => (j.downs || []).filter((x) => !x.to).forEach((x) => out.push({ auto: true, name: `หยุดงาน: ${x.reason} — ${w.wo} ${j.station}`, model: w.model, department: w.department || "ฝ่ายผลิต", urgency: 9, impact: 8, go: { view: "workorder", hist: w.wo } })));
  });
  const ncrDef = typeof DOC_TYPES !== "undefined" && DOC_TYPES.ncr;
  ((typeof DEPT_DOCS !== "undefined" && DEPT_DOCS.ncr) || []).forEach((d) => {
    if ((ncrDef && (ncrDef.closed || []).includes(d.status)) || /ปิด|ยกเลิก/.test(d.status || "")) return;
    const age = d.date ? -days(d.date) : 0;
    out.push({ auto: true, name: `${d.no} ${d.title || ""} (${d.status})`, model: d.model || "", department: "ฝ่าย QC/ตรวจสอบคุณภาพ", urgency: clamp(age > 14 ? 8 : age > 7 ? 6 : 5), impact: 7, go: { doc: d.no } });
  });
  (typeof P2P_CASES !== "undefined" ? P2P_CASES : []).forEach((c) => {
    if (typeof p2pState !== "function" || p2pState(c) !== "late") return;
    out.push({ auto: true, name: `${c.pr} ${String(c.item || "").slice(0, 40)} — ค้าง${(p2pCurrent(c) || {}).label || ""}`, model: "", department: "ฝ่ายจัดซื้อ", urgency: c.wo ? 8 : 6, impact: c.wo ? 8 : 5, go: { view: "p2p", p2p: c.id } });
  });
  return out;
}
// the "items from the system" switch beside the department filter
function pmAutoToggle() {
  const sel = document.getElementById("priorityDeptFilter");
  if (!sel || document.getElementById("pmAuto")) return;
  sel.insertAdjacentHTML("afterend", ` <label class="vis-opt"><input type="checkbox" id="pmAuto"${pmShowAuto ? " checked" : ""}> รวมงานจากระบบ (ใบสั่งผลิต · งานหยุด · NCR · จัดซื้อล่าช้า)</label>`);
  document.getElementById("pmAuto").addEventListener("change", (e) => { pmShowAuto = e.target.checked; renderPriorityMatrix(); });
}
function pmAllJobs() { return PRIORITY_JOBS.concat(pmShowAuto ? pmAutoJobs() : []); }
let pmShowAuto = true;

function currentPriorityDept() {
  const select = document.getElementById("priorityDeptFilter");
  return select ? select.value : "__all__";
}

function renderPriorityMatrix() {
  const canvas = document.getElementById("priorityChart");
  if (!canvas) return;

  const dept = currentPriorityDept();
  const all = pmAllJobs();
  const jobs = dept && dept !== "__all__" ? all.filter((j) => j.department === dept) : all;
  pmAutoToggle();

  const byQuadrant = { doFirst: [], schedule: [], delegate: [], eliminate: [] };
  jobs.forEach((job) => {
    const q = classifyQuadrant(job.urgency, job.impact);
    byQuadrant[q].push({ x: job.urgency, y: job.impact, label: `${job.auto ? "🤖 " : ""}${job.name}`, model: job.model, department: job.department });
  });

  const colorMap = {
    doFirst: cssVar("--series-8"),
    schedule: cssVar("--series-1"),
    delegate: cssVar("--series-4"),
    eliminate: cssVar("--text-muted"),
  };

  const datasets = Object.keys(byQuadrant).map((q) => ({
    label: QUADRANT_META[q].label,
    data: byQuadrant[q],
    backgroundColor: colorMap[q],
    borderColor: colorMap[q],
    pointRadius: 7,
    pointHoverRadius: 9,
  }));

  if (priorityChartInstance) priorityChartInstance.destroy();

  priorityChartInstance = new Chart(canvas.getContext("2d"), {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0, max: 10,
          title: { display: true, text: "ความเร่งด่วน (Urgency)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted") },
        },
        y: {
          min: 0, max: 10,
          title: { display: true, text: "ผลกระทบ (Impact)", color: cssVar("--text-secondary") },
          grid: { color: cssVar("--gridline") },
          ticks: { color: cssVar("--text-muted") },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: cssVar("--text-secondary"), usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              return `${d.label} (${d.model} · ${d.department}) — เร่งด่วน ${d.x}, ผลกระทบ ${d.y}`;
            },
          },
        },
        quadrantLines: true,
      },
    },
    plugins: [{
      id: "quadrantLines",
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const midX = scales.x.getPixelForValue(5.5);
        const midY = scales.y.getPixelForValue(5.5);
        ctx.save();
        ctx.strokeStyle = cssVar("--baseline");
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(midX, chartArea.top);
        ctx.lineTo(midX, chartArea.bottom);
        ctx.moveTo(chartArea.left, midY);
        ctx.lineTo(chartArea.right, midY);
        ctx.stroke();
        ctx.restore();
      },
    }],
  });

  renderPriorityTable(jobs);
  updatePriorityStat();

  const addBtn = document.getElementById("pmAddBtn");
  if (addBtn) addBtn.hidden = !priorityCanEdit(currentRole());
}

function renderPriorityTable(jobs) {
  const tbody = document.querySelector("#priorityTable tbody");
  if (!tbody) return;
  const list = jobs || PRIORITY_JOBS;
  const canEdit = priorityCanEdit(currentRole());
  tbody.innerHTML = "";
  list
    .slice()
    .sort((a, b) => (b.urgency + b.impact) - (a.urgency + a.impact))
    .forEach((job) => {
      const q = classifyQuadrant(job.urgency, job.impact);
      const meta = QUADRANT_META[q];
      const realIndex = PRIORITY_JOBS.indexOf(job);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${job.auto ? '<span class="pill pill-schedule" title="ระบบคำนวณจากข้อมูลจริง">จากระบบ</span> ' : ""}${escapeHtml(job.name)}</td>
        <td>${escapeHtml(job.model)}</td>
        <td>${escapeHtml(job.department)}</td>
        <td>${job.urgency}</td>
        <td>${job.impact}</td>
        <td><span class="pill ${meta.pillClass}">${meta.label}</span></td>
        <td>${job.auto ? `<button class="btn-chip" data-pmgo="${escapeHtml(JSON.stringify(job.go))}">เปิด</button>` : canEdit ? `<button class="btn-chip" data-action="edit" data-index="${realIndex}">แก้ไข</button>` : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

  tbody.querySelectorAll("[data-pmgo]").forEach((b) => b.addEventListener("click", () => {
    const g = JSON.parse(b.dataset.pmgo);
    if (g.doc && typeof openDocViewByNo === "function") return openDocViewByNo(g.doc);
    if (g.hist && typeof snOpenHistory === "function") return snOpenHistory(g.hist);
    if (g.p2p) { switchView("p2p"); if (typeof openP2PCase === "function") openP2PCase(g.p2p); return; }
    if (g.view) switchView(g.view);
  }));
  if (canEdit) {
    tbody.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => openPriorityModal(Number(btn.getAttribute("data-index"))));
    });
  }
}

function updatePriorityStat() {
  // สถิติในหน้าภาพรวมนับจากงานทั้งหมดของทุกแผนก ไม่ผูกกับตัวกรองแผนกในหน้า Priority Matrix
  const count = pmAllJobs().filter((j) => classifyQuadrant(j.urgency, j.impact) === "doFirst").length;
  const el = document.getElementById("statDoFirst");
  if (el) el.textContent = count;
}

/* ---- add / edit / delete ----------------------------------------------- */

function openPriorityModal(index) {
  pmPendingIndex = index;
  const isEdit = index !== null && index !== undefined;
  const job = isEdit ? PRIORITY_JOBS[index] : null;

  document.getElementById("pmFormTitle").textContent = isEdit ? "แก้ไขงาน" : "เพิ่มงานใหม่";
  document.getElementById("pmFormName").value = job ? job.name : "";
  document.getElementById("pmFormModel").value = job ? job.model : "";
  document.getElementById("pmFormDept").value = job ? job.department : "";
  document.getElementById("pmFormUrgency").value = job ? job.urgency : 5;
  document.getElementById("pmFormImpact").value = job ? job.impact : 5;
  document.getElementById("pmUrgencyValue").textContent = job ? job.urgency : 5;
  document.getElementById("pmImpactValue").textContent = job ? job.impact : 5;
  document.getElementById("pmDeleteBtn").hidden = !isEdit;
  document.getElementById("pmFormBackdrop").classList.add("open");
}

function initPriorityInteractions() {
  const addBtn = document.getElementById("pmAddBtn");
  if (addBtn) addBtn.addEventListener("click", () => openPriorityModal(null));

  const urgencyInput = document.getElementById("pmFormUrgency");
  const impactInput = document.getElementById("pmFormImpact");
  if (urgencyInput) urgencyInput.addEventListener("input", () => {
    document.getElementById("pmUrgencyValue").textContent = urgencyInput.value;
  });
  if (impactInput) impactInput.addEventListener("input", () => {
    document.getElementById("pmImpactValue").textContent = impactInput.value;
  });

  document.getElementById("pmFormCancelBtn").addEventListener("click", () => {
    document.getElementById("pmFormBackdrop").classList.remove("open");
  });
  document.getElementById("pmFormBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });

  document.getElementById("pmFormSaveBtn").addEventListener("click", () => {
    const name = document.getElementById("pmFormName").value.trim();
    if (!name) { document.getElementById("pmFormName").focus(); return; }
    const model = document.getElementById("pmFormModel").value.trim() || "-";
    const department = document.getElementById("pmFormDept").value.trim() || "-";
    const urgency = Number(document.getElementById("pmFormUrgency").value);
    const impact = Number(document.getElementById("pmFormImpact").value);
    const entry = { name, model, department, urgency, impact };

    if (pmPendingIndex !== null && pmPendingIndex !== undefined) {
      PRIORITY_JOBS[pmPendingIndex] = entry;
    } else {
      PRIORITY_JOBS.push(entry);
    }
    afterPriorityMutation();
    document.getElementById("pmFormBackdrop").classList.remove("open");
    showToast(`บันทึกงาน "${name}" แล้ว`, "good");
  });

  document.getElementById("pmDeleteBtn").addEventListener("click", () => {
    if (pmPendingIndex === null || pmPendingIndex === undefined) return;
    const name = PRIORITY_JOBS[pmPendingIndex].name;
    if (!confirm(`ลบงาน "${name}" ออกจาก Priority Matrix?`)) return;
    PRIORITY_JOBS.splice(pmPendingIndex, 1);
    afterPriorityMutation();
    document.getElementById("pmFormBackdrop").classList.remove("open");
    showToast(`ลบ "${name}" แล้ว`, "warn");
  });
}
