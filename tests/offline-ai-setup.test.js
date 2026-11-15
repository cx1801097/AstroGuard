const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const test = require('node:test');
const { model } = require('../js/local-ai');

test('preparing a complete model directory exits without making a download', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astroguard-ai-'));
  try {
    const files = {
      'ai-assets/ready.json': JSON.stringify({
        model: model.id, weights: model.weights, runtime: model.runtime, wasm: model.wasm
      }),
      'ai-assets/model/resolve/local/mlc-chat-config.json': JSON.stringify({ tokenizer_files: ['tokenizer.json'] }),
      'ai-assets/model/resolve/local/ndarray-cache.json': JSON.stringify({ records: [{ dataPath: 'params_shard_0.bin', nbytes: 3 }] }),
      'ai-assets/model/resolve/local/tokenizer.json': '{}',
      'ai-assets/model/resolve/local/params_shard_0.bin': 'abc',
      'ai-assets/web-llm.js': '// test fixture',
      'ai-assets/model.wasm': 'test fixture',
      'disable-network.js': 'globalThis.fetch = () => { throw new Error("Unexpected download"); };'
    };
    for (const [file, contents] of Object.entries(files)) {
      const location = path.join(directory, file);
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, contents);
    }
    for (const file of ['scripts/prepare-offline-ai.js', 'js/local-ai.js']) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(__dirname, '..', file), target);
    }
    const result = spawnSync(process.execPath, ['--require', './disable-network.js', 'scripts/prepare-offline-ai.js'], {
      cwd: directory, encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Using model files already on this computer/);
  } finally {
    for (const file of [
      'ai-assets/ready.json', 'ai-assets/model/resolve/local/mlc-chat-config.json',
      'ai-assets/model/resolve/local/ndarray-cache.json', 'ai-assets/model/resolve/local/tokenizer.json',
      'ai-assets/model/resolve/local/params_shard_0.bin', 'ai-assets/web-llm.js',
      'ai-assets/model.wasm', 'disable-network.js', 'scripts/prepare-offline-ai.js', 'js/local-ai.js'
    ]) fs.unlinkSync(path.join(directory, file));
    for (const folder of ['ai-assets/model/resolve/local', 'ai-assets/model/resolve', 'ai-assets/model', 'ai-assets', 'scripts', 'js']) {
      fs.rmdirSync(path.join(directory, folder));
    }
    fs.rmdirSync(directory);
  }
});
