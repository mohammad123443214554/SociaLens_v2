'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/utils/googleSignIn'
import { Captcha } from '@/components/shared/Captcha'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const router = useRouter()
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    if (!agreedToTerms) {
      setError('Please accept the Terms & Conditions and Privacy Policy to continue.')
      return
    }

    setLoading(true)
    setError(null)

    const captchaRes = await fetch('/api/captcha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: captchaToken }),
    })
    const captchaData = await captchaRes.json()
    if (!captchaData.success) {
      setError(captchaData.error || 'Please complete the captcha.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // router.refresh() - cookies update karo server pe
      router.refresh()
      router.push('/feed')
    }
  }

  const handleGoogleLogin = async () => {
    const { error } = await signInWithGoogle()
    if (error) setError(error)
  }

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Image src="/images/socialens-logo.png" alt="SociaLens" width={56} height={56} className="rounded-xl" />
        </div>
        <CardTitle className="text-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
          SociaLens
        </CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Input
              {...register('email', { required: 'Email required' })}
              type="email"
              placeholder="Email"
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div className="relative">
            <Input
              {...register('password', { required: 'Password required' })}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</div>
          )}

          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span>
              I agree to SociaLens's{' '}
              <Link href="/terms" target="_blank" className="text-pink-500 hover:underline">Terms &amp; Conditions</Link>
              {' '}and{' '}
              <Link href="/privacy-policy" target="_blank" className="text-pink-500 hover:underline">Privacy Policy</Link>.
            </span>
          </label>

          <Captcha onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />

          <Button type="submit" className="w-full" variant="gradient" disabled={loading || !agreedToTerms || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken)}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-pink-500 font-medium hover:underline">Sign up</Link>
        </p>
      </CardContent>
    </Card>
  )
}
