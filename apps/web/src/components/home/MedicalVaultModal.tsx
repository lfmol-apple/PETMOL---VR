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

// ── PDF export ─────────────────────────────────────────────────────────────

function exportPetHistoryPDF(
  pet: VaultPet,
  _allEvents: AppEvent[],
  vaccines: VaccineRecord[],
  parasites: ParasiteControl[],
  grooming: GroomingRecord[],
  petEvts: PetEventRecord[],
  docs: VetHistoryDocument[],
) {
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const species = pet.species === 'cat' ? 'Gato' : pet.species === 'dog' ? 'Cachorro' : pet.species ?? '';
  const petEmoji = pet.species === 'cat' ? '🐱' : '🐶';

  const row = (cells: string[], header = false) => {
    const tag = header ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  };

  const emptyRow = `<tr><td colspan="4" class="empty">Nenhum registro encontrado.</td></tr>`;

  // ── Vacinas ──
  const sortedVac = vaccines.filter(v => v.date_administered).sort((a, b) => b.date_administered!.localeCompare(a.date_administered!));
  const vacTable = `<table>
    <thead>${row(['Data', 'Vacina', 'Veterinário', 'Clínica'], true)}</thead>
    <tbody>${sortedVac.length === 0 ? emptyRow : sortedVac.map(v => row([fmtDate(v.date_administered), v.vaccine_name || '—', v.veterinarian || '—', v.clinic_name || '—'])).join('')}</tbody>
  </table>`;

  // ── Antiparasitários ──
  const parasiteLabels: Record<string, string> = { dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira', heartworm: 'Filária', leishmaniasis: 'Leishmaniose' };
  const sortedPar = parasites.filter(p => p.date_applied).sort((a, b) => b.date_applied!.localeCompare(a.date_applied!));
  const parTable = `<table>
    <thead>${row(['Data', 'Tipo', 'Produto', 'Próxima Aplicação'], true)}</thead>
    <tbody>${sortedPar.length === 0 ? emptyRow : sortedPar.map(p => row([fmtDate(p.date_applied), parasiteLabels[p.type] ?? p.type, p.product_name || '—', fmtDate(p.next_due_date)])).join('')}</tbody>
  </table>`;

  // ── Banho e Tosa ──
  const sortedGroom = grooming.filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date));
  const groomTable = `<table>
    <thead>${row(['Data', 'Serviço', 'Estabelecimento', 'Profissional'], true)}</thead>
    <tbody>${sortedGroom.length === 0 ? emptyRow : sortedGroom.map(g => {
      const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
      return row([fmtDate(g.date), label, g.location || '—', g.groomer || '—']);
    }).join('')}</tbody>
  </table>`;

  // ── Consultas e Eventos ──
  const evtLabels: Record<string, string> = {
    consulta: 'Consulta', retorno: 'Retorno', exame_lab: 'Exame lab.',
    exame_imagem: 'Exame de imagem', cirurgia: 'Cirurgia', odonto: 'Odontologia',
    medicacao: 'Medicação', emergencia: 'Emergência', racao: 'Reposição de ração', outro: 'Outro',
  };
  const filteredEvts = petEvts
    .filter(ev => ev.scheduled_at && ev.source !== 'document' && !DEDUPLICATED_EVENT_TYPES.has(ev.type))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const evtTable = `<table>
    <thead>${row(['Data', 'Tipo', 'Descrição', 'Local / Profissional'], true)}</thead>
    <tbody>${filteredEvts.length === 0 ? emptyRow : filteredEvts.map(ev => row([
      fmtDate(ev.scheduled_at.split('T')[0]),
      evtLabels[ev.type] ?? ev.type,
      ev.title,
      [ev.professional_name ? `Dr(a). ${ev.professional_name}` : '', ev.location_name || ''].filter(Boolean).join(', ') || '—',
    ])).join('')}</tbody>
  </table>`;

  // ── Documentos por categoria ──
  const catConfig: { id: string; icon: string; label: string }[] = [
    { id: 'exam',         icon: '🔬', label: 'Exames'                  },
    { id: 'vaccine',      icon: '📔', label: 'Carteirinha de Vacinação' },
    { id: 'prescription', icon: '📋', label: 'Receitas'                 },
    { id: 'report',       icon: '📄', label: 'Laudos'                   },
    { id: 'comprovante',  icon: '🧾', label: 'Comprovantes'             },
    { id: 'other',        icon: '📎', label: 'Outros'                   },
  ];
  const docsByCat = catConfig.map(cat => ({
    ...cat,
    items: [...docs]
      .filter(d => (d.category || 'other') === cat.id)
      .sort((a, b) => (b.document_date || b.created_at || '').localeCompare(a.document_date || a.created_at || '')),
  })).filter(cat => cat.items.length > 0);

  const docsContent = docs.length === 0
    ? `<tr><td colspan="3" class="empty">Nenhum documento encontrado.</td></tr>`
    : docsByCat.map(cat => `
        <tr class="cat-row"><td colspan="3"><span class="cat-label">${cat.icon} ${cat.label}</span></td></tr>
        ${cat.items.map(d => `<tr>
          <td class="doc-date">${fmtDate(d.document_date || d.created_at?.split('T')[0])}</td>
          <td class="doc-name">${d.title || '—'}</td>
          <td class="doc-estab">${d.establishment_name || '—'}</td>
        </tr>`).join('')}
      `).join('');

  const pl = (n: number, s: string) => `${n} ${s}${n !== 1 ? 's' : ''}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Histórico de ${pet.pet_name} — Petmol</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 10mm 13mm; }
    @media print {
      @page { margin: 10mm 13mm; }
      .no-print { display: none !important; }
      body { padding: 0; margin-bottom: 0; }
      .sec { page-break-inside: avoid; }
    }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 9.5pt;
      color: #1e293b;
      background: #fff;
      padding: 20px 24px 120px;
      max-width: 820px;
      margin: 0 auto;
    }

    /* ── Cover ── */
    .cover {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(135deg, #0056D2 0%, #2563eb 100%);
      border-radius: 14px; color: #fff; margin-bottom: 10px;
    }
    .cover-avatar {
      width: 46px; height: 46px; flex-shrink: 0;
      background: rgba(255,255,255,0.18); border-radius: 12px;
      display: flex; align-items: center; justify-content: center; font-size: 22px;
    }
    .cover-info { flex: 1; }
    .cover-name { font-size: 18pt; font-weight: 900; line-height: 1.1; }
    .cover-meta { font-size: 8.5pt; color: rgba(255,255,255,0.8); margin-top: 2px; }
    .cover-date { font-size: 7pt; color: rgba(255,255,255,0.5); margin-top: 3px; }
    .petmol-tag {
      align-self: flex-start;
      font-size: 7pt; font-weight: 800; letter-spacing: 0.1em;
      text-transform: uppercase; color: rgba(255,255,255,0.55);
      background: rgba(255,255,255,0.12); padding: 3px 7px; border-radius: 5px;
    }

    /* ── Section card ── */
    .sec { margin-bottom: 7px; }
    .sec-hdr {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 9px; border-radius: 8px; margin-bottom: 2px;
      border-left: 3px solid currentColor;
    }
    .sec-icon { font-size: 12px; line-height: 1; }
    .sec-title { font-size: 10pt; font-weight: 800; }
    .sec-count { font-size: 7pt; font-weight: 600; opacity: 0.6; margin-left: auto; }

    .hdr-v { background: #f5f3ff; color: #5b21b6; }
    .hdr-g { background: #ecfdf5; color: #065f46; }
    .hdr-c { background: #ecfeff; color: #0e7490; }
    .hdr-b { background: #eff6ff; color: #1d4ed8; }
    .hdr-s { background: #f8fafc; color: #334155; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    th {
      background: #f8fafc; padding: 3px 7px; text-align: left;
      font-weight: 700; font-size: 7pt; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.06em;
      border-bottom: 1.5px solid #e2e8f0;
    }
    td { padding: 3.5px 7px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.3; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { color: #94a3b8; font-style: italic; }

    /* Docs table specifics */
    .cat-row td { padding: 4px 7px 2px; background: #f8fafc !important; border-bottom: none; }
    .cat-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
    .doc-date { color: #64748b; width: 80px; }
    .doc-name { font-weight: 600; }
    .doc-estab { color: #94a3b8; width: 120px; font-size: 8pt; }

    /* ── Footer ── */
    .footer {
      margin-top: 10px; padding-top: 7px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 7pt; color: #94a3b8;
    }

    /* ── FAB bar (screen only) ── */
    .fab-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      padding: 10px 18px 18px;
      background: rgba(255,255,255,0.97);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      border-top: 1px solid #e2e8f0;
    }
    .fab-tip { font-size: 8pt; color: #0056D2; margin-bottom: 7px; line-height: 1.4; }
    .fab-tip b { font-weight: 800; }
    .fab {
      display: block; width: 100%;
      background: #0056D2; color: #fff; border: none;
      border-radius: 13px; padding: 13px 20px;
      font-size: 12pt; font-weight: 700; cursor: pointer; text-align: center;
    }
    .fab:hover { background: #004ab5; }
  </style>
</head>
<body>

  <div class="cover">
    <div class="cover-avatar">${petEmoji}</div>
    <div class="cover-info">
      <div class="cover-name">${pet.pet_name}</div>
      <div class="cover-meta">${[species, pet.breed, pet.birth_date ? `Nascido(a) em ${fmtDate(pet.birth_date)}` : ''].filter(Boolean).join(' · ')}</div>
      <div class="cover-date">Exportado em ${now}</div>
    </div>
    <div class="petmol-tag">PETMOL</div>
  </div>

  <div class="sec">
    <div class="sec-hdr hdr-v">
      <span class="sec-icon">💉</span>
      <span class="sec-title">Vacinas</span>
      <span class="sec-count">${pl(sortedVac.length, 'registro')}</span>
    </div>
    ${vacTable}
  </div>

  <div class="sec">
    <div class="sec-hdr hdr-g">
      <span class="sec-icon">🦟</span>
      <span class="sec-title">Controle Antiparasitário</span>
      <span class="sec-count">${pl(sortedPar.length, 'registro')}</span>
    </div>
    ${parTable}
  </div>

  <div class="sec">
    <div class="sec-hdr hdr-c">
      <span class="sec-icon">🛁</span>
      <span class="sec-title">Banho e Tosa</span>
      <span class="sec-count">${pl(sortedGroom.length, 'registro')}</span>
    </div>
    ${groomTable}
  </div>

  <div class="sec">
    <div class="sec-hdr hdr-b">
      <span class="sec-icon">🩺</span>
      <span class="sec-title">Consultas e Eventos</span>
      <span class="sec-count">${pl(filteredEvts.length, 'registro')}</span>
    </div>
    ${evtTable}
  </div>

  <div class="sec">
    <div class="sec-hdr hdr-s">
      <span class="sec-icon">📁</span>
      <span class="sec-title">Documentos</span>
      <span class="sec-count">${pl(docs.length, 'arquivo')}</span>
    </div>
    <table>
      <thead>${row(['Data', 'Título', 'Estabelecimento'], true)}</thead>
      <tbody>${docsContent}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>PETMOL · Histórico de ${pet.pet_name}</span>
    <span>${now}</span>
  </div>

  <div class="fab-bar no-print">
    <p class="fab-tip">Para enviar ao WhatsApp: toque em <b>Gerar PDF</b> → no preview de impressão, toque em <b>Compartilhar ⬆️</b> → escolha WhatsApp</p>
    <button class="fab" onclick="window.print()">🖨️ Gerar PDF</button>
  </div>

</body>
</html>`;

  try {
    const win = window.open('about:blank', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
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

// ── WhatsApp text export ────────────────────────────────────────────────────

function generateWhatsAppText(
  pet: VaultPet,
  vaccines: VaccineRecord[],
  parasites: ParasiteControl[],
  grooming: GroomingRecord[],
  petEvts: PetEventRecord[],
  docs: VetHistoryDocument[],
): string {
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const species = pet.species === 'cat' ? 'Gato' : pet.species === 'dog' ? 'Cachorro' : pet.species ?? '';
  const parasiteLabels: Record<string, string> = {
    dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira',
    heartworm: 'Filária', leishmaniasis: 'Leishmaniose',
  };
  const evtLabels: Record<string, string> = {
    consulta: 'Consulta', retorno: 'Retorno', exame_lab: 'Exame lab.',
    exame_imagem: 'Exame imagem', cirurgia: 'Cirurgia', odonto: 'Odontologia',
    medicacao: 'Medicação', emergencia: 'Emergência', outro: 'Outro',
  };

  const lines: string[] = [
    `*Histórico de ${pet.pet_name}*`,
    [species, pet.breed, pet.birth_date ? `Nascido(a) em ${fmtDate(pet.birth_date)}` : ''].filter(Boolean).join(' · '),
    `_Exportado em ${now} via Petmol_`,
    '',
  ];

  const sortedVac = vaccines.filter(v => v.date_administered).sort((a, b) => b.date_administered!.localeCompare(a.date_administered!));
  if (sortedVac.length > 0) {
    lines.push('*Vacinas*');
    for (const v of sortedVac.slice(0, 6)) {
      const p = [fmtDate(v.date_administered), v.vaccine_name || '?'];
      if (v.veterinarian) p.push(`Dr(a). ${v.veterinarian}`);
      if (v.clinic_name) p.push(v.clinic_name);
      lines.push(`• ${p.join(' — ')}`);
    }
    if (sortedVac.length > 6) lines.push(`_...e mais ${sortedVac.length - 6} vacinas_`);
    lines.push('');
  }

  const sortedPar = parasites.filter(p => p.date_applied).sort((a, b) => b.date_applied!.localeCompare(a.date_applied!));
  if (sortedPar.length > 0) {
    lines.push('*Antiparasitários*');
    for (const p of sortedPar.slice(0, 4)) {
      const parts = [fmtDate(p.date_applied), parasiteLabels[p.type] ?? p.type];
      if (p.product_name) parts.push(p.product_name);
      if (p.next_due_date) parts.push(`próxima: ${fmtDate(p.next_due_date)}`);
      lines.push(`• ${parts.join(' — ')}`);
    }
    lines.push('');
  }

  const sortedGroom = grooming.filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date));
  if (sortedGroom.length > 0) {
    lines.push('*Banho e Tosa*');
    for (const g of sortedGroom.slice(0, 3)) {
      const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
      const parts = [fmtDate(g.date), label];
      if (g.location) parts.push(g.location);
      lines.push(`• ${parts.join(' — ')}`);
    }
    lines.push('');
  }

  const filteredEvts = petEvts
    .filter(ev => ev.scheduled_at && ev.source !== 'document' && !DEDUPLICATED_EVENT_TYPES.has(ev.type))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  if (filteredEvts.length > 0) {
    lines.push('*Consultas e Eventos*');
    for (const ev of filteredEvts.slice(0, 5)) {
      const parts = [fmtDate(ev.scheduled_at.split('T')[0]), evtLabels[ev.type] ?? ev.type];
      if (ev.title && ev.title !== evtLabels[ev.type]) parts.push(ev.title);
      if (ev.professional_name) parts.push(`Dr(a). ${ev.professional_name}`);
      if (ev.location_name) parts.push(ev.location_name);
      lines.push(`• ${parts.join(' — ')}`);
    }
    if (filteredEvts.length > 5) lines.push(`_...e mais ${filteredEvts.length - 5} eventos_`);
    lines.push('');
  }

  if (docs.length > 0) {
    lines.push(`*Documentos:* ${docs.length} ${docs.length === 1 ? 'arquivo' : 'arquivos'} no Petmol`);
    lines.push('_Exames, receitas e laudos disponíveis no app_');
  }

  return lines.join('\n');
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

  // Keep a local copy of docs so PDF export has current data
  const [localDocs, setLocalDocs] = useState<VetHistoryDocument[]>(vetHistoryDocs);
  useEffect(() => { setLocalDocs(vetHistoryDocs); }, [vetHistoryDocs]);

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

  const handleShareWhatsApp = async () => {
    const text = generateWhatsAppText(currentPet, vaccines, parasites, grooming, petEvents, localDocs);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text, title: `Histórico de ${currentPet.pet_name}` });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
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

              {/* Compartilhar histórico */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.98] transition-all text-left"
                >
                  <span className="text-xl">📲</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-emerald-900 text-[15px]">Compartilhar histórico</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">Vacinas, antiparasitários, consultas e documentos</p>
                  </div>
                  <span className="text-emerald-300 text-sm">›</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
                >
                  <span className="text-lg">{exporting ? '⏳' : '🖨️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-600 text-[13px]">
                      {exporting ? 'Gerando…' : 'Exportar como PDF'}
                    </p>
                  </div>
                  <span className="text-slate-300 text-sm">›</span>
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
