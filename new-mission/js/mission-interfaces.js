(function () {
  'use strict';

  function gatewayUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search
        ? url.href : '';
    } catch { return ''; }
  }

  async function send(destination, packet, fetcher = fetch) {
    const url = gatewayUrl(destination);
    if (!url) throw new Error('Configure an HTTPS ground gateway.');
    const response = await fetcher(url, {
      method: 'POST', body: JSON.stringify(packet),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('The ground gateway did not acknowledge the packet.');
    const receipt = await response.json();
    if (receipt?.packetId !== packet.packetId || typeof receipt.receiptId !== 'string' ||
        !/^[A-Za-z0-9._-]{1,128}$/.test(receipt.receiptId)) throw new Error('The gateway returned no matching receipt.');
    return receipt.receiptId;
  }

  const metrics = {
    heartRate: ['bpm', 1, 300], spo2: ['%', 1, 100],
    systolic: ['mmHg', 1, 300], diastolic: ['mmHg', 1, 250],
    temperature: ['°C', 20, 50], glucose: ['mg/dL', 1, 1500],
    radiationDose: ['mSv', 0, 100000], cabinCo2Avg: ['mmHg', 0, 760],
    wbc: ['K/µL', 0, 1000], boneDensityPct: ['%', -100, 100]
  };

  function observation(input) {
    if (!input || !Object.hasOwn(metrics, input.metric) || input.quality !== 'usable' ||
        typeof input.deviceId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(input.deviceId) ||
        typeof input.timestamp !== 'string' || !Number.isFinite(Date.parse(input.timestamp))) return null;
    const [unit, min, max] = metrics[input.metric];
    if (input.unit !== unit || !Number.isFinite(input.value) || input.value < min || input.value > max ||
        (input.metric === 'cabinCo2Avg' && input.averagingSeconds !== 3600)) return null;
    return {
      metric: input.metric, value: input.value, unit, quality: 'usable',
      timestamp: new Date(input.timestamp).toISOString(), deviceId: input.deviceId,
      provider: 'mission-equipment',
      ...(input.metric === 'cabinCo2Avg' ? { averagingSeconds: 3600 } : {})
    };
  }

  const interfaces = { gatewayUrl, send, observation };
  if (typeof module !== 'undefined' && module.exports) module.exports = interfaces;
  else window.CC_MISSION_INTERFACES = interfaces;
}());
