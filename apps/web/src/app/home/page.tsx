'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/I18nContext';

import { EditPetModal } from '@/components/EditPetModal';
import { AddPetModal } from '../../components/AddPetModal';
import { VaccineCardUpload } from '@/components/VaccineCardUpload';
import { HealthModal } from '@/components/home/HealthModal';
import { VaccineGuide } from '@/components/home/VaccineGuide';
import { VaccineWorkflowModals } from '@/components/home/VaccineWorkflowModals';
import { FeedbackModal } from '@/components/home/FeedbackModal';
import { QuickAddVaccineModal } from '@/components/home/QuickAddVaccineModal';
import { VetHistoryModal } from '@/components/home/VetHistoryModal';
import { HistoryDocumentsOverlay } from '@/components/home/HistoryDocumentsOverlay';
import { MedicalVaultModal } from '@/components/home/MedicalVaultModal';
import { HomeNavigationModals } from '@/components/home/HomeNavigationModals';
import { HomePetHeader } from '@/components/home/HomePetHeader';
import { HomeEmergencySheet } from '@/components/home/HomeEmergencySheet';
import { PetTabs } from '@/components/PetTabs';
import { PushActionSheet, type ActionSheetType } from '@/components/PushActionSheet';
import { HealthQuickActionSheet, type QuickActionContext } from '@/components/home/HealthQuickActionSheet';

import { HomePetDashboard } from '@/components/home/HomePetDashboard';
import { OverdueAlertsGrid } from '@/components/home/OverdueAlertsGrid';
import { ParasiteItemSheet } from '@/components/home/ParasiteItemSheet';
import { VaccineItemSheet } from '@/components/home/VaccineItemSheet';
import { MedicationItemSheet } from '@/components/home/MedicationItemSheet';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import { GroomingItemSheet } from '@/components/home/GroomingItemSheet';
import { useMultipetInteractions } from '@/features/interactions/useMultipetInteractions';
import type { PetInteractionItem } from '@/features/interactions/types';
import { openHomeContextualCommerce, resolvePushActionSheetCommerceIntent } from '@/features/commerce/homeContextualCommerce';
// resolveAlertAction / navigateToPetHealthTab removidos — handleTopAttentionSelect abre sheets diretamente
import { useHomeItemSheetActions } from '@/features/interactions/useHomeItemSheetActions';
import { useHomeHistoryActions } from '@/features/interactions/useHomeHistoryActions';
import { resolveHomeDeepLinkDestination, resolveScannedProductDestination, resolveTopAttentionDestination, type HomeSurfaceResolution } from '@/features/interactions/homeModalRouting';
import { useHomeModalUtilityActions } from '@/features/interactions/useHomeModalUtilityActions';
import { useHomeSurfaceActions } from '@/features/interactions/useHomeSurfaceActions';
import { useHomeInteractionCenter } from '@/features/interactions/useHomeInteractionCenter';
import { requestUserConfirmation, showAppToast, showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { trackV1Metric } from '@/lib/v1Metrics';
import { getPetCareCollections } from '@/features/pets/healthCollections';
import { computeCareBreakdown } from '@/features/care/computeCareBreakdown';
import { usePetEventManagement } from '@/hooks/usePetEventManagement';
import { useVaccineCardWorkflow } from '@/hooks/useVaccineCardWorkflow';
import { useParasiteManagement } from '@/hooks/useParasiteManagement';
import { usePetBootstrap } from '@/hooks/usePetBootstrap';
import { useVaccineManagement } from '@/hooks/useVaccineManagement';
import { useGroomingManagement } from '@/hooks/useGroomingManagement';
import { useFoodPlanSync } from '@/hooks/useFoodPlanSync';
import { useQuickMark } from '@/hooks/useQuickMark';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { vaccineInfo, commonVaccines } from '@/data/vaccineInfo';

import { hasCompletedOnboarding } from '@/lib/ownerProfile';
import { API_BACKEND_BASE, API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { useAuth } from '@/contexts/AuthContext';
import { petMolAPI } from '@/lib/api-client';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import {
  mapNomeComercialToTipo,
} from '@/lib/vaccineOcr';

import {
  type GroomingRecord,
  type ParasiteControl,
  type ParasiteControlType,
} from '@/lib/types/home';
import type {
  DocFolderModalState,
  ParasiteFormData,
  VetHistoryDocument,
} from '@/lib/types/homeForms';
import { 
  type PetHealthProfile,
  type VaccineRecord,
  type VaccineType
} from '@/lib/petHealth';
import type { ScannedProduct } from '@/lib/productScanner';

// Helper para converter caminho de foto em URL com cache busting
const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || API_BASE_URL;
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];
const isOwnHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return OWN_PHOTO_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};

const resolvePhotosBase = (): string => {
  const configured = String(PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const getPhotoUrl = (photoPath: string | undefined | null, petId?: string, photoVersions?: Record<string, string | number>): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  // URLs http externas: proxy para evitar CORS em dev
  if (photoPath.startsWith('http')) {
    if (isOwnHost(photoPath)) return photoPath; // nosso domínio — sem proxy
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }
  // Caminho relativo — normaliza formatos: pets/*, uploads/*, /uploads/*
  const photosBase = resolvePhotosBase();
  const version = petId && photoVersions?.[petId] ? `?v=${encodeURIComponent(String(photoVersions[petId]))}` : '';
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}${version}`;
};

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [forceCheckin, setForceCheckin] = useState(false);
  // Ref que sempre aponta para a função de refresh mais recente (evita closure stale no event listener)
  const refreshAllRef = useRef<() => void>(() => {});

  // Check-up inicial banner
  const [checkupBanner, setCheckupBanner] = useState<{ petName: string; pendingCount: number } | null>(null);
  // Grade de alertas em atraso (expande o banner quando há múltiplos alertas)
  const [showOverdueGrid, setShowOverdueGrid] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('petmol_checkup_dismissed')) return;
    const raw = localStorage.getItem('petmol_checkup_v1');
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Record<string, string>;
      const pending = ['vaccines', 'vermifugo', 'antipulgas', 'food'].filter((k) => s[k] !== 'done' && s[k] !== 'skipped' && s[k] !== 'none').length;
      if (pending > 0) setCheckupBanner({ petName: s.petName || 'seu pet', pendingCount: pending });
    } catch {}
  }, []);

  // Pull-to-refresh
  const pullStartYRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t, locale } = useI18n();
  const { tutor, isLoading } = useAuth();

  // Ler ?checkin=1 da URL (vindo de notificação push — app estava fechado)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkin') === '1') setForceCheckin(true);
  }, []);

  // Bootstrap de pets e tutor — gerenciado por usePetBootstrap
  const {
    isChecking,
    pets, setPets,
    selectedPetId, setSelectedPetId,
    tutorName, setTutorName,
    loggedUserId, setLoggedUserId,
    familyOwnerNames,
    tutorCheckinDay, setTutorCheckinDay,
    tutorCheckinHour, setTutorCheckinHour,
    tutorCheckinMinute, setTutorCheckinMinute,
    photoTimestamps, setPhotoTimestamps,
  } = usePetBootstrap();
  const photoVersions = useMemo(
    () => Object.fromEntries(pets.map((pet) => [pet.pet_id, pet.updated_at || photoTimestamps[pet.pet_id]])),
    [pets, photoTimestamps],
  );
  const [homePossiblyStale, setHomePossiblyStale] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editPetInitialSection, setEditPetInitialSection] = useState<'food' | 'grooming' | undefined>(undefined);
  const [pushActionSheet, setPushActionSheet] = useState<{ type: ActionSheetType; petId: string; itemName?: string; eventId?: string } | null>(null);
  const [healthQuickAction, setHealthQuickAction] = useState<QuickActionContext | null>(null);
  const pushActionSheetWasOpenRef = useRef(false);
  const editModalWasOpenRef = useRef(false);
  const vaccineSheetWasOpenRef = useRef(false);
  const handledPushFoodActionRef = useRef<string | null>(null);
  const [showAddPetModal, setShowAddPetModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showEmergencySheet, setShowEmergencySheet] = useState(false);
  const [healthModalMode, setHealthModalMode] = useState<'full' | 'health' | 'grooming' | 'food'>('full');
  const [healthActiveTab, setHealthActiveTab] = useState('vaccines');
  // Plano alimentar — API-first, sincronizado com localStorage
  const { feedingPlan, setFeedingPlan, fetchFeedingPlan } = useFoodPlanSync({ selectedPetId });
  // Quick-mark medicação inline
  const {
    quickMarkId, setQuickMarkId,
    quickMarkDate, setQuickMarkDate,
    quickMarkNotes, setQuickMarkNotes,
    quickMarkSaving, setQuickMarkSaving,
    quickMarkToast, setQuickMarkToast,
  } = useQuickMark();
  const [showVetHistoryModal, setShowVetHistoryModal] = useState(false);
  const [historicoTab, setHistoricoTab] = useState<'resumo' | 'detalhado' | 'documentos'>('detalhado');
  const [showDocUploadInHistorico, setShowDocUploadInHistorico] = useState(false);
  const [vetHistoryDocs, setVetHistoryDocs] = useState<VetHistoryDocument[]>([]);
  const [docFolderModal, setDocFolderModal] = useState<DocFolderModalState>(null);
  const [showVetOptionsModal, setShowVetOptionsModal] = useState(false);
  const [showServiceTypeModal, setShowServiceTypeModal] = useState(false);
  const [showHealthOptionsModal, setShowHealthOptionsModal] = useState(false);
  const [showEventTypeModal, setShowEventTypeModal] = useState(false);
  const [eventTypeLocked, setEventTypeLocked] = useState(false);
  const [showPetSelector, setShowPetSelector] = useState(false);

  const [showTopAttentionModal, setShowTopAttentionModal] = useState(false);
  const [showCheckinPicker, setShowCheckinPicker] = useState(false);
  const [checkinDayDraft, setCheckinDayDraft] = useState<number>(5);
  const [checkinPickerSaving, setCheckinPickerSaving] = useState(false);

  // Fecha modais transitórios antes de abrir outro via push/deep link.
  // Impede sobreposição de overlay quando uma notificação chega com modal aberto.
  const closeAllTransientModals = useCallback(() => {
    setShowHealthModal(false);
    setShowEmergencySheet(false);
    setShowVetHistoryModal(false);
    setShowVetOptionsModal(false);
    setShowServiceTypeModal(false);
    setShowHealthOptionsModal(false);
    setShowEventTypeModal(false);
    setPushActionSheet(null);
    setHealthQuickAction(null);
  }, []);
  const {
    petEvents,
    eventsLoading,
    eventFormData,
    setEventFormData,
    eventSaving,
    setEventSaving,
    createdEventId,
    setCreatedEventId,
    showAttachDoc,
    setShowAttachDoc,
    attachDocFiles,
    setAttachDocFiles,
    editingEventId,
    setEditingEventId,
    fetchPetEvents,
    handleDeleteEvent,
    openEditEvent,
  } = usePetEventManagement({
    selectedPetId,
    healthActiveTab,
    setHealthActiveTab,
    setShowVetHistoryModal,
    setShowHealthModal,
    setEventTypeLocked,
  });
  const {
    showImportCard,
    setShowImportCard,
    importingCard,
    setImportingCard,
    pendingCardFiles,
    setPendingCardFiles,
    aiImageLimit,
    setAiImageLimit,
    cardAnalysis,
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
  } = useVaccineCardWorkflow({
    petName: pets.find((pet) => pet.pet_id === selectedPetId)?.pet_name || pets[0]?.pet_name,
    ocrErrorMessage: t('feedback.ocr_error'),
    ocrRetryMessage: t('feedback.try_again_clearer'),
  });

  // Estado para vermífugos/antiparasitários — gerenciado por useParasiteManagement
  const {
    parasiteControls, setParasiteControls,
    showParasiteForm, setShowParasiteForm,
    editingParasite, setEditingParasite,
    parasiteFormData, setParasiteFormData,
    loadParasiteControls,
    handleSaveParasite, handleEditParasite, handleDeleteParasite,
    resetParasiteForm,
  } = useParasiteManagement({ selectedPetId, pets, setPets, fetchPetEvents, t });

  // Vacinas — gerenciado por useVaccineManagement
  const {
    vaccines, setVaccines,
    showVaccineForm, setShowVaccineForm,
    vaccineFormSaving, setVaccineFormSaving,
    importVaccineLoading, setImportVaccineLoading,
    showQuickAddVaccine, setShowQuickAddVaccine,
    showAllVaccinesGuide, setShowAllVaccinesGuide,
    showAIUpload, setShowAIUpload,
    editingVaccine, setEditingVaccine,
    showMedicalVault, setShowMedicalVault,
    vaccineFiles, setVaccineFiles,
    showFeedbackModal, setShowFeedbackModal,
    feedbackVaccine, setFeedbackVaccine,
    feedbackFormData, setFeedbackFormData,
    vaccineFormData, setVaccineFormData,
    quickAddData,
    loadVaccines,
    resetVaccineForm,
    calculateNextDose,
    getRecentVets,
    handleSaveVaccine,
    handleEditVaccine,
    handleDeleteVaccine,
    handleDeleteAllVaccines,
    handleReportVaccineIssue,
    handleSubmitFeedback,
    handleQuickAddVaccine,
    handleImportAnalyzedVaccines,
  } = useVaccineManagement({
    selectedPetId,
    pets,
    setPets,
    fetchPetEvents,
    t,
    locale,
    reviewRegistros,
    reviewConfirmed,
    reviewExpectedCount,
    rawRegistros,
    reviewLearnEnabled,
    cardAnalysis,
    closeCardAnalysis,
  });

  // Banho e Tosa — gerenciado por useGroomingManagement
  const {
    groomingRecords, setGroomingRecords,
    editingGrooming, setEditingGrooming,
    showEditGroomingModal, setShowEditGroomingModal,
    groomingDueAlerts, setGroomingDueAlerts,
    groomingFormData, setGroomingFormData,
    placeSuggestions, setPlaceSuggestions,
    showPlaceSuggestions, setShowPlaceSuggestions,
    searchingPlaces,
    placeAbortController,
    loadGroomingRecords,
    searchPlaces,
    selectPlace,
    handleSaveGrooming,
    handleEditGrooming,
    handleDeleteGrooming,
    handleCancelEditGrooming,
  } = useGroomingManagement({ selectedPetId, pets, setPets, fetchPetEvents, t });

  // ── Sheets modernos ──────────────────────────────────────────────────────
  const [showVermifugoSheet, setShowVermifugoSheet] = useState(false);
  const [showAntipulgasSheet, setShowAntipulgasSheet] = useState(false);
  const [showColeiraSheet, setShowColeiraSheet] = useState(false);
  const [showBanhoTosaSheet, setShowBanhoTosaSheet] = useState(false);
  const [showVaccineSheet, setShowVaccineSheet] = useState(false);
  const [showMedicationSheet, setShowMedicationSheet] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);
  const [foodSheetInitialMode, setFoodSheetInitialMode] = useState<'view' | 'buy'>('view');
  const [vaccineSheetInitialMode, setVaccineSheetInitialMode] = useState<'view' | 'buy'>('view');
  const [medicationSheetInitialMode, setMedicationSheetInitialMode] = useState<'view' | 'buy'>('view');
  const [parasiteSheetInitialMode, setParasiteSheetInitialMode] = useState<'view' | 'buy'>('view');

  // Estado para simulação de chegada em estabelecimento
  const [showArrivalAlert, setShowArrivalAlert] = useState(false);
  const [arrivalPlace, setArrivalPlace] = useState<{name: string, address: string, phone?: string, rating?: number, reviews?: number} | null>(null);
  const [showAttendanceOptions, setShowAttendanceOptions] = useState(false);
  
  // Helper para criar data local a partir de string YYYY-MM-DD
  // Evita problema de timezone onde new Date('2026-01-27') vira 2026-01-26
  const createLocalDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Helper para pegar o pet atual
  const getCurrentPet = () => pets.find(p => p.pet_id === selectedPetId) || pets[0];

  // Helper para formatar data e hora no estilo iPhone
  const formatDateTimeReminder = (dateStr: string, timeStr?: string) => {
    const date = createLocalDate(dateStr);
    const dateFormatted = date.toLocaleDateString(locale);
    
    if (timeStr) {
      return `${dateFormatted} ${t('common.at')} ${timeStr}`;
    }
    return dateFormatted;
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('petmol_token');
    window.location.href = '/login';
  };

  // Salvar pet editado
  const handleSavePet = async (
    updatedPet: Partial<PetHealthProfile> & {
      pet_id: string;
      name?: string;
      is_neutered?: boolean;
      weight?: number;
      _photoUpdated?: boolean;
      insurance_provider?: string;
      health_data?: Record<string, unknown>;
      primary_vet?: { name: string; clinic: string; phone: string };
    }
  ) => {
    try {
      const savedToken = getToken();
      if (!savedToken) {
        showBlockingNotice('Você precisa estar logado para editar pets');
        return;
      }

      const petId = updatedPet.pet_id; // UUID string, não parseInt
      
      // Preparar health_data com primary_vet
      const healthData = {
        ...(updatedPet.health_data || {}),
        primary_vet: updatedPet.primary_vet || { name: '', clinic: '', phone: '' }
      };
      
      // Salvar APENAS no backend
      const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedToken}`,
        },
        body: JSON.stringify({
          name: updatedPet.pet_name || updatedPet.name,
          species: updatedPet.species,
          breed: updatedPet.breed,
          birth_date: updatedPet.birth_date,
          sex: updatedPet.sex,
          neutered: updatedPet.neutered !== undefined ? updatedPet.neutered : updatedPet.is_neutered,
          weight_value: updatedPet.weight || updatedPet.weight_history?.[0]?.weight,
          health_data: healthData,
          insurance_provider: updatedPet.insurance_provider || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar pet');
      }

      // Recarregar pets do backend
      const petsResponse = await fetch(`${API_BASE_URL}/pets`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (petsResponse.ok) {
        const backendPets = await petsResponse.json();
        const convertedPets = normalizeBackendPetProfiles(backendPets);
        setPets(convertedPets);
        
        // Atualizar timestamp da foto para forçar reload se foto foi atualizada
        if (updatedPet._photoUpdated && updatedPet.pet_id) {
          setPhotoTimestamps(prev => ({
            ...prev,
            [updatedPet.pet_id]: Date.now()
          }));
        }
      }
    } catch (error) {
      console.error('Erro ao salvar pet:', error);
      showBlockingNotice(t('pet.error_save'));
      throw error;
    }
  };

  const handleDeletePet = async (petId: string) => {
    try {
      const savedToken = getToken();
      if (!savedToken) {
        showBlockingNotice('Você precisa estar logado para excluir pets');
        return;
      }

      // Deletar APENAS do banco de dados
      const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar pet');
      }

      // Recarregar pets do banco
      const petsResponse = await fetch(`${API_BASE_URL}/pets`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (petsResponse.ok) {
        const backendPets = await petsResponse.json();
        const convertedPets = normalizeBackendPetProfiles(backendPets);
        
        setPets(convertedPets);
        
        // Selecionar outro pet ou limpar seleção
        if (convertedPets.length > 0) {
          setSelectedPetId(convertedPets[0].pet_id);
        } else {
          setSelectedPetId(null);
        }
      }
      
      setShowEditModal(false);
      showBlockingNotice('✅ Pet excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao deletar pet:', error);
      showBlockingNotice('❌ Erro ao excluir pet. Tente novamente.');
    }
  };




  useEffect(() => {
    if (showHealthModal && selectedPetId) {
      const currentPet = pets.find(p => p.pet_id === selectedPetId);
      const token = getToken();

      if (currentPet) {
        // Só pré-preenche se ainda não há vacinas carregadas (evita sobrescrever com blob legado vazio)
        if (vaccines.length === 0) {
          setVaccines(currentPet.vaccines || []);
        }
        setParasiteControls(currentPet.parasite_controls || []);
        setGroomingRecords(currentPet.grooming_records || []);
        
        // Se tem token, atualizar com dados frescos da API
        if (token) {
          loadVaccines();
          loadParasiteControls(); 
          loadGroomingRecords();
        }
      }
    }
  }, [showHealthModal, selectedPetId]);


  // Mantém refreshAllRef sempre apontando para o closure mais recente (evita closure stale no listener)
  // Roda a cada render → sempre tem acesso à versão atual de pets, selectedPetId, etc.
  useEffect(() => {
    refreshAllRef.current = () => {
      if (!selectedPetId) return;
      fetchFeedingPlan(selectedPetId);
      fetchPetEvents(selectedPetId);
      loadVaccines();
      loadParasiteControls();
      loadGroomingRecords();
    };
  }); // sem array de deps: roda sempre

  const { syncStatus, possiblyStale, setPossiblyStale } = useRealtimeSync({
    enabled: Boolean(selectedPetId),
    debounceMs: 5_000,
    pollingMs: 60_000,
    onSync: () => refreshAllRef.current(),
  });
  useEffect(() => {
    if (syncStatus === 'synced' && !possiblyStale) setHomePossiblyStale(false);
  }, [syncStatus, possiblyStale]);

  useEffect(() => {
    const onFoodPlanUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ petId?: string }>;
      const eventPetId = custom.detail?.petId;
      if (!eventPetId) {
        refreshAllRef.current();
        return;
      }
      void fetchFeedingPlan(eventPetId);
      if (selectedPetId === eventPetId) {
        refreshAllRef.current();
      }
    };
    window.addEventListener('petmol:feeding-plan-updated', onFoodPlanUpdated as EventListener);
    return () => window.removeEventListener('petmol:feeding-plan-updated', onFoodPlanUpdated as EventListener);
  }, [fetchFeedingPlan, selectedPetId]);

  // Carregar documentos ao abrir a aba de eventos (para exibir docs vinculados)
  useEffect(() => {
    if (healthActiveTab === 'eventos' && selectedPetId) {
      const token = getToken();
      if (!token) return;
      fetch(`${API_BASE_URL}/pets/${selectedPetId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then(data => setVetHistoryDocs(Array.isArray(data) ? data : []))
        .catch(() => {
          setPossiblyStale(true);
          setHomePossiblyStale(true);
          showAppToast('Erro ao sincronizar', { tone: 'warning' });
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthActiveTab, selectedPetId]);

  // Carregar vacinas e antiparasitários automaticamente ao selecionar um pet (garante que o estado
  // esteja populado antes de qualquer modal abrir)
  useEffect(() => {
    if (selectedPetId && pets.length > 0) {
      const token = getToken();
      if (token) {
        loadVaccines();
        loadParasiteControls();
        loadGroomingRecords();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPetId, pets.length]);

  // Detectar brilho da foto quando pet muda
  useEffect(() => {
  }, [selectedPetId, pets.length]);


  // Current pet based on selection
  const currentPet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
  const currentPetIndex = useMemo(() => {
    if (pets.length === 0) return -1;
    const idx = pets.findIndex(p => p.pet_id === selectedPetId);
    return idx >= 0 ? idx : 0;
  }, [pets, selectedPetId]);

  const switchPetByOffset = useCallback((offset: number) => {
    if (pets.length < 2) return;
    const safeIdx = currentPetIndex >= 0 ? currentPetIndex : 0;
    const nextIdx = (safeIdx + offset + pets.length) % pets.length;
    const nextPet = pets[nextIdx];
    if (!nextPet) return;
    setSelectedPetId(nextPet.pet_id);
    setShowPetSelector(false);
  }, [pets, currentPetIndex]);

  const petEventsByPet = useMemo(
    () => (selectedPetId ? { [selectedPetId]: petEvents } : {}),
    [selectedPetId, petEvents],
  );

  // ── Eventos canônicos + interações multipet (considera TODOS os pets, não só o selecionado) ──
  const multipetInteractions = useMultipetInteractions(pets, {
    feedingPlanByPet: feedingPlan,
    petEventsByPet,
  });
  const {
    topAttentionAlerts,
    topAttentionPetCount,
    selectedPetActiveAlerts: _selectedPetActiveAlerts,
    selectedPetAllAlerts: _selectedPetAllAlerts,
    selectedPetCardAlerts,
    selectedPetCardColors,
  } = useHomeInteractionCenter(
    multipetInteractions.interactions,
    multipetInteractions.canonicalEvents,
    selectedPetId,
  );

  // Dispatcher frontend e pendencies sem superfície foram desativados.

  const homePreferenceScopeId = useMemo(
    () => String(loggedUserId || tutor?.id || currentPet?.owner_user_id || 'petmol-home'),
    [loggedUserId, tutor?.id, currentPet?.owner_user_id]
  );

  const _selectedPetCareBreakdown = useMemo(
    () => computeCareBreakdown(currentPet, petEvents, vaccines, parasiteControls, groomingRecords, _selectedPetAllAlerts),
    [_selectedPetAllAlerts, currentPet, petEvents, vaccines, parasiteControls, groomingRecords],
  );
  const _selectedPetCareScore = useMemo(() => {
    if (_selectedPetCareBreakdown.totalItems === 0) return 100;
    const proportional = Math.round((_selectedPetCareBreakdown.compliantItems / _selectedPetCareBreakdown.totalItems) * 100);
    return Math.max(15, Math.min(100, proportional));
  }, [_selectedPetCareBreakdown]);
  const _selectedPetNeedsAttention = _selectedPetCareBreakdown.overdueItems > 0;
  const selectedPetPrimaryAlert = useMemo(() => {
    return [..._selectedPetActiveAlerts].sort((a, b) => {
      const priorityDiff = (b.priority || 0) - (a.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;

      const overdueDiff = (b.days_overdue || 0) - (a.days_overdue || 0);
      if (overdueDiff !== 0) return overdueDiff;

      if (a.status === b.status) return 0;
      if (a.status === 'overdue') return -1;
      if (b.status === 'overdue') return 1;
      return 0;
    })[0] ?? null;
  }, [_selectedPetActiveAlerts]);

  const activeMedicationCount = useMemo(() => {
    return petEvents.filter(ev => {
      if ((ev.type !== 'medicacao' && ev.type !== 'medication') || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        if (ex.treatment_days) {
          const applied = Array.isArray(ex.applied_dates) ? ex.applied_dates.length : 0;
          return applied < parseInt(String(ex.treatment_days), 10);
        }
      } catch {}
      return false;
    }).length;
  }, [petEvents]);

  const medicationCardStatus = useMemo(() => {
    const todayStr = localTodayISO();
    const todayRef = new Date(`${todayStr}T00:00:00`);
    const activeMeds = petEvents.filter(ev => {
      if ((ev.type !== 'medicacao' && ev.type !== 'medication') || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        if (ex.treatment_days) {
          const applied = Array.isArray(ex.applied_dates) ? (ex.applied_dates as string[]).length : 0;
          return applied < parseInt(String(ex.treatment_days), 10);
        }
      } catch {}
      return false;
    });
    if (activeMeds.length === 0) return { alert: false as const, color: 'neutral' as const };
    let totalSlots = 0;
    let doneSlots = 0;
    activeMeds.forEach(ev => {
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        const startRaw = String(ev.scheduled_at || '').replace('T', ' ').split(' ')[0];
        const startDate = startRaw ? createLocalDate(startRaw) : null;
        const nextDueRaw = ev.next_due_date ? String(ev.next_due_date).replace('T', ' ').split(' ')[0] : '';
        const nextDueDate = nextDueRaw ? createLocalDate(nextDueRaw) : null;
        const isFutureStart = startDate && !Number.isNaN(startDate.getTime()) && startDate.getTime() > todayRef.getTime();
        const isFutureDue = nextDueDate && !Number.isNaN(nextDueDate.getTime()) && nextDueDate.getTime() > todayRef.getTime();

        if (isFutureStart || isFutureDue) return;

        const times = Array.isArray(ex.reminder_times) && (ex.reminder_times as string[]).length > 0
          ? ex.reminder_times as string[]
          : null;
        if (times) {
          const appliedDatetimes: string[] = Array.isArray(ex.applied_datetimes) ? ex.applied_datetimes as string[] : [];
          totalSlots += times.length;
          doneSlots += times.filter((t: string) => appliedDatetimes.includes(`${todayStr}_${t}`)).length;
        } else {
          const appliedDates: string[] = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
          totalSlots += 1;
          doneSlots += appliedDates.includes(todayStr) ? 1 : 0;
        }
      } catch {}
    });
    if (totalSlots === 0) return { alert: false as const, color: 'ok' as const };
    if (doneSlots === totalSlots) return { alert: false as const, color: 'ok' as const };
    if (doneSlots > 0) return { alert: true as const, color: 'warning' as const };
    return { alert: true as const, color: 'critical' as const };
  }, [petEvents]);

  const {
    applyHomeSurfaceResolution,
    openVaccines: handleOpenVaccines,
    openVermifugo: handleOpenVermifugo,
    openAntipulgas: handleOpenAntipulgas,
    openColeira: handleOpenColeira,
    openDocuments: handleOpenDocuments,
    openGrooming: handleOpenGrooming,
    openMedication: handleOpenMedication,
    openFood: handleOpenFood,
    openEvents: handleOpenEvents,
    openHealth: handleOpenHealth,
  } = useHomeSurfaceActions({
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
  });

  // Targets que abrem o mini sheet de ação rápida em vez do sheet completo
  const QUICK_ACTION_TARGETS = new Set([
    'health/vaccines',
    'health/medication',
    'health/parasites/dewormer',
    'health/parasites/flea_tick',
    'health/parasites/collar',
    'health/parasites',
  ]);

  const handleTopAttentionSelect = useCallback((interaction: PetInteractionItem) => {
    if (interaction.pet_id) setSelectedPetId(interaction.pet_id);
    setShowTopAttentionModal(false);
    if (QUICK_ACTION_TARGETS.has(interaction.action_target)) {
      setHealthQuickAction({
        action_target: interaction.action_target,
        label: interaction.type_label,
        pet_id: interaction.pet_id,
        pet_name: interaction.pet_name,
        status: interaction.status,
        days_overdue: interaction.days_overdue,
      });
      return;
    }
    const destination = resolveTopAttentionDestination(interaction.action_target);
    if (destination) applyHomeSurfaceResolution(destination);
  }, [applyHomeSurfaceResolution, setSelectedPetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectedPetPrimaryAlertOpen = useCallback(() => {
    if (!selectedPetPrimaryAlert) return;
    if (QUICK_ACTION_TARGETS.has(selectedPetPrimaryAlert.action_target)) {
      setHealthQuickAction({
        action_target: selectedPetPrimaryAlert.action_target,
        label: selectedPetPrimaryAlert.type_label,
        pet_id: selectedPetPrimaryAlert.pet_id,
        pet_name: selectedPetPrimaryAlert.pet_name,
        status: selectedPetPrimaryAlert.status,
        days_overdue: selectedPetPrimaryAlert.days_overdue,
      });
      return;
    }
    const destination = resolveTopAttentionDestination(selectedPetPrimaryAlert.action_target);
    if (destination) applyHomeSurfaceResolution(destination);
  }, [applyHomeSurfaceResolution, selectedPetPrimaryAlert]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverdueAlertClick = useCallback((alert: PetInteractionItem) => {
    setShowOverdueGrid(false);
    if (QUICK_ACTION_TARGETS.has(alert.action_target)) {
      setHealthQuickAction({
        action_target: alert.action_target,
        label: alert.type_label,
        pet_id: alert.pet_id,
        pet_name: alert.pet_name,
        status: alert.status,
        days_overdue: alert.days_overdue,
      });
      return;
    }
    const destination = resolveTopAttentionDestination(alert.action_target);
    if (destination) applyHomeSurfaceResolution(destination);
  }, [applyHomeSurfaceResolution]); // eslint-disable-line react-hooks/exhaustive-deps

  // Callback do mini sheet: abre o sheet completo correspondente ao item
  const handleHealthQuickOpenDetails = useCallback(() => {
    if (!healthQuickAction) return;
    const destination = resolveTopAttentionDestination(healthQuickAction.action_target as Parameters<typeof resolveTopAttentionDestination>[0]);
    setHealthQuickAction(null);
    if (destination) applyHomeSurfaceResolution(destination);
  }, [applyHomeSurfaceResolution, healthQuickAction]);

  const {
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
  } = useHomeItemSheetActions({
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
  });

  const {
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
  } = useHomeModalUtilityActions({
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
  });

  const {
    closeVetHistoryModal,
    openHealthOptionsFromVetHistory,
    openGroomingFromVetHistory,
    openFoodFromVetHistory,
    openHealthTabFromVetHistory,
    openVetHistoryDocumentFolder,
    closeVetHistoryDocumentFolder,
    removeDocumentFromVetHistoryFolder,
    navigateToSaudeFromVetHistory,
  } = useHomeHistoryActions({
    router,
    selectedPetId,
    setShowVetHistoryModal,
    setShowDocUploadInHistorico,
    setShowHealthOptionsModal,
    setShowHealthModal,
    setHealthModalMode,
    setHealthActiveTab,
    setDocFolderModal,
  });

  const handlePushActionCommerceOpen = useCallback(() => {
    if (!pushActionSheet) return;
    if (selectedPetId !== pushActionSheet.petId) {
      setSelectedPetId(pushActionSheet.petId);
    }

    const intent = resolvePushActionSheetCommerceIntent({
      type: pushActionSheet.type,
      petId: pushActionSheet.petId,
      itemName: pushActionSheet.itemName,
    });

    setPushActionSheet(null);

    if (!intent) {
      return;
    }

    if (intent.target === 'food') {
      setFoodSheetInitialMode('buy');
    }

    openHomeContextualCommerce(intent, {
      openFoodSheet: handleOpenFood,
      openParasiteSheet: handleOpenVermifugo,
    });
  }, [handleOpenFood, handleOpenVermifugo, pushActionSheet, selectedPetId, setSelectedPetId]);

  const handleGlobalProductScan = useCallback((product: ScannedProduct) => {
    if (!currentPet) return;

    try {
      sessionStorage.setItem('petmol_pending_scanned_product', JSON.stringify({
        petId: currentPet.pet_id,
        product,
      }));
    } catch {}

    if (product.category === 'food') {
      setShowFoodSheet(true);
      return;
    }
    if (product.category === 'medication') {
      setShowMedicationSheet(true);
      return;
    }
    const destination = resolveScannedProductDestination(product.category);
    if (destination) {
      applyHomeSurfaceResolution(destination);
      return;
    }

    showBlockingNotice('Não encontramos os dados. Preencha manualmente.', {
      title: 'Produto identificado parcialmente',
      tone: 'warning',
    });
  }, [applyHomeSurfaceResolution, currentPet]);

  const handleSaveCheckinPreference = useCallback(async () => {
    setCheckinPickerSaving(true);
    try {
      const tok = getToken();
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        credentials: 'include',
        body: JSON.stringify({ monthly_checkin_day: checkinDayDraft }),
      });
      if (res.ok) {
        setTutorCheckinDay(checkinDayDraft);
        setShowCheckinPicker(false);
      }
    } finally {
      setCheckinPickerSaving(false);
    }
  }, [checkinDayDraft]);

  const alertVaccinesValue = selectedPetCardAlerts.vacinas;
  const alertParasitesValue = selectedPetCardAlerts.vermifugo || selectedPetCardAlerts.antipulgas || selectedPetCardAlerts.coleira;
  const alertMedicationValue = medicationCardStatus.alert;

  // Retorno automático ao check-up quando o modal fecha
  useEffect(() => {
    if (pushActionSheet !== null) {
      pushActionSheetWasOpenRef.current = true;
    } else if (pushActionSheetWasOpenRef.current) {
      pushActionSheetWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [pushActionSheet, router]);

  // Retorno automático ao check-up quando toda a jornada de vacina termina
  // (sheet → form → quick-add; só redireciona quando TUDO fecha)
  useEffect(() => {
    if (showVaccineSheet) {
      vaccineSheetWasOpenRef.current = true;
    }

    const allVaccineClosed = !showVaccineSheet && !showVaccineForm && !showQuickAddVaccine;
    if (vaccineSheetWasOpenRef.current && allVaccineClosed) {
      vaccineSheetWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [showVaccineSheet, showVaccineForm, showQuickAddVaccine, router]);

  // Retorno automático ao check-up quando EditPetModal fecha
  useEffect(() => {
    if (showEditModal) {
      editModalWasOpenRef.current = true;
    } else if (editModalWasOpenRef.current) {
      editModalWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [showEditModal, router]);

  const applyFoodPushAction = useCallback(async (petId: string, action: string) => {
    const normalizedAction = action.trim().toLowerCase();
    if (!normalizedAction) return;
    closeAllTransientModals();

    if (normalizedAction === 'buy') {
      trackV1Metric('push_action_buy', { source: 'push_notification', pet_id: petId, action: normalizedAction });
      trackV1Metric('food_buy_clicked', { source: 'push_notification', pet_id: petId });
      return;
    }

    const token = getToken();
    if (!token) {
      showAppToast('Faça login para confirmar a ação da ração.');
      return;
    }

    const today = localTodayISO();
    const addDays = (days: number) => {
      const date = new Date(`${today}T00:00:00`);
      date.setDate(date.getDate() + days);
      return dateToLocalISO(date);
    };

    let endpoint = '';
    let method: 'POST' | 'PATCH' = 'PATCH';
    let payload: Record<string, unknown> = {};
    let successMessage = '';
    let eventName: 'push_action_still_has_food' | 'push_action_finished' | 'push_action_purchase_confirmed';

    if (normalizedAction === 'still_has') {
      endpoint = `${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan/adjust`;
      payload = { action: 'set_end_date', days: 0, target_date: addDays(3), new_end_date: addDays(3) };
      successMessage = '✅ Previsão ajustada';
      eventName = 'push_action_still_has_food';
    } else if (normalizedAction === 'finished') {
      endpoint = `${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan/adjust`;
      payload = { action: 'set_end_date', days: 0, target_date: today, new_end_date: today };
      successMessage = '✅ Ração marcada como finalizada';
      eventName = 'push_action_finished';
    } else if (normalizedAction === 'purchase_confirmed' || normalizedAction === 'comprei') {
      endpoint = `${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan/restock`;
      method = 'POST';
      payload = { refill_date: today };
      successMessage = '✅ Novo ciclo iniciado';
      eventName = 'push_action_purchase_confirmed';
    } else {
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        showAppToast('Não foi possível aplicar esta ação agora.');
        return;
      }

      trackV1Metric(eventName, { source: 'push_notification', pet_id: petId, action: normalizedAction });
      if (normalizedAction === 'still_has') {
        trackV1Metric('food_still_has_food', { source: 'push_notification', pet_id: petId });
      } else if (normalizedAction === 'finished') {
        trackV1Metric('food_finished_early', { source: 'push_notification', pet_id: petId });
      } else {
        trackV1Metric('food_purchase_confirmed', { source: 'push_notification', pet_id: petId });
      }

      await fetchFeedingPlan(petId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('petmol:feeding-plan-updated', { detail: { petId } }));
      }
      showAppToast(successMessage);
    } catch {
      showAppToast('Sem conexão para concluir a ação da notificação.');
    }
  }, [fetchFeedingPlan]);

  // ── Deep link: abre modal via query string ao montar (ex.: push notification) ──
  // URL pattern: /home?modal=vaccines&petId=<id>
  // Suportado: vaccines | parasites | medication | eventos | grooming | health | food
  useEffect(() => {
    if (!pets.length) return; // aguarda os pets carregarem
    const modal = searchParams.get('modal');
    if (!modal) return;
    closeAllTransientModals();

    const requestedPetId = searchParams.get('petId');
    const resolvedPetId = requestedPetId && pets.some((pet) => pet.pet_id === requestedPetId)
      ? requestedPetId
      : selectedPetId && pets.some((pet) => pet.pet_id === selectedPetId)
        ? selectedPetId
        : pets[0]?.pet_id || null;

    if (resolvedPetId && resolvedPetId !== selectedPetId) {
      setSelectedPetId(resolvedPetId);
    }

    const eventId = searchParams.get('eventId') || undefined;
    const itemName = searchParams.get('itemName') || undefined;
    const pushFoodAction = searchParams.get('push_food_action') || searchParams.get('push_action');
    const mode = searchParams.get('mode');
    const wantsBuyMode = searchParams.get('action') === 'buy' || searchParams.get('buy') === '1' || mode === 'buy';
    const forcePushChoice =
      searchParams.get('choice') === '1' ||
      searchParams.get('push_sheet') === '1' ||
      modal === 'push' ||
      modal === 'push-action' ||
      modal === 'push_action';
    const legacyPushType = searchParams.get('type') as ActionSheetType | null;
    const parasiteSubtype = searchParams.get('subtype') || searchParams.get('category') || searchParams.get('type');
    const explicitPushActionType = (() => {
      if (!forcePushChoice) return null;
      if (legacyPushType && ['food', 'medication', 'vaccines', 'parasites', 'grooming'].includes(legacyPushType)) {
        return legacyPushType;
      }
      if (modal === 'food') return 'food';
      if (modal === 'medication') return 'medication';
      if (modal === 'vaccines' || modal === 'vaccine-sheet') return 'vaccines';
      if (modal === 'parasites' || modal === 'vermifugo' || modal === 'antipulgas' || modal === 'coleira') return 'parasites';
      if (modal === 'grooming' || modal === 'banho') return 'grooming';
      return null;
    })();

    if (wantsBuyMode) {
      if (modal === 'food') setFoodSheetInitialMode('buy');
      if (modal === 'vaccines' || modal === 'vaccine-sheet') setVaccineSheetInitialMode('buy');
      if (modal === 'medication') setMedicationSheetInitialMode('buy');
      if (modal === 'parasites' || modal === 'vermifugo' || modal === 'antipulgas' || modal === 'coleira') setParasiteSheetInitialMode('buy');
    }

    const legacyPushDestination = explicitPushActionType
      ? { kind: 'push-action-sheet' as const, actionSheetType: explicitPushActionType }
      : null;
    const destination = legacyPushDestination ?? resolveHomeDeepLinkDestination(modal, searchParams.get('tab'), parasiteSubtype);
    if (destination?.kind === 'push-action-sheet' && resolvedPetId) {
      if (forcePushChoice) {
        setPushActionSheet({
          type: destination.actionSheetType as ActionSheetType,
          petId: resolvedPetId,
          eventId,
          itemName,
        });
      } else {
        if (wantsBuyMode && destination.actionSheetType === 'food') setFoodSheetInitialMode('buy');
        if (wantsBuyMode && destination.actionSheetType === 'vaccines') setVaccineSheetInitialMode('buy');
        if (wantsBuyMode && destination.actionSheetType === 'medication') setMedicationSheetInitialMode('buy');
        if (wantsBuyMode && destination.actionSheetType === 'parasites') setParasiteSheetInitialMode('buy');
        const directDestination: HomeSurfaceResolution =
          destination.actionSheetType === 'food' ? { kind: 'sheet', sheet: 'food' } :
          destination.actionSheetType === 'vaccines' ? { kind: 'sheet', sheet: 'vaccines' } :
          destination.actionSheetType === 'medication' ? { kind: 'sheet', sheet: 'medication' } :
          destination.actionSheetType === 'grooming' ? { kind: 'sheet', sheet: 'grooming' } :
          { kind: 'sheet', sheet: 'vermifugo' };
        applyHomeSurfaceResolution(directDestination);
      }
    } else if (destination) {
      applyHomeSurfaceResolution(destination);
    }

    if (modal === 'food' && pushFoodAction && resolvedPetId) {
      const key = `${resolvedPetId}:${pushFoodAction}`;
      if (handledPushFoodActionRef.current !== key) {
        handledPushFoodActionRef.current = key;
        void applyFoodPushAction(resolvedPetId, pushFoodAction);
      }
    }

    // limpa query string via router para que useSearchParams perceba a mudança
    router.replace('/home', { scroll: false });
  }, [applyFoodPushAction, applyHomeSurfaceResolution, pets, selectedPetId, searchParams, router]);


  // Fetch documents when vet history modal opens
  useEffect(() => {
    if (!showVetHistoryModal || !currentPet) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setVetHistoryDocs(Array.isArray(data) ? data : []))
      .catch(() => {
        setPossiblyStale(true);
        setHomePossiblyStale(true);
        showAppToast('Erro ao sincronizar', { tone: 'warning' });
      });
    // Refrescar vacinas ao abrir o histórico
    loadVaccines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVetHistoryModal, currentPet?.pet_id]);

  useEffect(() => {
    if (showVetHistoryModal) {
      setHistoricoTab('detalhado');
    }
  }, [showVetHistoryModal]);

  if (isLoading || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl sm:text-5xl md:text-6xl mb-4">🐾</div>
          <p className="text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-gray-50"
      onTouchStart={(e) => {
        // Só ativa pull-to-refresh se o scroll já estiver no topo
        if (window.scrollY === 0) {
          pullStartYRef.current = e.touches[0].clientY;
        } else {
          pullStartYRef.current = 0;
        }
      }}
      onTouchMove={(e) => {
        if (!pullStartYRef.current) return;
        const delta = e.touches[0].clientY - pullStartYRef.current;
        if (delta > 0) {
          // Resistência progressiva: fica mais difícil passar de 80px
          setPullY(Math.min(80, delta * 0.45));
        }
      }}
      onTouchEnd={async () => {
        if (pullY >= 60 && !isRefreshing) {
          setIsRefreshing(true);
          setPullY(0);
          pullStartYRef.current = 0;
          try {
            await new Promise<void>((resolve) => {
              refreshAllRef.current();
              setHomePossiblyStale(false);
              setTimeout(resolve, 800);
            });
          } finally {
            setIsRefreshing(false);
          }
        } else {
          setPullY(0);
          pullStartYRef.current = 0;
        }
      }}
    >
      {/* Indicador de pull-to-refresh */}
      <div
        className="flex justify-center items-center overflow-hidden transition-all duration-200"
        style={{ height: isRefreshing ? 44 : pullY > 0 ? pullY : 0 }}
      >
        <div className={`flex items-center gap-2 text-sm text-gray-400 ${isRefreshing ? 'animate-pulse' : ''}`}>
          {isRefreshing ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <span>Atualizando...</span>
            </>
          ) : pullY >= 60 ? (
            <span>↑ Solte para atualizar</span>
          ) : (
            <span>↓ Puxe para atualizar</span>
          )}
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {pets.length > 0 && (
          <div className="mb-3 flex justify-center">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm ${
              syncStatus === 'offline'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : syncStatus === 'reconnecting' || possiblyStale || homePossiblyStale
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                syncStatus === 'offline'
                  ? 'bg-rose-500'
                  : syncStatus === 'reconnecting' || possiblyStale || homePossiblyStale
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`} />
              {syncStatus === 'offline'
                ? 'Sem conexão'
                : syncStatus === 'reconnecting' || possiblyStale || homePossiblyStale
                  ? 'Tentando reconectar'
                  : 'Sincronizado agora'}
            </div>
          </div>
        )}

        {/* Pet Management - if pets exist */}
        {pets.length > 0 ? (
          <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-slate-200 bg-gradient-to-b from-[#F0F4F8] to-[#E2E8F0] p-3 shadow-2xl sm:p-4">
            {(() => {
              const currentPet = pets.find(p => p.pet_id === selectedPetId);
              if (!currentPet) return null;
              
              return (
                <div className="space-y-4">
                  {(() => {
                    const currentPetName = currentPet.pet_name || 'seu pet';
                    const attentionAlerts = _selectedPetActiveAlerts
                      .filter((a) => a.status === 'overdue' || a.status === 'today')
                      .sort((a, b) => ((b.priority || 0) - (a.priority || 0)) || ((b.days_overdue || 0) - (a.days_overdue || 0)));
                    const hasAttention = attentionAlerts.length > 0 && Boolean(selectedPetPrimaryAlert);
                    const hasOverdueAttention = attentionAlerts.some((a) => a.status === 'overdue');
                    const hasMany = attentionAlerts.length > 1;
                    const attentionTone = hasOverdueAttention ? 'overdue' : hasAttention ? 'today' : 'ok';

                    if (showOverdueGrid && hasMany) {
                      return (
                        <OverdueAlertsGrid
                          alerts={attentionAlerts}
                          petName={currentPetName}
                          onAlertClick={handleOverdueAlertClick}
                          onClose={() => setShowOverdueGrid(false)}
                        />
                      );
                    }

                    return (
                      <section
                        className={`rounded-[24px] border px-4 py-3 shadow-lg shadow-slate-900/5 ${
                          attentionTone === 'overdue'
                            ? 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50'
                            : attentionTone === 'today'
                              ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50'
                              : 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${
                              attentionTone === 'overdue'
                                ? 'bg-rose-100 text-rose-800'
                                : attentionTone === 'today'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {hasAttention ? '🧭' : '✓'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-[17px] font-black leading-tight tracking-tight text-slate-900">
                              {hasAttention
                                ? `${currentPetName} tem ${attentionAlerts.length} ${attentionAlerts.length === 1 ? 'cuidado em aberto' : 'cuidados em aberto'}`
                                : `${currentPetName} está em dia`}
                            </h2>
                            <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-600">
                              {hasAttention
                                ? 'Vamos colocar em dia juntos'
                                : 'Veja o que vem pela frente'}
                            </p>
                          </div>
                          {hasAttention && (
                            <button
                              type="button"
                              onClick={hasMany ? () => setShowOverdueGrid(true) : handleSelectedPetPrimaryAlertOpen}
                              className={`flex-shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold transition-transform active:scale-95 ${
                                attentionTone === 'overdue'
                                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              }`}
                            >
                              Ver lista
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })()}

                  <PetTabs
                    pets={pets.map(p => ({
                      id: p.pet_id,
                      name: p.pet_name,
                      photo: p.photo,
                      species: p.species
                    }))}
                    selectedPetId={selectedPetId!}
                    onPetChange={(petId) => setSelectedPetId(String(petId))}
                  >
                    <HomePetHeader
                      currentPet={currentPet}
                      pets={pets}
                      selectedPetId={selectedPetId}
                      setSelectedPetId={setSelectedPetId}
                      photoTimestamps={photoVersions}
                      getPhotoUrl={getPhotoUrl}
                      switchPetByOffset={switchPetByOffset}
                      onOpenAddPetModal={openAddPetModal}
                      onOpenEditPetModal={openEditPetModal}
                      loggedUserId={loggedUserId}
                      familyOwnerNames={familyOwnerNames}
                      showPetSelector={showPetSelector}
                      onTogglePetSelector={togglePetSelector}
                      onClosePetSelector={closePetSelector}
                      topAttentionPetCount={topAttentionPetCount}
                      onOpenTopAttentionModal={openTopAttentionModal}
                      onCloseTopAttentionModal={closeTopAttentionModal}
                      showTopAttentionModal={showTopAttentionModal}
                      topAttentionAlerts={topAttentionAlerts}
                      onAlertSelect={handleTopAttentionSelect}
                      selectedPetNeedsAttention={_selectedPetNeedsAttention}
                      selectedPetCareScore={_selectedPetCareScore}
                    />


                  <HomePetDashboard
                    petEvents={petEvents}
                    vaccines={vaccines}
                    parasiteControls={parasiteControls}
                    groomingRecords={groomingRecords}
                    feedingPlan={feedingPlan}
                    viewerPreferenceId={homePreferenceScopeId}
                    currentPet={currentPet}
                    tutorCheckinDay={tutorCheckinDay}
                    selectedPetId={selectedPetId}
                    quickMarkId={quickMarkId}
                    setQuickMarkId={setQuickMarkId}
                    quickMarkDate={quickMarkDate}
                    setQuickMarkDate={setQuickMarkDate}
                    quickMarkNotes={quickMarkNotes}
                    setQuickMarkNotes={setQuickMarkNotes}
                    quickMarkSaving={quickMarkSaving}
                    setQuickMarkSaving={setQuickMarkSaving}
                    quickMarkToast={quickMarkToast}
                    setQuickMarkToast={setQuickMarkToast}
                    fetchPetEvents={fetchPetEvents}
                    onOpenHealth={handleOpenHealth}
                    onOpenDocuments={handleOpenDocuments}
                    alertVacinas={selectedPetCardAlerts.vacinas}
                    colorVacinas={selectedPetCardColors.vacinas}
                    alertVermifugo={selectedPetCardAlerts.vermifugo}
                    colorVermifugo={selectedPetCardColors.vermifugo}
                    alertAntipulgas={selectedPetCardAlerts.antipulgas}
                    colorAntipulgas={selectedPetCardColors.antipulgas}
                    alertColeira={selectedPetCardAlerts.coleira}
                    colorColeira={selectedPetCardColors.coleira}
                    alertGrooming={selectedPetCardAlerts.grooming}
                    colorGrooming={selectedPetCardColors.grooming}
                    alertFood={selectedPetCardAlerts.food}
                    colorFood={selectedPetCardColors.food}
                    alertMedicacao={medicationCardStatus.alert}
                    colorMedicacao={medicationCardStatus.color}
                    onOpenVaccines={handleOpenVaccines}
                    onOpenVermifugo={handleOpenVermifugo}
                    onOpenAntipulgas={handleOpenAntipulgas}
                    onOpenColeira={handleOpenColeira}
                    onOpenGrooming={handleOpenGrooming}
                    onOpenMedication={handleOpenMedication}
                    onOpenFood={handleOpenFood}
                    onOpenEvents={handleOpenEvents}
                    onOpenFamily={togglePetSelector}
                    onHealthItemClick={setHealthQuickAction}
                  />
                </PetTabs>
              </div>
              );
            })()}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-50 ring-1 ring-slate-200">
              <svg viewBox="0 0 96 96" className="h-14 w-14 text-slate-400" aria-hidden="true">
                <path fill="currentColor" d="M46 22c-10 0-18 8-18 18v11c0 13 9 23 20 23s20-10 20-23V40c0-10-8-18-18-18h-4Zm-9 18c0-5 4-9 9-9h4c5 0 9 4 9 9v11c0 8-5 14-11 14s-11-6-11-14V40Z" />
                <path fill="currentColor" d="M25 42c-5 0-9 5-9 11s4 11 9 11 9-5 9-11-4-11-9-11Zm46 0c-5 0-9 5-9 11s4 11 9 11 9-5 9-11-4-11-9-11ZM31 21c-4 0-8 4-8 9s4 9 8 9 8-4 8-9-4-9-8-9Zm34 0c-4 0-8 4-8 9s4 9 8 9 8-4 8-9-4-9-8-9Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-slate-900">Quem é o seu pet?</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Cadastre o primeiro pet para começar os cuidados.</p>
            <button
              type="button"
              onClick={openAddPetModal}
              className="mt-6 w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg active:scale-[0.99]"
            >
              Adicionar pet
            </button>
          </div>
        )}
      </div>

      {/* Modal Central de Saúde */}
      {showHealthModal && (
        <HealthModal
          currentPet={currentPet}
          selectedPetId={selectedPetId}
          photoTimestamps={photoVersions}
          healthModalMode={healthModalMode}
          healthActiveTab={healthActiveTab}
          eventTypeLocked={eventTypeLocked}
          onBackFromHealthModal={backFromHealthModal}
          onCloseHealthModal={closeHealthModal}
          onSelectHealthTab={selectHealthTab}
          onOpenVaccineCenter={openVaccineCenterFromHealthModal}
          vaccines={vaccines}
          parasiteControls={parasiteControls}
          showParasiteForm={showParasiteForm}
          setShowParasiteForm={setShowParasiteForm}
          editingParasite={editingParasite}
          setEditingParasite={setEditingParasite}
          parasiteFormData={parasiteFormData}
          setParasiteFormData={setParasiteFormData}
          handleDeleteParasite={handleDeleteParasite}
          handleEditParasite={handleEditParasite}
          handleSaveParasite={handleSaveParasite}
          resetParasiteForm={resetParasiteForm}
          groomingRecords={groomingRecords}
          editingGrooming={editingGrooming}
          groomingFormData={groomingFormData}
          setGroomingFormData={setGroomingFormData}
          groomingDueAlerts={groomingDueAlerts}
          setGroomingDueAlerts={setGroomingDueAlerts}
          handleDeleteGrooming={handleDeleteGrooming}
          handleEditGrooming={handleEditGrooming}
          handleSaveGrooming={handleSaveGrooming}
          handleCancelEditGrooming={handleCancelEditGrooming}
          showPlaceSuggestions={showPlaceSuggestions}
          setShowPlaceSuggestions={setShowPlaceSuggestions}
          searchingPlaces={searchingPlaces}
          placeSuggestions={placeSuggestions}
          searchPlaces={searchPlaces}
          selectPlace={selectPlace}
          fetchFeedingPlan={fetchFeedingPlan}
          petEvents={petEvents}
          eventsLoading={eventsLoading}
          editingEventId={editingEventId}
          setEditingEventId={setEditingEventId}
          eventFormData={eventFormData}
          setEventFormData={setEventFormData}
          eventSaving={eventSaving}
          setEventSaving={setEventSaving}
          setCreatedEventId={setCreatedEventId}
          attachDocFiles={attachDocFiles}
          setAttachDocFiles={setAttachDocFiles}
          setShowAttachDoc={setShowAttachDoc}
          docFolderModal={docFolderModal}
          setDocFolderModal={setDocFolderModal}
          handleDeleteEvent={handleDeleteEvent}
          fetchPetEvents={fetchPetEvents}
          openEditEvent={openEditEvent}
          vetHistoryDocs={vetHistoryDocs}
        />
      )}

      {/* Modal: Guia Completo de Vacinas */}
      {showAllVaccinesGuide && (
        <VaccineGuide
          vaccineInfo={vaccineInfo}
          setShowAllVaccinesGuide={setShowAllVaccinesGuide}
        />
      )}

      {/* Modal Formulário de Vacina */}
      {(showVaccineForm || showAIUpload || cardAnalysis) && (
        <VaccineWorkflowModals
          showVaccineForm={showVaccineForm}
          showAIUpload={showAIUpload}
          cardAnalysis={cardAnalysis}
          editingVaccine={editingVaccine}
          vaccineFormData={vaccineFormData}
          setVaccineFormData={setVaccineFormData}
          resetVaccineForm={resetVaccineForm}
          onOpenAIUpload={openVaccineCardReader}
          onCloseAIUpload={closeVaccineCardReader}
          onOpenVaccineFormFromAIUpload={openVaccineFormFromCardReader}
          currentPet={currentPet}
          vaccineFiles={vaccineFiles}
          setVaccineFiles={setVaccineFiles}
          selectedPetId={selectedPetId}
          handleSaveVaccine={handleSaveVaccine}
          vaccineFormSaving={vaccineFormSaving}
          pets={pets}
          closeCardAnalysis={closeCardAnalysis}
          reviewRegistros={reviewRegistros}
          reviewExpectedCount={reviewExpectedCount}
          setReviewExpectedCount={setReviewExpectedCount}
          setReviewConfirmed={setReviewConfirmed}
          addReviewRegistro={addReviewRegistro}
          removeReviewRegistro={removeReviewRegistro}
          updateReviewRegistro={updateReviewRegistro}
          mapNomeComercialToTipo={mapNomeComercialToTipo}
          handleImportAnalyzedVaccines={handleImportAnalyzedVaccines}
          importVaccineLoading={importVaccineLoading}
          reviewConfirmed={reviewConfirmed}
          reviewLearnEnabled={reviewLearnEnabled}
        />
      )}

      {/* Modal Cofre de Documentos */}
      {showMedicalVault && (
        <MedicalVaultModal
          currentPet={currentPet}
          setShowMedicalVault={setShowMedicalVault}
          setVetHistoryDocs={setVetHistoryDocs}
          vaccines={vaccines}
          petEvents={petEvents}
        />
      )}

      {/* Edit Pet Modal */}
      {showEditModal && currentPet && (
        <EditPetModal
          pet={currentPet}
          photoVersion={currentPet?.updated_at || (selectedPetId ? photoTimestamps[selectedPetId] : undefined)}
          onClose={closeEditPetModal}
          onSave={handleSavePet}
          onDelete={handleDeletePet}
          initialSection={editPetInitialSection}
        />
      )}

      {/* Modal Histórico Veterinário Completo */}
      {showVetHistoryModal && currentPet && (
        <VetHistoryModal
          currentPet={currentPet}
          historicoTab={historicoTab}
          setHistoricoTab={setHistoricoTab}
          vaccines={vaccines}
          petEvents={petEvents}
          vetHistoryDocs={vetHistoryDocs}
          onClose={closeVetHistoryModal}
          onOpenHealthOptions={openHealthOptionsFromVetHistory}
          onOpenGrooming={openGroomingFromVetHistory}
          onOpenFood={openFoodFromVetHistory}
          onOpenHealthTab={openHealthTabFromVetHistory}
          onOpenDocumentFolder={openVetHistoryDocumentFolder}
          onNavigateToSaude={navigateToSaudeFromVetHistory}
          onOpenUpload={() => setShowDocUploadInHistorico(true)}
        />
      )}

      {/* Modal de pasta de documentos */}
      <HistoryDocumentsOverlay
        currentPet={currentPet}
        setHistoricoTab={setHistoricoTab}
        showDocUploadInHistorico={showDocUploadInHistorico}
        setShowDocUploadInHistorico={setShowDocUploadInHistorico}
        setVetHistoryDocs={setVetHistoryDocs}
        docFolderModal={docFolderModal}
        onCloseDocFolder={closeVetHistoryDocumentFolder}
        onRemoveDocFromFolder={removeDocumentFromVetHistoryFolder}
      />

      {/* Modal de Feedback/Correção */}
      {showFeedbackModal && feedbackVaccine && (
        <FeedbackModal
          feedbackVaccine={feedbackVaccine}
          feedbackFormData={feedbackFormData}
          setFeedbackFormData={setFeedbackFormData}
          setShowFeedbackModal={setShowFeedbackModal}
          setFeedbackVaccine={setFeedbackVaccine}
          handleSubmitFeedback={handleSubmitFeedback}
        />
      )}

      {/* Modal Quick Add: Adicionar Vacina com Poucos Toques */}
      {showQuickAddVaccine && (
        <QuickAddVaccineModal
          quickAddData={quickAddData}
          commonVaccines={commonVaccines}
          handleQuickAddVaccine={handleQuickAddVaccine}
          onClose={closeQuickAddVaccine}
          onOpenFullForm={openFullVaccineFormFromQuickAdd}
        />
      )}

      <HomeNavigationModals
        currentPet={currentPet}
        showServiceTypeModal={showServiceTypeModal}
        onCloseServiceTypeModal={closeServiceTypeModal}
        showHealthOptionsModal={showHealthOptionsModal}
        onCloseHealthOptionsModal={closeHealthOptionsModal}
        onOpenHealthOptionsModal={() => setShowHealthOptionsModal(true)}
        showEventTypeModal={showEventTypeModal}
        onOpenEventTypeModal={openEventTypeModal}
        onCloseEventTypeModal={closeEventTypeModal}
        showVetOptionsModal={showVetOptionsModal}
        onCloseVetOptionsModal={closeVetOptionsModal}
        alertVaccinesValue={alertVaccinesValue}
        alertParasitesValue={alertParasitesValue}
        alertMedicationValue={alertMedicationValue}
        colorVaccinesValue={selectedPetCardColors.vacinas}
        colorVermifugoValue={selectedPetCardColors.vermifugo}
        colorAntipulgasValue={selectedPetCardColors.antipulgas}
        colorColeiraValue={selectedPetCardColors.coleira}
        colorMedicationValue={medicationCardStatus.color}
        onOpenHealthTab={openHealthTab}
        onStartEventRegistration={startEventRegistration}
        onOpenEditPet={openEditPetModal}
        getRecentVets={getRecentVets}
        onNavigateToSaude={navigateToSaudeFromHealthOptions}
        onOpenVaccines={handleOpenVaccines}
        onOpenVermifugo={handleOpenVermifugo}
        onOpenAntipulgas={handleOpenAntipulgas}
        onOpenColeira={handleOpenColeira}
        onOpenMedication={handleOpenMedication}
      />

      {/* Add Pet Modal */}
      {showAddPetModal && (
        <AddPetModal
          onClose={closeAddPetModal}
          onComplete={handleAddPetComplete}
        />
      )}
  {/* Sistema automático removido — sem geolocalização */}

      {/* ── HealthQuickActionSheet — mini sheet de ação rápida para itens de saúde ── */}
      {healthQuickAction && (
        <HealthQuickActionSheet
          item={healthQuickAction}
          petEvents={petEvents}
          onClose={() => setHealthQuickAction(null)}
          onOpenDetails={handleHealthQuickOpenDetails}
          onApplied={() => {
            if (selectedPetId) fetchPetEvents(selectedPetId);
          }}
        />
      )}

      {/* ── PushActionSheet — tela curta de decisão (push → ação rápida) ── */}
      {pushActionSheet && (() => {
        const pushSheetPet = pets.find((pet) => pet.pet_id === pushActionSheet.petId) || currentPet;
        if (!pushSheetPet) return null;
        return (
        <PushActionSheet
          type={pushActionSheet.type}
          petName={pushSheetPet.pet_name || ''}
          petId={pushSheetPet.pet_id}
          itemName={pushActionSheet.itemName}
          eventId={pushActionSheet.eventId}
          onClose={() => {
            if (selectedPetId !== pushActionSheet.petId) {
              setSelectedPetId(pushActionSheet.petId);
            }
            setPushActionSheet(null);
          }}
          onOpenCommerce={handlePushActionCommerceOpen}
          onOpenFull={() => {
            if (selectedPetId !== pushActionSheet.petId) {
              setSelectedPetId(pushActionSheet.petId);
            }
            setPushActionSheet(null);
            const directDestination: HomeSurfaceResolution =
              pushActionSheet.type === 'food' ? { kind: 'sheet', sheet: 'food' } :
              pushActionSheet.type === 'vaccines' ? { kind: 'sheet', sheet: 'vaccines' } :
              pushActionSheet.type === 'medication' ? { kind: 'sheet', sheet: 'medication' } :
              pushActionSheet.type === 'grooming' ? { kind: 'sheet', sheet: 'grooming' } :
              { kind: 'sheet', sheet: 'vermifugo' };
            applyHomeSurfaceResolution(directDestination);
          }}
        />
        );
      })()}

      {/* ── Sheets modernos por item ─────────────────────────────────────── */}
      {showVermifugoSheet && selectedPetId && (
        <ParasiteItemSheet
          type="dewormer"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          parasiteControls={parasiteControls.filter(p => p.type === 'dewormer' || p.type === 'heartworm' || p.type === 'leishmaniasis')}
          initialMode={parasiteSheetInitialMode}
          onClose={() => { setParasiteSheetInitialMode('view'); closeVermifugoSheet(); }}
          onRefresh={loadParasiteControls}
        />
      )}

      {showAntipulgasSheet && selectedPetId && (
        <ParasiteItemSheet
          type="flea_tick"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          parasiteControls={parasiteControls.filter(p => p.type === 'flea_tick')}
          initialMode={parasiteSheetInitialMode}
          onClose={() => { setParasiteSheetInitialMode('view'); closeAntipulgasSheet(); }}
          onRefresh={loadParasiteControls}
        />
      )}

      {showColeiraSheet && selectedPetId && (
        <ParasiteItemSheet
          type="collar"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          parasiteControls={parasiteControls.filter(p => p.type === 'collar')}
          initialMode={parasiteSheetInitialMode}
          onClose={() => { setParasiteSheetInitialMode('view'); closeColeiraSheet(); }}
          onRefresh={loadParasiteControls}
        />
      )}

      {showFoodSheet && currentPet && (
        <FoodItemSheet
          pet={currentPet}
          petPhotoUrl={(currentPet as { photo?: string | null; photo_url?: string | null }).photo ?? (currentPet as { photo_url?: string | null }).photo_url ?? null}
          onClose={() => { setFoodSheetInitialMode('view'); closeFoodSheet(); }}
          onSaved={handleFoodSaved}
          initialMode={foodSheetInitialMode}
          racaoEventId={petEvents.find((e) => e.type === 'racao')?.id ?? null}
        />
      )}

      {showVaccineSheet && selectedPetId && (
        <VaccineItemSheet
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          vaccines={vaccines}
          initialMode={vaccineSheetInitialMode}
          onClose={() => { setVaccineSheetInitialMode('view'); closeVaccineSheet(); }}
          onQuickAdd={handleVaccineQuickAdd}
          onDirectSaveVaccine={handleQuickAddVaccine}
          onFullFormVaccine={handleVaccineFullForm}
          onEditVaccine={handleVaccineEdit}
          onDeleteVaccine={(v) => { handleDeleteVaccine(v); }}
          onDeleteAllVaccines={deleteAllVaccines}
          onRefreshVaccines={refreshVaccines}
          pendingCardFiles={pendingCardFiles}
          setPendingCardFiles={setPendingCardFiles}
          importingCard={importingCard}
          aiImageLimit={aiImageLimit}
          setAiImageLimit={setAiImageLimit}
          handleFilesSelectedAppend={handleFilesSelectedAppend}
          handleProcessCards={handleProcessCards}
        />
      )}

      {showMedicationSheet && selectedPetId && (
        <MedicationItemSheet
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          petEvents={petEvents}
          initialMode={medicationSheetInitialMode}
          onClose={() => { setMedicationSheetInitialMode('view'); closeMedicationSheet(); }}
          onRefresh={refreshMedicationHistory}
        />
      )}

      {showBanhoTosaSheet && selectedPetId && (
        <GroomingItemSheet
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          groomingRecords={groomingRecords}
          onClose={closeGroomingSheet}
          onRefresh={loadGroomingRecords}
        />
      )}

      <HomeEmergencySheet
        open={showEmergencySheet}
        onClose={() => setShowEmergencySheet(false)}
      />

    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}
