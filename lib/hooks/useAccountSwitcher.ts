'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Lets someone add more than one SociaLens account on this device and switch
// between them with one tap - like Instagram/Facebook's account switcher.
//
// IMPORTANT: this never stores a password anywhere. When an account is
// added, only its Supabase session refresh token is kept (the same kind of
// token Supabase already keeps for whichever account is currently logged
// in) - switching accounts uses that token to silently re-authenticate,
// the same way "staying logged in" already works today.

export interface StoredAccount {
  userId: string
  username: string
  avatarUrl: string | null
  refreshToken: string
}

const STORAGE_KEY = 'socialens-accounts'

function loadAccounts(): StoredAccount[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAccount[]) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts: StoredAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    // ignore - not worth failing the flow over
  }
}

export function useAccountSwitcher() {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<StoredAccount[]>([])

  useEffect(() => {
    setAccounts(loadAccounts())
  }, [])

  // Logs in with email/password and adds the resulting account to the
  // stored list (without necessarily switching to it).
  const addAccount = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) throw new Error(error?.message || 'Could not sign in with those details.')

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', data.session.user.id)
      .single()

    const account: StoredAccount = {
      userId: data.session.user.id,
      username: profile?.username || data.session.user.email || 'Account',
      avatarUrl: profile?.avatar_url || null,
      refreshToken: data.session.refresh_token,
    }

    const next = [...loadAccounts().filter(a => a.userId !== account.userId), account]
    saveAccounts(next)
    setAccounts(next)
    return account
  }, [supabase])

  // Switches the active session to a stored account and reloads the app.
  const switchToAccount = useCallback(async (account: StoredAccount) => {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: account.refreshToken })
    if (error || !data.session) {
      // The stored token no longer works (expired/revoked) - drop it so it
      // doesn't keep failing, and let the caller know.
      const next = loadAccounts().filter(a => a.userId !== account.userId)
      saveAccounts(next)
      setAccounts(next)
      throw new Error('This account needs you to log in again.')
    }

    // Keep the stored refresh token fresh for next time.
    const next = loadAccounts().map(a =>
      a.userId === account.userId ? { ...a, refreshToken: data.session!.refresh_token } : a
    )
    saveAccounts(next)
    setAccounts(next)

    window.location.href = '/feed'
  }, [supabase])

  const removeAccount = useCallback((userId: string) => {
    const next = loadAccounts().filter(a => a.userId !== userId)
    saveAccounts(next)
    setAccounts(next)
  }, [])

  return { accounts, addAccount, switchToAccount, removeAccount }
}
