'use client';

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '@/lib/I18nContext';
import type { VaccineType } from '@/lib/petHealth';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';

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
  handleQuickAddVaccine: (selectedVaccine: CommonVaccine, when: 'today' | 'this_month' | 'unknown') => Promise<void>;
  onClose: () => void;
  onOpenFullForm: () => void;
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

  const handleWhen = async (when: 'today' | 'this_month' | 'unknown') => {
    if (!selectedVaccine || saving) return;
    setSaving(true);
    try {
      await handleQuickAddVaccine(selectedVaccine, when);
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
          <div>
            <p className="text-sm text-gray-600 mb-3">Quando foi?</p>
            <div className="space-y-2.5">
              <button
                onClick={() => handleWhen('today')}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#0056D2] text-white font-semibold hover:bg-[#0047ad] disabled:opacity-60 shadow-md shadow-blue-600/20"
              >
                Hoje
              </button>
              <button
                onClick={() => handleWhen('this_month')}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-white border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                Esse mês
              </button>
              <button
                onClick={() => handleWhen('unknown')}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-white border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                Não lembro
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Se não lembrar a data, salvamos uma referência para você revisar depois.
            </p>
          </div>
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
            onClick={onOpenFullForm}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-[#0056D2] transition-all hover:bg-slate-50 active:scale-[0.98]"
          >
            {t('health.full_form')}
          </button>
        </div>
      </SheetShell.Footer>
    </SheetShell>
  );
}
