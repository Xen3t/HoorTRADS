import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/maintenance',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/admin/maintenance',
  '/_next',
  '/favicon.ico',
]

const ADMIN_PATHS = ['/admin']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  // Allow static assets
  if (pathname.match(/\.(svg|png|jpg|ico|css|js|woff2?)$/)) {
    return NextResponse.next()
  }

  const token = request.cookies.get('hoortrad_session')?.value

  // No token — redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  void ADMIN_PATHS

  const response = NextResponse.next()
  response.headers.set('x-pathname', pathname)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
