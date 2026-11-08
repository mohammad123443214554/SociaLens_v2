import type { CapacitorConfig } from '@capacitor/cli'

// This app stays a normal Next.js website - SSR pages, API routes, auth
// cookies, all of it. Capacitor's own "server.url" mode is what makes
// that work inside a native shell: instead of trying to export the app
// as static files (which would break the API routes, auth, and every
// Supabase Realtime call this app depends on), the native app simply
// opens this URL inside Android's built-in WebView. That's what removes
// both problems the TWA build had - there's no address bar to show
// (this is a real native Activity, not a browser tab), and there's no
// dependency on the Chrome app being installed/updated on the device
// (The WebView component ships with Android itself).
//
// The Android WebView must load the V2 production app, not the retired V1 site.
const config: CapacitorConfig = {
  appId: 'com.socialens.app',
  appName: 'SociaLens',
  webDir: 'public', // unused in server.url mode, but Capacitor requires a value
  server: {
    url: 'https://socia-lens-v2.vercel.app',
    cleartext: false,
  },
  android: {
    // Keep the WebView clear of Android system bars on devices that enforce edge-to-edge.
    // This prevents the status bar from covering the app's top controls on some phones.
    adjustMarginsForEdgeToEdge: 'auto',
    // Matches the app's dark theme so there's no white flash on launch.
    backgroundColor: '#000000',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
