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
      : `${App.state.files.length.toLocaleString('en-US')} files`;
    if (App.state.selectedFileId !== 'all' && !App.state.files.some(file => file.id === App.state.selectedFileId)) {
      App.state.selectedFileId = 'all';
    }
    App.state.tablePage = 1;
    if (!combined.length) App.state.selectedPatientIndex = null;
    else if (!combined[App.state.selectedPatientIndex]) App.state.selectedPatientIndex = 0;
  }

  async function handleFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const dropZone = $('#drop-zone');
    dropZone.classList.add('loading');
    dropZone.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><strong>Reading ${files.length.toLocaleString('en-US')} files...</strong><span>Your data remains on this device.</span>`;
    const existingFingerprints = new Set(App.state.files.map(entry => entry.fingerprint));
    const errors = [];
    let addedFiles = 0;
    let parsedRows = 0;
    try {
      for (const file of files) {
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
          errors.push(`${file.name}: unsupported file type`);
          continue;
        }
        if (file.size > App.MAX_FILE_SIZE) {
          errors.push(`${file.name}: file size exceeds 25 MB`);
          continue;
        }
        const fingerprint = fileFingerprint(file);
        if (existingFingerprints.has(fingerprint)) {
          errors.push(`${file.name}: this file has already been imported`);
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
          errors.push(`${file.name}: ${error.message || 'Unable to read the file'}`);
        }
      }
      if (addedFiles) {
        rebuildCombinedData();
        App.state.selectedPatientIndex = App.state.data.length ? 0 : null;
        closeUploadModal();
        renderAll();
        navigate('overview');
        const duplicateRows = App.state.files.reduce((sum, entry) => sum + entry.duplicateCount, 0);
        showToast(`Added ${addedFiles} file${addedFiles === 1 ? '' : 's'} · Read ${parsedRows.toLocaleString('en-US')} records${duplicateRows ? ` · Excluded ${duplicateRows.toLocaleString('en-US')} duplicate records` : ''}`);
      } else {
        showToast(errors[0] || 'No valid files could be imported.', 'error');
      }
      if (addedFiles && errors.length) setTimeout(() => showToast(`Skipped ${errors.length} file${errors.length === 1 ? '' : 's'}: ${errors[0]}`, 'error'), 3500);
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
      <strong>Drag one or more Excel files here</strong>
      <span>or click to select files from your device</span>
      <small>.XLSX, .XLS · Maximum 25 MB per file</small>`;
  }

  function resetData() {
    App.state.data = [];
    App.state.files = [];
    window.appData = [];
    App.state.fileName = '';
    App.state.selectedFileId = 'all';
    App.state.selectedPatientIndex = null;
    App.state.showIncompleteOnly = false;
    Object.values(App.state.charts).forEach(chart => chart.destroy());
    App.state.charts = {};
    renderAll();
    navigate('overview');
    showToast('Patient data has been cleared from browser memory.');
  }

  function removeFile(fileId) {
    const entry = App.state.files.find(file => file.id === fileId);
    if (!entry) return;
    App.state.files = App.state.files.filter(file => file.id !== fileId);
    if (App.state.selectedFileId === fileId) App.state.selectedFileId = 'all';
    rebuildCombinedData();
    renderAll();
    if (!App.state.data.length) navigate('overview');
    showToast(`${entry.name} has been removed from the analysis.`);
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
    const selectedFile = App.state.files.find(file => file.id === App.state.selectedFileId);
    $('#current-file-name').textContent = hasData ? (selectedFile?.name || App.state.fileName) : '—';

    if (!hasData) return;
    renderDataViewOptions();
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

  function renderDataViewOptions() {
    const select = $('#analysis-mode');
    if (!select) return;
    if (App.state.selectedFileId !== 'all' && !App.state.files.some(file => file.id === App.state.selectedFileId)) {
      App.state.selectedFileId = 'all';
    }
    select.innerHTML = '<option value="all">All imported files</option>' + App.state.files.map(file => (
      `<option value="${escapeHTML(file.id)}">${escapeHTML(file.name)} (${file.activeCount.toLocaleString('en-US')} exams)</option>`
    )).join('');
    select.value = App.state.selectedFileId;
  }

  function renderFileManager() {
    const files = App.state.files;
    const duplicateRows = files.reduce((sum, file) => sum + file.duplicateCount, 0);
    $('#file-manager-summary').textContent = `${files.length.toLocaleString('en-US')} files · ${App.state.data.length.toLocaleString('en-US')} examinations · ${App.getUniquePatientCount().toLocaleString('en-US')} unique patients${duplicateRows ? ` · ${duplicateRows.toLocaleString('en-US')} duplicate records excluded` : ''}`;
    $('#file-manager-list').innerHTML = files.map(file => `
      <div class="file-entry">
        <i class="fa-regular fa-file-excel"></i>
        <div><strong title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</strong><small>${file.activeCount.toLocaleString('en-US')} records${file.duplicateCount ? ` · ${file.duplicateCount.toLocaleString('en-US')} duplicates` : ''}</small></div>
        <button class="file-remove" type="button" data-remove-file="${file.id}" aria-label="Remove ${escapeHTML(file.name)}"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }

  function renderKPIs() {
    const data = App.getAnalysisData();
    const selectedFile = App.state.files.find(file => file.id === App.state.selectedFileId);
    const liverData = data.filter(patient => patient.cap !== null || patient.stiffness !== null);
    const highRisk = liverData.filter(App.isHighRisk);
    const averageE = App.average(data.map(patient => patient.stiffness));
    const averageCAP = App.average(data.map(patient => patient.cap));
    const complete = data.filter(patient => patient.height !== null && patient.weight !== null && patient.bmi !== null && patient.waist !== null && patient.gender !== 'Unspecified').length;
    $('#kpi-total').textContent = App.getUniquePatientCount(data).toLocaleString('en-US');
    $('#kpi-exams').textContent = data.length.toLocaleString('en-US');
    $('#kpi-files').textContent = selectedFile
      ? `Selected file · ${selectedFile.name}`
      : `${App.state.files.length.toLocaleString('en-US')} files · Combined view`;
    $('#kpi-complete').textContent = complete === data.length
      ? 'Complete anthropometric data for all examinations'
      : complete === 0 ? 'Basic liver assessment · Anthropometric data unavailable' : `Complete anthropometric data for ${complete} of ${data.length} examinations`;
    $('#kpi-risk').textContent = liverData.length ? `${Math.round((highRisk.length / liverData.length) * 100)}%` : '—';
    $('#kpi-risk-count').textContent = liverData.length ? `${highRisk.length.toLocaleString('en-US')} examinations meeting follow-up criteria` : 'E Median/CAP data unavailable';
    $('#kpi-e').textContent = averageE === null ? '—' : averageE.toFixed(1);
    $('#kpi-e-label').textContent = averageE === null ? 'No E Median data available' : `Cohort mean corresponds to ${App.classifyFibrosis(averageE).code}`;
    $('#kpi-cap').textContent = averageCAP === null ? '—' : Math.round(averageCAP);
    $('#kpi-cap-label').textContent = averageCAP === null ? 'No CAP data available' : `Cohort mean corresponds to ${App.classifyCap(averageCAP).code}`;

    const dates = data.map(patient => patient.date).filter(Boolean).sort((a, b) => a - b);
    $('#dataset-date-range').innerHTML = dates.length
      ? `<i class="fa-regular fa-calendar"></i> ${App.formatDate(dates[0])} – ${App.formatDate(dates.at(-1))}`
      : '<i class="fa-regular fa-calendar"></i> Examination date unavailable';
    $('#dataset-updated').innerHTML = `<i class="fa-regular fa-clock"></i> Analysed at ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  }

  function renderDataQuality() {
    const data = App.getAnalysisData();
    if (!data.length) return;
    const fieldChecks = [
      { label: 'E Median', missing: data.filter(p => p.stiffness === null).length },
      { label: 'CAP Enhanced Mean', missing: data.filter(p => p.cap === null).length },
      { label: 'Height', missing: data.filter(p => p.height === null).length },
      { label: 'Weight', missing: data.filter(p => p.weight === null).length },
      { label: 'BMI', missing: data.filter(p => p.bmi === null).length },
      { label: 'Waist Circumference', missing: data.filter(p => p.waist === null).length },
      { label: 'Sex', missing: data.filter(p => p.gender === 'Unspecified').length }
    ];
    const incomplete = fieldChecks.filter(field => field.missing > 0);
    const dashboardBanner = $('#data-quality-banner');
    const analysisBanner = $('#analysis-quality-banner');
    if (!incomplete.length) {
      dashboardBanner.classList.add('hidden');
      analysisBanner.classList.add('hidden');
      return;
    }
    const missingText = incomplete.map(field => `${field.label}: ${field.missing}`).join(' · ');
    const bannerHTML = `<i class="fa-solid fa-circle-info"></i><div><strong>Incomplete examination data</strong><p>Some files may contain a basic liver assessment only. Results are displayed only when the required measurements are available; dependent KPIs and analyses remain blank. Missing values: ${missingText}</p></div>`;
    dashboardBanner.innerHTML = bannerHTML;
    analysisBanner.innerHTML = bannerHTML;
    dashboardBanner.classList.remove('hidden');
    analysisBanner.classList.remove('hidden');
  }

  function riskBadge(patient) {
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    if (App.isHighRisk(patient)) return `<span class="risk-badge high"><i></i>Elevated Risk · ${fibrosis.code}/${cap.code}</span>`;
    if (fibrosis.code === 'F2' || cap.code === 'S2') return `<span class="risk-badge medium"><i></i>Clinical Follow-up · ${fibrosis.code}/${cap.code}</span>`;
    if (patient.stiffness === null || patient.cap === null) return `<span class="risk-badge neutral"><i></i>Incomplete Assessment · ${fibrosis.code}/${cap.code}</span>`;
    return `<span class="risk-badge low"><i></i>Lower Risk · ${fibrosis.code}/${cap.code}</span>`;
  }

  function getPatientDataIssues(patient) {
    const issues = [];
    const firstName = String(patient.firstName || '').trim();
    const lastName = String(patient.lastName || '').trim();
    const hasSeparatedName = Boolean(firstName || lastName);

    if (patient.nameMissing) issues.push('Patient name');
    else if (hasSeparatedName) {
      if (!firstName) issues.push('First name');
      if (!lastName) issues.push('Last name');
    }
    if (!patient.id || /^ROW-\d+$/i.test(patient.id)) issues.push('Reference ID');
    if (!(patient.date instanceof Date) || Number.isNaN(patient.date.valueOf())) issues.push('Examination date');
    if (patient.stiffness === null) issues.push('E Median');
    if (patient.cap === null) issues.push('CAP Enhanced Mean');
    if (patient.height === null) issues.push('Height');
    if (patient.weight === null) issues.push('Weight');
    if (patient.bmi === null) issues.push('BMI');
    if (patient.waist === null) issues.push('Waist circumference');
    if (patient.gender === 'Unspecified') issues.push('Sex');
    if (!patient.examiner || patient.examiner === 'Not specified') issues.push('Examiner');
    return issues;
  }

  function renderOverviewTable() {
    const keyword = $('#overview-search').value.trim().toLowerCase();
    const analysisData = App.getAnalysisData();
    const incompleteCount = analysisData.filter(patient => getPatientDataIssues(patient).length > 0).length;
    const qualityFiltered = App.state.showIncompleteOnly
      ? analysisData.filter(patient => getPatientDataIssues(patient).length > 0)
      : analysisData;
    const filtered = qualityFiltered.filter(patient => `${patient.name} ${patient.id} ${patient.sourceFile || ''}`.toLowerCase().includes(keyword));
    const totalPages = Math.max(1, Math.ceil(filtered.length / App.TABLE_PAGE_SIZE));
    App.state.tablePage = Math.min(App.state.tablePage, totalPages);
    const start = (App.state.tablePage - 1) * App.TABLE_PAGE_SIZE;
    const pageData = filtered.slice(start, start + App.TABLE_PAGE_SIZE);
    $('#overview-table-body').innerHTML = pageData.length ? pageData.map(patient => {
      const issues = getPatientDataIssues(patient);
      const qualityCell = issues.length
        ? `<span class="data-quality-status issue"><i class="fa-solid fa-triangle-exclamation"></i>${issues.length} missing</span><small class="data-quality-details">${escapeHTML(issues.join(', '))}</small>`
        : '<span class="data-quality-status complete"><i class="fa-solid fa-circle-check"></i>Complete</span>';
      return `
      <tr data-patient-index="${App.state.data.indexOf(patient)}">
        <td><strong class="patient-id-cell">${escapeHTML(patient.id)}</strong></td>
        <td><div class="person-cell"><span>${escapeHTML(initials(patient.name))}</span><div><strong class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</strong><small>${patient.nameMissing ? 'Name fields not found in source file' : 'Patient name'}</small></div></div></td>
        <td>${App.formatDate(patient.date)}<br><small>${escapeHTML(patient.sourceFile || '')}</small></td>
        <td>${escapeHTML(patient.gender)}</td>
        <td>${formatMetric(patient.bmi, 1)}</td>
        <td><strong>${formatMetric(patient.cap, 0)}</strong> <small>dB/m</small></td>
        <td><strong>${formatMetric(patient.stiffness, 1)}</strong> <small>kPa</small></td>
        <td>${riskBadge(patient)}</td>
        <td>${qualityCell}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="9" class="empty-row">${App.state.showIncompleteOnly ? 'No incomplete examination records were found.' : 'No records match your search.'}</td></tr>`;
    $('#table-count-label').textContent = App.state.showIncompleteOnly
      ? `Showing ${filtered.length.toLocaleString('en-US')} of ${incompleteCount.toLocaleString('en-US')} incomplete examinations`
      : `Showing ${filtered.length.toLocaleString('en-US')} of ${analysisData.length.toLocaleString('en-US')} examinations in this view`;
    const incompleteButton = $('#incomplete-data-toggle');
    incompleteButton.classList.toggle('active', App.state.showIncompleteOnly);
    incompleteButton.setAttribute('aria-pressed', String(App.state.showIncompleteOnly));
    incompleteButton.title = App.state.showIncompleteOnly ? 'Show all examination records' : 'Show only records with missing data';
    $('#incomplete-data-count').textContent = incompleteCount.toLocaleString('en-US');
    $('#table-page-label').textContent = `Page ${App.state.tablePage} / ${totalPages}`;
    $('#table-prev').disabled = App.state.tablePage <= 1;
    $('#table-next').disabled = App.state.tablePage >= totalPages;
  }

  function renderDateFilter() {
    const selected = $('#date-filter').value;
    const analysisData = App.getAnalysisData();
    const dates = [...new Set(analysisData.map(patient => App.toISODate(patient.date)).filter(Boolean))].sort().reverse();
    $('#date-filter').innerHTML = '<option value="">All Dates</option>' + dates.map(date => {
      const source = analysisData.find(patient => App.toISODate(patient.date) === date).date;
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
    return App.getAnalysisData().filter(patient => (
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
    $('#patient-result-count').textContent = `${groups.length.toLocaleString('en-US')} patients · ${filtered.length.toLocaleString('en-US')} examinations`;

    if (!groups.length) {
      $('#patient-list').innerHTML = '<div class="list-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No patients match the selected filters.</p></div>';
      $('#health-card').innerHTML = '<div class="health-empty"><i class="fa-regular fa-address-card"></i><h3>Select a patient to view results</h3></div>';
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
          <small class="patient-id-line">Reference ID ${escapeHTML(patient.id)}</small>
          <strong class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</strong>
          <small>Latest ${App.formatDate(patient.date)} · ${visits.length.toLocaleString('en-US')} visits</small>
        </span>
        <span class="patient-badges"><span class="stage-pill ${fibrosisStage.className}">${fibrosisStage.code}</span><span class="stage-pill ${steatosisStage.className}">${steatosisStage.code}</span></span>
      </button>`;
    }).join('');
    renderHealthCard(App.state.data[App.state.selectedPatientIndex]);
  }

  function capGaugePosition(value, settings) {
    if (value === null || !Number.isFinite(value)) return 0;

    const clamp = position => Math.max(0, Math.min(98, position));
    const interpolate = (current, start, end, bandStart) => {
      const range = Math.max(1, end - start);
      return bandStart + ((current - start) / range) * 25;
    };

    if (value <= settings.capS0Max) {
      return clamp((Math.max(0, value) / Math.max(1, settings.capS0Max)) * 25);
    }
    if (value < settings.capS1) return 25;
    if (value < settings.capS2) return clamp(interpolate(value, settings.capS1, settings.capS2, 25));
    if (value < settings.capS3) return clamp(interpolate(value, settings.capS2, settings.capS3, 50));

    // Reserve headroom in S3 while keeping unusually high CAP values inside the track.
    const upperBound = Math.max(400, settings.capS3 + 100, value + 10);
    return clamp(interpolate(value, settings.capS3, upperBound, 75));
  }

  function renderHealthCard(patient) {
    if (!patient) return;
    const patientKey = App.getPatientKey(patient);
    const visits = App.getAnalysisData().filter(item => App.getPatientKey(item) === patientKey).sort((a, b) => {
      const aTime = a.date instanceof Date ? a.date.valueOf() : -1;
      const bTime = b.date instanceof Date ? b.date.valueOf() : -1;
      return bTime - aTime || App.state.data.indexOf(b) - App.state.data.indexOf(a);
    });
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    const bmiGroup = App.classifyBMI(patient.bmi);
    // Use one dynamic scale for the marker, colored bands, and centered labels.
    // This keeps the gauge aligned when the clinical thresholds are changed in Settings.
    const fibrosisScaleMax = Math.max(20, App.state.settings.eF4 * 1.35);
    const toFibrosisPosition = (value) => Math.max(0, Math.min(100, (value / fibrosisScaleMax) * 100));
    const fibrosisF2Position = toFibrosisPosition(App.state.settings.eF2);
    const fibrosisF3Position = Math.max(fibrosisF2Position, toFibrosisPosition(App.state.settings.eF3));
    const fibrosisF4Position = Math.max(fibrosisF3Position, toFibrosisPosition(App.state.settings.eF4));
    const fibrosisBandWidths = [
      fibrosisF2Position,
      fibrosisF3Position - fibrosisF2Position,
      fibrosisF4Position - fibrosisF3Position,
      100 - fibrosisF4Position
    ];
    const fibrosisWidth = patient.stiffness === null ? 0 : toFibrosisPosition(patient.stiffness);
    // CAP uses four equal clinical bands (S0-S3). The marker is interpolated
    // within its actual threshold range so the numeric result and grade always agree.
    const capWidth = capGaugePosition(patient.cap, App.state.settings);
    const riskText = App.isHighRisk(patient)
      ? 'One or more measurements meet the configured criteria for clinical assessment and follow-up.'
      : 'The available measurements do not meet the configured elevated-risk criteria.';
    $('#health-card').innerHTML = `
      <div class="health-header">
        <div class="health-person"><span>${escapeHTML(initials(patient.name))}</span><div class="health-identity"><p>Individual FibroScan Result</p><div class="identity-row"><small>Reference ID</small><strong>${escapeHTML(patient.id)}</strong></div><div class="identity-row patient-name-row"><small>Patient Name</small><h2 class="${patient.nameMissing ? 'missing-name' : ''}">${escapeHTML(patient.name)}</h2></div><small>Examined on ${App.formatDate(patient.date, 'long')} · Source file: ${escapeHTML(patient.sourceFile || 'Not specified')}</small></div></div>
        <div class="health-header-actions">${riskBadge(patient)}<button type="button" class="btn btn-secondary btn-patient-pdf" data-export-patient="${App.state.data.indexOf(patient)}"><i class="fa-solid fa-file-pdf"></i> Export Individual PDF</button></div>
      </div>
      <div class="health-metrics">
        <article class="metric-card fibrosis-metric">
          <div class="metric-heading"><span><img class="liver-icon liver-icon--metric" src="assets/liver-icon.svg" alt="" aria-hidden="true"></span><div><small>Liver Stiffness</small><strong>E Median</strong></div><b class="stage-pill ${fibrosis.className}">${fibrosis.code}</b></div>
          <div class="metric-number"><strong>${formatMetric(patient.stiffness, 1)}</strong><span>kPa</span></div>
          <div class="gauge"><div class="gauge-track fibrosis-track" style="--f2-stop:${fibrosisF2Position}%;--f3-stop:${fibrosisF3Position}%;--f4-stop:${fibrosisF4Position}%"><i style="width:${fibrosisWidth}%"></i><b style="left:${Math.min(98, fibrosisWidth)}%"></b></div><div class="gauge-labels fibrosis-gauge-labels" style="grid-template-columns:${fibrosisBandWidths.map((width) => `${width}%`).join(' ')}"><span>F0-F1 ≤ ${App.state.settings.eF01Max}</span><span>F2 ≥ ${App.state.settings.eF2}</span><span>F3 ≥ ${App.state.settings.eF3}</span><span>F4 ≥ ${App.state.settings.eF4}</span></div></div>
          <p>Interpretation: <strong>${fibrosis.label} (${fibrosis.code})</strong><br><small>Fibrosis range: ${fibrosis.range}</small></p>
        </article>
        <article class="metric-card cap-metric">
          <div class="metric-heading"><span><i class="fa-solid fa-droplet"></i></span><div><small>Hepatic Steatosis</small><strong>CAP Enhanced Mean</strong></div><b class="stage-pill ${cap.className}">${cap.code}</b></div>
          <div class="metric-number"><strong>${formatMetric(patient.cap, 0)}</strong><span>dB/m</span></div>
          <div class="gauge"><div class="gauge-track cap-track"><i style="width:${capWidth}%"></i><b style="left:${Math.min(98, capWidth)}%"></b></div><div class="gauge-labels cap-gauge-labels"><span>S0 ≤ ${App.state.settings.capS0Max}</span><span>S1 ≥ ${App.state.settings.capS1}</span><span>S2 ≥ ${App.state.settings.capS2}</span><span>S3 ≥ ${App.state.settings.capS3}</span></div></div>
          <p>Interpretation: <strong>${cap.label} (${cap.code}) · Estimated liver fat ${cap.liverFat}</strong><br><small>CAP range: ${cap.range}</small></p>
        </article>
      </div>
      <div class="supporting-metrics">
        <div><span><i class="fa-solid fa-weight-scale"></i></span><p>Calculated BMI<strong>${formatMetric(patient.bmi, 1)} <small>kg/m²</small></strong><small>${bmiGroup.label}</small></p></div>
        <div><span><i class="fa-solid fa-arrows-up-down"></i></span><p>Height<strong>${formatMetric(patient.height, 1)} <small>cm</small></strong></p></div>
        <div><span><i class="fa-solid fa-weight-hanging"></i></span><p>Weight<strong>${formatMetric(patient.weight, 1)} <small>kg</small></strong></p></div>
        <div><span><i class="fa-solid fa-ruler"></i></span><p>Waist Circumference<strong>${formatMetric(patient.waist, 1)} <small>cm</small></strong><small>${App.isHighWaist(patient) === null ? 'Classification unavailable' : App.isHighWaist(patient) ? 'Elevated waist circumference' : 'Below elevated threshold'}</small></p></div>
        <div><span><i class="fa-solid fa-venus-mars"></i></span><p>Sex<strong>${escapeHTML(patient.gender)}</strong></p></div>
        <div><span><i class="fa-solid fa-user-doctor"></i></span><p>Examiner<strong>${escapeHTML(patient.examiner)}</strong></p></div>
      </div>
      <section class="patient-history">
        <div class="patient-history-head"><h3>Longitudinal Examination History</h3><span>${visits.length.toLocaleString('en-US')} examinations</span></div>
        <div class="patient-history-list">${visits.map(visit => {
          const index = App.state.data.indexOf(visit);
          const visitFibrosis = App.classifyFibrosis(visit.stiffness);
          const visitCap = App.classifyCap(visit.cap);
          return `<button type="button" class="history-visit ${visit === patient ? 'active' : ''}" data-select-visit="${index}"><span><strong>${App.formatDate(visit.date, 'long')}</strong><small>${escapeHTML(visit.sourceFile || 'Source file not specified')}</small></span><b>${visitFibrosis.code}</b><b>${visitCap.code}</b><span>E ${formatMetric(visit.stiffness, 1)} · CAP ${formatMetric(visit.cap, 0)}</span></button>`;
        }).join('')}</div>
      </section>
      <div class="interpretation ${App.isHighRisk(patient) ? 'warning' : ''}"><i class="fa-solid ${App.isHighRisk(patient) ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i><div><strong>Preliminary Interpretation</strong><p>${riskText} This result is not a diagnosis and must be interpreted alongside other clinical information.</p></div></div>`;
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
    const maleCap = App.average(data.filter(p => p.gender === 'Male').map(p => p.cap));
    const femaleCap = App.average(data.filter(p => p.gender === 'Female').map(p => p.cap));
    const paired = data.filter(p => p.bmi !== null && p.cap !== null).map(p => ({ x: p.bmi, y: p.cap }));
    const correlation = pearsonCorrelation(paired);
    const largeWaist = data.filter(p => App.isHighWaist(p) === true);
    const largeWaistRisk = largeWaist.length ? Math.round((largeWaist.filter(App.isHighRisk).length / largeWaist.length) * 100) : null;
    const highRiskPercent = Math.round((data.filter(App.isHighRisk).length / data.length) * 100);
    let genderText = 'Insufficient sex-specific data for comparison.';
    if (maleCap !== null && femaleCap !== null && femaleCap !== 0) {
      const difference = ((maleCap - femaleCap) / femaleCap) * 100;
      genderText = `Mean CAP was ${Math.abs(difference).toFixed(1)}% ${difference >= 0 ? 'higher' : 'lower'} in males than in females.`;
    }
    let correlationText = 'Insufficient paired BMI and CAP data to estimate correlation.';
    if (correlation !== null) {
      const strength = Math.abs(correlation) >= .7 ? 'strong' : Math.abs(correlation) >= .4 ? 'moderate' : 'weak';
      correlationText = `BMI and Mean CAP showed a ${strength} ${correlation >= 0 ? 'positive' : 'negative'} correlation (r = ${correlation.toFixed(2)}).`;
    }
    const insights = [
      { icon: 'fa-venus-mars', title: 'Difference by Sex', text: genderText },
      { icon: 'fa-chart-simple', title: 'BMI and Hepatic Steatosis', text: correlationText },
      { icon: 'fa-ruler', title: 'Elevated Waist Circumference', text: largeWaistRisk === null ? 'Insufficient waist circumference and sex data for classification.' : `${largeWaistRisk}% of examinations with elevated waist circumference (male ≥ ${App.state.settings.waistMaleHigh} cm; female ≥ ${App.state.settings.waistFemaleHigh} cm) met the elevated-risk criteria.` },
      { icon: 'fa-user-shield', title: 'Overall Risk Profile', text: `${highRiskPercent}% of examinations met the elevated-risk criteria based on E Median or Mean CAP.` }
    ];
    $('#insight-list').innerHTML = insights.map((item, index) => `<div class="insight-item"><span>0${index + 1}</span><i class="fa-solid ${item.icon}"></i><div><strong>${item.title}</strong><p>${item.text}</p></div></div>`).join('');
  }

  function renderRiskFactorSummary() {
    if (!App.state.data.length) return;
    const factors = App.getRiskFactorAnalysis(App.getAnalysisData());
    const lookup = key => factors.find(group => group.key === key);
    const comparisons = [
      { title: 'Obesity Class II vs. Normal BMI', icon: 'fa-weight-scale', high: lookup('bmi-obese-2'), reference: lookup('bmi-normal') },
      { title: 'Elevated vs. Lower Waist Circumference', icon: 'fa-ruler', high: lookup('waist-high'), reference: lookup('waist-normal') },
      { title: 'Male vs. Female', icon: 'fa-venus-mars', high: lookup('gender-male'), reference: lookup('gender-female') }
    ];
    $('#risk-factor-summary').innerHTML = comparisons.map(item => {
      const fibrosisDiff = App.percentagePointDifference(item.high, item.reference, 'fibrosisRate');
      const steatosisDiff = App.percentagePointDifference(item.high, item.reference, 'steatosisRate');
      const formatDiff = value => value === null ? 'Insufficient data' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} percentage points`;
      return `<article class="factor-summary-card">
        <span><i class="fa-solid ${item.icon}"></i></span>
        <div><strong>${item.title}</strong><small>Sample sizes: ${item.high?.count || 0} vs. ${item.reference?.count || 0}</small>
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
      showToast('CAP thresholds must increase sequentially from the S0 maximum through S1, S2, and S3.', 'error');
      return;
    }
    if (!(settings.eF01Max < settings.eF2 && settings.eF2 < settings.eF3 && settings.eF3 < settings.eF4)) {
      showToast('Liver stiffness thresholds must increase sequentially from the F0-F1 maximum through F2, F3, and F4.', 'error');
      return;
    }
    if (!(settings.bmiNormalStart < settings.bmiOverweightStart && settings.bmiOverweightStart < settings.bmiObesity1Start && settings.bmiObesity1Start < settings.bmiObesity2Start)) {
      showToast('BMI thresholds must increase sequentially from Normal through Overweight, Obesity Class I, and Obesity Class II.', 'error');
      return;
    }
    if (!(settings.waistMaleHigh > 0 && settings.waistFemaleHigh > 0)) {
      showToast('Male and female waist circumference thresholds must be greater than zero.', 'error');
      return;
    }
    App.saveSettings(settings);
    fillSettingsForm();
    renderAll();
    showToast('Thresholds saved and all results recalculated.');
  }

  function downloadTemplate() {
    if (!window.XLSX) {
      showToast('The Excel export library is not available. Please try again.', 'error');
      return;
    }
    const sample = [
      { 'Exam file name': 'HN-001', 'Last name': 'Patient', 'First name': 'Example', 'CAP Enhanced Mean (dB/m)': 265, 'E Median (kPa)': 8.4, 'Height': 170, 'Weight': 71.7, 'Gender': 'M', 'Waist Circumference': 88, 'Exam date (day)': 13, 'Exam date (month)': 8, 'Exam date (year)': 2026, 'Examiner Name': 'Dr Sample Examiner' },
      { 'Exam file name': 'HN-002', 'Last name': 'Record', 'First name': 'Sample', 'CAP Enhanced Mean (dB/m)': 286, 'E Median (kPa)': 11.2, 'Height': 160, 'Weight': 69.4, 'Gender': 'F', 'Waist Circumference': 92, 'Exam date (day)': 13, 'Exam date (month)': 8, 'Exam date (year)': 2026, 'Examiner Name': 'Dr Sample Examiner' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(sample);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 29 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FibroScan Data');
    XLSX.writeFile(workbook, 'FibroScan_Template.xlsx');
    showToast('Excel template downloaded.');
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (name === 'Name unavailable') return 'NA';
    return parts.slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
  }

  function formatMetric(value, decimals) {
    return value === null ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
    $('#incomplete-data-toggle').addEventListener('click', () => {
      App.state.showIncompleteOnly = !App.state.showIncompleteOnly;
      App.state.tablePage = 1;
      renderOverviewTable();
    });
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
      const selectedFileId = event.target.value;
      App.state.selectedFileId = selectedFileId === 'all' || App.state.files.some(file => file.id === selectedFileId)
        ? selectedFileId
        : 'all';
      App.state.tablePage = 1;
      const firstVisiblePatient = App.getAnalysisData()[0];
      App.state.selectedPatientIndex = firstVisiblePatient ? App.state.data.indexOf(firstVisiblePatient) : null;
      renderAll();
      const selectedFile = App.state.files.find(file => file.id === App.state.selectedFileId);
      showToast(selectedFile ? `Showing data from ${selectedFile.name}.` : 'Showing the combined data from all imported files.');
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
      showToast('Default clinical thresholds restored.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.loadSettings();
    window.appData = [];
    fillSettingsForm();
    bindEvents();
    const requestedPage = window.location.hash.slice(1);
    navigate(['overview', 'patients', 'analysis', 'settings'].includes(requestedPage) ? requestedPage : 'overview');
    renderAll();
  });
})(window.FibroApp);
