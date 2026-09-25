'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DownloadCta } from '@/components/landing/DownloadButton';

const MIN = 1;
const MAX = 4;

/**
 * Visualizador da tela do app: pinça para dar zoom, arrasto quando ampliado, toque duplo alterna 1×/2,5×.
 * O zoom é feito aqui dentro (não no navegador), então o botão "Baixar grátis" fica FIXO embaixo o tempo
 * todo — nunca sai da tela, não importa o quanto a pessoa amplie.
 */
export function PhoneZoomViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const areaRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const clamp = (s: number, x: number, y: number) => {
    const el = areaRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const mx = (w * (s - 1)) / 2;
    const my = (h * (s - 1)) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sem captura: segue funcionando */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { dist: dist(), s: tRef.current.s };
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const cur = tRef.current;
        setT(cur.s > 1 ? { s: 1, x: 0, y: 0 } : clamp(2.5, 0, 0));
      }
      lastTap.current = now;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    const cur = tRef.current;
    if (pointers.current.size >= 2 && pinch.current) {
      const s = Math.max(MIN, Math.min(MAX, pinch.current.s * (dist() / pinch.current.dist)));
      setT(clamp(s, cur.x, cur.y));
    } else if (cur.s > 1) {
      setT(clamp(cur.s, cur.x + (next.x - prev.x), cur.y + (next.y - prev.y)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (tRef.current.s <= 1.02) setT({ s: 1, x: 0, y: 0 });
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label="Tela do app ampliada">
      <div className="flex shrink-0 items-center justify-between px-4 pb-2" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <p className="text-[13px] font-semibold text-white/70">Pince para dar zoom · toque duas vezes para ampliar</p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:scale-95">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={areaRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full rounded-2xl object-contain will-change-transform"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: pointers.current.size ? 'none' : 'transform 0.18s ease-out' }}
        />
      </div>

      {/* Fica fixo aqui embaixo, fora da área que dá zoom */}
      <div className="shrink-0 bg-slate-950 px-5 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto w-full max-w-sm">
          <DownloadCta placement="zoom-botao" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
