'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
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
  parasiteControls?: ParasiteControl[];
  groomingRecords?: GroomingRecord[];
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
  parasiteControls,
  groomingRecords,
  petEvents = [],
  vetHistoryDocs = [],
  pendingFiles,
  onFilesConsumed,
}: MedicalVaultModalProps) {
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [localPending, setLocalPending] = useState<File[] | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentPet?.pet_id) return;
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setVetHistoryDocs(data); })
      .catch(() => {});
  }, [currentPet?.pet_id, setVetHistoryDocs]);

  if (!currentPet) return null;

  const parasites  = parasiteControls ?? currentPet.health_data?.parasite_controls ?? [];
  const grooming   = groomingRecords  ?? currentPet.health_data?.grooming_records  ?? [];
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

  const handleExportZip = async () => {
    setExportingZip(true);
    try {
      const authToken = localStorage.getItem('petmol_token');
      if (!authToken) {
        showAppToast('Sessão expirada. Faça login novamente.', { tone: 'warning' });
        return;
      }
      const res = await fetch(`${API_BASE_URL}/pets/${currentPet!.pet_id}/export-zip/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error();
      const { token: dlToken } = await res.json();
      const downloadUrl = `${window.location.origin}${API_BASE_URL}/pets/download/zip/${dlToken}`;

      // Navega direto para a URL — o servidor envia Content-Disposition: attachment,
      // o browser faz o download sem carregar o ZIP na memória do app.
      // No iOS 16.4+ (PWA e Safari), exibe "Salvar nos Arquivos" sem sair do app.
      window.location.href = downloadUrl;
    } catch {
      showAppToast('Não foi possível gerar o ZIP. Tente novamente.', { tone: 'warning' });
    } finally {
      setExportingZip(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const inVault = openedCategory !== null;
  const selectedFolder = DOC_FOLDERS.find((f) => f.id === openedCategory);

  const lastVaccine = vaccines
    .filter((v) => v.date_administered)
    .sort((a, b) => (b.date_administered || '').localeCompare(a.date_administered || ''))[0];

  const recentDocs = [...vetHistoryDocs]
    .sort((a, b) => {
      const da = a.document_date || a.created_at || '';
      const db = b.document_date || b.created_at || '';
      return db.localeCompare(da);
    })
    .slice(0, 5);

  const isImageDoc = (doc: VetHistoryDocument) =>
    Boolean(doc.mime_type?.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp)$/i.test(doc.storage_key || doc.file_name || ''));

  const handleQuickUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLocalPending(Array.from(files));
    setOpenedCategory('all');
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {inVault && (
                <button
                  onClick={() => setOpenedCategory(null)}
                  className="text-white/80 hover:text-white transition-colors flex-shrink-0"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <span className="text-xl flex-shrink-0">{inVault ? (selectedFolder?.icon ?? '🗂️') : '📓'}</span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate">
                  {inVault
                    ? (selectedFolder?.label ?? 'Todos os documentos')
                    : `Caderneta de ${currentPet.pet_name}`}
                </h2>
                {!inVault && (
                  <p className="text-violet-200 text-xs truncate">Documentos e histórico de saúde</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowMedicalVault(false)}
                className="w-9 h-9 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-xl text-white text-lg transition-colors"
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
            <div className="flex flex-col gap-4 p-4">

              {/* Carteirinha hero */}
              <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 p-4 shadow-lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-violet-300 text-[10px] font-semibold uppercase tracking-widest">Carteirinha de Saúde</p>
                    <p className="text-white text-xl font-bold mt-0.5 leading-tight">{currentPet.pet_name}</p>
                    <p className="text-violet-300 text-xs mt-0.5">
                      {currentPet.species === 'cat' ? 'Gato' : currentPet.species === 'dog' ? 'Cachorro' : currentPet.species || 'Pet'}
                      {currentPet.breed ? ` · ${currentPet.breed}` : ''}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center text-2xl border border-white/20">
                    {currentPet.species === 'cat' ? '🐱' : '🐶'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                    <p className="text-violet-300 text-[9px] uppercase tracking-wide font-medium">Última vacina</p>
                    <p className="text-white font-bold text-sm mt-0.5">
                      {lastVaccine
                        ? fmtDate(lastVaccine.date_administered)
                        : '—'}
                    </p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                    <p className="text-violet-300 text-[9px] uppercase tracking-wide font-medium">Documentos</p>
                    <p className="text-white font-bold text-sm mt-0.5">{vetHistoryDocs.length} {vetHistoryDocs.length === 1 ? 'arquivo' : 'arquivos'}</p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                    <p className="text-violet-300 text-[9px] uppercase tracking-wide font-medium">Eventos</p>
                    <p className="text-white font-bold text-sm mt-0.5">{allEvents.length}</p>
                  </div>
                </div>
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

              {/* Botão adicionar */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(e) => handleQuickUpload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 active:scale-[0.98] transition-all text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-md shadow-violet-500/25"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-xl">+</span>
                  Adicionar documento
                </button>
              </div>

              {/* Docs recentes */}
              {recentDocs.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Recentes</p>
                  <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {recentDocs.map((doc) => {
                      const folder = DOC_FOLDERS.find((f) => f.id === (doc.category || 'other'));
                      return (
                        <button
                          key={doc.id || doc.storage_key}
                          type="button"
                          onClick={() => setOpenedCategory(doc.category || 'other')}
                          className="flex-shrink-0 w-[72px] flex flex-col rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm active:scale-[0.96] transition-transform"
                          style={{ touchAction: 'manipulation' }}
                        >
                          {isImageDoc(doc) && currentPet.pet_id && doc.id ? (
                            <AuthenticatedDocumentImage
                              petId={currentPet.pet_id}
                              docId={doc.id}
                              alt={doc.title || 'Documento'}
                              className="w-[72px] h-[72px] object-cover"
                            />
                          ) : (
                            <div className="w-[72px] h-[72px] bg-slate-50 flex items-center justify-center text-3xl">
                              {folder?.icon || '📄'}
                            </div>
                          )}
                          <div className="px-1.5 py-1 bg-white">
                            <p className="text-[9px] text-slate-500 truncate leading-tight">{doc.title || doc.file_name || 'Documento'}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grade de pastas — 3 colunas */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Pastas</p>
                <div className="grid grid-cols-3 gap-2">
                  {DOC_FOLDERS.map((folder) => {
                    const count = vetHistoryDocs.filter((d) => (d.category || 'other') === folder.id).length;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => setOpenedCategory(folder.id)}
                        className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border transition-all active:scale-[0.96] hover:shadow-md ${folder.bg} ${folder.border}`}
                        style={{ touchAction: 'manipulation' }}
                      >
                        <span className="text-2xl">{folder.icon}</span>
                        <p className="font-semibold text-slate-900 text-[12px] leading-tight text-center">{folder.label}</p>
                        <p className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>
                          {count}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Eventos — collapsible */}
              <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setEventsExpanded((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-xl">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-indigo-900 text-[14px]">Linha do tempo</p>
                    <p className="text-xs text-indigo-400 mt-0.5">
                      {allEvents.length === 0 ? 'Nenhum evento registrado' : `${allEvents.length} evento${allEvents.length !== 1 ? 's' : ''} · toque para expandir`}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={`w-4 h-4 text-indigo-400 transition-transform flex-shrink-0 ${eventsExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

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

              {/* Exportar */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="flex-1 flex items-center gap-2 px-3 py-3 rounded-2xl border border-blue-200 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all disabled:opacity-60"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-lg">{exporting ? '⏳' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-blue-900 text-[13px] leading-tight">
                      {exporting ? 'Gerando…' : 'Exportar PDF'}
                    </p>
                    <p className="text-[10px] text-blue-500 mt-0.5">Histórico completo</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportZip}
                  disabled={exportingZip}
                  className="flex-1 flex items-center gap-2 px-3 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-60"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-lg">{exportingZip ? '⏳' : '🗜️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-emerald-900 text-[13px] leading-tight">
                      {exportingZip ? 'Gerando…' : 'Exportar ZIP'}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">
                      {exportingZip ? 'Aguarde…' : 'Arquivos originais'}
                    </p>
                  </div>
                </button>
              </div>
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
                pendingFiles={localPending ?? pendingFiles}
                onFilesConsumed={() => { setLocalPending(undefined); onFilesConsumed?.(); }}
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
