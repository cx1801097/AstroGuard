(function () {
  'use strict';

  const model = Object.freeze({
    id: 'Qwen3-4B-q4f32_1-MLC',
    runtime: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.88/lib/index.js',
    weights: 'https://huggingface.co/mlc-ai/Qwen3-4B-q4f32_1-MLC/resolve/b7e4eb1/',
    wasm: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/Qwen3-4B-q4f32_1_cs1k-webgpu.wasm'
  });

  function selectFocus(output, observations) {
    if (typeof output !== 'string' || !/^\s*[1-9]\d?\s*$/.test(output)) return null;
    return observations[Number(output.trim()) - 1] || null;
  }

  function weightManifestAlias(requestUrl, weightsUrl) {
    // WebLLM 0.2.88 requests tensor-cache.json, while this Qwen3 export
    // publishes the same shard manifest under the older name.
    const requested = new URL('tensor-cache.json', weightsUrl).href;
    return requestUrl === requested ? new URL('ndarray-cache.json', weightsUrl).href : null;
  }

  function modelAssets(pageUrl) {
    const page = new URL(pageUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
    if (local && (page.protocol === 'http:' || page.protocol === 'https:')) {
      const assets = new URL('./ai-assets/', page);
      return {
        runtime: new URL('web-llm.js', assets).href,
        // WebLLM appends resolve/main/ to model URLs without an explicit revision path.
        weights: new URL('model/resolve/local/', assets).href,
        wasm: new URL('model.wasm', assets).href,
        ready: new URL('ready.json', assets).href
      };
    }
    return page.protocol === 'https:' ? model : null;
  }

  const localAI = { model, modelAssets, selectFocus, weightManifestAlias };
  if (typeof module !== 'undefined' && module.exports) module.exports = localAI;
  else globalThis.CC_LOCAL_AI = localAI;
})();
