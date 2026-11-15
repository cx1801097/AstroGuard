/* Run before disconnecting. Downloads the same pinned browser model into ai-assets/. */
const fs = require('node:fs');
const { mkdir, readFile, rename, unlink } = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { model } = require('../js/local-ai');

const root = path.join(__dirname, '..', 'ai-assets');
const weights = path.join(root, 'model', 'resolve', 'local');

async function download(url, destination, expectedBytes) {
  if (expectedBytes && fs.existsSync(destination) && fs.statSync(destination).size === expectedBytes) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error('Download failed (' + response.status + '): ' + url);
  const temp = destination + '.partial';
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));
    if (expectedBytes && fs.statSync(temp).size !== expectedBytes) {
      throw new Error('Weight shard length mismatch: ' + destination);
    }
    await rename(temp, destination);
  } finally {
    await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function prepare() {
  await mkdir(weights, { recursive: true });
  const configName = 'mlc-chat-config.json';
  const manifestName = 'ndarray-cache.json';
  for (const file of [configName, manifestName]) {
    await download(new URL(file, model.weights), path.join(weights, file));
  }
  const config = JSON.parse(await readFile(path.join(weights, configName), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(weights, manifestName), 'utf8'));
  if (!config.tokenizer_files?.length || !manifest.records?.length) {
    throw new Error('The model has no tokenizer or weight manifest.');
  }
  const tokenizer = ['tokenizer.json', 'tokenizer.model'].find(file => config.tokenizer_files.includes(file));
  if (!tokenizer) throw new Error('No supported tokenizer file in the model config.');
  await download(new URL(tokenizer, model.weights), path.join(weights, tokenizer));
  await download(model.runtime, path.join(root, 'web-llm.js'));
  await download(model.wasm, path.join(root, 'model.wasm'));
  for (const [index, shard] of manifest.records.entries()) {
    if (!/^params_shard_\d+\.bin$/.test(shard.dataPath) || !Number.isSafeInteger(shard.nbytes) || shard.nbytes <= 0) {
      throw new Error('Unexpected weight shard in the manifest.');
    }
    console.log('Weight shard ' + (index + 1) + '/' + manifest.records.length);
    await download(new URL(shard.dataPath, model.weights), path.join(weights, shard.dataPath), shard.nbytes);
  }
  console.log('Offline assets ready. Start node server.js and open http://localhost:8080.');
}

prepare().catch(error => {
  console.error(error.cause?.message || error.message);
  process.exitCode = 1;
});
