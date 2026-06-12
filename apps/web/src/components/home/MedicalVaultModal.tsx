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

export function MedicalVaultModal({
  currentPet,
  setShowMedicalVault,
  setVetHistoryDocs,
}: MedicalVaultModalProps) {
  const [showQRInVault, setShowQRInVault] = useState(false);

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

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-50/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/70 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="bg-slate-100 text-slate-900 px-4 py-3 sm:p-5 flex-shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📂</span>
              <div>
                <h2 className="text-lg sm:text-2xl font-bold leading-tight">Documentos — {currentPet.pet_name}</h2>
                <p className="text-slate-500 text-xs hidden sm:block">Arquivos privados e protegidos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQRInVault((prev) => !prev)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border border-slate-200"
              >
                {showQRInVault ? '✕ QR' : '📱 QR'}
              </button>
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

        <div className="px-4 py-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
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

          <PetDocumentVault petId={currentPet.pet_id} onDocsChanged={refreshDocuments} />
        </div>

        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              refreshDocuments();
              setShowMedicalVault(false);
            }}
            className="px-4 py-2 bg-[#0056D2] text-white rounded-lg font-medium hover:bg-[#0047ad] transition-colors text-sm"
          >
            ✓ Fechar
          </button>
          <div className="text-xs text-gray-500 ml-auto">Arquivos privados e protegidos</div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
