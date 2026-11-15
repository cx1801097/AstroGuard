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
