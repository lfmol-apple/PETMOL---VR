'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { PetShareExportPanel } from '@/components/PetShareExportPanel';
import { PetDocumentVault } from '@/components/PetDocumentVault';
import { API_BASE_URL } from '@/lib/api';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import { ModalPortal } from '@/components/ModalPortal';

type VaultPet = Pick<PetHealthProfile, 'pet_id' | 'pet_name'>;

interface MedicalVaultModalProps {
  currentPet: VaultPet | null | undefined;
  setShowMedicalVault: (value: boolean) => void;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
}

const DOC_FOLDERS: { id: string; icon: string; label: string; colorBg: string; colorBorder: string; colorCount: string }[] = [
  { id: 'exam',         icon: '🔬', label: 'Exames',    colorBg: 'bg-blue-50',   colorBorder: 'border-blue-200',   colorCount: 'bg-blue-100 text-blue-700'    },
  { id: 'vaccine',      icon: '💉', label: 'Vacinas',   colorBg: 'bg-green-50',  colorBorder: 'border-green-200',  colorCount: 'bg-green-100 text-green-700'  },
  { id: 'prescription', icon: '📋', label: 'Receitas',  colorBg: 'bg-purple-50', colorBorder: 'border-purple-200', colorCount: 'bg-purple-100 text-purple-700' },
  { id: 'report',       icon: '📄', label: 'Laudos',    colorBg: 'bg-indigo-50', colorBorder: 'border-indigo-200', colorCount: 'bg-indigo-100 text-indigo-700' },
  { id: 'photo',        icon: '📸', label: 'Fotos',     colorBg: 'bg-pink-50',   colorBorder: 'border-pink-200',   colorCount: 'bg-pink-100 text-pink-700'    },
  { id: 'other',        icon: '📎', label: 'Outros',    colorBg: 'bg-gray-50',   colorBorder: 'border-gray-200',   colorCount: 'bg-gray-100 text-gray-600'    },
];

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
}: MedicalVaultModalProps) {
  const [showQRInVault, setShowQRInVault] = useState(false);
  // null = folder grid; 'all' or category id = vault view
  const [openedCategory, setOpenedCategory] = useState<string | null>(null);

  if (!currentPet) return null;

  const refreshDocuments = () => {
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setVetHistoryDocs(Array.isArray(data) ? data : []))
      .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
  };

  const inVault = openedCategory !== null;
  const selectedFolder = DOC_FOLDERS.find((f) => f.id === openedCategory);

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-50/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/70 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-slate-100 text-slate-900 px-4 py-3 sm:p-5 flex-shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {inVault && (
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
              <span className="text-2xl flex-shrink-0">{inVault ? (selectedFolder?.icon ?? '📂') : '📂'}</span>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-2xl font-bold leading-tight truncate">
                  {inVault
                    ? (selectedFolder ? selectedFolder.label : 'Todos os documentos')
                    : `Documentos — ${currentPet.pet_name}`}
                </h2>
                <p className="text-slate-500 text-xs hidden sm:block">Arquivos privados e protegidos</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {inVault && (
                <button
                  onClick={() => setShowQRInVault((prev) => !prev)}
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
          {/* Folder grid */}
          {!inVault && (
            <div className="p-4 space-y-3">
              {/* Ver todos */}
              <button
                type="button"
                onClick={() => setOpenedCategory('all')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all text-left shadow-sm"
              >
                <span className="text-2xl">🗂️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-[15px]">Todos os documentos</p>
                  <p className="text-xs text-slate-500">Ver e gerenciar tudo de uma vez</p>
                </div>
                <span className="text-slate-300 text-sm">›</span>
              </button>

              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 pt-1">Por categoria</p>

              <div className="grid grid-cols-2 gap-3">
                {DOC_FOLDERS.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setOpenedCategory(folder.id)}
                    className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all text-left active:scale-[0.97] hover:shadow-md ${folder.colorBg} ${folder.colorBorder}`}
                  >
                    <span className="text-3xl">{folder.icon}</span>
                    <div className="w-full">
                      <p className="font-bold text-slate-900 text-[14px] leading-tight">{folder.label}</p>
                    </div>
                    <span className="absolute top-3 right-3 text-slate-300 text-xs">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vault view */}
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
                initialCategory={openedCategory === 'all' ? 'all' : openedCategory}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              if (inVault) {
                setOpenedCategory(null);
              } else {
                refreshDocuments();
                setShowMedicalVault(false);
              }
            }}
            className="px-4 py-2 bg-[#0056D2] text-white rounded-lg font-medium hover:bg-[#0047ad] transition-colors text-sm"
          >
            {inVault ? '← Pastas' : '✓ Fechar'}
          </button>
          <div className="text-xs text-gray-500 ml-auto">Arquivos privados e protegidos</div>
        </div>

      </div>
    </div>
    </ModalPortal>
  );
}
