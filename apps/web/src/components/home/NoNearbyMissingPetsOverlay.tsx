'use client';

import { useBackHandler } from '@/lib/backStack';

/**
 * Balão pequeno mostrado ao tocar em "Perto de você" quando não há nenhum
 * pet sumido na região agora. Antes disso o toque não fazia nada (o
 * visualizador em Stories não tem slide pra mostrar sem alerta) — um botão
 * morto. Era tela cheia (pedido inicial do dono, 22/09) mas ele achou
 * grande demais, "pegou a tela toda" — virou um balão compacto com o
 * mesmo texto, sem o emoji de olho.
 */
interface NoNearbyMissingPetsOverlayProps {
  onClose: () => void;
}

export function NoNearbyMissingPetsOverlay({ onClose }: NoNearbyMissingPetsOverlayProps) {
  useBackHandler(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[320px] rounded-2xl bg-emerald-600 p-5 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/15 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <p className="pr-5 text-[11px] font-black uppercase tracking-wide text-emerald-100">Tudo tranquilo por aqui</p>
        <p className="mt-2 text-[14px] font-bold leading-snug">
          Se algum pet estiver perdido perto da sua região, você pode fazer a diferença.
        </p>
        <p className="mt-2 text-[13px] font-medium leading-snug text-emerald-50">
          Fique de olho sempre que avistar algum animalzinho sem assistência nas redondezes.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-white py-2.5 text-[13px] font-black text-emerald-700 shadow-md transition-transform active:scale-[0.98]"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
