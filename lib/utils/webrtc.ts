/**
 * Small shared call-timing constants.
 *
 * The actual audio/video transport no longer uses raw WebRTC/ICE directly -
 * Agora.io (primary) and Daily.co (automatic fallback) each manage their
 * own connection infrastructure. See lib/server/callProvider.ts for how
 * The provider is chosen, and app/api/calls/connect for how a call is
 * wired up to whichever one is picked.
 */
export const RING_TIMEOUT_MS = 45_000
