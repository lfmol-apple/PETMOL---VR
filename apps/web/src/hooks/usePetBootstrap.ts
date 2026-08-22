import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import type { PetHealthProfile } from '@/lib/petHealth';

/** Re-envia a subscription de push ao backend uma vez por sessão do browser.
 *  Garante que o servidor sempre tem um endpoint válido mesmo após deploys. */
async function syncPushSubscriptionOnce(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  const SESSION_KEY = 'petmol_push_synced';
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, '1');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`${API_BASE_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  } catch { /* silent — push sync nunca bloqueia o boot */ }
}

export function usePetBootstrap() {
  const router = useRouter();
  const { tutor, token, isLoading, isAuthenticated } = useAuth();

  const [isChecking, setIsChecking] = useState(false);
  const [pets, setPets] = useState<PetHealthProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [tutorName, setTutorName] = useState<string>('');
  const [loggedUserId, setLoggedUserId] = useState<string>('');
  const [familyOwnerNames] = useState<Record<string, string>>({});
  const [tutorCheckinDay, setTutorCheckinDay] = useState<number>(5);
  const [tutorCheckinHour, setTutorCheckinHour] = useState<number>(9);
  const [tutorCheckinMinute, setTutorCheckinMinute] = useState<number>(0);
  const [photoTimestamps, setPhotoTimestamps] = useState<Record<string, number>>({});

  const readDeepLinkPetId = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return new URLSearchParams(window.location.search).get('petId');
    } catch {
      return null;
    }
  };

  /** Pets do próprio dono aparecem antes dos compartilhados com ele (conta
   *  família) — nunca o contrário, senão o "pet atual" default pode virar
   *  um pet de outra pessoa só porque a API devolveu ele primeiro. */
  const sortOwnedPetsFirst = (
    petsToSort: PetHealthProfile[],
    currentLoggedUserId: string,
  ): PetHealthProfile[] => {
    if (!currentLoggedUserId) return petsToSort;
    return [...petsToSort].sort((a, b) => {
      const aOwned = !a.owner_user_id || a.owner_user_id === currentLoggedUserId;
      const bOwned = !b.owner_user_id || b.owner_user_id === currentLoggedUserId;
      if (aOwned === bOwned) return 0;
      return aOwned ? -1 : 1;
    });
  };

  const resolveSelectedPetId = (
    availablePets: PetHealthProfile[],
    currentSelectedId: string | null,
  ): string | null => {
    if (availablePets.length === 0) return null;
    const deepLinkPetId = readDeepLinkPetId();
    if (deepLinkPetId && availablePets.some((pet) => pet.pet_id === deepLinkPetId)) {
      return deepLinkPetId;
    }
    if (currentSelectedId && availablePets.some((pet) => pet.pet_id === currentSelectedId)) {
      return currentSelectedId;
    }
    return availablePets[0]?.pet_id ?? null;
  };

  // ── Efeito 1: forceLoadPets — disparado quando tutor (AuthContext) muda ──
  useEffect(() => {
    const forceLoadPets = async () => {
      if (tutor && tutor.email) {
        setIsChecking(false);

        try {
          const savedToken = getToken();
          const response = await fetch(`${API_BASE_URL}/pets`, {
            credentials: 'include',
            headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
          });

          let meIdForSort = '';
          try {
            const savedToken2 = getToken();
            const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
              credentials: 'include',
              headers: savedToken2 ? { Authorization: `Bearer ${savedToken2}` } : {},
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              setTutorName(meData.name || '');
              if (meData.id) {
                setLoggedUserId(meData.id);
                meIdForSort = meData.id;
              }
              if (typeof meData.monthly_checkin_day === 'number') {
                setTutorCheckinDay(meData.monthly_checkin_day);
              }
              if (typeof meData.monthly_checkin_hour === 'number') {
                setTutorCheckinHour(meData.monthly_checkin_hour);
              }
              if (typeof meData.monthly_checkin_minute === 'number') {
                setTutorCheckinMinute(meData.monthly_checkin_minute);
              }
            }
          } catch (_) {}

          if (response.ok) {
            const backendPets = await response.json();
            const convertedPets = sortOwnedPetsFirst(normalizeBackendPetProfiles(backendPets), meIdForSort);
            setPets(convertedPets);
            if (convertedPets.length > 0) {
              setSelectedPetId((prev) => resolveSelectedPetId(convertedPets, prev));
            }
            // sem pets: home exibe estado vazio com botão "Adicionar pet"
          } else {
            if (response.status === 401 || response.status === 403) {
              router.replace('/login');
            }
            // Erros genéricos (5xx, etc.) — não redirecionar; manter tela atual
          }
        } catch {
          // Erro de rede — usuário está logado, não deslogar; manter na tela atual
          setIsChecking(false);
        }
      }
    };

    forceLoadPets();
  }, [tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efeito 2: loadPets — disparado por token/isAuthenticated ──────────────
  useEffect(() => {
    const loadPets = async () => {
      if (!token) {
        if (!isLoading) {
          router.replace('/login');
        }
        return;
      }

      localStorage.removeItem('petmol_pets');
      localStorage.removeItem('pet_health_profiles');
      localStorage.removeItem('petmol_cached_pets');

      void syncPushSubscriptionOnce(token);

      try {
        const tutorResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        let meIdForSort = '';
        if (tutorResponse.ok) {
          const tutorData = await tutorResponse.json();
          setTutorName(tutorData.name || '');
          if (tutorData.id) {
            setLoggedUserId(tutorData.id);
            meIdForSort = tutorData.id;
          }
          if (typeof tutorData.monthly_checkin_day === 'number') {
            setTutorCheckinDay(tutorData.monthly_checkin_day);
          }
          if (typeof tutorData.monthly_checkin_hour === 'number') {
            setTutorCheckinHour(tutorData.monthly_checkin_hour);
          }
          if (typeof tutorData.monthly_checkin_minute === 'number') {
            setTutorCheckinMinute(tutorData.monthly_checkin_minute);
          }
        }

        const response = await fetch(`${API_BASE_URL}/pets`, {
          credentials: 'include',
          ...(token && { headers: { Authorization: `Bearer ${token}` } }),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace('/login');
            return;
          }
          throw new Error('Erro ao carregar pets');
        }

        const backendPets = await response.json();
        const convertedPets = sortOwnedPetsFirst(normalizeBackendPetProfiles(backendPets), meIdForSort);
        setPets(convertedPets);
        if (convertedPets.length > 0) {
          setSelectedPetId((prev) => resolveSelectedPetId(convertedPets, prev));
        }
        // sem pets: home exibe estado vazio com botão "Adicionar pet"
        setIsChecking(false);
      } catch {
        // Erro de rede — não redirecionar para login; usuário pode ter conexão instável
        setPets([]);
        setIsChecking(false);
      }
    };

    loadPets();
  }, [isAuthenticated, token, API_BASE_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isChecking,
    pets,
    setPets,
    selectedPetId,
    setSelectedPetId,
    tutorName,
    setTutorName,
    loggedUserId,
    setLoggedUserId,
    familyOwnerNames,
    tutorCheckinDay,
    setTutorCheckinDay,
    tutorCheckinHour,
    setTutorCheckinHour,
    tutorCheckinMinute,
    setTutorCheckinMinute,
    photoTimestamps,
    setPhotoTimestamps,
  };
}
