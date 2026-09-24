import { fetchMe } from '@/lib/fetchMe';
import { fetchPets } from '@/lib/fetchPets';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import type { PetHealthProfile } from '@/lib/petHealth';

// Sem timeout, um fetch que trava (comum no WKWebView do iOS quando o app
// é suspenso em segundo plano no meio da requisição) nunca resolve nem
// rejeita — o `await` fica pendurado pra sempre e `isChecking` nunca vira
// false, prendendo a Home na splash de carregamento indefinidamente. Mesmo
// padrão de timeout já usado em AuthContext.tsx.
const BOOTSTRAP_FETCH_TIMEOUT_MS = 15_000;

function readDeepLinkPetIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('petId');
  } catch {
    return null;
  }
}

function readCachedPetsFromStorage(): PetHealthProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('petmol_cached_pets');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PetHealthProfile[] : [];
  } catch {
    return [];
  }
}

function readDeepLinkedCachedPetsFromStorage(): PetHealthProfile[] {
  const deepLinkPetId = readDeepLinkPetIdFromLocation();
  if (!deepLinkPetId) return [];
  const cachedPets = readCachedPetsFromStorage();
  return cachedPets.some((pet) => pet.pet_id === deepLinkPetId) ? cachedPets : [];
}

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
  const initialDeepLinkPetId = readDeepLinkPetIdFromLocation();
  const initialDeepLinkedCachedPets = readDeepLinkedCachedPetsFromStorage();

  // Começa true: o boot splash (gated por isLoading || isChecking na Home)
  // precisa cobrir toda a janela entre "auth resolvido" e "pets carregados"
  // — antes ficava false por padrão e nunca era setado true em lugar
  // nenhum, então a Home renderizava com pets=[] (estado vazio "Quem é o
  // seu pet?", depois o checklist de onboarding) até os dados chegarem.
  const [isChecking, setIsChecking] = useState(initialDeepLinkedCachedPets.length === 0);
  const [petsLoadFailed, setPetsLoadFailed] = useState(false);
  const [pets, setPets] = useState<PetHealthProfile[]>(initialDeepLinkedCachedPets);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(
    initialDeepLinkPetId && initialDeepLinkedCachedPets.some((pet) => pet.pet_id === initialDeepLinkPetId)
      ? initialDeepLinkPetId
      : null,
  );
  const [tutorName, setTutorName] = useState<string>('');
  const [loggedUserId, setLoggedUserId] = useState<string>('');
  const [familyOwnerNames] = useState<Record<string, string>>({});
  const [tutorCheckinDay, setTutorCheckinDay] = useState<number>(5);
  const [tutorCheckinHour, setTutorCheckinHour] = useState<number>(9);
  const [tutorCheckinMinute, setTutorCheckinMinute] = useState<number>(0);
  const [photoTimestamps, setPhotoTimestamps] = useState<Record<string, number>>({});

  const readDeepLinkPetId = (): string | null => {
    return readDeepLinkPetIdFromLocation();
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

  const readCachedPets = (): PetHealthProfile[] => {
    return readCachedPetsFromStorage();
  };

  const writeCachedPets = (loadedPets: PetHealthProfile[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('petmol_cached_pets', JSON.stringify(loadedPets));
    } catch {}
  };

  const applyLoadedPets = (
    loadedPets: PetHealthProfile[],
    currentLoggedUserId: string,
    failed = false,
  ) => {
    const sortedPets = sortOwnedPetsFirst(loadedPets, currentLoggedUserId);
    setPets(sortedPets);
    setSelectedPetId((prev) => resolveSelectedPetId(sortedPets, prev));
    if (!failed) writeCachedPets(sortedPets);
    setPetsLoadFailed(failed);
    setIsChecking(false);
  };

  const loadCachedPetsAfterFailure = (currentLoggedUserId: string) => {
    const cachedPets = sortOwnedPetsFirst(readCachedPets(), currentLoggedUserId);
    if (cachedPets.length > 0) {
      applyLoadedPets(cachedPets, currentLoggedUserId, true);
      return;
    }
    setPetsLoadFailed(true);
    setIsChecking(false);
  };

  const loadDeepLinkedPetFallback = async (
    authToken: string,
    currentLoggedUserId: string,
  ): Promise<PetHealthProfile[] | null> => {
    const deepLinkPetId = readDeepLinkPetId();
    if (!deepLinkPetId) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/pets/${encodeURIComponent(deepLinkPetId)}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${authToken}` },
        signal: AbortSignal.timeout(BOOTSTRAP_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const backendPet = await response.json();
      return sortOwnedPetsFirst(normalizeBackendPetProfiles([backendPet]), currentLoggedUserId);
    } catch {
      return null;
    }
  };

  // ── Efeito 1: forceLoadPets — disparado quando tutor (AuthContext) muda ──
  useEffect(() => {
    const forceLoadPets = async () => {
      if (tutor && tutor.email) {
        try {
          const savedToken = getToken();
          const response = await fetchPets(API_BASE_URL, savedToken, BOOTSTRAP_FETCH_TIMEOUT_MS);

          let meIdForSort = '';
          try {
            const savedToken2 = getToken();
            const meRes = await fetchMe(API_BASE_URL, savedToken2, BOOTSTRAP_FETCH_TIMEOUT_MS);
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
          } catch {}

          if (response.ok) {
            const backendPets = await response.json();
            let convertedPets = sortOwnedPetsFirst(normalizeBackendPetProfiles(backendPets), meIdForSort);
            if (convertedPets.length === 0 && savedToken) {
              convertedPets = await loadDeepLinkedPetFallback(savedToken, meIdForSort) || convertedPets;
            }
            applyLoadedPets(convertedPets, meIdForSort);
          } else {
            if (response.status === 401 || response.status === 403) {
              router.replace('/login');
              setIsChecking(false);
              return;
            }
            // Erros genéricos (5xx, etc.) — não redirecionar; manter tela atual
            loadCachedPetsAfterFailure(meIdForSort);
          }
        } catch {
          // Erro de rede — usuário está logado, não deslogar; manter na tela atual
          loadCachedPetsAfterFailure('');
        }
      } else if (!isLoading && !token) {
        setIsChecking(false);
      }
    };

    forceLoadPets();
  }, [tutor, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efeito 2: loadPets — disparado por token/isAuthenticated ──────────────
  useEffect(() => {
    const loadPets = async () => {
      if (!token) {
        if (!isLoading) {
          router.replace('/login');
          setIsChecking(false);
        }
        return;
      }

      void syncPushSubscriptionOnce(token);

      try {
        // /auth/me e /pets em PARALELO (antes /pets só saía depois de /auth/me voltar — uma
        // ida e volta de rede a mais no caminho crítico da abertura). /auth/me falhar não
        // impede a lista de pets (só perde a ordenação "meus pets primeiro").
        const [tutorResponse, response] = await Promise.all([
          fetchMe(API_BASE_URL, token, BOOTSTRAP_FETCH_TIMEOUT_MS).catch(() => null),
          fetchPets(API_BASE_URL, token, BOOTSTRAP_FETCH_TIMEOUT_MS),
        ]);

        let meIdForSort = '';
        if (tutorResponse?.ok) {
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

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace('/login');
            setIsChecking(false);
            return;
          }
          throw new Error('Erro ao carregar pets');
        }

        const backendPets = await response.json();
        let convertedPets = sortOwnedPetsFirst(normalizeBackendPetProfiles(backendPets), meIdForSort);
        if (convertedPets.length === 0) {
          convertedPets = await loadDeepLinkedPetFallback(token, meIdForSort) || convertedPets;
        }
        applyLoadedPets(convertedPets, meIdForSort);
      } catch {
        // Erro de rede — não redirecionar para login; usuário pode ter conexão instável
        loadCachedPetsAfterFailure('');
      }
    };

    loadPets();
  }, [isAuthenticated, token, isLoading, API_BASE_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isChecking,
    petsLoadFailed,
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
