/* WebGPU work runs off the UI thread. The model returns a finding number only. */
import './local-ai.js';

let engine;

self.onmessage = async ({ data }) => {
  let stage = 'loading the runtime';
  try {
    if (!engine) {
      const nativeFetch = self.fetch.bind(self);
      self.fetch = (input, options) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const alias = self.CC_LOCAL_AI.weightManifestAlias(requestUrl, data.assets.weights);
        const request = alias && input instanceof Request ? new Request(alias, input) : alias || input;
        return nativeFetch(request, options);
      };
      const runtime = await import(data.assets.runtime);
      stage = 'loading the model';
      const model = runtime.prebuiltAppConfig.model_list.find(entry => entry.model_id === data.modelId);
      if (!model) throw new Error('Model configuration unavailable');
      engine = await runtime.CreateMLCEngine(data.modelId, {
        appConfig: { model_list: [{ ...model, model: data.assets.weights, model_lib: data.assets.wasm }] },
        initProgressCallback: report => self.postMessage({ progress: report.progress }),
        logLevel: 'ERROR'
      });
    }
    self.postMessage({ running: true });
    stage = 'reviewing the findings';
    const result = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'Select the most important existing observation for crew attention. Give reported chest pain first priority, followed by alert readings and then missing readings. Reply with its number only. /no_think' },
        { role: 'user', content: data.observations.map((line, index) => (index + 1) + '. ' + line).join('\n') + '\n/no_think' }
      ],
      temperature: 0,
      max_tokens: 24
    });
    self.postMessage({ answer: result.choices[0]?.message?.content });
  } catch (error) {
    self.postMessage({ failed: true, stage, detail: String(error?.message || error).slice(0, 280) });
  }
};
