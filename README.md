# CREW CHECK — In-Flight Health Self-Assessment Console

A visual tool that lets an astronaut **measure their own health indicators, see where the mission's five hazards are already affecting them, and get an actionable plan** — with no ground support required.

Built for the NASA Space Apps Challenge (Health in Space / long-duration mission crew self-assessment).

**Live demo: <https://cx1801097.github.io/NasaSpaceAppChallangeCCC/>** — no install, opens in any browser, phone included.

> **Not a medical device.** Rule-based decision support for a prototype; every threshold is a published reference range, and every recommendation is a prompt to consult a flight surgeon, not a diagnosis.

---

## Why it works the way it does

Long-duration missions remove the two things clinical medicine normally relies on: **real-time ground support** (communication delay grows to ~22 minutes at Mars) and **the clinician** (the crew member is the patient *and* the first responder).

So the design constraints were:

1. **Fully offline.** No CDNs, no telemetry calls, no build step. Open `index.html` and it runs — on a laptop in a habitat, in a browser cache, on a ship.
2. **Explainable.** Every GO/CAUTION/NO-GO traces back to a measured value and a published band. A crew member must be able to trust and audit the recommendation.
3. **Self-triage oriented.** The output is not a chart, it is *what do I do now, and who do I tell.*

The five hazards from NASA's Human Research Program — **space radiation, isolation & confinement, distance from Earth, altered gravity fields, hostile closed environment** — are wired into the model as context risk per body system, not just as background text.

---

## Run it

**Fastest:** open the live demo — <https://cx1801097.github.io/NasaSpaceAppChallangeCCC/>

**Locally:**

```powershell
# simplest: just open the file
start index.html

# or serve it (recommended; localStorage behaves normally)
node server.js        # any static server works
```

No install, no dependencies. The console boots with a simulated 30-day mission. Press **Reset** to start a fresh measured record. For tests, run `node --test` from the repository root with Node.js 20 or later.

Deployment is GitHub Pages from `main` → `/` (root), so any push to `main` redeploys the live demo automatically.

---

## What's in it

| View | What it does |
|---|---|
| **Daily check-in** (left rail) | 11 indicators with sliders + numeric entry, symptom checklist, free-text note. Scoring updates live as you drag. |
| **Body map** | Clickable astronaut figure. Each hotspot is a body system, colour-coded by status (green / amber / red, red pulses). Click for measured values, band, driving risk and recommended actions. |
| **Trends** | Mission-wide readiness chart with GO/CAUTION/NO-GO zones, plus a sparkline per indicator with its normal range shaded. |
| **Action plan** | The triage answer: overall status, findings outside limits, and ranked countermeasures per system. |
| **Mission log** | Every saved check-in, with load / delete. |
| **I4 mission playback** | Browse Inspiration4 by date. The read-only console will show supplied vital signs and run the same detector for days with readings. |

### Home screen and wearable setup

- **Health Monitoring System** opens the demo dashboard and uses its original local log. **New mission** creates a separate local record with spacecraft, launch and return dates, crew ID, mission status and phase, and optional operational details. Use **Resume a saved mission** to reopen it.
- **I4 mission playback** is historical. `data/i4-replay.js` starts empty. Add only approved public records using the mission entry schema, explicitly set measured or digitized provenance, and use days 1–4 for September 15–18 (Eastern time). Earlier days can supply history, and future days are hidden when replaying a prior date. No readings or health events are inferred from the timeline.
- **Connect wearable device** supports a nearby Bluetooth Low Energy sensor that advertises the standard Heart Rate Service. Open the app via HTTPS or `http://localhost:8080` in a browser with Web Bluetooth support, enable heart-rate broadcasting, and use **Choose device**. The browser handles device permission. On a lost connection, recorded samples remain available and **Reconnect** retries the selected sensor. See [Chrome's Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth).
- **Start recording** saves timestamped heart-rate samples on the device, up to one every five seconds and 5,000 total. **Export readings** downloads JSON. In a new mission, **Use latest heart rate** copies a fresh sample into the current check-in. Set the reading activity and save the check-in to keep it with the mission. Continuous recording and saved check-ins are separate.
- `js/wearable.js` defines the hardware adapter contract. A future adapter can implement `pair`, `reconnect`, and `disconnect` and emit status and timestamped samples with `metric`, `value`, `unit`, `timestamp`, and `provider`. Vendor-specific devices need their own supported adapter. Current Bluetooth coverage is heart rate. Physical-device compatibility and flight readiness require separate validation.
- **Import watch readings** adds an offline path for Apple Health `export.xml` (heart rate or oxygen saturation), TCX activity files (individual heart-rate samples), normalized CSV, and CREW CHECK readings JSON. For CSV, use `timestamp` plus `heartRate` in bpm and/or `spo2` in percent. Include a time zone in every timestamp. Import accepts individual files up to 30 MB, skips invalid rows, deduplicates repeat imports, and shares the 5,000-sample local archive. Proprietary archives and cloud sync are separate integrations.
- To use a saved reading, open the wearable panel from a mission, choose the timestamped sample, and verify it belongs to that crew member and mission day. Confirm the activity and save the check-in. Imports never start a live stream or automatically update existing mission readings. See [Apple Health export](https://support.apple.com/en-ca/guide/iphone/iph5ede58c3d/ios) and [Garmin Connect export formats](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8).

**Demo conditions** load a nominal day, a deconditioning episode, or a medical event in one click — useful for judging and for briefing the crew.

---

## Indicators and why each one is measured

| Indicator | System | Why it matters in flight |
|---|---|---|
| Systolic / diastolic BP | Cardiovascular | Fluid shift and plasma-volume loss; orthostatic intolerance on return to gravity |
| Heart rate | Cardiovascular | Cardiac deconditioning and autonomic change; early stress/illness signal |
| Blood glucose | Metabolic | Altered nutrition and insulin sensitivity; hypo/hyperglycemia degrade performance fast |
| Core temperature | Immune | Primary fever screen where immune dysregulation and closed-environment pathogens combine |
| Sleep hours | Neurobehavioral | The isolation & confinement hazard shows up first as sleep loss; drives cognitive failure |
| Mood (1–5) | Neurobehavioral | Behavioural health is a mission-critical system, not a comfort metric |
| SpO₂ | Respiratory | Closed-loop air, elevated CO₂, altered lung volumes |
| Exercise minutes | Musculoskeletal | The primary *controllable* countermeasure to bone and muscle loss |
| Bone density change | Musculoskeletal | ~1–1.5% BMD loss per month in weight-bearing sites; DXA-tracked |
| Cumulative radiation dose | Radiation | Career limits drive shielding and EVA planning |
| Symptoms | multiple | Self-reported findings that no sensor catches |

Some things cannot be continuously sensed — **SANS / VIIP ocular changes** for example. That system is modelled transparently from flight day and pressure load, and marked as derived rather than pretending to measure it.

---

## How the scoring engine works

The mission readiness score uses the existing rule-based calculation:

```
metric value
  → band (8 clinical bands per indicator: OPTIMAL … CRITICAL)
  → severity (0 / 14 / 40 / 72 / 100)
  → per-system severity = 0.78 × weighted metric severity + 0.22 × context risk
  → readiness = 100 − (0.6 × weighted mean severity + 0.4 × worst system)
  → GO (≥80) / CAUTION (≥55) / NO-GO
```

Design choices worth defending to a judge:

- **Worst-system gating.** Mission readiness is limited by the weakest system, exactly like flight rules. A 95 average with one failing system is not a GO — it is a scrub.
- **Context risk.** Flight day, rolling 7-day sleep debt and exercise deficit raise a system's risk even when today's numbers look fine. This is what catches the slow drift that crews miss.
- **Severity floors.** Any single ABNORMAL reading forces at least CAUTION; any CRITICAL forces NO-GO. A bad value cannot be averaged away.
- **Symptoms override.** Reported chest pain is a NO-GO regardless of the numbers — the human sensor outranks the instrument.

Thresholds live in [`js/data.js`](js/data.js) so a flight surgeon can review and change them without touching logic.

### Where the numbers are used

- `js/data.js` — indicators, bands, systems, countermeasures, demo scenarios
- `js/scoring.js` — banding → severity → readiness → triage, plus trend extraction
- `js/detection.js` — offline vital-sign detection, personal baselines and data quality
- `js/body-map.js` — the clickable figure
- `js/charts.js` — hand-rolled SVG sparklines and the readiness chart
- `js/storage.js` — localStorage mission log, JSON export/import
- `js/app.js` — controller and rendering
- `data/sample-mission.js` — the 30-day demo dataset

---

## Vital-sign detection

Enter SpO₂ (%) and heart rate (bpm), then select the source and the activity **when the readings were taken**. Open **Action plan** to see status, provenance and the readings or missing data behind it. Save a check-in to make it available as history. Blank readings stay missing. Advancing to a new day starts a blank check-in unless that day already has a saved record. Changing the source or crew clears the draft so earlier readings keep their provenance and identity.

| Status | Detection criteria |
|---|---|
| **CRITICAL** | One critical oxygen or resting-pulse threshold, or persistent warning-level oxygen and resting-pulse thresholds together. |
| **WARNING** | One warning-level threshold or a persistent personal-baseline deviation. |
| **UNKNOWN** | Missing, flagged or invalid vital readings, or unspecified activity, with no usable finding that warrants a warning or critical alert. |
| **NORMAL** | Both vitals usable, activity known, and the applicable checks produce no alert. Baseline warm-up and an isolated deviation can still appear in the explanation. |

- **Oxygen:** SpO₂ ≤92% warns and ≤88% is critical, including during exercise. See [MedlinePlus pulse oximetry](https://www.medlineplus.gov/lab-tests/pulse-oximetry/).
- **Resting pulse:** <50 or >100 bpm warns and ≤40 or ≥131 bpm is critical. The prototype uses the NEWS2 pulse extremes and the AHA upper resting reference. Its 50 bpm warning boundary is a design choice to allow for lower resting pulse among active adults. Exercise skips resting-pulse and baseline checks. See [RCP NEWS2 observation chart](https://www.rcp.ac.uk/media/eczf5mvm/news2-chart-3_news-observation-chart_2022_0_0.pdf) and [AHA resting heart rate](https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse).
- **Personal baseline:** Uses the median and scaled median absolute deviation (MAD) of usable, resting, threshold-free samples from the same crew member and source in the prior 30 flight days. It needs seven samples per vital and uses scale floors of 1 percentage point and 3 bpm. A downward oxygen deviation or either-direction pulse deviation of at least 3.5 scaled units is flagged. The same current reference is used to check persistence in the preceding raw observations.
- **Persistence and fusion:** Two adjacent flight days are required for a baseline alert or combined safety escalation. A missed day, ambiguous duplicate day or unusable reading breaks the streak. A standalone absolute warning or critical reading is immediate. The prototype settings and references are in `js/detection.js`.

The detector executes entirely in the browser, including when run from `index.html`. Detection needs no model download, API key, or telemetry. Mission readiness still covers the original body systems and symptoms. Vital-sign status covers only oxygen and pulse.

### Optional on-device AI highlight

Open **Action plan → Highlight with local AI** in a WebGPU browser. On GitHub Pages or another HTTPS static host, the first run downloads the WebLLM runtime and the Qwen3 4B model (about 2.3 GB). Inference happens in a browser worker. No cloud inference API or key is used. The model can select one existing observation to highlight. Health readings, alerts, next steps, and the ground handoff come from the existing rules. Model text cannot add findings, change severity, or prescribe treatment.

For an offline setup, while still online, run:

```sh
node scripts/prepare-offline-ai.js
node server.js
```

Open `http://localhost:8080`. On localhost the app loads the runtime and model exclusively from the local `ai-assets/` directory. Keep that directory with the app and test the highlight in a clean browser profile with networking disabled before relying on it. A standalone `file://` preview can run the detector and base guidance. The AI worker requires HTTPS or localhost. The model is optional and its unavailability leaves the original crew guidance visible. Physical hardware and full offline inference must be verified on the target computer. See [WebLLM](https://github.com/mlc-ai/web-llm) and the [Qwen3 4B WebLLM model files](https://huggingface.co/mlc-ai/Qwen3-4B-q4f32_1-MLC/tree/main).

**Crew guidance and ground handoff.** The Action plan gives short, status-specific guidance. For a warning or critical result, **Review ground handoff** shows a copyable report with the flight day, reading source, activity, and detection findings. It excludes the crew name, free-text notes, raw flagged readings, and mission history. A critical result directs the crew to contact the flight surgeon through the mission’s approved private medical channel without waiting for the report. Simulated, digitized, and unspecified sources carry a prominent demonstration or unverified label. The dashboard generates the draft locally. It has no NASA connection or delivery confirmation. Actual integration requires a mission-authorized private channel and a crew review step. See [NASA medical operations and private medical communications](https://www.nasa.gov/reference/6-0-medical-operations/).

**Crew Suggestion** explains current oxygen and pulse findings in plain language and gives a next step. Record food, water, medical supplies, checklists, sensors and equipment under **New mission → Onboard resources**. Edit them later from **Mission details**. A recheck names a specific sensor only if its usable-device checkbox is selected and the sensor is relevant to the finding. For urgent findings, the app prioritizes reaching the crew medical officer and flight surgeon. Medical and food inventory are context for human review. The prototype leaves treatment choice, medication and dosing to qualified staff.

The 30-day demo, preset conditions and labeled test fixtures are simulated. **Measured** means directly recorded observations, **digitized** means estimates transcribed from a published visual, and **simulated** means generated observations. These sources are never pooled for personal baselines. Older untagged records remain unspecified and cannot supply a baseline. [NASA's Inspiration4 archive](https://osdr.nasa.gov/bio/repo/data/missions/SpaceX%20Inspiration4) is a historical demonstration reference. The repository includes no I4 telemetry or digitized I4 measurements, and the tests do not validate performance on I4.

The thresholds are terrestrial references used in an educational prototype. Flight-specific limits, altitude, sensor accuracy and individual variation require review by qualified staff. Pulse oximetry may be affected by motion, perfusion, skin pigmentation and other factors. Daily manual check-ins cannot detect events between readings, and rolling baselines can adapt to gradual drift. The prototype provides observations for human review and does not diagnose or recommend treatment. The six labeled fixtures and regression tests exercise software behavior. Clinical accuracy and operational performance have not been measured. See [FDA pulse oximeter limitations](https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics).

---

## Plugging in real data

The mission record is plain JSON. Drop a file in `data/` (or use **Import**) with this shape:

```json
{
  "version": 1,
  "name": "ARTEMIS VII",
  "crew": "CDR-1",
  "flightDay": 70,
  "entries": [
    {
      "day": 40,
      "crew": "CDR-1",
      "source": "measured",
      "activity": "rest",
      "quality": {},
      "values": {
        "systolic": 118, "diastolic": 74, "heartRate": 68,
        "glucose": 92, "temperature": 36.6, "sleepHours": 7.5,
        "mood": 4, "spo2": 98, "exerciseMinutes": 45,
        "radiationDose": 108, "boneDensityPct": -0.6
      },
      "symptoms": ["fatigue"],
      "note": "post-EVA, slept 5 h"
    }
  ]
}
```

Use a single crew record per mission file and a stable `crew` identifier on each check-in. `day` is the integer flight day. The `values` keys correspond to metric IDs in `js/data.js`. Omit missing values or use `null`. Set `quality.spo2` or `quality.heartRate` to `"invalid"` for a flagged reading. Import and export preserve these fields. Keep private mission exports outside the repository.

To swap the demo dataset, edit `data/sample-mission.js` or import a JSON file at runtime — no code changes needed.

---

## Status model

| Status | Meaning for the crew |
|---|---|
| **GO** | All monitored systems within flight limits. Continue the countermeasure schedule. |
| **CAUTION** | A system is drifting. Act now — most flight issues are reversible at this stage. Increase monitoring, start the listed countermeasure, note it in the log. |
| **NO-GO** | A finding requires immediate crew action and flight-surgeon notification. Suspend EVA / heavy loading until reviewed. |

Aggregated recommendations escalate by level: at level 3–4 the guidance becomes "notify the flight surgeon", "suspend EVA", "alert crew" rather than "adjust your diet".

---

## Working on this as a team

The repo is deliberately build-step-free so nobody ever fights over a lockfile. Keep one owner per file:

```powershell
git pull --rebase origin main
git checkout -b feature/your-thing
# … work …
git add -A ; git commit -m "feat: …" ; git push -u origin feature/your-thing
```

Open a PR for anything touching `scoring.js` or `data.js` — those two files define medical behaviour, so they deserve a second pair of eyes.

Commits written with the OpenCode agent end with an `Assisted-by:` trailer naming the assistant and the model that produced them, so agent-authored work is always distinguishable from your own commits at a glance. The commit stays authored under your GitHub identity, which keeps the history honest about *who pushed* while still marking *what made it*.

---

## Roadmap

- [ ] Real sensor ingest (CSV/JSON from wearables, capnography, actigraphy)
- [ ] Camera-based heart-rate estimate (rPPG) as an *optional* input, clearly labelled as low-confidence
- [ ] Vision self-test module (Amsler grid, acuity) feeding the SANS model
- [ ] PWA packaging for true offline install on a habitat tablet
- [ ] Crew-of-four view with role-based access (crew member vs. commander vs. flight surgeon)
- [ ] Localisation and high-contrast / large-type mode for the ISS-style low-light environment

---

## References

- NASA Human Research Program — *Five Hazards of Human Spaceflight*
- HRP *Evidence Book* — cardiovascular, musculoskeletal, neurobehavioral, immune and radiation risks
- NASA-STD-3001, *NASA Space Flight Human-System Standard* — permissible exposure limits
- SANS / VIIP literature on spaceflight-associated neuro-ocular syndrome
