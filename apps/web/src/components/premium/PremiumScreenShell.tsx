'use client';

/**
 * PremiumScreenShell
 * Wrapper para telas secundárias. NÃO usar na home/page.tsx.
 *
 * Fornece:
 * - Header com botão Voltar e ação direita opcional
 * - Área de conteúdo scrollável com fundo calmo
 * - Footer sticky com até 2 CTAs
 */
import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from './premiumTokens';

interface FooterAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

interface PremiumScreenShellProps {
  title: string;
  subtitle?: string;
  /** Elemento no canto direito do header (ex: botão salvar, menu) */
  rightAction?: ReactNode;
  /** CTA principal no footer */
  footerPrimary?: FooterAction;
  /** CTA secundário no footer (ex: Cancelar) */
  footerSecondary?: FooterAction;
  /** Esconder o botão Voltar */
  hideBack?: boolean;
  /** URL para o botão Voltar (padrão: router.back()) */
  backHref?: string;
  /** Sai do teto de largura de tela de celular (`max-w-2xl`, pensado pras
   * telas secundárias — cadastro, termos, etc.). Usar só em painéis de
   * desktop de verdade (hoje: só o Mission Control) — a página fica dona
   * da própria largura/padding em vez de herdar o padrão de tela mobile. */
  wide?: boolean;
  children: ReactNode;
}

export function PremiumScreenShell({
  title,
  subtitle,
  rightAction,
  footerPrimary,
  footerSecondary,
  hideBack = false,
  backHref,
  wide = false,
  children,
}: PremiumScreenShellProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) router.push(backHref);
    else router.back();
  };

  const hasFooter = footerPrimary || footerSecondary;

  return (
    <div className={`${tokens.pageBg} flex flex-col`} style={{ minHeight: '100dvh' }}>
      {/* ── Top bar ── */}
      <header className={tokens.topBar}>
        <div className="flex items-center gap-3">
          {!hideBack && (
            <button onClick={handleBack} className={tokens.btnBack} aria-label="Voltar">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Voltar</span>
            </button>
          )}
          <div>
            <h1 className={tokens.topBarTitle}>{title}</h1>
            {subtitle && <p className="text-xs text-slate-400 leading-tight">{subtitle}</p>}
          </div>
        </div>
        {rightAction && <div className="flex items-center">{rightAction}</div>}
      </header>

      {/* ── Conteúdo ── */}
      <main
        className={`flex-1 overflow-y-auto w-full ${wide ? '' : tokens.pageMaxWidth} ${hasFooter ? 'pb-4' : 'pb-8'}`}
      >
        {children}
      </main>

      {/* ── Footer sticky ── */}
      {hasFooter && (
        <footer className={tokens.stickyFooter}>
          {footerSecondary && (
            <button
              onClick={footerSecondary.onClick}
              disabled={footerSecondary.disabled}
              className={tokens.btnSecondary}
            >
              {footerSecondary.label}
            </button>
          )}
          {footerPrimary && (
            <button
              onClick={footerPrimary.onClick}
              disabled={footerPrimary.disabled}
              className={tokens.btnPrimary}
            >
              {footerPrimary.label}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
