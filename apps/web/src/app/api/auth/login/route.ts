import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) response.headers.set('set-cookie', setCookie);
    if (res.ok) {
      response.cookies.set('petmol_ev', data.email_verified ? '1' : '0', {
        path: '/', httpOnly: false, secure: IS_PROD, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ detail: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
