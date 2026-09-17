'use client';

import { formatLocalDateOnly } from '@/lib/localDate';

// Único formato de alerta "pet sumido perto de você" usado em toda a Home —
// fonte única de verdade pro tipo (ver home/page.tsx, que importa daqui em
// vez de redeclarar).
export type NearbyAlert = {
  id: string; pet_name: string; species: string | null;
  last_seen_location: string | null; missing_date: string | null;
  missing_time: string | null; created_at: string | null; user_id: string;
  photo_url: string | null; breed: string | null;
  characteristics: string | null; public_slug: string | null;
};

interface MissingPetAlertCardProps {
  alert: NearbyAlert;
  photoUrl: string | null;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  onViewCard: () => void;
  onSeeThis: () => void;
  onDismiss: () => void;
  onReport: () => void;
  /** O carrossel automático não expõe "recolher" — cada slide já é a única
   *  coisa na tela, encolher um deles não faz sentido ali (default true). */
  showCollapse?: boolean;
}

// Card "pet sumido perto de você" — extraído de home/page.tsx pra ser
// reaproveitado tanto na lista de sempre (aba "Perto de você" da
// PetSumidoSheet) quanto no popup automático em carrossel
// (NearbyMissingPetsCarousel). Comportamento idêntico ao original: nada de
// UI nova aqui, só virou componente.
export function MissingPetAlertCard({
  alert, photoUrl, collapsed, onToggleCollapsed, onViewCard, onSeeThis, onDismiss, onReport,
  showCollapse = true,
}: MissingPetAlertCardProps) {
  const speciesLabel = alert.species === 'cat' ? 'Gato' : alert.species === 'dog' ? 'Cachorro' : 'Pet';
  const missingInfo = alert.missing_date
    ? `Desaparecido em ${formatLocalDateOnly(alert.missing_date, 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}${alert.missing_time ? ' às ' + alert.missing_time : ''}`
    : 'Desaparecido recentemente';
  const descricao = [alert.breed, alert.characteristics].filter(Boolean).join(' · ');

  // ESTADO COMPACTO — o desaparecimento continua ativo; o card só ocupa
  // menos espaço. Tocar reabre. "Recolher" NUNCA dispensa.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onToggleCollapsed(false)}
        aria-label={`Ver alerta de ${alert.pet_name}`}
        className="flex w-full items-center gap-2.5 overflow-hidden rounded-2xl border border-rose-300 bg-rose-600 px-3.5 py-2.5 text-left shadow-md shadow-rose-900/20 active:opacity-90 transition-opacity"
      >
        <span className="flex-shrink-0 text-base" aria-hidden>🚨</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white">
          {alert.pet_name} continua desaparecido
        </span>
        <span className="flex-shrink-0 text-[11px] font-black uppercase tracking-wide text-white/90">Ver alerta ›</span>
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-md shadow-rose-900/5">
      {showCollapse && (
        <button
          type="button"
          aria-label="Recolher alerta"
          onClick={() => onToggleCollapsed(true)}
          className="absolute right-2 top-2 z-10 flex h-7 items-center gap-1 rounded-full bg-slate-900/40 pl-2.5 pr-2 text-[11px] font-bold text-white active:scale-95 transition-transform"
        >
          Recolher
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}
      <div className="flex items-stretch">
        {/* Foto do pet — ~metade do alerta. Toque abre o cartaz. */}
        <button
          type="button"
          onClick={onViewCard}
          aria-label={`Ver cartaz de ${alert.pet_name}`}
          className="relative flex w-[42%] flex-shrink-0 items-center justify-center self-stretch overflow-hidden bg-rose-50 text-5xl active:opacity-90 transition-opacity"
          style={{ minHeight: 168 }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={alert.pet_name} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span>{alert.species === 'cat' ? '🐱' : '🐶'}</span>
          )}
          <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-[12px] leading-none text-white">⤢</span>
        </button>
        <div className="min-w-0 flex-1 p-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600">
            🚨 {speciesLabel} desaparecido
          </span>
          <h3 className="mt-2 text-[16px] font-black leading-tight text-slate-900">
            {alert.pet_name} pode estar na sua região!
          </h3>
          {descricao && (
            <p className="mt-1 text-[12px] font-medium text-slate-500 line-clamp-2">
              {descricao}
            </p>
          )}
          {alert.last_seen_location && (
            <p className="mt-1 text-[12px] font-medium text-slate-600 line-clamp-2">
              Visto em: {alert.last_seen_location}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-400">{missingInfo}</p>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3 pt-1">
        <button
          type="button"
          onClick={onViewCard}
          className="flex-1 rounded-xl bg-rose-50 py-2.5 text-[13px] font-bold text-rose-700 active:scale-95 transition-transform"
        >
          Ver cartaz
        </button>
        <button
          type="button"
          onClick={onSeeThis}
          className="flex-1 rounded-xl bg-rose-600 py-2.5 text-[13px] font-black text-white shadow-sm shadow-rose-600/30 active:scale-95 transition-transform"
        >
          Vi este pet
        </button>
      </div>
      {/* Ação secundária DELIBERADA de ocultar (não é o "recolher"): esconde
          o alerta da Home por um tempo. Continua acessível na área "Pets
          desaparecidos na região". Nunca um X ambíguo. */}
      <div className="flex items-center border-t border-slate-100">
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 py-2 text-center text-[11px] font-semibold text-slate-400 active:bg-slate-50"
        >
          Não mostrar por enquanto
        </button>
        <span className="text-slate-200">·</span>
        <button
          type="button"
          onClick={onReport}
          className="flex-1 py-2 text-center text-[11px] font-semibold text-slate-400 active:bg-slate-50"
        >
          Denunciar
        </button>
      </div>
    </div>
  );
}
