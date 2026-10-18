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
      className="relative isolate mb-4 w-full overflow-hidden rounded-2xl border border-white/10 bg-card shadow-sm"
    >
      <div className="relative h-[96px] w-full sm:h-[201px]">
        {(Object.keys(imagePaths) as GreetingPeriod[]).map((imagePeriod) => (
          <img
            key={imagePeriod}
            src={imagePaths[imagePeriod]}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            className={"absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ease-in-out " + (period === imagePeriod ? "opacity-100" : "opacity-0")}
            fetchPriority={period === imagePeriod ? "high" : "auto"}
          />
        ))}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent"
        />
        <div className="absolute inset-y-0 left-0 z-10 flex max-w-[88%] flex-col justify-center px-3 sm:max-w-[72%] sm:px-6">
          <p className="mb-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-white/90 sm:mb-1 sm:text-xs sm:tracking-[0.24em]">
            SociaLens · Your space, your moment
          </p>
          <h1 className="font-serif text-base font-semibold leading-tight tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl lg:text-4xl">
            {greetingCopy[period]},
          </h1>
          <p className="mt-0.5 break-words font-serif text-sm font-medium tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:mt-1 sm:text-2xl lg:text-3xl">
            {fullName}
          </p>
        </div>
      </div>
    </section>
  )
}
