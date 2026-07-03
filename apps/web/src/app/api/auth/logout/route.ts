import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get('cookie') || '';
    const res = await fetch(`${BACKEND}/auth/logout`, {
      method: 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}) },
    });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) response.headers.set('set-cookie', setCookie);
    return response;
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
