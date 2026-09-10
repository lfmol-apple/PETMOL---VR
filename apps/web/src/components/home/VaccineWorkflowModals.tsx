'use client';

import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, Camera, Check, Syringe } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';
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
  // Aviso obrigatório: o tutor precisa reconhecer que a leitura por IA erra
  // ANTES de ver a lista de registros, senão ele confia numa data errada e
  // pode perder a vacina do pet.
  const [disclaimerAck, setDisclaimerAck] = useState(false);
  // Formulário enxuto: "Outra" abre o campo de texto livre; "ajustar" abre
  // a configuração do lembrete + data manual da próxima dose.
  const [otherVaccineOpen, setOtherVaccineOpen] = useState(false);
  const [remindAdjustOpen, setRemindAdjustOpen] = useState(false);

  // Reset success screen + aviso quando uma nova análise começa
  useEffect(() => {
    if (cardAnalysis) {
      setJustImported(false);
      setDisclaimerAck(false);
    }
  }, [cardAnalysis]);

  useEffect(() => {
    if (!showVaccineForm) {
      setOtherVaccineOpen(false);
      setRemindAdjustOpen(false);
    }
  }, [showVaccineForm]);

  // Vacinas comuns por espécie — 1 toque preenche nome + tipo.
  const vaccineChips: Array<{ label: string; type: VaccineType }> =
    currentPet?.species === 'cat'
      ? [
          { label: 'V3', type: 'multiple' },
          { label: 'V4', type: 'multiple' },
          { label: 'V5', type: 'multiple' },
          { label: 'Antirrábica', type: 'rabies' },
          { label: 'FeLV', type: 'feline_leukemia' as VaccineType },
        ]
      : [
          { label: 'V10', type: 'multiple' },
          { label: 'V8', type: 'multiple' },
          { label: 'Antirrábica', type: 'rabies' },
          { label: 'Leptospirose', type: 'leptospirosis' as VaccineType },
          { label: 'Gripe Canina', type: 'kennel_cough' as VaccineType },
          { label: 'Giárdia', type: 'giardia' },
        ];
  const isKnownChip = (name: string) => vaccineChips.some((c) => c.label === name);
  const usingOther = otherVaccineOpen || (!!vaccineFormData.vaccine_name && !isKnownChip(vaccineFormData.vaccine_name));

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
        <SheetShell open onClose={resetVaccineForm} tone="grey" size="lg" hideHandle z={SHEET_Z.high}>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Qual vacina? *</label>
                <div className="flex flex-wrap gap-2">
                  {vaccineChips.map(({ label, type }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setOtherVaccineOpen(false);
                        setVaccineFormData((prev: VaccineFormData) => ({ ...prev, vaccine_name: label, vaccine_type: type }));
                      }}
                      className={`px-3 py-2 rounded-full text-sm font-semibold border transition-all ${
                        !usingOther && vaccineFormData.vaccine_name === label
                          ? 'bg-[#0056D2] text-white border-[#0056D2]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setOtherVaccineOpen(true);
                      setVaccineFormData((prev: VaccineFormData) => ({
                        ...prev,
                        vaccine_name: isKnownChip(prev.vaccine_name) ? '' : prev.vaccine_name,
                        vaccine_type: 'other',
                      }));
                    }}
                    className={`px-3 py-2 rounded-full text-sm font-semibold border border-dashed transition-all ${
                      usingOther
                        ? 'bg-[#0056D2] text-white border-[#0056D2]'
                        : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    + Outra
                  </button>
                </div>
                {usingOther && (
                  <input
                    type="text"
                    autoFocus
                    value={vaccineFormData.vaccine_name}
                    onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, vaccine_name: e.target.value, vaccine_type: 'other' }))}
                    placeholder="Nome da vacina"
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  />
                )}
              </div>

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
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={vaccineFormData.record_type === 'estimated_control_start'}
                    onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({
                      ...prev,
                      record_type: e.target.checked ? 'estimated_control_start' : 'confirmed_application',
                    }))}
                    className="h-4 w-4 accent-[#0056D2]"
                  />
                  Foi a 1ª vez / não sei as doses anteriores
                </label>
              </div>

              <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-bold text-gray-700">Detalhes (opcional)</summary>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Veterinário</label>
                    <input
                      type="text"
                      value={vaccineFormData.veterinarian}
                      onChange={(e) => setVaccineFormData((prev: VaccineFormData) => ({ ...prev, veterinarian: e.target.value }))}
                      placeholder="Nome do veterinário"
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

              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-900">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {vaccineFormData.next_dose_date
                      ? <>Vou te lembrar antes de <strong>{vaccineFormData.next_dose_date}</strong></>
                      : 'Vou te lembrar antes da próxima dose'}
                    {' '}— {vaccineFormData.alert_days_before ?? 3} dias antes, {(vaccineFormData.reminder_time ?? '09:00').slice(0, 5)}.
                  </span>
                  <button
                    type="button"
                    onClick={() => setRemindAdjustOpen((o) => !o)}
                    className="shrink-0 text-xs font-semibold text-green-800 underline"
                  >
                    {remindAdjustOpen ? 'ok' : 'ajustar'}
                  </button>
                </div>
                {remindAdjustOpen && (
                  <div className="mt-3 space-y-3 border-t border-green-200 pt-3">
                    <ReminderPicker
                      days={String(vaccineFormData.alert_days_before ?? 3)}
                      time={vaccineFormData.reminder_time ?? '09:00'}
                      onDaysChange={v => setVaccineFormData(prev => ({ ...prev, alert_days_before: parseInt(v) || 3 }))}
                      onTimeChange={v => setVaccineFormData(prev => ({ ...prev, reminder_time: v }))}
                    />
                    <div>
                      <label className="block text-xs font-medium text-green-900 mb-1">
                        Data da próxima dose — só se o veterinário informou
                      </label>
                      <input
                        type="date"
                        value={vaccineFormData.next_dose_date}
                        onChange={(e) => setVaccineFormData(prev => ({ ...prev, next_dose_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-green-300 bg-white rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                      />
                      <p className="mt-1 text-[11px] text-green-700">Em branco, o PETMOL calcula pelo protocolo da vacina.</p>
                    </div>
                  </div>
                )}
              </div>

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
                className={`flex-1 rounded-2xl bg-[#0056D2] px-4 py-3 text-base font-semibold text-white transition-colors ${vaccineFormSaving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#004ab8]'}`}
              >
                {vaccineFormSaving ? 'Salvando…' : editingVaccine ? t('common.save') : t('vaccine_form.add_vaccine')}
              </button>
            </div>
          </SheetShell.Footer>
        </SheetShell>
      )}

      {showAIUpload && (
        <SheetShell open onClose={onCloseAIUpload} tone="grey" size="lg" z={SHEET_Z.nested}>
          <SheetHeader
            title="Ler carteirinha por foto"
            media={<SheetIcon tone="blue"><Camera className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
            onClose={onCloseAIUpload}
          />

          <SheetShell.Body className="space-y-6">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-amber-900 text-sm font-semibold mb-1">⚠️ A leitura automática pode errar</p>
              <p className="text-amber-800 text-sm">A IA erra datas e nomes de vacina, principalmente em carteirinhas <strong>manuscritas</strong>. <strong>Confira cada campo com a carteirinha</strong> antes de salvar — um registro errado pode fazer você perder a data de uma vacina do seu pet.</p>
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
          <SheetShell open onClose={() => { setJustImported(false); closeCardAnalysis(); }} tone="grey" variant="center" size="md" z={SHEET_Z.raised}>
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
        ) : !disclaimerAck ? (
          <SheetShell open onClose={closeCardAnalysis} tone="grey" size="lg" z={SHEET_Z.raised}>
            <SheetHeader
              title="Antes de importar, leia isto"
              media={<SheetIcon tone="amber"><AlertTriangle className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
              onClose={closeCardAnalysis}
            />
            <SheetShell.Body className="space-y-4">
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="text-[15px] font-bold text-amber-900">
                  A leitura automática pode conter erros
                </p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900">
                  A IA <strong>erra datas e nomes de vacina</strong> em carteirinhas,
                  principalmente as manuscritas. Um registro errado pode fazer você
                  <strong> perder a data de uma vacina do seu pet</strong>.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900">
                  Você precisa <strong>conferir cada registro, campo por campo</strong>,
                  com a carteirinha original — antes de importar e sempre que abrir o
                  prontuário. O PETMOL <strong>não se responsabiliza</strong> por
                  registros que você não conferiu.
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={disclaimerAck}
                  onChange={(e) => setDisclaimerAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="font-medium">
                  Entendi. Vou conferir todos os registros com a carteirinha antes de confiar.
                </span>
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
                  onClick={() => setDisclaimerAck(true)}
                  disabled={!disclaimerAck}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${
                    disclaimerAck
                      ? 'bg-[#0056D2] text-white shadow-md shadow-blue-600/20'
                      : 'bg-slate-300 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  Revisar os registros
                </button>
              </div>
            </SheetShell.Footer>
          </SheetShell>
        ) : (
          <SheetShell open onClose={closeCardAnalysis} tone="grey" size="lg" z={SHEET_Z.raised}>
            <SheetHeader
              title={`${reviewRegistros.length} vacina${reviewRegistros.length !== 1 ? 's' : ''} encontrada${reviewRegistros.length !== 1 ? 's' : ''}`}
              subtitle="Confira cada uma com a carteirinha"
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
                          <div className="col-span-2">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Data da aplicação — confira com a carteirinha</div>
                            <input
                              type="date"
                              value={record.data_aplicacao || ''}
                              onChange={(e) => {
                                updateReviewRegistro(index, { data_aplicacao: e.target.value || null });
                                setReviewConfirmed(false);
                              }}
                              className={`w-full border rounded px-2 py-2 text-base ${
                                isDateMissing ? 'border-yellow-300 bg-yellow-50' : 'border-slate-300'
                              }`}
                            />
                            {isDateMissing && <div className="text-xs text-yellow-700 mt-1">📅 Selecionar data</div>}
                          </div>
                          <details className="col-span-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                            <summary className="cursor-pointer text-xs text-slate-500">
                              Revacina{record.data_revacina ? ` (${record.data_revacina})` : ' e veterinário'}
                            </summary>
                            <div className="mt-2 space-y-2">
                              <div>
                                <div className="text-xs text-slate-500 mb-1">Próxima dose (revacina)</div>
                                <input
                                  type="date"
                                  value={record.data_revacina || ''}
                                  onChange={(e) => {
                                    updateReviewRegistro(index, { data_revacina: e.target.value || null });
                                    setReviewConfirmed(false);
                                  }}
                                  className="w-full border border-slate-200 rounded px-2 py-1"
                                  placeholder="Opcional — o PETMOL calcula pelo protocolo"
                                />
                              </div>
                              <div>
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
                          </details>
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

              <label className="flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <div>
                  <div className="font-semibold">
                    Confirmo que conferi CADA vacina e CADA data acima com a carteirinha do meu pet
                  </div>
                  <div className="mt-0.5 text-xs text-amber-800">
                    A responsabilidade pela conferência é sua. A importação só libera depois disto.
                  </div>
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
