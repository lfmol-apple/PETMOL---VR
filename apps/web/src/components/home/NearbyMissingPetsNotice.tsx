'use client';

import { useState } from 'react';
import type { NearbyAlert } from './MissingPetAlertCard';
import type { SnoozeOption } from '@/features/interactions/missingPetsCarouselCooldown';

// Chip tocável SOBRE a foto grande do próprio pet (estilo tag de localização
// do Insta sobre uma foto) quando há pet(s) sumido(s) na região — regra de
// soneca em missingPetsCarouselCooldown.ts decide QUANDO aparece. Não é um
// modal, não bloqueia a tela: some ao tocar numa das opções de silenciar, ou
// abre o carrossel/cartaz ao tocar no resto do chip. Pedido do tutor: "igual
// ao insta passando sem incomodar por sobre a foto do seu próprio pet... mas
// sem deixar de chamar a sua atenção" — por isso o fundo vivo (gradiente
// rosa) em vez de algo neutro, mesmo sendo pequeno e dispensável.
const MAX_AVATARS = 3;

interface NearbyMissingPetsNoticeProps {
  alerts: NearbyAlert[];
  getPhotoUrl: (photoPath: string | undefined | null) => string | null;
  onOpen: () => void;
  onSnooze: (option: SnoozeOption) => void;
}

export function NearbyMissingPetsNotice({ alerts, getPhotoUrl, onOpen, onSnooze }: NearbyMissingPetsNoticeProps) {
  const [choosingSnooze, setChoosingSnooze] = useState(false);
  const shown = alerts.slice(0, MAX_AVATARS);
  const restCount = alerts.length - shown.length;

  return (
    <div className="absolute left-2.5 right-2.5 top-12 z-30 sm:left-3 sm:right-3 sm:top-14 animate-fadeIn">
      <div className="flex items-center gap-2 rounded-2xl border border-white/25 bg-gradient-to-r from-rose-600/90 to-rose-500/90 px-3 py-2 shadow-lg shadow-rose-950/30 backdrop-blur-md">
        {choosingSnooze ? (
          <>
            <span className="min-w-0 flex-1 text-[11px] font-bold text-white/90">Silenciar por:</span>
            <button
              type="button"
              onClick={() => onSnooze('hours')}
              className="flex-shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black text-white active:scale-95 transition-transform"
            >
              Algumas horas
            </button>
            <button
              type="button"
              onClick={() => onSnooze('day')}
              className="flex-shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black text-white active:scale-95 transition-transform"
            >
              1 dia
            </button>
          </>
        ) : (
          <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="flex flex-shrink-0 items-center">
              {shown.map((alert, i) => {
                const photoUrl = getPhotoUrl(alert.photo_url);
                return (
                  <span
                    key={alert.id}
                    className="relative -ml-2 h-7 w-7 overflow-hidden rounded-full ring-2 ring-white/80 first:ml-0"
                    style={{ zIndex: shown.length - i }}
                  >
                    {photoUrl ? (
                      <img src={photoUrl} alt={alert.pet_name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-rose-100 text-[13px]">
                        {alert.species === 'cat' ? '🐱' : '🐶'}
                      </span>
                    )}
                  </span>
                );
              })}
              {restCount > 0 && (
                <span className="relative -ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-[10px] font-black text-white ring-2 ring-white/80">
                  +{restCount}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-black text-white">Tem pet sumido perto de você</span>
              <span className="block truncate text-[10px] font-semibold text-white/85">Toque para ver</span>
            </span>
          </button>
        )}
        <button
          type="button"
          aria-label={choosingSnooze ? 'Cancelar' : 'Silenciar'}
          onClick={() => setChoosingSnooze((v) => !v)}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white active:scale-90 transition-transform"
        >
          {choosingSnooze ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-3 w-3" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
