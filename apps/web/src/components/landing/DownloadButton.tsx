'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { detectStorePlatform, type StorePlatform } from '@/lib/appStores';
import { appStoreUrl, googlePlayUrl } from '@/lib/landingLinks';
import { trackClick } from '@/lib/analytics/click';
import { useLandingContext } from '@/hooks/useLandingContext';

const BAR_DISMISS_KEY = 'petmol_landing_bar_dismissed';

/** Mede o clique no selo (sem dados pessoais) — nunca atrasa nem bloqueia a abertura da loja. */
function useStoreClick(placement: string, store: 'apple' | 'google' | 'auto') {
  const ctx = useLandingContext();
  return () => {
    void trackClick({
      source: 'landing',
      cta_type: 'store_download_click',
      target: store,
      metadata: { placement, variant: ctx.variant, iab: ctx.iab, fbclid: ctx.hasFbclid, ...ctx.campaign },
    });
  };
}

function usePlatform(): StorePlatform {
  const [p, setP] = useState<StorePlatform>('desktop');
  useEffect(() => {
    setP(detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || ''));
  }, []);
  return p;
}

function AppStoreBadge({ placement, heightPx }: { placement: string; heightPx: number }) {
  const ctx = useLandingContext();
  const onClick = useStoreClick(placement, 'apple');
  return (
    <a href={appStoreUrl(placement, ctx.campaign)} onClick={onClick} target="_blank" rel="noopener noreferrer" aria-label="Baixar na App Store"
      className="inline-block active:scale-[0.97] transition-transform" data-placement={placement} data-store="apple">
      <Image src="/landing/apple-badge-ptbr.svg" alt="Baixar na App Store" width={Math.round(heightPx * 2.99)} height={heightPx} style={{ height: heightPx, width: 'auto' }} />
    </a>
  );
}

function GooglePlayBadge({ placement, heightPx }: { placement: string; heightPx: number }) {
  const ctx = useLandingContext();
  const onClick = useStoreClick(placement, 'google');
  return (
    <a href={googlePlayUrl(placement, ctx.campaign)} onClick={onClick} target="_blank" rel="noopener noreferrer" aria-label="Disponível no Google Play"
      className="inline-block active:scale-[0.97] transition-transform" data-placement={placement} data-store="google">
      <Image src="/landing/google-play-badge-ptbr.png" alt="Disponível no Google Play" width={Math.round(heightPx * 2.584)} height={heightPx} style={{ height: heightPx, width: 'auto' }} />
    </a>
  );
}

/**
 * Botão "Baixar grátis": a chamada principal para a ação. Abre a loja do aparelho (App Store no iPhone,
 * Google Play no Android); no computador leva aos selos. Tem pulso e brilho — efeito que os selos oficiais
 * NÃO podem ter, por isso o botão é separado deles.
 */
export function DownloadCta({ placement, targetId }: { placement: string; targetId?: string }) {
  const platform = usePlatform();
  const ctx = useLandingContext();
  const track = useStoreClick(placement, platform === 'android' ? 'google' : platform === 'ios' ? 'apple' : 'auto');
  const cls = 'landing-cta flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-[#1a73ff] to-[#0056D2] px-6 py-3.5 text-[19px] font-black tracking-tight text-white active:scale-[0.98]';
  const label = (
    <>
      <svg className="landing-cue-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11M6.5 10.5L12 16l5.5-5.5M5 20h14" />
      </svg>
      Baixar grátis
    </>
  );
  if (platform === 'desktop') {
    return (
      <a href={targetId ? `#${targetId}` : '#'} onClick={() => track()} className={cls} data-placement={placement} data-store="auto">{label}</a>
    );
  }
  const href = platform === 'android' ? googlePlayUrl(placement, ctx.campaign) : appStoreUrl(placement, ctx.campaign);
  return (
    <a href={href} onClick={track} target="_blank" rel="noopener noreferrer" className={cls} data-placement={placement} data-store="auto">{label}</a>
  );
}

/** Convite animado acima dos selos: a seta se move, os selos não (regra de marca da Apple/Google). */
function DownloadCue() {
  return (
    <div className="mb-1 flex flex-col items-center text-[#0056D2]" aria-hidden="true">
      <span className="text-[13px] font-black uppercase tracking-wider">Baixe grátis</span>
      <svg className="landing-cue-arrow mt-0.5" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

/**
 * Os dois selos oficiais — nunca só um. No celular, o da loja do próprio
 * aparelho vem primeiro e um pouco maior; no desktop (SO não identificado),
 * os dois no mesmo tamanho, lado a lado. O clique é sempre do visitante —
 * nenhum link abre sozinho.
 */
export function DownloadButton({ placement, withWebLink = false, cue = false, compact = false }: { placement: string; className?: string; withWebLink?: boolean; cue?: boolean; compact?: boolean }) {
  const platform = usePlatform();

  const primary = platform === 'android'
    ? <GooglePlayBadge placement={placement} heightPx={56} />
    : <AppStoreBadge placement={placement} heightPx={56} />;
  const secondary = platform === 'android'
    ? <AppStoreBadge placement={placement} heightPx={40} />
    : <GooglePlayBadge placement={placement} heightPx={40} />;

  return (
    <div id={placement === 'hero' || placement === 'final' ? `lojas-${placement}` : undefined} className="w-full flex flex-col items-center gap-3">
      {cue && <DownloadCue />}
      {compact ? (
        <div className="flex items-center justify-center gap-3">
          {platform === 'android'
            ? <><GooglePlayBadge placement={placement} heightPx={46} /><AppStoreBadge placement={placement} heightPx={46} /></>
            : <><AppStoreBadge placement={placement} heightPx={46} /><GooglePlayBadge placement={placement} heightPx={46} /></>}
        </div>
      ) : platform === 'desktop' ? (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <AppStoreBadge placement={placement} heightPx={52} />
          <GooglePlayBadge placement={placement} heightPx={52} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5">
          {primary}
          {secondary}
        </div>
      )}
      {withWebLink && (
        <Link href="/register" className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-[#0056D2]`}>
          {platform === 'ios' ? 'Usar agora no navegador' : 'ou crie a conta e use no navegador'}
        </Link>
      )}
    </div>
  );
}

/**
 * Barra fixa no celular: aparece depois de rolar um pouco, com o benefício e o selo da loja do
 * aparelho. O visitante pode dispensar (lembrado nesta sessão). Sobe junto do rodapé, sem cobrir o selo.
 */
export function StickyDownloadBar() {
  const platform = usePlatform();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(BAR_DISMISS_KEY) === '1'); } catch { /* sem storage */ }
    const onScroll = () => setShow(window.scrollY > Math.max(400, window.innerHeight * 0.6));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show || dismissed || platform === 'desktop') return null;
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(BAR_DISMISS_KEY, '1'); } catch { /* sem storage */ }
  };
  return (
    <div className="landing-bar-in fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
      <button type="button" onClick={dismiss} aria-label="Fechar"
        className="absolute right-2 top-1 flex h-8 w-8 items-center justify-center text-lg leading-none text-slate-400">×</button>
      <div className="flex items-center justify-center gap-4">
        <p className="text-[13px] font-black leading-tight text-slate-800">
          Grátis<br /><span className="font-semibold text-slate-500">sem anúncios</span>
        </p>
        {platform === 'android' ? <GooglePlayBadge placement="barra" heightPx={44} /> : <AppStoreBadge placement="barra" heightPx={44} />}
      </div>
    </div>
  );
}
