import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { QueryProvider } from '@/components/shared/QueryProvider'
import { UserProvider } from '@/components/shared/UserProvider'
import { NativeAuthBridge } from '@/components/auth/NativeAuthBridge'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ec4899' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  viewportFit: 'cover',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: {
    default: 'SociaLens - Connect With The World',
    template: '%s | SociaLens',
  },
  description: 'Share moments, discover stories, and connect with people around you. SociaLens is a social media platform for everyone.',
  keywords: ['SociaLens', 'social media', 'reels', 'connect', 'share', 'photos', 'videos'],
  authors: [{ name: 'SociaLens' }],
  creator: 'SociaLens',
  publisher: 'SociaLens',
  applicationName: 'SociaLens',
  generator: 'SociaLens',
  referrer: 'origin-when-cross-origin',
  manifest: '/manifest.json',
  metadataBase: new URL('https://social-lens-one.vercel.app'),
  alternates: {
    canonical: 'https://social-lens-one.vercel.app',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SociaLens',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    url: 'https://social-lens-one.vercel.app',
    siteName: 'SociaLens',
    title: 'SociaLens - Connect With The World',
    description: 'Share moments, discover stories, and connect with people around you.',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'SociaLens Logo',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    site: '@SociaLens',
    creator: '@SociaLens',
    title: 'SociaLens - Connect With The World',
    description: 'Share moments, discover stories, and connect with people around you.',
    images: ['/icons/icon-512x512.png'],
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: '',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SociaLens" />
        <meta name="application-name" content="SociaLens" />
        <meta name="msapplication-TileColor" content="#ec4899" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2685547808817604"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider><UserProvider>{children}</UserProvider></QueryProvider>
          <NativeAuthBridge />
        </ThemeProvider>

        {/* service Worker */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', async () => {
                try {
                  const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                  setInterval(() => reg.update(), 60000)
                  reg.addEventListener('updatefound', () => {
                    const nw = reg.installing
                    if (!nw) return
                    nw.addEventListener('statechange', () => {
                      if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                        nw.postMessage({ type: 'SKIP_WAITING' })
                        window.location.reload()
                      }
                    })
                  })
                } catch(e) {}
              })
            }
          `
        }} />
      </body>
    </html>
  )
}
