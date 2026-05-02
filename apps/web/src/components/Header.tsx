'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogout } from '@/hooks/useLogout';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const { t } = useI18n();
  const { tutor } = useAuth();
  const { initiateLogout } = useLogout();
  const [showLogo, setShowLogo] = useState(false);
  const pathname = usePathname();

  const userLabel = tutor?.name || tutor?.email?.split('@')[0] || null;
  const homeHref = userLabel ? '/home' : '/';
  const profileHref = '/profile';
  const helpHref = `https://wa.me/?text=${encodeURIComponent('Olá, preciso de ajuda com o PETMOL.')}`;
  const brandCaption = userLabel ? (pathname === '/home' ? 'você está na home' : 'voltar à home') : 'início';
  const profileCaption = pathname === '/profile' ? 'configurações abertas' : 'abrir perfil';

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
      <header className="bg-white border-b-2 border-[#0056D2]/20 sticky top-0 z-50 shadow-[0_2px_12px_rgba(0,86,210,0.10)] transition-shadow duration-300 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Marca alinhada à esquerda */}
          <Link
            href={homeHref}
            title={userLabel ? 'Ir para a home' : 'Ir para o início'}
            className={`flex items-center gap-2 transition-all duration-500 active:scale-95 ${
              showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <span className="flex flex-col leading-none">
              <span className="text-2xl font-black text-[#0056D2] tracking-tight flex items-center gap-1.5">
                Petmol<span className="ml-1">🐾</span>
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#0056D2]/65">
                {brandCaption}
              </span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className={`flex-1 hidden md:flex items-center justify-end gap-4 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>
            
            {/* User Auth */}
            {userLabel ? (
              <div className="flex items-center gap-3">
                <Link
                  href={profileHref}
                  title="Abrir configurações do perfil"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-md transition-all active:scale-95"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base">👤</span>
                  <span className="flex flex-col items-start leading-none">
                    <span>{userLabel}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">{profileCaption}</span>
                  </span>
                </Link>
                <a
                  href={helpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-10 px-3 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-bold hover:bg-slate-50 transition-all active:scale-95"
                >
                  Ajuda
                </a>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center h-10 px-3 rounded-xl bg-white text-slate-500 border border-slate-200 text-xs font-semibold hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
                >
                  {t('common.logout')}
                </button>
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
          <div className={`flex-1 flex md:hidden items-center justify-end gap-2 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>
            
            {/* Mobile User Auth */}
            {userLabel ? (
              <div className="flex items-center gap-2">
                <Link
                  href={profileHref}
                  title="Abrir configurações do perfil"
                  className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-md transition-all active:scale-95 max-w-[170px]"
                  aria-label="Perfil"
                >
                  <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm">👤</span>
                  <span className="flex min-w-0 flex-col items-start leading-none">
                    <span className="truncate max-w-[100px]">{userLabel}</span>
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/80">{profileCaption}</span>
                  </span>
                </Link>
                <a
                  href={helpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-10 px-2.5 rounded-xl bg-white text-slate-600 border border-slate-200 text-[11px] font-bold hover:bg-slate-50 transition-all active:scale-95"
                >
                  Ajuda
                </a>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center h-10 px-2.5 rounded-xl bg-white text-slate-500 border border-slate-200 text-[11px] font-semibold hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
                >
                  Sair
                </button>
              </div>
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
