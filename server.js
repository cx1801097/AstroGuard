/* ============================================================
   CREW CHECK — tiny static server (optional)
   The console runs fine from file://, but a local server gives
   consistent localStorage behaviour and lets a teammate on the
   same network open the console to review a mission log.

   Usage:  node server.js [port]
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { createGeminiHandler } = require('./gemini');

const ROOT = __dirname;
const args = process.argv.slice(2);
const openBrowser = args.includes('--open');
const PORT = Number(args.find(arg => arg !== '--open') || process.env.PORT || 8080);
const handleGemini = createGeminiHandler({ apiKey: process.env.GEMINI_API_KEY });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Malformed path');
    return;
  }
  if (url === '/api/gemini-analysis') {
    handleGemini(req, res).catch(() => {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'The review request was interrupted.' }));
      }
    });
    return;
  }
  const rel = url === '/' ? '/index.html' : url;
  const file = path.join(ROOT, path.normalize(rel));

  const aiAsset = /^\/ai-assets\/(?:ready\.json|web-llm\.js|model\.wasm|model\/resolve\/local\/(?:mlc-chat-config\.json|ndarray-cache\.json|params_shard_\d+\.bin|tokenizer\.(?:json|model)))$/;
  if (aiAsset.test(rel)) {
    const stream = fs.createReadStream(file);
    stream.once('open', () => {
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      stream.pipe(res);
    });
    stream.once('error', () => {
      if (res.headersSent) res.destroy();
      else { res.writeHead(404); res.end('Offline model asset unavailable'); }
    });
    res.on('close', () => stream.destroy());
    return;
  }

  if (!/^\/(?:index\.html|css\/style\.css|js\/[a-z-]+\.js|data\/(?:sample-mission|i4-replay)\.js)$/.test(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.on('error', error => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.error('Port ' + PORT + ' is already in use. Close the previous CREW CHECK server and retry.');
  process.exitCode = 1;
});

server.listen(PORT, openBrowser ? 'localhost' : undefined, () => {
  const address = 'http://localhost:' + server.address().port + '/';
  console.log('CREW CHECK serving ' + ROOT);
  console.log('  ' + address);
  if (openBrowser && process.platform === 'win32') {
    const browserEnvironment = { ...process.env };
    delete browserEnvironment.GEMINI_API_KEY;
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', address], { windowsHide: true, env: browserEnvironment }, error => {
      if (error) console.error('Open this address in your browser: ' + address);
    });
  }
});
