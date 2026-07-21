# Governed production dispatch

The durable path is `/api/governed-production-dispatches`. Plant membership, Bearer auth, tenant and idempotency headers are required. A job moves through timestamped source synchronization, constraint validation, schedule proposal, independent operator approval, dispatch receipt, execution feedback, exception recovery, and realized outcome. Stale events, incomplete offline buffers, or unverified safety limits deterministically fail to manual fallback; the service never emits machinery commands.

`backend/migrations/001_governed_operations.sql` is an explicit deployment step and creates tenant-scoped durable cases, immutable evidence/audit, optimistic versions, retention, and retryable connector-failure records. ERP/WMS/TMS/SCADA/telemetry/weather/CMMS connectors stay quarantined until read-only credentials, timestamp/idempotency contracts, replay tests, and site approval exist. Generated AI routes are disabled in production.

Historical replay must measure forecast/optimization error, constraint violations, latency, duplicates, missed events, and realized results on site-approved datasets. Hardware, PLC, robot, vehicle, SCADA write, safety-system, and operator credential gates are outside this local verification and fail closed.

Use `.env.example` through secret management and keep demo/bootstrap/provider switches false. Run `node --test backend/src/governance/workflow.test.cjs` and `bash -n start.sh`. The launcher neither installs nor mutates infrastructure and refuses occupied ports.
