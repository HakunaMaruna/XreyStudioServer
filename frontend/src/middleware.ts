import { NextRequest, NextResponse } from 'next/server';

// Клиенты подписок (v2rayNG, Shadowrocket, Clash, sing-box и др.) часто получают
// ссылку вида /sub/<token>. Это HTML-страница для браузера — клиенту нужно отдать
// машинную подписку с backend. Определяем клиент по User-Agent.
const BROWSER_UA = /Mozilla|AppleWebKit|Gecko|Chrome|Safari|Firefox/i;

export function middleware(req: NextRequest) {
  const match = req.nextUrl.pathname.match(/^\/sub\/([^/]+)\/?$/);
  if (!match) return NextResponse.next();

  const ua = req.headers.get('user-agent') || '';
  if (BROWSER_UA.test(ua)) return NextResponse.next();

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!apiBase) return NextResponse.next();

  const token = encodeURIComponent(match[1]);
  const target = new URL(`${apiBase}/api/subscriptions/${token}`);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  if (!target.searchParams.has('format')) target.searchParams.set('format', 'base64');
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: ['/sub/:path*'],
};
