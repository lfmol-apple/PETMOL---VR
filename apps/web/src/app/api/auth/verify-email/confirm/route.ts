import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const res = await fetch(
      `${BACKEND}/auth/verify-email/confirm?token=${encodeURIComponent(token)}`,
    );
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    if (res.ok) {
      response.cookies.set('petmol_ev', '1', {
        path: '/', httpOnly: false, secure: IS_PROD, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ detail: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
