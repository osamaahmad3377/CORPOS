import { NextResponse } from 'next/server';
import { checkAdminPassword, createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let password = '';
  try {
    const text = await req.text();
    if (text.length > 4096) throw new Error('too large');
    password = JSON.parse(text)?.password;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  try {
    if (!checkAdminPassword(password)) {
      await new Promise((r) => setTimeout(r, 500)); // slow down guessing
      return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
    return res;
  } catch (err) {
    console.error('[admin-login]', err);
    return NextResponse.json({ ok: false, error: 'Server is not configured: ' + err.message }, { status: 500 });
  }
}
