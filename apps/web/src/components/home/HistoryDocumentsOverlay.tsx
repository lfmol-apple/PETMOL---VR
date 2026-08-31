'use client';

import type { Dispatch, SetStateAction } from 'react';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { HistoryDocumentFolderModal } from '@/components/home/HistoryDocumentFolderModal';
import { useHomeHistoryDocumentBrowser } from '@/features/interactions/useHomeHistoryDocumentBrowser';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetWithHealth } from '@/features/pets/types';

// Somente leitura do acervo legado: visualização e exclusão de documentos
// que já estão no banco. O PETMOL não recebe mais documentos novos — não há
// mais modal de upload aqui (ver pets/document_router.py no backend).
interface HistoryDocumentsOverlayProps {
  currentPet: PetWithHealth | null;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
  docFolderModal: DocFolderModalState;
  onCloseDocFolder: () => void;
  onRemoveDocFromFolder: (docId: string) => void;
}

export function HistoryDocumentsOverlay({
  currentPet,
  setVetHistoryDocs,
  docFolderModal,
  onCloseDocFolder,
  onRemoveDocFromFolder,
}: HistoryDocumentsOverlayProps) {
  const {
    previewDocInHistory,
    previewDocSiblings,
    previewDocSiblingIdx,
    closePreview,
    goToSibling,
    openViewer,
    deleteDocument,
    deleteAllDocumentsInFolder,
  } = useHomeHistoryDocumentBrowser({
    currentPet,
    docFolderModal,
    setVetHistoryDocs,
    onCloseDocFolder,
    onRemoveDocFromFolder,
  });

  return (
    <>
      {docFolderModal && (
        <HistoryDocumentFolderModal
          petId={currentPet?.pet_id || null}
          docFolderModal={docFolderModal}
          onClose={onCloseDocFolder}
          onDeleteAll={deleteAllDocumentsInFolder}
          onOpenViewer={openViewer}
          onDeleteDocument={deleteDocument}
        />
      )}

      {previewDocInHistory && (
        <DocumentPreviewModal
          doc={previewDocInHistory}
          siblings={previewDocSiblings}
          siblingIdx={previewDocSiblingIdx}
          onClose={closePreview}
          onNavigate={goToSibling}
        />
      )}
    </>
  );
}
