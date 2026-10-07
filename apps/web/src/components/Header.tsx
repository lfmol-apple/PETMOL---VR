'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogout } from '@/hooks/useLogout';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from 'lucide-react';
import { ContentMenu } from '@/components/ContentMenu';

export function Header() {
  const { t } = useI18n();
  const { tutor, token } = useAuth();
  const { initiateLogout } = useLogout();
  const [showLogo, setShowLogo] = useState(false);
  const pathname = usePathname();

  const hasSession = Boolean(tutor || token);
  const userLabel = tutor?.name?.split(' ')[0] || tutor?.email?.split('@')[0] || (hasSession ? 'Perfil' : null);
  const homeHref = hasSession ? '/home' : '/';
  const profileHref = '/profile';
  const helpHref = `https://wa.me/?text=${encodeURIComponent('Olá, preciso de ajuda com o PETMOL.')}`;

  // Animação de entrada da logo
  useEffect(() => {
    const timer = setTimeout(() => setShowLogo(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => { initiateLogout(); };

  // Mostrar header simplificado na landing page (quando não autenticado)
  const isLandingPage = pathname === '/' && !userLabel;

  return (
    <>
      <header
        className="bg-white border-b-2 border-[#0056D2]/20 sticky top-0 z-50 shadow-[0_2px_12px_rgba(0,86,210,0.10)] transition-shadow duration-300 py-2.5"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Marca alinhada à esquerda — clicável, volta pra Home/início.
              A legenda "você está na home" foi removida (09/10/2026): com
              "Início" agora também no menu ☰, a marca não precisa mais
              carregar essa explicação sozinha, e o header ganha altura. */}
          <Link
            href={homeHref}
            title={hasSession ? 'Ir para a home' : 'Ir para o início'}
            className={`flex flex-shrink-0 items-center gap-2 transition-all duration-500 active:scale-95 ${
              showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <span className="text-2xl font-black text-[#0056D2] tracking-tight flex items-center gap-1.5">
              Petmol<span className="ml-1">🐾</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className={`flex-1 hidden md:flex items-center justify-end gap-4 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>

            {/* Menu de conteúdo (Início / Guias / Recommendations / Sair) */}
            <ContentMenu homeHref={hasSession ? homeHref : undefined} onLogout={hasSession ? handleLogout : undefined} />

            {/* User Auth — perfil compacto: ícone + nome, sem 2ª linha.
                "Sair" saiu daqui e foi para o menu ☰ (09/10/2026). */}
            {userLabel ? (
              <div className="flex items-center gap-3">
                <Link
                  href={profileHref}
                  title="Abrir o perfil"
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-md transition-all active:scale-95"
                >
                  <User className="h-4 w-4" strokeWidth={2.4} />
                  <span>{userLabel}</span>
                </Link>
                <a
                  href={helpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-9 px-3 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-bold hover:bg-slate-50 transition-all active:scale-95"
                >
                  Ajuda
                </a>
              </div>
            ) : (
              !isLandingPage && (
                <Link
                  href="/login"
                  className="inline-flex items-center h-9 px-4 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-sm transition-all"
                >
                  {t('common.login')}
                </Link>
              )
            )}
          </div>

          {/* Mobile Navigation */}
          <div className={`flex min-w-0 flex-shrink flex-1 md:hidden items-center justify-end gap-1.5 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>

            {/* Menu de conteúdo (Início / Guias / Recommendations / Sair) */}
            <ContentMenu homeHref={hasSession ? homeHref : undefined} onLogout={hasSession ? handleLogout : undefined} />

            {/* Mobile User Auth — só ícone + nome truncado, sem 2ª linha
                e sem botão "Sair" próprio (foi para o menu ☰, 09/10/2026).
                Em telas muito estreitas o nome prioriza o ícone: encolhe
                primeiro que o resto do header. */}
            {userLabel ? (
              <Link
                href={profileHref}
                title="Abrir o perfil"
                className="inline-flex min-w-0 items-center gap-1.5 h-9 px-2.5 rounded-xl bg-[#0056D2] text-white text-xs font-bold hover:bg-[#0047ad] shadow-md transition-all active:scale-95"
                aria-label="Perfil"
              >
                <User className="h-4 w-4 flex-shrink-0" strokeWidth={2.4} />
                <span className="truncate max-w-[72px]">{userLabel}</span>
              </Link>
            ) : (
              !isLandingPage && (
                <Link
                  href="/login"
                  className="inline-flex items-center h-9 px-3 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-sm"
                >
                  Login
                </Link>
              )
            )}
          </div>
        </div>
      </header>
    </>
  );
}

export default Header;
