'use strict';

const { validateReview } = require('./gemini');
const MODEL = 'amazon.nova-micro-v1:0';
const PROVIDER = 'Amazon Bedrock';

function converseInput(input) {
  const ids = input.findings.map((_, index) => String(index));
  return {
    system: [{ text: 'Review a simulated astronaut check-in. Sort up to three existing findings, with chest pain first, then alerts, then missing data. Choose one clarification from questions. Return a JSON object only, with priority (an array of one to three finding ID strings) and clarification (one question ID string). Do not add findings, change severity, diagnose or prescribe.' }],
    messages: [{ role: 'user', content: [{ text: JSON.stringify({
      ...input, allowedPriorityIds: ids, maxPriorities: Math.min(ids.length, 3),
      findings: input.findings.map((finding, index) => ({ id: ids[index], ...finding }))
    }) }] }],
    inferenceConfig: { maxTokens: 120, temperature: 0 }
  };
}

function readReview(input, response) {
  const content = response.output?.message?.content;
  const answer = content?.map(block => block.text || '').join('').trim();
  const fenced = [...(answer || '').matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi)];
  const json = fenced.length === 1 ? fenced[0][1] : answer;
  const result = JSON.parse(json || 'null');
  if (Array.isArray(result?.priority)) {
    const ids = input.findings.map((_, index) => String(index));
    result.priority = [...new Set(result.priority.filter(id => ids.includes(id)))].slice(0, 3);
  }
  if (result && typeof result === "object" && !input.questions.includes(result.clarification)) {
    result.clarification = "none";
  }
  return validateReview(input, result, MODEL, PROVIDER);
}

function createIamBedrockReview(region, { BedrockRuntimeClient, ConverseCommand }) {
  const client = new BedrockRuntimeClient({ region, maxAttempts: 1, authSchemePreference: ['sigv4'] });
  return async function review(input) {
    let response;
    try {
      response = await client.send(new ConverseCommand({ modelId: MODEL, ...converseInput(input) }), {
        abortSignal: AbortSignal.timeout(18000)
      });
    } catch (error) {
      if (error.name === 'CredentialsProviderError' || error.name === 'ExpiredTokenException') {
        return { upstreamStatus: 503, upstreamMessage: 'AWS credentials are unavailable or expired. Sign in to your AWS profile or check the role attached to this server.' };
      }
      const upstreamStatus = error.$metadata?.httpStatusCode;
      if (upstreamStatus === 403) {
        return { upstreamStatus, upstreamMessage: 'AWS denied IAM access in ' + region + '. Check bedrock:InvokeModel permission for Amazon Nova Micro.' };
      }
      if (upstreamStatus) return { upstreamStatus };
      throw error;
    }
    return readReview(input, response);
  };
}

async function accessDeniedMessage(response, region) {
  const error = await response.json().catch(() => null);
  const details = String(error?.message ?? error?.Message ?? '');
  const reason = response.headers.get('x-amzn-errortype') ?? '';
  const context = 'Amazon Bedrock denied access (403, ' + region + '). ';
  if (/scoped to a valid region|region.*(?:mismatch|does not match)/i.test(details)) {
    return context + 'Use the AWS Region where your Bedrock API key was generated.';
  }
  if (/ExpiredToken/i.test(reason) || /(?:key|token).*expired|expired.*(?:key|token)/i.test(details)) {
    return context + 'The key expired. Generate a new Bedrock API key and restart the launcher.';
  }
  if (/InvalidSignature|UnrecognizedClient|InvalidClientToken/i.test(reason) ||
      /invalid (?:api key|bearer token|security token)/i.test(details)) {
    return context + 'Check that you pasted a valid Amazon Bedrock API key.';
  }
  return context + 'Check the key’s Region and expiry, and verify that its IAM identity can run bedrock:InvokeModel for Amazon Nova Micro.';
}

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
        body: JSON.stringify(converseInput(input))
      }
    );
    if (upstream.status === 403) {
      return { upstreamStatus: 403, upstreamMessage: await accessDeniedMessage(upstream, region) };
    }
    if (!upstream.ok) return { upstreamStatus: upstream.status };
    return readReview(input, await upstream.json());
  };
}

module.exports = { createBedrockReview, createIamBedrockReview, PROVIDER };
