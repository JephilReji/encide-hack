# Cliff Guard — Shared Integration Contract

**Purpose:** One source of truth for the frontend and backend Cursor agents. Read this file before coding. Do not change endpoint names, field names, or response shapes without telling the other developer first.

## 1. MVP target

Build a working demo of smart electricity consumption monitoring and KSEB time-of-day tariff intelligence using **clearly labelled simulated meter data**. The app must dynamically calculate its charts, consumption patterns, threshold warnings, and costs from the selected dataset. Do not hardcode a finished dashboard or a fixed AI answer.

### In scope
- 30-day simulated meter data (720 hourly intervals) as the primary demo.
- Hourly and daily consumption charts and consumption by tariff period.
- Configured time-of-day tariff calculations and threshold warnings.
- Statistical pattern detection using actual kWh values (no custom model training required).
- Interactive rescheduling of a simulated flexible load; kWh must remain unchanged.
- AI advisor that explains backend-calculated findings. If the LLM API is unavailable, the app still works and shows a clear fallback.

### Out of scope
Physical IoT hardware, actual KSEB meter connectivity, appliance inventory, solar features, language/voice features, bill OCR, user accounts, and custom ML training.

## 2. Repository structure

Use one Git repository with separate folders. Keep the existing synthetic data files in the repository root's `data/` folder.

```text
cliff-guard/
├── README.md
├── INTEGRATION_CONTRACT.md
├── .gitignore
├── .env.example
├── data/
│   ├── cliff_guard_demo_30day_720_hourly_records.csv
│   ├── cliff_guard_dev_200_hourly_records.csv
│   └── cliff_guard_common_appliance_assumptions.csv
├── frontend/
│   ├── package.json
│   └── src/
└── backend/
    ├── package.json
    └── src/
        ├── server.js
        ├── routes/
        ├── services/
        └── config/
            └── tariff.json
```

Frontend owns files in `frontend/`. Backend owns files in `backend/` and the API/contract documentation only by agreement. Neither person should rewrite the other person's folder. The `data/` CSVs are synthetic and must be labelled as such in the UI.

## 3. Run and environment contract

- Frontend: React + Vite, default `http://localhost:5173`.
- Backend: Node.js + Express, default `http://localhost:3001`.
- Frontend environment variable: `VITE_API_BASE_URL=http://localhost:3001`.
- Backend environment variables: `PORT=3001`, and whichever one provider key is actually selected, e.g. `GEMINI_API_KEY=`. Keep actual `.env` files out of Git.
- Backend must enable CORS for the Vite local origin.
- Use one provider for the LLM; do not make the app depend on the LLM for numeric calculations.
- `.env.example` contains placeholder values only. Never commit keys.

## 4. Dataset semantics

The CSV column `timestamp` is the **start** of the one-hour interval. `kwh_used` is energy consumed during that following hour. Use `Asia/Kolkata` / `+05:30` consistently. Do not reinterpret the timestamps as interval-end readings.

The demo CSV includes these columns:
- `timestamp`: interval start with India UTC offset
- `base_household_kwh`: household consumption excluding flexible sub-load
- `shiftable_load_kwh`: flexible sub-load already included in `kwh_used`
- `kwh_used`: total interval consumption; approximately base plus flexible load
- `tariff_period`: dataset label only; tariff eligibility and rate mapping must come from configured tariff rules
- `is_injected_spike`: synthetic test ground truth. **Never use it as an analysis feature or expose it as the detector's input.**
- `data_source`: simulated data marker

Do not claim the data is real or a live KSEB reading. The 200-row file is for development/testing; the 720-row file is for the primary demo.

## 5. API contract

All endpoints return JSON. Base URL: `http://localhost:3001`. For errors, use `{ "error": { "code": "SOME_CODE", "message": "Human-readable explanation" } }` and a suitable HTTP status.

### `GET /api/health`

Response:
```json
{ "status": "ok", "service": "cliff-guard-api" }
```

### `GET /api/demo/scenarios`

Return the available datasets/scenarios. The first/default option must be the 720-row 30-day demo dataset.

Response:
```json
{
  "scenarios": [
    {
      "id": "demo-30day",
      "label": "30-day simulated household",
      "description": "720 hourly simulated records with example peaks and flexible load",
      "recordCount": 720,
      "dataSource": "simulated"
    },
    {
      "id": "dev-200",
      "label": "200-row development/test dataset",
      "description": "Four short synthetic patterns for testing, not a full-month forecast",
      "recordCount": 200,
      "dataSource": "simulated"
    }
  ]
}
```

If the second scenario is included in the UI, clearly identify it as a test dataset and do not use it for a 30-day forecast.

### `GET /api/demo/readings?scenarioId=demo-30day`

Response:
```json
{
  "scenarioId": "demo-30day",
  "dataSource": "simulated",
  "intervalConvention": "timestamp-is-interval-start",
  "records": [
    {
      "recordId": "DEMO-0001",
      "timestamp": "2026-09-01T00:00:00+05:30",
      "kwhUsed": 0.1602,
      "baseHouseholdKwh": 0.1602,
      "shiftableLoadKwh": 0,
      "tariffPeriodLabel": "off_peak"
    }
  ]
}
```

The example `records` array above shows one item only; the endpoint returns the full selected dataset. Do **not** return `is_injected_spike` to the frontend.

### `GET /api/tariff`

Return the active configured tariff profile and its verification status. Rates, periods, applicability, effective dates, and thresholds come from `backend/src/config/tariff.json`; do not hardcode separate copies in frontend code.

Response shape:
```json
{
  "profileId": "kseb-domestic-demo",
  "displayName": "KSEB domestic tariff profile",
  "verificationStatus": "verified-or-illustrative",
  "effectiveFrom": "YYYY-MM-DD",
  "effectiveTo": "YYYY-MM-DD",
  "sourceName": "Official tariff source title",
  "eligibilityNote": "Which consumer/metering profiles this configuration applies to",
  "billingCycleDays": 60,
  "periods": [
    { "id": "normal_daytime", "label": "Normal daytime", "startHour": 6, "endHour": 18, "multiplier": 0.9 },
    { "id": "peak", "label": "Peak", "startHour": 18, "endHour": 22, "multiplier": 1.25 },
    { "id": "off_peak", "label": "Off-peak", "startHour": 22, "endHour": 6, "multiplier": 1.0 }
  ],
  "thresholds": []
}
```

The values shown for periods/multipliers are a **schema example, not permission to assume a rate is applicable**. Backend owner must verify the current official tariff, consumer category, meter eligibility, dates, and slab rules before marking a profile `verified`. If not verified, mark it `illustrative` and show that label in the UI. Do not label energy-charge estimates as a complete official bill unless all necessary bill components/rules are implemented. Include relevant thresholds in the config only once their applicable calculation rule has been confirmed.

### `POST /api/analyze`

Request:
```json
{ "scenarioId": "demo-30day", "tariffProfileId": "kseb-domestic-demo" }
```

Backend loads the chosen dataset and runs its calculations. Response shape:
```json
{
  "scenarioId": "demo-30day",
  "dataSource": "simulated",
  "recordCount": 720,
  "summary": {
    "totalKwh": 284.85,
    "averageDailyKwh": 9.495,
    "peakHour": 19,
    "highestDailyKwh": 12.4
  },
  "dailyTotals": [{ "date": "2026-09-01", "kwh": 9.1 }],
  "hourlyAverages": [{ "hour": 19, "kwh": 0.6 }],
  "periodTotals": [
    { "periodId": "peak", "label": "Peak", "kwh": 93.92, "sharePercent": 32.97, "estimatedEnergyCharge": null }
  ],
  "findings": [
    {
      "id": "finding-1",
      "type": "unusual_usage",
      "severity": "info",
      "title": "Higher-than-usual evening use",
      "timestamp": "2026-09-15T19:00:00+05:30",
      "observedKwh": 0.95,
      "baselineKwh": 0.55,
      "deviationPercent": 72.73,
      "explanation": "Generated from the current dataset and the configured detection rule."
    }
  ],
  "thresholdWarnings": [],
  "forecast": {
    "available": true,
    "method": "average-daily-usage projection",
    "projectedCycleKwh": 569.7,
    "estimatedEnergyCharge": null,
    "notice": "Projection from synthetic data; not a guarantee."
  },
  "assumptions": ["Simulated readings", "Configured tariff profile"]
}
```

Numbers above are illustrative examples of the response shape. **Calculate the real values dynamically; never copy these example figures into the app as constants.** `estimatedEnergyCharge` may be `null` when the tariff profile is not verified or does not support a trustworthy calculation. Hide or qualify forecasts when data/history is inadequate. `findings` must be generated from `kwh_used`, not `is_injected_spike`.

### `POST /api/optimize`

Request:
```json
{
  "scenarioId": "demo-30day",
  "tariffProfileId": "kseb-domestic-demo",
  "date": "2026-09-15",
  "sourceTimestamp": "2026-09-15T19:00:00+05:30",
  "targetTimestamp": "2026-09-15T23:00:00+05:30",
  "shiftKwh": 0.4
}
```

Backend must validate that the selected source interval has enough `shiftable_load_kwh`, the target exists, and the tariff profile supports comparing those periods. Recalculate charges for the moved load using configured rules. Preserve total kWh exactly (within floating-point tolerance). Never claim savings if cost does not decrease.

Response:
```json
{
  "dataSource": "simulated",
  "totalKwhBefore": 0.4,
  "totalKwhAfter": 0.4,
  "sourcePeriod": "peak",
  "targetPeriod": "off_peak",
  "estimatedEnergyChargeBefore": 1.0,
  "estimatedEnergyChargeAfter": 0.8,
  "estimatedSavings": 0.2,
  "currency": "INR",
  "note": "Illustrative example values only; live result must be calculated from tariff.json."
}
```

The numerical values above are illustrative schema values only. If the applicable tariff or load constraints cannot be verified, return an explicit explanation instead of invented savings.

### `POST /api/advice`

Request:
```json
{
  "scenarioId": "demo-30day",
  "tariffProfileId": "kseb-domestic-demo",
  "question": "What should I try changing?",
  "selectedFindingIds": ["finding-1"]
}
```

Backend recalculates or retrieves trusted analysis results, then passes those results to the configured LLM. The LLM explains what was detected, why it matters, and what the user can try. It cannot invent tariff rates, consumption, savings, or pretend synthetic data is live. Keep the API key server-side. If no key/API call is available, return a deterministic fallback explanation.

Response:
```json
{
  "provider": "llm-or-fallback",
  "insights": [
    {
      "title": "Evening use is above the observed baseline",
      "findingId": "finding-1",
      "explanation": "Explanation based on the computed result.",
      "suggestedAction": "Test shifting an eligible flexible load and compare the calculated charge.",
      "estimatedSavings": null
    }
  ],
  "disclaimer": "Simulated-data analysis; estimates depend on configured tariff eligibility and assumptions."
}
```

## 6. Frontend/backend ownership

### Frontend agent
- Only implement `frontend/` plus a request for changes to the contract if essential.
- Build dashboard, scenario selector, charts, threshold warnings, optimization controls, and AI insight UI.
- Use the endpoints above through a single API client module; do not implement tariff math or anomaly detection in the browser.
- Include loading, empty, error, and offline/API-failure states.
- Show `SIMULATED DATA` clearly whenever demo datasets are selected.

### Backend agent
- Only implement `backend/` and agreed updates to root documentation.
- Implement Express routes, CSV loading/normalization, validation, tariff engine, threshold logic, statistical baselines, optimizer, and advisor/fallback.
- Keep the calculation functions separate from route handlers where practical.
- Do not hardcode response example numbers. Read rate rules from `tariff.json`.
- Do not use `is_injected_spike` to detect an anomaly. It may be used only in a test/evaluation script to measure detector results.
- Configure CORS for `http://localhost:5173` and return consistent JSON errors.

### Integration/test owner
- Check the shared contract before either agent changes it.
- Run backend and frontend, test endpoint payloads, test a profile switch, and test optimization from a source row with `shiftable_load_kwh > 0`.
- Test tariff boundaries and verify total kWh is preserved by optimization.
- Confirm the AI API key is not in frontend code or Git.
- Own final merge/deployment/demo rehearsal; do not rewrite the frontend/backend while their owners are implementing without coordinating.

## 7. Copy/paste prompt — frontend Cursor agent

> Read `INTEGRATION_CONTRACT.md` completely before coding. You own only `frontend/`. Build the Cliff Guard dashboard using React + Vite and the exact API routes, request fields, and response fields defined in the contract. First inspect the repository, then implement a working UI for scenario selection, simulated hourly/daily consumption charts, tariff-period breakdown, threshold warnings, optimization before/after comparison, and AI insights. Use one API client module configured by `VITE_API_BASE_URL`. Do not hardcode calculation outputs, do not duplicate tariff/anomaly logic in the frontend, and do not invent fields or endpoint names. Display `SIMULATED DATA` clearly. Add loading, error, empty and AI-fallback states. If an endpoint is not ready, create a thin API-client placeholder matching the contract and tell the backend owner what needs to be tested; do not invent a different contract. Work in small steps and at the end list changed files and exact run/test commands.

## 8. Copy/paste prompt — backend Cursor agent

> Read `INTEGRATION_CONTRACT.md` completely before coding. You own only `backend/`. Build the Node.js + Express API with the exact endpoints and JSON shapes in the contract. Load the provided CSV datasets, normalize timestamps and fields, and implement tariff calculations from `backend/src/config/tariff.json`, threshold warnings, hourly/daily totals, statistical pattern detection, flexible-load optimization, and an optional hosted LLM advisor with deterministic fallback. Never use `is_injected_spike` as a detection input; never hardcode the example values in the contract; never mark unverified tariff rules as official. The optimizer must preserve total kWh. Add CORS for the Vite origin, input validation, clear error JSON and a health endpoint. Keep secrets server-side. Work in small steps, test each endpoint, and provide exact startup/test commands plus sample `curl` requests. Do not edit `frontend/`.

## 9. Integration sequence

1. Commit this file and the `data/` CSVs to `main` first.
2. Jeff creates `feature/backend`; Jalph creates `feature/frontend`, both from the updated `main`.
3. Agree that the contract is frozen unless both agree on a change.
4. Backend owner should implement `/api/health`, `/api/demo/scenarios`, `/api/demo/readings` and `/api/tariff` first; frontend can build against the contract in parallel.
5. Merge both branches, start the backend on port 3001 and frontend on port 5173, then run the end-to-end checklist.
6. Alex handles integration testing, config/data validation, deployment, and demo rehearsal.

## 10. End-to-end acceptance checklist

- [ ] `GET /api/health` returns status ok.
- [ ] The demo dataset loads and is visibly labelled simulated.
- [ ] Charts and summaries change if the selected dataset or date changes.
- [ ] Period totals add up to the total kWh (subject only to rounding).
- [ ] Tariff and threshold numbers use the selected config and correct eligibility; unsupported/unverified calculations are labelled or withheld.
- [ ] A detected peak/spike is computed from consumption values; the injected-spike label is not used as model input.
- [ ] Optimization validates available flexible load, preserves total kWh, and recomputes costs.
- [ ] AI explanation uses actual computed findings; fallback works without an API key.
- [ ] No API keys or private data are committed.
- [ ] Both frontend and backend run locally and the complete demo works without manual code edits between steps.
