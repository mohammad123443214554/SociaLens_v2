import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The public landing page has been removed.
  // Existing signed-in users go straight to the app; guests see login/signup.
  if (user) {
    redirect('/feed')
  }

  redirect('/login')
}
