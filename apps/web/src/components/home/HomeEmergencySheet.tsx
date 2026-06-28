'use client';

import { ModalPortal } from '@/components/ModalPortal';

interface HomeEmergencySheetProps {
  open: boolean;
  onClose: () => void;
}

export function HomeEmergencySheet({ open, onClose }: HomeEmergencySheetProps) {
  if (!open) return null;

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Centered modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm pointer-events-auto overflow-hidden">
          <div className="px-5 pt-5 pb-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🚨</span>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900 leading-tight">Emergência Veterinária</h2>
                <p className="text-xs text-gray-500">Abra as opções de atendimento mais próximas</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-95 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Links */}
            <div className="space-y-3">
              <a
                href="https://www.google.com/maps/search/clinica+veterinaria+24+horas+perto+de+mim"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 bg-red-500 hover:bg-red-600 rounded-2xl active:scale-[0.98] transition-all shadow-md shadow-red-500/25"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🏥</span>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">Clínicas Veterinárias</div>
                  <div className="text-xs text-red-100 mt-0.5">
                    Atendimento 24h · Consultas e urgências
                  </div>
                </div>
                <span className="text-white/70 text-lg">›</span>
              </a>

              <a
                href="https://www.google.com/maps/search/hospital+veterinario+24+horas+perto+de+mim"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 bg-orange-500 hover:bg-orange-600 rounded-2xl active:scale-[0.98] transition-all shadow-md shadow-orange-500/25"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🏨</span>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">Hospitais Veterinários</div>
                  <div className="text-xs text-orange-100 mt-0.5">
                    Internação e cirurgia 24h
                  </div>
                </div>
                <span className="text-white/70 text-lg">›</span>
              </a>
            </div>

            <p className="text-center text-[10px] text-gray-400 mt-4">
              Abre Google Maps com estabelecimentos próximos a você
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}