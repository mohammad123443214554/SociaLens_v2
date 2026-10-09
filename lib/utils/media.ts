/**
 * A 1x1 fully transparent GIF, used as the `poster` of every <video> in the
 * app.
 *
 * Why: a <video> with no `poster` attribute is drawn by Android's WebView
 * using WebChromeClient.getDefaultVideoPoster() - a small built-in bitmap
 * stretched to fill the whole element. That is the grey oval with the giant
 * play triangle that covered feed videos and reels in the APK. Desktop and
 * mobile browsers draw nothing there, which is why it never showed up on the
 * website.
 *
 * The native side already returns a transparent bitmap from that method (see
 * MainActivity.kt's SociaLensWebChromeClient), so this is the second half of
 * the same fix: giving the element an explicit poster means WebView never
 * reaches for its default in the first place - including inside any other
 * WebView (an in-app browser, another Android shell) that this app's pages
 * might be opened in, where our native override doesn't apply.
 *
 * It disappears the instant the video presents a real frame, so it never
 * hides actual video, controls, or fullscreen.
 */
export const BLANK_VIDEO_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/**
 * Retry path for media whose Supabase object metadata/range response is not
 * handled correctly by an Android WebView. The proxy is deliberately limited
 * to the configured Supabase storage host and is only used after the direct
 * media URL reports a playback error.
 */
export function getMediaProxyUrl(src: string): string {
  return `/api/media/proxy?url=${encodeURIComponent(src)}`
}
