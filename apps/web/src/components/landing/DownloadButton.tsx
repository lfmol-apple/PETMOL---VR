'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { detectStorePlatform, type StorePlatform } from '@/lib/appStores';

// Links oficiais informados — usados literalmente, sem parâmetro adicional.
const APP_STORE_URL = 'https://apps.apple.com/app/id6809570555';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=br.com.petmol.app&pcampaignid=web_share';

function usePlatform(): StorePlatform {
  const [p, setP] = useState<StorePlatform>('desktop');
  useEffect(() => {
    setP(detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || ''));
  }, []);
  return p;
}

function AppStoreBadge({ placement, heightPx }: { placement: string; heightPx: number }) {
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Baixar na App Store"
      className="inline-block active:scale-[0.97] transition-transform" data-placement={placement} data-store="apple">
      <Image src="/landing/apple-badge-ptbr.svg" alt="Baixar na App Store" width={Math.round(heightPx * 2.99)} height={heightPx} style={{ height: heightPx, width: 'auto' }} />
    </a>
  );
}

function GooglePlayBadge({ placement, heightPx }: { placement: string; heightPx: number }) {
  return (
    <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" aria-label="Disponível no Google Play"
      className="inline-block active:scale-[0.97] transition-transform" data-placement={placement} data-store="google">
      <Image src="/landing/google-play-badge-ptbr.png" alt="Disponível no Google Play" width={Math.round(heightPx * 2.584)} height={heightPx} style={{ height: heightPx, width: 'auto' }} />
    </a>
  );
}

/**
 * Os dois selos oficiais — nunca só um. No celular, o da loja do próprio
 * aparelho vem primeiro e um pouco maior; no desktop (SO não identificado),
 * os dois no mesmo tamanho, lado a lado. O clique é sempre do visitante —
 * nenhum link abre sozinho.
 */
export function DownloadButton({ placement, withWebLink = false }: { placement: string; className?: string; withWebLink?: boolean }) {
  const platform = usePlatform();

  const primary = platform === 'android'
    ? <GooglePlayBadge placement={placement} heightPx={56} />
    : <AppStoreBadge placement={placement} heightPx={56} />;
  const secondary = platform === 'android'
    ? <AppStoreBadge placement={placement} heightPx={40} />
    : <GooglePlayBadge placement={placement} heightPx={40} />;

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {platform === 'desktop' ? (
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
        <Link href="/register" className="text-sm font-bold text-[#0056D2]">
          {platform === 'ios' ? 'Usar agora no navegador' : 'ou crie a conta e use no navegador'}
        </Link>
      )}
    </div>
  );
}

/** Barra fixa no celular: aparece depois de rolar, com o selo da loja do aparelho. */
export function StickyDownloadBar() {
  const platform = usePlatform();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show || platform === 'desktop') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-4 pt-3 flex justify-center backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
      {platform === 'android' ? <GooglePlayBadge placement="barra" heightPx={44} /> : <AppStoreBadge placement="barra" heightPx={44} />}
    </div>
  );
}
