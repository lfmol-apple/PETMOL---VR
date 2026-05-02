'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetWithHealth } from '@/features/pets/types';
import { trackV1Metric } from '@/lib/v1Metrics';
import { showAppToast, showBlockingNotice } from './userPromptChannel';

type HistoryTab = 'resumo' | 'detalhado';

interface UseHomeHistoryDocumentUploadInput {
  currentPet: PetWithHealth | null;
  showDocUploadInHistorico: boolean;
  setShowDocUploadInHistorico: (value: boolean) => void;
  setHistoricoTab: (tab: HistoryTab) => void;
  setVetHistoryDocs: Dispatch<SetStateAction<VetHistoryDocument[]>>;
}

export function useHomeHistoryDocumentUpload({
  currentPet,
  showDocUploadInHistorico,
  setShowDocUploadInHistorico,
  setHistoricoTab,
  setVetHistoryDocs,
}: UseHomeHistoryDocumentUploadInput) {
  const [inlineDocUploading, setInlineDocUploading] = useState(false);
  const [inlineDocPendingFiles, setInlineDocPendingFiles] = useState<File[] | null>(null);
  const [inlineDocTitle, setInlineDocTitle] = useState('');
  const [inlineDocDate, setInlineDocDate] = useState('');
  const [inlineDocLocation, setInlineDocLocation] = useState('');
  const [inlineDocCategory, setInlineDocCategory] = useState('other');

  const resetUploadState = useCallback(() => {
    setInlineDocUploading(false);
    setInlineDocPendingFiles(null);
    setInlineDocTitle('');
    setInlineDocDate('');
    setInlineDocLocation('');
    setInlineDocCategory('other');
  }, []);

  useEffect(() => {
    if (!showDocUploadInHistorico) {
      resetUploadState();
    }
  }, [resetUploadState, showDocUploadInHistorico]);

  const closeUploadStep1 = useCallback(() => {
    setShowDocUploadInHistorico(false);
  }, [setShowDocUploadInHistorico]);

  const onFilePicked = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    setInlineDocTitle((prev) => prev || selectedFiles[0].name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
    setInlineDocPendingFiles(selectedFiles);
  }, []);

  const closeUploadDetails = useCallback(() => {
    setShowDocUploadInHistorico(false);
  }, [setShowDocUploadInHistorico]);

  const uploadDocuments = useCallback(async () => {
    if (!currentPet || !inlineDocPendingFiles || inlineDocPendingFiles.length === 0 || inlineDocUploading) {
      return;
    }

    const token = getToken();
    if (!token) return;

    setInlineDocUploading(true);
    try {
      const form = new FormData();
      inlineDocPendingFiles.forEach((file) => form.append('files', file));
      form.append('create_timeline_event', 'true');
      form.append('category', inlineDocCategory);
      if (inlineDocTitle.trim()) form.append('title', inlineDocTitle.trim());
      if (inlineDocDate) form.append('document_date', inlineDocDate);
      if (inlineDocLocation.trim()) form.append('establishment_name', inlineDocLocation.trim());

      const response = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        showBlockingNotice(error.detail || 'Erro ao enviar arquivo');
        return;
      }

      trackV1Metric('document_uploaded', {
        pet_id: currentPet.pet_id,
        category: inlineDocCategory,
        file_count: inlineDocPendingFiles.length,
      });

      fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((result) => result.json())
        .then((data) => {
          if (Array.isArray(data)) setVetHistoryDocs(data);
        })
        .catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));

      setShowDocUploadInHistorico(false);
      setHistoricoTab('detalhado');
    } catch {
      showBlockingNotice('Erro ao enviar arquivo');
    } finally {
      setInlineDocUploading(false);
    }
  }, [
    currentPet,
    inlineDocCategory,
    inlineDocDate,
    inlineDocLocation,
    inlineDocPendingFiles,
    inlineDocTitle,
    inlineDocUploading,
    setHistoricoTab,
    setShowDocUploadInHistorico,
    setVetHistoryDocs,
  ]);

  return {
    inlineDocUploading,
    inlineDocPendingFiles,
    inlineDocTitle,
    inlineDocDate,
    inlineDocLocation,
    inlineDocCategory,
    setInlineDocTitle,
    setInlineDocDate,
    setInlineDocLocation,
    setInlineDocCategory,
    closeUploadStep1,
    onFilePicked,
    closeUploadDetails,
    uploadDocuments,
  };
}
