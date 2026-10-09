'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Mail } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

// Lets people jump straight to their inbox instead of hunting for the tab
// Themselves - covers the providers the vast majority of users are on.
function getEmailProviderLink(email: string): { name: string; url: string } | null {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return null

  if (['gmail.com', 'googlemail.com'].includes(domain)) {
    return { name: 'Gmail', url: 'https://mail.google.com/mail/u/0/#search/from%3Asupabase' }
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { name: 'Outlook', url: 'https://outlook.live.com/mail/0/inbox' }
  }
  if (domain === 'yahoo.com') {
    return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' }
  }
  if (domain === 'icloud.com') {
    return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' }
  }
  return null
}

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const handleResend = async () => {
    if (!email) { setError('Please enter your email'); return }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })

    if (error) setError(error.message)
    else setSent(true)

    setLoading(false)
  }

  const providerLink = getEmailProviderLink(email)

  return (
    <Card className="w-full max-w-sm shadow-xl text-center">
      <CardHeader>
        <div className="flex justify-center mb-2">
          <Image src="/images/socialens-logo.png" alt="SociaLens" width={48} height={48} className="rounded-xl" />
        </div>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          {sent
            ? `A confirmation link has been sent to ${email}`
            : 'Enter your email address to receive a new confirmation link'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sent ? (
          <>
            <div className="text-left bg-muted/60 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                The email will arrive from <span className="font-medium text-foreground">&quot;Supabase Auth&quot;</span> — this is expected. Open it and click the confirmation link to activate your SociaLens account.
              </p>
            </div>
            {providerLink && (
              <a
                href={providerLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-pink-500 text-white text-sm font-medium hover:bg-pink-600 transition-colors"
              >
                <Mail className="h-4 w-4" />
                Open {providerLink.name}
              </a>
            )}
            <Button variant="ghost" className="w-full" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </>
        ) : (
          <>
            <Input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" variant="gradient" onClick={handleResend} disabled={loading}>
              {loading ? 'Sending...' : 'Send Confirmation Link'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
