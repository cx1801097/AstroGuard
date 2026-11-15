'use strict';

const { validateReview } = require('./gemini');
const MODEL = 'amazon.nova-micro-v1:0';
const PROVIDER = 'Amazon Bedrock';

function createBedrockReview(region = 'us-east-1') {
  return async function review(input, apiKey, fetcher = fetch) {
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) throw new Error('Invalid AWS Region');
    const upstream = await fetcher(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(MODEL)}/converse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(18000),
        redirect: 'error',
        body: JSON.stringify({
          system: [{ text: 'Review a simulated astronaut check-in. Sort up to three existing findings, with chest pain first, then alerts, then missing data. Choose one clarification from questions. Return a JSON object only, with priority (an array of one to three finding ID strings) and clarification (one question ID string). Do not add findings, change severity, diagnose or prescribe.' }],
          messages: [{ role: 'user', content: [{ text: JSON.stringify({
            ...input, findings: input.findings.map((finding, index) => ({ id: String(index), ...finding }))
          }) }] }],
          inferenceConfig: { maxTokens: 120, temperature: 0 }
        })
      }
    );
    if (!upstream.ok) return { upstreamStatus: upstream.status };
    const response = await upstream.json();
    const content = response.output?.message?.content;
    const answer = content?.map(block => block.text || '').join('').trim();
    const json = answer?.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? answer;
    return validateReview(input, JSON.parse(json || 'null'), MODEL, PROVIDER);
  };
}

module.exports = { createBedrockReview, PROVIDER };
