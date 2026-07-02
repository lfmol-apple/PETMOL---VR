'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { PetDocumentVault } from '@/components/PetDocumentVault';
import { API_BASE_URL } from '@/lib/api';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import type { VaccineRecord } from '@/lib/petHealth';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetEventRecord } from '@/lib/petEvents';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';
import { ModalPortal } from '@/components/ModalPortal';

// ── Types ─────────────────────────────────────────────────────────────────

type VaultPet = {
  pet_id: string;
  pet_name: string;
  species?: string;
  breed?: string;
  birth_date?: string;
  health_data?: {
    parasite_controls?: ParasiteControl[];
    grooming_records?: GroomingRecord[];
  };
};

interface MedicalVaultModalProps {
  currentPet: VaultPet | null | undefined;
  setShowMedicalVault: (value: boolean) => void;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
  vaccines?: VaccineRecord[];
  petEvents?: PetEventRecord[];
  vetHistoryDocs?: VetHistoryDocument[];
  pendingFiles?: File[];
  onFilesConsumed?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const DOC_FOLDERS = [
  { id: 'exam',         icon: '🔬', label: 'Exames',           bg: 'bg-blue-50',   border: 'border-blue-200'   },
  { id: 'vaccine',      icon: '📔', label: 'Carteirinha',      bg: 'bg-green-50',  border: 'border-green-200'  },
  { id: 'prescription', icon: '📋', label: 'Receitas',         bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'report',       icon: '📄', label: 'Laudos',           bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'comprovante',  icon: '🧾', label: 'Comprovantes',     bg: 'bg-amber-50',  border: 'border-amber-200'  },
  { id: 'other',        icon: '📎', label: 'Outros',           bg: 'bg-gray-50',   border: 'border-gray-200'   },
];

const EVENT_ICONS: Record<string, string> = {
  consulta: '🩺', retorno: '🔁', exame_lab: '🔬', exame_imagem: '📷',
  cirurgia: '✂️', odonto: '🦷', medicacao: '💊', emergencia: '🚨',
  racao: '🥣', outro: '📝',
};

// ── Utils ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} ${months[m - 1]} ${y}`;
}

// ── Build unified event list ───────────────────────────────────────────────

type AppEvent = {
  date: string;
  icon: string;
  label: string;
  sub: string;
  detail?: string;
  section: string;
};

// Types already covered by dedicated data sources (vaccines[], parasites[], grooming[])
// — exclude from petEvents to avoid duplication in timeline and PDF
const DEDUPLICATED_EVENT_TYPES = new Set([
  'vaccine',
  'dewormer', 'flea_tick', 'heartworm', 'collar', 'leishmaniasis',
  'bath', 'grooming', 'bath_grooming',
]);

function buildAllEvents(
  vaccines: VaccineRecord[],
  parasites: ParasiteControl[],
  grooming: GroomingRecord[],
  petEvts: PetEventRecord[],
): AppEvent[] {
  const events: AppEvent[] = [];

  vaccines
    .filter((v) => v.date_administered)
    .forEach((v) => events.push({
      date: v.date_administered!,
      icon: '💉',
      label: v.vaccine_name || 'Vacina',
      sub: [v.veterinarian ? `Dr(a). ${v.veterinarian}` : '', v.clinic_name || ''].filter(Boolean).join(' · '),
      section: 'Vacinas',
    }));

  const parasiteIcons: Record<string, string> = { dewormer: '🪱', flea_tick: '🦟', collar: '⭕', heartworm: '💓', leishmaniasis: '🛡️' };
  const parasiteLabels: Record<string, string> = { dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira', heartworm: 'Filária', leishmaniasis: 'Leishmaniose' };
  parasites
    .filter((p) => p.date_applied)
    .forEach((p) => events.push({
      date: p.date_applied!,
      icon: parasiteIcons[p.type] ?? '🦟',
      label: parasiteLabels[p.type] ?? 'Antiparasitário',
      sub: [p.product_name, p.veterinarian ? `Dr(a). ${p.veterinarian}` : ''].filter(Boolean).join(' · '),
      detail: p.next_due_date ? `Próxima: ${fmtDate(p.next_due_date)}` : undefined,
      section: 'Antiparasitários',
    }));

  grooming
    .filter((g) => g.date)
    .forEach((g) => {
      const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
      events.push({
        date: g.date,
        icon: '🛁',
        label,
        sub: [g.groomer, g.location].filter(Boolean).join(' · '),
        section: 'Higiene',
      });
    });

  petEvts
    .filter((ev) => ev.scheduled_at && ev.source !== 'document' && !DEDUPLICATED_EVENT_TYPES.has(ev.type))
    .forEach((ev) => events.push({
      date: ev.scheduled_at.split('T')[0],
      icon: EVENT_ICONS[ev.type] ?? '📝',
      label: ev.title,
      sub: [ev.professional_name ? `Dr(a). ${ev.professional_name}` : '', ev.location_name || ''].filter(Boolean).join(' · '),
      detail: ev.cost ? `R$ ${Number(ev.cost).toFixed(2)}` : undefined,
      section: 'Consultas e Eventos',
    }));

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Component ──────────────────────────────────────────────────────────────

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
  vaccines = [],
  petEvents = [],
  vetHistoryDocs = [],
  pendingFiles,
  onFilesConsumed,
}: MedicalVaultModalProps) {
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!currentPet) return null;

  const parasites  = currentPet.health_data?.parasite_controls  ?? [];
  const grooming   = currentPet.health_data?.grooming_records   ?? [];
  const allEvents  = buildAllEvents(vaccines, parasites, grooming, petEvents);

  // Group by year for expanded view
  const byYear: Record<string, AppEvent[]> = {};
  allEvents.forEach((ev) => {
    const y = ev.date.split('-')[0];
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(ev);
  });
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));

  const refreshDocuments = () => {
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const docs = Array.isArray(data) ? data : [];
        setVetHistoryDocs(docs);
      })
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('petmol_token');
      if (!token) { showAppToast('Sessão expirada. Faça login novamente.', { tone: 'warning' }); return; }
      const res = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/export-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('backend_error');
      const blob = await res.blob();
      const safe = currentPet.pet_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const file = new File([blob], `historico-${safe}.pdf`, { type: 'application/pdf' });
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: `Histórico de ${currentPet.pet_name}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historico-${safe}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        showAppToast('Não foi possível gerar o PDF. Tente novamente.', { tone: 'warning' });
      }
    } finally {
      setExporting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const inVault = openedCategory !== null;
  const selectedFolder = DOC_FOLDERS.find((f) => f.id === openedCategory);

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-slate-100 px-4 py-3 flex-shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {inVault && (
                <button
                  onClick={() => setOpenedCategory(null)}
                  className="text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <span className="text-xl flex-shrink-0">{inVault ? (selectedFolder?.icon ?? '🗂️') : '📂'}</span>
              <h2 className="text-base font-bold text-slate-900 truncate">
                {inVault
                  ? (selectedFolder?.label ?? 'Todos os documentos')
                  : `Histórico — ${currentPet.pet_name}`}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowMedicalVault(false)}
                className="w-9 h-9 flex items-center justify-center bg-white rounded-xl text-slate-500 text-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1">

          {/* ─── HOME ──────────────────────────────────────────────────── */}
          {!inVault && (
            <div className="p-4 space-y-4">

              {/* Eventos — collapsible */}
              <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setEventsExpanded((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
                >
                  <span className="text-xl">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-indigo-900 text-[15px]">Eventos da vida {currentPet.pet_name.startsWith('de ') ? '' : 'de '}{currentPet.pet_name}</p>
                    <p className="text-xs text-indigo-400 mt-0.5">
                      {allEvents.length === 0 ? 'Nenhum evento registrado' : `${allEvents.length} evento${allEvents.length !== 1 ? 's' : ''} · toque para ver o histórico`}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={`w-4 h-4 text-indigo-400 transition-transform flex-shrink-0 ${eventsExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Full timeline (expanded) */}
                {eventsExpanded && (
                  <div className="border-t border-slate-100">
                    {allEvents.length === 0 ? (
                      <p className="text-center text-slate-400 text-sm py-8">Nenhum evento registrado ainda.</p>
                    ) : (
                      <div className="p-3 space-y-5">
                        {years.map((year) => (
                          <div key={year}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-slate-200" />
                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{year}</span>
                              <div className="flex-1 h-px bg-slate-200" />
                            </div>
                            <div className="space-y-1.5 pl-1">
                              {byYear[year].map((ev, i) => (
                                <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                                  <span className="text-base flex-shrink-0 mt-0.5">{ev.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p className="text-[13px] font-semibold text-slate-900 truncate">{ev.label}</p>
                                      <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtDate(ev.date)}</span>
                                    </div>
                                    {ev.sub && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ev.sub}</p>}
                                    {ev.detail && <p className="text-[10px] text-slate-400 mt-0.5">{ev.detail}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pending share banner */}
              {pendingFiles && pendingFiles.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-xl flex-shrink-0">📎</span>
                  <p className="text-[13px] text-emerald-800 font-semibold leading-snug flex-1">
                    {pendingFiles.length === 1
                      ? '1 arquivo recebido — escolha uma pasta para salvar'
                      : `${pendingFiles.length} arquivos recebidos — escolha uma pasta para salvar`}
                  </p>
                </div>
              )}

              {/* Documents */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 mb-2">Documentos guardados</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {DOC_FOLDERS.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setOpenedCategory(folder.id)}
                      className={`relative flex flex-col items-start gap-1.5 p-4 rounded-2xl border transition-all text-left active:scale-[0.97] hover:shadow-md ${folder.bg} ${folder.border}`}
                    >
                      <span className="text-2xl">{folder.icon}</span>
                      <p className="font-bold text-slate-900 text-[13px] leading-tight">{folder.label}</p>
                      <span className="absolute top-3 right-3 text-slate-300 text-xs">›</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Exportar PDF */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exporting}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-blue-200 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
              >
                <span className="text-xl">{exporting ? '⏳' : '📤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-blue-900 text-[15px]">
                    {exporting ? 'Gerando PDF…' : 'Exportar e Compartilhar PDF'}
                  </p>
                  <p className="text-[11px] text-blue-700 mt-0.5">Vacinas, antiparasitários, banho & tosa, eventos e documentos</p>
                </div>
                <span className="text-blue-300 text-sm">›</span>
              </button>
            </div>
          )}

          {/* ─── VAULT ────────────────────────────────────────────────── */}
          {inVault && (
            <div className="px-4 py-4 sm:p-6">
              <PetDocumentVault
                petId={currentPet.pet_id}
                onDocsChanged={refreshDocuments}
                initialCategory={openedCategory === 'all' ? 'all' : openedCategory ?? 'all'}
                hideCategoryTabs={openedCategory !== 'all'}
                pendingFiles={pendingFiles}
                onFilesConsumed={onFilesConsumed}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              if (inVault) { setOpenedCategory(null); }
              else { refreshDocuments(); setShowMedicalVault(false); }
            }}
            className="px-4 py-2 bg-[#0056D2] text-white rounded-lg font-semibold text-sm hover:bg-[#0047ad] transition-colors"
          >
            {inVault ? '← Voltar' : '✓ Fechar'}
          </button>
          <p className="text-xs text-slate-400 ml-auto">Arquivos privados e protegidos</p>
        </div>

      </div>
    </div>
    </ModalPortal>
  );
}
