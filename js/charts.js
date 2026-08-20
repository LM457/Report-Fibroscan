(function (App) {
  'use strict';

  // Keep the website light and minimal. PDF export temporarily switches this
  // to 4x internally without changing the chart's physical CSS dimensions.
  const screenChartPixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2);
  const getChartPixelRatio = () => App.state.chartExportMode ? 4 : screenChartPixelRatio;
  const chartFontFamily = '"IBM Plex Sans", Arial, sans-serif';
  const chartFont = (size = 11, weight = 'normal') => ({ family: chartFontFamily, size, weight, lineHeight: 1.3 });
  const chartTextColor = '#617784';
  const chartTitleColor = '#506978';
  const chartLabel = value => String(value)
    .replaceAll('–', ' - ')
    .replaceAll('—', ' - ')
    .replaceAll('≥', '>=')
    .replaceAll('≤', '<=');

  if (window.Chart) {
    Chart.defaults.devicePixelRatio = screenChartPixelRatio;
    Chart.defaults.color = chartTextColor;
    Chart.defaults.font.family = chartFontFamily;
    Chart.defaults.font.size = 11;
    Chart.defaults.font.weight = 'normal';
    Chart.defaults.font.lineHeight = 1.3;
  }

  function destroyChart(name) {
    if (App.state.charts[name]) {
      App.state.charts[name].destroy();
      delete App.state.charts[name];
    }
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: getChartPixelRatio(),
      animation: { duration: 650, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#17324d',
          titleFont: chartFont(11, '600'),
          bodyFont: chartFont(11),
          padding: 12,
          cornerRadius: 10
        }
      },
      scales: {
        x: { alignToPixels: true, grid: { display: false }, ticks: { color: chartTextColor, padding: 8, font: chartFont(11) }, border: { display: false } },
        y: { alignToPixels: true, beginAtZero: true, grid: { color: '#e4ebed', lineWidth: 1 }, ticks: { color: chartTextColor, padding: 8, font: chartFont(11) }, border: { display: false } }
      }
    };
  }

  App.renderOverviewCharts = function renderOverviewCharts() {
    if (!window.Chart || !App.state.data.length) return;
    const data = App.getAnalysisData ? App.getAnalysisData() : App.state.data;
    const fibrosisLabels = ['No Significant Fibrosis (F0-F1)', 'Moderate Fibrosis (F2)', 'Severe Fibrosis (F3)', 'Cirrhosis (F4)'];
    const fibrosisColors = [App.colors.tealLight, App.colors.amber, App.colors.coral, App.colors.red];
    const fibrosisCounts = [0, 0, 0, 0];
    data.forEach(patient => {
      const stage = App.classifyFibrosis(patient.stiffness);
      const index = ['F0-F1', 'F2', 'F3', 'F4'].indexOf(stage.code);
      if (index >= 0) fibrosisCounts[index] += 1;
    });

    destroyChart('fibrosis');
    App.state.charts.fibrosis = new Chart(document.getElementById('fibrosis-chart'), {
      type: 'doughnut',
      data: { labels: fibrosisLabels, datasets: [{ data: fibrosisCounts, backgroundColor: fibrosisColors, borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, devicePixelRatio: getChartPixelRatio(), cutout: '72%', plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }
    });
    document.getElementById('fibrosis-center').textContent = fibrosisCounts.reduce((sum, value) => sum + value, 0);
    document.getElementById('fibrosis-legend').innerHTML = fibrosisLabels.map((label, index) => `
      <div><span><i style="background:${fibrosisColors[index]}"></i>${label}</span><strong>${fibrosisCounts[index]}</strong></div>
    `).join('');

    const capLabels = ['No Steatosis (S0)', 'Mild Steatosis (S1)', 'Moderate Steatosis (S2)', 'Severe Steatosis (S3)'];
    const capColors = [App.colors.tealLight, App.colors.lime, App.colors.amber, App.colors.coral];
    const capCounts = [0, 0, 0, 0];
    data.forEach(patient => {
      const grade = App.classifyCap(patient.cap);
      const index = ['S0', 'S1', 'S2', 'S3'].indexOf(grade.code);
      if (index >= 0) capCounts[index] += 1;
    });
    destroyChart('cap');
    const capOptions = baseOptions();
    capOptions.plugins.tooltip.callbacks = { label: context => ` ${context.raw} examinations` };
    capOptions.scales.y.ticks.precision = 0;
    App.state.charts.cap = new Chart(document.getElementById('cap-chart'), {
      type: 'bar',
      data: { labels: capLabels, datasets: [{ data: capCounts, backgroundColor: capColors, borderRadius: 9, borderSkipped: false, maxBarThickness: 46 }] },
      options: capOptions
    });
  };

  App.renderAnalysisCharts = function renderAnalysisCharts() {
    if (!window.Chart || !App.state.data.length) return;
    const data = App.getAnalysisData ? App.getAnalysisData() : App.state.data;
    const recordNumber = patient => Number.isInteger(patient.importOrder)
      ? patient.importOrder
      : App.state.data.indexOf(patient) + 1;
    destroyChart('bmiE');
    const bmiEOptions = baseOptions();
    bmiEOptions.scales.x.title = { display: true, text: 'BMI (kg/m²)', color: chartTitleColor, padding: 10, font: chartFont(12) };
    bmiEOptions.scales.y.title = { display: true, text: 'E Median (kPa)', color: chartTitleColor, padding: 10, font: chartFont(12) };
    bmiEOptions.plugins.tooltip.callbacks = { label: context => `Record #${context.raw.record}: BMI ${context.raw.x}, E Median ${context.raw.y} kPa` };
    App.state.charts.bmiE = new Chart(document.getElementById('bmi-e-chart'), {
      type: 'scatter',
      data: { datasets: [{ data: data.filter(p => p.bmi !== null && p.stiffness !== null).map(p => ({ x: p.bmi, y: p.stiffness, record: recordNumber(p) })), backgroundColor: 'rgba(249,115,102,.76)', pointRadius: 5, pointHoverRadius: 7, borderWidth: 1.5 }] },
      options: bmiEOptions
    });

    destroyChart('bmiCap');
    const scatterOptions = baseOptions();
    scatterOptions.scales.x.title = { display: true, text: 'BMI (kg/m²)', color: chartTitleColor, padding: 10, font: chartFont(12) };
    scatterOptions.scales.y.title = { display: true, text: 'Mean CAP (dB/m)', color: chartTitleColor, padding: 10, font: chartFont(12) };
    scatterOptions.plugins.tooltip.callbacks = { label: context => `Record #${context.raw.record}: BMI ${context.raw.x}, CAP ${context.raw.y}` };
    App.state.charts.bmiCap = new Chart(document.getElementById('bmi-cap-chart'), {
      type: 'scatter',
      data: { datasets: [{ data: data.filter(p => p.bmi !== null && p.cap !== null).map(p => ({ x: p.bmi, y: p.cap, record: recordNumber(p) })), backgroundColor: 'rgba(15,118,110,.72)', pointRadius: 5, pointHoverRadius: 7, borderWidth: 1.5 }] },
      options: scatterOptions
    });

    const genders = ['Male', 'Female', 'Unspecified'];
    const genderData = genders.map(gender => data.filter(patient => patient.gender === gender));
    destroyChart('gender');
    const genderOptions = baseOptions();
    genderOptions.plugins.legend = { display: true, position: 'bottom', labels: { color: chartTextColor, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16, font: chartFont(11) } };
    genderOptions.scales.y.title = { display: true, text: 'Mean Value', color: chartTitleColor, padding: 10, font: chartFont(12) };
    App.state.charts.gender = new Chart(document.getElementById('gender-chart'), {
      type: 'bar',
      data: {
        labels: genders,
        datasets: [
          { label: 'Mean CAP', data: genderData.map(group => App.average(group.map(p => p.cap))), backgroundColor: App.colors.teal, borderRadius: 6 },
          { label: 'E (kPa)', data: genderData.map(group => App.average(group.map(p => p.stiffness))), backgroundColor: App.colors.lime, borderRadius: 6 }
        ]
      },
      options: genderOptions
    });

    const waistGroups = [
      { label: '< 80 cm', test: value => value < 80 },
      { label: '80 - 89 cm', test: value => value >= 80 && value < 90 },
      { label: '90 - 99 cm', test: value => value >= 90 && value < 100 },
      { label: '>= 100 cm', test: value => value >= 100 }
    ];
    destroyChart('waist');
    const waistOptions = baseOptions();
    // Keep every waist-range label inside the exported canvas. Without this
    // reserved bottom inset, html2canvas can crop the lowest pixels of X ticks.
    waistOptions.layout = { padding: { bottom: 10 } };
    waistOptions.scales.x.ticks = {
      ...waistOptions.scales.x.ticks,
      autoSkip: false,
      align: 'inner',
      maxRotation: 0,
      minRotation: 0,
      padding: 8
    };
    waistOptions.plugins.tooltip.callbacks = { label: context => ` Mean CAP: ${context.raw === null ? 'No data' : `${context.raw.toFixed(1)} dB/m`}` };
    App.state.charts.waist = new Chart(document.getElementById('waist-chart'), {
      type: 'line',
      data: {
        labels: waistGroups.map(group => group.label),
        datasets: [{ data: waistGroups.map(group => App.average(data.filter(p => p.waist !== null && group.test(p.waist)).map(p => p.cap))), borderColor: App.colors.blue, backgroundColor: 'rgba(59,130,246,.12)', pointBackgroundColor: App.colors.blue, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, tension: .38, fill: true }]
      },
      options: waistOptions
    });

    destroyChart('waistE');
    const waistEOptions = baseOptions();
    waistEOptions.layout = { padding: { bottom: 16 } };
    waistEOptions.scales.x.ticks = {
      ...waistEOptions.scales.x.ticks,
      autoSkip: false,
      align: 'inner',
      maxRotation: 0,
      minRotation: 0,
      padding: 8
    };
    waistEOptions.plugins.tooltip.callbacks = { label: context => ` Mean E Median: ${context.raw === null ? 'No data' : `${context.raw.toFixed(1)} kPa`}` };
    waistEOptions.scales.y.title = { display: true, text: 'Mean E Median (kPa)', color: chartTitleColor, padding: 10, font: chartFont(12) };
    App.state.charts.waistE = new Chart(document.getElementById('waist-e-chart'), {
      type: 'line',
      data: {
        labels: waistGroups.map(group => group.label),
        datasets: [{ data: waistGroups.map(group => App.average(data.filter(p => p.waist !== null && group.test(p.waist)).map(p => p.stiffness))), borderColor: App.colors.coral, backgroundColor: 'rgba(249,115,102,.12)', pointBackgroundColor: App.colors.coral, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, tension: .38, fill: true }]
      },
      options: waistEOptions
    });

    const riskFactors = App.getRiskFactorAnalysis(data);
    const riskChartNames = ['riskBMI', 'riskWaist', 'riskGender'];

    const syncGlobalLegend = (animate = false) => {
      const legend = document.getElementById('risk-global-legend');
      if (!legend) return;
      legend.querySelectorAll('[data-dataset-index]').forEach(item => {
        const datasetIndex = Number(item.dataset.datasetIndex);
        const hidden = item.classList.contains('is-hidden');
        item.setAttribute('aria-pressed', String(!hidden));
        riskChartNames.forEach(chartName => {
          const chart = App.state.charts[chartName];
          if (!chart) return;
          chart.getDatasetMeta(datasetIndex).hidden = hidden;
          chart.update(animate ? undefined : 'none');
        });
      });
    };

    App.setupGlobalLegend = function setupGlobalLegend() {
      const legend = document.getElementById('risk-global-legend');
      if (!legend || legend.dataset.ready === 'true') return;
      legend.dataset.ready = 'true';
      legend.addEventListener('click', event => {
        const item = event.target.closest('[data-dataset-index]');
        if (!item || !legend.contains(item)) return;
        item.classList.toggle('is-hidden');
        syncGlobalLegend(true);
      });
    };

    const renderRiskChart = (name, canvasId, type) => {
      const groups = riskFactors.filter(group => group.type === type && group.count > 0);
      destroyChart(name);
      const options = baseOptions();
      options.indexAxis = 'y';
      options.plugins.legend = { display: false };
      options.plugins.tooltip.callbacks = {
        label: context => ` ${context.dataset.label}: ${context.raw === null ? 'No data' : `${context.raw.toFixed(1)}%`}`,
        afterLabel: context => ` Sample size: ${groups[context.dataIndex]?.count || 0}`
      };
      options.scales.x.min = 0;
      options.scales.x.max = 100;
      options.scales.x.ticks = {
        ...options.scales.x.ticks,
        stepSize: 20,
        maxRotation: 0,
        minRotation: 0,
        callback: value => `${value}%`
      };
      App.state.charts[name] = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
          labels: groups.map(group => chartLabel(group.shortLabel)),
          datasets: [
            { label: 'Fibrosis ≥ F2', data: groups.map(group => group.fibrosisRate), backgroundColor: App.colors.teal, borderRadius: 6, barPercentage: .75 },
            { label: 'Steatosis ≥ S1', data: groups.map(group => group.steatosisRate), backgroundColor: App.colors.amber, borderRadius: 6, barPercentage: .75 }
          ]
        },
        options
      });
    };
    renderRiskChart('riskBMI', 'risk-bmi-chart', 'BMI');
    renderRiskChart('riskWaist', 'risk-waist-chart', 'Waist Circumference');
    renderRiskChart('riskGender', 'risk-gender-chart', 'Sex');
    App.setupGlobalLegend();
    syncGlobalLegend(false);
  };
})(window.FibroApp);
