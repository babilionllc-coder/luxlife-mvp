# Video Generation Pipeline

## Steps
1. **Validate Photo:** Confirm the uploaded portrait exists in Firebase Storage; if not, the credit is refunded and the order fails (`validation_missing_file`).
2. **Background Generation:** Move to `queued_generation`, enqueue the Replicate job, poll for completion, and store metadata in `pipeline.generation.replicate`. If Replicate returns a still image or fails (e.g. insufficient credits), the pipeline flags `pipeline.generation.fallback` and continues with an animation-only delivery.
3. **Voice Generation:** Google Cloud TTS creates a personalized MP3 voiceover from the order tagline/scene; audio is stored in Storage with a signed URL for downstream steps.
4. **Face Animation:** D-ID animates the portrait using the generated audio. Jobs are polled until completion and tracked under `pipeline.generation.animation`.
5. **Combine Assets:** Compose background and animated face with FFmpeg, dropping back to the D-ID animation alone when fallback mode is active.
6. **Upload & Delivery:** The final clip is uploaded to `videos/{uid}/{orderId}/final.mp4`, the order is marked `complete` with `videoPath`, and Resend emails notify the user (including fallback context when applicable).

## Example FFmpeg
```bash
ffmpeg -y -stream_loop -1 -t 12 -i bg.mp4 -i face.webm -i voice.mp3 -i music.mp3   -filter_complex "[1:v]scale=540:-1,format=rgba[face];[0:v][face]overlay=(W-w)/2:(H-h)/2:shortest=1[v]"   -map "[v]" -map 2:a -map 3:a -c:v libx264 -crf 22 -preset veryfast -c:a aac -shortest out.mp4
```
