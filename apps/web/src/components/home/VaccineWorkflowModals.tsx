'use client';

import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Camera, Check, Syringe } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';
import { VaccineCardUpload } from '@/components/VaccineCardUpload';
import { useI18n } from '@/lib/I18nContext';
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
  selectedPetId: string | null;
  handleSaveVaccine: () => Promise<void>;
  vaccineFormSaving: boolean;
  pets: PetHealthProfile[];
  closeCardAnalysis: () => void;
  reviewRegistros: VaccineCardOcrRecord[];
  setReviewConfirmed: Dispatch<SetStateAction<boolean>>;
  addReviewRegistro: () => void;
  removeReviewRegistro: (index: number) => void;
  updateReviewRegistro: (index: number, patch: Partial<VaccineCardOcrRecord>) => void;
  mapNomeComercialToTipo: (name: string) => string;
  handleImportAnalyzedVaccines: () => Promise<boolean>;
  importVaccineLoading: boolean;
  reviewConfirmed: boolean;
  onGoHome: () => void;
  onAfterSave?: () => void;
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
  selectedPetId,
  handleSaveVaccine,
  vaccineFormSaving,
  pets,
  closeCardAnalysis,
  reviewRegistros,
  setReviewConfirmed,
  addReviewRegistro,
  removeReviewRegistro,
  updateReviewRegistro,
  mapNomeComercialToTipo,
  handleImportAnalyzedVaccines,
  importVaccineLoading,
  reviewConfirmed,
  onGoHome,
  onAfterSave,
}: VaccineWorkflowModalsProps) {
  const { t } = useI18n();
  const [toast, setToast] = useState<string | null>(null);
  const [customProductIndex, setCustomProductIndex] = useState<number | null>(null);
  const [customProductName, setCustomProductName] = useState('');
  const [justImported, setJustImported] = useState(false);

  // Reset success screen when a new analysis starts
  useEffect(() => {
    if (cardAnalysis) setJustImported(false);
  }, [cardAnalysis]);

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
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 shadow-lg text-sm font-semibold text-amber-800 max-w-sm w-full flex items-center gap-2">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-[11px] font-bold text-amber-700 underline">OK</button>
        </div>
      )}
      {showVaccineForm && (
        <SheetShell open onClose={resetVaccineForm} tone="grey" size="lg" hideHandle z={80}>
          <SheetHeader
            tone="petmol"
            withHandle
            title={editingVaccine ? t('health.vaccines.form.title.edit') : t('health.vaccines.form.title.new')}
            onClose={resetVaccineForm}
            media={<SheetIcon tone="onPetmol"><Syringe className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
            action={!editingVaccine ? (
              <button
                type="button"
                onClick={onOpenAIUpload}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/25 active:scale-95"
              >
                🤖 {t('health.vaccines.form.read_card')}
              </button>
            ) : undefined}
          />

          <SheetShell.Body className="space-y-4">
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

              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                Lembrete ativo
              </div>

              <ReminderPicker
                days={String(vaccineFormData.alert_days_before ?? 3)}
                time={vaccineFormData.reminder_time ?? '09:00'}
                onDaysChange={v => setVaccineFormData(prev => ({ ...prev, alert_days_before: parseInt(v) || 3 }))}
                onTimeChange={v => setVaccineFormData(prev => ({ ...prev, reminder_time: v }))}
              />

              {editingVaccine && (
                <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                  Edite os campos e salve quando terminar.
                </div>
              )}
          </SheetShell.Body>

          <SheetShell.Footer tone="grey">
            <div className="flex gap-3">
              <button
                onClick={resetVaccineForm}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  await handleSaveVaccine();
                  onAfterSave?.();
                }}
                disabled={vaccineFormSaving}
                className={`flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white transition-colors ${vaccineFormSaving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-600'}`}
              >
                {vaccineFormSaving ? 'Salvando…' : editingVaccine ? t('common.save') : t('vaccine_form.add_vaccine')}
              </button>
            </div>
          </SheetShell.Footer>
        </SheetShell>
      )}

      {showAIUpload && (
        <SheetShell open onClose={onCloseAIUpload} tone="grey" size="lg" z={85}>
          <SheetHeader
            title="Ler carteirinha por foto"
            media={<SheetIcon tone="blue"><Camera className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
            onClose={onCloseAIUpload}
          />

          <SheetShell.Body className="space-y-6">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
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
          </SheetShell.Body>
        </SheetShell>
      )}

      {(cardAnalysis || justImported) && (
        justImported ? (
          <SheetShell open onClose={() => { setJustImported(false); closeCardAnalysis(); }} tone="grey" variant="center" size="md" z={70}>
            <SheetHeader
              title="Vacinas importadas"
              media={<SheetIcon tone="emerald"><Check className="h-5 w-5" strokeWidth={2.5} /></SheetIcon>}
              onClose={() => { setJustImported(false); closeCardAnalysis(); }}
            />
            <SheetShell.Body className="flex flex-col items-center gap-5 py-4 text-center">
              <p className="text-sm text-gray-500">O prontuário do pet foi atualizado.</p>
              <button
                onClick={() => { onGoHome(); }}
                className="w-full rounded-2xl bg-[#0056D2] py-3.5 text-[15px] font-bold text-white shadow-md shadow-blue-600/20 transition-all active:scale-[0.97]"
              >
                Ir para a home
              </button>
              <button
                onClick={() => { setJustImported(false); closeCardAnalysis(); }}
                className="text-sm text-gray-400 underline"
              >
                Ver prontuário de vacinas
              </button>
            </SheetShell.Body>
          </SheetShell>
        ) : (
          <SheetShell open onClose={closeCardAnalysis} tone="grey" size="lg" z={70}>
            <SheetHeader
              title={`${reviewRegistros.length} vacina${reviewRegistros.length !== 1 ? 's' : ''} encontrada${reviewRegistros.length !== 1 ? 's' : ''}`}
              subtitle="Revise antes de importar"
              onClose={closeCardAnalysis}
            />

            <SheetShell.Body className="space-y-4">
              {cardAnalysis && !cardAnalysis.leitura_confiavel && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  ⚠️ Leitura parcial — revise os dados antes de importar.
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-3">Corrija o que precisar e confirme antes de importar.</p>

                <div className="flex justify-end mb-2">
                  <button
                    onClick={addReviewRegistro}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded-lg px-3 py-1.5"
                  >
                    ＋ Adicionar vacina manualmente
                  </button>
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

              <label className="flex items-start gap-3 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">Conferi e confirmo os registros acima</div>
                  <div className="text-xs text-slate-500">A importação só fica disponível após a revisão.</div>
                </div>
              </label>
            </SheetShell.Body>

            <SheetShell.Footer tone="grey">
              <div className="flex gap-3">
                <button
                  onClick={closeCardAnalysis}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    const success = await handleImportAnalyzedVaccines();
                    if (success) {
                      setJustImported(true);
                    }
                  }}
                  disabled={importVaccineLoading || !reviewConfirmed || reviewRegistros.some((record) => !record.data_aplicacao)}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                    importVaccineLoading || !reviewConfirmed || reviewRegistros.some((record) => !record.data_aplicacao)
                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                      : 'bg-[#0056D2] text-white shadow-md shadow-blue-600/20'
                  }`}
                >
                  {importVaccineLoading ? 'Importando…' : 'Importar vacinas'}
                </button>
              </div>
            </SheetShell.Footer>
          </SheetShell>
        )
      )}
    </>
  );
}
