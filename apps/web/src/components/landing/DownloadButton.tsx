'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { detectStorePlatform, storeUrlFor, PLAY_STORE_URL, APP_STORE_URL, playStoreUrl, type StorePlatform } from '@/lib/appStores';

function usePlatform(): StorePlatform {
  const [p, setP] = useState<StorePlatform>('desktop');
  useEffect(() => {
    setP(detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || ''));
  }, []);
  return p;
}

/** Botão único de download: Android → Play; iPhone → App Store (ou "em breve"); desktop → QR. */
export function DownloadButton({ placement, className = '', withWebLink = false }: { placement: string; className?: string; withWebLink?: boolean }) {
  const platform = usePlatform();
  const [qrOpen, setQrOpen] = useState(false);
  const url = storeUrlFor(platform, placement);
  const base = `inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-black shadow-lg active:scale-[0.98] transition-transform ${className}`;

  const webLink = withWebLink ? (
    <Link href="/register" className="mt-3 block text-center text-sm font-bold text-[#0056D2]">
      {platform === 'ios' ? 'Usar agora no navegador' : 'ou crie a conta e use no navegador'}
    </Link>
  ) : null;

  if (url) {
    // Selo oficial (Apple/Google), sem o pill azul por trás — as duas marcas
    // já vêm com a própria arte/cor prontas para qualquer fundo.
    return (
      <div className="w-full flex flex-col items-center">
        <a href={url} target="_blank" rel="noopener noreferrer" data-placement={placement}
          aria-label={platform === 'android' ? 'Disponível no Google Play' : 'Baixar na App Store'}
          className="inline-block active:scale-[0.97] transition-transform">
          {platform === 'android' ? (
            <Image src="/landing/google-play-badge-ptbr.png" alt="Disponível no Google Play" width={189} height={56} className="h-14 w-auto" />
          ) : (
            <Image src="/landing/apple-badge-ptbr.svg" alt="Baixar na App Store" width={168} height={56} className="h-14 w-auto" />
          )}
        </a>
        {webLink}
      </div>
    );
  }

  if (platform === 'ios') {
    return (
      <div className="w-full">
        <div className={`${base} bg-slate-100 text-slate-500 shadow-none`} aria-disabled>
          Em breve na App Store
        </div>
        {withWebLink && webLink}
      </div>
    );
  }

  return (
    <div className="w-full">
      <button type="button" onClick={() => setQrOpen(true)} className={`${base} bg-[#0056D2] text-white shadow-blue-500/25`} data-placement={placement}>
        Baixar o app
      </button>
      {webLink}
      {qrOpen && <QrModal placement={placement} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

function QrModal({ placement, onClose }: { placement: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then((m) => m.toDataURL(playStoreUrl(`${placement}_qr`), { width: 320, margin: 1 }))
      .then((u) => { if (alive) setDataUrl(u); }).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [placement, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-black text-slate-900">Baixe o app no celular</h3>
        <p className="mt-1 text-sm text-slate-500">Aponte a câmera do celular para o QR code.</p>
        <div className="mx-auto mt-4 flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-slate-100 bg-white">
          {dataUrl ? <img src={dataUrl} alt="QR code para baixar o PETMOL no Google Play" width={200} height={200} /> : <span className="text-xs text-slate-400">Gerando…</span>}
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">Android (Google Play)</p>
        <a href={PLAY_STORE_URL} className="mt-1 inline-block text-sm font-bold text-[#0056D2]">Abrir no Google Play</a>
        <p className="mt-3 text-xs text-slate-400">{APP_STORE_URL ? 'iPhone: App Store' : 'iPhone: em breve na App Store'}</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600">Fechar</button>
      </div>
    </div>
  );
}

/** Barra fixa no celular: aparece depois de rolar, sempre com o download à mão. */
export function StickyDownloadBar() {
  const platform = usePlatform();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show || !storeUrlFor(platform, 'barra')) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
      <DownloadButton placement="barra" className="!py-3" />
    </div>
  );
}
