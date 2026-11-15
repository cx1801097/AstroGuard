const assert = require('node:assert/strict');
const test = require('node:test');
const { model, modelAssets, selectFocus, prepareWeightManifest } = require('../js/local-ai');

test('offline launch uses only local runtime, model weights and WebAssembly URLs', () => {
  assert.deepEqual(modelAssets('http://localhost:8080/index.html'), {
    runtime: 'http://localhost:8080/ai-assets/web-llm.js',
    weights: 'http://localhost:8080/ai-assets/model/resolve/local/',
    wasm: 'http://localhost:8080/ai-assets/model.wasm',
    ready: 'http://localhost:8080/ai-assets/ready.json'
  });
  assert.equal(modelAssets('http://127.0.0.1:8080/').weights, 'http://127.0.0.1:8080/ai-assets/model/resolve/local/');
  assert.equal(modelAssets('https://cx1801097.github.io/NasaSpaceAppChallangeCCC/'), model);
  assert.equal(modelAssets('file:///C:/ASTROGUARD.html'), null);
  assert.equal(modelAssets('http://example.test/'), null);
});

test('the model can only select an existing observation', () => {
  const facts = ['Blood oxygen is low.', 'No usable heart rate reading.'];
  assert.equal(selectFocus(' 2\n', facts), facts[1]);
  assert.equal(selectFocus('<think>\n\n</think>\n\n2', facts), facts[1]);
  for (const invalid of ['0', '-1', '3', '2.0', '2. Take medication.', '<think>1</think>2', {}, null]) {
    assert.equal(selectFocus(invalid, facts), null);
  }
});

test('WebLLM Cache.add can find the existing Qwen3 shard manifest without fetching the missing filename', async () => {
  for (const weights of [model.weights, modelAssets('http://localhost:8080/').weights]) {
    const entries = new Map();
    const cache = {
      match: async key => entries.get(key),
      put: async (key, response) => { entries.set(key, response); }
    };
    const storage = { open: async name => { assert.equal(name, 'webllm/model'); return cache; } };
    const response = new Response('{"records":[]}');
    await prepareWeightManifest(weights, storage, async url => {
      assert.equal(url.href, weights + 'ndarray-cache.json');
      return response;
    });
    assert.equal(await cache.match(weights + 'tensor-cache.json'), response);
    await prepareWeightManifest(weights, storage, () => assert.fail('Cache hit should not fetch again'));
  }
});
