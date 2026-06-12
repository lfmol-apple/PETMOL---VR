'use client';

import { useCallback } from 'react';
import type { HomeSurfaceResolution } from '@/features/interactions/homeModalRouting';

interface UseHomeSurfaceActionsInput {
  setShowVaccineSheet: (value: boolean) => void;
  setShowQuickAddVaccine: (value: boolean) => void;
  setShowVermifugoSheet: (value: boolean) => void;
  setShowAntipulgasSheet: (value: boolean) => void;
  setShowColeiraSheet: (value: boolean) => void;
  setShowMedicalVault: (value: boolean) => void;
  setShowBanhoTosaSheet: (value: boolean) => void;
  setShowMedicationSheet: (value: boolean) => void;
  setShowFoodSheet: (value: boolean) => void;
  setShowHealthModal: (value: boolean) => void;
  setShowHealthOptionsModal: (value: boolean) => void;
  setEditPetInitialSection: (value: 'food') => void;
  setShowEditModal: (value: boolean) => void;
  setHealthModalMode: (value: 'health' | 'grooming' | 'food' | 'full') => void;
  setHealthActiveTab: (value: 'vaccines' | 'parasites' | 'medication' | 'eventos') => void;
}

export function useHomeSurfaceActions({
  setShowVaccineSheet,
  setShowQuickAddVaccine,
  setShowVermifugoSheet,
  setShowAntipulgasSheet,
  setShowColeiraSheet,
  setShowMedicalVault,
  setShowBanhoTosaSheet,
  setShowMedicationSheet,
  setShowFoodSheet,
  setShowHealthModal,
  setShowHealthOptionsModal,
  setEditPetInitialSection,
  setShowEditModal,
  setHealthModalMode,
  setHealthActiveTab,
}: UseHomeSurfaceActionsInput) {
  const openVaccines = useCallback(() => {
    setShowVaccineSheet(true);
  }, [setShowVaccineSheet]);

  const openVermifugo = useCallback(() => {
    setShowVermifugoSheet(true);
  }, [setShowVermifugoSheet]);

  const openAntipulgas = useCallback(() => {
    setShowAntipulgasSheet(true);
  }, [setShowAntipulgasSheet]);

  const openColeira = useCallback(() => {
    setShowColeiraSheet(true);
  }, [setShowColeiraSheet]);

  const openDocuments = useCallback(() => {
    setShowMedicalVault(true);
  }, [setShowMedicalVault]);

  const openGrooming = useCallback(() => {
    setShowBanhoTosaSheet(true);
  }, [setShowBanhoTosaSheet]);

  const openMedication = useCallback(() => {
    setShowMedicationSheet(true);
  }, [setShowMedicationSheet]);

  const openFood = useCallback(() => {
    setShowFoodSheet(true);
  }, [setShowFoodSheet]);

  const openEvents = useCallback(() => {
    setHealthActiveTab('eventos');
    setHealthModalMode('full');
    setShowHealthModal(true);
  }, [setHealthActiveTab, setHealthModalMode, setShowHealthModal]);

  const applyHomeSurfaceResolution = useCallback((resolution: HomeSurfaceResolution) => {
    if (resolution.kind === 'health-modal') {
      setHealthModalMode(resolution.healthModalMode);
      if (resolution.healthActiveTab) setHealthActiveTab(resolution.healthActiveTab);
      setShowHealthModal(true);
      return;
    }

    if (resolution.kind === 'health-options') {
      setShowHealthOptionsModal(true);
      return;
    }

    if (resolution.kind === 'sheet') {
      if (resolution.sheet === 'grooming') {
        setShowBanhoTosaSheet(true);
      } else if (resolution.sheet === 'food') {
        setShowFoodSheet(true);
      } else if (resolution.sheet === 'vaccines') {
        setShowVaccineSheet(true);
      } else if (resolution.sheet === 'vaccines_quick') {
        setShowQuickAddVaccine(true);
      } else if (resolution.sheet === 'vermifugo') {
        setShowVermifugoSheet(true);
      } else if (resolution.sheet === 'antipulgas') {
        setShowAntipulgasSheet(true);
      } else if (resolution.sheet === 'coleira') {
        setShowColeiraSheet(true);
      } else if (resolution.sheet === 'medication') {
        setShowMedicationSheet(true);
      }
      return;
    }

    if (resolution.kind === 'edit-pet') {
      setEditPetInitialSection(resolution.initialSection);
      setShowEditModal(true);
    }

    if (resolution.kind === 'documents') {
      setShowMedicalVault(true);
    }
  }, [
    setEditPetInitialSection,
    setHealthActiveTab,
    setHealthModalMode,
    setShowAntipulgasSheet,
    setShowBanhoTosaSheet,
    setShowColeiraSheet,
    setShowEditModal,
    setShowFoodSheet,
    setShowHealthModal,
    setShowHealthOptionsModal,
    setShowMedicalVault,
    setShowMedicationSheet,
    setShowQuickAddVaccine,
    setShowVaccineSheet,
    setShowVermifugoSheet,
  ]);

  const openHealth = useCallback(() => {
    setShowHealthOptionsModal(true);
  }, [setShowHealthOptionsModal]);

  return {
    applyHomeSurfaceResolution,
    openVaccines,
    openVermifugo,
    openAntipulgas,
    openColeira,
    openDocuments,
    openGrooming,
    openMedication,
    openFood,
    openEvents,
    openHealth,
  };
}
