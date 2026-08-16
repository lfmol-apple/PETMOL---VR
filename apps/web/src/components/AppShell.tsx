'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
// Rotas que NÃO devem mostrar o header/footer global
const AUTH_ROUTES = ['/', '/login', '/register', '/register-pet', '/check-up', '/auth/callback'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isHome = pathname === '/home';

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-b from-slate-50 to-white overflow-hidden">
      <Header />
      {/* overflow-x-hidden explícito é obrigatório aqui — overflow-y-auto
          sozinho faz o overflow-x computar pra "auto" também (regra do CSS
          Overflow spec: um eixo non-visible força o outro a sair de
          visible), transformando <main> num container de scroll
          independente que nunca herdou o touch-action: pan-y do body
          (touch-action não é herdado). Isso deixava QUALQUER página
          arrastável pro lado, mesmo com o body travado. */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scroll-smooth [touch-action:pan-y]">
        {children}
      </main>
      <div className="hidden sm:block">
        <Footer />
      </div>
    </div>
  );
}
