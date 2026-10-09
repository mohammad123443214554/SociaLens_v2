import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/feed', '/explore', '/reels', '/chat', '/profile', '/settings', '/saved', '/aperonix']
const AUTH_ROUTES = ['/login', '/signup', '/verify-email']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  // Only routes that actually need to know "is someone logged in" pay for
  // that check - every public page (home, terms, appeal...) and every
  // /api/* call was previously burning a network round-trip to Supabase's
  // auth server on EVERY single request, even ones that never needed to
  // know who (or whether) someone was signed in. API routes already do
  // their own auth check internally where it matters, so this was pure
  // overhead on top of that. This is the single biggest source of the
  // app feeling sluggish across the board - it ran on every page load
  // and every API call.
  if (!isProtected && !isAuth) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: session refresh karo - yahi fix hai
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/feed'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
