import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/requireAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { admin } = auth
  const { userId } = await params

  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).single()
  if (error || !data) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  return NextResponse.json({ account: data })
}
