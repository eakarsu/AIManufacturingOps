# Audit Note — AIManufacturingOps

Source audit: `_AUDIT/reports/batch_05.md` § 11

## Audit accuracy correction
The audit reported "0 routes, 0 AI endpoints" — **this is incorrect**. The project is a substantive monolithic Express app (`backend/src/index.js`, ~2,100 lines) with at least these AI-backed endpoints in production:

- `POST /api/routes/:id/optimize` — `openRouterService.optimizeRoute`
- `POST /api/safety/:id/predict` — `openRouterService.predictSafetyRisk`
- `POST /api/safety/cluster-analysis` — generic `openRouterService.makeRequest`
- `POST /api/assembly/:id/optimize` — `openRouterService.optimizeAssemblyLine`
- `POST /api/supply-chain/:id/analyze` — `openRouterService.analyzeSupplyChain`
- `POST /api/equipment/:id/predict` — `openRouterService.predictMaintenance`
- Several other inline AI calls (lines 1442, 1556, 1681 — generic completions)

The audit's TSV scanner missed inline `app.post(...)` definitions because they aren't in a separate `routes/` directory.

## Implemented in this pass
Backlog-only. No code changes — the monolith style and lack of an audit-derived recommendation list (the audit gave no specific endpoint suggestions for this project) makes mechanical additions risky and low-value.

## Backlog (priority order)

### Refactor
- Extract inline AI endpoints into `backend/src/routes/ai.js` for consistency with other batch projects (mechanical but large diff; deferred to avoid touching a 2,100-line file).

### Mechanical (if requested)
- Add `/api/ai/quality-defect-prediction`, `/api/ai/oee-anomaly-detection`, `/api/ai/inventory-stockout-predict` — service methods would need to be added to `openRouterService`.

### Needs creds / external SDK
- IoT / MES integrations for real-time machine data
- ERP integration (SAP, Oracle)
- Vision-based quality inspection (vision model + camera feeds)

### Needs product decision
- A product audit pass to update `_AUDIT/reports/batch_05.md` with a real recommendation list once the inventory of inline endpoints is captured.

## Apply pass 3 (frontend)

LEFT-AS-IS. `frontend/src/components/Routes.js`, `Safety.js`, `Equipment.js`, `Assembly.js`, `SupplyChain.js` already call the resource-scoped `:id/optimize|predict|analyze` AI endpoints with axios. Pass-2 was backlog-only, so no FE delta required. Idempotent.
