'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-[#0056D2] to-indigo-600 text-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold mb-1 leading-tight">📚 Guia Completo de Vacinas Caninas</h2>
              <p className="text-blue-100 text-xs sm:text-sm">Tudo que você precisa saber sobre cada vacina</p>
            </div>
            <button
              onClick={() => setShowAllVaccinesGuide(false)}
              className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-xl text-white text-xl transition-colors flex-shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          <div className="space-y-4">
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
          </div>

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
        </div>

        <div className="bg-gray-50 border-t p-4">
          <button
            onClick={() => setShowAllVaccinesGuide(false)}
            className="w-full bg-[#0056D2] hover:bg-[#0047ad] text-white py-3 rounded-xl font-semibold transition-colors"
          >
            {t('common.close_guide')}
          </button>
        </div>
      </div>
    </div>
  );
}
