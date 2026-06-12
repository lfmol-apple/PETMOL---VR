import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rotas públicas — não exigem autenticação
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/register-pet',
  '/legal',
  '/privacy',
  '/terms',
  '/coverage',
  '/go',
  '/v/',
  '/e/',
  '/rg',
  '/p/',
  '/portal',
  '/handoff',
  '/auth/',
  '/invite/',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  return value.split(',')[0]?.trim() || null;
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.startsWith('192.168.') ||
    normalized.startsWith('10.')
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Deixa passar arquivos estáticos e rotas internas do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/brand') ||
    pathname.startsWith('/uploads') ||
    pathname === '/sw.js' ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|webp|webmanifest|json|txt|xml)$/)
  ) {
    return NextResponse.next();
  }

  // Rotas públicas passam direto
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Verifica o cookie de sessão:
  // - petmol_session: HttpOnly cookie setado pelo backend (funciona em produção mesmo domínio)
  // - petmol_auth: cookie JS setado pelo auth-token.ts (funciona em dev porta diferente)
  const session = request.cookies.get('petmol_session')?.value
    || request.cookies.get('petmol_auth')?.value;

  // Constrói a origin correta considerando proxy reverso (nginx → localhost:3000)
  // request.nextUrl.origin seria http://localhost:3000 em produção sem essa correção
  const forwardedProto =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) || request.nextUrl.protocol.replace(':', '');
  const forwardedHost =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ||
    firstHeaderValue(request.headers.get('host')) ||
    request.nextUrl.host;
  const origin = `${forwardedProto}://${forwardedHost}`;

  // Força domínio canônico para evitar que app/web abram páginas diferentes em hosts distintos
  // (ex.: petmol.com.br vs www.petmol.com.br)
  const canonicalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (canonicalSiteUrl) {
    try {
      const canonical = new URL(canonicalSiteUrl);
      const requestHostname = forwardedHost.split(':')[0]?.toLowerCase() || '';
      const requestHost = forwardedHost.toLowerCase();
      const canonicalHost = canonical.host.toLowerCase();
      const canonicalProto = canonical.protocol.replace(':', '').toLowerCase();
      const requestProto = forwardedProto.toLowerCase();

      if (!isLocalHost(requestHostname) && (requestHost !== canonicalHost || requestProto !== canonicalProto)) {
        const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonical.origin);
        return NextResponse.redirect(target, 308);
      }
    } catch {
      // NEXT_PUBLIC_SITE_URL inválida: ignora redirecionamento canônico
    }
  }

  // Trata o caminho raiz separadamente para evitar loop de redirecionamento:
  // / → (autenticado) /home | (não autenticado) /login
  // Se passássemos redirect=/ ao login, após o login voltaria para / que seria
  // bloqueada novamente pelo middleware, criando um loop infinito.
  if (pathname === '/') {
    const target = new URL(session ? '/home' : '/login', origin);
    return NextResponse.redirect(target);
  }

  if (!session) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('redirect', pathname + (request.nextUrl.search || ''));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware a todas as rotas exceto:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
