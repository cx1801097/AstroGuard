/* Run before disconnecting. Downloads the same pinned browser model into ai-assets/. */
const fs = require('node:fs');
const { mkdir, readFile, rename, unlink, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: delay } = require('node:timers/promises');
const { model } = require('../js/local-ai');

const root = path.join(__dirname, '..', 'ai-assets');
const weights = path.join(root, 'model', 'resolve', 'local');

async function downloadOnce(url, destination, expectedBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!response.ok || !response.body) {
    const error = new Error('Download failed (' + response.status + '): ' + url);
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
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

function completeFile(file, size) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return Boolean(stat?.isFile() && (size ? stat.size === size : stat.size > 0));
}

async function download(url, destination, expectedBytes) {
  if (expectedBytes && completeFile(destination, expectedBytes)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await downloadOnce(url, destination, expectedBytes);
      return;
    } catch (error) {
      if (attempt === 3 || error.retryable === false || ['EACCES', 'EPERM', 'ENOSPC'].includes(error.code)) throw error;
      console.log('Retrying ' + path.basename(destination) + ' after a failed download (' + attempt + '/2).');
      await delay(attempt * 2000);
    }
  }
}

async function alreadyPrepared(ready) {
  try {
    const marker = JSON.parse(await readFile(ready, 'utf8'));
    const config = JSON.parse(await readFile(path.join(weights, 'mlc-chat-config.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(weights, 'ndarray-cache.json'), 'utf8'));
    const tokenizer = ['tokenizer.json', 'tokenizer.model'].find(file => config.tokenizer_files.includes(file));
    return marker.model === model.id && marker.weights === model.weights &&
      marker.runtime === model.runtime && marker.wasm === model.wasm && tokenizer &&
      completeFile(path.join(weights, tokenizer)) &&
      completeFile(path.join(root, 'web-llm.js')) && completeFile(path.join(root, 'model.wasm')) &&
      manifest.records.length > 0 && manifest.records.every(shard =>
        /^params_shard_\d+\.bin$/.test(shard.dataPath) && Number.isSafeInteger(shard.nbytes) &&
        shard.nbytes > 0 && completeFile(path.join(weights, shard.dataPath), shard.nbytes)
      );
  } catch {
    return false;
  }
}

async function prepare() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or later is required.');
  await mkdir(weights, { recursive: true });
  const ready = path.join(root, 'ready.json');
  if (await alreadyPrepared(ready)) {
    console.log('Offline assets ready. Using model files already on this computer.');
    return;
  }
  await unlink(ready).catch(error => { if (error.code !== 'ENOENT') throw error; });
  console.log('Downloading Qwen3 for offline use. The model is about 2.3 GB.');
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
  await writeFile(ready, JSON.stringify({ model: model.id, weights: model.weights, runtime: model.runtime, wasm: model.wasm }));
  console.log('Offline assets ready. Start node server.js and open http://localhost:8080.');
}

if (require.main === module) {
  prepare().catch(error => {
    console.error(error.cause?.message || error.message);
    process.exitCode = 1;
  });
}
