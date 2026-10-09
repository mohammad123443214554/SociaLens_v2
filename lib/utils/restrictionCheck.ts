// Restrictions are just a deadline column on profiles - NULL or a past
// timestamp means "not restricted". Checking it this way (rather than a
// separate on/off boolean) is what makes the 10-day auto-lift work
// without needing a job to actively flip anything off: the moment the
// deadline passes, this just naturally returns false again everywhere
// It's checked.
export function isRestricted(until: string | null | undefined): boolean {
  if (!until) return false
  return new Date(until).getTime() > Date.now()
}

// Whole days left until a restriction lifts, rounded up so "23 hours
// Left" still reads as "1 day left" rather than "0 days left".
export function daysRemaining(until: string | null | undefined): number {
  if (!until) return 0
  const ms = new Date(until).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export type RestrictedFeatureLabel = 'posting' | 'commenting' | 'messaging' | 'posting stories'

export function restrictionMessage(feature: RestrictedFeatureLabel, until?: string | null): string {
  if (!until) {
    return `You're temporarily restricted from ${feature}. This will lift automatically in a few days.`
  }
  const days = daysRemaining(until)
  const liftDate = new Date(until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const dayLabel = days <= 1 ? 'today' : `in ${days} days`
  return `You're temporarily restricted from ${feature}. This lifts automatically on ${liftDate} (${dayLabel}).`
}
