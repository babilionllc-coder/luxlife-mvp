# Secrets & Integrations Reference (LuxLife MVP)

> Do **not** store real secret values in this document. It is a checklist only.  
> Actual keys are maintained locally in `.cursor/env.json` (excluded from source control).  
> For new environments, populate the secrets via `/env` or `.cursor/env.json`.

## Current MCP Tools & Required Secrets

| Tool Name        | Purpose                                           | Env Variable / Credential                |
|------------------|---------------------------------------------------|------------------------------------------|
| `firebase`       | Firestore document access (orders, users, logs)   | `FIREBASE_TOKEN` (Google access token)   |
| `firebaseStorage`| Storage uploads & signed URLs                      | `FIREBASE_TOKEN`                         |
| `stripe`         | Checkout sessions, payments, refunds              | `STRIPE_SECRET_KEY`                      |
| `replicate`      | Background video/prediction jobs                  | `REPLICATE_API_TOKEN`, `REPLICATE_MODEL_VERSION` |
| `did`            | Face animation / talking portrait generation      | `DID_API_KEY`                            |
| `resend`         | Transactional email delivery                      | `RESEND_API_KEY`                         |

## Token Generation Notes

- **Firebase**
  - Service account file: `firebase-adminsdk.json` (local only).
  - Generate token:  
    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-adminsdk.json
    gcloud auth application-default print-access-token
    ```
  - Paste result into `FIREBASE_TOKEN`.
  - Tokens expire ~1 hour; re-run command when needed.

- **Stripe**
  - Retrieve from Stripe dashboard → Developers → API keys.
  - Use test mode for development (`sk_test_...`) until launch.

- **Replicate**
  - https://replicate.com/account  → “API token”.
  - Current SDXL background version: `7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc`.
  - Store token + version via:
    ```bash
    firebase functions:config:set replicate.api_token="..." replicate.model_version="..."
    ```

- **D-ID**
  - https://studio.d-id.com/ → Account settings → API key.

- **Resend**
  - https://resend.com/api-keys → Create secret API key.

## Local Secret Storage

- `.cursor/env.json` contains the runtime secrets for Cursor MCP tools.  
- Ensure `.cursor/env.json` stays out of version control (already ignored).  
- For production deployment, use platform-specific secret managers (Firebase Config, Cloud Secret Manager, etc.).

## Operational Checklist

1. Confirm `.cursor/env.json` has all required keys before invoking MCP tools.
2. Regenerate Firebase token if MCP Firebase calls start failing with 401.
3. Rotate API keys periodically and update `.cursor/env.json`.
4. Keep the service-account JSON restricted to trusted machines only.

## Related Documents

- `Automation_Roadmap.md` – long-term automation plan.
- `LuxLife_Master_Plan.md` – full product and build strategy.

_Last updated: 2025-11-07_

