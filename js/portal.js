(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const recordingKey = 'crewcheck.wearable.heart-rate.v1';
  const maxReadings = 5000;
  const freshnessMs = 15000;
  const milestones = [
    'Falcon 9 lifted off from Kennedy Space Center at 10:02 p.m. EDT.',
    'Dragon continued its flight in low Earth orbit.',
    'The four civilian crew members continued their flight in low Earth orbit.',
    'Dragon splashed down off the Florida coast at 7:06 p.m. EDT.'
  ];

  function boot() {
    const Store = window.CC_STORAGE;
    const Console = window.CC_CONSOLE;
    const WearableFiles = window.CC_WEARABLE_FILES;
    const consoleView = byId('consoleView');
    let view = 'home';
    let wearableBack = 'home';
    let activeMission;
    let latest;
    let expiry;
    let recording = false;
    let lastRecorded = 0;
    let records = [];
    let pendingImport;
    let importRevision = 0;
    let recentReadings = [];
    try {
      const saved = JSON.parse(localStorage.getItem(recordingKey) || '[]');
      if (Array.isArray(saved)) records = saved;
    } catch {}

    function show(next, moveFocus = true) {
      if (next !== 'dashboard' && !byId('editInventoryForm').hidden) closeInventoryEditor();
      view = next;
      const dashboard = ['simulator', 'replay', 'dashboard'].includes(next);
      byId('portal').hidden = dashboard;
      consoleView.hidden = !dashboard;
      for (const name of ['home', 'missionConsole', 'offlineBuild', 'mission', 'wearable']) byId(name + 'View').hidden = next !== name;
      consoleView.classList.toggle('replay-mode', next === 'replay');
      consoleView.classList.toggle('mission-mode', next === 'dashboard');
      byId('i4Replay').hidden = next !== 'replay';
      for (const id of ['missionWearable', 'captureWearable', 'missionWearableStatus', 'missionProfile']) {
        byId(id).hidden = next !== 'dashboard';
      }
      byId('consoleMode').textContent = { simulator: 'Health Monitoring System', replay: 'I4 mission playback', dashboard: 'Mission console' }[next] || '';
      if (next === 'simulator') Console.open('simulator', Store.load() || window.CC_SAMPLE.build(), '');
      if (next === 'replay') showReplay();
      if (next === 'mission') showSavedMissions();
      if (next === 'missionConsole') {
        const frame = byId('missionConsoleFrame');
        if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
      }
      if (next === 'offlineBuild') {
        const frame = byId('offlineBuildFrame');
        if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
      }
      if (next === 'wearable') showWearableHistory();
      if (next === 'dashboard') {
        const { scope, mission } = activeMission;
        showMissionProfile(mission);
        Console.open('mission', mission, scope);
      }
      if (moveFocus) {
        const heading = dashboard ? byId('consoleMode') : byId(next + 'View').querySelector('h1');
        heading.tabIndex = -1;
        heading.focus();
      }
    }

    function sendWearableToMissionConsole(sample) {
      const frame = byId('missionConsoleFrame');
      if (!frame.contentWindow) return;
      const origin = location.protocol === 'file:' ? '*' : location.origin;
      show('missionConsole');
      frame.contentWindow.postMessage({ type: 'crewcheck:wearable-reading', sample }, origin);
    }

    function showReplay() {
      const day = Number(byId('i4Day').value);
      const replay = window.CC_I4_DATA;
      const entries = replay.entries.filter(entry => entry.day <= day &&
        ['measured', 'digitized'].includes(entry.source));
      const current = entries.find(entry => entry.day === day && Object.values(entry.values || {}).some(Number.isFinite));
      byId('i4MilestoneText').textContent = milestones[day - 1];
      byId('i4DataStatus').textContent = current
        ? 'Historical readings available. Open Action plan for the detector’s analysis.'
        : 'Health data pending for this day. No detection result is available.';
      consoleView.classList.toggle('replay-no-data', !current);
      Console.open('replay', {
        ...Store.emptyMission(), name: 'Inspiration4', crew: replay.crew, flightDay: day, entries
      }, '');
    }

    function showSavedMissions() {
      const select = byId('savedMission');
      const saved = Store.listMissions();
      select.replaceChildren(...saved.map(({ scope, mission }) => new Option(
        mission.name + ' · ' + (mission.details?.launchDate || 'Launch date unavailable'), scope
      )));
      byId('savedMissionPanel').hidden = !saved.length;
    }

    function showMissionProfile(mission) {
      const labels = {
        identifier: 'Mission ID', vehicle: 'Spacecraft', operator: 'Operator',
        launchDate: 'Launch date', returnDate: 'Planned return', status: 'Status',
        phase: 'Flight phase', destination: 'Destination or orbit', launchSite: 'Launch site',
        crewSize: 'Total crew size', medicalChannel: 'Private medical channel', notes: 'Mission notes',
        food: 'Food and nutrition', water: 'Water and drinks', medical: 'Medical supplies',
        sensors: 'Body sensors', equipment: 'Vehicle equipment', procedures: 'Medical checklists',
        pulseOximeter: 'Pulse oximeter', heartRateMonitor: 'Heart-rate monitor'
      };
      const fields = byId('missionProfileFields');
      fields.replaceChildren();
      for (const [key, label] of Object.entries(labels)) {
        if (!mission.details?.[key]) continue;
        const title = document.createElement('dt');
        const value = document.createElement('dd');
        title.textContent = label;
        value.textContent = mission.details[key] === 'available' ? 'Available' : mission.details[key];
        fields.append(title, value);
      }
    }

    function closeInventoryEditor() {
      byId('missionForm').insertBefore(byId('missionInventory'), byId('createMission'));
      for (const field of byId('missionInventory').elements) {
        if (field.type === 'checkbox') field.checked = false;
        else field.value = '';
      }
      byId('editInventoryForm').hidden = true;
      byId('editInventory').hidden = false;
      byId('inventoryStatus').textContent = '';
    }

    function setRecordStatus(message) {
      byId('recordWearable').textContent = recording ? 'Stop recording' : 'Start recording';
      byId('wearableRecordStatus').textContent = message || records.length + ' readings saved on this device.';
      byId('exportWearable').disabled = !records.length;
    }

    function showWearableHistory() {
      const select = byId('savedWearableReading');
      const selected = select.value === '' ? null : recentReadings[Number(select.value)];
      recentReadings = records.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
      select.replaceChildren(...recentReadings.map((reading, index) => new Option(
        reading.timestamp.replace('T', ' ').replace(/\.\d{3}Z$/, '') + ' · ' +
        (reading.metric === 'spo2' ? 'Blood oxygen' : 'Heart rate') + ' ' + reading.value + ' ' + reading.unit +
        ' · ' + reading.provider, String(index)
      )));
      const selectedIndex = recentReadings.indexOf(selected);
      if (selectedIndex >= 0) select.value = String(selectedIndex);
      byId('savedWearablePanel').hidden = !recentReadings.length;
      const missionTarget = ['dashboard', 'missionConsole'].includes(wearableBack);
      byId('useSavedWearable').hidden = !missionTarget;
      byId('savedWearableHint').hidden = !missionTarget;
      byId('useLiveInMissionConsole').hidden = wearableBack !== 'missionConsole';
    }

    function receive(sample) {
      latest = sample;
      clearTimeout(expiry);
      byId('captureWearable').disabled = !sample;
      byId('useLiveInMissionConsole').disabled = !sample;
      byId('wearableReading').textContent = sample ? 'Live heart rate · ' + sample.value + ' bpm' : 'Live heart rate · —';
      if (!sample) return;
      expiry = setTimeout(() => receive(null), freshnessMs);
      const time = Date.parse(sample.timestamp);
      if (!recording || time - lastRecorded < 5000) return;
      if (records.length >= maxReadings) {
        recording = false;
        setRecordStatus('Recording limit reached. Export the saved readings.');
        return;
      }
      const next = [...records, sample];
      try {
        localStorage.setItem(recordingKey, JSON.stringify(next));
        records = next;
        lastRecorded = time;
        setRecordStatus();
        if (view === 'wearable' && byId('useSavedWearable').hidden) showWearableHistory();
      } catch {
        recording = false;
        setRecordStatus('Recording stopped because local storage is unavailable or full.');
      }
    }

    function updateConnection({ state, deviceName, canReconnect }) {
      const busy = state === 'connecting';
      const connected = state === 'connected';
      const messages = {
        connecting: 'Connecting to the wearable…',
        connected: 'Connected to ' + (deviceName || 'heart-rate sensor') + '. Waiting for readings if none are shown.',
        disconnected: 'Device disconnected. Reconnect or choose a different device.',
        unsupported: 'Bluetooth is unavailable here. Open the app over HTTPS or localhost in a browser with Web Bluetooth.',
        'not-selected': 'No device selected. Turn on heart-rate broadcasting and try again.',
        failed: 'Connection failed. Check Bluetooth, sensor broadcasting, and whether another app is using the sensor. Then retry.'
      };
      for (const id of ['wearableStatus', 'missionWearableStatus']) byId(id).textContent = messages[state];
      byId('pairWearable').disabled = busy || connected;
      byId('reconnectWearable').disabled = busy || connected || !canReconnect;
      byId('disconnectWearable').disabled = !connected;
      byId('recordWearable').disabled = !connected;
      if (!connected && recording) {
        recording = false;
        setRecordStatus('Recording stopped. Saved readings are available for export.');
      }
    }

    const adapter = window.CC_WEARABLE.createHeartRateAdapter(navigator.bluetooth, {
      onStatus: updateConnection, onSample: receive
    });

    document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.open === 'wearable') wearableBack = view;
      show(button.dataset.open);
    }));
    byId('wearableBack').addEventListener('click', () => show(wearableBack));
    byId('openSimulatorReview').addEventListener('click', () => {
      show('simulator');
      document.querySelector('[data-tab="plan"]').click();
    });
    byId('i4Day').addEventListener('change', showReplay);
    byId('missionForm').addEventListener('submit', event => {
      event.preventDefault();
      const details = Object.fromEntries([...new FormData(event.currentTarget)]
        .map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
      const status = byId('missionFormStatus');
      if (!details.name || !details.crew || !details.vehicle || !details.launchDate) {
        status.textContent = 'Enter a mission name, crew ID, spacecraft model, and launch date.';
        return;
      }
      if (details.returnDate && details.returnDate < details.launchDate) {
        status.textContent = 'The planned return date must be on or after launch.';
        return;
      }
      const { name, crew, flightDay, ...missionDetails } = details;
      const mission = { ...Store.emptyMission(), name, crew, flightDay: Number(flightDay), details: missionDetails };
      const scope = 'mission-' + Array.from(crypto.getRandomValues(new Uint32Array(2)), part => part.toString(36)).join('-');
      if (!Store.save(mission, scope)) {
        status.textContent = 'Local storage is unavailable. Open the app in a regular browser window and try again.';
        return;
      }
      activeMission = { scope, mission };
      event.currentTarget.reset();
      status.textContent = '';
      show('dashboard');
    });
    byId('resumeMission').addEventListener('click', () => {
      const scope = byId('savedMission').value;
      const mission = scope && Store.load(scope);
      if (!mission) return;
      activeMission = { scope, mission };
      show('dashboard');
    });
    byId('editInventory').addEventListener('click', () => {
      const editor = byId('editInventoryForm');
      const inventory = byId('missionInventory');
      editor.insertBefore(inventory, byId('saveInventory'));
      for (const field of inventory.elements) {
        const value = activeMission.mission.details?.[field.name];
        if (field.type === 'checkbox') field.checked = value === 'available';
        else field.value = value || '';
      }
      editor.hidden = false;
      byId('editInventory').hidden = true;
      inventory.elements[0].focus();
    });
    byId('cancelInventory').addEventListener('click', () => {
      closeInventoryEditor();
      byId('editInventory').focus();
    });
    byId('editInventoryForm').addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const details = { ...activeMission.mission.details };
      for (const field of byId('missionInventory').elements) {
        const value = values.get(field.name)?.trim();
        if (value) details[field.name] = value;
        else delete details[field.name];
      }
      if (!Console.updateResources(details)) {
        byId('inventoryStatus').textContent = 'Resources could not be saved. Check local storage and retry.';
        return;
      }
      activeMission.mission.details = details;
      showMissionProfile(activeMission.mission);
      closeInventoryEditor();
      byId('editInventory').focus();
    });

    byId('pairWearable').addEventListener('click', adapter.pair);
    byId('reconnectWearable').addEventListener('click', adapter.reconnect);
    byId('disconnectWearable').addEventListener('click', adapter.disconnect);
    byId('captureWearable').addEventListener('click', () => {
      if (latest && Date.now() - Date.parse(latest.timestamp) < freshnessMs) Console.useWearable(latest);
    });
    byId('useLiveInMissionConsole').addEventListener('click', () => {
      if (!latest || Date.now() - Date.parse(latest.timestamp) >= freshnessMs || wearableBack !== 'missionConsole') return;
      if (window.confirm('Confirm this reading belongs to the current crew member and was taken at rest.')) {
        sendWearableToMissionConsole(latest);
      }
    });
    byId('recordWearable').addEventListener('click', () => {
      if (!recording && records.length >= maxReadings) {
        setRecordStatus('Recording limit reached. Export the saved readings.');
        return;
      }
      recording = !recording;
      setRecordStatus(recording ? 'Recording up to one reading every five seconds.' : '');
      if (recording && latest && Date.now() - Date.parse(latest.timestamp) < freshnessMs) receive(latest);
    });
    byId('exportWearable').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'crew-check-wearable-readings.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    byId('wearableImport').addEventListener('change', async event => {
      const file = event.currentTarget.files[0];
      const revision = ++importRevision;
      const status = byId('wearableImportStatus');
      pendingImport = undefined;
      byId('saveImportedWearable').disabled = true;
      if (!file) {
        status.textContent = 'Choose a readings file.';
        return;
      }
      if (file.size > 30_000_000) {
        status.textContent = 'This file is larger than 30 MB. Export a smaller file or convert the readings to CSV.';
        return;
      }
      status.textContent = 'Reading file locally…';
      try {
        const result = WearableFiles.parse(await file.text(), file.name);
        if (revision !== importRevision) return;
        if (!result.records.length) {
          status.textContent = 'No usable timestamped heart-rate or oxygen readings were found.';
          return;
        }
        pendingImport = result.records;
        status.textContent = result.records.length + ' valid readings found. ' + result.skipped + ' invalid readings skipped. Review the file before saving.';
        byId('saveImportedWearable').disabled = false;
      } catch (error) {
        if (revision === importRevision) status.textContent = 'Could not read the file. ' + error.message;
      }
    });
    byId('saveImportedWearable').addEventListener('click', () => {
      if (!pendingImport) return;
      const result = WearableFiles.merge(records, pendingImport, maxReadings);
      const status = byId('wearableImportStatus');
      try {
        if (result.added) localStorage.setItem(recordingKey, JSON.stringify(result.records));
        records = result.records;
        pendingImport = undefined;
        byId('saveImportedWearable').disabled = true;
        byId('wearableImport').value = '';
        status.textContent = result.added + ' saved · ' + result.duplicates + ' duplicates skipped' +
          (result.overflow ? ' · ' + result.overflow + ' could not fit in the 5,000-reading archive' : '.');
        setRecordStatus();
        showWearableHistory();
      } catch {
        status.textContent = 'Could not save readings. Local storage is unavailable or full.';
      }
    });
    byId('useSavedWearable').addEventListener('click', () => {
      const sample = recentReadings[Number(byId('savedWearableReading').value)];
      if (!sample || !['dashboard', 'missionConsole'].includes(wearableBack)) return;
      if (wearableBack === 'missionConsole') {
        if (sample.provider === 'tcx') {
          byId('wearableImportStatus').textContent = 'This is a workout reading. New Mission requires resting vital readings.';
          return;
        }
        if (window.confirm('Use the reading from ' + sample.timestamp +
          '? Confirm it was taken at rest and belongs to the current crew member and mission day.')) {
          sendWearableToMissionConsole(sample);
        }
        return;
      }
      if (!window.confirm('Use the reading from ' + sample.timestamp + ' in the current mission check-in? Confirm it belongs to this crew member and mission day.')) return;
      show('dashboard');
      Console.useWearable(sample, true);
    });

    setRecordStatus();
    show('home', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
