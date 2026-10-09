interface VerifiedBadgeProps {
  type: 'blue' | 'yellow' | null | undefined
  /** Sizing/spacing classes only (e.g. "text-xs", "ml-1") - the badge
   * renders at 1em so it scales with whatever font-size class is passed,
   * matching the text it sits next to. */
  className?: string
}

// The scalloped 12-bump "seal" outline used by Instagram/X/Twitter's
// verified badges - generated as a smooth curve through alternating
// outer/inner points around a circle (not a plain checkmark character,
// which is what made the old badge look flat/unofficial).
const BADGE_OUTLINE =
  'M13.18 1.98 Q14.37 3.16 15.98 2.73 Q17.6 2.3 18.04 3.92 Q18.47 5.53 20.08 5.96 Q21.7 6.4 21.27 8.02 ' +
  'Q20.84 9.63 22.02 10.82 Q23.2 12 22.02 13.18 Q20.84 14.37 21.27 15.98 Q21.7 17.6 20.08 18.04 ' +
  'Q18.47 18.47 18.04 20.08 Q17.6 21.7 15.98 21.27 Q14.37 20.84 13.18 22.02 Q12 23.2 10.82 22.02 ' +
  'Q9.63 20.84 8.02 21.27 Q6.4 21.7 5.96 20.08 Q5.53 18.47 3.92 18.04 Q2.3 17.6 2.73 15.98 ' +
  'Q3.16 14.37 1.98 13.18 Q0.8 12 1.98 10.82 Q3.16 9.63 2.73 8.02 Q2.3 6.4 3.92 5.96 ' +
  'Q5.53 5.53 5.96 3.92 Q6.4 2.3 8.02 2.73 Q9.63 3.16 10.82 1.98 Q12 0.8 13.18 1.98 Z'

// Yellow is reserved for SociaLensOfficial specifically - it's set once,
// directly in the database, and nothing in the admin panel can hand out
// a second one. Blue is the one admins can grant to anyone else.
export function VerifiedBadge({ type, className = '' }: VerifiedBadgeProps) {
  if (!type) return null
  const fill = type === 'yellow' ? '#FFB800' : '#0095F6'

  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={type === 'yellow' ? 'Official account' : 'Verified account'}>
        <path d={BADGE_OUTLINE} fill={fill} />
        <path d="M7.2 12.5L10.2 15.5L17 8.3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </span>
  )
}
