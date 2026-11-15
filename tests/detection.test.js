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
