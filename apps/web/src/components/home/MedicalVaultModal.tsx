'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { PetShareExportPanel } from '@/components/PetShareExportPanel';
import { PetDocumentVault } from '@/components/PetDocumentVault';
import { API_BASE_URL } from '@/lib/api';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetEventRecord } from '@/lib/petEvents';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';
import { ModalPortal } from '@/components/ModalPortal';

type VaultPet = Pick<PetHealthProfile, 'pet_id' | 'pet_name'> & {
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
}

const DOC_FOLDERS: { id: string; icon: string; label: string; colorBg: string; colorBorder: string }[] = [
  { id: 'exam',         icon: '🔬', label: 'Exames',    colorBg: 'bg-blue-50',   colorBorder: 'border-blue-200'   },
  { id: 'vaccine',      icon: '💉', label: 'Vacinas',   colorBg: 'bg-green-50',  colorBorder: 'border-green-200'  },
  { id: 'prescription', icon: '📋', label: 'Receitas',  colorBg: 'bg-purple-50', colorBorder: 'border-purple-200' },
  { id: 'report',       icon: '📄', label: 'Laudos',    colorBg: 'bg-indigo-50', colorBorder: 'border-indigo-200' },
  { id: 'photo',        icon: '📸', label: 'Fotos',     colorBg: 'bg-pink-50',   colorBorder: 'border-pink-200'   },
  { id: 'other',        icon: '📎', label: 'Outros',    colorBg: 'bg-gray-50',   colorBorder: 'border-gray-200'   },
];

const EVENT_ICONS: Record<string, string> = {
  consulta: '🩺', retorno: '🔁', exame_lab: '🔬', exame_imagem: '📷',
  cirurgia: '✂️', odonto: '🦷', medicacao: '💊', emergencia: '🚨',
  racao: '🥣', outro: '📝',
};
const EVENT_COLORS: Record<string, string> = {
  consulta: '#0056D2', retorno: '#0056D2', exame_lab: '#4f46e5', exame_imagem: '#4f46e5',
  cirurgia: '#7c3aed', odonto: '#0d9488', medicacao: '#db2777', emergencia: '#d97706',
  racao: '#d97706', outro: '#6b7280',
};

function fmtEventDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
  vaccines = [],
  petEvents = [],
}: MedicalVaultModalProps) {
  const [showQRInVault, setShowQRInVault] = useState(false);
  // null = home; 'all' | category = vault; 'eventos' = full event list
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);

  if (!currentPet) return null;

  const refreshDocuments = () => {
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setVetHistoryDocs(Array.isArray(data) ? data : []))
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  };

  // ── Build unified event list ─────────────────────────────────────────────
  type AppEvent = { date: string; icon: string; label: string; sub: string; color: string };

  const allEvents: AppEvent[] = [];

  vaccines
    .filter((v) => v.date_administered)
    .forEach((v) => allEvents.push({
      date: v.date_administered!,
      icon: '💉',
      label: v.vaccine_name || 'Vacina',
      sub: v.veterinarian ? `Dr(a). ${v.veterinarian}` : v.clinic_name || '',
      color: '#16a34a',
    }));

  (currentPet.health_data?.parasite_controls || []).forEach((p: ParasiteControl) => {
    const icons: Record<string, string> = { dewormer: '🪱', flea_tick: '🦟', collar: '⭕', heartworm: '💓', leishmaniasis: '🛡️' };
    const labels: Record<string, string> = { dewormer: 'Vermífugo', flea_tick: 'Antipulgas/Carrapato', collar: 'Coleira', heartworm: 'Filária', leishmaniasis: 'Leishmaniose' };
    if (!p.date_applied) return;
    allEvents.push({
      date: p.date_applied,
      icon: icons[p.type] ?? '🦟',
      label: labels[p.type] ?? 'Antiparasitário',
      sub: p.product_name || '',
      color: '#d97706',
    });
  });

  (currentPet.health_data?.grooming_records || []).forEach((g: GroomingRecord) => {
    if (!g.date) return;
    const label = g.type === 'bath' ? 'Banho' : g.type === 'grooming' ? 'Tosa' : 'Banho e Tosa';
    allEvents.push({ date: g.date, icon: '🛁', label, sub: g.groomer || g.location || '', color: '#0d9488' });
  });

  petEvents
    .filter((ev) => ev.scheduled_at && ev.source !== 'document')
    .forEach((ev) => allEvents.push({
      date: ev.scheduled_at.split('T')[0],
      icon: EVENT_ICONS[ev.type] ?? '📝',
      label: ev.title,
      sub: ev.professional_name || ev.location_name || '',
      color: EVENT_COLORS[ev.type] ?? '#6b7280',
    }));

  allEvents.sort((a, b) => b.date.localeCompare(a.date));
  const recentEvents = allEvents.slice(0, 8);

  // ── Derived ──────────────────────────────────────────────────────────────
  const inVault = openedCategory !== null && openedCategory !== 'eventos';
  const inEventList = openedCategory === 'eventos';
  const selectedFolder = DOC_FOLDERS.find((f) => f.id === openedCategory);

  const headerIcon = inVault ? (selectedFolder?.icon ?? '🗂️') : inEventList ? '📋' : '📂';
  const headerTitle = inVault
    ? (selectedFolder?.label ?? 'Todos os documentos')
    : inEventList
    ? 'Todos os eventos'
    : `Documentos — ${currentPet.pet_name}`;

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-50/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/70 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-slate-100 text-slate-900 px-4 py-3 flex-shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {(inVault || inEventList) && (
                <button
                  onClick={() => { setOpenedCategory(null); setShowQRInVault(false); }}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <span className="text-2xl flex-shrink-0">{headerIcon}</span>
              <h2 className="text-base sm:text-xl font-bold leading-tight truncate">{headerTitle}</h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {inVault && (
                <button
                  onClick={() => setShowQRInVault((p) => !p)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border border-slate-200"
                >
                  {showQRInVault ? '✕ QR' : '📱 QR'}
                </button>
              )}
              <button
                onClick={() => setShowMedicalVault(false)}
                className="w-9 h-9 flex items-center justify-center bg-white hover:bg-slate-50 rounded-xl text-slate-600 text-xl transition-colors flex-shrink-0 border border-slate-200"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 bg-slate-50">

          {/* ─── HOME: event grid + folder grid ─────────────────────────── */}
          {!inVault && !inEventList && (
            <div className="p-4 space-y-5">

              {/* Eventos do app */}
              {recentEvents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1">Eventos registrados</p>
                  <div className="space-y-1">
                    {recentEvents.map((ev, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-3 py-2.5 shadow-sm">
                        <span className="text-xl flex-shrink-0">{ev.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900 truncate">{ev.label}</p>
                          {ev.sub && <p className="text-[11px] text-slate-400 truncate">{ev.sub}</p>}
                        </div>
                        <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap">{fmtEventDate(ev.date)}</span>
                      </div>
                    ))}
                  </div>
                  {allEvents.length > 8 && (
                    <button
                      onClick={() => setOpenedCategory('eventos')}
                      className="w-full text-center text-[12px] font-semibold text-blue-600 hover:text-blue-800 py-1 transition-colors"
                    >
                      Ver todos os {allEvents.length} eventos →
                    </button>
                  )}
                </div>
              )}

              {/* Divisor */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 mb-2">Documentos guardados</p>

                {/* Ver todos */}
                <button
                  type="button"
                  onClick={() => setOpenedCategory('all')}
                  className="w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all text-left shadow-sm"
                >
                  <span className="text-2xl">🗂️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-[15px]">Todos os documentos</p>
                    <p className="text-xs text-slate-500">Ver e gerenciar tudo de uma vez</p>
                  </div>
                  <span className="text-slate-300 text-sm">›</span>
                </button>

                {/* Folder grid */}
                <div className="grid grid-cols-2 gap-3">
                  {DOC_FOLDERS.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setOpenedCategory(folder.id)}
                      className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all text-left active:scale-[0.97] hover:shadow-md ${folder.colorBg} ${folder.colorBorder}`}
                    >
                      <span className="text-3xl">{folder.icon}</span>
                      <p className="font-bold text-slate-900 text-[14px] leading-tight">{folder.label}</p>
                      <span className="absolute top-3 right-3 text-slate-300 text-xs">›</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── EVENT LIST FULL ─────────────────────────────────────────── */}
          {inEventList && (
            <div className="p-4 space-y-1">
              {allEvents.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-10">Nenhum evento registrado ainda.</p>
              )}
              {allEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-3 py-2.5 shadow-sm">
                  <span className="text-xl flex-shrink-0">{ev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 truncate">{ev.label}</p>
                    {ev.sub && <p className="text-[11px] text-slate-400 truncate">{ev.sub}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap">{fmtEventDate(ev.date)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ─── VAULT ───────────────────────────────────────────────────── */}
          {inVault && (
            <div className="px-4 py-4 sm:p-6">
              {showQRInVault && (
                <div className="mb-6">
                  <PetShareExportPanel
                    pet={currentPet as unknown as PetHealthProfile}
                    vaccines={[]}
                    petEvents={[]}
                    documents={[]}
                  />
                </div>
              )}
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
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              if (inVault || inEventList) {
                setOpenedCategory(null);
              } else {
                refreshDocuments();
                setShowMedicalVault(false);
              }
            }}
            className="px-4 py-2 bg-[#0056D2] text-white rounded-lg font-medium hover:bg-[#0047ad] transition-colors text-sm"
          >
            {(inVault || inEventList) ? '← Voltar' : '✓ Fechar'}
          </button>
          <div className="text-xs text-gray-500 ml-auto">Arquivos privados e protegidos</div>
        </div>

      </div>
    </div>
    </ModalPortal>
  );
}
