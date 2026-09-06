'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';

interface VaccineGuideInfo {
  importance: string;
  description: string;
  protects: string[];
  frequency: string;
}

interface VaccineGuideProps {
  vaccineInfo: Record<string, VaccineGuideInfo>;
  setShowAllVaccinesGuide: Dispatch<SetStateAction<boolean>>;
}

export function VaccineGuide({ vaccineInfo, setShowAllVaccinesGuide }: VaccineGuideProps) {
  const { t } = useI18n();
  const close = () => setShowAllVaccinesGuide(false);

  return (
    <SheetShell open onClose={close} tone="grey" hideHandle z={SHEET_Z.high}>
      <SheetHeader
        tone="petmol"
        withHandle
        title="Guia de vacinas"
        subtitle="O que cada vacina protege"
        onClose={close}
      />

      <SheetShell.Body className="space-y-4">
        {Object.entries(vaccineInfo).map(([type, info]) => (
          <div key={type} className="bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-blue-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💉</span>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-800">
                    {type === 'multiple' ? 'V10/V8 (Polivalente)' :
                     type === 'rabies' ? 'Raiva' :
                     type === 'leptospirosis' ? 'Leptospirose' :
                     type === 'kennel_cough' ? 'Tosse dos Canis' :
                     type === 'giardia' ? 'Giárdia' :
                     type === 'coronavirus' ? 'Coronavírus' :
                     type === 'influenza' ? 'Gripe Canina' :
                     type === 'lyme' ? 'Doença de Lyme' :
                     type === 'parainfluenza' ? 'Parainfluenza' :
                     type === 'adenovirus' ? 'Adenovírus' :
                     type === 'hepatitis' ? 'Hepatite' : 'Outras'}
                  </h3>
                  <span className="text-xs font-semibold px-3 py-1 bg-white rounded-full border border-blue-300 whitespace-nowrap">
                    {info.importance}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mb-3 leading-relaxed">{info.description}</p>

                <div className="bg-white rounded-lg p-3 mb-3 border border-blue-200">
                  <p className="text-xs font-semibold text-blue-900 mb-2">🛡️ Protege contra:</p>
                  <ul className="space-y-1">
                    {info.protects.map((disease, idx) => (
                      <li key={idx} className="text-xs text-gray-700 flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>{disease}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-blue-100 rounded-lg p-2.5">
                  <p className="text-xs text-blue-900">
                    <span className="font-semibold">📅 Frequência:</span> {info.frequency}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-6 bg-gradient-to-r from-gray-100 to-blue-100 rounded-xl p-4 border-2 border-gray-300">
          <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>🏷️</span>
            <span>Legenda de Importância:</span>
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">🔴</span>
              <span className="font-semibold text-red-700">OBRIGATÓRIA</span>
              <span className="text-gray-600">- Essencial para todos os cães (V10/V8 e Raiva)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">🟡</span>
              <span className="font-semibold text-amber-700">MUITO RECOMENDADA</span>
              <span className="text-gray-600">- Importante conforme estilo de vida</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">🟢</span>
              <span className="font-semibold text-green-700">OPCIONAL</span>
              <span className="text-gray-600">- Consulte o veterinário sobre necessidade</span>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
          <p className="text-sm text-yellow-900 font-medium flex items-start gap-2">
            <span className="text-xl">⚠️</span>
            <span>
              <strong>Importante:</strong> Os intervalos são recomendações gerais. Consulte um veterinário.
            </span>
          </p>
        </div>
      </SheetShell.Body>

      <SheetShell.Footer tone="grey">
        <button
          type="button"
          onClick={close}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-[15px] font-bold text-slate-700 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f2f7]"
        >
          {t('common.close_guide')}
        </button>
      </SheetShell.Footer>
    </SheetShell>
  );
}
