# Part 5 — Eye Lenses, Call Integration and Verification

## Eye lens presets

Six local eye-colour presets are included in the shared call-effects catalog:

- Ocean Blue
- Emerald Green
- Honey Hazel
- Silver Grey
- Amethyst Violet
- Golden Amber

The eye renderer uses the MediaPipe FaceLandmarker iris landmarks (468–477). It clips colour work to the eye opening and iris polygon, leaves a pupil-shaped opening, and blends colour with the captured iris rather than replacing the whole eye with a flat disc. If the complete iris mesh is unavailable or tracking is stale, the renderer skips the lens rather than drawing guessed circles.

## In-call picker

The video-call Sparkles control opens the effect picker. It exposes all existing categories and presets from Parts 2–5, per-effect intensity, filter removal, and the existing Background Blur settings. Background Blur remains disabled by default.

## Provider integration

- Agora: the existing camera track remains the camera/device-control source. The effects engine consumes a cloned source track and publishes a custom video track made from the engine's canvas capture stream. Clearing a filter restores the original Agora camera track.
- Daily: the engine's processed MediaStreamTrack is installed as the local video input using Daily's custom video-source support. Clearing a filter restores the retained source track.
- Camera switching, mute/hold, adaptive source quality, blur changes and teardown have explicit effect-pipeline handling.
- The effects engine never requests camera permission and never stops the caller-owned camera track. Its generated output and cloned input are cleaned up separately.

## Reuse

The CallVideoEffectsEngine, stages, presets and category catalog remain provider-independent and can be reused by a future live-streaming sender. Provider-specific publication remains in the call hook.

## Verification status and limitations

The repository change is not a substitute for real device testing. Before describing the feature as production-verified, test:
1. Two-way Agora video calls on desktop Chrome and Android Chrome/Capacitor.
2. Daily fallback with processed video source and remote rendering.
3. All six iris lenses while moving, blinking, changing distance and switching between front/rear cameras.
4. Switching among face, makeup, lighting and creative presets; intensity changes; removing a filter.
5. Background Blur both with and without an active filter, and confirm it stays OFF on a fresh call.
6. Camera off/on, hold/resume, weak network, reconnect, call end, and repeated filter changes without leaked tracks/workers.
7. Audio-only calls and camera-permission denial remain unchanged.

The renderer is an on-device 2D face-mesh effect pipeline, not a photorealistic 3D AR SDK. Results depend on face visibility, camera quality, lighting, browser GPU/CPU and device performance. First use needs network access to fetch the MediaPipe model/WASM assets. No paid SDK, user account, filter download, or Supabase schema change is introduced.
