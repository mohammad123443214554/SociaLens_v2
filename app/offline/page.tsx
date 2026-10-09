'use client'

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#000', color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '24px'
    }}>
      <div>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🌐</div>
        <h1 style={{
          fontSize: 24, fontWeight: 700, marginBottom: 8,
          background: 'linear-gradient(135deg, #ec4899, #a855f7)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>You&apos;re Offline</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, marginBottom: 24 }}>
          No internet connection.<br />Please check your connection.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'linear-gradient(135deg, #ec4899, #a855f7)',
            color: 'white', border: 'none', borderRadius: 14,
            padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
