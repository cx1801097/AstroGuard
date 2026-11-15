(function () {
  'use strict';

  const model = Object.freeze({
    id: 'Qwen3-4B-q4f32_1-MLC',
    runtime: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.88/lib/index.js',
    weights: 'https://huggingface.co/mlc-ai/Qwen3-4B-q4f32_1-MLC/resolve/b7e4eb1/',
    wasm: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/Qwen3-4B-q4f32_1_cs1k-webgpu.wasm'
  });

  function selectFocus(output, observations) {
    if (typeof output !== 'string') return null;
    // WebLLM's no-thinking mode may return an empty Qwen3 thinking prefix.
    const choice = output.replace(/^\s*<think>\s*<\/think>\s*/, '').trim();
    if (!/^[1-9]\d?$/.test(choice)) return null;
    return observations[Number(choice) - 1] || null;
  }

  async function prepareWeightManifest(weightsUrl, cacheStorage, fetchAsset) {
    // Cache.add issues its own request. Seed the exact cache key that
    // WebLLM 0.2.88 will read, using this model's older manifest filename.
    const cache = await cacheStorage.open('webllm/model');
    const key = new URL('tensor-cache.json', weightsUrl).href;
    if (await cache.match(key)) return;
    const legacyUrl = new URL('ndarray-cache.json', weightsUrl);
    const response = await fetchAsset(legacyUrl);
    if (!response.ok) throw new Error('Could not read the Qwen3 weight manifest (HTTP ' + response.status + ').');
    await cache.put(key, response);
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

  const localAI = { model, modelAssets, selectFocus, prepareWeightManifest };
  if (typeof module !== 'undefined' && module.exports) module.exports = localAI;
  else globalThis.CC_LOCAL_AI = localAI;
})();
