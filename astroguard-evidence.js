'use strict';

const monitoring = {
  requirement: 'V1 3003', page: 18,
  guidance: 'Continue mission-scheduled checks of physical and psychosocial well-being.'
};
const medical = {
  requirement: 'V1 3004', page: 20,
  guidance: 'Use the mission’s onboard medical capabilities and follow its approved care procedures.'
};
const privateChannel = {
  requirement: 'V1 6003', page: 51,
  guidance: 'Use the mission’s private medical channel if communicating health information with the ground.'
};
const records = {
  requirement: 'V1 7003', page: 54,
  guidance: 'Record which observations are available and keep crew health records in the mission’s secure record system.'
};
const references = new Map([
  ['NORMAL', [monitoring]],
  ['WARNING', [medical, privateChannel]],
  ['CRITICAL', [medical, privateChannel]],
  ['UNKNOWN', [monitoring, records]]
]);

function localRequest(req) {
  const { host, origin, 'sec-fetch-site': fetchSite } = req.headers;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host || '') &&
    (!origin || origin === 'http://' + host) && (!fetchSite || fetchSite === 'same-origin');
}

function createEvidenceHandler(databasePath) {
  let database;
  let lookup;
  const cache = new Map();

  return function handle(req, res) {
    function reply(status, body) {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'same-origin'
      });
      res.end(JSON.stringify(body));
    }
    if (!localRequest(req)) {
      return reply(403, { error: 'Evidence is available from the local CREW CHECK app.' });
    }
    if (req.method !== 'GET') return reply(405, { error: 'Use GET.' });
    const severity = new URLSearchParams(req.url.split('?')[1]).get('severity');
    if (!references.has(severity)) return reply(400, { error: 'Unknown check status.' });

    try {
      if (!lookup) {
        const { DatabaseSync } = require('node:sqlite');
        database ??= new DatabaseSync(databasePath, { readOnly: true });
        lookup = database.prepare(`
          SELECT s.title, s.url, d.version, c.page, c.locator
          FROM chunks c
          JOIN documents d ON d.id = c.document_id
          JOIN sources s ON s.id = d.source_id
          WHERE s.id = 'std-v1' AND s.access = 'public' AND s.kind = 'standard' AND d.version = 'Rev C'
            AND c.kind = 'text' AND c.page = ? AND instr(c.text, ?) > 0
          ORDER BY d.id, c.id LIMIT 1
        `);
      }
      if (!cache.has(severity)) {
        const evidence = references.get(severity).flatMap(({ requirement, page, guidance }) => {
          const row = lookup.get(page, '[' + requirement + ']');
          return row ? [{ requirement, guidance, ...row }] : [];
        });
        cache.set(severity, evidence);
      }
      return reply(200, { evidence: cache.get(severity) });
    } catch {
      return reply(503, { error: 'AstroGuard evidence is unavailable. Start the local app with Node.js 24 and the installed database.' });
    }
  };
}

module.exports = { createEvidenceHandler, localRequest };
