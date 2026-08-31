'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { navigateToPetHealthTab } from '@/features/interactions/homeHealthNavigation';
import type { DocFolderModalState } from '@/lib/types/homeForms';

interface UseHomeHistoryActionsInput {
  router: AppRouterInstance;
  selectedPetId: string | null;
  setShowVetHistoryModal: (value: boolean) => void;
  setShowHealthOptionsModal: (value: boolean) => void;
  setShowHealthModal: (value: boolean) => void;
  setHealthModalMode: (value: 'full' | 'health' | 'grooming' | 'food') => void;
  setHealthActiveTab: (value: string) => void;
  setDocFolderModal: Dispatch<SetStateAction<DocFolderModalState>>;
}

export function useHomeHistoryActions({
  router,
  selectedPetId,
  setShowVetHistoryModal,
  setShowHealthOptionsModal,
  setShowHealthModal,
  setHealthModalMode,
  setHealthActiveTab,
  setDocFolderModal,
}: UseHomeHistoryActionsInput) {
  const closeVetHistoryModal = useCallback(() => {
    setShowVetHistoryModal(false);
  }, [setShowVetHistoryModal]);

  const openHealthOptionsFromVetHistory = useCallback(() => {
    setShowVetHistoryModal(false);
    setShowHealthOptionsModal(true);
  }, [setShowHealthOptionsModal, setShowVetHistoryModal]);

  const openGroomingFromVetHistory = useCallback(() => {
    setShowVetHistoryModal(false);
    setHealthModalMode('grooming');
    setHealthActiveTab('grooming');
    setShowHealthModal(true);
  }, [setHealthActiveTab, setHealthModalMode, setShowHealthModal, setShowVetHistoryModal]);

  const openFoodFromVetHistory = useCallback(() => {
    setShowVetHistoryModal(false);
    setHealthModalMode('food');
    setHealthActiveTab('food');
    setShowHealthModal(true);
  }, [setHealthActiveTab, setHealthModalMode, setShowHealthModal, setShowVetHistoryModal]);

  const openHealthTabFromVetHistory = useCallback((tab: string) => {
    setShowVetHistoryModal(false);
    setShowHealthModal(true);
    setHealthActiveTab(tab);
  }, [setHealthActiveTab, setShowHealthModal, setShowVetHistoryModal]);

  const openVetHistoryDocumentFolder = useCallback((folder: DocFolderModalState) => {
    setDocFolderModal(folder);
  }, [setDocFolderModal]);

  const closeVetHistoryDocumentFolder = useCallback(() => {
    setDocFolderModal(null);
  }, [setDocFolderModal]);

  const removeDocumentFromVetHistoryFolder = useCallback((docId: string) => {
    setDocFolderModal((prev) => {
      if (!prev) return null;
      const remainingDocs = prev.docs.filter((doc) => doc.id !== docId);
      if (remainingDocs.length === 0) {
        return null;
      }
      return {
        ...prev,
        docs: remainingDocs,
      };
    });
  }, [setDocFolderModal]);

  const navigateToSaudeFromVetHistory = useCallback((tab: string) => {
    setShowVetHistoryModal(false);
    navigateToPetHealthTab(router, selectedPetId, tab);
  }, [router, selectedPetId, setShowVetHistoryModal]);

  return {
    closeVetHistoryModal,
    openHealthOptionsFromVetHistory,
    openGroomingFromVetHistory,
    openFoodFromVetHistory,
    openHealthTabFromVetHistory,
    openVetHistoryDocumentFolder,
    closeVetHistoryDocumentFolder,
    removeDocumentFromVetHistoryFolder,
    navigateToSaudeFromVetHistory,
  };
}