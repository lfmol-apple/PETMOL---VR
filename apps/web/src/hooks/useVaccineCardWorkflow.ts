'use client';

import { useCallback, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import {
  analyzeVaccineCardFiles,
  normalizeAnalyzedVaccineRecords,
  type VaccineCardOcrRecord,
  type VaccineCardOcrResponse,
} from '@/lib/vaccineOcr';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';

type VaccineCardAnalysis = (VaccineCardOcrResponse & { processed_images: number }) | null;

interface UseVaccineCardWorkflowParams {
  petName?: string;
  ocrErrorMessage: string;
  ocrRetryMessage: string;
}

interface UseVaccineCardWorkflowResult {
  showImportCard: boolean;
  setShowImportCard: Dispatch<SetStateAction<boolean>>;
  importingCard: boolean;
  setImportingCard: Dispatch<SetStateAction<boolean>>;
  pendingCardFiles: File[];
  setPendingCardFiles: Dispatch<SetStateAction<File[]>>;
  aiImageLimit: number;
  setAiImageLimit: Dispatch<SetStateAction<number>>;
  cardAnalysis: VaccineCardAnalysis;
  setCardAnalysis: Dispatch<SetStateAction<VaccineCardAnalysis>>;
  cardFiles: File[] | null;
  reviewRegistros: VaccineCardOcrRecord[];
  setReviewRegistros: Dispatch<SetStateAction<VaccineCardOcrRecord[]>>;
  reviewExpectedCount: number;
  setReviewExpectedCount: Dispatch<SetStateAction<number>>;
  reviewConfirmed: boolean;
  setReviewConfirmed: Dispatch<SetStateAction<boolean>>;
  reviewLearnEnabled: boolean;
  setReviewLearnEnabled: Dispatch<SetStateAction<boolean>>;
  rawRegistros: VaccineCardOcrRecord[];
  setRawRegistros: Dispatch<SetStateAction<VaccineCardOcrRecord[]>>;
  closeCardAnalysis: () => void;
  updateReviewRegistro: (index: number, patch: Partial<VaccineCardOcrRecord>) => void;
  removeReviewRegistro: (index: number) => void;
  addReviewRegistro: () => void;
  handleFilesSelectedAppend: (event: ChangeEvent<HTMLInputElement>) => void;
  handleProcessCards: (selected: File[]) => Promise<void>;
}

export function useVaccineCardWorkflow({
  petName,
  ocrErrorMessage,
  ocrRetryMessage,
}: UseVaccineCardWorkflowParams): UseVaccineCardWorkflowResult {
  const [showImportCard, setShowImportCard] = useState(false);
  const [importingCard, setImportingCard] = useState(false);
  const [pendingCardFiles, setPendingCardFiles] = useState<File[]>([]);
  const [cardAnalysis, setCardAnalysis] = useState<VaccineCardAnalysis>(null);
  const [cardFiles, setCardFiles] = useState<File[] | null>(null);
  const [aiImageLimit, setAiImageLimit] = useState(5);
  const [reviewRegistros, setReviewRegistros] = useState<VaccineCardOcrRecord[]>([]);
  const [reviewExpectedCount, setReviewExpectedCount] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewLearnEnabled, setReviewLearnEnabled] = useState(true);
  const [rawRegistros, setRawRegistros] = useState<VaccineCardOcrRecord[]>([]);

  const closeCardAnalysis = useCallback(() => {
    setCardAnalysis(null);
    setReviewRegistros([]);
    setRawRegistros([]);
    setReviewExpectedCount(0);
    setReviewConfirmed(false);
    setReviewLearnEnabled(true);
  }, []);

  const updateReviewRegistro = useCallback((index: number, patch: Partial<VaccineCardOcrRecord>) => {
    setReviewRegistros((prev) => prev.map((registro, currentIndex) => (currentIndex === index ? { ...registro, ...patch } : registro)));
  }, []);

  const removeReviewRegistro = useCallback((index: number) => {
    setReviewRegistros((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const addReviewRegistro = useCallback(() => {
    setReviewRegistros((prev) => [
      ...prev,
      {
        tipo_vacina: 'Vacina',
        nome_comercial: null,
        data_aplicacao: null,
        data_revacina: null,
        veterinario_responsavel: null,
      },
    ]);
  }, []);

  const handleFilesSelectedAppend = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const incoming = all.filter((file) =>
      file.type.startsWith('image/') ||
      file.type === '' ||
      file.name.match(/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)$/i)
    );
    const rejected = all.length - incoming.length;
    event.target.value = '';
    if (rejected > 0) {
      showBlockingNotice(`${rejected} arquivo(s) ignorado(s): apenas imagens são aceitas.`, {
        title: 'Arquivos não suportados',
        tone: 'warning',
      });
    }
    if (incoming.length === 0) return;
    setPendingCardFiles((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length > aiImageLimit) {
        showBlockingNotice(`Limite de ${aiImageLimit} fotos atingido. As primeiras ${aiImageLimit} serão usadas.`, {
          title: 'Limite de imagens',
          tone: 'warning',
        });
        return merged.slice(0, aiImageLimit);
      }
      return merged;
    });
  }, [aiImageLimit]);

  const handleProcessCards = useCallback(async (selected: File[]) => {
    if (selected.length === 0) return;
    setCardFiles(selected);
    setPendingCardFiles([]);
    setImportingCard(true);
    setCardAnalysis(null);
    setReviewConfirmed(false);

    try {
      const analysisResult = await analyzeVaccineCardFiles({
        files: selected,
        hint: `Carteira de vacinação do pet ${petName || 'pet'}`,
        maxAiImages: aiImageLimit,
      });

      setCardAnalysis({ processed_images: selected.length, ...analysisResult });
      const uniqueRegistros = normalizeAnalyzedVaccineRecords(analysisResult.registros || []);
      console.log(`📊 Deduplicação: ${(analysisResult.registros || []).length} → ${uniqueRegistros.length} registros únicos`);
      setRawRegistros(JSON.parse(JSON.stringify(uniqueRegistros)));
      setReviewRegistros(uniqueRegistros);
      setReviewExpectedCount(uniqueRegistros.length);
      setShowImportCard(false);
    } catch (error) {
      console.error('Erro na análise do cartão:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const hasHeic = selected.some((file) =>
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif')
      );
      const heicHint = hasHeic
        ? '\n\n⚠️ Foram detectadas fotos HEIC (formato iPhone). Tente enviar como JPG/PNG ou use a câmera diretamente pelo navegador.'
        : '';
      showBlockingNotice(`${ocrErrorMessage}\n\n${errorMessage}\n\n${ocrRetryMessage}${heicHint}`, {
        title: 'Não foi possível analisar o cartão',
        tone: 'danger',
      });
    } finally {
      setImportingCard(false);
    }
  }, [aiImageLimit, ocrErrorMessage, ocrRetryMessage, petName]);

  return {
    showImportCard,
    setShowImportCard,
    importingCard,
    setImportingCard,
    pendingCardFiles,
    setPendingCardFiles,
    aiImageLimit,
    setAiImageLimit,
    cardAnalysis,
    setCardAnalysis,
    cardFiles,
    reviewRegistros,
    setReviewRegistros,
    reviewExpectedCount,
    setReviewExpectedCount,
    reviewConfirmed,
    setReviewConfirmed,
    reviewLearnEnabled,
    setReviewLearnEnabled,
    rawRegistros,
    setRawRegistros,
    closeCardAnalysis,
    updateReviewRegistro,
    removeReviewRegistro,
    addReviewRegistro,
    handleFilesSelectedAppend,
    handleProcessCards,
  };
}