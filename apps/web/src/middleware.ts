import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rotas públicas — não exigem autenticação
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/register-pet',
  '/legal',
  '/privacy',
  '/terms',
  '/excluir-conta',
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
  '/achei-um-pet',
  '/cuidar/',
  '/loja',
  '/guias',
];

// Exportado só pra teste (middleware.test.ts) — comportamento idêntico,
// nenhuma mudança de lógica, só visibilidade pro Vitest não precisar
// simular o runtime de edge middleware do Next inteiro.
export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => {
    // '/' só deve bater com a raiz exata — um startsWith('/') solto bateria
    // com QUALQUER pathname (todos começam com '/'), o que tornava a
    // autenticação da middleware um no-op para todas as rotas.
    if (p === '/') return pathname === '/';
    // Entradas com barra final (ex: '/v/', '/auth/') já são prefixos
    // deliberados — cobrem qualquer coisa dentro delas.
    if (p.endsWith('/')) return pathname.startsWith(p);
    // Demais entradas: só a rota exata ou um filho dela ('/go' cobre
    // '/go/abc', mas não '/google').
    return pathname === p || pathname.startsWith(p + '/');
  });
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
