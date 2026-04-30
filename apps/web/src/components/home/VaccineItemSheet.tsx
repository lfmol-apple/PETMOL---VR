'use client';

import React, { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { VaccineRecord } from '@/lib/petHealth';
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

function fmtRelativeDays(diff: number | null): string {
  if (diff === null) return '';
  if (diff < 0) return `atrasado há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`;
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
  onQuickAdd: () => void;
  onFullFormVaccine: (prefill: Partial<VaccineFormData>) => void;
  onEditVaccine: (v: VaccineRecord) => void;
  onDeleteVaccine: (v: VaccineRecord) => void;
  onDeleteAllVaccines: () => void;
  onRefreshVaccines: () => void;
  pendingCardFiles: File[];
  setPendingCardFiles: Dispatch<SetStateAction<File[]>>;
  importingCard: boolean;
  aiImageLimit: number;
  setAiImageLimit: Dispatch<SetStateAction<number>>;
  handleFilesSelectedAppend: (event: ChangeEvent<HTMLInputElement>) => void;
  handleProcessCards: (selected: File[]) => Promise<void>;
  initialMode?: 'view' | 'buy';
}

// ── Component ────────────────────────────────────────────────────────────────
export function VaccineItemSheet({
  petName,
  petSpecies,
  petPhotoUrl,
  vaccines,
  onClose,
  onQuickAdd,
  onFullFormVaccine,
  onEditVaccine,
  onDeleteVaccine,
  onDeleteAllVaccines,
  onRefreshVaccines,
  pendingCardFiles,
  setPendingCardFiles,
  importingCard,
  aiImageLimit,
  setAiImageLimit,
  handleFilesSelectedAppend,
  handleProcessCards,
  initialMode,
}: VaccineItemSheetProps) {
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<'view' | 'buy'>(initialMode === 'buy' ? 'buy' : 'view');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [overdueShowAll, setOverdueShowAll] = useState(false);
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
  const applied = [...vaccines].sort((a, b) => b.date_administered.localeCompare(a.date_administered));

  const nextDiff = upcoming.length > 0 ? diffDays(upcoming[0].next_dose_date) : null;
  const status = computeStatus(overdue.length, nextDiff);

  // Quick-entry chip data
  type ChipDef = { label: string; type: string; name: string; notes: string; disabled?: boolean };
  const dogChips: ChipDef[] = [
    { label: 'V10', type: 'multiple', name: 'V10 (Múltipla)', notes: 'Cinomose, Parvovirose, Hepatite, Coronavirose, Leptospirose, Adenovirose, Parainfluenza, Gripe' },
    { label: 'V8', type: 'multiple', name: 'V8 (Múltipla)', notes: 'Cinomose, Parvovirose, Hepatite, Coronavirose, Leptospirose, Adenovirose, Parainfluenza' },
    { label: 'Antirrábica', type: 'rabies', name: 'Antirrábica', notes: '' },
    { label: 'Gripe Canina', type: 'kennel_cough', name: 'Gripe Canina (Tosse dos Canis)', notes: 'Bordetella bronchiseptica' },
    { label: 'Giárdia', type: 'giardia', name: 'Giárdia', notes: '' },
    { label: 'Leishmaniose', type: 'leishmaniasis', name: 'Leishmaniose', notes: '', disabled: true },
  ];
  const catChips: ChipDef[] = [
    { label: 'V5', type: 'multiple', name: 'V5 (Quíntupla)', notes: 'Rinotraqueíte, Calicivirose, Panleucopenia, Clamidiose, Leucemia Felina' },
    { label: 'V4', type: 'multiple', name: 'V4 (Quádrupla)', notes: 'Rinotraqueíte, Calicivirose, Panleucopenia, Clamidiose' },
    { label: 'V3', type: 'multiple', name: 'V3 (Tríplice)', notes: 'Rinotraqueíte, Calicivirose, Panleucopenia' },
    { label: 'Antirrábica', type: 'rabies', name: 'Antirrábica', notes: '' },
    { label: 'FeLV', type: 'feline_leukemia', name: 'FeLV (Leucemia Felina)', notes: '' },
  ];
  const chips = (petSpecies === 'cat' || petSpecies === 'cats') ? catChips : dogChips;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleChipClick(chip: ChipDef) {
    if (chip.disabled) {
      showToast('A vacina de Leishmaniose requer receita veterinária.');
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
          {mode === 'view' && (
            <div className="p-5 space-y-3 pb-8">

            {/* ── PRIMARY CTA ───────────────────────────────────────────── */}
            <button
              onClick={() => onFullFormVaccine({ date_administered: today, frequency_days: 365 })}
              className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-[15px] font-bold shadow-md shadow-sky-500/20 transition-opacity"
            >
              Registrar vacina
            </button>

            {/* ── Secondary CTAs ─────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all text-xs font-semibold text-gray-600"
              >
                Carteirinha
              </button>
              <button
                onClick={onQuickAdd}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-white border border-sky-200 hover:bg-sky-50 active:scale-95 transition-all text-xs font-semibold text-sky-700"
              >
                Registro rápido
              </button>
              <button
                onClick={onRefreshVaccines}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all text-xs font-semibold text-gray-600"
              >
                Atualizar
              </button>
            </div>

            {/* ── Empty state (only when no data) ──────────────────────── */}
            {vaccines.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                <p className="text-4xl mb-3">💉</p>
                <p className="text-sm font-semibold text-gray-600">Nenhuma vacina registrada ainda</p>
                <p className="text-xs text-gray-400 mt-1">Leva menos de 1 minuto para começar</p>
                <button
                  onClick={onQuickAdd}
                  className="mt-3 inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Registrar vacina
                </button>
              </div>
            )}

            {/* ── DETALHES — single collapsed accordion for everything else */}
            {vaccines.length > 0 && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50"
                  onClick={() => setDetailsExpanded(d => !d)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Detalhes</span>
                    {overdue.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                        {overdue.length} para revisar
                      </span>
                    )}
                    {overdue.length === 0 && upcoming.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                        📅 {upcoming.length} próximas
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{detailsExpanded ? '▲' : '▼'}</span>
                </button>

                {detailsExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">

                    {/* Overdue chip + list */}
                    {overdue.length > 0 && (
                      <div>
                        <button
                          onClick={() => setOverdueExpanded(o => !o)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-rose-50 text-left"
                        >
                          <span className="text-sm flex-shrink-0">•</span>
                          <p className="flex-1 text-sm font-bold text-rose-700 truncate">
                            {overdue.length === 1
                              ? `${overdue[0].vaccine_name}: vale revisar`
                              : `${overdue.length} vacinas para revisar`}
                          </p>
                          <span className="text-rose-400 text-xs">{overdueExpanded ? '▲' : '▼'}</span>
                        </button>
                        {overdueExpanded && (
                          <div className="divide-y divide-rose-100 bg-rose-50">
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
                              <button onClick={() => setOverdueShowAll(s => !s)} className="w-full py-2 text-xs font-semibold text-rose-600 bg-rose-50/80">
                                {overdueShowAll ? 'Mostrar menos' : `Ver mais ${overdue.length - 2}`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Upcoming chip + list */}
                    {upcoming.length > 0 && (
                      <div>
                        <button
                          onClick={() => setUpcomingExpanded(u => !u)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-sky-50 text-left"
                        >
                          <span className="text-sm flex-shrink-0">📅</span>
                          <p className="flex-1 text-sm font-bold text-sky-700 truncate">
                            {upcoming[0].vaccine_name}
                            {diffDays(upcoming[0].next_dose_date) !== null && (
                              <span className="font-normal text-sky-600 ml-1">· {fmtRelativeDays(diffDays(upcoming[0].next_dose_date))}</span>
                            )}
                          </p>
                          <span className="text-sky-400 text-xs">{upcomingExpanded ? '▲' : '▼'}</span>
                        </button>
                        {upcomingExpanded && (
                          <div className="divide-y divide-sky-100 bg-sky-50">
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
                        )}
                      </div>
                    )}

                    {/* History */}
                    {applied.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between px-4 py-3">
                          <button
                            className="flex items-center justify-between text-left flex-1"
                            onClick={() => setHistoryExpanded(h => !h)}
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                              🗂️ Histórico ({applied.length})
                            </p>
                            <span className="text-gray-400 text-sm">{historyExpanded ? '▲' : '▼'}</span>
                          </button>
                          <button
                            onClick={onRefreshVaccines}
                            className="ml-3 text-xs font-semibold text-sky-600 hover:text-sky-700"
                          >
                            🔄 Atualizar
                          </button>
                        </div>
                        {historyExpanded && (
                          <div className="divide-y divide-gray-100 border-t border-gray-100">
                            {(historyShowAll ? applied : applied.slice(0, 2)).map(v => (
                              <VaccineRow
                                key={v.id}
                                vaccine={v}
                                isCurrent={currentVaccineIds.has(v.id)}
                                confirmDeleteId={confirmDeleteId}
                                onEdit={onEditVaccine}
                                onDeleteClick={handleDeleteClick}
                                borderColor="border-l-gray-300"
                                statusBadge={<span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">📚 Histórico</span>}
                              />
                            ))}
                            {!historyShowAll && applied.length > 2 && (
                              <button
                                onClick={() => setHistoryShowAll(true)}
                                className="w-full py-2.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-gray-50"
                              >
                                Ver todas ({applied.length - 2} restantes)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick chips */}
                    <div>
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                        onClick={() => setChipsExpanded(c => !c)}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          💡 Registro rápido por vacina
                        </p>
                        <span className="text-gray-400 text-sm">{chipsExpanded ? '▲' : '▼'}</span>
                      </button>
                      {chipsExpanded && (
                        <div className="px-3 pb-3 pt-2 flex flex-wrap gap-2 border-t border-gray-100">
                          {chips.map(chip => (
                            <button
                              key={chip.name}
                              onClick={() => handleChipClick(chip)}
                              disabled={chip.disabled}
                              className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all active:scale-95 ${
                                chip.disabled
                                  ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-white border-sky-200 text-sky-700 hover:bg-sky-50 shadow-sm'
                              }`}
                              title={chip.disabled ? 'Requer receita veterinária especial' : `Registrar ${chip.name}`}
                            >
                              {chip.label}
                              {chip.disabled && <span className="ml-1 text-[10px] text-gray-400">(restrita)</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="px-4 py-3 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-gray-50 border border-gray-200 px-3 py-2.5 text-center">
                        <p className="text-xl font-black text-gray-800">{vaccines.length}</p>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">Total</p>
                      </div>
                      <div className="rounded-2xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-center">
                        <p className="text-xl font-black text-sky-700">{upcomingSoon.length}</p>
                        <p className="text-[10px] text-sky-600 font-medium mt-0.5">Próximas</p>
                      </div>
                      <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2.5 text-center">
                        <p className="text-xl font-black text-red-600">{overdue.length}</p>
                        <p className="text-[10px] text-red-500 font-medium mt-0.5">Atrasadas</p>
                      </div>
                    </div>

                    {/* Delete all */}
                    <div className="px-4 py-3">
                      <button
                        onClick={handleDeleteAll}
                        className={`w-full py-2.5 rounded-2xl text-[13px] font-semibold border transition-all ${
                          confirmDeleteAll
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-red-500 border-red-200 hover:bg-red-50'
                        }`}
                      >
                        {confirmDeleteAll ? '⚠️ Confirmar exclusão de todas as vacinas' : '🗑️ Limpar todas as vacinas'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Buy button at the end */}
            {mode === 'view' && vaccines.length > 0 && (
              <button
                onClick={() => setMode('buy')}
                className="w-full flex items-center justify-between p-4 bg-blue-300 border border-blue-400/30 rounded-2xl hover:bg-blue-400/40 transition-all active:scale-[0.98] mt-1 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                    🛒
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-bold text-blue-900">Agendar ou comprar</p>
                    <p className="text-[12px] text-blue-700/70">Opções de vacinas e serviços</p>
                  </div>
                </div>
                <span className="text-blue-400 text-lg font-bold">›</span>
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
                { name: 'Petz', url: 'https://www.petz.com.br/servicos/vacinas', emoji: '🐕' },
                { name: 'Petlove', url: 'https://www.petlove.com.br/saude', emoji: '❤️' },
                { name: 'Amazon Pet', url: 'https://www.amazon.com.br/s?k=pet+saude', emoji: '📦' },
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
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4" onClick={() => { setShowImportModal(false); setPendingCardFiles([]); }}>
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 p-5 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800">📷 Fotografar carteirinha (opcional)</h3>
              <button
                onClick={() => { setShowImportModal(false); setPendingCardFiles([]); }}
                className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-sky-50 rounded-xl p-4 border border-sky-100">
                <p className="font-semibold text-gray-800 mb-2">✨ O sistema vai:</p>
                <ul className="space-y-1.5 text-sm text-gray-700">
                  <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span><span>Identificar vacinas automaticamente</span></li>
                  <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span><span>Extrair datas e informações</span></li>
                  <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span><span>Criar seu prontuário digital</span></li>
                </ul>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFilesSelectedAppend}
                disabled={importingCard}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.tiff,.tif,.avif,image/*"
                multiple
                onChange={handleFilesSelectedAppend}
                disabled={importingCard}
                className="hidden"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={importingCard}
                  onClick={() => cameraInputRef.current?.click()}
                  className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl p-6 text-center hover:bg-blue-100 hover:border-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-4xl mb-2">📸</div>
                  <div className="text-sm font-semibold text-sky-700">Câmera</div>
                  <div className="text-xs text-sky-600 mt-1">Você pode pular esta etapa</div>
                </button>

                <button
                  type="button"
                  disabled={importingCard}
                  onClick={() => galleryInputRef.current?.click()}
                  className="border-2 border-dashed border-purple-300 bg-purple-50 rounded-xl p-6 text-center hover:bg-purple-100 hover:border-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-4xl mb-2">🖼️</div>
                  <div className="text-sm font-semibold text-purple-700">Galeria / Arquivos</div>
                  <div className="text-xs text-purple-600 mt-1">Selecionar do dispositivo</div>
                </button>
              </div>

              {pendingCardFiles.length > 0 && !importingCard && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-green-800">
                    📎 {pendingCardFiles.length} foto{pendingCardFiles.length > 1 ? 's' : ''} selecionada{pendingCardFiles.length > 1 ? 's' : ''}
                  </p>
                  <ul className="text-xs text-green-700 space-y-0.5 max-h-24 overflow-y-auto">
                    {pendingCardFiles.map((f, i) => (
                      <li key={i} className="truncate">📄 {f.name}</li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="border border-purple-300 text-purple-700 bg-purple-50 py-2 rounded-xl text-xs font-medium hover:bg-purple-100 transition-all active:scale-95"
                    >
                      + Adicionar mais fotos
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="border border-blue-300 text-sky-700 bg-blue-50 py-2 rounded-xl text-xs font-medium hover:bg-blue-100 transition-all active:scale-95"
                    >
                      📸 Tirar mais fotos
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingCardFiles([])}
                      className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all active:scale-95"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleProcessCards(pendingCardFiles);
                        setShowImportModal(false);
                      }}
                      className="flex-[2] bg-sky-700 hover:bg-sky-800 text-white py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      🚀 Analisar agora
                    </button>
                  </div>
                </div>
              )}

              {importingCard && (
                <div className="bg-sky-50 border border-sky-100 text-sky-900 rounded-xl p-4 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-sky-200 border-t-sky-700 rounded-full mx-auto mb-2" />
                  <div className="font-semibold mb-1">Analisando cartão(ões)...</div>
                  <div className="text-sm text-sky-700">Aguarde o processamento</div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-xl p-3">
                <span className="font-medium text-gray-700">Limite de fotos</span>
                <select
                  value={aiImageLimit}
                  onChange={(e) => setAiImageLimit(Number(e.target.value))}
                  disabled={importingCard}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
                >
                  <option value={3}>3 (rápido)</option>
                  <option value={5}>5 (recomendado)</option>
                  <option value={8}>8 (completo)</option>
                  <option value={12}>12 (máximo)</option>
                </select>
              </div>

              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-xl flex-shrink-0">⚠️</span>
                  <div className="text-sm">
                    <p className="font-bold text-amber-900 mb-1">Atenção importante:</p>
                    <p className="text-amber-800 leading-relaxed">
                      Alguns cartões podem não ser lidos com total exatidão, dependendo da qualidade da foto, caligrafia e formato.
                      <strong className="block mt-1">Você é responsável por revisar e corrigir os dados importados antes de confiar neles.</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-sky-700 text-lg flex-shrink-0">💡</span>
                  <div className="text-xs text-blue-800">
                    <span className="font-semibold">Dicas para melhor resultado:</span>
                    <ul className="mt-1 space-y-0.5 ml-2">
                      <li>• Boa iluminação e foto nítida</li>
                      <li>• Cartão todo visível no enquadramento</li>
                      <li>• Pode enviar várias páginas/fotos</li>
                      <li>• Frente e verso se houver</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
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
            {diff !== null && diff < 0 && (
              <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                !
              </div>
            )}
            {statusBadge}
            {isCurrent && !statusBadge && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ Atual</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {v.record_type === 'estimated_control_start' ? 'Controle iniciado em ' : ''}
            {fmtDate(v.date_administered)}
            {v.next_dose_date && (
              <>
                {' · '}próxima {fmtDate(v.next_dose_date)}
                {diff !== null && (
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
          {(v.record_type || v.vaccine_code || v.country_code || v.next_due_source) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                v.record_type === 'estimated_control_start'
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}>
                {v.record_type === 'estimated_control_start' ? 'Estimado' : 'Confirmado'}
              </span>
              {v.vaccine_code && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-semibold border border-indigo-200">
                  🏷️ {v.vaccine_code}
                </span>
              )}
              {v.country_code && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  🌎 {v.country_code}
                </span>
              )}
              {v.next_due_source === 'protocol' && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">📅 Protocolo</span>
              )}
              {v.next_due_source === 'manual' && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-sky-700 border border-blue-200">✍️ Manual</span>
              )}
              {v.next_due_source === 'unknown' && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠️ Estimativa</span>
              )}
            </div>
          )}
          {v.notes && (
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
