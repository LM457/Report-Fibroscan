(function (App) {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showToast(message, type = 'success') {
    const toast = $('#toast');
    toast.className = `toast show ${type}`;
    toast.querySelector('i').className = type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
    toast.querySelector('span').textContent = message;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function openUploadModal() {
    const modal = $('#upload-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => $('#drop-zone').focus(), 80);
  }

  function closeUploadModal() {
    const modal = $('#upload-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function navigate(pageName) {
    const page = $(`#page-${pageName}`);
    if (!page) return;
    App.state.activePage = pageName;
    $$('.page').forEach(item => item.classList.toggle('active', item === page));
    $$('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    $('#page-title').textContent = page.dataset.title;
    window.history.replaceState(null, '', `#${pageName}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Recreate the active page charts so their entrance animation plays on
    // every navigation, including Overview rather than only Analytics.
    if (App.state.data.length && pageName === 'overview') requestAnimationFrame(App.renderOverviewCharts);
    if (App.state.data.length && pageName === 'analysis') requestAnimationFrame(App.renderAnalysisCharts);
  }

  let importSequence = 0;

  const fileFingerprint = file => `${file.name}|${file.size}|${file.lastModified || 0}`;

  function examKey(patient) {
    const patientKey = App.getPatientKey(patient);
    const date = App.toISODate(patient.date);
    if (!date) return `${patientKey}|undated|${patient.sourceFileId}|${patient.rowNumber}`;
    return [patientKey, date, patient.stiffness ?? '', patient.cap ?? ''].join('|');
  }

  function rebuildCombinedData() {
    const seen = new Set();
    const combined = [];
    App.state.files.forEach(fileEntry => {
      fileEntry.activeCount = 0;
      fileEntry.duplicateCount = 0;
      fileEntry.records.forEach(patient => {
        const key = examKey(patient);
        if (seen.has(key)) {
          fileEntry.duplicateCount += 1;
          return;
        }
        seen.add(key);
        fileEntry.activeCount += 1;
        combined.push(patient);
      });
    });
    App.state.data = combined;
    window.appData = combined;
    App.state.fileName = App.state.files.length === 1
      ? App.state.files[0].name
      : `${App.state.files.length.toLocaleString('th-TH')} ไฟล์`;
    App.state.tablePage = 1;
    if (!combined.length) App.state.selectedPatientIndex = null;
    else if (!combined[App.state.selectedPatientIndex]) App.state.selectedPatientIndex = 0;
  }

  async function handleFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const dropZone = $('#drop-zone');
    dropZone.classList.add('loading');
    dropZone.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><strong>กำลังอ่าน ${files.length.toLocaleString('th-TH')} ไฟล์...</strong><span>ข้อมูลยังคงอยู่บนอุปกรณ์ของคุณ</span>`;
    const existingFingerprints = new Set(App.state.files.map(entry => entry.fingerprint));
    const errors = [];
    let addedFiles = 0;
    let parsedRows = 0;
    try {
      for (const file of files) {
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
          errors.push(`${file.name}: ไม่ใช่ไฟล์ Excel`);
          continue;
        }
        if (file.size > App.MAX_FILE_SIZE) {
          errors.push(`${file.name}: ขนาดเกิน 25 MB`);
          continue;
        }
        const fingerprint = fileFingerprint(file);
        if (existingFingerprints.has(fingerprint)) {
          errors.push(`${file.name}: ไฟล์นี้ถูกนำเข้าแล้ว`);
          continue;
        }
        try {
          const id = `file-${Date.now()}-${++importSequence}`;
          const records = App.parseWorkbook(await file.arrayBuffer()).map(patient => ({
            ...patient,
            sourceFileId: id,
            sourceFile: file.name
          }));
          App.state.files.push({ id, name: file.name, size: file.size, lastModified: file.lastModified || 0, fingerprint, records, activeCount: 0, duplicateCount: 0 });
          existingFingerprints.add(fingerprint);
          parsedRows += records.length;
          addedFiles += 1;
        } catch (error) {
          errors.push(`${file.name}: ${error.message || 'อ่านข้อมูลไม่สำเร็จ'}`);
        }
      }
      if (addedFiles) {
        rebuildCombinedData();
        App.state.selectedPatientIndex = App.state.data.length ? 0 : null;
        closeUploadModal();
        renderAll();
        navigate('overview');
        const duplicateRows = App.state.files.reduce((sum, entry) => sum + entry.duplicateCount, 0);
        showToast(`เพิ่ม ${addedFiles} ไฟล์ · อ่าน ${parsedRows.toLocaleString('th-TH')} แถว${duplicateRows ? ` · ตัดข้อมูลซ้ำ ${duplicateRows.toLocaleString('th-TH')} แถว` : ''}`);
      } else {
        showToast(errors[0] || 'ไม่มีไฟล์ที่สามารถนำเข้าได้', 'error');
      }
      if (addedFiles && errors.length) setTimeout(() => showToast(`ข้าม ${errors.length} ไฟล์: ${errors[0]}`, 'error'), 3500);
    } finally {
      resetDropZone();
      $('#excel-input').value = '';
    }
  }

  function resetDropZone() {
    const dropZone = $('#drop-zone');
    dropZone.classList.remove('loading', 'drag-over');
    dropZone.innerHTML = `
      <i class="fa-solid fa-cloud-arrow-up"></i>
      <strong>ลากไฟล์หนึ่งไฟล์หรือหลายไฟล์มาวางที่นี่</strong>
      <span>หรือคลิกเพื่อเลือกหลายไฟล์จากเครื่อง</span>
      <small>.XLSX, .XLS · สูงสุดไฟล์ละ 25 MB</small>`;
  }

  function resetData() {
    App.state.data = [];
    App.state.files = [];
    window.appData = [];
    App.state.fileName = '';
    App.state.selectedPatientIndex = null;
    Object.values(App.state.charts).forEach(chart => chart.destroy());
    App.state.charts = {};
    renderAll();
    navigate('overview');
    showToast('ล้างข้อมูลออกจากหน่วยความจำแล้ว');
  }

  function removeFile(fileId) {
    const entry = App.state.files.find(file => file.id === fileId);
    if (!entry) return;
    App.state.files = App.state.files.filter(file => file.id !== fileId);
    rebuildCombinedData();
    renderAll();
    if (!App.state.data.length) navigate('overview');
    showToast(`นำไฟล์ ${entry.name} ออกจากการวิเคราะห์แล้ว`);
  }

  function renderAll() {
    const hasData = App.state.data.length > 0;
    $('#welcome-state').classList.toggle('hidden', hasData);
    $('#dashboard-state').classList.toggle('hidden', !hasData);
    $('#patient-empty').classList.toggle('hidden', hasData);
    $('#patient-content').classList.toggle('hidden', !hasData);
    $('#analysis-empty').classList.toggle('hidden', hasData);
    $('#analysis-content').classList.toggle('hidden', !hasData);
    $('#file-pill').classList.toggle('hidden', !hasData);
    $('#clear-data-btn').classList.toggle('hidden', !hasData);
    $('#export-pdf-btn').classList.toggle('hidden', !hasData);
    $('#current-file-name').textContent = hasData ? App.state.fileName : '—';

    if (!hasData) return;
    renderFileManager();
    renderKPIs();
    renderDataQuality();
    renderDateFilter();
    renderOverviewTable();
    renderPatientList();
    renderInsights();
    renderRiskFactorSummary();
    requestAnimationFrame(() => {
      App.renderOverviewCharts();
      if (App.state.activePage === 'analysis') App.renderAnalysisCharts();
    });
  }

  function renderFileManager() {
    const files = App.state.files;
    const duplicateRows = files.reduce((sum, file) => sum + file.duplicateCount, 0);
    $('#file-manager-summary').textContent = `${files.length.toLocaleString('th-TH')} ไฟล์ · ${App.state.data.length.toLocaleString('th-TH')} ครั้งตรวจ · ${App.getUniquePatientCount().toLocaleString('th-TH')} ผู้ป่วยไม่ซ้ำ${duplicateRows ? ` · ตัดข้อมูลซ้ำ ${duplicateRows.toLocaleString('th-TH')} แถว` : ''}`;
    $('#file-manager-list').innerHTML = files.map(file => `
      <div class="file-entry">
        <i class="fa-regular fa-file-excel"></i>
        <div><strong title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</strong><small>${file.activeCount.toLocaleString('th-TH')} รายการ${file.duplicateCount ? ` · ซ้ำ ${file.duplicateCount.toLocaleString('th-TH')}` : ''}</small></div>
        <button class="file-remove" type="button" data-remove-file="${file.id}" aria-label="นำไฟล์ ${escapeHTML(file.name)} ออก"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }

  function renderKPIs() {
    const data = App.getAnalysisData();
    const allExams = App.state.data;
    const liverData = data.filter(patient => patient.cap !== null || patient.stiffness !== null);
    const highRisk = liverData.filter(App.isHighRisk);
    const averageBMI = App.average(data.map(patient => patient.bmi));
    const averageCAP = App.average(data.map(patient => patient.cap));
    const complete = data.filter(patient => patient.height !== null && patient.weight !== null && patient.bmi !== null && patient.waist !== null && patient.gender !== 'ไม่ระบุ').length;
    $('#kpi-total').textContent = App.getUniquePatientCount(allExams).toLocaleString('th-TH');
    $('#kpi-exams').textContent = allExams.length.toLocaleString('th-TH');
    $('#kpi-files').textContent = `จาก ${App.state.files.length.toLocaleString('th-TH')} ไฟล์ · มุมมอง${App.state.analysisMode === 'latest' ? 'ผลล่าสุด' : 'ทุกรอบตรวจ'}`;
    $('#kpi-complete').textContent = complete === data.length
      ? 'ข้อมูลประกอบครบถ้วนทุกราย'
      : complete === 0 ? 'รูปแบบตรวจพื้นฐาน · ข้อมูลประกอบไม่ครบ' : `ข้อมูลประกอบครบ ${complete} จาก ${data.length} ครั้งตรวจในมุมมอง`;
    $('#kpi-risk').textContent = liverData.length ? `${Math.round((highRisk.length / liverData.length) * 100)}%` : '—';
    $('#kpi-risk-count').textContent = liverData.length ? `${highRisk.length.toLocaleString('th-TH')} รายที่ควรติดตาม` : 'ข้อมูล E/CAP ไม่ครบถ้วน';
    $('#kpi-bmi').textContent = averageBMI === null ? '—' : averageBMI.toFixed(1);
    $('#kpi-bmi-label').textContent = averageBMI === null ? 'ยังไม่มีข้อมูล' : averageBMI < 23 ? 'อยู่ในเกณฑ์ทั่วไป' : averageBMI < 25 ? 'เริ่มมีภาวะน้ำหนักเกิน' : 'ค่าเฉลี่ยอยู่ในกลุ่มอ้วน';
    $('#kpi-cap').textContent = averageCAP === null ? '—' : Math.round(averageCAP);
    $('#kpi-cap-label').textContent = averageCAP === null ? 'ยังไม่มีข้อมูล' : `ภาพรวมอยู่ระดับ ${App.classifyCap(averageCAP).code}`;

    const dates = data.map(patient => patient.date).filter(Boolean).sort((a, b) => a - b);
    $('#dataset-date-range').innerHTML = dates.length
      ? `<i class="fa-regular fa-calendar"></i> ${App.formatDate(dates[0])} – ${App.formatDate(dates.at(-1))}`
      : '<i class="fa-regular fa-calendar"></i> ไม่ระบุช่วงวันที่';
    $('#dataset-updated').innerHTML = `<i class="fa-regular fa-clock"></i> วิเคราะห์เมื่อ ${new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date())} น.`;
  }

  function renderDataQuality() {
    const data = App.getAnalysisData();
    if (!data.length) return;
    const fieldChecks = [
      { label: 'E Median', missing: data.filter(p => p.stiffness === null).length },
      { label: 'CAP Enhanced Mean', missing: data.filter(p => p.cap === null).length },
      { label: 'ส่วนสูง', missing: data.filter(p => p.height === null).length },
      { label: 'น้ำหนัก', missing: data.filter(p => p.weight === null).length },
      { label: 'BMI', missing: data.filter(p => p.bmi === null).length },
      { label: 'รอบเอว', missing: data.filter(p => p.waist === null).length },
      { label: 'เพศ', missing: data.filter(p => p.gender === 'ไม่ระบุ').length }
    ];
    const incomplete = fieldChecks.filter(field => field.missing > 0);
    const dashboardBanner = $('#data-quality-banner');
    const analysisBanner = $('#analysis-quality-banner');
    if (!incomplete.length) {
      dashboardBanner.classList.add('hidden');
      analysisBanner.classList.add('hidden');
      return;
    }
    const missingText = incomplete.map(field => `${field.label} ${field.missing} ราย`).join(' · ');
    const bannerHTML = `<i class="fa-solid fa-circle-info"></i><div><strong>ข้อมูลของผู้รับการตรวจไม่ครบถ้วน</strong><p>บางไฟล์อาจเป็นการตรวจตับแบบพื้นฐาน จึงแสดงเฉพาะผลที่มีข้อมูลรองรับ ส่วน KPI และการวิเคราะห์ที่ต้องใช้ข้อมูลประกอบจะแสดงเป็นค่าว่าง · ข้อมูลที่ขาด: ${missingText}</p></div>`;
    dashboardBanner.innerHTML = bannerHTML;
    analysisBanner.innerHTML = bannerHTML;
    dashboardBanner.classList.remove('hidden');
    analysisBanner.classList.remove('hidden');
  }

  function riskBadge(patient) {
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    if (App.isHighRisk(patient)) return `<span class="risk-badge high"><i></i>เสี่ยงสูง · ${fibrosis.code}/${cap.code}</span>`;
    if (fibrosis.code === 'F2' || cap.code === 'S2') return `<span class="risk-badge medium"><i></i>เฝ้าระวัง · ${fibrosis.code}/${cap.code}</span>`;
    return `<span class="risk-badge low"><i></i>ความเสี่ยงต่ำ · ${fibrosis.code}/${cap.code}</span>`;
  }

  function renderOverviewTable() {
    const keyword = $('#overview-search').value.trim().toLowerCase();
    const analysisData = App.getAnalysisData();
    const filtered = analysisData.filter(patient => `${patient.name} ${patient.id} ${patient.sourceFile || ''}`.toLowerCase().includes(keyword));
    const totalPages = Math.max(1, Math.ceil(filtered.length / App.TABLE_PAGE_SIZE));
    App.state.tablePage = Math.min(App.state.tablePage, totalPages);
    const start = (App.state.tablePage - 1) * App.TABLE_PAGE_SIZE;
    const pageData = filtered.slice(start, start + App.TABLE_PAGE_SIZE);
    $('#overview-table-body').innerHTML = pageData.length ? pageData.map((patient, index) => `
      <tr data-patient-index="${App.state.data.indexOf(patient)}">
        <td><strong class="patient-id-cell">${escapeHTML(patient.id)}</strong></td>
        <td><div class="person-cell"><span>${escapeHTML(initials(patient.name))}</span><div><strong class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</strong><small>${patient.nameMissing ? 'ตรวจไม่พบคอลัมน์ชื่อในไฟล์' : 'ชื่อผู้รับการตรวจ'}</small></div></div></td>
        <td>${App.formatDate(patient.date)}<br><small>${escapeHTML(patient.sourceFile || '')}</small></td>
        <td>${escapeHTML(patient.gender)}</td>
        <td>${formatMetric(patient.bmi, 1)}</td>
        <td><strong>${formatMetric(patient.cap, 0)}</strong> <small>dB/m</small></td>
        <td><strong>${formatMetric(patient.stiffness, 1)}</strong> <small>kPa</small></td>
        <td>${riskBadge(patient)}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="empty-row">ไม่พบข้อมูลที่ตรงกับคำค้นหา</td></tr>';
    $('#table-count-label').textContent = `แสดง ${filtered.length.toLocaleString('th-TH')} จาก ${analysisData.length.toLocaleString('th-TH')} ครั้งตรวจในมุมมอง`;
    $('#table-page-label').textContent = `หน้า ${App.state.tablePage} / ${totalPages}`;
    $('#table-prev').disabled = App.state.tablePage <= 1;
    $('#table-next').disabled = App.state.tablePage >= totalPages;
  }

  function renderDateFilter() {
    const selected = $('#date-filter').value;
    const dates = [...new Set(App.state.data.map(patient => App.toISODate(patient.date)).filter(Boolean))].sort().reverse();
    $('#date-filter').innerHTML = '<option value="">ทุกวันที่</option>' + dates.map(date => {
      const source = App.state.data.find(patient => App.toISODate(patient.date) === date).date;
      return `<option value="${date}">${App.formatDate(source, 'long')}</option>`;
    }).join('');
    if (dates.includes(selected)) $('#date-filter').value = selected;
  }

  function getFilteredPatients() {
    const keyword = $('#patient-search').value.trim().toLowerCase();
    const gender = $('#gender-filter').value;
    const date = $('#date-filter').value;
    const steatosis = $('#steatosis-filter').value;
    const fibrosis = $('#fibrosis-filter').value;
    return App.state.data.filter(patient => (
      `${patient.name} ${patient.id}`.toLowerCase().includes(keyword) &&
      (!gender || patient.gender === gender) &&
      (!date || App.toISODate(patient.date) === date) &&
      (!steatosis || App.classifyCap(patient.cap).code === steatosis) &&
      (!fibrosis || App.classifyFibrosis(patient.stiffness).code === fibrosis)
    ));
  }

  function renderPatientList() {
    if (!App.state.data.length) return;
    const filtered = getFilteredPatients();
    const grouped = new Map();
    filtered.forEach(patient => {
      const key = App.getPatientKey(patient);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(patient);
    });
    const groups = [...grouped.values()].map(visits => visits.sort((a, b) => {
      const aTime = a.date instanceof Date ? a.date.valueOf() : -1;
      const bTime = b.date instanceof Date ? b.date.valueOf() : -1;
      return bTime - aTime || App.state.data.indexOf(b) - App.state.data.indexOf(a);
    }));
    $('#patient-result-count').textContent = `${groups.length.toLocaleString('th-TH')} คน · ${filtered.length.toLocaleString('th-TH')} ครั้งตรวจ`;

    if (!groups.length) {
      $('#patient-list').innerHTML = '<div class="list-empty"><i class="fa-solid fa-magnifying-glass"></i><p>ไม่พบรายชื่อที่ตรงกับตัวกรอง</p></div>';
      $('#health-card').innerHTML = '<div class="health-empty"><i class="fa-regular fa-address-card"></i><h3>เลือกรายชื่อเพื่อดูผล</h3></div>';
      return;
    }

    const selected = App.state.data[App.state.selectedPatientIndex];
    const selectedKey = selected ? App.getPatientKey(selected) : '';
    const selectedGroup = groups.find(visits => App.getPatientKey(visits[0]) === selectedKey);
    if (!selectedGroup) App.state.selectedPatientIndex = App.state.data.indexOf(groups[0][0]);
    else if (!selectedGroup.includes(selected)) App.state.selectedPatientIndex = App.state.data.indexOf(selectedGroup[0]);

    const activeKey = App.getPatientKey(App.state.data[App.state.selectedPatientIndex]);
    $('#patient-list').innerHTML = groups.map(visits => {
      const patient = visits[0];
      const index = App.state.data.indexOf(patient);
      const fibrosisStage = App.classifyFibrosis(patient.stiffness);
      const steatosisStage = App.classifyCap(patient.cap);
      return `<button type="button" class="patient-list-item ${App.getPatientKey(patient) === activeKey ? 'selected' : ''}" data-select-patient="${index}">
        <span class="patient-avatar">${escapeHTML(initials(patient.name))}</span>
        <span class="patient-list-info">
          <small class="patient-id-line">รหัส ${escapeHTML(patient.id)}</small>
          <strong class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</strong>
          <small>ล่าสุด ${App.formatDate(patient.date)} · ${visits.length.toLocaleString('th-TH')} รอบ</small>
        </span>
        <span class="patient-badges"><span class="stage-pill ${fibrosisStage.className}">${fibrosisStage.code}</span><span class="stage-pill ${steatosisStage.className}">${steatosisStage.code}</span></span>
      </button>`;
    }).join('');
    renderHealthCard(App.state.data[App.state.selectedPatientIndex]);
  }

  function renderHealthCard(patient) {
    if (!patient) return;
    const patientKey = App.getPatientKey(patient);
    const visits = App.state.data.filter(item => App.getPatientKey(item) === patientKey).sort((a, b) => {
      const aTime = a.date instanceof Date ? a.date.valueOf() : -1;
      const bTime = b.date instanceof Date ? b.date.valueOf() : -1;
      return bTime - aTime || App.state.data.indexOf(b) - App.state.data.indexOf(a);
    });
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    const bmiGroup = App.classifyBMI(patient.bmi);
    const fibrosisWidth = patient.stiffness === null ? 0 : Math.min(100, (patient.stiffness / Math.max(20, App.state.settings.eF4 * 1.35)) * 100);
    const capWidth = patient.cap === null ? 0 : Math.min(100, (patient.cap / 400) * 100);
    const riskText = App.isHighRisk(patient)
      ? 'ผลอยู่ในช่วงที่ควรได้รับการประเมินและติดตามโดยบุคลากรทางการแพทย์'
      : 'ผลโดยรวมยังไม่เข้าเกณฑ์ความเสี่ยงสูงตามค่าที่ตั้งไว้';
    $('#health-card').innerHTML = `
      <div class="health-header">
        <div class="health-person"><span>${escapeHTML(initials(patient.name))}</span><div class="health-identity"><p>ผลการตรวจรายบุคคล</p><div class="identity-row"><small>รหัสผู้รับการตรวจ</small><strong>${escapeHTML(patient.id)}</strong></div><div class="identity-row patient-name-row"><small>ชื่อผู้รับการตรวจ</small><h2 class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</h2></div><small>ตรวจเมื่อ ${App.formatDate(patient.date, 'long')} · ไฟล์ ${escapeHTML(patient.sourceFile || 'ไม่ระบุ')}</small></div></div>
        <div class="health-header-actions">${riskBadge(patient)}<button type="button" class="btn btn-secondary btn-patient-pdf" data-export-patient="${App.state.data.indexOf(patient)}"><i class="fa-solid fa-file-pdf"></i> ส่งออก PDF รายบุคคล</button></div>
      </div>
      <div class="health-metrics">
        <article class="metric-card fibrosis-metric">
          <div class="metric-heading"><span><img class="liver-icon liver-icon--metric" src="assets/liver-icon.svg" alt="" aria-hidden="true"></span><div><small>ความแข็งของตับ</small><strong>E (kPa)</strong></div><b class="stage-pill ${fibrosis.className}">${fibrosis.code}</b></div>
          <div class="metric-number"><strong>${formatMetric(patient.stiffness, 1)}</strong><span>kPa</span></div>
          <div class="gauge"><div class="gauge-track fibrosis-track"><i style="width:${fibrosisWidth}%"></i><b style="left:${Math.min(98, fibrosisWidth)}%"></b></div><div class="gauge-labels"><span>F0-F1 ≤ ${App.state.settings.eF01Max}</span><span>F2 ≥ ${App.state.settings.eF2}</span><span>F3 ≥ ${App.state.settings.eF3}</span><span>F4 ≥ ${App.state.settings.eF4}</span></div></div>
          <p>แปลผล: <strong>${fibrosis.label} (${fibrosis.code})</strong></p>
        </article>
        <article class="metric-card cap-metric">
          <div class="metric-heading"><span><i class="fa-solid fa-droplet"></i></span><div><small>ปริมาณไขมันในตับ</small><strong>Mean CAP</strong></div><b class="stage-pill ${cap.className}">${cap.code}</b></div>
          <div class="metric-number"><strong>${formatMetric(patient.cap, 0)}</strong><span>dB/m</span></div>
          <div class="gauge"><div class="gauge-track cap-track"><i style="width:${capWidth}%"></i><b style="left:${Math.min(98, capWidth)}%"></b></div><div class="gauge-labels"><span>S0</span><span>S1 ≥ ${App.state.settings.capS1}</span><span>S2 ≥ ${App.state.settings.capS2}</span><span>S3 ≥ ${App.state.settings.capS3}</span></div></div>
          <p>แปลผล: <strong>${cap.label} (${cap.code}) · ไขมันในตับ ${cap.liverFat}</strong><br><small>ช่วงค่า ${cap.range}</small></p>
        </article>
      </div>
      <div class="supporting-metrics">
        <div><span><i class="fa-solid fa-weight-scale"></i></span><p>BMI (คำนวณ)<strong>${formatMetric(patient.bmi, 1)} <small>kg/m²</small></strong><small>${bmiGroup.label}</small></p></div>
        <div><span><i class="fa-solid fa-arrows-up-down"></i></span><p>ส่วนสูง<strong>${formatMetric(patient.height, 1)} <small>cm</small></strong></p></div>
        <div><span><i class="fa-solid fa-weight-hanging"></i></span><p>น้ำหนัก<strong>${formatMetric(patient.weight, 1)} <small>kg</small></strong></p></div>
        <div><span><i class="fa-solid fa-ruler"></i></span><p>รอบเอว<strong>${formatMetric(patient.waist, 1)} <small>cm</small></strong><small>${App.isHighWaist(patient) === null ? 'ข้อมูลไม่พอจัดกลุ่ม' : App.isHighWaist(patient) ? 'รอบเอวสูง' : 'รอบเอวไม่สูง'}</small></p></div>
        <div><span><i class="fa-solid fa-venus-mars"></i></span><p>เพศ<strong>${escapeHTML(patient.gender)}</strong></p></div>
        <div><span><i class="fa-solid fa-user-doctor"></i></span><p>ผู้ตรวจ<strong>${escapeHTML(patient.examiner)}</strong></p></div>
      </div>
      <section class="patient-history">
        <div class="patient-history-head"><h3>ประวัติการตรวจทั้งหมด</h3><span>${visits.length.toLocaleString('th-TH')} รอบตรวจ</span></div>
        <div class="patient-history-list">${visits.map(visit => {
          const index = App.state.data.indexOf(visit);
          const visitFibrosis = App.classifyFibrosis(visit.stiffness);
          const visitCap = App.classifyCap(visit.cap);
          return `<button type="button" class="history-visit ${visit === patient ? 'active' : ''}" data-select-visit="${index}"><span><strong>${App.formatDate(visit.date, 'long')}</strong><small>${escapeHTML(visit.sourceFile || 'ไม่ระบุไฟล์')}</small></span><b>${visitFibrosis.code}</b><b>${visitCap.code}</b><span>E ${formatMetric(visit.stiffness, 1)} · CAP ${formatMetric(visit.cap, 0)}</span></button>`;
        }).join('')}</div>
      </section>
      <div class="interpretation ${App.isHighRisk(patient) ? 'warning' : ''}"><i class="fa-solid ${App.isHighRisk(patient) ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i><div><strong>สรุปเบื้องต้น</strong><p>${riskText} ผลนี้ไม่ใช่การวินิจฉัยและควรแปลผลร่วมกับข้อมูลทางคลินิกอื่น</p></div></div>`;
  }

  function pearsonCorrelation(points) {
    if (points.length < 2) return null;
    const meanX = App.average(points.map(point => point.x));
    const meanY = App.average(points.map(point => point.y));
    let numerator = 0, denominatorX = 0, denominatorY = 0;
    points.forEach(point => {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      numerator += dx * dy;
      denominatorX += dx ** 2;
      denominatorY += dy ** 2;
    });
    const denominator = Math.sqrt(denominatorX * denominatorY);
    return denominator ? numerator / denominator : 0;
  }

  function renderInsights() {
    const data = App.getAnalysisData();
    if (!data.length) return;
    const maleCap = App.average(data.filter(p => p.gender === 'ชาย').map(p => p.cap));
    const femaleCap = App.average(data.filter(p => p.gender === 'หญิง').map(p => p.cap));
    const paired = data.filter(p => p.bmi !== null && p.cap !== null).map(p => ({ x: p.bmi, y: p.cap }));
    const correlation = pearsonCorrelation(paired);
    const largeWaist = data.filter(p => App.isHighWaist(p) === true);
    const largeWaistRisk = largeWaist.length ? Math.round((largeWaist.filter(App.isHighRisk).length / largeWaist.length) * 100) : null;
    const highRiskPercent = Math.round((data.filter(App.isHighRisk).length / data.length) * 100);
    let genderText = 'ข้อมูลเพศยังไม่เพียงพอสำหรับการเปรียบเทียบ';
    if (maleCap !== null && femaleCap !== null && femaleCap !== 0) {
      const difference = ((maleCap - femaleCap) / femaleCap) * 100;
      genderText = `กลุ่มชายมี Mean CAP เฉลี่ย${difference >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}กลุ่มหญิง ${Math.abs(difference).toFixed(1)}%`;
    }
    let correlationText = 'ข้อมูล BMI และ CAP ยังไม่เพียงพอสำหรับหาความสัมพันธ์';
    if (correlation !== null) {
      const strength = Math.abs(correlation) >= .7 ? 'ค่อนข้างสูง' : Math.abs(correlation) >= .4 ? 'ปานกลาง' : 'ค่อนข้างต่ำ';
      correlationText = `BMI กับ Mean CAP มีความสัมพันธ์${correlation >= 0 ? 'เชิงบวก' : 'เชิงลบ'}ระดับ${strength} (r = ${correlation.toFixed(2)})`;
    }
    const insights = [
      { icon: 'fa-venus-mars', title: 'ความแตกต่างตามเพศ', text: genderText },
      { icon: 'fa-chart-simple', title: 'BMI และไขมันในตับ', text: correlationText },
      { icon: 'fa-ruler', title: 'ผลในกลุ่มรอบเอวสูง', text: largeWaistRisk === null ? 'ข้อมูลรอบเอวและเพศยังไม่เพียงพอ' : `กลุ่มรอบเอวสูงตามเกณฑ์ชาย ≥ ${App.state.settings.waistMaleHigh} / หญิง ≥ ${App.state.settings.waistFemaleHigh} cm อยู่ในกลุ่มเสี่ยงสูง ${largeWaistRisk}%` },
      { icon: 'fa-user-shield', title: 'ภาพรวมความเสี่ยง', text: `ผู้รับการตรวจ ${highRiskPercent}% เข้าเกณฑ์เสี่ยงสูงจาก E หรือ Mean CAP` }
    ];
    $('#insight-list').innerHTML = insights.map((item, index) => `<div class="insight-item"><span>0${index + 1}</span><i class="fa-solid ${item.icon}"></i><div><strong>${item.title}</strong><p>${item.text}</p></div></div>`).join('');
  }

  function renderRiskFactorSummary() {
    if (!App.state.data.length) return;
    const factors = App.getRiskFactorAnalysis(App.getAnalysisData());
    const lookup = key => factors.find(group => group.key === key);
    const comparisons = [
      { title: 'BMI อ้วนระดับ 2 เทียบกลุ่มปกติ', icon: 'fa-weight-scale', high: lookup('bmi-obese-2'), reference: lookup('bmi-normal') },
      { title: 'รอบเอวสูง เทียบรอบเอวไม่สูง', icon: 'fa-ruler', high: lookup('waist-high'), reference: lookup('waist-normal') },
      { title: 'เพศชาย เทียบเพศหญิง', icon: 'fa-venus-mars', high: lookup('gender-male'), reference: lookup('gender-female') }
    ];
    $('#risk-factor-summary').innerHTML = comparisons.map(item => {
      const fibrosisDiff = App.percentagePointDifference(item.high, item.reference, 'fibrosisRate');
      const steatosisDiff = App.percentagePointDifference(item.high, item.reference, 'steatosisRate');
      const formatDiff = value => value === null ? 'ข้อมูลไม่พอ' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} จุดเปอร์เซ็นต์`;
      return `<article class="factor-summary-card">
        <span><i class="fa-solid ${item.icon}"></i></span>
        <div><strong>${item.title}</strong><small>จำนวน ${item.high?.count || 0} เทียบ ${item.reference?.count || 0} ราย</small>
          <p><b>Fibrosis ≥ F2</b><em class="${fibrosisDiff !== null && fibrosisDiff > 0 ? 'higher' : ''}">${formatDiff(fibrosisDiff)}</em></p>
          <p><b>Steatosis ≥ S1</b><em class="${steatosisDiff !== null && steatosisDiff > 0 ? 'higher' : ''}">${formatDiff(steatosisDiff)}</em></p>
        </div>
      </article>`;
    }).join('');
  }

  function fillSettingsForm() {
    const s = App.state.settings;
    $('#cap-s1').value = s.capS1;
    $('#cap-s2').value = s.capS2;
    $('#cap-s3').value = s.capS3;
    $('#cap-s0').value = s.capS0Max;
    $('#e-f2').value = s.eF2;
    $('#e-f3').value = s.eF3;
    $('#e-f4').value = s.eF4;
    $('#e-f01').value = s.eF01Max;
    $('#bmi-normal-start').value = s.bmiNormalStart;
    $('#bmi-overweight-start').value = s.bmiOverweightStart;
    $('#bmi-obesity1-start').value = s.bmiObesity1Start;
    $('#bmi-obesity2-start').value = s.bmiObesity2Start;
    $('#waist-male-high').value = s.waistMaleHigh;
    $('#waist-female-high').value = s.waistFemaleHigh;
  }

  function saveSettings(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const settings = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    if (!(settings.capS0Max < settings.capS1 && settings.capS1 < settings.capS2 && settings.capS2 < settings.capS3)) {
      showToast('เกณฑ์ CAP ต้องเรียงจาก S0 สูงสุด น้อยกว่า S1, S2 และ S3', 'error');
      return;
    }
    if (!(settings.eF01Max < settings.eF2 && settings.eF2 < settings.eF3 && settings.eF3 < settings.eF4)) {
      showToast('เกณฑ์ E ต้องเรียงจาก F0-F1 สูงสุด น้อยกว่า F2, F3 และ F4', 'error');
      return;
    }
    if (!(settings.bmiNormalStart < settings.bmiOverweightStart && settings.bmiOverweightStart < settings.bmiObesity1Start && settings.bmiObesity1Start < settings.bmiObesity2Start)) {
      showToast('เกณฑ์ BMI ต้องเรียงจากกลุ่มปกติ น้ำหนักเกิน อ้วนระดับ 1 และอ้วนระดับ 2', 'error');
      return;
    }
    if (!(settings.waistMaleHigh > 0 && settings.waistFemaleHigh > 0)) {
      showToast('เกณฑ์รอบเอวชายและหญิงต้องมากกว่า 0', 'error');
      return;
    }
    App.saveSettings(settings);
    fillSettingsForm();
    renderAll();
    showToast('บันทึกเกณฑ์และคำนวณผลใหม่แล้ว');
  }

  function downloadTemplate() {
    if (!window.XLSX) {
      showToast('ยังโหลดเครื่องมือสร้าง Excel ไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
      return;
    }
    const sample = [
      { 'Exam file name': 'HN-001', 'Last name': 'ผู้รับบริการ', 'First name': 'ตัวอย่าง', 'CAP Enhanced Mean (dB/m)': 265, 'E Median (kPa)': 8.4, 'Height': 170, 'Weight': 71.7, 'Gender': 'M', 'Waist Circumference': 88, 'Exam date (day)': 13, 'Exam date (month)': 8, 'Exam date (year)': 2026, 'Examiner Name': 'นพ. ตัวอย่าง ผู้ตรวจ' },
      { 'Exam file name': 'HN-002', 'Last name': 'ตัวอย่าง', 'First name': 'ข้อมูล', 'CAP Enhanced Mean (dB/m)': 286, 'E Median (kPa)': 11.2, 'Height': 160, 'Weight': 69.4, 'Gender': 'F', 'Waist Circumference': 92, 'Exam date (day)': 13, 'Exam date (month)': 8, 'Exam date (year)': 2569, 'Examiner Name': 'พญ. ตัวอย่าง ผู้ตรวจ' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(sample);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 29 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FibroScan Data');
    XLSX.writeFile(workbook, 'FibroScan_Template.xlsx');
    showToast('ดาวน์โหลดไฟล์ตัวอย่างแล้ว');
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (name === 'ไม่ระบุชื่อ' || name === 'ไม่พบชื่อในไฟล์') return 'NA';
    return parts.slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
  }

  function formatMetric(value, decimals) {
    return value === null ? '—' : Number(value).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function bindEvents() {
    $$('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
    $$('[data-page-link]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.pageLink); }));
    $$('[data-open-upload]').forEach(button => button.addEventListener('click', openUploadModal));
    $$('[data-close-upload]').forEach(button => button.addEventListener('click', closeUploadModal));
    $('#drop-zone').addEventListener('click', () => $('#excel-input').click());
    $('#drop-zone').addEventListener('keydown', event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); $('#excel-input').click(); }
    });
    $('#excel-input').addEventListener('change', event => handleFiles(event.target.files));
    ['dragenter', 'dragover'].forEach(type => $('#drop-zone').addEventListener(type, event => { event.preventDefault(); $('#drop-zone').classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(type => $('#drop-zone').addEventListener(type, event => { event.preventDefault(); $('#drop-zone').classList.remove('drag-over'); }));
    $('#drop-zone').addEventListener('drop', event => handleFiles(event.dataTransfer.files));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeUploadModal(); });
    $('#clear-data-btn').addEventListener('click', resetData);
    $('#export-pdf-btn').addEventListener('click', () => App.exportPDF(showToast));
    $('#download-template-btn').addEventListener('click', downloadTemplate);
    $('#overview-search').addEventListener('input', () => { App.state.tablePage = 1; renderOverviewTable(); });
    $('#table-prev').addEventListener('click', () => { App.state.tablePage -= 1; renderOverviewTable(); });
    $('#table-next').addEventListener('click', () => { App.state.tablePage += 1; renderOverviewTable(); });
    $('#overview-table-body').addEventListener('click', event => {
      const row = event.target.closest('[data-patient-index]');
      if (!row) return;
      App.state.selectedPatientIndex = Number(row.dataset.patientIndex);
      navigate('patients');
      renderPatientList();
    });
    $('#file-manager').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-file]');
      if (button) removeFile(button.dataset.removeFile);
    });
    $('#analysis-mode').addEventListener('change', event => {
      App.state.analysisMode = event.target.value === 'latest' ? 'latest' : 'all';
      App.state.tablePage = 1;
      renderAll();
      showToast(App.state.analysisMode === 'latest' ? 'แสดงผลล่าสุดของผู้ป่วยแต่ละราย' : 'แสดงผลจากทุกรอบตรวจ');
    });
    ['patient-search', 'gender-filter', 'date-filter', 'steatosis-filter', 'fibrosis-filter'].forEach(id => $(`#${id}`).addEventListener(id === 'patient-search' ? 'input' : 'change', renderPatientList));
    $('#patient-list').addEventListener('click', event => {
      const button = event.target.closest('[data-select-patient]');
      if (!button) return;
      App.state.selectedPatientIndex = Number(button.dataset.selectPatient);
      renderPatientList();
    });
    $('#health-card').addEventListener('click', event => {
      const visit = event.target.closest('[data-select-visit]');
      if (visit) {
        App.state.selectedPatientIndex = Number(visit.dataset.selectVisit);
        renderHealthCard(App.state.data[App.state.selectedPatientIndex]);
        return;
      }
      const button = event.target.closest('[data-export-patient]');
      if (!button) return;
      App.exportPatientPDF(Number(button.dataset.exportPatient), showToast, button);
    });
    $('#settings-form').addEventListener('submit', saveSettings);
    $('#reset-settings-btn').addEventListener('click', () => {
      App.saveSettings({ ...App.DEFAULT_SETTINGS });
      fillSettingsForm();
      renderAll();
      showToast('คืนค่าเกณฑ์เริ่มต้นแล้ว');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.loadSettings();
    window.appData = [];
    $('#analysis-mode').value = App.state.analysisMode;
    fillSettingsForm();
    bindEvents();
    const requestedPage = window.location.hash.slice(1);
    navigate(['overview', 'patients', 'analysis', 'settings'].includes(requestedPage) ? requestedPage : 'overview');
    renderAll();
  });
})(window.FibroApp);
