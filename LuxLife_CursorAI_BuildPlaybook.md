## LuxLife MVP PRD

### 1. Overview
- **Vision** Create short, personalized, vertical “luxury lifestyle” videos from a single user photo.
- **MVP Promise** User uploads a face photo → receives a 9:16, 10–20 s cinematic clip featuring themselves in a high-end scene with optional voice-over.
- **Launch Objective** Go live today, reach first revenue transaction within 24 hours, keep spend ≤ $50 (free trials/tiered services wherever possible).

### 2. Goals & KPIs
- **Activation** 60 % of visitors upload a face photo in session.
- **Conversion** 15 % of activated users purchase ≥ 1 paid credit within 24 h.
- **Fulfillment** 95 % of videos delivered < 10 minutes from payment.
- **Churn** < 5 % refund requests due to quality/privacy concerns.
- **Support** < 1 support ticket per 20 paid orders.

### 3. Key Constraints
- Budget ceiling: $50 total (hosting, auth, APIs, tooling).
- Time to first monetized outcome: < 24 hours.
- Monetization: credit system (1 free trial, additional videos $5–$25).
- Video spec: 9:16 aspect ratio, 10–20 s, < 20 MB output.
- Privacy: auto-delete user assets after 7 days, explicit consent before upload.
- Resource: solo developer, no custom GPU infra.

### 4. User Personas
- **Influencers** Need fresh luxury-themed reels; value speed and style.
- **Aspiring creators** Want glamorous content for social profiles.
- **Gift-givers** Purchase videos for friends/partners.

### 5. Core User Flow
1. **Landing → Sign Up** Next.js SPA prompts Firebase Auth (email/password + social login).
2. **Profile Photo Upload** Client validates file (<10 MB, JPG/PNG); server triggers face detection (Google Vision API or `face-api.js`) to ensure a single face.
3. **Scene Selection** User chooses preset (e.g., Rooftop Sunset, Supercar Night, Infinity Pool). Optional fields: name, short tagline, voice-over preference.
4. **Preview** Generate lightweight still or low-res GIF (thumbnail from Replicate background + user face overlay) to set expectations.
5. **Credits & Payment** Stripe Checkout (test mode at launch) sells packs: Starter (1 credit/$7), Premium (3/$18), Luxe (6/$30). Onboarding includes 1 free credit.
6. **Generation Pipeline** On credit redemption, orchestrate:
   - Background generation (Replicate Stable Video Diffusion) or stock fallback.
   - Face animation with D-ID.
   - Voice-over via Google Cloud TTS.
   - FFmpeg composition (merge audio, apply color grading LUT, overlay branded intro/outro).
7. **Delivery** Upload final video to Firebase Storage, send download link via frontend + email.
8. **Aftercare** Schedule auto deletion (Firebase Function cron) after 7 days. Offer share buttons (TikTok, Instagram, WhatsApp).

### 6. Functional Requirements
- **Auth & Profile** Firebase Auth, store minimal profile info (`displayName`, credits balance).
- **Credits Ledger** Firestore collection `credits` logging issuance, redemption, status.
- **Upload Validation** Reject non-face images, multiple faces, NSFW (Vision API safe-search).
- **Scene Presets** Config in Firestore `presets` collection (prompt text, LUT path, price multiplier).
- **Order Management** Firestore `orders` for payment + generation state machine (`pending`, `processing`, `complete`, `failed`).
- **Notification** Email (Resend or Firebase Extensions) on video readiness.
- **Admin Console** Simple secured page to monitor orders, re-trigger generation, adjust prompts.
- **Analytics** Vercel Analytics + Stripe events + Firestore counters.

### 7. Non-Functional Requirements
- **Latency** Under 60 s to start generation job, under 10 minutes to complete.
- **Reliability** Automatic retries on API failure (exponential backoff, max 3 attempts).
- **Scalability** Stateless Cloud Functions; leverage queue (Firestore trigger or Workflows).
- **Security** HTTPS everywhere, signed URLs for storage, secrets in Firebase config.
- **Compliance** Terms & consent capture, GDPR-style deletion (auto + manual request).
- **Observability** Logging via Firebase Functions + third-party (Sentry) for errors.

### 8. Architecture

**Frontend**
- Next.js 14 SPA on Vercel (free tier, Analytics basic).
- Tailwind for styling, Framer Motion for animations.
- Upload via Firebase Storage SDK with resumable uploads.

**Backend**
- Firebase Cloud Functions (Node 18 runtime) orchestrating pipeline.
- Firestore for auth profile, credits, orders, audit logs.
- Firebase Task Queue (or Workflows) to sequence asynchronous steps.
- Scheduled Cloud Function (`pubsub.schedule("every 24 hours")`) to purge expired assets.

**3rd-Party Integrations**
- D-ID API: Live Portrait/Creative Reality for face animation. (Free trial $20 credit, single video ≈$0.20–$0.50)
- Replicate: Stable Video Diffusion or ModelScope text-to-video for backgrounds. (Free tier 25 runs, then ~$0.05–$0.15 per run)
- Google Cloud TTS: Standard voice free for first 1M chars; < 1,000 chars per script.
- Google Vision: 1,000 units/month free for label/face detection.
- Stripe: Checkout + Billing for credit packs (test mode initially).
- Optional fallback: Pexels API for stock luxury clips if generation fails.

**Processing**
- FFmpeg binary bundled via `ffmpeg-static` npm module inside Functions (ensure < 512 MB). Process:
  1. Stretch/trim background video to 10–20 s.
  2. Compose D-ID face animation overlay with alpha.
  3. Sync audio track (Google TTS).
  4. Apply LUT/color filter, upscale to 1080x1920 if needed.
  5. Encode H.264, AAC, target < 20 MB.

### 9. Example FFmpeg Assembly Command
```
ffmpeg \
  -i gs://luxlife-temp/background.mp4 \
  -i gs://luxlife-temp/did-face.webm \
  -i gs://luxlife-temp/voiceover.mp3 \
  -filter_complex "[1:v]scale=1080:1920:force_original_aspect_ratio=increase,format=yuva420p[fg]; \
                   [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[bg]; \
                   [bg][fg]overlay=(W-w)/2:(H-h)/3:format=auto, \
                   colorchannelmixer=.9:.03:.03:0:.02:.9:.02:0:.01:.02:.9:0:0:0:0:1[lut]" \
  -map "[lut]" -map 2:a \
  -c:v libx264 -profile:v high -preset medium -b:v 3M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest \
  -movflags +faststart \
  /tmp/luxlife-final.mp4
```
- Use signed URLs in production rather than direct `gs://` paths.
- Ensure Cloud Functions temporary storage `/tmp` (< 512 MB) cleared after upload.

### 10. Presets & Prompt Library
- **Rooftop Sunset**
  - Script template: “Hi, I’m {NAME}. Living my best life with golden sunsets and city lights—this is the LuxLife.”
  - Background prompt (Replicate): “Cinematic 9:16 video, luxury penthouse rooftop infinity pool at sunset, champagne, lens flare, ultra realistic.”
  - LUT: warm golden hour filter.
- **Supercar Night Run**
  - Script: “{NAME} here. Nothing beats neon nights and the roar of my supercar. See you in the fast lane.”
  - Prompt: “Vertical 9:16 cinematic scene of neon-lit city street with luxury sports car drifting, dynamic camera, slow motion.”
- **Tropical Infinity Pool**
  - Script: “From meetings to martinis—{NAME} always finds time for paradise.”
  - Prompt: “High-end beach resort infinity pool at dusk, cinematic lighting, palm trees swaying, gentle camera push-in.”
- Store prompts in Firestore; allow admin edits without redeploy.

### 11. Monetization & Pricing
- **Trial** Automatic 1 credit on signup (limited to 1 generation).
- **Paid Packs**  
  - Starter: 1 credit, $7  
  - Premium: 3 credits, $18 (40 % margin)  
  - Luxe: 6 credits, $30 (50 % margin)
- **Cost Estimates per Video**  
  - D-ID: $0.20–$0.50  
  - Replicate background: $0.05–$0.15  
  - Google TTS/Vision: ≈ $0.00 (free tier)  
  - Firebase/Hosting: free tier  
  - Total COGS: $0.25–$0.65 → margin ≥ 90 % on paid tiers.
- **Upsell** Add-on voice personalization (custom script) +$5.
- **Stripe Setup** Checkout session with metadata linking to Firebase `orders` doc; use `stripe-cli` to test webhooks locally before deploy.

### 12. Launch Plan (0–24 h)
- **Hour 0–2** Scaffold Next.js app, integrate Firebase Auth/Firestore, configure presets.
- **Hour 3–5** Implement upload flow, Vision validation, storage, order doc creation.
- **Hour 6–10** Build Cloud Function pipeline, integrate D-ID/Replicate/TTS; end-to-end test with static assets.
- **Hour 11–14** Stripe Checkout + webhook to grant credits; UI for credit balance & order status.
- **Hour 15–18** QA edge cases (multiple faces, failed generation), add retries & admin panel.
- **Hour 19–22** Deploy to Vercel & Firebase, run smoke tests, enable analytics.
- **Hour 23–24** Launch marketing: TikTok teaser, Product Hunt, targeted DM outreach, friends/family testers.

### 13. Security & Privacy
- Consent checkbox on upload; link to privacy policy & terms.
- Auto-delete using scheduled Function; allow manual delete request (button in dashboard).
- Make sure D-ID and Replicate assets deleted once final video stored.
- Signed download URLs expire after 24 hours; reissue on demand.

### 14. Analytics & Instrumentation
- Firebase Analytics events: `upload_start`, `upload_success`, `credit_purchase`, `generation_start`, `generation_complete`, `generation_failed`.
- Stripe webhooks logged to Firestore `payments`.
- Heatmaps (PostHog free tier) optional for UX insights.

### 15. Risks & Mitigation
- **API Limits** Hit free tier caps quickly → monitor usage, set alerts, switch to fallback stock footage.
- **Quality Variance** AI scenes inconsistent → maintain curated background library to ensure baseline quality.
- **Latency** Long generation times → queue users, show progress bar, send email when ready.
- **Compliance** Face privacy concerns → highlight retention policy, allow immediate deletion.

### 16. Open Questions
- Will we support voice uploads (user-provided audio) in MVP?
- Should we include background music layered under TTS (license-free track)?
- Do we need watermarking to deter free riders during trial?
- What is contingency if D-ID trial runs out before first revenue?

---

**Next Steps**
1. Set up Firebase project, config secrets, and D-ID/Replicate API keys.
2. Implement upload → validation → preview loop locally.
3. Dry-run end-to-end pipeline with sample assets; adjust FFmpeg filters.
4. Finalize landing CTA, pricing copy, and Stripe products before public launch.

