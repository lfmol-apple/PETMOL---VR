'use client';

import { CalendarClock } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetSectionLabel, SheetShell } from '@/components/ui/sheet';
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
// Per feedback: days for everything — no weeks, no months, no years
// conversion at any horizon ("Em 11 meses" became "Em 335 dias"). "Hoje"/
// "Amanhã" stay as words since they're clearer than "0 dias"/"1 dia", not
// because they're an exception to the day-based rule.
function diffLabel(r: PetCareReminder): string {
  const diff = r.diff;
  // Lembrete sintético "sem histórico" (diff sentinela -9999): não é um
  // atraso de N dias, é ausência de registro.
  if (r.is_derived && diff <= -9000) {
    return r.domain === 'vaccine' ? 'Sem vacina' : 'Sem registro';
  }
  if (diff < 0) {
    const days = Math.abs(diff);
    if (days === 1) return 'Atrasado 1 dia';
    return `Atrasado ${days} dias`;
  }
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return `Em ${diff} dias`;
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
    <SheetShell open={open} onClose={onClose} hideHandle size="md" z={70}>
      <SheetHeader
        tone="petmol"
        withHandle
        title="Próximos eventos"
        subtitle={`${petName} · ${reminders.length} ${reminders.length === 1 ? 'evento' : 'eventos'}`}
        media={<SheetIcon tone="onPetmol"><CalendarClock className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain py-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <p className="mb-3 text-4xl">🎉</p>
            <p className="font-bold text-slate-700">Tudo em dia!</p>
            <p className="mt-1 text-sm text-slate-400">Nenhum evento pendente para {petName}.</p>
          </div>
        ) : (
            groups.map((group) => (
              <div key={group.label}>
                <SheetSectionLabel className="px-5 py-2">{group.label}</SheetSectionLabel>
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
                        {diffLabel(r)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </SheetShell>
  );
}
