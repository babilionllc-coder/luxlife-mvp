# LuxLife — Complete Step-by-Step Business + Implementation Plan (for Cursor AI)

> **Purpose:** Single, authoritative Markdown the Cursor AI agent will follow to build, deploy, monetize, and operate the LuxLife MVP end-to-end. This document is explicit, unambiguous, and organized so Cursor can execute each task in order without requiring additional clarification. **Always** follow the exact order of steps; if an external API or account is missing, apply the documented fallback and continue.

---

## Table of Contents
1. Executive Summary
2. Objectives & Success Metrics
3. Value Proposition & Product Definition
4. Market Opportunity & Competitive Positioning
5. Monetization Model & Financials
6. Technical Architecture Overview
7. Required Accounts, Keys & Quotas (what user provides)
8. Firestore Data Model & Security Rules
9. Full Step-by-Step Build Plan (Phase 0 → Launch)
10. Detailed Implementation Tasks (code-level, API calls)
11. Testing / QA Checklist
12. Privacy, Legal & Safety Checklist
13. Monitoring, Logging & Cost Tracking
14. Launch & 30-day Growth Plan
15. Scaling & Operational Playbook
16. Troubleshooting & Fallbacks
17. Appendix: Prompts, SSML, Sample FFmpeg, Sample Emails

---

## 1 — Executive Summary
LuxLife is a one-click AI product that converts a single user photo into a short (10–20s), vertical (9:16) "luxury lifestyle" video: photoreal face animation (lip-synced), cinematic background (AI-generated or curated), and voiceover personalized with the user's name. The MVP must be live within 24–48 hours using free tiers/trials and cost ≤ $50 before first sale. Cursor AI is the executor; the human will only supply API keys once and minimal approvals. This document instructs Cursor how to build, test, and launch the product end-to-end and how to operate it for early monetization.

---

## 2 — Objectives & Success Metrics
**Primary objective:** Launch an MVP that can make its first paid sale within 24 hours of deployment.

**Key metrics to meet within first 14 days:**
- First paid sale within 24 hours of launch.
- Conversion: 3–5% trial-to-paid (target 20% of trial users buy).
- Revenue target: $1,000/day within 30–90 days (scale plan included).
- Cost per video (variable) below $3 at scale (tracked and optimized).
- Video quality: 80%+ user satisfaction in informal surveys.

---

## 3 — Value Proposition & Product Definition
**Core product:** "Upload a selfie → choose a luxury scene and tone → get a cinematic short video with your animated face and voice."

**Unique Selling Points (USPs):**
- Single-photo photoreal face animation + lip sync (D-ID or equivalent).
- Custom AI-generated cinematic vertical backgrounds (Replicate/Stable Diffusion or curated stock) optimized for TikTok/Reels.
- Name-personalized speech using SSML + Google WaveNet.
- Instant social-ready export (caption suggestions + hashtags).

**MVP Limitations (explicit):**
- Not for impersonation or political content.
- Default deletion of source photos after 7 days unless user opts to store (paid option).
- Some fallbacks will reduce visual fidelity (documented).

---

## 4 — Market Opportunity & Competitive Positioning
High demand among content creators, micro-influencers, and casual social users for personalized, viral-ready short video content. Competitive edge: fast, low-cost, one-click creation focusing on personalization and 'luxury aspirational' aesthetics. Compete by speed, pricing, and ease of use (no editing skills required).

---

## 5 — Monetization Model & Financials
**Pricing (MVP):**
- 1 video (1 credit) = $9.99
- 3 credits = $24.99
- 10 credits = $74.99
- Optional upsell: commercial license +$49, fast-track +$5

**Initial cost plan (≤ $50):**
- Use D-ID free trial credits for first 20–50 videos.
- Use Replicate free/test runs; if not free, use curated stock loops from Pexels (free).
- Use Google Cloud TTS free tier (sufficient for initial runs).
- No paid ads until first demo videos and influencer outreach use free seeding.

**Simple revenue projection (example):**
- If conversion after seeding: 100 purchases/day × $9.99 = $999/day.
- Break-even depends on API costs: track per-job cost in DB and adjust prices.

---

## 6 — Technical Architecture Overview
**Components & responsibilities:**
- **Frontend (Next.js on Firebase Hosting)**: upload, scene selection, checkout, dashboard.
- **Auth & DB (Firebase Auth + Firestore)**: user accounts, credits, orders.
- **Storage (Firebase Storage)**: raw uploads and final videos (signed URLs).
- **Backend (Firebase Cloud Functions)**: orchestrator functions for generation, Stripe webhooks, scheduled jobs.
- **Generative APIs**: D-ID (face animation), Replicate (background), Google TTS (voice).
- **Media assembly**: FFmpeg called inside cloud function or external worker (Fly.io) if Functions environment disallows FFmpeg.
- **Payments**: Stripe Checkout + webhooks to grant credits.
- **Optional CDN/optimization**: Cloudinary for transformations and CDN (if budget allows).

**High-level flow:**
1. User uploads photo → Storage.
2. Frontend writes `orders/{orderId}` with `status:pending` and `meta` including `scene` and `script`.
3. Cloud Function `onOrderCreated` triggers: validate face → generate background → create TTS → call D-ID → assemble via FFmpeg → upload result → mark `orders` complete.
4. User notified by email & frontend polling reads `orders` to show result.

---

## 7 — Required Accounts, Keys & Quotas (user supplies once)
Cursor should request these **once** and store them securely in Firebase Functions config or hosting env secrets.

- Firebase: Project ID + Web Config (apiKey, authDomain, projectId, storageBucket, appId)
- Stripe: Publishable key, Secret key (Test mode recommended initially)
- D-ID: API Key (or `"NONE"` to force fallback)
- Replicate: API Token (or `"NONE"` fallback to stock clips)
- Google Cloud: Service Account JSON for TTS (Cursor should base64 encode and store in functions config)
- Optional: SendGrid API Key (for emails) or use Firebase Email Extension

**Secrets validation rules:** If any secret is missing, Cursor must record which fallback will be used and proceed. Don't halt workflow indefinitely waiting for keys.

---

## 8 — Firestore Data Model & Security Rules
**Collections:**
- `/users/{uid}`:
  - `email`, `credits` (int), `createdAt`
- `/orders/{orderId}`:
  - `uid`, `status`, `scene`, `script`, `faceImagePath`, `videoPath`, `costEstimate`, `quality`, `createdAt`, `updatedAt`
- `/payments/{paymentId}`: store Stripe metadata
- `/logs/errors/{errorId}`: store structured errors and stack traces

**Security rules (high level):**
- Only authenticated users read/write their own `/users/{uid}` and `/orders/*` documents.
- Storage rules: only authenticated users can upload to `uploads/{uid}/...`; only Cloud Functions service account can write to `videos/` path.
- Admin-only access for `payments/` and `logs/` collections.

Cursor must write these rules to `firestore.rules` and deploy them during Step 1.

---

## 9 — Full Step-by-Step Build Plan (Phases + Exact Cursor Commands)
Cursor must support `NEXT: <label>` triggers. Each labeled step must be executed in order. After each step Cursor outputs a short checklist and artifacts (repo URL, staging URL, function logs).

> **Important:** If any call requires user confirmation (e.g., enabling Blaze billing), Cursor should present the option and default to the cheapest workable fallback automatically if the user declines.

### Phase 0 — Project init
**Label:** `NEXT: INIT`

Actions (Cursor):
1. Create repo `luxlife-mvp` and push to GitHub (ask user for permission; fallback: local repo).
2. Scaffold directories (`frontend`, `functions`) and `firebase.json`, `README.md`.
3. Create `package.json` for frontend and functions and install packages:
   - Frontend: `next react react-dom firebase @stripe/stripe-js axios tailwindcss`
   - Functions: `firebase-admin firebase-functions axios fluent-ffmpeg @google-cloud/text-to-speech node-fetch`
4. Create sample `.gitignore` and `README.md` template listing NEXT commands.

Expected artifacts:
- GitHub repo URL or local path
- `npm install` logs

### Phase 1 — Firebase setup & env config
**Label:** `NEXT: FIREBASE_SETUP`

Actions (Cursor):
1. Request Firebase project ID and web config.
2. Run `firebase init` for Hosting, Functions, Firestore.
3. Set functions config with supplied secrets:
   ```bash
   firebase functions:config:set stripe.secret="..." stripe.pub="..." did.key="..." replicate.token="..." gcloud.service_account="BASE64_JSON"
   ```
4. Write `firestore.rules` and deploy rules.
5. Ensure Cloud Functions API enabled. If FFmpeg needs extra runtime or Blaze plan, ask user: if user declines, set FFmpeg to run on small Railway/Fly.io worker and document costs.
6. Deploy a simple "hello world" cloud function to confirm deployment.

Expected artifacts:
- Firebase project linked and function deployed
- Masked list of stored configs printed for audit

### Phase 2 — Frontend scaffold & upload flow
**Label:** `NEXT: FRONTEND_SCAFFOLD`

Actions (Cursor):
1. Create Next.js pages: `/`, `/upload`, `/dashboard` with React components.
2. Implement `UploadForm`:
   - Client-side lightweight face-check using `face-api.js` if feasible (browser);
   - If heavy, accept upload then validate server-side.
   - Upload to `uploads/{uid}/{orderId}/photo.jpg` in Storage.
   - Create Firestore doc `/orders/{orderId}` with `status: pending` and metadata.
3. Display credit balance in header (read `/users/{uid}.credits`).
4. If user has zero credits, prompt Stripe checkout flow.

Expected artifacts:
- Deployed frontend staging URL (Firebase hosting) or local dev link
- Test upload creates Firestore doc

### Phase 3 — Stripe checkout & webhook
**Label:** `NEXT: STRIPE_SETUP`

Actions (Cursor):
1. Create Stripe products (test mode):
   - 1 credit = $9.99
   - 3 credits = $24.99
   - 10 credits = $74.99
2. Implement Cloud Function `/createCheckoutSession` that creates a Checkout Session with `metadata` containing `uid`.
3. Implement Cloud Function `stripeWebhook` to process events:
   - On `checkout.session.completed` → increment `/users/{uid}.credits` by `quantity` in metadata.
   - Save event to `/payments/` for audit.
4. On frontend, call `/createCheckoutSession` to redirect to Stripe Checkout and use test card `4242 4242 4242 4242` for validation.

Expected artifacts:
- Working checkout flow in test mode
- Firestore credits updated on test purchase

### Phase 4 — Generation orchestrator (core)
**Label:** `NEXT: GENERATION_FUNCTION`

Actions (Cursor):
1. Create Cloud Function `onOrderCreated` triggered on new `/orders/{orderId}` with `status: pending`.
2. Implementation steps inside function (exact order — **must be followed**):
   - **A. Debit credit:** Verify `users/{uid}.credits >= cost`. If insufficient, set order `failed` and notify front-end. If this was a free trial (credits=1 default), allow first job and set credits to 0 after job creation.
   - **B. Download uploaded photo** to `/tmp` for processing.
   - **C. Face validation & crop:** Use Google Vision face detection (preferred) or `face-api.js` server-side. If not exactly one face, set `status = failed` with `error='face_validation'` and notify user with guidance.
   - **D. TTS generation:** Generate `voice.mp3` using Google TTS with SSML script (insert user name). Save to tmp.
   - **E. Background generation:** If `replicate.token` exists use Replicate model for vertical 1080x1920 image or short 5–12s loop; if model returns image, convert into a 10–12s pan/zoom loop with FFmpeg. If no replicate token, download a curated vertical stock clip from Pexels (Cursor includes a short list of URLs).
   - **F. Face animation:** If `did.key` exists, call D-ID API with the cropped face and either TTS audio (preferred) or script; get animated `face_video.webm` or mp4. If D-ID fails or missing, fallback to Replicate face-animation model or to a parallax approach: cutout face + slight head bob + mouth-open morph (lower quality).
   - **G. Combine with FFmpeg:** Use exact command provided in Appendix (adjust sizes) to overlay face video centered on background, mix in voice and music, export to `out.mp4` as H.264 720x1280 (or 1080x1920) vertical.
   - **H. Upload out.mp4** to `videos/{orderId}.mp4` in Storage and update `orders/{orderId}` with `videoPath` and `status: complete` and `costEstimate`.
   - **I. Send notification email** (SendGrid or Firebase Email extension) with download link and social sharing tips.
   - **J. Schedule deletion** of original photo (7 days) — add TTL or scheduled cleanup job (next label).
3. Implement retries with exponential backoff on each external API (max 3 retries). Log all failures to `/logs/errors` with structured data and store stack traces.

Expected artifacts:
- Completed video files in Storage after order processed
- Orders show `status: complete` and `videoPath` filled

### Phase 5 — Test end-to-end & staging deployment
**Label:** `NEXT: TEST_AND_DEPLOY`

Actions (Cursor):
1. Create test user and ensure default `credits = 1`.
2. Upload sample photo and trigger pipeline. Observe function logs.
3. If pipeline completes — verify video plays and audio syncs.
4. Simulate purchase and verify credits increment and subsequent generation works.
5. Deploy frontend + functions to `firebase deploy --only hosting,functions` (or Vercel for frontend with functions pointing to Firebase).

Deliverables:
- Public staging URL
- Example successful order with downloadable video
- Deployment log summary

### Phase 6 — Monitoring, privacy & marketing assets
**Label:** `NEXT: MONITOR_AND_MARKET`

Actions (Cursor):
1. Implement scheduled Cloud Function `dailyCleanup` to delete photos older than 7 days and optionally videos older than X days unless user opted-in for storage.
2. Implement error alerting: write a summary doc `/admin/summary` and send email when error rate > 5% in 24h.
3. Generate 5 demo videos using free credits and save to `public/samples` for marketing.
4. Produce 3 TikTok-ready short clips and 3 caption templates + hashtags.
5. Create a one-page Launch Checklist and an outreach email template for influencers.

Deliverables:
- Cleanup function scheduled
- Marketing assets created

### Phase 7 — Launch
**Label:** `NEXT: LAUNCH`

Actions (Cursor):
1. Confirm UI includes TOS & Privacy with explicit face-photo consent checkbox.
2. Confirm Stripe webhook is stable; migrate to live keys only when user confirms readiness.
3. Publish launch posts and trigger 20 micro-influencer outreach with promo codes (cursor should output CSV of codes & emails).
4. Monitor traffic, errors, and costs closely for first 48h and throttle generation if costs spike.

Deliverables:
- Live product (if user opted to switch to Stripe live mode)
- Launch report (first 48h summary)
- Initial revenue & conversion metrics

---

## 10 — Detailed Implementation Tasks (Code-level & API calls)
**A. D-ID call (preferred flow):**

- Endpoint: `https://api.d-id.com/` (use official docs).
- Payload (example): image file + audio or script (check D-ID docs for exact fields).
- Wait for returned `video_url`. Save to tmp then use FFmpeg if needed.

**B. Replicate background call (example):**

- POST to Replicate create endpoint with model & prompt fields.
- Prompt example (vertical): `"Vertical 9:16 ultra-realistic luxury penthouse at sunset..."`.
- Request width=1080 height=1920 (if supported).

**C. Google TTS:**

- Use google cloud text-to-speech client from `@google-cloud/text-to-speech`.
- Generate mp3/wav from SSML that includes user name and tone.
- Sample SSML in Appendix.

**D. FFmpeg assembly:**

- Use `fluent-ffmpeg` in Node or call native `ffmpeg` executable. Provide sample command in Appendix — adjust paths to tmp files created.

**E. Stripe webhook security:**

- Retrieve `stripe-signature` header and verify with `stripe.webhooks.constructEvent(payload, sig, endpointSecret)`.
- Map session metadata to `uid` and update `/users/{uid}.credits` atomically (transaction).

**F. File/temp handling in Cloud Functions:**

- Use `/tmp` directory for temp files; ensure cleanup after process.
- If Cloud Functions filesystem limits block FFmpeg, call an external worker endpoint on Fly.io / Railway and pass signed URLs to operate there.

---

## 11 — Testing / QA Checklist
Cursor must run the following tests and log results (pass/fail):

1. **Unit tests** for helper functions (face-crop, cloud storage upload, stripe webhook handler).
2. **Integration test:** Upload -> order created -> cloud function triggered -> final video produced.
3. **Edge cases:**
   - Photo has 0 faces → order fails gracefully.
   - Photo has multiple faces → ask user to crop and retry.
   - API rate limit error → retries then fail with clear message.
4. **Payment test:** Stripe test checkout increments credits and allows generation.
5. **Privacy test:** Uploaded file is deleted after configured TTL (simulate expiry).

Record all test logs in repo under `/tests/logs`.

---

## 12 — Privacy, Legal & Safety Checklist
- Add a clear consent checkbox before upload: "I consent to my image being used to generate AI media. I own this photo or have permission."
- Privacy Policy: state deletion policy (7 days), retention options, and takedown procedure.
- Takedown endpoint: Cloud Function to delete all user data when requested.
- No content allowed: minors impersonation, political content, hate speech, explicit sexual content, or illegal activities. Implement simple content filter on script text (reject scripts with banned keywords).
- Record consent boolean in `/users/{uid}.consent`.
- Provide an easy “Delete my data” link in dashboard which triggers deletion function.

---

## 13 — Monitoring, Logging & Cost Tracking
- Log each job's approximate cost estimate: store `orders/{orderId}.costEstimate` (sum of D-ID, Replicate, TTS run costs).
- Track daily API usage and cost in `/admin/metrics` via scheduled function that aggregates usage counts.
- Set alert: if daily estimated cost > $50, pause new orders and notify admin via email.

---

## 14 — Launch & 30-day Growth Plan (detailed)
**Pre-launch (days -7 to 0):**
- Create 10 high-quality demo videos (vary scenes).
- Produce 10 social posts (TikTok/IG) with before/after format.
- Reach out to 50 micro-influencers with a short pitch + 3 free credits each.
- Prepare $100 ad experiment budget (start with $20 test on TikTok).

**Launch week (days 1–7):**
- Run $20 TikTok ad aimed at creators & lifestyle audience.
- Post case studies & testimonials from influencers.
- Monitor conversion, optimize landing page, add urgency copy (limited-time promo).

**Weeks 2–4:**
- Double down on best-performing channels.
- Implement referral codes and 10% commission for influencers.
- Add email capture + drip onboarding for new signups.

---

## 15 — Scaling & Operational Playbook
- Replace trial API usage with paid bulk plans when stable revenue emerges.
- Introduce queueing & autoscaling for processing workers. Use Pub/Sub or work-queue in Firestore.
- Introduce rate limiting per IP/user to prevent abuse.
- When daily orders grow, estimate marginal cost and renegotiate API pricing with providers (D-ID, Replicate) or transition to self-hosted open models when viable.

---

## 16 — Troubleshooting & Fallbacks (executed automatically)
1. **FFmpeg fails in Cloud Functions** → redirect assembly to Fly.io worker (small container with ffmpeg) and continue.
2. **D-ID API rate-limited** → fallback to Replicate face-model or lower-fidelity parallax.
3. **Replicate unavailable** → use curated Pexels stock assets (links in appendix).
4. **Stripe webhook fails** → retry and store event in `/webhooks/pending` for manual reconciliation.
5. **Storage full** → pause new orders & notify admin

---

## 17 — Appendix (Prompts, SSML, Sample FFmpeg, Email templates)

### A. Stable Diffusion / Replicate background prompt (vertical)
```
Vertical 9:16 ultra-realistic luxury penthouse at sunset, glossy glass windows, city skyline in distance, soft golden-hour lighting, cinematic depth of field, photorealistic.
```

### B. D-ID Script example
```
"Hi, I'm [NAME]. Living my best life — rooftop sunsets, private jets, and champagne nights. Want this vibe? Let's go."
```

### C. Google TTS SSML
```xml
<speak>
  <prosody rate="0.95" pitch="0%">
    Hi, <break time="200ms"/> I'm <say-as interpret-as="name">[NAME]</say-as>. Living my best life — rooftop sunsets and champagne nights.
  </prosody>
</speak>
```

### D. FFmpeg example (overlay + audio)
```bash
ffmpeg -y -stream_loop -1 -t 12 -i bg.mp4 -i face.webm -i voice.mp3 -i music.mp3 \
  -filter_complex "[1:v]scale=540:-1,format=rgba[face];[0:v][face]overlay=(W-w)/2:(H-h)/2:shortest=1[v]" \
  -map "[v]" -map 2:a -map 3:a -c:v libx264 -crf 22 -preset veryfast -c:a aac -shortest out.mp4
```

### E. Sample notification email (after generation)
**Subject:** Your LuxLife video is ready 🎬
**Body:** Hi [Name], your LuxLife video is ready! Download it here: [link] — best for TikTok/Instagram (9:16). Tips: post with caption "My LuxLife moment" and hashtags #LuxLifeAI #AIReel

---

## Final operational rule for Cursor
- **Always** try the preferred provider (D-ID, Replicate, Google TTS) if API key is present. If any provider responds with a permanent error or no trial credit, **automatically** switch to the documented fallback and mark `orders/{orderId}.quality = 'fallback'` so the user sees expected quality differences.
- **Never** make destructive changes without confirming with the user (e.g., enabling paid billing). If user refuses Blaze plan and FFmpeg cannot run, fall back to external worker but confirm any cost > $5 first.

---

**End of LuxLife — Master Execution Plan**

Paste this file into the project root and instruct Cursor to run `NEXT: INIT` when you're ready. Cursor must report each step's artifacts (repo URL, staging URL, function logs) as it completes them.
