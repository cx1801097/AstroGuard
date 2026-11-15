const assert = require('node:assert/strict');
const test = require('node:test');
const { createHeartRateAdapter, parseHeartRate } = require('../js/wearable');

const packet = (...bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('Heart Rate Service decodes both widths and rejects malformed or no-contact readings', () => {
  assert.equal(parseHeartRate(packet(0, 72)), 72);
  assert.equal(parseHeartRate(packet(7, 4, 1)), 260);
  assert.equal(parseHeartRate(packet(4, 72)), null);
  assert.equal(parseHeartRate(packet(1, 72)), null);
  assert.equal(parseHeartRate(packet(0, 0)), null);
});

test('wearable adapter subscribes, clears stale samples on loss, and reconnects without a second chooser', async () => {
  const device = new EventTarget();
  const characteristic = new EventTarget();
  const states = [];
  const samples = [];
  let choices = 0;
  let subscriptions = 0;
  characteristic.startNotifications = async () => { subscriptions++; };
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    async getPrimaryService(name) {
      assert.equal(name, 'heart_rate');
      return {
        async getCharacteristic(key) {
          assert.equal(key, 'heart_rate_measurement');
          return characteristic;
        }
      };
    },
    disconnect() {
      this.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    }
  };
  const adapter = createHeartRateAdapter({
    async requestDevice(options) {
      assert.deepEqual(options, { filters: [{ services: ['heart_rate'] }] });
      choices++;
      return device;
    }
  }, {
    onStatus: status => states.push(status),
    onSample: sample => samples.push(sample)
  });

  await adapter.pair();
  assert.equal(states.at(-1).state, 'connected');
  characteristic.value = packet(0, 70);
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.equal(samples[0].value, 70);
  assert.equal(samples[0].provider, 'ble-hrs');
  assert.ok(Number.isFinite(Date.parse(samples[0].timestamp)));
  device.gatt.disconnect();
  assert.equal(samples.at(-1), null);
  assert.equal(states.at(-1).state, 'disconnected');
  assert.equal(states.at(-1).canReconnect, true);
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.equal(samples.at(-1), null);
  await adapter.reconnect();
  assert.equal(states.at(-1).state, 'connected');
  assert.equal(choices, 1);
  assert.equal(subscriptions, 2);
  adapter.disconnect();
  assert.equal(states.at(-1).state, 'disconnected');
});

test('unsupported Bluetooth and chooser cancellation never report connected', async () => {
  const states = [];
  const callbacks = { onStatus: ({ state }) => states.push(state), onSample() {} };
  await createHeartRateAdapter(undefined, callbacks).pair();
  await createHeartRateAdapter({
    async requestDevice() { throw new DOMException('Cancelled', 'NotFoundError'); }
  }, callbacks).pair();
  assert.deepEqual(states, ['unsupported', 'connecting', 'not-selected']);
});
