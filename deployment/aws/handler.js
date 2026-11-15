'use strict';

const { scenario } = require('../../gemini');
const { createIamBedrockReview } = require('../../bedrock');

const ORIGIN = 'https://cx1801097.github.io';

function reply(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body) };
}

function createHandler({ reserve, review }) {
  return async function handle(event) {
    if (event.rawPath !== '/') return reply(404, { error: 'Not found.' });
    if (event.requestContext?.http?.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (event.headers?.origin !== ORIGIN) return reply(403, { error: 'Use the ASTROGUARD demo to request a review.' });
    if (!/^application\/json(?:\s*;|$)/i.test(event.headers['content-type'] || '')) {
      return reply(415, { error: 'Expected JSON.' });
    }
    const body = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (body.length > 4096) return reply(413, { error: 'Scenario is too large.' });
    let input;
    try { input = scenario(JSON.parse(body.toString('utf8'))); } catch {}
    if (!input) return reply(400, { error: 'AI review accepts only simulated finding categories.' });

    try {
      if (!await reserve()) return reply(429, { error: 'The daily demo AI limit has been reached. Try again after midnight UTC.' });
      const result = await review(input);
      if (result.upstreamStatus) {
        return reply(result.upstreamStatus === 429 ? 429 : 502, { error: 'Bedrock is unavailable. Use the crew guidance above.' });
      }
      return reply(200, result);
    } catch {
      return reply(503, { error: 'AI review is temporarily unavailable. Use the crew guidance above.' });
    }
  };
}

function createReservation({ client, UpdateItemCommand, table, limit, now = Date.now }) {
  if (!table || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid AI quota configuration');
  return async function reserve() {
    const timestamp = now();
    const day = new Date(timestamp).toISOString().slice(0, 10);
    try {
      await client.send(new UpdateItemCommand({
        TableName: table,
        Key: { day: { S: day } },
        UpdateExpression: 'SET expiresAt = if_not_exists(expiresAt, :expiry) ADD #count :one',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: {
          ':expiry': { N: String(Math.floor(timestamp / 1000) + 2 * 86400) },
          ':one': { N: '1' },
          ':limit': { N: String(limit) }
        }
      }), { abortSignal: AbortSignal.timeout(2500) });
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  };
}

let configuredHandler;
exports.handler = async function (event) {
  if (!configuredHandler) {
    const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
    configuredHandler = createHandler({
      reserve: createReservation({
        client: new DynamoDBClient({ maxAttempts: 1 }),
        UpdateItemCommand,
        table: process.env.QUOTA_TABLE,
        limit: Number(process.env.DAILY_LIMIT)
      }),
      review: createIamBedrockReview(process.env.AWS_REGION, require('@aws-sdk/client-bedrock-runtime'))
    });
  }
  return configuredHandler(event);
};

exports.createHandler = createHandler;
exports.createReservation = createReservation;
