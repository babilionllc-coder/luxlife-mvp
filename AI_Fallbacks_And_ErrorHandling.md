# AI Fallbacks & Error Handling

## Rules
- Retry API calls up to 3 times.
- If D-ID fails → fallback to static image + pan/zoom animation.
- If Replicate fails → use stock looping background from Pexels.
- Always update Firestore `videos.status` with error state.
- Log error to `/errors` collection.

## Error Message Template
"Your video is still processing due to server load. Please check again in a few minutes."
