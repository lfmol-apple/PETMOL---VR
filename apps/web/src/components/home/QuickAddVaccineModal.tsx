'use client';

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '@/lib/I18nContext';
import type { VaccineType } from '@/lib/petHealth';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { VaccineDateStep } from './VaccineDateStep';

type QuickAddData = {
  vaccine_type: VaccineType;
  vaccine_name: string;
  date_administered: string;
  next_dose_date: string;
  veterinarian: string;
};

type CommonVaccine = {
  type: VaccineType;
  name: string;
  icon: string;
  code: string;
};

interface QuickAddVaccineModalProps {
  quickAddData: QuickAddData;
  commonVaccines: CommonVaccine[];
  /** `appliedOn` = a data que o tutor escolheu (YYYY-MM-DD); sem ela vale o `when` antigo. */
  handleQuickAddVaccine: (selectedVaccine: CommonVaccine, when: 'today' | 'this_month' | 'unknown', appliedOn?: string) => Promise<void>;
  onClose: () => void;
  /** Leva pro formulário completo levando a vacina já escolhida (se houver). */
  onOpenFullForm: (prefill?: { vaccine_type: VaccineType; vaccine_name: string }) => void;
}

export function QuickAddVaccineModal({
  quickAddData: _quickAddData,
  commonVaccines,
  handleQuickAddVaccine,
  onClose,
  onOpenFullForm,
}: QuickAddVaccineModalProps) {
  const { t } = useI18n();
  const [selectedVaccine, setSelectedVaccine] = useState<CommonVaccine | null>(null);
  const [saving, setSaving] = useState(false);

  const quickChoices = useMemo<CommonVaccine[]>(() => {
    const fallback: CommonVaccine[] = [
      { type: 'multiple', name: 'V10 / V8', icon: '💉', code: 'DOG_POLYVALENT_V8' },
      { type: 'rabies', name: 'Raiva', icon: '🦠', code: 'DOG_RABIES' },
      { type: 'giardia', name: 'Giárdia', icon: '🧪', code: 'DOG_GIARDIA' },
      { type: 'leishmaniasis', name: 'Leishmaniose', icon: '🛡️', code: 'DOG_LEISH_TEC' },
      { type: 'other', name: 'Outro', icon: '➕', code: 'OTHER' },
    ];

    if (!commonVaccines?.length) return fallback;

    const byName = new Map(commonVaccines.map((v) => [v.name.toLowerCase(), v]));
    return [
      byName.get('v10') ?? fallback[0],
      byName.get('raiva') ?? fallback[1],
      byName.get('giárdia') ?? fallback[2],
      byName.get('leishmaniose') ?? fallback[3],
      byName.get('outro') ?? fallback[4],
    ];
  }, [commonVaccines]);

  // Salvar SÓ acontece nestes dois caminhos, ambos por toque explícito no
  // passo de data — escolher a vacina nunca grava nada.
  const handleSaveWithDate = async (appliedOn: string) => {
    if (!selectedVaccine || saving) return;
    setSaving(true);
    try {
      await handleQuickAddVaccine(selectedVaccine, 'today', appliedOn);
    } finally {
      setSaving(false);
    }
  };

  const handleUnknownDate = async () => {
    if (!selectedVaccine || saving) return;
    setSaving(true);
    try {
      await handleQuickAddVaccine(selectedVaccine, 'unknown');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell open onClose={onClose} tone="grey" size="md" z={SHEET_Z.nested}>
      <SheetHeader
        title="Registro rápido"
        subtitle="Vacina em poucos toques"
        media={<SheetIcon tone="blue"><Zap className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />

      <SheetShell.Body className="space-y-5">
        {!selectedVaccine ? (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Escolha a vacina com 1 toque.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {quickChoices.map((vac, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedVaccine(vac)}
                  className="p-4 rounded-2xl text-left transition-all bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 shadow-sm active:scale-95"
                >
                  <div className="text-2xl mb-2">{vac.icon}</div>
                  <div className="text-sm font-bold text-slate-900 leading-tight">
                    {vac.name === 'V10' ? 'V10 / V8' : vac.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <VaccineDateStep
            key={selectedVaccine.code}
            vaccineName={selectedVaccine.name === 'V10' ? 'V10 / V8' : selectedVaccine.name}
            icon={selectedVaccine.icon}
            saving={saving}
            onSave={handleSaveWithDate}
            onUnknown={handleUnknownDate}
          />
        )}
      </SheetShell.Body>

      <SheetShell.Footer tone="grey">
        <div className="flex gap-3">
          <button
            onClick={selectedVaccine ? () => setSelectedVaccine(null) : onClose}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
          >
            {selectedVaccine ? 'Voltar' : t('common.cancel')}
          </button>
          <button
            onClick={() => onOpenFullForm(selectedVaccine ? { vaccine_type: selectedVaccine.type, vaccine_name: selectedVaccine.name } : undefined)}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-[#0056D2] transition-all hover:bg-slate-50 active:scale-[0.98]"
          >
            {t('health.full_form')}
          </button>
        </div>
      </SheetShell.Footer>
    </SheetShell>
  );
}
