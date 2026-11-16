const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { assess } = require('../js/mission-demo');
const detection = require('../js/detection');
const hazards = require('../js/hazard-monitor');
const window = { CC_DETECTION: detection };
for (const file of ['data.js', 'scoring.js']) {
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
}

test('mission demo uses the real detector, then preserves urgent symptoms during a synthetic recheck', () => {
  const scenario = window.CC_DATA.SCENARIOS.critical;
  const repeat = window.CC_DATA.SCENARIOS.nominal.values.spo2;
  const deps = { detection, hazards, scoring: window.CC_SCORING };
  const initial = assess(scenario, null, deps);
  const followUp = assess(scenario, repeat, deps);
  assert.equal(initial.suggestion.severity, 'CRITICAL');
  assert.match(initial.suggestion.next, /Do not wait/);
  assert.equal(followUp.suggestion.severity, 'CRITICAL');
  assert.match(followUp.suggestion.observations[0], /Chest pain/);
  assert.match(followUp.report, /Demonstration or unverified data/);
  assert.match(followUp.report, /92% → 98%/);
  assert.equal(scenario.values.spo2, 92);
});
