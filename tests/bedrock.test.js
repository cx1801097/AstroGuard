'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scenario } = require('../gemini');
const { createBedrockReview } = require('../bedrock');

const input = scenario({
  source: 'simulated',
  severity: 'CRITICAL',
  findings: [{ kind: 'alert', metric: 'spo2', value: 80 }, { kind: 'chest_pain' }],
  note: 'private'
});

test('Bedrock receives only coded findings and preserves chest pain priority', async () => {
  const result = await createBedrockReview()(input, 'test-token', async (url, options) => {
    assert.equal(url, 'https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.nova-micro-v1%3A0/converse');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    const request = JSON.parse(options.body);
    assert.deepEqual(request.inferenceConfig, { maxTokens: 120, temperature: 0 });
    assert.deepEqual(JSON.parse(request.messages[0].content[0].text), {
      severity: 'CRITICAL', phase: 'unspecified',
      findings: [{ id: '0', kind: 'alert', metric: 'spo2' }, { id: '1', kind: 'chest_pain' }],
      questions: ['none']
    });
    return { ok: true, json: async () => ({
      output: { message: { content: [{ text: '{"priority":["0"],"clarification":"none"}' }] } }
    }) };
  });
  assert.deepEqual(result, { model: 'amazon.nova-micro-v1:0', priority: [1, 0], clarification: '' });
});

test('Bedrock rejects invented findings', async () => {
  const review = createBedrockReview();
  await assert.rejects(review(input, 'test-token', async () => ({
    ok: true, json: async () => ({
      output: { message: { content: [{ text: '{"priority":["9"],"clarification":"none"}' }] } }
    })
  })), /Invalid Amazon Bedrock response/);
});

test('Bedrock explains a key Region mismatch without exposing upstream details', async () => {
  const response = new Response(JSON.stringify({
    message: 'Credential should be scoped to a valid region. Private upstream details.'
  }), { status: 403 });
  const result = await createBedrockReview()(input, 'test-token', async () => response);
  assert.equal(result.upstreamStatus, 403);
  assert.match(result.upstreamMessage, /us-east-1.*Region where your Bedrock API key was generated/);
  assert.doesNotMatch(result.upstreamMessage, /Private upstream details/);
});
