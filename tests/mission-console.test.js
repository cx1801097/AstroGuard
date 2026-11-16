const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const sandbox = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../new-mission/js/storage.js'), 'utf8'), sandbox);
const storage = sandbox.window.CC_STORAGE;
const at = '2026-11-14T13:00:00.000Z';
const sample = { metric: 'heartRate', value: 72, timestamp: at, unit: 'bpm', provider: 'ble-hrs' };

test('new mission exports onboard inventory and preserves the original wearable timestamp', () => {
  const mission = {
    ...storage.emptyRecord(), crewId: 'TEST',
    missionProfile: { resources: { vehicle: ' Training article ', food: 'Shelf-stable meals', pulseOximeter: true } },
    entries: [{ at: '2026-11-14T13:05:00.000Z', values: { heartRate: 72 }, wearable: { heartRate: sample } }]
  };
  const restored = storage.fromJSON(storage.toJSON(mission));
  assert.equal(restored.missionProfile.resources.vehicle, 'Training article');
  assert.equal(restored.missionProfile.resources.food, 'Shelf-stable meals');
  assert.equal(restored.missionProfile.resources.pulseOximeter, true);
  assert.equal(restored.entries[0].wearable.heartRate.timestamp, at);
  assert.equal(restored.entries[0].wearable.heartRate.provider, 'ble-hrs');
});

test('workout sources and inconsistent wearable provenance cannot become resting measurements', () => {
  assert.equal(storage.cleanWearable({ ...sample, provider: 'tcx' }), null);
  assert.equal(storage.cleanWearable({ ...sample, unit: '%' }), null);
  const restored = storage.fromJSON(JSON.stringify({
    crewId: 'TEST', entries: [{ at, values: { heartRate: 75 }, wearable: { heartRate: sample } }]
  }));
  assert.equal(Object.keys(restored.entries[0].wearable).length, 0);
  assert.equal(restored.missionProfile.resources.pulseOximeter, false);
  const profile = storage.cloneProfile({ instruments: { vitals: false } });
  assert.equal(profile.instruments.vitals, false);
  assert.equal(storage.cloneProfile().instruments.vitals, true);
});

test('follow-up timestamps and the original wearable reading survive export and import', () => {
  const later = '2026-11-14T13:15:00.000Z';
  const originalWearable = { ...sample, value: 142 };
  const mission = { ...storage.emptyRecord(), crewId: 'TEST', entries: [{
    at, values: { heartRate: 72 },
    followUp: { acknowledgedAt: at, handoverAt: later },
    confirm: { heartRate: { first: 142, second: 72, resolved: 'below_threshold', at: later, originalWearable } }
  }] };
  const entry = storage.fromJSON(storage.toJSON(mission)).entries[0];
  assert.equal(entry.followUp.acknowledgedAt, at);
  assert.equal(entry.followUp.handoverAt, later);
  assert.equal(entry.confirm.heartRate.originalWearable.timestamp, at);
  assert.equal(entry.confirm.heartRate.first, 142);
  assert.equal(entry.confirm.heartRate.second, 72);
  mission.entries[0].followUp = { acknowledgedAt: 'invalid' };
  assert.equal(storage.fromJSON(storage.toJSON(mission)).entries[0].followUp.acknowledgedAt, null);
});

test('equipment interface validates timestamp, quality, units and cabin averaging window', () => {
  const observation = require('../new-mission/js/mission-interfaces').observation;
  const input = { metric: 'cabinCo2Avg', value: 3.5, unit: 'mmHg', quality: 'usable',
    timestamp: at, deviceId: 'cabin-01', averagingSeconds: 3600 };
  assert.equal(observation(input).provider, 'mission-equipment');
  assert.equal(observation({ ...input, quality: 'invalid' }), null);
  assert.equal(observation({ ...input, averagingSeconds: 60 }), null);
  assert.equal(observation({ ...input, unit: 'ppm' }), null);
  assert.equal(observation({ ...input, metric: 'constructor' }), null);
});

test('ground interface requires HTTPS and accepts only a matching gateway receipt', async () => {
  const { send, gatewayUrl } = require('../new-mission/js/mission-interfaces');
  assert.equal(gatewayUrl('http://ground.example/reports'), '');
  assert.equal(gatewayUrl('https://crew:secret@ground.example/reports'), '');
  const packet = { schema: 'astroguard.handover.v1', packetId: 'test-only' };
  const url = 'https://ground.example/reports';
  const receipt = await send(url, packet, async (destination, options) => {
    assert.equal(destination, url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), packet);
    return { ok: true, json: async () => ({ packetId: packet.packetId, receiptId: 'test-receipt' }) };
  });
  assert.equal(receipt, 'test-receipt');
  await assert.rejects(send(url, packet, async () => ({
    ok: true, json: async () => ({ packetId: 'different', receiptId: 'test-receipt' })
  })), /no matching receipt/);
});

test('both consoles retain the shared recheck format and migrate older outcomes', () => {
  const shared = require('../js/follow-up');
  const original = { first: 160, second: 80, at, resolved: 'artefact' };
  const rootContext = vm.createContext({
    window: { CC_FOLLOW_UP: shared, CC_DETECTION: require('../js/detection') }
  });
  const missionContext = vm.createContext({ window: { CC_FOLLOW_UP: shared } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8'), rootContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../new-mission/js/storage.js'), 'utf8'), missionContext);
  const root = rootContext.window.CC_STORAGE;
  const mission = missionContext.window.CC_STORAGE;
  const confirm = { heartRate: original, spo2: { ...original, first: 'broken' } };
  const rootRecord = root.fromJSON(JSON.stringify({ entries: [{ day: 1, values: { heartRate: 80 }, confirm }] }));
  const missionRecord = mission.fromJSON(JSON.stringify({ crewId: 'TEST', entries: [{ at, values: { heartRate: 80 }, confirm }] }));
  assert.deepEqual(rootRecord.entries[0].confirm, missionRecord.entries[0].confirm);
  assert.equal(rootRecord.entries[0].confirm.heartRate.resolved, 'below_threshold');
  assert.equal(rootRecord.entries[0].confirm.heartRate.firstAt, null);
  assert.equal(Object.hasOwn(rootRecord.entries[0].confirm, 'spo2'), false);
});

test('the dashboard and New Mission flag severe pressure, then agree on the repeat reading', () => {
  const root = { CC_DETECTION: require('../js/detection') };
  const mission = {};
  for (const [directory, window] of [['../js', root], ['../new-mission/js', mission]]) {
    for (const file of ['data.js', 'scoring.js']) {
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, directory, file), 'utf8'), { window });
    }
  }
  const emergency = { systolic: 205, diastolic: 132, heartRate: 70, spo2: 98 };
  const repeat = { ...emergency, systolic: 118, diastolic: 74 };
  const compare = (values, expected) => {
    const dashboard = root.CC_SCORING.evaluate(values, { activity: 'rest' });
    const crewConsole = mission.CC_SCORING.evaluate(values, {});
    assert.equal(dashboard.results.systolic.level >= 3, expected);
    assert.equal(dashboard.results.diastolic.level >= 3, expected);
    assert.equal(crewConsole.escalations.includes('systolic'), expected);
    assert.equal(crewConsole.escalations.includes('diastolic'), expected);
  };
  compare(emergency, true);
  compare(repeat, false);
});

test('shared vital safety check excludes exercise pulse and failed sensors in both consoles', () => {
  const detection = require('../js/detection');
  const dashboard = { CC_DETECTION: detection };
  const mission = { CC_DETECTION: detection };
  for (const [directory, window] of [['../js', dashboard], ['../new-mission/js', mission]]) {
    for (const file of ['data.js', 'scoring.js']) {
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, directory, file), 'utf8'), { window });
    }
  }
  const values = { heartRate: 150, spo2: 88 };
  for (const activity of ['unknown', 'exercise']) {
    const ctx = { activity, quality: { spo2: 'invalid' }, flightDay: 3, source: 'measured', crew: 'TEST' };
    assert.equal(dashboard.CC_SCORING.evaluate(values, ctx).results.heartRate.value, undefined);
    assert.equal(mission.CC_SCORING.evaluate(values, ctx).results.heartRate.absent, true);
    assert.equal(mission.CC_SCORING.evaluate(values, ctx).results.spo2.absent, true);
  }
  const ctx = { activity: 'rest', flightDay: 3, source: 'measured', crew: 'TEST' };
  const rootVital = detection.evaluate({ ...ctx, day: 3, values });
  const missionResult = mission.CC_SCORING.evaluate(values, ctx);
  assert.equal(rootVital.severity, 'CRITICAL');
  assert.equal(missionResult.results.spo2.level, 4);
  assert.equal(missionResult.results.spo2.rule, 'vital-safety');
  assert.equal(missionResult.triage, 'NO-GO');
});

test('New Mission keeps activity and sensor quality through export and import', () => {
  const record = storage.fromJSON(JSON.stringify({ crewId: 'TEST', entries: [{
    at, values: { heartRate: 150, spo2: 88 },
    activity: 'exercise', quality: { spo2: 'invalid', unrelated: 'invalid' }
  }] }));
  const entry = storage.fromJSON(storage.toJSON(record)).entries[0];
  assert.equal(entry.activity, 'exercise');
  assert.equal(entry.quality.spo2, 'invalid');
  assert.equal(Object.hasOwn(entry.quality, 'unrelated'), false);
});

test('mission timeline separates device sampling from check-in and repeat logging', () => {
  const { build } = require('../new-mission/js/mission-timeline');
  const logAt = '2026-11-14T13:05:00.000Z';
  const repeatAt = '2026-11-14T13:12:00.000Z';
  const originalWearable = { ...sample, value: 142 };
  const events = build({
    at: logAt,
    values: { heartRate: 70, spo2: 88, cabinCo2Avg: 4, sleepTargetAtCheck: 8 },
    quality: { spo2: 'invalid' },
    symptoms: ['headache'],
    confirm: { heartRate: { first: 142, second: 70, at: repeatAt, resolved: 'below_threshold', originalWearable } }
  }, storage.cleanWearable);
  assert.equal(events.length, 5);
  assert.deepEqual(events[0], { kind: 'reading', metric: 'heartRate', value: 142, at,
    timeBasis: 'device sample', device: 'ble-hrs', quality: null });
  assert.equal(events.find(event => event.metric === 'cabinCo2Avg').timeBasis, 'check-in logged');
  assert.equal(events.find(event => event.metric === 'spo2').quality, 'unreliable');
  assert.equal(events.find(event => event.kind === 'symptom').at, logAt);
  assert.equal(events.at(-1).timeBasis, 'recheck logged');
  assert.equal(events.at(-1).at, repeatAt);
});

test('cabin pressure and oxygen partial pressure use separate mission ranges and quality flags', () => {
  const hazards = require('../js/hazard-monitor');
  const context = { source: 'measured', values: {
    cabinPressure: 68, cabinPressureLow: 70, cabinPressureHigh: 105,
    cabinOxygen: 19, cabinOxygenLow: 18, cabinOxygenHigh: 23, spo2: 88
  } };
  const find = (input, id) => hazards.evaluate(input).find(reading => reading.id === id);
  assert.equal(find(context, 'cabinPressure').status, 'WARNING');
  assert.equal(find(context, 'cabinOxygen').status, 'WITHIN CHECK LIMIT');
  assert.equal(find({ ...context, quality: { cabinPressure: 'invalid' } }, 'cabinPressure').status, 'UNKNOWN');
  assert.equal(find({ ...context, values: { ...context.values, cabinOxygenLow: 25 } }, 'cabinOxygen').status, 'UNKNOWN');
  assert.equal(find({ ...context, source: 'digitized' }, 'cabinPressure').status, 'UNKNOWN');
  assert.equal(find({ ...context, values: { ...context.values, cabinOxygen: 23 } }, 'cabinOxygen').status, 'WITHIN CHECK LIMIT');
});

test('equipment adapter accepts cabin pressure in kPa and keeps original time', () => {
  const { observation } = require('../new-mission/js/mission-interfaces');
  const input = { metric: 'cabinPressure', value: 91, unit: 'kPa', quality: 'usable', timestamp: at, deviceId: 'cabin-1' };
  assert.equal(observation(input).timestamp, at);
  assert.equal(observation({ ...input, unit: 'mmHg' }), null);
});

test('an out-of-range cabin reading changes a nominal New Mission verdict without masking critical health alerts', () => {
  const hazards = require('../js/hazard-monitor');
  const context = { source: 'measured', values: { cabinPressure: 91, cabinPressureLow: 95, cabinPressureHigh: 105 } };
  const nominal = { triage: 'GO', readiness: 97 };
  const findings = hazards.evaluate(context);
  const result = hazards.applyToMissionAssessment(nominal, findings);
  assert.equal(result.triage, 'CAUTION');
  assert.equal(result.healthTriage, 'GO');
  assert.equal(result.readiness, 97);
  assert.equal(result.hazardWarnings[0].id, 'cabinPressure');
  assert.equal(hazards.applyToMissionAssessment({ triage: 'NO-GO' }, findings).triage, 'NO-GO');
  assert.equal(hazards.applyToMissionAssessment({ triage: 'NO DATA' }, findings).triage, 'NO DATA');
  const recheck = hazards.evaluate({ ...context, values: { ...context.values, cabinPressure: 98 } });
  assert.equal(hazards.applyToMissionAssessment(nominal, recheck).triage, 'GO');
});
