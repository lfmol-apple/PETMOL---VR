'use client';

/**
 * Lightbox de foto (item 10 do pedido de evolução do dashboard admin) —
 * compartilhado por toda miniatura de pet do painel. Um provider só, no
 * topo da página (ver page.tsx), pra escapar de qualquer contexto de
 * empilhamento/overflow de tabela (mesma lição do z-index do
 * PetPhotoPicker: nascer preso dentro de uma célula de tabela com
 * overflow-x-auto já quebrou coisa parecida nesta sessão).
 *
 * Arquivo neutro de propósito: sections.tsx, detail.tsx, JourneySection.tsx
 * e FeedingSection.tsx todos importam PetPhotoThumb daqui — colocar isto
 * dentro de sections.tsx criaria um import circular (detail.tsx já é
 * importado por sections.tsx).
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface LightboxState { src: string; alt: string }
const PhotoLightboxContext = createContext<{ open: (src: string, alt: string) => void } | null>(null);

export function PhotoLightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  return (
    <PhotoLightboxContext.Provider value={{ open: (src, alt) => setState({ src, alt }) }}>
      {children}
      {state && (
        <div
          role="dialog" aria-modal="true" aria-label={state.alt}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setState(null)}
        >
          <div className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto de usuário, tamanho variável, sem remotePatterns novo */}
            <img src={state.src} alt={state.alt} className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
            <div className="mt-3 flex items-center gap-3 text-[13px] text-white/90">
              <span className="font-semibold">{state.alt}</span>
              <button type="button" onClick={() => setState(null)}
                className="rounded-md bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">Fechar ✕</button>
            </div>
          </div>
        </div>
      )}
    </PhotoLightboxContext.Provider>
  );
}

function usePhotoLightbox(): ((src: string, alt: string) => void) | null {
  const ctx = useContext(PhotoLightboxContext);
  return ctx?.open ?? null;
}

/** Miniatura redonda com foto de pet — clique amplia em tela cheia (fecha
 * com X, ESC ou clique fora). Componente único usado por toda tabela/drawer
 * do painel que mostra foto de pet. Sem foto: ícone discreto, não
 * clicável — não há nada pra ampliar. */
export function PetPhotoThumb({ src, alt, size = 32, className = '' }: {
  src: string | null; alt: string; size?: number; className?: string;
}) {
  const openLightbox = usePhotoLightbox();
  const clickable = Boolean(src && openLightbox);
  return (
    <div
      title={alt}
      onClick={clickable ? (e) => { e.stopPropagation(); openLightbox!(src as string, alt); } : undefined}
      className={`flex-shrink-0 overflow-hidden rounded-full bg-slate-100 ${clickable ? 'cursor-zoom-in transition-opacity hover:opacity-80' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de usuário; sem remotePatterns novo
        <img src={src} alt={alt} width={size} height={size} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[13px]" aria-hidden>🐾</div>
      )}
    </div>
  );
}
