## LuxLife MVP

LuxLife is an AI-powered video studio that turns a single user portrait into a short-form “luxury lifestyle” clip.  
This repository contains the Next.js frontend, Firebase configuration, and Cloud Functions that orchestrate the generation pipeline.

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Configured Firebase project with Hosting, Firestore, Storage, and Cloud Functions enabled
- Stripe, Replicate, D-ID, Google Cloud Text-to-Speech, and Resend API credentials

### Local development

```
npm install
npm run dev
```

The app will be available at http://localhost:3000. Sign in with email/password to test the upload flow; uploads target your configured Firebase project.

### Firebase configuration

All sensitive values should be stored via Firebase Functions config or Cursor `/env`. Example:

```
firebase functions:config:set \
  stripe.secret="sk_test_..." \
  stripe.publishable="pk_test_..." \
  replicate.api_token="..." \
  replicate.model_version="..." \
  did.api_key="..." \
  resend.api_key="..."
```

### Deploy

```
npm --prefix functions run build
firebase deploy --only hosting,functions
```

### Project structure highlights

- `app/` – Next.js routes (`/`, `/upload`, `/dashboard`)
- `src/components/` – shared UI and auth form
- `functions/src/index.ts` – Firestore triggers and background generation orchestration
- `firestore.rules`, `storage.rules` – security configuration
- `Secrets_and_Integrations.md` – reference for required environment variables

Refer to `LuxLife_Master_Plan.md` for the end-to-end execution plan and remaining milestones.
