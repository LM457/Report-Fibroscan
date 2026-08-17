(function (App) {
  'use strict';

  const escapeHTML = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const metric = (value, decimals = 1) => value === null || value === undefined
    ? '—'
    : Number(value).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const companyLogo = className => App.COMPANY_LOGO_DATA_URL
    ? `<img class="${className}" src="${App.COMPANY_LOGO_DATA_URL}" alt="Valor Health">`
    : '<strong class="pdf-logo-fallback">Valor Health</strong>';

  function pageShell(title, kicker, content, pageClass = '') {
    return `<section class="pdf-page ${pageClass}">
      <header class="pdf-header"><div class="pdf-brand">${companyLogo('pdf-company-logo')}<div><strong>FibroSight</strong><small>รายงานวิเคราะห์ข้อมูล FibroScan</small></div></div><div class="pdf-confidential"><i class="fa-solid fa-shield-halved"></i> ข้อมูลลับทางสุขภาพ</div></header>
      <div class="pdf-title"><p>${kicker}</p><h1>${title}</h1></div>
      ${content}
      <footer class="pdf-footer"><span>สร้างภายในเบราว์เซอร์ · ไม่มีการส่งข้อมูลขึ้นเซิร์ฟเวอร์</span><b data-pdf-page></b></footer>
    </section>`;
  }

  function chartPanel(title, subtitle, image, centerText = '', legendItems = []) {
    const visual = image
      ? `<img class="pdf-chart-image" src="${image}" alt="${escapeHTML(title)}">${centerText ? `<span class="pdf-chart-total">${centerText}<small>ราย</small></span>` : ''}`
      : '<div class="pdf-chart-fallback">ไม่มีกราฟสำหรับชุดข้อมูลนี้</div>';
    const legend = legendItems.length
      ? `<div class="pdf-chart-legend">${legendItems.map(item => `<div><span><i style="background:${item.color}"></i>${item.code} ${item.label}</span><b>${item.count} ราย · ${item.percent.toFixed(1)}%</b></div>`).join('')}</div>`
      : '';
    return `<article class="pdf-panel pdf-chart-panel ${legend ? 'pdf-chart-with-legend' : ''}"><div class="pdf-panel-head"><h2>${title}</h2><p>${subtitle}</p></div><div class="pdf-chart-image-wrap">${visual}</div>${legend}</article>`;
  }

  function distribution(data, classify, codes, labels, colors) {
    const counts = Object.fromEntries(codes.map(code => [code, 0]));
    data.forEach(patient => {
      const result = classify(patient);
      if (Object.hasOwn(counts, result.code)) counts[result.code] += 1;
    });
    const measured = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return codes.map((code, index) => ({ code, label: labels[index], color: colors[index], count: counts[code], percent: measured ? (counts[code] / measured) * 100 : 0 }));
  }

  function dashboardPage(chartImages = {}) {
    const data = App.getAnalysisData ? App.getAnalysisData() : App.state.data;
    const allExams = App.state.data;
    const uniquePatients = App.getUniquePatientCount ? App.getUniquePatientCount(allExams) : allExams.length;
    const fileNames = (App.state.files || []).map(file => file.name);
    const fileSummary = fileNames.length > 3
      ? `${fileNames.slice(0, 3).join(', ')} และอีก ${fileNames.length - 3} ไฟล์`
      : fileNames.join(', ');
    const fibrosis = distribution(data, p => App.classifyFibrosis(p.stiffness), ['F0-F1', 'F2', 'F3', 'F4'], ['ไม่มีนัยสำคัญ', 'ปานกลาง', 'รุนแรง', 'ตับแข็ง'], ['#2dd4bf', '#f59e0b', '#f97366', '#dc4c64']);
    const cap = distribution(data, p => App.classifyCap(p.cap), ['S0', 'S1', 'S2', 'S3'], ['ปกติ', 'เล็กน้อย', 'ปานกลาง', 'มาก'], ['#2dd4bf', '#a3e635', '#f59e0b', '#f97366']);
    const liverData = data.filter(patient => patient.cap !== null || patient.stiffness !== null);
    const highRisk = liverData.filter(App.isHighRisk).length;
    const averageBMI = App.average(data.map(p => p.bmi));
    const averageCAP = App.average(data.map(p => p.cap));
    const dates = data.map(p => p.date).filter(Boolean).sort((a, b) => a - b);
    const dateText = dates.length ? `${App.formatDate(dates[0], 'long')} - ${App.formatDate(dates.at(-1), 'long')}` : 'ไม่ระบุ';
    const bars = (title, subtitle, items) => `<article class="pdf-panel"><div class="pdf-panel-head"><h2>${title}</h2><p>${subtitle}</p></div><div class="pdf-bars">${items.map(item => `<div class="pdf-bar-row"><div><span><i style="background:${item.color}"></i>${item.code} ${item.label}</span><b>${item.count} ราย · ${item.percent.toFixed(1)}%</b></div><em><i style="width:${item.percent}%;background:${item.color}"></i></em></div>`).join('')}</div></article>`;
    const content = `
      <div class="pdf-meta"><span><b>ไฟล์:</b> ${escapeHTML(fileNames.length ? `${fileNames.length} ไฟล์ - ${fileSummary}` : App.state.fileName)}</span><span><b>ช่วงวันที่ตรวจ:</b> ${dateText}</span><span><b>มุมมอง:</b> ${App.state.analysisMode === 'latest' ? 'ผลล่าสุดต่อผู้ป่วย' : 'ทุกรอบตรวจ'} · สร้างเมื่อ ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</span></div>
      <div class="pdf-kpis">
        <article><span><i class="fa-solid fa-user-group"></i></span><small>ผู้ป่วยไม่ซ้ำ</small><strong>${uniquePatients.toLocaleString('th-TH')} <em>ราย</em></strong><p>${allExams.length.toLocaleString('th-TH')} ครั้งตรวจจาก ${(App.state.files || []).length.toLocaleString('th-TH')} ไฟล์</p></article>
        <article><span><i class="fa-solid fa-triangle-exclamation"></i></span><small>กลุ่มเสี่ยงสูง</small><strong>${liverData.length ? ((highRisk / liverData.length) * 100).toFixed(1) : '—'}${liverData.length ? '<em>%</em>' : ''}</strong><p>${liverData.length ? `${highRisk} ราย` : 'ข้อมูล E/CAP ไม่ครบ'}</p></article>
        <article><span><i class="fa-solid fa-weight-scale"></i></span><small>BMI เฉลี่ย (คำนวณ)</small><strong>${metric(averageBMI, 1)}</strong><p>kg/m²</p></article>
        <article><span><i class="fa-solid fa-droplet"></i></span><small>Mean CAP เฉลี่ย</small><strong>${metric(averageCAP, 0)}</strong><p>dB/m</p></article>
      </div>
      <div class="pdf-two-column">${chartPanel('ระดับพังผืดในตับ', 'วงกลมครบ 100% เท่ากับผู้ที่มีค่า E ทั้งหมด', chartImages.fibrosis, fibrosis.reduce((sum, item) => sum + item.count, 0), fibrosis)}${chartPanel('ระดับไขมันพอกตับ', 'จำนวนผู้รับการตรวจในแต่ละระดับ CAP', chartImages.cap, '', cap)}</div>
      <article class="pdf-definition"><h2>นิยามที่ใช้ในรายงาน</h2><div><p><b>กลุ่มเสี่ยงสูง</b> มีค่า E Median ตั้งแต่ F3 หรือ CAP Median ตั้งแต่ S3 อย่างน้อยหนึ่งรายการ</p><p><b>Fibrosis ที่มีนัยสำคัญ</b> มีค่า E ตั้งแต่ F2</p><p><b>Steatosis</b> มีค่า CAP ตั้งแต่ S1</p><p><b>BMI</b> คำนวณจาก Weight (kg) ÷ Height (m)²</p></div></article>`;
    return pageShell('ภาพรวมผล FibroScan', 'สรุปแดชบอร์ด', content, 'pdf-dashboard-page');
  }

  function analysisChartsPage(chartImages = {}) {
    const metabolicContent = `<div class="pdf-chart-page-grid">
      ${chartPanel('BMI เทียบกับ Mean CAP', 'ความสัมพันธ์ระหว่าง BMI และไขมันในตับ', chartImages.bmiCap)}
      ${chartPanel('BMI เทียบกับ Mean Fibrosis', 'ความสัมพันธ์ระหว่าง BMI และ E Median (kPa)', chartImages.bmiE)}
    </div>`;
    const waistContent = `<div class="pdf-chart-page-grid">
      ${chartPanel('Mean CAP ตามช่วงรอบเอว', 'เปรียบเทียบค่าเฉลี่ยตามกลุ่มรอบเอว', chartImages.waist)}
      ${chartPanel('Mean Fibrosis ตามช่วงรอบเอว', 'เปรียบเทียบ E Median (kPa) ตามกลุ่มรอบเอว', chartImages.waistE)}
    </div>`;
    return pageShell('กราฟวิเคราะห์ตาม BMI', 'แดชบอร์ดประกอบรายงาน', metabolicContent, 'pdf-analysis-charts-page pdf-scatter-page')
      + pageShell('กราฟวิเคราะห์ตามรอบเอว', 'แดชบอร์ดประกอบรายงาน', waistContent, 'pdf-analysis-charts-page pdf-line-page');
  }

  function demographicChartPage(chartImages = {}) {
    const content = `<div class="pdf-single-chart-grid">
      ${chartPanel('เปรียบเทียบสุขภาพตับตามเพศ', 'เปรียบเทียบ Mean CAP และ E Median (kPa) ระหว่างกลุ่มเพศ', chartImages.gender)}
    </div>`;
    return pageShell('การเปรียบเทียบตามเพศ', 'แดชบอร์ดประกอบรายงาน', content, 'pdf-demographic-chart-page');
  }

  function riskFactorChartsPage(chartImages = {}) {
    const content = `<div class="pdf-risk-chart-key"><span><i style="background:#0f766e"></i> Fibrosis ≥ F2</span><span><i style="background:#f59e0b"></i> Steatosis ≥ S1</span><em>แกนนอนแสดงอัตราการพบ 0-100%</em></div><div class="pdf-risk-chart-grid">
      ${chartPanel('BMI', 'อัตราการพบ Fibrosis ≥ F2 และ Steatosis ≥ S1 แยกตามกลุ่ม BMI', chartImages.riskBMI)}
      ${chartPanel('รอบเอว', 'อัตราการพบ Fibrosis ≥ F2 และ Steatosis ≥ S1 แยกตามความเสี่ยงรอบเอว', chartImages.riskWaist)}
      ${chartPanel('เพศ', 'อัตราการพบ Fibrosis ≥ F2 และ Steatosis ≥ S1 แยกตามเพศ', chartImages.riskGender)}
    </div>`;
    return pageShell('อัตราการพบภาวะตามปัจจัยสุขภาพ', 'กราฟแท่งแนวนอนจากหน้าเว็บ', content, 'pdf-risk-charts-page');
  }

  function factorPage() {
    const factors = App.getRiskFactorAnalysis(App.getAnalysisData ? App.getAnalysisData() : App.state.data).filter(group => group.count > 0);
    const lookup = key => factors.find(group => group.key === key);
    const comparisons = [
      ['BMI อ้วนระดับ 2 เทียบกลุ่มปกติ', lookup('bmi-obese-2'), lookup('bmi-normal')],
      ['รอบเอวสูง เทียบรอบเอวไม่สูง', lookup('waist-high'), lookup('waist-normal')],
      ['เพศชาย เทียบเพศหญิง', lookup('gender-male'), lookup('gender-female')]
    ];
    const diffText = (high, reference, field) => {
      const value = App.percentagePointDifference(high, reference, field);
      return value === null ? 'ข้อมูลไม่เพียงพอ' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} จุดเปอร์เซ็นต์`;
    };
    const rows = factors.map(group => `<tr><td><strong>${group.label}</strong><small>${group.type}</small></td><td>${group.count}</td><td>${group.fibrosisN}</td><td>${group.fibrosisRate === null ? '—' : `${group.fibrosisRate.toFixed(1)}%`}</td><td>${group.steatosisN}</td><td>${group.steatosisRate === null ? '—' : `${group.steatosisRate.toFixed(1)}%`}</td></tr>`).join('');
    const content = `
      <div class="pdf-callout"><i class="fa-solid fa-circle-info"></i><p><strong>วิธีอ่านผล</strong> เปอร์เซ็นต์คืออัตราการพบภาวะภายในแต่ละกลุ่ม ไม่ใช่เปอร์เซ็นต์ที่ปัจจัยนั้น “ก่อให้เกิด” โรค และไม่ควรใช้สรุปเหตุและผล</p></div>
      <article class="pdf-panel pdf-factor-table"><div class="pdf-panel-head"><h2>อัตราการพบแยกตามกลุ่ม</h2><p>รอบเอวสูงใช้เกณฑ์ชาย ≥ ${App.state.settings.waistMaleHigh} cm และหญิง ≥ ${App.state.settings.waistFemaleHigh} cm</p></div><table><thead><tr><th>กลุ่ม</th><th>ทั้งหมด</th><th>มีค่า E</th><th>Fibrosis ≥ F2</th><th>มีค่า CAP</th><th>Steatosis ≥ S1</th></tr></thead><tbody>${rows}</tbody></table></article>
      <div class="pdf-comparison-grid">${comparisons.map(([title, high, reference]) => `<article><h3>${title}</h3><p><span>Fibrosis ≥ F2</span><b>${diffText(high, reference, 'fibrosisRate')}</b></p><p><span>Steatosis ≥ S1</span><b>${diffText(high, reference, 'steatosisRate')}</b></p><small>เปรียบเทียบ ${high?.count || 0} กับ ${reference?.count || 0} ราย</small></article>`).join('')}</div>
      <article class="pdf-notes"><h2>ข้อจำกัดในการแปลผล</h2><ul><li>ผลนี้เป็นการวิเคราะห์เชิงพรรณนาและไม่มีการปรับตัวแปรกวน เช่น อายุ โรคร่วม หรือการใช้ยา</li><li>กลุ่มที่มีจำนวนตัวอย่างน้อยอาจทำให้เปอร์เซ็นต์เปลี่ยนแปลงมาก</li><li>ข้อมูลที่ขาดจะถูกตัดออกเฉพาะการคำนวณที่เกี่ยวข้อง โดยแสดงจำนวนข้อมูลที่ใช้ในตาราง</li><li>ไม่ใช่การวินิจฉัยหรือคำแนะนำทางการแพทย์</li></ul></article>`;
    return pageShell('ความสัมพันธ์ของปัจจัยสุขภาพ', 'การวิเคราะห์เชิงลึก', content, 'pdf-factor-page');
  }

  function settingsPage() {
    const s = App.state.settings;
    const content = `<div class="pdf-two-column">
      <article class="pdf-panel pdf-thresholds"><div class="pdf-panel-head"><h2>เกณฑ์ไขมันพอกตับ</h2><p>CAP Enhanced Mean (dB/m)</p></div><div><p><span>S0 ปกติ</span><b>≤ ${s.capS0Max}</b></p><p><span>S1 เล็กน้อย</span><b>≥ ${s.capS1} และ &lt; ${s.capS2}</b></p><p><span>S2 ปานกลาง</span><b>≥ ${s.capS2} และ &lt; ${s.capS3}</b></p><p><span>S3 รุนแรง</span><b>≥ ${s.capS3}</b></p></div></article>
      <article class="pdf-panel pdf-thresholds"><div class="pdf-panel-head"><h2>เกณฑ์พังผืดในตับ</h2><p>E Median (kPa)</p></div><div><p><span>F0-F1 ไม่มีนัยสำคัญ</span><b>≤ ${s.eF01Max}</b></p><p><span>F2 ปานกลาง</span><b>≥ ${s.eF2} และ &lt; ${s.eF3}</b></p><p><span>F3 รุนแรง</span><b>≥ ${s.eF3} และ &lt; ${s.eF4}</b></p><p><span>F4 ตับแข็ง</span><b>≥ ${s.eF4}</b></p></div></article>
      <article class="pdf-panel pdf-thresholds"><div class="pdf-panel-head"><h2>เกณฑ์กลุ่ม BMI</h2><p>หน่วย kg/m²</p></div><div><p><span>น้ำหนักต่ำ</span><b>&lt; ${s.bmiNormalStart}</b></p><p><span>ปกติ</span><b>≥ ${s.bmiNormalStart} และ &lt; ${s.bmiOverweightStart}</b></p><p><span>น้ำหนักเกิน</span><b>≥ ${s.bmiOverweightStart} และ &lt; ${s.bmiObesity1Start}</b></p><p><span>อ้วนระดับ 1</span><b>≥ ${s.bmiObesity1Start} และ &lt; ${s.bmiObesity2Start}</b></p><p><span>อ้วนระดับ 2</span><b>≥ ${s.bmiObesity2Start}</b></p></div></article>
      <article class="pdf-panel pdf-thresholds"><div class="pdf-panel-head"><h2>เกณฑ์รอบเอวเสี่ยงสูง</h2><p>แยกตามเพศ หน่วย cm</p></div><div><p><span>เพศชาย</span><b>≥ ${s.waistMaleHigh}</b></p><p><span>เพศหญิง</span><b>≥ ${s.waistFemaleHigh}</b></p></div></article>
    </div><article class="pdf-notes"><h2>สูตรและหลักการคำนวณ</h2><ul><li>BMI = น้ำหนักหน่วยกิโลกรัม ÷ (ส่วนสูงหน่วยเมตร)²</li><li>หาก Height มีค่ามากกว่า 3 ระบบจะตีความเป็นเซนติเมตร</li><li>ข้อมูลผู้รับการตรวจถูกประมวลผลใน RAM ของเบราว์เซอร์ และไม่ได้ถูกเขียนลง localStorage</li><li>localStorage ใช้บันทึกเฉพาะค่าเกณฑ์ทางคลินิกข้างต้น</li></ul></article>`;
    return pageShell('เกณฑ์และวิธีคำนวณ', 'การตั้งค่าที่ใช้', content, 'pdf-settings-page');
  }

  function patientPages() {
    const chunkSize = 17;
    const pages = [];
    for (let start = 0; start < App.state.data.length; start += chunkSize) {
      const chunk = App.state.data.slice(start, start + chunkSize);
      const rows = chunk.map((p, index) => {
        const fibrosis = App.classifyFibrosis(p.stiffness);
        const cap = App.classifyCap(p.cap);
        const risk = App.isHighRisk(p) ? 'สูง' : (fibrosis.code === 'F2' || cap.code === 'S2') ? 'เฝ้าระวัง' : 'ต่ำ';
        return `<tr><td>${start + index + 1}</td><td><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.id)} · ผู้ตรวจ ${escapeHTML(p.examiner)}</small></td><td>${App.formatDate(p.date)}<small>${escapeHTML(p.sourceFile || '')}</small></td><td>${escapeHTML(p.gender)}</td><td>${metric(p.height, 1)}</td><td>${metric(p.weight, 1)}</td><td>${metric(p.bmi, 1)}</td><td>${metric(p.waist, 1)}</td><td>${metric(p.cap, 0)}<small>${cap.code}</small></td><td>${metric(p.stiffness, 1)}<small>${fibrosis.code}</small></td><td>${risk}</td></tr>`;
      }).join('');
      const content = `<div class="pdf-table-caption"><span>รายการ ${start + 1}-${Math.min(start + chunkSize, App.state.data.length)} จาก ${App.state.data.length} ครั้งตรวจ</span><span>หน่วย: ส่วนสูง/รอบเอว cm · น้ำหนัก kg · CAP dB/m · E kPa</span></div><article class="pdf-data-table"><table><thead><tr><th>#</th><th>ผู้รับการตรวจ</th><th>วันที่/ไฟล์</th><th>เพศ</th><th>สูง</th><th>หนัก</th><th>BMI</th><th>เอว</th><th>CAP</th><th>E</th><th>เสี่ยง</th></tr></thead><tbody>${rows}</tbody></table></article><p class="pdf-table-note">BMI คำนวณจาก Height และ Weight · รหัส S/F ใต้ค่าคือระดับที่ได้จากเกณฑ์ในรายงานฉบับนี้</p>`;
      pages.push(pageShell('ข้อมูลและผลคำนวณรายบุคคล', 'ภาคผนวกข้อมูลครบถ้วน', content, 'pdf-patient-page'));
    }
    return pages.join('');
  }

  function individualPatientPage(patient) {
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    const bmi = App.classifyBMI(patient.bmi);
    const risk = App.isHighRisk(patient) ? 'กลุ่มเสี่ยงสูง' : 'ยังไม่เข้าเกณฑ์เสี่ยงสูง';
    const content = `
      <div class="pdf-patient-identity"><span>${companyLogo('pdf-patient-logo')}</span><div><p>ชื่อผู้รับการตรวจ</p><h2>${escapeHTML(patient.name)}</h2><small>รหัส ${escapeHTML(patient.id)} · วันที่ตรวจ ${App.formatDate(patient.date, 'long')} · ไฟล์ ${escapeHTML(patient.sourceFile || 'ไม่ระบุ')}</small></div><b class="${App.isHighRisk(patient) ? 'pdf-risk-high' : 'pdf-risk-low'}">${risk}</b></div>
      <div class="pdf-examiner"><i class="fa-solid fa-user-doctor"></i><div><small>ชื่อผู้ตรวจ</small><strong>${escapeHTML(patient.examiner)}</strong></div></div>
      <div class="pdf-stage-grid">
        <article><div class="pdf-stage-head"><span><img class="liver-icon liver-icon--pdf" src="assets/liver-icon.svg" alt="" aria-hidden="true"> พังผืดในตับ</span><b style="background:${fibrosis.color}">${fibrosis.code}</b></div><strong>${metric(patient.stiffness, 1)} <em>kPa</em></strong><h3>${fibrosis.label}</h3><p>${escapeHTML(fibrosis.stage || '')}</p></article>
        <article><div class="pdf-stage-head"><span><i class="fa-solid fa-droplet"></i> ไขมันพอกตับ</span><b style="background:${cap.color}">${cap.code}</b></div><strong>${metric(patient.cap, 0)} <em>dB/m</em></strong><h3>${cap.label}</h3><p>ไขมันในตับ ${cap.liverFat} · ${cap.range}</p></article>
      </div>
      <div class="pdf-patient-metrics">
        <article><small>BMI (คำนวณ)</small><strong>${metric(patient.bmi, 1)}</strong><p>${bmi.label}</p></article>
        <article><small>ส่วนสูง</small><strong>${metric(patient.height, 1)} <em>cm</em></strong></article>
        <article><small>น้ำหนัก</small><strong>${metric(patient.weight, 1)} <em>kg</em></strong></article>
        <article><small>รอบเอว</small><strong>${metric(patient.waist, 1)} <em>cm</em></strong></article>
        <article><small>เพศ</small><strong>${escapeHTML(patient.gender)}</strong></article>
        <article><small>วันที่ตรวจ</small><strong>${App.formatDate(patient.date)}</strong></article>
      </div>
      <article class="pdf-individual-thresholds"><h2>เกณฑ์ที่ใช้แปลผล</h2><div><p><b>Fibrosis</b> F0-F1 ≤ ${App.state.settings.eF01Max} · F2 ≥ ${App.state.settings.eF2} ถึง &lt; ${App.state.settings.eF3} · F3 ≥ ${App.state.settings.eF3} ถึง &lt; ${App.state.settings.eF4} · F4 ≥ ${App.state.settings.eF4} kPa</p><p><b>Steatosis</b> S0 ≤ ${App.state.settings.capS0Max} · S1 ≥ ${App.state.settings.capS1} ถึง &lt; ${App.state.settings.capS2} · S2 ≥ ${App.state.settings.capS2} ถึง &lt; ${App.state.settings.capS3} · S3 ≥ ${App.state.settings.capS3} dB/m</p></div></article>
      <div class="pdf-callout pdf-clinical-note"><i class="fa-solid fa-circle-info"></i><p><strong>หมายเหตุสำคัญ</strong> รายงานนี้เป็นผลการจัดกลุ่มตามเกณฑ์ที่กำหนด ไม่ใช่การวินิจฉัย และควรแปลผลร่วมกับข้อมูลทางคลินิกโดยบุคลากรทางการแพทย์</p></div>`;
    return pageShell('ผลการตรวจ FibroScan รายบุคคล', 'รายงานสำหรับผู้รับการตรวจ', content, 'pdf-individual-page');
  }

  function captureChartImages() {
    const names = ['fibrosis', 'cap', 'bmiCap', 'bmiE', 'waist', 'waistE', 'gender', 'riskBMI', 'riskWaist', 'riskGender'];
    return Object.fromEntries(names.map(name => {
      const chart = App.state.charts[name];
      try {
        return [name, chart?.toBase64Image('image/png', 1) || ''];
      } catch (_) {
        return [name, ''];
      }
    }));
  }

  async function prepareChartImages() {
    const previousExportMode = Boolean(App.state.chartExportMode);
    const activePageId = document.querySelector('.page.active')?.id || '';
    const hiddenPages = ['page-overview', 'page-analysis']
      .map(id => document.getElementById(id))
      .filter(page => page && !page.classList.contains('active'));
    hiddenPages.forEach(page => page.classList.add('pdf-chart-source'));
    App.state.chartExportMode = true;
    try {
      App.renderOverviewCharts();
      App.renderAnalysisCharts();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      Object.values(App.state.charts).forEach(chart => {
        chart.stop();
        chart.options.animation = false;
        chart.options.transitions = { active: { animation: { duration: 0 } } };
        chart.resize();
        chart.update('none');
        chart.draw();
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return captureChartImages();
    } finally {
      App.state.chartExportMode = previousExportMode;
      hiddenPages.forEach(page => page.classList.remove('pdf-chart-source'));
      // Recreate only the currently visible charts in lightweight screen mode.
      if (activePageId === 'page-overview') App.renderOverviewCharts();
      if (activePageId === 'page-analysis') App.renderAnalysisCharts();
    }
  }

  function waitForImages(container) {
    return Promise.all([...container.querySelectorAll('img')].map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
  }

  const PDF_PAGE_WIDTH_PX = 794;
  const PDF_PAGE_HEIGHT_PX = 1123;
  const PDF_CAPTURE_SCALE = 3;

  async function capturePdfPage(page, useCORS = true) {
    // html2canvas multiplies only the output bitmap. The cloned DOM remains
    // exactly 794x1123 CSS px, so increasing scale cannot alter the A4 layout.
    return window.html2canvas(page, {
      scale: PDF_CAPTURE_SCALE,
      useCORS,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: PDF_PAGE_WIDTH_PX,
      windowHeight: PDF_PAGE_HEIGHT_PX,
      width: PDF_PAGE_WIDTH_PX,
      height: PDF_PAGE_HEIGHT_PX,
      scrollX: 0,
      scrollY: 0,
      onclone: clonedDocument => {
        const clonedPage = clonedDocument.querySelector('.pdf-capture-stage .pdf-page');
        if (!clonedPage) return;
        clonedPage.style.width = `${PDF_PAGE_WIDTH_PX}px`;
        clonedPage.style.height = `${PDF_PAGE_HEIGHT_PX}px`;
        clonedPage.style.minWidth = `${PDF_PAGE_WIDTH_PX}px`;
        clonedPage.style.maxWidth = `${PDF_PAGE_WIDTH_PX}px`;
        clonedPage.style.transform = 'none';
        clonedPage.style.zoom = '1';
      }
    });
  }

  const WEB_REPORT_WIDTH = 1280;
  const WEB_REPORT_MARGIN_MM = 7;
  const WEB_REPORT_PAGE_WIDTH_MM = 297;
  const WEB_REPORT_PAGE_HEIGHT_MM = 210;

  function activatePageForCapture(pageName) {
    const activePage = document.getElementById(`page-${pageName}`);
    if (!activePage) return;
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page === activePage));
    document.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = activePage.dataset.title || '';
    App.state.activePage = pageName;
  }

  async function prepareWebPage(pageName) {
    activatePageForCapture(pageName);
    if (pageName === 'overview') App.renderOverviewCharts();
    if (pageName === 'analysis') App.renderAnalysisCharts();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    Object.values(App.state.charts).forEach(chart => chart?.update?.('none'));
  }

  function replaceCanvasWithImages(sourcePage, clonedPage) {
    const sourceCanvases = [...sourcePage.querySelectorAll('canvas')];
    const clonedCanvases = [...clonedPage.querySelectorAll('canvas')];
    clonedCanvases.forEach((canvas, index) => {
      const source = sourceCanvases[index];
      if (!source) return;
      try {
        const image = document.createElement('img');
        image.className = 'web-export-chart-image';
        image.src = source.toDataURL('image/png', 1);
        image.alt = source.getAttribute('aria-label') || 'กราฟวิเคราะห์ข้อมูล';
        canvas.replaceWith(image);
      } catch (error) {
        console.warn('Unable to copy a chart into the PDF capture.', error);
      }
    });
  }

  function createWebExportStage(pageName) {
    const sourceShell = document.querySelector('.app-shell');
    const sourcePage = document.getElementById(`page-${pageName}`);
    if (!sourceShell || !sourcePage) throw new Error(`Missing page for PDF capture: ${pageName}`);

    const stage = document.createElement('div');
    stage.className = 'web-export-stage';
    const shell = sourceShell.cloneNode(true);
    stage.append(shell);
    shell.querySelector('.sidebar')?.remove();
    const clonedPage = shell.querySelector(`#page-${pageName}`);
    shell.querySelectorAll('.page').forEach(page => {
      if (page !== clonedPage) page.remove();
    });
    clonedPage.classList.add('active');
    shell.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    const title = shell.querySelector('#page-title');
    if (title) title.textContent = sourcePage.dataset.title || '';
    shell.querySelectorAll('.topbar-actions .btn').forEach(button => button.remove());
    if (App.COMPANY_LOGO_DATA_URL) {
      shell.querySelectorAll('img.company-logo').forEach(image => { image.src = App.COMPANY_LOGO_DATA_URL; });
    }
    replaceCanvasWithImages(sourcePage, clonedPage);
    document.body.append(stage);
    return stage;
  }

  function appendixRisk(patient) {
    const fibrosis = App.classifyFibrosis(patient.stiffness);
    const cap = App.classifyCap(patient.cap);
    if (App.isHighRisk(patient)) return { className: 'high', label: `เสี่ยงสูง · ${fibrosis.code}/${cap.code}` };
    if (fibrosis.code === 'F2' || cap.code === 'S2') return { className: 'medium', label: `เฝ้าระวัง · ${fibrosis.code}/${cap.code}` };
    return { className: 'low', label: `ความเสี่ยงต่ำ · ${fibrosis.code}/${cap.code}` };
  }

  function createAppendixStage(chunk, start, pageNumber, totalPages) {
    const stage = createWebExportStage('overview');
    const shell = stage.querySelector('.app-shell');
    const page = shell.querySelector('#page-overview');
    const title = shell.querySelector('#page-title');
    if (title) title.textContent = 'ข้อมูลและผลคำนวณรายบุคคล';
    const rows = chunk.map((patient, index) => {
      const fibrosis = App.classifyFibrosis(patient.stiffness);
      const cap = App.classifyCap(patient.cap);
      const bmi = App.classifyBMI(patient.bmi);
      const waist = App.isHighWaist(patient);
      const risk = appendixRisk(patient);
      return `<tr>
        <td><strong class="patient-id-cell">${escapeHTML(patient.id)}</strong><small>#${start + index + 1}</small></td>
        <td><strong>${escapeHTML(patient.name)}</strong><small>ผู้ตรวจ ${escapeHTML(patient.examiner)}</small></td>
        <td>${App.formatDate(patient.date)}</td>
        <td>${escapeHTML(patient.gender)}</td>
        <td><strong>${metric(patient.bmi, 1)}</strong><small>${escapeHTML(bmi.label)}</small></td>
        <td><strong>${metric(patient.waist, 1)}</strong><small>${waist === null ? 'ข้อมูลไม่ครบ' : waist ? 'รอบเอวสูง' : 'รอบเอวปกติ'}</small></td>
        <td><strong>${metric(patient.cap, 0)}</strong><small>${cap.code}</small></td>
        <td><strong>${metric(patient.stiffness, 1)}</strong><small>${fibrosis.code}</small></td>
        <td><span class="risk-badge ${risk.className}"><i></i>${risk.label}</span></td>
      </tr>`;
    }).join('');
    page.innerHTML = `
      <div class="section-heading web-appendix-heading"><div><p class="section-kicker">ภาคผนวกข้อมูลครบถ้วน</p><h2>ข้อมูลและผลคำนวณรายบุคคล</h2><p>รายการ ${start + 1}-${start + chunk.length} จาก ${App.state.data.length.toLocaleString('th-TH')} ครั้งตรวจ · ชุดที่ ${pageNumber}/${totalPages}</p></div></div>
      <article class="panel table-panel web-appendix-table"><div class="table-head panel-head"><div><h3>รายละเอียดผลตรวจ</h3><p>BMI คำนวณจากส่วนสูงและน้ำหนัก · CAP หน่วย dB/m · E Median หน่วย kPa · รอบเอวหน่วย cm</p></div></div><div class="table-scroll"><table><thead><tr><th>รหัส</th><th>ชื่อผู้รับการตรวจ</th><th>วันที่</th><th>เพศ</th><th>BMI</th><th>รอบเอว</th><th>CAP</th><th>E Median</th><th>ระดับความเสี่ยง</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
    return stage;
  }

  function captureBreakpoints(stage, scale) {
    const shell = stage.querySelector('.app-shell');
    const rootTop = shell.getBoundingClientRect().top;
    const selectors = [
      '.topbar', '.section-heading', '.data-quality-banner', '.kpi-grid', '.chart-grid',
      '.table-panel', '.patient-layout', '.analysis-grid > .panel', '.risk-factor-layout',
      '.insight-panel', '.settings-card', '.settings-actions', 'tbody tr'
    ];
    const points = [];
    stage.querySelectorAll(selectors.join(',')).forEach(element => {
      const rect = element.getBoundingClientRect();
      points.push(Math.round((rect.top - rootTop) * scale), Math.round((rect.bottom - rootTop) * scale));
    });
    return [...new Set(points.filter(point => point > 0))].sort((a, b) => a - b);
  }

  function calculateSlices(totalHeight, targetHeight, breakpoints) {
    const slices = [];
    let start = 0;
    while (start < totalHeight - 2) {
      const remaining = totalHeight - start;
      if (remaining <= targetHeight) {
        slices.push([start, totalHeight]);
        break;
      }
      const minCut = start + Math.round(targetHeight * .64);
      const idealCut = start + targetHeight;
      const candidates = breakpoints.filter(point => point >= minCut && point <= idealCut - 8);
      let end = candidates.length ? candidates.at(-1) : idealCut;
      if (end <= start) end = Math.min(totalHeight, idealCut);
      slices.push([start, end]);
      start = end;
    }
    if (slices.length > 1) {
      const last = slices.at(-1);
      const previous = slices.at(-2);
      const combinedHeight = last[1] - previous[0];
      if ((last[1] - last[0]) < targetHeight * .38 && combinedHeight <= targetHeight * 1.22) {
        previous[1] = last[1];
        slices.pop();
      }
    }
    return slices;
  }

  async function rasterizeWebStage(stage) {
    await waitForImages(stage);
    await document.fonts?.ready;
    const shell = stage.querySelector('.app-shell');
    const height = Math.ceil(shell.scrollHeight);
    const scale = 1.25;
    const options = {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#f4f7f7',
      logging: false,
      width: WEB_REPORT_WIDTH,
      height,
      windowWidth: WEB_REPORT_WIDTH,
      windowHeight: Math.min(height, 1200),
      scrollX: 0,
      scrollY: 0
    };
    let canvas;
    try {
      canvas = await window.html2canvas(shell, options);
    } catch (error) {
      console.warn('Web PDF capture failed with images; retrying without decorative images.', error);
      stage.querySelectorAll('img.company-logo').forEach(image => image.remove());
      canvas = await window.html2canvas(shell, { ...options, useCORS: false });
    }
    return { canvas, breakpoints: captureBreakpoints(stage, scale) };
  }

  function appendWebCanvas(pdf, canvas, breakpoints) {
    const printableWidth = WEB_REPORT_PAGE_WIDTH_MM - (WEB_REPORT_MARGIN_MM * 2);
    const printableHeight = WEB_REPORT_PAGE_HEIGHT_MM - (WEB_REPORT_MARGIN_MM * 2) - 4;
    const targetHeight = Math.floor(canvas.width * (printableHeight / printableWidth));
    const slices = calculateSlices(canvas.height, targetHeight, breakpoints);
    slices.forEach(([start, end]) => {
      if (pdf.__fibroHasContent) pdf.addPage('a4', 'landscape');
      else pdf.__fibroHasContent = true;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = end - start;
      slice.getContext('2d').drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      let imageWidth = printableWidth;
      let imageHeight = (slice.height / slice.width) * imageWidth;
      if (imageHeight > printableHeight) {
        imageHeight = printableHeight;
        imageWidth = (slice.width / slice.height) * imageHeight;
      }
      const imageX = (WEB_REPORT_PAGE_WIDTH_MM - imageWidth) / 2;
      pdf.setFillColor(244, 247, 247);
      pdf.rect(0, 0, WEB_REPORT_PAGE_WIDTH_MM, WEB_REPORT_PAGE_HEIGHT_MM, 'F');
      pdf.addImage(slice.toDataURL('image/jpeg', .94), 'JPEG', imageX, WEB_REPORT_MARGIN_MM, imageWidth, imageHeight, undefined, 'FAST');
      slice.width = 1;
      slice.height = 1;
    });
  }

  async function appendStageToPDF(pdf, stage) {
    try {
      const { canvas, breakpoints } = await rasterizeWebStage(stage);
      appendWebCanvas(pdf, canvas, breakpoints);
      canvas.width = 1;
      canvas.height = 1;
    } finally {
      stage.remove();
    }
  }

  function addWebReportPageNumbers(pdf) {
    const total = pdf.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(109, 129, 145);
      pdf.text(`${page} / ${total}`, WEB_REPORT_PAGE_WIDTH_MM - WEB_REPORT_MARGIN_MM, WEB_REPORT_PAGE_HEIGHT_MM - 2.5, { align: 'right' });
    }
  }

  async function exportWebReport(filename, notify, button) {
    const previousPage = App.state.activePage || 'overview';
    const previousScroll = window.scrollY;
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    // The main report is intentionally aggregate-only. Individual patients have
    // their own export action, so the overall report contains no patient pages.
    const routes = ['overview', 'analysis'];
    try {
      for (let index = 0; index < routes.length; index += 1) {
        const pageName = routes[index];
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>กำลังบันทึกหน้าเว็บ ${index + 1}/${routes.length}</span>`;
        await prepareWebPage(pageName);
        await appendStageToPDF(pdf, createWebExportStage(pageName));
      }

      addWebReportPageNumbers(pdf);
      pdf.save(filename);
      notify(`สร้างรายงาน PDF สำเร็จ ${pdf.getNumberOfPages()} หน้า`);
    } finally {
      activatePageForCapture(previousPage);
      if (previousPage === 'overview') App.renderOverviewCharts();
      if (previousPage === 'analysis') App.renderAnalysisCharts();
      window.scrollTo(0, previousScroll);
    }
  }

  function buildReport(chartImages) {
    return dashboardPage(chartImages)
      + analysisChartsPage(chartImages)
      + demographicChartPage(chartImages)
      + riskFactorChartsPage(chartImages)
      + factorPage()
      + settingsPage()
      + patientPages();
  }

  async function renderAndSave(reportHTML, filename, notify, button, busyLabel, manageButton = true) {
    if (!window.html2canvas || !window.jspdf?.jsPDF) return notify('ยังโหลดเครื่องมือสร้าง PDF ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต', 'error');
    const originalHTML = button?.innerHTML || '';
    if (manageButton && button) {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${busyLabel}</span>`;
    }
    const report = document.getElementById('pdf-report');
    try {
      report.innerHTML = reportHTML;
      report.classList.add('rendering');
      await document.fonts?.ready;
      await waitForImages(report);
      const pages = [...report.querySelectorAll('.pdf-page')];
      pages.forEach((page, index) => { page.querySelector('[data-pdf-page]').textContent = `หน้า ${index + 1} / ${pages.length}`; });
      const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const captureStage = document.createElement('div');
      captureStage.className = 'pdf-capture-stage';
      document.body.append(captureStage);
      try {
        for (let index = 0; index < pages.length; index += 1) {
          if (button) button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${busyLabel} ${index + 1}/${pages.length}</span>`;
          const page = pages[index].cloneNode(true);
          captureStage.replaceChildren(page);
          await waitForImages(captureStage);
          let canvas;
          try {
            canvas = await capturePdfPage(page, true);
          } catch (captureError) {
            console.warn('PDF page capture failed with branding; retrying without branding images.', captureError);
            page.querySelectorAll('.pdf-company-logo, .pdf-patient-logo').forEach(image => image.remove());
            canvas = await capturePdfPage(page, false);
          }
          if (index > 0) pdf.addPage('a4', 'portrait');
          // PNG avoids the JPEG ringing that makes chart labels and grid lines blurry.
          // jsPDF scales the 2382x3369 bitmap back to the original 210x297 mm A4 box.
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
          canvas.width = 1;
          canvas.height = 1;
          await new Promise(resolve => setTimeout(resolve, 16));
        }
      } finally {
        captureStage.remove();
      }
      pdf.save(filename);
      notify(`สร้างรายงาน PDF สำเร็จ ${pages.length} หน้า`);
    } catch (error) {
      console.error(error);
      notify(`ไม่สามารถสร้าง PDF ได้: ${error?.message || 'กรุณาลองใหม่อีกครั้ง'}`, 'error');
    } finally {
      report.classList.remove('rendering');
      report.innerHTML = '';
      if (manageButton && button) {
        button.disabled = false;
        button.innerHTML = originalHTML;
      }
    }
  }

  App.exportPDF = async function exportPDF(notify = () => {}) {
    if (!App.state.data.length) return notify('ยังไม่มีข้อมูลสำหรับส่งออก', 'error');
    const button = document.getElementById('export-pdf-btn');
    if (!button || button.disabled) return;
    if (!window.html2canvas || !window.jspdf?.jsPDF) return notify('ยังโหลดเครื่องมือสร้าง PDF ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้าเว็บ', 'error');
    const timestamp = new Date().toISOString().slice(0, 10);
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>กำลังเตรียมกราฟ...</span>';
    try {
      let chartImages;
      try {
        chartImages = await prepareChartImages();
      } catch (chartError) {
        console.warn('Unable to refresh charts for PDF; using available chart images.', chartError);
        chartImages = captureChartImages();
      }
      return await renderAndSave(buildReport(chartImages), `FibroScan_Analytics_Report_${timestamp}.pdf`, notify, button, 'กำลังสร้าง PDF', false);
    } catch (error) {
      console.error(error);
      notify(`ไม่สามารถสร้าง PDF ได้: ${error?.message || 'กรุณาลองใหม่อีกครั้ง'}`, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  };

  App.exportPatientPDF = async function exportPatientPDF(patientIndex, notify = () => {}, button) {
    const patient = App.state.data[patientIndex];
    if (!patient) return notify('ไม่พบข้อมูลผู้รับการตรวจสำหรับส่งออก', 'error');
    const safeId = String(patient.id || `patient-${patientIndex + 1}`).replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    return renderAndSave(individualPatientPage(patient), `FibroScan_${safeId}_${timestamp}.pdf`, notify, button, 'กำลังสร้าง PDF...');
  };
})(window.FibroApp);
