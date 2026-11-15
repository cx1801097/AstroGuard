/* Timestamped wearable file adapters. All parsing stays on the user's device. */
(function () {
  'use strict';

  const units = { heartRate: 'bpm', spo2: '%' };
  const maxima = { heartRate: 300, spo2: 100 };
  const providers = ['ble-hrs', 'apple-health', 'tcx', 'csv', 'json'];

  function sample(metric, value, timestamp, provider) {
    if (!Object.hasOwn(units, metric) || !Number.isFinite(value) || value < 1 || value > maxima[metric]) return null;
    if (typeof timestamp !== 'string') return null;
    const date = timestamp.trim().replace(/^(\d{4}-\d\d-\d\d) /, '$1T').replace(/ ([+-]\d{4})$/, '$1');
    if (!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)) return null;
    const calendar = new Date(date.slice(0, 10));
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date.slice(0, 10)) return null;
    const time = Date.parse(date);
    if (!Number.isFinite(time)) return null;
    return { metric, value, unit: units[metric], timestamp: new Date(time).toISOString(), provider };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const cells = line => line.split(',').map(cell => cell.trim().replace(/^"([^"]*)"$/, '$1'));
    const headers = cells(lines.shift());
    const timestamp = headers.indexOf('timestamp');
    const metrics = Object.keys(units).filter(metric => headers.includes(metric));
    if (timestamp < 0 || !metrics.length || new Set(headers).size !== headers.length) {
      throw new Error('Use a CSV with timestamp and heartRate or spo2 columns.');
    }
    return lines.flatMap(line => {
      if (!line.trim()) return [];
      const row = cells(line);
      if (row.length !== headers.length) throw new Error('A CSV row does not match its header.');
      return metrics.map(metric => sample(metric, Number(row[headers.indexOf(metric)]), row[timestamp], 'csv'));
    });
  }

  function parseJson(text) {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error('Use a ASTROGUARD readings JSON export.');
    return rows.map(row => row && Object.hasOwn(units, row.metric) && row.unit === units[row.metric]
      ? sample(row.metric, row.value, row.timestamp, providers.includes(row.provider) ? row.provider : 'json')
      : null);
  }

  function parseXml(text, parseDocument) {
    if (/<!ENTITY\b/i.test(text) || /<!DOCTYPE\s+[\w:]+\s+(?:SYSTEM|PUBLIC)\b/i.test(text)) {
      throw new Error('XML with custom entities or external definitions is unsupported.');
    }
    const document = parseDocument(text);
    if (document.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('The XML file is malformed.');
    const nodes = name => Array.from(document.getElementsByTagNameNS('*', name));
    if (document.documentElement?.localName === 'HealthData') {
      return nodes('Record').flatMap(record => {
        const type = record.getAttribute('type');
        const unit = record.getAttribute('unit');
        const value = Number(record.getAttribute('value'));
        const timestamp = record.getAttribute('startDate');
        if (type === 'HKQuantityTypeIdentifierHeartRate') {
          return [unit === 'count/min' ? sample('heartRate', value, timestamp, 'apple-health') : null];
        }
        if (type === 'HKQuantityTypeIdentifierOxygenSaturation') {
          return [unit === '%' && value <= 1 ? sample('spo2', value * 100, timestamp, 'apple-health') : null];
        }
        return [];
      });
    }
    if (document.documentElement?.localName === 'TrainingCenterDatabase') {
      const child = (node, name) => node && Array.from(node.children).find(element => element.localName === name);
      return nodes('Trackpoint').flatMap(point => {
        const heartRate = child(point, 'HeartRateBpm');
        return heartRate
          ? [sample('heartRate', Number(child(heartRate, 'Value')?.textContent), child(point, 'Time')?.textContent, 'tcx')]
          : [];
      });
    }
    throw new Error('Use Apple Health export.xml or a TCX activity file.');
  }

  function parse(text, filename, parseDocument = input => new DOMParser().parseFromString(input, 'application/xml')) {
    const extension = filename.toLowerCase().split('.').at(-1);
    const parsers = { csv: parseCsv, json: parseJson, xml: parseXml, tcx: parseXml };
    if (!Object.hasOwn(parsers, extension)) throw new Error('Choose an XML, TCX, CSV or JSON file.');
    const rows = parsers[extension](text.replace(/^\uFEFF/, ''), parseDocument);
    return { records: rows.filter(Boolean), skipped: rows.filter(row => !row).length };
  }

  function merge(existing, incoming, limit) {
    const key = entry => JSON.stringify([entry.metric, entry.timestamp, entry.value, entry.provider]);
    const seen = new Set(existing.map(key));
    const additions = incoming.filter(entry => {
      const id = key(entry);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const room = Math.max(0, limit - existing.length);
    return {
      records: [...existing, ...additions.slice(0, room)],
      added: Math.min(room, additions.length),
      duplicates: incoming.length - additions.length,
      overflow: Math.max(0, additions.length - room)
    };
  }

  const wearableFiles = { parse, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = wearableFiles;
  else window.CC_WEARABLE_FILES = wearableFiles;
})();
