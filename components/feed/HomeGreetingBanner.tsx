'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'

type GreetingPeriod = 'morning' | 'evening' | 'night'

function getGreetingPeriod(date: Date): GreetingPeriod {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 20) return 'evening'
  return 'night'
}

const greetingCopy: Record<GreetingPeriod, string> = {
  morning: 'Good morning',
  evening: 'Good evening',
  night: 'Good night',
}

const imagePaths: Record<GreetingPeriod, string> = {
  morning: '/images/home-greeting/morning/morning.png',
  evening: '/images/home-greeting/evening/evening.png',
  night: '/images/home-greeting/night/night.png',
}

export function HomeGreetingBanner() {
  const { user, profile } = useUser()
  const [period, setPeriod] = useState<GreetingPeriod>(() => getGreetingPeriod(new Date()))
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const updatePeriod = () => setPeriod(getGreetingPeriod(new Date()))
    updatePeriod()
    const interval = window.setInterval(updatePeriod, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setImageLoaded(false)
  }, [period])

  const profileData = profile as (typeof profile & { full_name?: string | null; name?: string | null }) | null
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  const fullName = profileData?.full_name?.trim() || profileData?.name?.trim() || (typeof metadataName === 'string' ? metadataName.trim() : '') || 'Mohammad Khan'

  return (
    <section
      aria-label={`${greetingCopy[period]}, ${fullName}`}
      className="relative isolate mx-4 mb-4 min-h-[132px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 shadow-lg sm:min-h-[154px]"
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-cover bg-center transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundImage: `url("${imagePaths[period]}")` }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-slate-950/10" />
      <div className="relative z-10 flex min-h-[132px] items-center px-5 py-6 sm:min-h-[154px] sm:px-8">
        <div className="max-w-full">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/75 sm:text-xs">
            Socialens · Your space, your moment
          </p>
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-4xl">
            {greetingCopy[period]},
          </h1>
          <p className="mt-1 font-serif text-xl font-medium tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-3xl">
            {fullName}
          </p>
        </div>
      </div>
      <img
        src={imagePaths[period]}
        alt=""
        aria-hidden="true"
        className="hidden"
        onLoad={() => setImageLoaded(true)}
      />
    </section>
  )
}
