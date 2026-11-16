/* Adapter contract: pair/reconnect/disconnect and onSample({ metric, value, unit, timestamp, provider }). */
(function () {
  'use strict';

  function parseHeartRate(packet) {
    if (!packet || packet.byteLength < 2) return null;
    const flags = packet.getUint8(0);
    // A device that reports contact must report that contact has been detected.
    if ((flags & 6) === 4) return null;
    if ((flags & 1) && packet.byteLength < 3) return null;
    const value = (flags & 1) ? packet.getUint16(1, true) : packet.getUint8(1);
    return value > 0 && value <= 300 ? value : null;
  }

  function createHeartRateAdapter(bluetooth, { onStatus, onSample }) {
    let device;
    let characteristic;
    let busy = false;
    let connected = false;

    function notify(state) {
      onStatus({ state, deviceName: device?.name || '', canReconnect: Boolean(device) && !busy });
    }

    function receive(event) {
      if (!connected || event.target !== characteristic) return;
      const value = parseHeartRate(event.target.value);
      onSample(value === null ? null : {
        metric: 'heartRate', value, unit: 'bpm', timestamp: new Date().toISOString(), provider: 'ble-hrs'
      });
    }

    function clearStream() {
      characteristic?.removeEventListener('characteristicvaluechanged', receive);
      characteristic = undefined;
      connected = false;
      onSample(null);
    }

    function onDisconnect(event) {
      if (event.target !== device) return;
      clearStream();
      if (!busy) notify('disconnected');
    }

    async function connect(pickDevice, showAll = false) {
      if (busy || connected) return;
      if (!bluetooth || typeof bluetooth.requestDevice !== 'function') {
        notify('unsupported');
        return;
      }
      busy = true;
      let stage = pickDevice ? 'choosing' : 'connecting';
      notify(stage);
      let outcome;
      try {
        if (pickDevice) {
          const selected = await bluetooth.requestDevice(showAll
            ? { acceptAllDevices: true, optionalServices: ['heart_rate'] }
            : { filters: [{ services: ['heart_rate'] }] });
          stage = 'connecting';
          device?.removeEventListener('gattserverdisconnected', onDisconnect);
          device = selected;
          device.addEventListener('gattserverdisconnected', onDisconnect);
          notify(stage);
        }
        if (!device?.gatt) throw new Error('Missing GATT device');
        const server = await device.gatt.connect();
        stage = 'service';
        const service = await server.getPrimaryService('heart_rate');
        characteristic = await service.getCharacteristic('heart_rate_measurement');
        characteristic.addEventListener('characteristicvaluechanged', receive);
        stage = 'notifications';
        await characteristic.startNotifications();
        if (!device.gatt.connected || !characteristic) throw new Error('Device disconnected during setup');
        connected = true;
        outcome = 'connected';
      } catch (error) {
        clearStream();
        if (device?.gatt?.connected) device.gatt.disconnect();
        outcome = ['SecurityError', 'NotAllowedError'].includes(error.name) ? 'permission-blocked'
          : error.name === 'NotFoundError' && stage === 'choosing' ? 'not-selected'
          : error.name === 'NotFoundError' && stage === 'service' ? 'no-heart-rate'
          : stage === 'notifications' ? 'notifications-failed' : 'failed';
      } finally {
        busy = false;
        notify(outcome);
      }
    }

    function disconnect() {
      if (busy) return;
      clearStream();
      const wasConnected = device?.gatt?.connected;
      if (wasConnected) device.gatt.disconnect();
      notify('disconnected');
    }

    return {
      pair: () => connect(true),
      browse: () => connect(true, true),
      reconnect: () => connect(false),
      disconnect
    };
  }

  const wearable = { createHeartRateAdapter, parseHeartRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = wearable;
  else window.CC_WEARABLE = wearable;
})();
