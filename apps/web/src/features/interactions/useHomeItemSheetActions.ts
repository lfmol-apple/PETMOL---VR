'use client';

import { useCallback } from 'react';
import type { VaccineRecord } from '@/lib/petHealth';
import type { VaccineFormData } from '@/lib/types/homeForms';

interface UseHomeItemSheetActionsInput {
  selectedPetId: string | null;
  setShowVermifugoSheet: (value: boolean) => void;
  setShowAntipulgasSheet: (value: boolean) => void;
  setShowColeiraSheet: (value: boolean) => void;
  setShowBanhoTosaSheet: (value: boolean) => void;
  setShowFoodSheet: (value: boolean) => void;
  setShowVaccineSheet: (value: boolean) => void;
  setShowAIUpload: (value: boolean) => void;
  setShowQuickAddVaccine: (value: boolean) => void;
  setShowVaccineForm: (value: boolean) => void;
  setShowMedicationSheet: (value: boolean) => void;
  setVaccineFormData: (value: VaccineFormData) => void;
  fetchFeedingPlan: (petId: string) => Promise<void> | void;
  loadVaccines: () => Promise<void> | void;
  fetchPetEvents: (petId: string) => Promise<void> | void;
  handleEditVaccine: (vaccine: VaccineRecord) => void;
  handleDeleteAllVaccines: () => void;
}

export function useHomeItemSheetActions({
  selectedPetId,
  setShowVermifugoSheet,
  setShowAntipulgasSheet,
  setShowColeiraSheet,
  setShowBanhoTosaSheet,
  setShowFoodSheet,
  setShowVaccineSheet,
  setShowAIUpload,
  setShowQuickAddVaccine,
  setShowVaccineForm,
  setShowMedicationSheet,
  setVaccineFormData,
  fetchFeedingPlan,
  loadVaccines,
  fetchPetEvents,
  handleEditVaccine,
  handleDeleteAllVaccines,
}: UseHomeItemSheetActionsInput) {
  const closeVermifugoSheet = useCallback(() => {
    setShowVermifugoSheet(false);
  }, [setShowVermifugoSheet]);

  const closeAntipulgasSheet = useCallback(() => {
    setShowAntipulgasSheet(false);
  }, [setShowAntipulgasSheet]);

  const closeColeiraSheet = useCallback(() => {
    setShowColeiraSheet(false);
  }, [setShowColeiraSheet]);

  const closeGroomingSheet = useCallback(() => {
    setShowBanhoTosaSheet(false);
  }, [setShowBanhoTosaSheet]);

  const closeFoodSheet = useCallback(() => {
    setShowFoodSheet(false);
  }, [setShowFoodSheet]);

  const handleFoodSaved = useCallback(() => {
    if (selectedPetId) {
      fetchFeedingPlan(selectedPetId);
    }
  }, [fetchFeedingPlan, selectedPetId]);

  const closeVaccineSheet = useCallback(() => {
    setShowVaccineSheet(false);
  }, [setShowVaccineSheet]);

  const handleVaccineQuickAdd = useCallback(() => {
    setShowVaccineSheet(false);
    setShowQuickAddVaccine(true);
  }, [setShowQuickAddVaccine, setShowVaccineSheet]);

  const openVaccineCardReader = useCallback(() => {
    setShowAIUpload(true);
  }, [setShowAIUpload]);

  const closeVaccineCardReader = useCallback(() => {
    setShowAIUpload(false);
  }, [setShowAIUpload]);

  const openVaccineFormFromCardReader = useCallback(() => {
    setShowAIUpload(false);
    setShowVaccineForm(true);
  }, [setShowAIUpload, setShowVaccineForm]);

  const closeQuickAddVaccine = useCallback(() => {
    setShowQuickAddVaccine(false);
  }, [setShowQuickAddVaccine]);

  const openFullVaccineFormFromQuickAdd = useCallback(() => {
    setShowQuickAddVaccine(false);
    setShowVaccineForm(true);
  }, [setShowQuickAddVaccine, setShowVaccineForm]);

  const handleVaccineFullForm = useCallback((prefill: Partial<VaccineFormData>) => {
    setShowVaccineSheet(false);
    setVaccineFormData({
      vaccine_type: 'multiple',
      vaccine_name: '',
      date_administered: '',
      next_dose_date: '',
      frequency_days: 365,
      veterinarian: '',
      clinic_name: '',
      notes: '',
      record_type: 'confirmed_application',
      ...prefill,
    });
    setShowVaccineForm(true);
  }, [setShowVaccineForm, setShowVaccineSheet, setVaccineFormData]);

  const handleVaccineEdit = useCallback((vaccine: VaccineRecord) => {
    setShowVaccineSheet(false);
    handleEditVaccine(vaccine);
  }, [handleEditVaccine, setShowVaccineSheet]);

  const refreshVaccines = useCallback(() => {
    loadVaccines();
  }, [loadVaccines]);

  const deleteAllVaccines = useCallback(() => {
    handleDeleteAllVaccines();
  }, [handleDeleteAllVaccines]);

  const closeMedicationSheet = useCallback(() => {
    setShowMedicationSheet(false);
  }, [setShowMedicationSheet]);

  const refreshMedicationHistory = useCallback(async () => {
    if (selectedPetId) {
      await fetchPetEvents(selectedPetId);
    }
  }, [fetchPetEvents, selectedPetId]);

  return {
    closeVermifugoSheet,
    closeAntipulgasSheet,
    closeColeiraSheet,
    closeGroomingSheet,
    closeFoodSheet,
    handleFoodSaved,
    closeVaccineSheet,
    handleVaccineQuickAdd,
    openVaccineCardReader,
    closeVaccineCardReader,
    openVaccineFormFromCardReader,
    closeQuickAddVaccine,
    openFullVaccineFormFromQuickAdd,
    handleVaccineFullForm,
    handleVaccineEdit,
    refreshVaccines,
    deleteAllVaccines,
    closeMedicationSheet,
    refreshMedicationHistory,
  };
}
