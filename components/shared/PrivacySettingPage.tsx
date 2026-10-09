'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { PrivacyOptionSelector, PrivacyLevel, PrivacyCategory } from '@/components/shared/PrivacyOptionSelector'

interface PrivacySettingPageProps {
  pageTitle: string
  icon: React.ReactNode
  optionTitle: string
  optionDescription: string
  /** The profiles column this setting is stored in, e.g. 'post_privacy'. */
  column: string
  category: PrivacyCategory
  /** Extra note shown under the picker - e.g. explaining that the owner
   *  can always see their own content regardless of this setting. */
  note?: string
}

// One page = one privacy dimension. Every "Xyz Privacy" settings page in
// the app is just this component pointed at a different profiles column
// and privacy_selected_users category, so all 8 of them behave and look
// identically and only need to be built once.
export function PrivacySettingPage({ pageTitle, icon, optionTitle, optionDescription, column, category, note }: PrivacySettingPageProps) {
  const { user, profile, loading, refreshProfile } = useUser()
  const supabase = createClient()
  const [value, setValue] = useState<PrivacyLevel>('everyone')

  useEffect(() => {
    if (!profile) return
    setValue(((profile as any)[column] as PrivacyLevel) || 'everyone')
  }, [profile, column])

  const updateValue = async (v: PrivacyLevel) => {
    if (!user) return
    setValue(v)
    await supabase.from('profiles').update({ [column]: v }).eq('id', user.id)
    await refreshProfile()
  }

  if (loading) return <PageLoader />
  if (!profile || !user) return null

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/privacy" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{pageTitle}</h1>
      </div>

      <PrivacyOptionSelector
        icon={icon}
        title={optionTitle}
        description={optionDescription}
        value={value}
        onChange={updateValue}
        category={category}
        userId={user.id}
      />

      {note && <p className="text-xs text-muted-foreground px-1">{note}</p>}
    </div>
  )
}
