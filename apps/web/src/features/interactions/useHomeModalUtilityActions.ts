'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import { trackV1Metric } from '@/lib/v1Metrics';
import { navigateToPetHealthTab } from '@/features/interactions/homeHealthNavigation';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { EventFormState } from '@/hooks/usePetEventManagement';

interface UseHomeModalUtilityActionsInput {
  router: AppRouterInstance;
  selectedPetId: string | null;
  showPetSelector: boolean;
  setShowArrivalAlert: (value: boolean) => void;
  setShowAttendanceOptions: (value: boolean) => void;
  setShowHealthOptionsModal: (value: boolean) => void;
  setShowServiceTypeModal: (value: boolean) => void;
  setShowEventTypeModal: (value: boolean) => void;
  setShowVetOptionsModal: (value: boolean) => void;
  setShowAddPetModal: (value: boolean) => void;
  setShowEditModal: (value: boolean) => void;
  setShowPetSelector: (value: boolean) => void;
  setShowTopAttentionModal: (value: boolean) => void;
  setShowHealthModal: (value: boolean) => void;
  setShowVaccineForm: (value: boolean) => void;
  setShowVaccineSheet: (value: boolean) => void;
  setHealthModalMode: (value: 'full' | 'health' | 'grooming' | 'food') => void;
  setHealthActiveTab: (value: string) => void;
  setEventTypeLocked: (value: boolean) => void;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  setEditPetInitialSection: (value: undefined) => void;
  setPets: (value: PetHealthProfile[]) => void;
  setSelectedPetId: (value: string) => void;
  setPhotoTimestamps: Dispatch<SetStateAction<Record<string, number>>>;
}

export function useHomeModalUtilityActions({
  router,
  selectedPetId,
  showPetSelector,
  setShowArrivalAlert,
  setShowAttendanceOptions,
  setShowHealthOptionsModal,
  setShowServiceTypeModal,
  setShowEventTypeModal,
  setShowVetOptionsModal,
  setShowAddPetModal,
  setShowEditModal,
  setShowPetSelector,
  setShowTopAttentionModal,
  setShowHealthModal,
  setShowVaccineForm,
  setShowVaccineSheet,
  setHealthModalMode,
  setHealthActiveTab,
  setEventTypeLocked,
  setEventFormData,
  setEditPetInitialSection,
  setPets,
  setSelectedPetId,
  setPhotoTimestamps,
}: UseHomeModalUtilityActionsInput) {
  const openAddPetModal = useCallback(() => {
    setShowAddPetModal(true);
  }, [setShowAddPetModal]);

  const openEditPetModal = useCallback(() => {
    setShowEditModal(true);
  }, [setShowEditModal]);

  const togglePetSelector = useCallback(() => {
    setShowPetSelector(!showPetSelector);
  }, [setShowPetSelector, showPetSelector]);

  const closePetSelector = useCallback(() => {
    setShowPetSelector(false);
  }, [setShowPetSelector]);

  const openTopAttentionModal = useCallback(() => {
    setShowTopAttentionModal(true);
  }, [setShowTopAttentionModal]);

  const closeTopAttentionModal = useCallback(() => {
    setShowTopAttentionModal(false);
  }, [setShowTopAttentionModal]);

  const closeArrivalFlow = useCallback(() => {
    setShowArrivalAlert(false);
    setShowAttendanceOptions(false);
  }, [setShowArrivalAlert, setShowAttendanceOptions]);

  const openArrivalAttendanceOptions = useCallback(() => {
    setShowAttendanceOptions(true);
  }, [setShowAttendanceOptions]);

  const closeArrivalAttendanceOptions = useCallback(() => {
    setShowAttendanceOptions(false);
  }, [setShowAttendanceOptions]);

  const openArrivalVaccineForm = useCallback(() => {
    setShowArrivalAlert(false);
    setShowAttendanceOptions(false);
    setShowVaccineForm(true);
  }, [setShowArrivalAlert, setShowAttendanceOptions, setShowVaccineForm]);

  const navigateToSaudeFromArrival = useCallback((tab: string) => {
    setShowArrivalAlert(false);
    setShowAttendanceOptions(false);
    navigateToPetHealthTab(router, selectedPetId, tab);
  }, [router, selectedPetId, setShowArrivalAlert, setShowAttendanceOptions]);

  const navigateToSaudeFromHealthOptions = useCallback((tab: string) => {
    setShowHealthOptionsModal(false);
    navigateToPetHealthTab(router, selectedPetId, tab);
  }, [router, selectedPetId, setShowHealthOptionsModal]);

  const closeServiceTypeModal = useCallback(() => {
    setShowServiceTypeModal(false);
  }, [setShowServiceTypeModal]);

  const closeHealthOptionsModal = useCallback(() => {
    setShowHealthOptionsModal(false);
  }, [setShowHealthOptionsModal]);

  const openEventTypeModal = useCallback(() => {
    setShowEventTypeModal(true);
  }, [setShowEventTypeModal]);

  const closeEventTypeModal = useCallback(() => {
    setShowEventTypeModal(false);
  }, [setShowEventTypeModal]);

  const closeVetOptionsModal = useCallback(() => {
    setShowVetOptionsModal(false);
  }, [setShowVetOptionsModal]);

  const openHealthTab = useCallback((tab: string) => {
    setHealthModalMode('health');
    setHealthActiveTab(tab);
    setShowHealthModal(true);
  }, [setHealthActiveTab, setHealthModalMode, setShowHealthModal]);

  const selectHealthTab = useCallback((tab: string) => {
    setHealthActiveTab(tab);
  }, [setHealthActiveTab]);

  const closeHealthModal = useCallback(() => {
    setShowHealthModal(false);
    setHealthModalMode('full');
    setEventTypeLocked(false);
  }, [setEventTypeLocked, setHealthModalMode, setShowHealthModal]);

  const backFromHealthModal = useCallback((wasLocked: boolean) => {
    setShowHealthModal(false);
    setEventTypeLocked(false);
    setTimeout(() => {
      if (wasLocked) {
        setShowEventTypeModal(true);
      } else {
        setShowHealthOptionsModal(true);
      }
    }, 100);
  }, [setEventTypeLocked, setShowEventTypeModal, setShowHealthModal, setShowHealthOptionsModal]);

  const openVaccineCenterFromHealthModal = useCallback(() => {
    setShowHealthModal(false);
    setShowVaccineSheet(true);
  }, [setShowHealthModal, setShowVaccineSheet]);

  const startEventRegistration = useCallback((type: string) => {
    setEventTypeLocked(true);
    setEventFormData((prev) => ({ ...prev, type, title: '', result: '', severity: 'moderada' }));
    setHealthModalMode('health');
    setHealthActiveTab('eventos');
    setShowHealthModal(true);
  }, [setEventFormData, setEventTypeLocked, setHealthActiveTab, setHealthModalMode, setShowHealthModal]);

  const closeAddPetModal = useCallback(() => {
    setShowAddPetModal(false);
  }, [setShowAddPetModal]);

  const handleAddPetComplete = useCallback(async () => {
    setShowAddPetModal(false);

    const savedToken = getToken();
    if (!savedToken) return;

    const response = await fetch(`${API_BASE_URL}/pets`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    });
    if (!response.ok) return;

    const backendPets = await response.json();
    console.log('[AddPet] Pets recarregados do backend:', backendPets);
    const convertedPets = normalizeBackendPetProfiles(backendPets);
    setPets(convertedPets);
    if (convertedPets.length > 0) {
      const newPetId = convertedPets[convertedPets.length - 1].pet_id;
      // Primeiro pet da conta — marco de ativação do funil de onboarding.
      if (convertedPets.length === 1) {
        trackV1Metric('first_pet_created', { pet_id: newPetId });
      }
      setSelectedPetId(newPetId);
      console.log('[AddPet] Forcando reload da foto do pet:', newPetId);
      setPhotoTimestamps((prev) => ({
        ...prev,
        [newPetId]: Date.now(),
      }));
    }
  }, [setPets, setPhotoTimestamps, setSelectedPetId, setShowAddPetModal]);

  const closeEditPetModal = useCallback(() => {
    setShowEditModal(false);
    setEditPetInitialSection(undefined);
  }, [setEditPetInitialSection, setShowEditModal]);

  return {
    openAddPetModal,
    openEditPetModal,
    togglePetSelector,
    closePetSelector,
    openTopAttentionModal,
    closeTopAttentionModal,
    closeArrivalFlow,
    openArrivalAttendanceOptions,
    closeArrivalAttendanceOptions,
    openArrivalVaccineForm,
    navigateToSaudeFromArrival,
    navigateToSaudeFromHealthOptions,
    closeServiceTypeModal,
    closeHealthOptionsModal,
    openEventTypeModal,
    closeEventTypeModal,
    closeVetOptionsModal,
    openHealthTab,
    selectHealthTab,
    closeHealthModal,
    backFromHealthModal,
    openVaccineCenterFromHealthModal,
    startEventRegistration,
    closeAddPetModal,
    handleAddPetComplete,
    closeEditPetModal,
  };
}