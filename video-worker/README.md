# SociaLens V2 video compatibility worker

This worker creates a separate Android-oriented MP4 playback rendition for published videos in the V2 posts Storage bucket. It never overwrites or deletes the original upload.

## Output profile

- MP4 container with the moov metadata atom before mdat (faststart).
- H.264 AVC Baseline, Level 3.1, yuv420p.
- 30 FPS constant frame rate.
- AAC-LC stereo at 48 kHz when the source contains audio; silent videos remain silent.
- Aspect ratio preserved and no upscaling. Portrait output is bounded by 720x1280, landscape by 1280x720, and square by 960x960.
- The 921,600-pixel frame budget is enforced for Level 3.1.
- 2 Mbps peak video bitrate with a 4 Mbps VBV buffer.
- Worker input limit: 100 MB; output limit: 350 MB; FFmpeg/FFprobe command timeout: 12 minutes. Larger source files remain available as originals but are not queued for conversion.
- FFprobe validates container, codec, profile, level, pixel format, frame rate, dimensions and optional audio before upload. The worker also checks MP4 atom ordering before marking a job ready.

This profile improves compatibility but cannot guarantee playback on every legacy Android device. Physical device testing remains necessary.

## V2 architecture

1. A public post/reel video is uploaded to the existing posts bucket.
2. After the post row is successfully created, the authenticated client calls POST /api/media/register.
3. The API verifies the signed-in owner, exact published post URL, storage object, path and source size before inserting a queue row.
4. GitHub Actions claims jobs through a row-locking RPC and processes a bounded batch.
5. The worker downloads the original, transcodes and validates a separate MP4, then uploads it to posts/video-renditions/{owner_id}/{job_id}.mp4.
6. Only after the rendition is stored and validated does the worker mark the queue row ready.
7. Feed, Reels and the post viewer poll GET /api/media/playback while the video is eligible to load. Original media remains the fallback for untracked, queued, failed or temporarily unavailable processing.

Private create-drafts media is not registered. Draft videos are only queued after they are copied into posts and a public post row has been created. Cover images, Stories, chat media and Studio assets are excluded.

## GitHub Actions secrets

Configure these repository Actions secrets in GitHub Settings -> Secrets and variables -> Actions:

- SUPABASE_URL: the SociaLens V2 Supabase project URL.
- SUPABASE_SERVICE_ROLE_KEY: the service-role key belonging to that same V2 project.

Do not use the original SociaLens project credentials. Never put the service-role key in source code, a committed environment file, a Vercel client variable or the Android app. Do not paste it into chat.

## Database rollout

Review supabase/migrations/20261111230000_add_post_video_compatibility_pipeline.sql and apply it to the V2 Supabase project only after approval. It adds one internal queue table, two indexes and one service-role-only claim function. It does not alter existing tables, storage buckets or existing policies. It queues existing videos only when their URL belongs to the V2 posts bucket, the object path matches the post owner, and the source object exists. At implementation review, all 32 existing V2 video posts matched those checks. It does not queue private drafts or videos from other buckets.

The migration is not applied automatically by GitHub Actions or Vercel.

## Workflow behavior

- .github/workflows/video-processing.yml runs every five minutes and supports manual execution.
- Each run processes at most two jobs sequentially.
- The worker uses a 20-minute lease, bounded retries with exponential backoff, a 12-minute FFmpeg/FFprobe timeout, and token-checked completion/failure updates.
- .github/workflows/video-worker-validation.yml runs worker unit tests and FFmpeg portrait/landscape/square/low-resolution/no-audio integration cases without Supabase secrets.
- GitHub scheduled workflows may be delayed during high load. This is a periodic worker, not an always-on processing service.

## Local validation

From the video-worker directory:

    npm install
    npm test
    bash test-ffmpeg.sh

For a local one-shot run, set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and RUN_ONCE=true in the worker process environment. Never commit these values.

## Rollout checklist

1. Review and apply the V2 migration.
2. Add the two V2 GitHub Actions secrets.
3. Merge the reviewed pull request when authorized.
4. Run the worker workflow manually and inspect its result.
5. Verify new uploads reach ready and the original object remains unchanged.
6. Test on representative physical Android devices and network conditions.
