# FibroSight - FibroScan Data Analytics Dashboard

FibroSight is a privacy-first dashboard for analysing FibroScan examination data from Excel files. It is a fully client-side, stateless application: patient data is processed in browser memory without a backend or database.

## Key Features

- Import one or multiple `.xlsx` or `.xls` files.
- Combine examinations performed on different dates.
- Report unique patient counts separately from examination counts.
- Analyse all imported files together or select one source file at a time.
- Classify liver fibrosis, hepatic steatosis, BMI, and waist circumference.
- Calculate BMI from height and weight.
- Search by Reference ID or imported record number, filter results, and review longitudinal examination history without displaying patient names.
- Configure clinical interpretation thresholds and retain settings in `localStorage`.
- Export cohort-level and individual PDF reports without patient or examiner names.
- Process all patient data locally without transmitting it to a server.

## Cross-File Patient Matching

The current implementation matches records across files using the normalised `First name` and `Last name` values. Unicode, letter case, and repeated whitespace are normalised before comparison.

Example:

```text
John Smith | 1 August | E 5.9 | CAP 250
John Smith | 2 August | E 5.9 | CAP 250
```

This is counted as **one unique patient and two examinations** because the examination dates differ.

A record is treated as an exact duplicate only when all of the following match:

- First and last name
- Examination date
- E Median (kPa)
- CAP Enhanced Mean (dB/m)

If either the first or last name is missing, the record is kept separate to reduce the risk of incorrectly merging different patients.

> Important: names are not unique identifiers. Different people may share the same name, while spelling differences may prevent records from being matched. Source-data quality should be reviewed before clinical or operational use.

## Expected Excel Columns

| Data element | Column heading |
|---|---|
| Examination reference | `Exam file name` |
| First name | `First name` |
| Last name | `Last name` |
| Hepatic attenuation | `CAP Enhanced Mean (dB/m)` |
| Liver stiffness | `E Median (kPa)` |
| Height | `Height` |
| Weight | `Weight` |
| Sex | `Gender` |
| Waist circumference | `Waist Circumference` |
| Examination day | `Exam date (day)` |
| Examination month | `Exam date (month)` |
| Examination year | `Exam date (year)` |

`First name` and `Last name` are used only in browser memory to match longitudinal records. They are masked throughout the interface, excluded from search, and never included in PDF exports. Legacy files may contain an examiner-name column, but the application ignores and does not retain it.

A basic liver assessment may contain E Median and/or CAP without anthropometric data. BMI-, waist-, and sex-dependent analyses remain blank when the required data is unavailable.

## Default Interpretation Thresholds

### Liver Fibrosis

| Stage | E Median threshold |
|---|---:|
| F0-F1 - No Significant Fibrosis | `< 7.0 kPa` |
| F2 - Moderate Fibrosis | `≥ 7.0 kPa` |
| F3 - Severe Fibrosis | `≥ 10.0 kPa` |
| F4 - Cirrhosis | `≥ 13.0 kPa` |

### Hepatic Steatosis

| Grade | CAP threshold |
|---|---:|
| S0 - No Steatosis | `≤ 248 dB/m` |
| S1 - Mild Steatosis | `249-268 dB/m` |
| S2 - Moderate Steatosis | `269-280 dB/m` |
| S3 - Severe Steatosis | `≥ 281 dB/m` |

Thresholds can be changed on the **Clinical Thresholds** page. All charts, tables, and reports are recalculated immediately after saving.

## Technology

- HTML5, CSS3, and Vanilla JavaScript
- [SheetJS](https://sheetjs.com/) for Excel parsing
- [Chart.js](https://www.chartjs.org/) for data visualisation
- [html2canvas](https://html2canvas.hertzen.com/) and [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- Font Awesome and Google Fonts

External libraries are loaded through CDNs, so an internet connection is required when opening the application.

## Project Structure

```text
Web Report Fibroscan/
├── assets/
│   └── liver-icon.svg
├── css/
│   └── styles.css
├── js/
│   ├── app.js         # SPA navigation, events, and multi-file aggregation
│   ├── charts.js      # Chart.js visualisations
│   ├── config.js      # Application state and default thresholds
│   ├── data.js        # Excel parsing, calculations, and classifications
│   ├── logo-data.js   # Embedded branding for PDF reports
│   └── report.js      # Cohort and individual PDF generation
├── index.html
├── valorhealth-removebg.png
└── README.md
```

## Local Use

Open `index.html` directly, or serve the project from a local HTTP server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploying with GitHub Pages

1. Create a GitHub repository.
2. Upload the complete project, keeping `index.html` in the repository root.
3. Open **Settings** → **Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` directory.
6. Select **Save** and wait for GitHub to publish the site URL.

No environment variables, API keys, backend services, or databases are required.

## Privacy and PDPA Considerations

- Imported Excel data remains in the browser tab's memory.
- Patient names are used only for in-memory record matching; they are never displayed, searchable, or exported.
- Examiner names are ignored and are not retained, displayed, searchable, or exported.
- Patient data is not stored in `localStorage`.
- Only clinical threshold settings are retained in `localStorage`.
- Imported data is removed when the page is refreshed, the tab is closed, or **Clear Data** is selected.
- PDF files are generated locally on the user's device.

Although the application does not transmit patient data, organisations remain responsible for the secure storage and handling of source Excel files and downloaded PDF reports under their applicable privacy and PDPA policies.

## Clinical Interpretation Disclaimer

Outputs are descriptive summaries of the uploaded dataset. They do not constitute a diagnosis, treatment recommendation, or evidence that BMI, waist circumference, or sex directly causes fibrosis or steatosis. Results should be interpreted by qualified healthcare professionals alongside the complete clinical context.
