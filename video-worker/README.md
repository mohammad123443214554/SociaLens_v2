# SociaLens V2 video compatibility worker

This is the original SociaLens video-processing approach adapted to the V2 posts bucket and V2 Supabase project. It produces a separate compatible MP4 rendition and never overwrites or deletes the original upload.

## Compatibility output

- MP4 with faststart metadata (moov atom before mdat).
- H.264 AVC Baseline, Level 3.1, yuv420p.
- 30 FPS constant frame rate.
- AAC-LC stereo at 48 kHz when the source has audio; no synthetic audio is added to silent videos.
- Aspect ratio is preserved, output is not upscaled, and dimensions stay within the H.264 Level 3.1 frame-size budget.
- Video peak bitrate is limited to 2 Mbps with a 4 Mbps VBV buffer.
- Worker source limit: 100 MB; rendition limit: 350 MB.
- FFmpeg is terminated if a conversion exceeds 12 minutes. FFprobe validates the output before upload and before a job is marked ready.

Compatibility improvements cannot guarantee playback on every old Android device; physical-device verification is still required.

## Flow

1. The V2 post video is uploaded to the existing posts bucket.
2. Create Post registers the uploaded object only after the published post row exists.
3. The authenticated registration API verifies the owner, public post URL and Storage object, then queues the job.
4. GitHub Actions runs the Node worker for a bounded batch.
5. The worker claims jobs through the database RPC, downloads the original, transcodes and validates a separate MP4, and uploads it under posts/video-renditions/.
6. Feed and Reels request the playback-status endpoint while the video is eligible to load. Until a rendition is ready, the original URL remains the fallback.

The upload route only queues video uploads directed to the posts bucket. Stories, chat media, photos and other buckets are not routed through this worker. Existing Android feed/reel decoder management remains in the V2 components.

## GitHub Actions secrets

Add these repository secrets under Settings -> Secrets and variables -> Actions:

- SUPABASE_URL — the SociaLens V2 Supabase project URL.
- SUPABASE_SERVICE_ROLE_KEY — the service-role key for that same V2 project.

Do not use credentials from the original SociaLens project. Never commit the service-role key or expose it to browser code, Vercel client variables or the Android app. Do not paste secrets into chat.

## Database migration

Review and apply `supabase/migrations/20261111_video_compatibility_pipeline.sql` to the V2 Supabase project only after explicit approval. The migration creates the internal queue, indexes and service-role-only claim RPC, and queues only existing V2 posts-bucket objects whose paths belong to their post owner and whose Storage objects exist. It does not replace existing application tables, policies or buckets.

The migration is not run by GitHub Actions or Vercel.

## Workflow

- `.github/workflows/video-processing.yml` runs every five minutes and can also be started manually.
- Each run processes a bounded batch and exits.
- `.github/workflows/video-worker-validation.yml` checks worker syntax and FFmpeg output for portrait, landscape, square, low-resolution and no-audio clips.
- Scheduled Actions can be delayed by GitHub; this is a periodic worker, not an always-on service.

## Local validation

From `video-worker/`:

```bash
npm install
node --check worker.mjs
bash test-ffmpeg.sh
```

For a local worker run, provide V2 `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as process environment variables. Never store them in this repository.

## Rollout

1. Review and apply the V2 migration after approval.
2. Add the two V2 Actions secrets.
3. Merge the PR only after review and explicit approval.
4. Run the processing workflow manually and inspect its logs.
5. Confirm that original uploads remain unchanged and converted renditions reach ready.
6. Test representative videos on physical Android devices.
