const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');
const { MODEL, analyzeScenario, createGeminiHandler, scenario } = require('../gemini');

const demo = {
  source: 'simulated', severity: 'WARNING',
  findings: [{ kind: 'alert', metric: 'spo2', value: 92, note: 'private' }, { kind: 'missing', metric: 'heartRate' }],
  crew: 'Private Name', pulseOximeter: true
};

function modelResponse(priority, clarification) {
  return Response.json({ candidates: [{ content: { parts: [{
    text: JSON.stringify({ priority, clarification })
  }] } }] });
}

test('Gemini receives coded simulated findings and a bounded low-cost request', async () => {
  const parsed = scenario(demo);
  const result = await analyzeScenario(parsed, 'test-placeholder', async (url, options) => {
    assert.match(url, /gemini-2\.5-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'test-placeholder');
    assert.doesNotMatch(options.body, /private|Private Name|92|test-placeholder/);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.equal(body.generationConfig.maxOutputTokens, 120);
    assert.equal(body.tools, undefined);
    return modelResponse(['0', '1'], 'verify_sensor');
  });
  assert.equal(result.model, MODEL);
  assert.deepEqual(result.priority, [0, 1]);
  assert.match(result.clarification, /sensor/);
});

test('private mission data is rejected and critical symptoms keep priority', async () => {
  assert.equal(scenario({ ...demo, source: 'measured' }), null);
  assert.equal(scenario({ ...demo, source: 'digitized' }), null);
  const critical = scenario({ ...demo, severity: 'CRITICAL', findings: [...demo.findings, { kind: 'chest_pain' }] });
  assert.deepEqual(critical.questions, ['none']);
  const result = await analyzeScenario(critical, 'test-placeholder', async () => modelResponse(['0'], 'none'));
  assert.deepEqual(result.priority, [2, 0]);
  await assert.rejects(analyzeScenario(critical, 'test-placeholder', async () => modelResponse(['99'], 'none')),
    /Invalid Gemini response/);
});

async function post(handler, body, origin = 'http://localhost:8080') {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    method: 'POST', socket: { remoteAddress: '::1' },
    headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' }
  });
  const res = { writeHead(status) { this.status = status; }, end(text) { this.body = JSON.parse(text); } };
  await handler(req, res);
  return res;
}

test('local gateway blocks cross-origin calls, unconfigured keys, and excess requests', async () => {
  let time = 0;
  const unset = createGeminiHandler();
  assert.equal((await post(unset, demo)).status, 503);
  const handler = createGeminiHandler({ apiKey: 'test-placeholder', now: () => time,
    fetcher: async () => modelResponse(['0'], 'none') });
  assert.equal((await post(handler, demo, 'https://example.test')).status, 403);
  assert.equal((await post(handler, demo)).status, 200);
  assert.equal((await post(handler, demo)).status, 429);
  time += 3000;
  assert.equal((await post(handler, demo)).status, 200);
});
