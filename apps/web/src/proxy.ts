import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Next 16 proxy (formerly middleware). It ONLY checks that a session cookie exists and
 * redirects to /login otherwise. Authorization happens in the use cases and in the
 * [company] layout's membership check (defense in depth).
 */
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!getSessionCookie(request)) {
    const url = new URL('/login', request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next({ request: { headers: new Headers({ ...Object.fromEntries(request.headers), 'x-request-id': requestId }) } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  // everything except public pages, auth API, static files and the receipt/pdf routes' own checks
  matcher: ['/((?!login|register|api/auth|api/health|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
