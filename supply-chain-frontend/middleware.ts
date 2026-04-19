import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // For now, let's not handle auth in middleware since Firebase auth is client-side
  // We'll handle the redirect logic in the page components themselves
  
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
