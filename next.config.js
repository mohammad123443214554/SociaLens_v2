/** @type {import('next').NextConfig} */
const nextConfig = {
  // Headers for PWA
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/icons/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
  },

  // Compress responses
  compress: true,

  // Power optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // face-api.js (used for the appeal-photo face check) pulls in
  // @tensorflow/tfjs-core, which supports a Node.js backend as well as
  // the browser one. That Node backend code references 'fs' and
  // node-fetch references the optional 'encoding' package - neither of
  // which exists (or is needed) in the browser bundle. Without this,
  // webpack tries to resolve them at build time and the whole build
  // fails with "Module not found". Since face-api.js only ever runs
  // Client-side here, it's safe to tell webpack to just stub these out
  // for the browser bundle - that code path never actually executes.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        encoding: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
