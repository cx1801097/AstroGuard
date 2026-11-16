const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { evaluate, guidance, reviewReport, crewSuggestion } = require('../js/detection');
const fixtures = require('./fixtures/health-cases.json');

function checkIn(day, values, metadata = {}) {
  return { day, values, activity: 'rest', source: 'simulated', crew: 'A', ...metadata };
}

const stable = Array.from({ length: 7 }, (_, index) => checkIn(index + 1, { spo2: 98, heartRate: 66 }));

test('crew suggestion describes the finding and uses only the relevant confirmed sensor', () => {
  const assessment = evaluate(checkIn(9, { spo2: 91, heartRate: 72 }));
  const suggestion = crewSuggestion(assessment, { pulseOximeter: 'available', heartRateMonitor: 'available' });
  assert.match(suggestion.situation, /Blood oxygen is 91%/);
  assert.match(suggestion.next, /another reading at rest/);
  assert.match(suggestion.resource, /pulse oximeter/);
  assert.doesNotMatch(suggestion.resource, /heart-rate monitor/);
  assert.doesNotMatch(crewSuggestion(assessment, { sensors: 'oxygen equipment' }).resource, /pulse oximeter/);
});

test('crew suggestion escalates reported chest pain even when vital signs produce no alert', () => {
  const assessment = evaluate(checkIn(9, { spo2: 98, heartRate: 72 }));
  const suggestion = crewSuggestion(assessment, { pulseOximeter: 'available', medical: 'Specific dose', food: 'Meal inventory' }, ['chestPain']);
  assert.equal(suggestion.severity, 'CRITICAL');
  assert.match(suggestion.situation, /Chest pain or pressure/);
  assert.match(suggestion.next, /contact the flight surgeon now/);
  assert.match(suggestion.next, /Do not wait/);
  assert.match(suggestion.resource, /medical inventory/);
  assert.doesNotMatch(suggestion.resource, /Specific dose|pulse oximeter/);
});

test('critical guidance prioritizes private contact and the report omits flagged values and identity', () => {
  const current = checkIn(9, { spo2: 86, heartRate: 234 }, {
    source: 'measured', crew: 'Private Name', note: 'Private note', quality: { heartRate: 'invalid' }
  });
  const assessment = evaluate(current);
  assert.match(guidance(assessment.severity).advice, /approved private medical channel/);
  assert.match(guidance(assessment.severity).advice, /Do not wait/);
  const report = reviewReport(current.day, assessment);
  assert.match(report, /Urgent flight surgeon review/);
  assert.match(report, /Flight day 9/);
  assert.match(report, /86%/);
  assert.match(report, /sensor flagged/);
  assert.doesNotMatch(report, /234|Private Name|Private note/);
});

test('warning handoffs label non-measured sources, and routine or incomplete check-ins have no draft', () => {
  for (const source of ['simulated', 'digitized', 'unknown']) {
    const assessment = evaluate(checkIn(9, { spo2: 92, heartRate: 72 }, { source }));
    const report = reviewReport(9, assessment);
    assert.match(report, /Demonstration or unverified data/);
    assert.match(report, /review if concern persists/);
  }
  assert.equal(reviewReport(9, evaluate(checkIn(9, { spo2: 98, heartRate: 72 }))), '');
  assert.equal(reviewReport(9, evaluate(checkIn(9, {}))), '');
});

for (const [name, fixture] of Object.entries(fixtures)) {
  test(name + ': ' + fixture.description, () => {
    const current = checkIn(9, fixture.values, { activity: fixture.activity, quality: fixture.quality });
    const history = fixture.prior ? [checkIn(8, fixture.prior)] : [];
    if (name === 'offline') {
      const unavailable = () => assert.fail('Attempted network or storage access');
      const browser = vm.createContext({
        window: {},
        fetch: unavailable,
        XMLHttpRequest: unavailable
      });
      Object.defineProperty(browser.window, 'localStorage', { get: unavailable });
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/detection.js'), 'utf8'), browser);
      assert.equal(browser.window.CC_DETECTION.evaluate(current, history).severity, fixture.expected);
    } else {
      assert.equal(evaluate(current, history).severity, fixture.expected);
    }
  });
}

test('absolute oxygen boundaries and exercise override', () => {
  for (const [spo2, status] of [[88, 'CRITICAL'], [89, 'WARNING'], [92, 'WARNING'], [93, 'NORMAL']]) {
    assert.equal(evaluate(checkIn(9, { spo2, heartRate: 150 }, { activity: 'exercise' })).severity, status);
  }
});

test('fusion requires adjacent days with both factors and valid context', () => {
  const current = checkIn(9, { spo2: 91, heartRate: 112 });
  const prior = { spo2: 92, heartRate: 107 };
  for (const history of [
    [checkIn(7, prior)],
    [checkIn(8, { ...prior, heartRate: 72 })],
    [checkIn(8, prior, { activity: 'exercise' })],
    [checkIn(8, prior, { quality: { spo2: 'invalid' } })],
    [checkIn(8, prior), checkIn(8, prior)]
  ]) assert.equal(evaluate(current, history).severity, 'WARNING');
  const fused = evaluate(current, [checkIn(8, prior)]);
  assert.match(fused.reasons.join(' '), /both crossed safety thresholds/);
});

test('personal baseline uses a scale floor and requires sustained deviation', () => {
  const values = { spo2: 98, heartRate: 82 };
  const first = evaluate(checkIn(8, values), stable);
  assert.equal(first.severity, 'NORMAL');
  assert.deepEqual(first.baselines.heartRate, { count: 7, median: 66, scale: 3 });
  assert.match(first.reasons.join(' '), /departs from the resting median/);
  assert.equal(evaluate(checkIn(9, values), [...stable, checkIn(8, values)]).severity, 'WARNING');
});

test('baseline excludes exercise, invalid readings, safety alerts, old and future data', () => {
  const history = [
    ...stable, checkIn(8, { spo2: 88, heartRate: 66 }, { quality: { heartRate: 'invalid' } }),
    checkIn(9, { spo2: 98, heartRate: 145 }, { activity: 'exercise' }),
    checkIn(10, { spo2: 98, heartRate: 70 }),
    checkIn(11, { spo2: 98, heartRate: 70 }),
    checkIn(-25, { spo2: 98, heartRate: 70 })
  ];
  const result = evaluate(checkIn(10, { spo2: 98, heartRate: 66 }), history);
  assert.equal(result.baselines.spo2.count, 7);
  assert.equal(result.baselines.heartRate.count, 7);
});

test('baseline is isolated by crew and provenance', () => {
  for (const metadata of [{ crew: 'B' }, { crew: '' }, { source: 'measured' }, { source: 'digitized' }, { source: 'unknown' }]) {
    const result = evaluate(checkIn(8, { spo2: 98, heartRate: 82 }, metadata), stable);
    assert.equal(result.baselines.heartRate.count, 0);
  }
});

test('missing or malformed data produces UNKNOWN unless a trusted alert takes precedence', () => {
  const bad = checkIn(1, { spo2: '98', heartRate: NaN });
  const unknown = evaluate(bad);
  assert.equal(unknown.severity, 'UNKNOWN');
  assert.deepEqual(unknown.quality, { spo2: 'invalid', heartRate: 'invalid' });
  assert.equal(evaluate(checkIn(1, { spo2: 98, heartRate: 70 }, { activity: 'unknown' })).severity, 'UNKNOWN');
  assert.equal(evaluate(checkIn(1, { spo2: 92 })).severity, 'WARNING');
});

test('threshold overrides affect evaluation without altering defaults', () => {
  const reading = checkIn(1, { spo2: 93, heartRate: 73 });
  assert.equal(evaluate(reading, [], { oxygenWarning: 94 }).severity, 'WARNING');
  assert.equal(evaluate(reading).severity, 'NORMAL');
});

test('browser storage import/export preserves context, quality, and missing values', () => {
  const browser = vm.createContext({ window: {} });
  for (const file of ['detection', 'storage']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), browser);
  }
  const storage = browser.window.CC_STORAGE;
  const legacy = { day: 1, values: { spo2: 98 } };
  const tagged = checkIn(2, { heartRate: 70 }, { source: 'digitized', quality: { heartRate: 'invalid' } });
  const record = JSON.parse(storage.toJSON(storage.fromJSON(JSON.stringify({ entries: [legacy, tagged] }))));
  assert.equal(record.entries[0].source, 'unknown');
  assert.equal(record.entries[0].activity, 'unknown');
  assert.equal(Object.hasOwn(record.entries[0].values, 'heartRate'), false);
  assert.equal(record.entries[1].source, 'digitized');
  assert.equal(record.entries[1].crew, 'A');
  assert.deepEqual(record.entries[1].quality, { heartRate: 'invalid' });
});

test('named mission records preserve metadata and wearable provenance without replacing the simulator', () => {
  const localStorage = Object.create(null);
  Object.defineProperties(localStorage, {
    getItem: { value: key => localStorage[key] || null },
    setItem: { value: (key, value) => { localStorage[key] = value; } }
  });
  const browser = vm.createContext({ window: { localStorage } });
  for (const file of ['detection', 'storage']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), browser);
  }
  const storage = browser.window.CC_STORAGE;
  const entry = checkIn(1, { heartRate: 76 }, { wearable: {
    heartRate: { value: 76, timestamp: '2026-11-14T09:00:00Z', provider: 'ble-hrs' }
  } });
  storage.save({ ...storage.emptyMission(), name: 'Simulator' });
  storage.save({
    ...storage.emptyMission(), name: 'Crew mission', entries: [entry],
    details: { vehicle: 'Test vehicle', launchDate: '2026-11-14' }
  }, 'mission-test');
  assert.equal(storage.load().name, 'Simulator');
  assert.equal(storage.listMissions().length, 1);
  const mission = storage.load('mission-test');
  assert.equal(mission.details.vehicle, 'Test vehicle');
  assert.equal(mission.entries[0].wearable.heartRate.provider, 'ble-hrs');
});

test('crew suggestion combines scored blood pressure, glucose and hazard alerts with vital findings', () => {
  const window = {};
  for (const file of ['data.js', 'detection.js', 'scoring.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
  }
  const current = checkIn(9, {
    heartRate: 103, spo2: 98, systolic: 220, diastolic: 136, glucose: 51, cabinCo2Avg: 4
  });
  const alerts = window.CC_SCORING.evaluate(current.values, current, ['visionChanges']).alerts;
  const hazards = require('../js/hazard-monitor').evaluate(current);
  const suggestion = crewSuggestion(evaluate(current), {}, ['visionChanges'], alerts, hazards);
  assert.equal(suggestion.severity, 'CRITICAL');
  assert.deepEqual(suggestion.findingCodes.map(item => item.metric),
    ['systolic', 'diastolic', 'glucose', 'heartRate', 'visionChanges', 'cabinCo2']);
  assert.match(suggestion.situation, /220 mmHg.*136 mmHg.*51 mg\/dL/);
  assert.match(suggestion.next, /contact the flight surgeon now/);
  assert.match(suggestion.situation, /cabin CO₂/);
  const request = require('../gemini').scenario({
    source: current.source, severity: suggestion.severity, findings: suggestion.findingCodes
  });
  assert.deepEqual(request.findings, suggestion.findingCodes);
});

test('a flagged pressure sensor is excluded while a chronic bone finding remains visible', () => {
  const window = {};
  for (const file of ['data.js', 'detection.js', 'scoring.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
  }
  const current = checkIn(9, { heartRate: 70, spo2: 98, systolic: 220, boneDensityPct: -6 },
    { quality: { systolic: 'invalid' } });
  const alerts = window.CC_SCORING.evaluate(current.values, current).alerts;
  const suggestion = crewSuggestion(evaluate(current), {}, [], alerts);
  assert.equal(suggestion.severity, 'WARNING');
  assert.match(suggestion.situation, /Bone density change/);
  assert.doesNotMatch(suggestion.situation, /220|Systolic/);
});

test('34-day simulated mission tracks stable checks, failed sensors, multiple hazards and recovery', () => {
  const window = {};
  for (const file of ['data.js', 'detection.js', 'scoring.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
  }
  const hazards = require('../js/hazard-monitor');
  const base = {
    heartRate: 68, spo2: 98, systolic: 118, sleepHours: 8, radiationDose: 30, radiationLimit: 50,
    boneDensityPct: -1, boneLossLimit: 3, cabinCo2Avg: 2, wbc: 6, wbcLow: 4, wbcHigh: 11
  };
  const inputs = Array.from({ length: 30 }, (_, i) => checkIn(i + 1, { ...base }));
  inputs.push(
    checkIn(31, { ...base, spo2: 84, systolic: 220, cabinCo2Avg: 5 },
      { quality: { spo2: 'invalid', systolic: 'invalid', cabinCo2Avg: 'invalid' } }),
    checkIn(32, { ...base, spo2: 92, heartRate: 110, sleepHours: 5, radiationDose: 47, cabinCo2Avg: 3.5 }),
    checkIn(33, { ...base, spo2: 92, heartRate: 110, sleepHours: 5, radiationDose: 51, cabinCo2Avg: 3.7,
      boneDensityPct: -3.5, wbc: 12 }),
    checkIn(34, { ...base, radiationDose: 51, boneDensityPct: -3.5, wbc: 12 })
  );
  const results = inputs.map((sample, i) => {
    const history = inputs.slice(0, i);
    const vital = evaluate(sample, history);
    const hazard = hazards.evaluate({ ...sample, history, sleepTarget: 7.5 });
    const score = window.CC_SCORING.evaluate(sample.values, { ...sample, entries: history });
    return { vital, hazard, suggestion: crewSuggestion(vital, {}, [], score.alerts, hazard) };
  });
  assert.ok(results.slice(0, 30).every(({ suggestion }) => suggestion.severity === 'NORMAL'));
  assert.equal(results[30].suggestion.severity, 'UNKNOWN');
  assert.equal(results[30].hazard.find(item => item.id === 'cabinCo2').status, 'UNKNOWN');
  assert.doesNotMatch(results[30].suggestion.situation, /220 mmHg|Blood oxygen is 84/);
  assert.equal(results[31].vital.severity, 'WARNING');
  assert.equal(results[32].vital.severity, 'CRITICAL');
  const warnings = results[32].hazard.filter(item => item.status === 'WARNING');
  assert.deepEqual(warnings.map(item => item.id), ['radiationDose', 'sleepHours', 'boneDensityPct', 'cabinCo2', 'wbc']);
  assert.match(warnings.find(item => item.id === 'sleepHours').detail, /two consecutive/);
  assert.equal(results[33].vital.severity, 'NORMAL');
  assert.equal(results[33].suggestion.severity, 'WARNING');
  assert.deepEqual(results[33].hazard.filter(item => item.status === 'WARNING').map(item => item.id),
    ['radiationDose', 'boneDensityPct', 'wbc']);
});

test('ambiguous or foreign prior readings cannot establish consecutive low sleep', () => {
  const hazards = require('../js/hazard-monitor');
  const current = checkIn(4, { sleepHours: 5 });
  const history = [checkIn(3, { sleepHours: 5 }), checkIn(3, { sleepHours: 8 }),
    checkIn(3, { sleepHours: 5 }, { crew: 'other' })];
  const sleep = hazards.evaluate({ ...current, history, sleepTarget: 7.5 }).find(item => item.id === 'sleepHours');
  assert.equal(sleep.status, 'WARNING');
  assert.doesNotMatch(sleep.detail, /two consecutive/);
});

test('cloud ranking preserves chest pain, urgent findings and all unranked observations', () => {
  const { orderReviewObservations } = require('../js/detection');
  const observations = ['chest pain', 'urgent pressure', 'urgent pulse', 'cabin warning', 'lab warning', 'missing oxygen'];
  assert.deepEqual(orderReviewObservations(observations, [4, 3, 3, 2, 2, 0], [5, 4, 2]),
    ['chest pain', 'urgent pulse', 'urgent pressure', 'lab warning', 'cabin warning', 'missing oxygen']);
});

test('the AI button falls back to isolated simulation from incomplete or private check-ins', () => {
  const window = {};
  for (const file of ['data.js', 'detection.js', 'scoring.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
  }
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const render = app.slice(app.indexOf('  function setGeminiScenario('), app.indexOf('  function postAIReview('));
  for (const [mode, source] of [['simulator', 'simulated'], ['simulator', 'measured'], ['mission', 'measured']]) {
    const elements = new Map();
    const context = {
      state: { mode, mission: { details: { phase: 'In orbit' } } }, source,
      D: window.CC_DATA, S: window.CC_SCORING, Detection: window.CC_DETECTION, cloudAIUrl: 'enabled',
      geminiPending: false, geminiScenario: null, programFallback: '',
      $: id => {
        if (!elements.has(id)) elements.set(id, {});
        return elements.get(id);
      }
    };
    vm.runInNewContext(render + '\nsetGeminiScenario({ source }, { severity: "UNKNOWN", findingCodes: [{ kind: "missing", metric: "spo2" }] });', context);
    assert.equal(elements.get('#runGemini').disabled, mode === 'mission');
    if (mode === 'simulator') {
      const request = context.geminiScenario.request;
      assert.equal(request.source, 'simulated');
      assert.equal(request.findings[0].kind, 'no_alert');
      assert.equal(request.phase, undefined);
    } else {
      assert.equal(context.geminiScenario.request, null);
    }
  }
});

test('guided self-check feeds real entries only and escalates a symptom-only chest pain report', () => {
  const window = {};
  for (const file of ['data.js', 'detection.js', 'scoring.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
  }
  const { read } = require('../js/self-check');
  const form = new FormData();
  form.set('heartRate', '88');
  form.set('activity', 'exercise');
  form.set('spo2', '');
  form.set('systolic', '  ');
  form.set('radiationDose', '500');
  assert.deepEqual(read(form, window.CC_DATA), { values: { heartRate: 88 }, symptoms: [], activity: 'exercise' });
  form.set('spo2', '150');
  assert.throws(() => read(form, window.CC_DATA), /supported input range/);
  assert.throws(() => read(new FormData(), window.CC_DATA), /at least one/);

  const symptomForm = new FormData();
  symptomForm.append('symptoms', 'chestPain');
  symptomForm.append('symptoms', 'unrecognized');
  const symptomInput = read(symptomForm, window.CC_DATA);
  assert.deepEqual(symptomInput.values, {});
  assert.deepEqual(symptomInput.symptoms, ['chestPain']);
  const detection = evaluate(checkIn(9, symptomInput.values, { source: 'measured', activity: symptomInput.activity }));
  const suggestion = crewSuggestion(detection, {}, symptomInput.symptoms);
  assert.equal(suggestion.severity, 'CRITICAL');
  assert.match(suggestion.next, /contact the flight surgeon now/);
});

test('cabin findings stay available locally while supported demo findings retain their AI indexes', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const render = app.slice(app.indexOf('  function setGeminiScenario('), app.indexOf('  function postAIReview('));
  const elements = new Map();
  const context = {
    state: { mode: 'simulator', mission: {} }, cloudAIUrl: 'enabled',
    geminiPending: false, geminiScenario: null, programFallback: '',
    $: id => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    }
  };
  vm.runInNewContext(render + `
    setGeminiScenario({source: 'simulated'}, {
      severity: 'WARNING', observations: ['Cabin pressure warning','Low blood oxygen'], findingUrgencies: [2, 2],
      findingCodes: [{kind:'alert',metric:'cabinPressure'},{kind:'alert',metric:'spo2'}]
    });
  `, context);
  assert.deepEqual(Array.from(context.geminiScenario.requestIndices), [1]);
  assert.equal(context.geminiScenario.request.findings[0].metric, 'spo2');
  assert.equal(context.geminiScenario.observations[0], 'Cabin pressure warning');
});
