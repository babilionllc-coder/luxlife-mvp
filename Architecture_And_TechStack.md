# Architecture & Tech Stack

## Overview
The LuxLife MVP is a web-based AI video generation platform. It enables users to upload a photo and receive a personalized short-form vertical "luxury lifestyle" video.

### Frontend
- **Framework:** Next.js + React + TailwindCSS
- **Hosting:** Firebase Hosting (Free Tier)
- **Storage:** Firebase Storage (temporary for uploads)
- **Auth:** Firebase Authentication (Email/Google)

### Backend
- **Functions:** Firebase Cloud Functions (serverless)
- **Database:** Firestore
- **Video Assembly:** FFmpeg (run in Cloud Function or small VM like Railway/Fly.io)
- **Payments:** Stripe (Checkout + Webhooks)

### APIs
- **D-ID:** Face animation and lip-sync from single photo.
- **Replicate or Stability.ai:** Background video/image generation.
- **Google Cloud Text-to-Speech:** Voice generation.
- **Cloudinary (optional):** Video hosting/CDN optimization.

### Architecture Flow
1. User uploads a face photo → Firebase Storage.
2. Backend validates and processes image.
3. API calls: D-ID → Replicate → Google TTS → FFmpeg combine.
4. Final video uploaded → Firebase Storage/Cloudinary.
5. Stripe payment and credit deduction handled automatically.
