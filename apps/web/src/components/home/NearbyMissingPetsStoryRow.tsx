'use client';

import { useState } from 'react';
import type { NearbyAlert } from './MissingPetAlertCard';
import type { SnoozeOption } from '@/features/interactions/missingPetsCarouselCooldown';

// Fileira de "stories" — pedido explícito do tutor mandando print do
// Instagram: círculos com anel gradiente, um por pet sumido perto, no topo
// da Home (mesma posição/linguagem visual da fileira de stories do Insta,
// não mais um chip sobre a foto). Toque num círculo abre o carrossel já
// naquele pet; soneca é decidida em home/page.tsx (regra de raio + cadência
// já existentes), aqui só é renderizado quando true.
const RING_GRADIENT = 'bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600';

interface NearbyMissingPetsStoryRowProps {
  alerts: NearbyAlert[];
  getPhotoUrl: (photoPath: string | undefined | null) => string | null;
  onOpen: (alert: NearbyAlert) => void;
  onSnooze: (option: SnoozeOption) => void;
}

export function NearbyMissingPetsStoryRow({ alerts, getPhotoUrl, onOpen, onSnooze }: NearbyMissingPetsStoryRowProps) {
  const [choosingSnooze, setChoosingSnooze] = useState(false);

  if (alerts.length === 0) return null;

  return (
    <div className="animate-fadeIn px-1.5 pt-1.5 min-[390px]:px-2.5 sm:px-4 sm:pt-4">
      <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {alerts.map((alert) => {
          const photoUrl = getPhotoUrl(alert.photo_url);
          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => onOpen(alert)}
              className="flex w-16 flex-shrink-0 flex-col items-center gap-1 active:opacity-80 transition-opacity"
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] ${RING_GRADIENT}`}>
                <span className="flex h-full w-full items-center justify-center rounded-full bg-white p-[2px]">
                  <span className="block h-full w-full overflow-hidden rounded-full bg-rose-50">
                    {photoUrl ? (
                      <img src={photoUrl} alt={alert.pet_name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xl">
                        {alert.species === 'cat' ? '🐱' : '🐶'}
                      </span>
                    )}
                  </span>
                </span>
              </span>
              <span className="w-full truncate text-center text-[10.5px] font-semibold text-slate-700">
                {alert.pet_name}
              </span>
            </button>
          );
        })}

        {/* Sempre por último na fileira — silenciar não é sobre um pet
            específico, é sobre a fileira toda aparecer sozinha. */}
        <button
          type="button"
          aria-label="Silenciar"
          onClick={() => setChoosingSnooze((v) => !v)}
          className="flex w-16 flex-shrink-0 flex-col items-center gap-1 active:opacity-80 transition-opacity"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
              <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
              <path d="M18 8a6 6 0 0 0-9.33-5" />
              <path d="m1 1 22 22" />
            </svg>
          </span>
          <span className="w-full truncate text-center text-[10.5px] font-semibold text-slate-400">Silenciar</span>
        </button>
      </div>

      {choosingSnooze && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-slate-500">Silenciar por:</span>
          <button
            type="button"
            onClick={() => onSnooze('hours')}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 active:scale-95 transition-transform"
          >
            Algumas horas
          </button>
          <button
            type="button"
            onClick={() => onSnooze('day')}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 active:scale-95 transition-transform"
          >
            1 dia
          </button>
        </div>
      )}
    </div>
  );
}
