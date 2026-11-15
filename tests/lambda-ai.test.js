'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createHandler, createReservation } = require('../deployment/aws/handler');

function event(scenario) {
  return {
    rawPath: '/',
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cx1801097.github.io', 'content-type': 'application/json' },
    body: JSON.stringify(scenario)
  };
}

const sample = {
  source: 'simulated', severity: 'WARNING', name: 'private', note: 'private',
  findings: [{ kind: 'alert', metric: 'spo2', value: 90 }]
};

test('Lambda reserves one review and sends only simulated categories', async () => {
  let reserved = 0;
  const handle = createHandler({
    reserve: async () => { reserved++; return true; },
    review: async input => {
      assert.deepEqual(input, {
        severity: 'WARNING', phase: 'unspecified',
        findings: [{ kind: 'alert', metric: 'spo2' }], questions: ['none', 'ask_about_symptoms']
      });
      return { model: 'amazon.nova-micro-v1:0', priority: [0], clarification: '' };
    }
  });
  const response = await handle(event(sample));
  assert.equal(response.statusCode, 200);
  assert.equal(reserved, 1);
  assert.deepEqual(JSON.parse(response.body).priority, [0]);
});

test('invalid requests do not consume quota or call Bedrock', async () => {
  const unexpected = () => assert.fail('unexpected AWS call');
  const handle = createHandler({ reserve: unexpected, review: unexpected });
  assert.equal((await handle(event({ ...sample, source: 'measured' }))).statusCode, 400);
  assert.equal((await handle({ ...event(sample), headers: { origin: 'https://example.com' } })).statusCode, 403);
  assert.equal((await handle(event({ ...sample, note: 'x'.repeat(4100) }))).statusCode, 413);
});

test('daily quota uses a conditional DynamoDB increment and fails closed', async () => {
  class UpdateItemCommand { constructor(input) { this.input = input; } }
  const quota = createReservation({
    client: { send: async command => {
      assert.deepEqual(command.input.Key, { day: { S: '2026-11-15' } });
      assert.equal(command.input.ConditionExpression, 'attribute_not_exists(#count) OR #count < :limit');
      assert.deepEqual(command.input.ExpressionAttributeValues[':limit'], { N: '20' });
      throw Object.assign(new Error('limit reached'), { name: 'ConditionalCheckFailedException' });
    } },
    UpdateItemCommand, table: 'quota', limit: 20, now: () => Date.parse('2026-11-15T23:00:00Z')
  });
  const unexpected = () => assert.fail('unexpected Bedrock call');
  assert.equal((await createHandler({ reserve: quota, review: unexpected })(event(sample))).statusCode, 429);
  const brokenQuota = async () => { throw new Error('private AWS details'); };
  const response = await createHandler({ reserve: brokenQuota, review: unexpected })(event(sample));
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /private AWS details/);
});
