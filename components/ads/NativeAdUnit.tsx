'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

// Adsterra's snippet is designed for one ad slot per page - the container
// id it looks for is fixed to this exact string. SociaLens needs several
// independent ad slots live at once (a Reels feed, a Home feed, Explore,
// Stories can each have their own), so instead of dropping this snippet
// straight into the page, each slot gets its own tiny same-document
// iframe with a fresh copy of this exact HTML inside it. Each iframe has
// its own document, so `getElementById` inside it only ever finds the one
// container that belongs to it - no collisions, no "only the first one on
// the page actually works" problem, and the ad network's own script/CSS
// never touches SociaLens's real DOM at all.
const AD_SCRIPT_SRC = 'https://pl31324966.profitableratecpmnetwork.com/881f5b6409710d9bc02f368e7ca74528/invoke.js'
const AD_CONTAINER_ID = 'container-881f5b6409710d9bc02f368e7ca74528'

// The ad network renders a native banner that scales to the iframe's
// *width* but decides its own height based on the creative it was served
// (it's just an <img> sized to 100% width, so a taller/shorter image
// changes the rendered height) - there's no way to know that height up
// front. Giving the iframe a fixed guessed height either clips the ad
// (guess too small - what was happening before: the ad looked "cut in
// half", with only the top portion visible) or leaves a dead gap of
// empty background below it (guess too big). So instead the ad's own
// page reports its real height back via postMessage once it knows it,
// and keeps reporting as images finish loading, and this component
// resizes the iframe to match exactly.
const MIN_HEIGHT = 100
const MAX_HEIGHT = 640
const MESSAGE_KIND = 'socialens-ad-resize'

interface NativeAdUnitProps {
  className?: string
  style?: React.CSSProperties
  /** Background behind the ad while it loads/if the network returns nothing -
   * match whatever surface it's sitting on (a reel is black, a post card is
   * the app's card background, etc.) so there's never a flash of mismatched
   * color. */
  background?: string
}

export function NativeAdUnit({ className, style, background = 'transparent' }: NativeAdUnitProps) {
  const instanceId = useId()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [height, setHeight] = useState<number | null>(null)

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; background: ${background}; overflow: hidden; }
  #${AD_CONTAINER_ID} { width: 100%; }
  img { max-width: 100%; display: block; }
</style>
</head>
<body>
<div id="${AD_CONTAINER_ID}"></div>
<script async data-cfasync="false" src="${AD_SCRIPT_SRC}"></script>
<script>
(function () {
  // The ad network injects its markup (and images that load asynchronously)
  // well after this script runs, so a one-time height read on load isn't
  // enough - keep watching for as long as the frame exists.
  function reportHeight() {
    var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    window.parent.postMessage({ kind: '${MESSAGE_KIND}', id: '${instanceId}', height: h }, '*');
  }
  try {
    new ResizeObserver(reportHeight).observe(document.body);
    new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
  } catch (e) {}
  window.addEventListener('load', reportHeight);
  reportHeight();
  setTimeout(reportHeight, 400);
  setTimeout(reportHeight, 1200);
  setTimeout(reportHeight, 3000);
})();
</script>
</body>
</html>`, [background, instanceId])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Match on both the source window and our own instance id, since
      // several of these iframes can be mounted on the same page at once
      // (Explore's grid, for example) and each one posts independently.
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.kind !== MESSAGE_KIND || data.id !== instanceId) return
      const reported = Number(data.height)
      if (Number.isFinite(reported) && reported > 0) {
        setHeight(Math.min(Math.max(reported, MIN_HEIGHT), MAX_HEIGHT))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [instanceId])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      className={className}
      style={{
        width: '100%',
        border: 'none',
        display: 'block',
        background,
        height: height ? `${height}px` : MIN_HEIGHT,
        transition: 'height 200ms ease',
        ...style,
      }}
      scrolling="no"
      loading="lazy"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-forms"
      title="Sponsored"
      onLoad={() => setLoaded(true)}
      aria-hidden={!loaded}
    />
  )
}
