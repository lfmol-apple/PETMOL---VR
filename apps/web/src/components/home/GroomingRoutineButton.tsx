'use client';

/** Banheirinha com chuveiro: o cano sobe da borda da banheira, faz a curva e termina na ducha. Traço fino. */
export function BathShowerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19.6 14V6.6A2.6 2.6 0 0 0 17 4h-2.6A1.6 1.6 0 0 0 12.8 5.6V6" />
      <path d="M11.4 6h2.8l1.1 2.3H10.3z" />
      <path d="M11 10.4v1M12.8 10.4v1.6M14.6 10.4v1" />
      <path d="M3.2 14h17.6" />
      <path d="M4.6 14v.8c0 2.6 1.9 4.2 4.5 4.2h5.8c2.6 0 4.5-1.6 4.5-4.2V14" />
      <path d="M7.6 19l-.9 2M16.4 19l.9 2" />
    </svg>
  );
}

/**
 * Banheirinha no canto inferior esquerdo da foto do pet (acima do passeio): abre o sheet de Banho e Tosa.
 * Verde = o pet tem lembrete de banho/tosa; apagado com risquinho = ainda não tem.
 */
export function GroomingRoutineButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Banho e tosa — lembrete ligado' : 'Banho e tosa'}
      title="Banho e tosa"
      className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:w-9 ${
        active ? 'border-white bg-emerald-500 hover:bg-emerald-600' : 'border-white/40 bg-black/30 hover:bg-black/50'
      }`}
    >
      <BathShowerIcon className="h-[18px] w-[18px]" />
      {!active && (
        <span
          data-testid="banho-inativo"
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[22px] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        />
      )}
    </button>
  );
}
