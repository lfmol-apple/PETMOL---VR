'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { requestUserConfirmation, showBlockingNotice } from './userPromptChannel';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetWithHealth } from '@/features/pets/types';
import type { DocPreviewItem } from '@/components/DocumentPreviewModal';

interface UseHomeHistoryDocumentBrowserInput {
  currentPet: PetWithHealth | null;
  docFolderModal: DocFolderModalState;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
  onCloseDocFolder: () => void;
  onRemoveDocFromFolder: (docId: string) => void;
}

export function useHomeHistoryDocumentBrowser({
  currentPet,
  docFolderModal,
  setVetHistoryDocs,
  onCloseDocFolder,
  onRemoveDocFromFolder,
}: UseHomeHistoryDocumentBrowserInput) {
  const [previewDocInHistory, setPreviewDocInHistory] = useState<DocPreviewItem | null>(null);
  const [previewDocSiblings, setPreviewDocSiblings] = useState<DocPreviewItem[]>([]);
  const [previewDocSiblingIdx, setPreviewDocSiblingIdx] = useState(0);

  const goToSibling = useCallback((delta: -1 | 1) => {
    setPreviewDocSiblingIdx((currentIdx) => {
      const nextIdx = currentIdx + delta;
      if (nextIdx < 0 || nextIdx >= previewDocSiblings.length) return currentIdx;
      setPreviewDocInHistory((prev) => {
        if (!prev) return prev;
        const sibling = previewDocSiblings[nextIdx];
        return sibling || prev;
      });
      return nextIdx;
    });
  }, [previewDocSiblings]);

  const closePreview = useCallback(() => {
    setPreviewDocInHistory(null);
  }, []);

  const openViewer = useCallback((doc: VetHistoryDocument) => {
    if (!docFolderModal || !doc.id || !doc.mime_type) return;

    const viewableDocs = docFolderModal.docs.filter((item) => item.storage_key && item.id && item.mime_type);
    const siblings = viewableDocs.map((item) => ({
      docId: item.id!,
      title: item.title || 'Documento',
      subtitle: docFolderModal.title,
      icon: docFolderModal.icon,
      date: item.document_date || item.created_at?.split('T')[0],
      location: item.establishment_name || null,
      mimeType: item.mime_type!,
      petId: currentPet?.pet_id || '',
      storageKey: item.storage_key,
    }));

    const siblingIdx = siblings.findIndex((item) => item.docId === doc.id);
    setPreviewDocSiblings(siblings);
    setPreviewDocSiblingIdx(siblingIdx >= 0 ? siblingIdx : 0);
    setPreviewDocInHistory({
      docId: doc.id,
      title: doc.title || 'Documento',
      subtitle: docFolderModal.title,
      icon: docFolderModal.icon,
      date: doc.document_date || doc.created_at?.split('T')[0],
      location: doc.establishment_name || null,
      mimeType: doc.mime_type,
      petId: currentPet?.pet_id || '',
      storageKey: doc.storage_key,
    });
    onCloseDocFolder();
  }, [currentPet?.pet_id, docFolderModal, onCloseDocFolder]);

  const deleteDocument = useCallback(async (docId: string, docTitle: string) => {
    const accepted = await requestUserConfirmation(`Excluir "${docTitle || 'este documento'}"?\n\nEsta ação não pode ser desfeita.`, {
      title: 'Excluir documento',
      tone: 'danger',
      confirmLabel: 'Excluir documento',
    });
    if (!accepted) return;
    const authToken = getToken();
    if (!authToken || !currentPet?.pet_id) return;

    const response = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok || response.status === 204) {
      setVetHistoryDocs((prev) => prev.filter((doc) => doc.id !== docId));
      onRemoveDocFromFolder(docId);
      return;
    }

    showBlockingNotice('Erro ao excluir documento. Tente novamente.');
  }, [currentPet?.pet_id, onRemoveDocFromFolder, setVetHistoryDocs]);

  const deleteAllDocumentsInFolder = useCallback(async () => {
    if (!docFolderModal || !currentPet?.pet_id) return;

    const count = docFolderModal.docs.length;
    const accepted = await requestUserConfirmation(`Excluir todos os ${count} arquivo(s) de "${docFolderModal.title}"?\n\nEsta ação não pode ser desfeita.`, {
      title: 'Excluir documentos da pasta',
      tone: 'danger',
      confirmLabel: 'Excluir arquivos',
    });
    if (!accepted) return;

    const authToken = getToken();
    if (!authToken) return;

    const ids = docFolderModal.docs.map((doc) => doc.id);
    const response = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents/bulk`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (response.ok) {
      setVetHistoryDocs((prev) => prev.filter((doc) => !ids.includes(doc.id)));
      onCloseDocFolder();
      return;
    }

    showBlockingNotice('Erro ao excluir documentos. Tente novamente.');
  }, [currentPet?.pet_id, docFolderModal, onCloseDocFolder, setVetHistoryDocs]);

  return {
    previewDocInHistory,
    previewDocSiblings,
    previewDocSiblingIdx,
    closePreview,
    goToSibling,
    openViewer,
    deleteDocument,
    deleteAllDocumentsInFolder,
  };
}