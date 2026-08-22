'use client';

import React, { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { VaccineRecord, VaccineType } from '@/lib/petHealth';
import type { VaccineFormData } from '@/lib/types/homeForms';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';
import { ModalPortal } from '@/components/ModalPortal';
import { localTodayISO } from '@/lib/localDate';
import { trackPartnerClicked } from '@/lib/v1Metrics';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

// ── Helpers ──────────────────────────────────────────────────────────────────

function diffDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Notas geradas automaticamente pelo próprio app (importação OCR, quick-add)
// — não são anotações do tutor, são metadado de "como isso foi cadastrado".
// Úteis numa tela de edição/detalhe, só ruído repetido numa lista compacta
// onde toda vacina importada mostra a mesma frase idêntica.
const SYSTEM_GENERATED_NOTES = new Set([
  'Importado via OCR do cartão de vacina',
  'Adicionado via Quick Add',
]);

function fmtRelativeDays(diff: number | null): string {
  if (diff === null) return '';
  if (diff < 0) {
    const days = Math.abs(diff);
    if (days > 90) return 'revisão recomendada';
    return `atrasado há ${days} dia${days !== 1 ? 's' : ''}`;
  }
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${diff} dias`;
}

function computeStatus(overdue: number, nextDiff: number | null) {
  if (overdue > 0)
    return {
      label: `Pode estar na hora de revisar ${overdue} registro${overdue !== 1 ? 's' : ''}`,
      bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500',
    };
  if (nextDiff === null)
    return { label: 'Sem data de revisão definida', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  if (nextDiff === 0)
    return { label: 'Dose hoje', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
  if (nextDiff <= 7)
    return { label: `Próxima dose em ${nextDiff} dia${nextDiff !== 1 ? 's' : ''}`, bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
  return {
    label: `Próxima dose em ${nextDiff} dias`,
    bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500',
  };
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface VaccineItemSheetProps {
  petName?: string;
  petSpecies?: string;
  petPhotoUrl?: string | null;
  vaccines: VaccineRecord[];
  onClose: () => void;
  onGoHome?: () => void;
  onQuickAdd: () => void;
  onFullFormVaccine: (prefill: Partial<VaccineFormData>) => void;
  onDirectSaveVaccine?: (vaccine: { type: VaccineType; name: string; icon: string; code: string }, when: 'today' | 'this_month' | 'unknown') => Promise<void>;
  onEditVaccine: (v: VaccineRecord) => void;
  onDeleteVaccine: (v: VaccineRecord) => void;
  onDeleteAllVaccines: () => void;
  onRefreshVaccines: () => void;
  pendingCardFiles: File[];
  setPendingCardFiles: Dispatch<SetStateAction<File[]>>;
  importingCard: boolean;
  aiImageLimit?: number;
  setAiImageLimit?: Dispatch<SetStateAction<number>>;
  handleFilesSelectedAppend: (event: ChangeEvent<HTMLInputElement>) => void;
  handleProcessCards: (selected: File[]) => Promise<void>;
  initialMode?: 'view' | 'buy';
  forceJustSaved?: boolean;
  onForceJustSavedConsumed?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export function VaccineItemSheet({
  petName,
  petSpecies,
  petPhotoUrl,
  vaccines,
  onClose,
  onGoHome,
  onQuickAdd,
  onFullFormVaccine,
  onDirectSaveVaccine,
  onEditVaccine,
  onDeleteVaccine,
  onDeleteAllVaccines,
  onRefreshVaccines,
  pendingCardFiles,
  setPendingCardFiles,
  importingCard,
  handleFilesSelectedAppend,
  handleProcessCards,
  initialMode,
  forceJustSaved,
  onForceJustSavedConsumed,
}: VaccineItemSheetProps) {
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<'view' | 'buy'>(initialMode === 'buy' ? 'buy' : 'view');
  const [quickRegisterExpanded, setQuickRegisterExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [overdueShowAll, setOverdueShowAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savingChip, setSavingChip] = useState<string | null>(null);
  const [savedChip, setSavedChip] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (forceJustSaved) {
      setJustSaved(true);
      onForceJustSavedConsumed?.();
    }
  }, [forceJustSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const today = localTodayISO();

  // For overdue/upcoming: only consider the MOST RECENT record per vaccine group.
  // Uses the shared latestVaccinePerGroup (vaccine_code → normalised name → vaccine_type).
  const latestPerName = Array.from(latestVaccinePerGroup(vaccines).values());
  const currentVaccineIds = new Set(latestPerName.map(v => v.id));

  const withNextDose = latestPerName.filter(v => v.next_dose_date);
  const overdue = withNextDose.filter(v => v.next_dose_date! < today);
  const upcoming = withNextDose
    .filter(v => v.next_dose_date! >= today)
    .sort((a, b) => a.next_dose_date!.localeCompare(b.next_dose_date!));
  const upcomingSoon = withNextDose.filter(v => {
    const d = diffDays(v.next_dose_date);
    return d !== null && d >= 0 && d <= 60;
  });
  // Histórico não repete o que já está visível em Atrasadas/Próximas logo
  // acima — mesmo registro (uma vacina só tem uma linha, com data aplicada
  // E próxima dose juntas) não precisa aparecer duas vezes na tela só
  // porque uma seção olha "quando foi" e a outra "quando é a próxima".
  const upcomingShown = upcoming.slice(0, 3);
  const shownAboveIds = new Set([...overdue, ...upcomingShown].map(v => v.id));
  const applied = [...vaccines]
    .filter(v => !shownAboveIds.has(v.id))
    .sort((a, b) => b.date_administered.localeCompare(a.date_administered));

  const nextDiff = upcoming.length > 0 ? diffDays(upcoming[0].next_dose_date) : null;
  const status = computeStatus(overdue.length, nextDiff);

  // Quick-entry chip data
  type ChipDef = { label: string; type: string; name: string; icon: string; code: string; notes: string; disabled?: boolean; isOther?: boolean };
  const dogChips: ChipDef[] = [
    { label: 'Polivalente (V8 / V10)', type: 'multiple', name: 'Polivalente (V10/V8)', icon: '💉', code: 'multiple', notes: 'Cinomose, Parvovirose, Hepatite, Coronavirose, Leptospirose, Adenovirose, Parainfluenza' },
    { label: 'Antirrábica', type: 'rabies', name: 'Antirrábica', icon: '🦠', code: 'rabies', notes: '' },
    { label: 'Tosse dos canis', type: 'kennel_cough', name: 'Gripe Canina (Tosse dos Canis)', icon: '🫁', code: 'kennel_cough', notes: 'Bordetella bronchiseptica' },
    { label: 'Giárdia', type: 'giardia', name: 'Giárdia', icon: '🧪', code: 'giardia', notes: '' },
    { label: 'Leishmaniose', type: 'leishmaniasis', name: 'Leishmaniose', icon: '🛡️', code: 'leishmaniasis', notes: '' },
    { label: 'Outro', type: 'other', name: 'Outra Vacina', icon: '➕', code: 'other', notes: '', isOther: true },
  ];
  const catChips: ChipDef[] = [
    { label: 'Polivalente (V5 / V4 / V3)', type: 'multiple', name: 'Polivalente (V5/V4/V3)', icon: '💉', code: 'multiple', notes: 'Rinotraqueíte, Calicivirose, Panleucopenia, Clamidiose' },
    { label: 'Antirrábica', type: 'rabies', name: 'Antirrábica', icon: '🦠', code: 'rabies', notes: '' },
    { label: 'FeLV', type: 'feline_leukemia', name: 'FeLV (Leucemia Felina)', icon: '🐱', code: 'feline_leukemia', notes: '' },
    { label: 'Outro', type: 'other', name: 'Outra Vacina', icon: '➕', code: 'other', notes: '', isOther: true },
  ];
  const chips = (petSpecies === 'cat' || petSpecies === 'cats') ? catChips : dogChips;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleChipClick(chip: ChipDef) {
    if (chip.disabled) {
      showToast('Esta vacina não está disponível no momento.');
      return;
    }
    if (chip.isOther) {
      onQuickAdd();
      return;
    }
    if (onDirectSaveVaccine && savingChip === null) {
      setSavingChip(chip.code);
      try {
        await onDirectSaveVaccine({ type: chip.type as VaccineType, name: chip.name, icon: chip.icon, code: chip.code }, 'today');
        setSavedChip(chip.code);
        setTimeout(() => { setSavedChip(null); setSavingChip(null); setJustSaved(true); }, 800);
      } catch {
        setSavingChip(null);
        showToast('Erro ao registrar. Tente novamente.');
      }
      return;
    }
    onFullFormVaccine({
      vaccine_type: chip.type as VaccineFormData['vaccine_type'],
      vaccine_name: chip.name,
      date_administered: today,
      next_dose_date: '',
      frequency_days: 365,
      notes: chip.notes,
      veterinarian: '',
      clinic_name: '',
      record_type: 'confirmed_application',
    });
  }

  function handleDeleteClick(v: VaccineRecord) {
    if (confirmDeleteId === v.id) {
      onDeleteVaccine(v);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(v.id);
    }
  }

  function handleDeleteAll() {
    if (confirmDeleteAll) {
      onDeleteAllVaccines();
      setConfirmDeleteAll(false);
    } else {
      setConfirmDeleteAll(true);
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col overflow-hidden animate-scaleIn"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Success overlay */}
        {justSaved && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center gap-6 text-center p-8 rounded-[32px]">
            <div className="text-6xl">✅</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Vacina registrada!</h3>
              <p className="text-sm text-gray-500">O prontuário do pet foi atualizado.</p>
            </div>
            <button
              onClick={() => onGoHome?.()}
              className="w-full rounded-2xl bg-blue-600 py-3.5 text-[15px] font-black text-white shadow-md shadow-blue-500/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Ir para a home
            </button>
            <button onClick={() => setJustSaved(false)} className="text-sm text-gray-400 underline">
              Ver prontuário
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-sky-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center text-3xl flex-shrink-0">
              {petPhotoSrc ? (
                <img src={petPhotoSrc} alt={petName || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span>{petSpecies === 'cat' || petSpecies === 'cats' ? '🐱' : '🐶'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-[16px] font-bold text-gray-900 leading-tight whitespace-nowrap">Vacinas</h2>
              </div>
              {petName && (
                <p className="mt-1">
                  <span className="inline-flex max-w-full items-center px-2.5 py-1 rounded-full bg-white text-sky-800 text-xs font-black tracking-[0.04em] shadow-sm border border-sky-100 whitespace-normal break-all leading-tight">
                    {petName}
                  </span>
                </p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {status.dot === 'bg-rose-500' ? (
                  <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                    !
                  </div>
                ) : (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
                )}
                <span className={`text-[13px] font-semibold ${status.text} truncate`}>{status.label}</span>
              </div>
            </div>
            {mode === 'buy' ? (
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
                aria-label="Voltar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        {/* Toast */}
        {toast && (
          <div className="absolute top-20 left-4 right-4 z-[60] px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 shadow-md flex items-center gap-2 animate-fadeIn">
            <span className="text-amber-600 text-base">ℹ️</span>
            <p className="text-xs font-semibold text-amber-800 flex-1">{toast}</p>
            <button onClick={() => setToast(null)} className="text-[11px] font-bold text-amber-700 underline">OK</button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          <p className="mx-4 mt-3 mb-1 text-[10px] text-gray-400 text-center">ℹ️ Gerenciamento e controle apenas — consulte seu veterinário.</p>
          {mode === 'view' && (
            <div className="p-5 space-y-3 pb-8">

            {/* ── REGISTRO RÁPIDO (colapsável) ──────────────────────────── */}
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3.5 bg-white text-left active:bg-gray-50 transition-colors"
                onClick={() => setQuickRegisterExpanded(q => !q)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">⚡</span>
                  <div>
                    <p className="text-[14px] font-black text-slate-800">Registro rápido</p>
                    <p className="text-[11px] text-slate-400">Toque para registrar uma vacina aplicada</p>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">{quickRegisterExpanded ? '▲' : '▼'}</span>
              </button>
              {quickRegisterExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-2">
                  {chips.map((chip) => {
                    const isSaving = savingChip === chip.code;
                    const isSaved = savedChip === chip.code;
                    return (
                      <button
                        key={chip.code}
                        type="button"
                        onClick={() => handleChipClick(chip)}
                        disabled={savingChip !== null && !isSaving}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                          chip.disabled
                            ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                            : isSaved
                              ? 'bg-emerald-50 border-emerald-300'
                              : chip.isOther
                                ? 'bg-white border-dashed border-gray-200 hover:bg-gray-50'
                                : 'bg-white border-gray-200 hover:bg-sky-50 hover:border-sky-200 shadow-sm'
                        }`}
                      >
                        <span className="text-2xl flex-shrink-0">{isSaved ? '✅' : chip.icon}</span>
                        <span className={`flex-1 text-[14px] font-bold ${chip.disabled ? 'text-gray-400' : chip.isOther ? 'text-gray-500' : 'text-slate-800'}`}>
                          {isSaved ? 'Registrado!' : isSaving ? 'Registrando...' : chip.label}
                        </span>
                        {chip.disabled && <span className="text-[10px] font-semibold text-gray-400">Prescrição veterinária</span>}
                        {!chip.disabled && !isSaved && !isSaving && <span className="text-gray-300 text-lg">›</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={onQuickAdd}
                    className="w-full py-2.5 rounded-2xl border border-dashed border-gray-200 text-[12px] font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all"
                  >
                    Não sei o histórico — começar daqui
                  </button>
                </div>
              )}
            </div>

            {/* ── ATRASADAS (sempre visível) ─────────────────────────────── */}
            {overdue.length > 0 && (
              <div className="rounded-2xl border border-rose-200 overflow-hidden">
                <div className="px-4 py-3 bg-rose-50 flex items-center gap-2">
                  <span className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">!</span>
                  <p className="text-sm font-bold text-rose-700 flex-1 truncate">
                    {overdue.length === 1
                      ? `${overdue[0].vaccine_name}: vale revisar`
                      : `${overdue.length} vacinas para revisar`}
                  </p>
                </div>
                <div className="divide-y divide-rose-100">
                  {(overdueShowAll ? overdue : overdue.slice(0, 2)).map(v => (
                    <VaccineRow
                      key={v.id}
                      vaccine={v}
                      isCurrent={currentVaccineIds.has(v.id)}
                      confirmDeleteId={confirmDeleteId}
                      onEdit={onEditVaccine}
                      onDeleteClick={handleDeleteClick}
                      borderColor="border-l-rose-500"
                      statusBadge={<span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">Revisar</span>}
                    />
                  ))}
                  {overdue.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOverdueShowAll(s => !s)}
                      className="w-full py-2.5 text-xs font-semibold text-rose-600 bg-rose-50/80"
                    >
                      {overdueShowAll ? 'Mostrar menos' : `Ver mais ${overdue.length - 2}`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── PRÓXIMAS (sempre visível) ──────────────────────────────── */}
            {upcoming.length > 0 && (
              <div className="rounded-2xl border border-sky-200 overflow-hidden">
                <div className="px-4 py-3 bg-sky-50 flex items-center gap-2">
                  <span className="text-sm flex-shrink-0">📅</span>
                  <p className="text-sm font-bold text-sky-700 flex-1 truncate">
                    {upcoming.length === 1 ? (
                      <>
                        {upcoming[0].vaccine_name}
                        {diffDays(upcoming[0].next_dose_date) !== null && (
                          <span className="font-normal text-sky-600 ml-1">· {fmtRelativeDays(diffDays(upcoming[0].next_dose_date))}</span>
                        )}
                      </>
                    ) : (
                      `${upcoming.length} vacinas nos próximos dias`
                    )}
                  </p>
                </div>
                <div className="divide-y divide-sky-100">
                  {upcoming.slice(0, 3).map(v => (
                    <VaccineRow
                      key={v.id}
                      vaccine={v}
                      isCurrent={currentVaccineIds.has(v.id)}
                      confirmDeleteId={confirmDeleteId}
                      onEdit={onEditVaccine}
                      onDeleteClick={handleDeleteClick}
                      borderColor="border-l-sky-500"
                      statusBadge={<span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">⏰ Próxima</span>}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── HISTÓRICO ─────────────────────────────────────────────── */}
            {applied.length > 0 && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-left"
                  onClick={() => setHistoryExpanded(h => !h)}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    🗂️ Histórico ({applied.length})
                  </p>
                  <span className="text-gray-400 text-sm">{historyExpanded ? '▲' : '▼'}</span>
                </button>
                {historyExpanded && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {(historyShowAll ? applied : applied.slice(0, 3)).map(v => (
                      <VaccineRow
                        key={v.id}
                        vaccine={v}
                        isCurrent={currentVaccineIds.has(v.id)}
                        confirmDeleteId={confirmDeleteId}
                        onEdit={onEditVaccine}
                        onDeleteClick={handleDeleteClick}
                        borderColor="border-l-gray-300"
                      />
                    ))}
                    {!historyShowAll && applied.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setHistoryShowAll(true)}
                        className="w-full py-2.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-gray-50"
                      >
                        Ver todas ({applied.length - 3} restantes)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── AÇÕES SECUNDÁRIAS ─────────────────────────────────────── */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">📷</div>
                <div className="text-left flex-1">
                  <p className="text-[12px] font-semibold text-gray-600">Tentar ler carteirinha com IA</p>
                  <p className="text-[10px] text-gray-400">Funciona melhor com cartões impressos — revise os dados após</p>
                </div>
                <span className="text-gray-300 text-base">›</span>
              </button>

              <a
                href="https://www.google.com/maps/search/clínica+veterinária+vacina+perto+de+mim"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 p-4 bg-sky-50 border border-sky-200 rounded-2xl hover:bg-sky-100 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-lg flex-shrink-0">📍</div>
                <div className="text-left flex-1">
                  <p className="text-[13px] font-bold text-sky-900">Procurar lugar para vacinar</p>
                  <p className="text-[11px] text-sky-700/70">Clínicas e hospitais próximos</p>
                </div>
                <span className="text-sky-400 text-lg font-bold">›</span>
              </a>
            </div>

            {/* ── LIMPAR TUDO (ação destrutiva) ─────────────────────────── */}
            {vaccines.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAll}
                className={`w-full py-2.5 rounded-2xl text-[13px] font-semibold border transition-all ${
                  confirmDeleteAll
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-400 border-red-100 hover:bg-red-50'
                }`}
              >
                {confirmDeleteAll ? '⚠️ Confirmar exclusão de todas as vacinas' : '🗑️ Limpar todas as vacinas'}
              </button>
            )}

          </div>
        )}

        {/* ── BUY MODE ──────────────────────────────────────────────────── */}
        {mode === 'buy' && (
          <div className="p-5 space-y-4 pb-8">
            <h3 className="text-[16px] font-bold text-gray-900">Onde comprar</h3>
            <p className="text-sm text-gray-500">Escolha onde encontrar vacinas e serviços:</p>

            <div className="space-y-3">
              {[
                { name: 'Cobasi', url: 'https://www.cobasi.com.br/capsulas-e-saude/vacinas', emoji: '🐾' },
                { name: 'Shopee', url: 'https://shopee.com.br/search?keyword=pet%20saude', emoji: '🛍️' },
                { name: 'Zee Now', url: 'https://www.zeenow.com.br/busca?q=pet%20saude', emoji: '⚡' },
                { name: 'Zee Dog', url: 'https://www.zeedog.com.br/busca?q=pet%20saude', emoji: '🐾' },
              ].map(store => (
                <button
                  key={store.name}
                  onClick={() => {
                    trackPartnerClicked({
                      source: 'vaccine_sheet',
                      partner: store.name.toLowerCase(),
                      pet_id: '', // handle generic if needed
                      control_type: 'vaccines',
                    });
                    window.open(store.url, '_blank', 'noopener,noreferrer');
                  }}
                  className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                >
                  <span className="text-2xl">{store.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">{store.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Agendar ou comprar</p>
                  </div>
                  <span className="text-gray-400 text-lg">›</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode('view')}
              onTouchEnd={() => setMode('view')}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
            >
              Voltar para detalhes
            </button>
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center"
          onClick={() => { if (!importingCard) { setShowImportModal(false); setPendingCardFiles([]); } }}
        >
          <div
            className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-lg p-5 sm:p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Hidden file inputs */}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFilesSelectedAppend} disabled={importingCard} className="hidden" />
            <input ref={galleryInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.tiff,.tif,.avif,image/*" multiple onChange={handleFilesSelectedAppend} disabled={importingCard} className="hidden" />

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">
                {pendingCardFiles.length > 0 && !importingCard
                  ? `${pendingCardFiles.length} foto${pendingCardFiles.length > 1 ? 's' : ''} — o que fazer?`
                  : '📷 Ler carteirinha com IA'}
              </h3>
              {!importingCard && (
                <button
                  onClick={() => { setShowImportModal(false); setPendingCardFiles([]); }}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* STATE: no photos yet */}
            {pendingCardFiles.length === 0 && !importingCard && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-5 rounded-2xl bg-sky-600 active:bg-sky-700 text-white font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl">📸</span> Abrir câmera
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition-all"
                >
                  🖼️ Escolher da galeria
                </button>
                <p className="text-xs text-amber-700 text-center pt-1">
                  Funciona melhor com carteiras impressas — revise os dados após a leitura
                </p>
              </div>
            )}

            {/* STATE: photos selected — dynamic action choice */}
            {pendingCardFiles.length > 0 && !importingCard && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={async () => {
                    await handleProcessCards(pendingCardFiles);
                    setShowImportModal(false);
                  }}
                  className="w-full py-4 rounded-2xl bg-sky-700 active:bg-sky-800 text-white font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-sky-500/20"
                >
                  🔍 Ler agora
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-3 rounded-2xl border border-sky-200 text-sky-700 bg-sky-50 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  📸 Tirar mais fotos
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  + Adicionar da galeria
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCardFiles([])}
                  className="w-full py-2 text-gray-400 text-xs"
                >
                  Remover fotos e recomeçar
                </button>
              </div>
            )}

            {/* STATE: analyzing */}
            {importingCard && (
              <div className="py-8 text-center">
                <div className="animate-spin w-10 h-10 border-4 border-sky-200 border-t-sky-700 rounded-full mx-auto mb-4" />
                <div className="font-semibold text-sky-900 mb-1">Analisando com IA...</div>
                <div className="text-sm text-sky-600">Pode levar alguns segundos</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </ModalPortal>
  );
}

// ── Row sub-component ────────────────────────────────────────────────────────
function VaccineRow({
  vaccine: v,
  isCurrent,
  confirmDeleteId,
  onEdit,
  onDeleteClick,
  borderColor,
  statusBadge,
}: {
  vaccine: VaccineRecord;
  isCurrent: boolean;
  confirmDeleteId: string | null;
  onEdit: (v: VaccineRecord) => void;
  onDeleteClick: (v: VaccineRecord) => void;
  borderColor: string;
  statusBadge?: React.ReactNode;
}) {
  const diff = diffDays(v.next_dose_date);
  const isConfirming = confirmDeleteId === v.id;

  return (
    <div className={`px-4 py-2.5 border-l-4 ${borderColor}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">{v.vaccine_name}</p>
            {isCurrent && diff !== null && diff < 0 && (
              <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                !
              </div>
            )}
            {statusBadge}
            {isCurrent && !statusBadge && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ Atual</span>
            )}
          </div>
          {/* Sem `truncate` de propósito: essa linha é a resposta pra "quando
              preciso agir", cortar com "..." escondia justamente o contador
              relativo (em N dias) no fim da frase — deixa quebrar em 2 linhas
              em vez de sumir com a parte mais importante. */}
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">
            {v.record_type === 'estimated_control_start' ? 'Controle iniciado em ' : ''}
            {fmtDate(v.date_administered)}
            {v.next_dose_date && (
              <>
                {' · '}próxima {fmtDate(v.next_dose_date)}
                {/* A superseded record's own next_dose_date is naturally in
                    the past by now — that's expected history, not a current
                    concern, since a later dose already replaced it. Only the
                    CURRENT record per vaccine group gets the "overdue"
                    framing/color; older ones just show the plain date. */}
                {isCurrent && diff !== null && (
                  <span className={`ml-1 font-medium ${
                    diff < 0 ? 'text-rose-600' : diff <= 7 ? 'text-amber-600' : ''
                  }`}>
                    ({fmtRelativeDays(diff)})
                  </span>
                )}
              </>
            )}
            {v.veterinarian ? ` · ${v.veterinarian}` : ''}
          </p>
          {v.notes && !SYSTEM_GENERATED_NOTES.has(v.notes.trim()) && (
            <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">📝 {v.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(v)}
            className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-xs hover:bg-sky-100 transition-colors"
            title="Editar"
          >
            ✏️
          </button>
          <button
            onClick={() => onDeleteClick(v)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition-colors ${
              isConfirming ? 'bg-red-600 text-white' : 'bg-red-50 text-red-500 hover:bg-red-100'
            }`}
            title={isConfirming ? 'Confirmar exclusão' : 'Excluir'}
          >
            {isConfirming ? '✓' : '🗑️'}
          </button>
        </div>
      </div>
    </div>
  );
}
