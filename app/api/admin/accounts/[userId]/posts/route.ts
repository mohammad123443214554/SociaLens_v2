import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/requireAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { admin } = auth
  const { userId } = await params

  const { data, error } = await admin
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data })
} 
