import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
    await supabase.rpc('decrement_likes', { post_id: postId })
    return NextResponse.json({ liked: false })
  } else {
    await supabase.from('likes').insert({ post_id: postId, user_id: user.id })
    await supabase.rpc('increment_likes', { post_id: postId })
    return NextResponse.json({ liked: true })
  }
}
