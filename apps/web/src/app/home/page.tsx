'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/I18nContext';
import dynamic from 'next/dynamic';
import type { ActionSheetType } from '@/components/PushActionSheet';
import type { QuickActionContext } from '@/components/home/HealthQuickActionSheet';

// Componentes visíveis ao abrir — carregamento imediato
import { HomePetHeader } from '@/components/home/HomePetHeader';
import { HomePetDashboard } from '@/components/home/HomePetDashboard';
import { PetTabs } from '@/components/PetTabs';

// Modais e sheets — carregados sob demanda (só quando o usuário abre)
const EditPetModal = dynamic(() => import('@/components/EditPetModal').then(m => ({ default: m.EditPetModal })), { ssr: false });
const AddPetModal = dynamic(() => import('../../components/AddPetModal').then(m => ({ default: m.AddPetModal })), { ssr: false });
const VaccineCardUpload = dynamic(() => import('@/components/VaccineCardUpload').then(m => ({ default: m.VaccineCardUpload })), { ssr: false });
const HealthModal = dynamic(() => import('@/components/home/HealthModal').then(m => ({ default: m.HealthModal })), { ssr: false });
const VaccineGuide = dynamic(() => import('@/components/home/VaccineGuide').then(m => ({ default: m.VaccineGuide })), { ssr: false });
const VaccineWorkflowModals = dynamic(() => import('@/components/home/VaccineWorkflowModals').then(m => ({ default: m.VaccineWorkflowModals })), { ssr: false });
const FeedbackModal = dynamic(() => import('@/components/home/FeedbackModal').then(m => ({ default: m.FeedbackModal })), { ssr: false });
const QuickAddVaccineModal = dynamic(() => import('@/components/home/QuickAddVaccineModal').then(m => ({ default: m.QuickAddVaccineModal })), { ssr: false });
const VetHistoryModal = dynamic(() => import('@/components/home/VetHistoryModal').then(m => ({ default: m.VetHistoryModal })), { ssr: false });
const HistoryDocumentsOverlay = dynamic(() => import('@/components/home/HistoryDocumentsOverlay').then(m => ({ default: m.HistoryDocumentsOverlay })), { ssr: false });
const HomeNavigationModals = dynamic(() => import('@/components/home/HomeNavigationModals').then(m => ({ default: m.HomeNavigationModals })), { ssr: false });
const HomeEmergencySheet = dynamic(() => import('@/components/home/HomeEmergencySheet').then(m => ({ default: m.HomeEmergencySheet })), { ssr: false });
const PushActionSheet = dynamic(() => import('@/components/PushActionSheet').then(m => ({ default: m.PushActionSheet })), { ssr: false });
const HealthQuickActionSheet = dynamic(() => import('@/components/home/HealthQuickActionSheet').then(m => ({ default: m.HealthQuickActionSheet })), { ssr: false });
const ParasiteItemSheet = dynamic(() => import('@/components/home/ParasiteItemSheet').then(m => ({ default: m.ParasiteItemSheet })), { ssr: false });
const VaccineItemSheet = dynamic(() => import('@/components/home/VaccineItemSheet').then(m => ({ default: m.VaccineItemSheet })), { ssr: false });
const MedicationItemSheet = dynamic(() => import('@/components/home/MedicationItemSheet').then(m => ({ default: m.MedicationItemSheet })), { ssr: false });
const FoodItemSheet = dynamic(() => import('@/components/home/FoodItemSheet').then(m => ({ default: m.FoodItemSheet })), { ssr: false });
const GroomingItemSheet = dynamic(() => import('@/components/home/GroomingItemSheet').then(m => ({ default: m.GroomingItemSheet })), { ssr: false });
const OnboardingChecklistCard = dynamic(() => import('@/components/home/OnboardingChecklistCard').then(m => ({ default: m.OnboardingChecklistCard })), { ssr: false });
const PetSumidoSheet = dynamic(() => import('@/components/home/PetSumidoSheet').then(m => ({ default: m.PetSumidoSheet })), { ssr: false });
const UpcomingEventsSheet = dynamic(() => import('@/components/home/UpcomingEventsSheet').then(m => ({ default: m.UpcomingEventsSheet })), { ssr: false });
import type { PetCareReminder } from '@/lib/petCareDomain';
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
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
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
const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || '';
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


function NoPetsCard({ onAddPet, onLogout }: { onAddPet: () => void; onLogout: () => void }) {
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    if (!deletePassword) { setDeleteError('Digite sua senha para confirmar.'); return; }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const token = getToken();
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string };
        setDeleteError(data.detail || 'Erro ao apagar conta. Verifique a senha.');
        return;
      }
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      onLogout();
    } catch {
      setDeleteError('Erro de rede. Tente novamente.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
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
        onClick={onAddPet}
        className="mt-6 w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg active:scale-[0.99]"
      >
        Adicionar pet
      </button>

      <button
        type="button"
        onClick={onLogout}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-500 active:bg-slate-50"
      >
        Sair / Trocar conta
      </button>

      {!showDelete ? (
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="mt-2 w-full py-2 text-xs font-semibold text-rose-400 active:text-rose-600"
        >
          Apagar conta permanentemente
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left">
          <p className="text-sm font-black text-rose-800">Apagar conta permanentemente</p>
          <p className="mt-1 text-xs text-rose-600 leading-relaxed">
            Todos os dados serão excluídos e não poderão ser recuperados. Digite sua senha para confirmar.
          </p>
          <input
            type="password"
            value={deletePassword}
            onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
            placeholder="Sua senha"
            autoComplete="current-password"
            className="mt-3 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10"
          />
          {deleteError && <p className="mt-1.5 text-xs text-rose-700 font-semibold">{deleteError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => { setShowDelete(false); setDeletePassword(''); setDeleteError(''); }}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 active:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-black text-white disabled:opacity-60 active:bg-rose-700"
            >
              {deleteLoading ? 'Apagando…' : 'Confirmar exclusão'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [forceCheckin, setForceCheckin] = useState(false);
  // Ref que sempre aponta para a função de refresh mais recente (evita closure stale no event listener)
  const refreshAllRef = useRef<() => void>(() => {});
  // Deep link fallback: ref+trigger para casos onde router.push não pode ser chamado diretamente
  const cachedDeepLinkRef = useRef<string | null>(null);
  const [deepLinkTrigger, setDeepLinkTrigger] = useState(0);

  // ── Deep link via notificação push ──────────────────────────────────────────
  // 4 mecanismos redundantes para cobrir todos os estados do app (ativo, background, frozen, recém-aberto).
  // Todos chamam router.push() diretamente ao receber a URL, garantindo que searchParams atualize.

  const applyDeepLinkUrl = useCallback((url: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      router.push(parsed.pathname + parsed.search);
    } catch {
      cachedDeepLinkRef.current = url;
      setDeepLinkTrigger((t) => t + 1);
    }
  }, [router]);

  // 1. Leitura na montagem — cobre app aberto do zero via notificação (ou iOS onde openWindow ignora params)
  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    caches.open('petmol-deeplink-v1').then(async (cache) => {
      const resp = await cache.match('/__petmol_deeplink');
      if (!resp) return;
      const { url, ts } = await resp.json() as { url: string; ts: number };
      await cache.delete('/__petmol_deeplink');
      if (Date.now() - ts < 30_000) applyDeepLinkUrl(url);
    }).catch(() => {});
  }, [applyDeepLinkUrl]);

  // 2. visibilitychange + window.focus — cobre app vindo do background
  // window.focus captura casos onde visibilitychange não dispara (ex.: notification shade no Android)
  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    const readCache = async () => {
      if (new URLSearchParams(window.location.search).get('modal')) return;
      try {
        const cache = await caches.open('petmol-deeplink-v1');
        const resp = await cache.match('/__petmol_deeplink');
        if (!resp) return;
        const { url, ts } = await resp.json() as { url: string; ts: number };
        await cache.delete('/__petmol_deeplink');
        if (Date.now() - ts < 30_000) applyDeepLinkUrl(url);
      } catch {}
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        readCache();
        setTimeout(readCache, 600); // retry com delay para cobrir race condition
      }
    };
    const onFocus = () => { readCache(); setTimeout(readCache, 600); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [applyDeepLinkUrl]);

  // 3. BroadcastChannel — entrega ao app ativo (não frozen) sem depender de referência de cliente
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const bc = new BroadcastChannel('petmol-deeplink');
    bc.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'PETMOL_DEEPLINK') return;
      const { url, ts } = event.data as { url: string; ts: number };
      if (!url || Date.now() - (ts || 0) > 30_000) return;
      applyDeepLinkUrl(url);
    };
    return () => bc.close();
  }, [applyDeepLinkUrl]);

  // 4. postMessage do SW — entregue mesmo após a página sair do estado frozen (após client.focus())
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PETMOL_SW_UPDATED') {
        window.location.reload();
        return;
      }
      if (event.data?.type !== 'PETMOL_DEEPLINK') return;
      const { url, ts } = event.data as { url: string; ts: number };
      if (!url || Date.now() - (ts || 0) > 30_000) return;
      applyDeepLinkUrl(url);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [applyDeepLinkUrl]);

  // ── Checagem de versão — força reload quando novo deploy chega ─────────────
  useEffect(() => {
    const STORAGE_KEY = 'petmol_build_v';
    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json() as { v: string };
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (!stored) { sessionStorage.setItem(STORAGE_KEY, v); return; }
        if (stored !== v) {
          sessionStorage.setItem(STORAGE_KEY, v);
          window.location.reload();
        }
      } catch { /* offline — ignora */ }
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, []);

  // ── Saúde da subscription de push ──────────────────────────────────────────
  // Sincroniza o endpoint atual do dispositivo com o servidor em cada mount.
  // Cobre o caso de iOS renovar o device token silenciosamente sem re-registrar.
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') {
      showAppToast('Notificações bloqueadas. Ative em Ajustes → Notificações para receber lembretes.', { tone: 'warning' });
      return;
    }
    if (Notification.permission !== 'granted') return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        const token = getToken();
        if (!token) return;
        const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
        await fetch(`${API_BASE_URL}/notifications/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: json }),
        });
      } catch {}
    })();
  }, []);

  // PWA Web Share Target: o PETMOL não armazena mais documentos/anexos, então
  // arquivos compartilhados são apenas descartados do cache (o SW ainda pode
  // gravá-los no redirect). Mantido só para limpar o cache e a URL.
  useEffect(() => {
    if (!searchParams.get('petmol_share')) return;
    (async () => {
      try {
        const cache = await caches.open('petmol-shared-files-v1');
        await cache.delete('/petmol-share/meta');
        const keys = await cache.keys();
        await Promise.all(keys.map((k) => cache.delete(k)));
      } catch {
        // ignore
      } finally {
        router.replace('/home', { scroll: false });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull-to-refresh
  const pullStartYRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t, locale } = useI18n();
  const { tutor, isLoading, logout } = useAuth();

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
  const [justSynced, setJustSynced] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editPetInitialSection, setEditPetInitialSection] = useState<'food' | 'grooming' | undefined>(undefined);
  const [pushActionSheet, setPushActionSheet] = useState<{ type: ActionSheetType; petId: string; itemName?: string; eventId?: string } | null>(null);
  const [healthQuickAction, setHealthQuickAction] = useState<QuickActionContext | null>(null);
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
  const [historicoTab, setHistoricoTab] = useState<'resumo' | 'detalhado'>('detalhado');
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
    cancelProcessCards,
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
  const [showPetSumidoSheet, setShowPetSumidoSheet] = useState(false);
  const [showUpcomingSheet, setShowUpcomingSheet] = useState(false);
  const [allUpcomingReminders, setAllUpcomingReminders] = useState<PetCareReminder[]>([]);
  // Bell badge NUMBER shows everything (overdue + upcoming) — per feedback,
  // the count should reflect the full picture. Only the COLOR distinguishes
  // a real pendência (overdue/today) from what's merely upcoming.
  const hasUrgentReminder = useMemo(
    () => allUpcomingReminders.some((r) => r.status === 'overdue' || r.status === 'today'),
    [allUpcomingReminders],
  );

  // Alertas de pets sumidos próximos (não são do usuário logado)
  type NearbyAlert = {
    id: string; pet_name: string; species: string | null;
    last_seen_location: string | null; missing_date: string | null;
    missing_time: string | null; created_at: string | null; user_id: string;
  };
  const [nearbyAlerts, setNearbyAlerts] = useState<NearbyAlert[]>([]);

  const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

  // Lê dismissed com TTL: Record<id, timestamp> — expira após 24h
  function readDismissedIds(): string[] {
    try {
      const raw = localStorage.getItem('petmol_finder_dismissed_ids');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      // compatibilidade com formato antigo (string[])
      if (Array.isArray(parsed) && (parsed.length === 0 || typeof parsed[0] === 'string')) {
        return parsed as string[];
      }
      const map = parsed as Record<string, number>;
      const now = Date.now();
      return Object.entries(map).filter(([, ts]) => now - ts < DISMISS_TTL_MS).map(([id]) => id);
    } catch { return []; }
  }

  function writeDismissedId(id: string): void {
    try {
      const raw = localStorage.getItem('petmol_finder_dismissed_ids');
      let map: Record<string, number> = {};
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) map = parsed as Record<string, number>;
      }
      map[id] = Date.now();
      // limpa expirados ao gravar
      const now = Date.now();
      const clean = Object.fromEntries(Object.entries(map).filter(([, ts]) => now - ts < DISMISS_TTL_MS));
      localStorage.setItem('petmol_finder_dismissed_ids', JSON.stringify(clean));
    } catch { /* best effort */ }
  }

  // IDs que o finder já tratou (reportou ou dispensou) — estado reativo
  const [handledAlertIds, setHandledAlertIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const reported = JSON.parse(localStorage.getItem('petmol_finder_reported_ids') ?? '[]') as string[];
      return [...new Set([...reported, ...readDismissedIds()])];
    } catch { return []; }
  });

  const fetchNearbyAlerts = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const r = await fetch(`${API_BASE_URL}/missing-pets/my-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const list: NearbyAlert[] = await r.json();
      setNearbyAlerts(list);

      // Checa se algum report foi descartado pelo dono — remove do localStorage e mostra banner de novo
      const reported = (() => {
        try { return JSON.parse(localStorage.getItem('petmol_finder_reported_ids') ?? '[]') as string[]; }
        catch { return [] as string[]; }
      })();
      if (reported.length > 0) {
        const ownerDismissed: string[] = [];
        await Promise.allSettled(
          reported.map(async (mpId) => {
            try {
              const res = await fetch(`${API_BASE_URL}/missing-pets/${mpId}/my-report-status`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json() as { dismissed?: boolean };
                if (data.dismissed) ownerDismissed.push(mpId);
              }
            } catch { /* silent */ }
          }),
        );
        if (ownerDismissed.length > 0) {
          const updated = reported.filter((id) => !ownerDismissed.includes(id));
          localStorage.setItem('petmol_finder_reported_ids', JSON.stringify(updated));
          setHandledAlertIds([...new Set([...updated, ...readDismissedIds()])]);
        }
      }
    } catch { /* silent */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetchNearbyAlerts();
    const iv = setInterval(fetchNearbyAlerts, 15_000);
    window.addEventListener('focus', fetchNearbyAlerts);
    return () => { clearInterval(iv); window.removeEventListener('focus', fetchNearbyAlerts); };
  }, [fetchNearbyAlerts]);

  // Compartilhar cuidado do pet + gerenciar cuidadores
  const [shareLoading, setShareLoading] = useState(false);
  type Caretaker = { user_id: string; name: string; joined_at: string };
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [removingCaretaker, setRemovingCaretaker] = useState<string | null>(null);

  const fetchCaretakers = useCallback(async (petId: string) => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/caretakers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCaretakers(await res.json() as Caretaker[]);
    } catch { /* silent */ }
  }, []);

  const handleSharePet = async () => {
    if (!currentPet || !loggedUserId) return;
    setShareLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/invite-link`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const { invite_url } = await res.json() as { invite_url: string };
      if (navigator.share) {
        await navigator.share({
          title: `Cuide de ${currentPet.pet_name} comigo 🐾`,
          text: `Te convidei para cuidar de ${currentPet.pet_name} no PETMOL. Abra o link, crie sua conta ou entre, e ative os alertas para ajudar se precisar.`,
          url: invite_url,
        });
      } else {
        const msg = encodeURIComponent(`Te convidei para cuidar de ${currentPet.pet_name} no PETMOL 🐾\n${invite_url}`);
        window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
      }
    } catch {
      // user cancelled share or error — silent
    } finally {
      setShareLoading(false);
    }
  };

  const handleRemoveCaretaker = async (userId: string) => {
    if (!currentPet) return;
    setRemovingCaretaker(userId);
    try {
      const token = getToken();
      await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/caretakers/${userId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setCaretakers(prev => prev.filter(c => c.user_id !== userId));
    } catch { /* silent */ } finally {
      setRemovingCaretaker(null);
    }
  };

  // Alertas ATIVOS criados pelo próprio usuário (pets sumidos do dono)
  type AlertReach = { notified_active: number; new_in_radius: number; radius_km: number };
  type OwnAlert = { id: string; pet_id: string | null; pet_name: string; contact: string; last_seen_location: string | null; characteristics: string | null; missing_date: string | null; missing_time: string | null; photo_url: string | null };
  const [ownMissingAlerts, setOwnMissingAlerts] = useState<OwnAlert[]>([]);
  const [alertReach, setAlertReach] = useState<Record<string, AlertReach>>({});
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const fetchOwnMissingAlerts = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const r = await fetch(`${API_BASE_URL}/missing-pets/my-active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const alerts = await r.json() as OwnAlert[];
        setOwnMissingAlerts(alerts);
        // Busca reach para cada alerta ativo
        for (const a of alerts) {
          fetch(`${API_BASE_URL}/missing-pets/${a.id}/reach`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setAlertReach(prev => ({ ...prev, [a.id]: data as AlertReach })); })
            .catch(() => {/* silent */});
        }
      }
    } catch { /* silent */ }
  }, []);
  useEffect(() => {
    fetchOwnMissingAlerts();
    const iv = setInterval(fetchOwnMissingAlerts, 15_000);
    window.addEventListener('focus', fetchOwnMissingAlerts);
    return () => { clearInterval(iv); window.removeEventListener('focus', fetchOwnMissingAlerts); };
  }, [fetchOwnMissingAlerts]);

  // Reports de achado para os pets DO usuário logado (banner verde)
  type FoundReportItem = {
    report_id: string; missing_pet_id: string; pet_name: string;
    finder_contact: string; finder_location: string | null;
    notes: string | null; created_at: string | null;
    compatibility_score: number | null; compatibility_analysis: string | null;
    confidence_level?: string; confidence_label?: string; requires_human_confirmation?: boolean;
    risk_level?: string; risk_label?: string; risk_flags?: string[]; proof_verified?: boolean;
    has_photos: boolean; photo_count: number; has_video?: boolean; video_url?: string | null; proof_challenge?: string | null;
  };
  type PhotosModalData = {
    photos: string[];
    video_url?: string | null;
    proof_challenge?: string | null;
    proof_verified?: boolean;
    risk_level?: string;
    risk_label?: string;
    risk_flags?: string[];
    score?: number | null;
    analysis?: string | null;
    compatibility_score?: number | null;
    compatibility_analysis?: string | null;
    confidence_level?: string;
    confidence_label?: string;
    requires_human_confirmation?: boolean;
  };
  const [photosModal, setPhotosModal] = useState<PhotosModalData | null>(null);
  const [photosModalLoading, setPhotosModalLoading] = useState(false);
  const [photosModalVideoSrc, setPhotosModalVideoSrc] = useState<string | null>(null);
  const [photosModalVideoError, setPhotosModalVideoError] = useState(false);
  const photosModalObjectUrlRef = useRef<string | null>(null);

  const clearPhotosModalVideo = useCallback(() => {
    if (photosModalObjectUrlRef.current) {
      URL.revokeObjectURL(photosModalObjectUrlRef.current);
      photosModalObjectUrlRef.current = null;
    }
    setPhotosModalVideoSrc(null);
    setPhotosModalVideoError(false);
  }, []);

  useEffect(() => () => clearPhotosModalVideo(), [clearPhotosModalVideo]);

  const closePhotosModal = useCallback(() => {
    clearPhotosModalVideo();
    setPhotosModal(null);
  }, [clearPhotosModalVideo]);

  const openPhotosModal = async (reportId: string) => {
    setPhotosModalLoading(true);
    setPhotosModal(null);
    clearPhotosModalVideo();
    try {
      const token = getToken();
      const r = await fetch(`${API_BASE_URL}/missing-pets/found-reports/${reportId}/photos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) {
        const raw = await r.json() as PhotosModalData;
        const normalized: PhotosModalData = {
          ...raw,
          score: raw.score ?? raw.compatibility_score ?? null,
          analysis: raw.analysis ?? raw.compatibility_analysis ?? null,
        };
        setPhotosModal(normalized);
        setPhotosModalLoading(false);
        if (normalized.video_url && token) {
          try {
            const vr = await fetch(`${API_BASE_URL}/missing-pets/found-reports/${reportId}/video`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (vr.ok) {
              const objectUrl = URL.createObjectURL(await vr.blob());
              photosModalObjectUrlRef.current = objectUrl;
              setPhotosModalVideoSrc(objectUrl);
            } else {
              setPhotosModalVideoError(true);
            }
          } catch {
            setPhotosModalVideoError(true);
          }
        }
      }
    } catch { /* silent */ }
    setPhotosModalLoading(false);
  };
  const [foundReports, setFoundReports] = useState<FoundReportItem[]>([]);
  const [confirmedPetIds, setConfirmedPetIds] = useState<string[]>([]);
  const fetchFoundReports = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const r = await fetch(`${API_BASE_URL}/missing-pets/my-found-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      setFoundReports(await r.json());
    } catch { /* silent */ }
  }, []);
  useEffect(() => {
    fetchFoundReports();
    const iv = setInterval(fetchFoundReports, 30_000);
    window.addEventListener('focus', fetchFoundReports);
    return () => { clearInterval(iv); window.removeEventListener('focus', fetchFoundReports); };
  }, [fetchFoundReports]);

const [showVaccineSheet, setShowVaccineSheet] = useState(false);
  const [showMedicationSheet, setShowMedicationSheet] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);
  const [foodSheetInitialMode, setFoodSheetInitialMode] = useState<'view' | 'buy'>('view');
  const [vaccineSheetInitialMode, setVaccineSheetInitialMode] = useState<'view' | 'buy'>('view');
  const [vaccineFormJustSaved, setVaccineFormJustSaved] = useState(false);
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
    onSync: () => { refreshAllRef.current(); setJustSynced(true); setTimeout(() => setJustSynced(false), 3000); },
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

  // Carrega cuidadores sempre que o pet selecionado muda (só para o dono)
  useEffect(() => {
    if (currentPet && loggedUserId && (currentPet.owner_user_id ?? loggedUserId) === loggedUserId) {
      fetchCaretakers(currentPet.pet_id);
    } else {
      setCaretakers([]);
    }
  }, [currentPet, loggedUserId, fetchCaretakers]);

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
  const allPetIds = useMemo(() => pets.map((p) => p.pet_id), [pets]);
  const {
    topAttentionAlerts,
    topAttentionPetCount,
    selectedPetCardAlerts,
    selectedPetCardColors,
    basicCareAttentionPetIds,
  } = useHomeInteractionCenter(
    multipetInteractions.interactions,
    multipetInteractions.canonicalEvents,
    selectedPetId,
    allPetIds,
  );
  // Names for the basic-care badge — shown instead of a bare count when
  // exactly one pet needs attention, so the badge can say "Mingau precisa
  // de atenção" instead of a generic "1 pet precisa de atenção".
  const basicCareAttentionPetNames = useMemo(
    () => basicCareAttentionPetIds
      .map((id) => pets.find((p) => p.pet_id === id)?.pet_name)
      .filter((name): name is string => Boolean(name)),
    [basicCareAttentionPetIds, pets],
  );

  // Dispatcher frontend e pendencies sem superfície foram desativados.

  const homePreferenceScopeId = useMemo(
    () => String(loggedUserId || tutor?.id || currentPet?.owner_user_id || 'petmol-home'),
    [loggedUserId, tutor?.id, currentPet?.owner_user_id]
  );

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
        if (ex.custom_interval_days) {
          totalSlots += 1;
          const appliedDates: string[] = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
          doneSlots += appliedDates.includes(todayStr) ? 1 : 0;
        } else if (times) {
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

  // Callback do mini sheet: abre o sheet completo correspondente ao item
  const handleHealthQuickOpenDetails = useCallback(() => {
    if (!healthQuickAction) return;
    const destination = resolveTopAttentionDestination(healthQuickAction.action_target as Parameters<typeof resolveTopAttentionDestination>[0]);
    setHealthQuickAction(null);
    if (destination) applyHomeSurfaceResolution(destination);
  }, [applyHomeSurfaceResolution, healthQuickAction]);

  // "Ir para a home" — ao fechar um sheet por esse caminho, a home nunca pode
  // ficar parada no meio (foto do pet cortada pelo header fixo): volta ao topo.
  const goHome = useCallback((cleanup?: () => void) => {
    cleanup?.();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }, []);

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
    setShowHealthOptionsModal,
    setShowHealthModal,
    setHealthModalMode,
    setHealthActiveTab,
    setDocFolderModal,
  });

  // ?addPet=1 — vindo do /welcome ("Adicionar meu pet") e do /register-pet
  // (que agora só redireciona pra cá). Abre o AddPetModal real, sem
  // formulário paralelo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('addPet') === '1') {
      openAddPetModal();
      params.delete('addPet');
      const qs = params.toString();
      router.replace(qs ? `/home?${qs}` : '/home', { scroll: false });
    }
  }, [openAddPetModal, router]);

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
  // Fallback: lê do Cache API (escrito pelo SW — necessário no iOS onde openWindow ignora query params)
  useEffect(() => {
    if (!pets.length) return; // aguarda os pets carregarem

    // Resolve params: URL (caminho padrão) ou cache do SW (fallback iOS/Android)
    let params = searchParams as Pick<URLSearchParams, 'get'>;
    if (!searchParams.get('modal') && cachedDeepLinkRef.current) {
      params = new URLSearchParams(cachedDeepLinkRef.current.split('?')[1] ?? '');
      cachedDeepLinkRef.current = null;
    }

    const modal = params.get('modal');
    if (!modal) return;
    closeAllTransientModals();

    const requestedPetId = params.get('petId');
    const resolvedPetId = requestedPetId && pets.some((pet) => pet.pet_id === requestedPetId)
      ? requestedPetId
      : selectedPetId && pets.some((pet) => pet.pet_id === selectedPetId)
        ? selectedPetId
        : pets[0]?.pet_id || null;

    if (resolvedPetId && resolvedPetId !== selectedPetId) {
      setSelectedPetId(resolvedPetId);
    }

    const eventId = params.get('eventId') || undefined;
    const itemName = params.get('itemName') || undefined;
    const pushFoodAction = params.get('push_food_action') || params.get('push_action');
    const mode = params.get('mode');
    const wantsBuyMode = params.get('action') === 'buy' || params.get('buy') === '1' || mode === 'buy';
    const forcePushChoice =
      params.get('choice') === '1' ||
      params.get('push_sheet') === '1' ||
      modal === 'push' ||
      modal === 'push-action' ||
      modal === 'push_action';
    const legacyPushType = params.get('type') as ActionSheetType | null;
    const parasiteSubtype = params.get('subtype') || params.get('category') || params.get('type');
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
    const destination = legacyPushDestination ?? resolveHomeDeepLinkDestination(modal, params.get('tab'), parasiteSubtype);
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
  }, [applyFoodPushAction, applyHomeSurfaceResolution, pets, selectedPetId, searchParams, router, deepLinkTrigger]);


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
      <div className="mx-auto max-w-2xl px-2 py-3 min-[390px]:px-3 sm:px-4 sm:py-4">
        {/* Fixed-height slot, always mounted while there's a pet — the pill
            INSIDE still mounts/unmounts on sync-state changes, but the slot
            itself never does, so the pet card and everything below it never
            shifts when the pill appears/disappears (confirmed real
            complaint: "Sincronizado" showing up was moving the screen). */}
        {pets.length > 0 && (
          <div className="mb-3 flex h-9 items-center justify-center">
            {(syncStatus === 'offline' || syncStatus === 'reconnecting' || possiblyStale || homePossiblyStale || justSynced) && (
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
                    : 'Sincronizado'}
              </div>
            )}
          </div>
        )}

        {/* Possível match enviado por um achador: tutor precisa confirmar */}
        {foundReports.length > 0 && (
          <div className="mb-3 space-y-2">
            {foundReports.map((rep) => {
              const isConfirmed = confirmedPetIds.includes(rep.missing_pet_id);
              if (isConfirmed) {
                return (
                  <div
                    key={rep.report_id}
                    className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-600 to-teal-700 p-5 shadow-lg shadow-emerald-900/20 text-center"
                  >
                    <div className="text-4xl mb-2">🐾</div>
                    <h3 className="text-[18px] font-black text-white leading-tight">
                      {rep.pet_name} voltou para casa!
                    </h3>
                    <p className="mt-1 text-[13px] text-emerald-100">
                      A comunidade PETMOL fez a diferença. Quem estava no raio foi avisado.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmedPetIds(ids => ids.filter(id => id !== rep.missing_pet_id));
                        fetchFoundReports();
                        fetchNearbyAlerts();
                      }}
                      className="mt-3 rounded-xl bg-white/20 border border-white/40 px-6 py-2 text-[13px] font-bold text-white active:scale-95 transition-transform"
                    >
                      Fechar
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={rep.report_id}
                  className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-500 to-orange-600 p-4 shadow-lg shadow-amber-900/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl">
                      🔎
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-100">
                        Possível match recebido
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-black leading-tight text-white">
                        Um pet parecido com {rep.pet_name}
                      </h3>
                      {rep.finder_location && (
                        <p className="mt-1 text-[12px] font-medium text-amber-100">
                          Local: {rep.finder_location}
                        </p>
                      )}
                      {rep.notes && (
                        <p className="mt-0.5 text-[12px] text-amber-100 italic">&ldquo;{rep.notes}&rdquo;</p>
                      )}
                      <p className="mt-1 text-[13px] font-bold text-white">
                        Contato: {rep.finder_contact}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl bg-white/15 border border-white/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-black uppercase tracking-widest text-white">
                        PETMOL Protege
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                        rep.proof_verified ? 'bg-emerald-300 text-emerald-950' : 'bg-amber-200 text-amber-950'
                      }`}>
                        {rep.proof_verified ? 'Prova dinâmica' : 'Pedir prova'}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-white/80">
                      <span>{rep.has_video ? '✓ Vídeo enviado' : '• Sem vídeo'}</span>
                      <span>{rep.proof_verified ? '✓ Código válido' : '• Código não validado'}</span>
                      <span>{rep.has_photos ? '✓ Fotos anexadas' : '• Sem fotos'}</span>
                      <span>{rep.risk_level === 'review' ? '⚠ Revisar risco' : '✓ Risco monitorado'}</span>
                    </div>
                    {rep.risk_label && (
                      <p className="mt-2 text-[11px] leading-snug text-white/70">{rep.risk_label}</p>
                    )}
                  </div>

                  {/* Score de compatibilidade — destaque grande */}
                  {rep.compatibility_score != null && (
                    <div className="mt-3 flex flex-col items-center gap-1.5">
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                        rep.compatibility_score >= 90 ? 'bg-emerald-400/25' :
                        rep.compatibility_score >= 75 ? 'bg-amber-400/25' : 'bg-white/15'
                      }`} style={{ border: '4px solid rgba(255,255,255,0.55)' }}>
                        <span className="text-[36px] font-black text-white leading-none">{rep.compatibility_score}%</span>
                      </div>
                      <p className="text-[12px] text-amber-50 font-semibold text-center">
                        {rep.confidence_label || (
                          rep.compatibility_score >= 90 ? 'Muito parecido - confirme com cuidado' :
                          rep.compatibility_score >= 75 ? 'Parecido - precisa confirmação' :
                          'Baixa confiança - verifique manualmente'
                        )}
                      </p>
                      <p className="text-[11px] text-white/70 text-center">A IA não confirma sozinha. Revise as fotos antes de encerrar o alerta.</p>
                    </div>
                  )}

                  {(rep.has_photos || rep.has_video) && (
                    <button
                      type="button"
                      onClick={() => void openPhotosModal(rep.report_id)}
                      className="mt-2 flex items-center gap-2 w-full rounded-xl bg-white/20 border border-white/30 px-3 py-2.5 active:scale-95 transition-transform"
                    >
                      <span className="text-[18px]">{rep.has_video ? '🎥' : '📷'}</span>
                      <span className="flex-1 text-left text-[13px] font-bold text-white">
                        {rep.has_video
                          ? `Ver prova em vídeo${rep.has_photos ? ' e fotos' : ''}`
                          : `Ver ${rep.photo_count === 1 ? '1 foto' : `${rep.photo_count} fotos`} do achador`}
                      </span>
                      <span className="text-white/50 text-[12px]">›</span>
                    </button>
                  )}

                  <div className="mt-3 flex gap-2">
                    <a
                      href={`https://wa.me/55${rep.finder_contact.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-white py-2.5 text-center text-[13px] font-black text-orange-700 shadow-sm active:scale-95 transition-transform"
                    >
                      WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getToken();
                        if (!token) return;
                        await fetch(`${API_BASE_URL}/missing-pets/${rep.missing_pet_id}/found`, {
                          method: 'PATCH',
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        setConfirmedPetIds(ids => [...ids, rep.missing_pet_id]);
                        setTimeout(() => {
                          fetchFoundReports();
                          fetchNearbyAlerts();
                          fetchOwnMissingAlerts();
                        }, 3500);
                      }}
                      className="flex-1 rounded-xl bg-white/20 border border-white/40 py-2.5 text-center text-[13px] font-black text-white shadow-sm active:scale-95 transition-transform"
                    >
                      É meu pet
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const token = getToken();
                      if (!token) return;
                      await fetch(`${API_BASE_URL}/missing-pets/found-reports/${rep.report_id}/suspicious`, {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      fetchFoundReports();
                    }}
                    className="mt-2 w-full rounded-xl border border-red-200/30 bg-red-950/20 py-2 text-center text-[12px] font-semibold text-red-100 active:scale-95 transition-transform"
                  >
                    Marcar tentativa suspeita
                  </button>

                  {/* Rejeitar report — foto não bate */}
                  <button
                    type="button"
                    onClick={async () => {
                      const token = getToken();
                      if (!token) return;
                      await fetch(`${API_BASE_URL}/missing-pets/found-reports/${rep.report_id}/dismiss`, {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      fetchFoundReports();
                    }}
                    className="mt-2 w-full rounded-xl border border-white/20 py-2 text-center text-[12px] font-semibold text-white/60 active:scale-95 transition-transform"
                  >
                    Não parece ser meu pet — descartar este aviso
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Banner vermelho: pets sumidos na região (não são do usuário) —
            filtro extra por user_id além do que o backend já exclui, pra
            nunca mostrar pro próprio dono/família o alerta do próprio pet
            aqui (esse caso já tem o card certo "Baby está com alerta
            ativo" logo abaixo, ver ownMissingAlerts). */}
        {(() => {
          const visibleAlerts = nearbyAlerts.filter(a => !handledAlertIds.includes(a.id) && a.user_id !== loggedUserId);
          return visibleAlerts.length > 0 && (
          <div className="mb-3 space-y-2">
            {visibleAlerts.map((alert) => {
              const speciesLabel = alert.species === 'cat' ? 'Gato' : alert.species === 'dog' ? 'Cachorro' : 'Pet';
              const missingInfo = alert.missing_date
                ? `Desaparecido em ${alert.missing_date}${alert.missing_time ? ' às ' + alert.missing_time : ''}`
                : 'Desaparecido recentemente';
              return (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-rose-300 bg-gradient-to-br from-rose-500 to-rose-600 p-4 shadow-lg shadow-rose-900/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl">
                      {alert.species === 'cat' ? '🐱' : '🐶'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-rose-100">
                        Alerta · {speciesLabel} desaparecido
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-black leading-tight text-white">
                        {alert.pet_name} pode estar na sua região!
                      </h3>
                      {alert.last_seen_location && (
                        <p className="mt-1 text-[12px] font-medium text-rose-100">
                          Visto em: {alert.last_seen_location}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-rose-200">{missingInfo}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Dispensar alerta"
                      onClick={() => {
                        writeDismissedId(alert.id);
                        setHandledAlertIds(prev => [...new Set([...prev, alert.id])]);
                        setNearbyAlerts(prev => prev.filter(a => a.id !== alert.id));
                      }}
                      className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white/80 text-sm font-bold active:scale-90 transition-transform"
                    >
                      ×
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/achei-um-pet?id=${alert.id}`)}
                    className="mt-3 w-full rounded-xl bg-white py-2.5 text-[14px] font-black text-rose-600 shadow-sm active:scale-95 transition-transform"
                  >
                    Encontrei este pet
                  </button>
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* Pet Management - if pets exist */}
        {pets.length > 0 ? (
          <div className="mx-auto max-w-2xl space-y-3 rounded-[26px] border border-slate-200 bg-gradient-to-b from-[#F0F4F8] to-[#E2E8F0] p-2 shadow-2xl min-[390px]:space-y-4 min-[390px]:rounded-3xl min-[390px]:p-2.5 sm:p-4">
            {(() => {
              const currentPet = pets.find(p => p.pet_id === selectedPetId);
              if (!currentPet) return null;
              
              return (
                <div className="space-y-4">
                  {/* Banner: pet do próprio usuário com alerta ativo */}
                  {ownMissingAlerts.some(a => a.pet_id === selectedPetId) && (() => {
                    const missingAlert = ownMissingAlerts.find(a => a.pet_id === selectedPetId)!;
                    const reach = alertReach[missingAlert.id];
                    return (
                      <div className="rounded-[24px] border border-rose-400/50 bg-gradient-to-br from-rose-600 to-rose-700 px-4 py-3.5 shadow-lg shadow-rose-900/30">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl">🚨</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-black text-white leading-tight">
                              {currentPet.pet_name} está com alerta ativo
                            </p>
                            {reach ? (
                              <p className="text-[11px] text-rose-100 mt-0.5">
                                <span className="font-bold">{reach.notified_active}</span> pessoa{reach.notified_active !== 1 ? 's' : ''} com o recado no celular
                                {reach.new_in_radius > 0 && <span className="text-rose-200"> · {reach.new_in_radius} nova{reach.new_in_radius !== 1 ? 's' : ''} no raio</span>}
                              </p>
                            ) : (
                              <p className="text-[11px] text-rose-200 mt-0.5">A comunidade está sendo notificada na região</p>
                            )}
                          </div>
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-white animate-pulse" />
                        </div>

                        {/* Editar alerta */}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingAlertId(missingAlert.id)}
                            className="flex-1 rounded-xl border border-white/30 bg-white/15 py-2 text-center text-[13px] font-bold text-white active:scale-95 transition-transform"
                          >
                            Editar e reenviar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const token = getToken();
                              if (!token) return;
                              await fetch(`${API_BASE_URL}/missing-pets/${missingAlert.id}/found`, {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              fetchOwnMissingAlerts();
                              fetchFoundReports();
                              fetchNearbyAlerts();
                            }}
                            className="flex-1 rounded-xl border border-white/30 bg-white/10 py-2 text-center text-[13px] font-semibold text-white/80 active:scale-95 transition-transform"
                          >
                            Encontrei meu pet
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Camada de orientação do novato — some sozinha quando os
                      dados reais do pet resolvem os 5 itens, ou quando o tutor
                      fecha o card. Deriva progresso de vaccines/parasiteControls/
                      feedingPlan já carregados. */}
                  <OnboardingChecklistCard
                    petId={currentPet.pet_id}
                    petName={currentPet.pet_name}
                    petSex={currentPet.sex}
                    hasPet={pets.length > 0}
                    vaccinesCount={vaccines.length}
                    parasiteControls={parasiteControls}
                    feedingPlan={feedingPlan[currentPet.pet_id] ?? null}
                    onOpenFood={handleOpenFood}
                    onOpenVaccines={handleOpenVaccines}
                    onOpenFlea={handleOpenAntipulgas}
                    onOpenDewormer={handleOpenVermifugo}
                  />

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
                      upcomingCount={allUpcomingReminders.length}
                      upcomingUrgent={hasUrgentReminder}
                      onOpenUpcoming={() => setShowUpcomingSheet(true)}
                      basicCareAttentionPetNames={basicCareAttentionPetNames}
                    />

                  {/* Compartilhar cuidado — só para o dono do pet */}
                  {currentPet && loggedUserId && (currentPet.owner_user_id ?? loggedUserId) === loggedUserId && (
                    <div className="flex flex-col gap-2 px-2 pb-1 min-[390px]:px-3 sm:px-4 sm:pb-2">
                      <button
                        onClick={handleSharePet}
                        disabled={shareLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700 transition-opacity active:opacity-70 disabled:opacity-40 sm:rounded-2xl sm:py-2.5 sm:text-[13px]"
                      >
                        <span className="text-sm sm:text-base">🐾</span>
                        {shareLoading ? 'Gerando link...' : `Convidar família para cuidar de ${currentPet.pet_name}`}
                      </button>

                    </div>
                  )}

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
                    onOpenPetSumido={() => setShowPetSumidoSheet(true)}
                    onUpcomingCountChange={(_count, reminders) => setAllUpcomingReminders(reminders)}
                    onHealthItemClick={setHealthQuickAction}
                  />
                </PetTabs>
              </div>
              );
            })()}
          </div>
        ) : (
          <NoPetsCard
            onAddPet={openAddPetModal}
            onLogout={async () => { await logout(); router.push('/login'); }}
          />
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
          onGoHome={() => goHome(closeHealthModal)}
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
          selectedPetId={selectedPetId}
          handleSaveVaccine={handleSaveVaccine}
          vaccineFormSaving={vaccineFormSaving}
          pets={pets}
          closeCardAnalysis={closeCardAnalysis}
          reviewRegistros={reviewRegistros}
          setReviewConfirmed={setReviewConfirmed}
          addReviewRegistro={addReviewRegistro}
          removeReviewRegistro={removeReviewRegistro}
          updateReviewRegistro={updateReviewRegistro}
          mapNomeComercialToTipo={mapNomeComercialToTipo}
          handleImportAnalyzedVaccines={handleImportAnalyzedVaccines}
          importVaccineLoading={importVaccineLoading}
          reviewConfirmed={reviewConfirmed}
          onGoHome={() => goHome(() => { closeCardAnalysis(); closeVaccineSheet(); })}
          onAfterSave={() => setVaccineFormJustSaved(true)}
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
          parasiteControls={parasiteControls}
          groomingRecords={groomingRecords}
          petEvents={petEvents}
          vetHistoryDocs={vetHistoryDocs}
          onClose={closeVetHistoryModal}
          onOpenHealthOptions={openHealthOptionsFromVetHistory}
          onOpenGrooming={openGroomingFromVetHistory}
          onOpenFood={openFoodFromVetHistory}
          onOpenHealthTab={openHealthTabFromVetHistory}
          onOpenDocumentFolder={openVetHistoryDocumentFolder}
          onNavigateToSaude={navigateToSaudeFromVetHistory}
        />
      )}

      {/* Acervo legado de documentos — somente leitura/exclusão */}
      <HistoryDocumentsOverlay
        currentPet={currentPet}
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
        alertGroomingValue={selectedPetCardAlerts.grooming}
        colorVaccinesValue={selectedPetCardColors.vacinas}
        colorVermifugoValue={selectedPetCardColors.vermifugo}
        colorAntipulgasValue={selectedPetCardColors.antipulgas}
        colorColeiraValue={selectedPetCardColors.coleira}
        colorMedicationValue={medicationCardStatus.color}
        colorGroomingValue={selectedPetCardColors.grooming}
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
        onOpenGrooming={handleOpenGrooming}
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
          onGoHome={() => goHome(() => { setParasiteSheetInitialMode('view'); closeVermifugoSheet(); })}
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
          onGoHome={() => goHome(() => { setParasiteSheetInitialMode('view'); closeAntipulgasSheet(); })}
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
          onGoHome={() => goHome(() => { setParasiteSheetInitialMode('view'); closeColeiraSheet(); })}
          onRefresh={loadParasiteControls}
        />
      )}

      {showFoodSheet && currentPet && (
        <FoodItemSheet
          pet={currentPet}
          petPhotoUrl={(currentPet as { photo?: string | null; photo_url?: string | null }).photo ?? (currentPet as { photo_url?: string | null }).photo_url ?? null}
          onClose={() => { setFoodSheetInitialMode('view'); closeFoodSheet(); }}
          onGoHome={() => goHome(() => { setFoodSheetInitialMode('view'); closeFoodSheet(); })}
          onSaved={handleFoodSaved}
          initialMode={foodSheetInitialMode}
          racaoEventId={petEvents.find((e) => e.type === 'racao')?.id ?? null}
        />
      )}

      {showVaccineSheet && selectedPetId && (
        <VaccineItemSheet
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          petPhotoUrl={currentPet?.photo}
          vaccines={vaccines}
          initialMode={vaccineSheetInitialMode}
          onClose={() => { setVaccineSheetInitialMode('view'); closeVaccineSheet(); }}
          onGoHome={() => goHome(() => { setVaccineSheetInitialMode('view'); closeVaccineSheet(); })}
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
          cancelProcessCards={cancelProcessCards}
          forceJustSaved={vaccineFormJustSaved}
          onForceJustSavedConsumed={() => setVaccineFormJustSaved(false)}
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
          onGoHome={() => goHome(() => { setMedicationSheetInitialMode('view'); closeMedicationSheet(); })}
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
          onGoHome={() => goHome(closeGroomingSheet)}
          onRefresh={loadGroomingRecords}
        />
      )}

      {showUpcomingSheet && currentPet && (
        <UpcomingEventsSheet
          open={showUpcomingSheet}
          onClose={() => setShowUpcomingSheet(false)}
          reminders={allUpcomingReminders}
          petName={currentPet.pet_name}
          onSelect={(r) => {
            setShowUpcomingSheet(false);
            const target = r.action_target;
            if (QUICK_ACTION_TARGETS.has(target)) {
              // r.status/r.diff reflect the real reminder — this used to be
              // hardcoded to 'upcoming' regardless, so tapping an overdue
              // item from the bell showed "EM BREVE" instead of "ATRASADO".
              setHealthQuickAction({
                action_target: target,
                label: r.label,
                pet_id: currentPet.pet_id,
                pet_name: currentPet.pet_name,
                status: r.status,
                days_overdue: r.diff < 0 ? Math.abs(r.diff) : undefined,
                source_record_id: r.source_record_id,
              });
            } else if (target === 'health/events') {
              handleOpenEvents();
            } else if (target === 'health/grooming') {
              handleOpenGrooming();
            } else if (target === 'health/food') {
              handleOpenFood();
            }
          }}
        />
      )}

      {showPetSumidoSheet && currentPet && (
        <PetSumidoSheet
          pet={currentPet}
          petPhotoUrl={currentPet.photo ? getPhotoUrl(currentPet.photo) : null}
          onClose={() => setShowPetSumidoSheet(false)}
          onGoHome={() => goHome(() => setShowPetSumidoSheet(false))}
        />
      )}

      {/* Sheet de edição do alerta ativo */}
      {editingAlertId && currentPet && (() => {
        const alert = ownMissingAlerts.find(a => a.id === editingAlertId);
        if (!alert) return null;
        return (
          <PetSumidoSheet
            pet={currentPet}
            petPhotoUrl={alert.photo_url ? getPhotoUrl(alert.photo_url) : (currentPet.photo ? getPhotoUrl(currentPet.photo) : null)}
            editAlertId={editingAlertId}
            initialContact={alert.contact ?? ''}
            initialLocation={alert.last_seen_location ?? ''}
            initialCharacteristics={alert.characteristics ?? ''}
            initialMissingDate={alert.missing_date ?? undefined}
            initialMissingTime={alert.missing_time ?? undefined}
            onClose={() => { setEditingAlertId(null); fetchOwnMissingAlerts(); }}
            onGoHome={() => goHome(() => { setEditingAlertId(null); fetchOwnMissingAlerts(); })}
          />
        );
      })()}

      <HomeEmergencySheet
        open={showEmergencySheet}
        onClose={() => setShowEmergencySheet(false)}
      />

      {/* Modal de fotos do achador */}
      {(photosModal || photosModalLoading) && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/80 backdrop-blur-sm" onClick={closePhotosModal}>
          <div
            className="mt-auto bg-[#0F0D0B] rounded-t-[28px] max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <p className="font-black text-white text-[16px]">Provas do achador</p>
              <button
                type="button"
                onClick={closePhotosModal}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60"
              >×</button>
            </div>
            <div className="px-5 py-5 space-y-4 pb-8">
              {photosModalLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : photosModal && (
                <>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-black uppercase tracking-widest text-white">PETMOL Protege</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                        photosModal.proof_verified ? 'bg-emerald-300 text-emerald-950' : 'bg-amber-200 text-amber-950'
                      }`}>
                        {photosModal.proof_verified ? 'Código validado' : 'Código pendente'}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-white/65">
                      Analise o vídeo antes de liberar contato. Não faça pagamento antecipado e não negocie fora do PETMOL.
                    </p>
                    {photosModal.risk_label && (
                      <p className="mt-2 text-[12px] leading-snug text-white/60">{photosModal.risk_label}</p>
                    )}
                  </div>
                  {photosModal.score != null && (
                    <div className={`rounded-2xl px-4 py-4 flex items-center gap-4 ${
                      photosModal.score >= 90 ? 'bg-emerald-900/50 border border-emerald-600/40' :
                      photosModal.score >= 75 ? 'bg-amber-900/50 border border-amber-600/40' :
                      'bg-rose-900/50 border border-rose-600/40'
                    }`}>
                      <div className={`w-28 h-28 rounded-full flex items-center justify-center border-[3px] flex-shrink-0 ${
                        photosModal.score >= 90 ? 'border-emerald-400 bg-emerald-800/50' :
                        photosModal.score >= 75 ? 'border-amber-400 bg-amber-800/50' :
                        'border-rose-400 bg-rose-800/50'
                      }`}>
                        <span className="text-[44px] font-black text-white leading-none">{photosModal.score}%</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-black text-white leading-tight">
                          {photosModal.confidence_label || (
                            photosModal.score >= 90 ? 'Muito parecido - confirme com cuidado' :
                            photosModal.score >= 75 ? 'Parecido - precisa confirmação' :
                            'Baixa confiança - revise manualmente'
                          )}
                        </p>
                        {photosModal.analysis && (
                          <p className="text-[12px] text-white/60 mt-1 leading-snug">{photosModal.analysis}</p>
                        )}
                        <p className="text-[11px] text-white/40 mt-1">A IA faz triagem. Você decide se é o seu pet.</p>
                      </div>
                    </div>
                  )}
                  {(photosModal.video_url || photosModalVideoSrc) && (
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-3">
                      <p className="mb-2 text-[12px] font-black uppercase tracking-widest text-amber-200">
                        Prova dinâmica em vídeo
                      </p>
                      {photosModal.proof_challenge && (
                        <p className="mb-2 text-[12px] leading-snug text-amber-100/80">
                          Desafio pedido: {photosModal.proof_challenge}
                        </p>
                      )}
                      <div className="mb-3 rounded-xl bg-black/20 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-100/75">
                        Confira se o pet aparece se mexendo, se o desafio foi cumprido e se o ambiente parece atual. Se algo parecer estranho, marque como suspeito.
                      </div>
                      {photosModalVideoSrc ? (
                        <video
                          src={photosModalVideoSrc}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-[420px] w-full rounded-xl bg-black object-contain"
                        />
                      ) : photosModalVideoError ? (
                        <div className="flex min-h-40 items-center justify-center rounded-xl bg-black/30 px-4 text-center text-[12px] font-bold text-amber-100/70">
                          Não foi possível carregar o vídeo protegido. Feche e abra as provas novamente.
                        </div>
                      ) : (
                        <div className="flex min-h-40 items-center justify-center rounded-xl bg-black/30 text-[12px] font-bold text-amber-100/70">
                          Carregando vídeo protegido...
                        </div>
                      )}
                      {photosModalVideoSrc && (
                        <a
                          href={photosModalVideoSrc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex text-[12px] font-black text-amber-100 underline decoration-amber-300/50 underline-offset-4"
                        >
                          Abrir vídeo em tela cheia
                        </a>
                      )}
                    </div>
                  )}
                  <div className={`grid gap-3 ${photosModal.photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {photosModal.photos.map((photo, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={i} src={resolvePetPhotoUrl(photo) ?? photo} alt={`Foto ${i + 1}`} className="w-full rounded-2xl object-cover border border-white/10" style={{ maxHeight: 340 }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
