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

  useEffect(() => {
    const updatePeriod = () => setPeriod(getGreetingPeriod(new Date()))
    updatePeriod()
    const interval = window.setInterval(updatePeriod, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const profileData = profile as (typeof profile & { full_name?: string | null; name?: string | null }) | null
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  const fullName =
    profileData?.full_name?.trim() ||
    profileData?.name?.trim() ||
    (typeof metadataName === 'string' ? metadataName.trim() : '') ||
    'Mohammad Khan'

  return (
    <section
      aria-label={`${greetingCopy[period]}, ${fullName}`}
      className="relative isolate mx-4 mb-4 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-sm"
    >
      {/* Render the artwork as a real image so it keeps its proportions and isn't blurred or dimmed as a CSS background. */}
      <div className="relative flex min-h-[132px] items-center sm:min-h-[176px] lg:min-h-[200px]">
        <img
          key={period}
          src={imagePaths[period]}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-contain object-center"
          fetchPriority="high"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent"
        />
        <div className="relative z-10 max-w-[88%] px-4 py-5 sm:px-7 sm:py-7">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/85 sm:text-xs sm:tracking-[0.28em]">
            SociaLens · Your space, your moment
          </p>
          <h1 className="font-serif text-xl font-semibold leading-tight tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-4xl">
            {greetingCopy[period]},
          </h1>
          <p className="mt-1 break-words font-serif text-lg font-medium tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl">
            {fullName}
          </p>
        </div>
      </div>
    </section>
  )
}
