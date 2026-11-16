const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { assess, cases } = require('../js/mission-demo');
const detection = require('../js/detection');
const hazards = require('../js/hazard-monitor');
const window = { CC_DETECTION: detection };
for (const file of ['data.js', 'scoring.js']) {
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/' + file), 'utf8'), { window });
}

const demoCases = cases(window.CC_DATA.SCENARIOS);
const deps = { detection, hazards, scoring: window.CC_SCORING };

test('mission demo uses the real detector, then preserves urgent symptoms during a synthetic recheck', () => {
  const scenario = demoCases.persistentSymptom;
  const initial = assess(scenario, false, deps);
  const followUp = assess(scenario, true, deps);
  assert.equal(initial.suggestion.severity, 'CRITICAL');
  assert.match(initial.suggestion.next, /Do not wait/);
  assert.equal(followUp.suggestion.severity, 'CRITICAL');
  assert.match(followUp.suggestion.observations[0], /Chest pain/);
  assert.match(followUp.report, /Demonstration or unverified data/);
  assert.match(followUp.report, /92% → 98%/);
  assert.equal(scenario.values.spo2, 92);
});

test('a usable warning can clear on repeat while the original reading remains in the handover', () => {
  const scenario = demoCases.recoveringOxygen;
  assert.equal(assess(scenario, false, deps).suggestion.severity, 'WARNING');
  const followUp = assess(scenario, true, deps);
  assert.equal(followUp.suggestion.severity, 'NORMAL');
  assert.match(followUp.report, /92% → 98%/);
});

test('an unreliable low reading stays unknown until replaced by a verified simulated recheck', () => {
  const scenario = demoCases.unreliableSensor;
  const initial = assess(scenario, false, deps);
  assert.equal(initial.suggestion.severity, 'UNKNOWN');
  assert.match(initial.suggestion.situation, /no usable blood oxygen/);
  const followUp = assess(scenario, true, deps);
  assert.equal(followUp.suggestion.severity, 'NORMAL');
  assert.match(followUp.report, /86% \(unreliable\) → 98%/);
});

test('switching the mission case hides the previous handover and starts a fresh check', () => {
  const source = fs.readFileSync(require.resolve('../js/mission-demo'), 'utf8');
  const state = new Map();
  class Element {
    constructor() { this.events = {}; }
    addEventListener(event, handler) { this.events[event] = handler; }
    replaceChildren(...children) {
      this.children = children;
      if (children[0] && Object.hasOwn(children[0], 'value')) this.value = children[0].value;
    }
    focus() {}
  }
  const read = selector => {
    if (!state.has(selector)) state.set(selector, new Element());
    return state.get(selector);
  };
  const demoWindow = {};
  vm.runInNewContext(source, { window: demoWindow, document: { createElement: () => new Element() },
    Option: class Option { constructor(text, value) { this.text = text; this.value = value; } } });
  const reset = demoWindow.CC_MISSION_DEMO.mount({ querySelector: read }, window.CC_DATA.SCENARIOS, deps);
  reset();
  assert.match(read('[data-demo-status]').textContent, /CRITICAL/);
  read('[data-demo-recheck]').events.click();
  assert.equal(read('[data-demo-handoff]').hidden, false);
  const selector = read('[data-demo-case]');
  selector.value = 'unreliableSensor';
  selector.events.change();
  assert.match(read('[data-demo-status]').textContent, /UNKNOWN/);
  assert.equal(read('[data-demo-handoff]').hidden, true);
  assert.equal(read('[data-demo-recheck]').hidden, false);
});
