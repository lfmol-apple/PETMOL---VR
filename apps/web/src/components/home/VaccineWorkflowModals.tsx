'use client';

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { VaccineCardUpload } from '@/components/VaccineCardUpload';
import { useI18n } from '@/lib/I18nContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';
import type { VaccineCardOcrRecord, VaccineCardOcrResponse } from '@/lib/vaccineOcr';
import type { PetHealthProfile, VaccineRecord, VaccineType } from '@/lib/petHealth';
import type { VaccineFormData } from '@/lib/types/homeForms';
import { ReminderPicker } from '@/components/ReminderPicker';

type VaccineCardAnalysis = (VaccineCardOcrResponse & { processed_images: number }) | null;

interface VaccineWorkflowModalsProps {
  showVaccineForm: boolean;
  showAIUpload: boolean;
  cardAnalysis: VaccineCardAnalysis;
  editingVaccine: VaccineRecord | null;
  vaccineFormData: VaccineFormData;
  setVaccineFormData: Dispatch<SetStateAction<VaccineFormData>>;
  resetVaccineForm: () => void;
  onOpenAIUpload: () => void;
  onCloseAIUpload: () => void;
  onOpenVaccineFormFromAIUpload: () => void;
  currentPet: Pick<PetHealthProfile, 'pet_id' | 'pet_name' | 'species'> | null;
  vaccineFiles: File[];
  setVaccineFiles: Dispatch<SetStateAction<File[]>>;
  selectedPetId: string | null;
  handleSaveVaccine: () => Promise<void>;
  vaccineFormSaving: boolean;
  pets: PetHealthProfile[];
  closeCardAnalysis: () => void;
  reviewRegistros: VaccineCardOcrRecord[];
  reviewExpectedCount: number;
  setReviewExpectedCount: Dispatch<SetStateAction<number>>;
  setReviewConfirmed: Dispatch<SetStateAction<boolean>>;
  addReviewRegistro: () => void;
  removeReviewRegistro: (index: number) => void;
  updateReviewRegistro: (index: number, patch: Partial<VaccineCardOcrRecord>) => void;
  mapNomeComercialToTipo: (name: string) => string;
  handleImportAnalyzedVaccines: () => Promise<void>;
  importVaccineLoading: boolean;
  reviewConfirmed: boolean;
  reviewLearnEnabled: boolean;
}

export function VaccineWorkflowModals({
  showVaccineForm,
  showAIUpload,
  cardAnalysis,
  editingVaccine,
  vaccineFormData,
  setVaccineFormData,
  resetVaccineForm,
  onOpenAIUpload,
  onCloseAIUpload,
  onOpenVaccineFormFromAIUpload,
  currentPet,
  vaccineFiles,
  setVaccineFiles,
  selectedPetId,
  handleSaveVaccine,
  vaccineFormSaving,
  pets,
  closeCardAnalysis,
  reviewRegistros,
  reviewExpectedCount,
  setReviewExpectedCount,
  setReviewConfirmed,
  addReviewRegistro,
  removeReviewRegistro,
  updateReviewRegistro,
  mapNomeComercialToTipo,
  handleImportAnalyzedVaccines,
  importVaccineLoading,
  reviewConfirmed,
  reviewLearnEnabled,
}: VaccineWorkflowModalsProps) {
  const { t } = useI18n();
  const [toast, setToast] = useState<string | null>(null);
  const [customProductIndex, setCustomProductIndex] = useState<number | null>(null);
  const [customProductName, setCustomProductName] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function resetCustomProductInput() {
    setCustomProductIndex(null);
    setCustomProductName('');
  }

  function applyCustomProduct(index: number) {
    const productName = customProductName.trim();
    if (!productName) {
      showToast('Digite o nome da vacina antes de aplicar.');
      return;
    }

    updateReviewRegistro(index, {
      nome_comercial: productName,
      tipo_vacina: mapNomeComercialToTipo(productName),
    });
    setReviewConfirmed(false);
    resetCustomProductInput();
  }

  return (
    <ModalPortal>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 shadow-lg text-sm font-semibold text-amber-800 max-w-sm w-full flex items-center gap-2">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-[11px] font-bold text-amber-700 underline">OK</button>
        </div>
      )}
      {showVaccineForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-[80]">
          <div className="p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                💉 {editingVaccine ? t('health.vaccines.form.title.edit') : t('health.vaccines.form.title.new')}
              </h3>
              <div className="flex items-center gap-2">
                {!editingVaccine && (
                  <button
                    onClick={onOpenAIUpload}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-[#0056D2] transition-all text-sm font-medium shadow-lg"
                  >
                    <span className="text-lg">🤖</span>
                    {t('health.vaccines.form.read_card')}
                  </button>
                )}
                <button
                  onClick={resetVaccineForm}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('vaccine_form.vaccine_type')} *
                </label>
                <select
                  value={vaccineFormData.vaccine_type}
                  onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, vaccine_type: e.target.value as VaccineType }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                >
                  <option value="multiple">V10</option>
                  <option value="multiple">V8</option>
                  <option value="rabies">Raiva</option>
                  <option value="influenza">Gripe</option>
                  <option value="giardia">Giárdia</option>
                  <option value="leishmaniasis">Leishmaniose</option>
                  <option value="other">Outra</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('vaccine_form.vaccine_name')} *
                </label>
                <input
                  type="text"
                  value={vaccineFormData.vaccine_name}
                  onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, vaccine_name: e.target.value }))}
                  placeholder="Ex: V10, V8, Raiva, Gripe..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                />
                <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">🏷️ Catálogo — clique para preencher:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(currentPet?.species === 'cat'
                      ? [
                          { label: 'V3 (Tríplice)', type: 'multiple', code: 'CAT_POLYVALENT' },
                          { label: 'V4 (Quádrupla)', type: 'multiple', code: 'CAT_POLYVALENT' },
                          { label: 'V5 (Quíntupla)', type: 'multiple', code: 'CAT_POLYVALENT' },
                          { label: 'Antirrábica', type: 'rabies', code: 'CAT_RABIES' },
                          { label: 'FeLV (Leucemia Felina)', type: 'feline_leukemia', code: 'CAT_FELV' },
                        ]
                      : [
                          { label: 'V10 (Múltipla)', type: 'multiple', code: 'DOG_POLYVALENT_V8' },
                          { label: 'V8 (Múltipla)', type: 'multiple', code: 'DOG_POLYVALENT_V8' },
                          { label: 'Antirrábica', type: 'rabies', code: 'DOG_RABIES' },
                          { label: 'Leptospirose', type: 'leptospirosis', code: 'DOG_LEPTO' },
                          { label: 'Gripe Canina', type: 'kennel_cough', code: 'DOG_BORDETELLA' },
                          { label: 'Influenza Canina', type: 'influenza', code: 'DOG_INFLUENZA' },
                        ]).map(({ label, type, code }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, vaccine_name: label, vaccine_type: type as VaccineType }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          vaccineFormData.vaccine_name === label
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                        }`}
                        title={`Código: ${code}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-indigo-500 mt-1.5">💡 Ao salvar, a vacina será mapeada automaticamente pelo catálogo e o intervalo de revacinação calculado pelo protocolo.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('vaccine_form.application_date')} *
                  </label>
                  <input
                    type="date"
                    value={vaccineFormData.date_administered}
                    onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, date_administered: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Histórico anterior</label>
                  <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={vaccineFormData.record_type === 'estimated_control_start'}
                      onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({
                        ...prev,
                        record_type: e.target.checked ? 'estimated_control_start' : 'confirmed_application',
                      }))}
                      className="h-4 w-4 accent-[#0056D2]"
                    />
                    Não sei o histórico anterior
                  </label>
                </div>
              </div>

              <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-bold text-gray-700">Opcionais</summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Clínica</label>
                    <input
                      type="text"
                      value={vaccineFormData.clinic_name}
                      onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, clinic_name: e.target.value }))}
                      placeholder="Nome da clínica"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Observação curta</label>
                    <input
                      type="text"
                      maxLength={140}
                      value={vaccineFormData.notes}
                      onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Ex: comprovante conferido"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    />
                  </div>
                </div>
              </details>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                {vaccineFormData.record_type === 'estimated_control_start'
                  ? `Controle iniciado em ${vaccineFormData.date_administered || 'data selecionada'}`
                  : 'Aplicação registrada'}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">📎 Carteirinha / Comprovante (opcional)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={(e) => setVaccineFiles(Array.from(e.target.files || []))}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {vaccineFiles.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">✓ {vaccineFiles.length} arquivo(s) pronto(s) para enviar junto</p>
                )}
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                Lembrete ativo
              </div>

              <ReminderPicker
                days={String(vaccineFormData.alert_days_before ?? 3)}
                time={vaccineFormData.reminder_time ?? '09:00'}
                onDaysChange={v => setVaccineFormData(prev => ({ ...prev, alert_days_before: parseInt(v) || 3 }))}
                onTimeChange={v => setVaccineFormData(prev => ({ ...prev, reminder_time: v }))}
              />

              <div className="sticky bottom-0 bg-white z-10 pt-3 pb-3 -mx-4 px-4 border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex gap-3">
                <button
                  onClick={async () => {
                    const petId = selectedPetId;
                    const files = vaccineFiles;
                    await handleSaveVaccine();
                    if (files.length > 0 && petId) {
                      const token = getToken();
                      if (token) {
                        const form = new FormData();
                        files.forEach((file) => form.append('files', file));
                        await fetch(`${API_BASE_URL}/pets/${petId}/documents/upload`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                          body: form,
                        }).then((response) => {
                          if (response.ok) {
                            trackV1Metric('document_uploaded', {
                              pet_id: petId,
                              file_count: files.length,
                              source: 'vaccine_workflow',
                            });
                          }
                        }).catch(() => null);
                        setVaccineFiles([]);
                      }
                    }
                  }}
                  disabled={vaccineFormSaving}
                  className={`flex-1 bg-green-600 text-white px-4 py-3 rounded-xl font-semibold transition-colors text-base ${vaccineFormSaving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-green-700'}`}
                >
                  {vaccineFormSaving ? '⏳ Salvando...' : editingVaccine ? `✅ ${t('common.save')}` : `➕ ${t('vaccine_form.add_vaccine')}`}
                </button>
                <button
                  onClick={resetVaccineForm}
                  className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium text-base"
                >
                  {t('common.cancel')}
                </button>
              </div>

              {editingVaccine && (
                <div className="text-xs text-gray-500 pt-2 border-t">
                  Edite os campos e clique em “Salvar Alterações”.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAIUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-[85]">
          <div className="p-4 sm:p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                📷 Leitura de Carteirinha com IA
              </h3>
              <button
                onClick={onCloseAIUpload}
                className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 text-xl transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-amber-900 text-sm font-semibold mb-1">💡 Dica importante</p>
              <p className="text-amber-800 text-sm">Funciona melhor com carteiras <strong>impressas</strong>. Carteiras manuscritas podem ter leitura parcial. Sempre revise os dados extraídos antes de salvar.</p>
            </div>

            <VaccineCardUpload
              petId={selectedPetId || pets[0]?.pet_id || ''}
              onExtracted={(vaccines) => {
                if (vaccines.length > 0) {
                  const firstVaccine = vaccines[0];

                  const mapVaccineNameToType = (name: string | null): VaccineType => {
                    if (!name) return 'other';

                    const nameLower = name.toLowerCase();
                    if (nameLower.includes('v10') || nameLower.includes('v8') || nameLower.includes('múltipla') || nameLower.includes('polivalente')) return 'multiple';
                    if (nameLower.includes('raiva') || nameLower.includes('antirrábica')) return 'rabies';
                    if (nameLower.includes('leptospirose') || nameLower.includes('lepto')) return 'leptospirosis';
                    if (nameLower.includes('tosse') || nameLower.includes('kennel') || nameLower.includes('traqueobronquite')) return 'kennel_cough';
                    if (nameLower.includes('giárdia') || nameLower.includes('giardia')) return 'giardia';
                    if (nameLower.includes('coronavírus') || nameLower.includes('coronavirus')) return 'coronavirus';
                    if (nameLower.includes('influenza') || nameLower.includes('gripe')) return 'influenza';
                    return 'other';
                  };

                  setVaccineFormData({
                    vaccine_type: mapVaccineNameToType(firstVaccine.name),
                    vaccine_name: firstVaccine.name || '',
                    date_administered: firstVaccine.date || '',
                    next_dose_date: firstVaccine.next_date || '',
                    frequency_days: 365,
                    veterinarian: firstVaccine.veterinarian || '',
                    clinic_name: '',
                    record_type: 'confirmed_application',
                    notes: firstVaccine.notes ? `Extraído por IA. ${firstVaccine.notes}` : 'Extraído por IA - Revisar dados',
                  });

                  if (vaccines.length > 1 && process.env.NODE_ENV !== 'production') {
                    console.log('⚠️ Múltiplas vacinas detectadas:', vaccines.length, '- Apenas a primeira será preenchida');
                  }

                  onOpenVaccineFormFromAIUpload();
                } else {
                  showToast(t('health.vaccines.no_vaccines_detected'));
                }
              }}
              onCancel={onCloseAIUpload}
            />
          </div>
        </div>
      )}

      {cardAnalysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-[70]">
          <div className="p-4 sm:p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                🔍 Análise Completa do Prontuário
              </h3>
              <button
                onClick={closeCardAnalysis}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-2">📊 Resumo da Análise</h4>
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <div className="font-bold text-lg">{cardAnalysis.processed_images}</div>
                    <div className="text-green-600">Fotos analisadas</div>
                  </div>
                  <div>
                    <div className="font-bold text-lg">{cardAnalysis.registros.length}</div>
                    <div className="text-green-600">Registros</div>
                  </div>
                  <div>
                    <div className="font-bold text-lg">{cardAnalysis.leitura_confiavel ? 'OK' : 'Parcial'}</div>
                    <div className="text-red-600">Confiabilidade</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-green-800 flex items-center justify-between">
                  <span>
                    <strong>Motor:</strong>{' '}
                    {(cardAnalysis.motor_usado || (cardAnalysis.ia_usada ? 'ia' : 'tesseract') || '—').toString()}
                  </span>
                  {Array.isArray(cardAnalysis.motores_usados) && cardAnalysis.motores_usados.length > 0 && (
                    <span>
                      <strong>Motores:</strong> {cardAnalysis.motores_usados.join(', ')}
                    </span>
                  )}
                </div>

                {cardAnalysis.ia_tentada && !cardAnalysis.ia_usada && (
                  <div className="mt-2 text-xs text-amber-800">
                    <strong>IA:</strong> tentativa falhou ({cardAnalysis.motivo_fallback || 'motivo desconhecido'}). Foi usado fallback.
                  </div>
                )}
              </div>

              {!cardAnalysis.leitura_confiavel && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-medium text-amber-900 mb-1">⚠️ Leitura parcial</h4>
                  <div className="text-sm text-amber-800">
                    A imagem pode estar borrada/escura. O sistema ajustou automaticamente a quantidade esperada para compensar possíveis vacinas não detectadas. Revise antes de importar.
                  </div>
                </div>
              )}

              {reviewRegistros.some((record) => !record.data_aplicacao && (record.nome_comercial || record.tipo_vacina)) && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h4 className="font-medium text-orange-900 mb-1">🔍 Vacinas parcialmente detectadas</h4>
                  <div className="text-sm text-orange-800">
                    O sistema encontrou marcas de vacinas mas não conseguiu ler todas as datas. A quantidade esperada foi ajustada automaticamente para incluir possíveis vacinas não detectadas completamente.
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">✅ Revisão antes de importar</h4>
                  {reviewLearnEnabled && (
                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-100 to-blue-100 border border-purple-300 rounded-full px-3 py-1">
                      <span className="text-purple-600 text-sm">🧠</span>
                      <span className="text-xs font-semibold text-purple-700">ML Aprendendo</span>
                    </div>
                  )}
                </div>

                {reviewLearnEnabled && (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-3 mb-3">
                    <div className="flex items-start gap-2">
                      <div className="text-purple-600 text-lg">🧠</div>
                      <div className="text-sm text-purple-800">
                        <div className="font-bold mb-1">Aprendizado Ativo</div>
                        <p className="text-xs leading-relaxed">
                          Suas correções (datas, nomes, veterinários) serão usadas para melhorar a precisão das próximas leituras.
                          <strong className="block mt-1">Corrija livremente - cada ajuste torna o sistema mais inteligente!</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <div className="text-[#0056D2] text-lg">💡</div>
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">Como validar se está completo:</div>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Abra a foto do cartão em outra aba/janela</li>
                        <li>Conte quantos <strong>adesivos de vacina</strong> você vê (ex: Nobivac, Vanguard, Rabisin, etc.)</li>
                        <li>Informe a quantidade no campo "Qtd esperada"</li>
                        <li>Se faltar alguma, clique "+ Adicionar" e preencha manualmente</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-slate-700">
                      <div>
                        <strong>Encontrados:</strong> {reviewRegistros.length}
                        {reviewExpectedCount > reviewRegistros.length && (
                          <span className="ml-2 text-orange-600 font-medium">
                            (Sistema estimou {reviewExpectedCount} no total)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {reviewExpectedCount > reviewRegistros.length
                          ? 'O sistema detectou que podem haver mais vacinas. Ajuste conforme necessário.'
                          : 'Ajuste qualquer campo antes de importar.'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">
                        <span className="font-medium">Qtd esperada</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={reviewExpectedCount}
                        onChange={(e) => {
                          setReviewExpectedCount(Number(e.target.value));
                          setReviewConfirmed(false);
                        }}
                        className={`w-24 border rounded px-2 py-1 text-sm font-medium ${
                          reviewExpectedCount !== reviewRegistros.length ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200'
                        }`}
                        placeholder="?"
                      />
                      <button
                        onClick={addReviewRegistro}
                        className={`px-3 py-1 border rounded text-sm transition-all ${
                          reviewExpectedCount > reviewRegistros.length
                            ? 'bg-green-500 text-white border-green-600 hover:bg-green-600 font-medium animate-pulse'
                            : 'border-slate-200 hover:bg-white'
                        }`}
                        title="Adicionar manualmente um registro que faltou"
                      >
                        ＋ Adicionar
                      </button>
                    </div>
                  </div>

                  {reviewExpectedCount !== reviewRegistros.length && (
                    <div className="mt-2 text-xs text-amber-800 font-medium">
                      ⚠️ Quantidade esperada ({reviewExpectedCount}) não bate com os registros ({reviewRegistros.length}). Ajuste (adicione/remova) antes de importar.
                    </div>
                  )}

                  {reviewExpectedCount > reviewRegistros.length && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="text-red-600 text-lg">⚠️</span>
                        <div className="text-sm text-red-800">
                          <div className="font-bold mb-1">
                            ATENÇÃO: {reviewExpectedCount - reviewRegistros.length} vacina(s) NÃO foi(ram) detectada(s)!
                          </div>
                          <div className="text-xs">
                            Clique em "<strong>＋ Adicionar</strong>" acima para preencher manualmente as vacinas que faltaram.
                            Isso garante que seu prontuário fique completo.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {reviewRegistros.map((record: VaccineCardOcrRecord, index: number) => {
                    const missingFields = record.missing_fields || [];
                    const isProductMissing = missingFields.includes('produto') || !record.nome_comercial;
                    const isDateMissing = missingFields.includes('data_aplicacao') || !record.data_aplicacao;

                    return (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border-l-4 ${
                          missingFields.length > 0 ? 'bg-yellow-50 border-yellow-400' : 'bg-slate-50 border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="font-medium text-slate-800">
                            {record.nome_comercial || record.tipo_vacina || '🔍 Produto não detectado'}
                          </div>
                          <div className="flex items-center gap-2">
                            {missingFields.length > 0 && (
                              <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                                {missingFields.length} campos em branco
                              </span>
                            )}
                            <button
                              onClick={() => {
                                removeReviewRegistro(index);
                                setReviewConfirmed(false);
                              }}
                              className="text-xs text-red-600 hover:text-red-800"
                              title="Remover este registro"
                            >
                              {t('common.remove')}
                            </button>
                          </div>
                        </div>

                        {isProductMissing && (
                          <div className="mb-3">
                            <div className="text-xs text-slate-500 mb-2">Preenchimento rápido:</div>
                            <div className="flex flex-wrap gap-2">
                              {['Nobivac DHPPi', 'Nobivac Raiva', 'Vanguard Plus', 'Canigen R', 'Rabisin', 'Duramune Max'].map((product) => (
                                <button
                                  key={product}
                                  onClick={() => {
                                    updateReviewRegistro(index, {
                                      nome_comercial: product,
                                      tipo_vacina: mapNomeComercialToTipo(product),
                                    });
                                    setReviewConfirmed(false);
                                  }}
                                  className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 px-2 py-1 rounded"
                                >
                                  {product}
                                </button>
                              ))}
                              <button
                                onClick={() => {
                                  setCustomProductIndex(index);
                                  setCustomProductName(record.nome_comercial || '');
                                }}
                                className="text-xs bg-gray-100 text-gray-800 hover:bg-gray-200 px-2 py-1 rounded"
                              >
                                + Outro
                              </button>
                            </div>
                            {customProductIndex === index && (
                              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:flex-row">
                                <input
                                  type="text"
                                  value={customProductName}
                                  onChange={(e) => setCustomProductName(e.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      applyCustomProduct(index);
                                    }
                                  }}
                                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  placeholder="Digite o nome da vacina"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => applyCustomProduct(index)}
                                    className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                                  >
                                    Aplicar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetCustomProductInput}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Nome/Marca</div>
                            <input
                              value={record.nome_comercial || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { nome_comercial: e.target.value || null });
                                setReviewConfirmed(false);
                              }}
                              className={`w-full border rounded px-2 py-1 ${
                                isProductMissing ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200'
                              }`}
                              placeholder={isProductMissing ? '🔍 Preencher' : 'Ex: Vanguard, Nobivac'}
                            />
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Tipo</div>
                            <input
                              value={record.tipo_vacina || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { tipo_vacina: e.target.value });
                                setReviewConfirmed(false);
                              }}
                              className={`w-full border rounded px-2 py-1 ${
                                isProductMissing ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200'
                              }`}
                              placeholder={isProductMissing ? '🔍 Preencher' : 'Ex: Leptospirose'}
                            />
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Aplicação</div>
                            <input
                              type="date"
                              value={record.data_aplicacao || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { data_aplicacao: e.target.value || null });
                                setReviewConfirmed(false);
                              }}
                              className={`w-full border rounded px-2 py-1 ${
                                isDateMissing ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200'
                              }`}
                            />
                            {isDateMissing && <div className="text-xs text-yellow-700 mt-1">📅 Selecionar data</div>}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Revacina</div>
                            <input
                              type="date"
                              value={record.data_revacina || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { data_revacina: e.target.value || null });
                                setReviewConfirmed(false);
                              }}
                              className="w-full border border-slate-200 rounded px-2 py-1"
                              placeholder="Opcional"
                            />
                          </div>
                          <div className="col-span-2">
                            <div className="text-xs text-slate-500 mb-1">Veterinário</div>
                            <input
                              value={record.veterinario_responsavel || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { veterinario_responsavel: e.target.value || null });
                                setReviewConfirmed(false);
                              }}
                              className="w-full border border-slate-200 rounded px-2 py-1"
                              placeholder="Ex: Dr. João Silva"
                            />
                          </div>
                        </div>

                        {!record.data_aplicacao && (
                          <div className="mt-2 text-xs text-amber-800 bg-amber-50 p-2 rounded">
                            ⚠️ <strong>Data de aplicação obrigatória</strong> para importar este registro.
                          </div>
                        )}

                        {missingFields.length > 0 && (
                          <div className="mt-2 text-xs text-[#0047ad] bg-blue-50 p-2 rounded">
                            💡 Alguns campos estão em branco e serão salvos assim. Você pode editá-los depois.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sticky bottom-0 bg-white z-10 pt-3 pb-3 border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex gap-3">
                <button
                  onClick={handleImportAnalyzedVaccines}
                  disabled={importVaccineLoading || !reviewConfirmed || reviewRegistros.some((record) => !record.data_aplicacao)}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium ${
                    importVaccineLoading || !reviewConfirmed || reviewRegistros.some((record) => !record.data_aplicacao)
                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {importVaccineLoading ? '⏳ Importando...' : '✅ Importar para Prontuário Digital'}
                </button>
                <button
                  onClick={closeCardAnalysis}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
              </div>

              {reviewRegistros.some((record) => (record.missing_fields || []).length > 0) && (
                <div className="text-sm text-[#0047ad] bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="font-medium mb-1">💡 Sobre campos em branco:</div>
                  <div className="text-xs">
                    Alguns campos não foram detectados automaticamente e ficarão em branco após a importação.
                    Você pode preenchê-los manualmente acima ou editá-los posteriormente no prontuário.
                    Apenas a <strong>data de aplicação</strong> é obrigatória.
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">Conferi e confirmo os registros acima</div>
                  <div className="text-xs text-slate-500">
                    Para evitar frustração, a importação só fica disponível após revisão.
                    {reviewRegistros.some((record) => (record.missing_fields || []).length > 0) && (
                      <span className="text-[#0056D2]"> Campos em branco serão salvos assim.</span>
                    )}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}
    </ModalPortal>
  );
}
