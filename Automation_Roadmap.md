# LuxLife Automation Roadmap

## Vision
Create a fully automated “push-button” experience where the Cursor agent can run, monitor, and optimize the entire LuxLife business from this codebase without manual console work. Every revenue-critical workflow should be executable, observable, and maintainable via scripted commands or MCP tools.

## Roadmap Phases

### Phase 1 — Core Pipeline Completion
1. **Upload validation & generation trigger**
   - Cloud Function `onOrderCreated` performs face validation, orchestrates Replicate/D-ID/Google TTS/FFmpeg, handles fallbacks, and updates Firestore with results.
   - Storage cleanup & order lifecycle logging implemented per spec.
2. **Stripe Checkout & credits**
   - Checkout session function issues metadata-linked orders.
   - Webhook grants credits, records payments, reconciles failed events.
   - Dashboard surfaces credit balance & order history in real time.
3. **Delivery & notifications**
   - Email/SMS notifications, signed URLs, social sharing assets.
   - Admin re-trigger endpoint for failed jobs.

### Phase 2 — Automation Hooks
1. **Management APIs**
   - Secure HTTPS callable functions for admin tasks (requeue order, issue refund, delete user data, regenerate marketing assets).
   - Firestore collections (`admin/metrics`, `logs/errors`) exposed in a structured format for automated reporting.
2. **Monitoring & alerts**
   - Daily cost/revenue aggregations with thresholds.
   - Error-rate alarms and retry dashboards.
3. **Operational dashboards**
   - UI components for internal staff to view pipeline status, queue length, credit utilization.

### Phase 3 — MCP Integrations
1. **Stripe MCP**
   - Query charge status, customer details, payouts directly from Cursor.
   - Trigger refunds or adjustments programmatically.
2. **Firebase MCP**
   - Deploy hosting/functions/rules, view logs, tail errors, inspect Firestore docs.
3. **Marketing/Analytics MCP**
   - Access PostHog/GA, email platforms, or ad networks to monitor campaigns.
   - Automate content publishing (demo videos, social posts).

### Phase 4 — Operational Scripts & Runbooks
1. **Command suite**
   - npm scripts or `just` recipes to: seed test data, trigger pipelines, sync marketing content, rotate API keys, back up Firestore.
2. **Continuous QA**
   - Automated end-to-end tests (photo upload → video delivery check).
   - Load testing scripts for pipeline stress.
3. **Documentation & SOPs**
   - Internal docs for disaster recovery, scaling, cost tuning.

## Success Criteria
- A single agent session (Cursor CLI or MCP) can:
  - Deploy/update the app and backend.
  - Launch promotions (generate demo assets, send campaigns).
  - Monitor key metrics (orders, revenue, API costs) and take corrective actions.
- No manual console steps required for day-to-day operations.
- Alerts auto-assign to the agent or log actionable items in Firestore.

## Next Immediate Tasks
- Finish Phase 1 items (order trigger, Stripe integration, delivery).
- Start drafting MPC tool requirements (Stripe + Firebase first).
- Build run scripts for order processing demos and marketing asset generation.

Document maintained by Cursor agent. Update after each phase milestone.

