# LuxLife MVP – Project Status Reference

This document summarizes the end-to-end state of the LuxLife build as of **November 8, 2025**. It captures the features we’ve delivered, infrastructure we configured, automation in place, and outstanding risks. Treat it as a quick orientation guide for anyone picking up the project.

---

## 1. Product Overview
- **Value proposition:** Convert a single user portrait into a luxury lifestyle video.
- **Stack snapshot:** Next.js 14 (App Router) + Tailwind on the frontend, Firebase (Auth, Firestore, Storage, Cloud Functions) for backend, plus external APIs (Replicate, D-ID, Google TTS, Stripe, Resend).
- **Core user flow:** Sign up → upload portrait → choose scene/tagline → order document created → Cloud Functions orchestrate background/voice/animation → final clip returns to dashboard + email notification.

---

## 2. Frontend Implementation (`app/`, `src/`)
### 2.1 Key Routes
- `/` (`app/page.tsx`): Landing page with value proposition and inline auth form.
- `/upload` (`app/upload/page.tsx`): Protected route for portrait upload. Uploads file first → then creates Firestore order to avoid race conditions.
- `/dashboard` (`app/dashboard/page.tsx`): Lists orders with status badges, error/fallback messaging, download buttons.

### 2.2 Auth & Client Libraries
- `src/components/AuthForm.tsx`: Email/password + Google login, creates `users` document, handles error states.
- `src/lib/firebase/client.ts`: Client-side Firebase initialization (Auth, Firestore, Storage).
- Realtime updates via `onSnapshot` for user orders.

### 2.3 UI Enhancements
- Status badges aligned with backend pipeline states (`queued_generation`, `generating_background`, `processing`, `complete`, `failed`).
- Fallback messaging surfaces when Replicate fails or returns still images.
- Dashboard displays error codes/messages when available.

---

## 3. Backend / Cloud Functions (`functions/src/index.ts`)
### 3.1 Functions Deployed
- `onOrderCreated`: Debits user credit, validates portrait file, refunds on validation failure, transitions order to queued generation.
- `onOrderQueuedGeneration`: Full pipeline orchestrator.
  - **Replicate:** Generates cinematic background. Fallback logic handles insufficient credits or non-video outputs.
  - **Google TTS:** Synthesizes voiceover; stores `voice.mp3`.
  - **D-ID:** Animates portrait; polls status.
  - **FFmpeg:** Composes background + animated face; falls back to animation-only clip.
  - Updates Firestore with `pipeline.generation.*` metadata and fallback diagnostics.
  - Uploads final video to `videos/{uid}/{orderId}/final.mp4`.
  - Refunds credits and sets status `failed` on any unrecoverable error.
- `sendResendEmail` helper: Emails users on success/failure, including fallback notice.

### 3.2 Config & Dependencies
- Node.js 20 runtime.
- FFmpeg via `fluent-ffmpeg` + `ffmpeg-static`.
- Environment config via Firebase Functions `config:set` and `.env` (migrating away from legacy functions.config before Mar 2026 is noted in docs).

### 3.3 Security & Credits
- Credits debited atomically using Firestore transactions; refunded on failure.
- Fallback metadata persisted for observability.
- All temporary files managed under `/tmp` with cleanup.

---

## 4. Firebase Configuration
- `firebase.json`: Hosting (framework integration), Functions codebase, rules targets.
- `firestore.rules`: 
  - Users can read/update their own `users` doc, create only their UID, no deletes.
  - Orders: create allowed for owner; updates restricted to functions (`admin` claim).
- `storage.rules`: 
  - `uploads/{uid}` read/write for owner (<10MB cap).
  - `videos/{uid}` read for owner or admin; writes restricted to admin tokens.
- `.firebaserc`: Points to project `luxlifemvp`.
- Artifact Registry cleanup policy set (30-day retention) post-deploy.

---

## 5. External Integrations
| Service | Status | Notes |
|---------|--------|-------|
| Stripe | Planned (guide drafted) | Checkout/credits not yet wired. |
| Replicate | Integrated | Requires active credits; fallback handles 402 errors. |
| D-ID | Integrated | API key stored in Functions config. |
| Google TTS | Integrated | Uses default service account credentials. |
| Resend | Integrated | API key configured via Functions config; email templates set. |

Secrets tracked in `Secrets_and_Integrations.md` (names only, no raw values). `.cursor/env.json` removed and gitignored after keys were detected in repo.

---

## 6. Automation & Tooling
- **Cursor CLI Automation:** `docs/Cursor_CLI_Automation.md` outlines maintenance scripts; `.github/workflows/cursor-maintenance.yml` runs weekly lint/format via headless CLI and opens PRs.
- **Roadmap:** `Automation_Roadmap.md` tracks long-term automation milestones (Phases 1–4).
- **Other docs:** `LuxLife_Master_Plan.md`, `LuxLife_CursorAI_BuildPlaybook.md`, `Video_Generation_Pipeline.md`, `AI_Fallbacks_And_ErrorHandling.md`, etc.

---

## 7. Testing & Quality
- Manual flows verified through uploading test image (Replicate failure due to credits handled gracefully).
- Linting: `npm --prefix functions run lint` and `npm run lint` (note: the latter needs `.firebase/_next` cleanup, handled in workflow).
- Type checks via `npm --prefix functions run build` (TS compilation).
- No automated E2E tests yet; recommended in roadmap Phase 4.

---

## 8. Outstanding Items / Risks
1. **Stripe integration:** Credits purchase + webhook reconciliation still pending.
2. **Functions config migration:** Must move from `functions.config()` to `.env` style before Mar 2026.
3. **Replicate/D-ID credits:** Need monitoring & auto top-up alerts (planned automation).
4. **Automated QA:** No E2E tests verifying final video output—should be added once credits are stable.
5. **Security review:** Firestore/Storage rules validated manually; formal penetration/stress testing outstanding.

---

## 9. Next Priorities
1. Add `CURSOR_API_KEY` secret in GitHub and trigger the new maintenance workflow.
2. Implement Stripe Checkout → webhook → credit balance flow.
3. Add monitoring scripts (credit watchdog, pipeline smoke test) via Cursor headless mode once Stripe is live.
4. Prepare analytics/marketing automation (PostHog, Slack alerts) after pipeline stabilizes.

---

_Maintained by Cursor agent. Update this reference after major milestones (deployments, integrations, automation changes)._


