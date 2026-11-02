# Part 2 — Natural Beauty and Face Enhancement

This part adds the first twelve face-aware presets and their local processing stage.

## Presets

### Natural Beauty
- Natural Glow
- Glass Skin
- Soft Beauty
- Fresh Face
- Smooth Portrait
- Natural Makeup

### Face Enhancement
- Soft Blush
- Bright Eyes
- Lip Tint
- Soft Contour
- Eye Glow
- Portrait Polish

## Processing

- MediaPipe Face Landmarker runs locally in a dedicated module worker.
- Worker inference is throttled independently from the render loop; the renderer uses the most recent mesh and ignores stale tracking data.
- GPU delegate is attempted first; CPU is used as a fallback if GPU initialization fails.
- Face smoothing is clipped to the detected face oval and keeps the eye and mouth regions out of the smoothing mask.
- Cheek, lip, eye and contour effects are positioned using face landmarks rather than fixed screen coordinates.
- The shared frame engine emits a processed canvas video track and accepts ordered effect stages. It does not request camera permission or stop the caller-owned camera track.

## Safety and honest status

- These are first custom, locally rendered effects, not Snapchat/Banuba-grade photorealistic AR.
- The appearance depends on camera quality, lighting, skin tone, device performance and face tracking.
- No external user account or filter download is required. The MediaPipe model and WASM runtime are fetched by the browser from their published asset hosts on first use.
- This part adds the reusable processing modules and preset definitions. The outgoing Agora/Daily call controls and visible filter picker are deliberately left for the later call integration/testing part; until that integration is completed, these presets are not yet selectable in the live call UI.
- Background Blur remains a separate option and OFF by default.
