# Part 4 — Aesthetic Lighting & Creative Looks

Part 4 adds twelve reusable, local camera colour looks. They are independent of face tracking, so they can render even when no face is detected or the camera is pointed at a scene.

## Aesthetic Lighting (6)
- **Golden Hour** — warm late-afternoon white balance, gentle highlight bloom and restrained vignette.
- **Warm Light** — cosy amber warmth without a strong colour cast.
- **Cool Light** — clean cool daylight balance with controlled contrast.
- **Dreamy Glow** — luminous highlights and subtle diffusion.
- **Vintage Film** — warm, muted film-inspired grade, soft vignette and deterministic fine grain.
- **Cinematic** — deeper contrast, cooler shadow tint, warm highlight tint and restrained vignette.

## Creative Looks (6)
- **Pastel Dream** — lifted exposure, softened contrast and pastel tint.
- **Lavender** — subtle lavender-violet colour mood.
- **Milky Tone** — creamy lifted shadows and muted saturation.
- **Soft Focus** — restrained diffusion blended over the sharp source image.
- **Rose Gold** — refined rosy warmth and warm highlight tint.
- **Night Glow** — luminous low-light grade with cool shadow and warm highlight accents.

## Implementation
- Preset definitions: `lib/call-effects/presets.ts`.
- Renderer: `ColorLookEffectStage` in `lib/call-effects/color-look-stage.ts`.
- Public exports: `lib/call-effects/index.ts`.
- The stage snapshots the current frame before applying the look, blends the colour grade according to the 0–100 intensity setting, and draws restrained overlays, bloom, vignette and grain where configured.
- Film grain uses a fixed-seed tile generated once, not per-frame random pixel generation.
- The stage does not request camera access, upload frames, require face tracking, add an SDK, or alter background blur.
- It is reusable in the same camera effects pipeline for Agora, Daily and future live streaming.

## Scope boundary
Part 4 implements the presets and rendering stage. It does not yet connect a user-facing filter picker or replace the outgoing Agora/Daily camera track; final call integration and end-to-end testing remain in Part 5. These are real-time 2D colour/light treatments, not a claim of physical relighting or professional studio lighting. Appearance varies with camera exposure, white balance, sensor and display.
