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

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

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

server.listen(PORT, () => {
  console.log('CREW CHECK serving ' + ROOT);
  console.log('  http://localhost:' + PORT);
});
