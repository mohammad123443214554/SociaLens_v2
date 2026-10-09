'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface OnboardingForm {
  username: string
  full_name: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<OnboardingForm>()

  // Pre-fill with whatever Google gave us (their name, and a suggested
  // username) so most people can just hit Continue if they're happy with it.
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, onboarding_completed')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.replace('/feed')
        return
      }

      if (profile?.username) setValue('username', profile.username)
      if (profile?.full_name) setValue('full_name', profile.full_name)
      setCheckingSession(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (data: OnboardingForm) => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    const username = data.username.toLowerCase().trim()

    // Make sure nobody else grabbed this username while they were typing.
    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', user.id)
      .maybeSingle()

    if (taken) {
      setError('That username is already taken. Please try another.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username,
        full_name: data.full_name.trim(),
        onboarding_completed: true,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/feed')
  }

  if (checkingSession) {
    return (
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Image src="/images/socialens-logo.png" alt="SociaLens" width={56} height={56} className="rounded-xl" />
        </div>
        <CardTitle className="text-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
          Welcome to SociaLens!
        </CardTitle>
        <CardDescription>Just one last step - pick your username</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Input
              {...register('full_name', { required: 'Full name is required' })}
              placeholder="Full Name"
            />
            {errors.full_name && (
              <p className="text-xs text-destructive mt-1">{errors.full_name.message}</p>
            )}
          </div>
          <div>
            <Input
              {...register('username', {
                required: 'Username is required',
                minLength: { value: 3, message: 'Min 3 characters' },
                pattern: {
                  value: /^[a-zA-Z0-9_]+$/,
                  message: 'Only letters, numbers, underscores',
                },
              })}
              placeholder="Username"
            />
            {errors.username && (
              <p className="text-xs text-destructive mt-1">{errors.username.message}</p>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" variant="gradient" disabled={loading}>
            {loading ? 'Saving...' : 'Continue to SociaLens'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
