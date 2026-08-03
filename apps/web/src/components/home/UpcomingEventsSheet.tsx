'use client';

import { ModalPortal } from '@/components/ModalPortal';
import type { PetCareReminder } from '@/lib/petCareDomain';

interface Props {
  open: boolean;
  onClose: () => void;
  reminders: PetCareReminder[];
  petName: string;
  onSelect: (r: PetCareReminder) => void;
}

// Overdue (diff < 0) items only started reaching this sheet once the bell
// stopped filtering them out (see HomePetDashboard.tsx) — before that,
// diff was always >= 0 here, so nothing below ever needed to handle a
// negative number. Without this, an overdue item rendered as "Em -5 dias",
// which reads as nonsense rather than "atrasado".
// Per feedback: days, not weeks — "Em 2 sem." was less immediately
// readable than just "Em 15 dias". Kept months/years for longer horizons,
// where a day count stops being useful.
function diffLabel(diff: number): string {
  if (diff < 0) {
    const days = Math.abs(diff);
    if (days === 1) return 'Atrasado 1 dia';
    if (days < 30) return `Atrasado ${days} dias`;
    if (days < 365) return `Atrasado ${Math.round(days / 30)} meses`;
    return `Atrasado ${Math.round(days / 365)} ano${Math.round(days / 365) > 1 ? 's' : ''}`;
  }
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff < 30) return `Em ${diff} dias`;
  if (diff < 365) return `Em ${Math.round(diff / 30)} meses`;
  return `Em ${Math.round(diff / 365)} ano${Math.round(diff / 365) > 1 ? 's' : ''}`;
}

function groupLabel(diff: number): string {
  if (diff < 0) return 'Atrasado';
  if (diff === 0) return 'Hoje';
  if (diff <= 7) return 'Esta semana';
  if (diff <= 30) return 'Este mês';
  if (diff <= 90) return 'Próximos 3 meses';
  return 'Mais adiante';
}

function groupOrder(diff: number): number {
  if (diff < 0) return -1;
  if (diff === 0) return 0;
  if (diff <= 7) return 1;
  if (diff <= 30) return 2;
  if (diff <= 90) return 3;
  return 4;
}

export function UpcomingEventsSheet({ open, onClose, reminders, petName, onSelect }: Props) {
  if (!open) return null;

  const sorted = [...reminders].sort((a, b) => a.diff - b.diff);

  const groups: { label: string; items: PetCareReminder[] }[] = [];
  for (const r of sorted) {
    const lbl = groupLabel(r.diff);
    let g = groups.find(g => g.label === lbl);
    if (!g) { g = { label: lbl, items: [] }; groups.push(g); }
    g.items.push(r);
  }
  groups.sort((a, b) => groupOrder(a.items[0].diff) - groupOrder(b.items[0].diff));

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[71] flex flex-col max-h-[85dvh] rounded-t-[28px] bg-white shadow-2xl">

        {/* Handle + header */}
        <div className="flex-shrink-0 pt-3 px-5 pb-4 border-b border-slate-100">
          <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-slate-900 text-lg leading-tight">Próximos eventos</p>
              <p className="text-xs text-slate-400 mt-0.5">{petName} · {reminders.length} {reminders.length === 1 ? 'evento' : 'eventos'}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-2">
          {reminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-8">
              <p className="text-4xl mb-3">🎉</p>
              <p className="font-bold text-slate-700">Tudo em dia!</p>
              <p className="text-sm text-slate-400 mt-1">Nenhum evento pendente para {petName}.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {group.label}
                </p>
                <div className="px-3">
                  {group.items.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => { onSelect(r); onClose(); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                    >
                      <span className="text-2xl w-9 h-9 flex items-center justify-center flex-shrink-0 bg-slate-50 rounded-xl">
                        {r.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate leading-tight">{r.label}</p>
                        {r.sublabel && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{r.sublabel}</p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        r.diff < 0
                          ? 'bg-rose-100 text-rose-700'
                          : r.diff === 0
                          ? 'bg-amber-100 text-amber-700'
                          : r.diff <= 7
                          ? 'bg-orange-100 text-orange-700'
                          : r.diff <= 30
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {diffLabel(r.diff)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="h-6" />
        </div>
      </div>
    </ModalPortal>
  );
}
