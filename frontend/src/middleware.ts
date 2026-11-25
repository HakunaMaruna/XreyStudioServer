import { NextRequest, NextResponse } from 'next/server';

// Клиенты подписок (v2rayNG, Shadowrocket, Clash, sing-box и др.) часто получают
// ссылку вида /sub/<token>. Это HTML-страница для браузера — клиенту нужно отдать
// машинную подписку с backend. Определяем клиент по User-Agent.
const BROWSER_UA = /Mozilla|AppleWebKit|Chrome|Safari|Firefox|Edg/i;

// Optional decoy mode: the public address shows a benign site, while the panel is
// reachable only through the secret entry path or after a successful login
// (which sets a routing-only httpOnly cookie). JWT remains the real authorization.
const DECOY_ENABLED = process.env.PANEL_DECOY === 'true';
const RAW_ENTRY_PATH = (process.env.PANEL_ENTRY_PATH || '').replace(/^\/+|\/+$/g, '');
// Fail closed: an unset or malformed secret disables the entry route entirely.
const ENTRY_PATH = /^[A-Za-z0-9_-]{6,64}$/.test(RAW_ENTRY_PATH) ? RAW_ENTRY_PATH : '';
const UI_COOKIE = 'xss_ui_access';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public documentation and SEO endpoints are intentionally reachable even
  // when the decoy page hides the management interface.
  if (
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  if (!DECOY_ENABLED) {
    if (pathname.startsWith('/sub/')) {
      const ua = req.headers.get('user-agent') || '';
      if (!BROWSER_UA.test(ua)) {
        const upstream = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000';
        return NextResponse.rewrite(`${upstream}/api/subscriptions${pathname}${req.nextUrl.search}`);
      }
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/decoy') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/sub/') ||
    pathname.includes('.') // static files served from /public
  ) {
    return NextResponse.next();
  }

  const entry = ENTRY_PATH ? `/${ENTRY_PATH}` : '';
  if (entry && (pathname === entry || pathname.startsWith(`${entry}/`))) {
    if (pathname === entry) {
      return NextResponse.redirect(new URL(`${entry}/login`, req.url));
    }
    const internal = pathname.slice(entry.length) || '/';
    return NextResponse.rewrite(new URL(internal, req.url));
  }

  if (req.cookies.get(UI_COOKIE)?.value === '1') {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL('/decoy', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
