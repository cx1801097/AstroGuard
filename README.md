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

No install, no dependencies. The console boots with a 30-day demo mission so there is always something to look at; press **Reset** to start a real crew record.

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

Transparent, three steps, no machine learning:

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
- `js/body-map.js` — the clickable figure
- `js/charts.js` — hand-rolled SVG sparklines and the readiness chart
- `js/storage.js` — localStorage mission log, JSON export/import
- `js/app.js` — controller and rendering
- `data/sample-mission.js` — the 30-day demo dataset

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

Rules: `values` keys must match the metric ids in `js/data.js`; `day` is the flight day; unknown keys are ignored; missing metrics fall back to nominal defaults. **Export** always produces a file in exactly this shape, so a round-trip through the console is lossless.

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
