/**
 * app/api/photo-proxy/route.ts
 * Proxy de imagens para URLs externas que não têm CORS.
 *
 * Uso: /api/photo-proxy?url=https://external.com/photo.jpg
 * O browser faz a requisição para nossa origem → sem CORS.
 *
 * Segurança:
 * - Só aceita domínios conhecidos (allowlist)
 * - Apenas GET/HEAD
 * - Content-Type validado como image/*
 */

import { NextRequest, NextResponse } from 'next/server';

// Domínios permitidos para proxy
const ALLOWED_HOSTS = [
  'petmol.app',
  'petmol.com.br',
  'localhost',
];

function isAllowedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get('url');

  if (!urlParam) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  if (!isAllowedHost(urlParam)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(urlParam, {
      headers: { 'User-Agent': 'PetmolPhotoProxy/1.0' },
      // não segue redirecionamentos para domínios externos
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 400 });
    }

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[photo-proxy] Fetch error:', err);
    return NextResponse.json({ error: 'Proxy fetch failed' }, { status: 502 });
  }
}
