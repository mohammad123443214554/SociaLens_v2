# Part 3 — Makeup effects

Part 3 adds six local, face-mesh-driven makeup looks to the shared camera-effects renderer.

## Presets
- **Soft Pink** — diffused pink cheeks, light rose eye wash, soft pink lip tint, subtle highlight.
- **Rose Makeup** — deeper rose cheeks and lips, muted rose eye shadow, defined upper lash line.
- **Peach Makeup** — warm peach cheek and lip colour, understated warm eye wash, soft highlight.
- **Korean Makeup** — youthful cheek tint, gradient-style lip tint clipped to the tracked lip contour, delicate under-eye highlight (aegyo-sal-inspired).
- **Glam Look** — richer lip colour, stronger shadow, tracked eyeliner wing, subtle lash strokes, cheek highlight and contour.
- **Nude Makeup** — restrained neutral lip, soft eye definition and understated cheek colour.

## Implementation
- Presets live in `lib/call-effects/presets.ts` as `PART_THREE_MAKEUP_PRESETS`.
- The rendering implementation lives in `FaceLandmarkEffectStage` in `lib/call-effects/face-landmark-stage.ts`.
- Makeup draws against MediaPipe face landmarks and facial regions; the lip gradient is clipped to the tracked lip contour.
- Effect intensity is normalized from 0–100 and each preset has its own default.
- The existing worker inference cadence and stale-landmark guard are reused. No extra camera permission, server upload, user account, paid SDK, database migration, or background-blur activation is introduced.
- The engine remains reusable by Agora, Daily and a future live-streaming publisher.

## Scope boundary
This part adds the preset definitions and the local rendering stage. It does not yet expose a live-call filter picker or publish the processed track into Agora/Daily. That integration is reserved for the final integration/testing part. The makeup rendering is a lightweight 2D landmark treatment, not a claim of photorealistic 3D cosmetics; output varies with face tracking, lighting, camera quality and device performance.
