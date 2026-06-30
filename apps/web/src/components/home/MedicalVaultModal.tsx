'use client';

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
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
}

// ── Constants ─────────────────────────────────────────────────────────────

const DOC_FOLDERS = [
  { id: 'exam',         icon: '🔬', label: 'Exames',    bg: 'bg-blue-50',   border: 'border-blue-200'   },
  { id: 'vaccine',      icon: '💉', label: 'Vacinas',   bg: 'bg-green-50',  border: 'border-green-200'  },
  { id: 'prescription', icon: '📋', label: 'Receitas',  bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'report',       icon: '📄', label: 'Laudos',    bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'photo',        icon: '📸', label: 'Fotos',     bg: 'bg-pink-50',   border: 'border-pink-200'   },
  { id: 'other',        icon: '📎', label: 'Outros',    bg: 'bg-gray-50',   border: 'border-gray-200'   },
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

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('T')[0].split('-').map(Number);
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
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
    .filter((ev) => ev.scheduled_at && ev.source !== 'document')
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

// ── PDF export ─────────────────────────────────────────────────────────────

function exportPetHistoryPDF(
  pet: VaultPet,
  allEvents: AppEvent[],
  vaccines: VaccineRecord[],
  parasites: ParasiteControl[],
  grooming: GroomingRecord[],
  petEvts: PetEventRecord[],
  docs: VetHistoryDocument[],
) {
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const species = pet.species === 'cat' ? 'Gato' : pet.species === 'dog' ? 'Cachorro' : pet.species ?? '';

  const row = (cells: string[], header = false) => {
    const tag = header ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  };

  const section = (title: string, icon: string, content: string) => `
    <div class="section">
      <h2>${icon} ${title}</h2>
      ${content}
    </div>`;

  const emptyMsg = '<p class="empty">Nenhum registro encontrado.</p>';

  const vacTable = vaccines.length === 0 ? emptyMsg : `
    <table>
      <thead>${row(['Data','Vacina','Veterinário','Clínica'], true)}</thead>
      <tbody>
        ${vaccines
          .filter(v => v.date_administered)
          .sort((a, b) => b.date_administered!.localeCompare(a.date_administered!))
          .map(v => row([fmtDate(v.date_administered), v.vaccine_name || '—', v.veterinarian || '—', v.clinic_name || '—']))
          .join('')}
      </tbody>
    </table>`;

  const parasiteLabels: Record<string, string> = { dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira', heartworm: 'Filária', leishmaniasis: 'Leishmaniose' };
  const parTable = parasites.length === 0 ? emptyMsg : `
    <table>
      <thead>${row(['Data','Tipo','Produto','Próxima Aplicação'], true)}</thead>
      <tbody>
        ${parasites
          .filter(p => p.date_applied)
          .sort((a, b) => b.date_applied!.localeCompare(a.date_applied!))
          .map(p => row([fmtDate(p.date_applied), parasiteLabels[p.type] ?? p.type, p.product_name || '—', fmtDate(p.next_due_date)]))
          .join('')}
      </tbody>
    </table>`;

  const groomTable = grooming.length === 0 ? emptyMsg : `
    <table>
      <thead>${row(['Data','Serviço','Estabelecimento','Profissional'], true)}</thead>
      <tbody>
        ${grooming
          .filter(g => g.date)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(g => {
            const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
            return row([fmtDate(g.date), label, g.location || '—', g.groomer || '—']);
          })
          .join('')}
      </tbody>
    </table>`;

  const evtLabels: Record<string, string> = {
    consulta: 'Consulta', retorno: 'Retorno', exame_lab: 'Exame laboratorial',
    exame_imagem: 'Exame de imagem', cirurgia: 'Cirurgia', odonto: 'Odontologia',
    medicacao: 'Medicação', emergencia: 'Emergência', racao: 'Reposição de ração', outro: 'Outro',
  };
  const filteredEvts = petEvts.filter(ev => ev.scheduled_at && ev.source !== 'document');
  const evtTable = filteredEvts.length === 0 ? emptyMsg : `
    <table>
      <thead>${row(['Data','Tipo','Descrição','Local / Profissional'], true)}</thead>
      <tbody>
        ${filteredEvts
          .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
          .map(ev => row([
            fmtDate(ev.scheduled_at.split('T')[0]),
            evtLabels[ev.type] ?? ev.type,
            ev.title,
            [ev.professional_name ? `Dr(a). ${ev.professional_name}` : '', ev.location_name || ''].filter(Boolean).join(', ') || '—',
          ]))
          .join('')}
      </tbody>
    </table>`;

  // Part 2: docs split by category
  const catConfig: { id: string; icon: string; label: string }[] = [
    { id: 'exam',         icon: '🔬', label: 'Exames'   },
    { id: 'vaccine',      icon: '💉', label: 'Vacinas'  },
    { id: 'prescription', icon: '📋', label: 'Receitas' },
    { id: 'report',       icon: '📄', label: 'Laudos'   },
    { id: 'photo',        icon: '📸', label: 'Fotos'    },
    { id: 'other',        icon: '📎', label: 'Outros'   },
  ];
  const docsByCat = catConfig.map(cat => ({
    ...cat,
    items: [...docs]
      .filter(d => (d.category || 'other') === cat.id)
      .sort((a, b) => (b.document_date || b.created_at || '').localeCompare(a.document_date || a.created_at || '')),
  })).filter(cat => cat.items.length > 0);

  const docsCatSections = docsByCat.length === 0 ? emptyMsg : docsByCat.map(cat => `
    <div style="margin-top:16px">
      <h3 style="font-size:11pt;font-weight:700;color:#4338ca;margin-bottom:6px">${cat.icon} ${cat.label}</h3>
      <table>
        <thead>${row(['Data','Título','Estabelecimento'], true)}</thead>
        <tbody>
          ${cat.items.map(d => row([
            fmtDate(d.document_date || d.created_at?.split('T')[0]),
            d.title || '—',
            d.establishment_name || '—',
          ])).join('')}
        </tbody>
      </table>
    </div>`).join('');

  const partHeader = (num: string, title: string, subtitle: string) =>
    `<div class="part-header"><span class="part-num">${num}</span><div><div class="part-title">${title}</div><div class="part-sub">${subtitle}</div></div></div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Histórico de ${pet.pet_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @media print {
      @page { margin: 15mm 18mm; }
      .no-print { display: none !important; }
      .section { page-break-inside: avoid; }
      .part-header { page-break-before: auto; }
    }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; padding: 28px 32px; max-width: 900px; margin: 0 auto; }
    .cover { display: flex; flex-direction: column; gap: 4px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 3px solid #7c3aed; }
    .pet-name { font-size: 28pt; font-weight: 900; color: #4c1d95; }
    .pet-meta { font-size: 11pt; color: #555; }
    .export-date { font-size: 9pt; color: #aaa; margin-top: 6px; }
    .part-header { display: flex; align-items: center; gap: 14px; background: #4c1d95; color: #fff; border-radius: 10px; padding: 12px 18px; margin-top: 36px; margin-bottom: 4px; }
    .part-num { font-size: 22pt; font-weight: 900; opacity: 0.6; line-height: 1; }
    .part-title { font-size: 14pt; font-weight: 800; }
    .part-sub { font-size: 9pt; opacity: 0.75; margin-top: 2px; }
    .section { margin-top: 22px; }
    h2 { font-size: 13pt; font-weight: 800; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 5px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th { background: #f5f3ff; padding: 6px 9px; text-align: left; font-weight: 700; border-bottom: 1.5px solid #c4b5fd; color: #3730a3; }
    td { padding: 5px 9px; border-bottom: 1px solid #ede9fe; vertical-align: top; }
    tr:nth-child(even) td { background: #fdfcff; }
    .empty { color: #bbb; font-style: italic; font-size: 10pt; padding: 6px 0; }
    .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #eee; font-size: 8pt; color: #bbb; text-align: center; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: #7c3aed; color: #fff; border: none; border-radius: 16px; padding: 14px 28px; font-size: 14pt; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(124,58,237,0.3); }
    .print-btn:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="pet-name">🐾 ${pet.pet_name}</div>
    <div class="pet-meta">${[species, pet.breed, pet.birth_date ? `Nascido(a) em ${fmtDate(pet.birth_date)}` : ''].filter(Boolean).join(' · ')}</div>
    <div class="export-date">Exportado em ${now} via Petmol</div>
  </div>

  ${partHeader('1', 'Eventos registrados pelo Petmol', 'Gerados automaticamente pelos fluxos do app')}
  ${section('Vacinas', '💉', vacTable)}
  ${section('Controle Antiparasitário', '🦟', parTable)}
  ${section('Banho e Tosa', '🛁', groomTable)}
  ${section('Consultas e Eventos', '🩺', evtTable)}

  ${partHeader('2', 'Documentos enviados pelo tutor', 'Arquivos e documentos adicionados manualmente pelo responsável')}
  <div class="section">${docsCatSections}</div>

  <div class="footer">Petmol · Histórico completo de ${pet.pet_name} · ${now}</div>

  <button class="print-btn no-print" onclick="window.print()">🖨️ Salvar como PDF</button>
</body>
</html>`;

  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60000));
    } else {
      // Fallback: trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `historico-${pet.pet_name.toLowerCase().replace(/\s+/g, '-')}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch {
    showAppToast('Não foi possível gerar o PDF. Tente novamente.', { tone: 'warning' });
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
  vaccines = [],
  petEvents = [],
  vetHistoryDocs = [],
}: MedicalVaultModalProps) {
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Keep a local copy of docs so PDF export has current data
  const [localDocs, setLocalDocs] = useState<VetHistoryDocument[]>(vetHistoryDocs);
  useEffect(() => { setLocalDocs(vetHistoryDocs); }, [vetHistoryDocs]);

  if (!currentPet) return null;

  const parasites  = currentPet.health_data?.parasite_controls  ?? [];
  const grooming   = currentPet.health_data?.grooming_records   ?? [];
  const allEvents  = buildAllEvents(vaccines, parasites, grooming, petEvents);
  const previewEvents = allEvents.slice(0, 5);

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
        setLocalDocs(docs);
      })
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  };

  const handleExportPDF = () => {
    setExporting(true);
    try {
      exportPetHistoryPDF(currentPet, allEvents, vaccines, parasites, grooming, petEvents, localDocs);
    } finally {
      setTimeout(() => setExporting(false), 1500);
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

                {/* Preview (collapsed) */}
                {!eventsExpanded && allEvents.length > 0 && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {previewEvents.map((ev, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-base flex-shrink-0">{ev.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-slate-800 truncate">{ev.label}</p>
                          {ev.sub && <p className="text-[10px] text-slate-400 truncate">{ev.sub}</p>}
                        </div>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtDateShort(ev.date)}</span>
                      </div>
                    ))}
                    {allEvents.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setEventsExpanded(true)}
                        className="w-full text-center text-[12px] font-semibold text-blue-600 py-2.5 hover:bg-blue-50 transition-colors"
                      >
                        Ver todos os {allEvents.length} eventos →
                      </button>
                    )}
                  </div>
                )}

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

              {/* Export PDF */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exporting}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-violet-200 bg-violet-50 hover:bg-violet-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
              >
                <span className="text-xl">{exporting ? '⏳' : '📤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-violet-900 text-[15px]">
                    {exporting ? 'Gerando documento…' : 'Exportar histórico em PDF'}
                  </p>
                  <p className="text-[11px] text-violet-600 mt-0.5">Vacinas, antiparasitários, consultas e documentos</p>
                </div>
                <span className="text-violet-300 text-sm">›</span>
              </button>

              {/* Documents */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 mb-2">Documentos guardados</p>

                <button
                  type="button"
                  onClick={() => setOpenedCategory('all')}
                  className="w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all text-left shadow-sm"
                >
                  <span className="text-xl">🗂️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-[15px]">Todos os documentos</p>
                    <p className="text-xs text-slate-500">Ver e gerenciar sem filtro de categoria</p>
                  </div>
                  <span className="text-slate-300 text-sm">›</span>
                </button>

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
