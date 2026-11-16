const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/cognitive-check'), 'utf8');

function harness(kind) {
  const listeners = new Map();
  const nodes = new Map();
  const timers = new Map();
  const notes = [];
  let id = 0;
  let now = 0;
  const node = name => {
    if (!nodes.has(name)) {
      const instance = {
        textContent: '', value: '', focus() {},
        addEventListener: (type, listener) => listeners.set(name + ':' + type, listener)
      };
      nodes.set(name, instance);
    }
    return nodes.get(name);
  };
  const host = { querySelector: selector => node(selector.slice(16, -1)) };
  node('test').value = kind;
  const window = {};
  const document = node('document');
  vm.runInNewContext(source, {
    window, document, performance: { now: () => now },
    Math: Object.assign(Object.create(Math), { random: () => 0.1 }),
    setTimeout: (callback, delay) => { timers.set(++id, [callback, delay]); return id; },
    clearTimeout: handle => timers.delete(handle)
  });
  window.CC_COGNITIVE_CHECK.mount(host, () => 'crew/day', value => { notes.push(value); return true; });
  return {
    node, notes, document,
    event: (name, type = 'click') => listeners.get(name + ':' + type)({ preventDefault() {} }),
    advance: (ms = 0) => { now += ms; },
    tick: () => {
      const [handle, [callback, delay]] = timers.entries().next().value;
      timers.delete(handle);
      now += delay;
      callback();
    }
  };
}

test('reaction test counts early and missed trials and computes median for valid signals only', () => {
  const ui = harness('reaction');
  ui.event('start');
  ui.event('respond');
  ui.tick();
  for (const duration of [200, 400, 600]) {
    ui.tick();
    ui.advance(duration);
    ui.event('respond');
    ui.tick();
  }
  ui.tick();
  ui.tick();
  ui.tick();
  assert.equal(ui.node('summary').textContent, 'Reaction time: 3/5 correct, median 400 ms, 1 early, 1 missed.');
  ui.event('save');
  assert.equal(ui.notes.length, 1);
  assert.equal(ui.node('save').hidden, true);
});

test('choice reaction records a wrong direction and clears an interrupted session', () => {
  const ui = harness('choice');
  ui.event('start');
  ui.tick();
  assert.equal(ui.node('cue').textContent, 'LEFT');
  ui.event('right');
  assert.equal(ui.node('cue').textContent, 'Incorrect response.');
  ui.document.hidden = true;
  ui.event('document', 'visibilitychange');
  assert.match(ui.node('summary').textContent, /Test stopped/);
  assert.equal(ui.node('save').hidden, true);
});

test('digit recall checks the presented sequence for each round', () => {
  const ui = harness('memory');
  ui.event('start');
  for (const answer of ['111', '999', '11111']) {
    assert.match(ui.node('cue').textContent, /Remember:/);
    ui.tick();
    ui.node('digits').value = answer;
    ui.event('recall', 'submit');
    ui.tick();
  }
  assert.equal(ui.node('summary').textContent, 'Digit recall: 2/3 correct, 1 incorrect.');
});
