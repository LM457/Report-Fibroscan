/* Application defaults and shared in-memory state. */
window.FibroApp = {
  DEFAULT_SETTINGS: {
    capS0Max: 248,
    capS1: 249,
    capS2: 269,
    capS3: 281,
    eF01Max: 6.9,
    eF2: 7.0,
    eF3: 10.0,
    eF4: 13.0,
    bmiNormalStart: 18.5,
    bmiOverweightStart: 23.0,
    bmiObesity1Start: 25.0,
    bmiObesity2Start: 30.0,
    waistMaleHigh: 90,
    waistFemaleHigh: 80
  },
  STORAGE_KEY: 'fibrosight-clinical-thresholds-v4',
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  TABLE_PAGE_SIZE: 8,
  state: {
    data: [],
    files: [],
    fileName: '',
    selectedFileId: 'all',
    settings: {},
    charts: {},
    selectedPatientIndex: null,
    tablePage: 1,
    showIncompleteOnly: false,
    activePage: 'overview'
  },
  colors: {
    teal: '#0f766e',
    tealLight: '#2dd4bf',
    navy: '#17324d',
    blue: '#3b82f6',
    lime: '#a3e635',
    amber: '#f59e0b',
    coral: '#f97366',
    red: '#dc4c64',
    slate: '#8da0af'
  }
};
