/* WebGPU work runs off the UI thread. The model returns a finding number only. */
let engine;

self.onmessage = async ({ data }) => {
  try {
    if (!engine) {
      const runtime = await import(data.assets.runtime);
      const model = runtime.prebuiltAppConfig.model_list.find(entry => entry.model_id === data.modelId);
      if (!model) throw new Error('Model configuration unavailable');
      engine = await runtime.CreateMLCEngine(data.modelId, {
        appConfig: { model_list: [{ ...model, model: data.assets.weights, model_lib: data.assets.wasm }] },
        initProgressCallback: report => self.postMessage({ progress: report.progress }),
        logLevel: 'ERROR'
      });
    }
    self.postMessage({ running: true });
    const result = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'Select the most important existing observation for crew attention. Give reported chest pain first priority, followed by alert readings and then missing readings. Reply with its number only. /no_think' },
        { role: 'user', content: data.observations.map((line, index) => (index + 1) + '. ' + line).join('\n') + '\n/no_think' }
      ],
      temperature: 0,
      max_tokens: 24
    });
    self.postMessage({ answer: result.choices[0]?.message?.content });
  } catch {
    self.postMessage({ failed: true });
  }
};
