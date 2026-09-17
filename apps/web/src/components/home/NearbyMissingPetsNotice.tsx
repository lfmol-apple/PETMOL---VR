'use client';

import type { NearbyAlert } from './MissingPetAlertCard';

// Aviso tocável que aparece sozinho ao abrir a Home quando há pet(s) sumido(s)
// na região (regra de soneca em missingPetsCarouselCooldown.ts decide QUANDO
// aparece). Não é um modal — não bloqueia a tela, some com um toque no X ou
// ao abrir o carrossel. O botão "Pet Sumido" com a bolinha vermelha continua
// existindo do jeito que está; este aviso é uma camada A MAIS, não substitui.
//
// Mostra as fotinhos reais dos pets sumidos (empilhadas, estilo avatares) em
// vez de um ícone genérico — é o que faz alguém reconhecer "ei, já vi esse
// cachorro" batendo o olho, sem nem precisar tocar.
const MAX_AVATARS = 3;

interface NearbyMissingPetsNoticeProps {
  alerts: NearbyAlert[];
  getPhotoUrl: (photoPath: string | undefined | null) => string | null;
  onOpen: () => void;
  onDismiss: () => void;
}

export function NearbyMissingPetsNotice({ alerts, getPhotoUrl, onOpen, onDismiss }: NearbyMissingPetsNoticeProps) {
  const shown = alerts.slice(0, MAX_AVATARS);
  const restCount = alerts.length - shown.length;

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
        <span className="flex flex-shrink-0 items-center">
          {shown.map((alert, i) => {
            const photoUrl = getPhotoUrl(alert.photo_url);
            return (
              <span
                key={alert.id}
                className="relative -ml-2.5 h-9 w-9 overflow-hidden rounded-full ring-2 ring-white first:ml-0"
                style={{ zIndex: shown.length - i }}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt={alert.pet_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-rose-50 text-base">
                    {alert.species === 'cat' ? '🐱' : '🐶'}
                  </span>
                )}
              </span>
            );
          })}
          {restCount > 0 && (
            <span
              className="relative -ml-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-500 ring-2 ring-white"
              style={{ zIndex: 0 }}
            >
              +{restCount}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-black text-slate-900">Tem pet sumido perto de você</span>
          <span className="block text-[11px] font-semibold text-rose-600">
            {alerts.length > 1 ? `${alerts.length} alertas na região · toque para ver` : 'Toque para ver'}
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
