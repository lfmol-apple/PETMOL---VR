import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const res = await fetch(
      `${BACKEND}/auth/verify-email/confirm?token=${encodeURIComponent(token)}`,
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
