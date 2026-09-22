'use client';

import { useRef } from 'react';
import { useBackHandler } from '@/lib/backStack';

/**
 * Tela cheia verde mostrada ao tocar em "Perto de você" quando não há
 * nenhum pet sumido na região agora. Antes disso o toque não fazia nada
 * (o visualizador em Stories não tem slide pra mostrar sem alerta) — um
 * botão morto. Pedido do dono: virar um convite ativo a ficar de olho,
 * não um clique no vazio.
 */
interface NoNearbyMissingPetsOverlayProps {
  onClose: () => void;
}

export function NoNearbyMissingPetsOverlay({ onClose }: NoNearbyMissingPetsOverlayProps) {
  useBackHandler(true, onClose);
  const touchStartY = useRef<number | null>(null);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-6 text-center text-white"
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => {
        if (touchStartY.current == null) return;
        if (e.touches[0].clientY - touchStartY.current > 80) onClose();
      }}
      onTouchEnd={() => { touchStartY.current = null; }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-white"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 22px)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <span className="text-6xl" aria-hidden>👀</span>
      <p className="mt-5 text-[13px] font-black uppercase tracking-wide text-emerald-100">Tudo tranquilo por aqui</p>
      <p className="mt-4 max-w-xs text-[17px] font-bold leading-relaxed">
        Se algum pet estiver perdido perto da sua região, você pode fazer a diferença.
      </p>
      <p className="mt-3 max-w-xs text-[15px] font-medium leading-relaxed text-emerald-50">
        Fique de olho sempre que avistar algum animalzinho sem assistência nas redondezes.
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-8 rounded-full bg-white px-8 py-3 text-[14px] font-black text-emerald-700 shadow-lg transition-transform active:scale-[0.98]"
      >
        Entendi
      </button>
    </div>
  );
}
