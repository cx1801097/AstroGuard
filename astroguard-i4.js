'use strict';

const { localRequest } = require('./astroguard-evidence');
const datasets = new Map([
  ['cabin', ['i4-digitized', 'i4-digitized', 'digitized']],
  ['labs', ['osd-569', 'osd-575', 'original']],
  ['comparisons', ['i4-aggregate', 'i4-aggregate', 'aggregate']]
]);

function createI4Handler(databasePath) {
  let database;
  let query;
  const cache = new Map();
  return function (req, res) {
    function reply(status, body) {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'same-origin'
      });
      res.end(JSON.stringify(body));
    }
    if (!localRequest(req)) return reply(403, { error: 'I4 records are available in the local app.' });
    if (req.method !== 'GET') return reply(405, { error: 'Use GET.' });
    const category = new URLSearchParams(req.url.split('?')[1]).get('category');
    if (!datasets.has(category)) return reply(400, { error: 'Unknown I4 collection.' });
    try {
      if (!query) {
        const { DatabaseSync } = require('node:sqlite');
        database ??= new DatabaseSync(databasePath, { readOnly: true });
        query = database.prepare(`
          SELECT x.dataset_id AS dataset, x.metric, x.unit, x.value, x.quality, x.scope,
                 x.relative_time AS time, x.time_ref AS timeRef,
                 COALESCE(crew.code, CASE WHEN x.data_type = 'aggregate' AND x.record_group GLOB 'i4:C[0-9][0-9][0-9]'
                   THEN substr(x.record_group, 4) END) AS crew, x.source_locator AS locator,
                 CASE WHEN x.data_type = 'aggregate' AND json_valid(x.context_json)
                      THEN json_extract(x.context_json, '$.source_comparison') END AS comparison
          FROM measurements x
          JOIN datasets d ON d.id = x.dataset_id AND d.role = 'history'
          JOIN mission m ON m.id = d.mission_id AND m.name = 'Inspiration4'
          JOIN sources s ON s.id = d.source_id AND s.access = 'public'
          LEFT JOIN crew ON crew.id = x.crew_id
          WHERE x.dataset_id IN (?, ?) AND x.data_type = ?
          ORDER BY x.time_ref, x.relative_time, crew.code, x.metric, x.id
        `);
      }
      if (!cache.has(category)) cache.set(category, query.all(...datasets.get(category)));
      return reply(200, { records: cache.get(category) });
    } catch {
      return reply(503, { error: 'The local AstroGuard database could not be opened.' });
    }
  };
}

module.exports = { createI4Handler };
