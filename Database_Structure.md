# Database Structure (Firestore)

## Collections

### users
| Field | Type | Description |
|--------|------|-------------|
| email | string | User email |
| credits | number | Available credits (defaults to 1 on signup) |
| createdAt | timestamp | Account creation time |
| updatedAt | timestamp | Last profile update |

### orders
| Field | Type | Description |
|--------|------|-------------|
| uid | string | Owning user's UID |
| status | string | `pending` → `queued_validation` → `queued_generation` → `generating_background` → `complete` / `failed` |
| scene | string | Human-readable scene label |
| sceneId | string | Identifier for selected preset |
| tagline | string | Optional personalization text |
| sourcePath | string | Storage path for uploaded portrait |
| videoPath | string | Storage path for rendered clip (set by pipeline) |
| errorCode | string | Machine-readable failure reason |
| errorMessage | string | User-facing failure note |
| pipeline | map | Stage timestamps, prompts, external job metadata |
| createdAt | timestamp | Order creation time |
| updatedAt | timestamp | Last state change |

### payments
| Field | Type | Description |
|--------|------|-------------|
| uid | string | Owning user's UID |
| stripeSessionId | string | Stripe checkout session |
| creditsPurchased | number | Credits added from payment |
| amount | number | Amount charged (cents) |
| currency | string | Currency code (default USD) |
| createdAt | timestamp | Event timestamp |
