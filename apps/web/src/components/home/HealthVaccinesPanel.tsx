'use client';

import { PremiumCard, PremiumPanelShell } from '@/components/premium';
import { useI18n } from '@/lib/I18nContext';
import type { VaccineRecord } from '@/lib/petHealth';

interface HealthVaccinesPanelProps {
  petName: string | undefined;
  vaccines: VaccineRecord[];
  currentVaccines: VaccineRecord[];
  onOpenVaccineCenter: () => void;
}

function WarningTriangle() {
  return (
    <div className="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center animate-pulse z-10">
      <span
        className="absolute inset-0 bg-amber-400 shadow-sm ring-2 ring-white"
        style={{ clipPath: 'polygon(50% 0%, 100% 92%, 0% 92%)' }}
      />
      <span className="relative mt-1 text-[11px] font-black text-amber-950 leading-none">!</span>
    </div>
  );
}

function CriticalBadge() {
  return (
    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse shadow-sm border border-white/50 z-10">
      !
    </div>
  );
}

export function HealthVaccinesPanel({
  petName,
  vaccines,
  currentVaccines,
  onOpenVaccineCenter,
}: HealthVaccinesPanelProps) {
  const { t } = useI18n();

  const upcomingCount = currentVaccines.filter(v => {
    if (!v.next_dose_date) return false;
    const nextDose = new Date(v.next_dose_date);
    if (Number.isNaN(nextDose.getTime())) return false;
    const diffDays = Math.ceil((nextDose.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60;
  }).length;

  const dueSoonCount = currentVaccines.filter(v => {
    if (!v.next_dose_date) return false;
    const nextDose = new Date(v.next_dose_date);
    if (Number.isNaN(nextDose.getTime())) return false;
    const diffDays = Math.ceil((nextDose.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  }).length;

  const overdueCount = currentVaccines.filter(v => {
    if (!v.next_dose_date) return false;
    const nextDose = new Date(v.next_dose_date);
    if (Number.isNaN(nextDose.getTime())) return false;
    return nextDose.getTime() < Date.now();
  }).length;

  return (
    <PremiumPanelShell title={t('health.vaccines')} icon="💉" subtitle={petName}>
      <div className="space-y-4 sm:space-y-5">
        <PremiumCard variant="info">
          <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
            💉 Central de Vacinas
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            O fluxo canônico de vacinas agora fica na central atual. Importação de cartão, preenchimento
            rápido, formulário completo, histórico, deduplicação canônica e lembretes vivem em um único
            lugar.
          </p>
        </PremiumCard>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white p-3 sm:p-4 rounded-2xl text-center shadow-premium border border-slate-100">
            <div className="text-emerald-500 font-bold text-2xl sm:text-3xl drop-shadow-sm">{vaccines.length}</div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{t('health.total_vaccines')}</div>
          </div>
          <div className="relative bg-white p-3 sm:p-4 rounded-2xl text-center shadow-premium border border-slate-100">
            {dueSoonCount > 0 && overdueCount === 0 && <WarningTriangle />}
            <div className="text-brand-DEFAULT font-bold text-2xl sm:text-3xl drop-shadow-sm">{upcomingCount}</div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{t('health.upcoming')}</div>
          </div>
          <div className="relative bg-white p-3 sm:p-4 rounded-2xl text-center shadow-premium border border-slate-100">
            {overdueCount > 0 && <CriticalBadge />}
            <div className="text-rose-500 font-bold text-2xl sm:text-3xl drop-shadow-sm">{overdueCount}</div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{t('health.overdue')}</div>
          </div>
        </div>

        <PremiumCard>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-900">Abrir fluxo atual</h4>
              <p className="text-sm text-slate-600 mt-1">
                Use a central atual para importar o cartão, registrar vacinas, editar histórico e
                gerenciar os lembretes sem duplicação.
              </p>
            </div>
            <button
              onClick={onOpenVaccineCenter}
              className="w-full py-4 rounded-2xl bg-brand-DEFAULT hover:bg-brand-dark text-white text-[15px] font-bold shadow-md shadow-brand-DEFAULT/20 transition-all active:scale-[0.98]"
            >
              💉 Abrir central de vacinas
            </button>
          </div>
        </PremiumCard>
      </div>
    </PremiumPanelShell>
  );
}
