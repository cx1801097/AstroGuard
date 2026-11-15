const assert = require('node:assert/strict');
const test = require('node:test');
const { model, modelAssets, selectFocus } = require('../js/local-ai');

test('offline launch uses only local runtime, model weights and WebAssembly URLs', () => {
  assert.deepEqual(modelAssets('http://localhost:8080/index.html'), {
    runtime: 'http://localhost:8080/ai-assets/web-llm.js',
    weights: 'http://localhost:8080/ai-assets/model/resolve/local/',
    wasm: 'http://localhost:8080/ai-assets/model.wasm',
    ready: 'http://localhost:8080/ai-assets/ready.json'
  });
  assert.equal(modelAssets('http://127.0.0.1:8080/').weights, 'http://127.0.0.1:8080/ai-assets/model/resolve/local/');
  assert.equal(modelAssets('https://cx1801097.github.io/NasaSpaceAppChallangeCCC/'), model);
  assert.equal(modelAssets('file:///C:/CREW-CHECK.html'), null);
  assert.equal(modelAssets('http://example.test/'), null);
});

test('the model can only select an existing observation', () => {
  const facts = ['Blood oxygen is low.', 'No usable heart rate reading.'];
  assert.equal(selectFocus(' 2\n', facts), facts[1]);
  for (const invalid of ['0', '-1', '3', '2.0', '2. Take medication.', '<think>1</think>2', {}, null]) {
    assert.equal(selectFocus(invalid, facts), null);
  }
});
