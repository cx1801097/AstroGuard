(function () {
  'use strict';

  function timestamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString() : null;
  }

  function normalizeRecheck(record) {
    if (!record || !Number.isFinite(record.first) || !timestamp(record.at)) return null;
    const resolved = record.resolved === 'artefact' ? 'below_threshold' : record.resolved;
    if (resolved !== 'unverified' &&
        (!['confirmed', 'below_threshold'].includes(resolved) || !Number.isFinite(record.second))) return null;
    const source = ['measured', 'simulated', 'digitized'].includes(record.source) ? record.source : 'unknown';
    return {
      first: record.first, second: resolved === 'unverified' ? null : record.second,
      at: timestamp(record.at), firstAt: timestamp(record.firstAt || record.originalWearable?.timestamp), resolved, source,
      originalQuality: record.originalQuality === 'invalid' ? 'invalid' : 'unspecified',
      originalWearable: record.originalWearable && typeof record.originalWearable === 'object'
        ? record.originalWearable : null
    };
  }

  function normalizeRechecks(records) {
    return Object.fromEntries(Object.entries(records || {}).flatMap(([id, record]) => {
      const clean = normalizeRecheck(record);
      return /^[A-Za-z][A-Za-z0-9]*$/.test(id) && !['constructor', 'prototype'].includes(id) && clean ? [[id, clean]] : [];
    }));
  }

  const api = { normalizeRecheck, normalizeRechecks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CC_FOLLOW_UP = api;
}());
