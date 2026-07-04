import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const authHeader = req.headers.get('authorization');
    const cookieHeader = req.headers.get('cookie') || '';

    const res = await fetch(`${BACKEND}/auth/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    const response = NextResponse.json(data, { status: res.status });
    if (res.ok) {
      response.cookies.delete('petmol_session');
      response.cookies.delete('petmol_auth');
      response.cookies.delete('petmol_ev');
    }
    return response;
  } catch {
    return NextResponse.json({ detail: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
