'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { VetHistoryDocument } from '@/lib/types/homeForms';
import type { PetWithHealth } from '@/features/pets/types';
import { trackV1Metric } from '@/lib/v1Metrics';
import { showAppToast, showBlockingNotice } from './userPromptChannel';

const MAX_PX = 1600;
const JPEG_QUALITY = 0.82;

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

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
      const compressed = await Promise.all(inlineDocPendingFiles.map(compressImageFile));
      const form = new FormData();
      compressed.forEach((file) => form.append('files', file));
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
