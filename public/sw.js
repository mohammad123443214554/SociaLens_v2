const CACHE_NAME = 'socialens-v5'
const OFFLINE_URL = '/offline'

const PRECACHE = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Web Share Target: another app's share sheet POSTs the shared photo/
  // video straight to /share. Handling that POST right here, inside the
  // service worker, means the file bytes never have to travel through a
  // server function at all - they're read and stashed in the on-device
  // Cache Storage API, then handed off to a normal page as a plain GET.
  // That's what actually fixes big videos: Vercel's serverless functions
  // have a hard ~4.5MB request-body limit that no amount of server code
  // can raise, so routing the file through one was the real bug, not the
  // file's size.
  if (e.request.method === 'POST' && url.pathname === '/share' && url.origin === location.origin) {
    e.respondWith(handleShareTarget(e.request))
    return
  }

  if (e.request.method !== 'GET') return
  if (url.origin !== location.origin) return

  // Never cache account pages, feed/chat routes, or API responses. Those can
  // contain private or account-specific data. Cache only public static assets.
  const isPublicStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico'

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(OFFLINE_URL).then(cached => cached || new Response(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SociaLens offline</title><body><h1>You are offline</h1><p>Reconnect to the internet and try again.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ))
      )
    )
    return
  }

  if (!isPublicStaticAsset) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const cacheControl = res.headers.get('Cache-Control') || ''
        const vary = (res.headers.get('Vary') || '').trim()
        if (res.ok && res.type === 'basic' && !/private|no-store/i.test(cacheControl) && vary !== '*') {
          e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone())).catch(() => {}))
        }
        return res
      })
      .catch(() => caches.match(e.request).then(cached => cached || Response.error()))
  )
})

async function handleShareTarget(request) {
  const origin = new URL(request.url).origin
  // Sharing INTO SociaLens (the "Add to Story" flow) is coming in a
  // future version - for now this just accepts the share so the OS share
  // sheet doesn't 404/error out, and sends the person to a friendly
  // "coming soon" page instead. Deliberately not reading/caching the
  // shared file here since nothing downstream uses it yet.
  try {
    await request.formData()
  } catch (err) {
    // Ignore - either way, still land on the coming-soon page below.
  }
  return Response.redirect(`${origin}/share/handle`, 303)
}

self.addEventListener('push', e => {
  if (!e.data) return
  let data = { title: 'SociaLens', body: 'New notification', url: '/feed', kind: 'generic' }
  try { data = { ...data, ...e.data.json() } } catch {}

  const isCall = data.kind === 'call'
  const isMessage = data.kind === 'message'

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      // Longer, more insistent buzz for a call (like a real ringing phone);
      // a shorter, single buzz for an ordinary message.
      vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : [200, 100, 200],
      data: { url: data.url, kind: data.kind, callId: data.callId, chatId: data.chatId },
      tag: data.tag || 'socialens',
      renotify: true,
      // Calls stay on screen until the person acts on them instead of
      // auto-dismissing, same as a real incoming-call notification.
      requireInteraction: isCall,
      actions: isCall
        ? [{ action: 'accept', title: 'Accept' }, { action: 'decline', title: 'Decline' }]
        : isMessage
        ? [{ action: 'reply', title: 'Open chat' }]
        : [],
    })
  )
})

self.addEventListener('notificationclick', e => {
  const { url, kind, callId, chatId } = e.notification.data || {}
  e.notification.close()

  if (kind === 'call' && e.action === 'decline') {
    // Decline right from the notification, without opening the app -
    // best effort; if it fails, the call still auto-cancels once the
    // caller's ring timeout runs out.
    e.waitUntil(
      fetch('/api/calls/decline', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(() => {})
    )
    return
  }

  let targetUrl = url || (chatId ? `/chat/${chatId}` : '/feed')
  // Tapping "Accept" (or just the notification body) needs to land on a
  // call that's actually accepted, not just a chat page the person still
  // has to tap Accept on again - especially when SociaLens was fully
  // closed, where clients.openWindow() below opens a brand-new page load
  // and a postMessage sent to it would arrive before that page has even
  // registered a listener. Encoding the callId in the URL instead survives
  // a full reload: the app reads it once it's up, waits until that same
  // call shows up as ringing, and accepts it automatically.
  if (kind === 'call' && callId) {
    const sep = targetUrl.includes('?') ? '&' : '?'
    targetUrl = `${targetUrl}${sep}incomingCall=${encodeURIComponent(callId)}`
  }
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(targetUrl)
          c.focus()
          return
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (e.data?.type === 'SET_BADGE' && 'setAppBadge' in navigator) navigator.setAppBadge(e.data.count).catch(() => {})
  if (e.data?.type === 'CLEAR_BADGE' && 'clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {})
})
