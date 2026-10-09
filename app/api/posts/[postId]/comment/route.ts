import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { commentSchema } from '@/lib/utils/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = commentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid comment' }, { status: 400 })
  }
  const { content } = parsed.data

  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, user_id: user.id, content })
    .select('*, profiles(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabase.rpc('increment_comments', { post_id: postId })
  return NextResponse.json(data, { status: 201 })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
