const assert = require('node:assert/strict');
const test = require('node:test');
const { parse, merge } = require('../js/wearable-files');

test('timestamped CSV uses the supplied time zone and rejects invalid values and dates', () => {
  const result = parse([
    'timestamp,heartRate,spo2',
    '"2026-11-14T09:08:07-08:00",73,98',
    '2026-11-14T09:08:06,75,99',
    '2026-02-30T09:08:07Z,76,97',
    '2026-11-14T09:08:07Z,0,101'
  ].join('\n'), 'watch.CSV');
  assert.deepEqual(result.records.map(row => [row.metric, row.value, row.timestamp]), [
    ['heartRate', 73, '2026-11-14T17:08:07.000Z'],
    ['spo2', 98, '2026-11-14T17:08:07.000Z']
  ]);
  assert.equal(result.skipped, 6);
  assert.throws(() => parse('date,averageHeartRate\n2026-11-14,74', 'watch.csv'), /timestamp/);
});

test('Apple Health record mapping converts oxygen fractions and ignores unrelated records', () => {
  const record = (type, unit, value) => ({ getAttribute: key => ({
    type: 'HKQuantityTypeIdentifier' + type, unit, value, startDate: '2026-11-14 09:08:07 -0800'
  })[key] });
  const records = [record('HeartRate', 'count/min', '72'), record('OxygenSaturation', '%', '0.98'),
    record('StepCount', 'count', '351'), record('OxygenSaturation', '%', '98')];
  const result = parse('<HealthData/>', 'export.xml', () => ({
    documentElement: { localName: 'HealthData' },
    getElementsByTagNameNS: (_, name) => name === 'Record' ? records : []
  }));
  assert.deepEqual(result.records.map(row => [row.metric, row.value, row.provider]), [
    ['heartRate', 72, 'apple-health'], ['spo2', 98, 'apple-health']
  ]);
  assert.equal(result.skipped, 1);
  assert.throws(() => parse('<!DOCTYPE HealthData SYSTEM "example"><HealthData/>', 'export.xml'), /external definitions/);
});

test('TCX imports a timestamped heart-rate trackpoint', () => {
  const point = { children: [
    { localName: 'Time', textContent: '2026-11-14T10:20:30Z' },
    { localName: 'HeartRateBpm', children: [{ localName: 'Value', textContent: '132' }] }
  ] };
  const result = parse('<TrainingCenterDatabase/>', 'activity.tcx', () => ({
    documentElement: { localName: 'TrainingCenterDatabase' },
    getElementsByTagNameNS: (_, name) => name === 'Trackpoint' ? [point] : []
  }));
  assert.equal(result.records[0].provider, 'tcx');
  assert.equal(result.records[0].value, 132);
});

test('JSON archive round trips readings and honors duplicate and storage limits', () => {
  const readings = [
    { timestamp: '2026-11-14T10:20:30.000Z', metric: 'heartRate', value: 70, unit: 'bpm', provider: 'ble-hrs' },
    { timestamp: '2026-11-14T10:20:31.000Z', metric: 'spo2', value: 99, unit: '%', provider: 'csv' }
  ];
  const { records } = parse(JSON.stringify(readings), 'readings.json');
  assert.deepEqual(records, readings);
  assert.deepEqual(merge([records[0]], records, 2), { records, added: 1, duplicates: 1, overflow: 0 });
  assert.equal(merge([records[0]], records, 1).overflow, 1);
});
