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
      <main className="flex-1 overflow-y-auto min-h-0 scroll-smooth">
        {children}
      </main>
      <div className="hidden sm:block">
        <Footer />
      </div>
    </div>
  );
}
