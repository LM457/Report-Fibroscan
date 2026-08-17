(function (App) {
  'use strict';

  const COLUMN_ALIASES = {
    id: ['exam file name', 'exam filename', 'exam file', 'patient id', 'patientid', 'patient no', 'patient number', 'id', 'hn', 'hospital number', 'รหัสผู้ป่วย', 'รหัส', 'เลข hn'],
    name: ['patient id name', 'patient no name', 'patient name', 'patientname', 'patient s name', 'patient', 'name', 'fullname', 'full name', 'name surname', 'name-surname', 'customer name', 'ชื่อผู้ป่วย', 'ชื่อผู้รับการตรวจ', 'ผู้รับการตรวจ', 'ชื่อผู้รับบริการ', 'ผู้รับบริการ', 'รหัส ชื่อ', 'ชื่อ-นามสกุล', 'ชื่อ นามสกุล', 'ชื่อ-สกุล', 'ชื่อ สกุล', 'ชื่อ'],
    firstName: ['first name', 'firstname', 'given name', 'ชื่อจริง'],
    lastName: ['last name', 'lastname', 'surname', 'family name', 'นามสกุล', 'สกุล'],
    cap: ['cap enhanced mean (db/m)', 'cap enhanced mean', 'capenhancedmean', 'mean cap', 'meancap', 'cap', 'cap db/m', 'cap(db/m)', 'ค่า cap', 'ไขมันพอกตับ'],
    stiffness: ['e median (kpa)', 'e median', 'emedian', 'e (kpa)', 'e(kpa)', 'e kpa', 'kpa', 'liver stiffness', 'stiffness', 'lsm', 'ค่า e', 'ความแข็งตับ'],
    height: ['height', 'height (cm)', 'height(cm)', 'ส่วนสูง', 'ส่วนสูง (ซม.)', 'ส่วนสูง(cm)'],
    weight: ['weight', 'weight (kg)', 'weight(kg)', 'น้ำหนัก', 'น้ำหนัก (กก.)', 'น้ำหนัก(kg)'],
    gender: ['gender', 'sex', 'เพศ'],
    waist: ['waist circumference', 'waist', 'waistcircumference', 'รอบเอว', 'เส้นรอบเอว','Code'],
    examiner: ['examiner', 'examiner name', 'operator', 'operator name', 'performed by', 'ผู้ตรวจ', 'ชื่อผู้ตรวจ', 'ผู้ทำการตรวจ'],
    dateDay: ['exam date (day)', 'exam date day'],
    dateMonth: ['exam date (month)', 'exam date month'],
    dateYear: ['exam date (year)', 'exam date year'],
    date: ['date of examination', 'examination date', 'exam date', 'date', 'วันที่ตรวจ', 'วันที่ตรวจรักษา']
  };

  const normalizeHeader = value => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._\-\/\\()[\]{}:]+/g, ' ')
    .replace(/\s+/g, ' ');

  const normalizedAliases = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => [key, aliases.map(normalizeHeader)])
  );

  function findColumn(headers, key) {
    const aliases = normalizedAliases[key];
    const exact = headers.findIndex(header => aliases.includes(normalizeHeader(header)));
    if (exact >= 0) return exact;
    return headers.findIndex(header => {
      const normalized = normalizeHeader(header);
      return aliases.some(alias => alias !== 'patient' && alias.length > 3 && normalized.includes(alias));
    });
  }

  function findHeaderRowIndex(rows) {
    let bestIndex = -1;
    let bestScore = 0;
    rows.slice(0, 30).forEach((row, index) => {
      const normalizedCells = row.map(normalizeHeader).filter(Boolean);
      const score = Object.values(normalizedAliases).reduce((total, aliases) => (
        total + (normalizedCells.some(header => aliases.some(alias => header === alias || (alias.length > 3 && header.includes(alias)))) ? 1 : 0)
      ), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestScore >= 2 ? bestIndex : rows.findIndex(row => row.filter(value => value !== null && value !== '').length >= 3);
  }

  function inferNameColumn(headers, dataRows, columns) {
    const used = new Set(Object.entries(columns)
      .filter(([key, index]) => !['name', 'firstName', 'lastName'].includes(key) && index >= 0)
      .map(([, index]) => index));
    let best = { index: -1, score: 0 };
    headers.forEach((header, index) => {
      if (used.has(index)) return;
      const normalized = normalizeHeader(header);
      const headerScore = /(name|patient|ผู้ป่วย|ผู้รับ|ชื่อ|นามสกุล|สกุล)/i.test(normalized) ? 5 : 0;
      const samples = dataRows.slice(0, 25).map(row => String(row[index] ?? '').trim()).filter(Boolean);
      if (!samples.length) return;
      const nameLike = samples.filter(value => /[A-Za-zก-๙]/.test(value) && !/^\d+[\d\s/.-]*$/.test(value) && !/^(m|f|male|female|ชาย|หญิง)$/i.test(value)).length;
      const spaced = samples.filter(value => /\s/.test(value)).length;
      const score = headerScore + (nameLike / samples.length) * 3 + (spaced / samples.length) * 2;
      if (score > best.score) best = { index, score };
    });
    return best.score >= 3 ? best.index : -1;
  }

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, '').replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
    if (typeof value === 'number' && window.XLSX?.SSF) {
      const excelDate = XLSX.SSF.parse_date_code(value);
      if (excelDate) return new Date(excelDate.y, excelDate.m - 1, excelDate.d);
    }
    const text = String(value).trim();
    const thaiMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (thaiMatch) {
      let year = Number(thaiMatch[3]);
      if (year > 2400) year -= 543;
      const date = new Date(year, Number(thaiMatch[2]) - 1, Number(thaiMatch[1]));
      return Number.isNaN(date.valueOf()) ? null : date;
    }
    const date = new Date(text);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function parseDateParts(dayValue, monthValue, yearValue) {
    const day = parseNumber(dayValue);
    const month = parseNumber(monthValue);
    let year = parseNumber(yearValue);
    if (![day, month, year].every(Number.isInteger)) return null;
    if (year > 2400) year -= 543;
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? date
      : null;
  }

  function normalizeGender(value) {
    const gender = String(value ?? '').trim().toLowerCase();
    if (['m', 'male', 'man', 'ชาย', 'ผู้ชาย'].includes(gender)) return 'Male';
    if (['f', 'female', 'woman', 'หญิง', 'ผู้หญิง'].includes(gender)) return 'Female';
    return 'Unspecified';
  }

  function cell(row, columns, key) {
    return columns[key] >= 0 ? row[columns[key]] : null;
  }

  function normalizePatientName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('th-TH');
}

  App.calculateBMI = function calculateBMI(height, weight) {
    if (height === null || weight === null || height <= 0 || weight <= 0) return null;
    const heightMetres = height > 3 ? height / 100 : height;
    if (heightMetres < 0.5 || heightMetres > 2.5) return null;
    const bmi = weight / (heightMetres ** 2);
    return Number.isFinite(bmi) ? bmi : null;
  };

  App.parseWorkbook = function parseWorkbook(arrayBuffer) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null, raw: true });
    if (rows.length < 2) throw new Error('No examination data was found in the Excel file.');

    const headerRowIndex = findHeaderRowIndex(rows);
    if (headerRowIndex < 0) throw new Error('The header row could not be identified.');
    const headers = rows[headerRowIndex];
    const columns = Object.fromEntries(Object.keys(COLUMN_ALIASES).map(key => [key, findColumn(headers, key)]));
    if (columns.name < 0 && columns.firstName < 0 && columns.lastName < 0) {
      columns.name = inferNameColumn(headers, rows.slice(headerRowIndex + 1), columns);
    }

    if (columns.cap < 0 && columns.stiffness < 0) {
      throw new Error('Neither CAP Enhanced Mean nor E Median (kPa) was found. Check the column headings.');
    }

    const patients = rows.slice(headerRowIndex + 1).map((row, index) => {
      const idValue = cell(row, columns, 'id');
      const directName = columns.name === columns.id
        ? ''
        : String(cell(row, columns, 'name') ?? '').trim();
      const firstName = String(cell(row, columns, 'firstName') ?? '').trim();
      const lastName = String(cell(row, columns, 'lastName') ?? '').trim();
      let patientName = [firstName, lastName].filter(Boolean).join(' ') || directName;
      let resolvedId = String(idValue ?? '').trim();
      if (columns.id >= 0 && columns.id === columns.name && resolvedId) {
        const sharedValue = resolvedId;
        const sharedMatch = sharedValue.match(/^([A-Za-zก-๙]*[-/]?\d+)\s*[|,:/\n-]\s*(.+)$/)
          || sharedValue.match(/^([A-Za-z]*[-/]?\d+)\s+(.+)$/);
        if (sharedMatch && /[A-Za-zก-๙]/.test(sharedMatch[2])) {
          resolvedId = sharedMatch[1].trim();
          patientName = sharedMatch[2].trim();
        }
      }
      if (!patientName && resolvedId) {
        const combined = resolvedId.match(/^([^|,/\n]+?)[|,/\n]\s*(.+)$/);
        if (combined && /[A-Za-zก-๙]/.test(combined[2])) {
          resolvedId = combined[1].trim();
          patientName = combined[2].trim();
        }
      }
      const height = parseNumber(cell(row, columns, 'height'));
      const weight = parseNumber(cell(row, columns, 'weight'));
      const calculatedBMI = App.calculateBMI(height, weight);
      const dateComponentColumns = new Set([columns.dateDay, columns.dateMonth, columns.dateYear].filter(column => column >= 0));
      const legacyDateValue = dateComponentColumns.has(columns.date) ? null : cell(row, columns, 'date');
      const examDate = parseDateParts(
        cell(row, columns, 'dateDay'),
        cell(row, columns, 'dateMonth'),
        cell(row, columns, 'dateYear')
      ) || parseDate(legacyDateValue);
      const patient = {
        rowNumber: headerRowIndex + index + 2,
        id: resolvedId,
        // Retain name components separately for normalized cross-file patient matching.
        firstName,
        lastName,
        patientName: String(patientName ?? '').trim(),
        name: String(patientName ?? '').trim(),
        nameMissing: !String(patientName ?? '').trim(),
        cap: parseNumber(cell(row, columns, 'cap')),
        stiffness: parseNumber(cell(row, columns, 'stiffness')),
        height,
        weight,
        bmi: calculatedBMI,
        bmiCalculated: calculatedBMI !== null,
        gender: normalizeGender(cell(row, columns, 'gender')),
        waist: parseNumber(cell(row, columns, 'waist')),
        examDate,
        date: examDate,
        examiner: String(cell(row, columns, 'examiner') ?? '').trim() || 'Not specified'
      };
      if (!patient.id) patient.id = `ROW-${patient.rowNumber}`;
      if (!patient.patientName) patient.patientName = 'Name unavailable';
      patient.name = patient.patientName;
      return patient;
    }).filter(patient => [patient.cap, patient.stiffness, patient.bmi, patient.waist].some(value => value !== null));

    if (!patients.length) throw new Error('No usable patient examination records were found.');
    return patients;
  };

  App.loadSettings = function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(App.STORAGE_KEY));
      App.state.settings = { ...App.DEFAULT_SETTINGS, ...(saved || {}) };
    } catch (_) {
      App.state.settings = { ...App.DEFAULT_SETTINGS };
    }
    return App.state.settings;
  };

  App.saveSettings = function saveSettings(settings) {
    App.state.settings = { ...settings };
    localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.state.settings));
  };

  App.classifyFibrosis = function classifyFibrosis(value) {
    const s = App.state.settings;
    if (value === null) return { code: '—', label: 'Data unavailable', className: 'neutral', color: App.colors.slate };
    if (value <= s.eF01Max) return { code: 'F0-F1', label: 'No Significant Fibrosis', stage: 'No Significant Fibrosis', className: 'normal', color: App.colors.tealLight };
    if (value < s.eF2) return { code: '—', label: 'Outside Configured Range', className: 'neutral', color: App.colors.slate };
    if (value < s.eF3) return { code: 'F2', label: 'Moderate Fibrosis', stage: 'Moderate Liver Fibrosis', className: 'moderate', color: App.colors.amber };
    if (value < s.eF4) return { code: 'F3', label: 'Severe Fibrosis', stage: 'Severe Liver Fibrosis', className: 'severe', color: App.colors.coral };
    return { code: 'F4', label: 'Cirrhosis', stage: 'Cirrhosis', className: 'critical', color: App.colors.red };
  };

  App.classifyCap = function classifyCap(value) {
    const s = App.state.settings;
    if (value === null) return { code: '—', label: 'Data unavailable', className: 'neutral', color: App.colors.slate };
    if (value <= s.capS0Max) return { code: 'S0', label: 'No Steatosis', liverFat: '< 10%', range: `≤ ${s.capS0Max} dB/m`, className: 'normal', color: App.colors.tealLight };
    if (value < s.capS1) return { code: '—', label: 'Outside Configured Range', liverFat: 'Unknown', range: `${s.capS0Max} - ${s.capS1}`, className: 'neutral', color: App.colors.slate };
    if (value < s.capS2) return { code: 'S1', label: 'Mild Steatosis', liverFat: '11 - 33%', range: `${s.capS1} - ${s.capS2 - 1} dB/m`, className: 'mild', color: App.colors.lime };
    if (value < s.capS3) return { code: 'S2', label: 'Moderate Steatosis', liverFat: '34 - 66%', range: `${s.capS2} - ${s.capS3 - 1} dB/m`, className: 'moderate', color: App.colors.amber };
    return { code: 'S3', label: 'Severe Steatosis', liverFat: '> 67%', range: `≥ ${s.capS3} dB/m`, className: 'severe', color: App.colors.coral };
  };

  App.classifyBMI = function classifyBMI(value) {
    const s = App.state.settings;
    if (value === null) return { code: 'Unknown', label: 'Unknown' };
    if (value < s.bmiNormalStart) return { code: '1', label: `Underweight (<${s.bmiNormalStart})` };
    if (value < s.bmiOverweightStart) return { code: '2', label: `Normal (${s.bmiNormalStart}-${s.bmiOverweightStart})` };
    if (value < s.bmiObesity1Start) return { code: '3', label: `Overweight (${s.bmiOverweightStart}-${s.bmiObesity1Start})` };
    if (value < s.bmiObesity2Start) return { code: '4', label: `Obesity Class I (${s.bmiObesity1Start}-${s.bmiObesity2Start})` };
    return { code: '5', label: `Obesity Class II (≥${s.bmiObesity2Start})` };
  };

  App.isHighWaist = function isHighWaist(patient) {
    if (patient.waist === null || patient.gender === 'Unspecified') return null;
    return patient.gender === 'Female'
      ? patient.waist >= App.state.settings.waistFemaleHigh
      : patient.waist >= App.state.settings.waistMaleHigh;
  };

  App.isHighRisk = patient => (
    (patient.stiffness !== null && patient.stiffness >= App.state.settings.eF3) ||
    (patient.cap !== null && patient.cap >= App.state.settings.capS3)
  );

  App.average = function average(values) {
    const valid = values.filter(value => value !== null && Number.isFinite(value));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };

  App.getRiskFactorAnalysis = function getRiskFactorAnalysis(data = App.state.data) {
    const s = App.state.settings;
    const groups = [
      { key: 'bmi-low', label: `Underweight (<${s.bmiNormalStart})`, shortLabel: 'Underweight', type: 'BMI', test: p => p.bmi !== null && p.bmi < s.bmiNormalStart },
      { key: 'bmi-normal', label: `Normal (${s.bmiNormalStart}-${s.bmiOverweightStart})`, shortLabel: 'Normal', type: 'BMI', test: p => p.bmi !== null && p.bmi >= s.bmiNormalStart && p.bmi < s.bmiOverweightStart },
      { key: 'bmi-overweight', label: `Overweight (${s.bmiOverweightStart}-${s.bmiObesity1Start})`, shortLabel: 'Overweight', type: 'BMI', test: p => p.bmi !== null && p.bmi >= s.bmiOverweightStart && p.bmi < s.bmiObesity1Start },
      { key: 'bmi-obese-1', label: `Obesity Class I (${s.bmiObesity1Start}-${s.bmiObesity2Start})`, shortLabel: 'Obesity I', type: 'BMI', test: p => p.bmi !== null && p.bmi >= s.bmiObesity1Start && p.bmi < s.bmiObesity2Start },
      { key: 'bmi-obese-2', label: `Obesity Class II (≥${s.bmiObesity2Start})`, shortLabel: 'Obesity II', type: 'BMI', test: p => p.bmi !== null && p.bmi >= s.bmiObesity2Start },
      { key: 'waist-normal', label: 'Waist Circumference Below Threshold', shortLabel: 'Below Threshold', type: 'Waist Circumference', test: p => App.isHighWaist(p) === false },
      { key: 'waist-high', label: 'Elevated Waist Circumference', shortLabel: 'Elevated', type: 'Waist Circumference', test: p => App.isHighWaist(p) === true },
      { key: 'gender-male', label: 'Male', shortLabel: 'Male', type: 'Sex', test: p => p.gender === 'Male' },
      { key: 'gender-female', label: 'Female', shortLabel: 'Female', type: 'Sex', test: p => p.gender === 'Female' }
    ];
    return groups.map(group => {
      const members = data.filter(group.test);
      const fibrosisMeasured = members.filter(p => p.stiffness !== null);
      const steatosisMeasured = members.filter(p => p.cap !== null);
      return {
        ...group,
        count: members.length,
        fibrosisN: fibrosisMeasured.length,
        steatosisN: steatosisMeasured.length,
        fibrosisRate: fibrosisMeasured.length ? (fibrosisMeasured.filter(p => p.stiffness >= App.state.settings.eF2).length / fibrosisMeasured.length) * 100 : null,
        steatosisRate: steatosisMeasured.length ? (steatosisMeasured.filter(p => p.cap >= App.state.settings.capS1).length / steatosisMeasured.length) * 100 : null
      };
    });
  };

  App.percentagePointDifference = function percentagePointDifference(high, reference, field) {
    if (!high || !reference || high[field] === null || reference[field] === null) return null;
    return high[field] - reference[field];
  };

  App.formatDate = function formatDate(date, style = 'short') {
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-GB', style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: 'short', year: '2-digit' }).format(date);
  };

  App.toISODate = date => date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : '';

  // App.getPatientKey = function getPatientKey(patient) {
  //   const id = String(patient?.id || '').trim().toLowerCase();
  //   if (id && !id.startsWith('row-')) return id;
  //   const name = String(patient?.name || '').trim().toLowerCase();
  //   return `${id || 'unknown'}|${name}|${patient?.sourceFileId || ''}|${patient?.rowNumber || ''}`;
  // };

  App.getPatientKey = function getPatientKey(patient) {
    const firstName = normalizePatientName(patient?.firstName);
    const lastName = normalizePatientName(patient?.lastName);

    // Match records across files only when both first and last names are available.
    if (firstName && lastName) {
      return `name|${firstName}|${lastName}`;
    }

    // Keep incomplete names separate to avoid merging different patients.
    return `unknown|${patient?.sourceFileId || ''}|${patient?.rowNumber || ''}`;
  };

  App.getUniquePatientCount = function getUniquePatientCount(data = App.state.data) {
    return new Set(data.map(App.getPatientKey)).size;
  };

  App.getAnalysisData = function getAnalysisData() {
    const data = App.state.data || [];
    if (App.state.analysisMode !== 'latest') return data;
    const latestByPatient = new Map();
    data.forEach((patient, index) => {
      const key = App.getPatientKey(patient);
      const current = latestByPatient.get(key);
      const time = patient.date instanceof Date && !Number.isNaN(patient.date.valueOf()) ? patient.date.valueOf() : -1;
      if (!current || time > current.time || (time === current.time && index > current.index)) {
        latestByPatient.set(key, { patient, time, index });
      }
    });
    return [...latestByPatient.values()].map(entry => entry.patient);
  };

})(window.FibroApp);
