import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const cookie = req.headers.get('cookie') || '';
    const res = await fetch(`${BACKEND}/auth/me`, {
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: 'Não autenticado' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const cookie = req.headers.get('cookie') || '';
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const cookie = req.headers.get('cookie') || '';
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) response.headers.set('set-cookie', setCookie);
    return response;
  } catch {
    return NextResponse.json({ detail: 'Erro interno.' }, { status: 500 });
  }
}
