import { createAdminClient } from '@/lib/supabase/admin'

export type CallProviderName = 'agora' | 'daily'

// Leave a safety buffer under each provider's real 10,000/month free
// limit, so we switch away BEFORE either one actually gets cut off or
// Starts billing - never right at the edge.
const AGORA_SAFE_LIMIT_SECONDS = 9000 * 60
const DAILY_SAFE_LIMIT_SECONDS = 9000 * 60

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}

/**
 * Decides which provider a brand-new call should use, based on OUR OWN
 * recorded usage this month (see increment_call_usage / recordCallUsage
 * below) - not the providers' own dashboards, which aren't something a
 * client or server can cheaply query in real time.
 *
 * Agora is tried first (per product decision). Once this month's tracked
 * Agora usage crosses the safety buffer, new calls go to Daily instead.
 * A new calendar month naturally starts both back at zero, since usage
 * rows are keyed by month.
 */
export async function pickCallProvider(): Promise<CallProviderName> {
  const month = currentMonthKey()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('call_provider_usage')
    .select('provider, total_seconds')
    .eq('month', month)

  const agoraUsed = data?.find((r) => r.provider === 'agora')?.total_seconds ?? 0
  const dailyUsed = data?.find((r) => r.provider === 'daily')?.total_seconds ?? 0

  if (agoraUsed < AGORA_SAFE_LIMIT_SECONDS) return 'agora'
  if (dailyUsed < DAILY_SAFE_LIMIT_SECONDS) return 'daily'
  // Both providers are near their free limit this month - fall back to
  // Agora anyway (worst case it errors, which the client already surfaces).
  return 'agora'
}

export async function recordCallUsage(provider: CallProviderName, seconds: number) {
  if (seconds <= 0) return
  const month = currentMonthKey()
  const supabase = createAdminClient()
  await supabase.rpc('increment_call_usage', { p_month: month, p_provider: provider, p_seconds: Math.round(seconds) })
}
