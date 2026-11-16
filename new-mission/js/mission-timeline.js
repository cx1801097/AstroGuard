(function () {
  'use strict';

  function iso(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString() : null;
  }

  function build(entry, cleanDevice) {
    const loggedAt = iso(entry.at);
    const items = [];
    for (const [metric, value] of Object.entries(entry.values || {})) {
      if (!Number.isFinite(value) || metric === 'sleepTargetAtCheck') continue;
      const recheck = entry.confirm?.[metric];
      const hasRepeat = Number.isFinite(recheck?.second) && recheck.second === value && iso(recheck.at);
      const originalValue = hasRepeat ? recheck.first : value;
      const device = cleanDevice(hasRepeat ? recheck.originalWearable : entry.wearable?.[metric]);
      const sampledAt = device?.metric === metric && device.value === originalValue ? iso(device.timestamp) : null;
      const quality = hasRepeat ? recheck.originalQuality : entry.quality?.[metric];
      items.push({
        kind: 'reading', metric, value: originalValue, at: sampledAt || loggedAt,
        timeBasis: sampledAt ? 'device sample' : 'check-in logged',
        device: sampledAt ? device.deviceId || device.provider : null,
        quality: quality === 'invalid' ? 'unreliable' : null
      });
      if (hasRepeat) items.push({
        kind: 'repeat', metric, value, at: iso(recheck.at), timeBasis: 'recheck logged',
        outcome: recheck.resolved
      });
    }
    for (const symptom of entry.symptoms || []) {
      items.push({ kind: 'symptom', symptom, at: loggedAt, timeBasis: 'symptom reported' });
    }
    return items.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  }

  const timeline = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = timeline;
  else window.CC_MISSION_TIMELINE = timeline;
}());
