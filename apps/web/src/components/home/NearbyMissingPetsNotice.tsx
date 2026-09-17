'use client';

// Aviso tocável que aparece sozinho ao abrir a Home quando há pet(s) sumido(s)
// na região (regra de soneca em missingPetsCarouselCooldown.ts decide QUANDO
// aparece). Não é um modal — não bloqueia a tela, some com um toque no X ou
// ao abrir o carrossel. O botão "Pet Sumido" com a bolinha vermelha continua
// existindo do jeito que está; este aviso é uma camada A MAIS, não substitui.
interface NearbyMissingPetsNoticeProps {
  count: number;
  onOpen: () => void;
  onDismiss: () => void;
}

export function NearbyMissingPetsNotice({ count, onOpen, onDismiss }: NearbyMissingPetsNoticeProps) {
  return (
    <div
      className="fixed inset-x-0 z-[115] flex justify-center px-4 animate-fadeIn"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-left shadow-lg shadow-rose-900/15 active:scale-[0.98] transition-transform"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-rose-50 text-lg" aria-hidden>
          🚨
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-black text-slate-900">Tem pet sumido perto de você</span>
          <span className="block text-[11px] font-semibold text-rose-600">
            {count > 1 ? `${count} alertas na região · toque para ver` : 'Toque para ver'}
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="Dispensar aviso"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDismiss(); } }}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900/5 text-slate-400 active:scale-90 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      </button>
    </div>
  );
}
