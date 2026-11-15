'use strict';

// Only enumerated scenario facts can leave the app. No free text or raw measurements.
const MODEL = 'gemini-2.5-flash-lite';
const kinds = new Set(['chest_pain', 'alert', 'baseline_change', 'missing', 'activity_unknown', 'exercise', 'no_alert']);
const metrics = new Set(['spo2', 'heartRate']);
const clarifications = {
  verify_activity: 'Confirm whether the crew member was resting or exercising when the sample was taken.',
  verify_sensor: 'Check whether a missing or unusual reading can be verified with the available sensor.',
  ask_about_symptoms: 'Ask the crew member how they feel and share any symptoms with the crew medical officer.',
  none: ''
};

function scenario(body) {
  if (body?.source !== 'simulated' || !['NORMAL', 'WARNING', 'CRITICAL', 'UNKNOWN'].includes(body.severity) ||
      !Array.isArray(body.findings) || body.findings.length < 1 || body.findings.length > 6) return null;
  const findings = [];
  for (const entry of body.findings) {
    if (!entry || !kinds.has(entry.kind)) return null;
    const needsMetric = ['alert', 'baseline_change', 'missing'].includes(entry.kind);
    if (needsMetric && !metrics.has(entry.metric)) return null;
    findings.push(needsMetric ? { kind: entry.kind, metric: entry.metric } : { kind: entry.kind });
  }
  const phase = ['Preflight', 'Ascent', 'In orbit', 'Transit', 'Surface operations', 'Reentry', 'Recovery'].includes(body.phase)
    ? body.phase : 'unspecified';
  const questions = body.severity === 'CRITICAL' ? ['none'] : ['none', 'ask_about_symptoms'];
  if (body.severity !== 'CRITICAL' && findings.some(item => item.kind === 'activity_unknown')) questions.push('verify_activity');
  const checkable = findings.some(item => item.metric === 'spo2' ? body.pulseOximeter === true :
    item.metric === 'heartRate' && body.heartRateMonitor === true);
  if (body.severity !== 'CRITICAL' && checkable) questions.push('verify_sensor');
  return { severity: body.severity, phase, findings, questions };
}

async function analyzeScenario(input, apiKey, fetcher = fetch) {
  const ids = input.findings.map((_, index) => String(index));
  const upstream = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(18000),
    redirect: 'error',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Review a synthetic astronaut check-in. Rank up to three existing findings for a crew handoff, prioritizing chest pain and alerts, then missing data. Choose one allowed clarification. Do not change severity, diagnose, prescribe, or add findings.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({
        ...input, findings: input.findings.map((entry, index) => ({ id: ids[index], ...entry }))
      }) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 120,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object', additionalProperties: false,
          properties: {
            priority: { type: 'array', items: { type: 'string', enum: ids }, minItems: 1, maxItems: Math.min(3, ids.length) },
            clarification: { type: 'string', enum: input.questions }
          },
          required: ['priority', 'clarification']
        }
      }
    })
  });
  if (!upstream.ok) return { upstreamStatus: upstream.status };
  const answer = await upstream.json();
  const text = answer.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
  const result = JSON.parse(text || 'null');
  return validateReview(input, result, MODEL, 'Gemini');
}

function validateReview(input, result, model, provider) {
  const ids = input.findings.map((_, index) => String(index));
  if (!result || !Array.isArray(result.priority) || result.priority.length < 1 || result.priority.length > 3 ||
      new Set(result.priority).size !== result.priority.length || result.priority.some(id => !ids.includes(id)) ||
      !input.questions.includes(result.clarification)) throw new Error('Invalid ' + provider + ' response');
  const priority = result.priority.map(Number);
  const chestPain = input.findings.findIndex(item => item.kind === 'chest_pain');
  if (chestPain >= 0) {
    return { model, priority: [chestPain, ...priority.filter(index => index !== chestPain)].slice(0, 3), clarification: '' };
  }
  return { model, priority, clarification: clarifications[result.clarification] };
}

function createGeminiHandler({ apiKey, fetcher, now = Date.now, review = analyzeScenario, provider = 'Gemini', enabled = Boolean(apiKey) } = {}) {
  let calls = [];
  let running = false;
  return async function handleGemini(req, res) {
    function reply(status, payload) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
    }
    const local = ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const host = req.headers.host || '';
    if (!local || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
        req.headers.origin !== 'http://' + host) {
      return reply(403, { error: 'Cloud review is available only from this computer’s CREW CHECK server.' });
    }
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (!enabled) return reply(503, { error: 'Start CREW CHECK with a Bedrock or Gemini launcher to enable cloud AI.' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'Expected JSON.' });
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) return reply(413, { error: 'Scenario is too large.' });
      chunks.push(chunk);
    }
    let input;
    try { input = scenario(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch {}
    if (!input) return reply(400, { error: 'Cloud review accepts only simulated scenario categories.' });
    const time = now();
    calls = calls.filter(previous => time - previous < 60 * 60 * 1000);
    if (running || calls.length >= 20 || (calls.length && time - calls.at(-1) < 3000)) {
      return reply(429, { error: 'Cloud review is busy or has reached the local limit of 20 requests per hour.' });
    }
    running = true;
    calls.push(time);
    try {
      const result = await review(input, apiKey, fetcher);
      if (result.upstreamStatus) {
        const status = result.upstreamStatus;
        return reply(status === 429 ? 429 : 502, { error: result.upstreamMessage ||
          (status === 429 ? provider + ' quota is currently unavailable.' :
            provider + ' rejected the request (HTTP ' + status + '). Check the API key and model access.') });
      }
      return reply(200, result);
    } catch {
      return reply(502, { error: provider + ' could not return a valid review. The crew guidance above is still available.' });
    } finally {
      running = false;
    }
  };
}

module.exports = { MODEL, createGeminiHandler, scenario, analyzeScenario, validateReview };
