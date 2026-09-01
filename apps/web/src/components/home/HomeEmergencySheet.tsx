'use client';

import { ChevronRight, Hospital, Siren, Stethoscope } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';

interface HomeEmergencySheetProps {
  open: boolean;
  onClose: () => void;
}

export function HomeEmergencySheet({ open, onClose }: HomeEmergencySheetProps) {
  if (!open) return null;

  return (
    <SheetShell open={open} onClose={onClose} variant="center" size="sm" z={90}>
      <SheetHeader
        title="Emergência Veterinária"
        subtitle="Atendimento mais próximo de você"
        media={<SheetIcon tone="rose"><Siren className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />
      <SheetShell.Body className="space-y-3">
        <a
          href="https://www.google.com/maps/search/clinica+veterinaria+24+horas+perto+de+mim"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5 rounded-2xl bg-rose-500 p-4 shadow-[0_8px_20px_-6px_rgba(244,63,94,0.45)] transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Stethoscope className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-white">Clínicas Veterinárias</div>
            <div className="mt-0.5 text-[12px] text-rose-100">Atendimento 24h · consultas e urgências</div>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/70" strokeWidth={2.5} />
        </a>

        <a
          href="https://www.google.com/maps/search/hospital+veterinario+24+horas+perto+de+mim"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5 rounded-2xl bg-orange-500 p-4 shadow-[0_8px_20px_-6px_rgba(249,115,22,0.45)] transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Hospital className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-white">Hospitais Veterinários</div>
            <div className="mt-0.5 text-[12px] text-orange-100">Internação e cirurgia 24h</div>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/70" strokeWidth={2.5} />
        </a>

        <p className="pt-1 text-center text-[11px] leading-relaxed text-slate-400">
          Abre o Google Maps com estabelecimentos próximos a você.
        </p>
      </SheetShell.Body>
    </SheetShell>
  );
}
