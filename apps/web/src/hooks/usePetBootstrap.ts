import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import type { PetHealthProfile } from '@/lib/petHealth';

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
        console.log('[FORÇA] Usuário logado detectado:', tutor.email);
        setIsChecking(false);

        try {
          const savedToken = getToken();
          const response = await fetch(`${API_BASE_URL}/pets`, {
            credentials: 'include',
            headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
          });

          try {
            const savedToken2 = getToken();
            const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
              credentials: 'include',
              headers: savedToken2 ? { Authorization: `Bearer ${savedToken2}` } : {},
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              setTutorName(meData.name || '');
              if (meData.id) setLoggedUserId(meData.id);
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
            console.log('[FORÇA] Pets encontrados:', backendPets.length);
            const convertedPets = normalizeBackendPetProfiles(backendPets);
            setPets(convertedPets);
            if (convertedPets.length > 0) {
              setSelectedPetId((prev) => resolveSelectedPetId(convertedPets, prev));
              console.log('[FORÇA] Pets carregados:', convertedPets.map((p: PetHealthProfile) => p.pet_name));
            } else {
              console.log('[FORÇA] Nenhum pet encontrado — redirecionando para cadastro');
              router.push('/register-pet');
            }
          } else {
            if (response.status === 401 || response.status === 403) {
              router.replace('/login');
            } else {
              router.push('/register-pet');
            }
          }
        } catch (error) {
          console.error('[FORÇA] Erro ao carregar pets:', error);
          router.replace('/login');
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

      try {
        const tutorResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (tutorResponse.ok) {
          const tutorData = await tutorResponse.json();
          setTutorName(tutorData.name || '');
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
        console.log('[LoadPets] Pets do backend:', backendPets);
        console.log('[LoadPets] Número de pets recebidos:', backendPets.length);

        const convertedPets = normalizeBackendPetProfiles(backendPets);

        convertedPets.sort((a, b) => {
          const aName = (a.pet_name || '').toLowerCase();
          const bName = (b.pet_name || '').toLowerCase();
          if (aName === 'baby') return -1;
          if (bName === 'baby') return 1;
          return 0;
        });
        setPets(convertedPets);
        if (convertedPets.length > 0) {
          console.log('[LoadPets] SUCESSO - Carregados', convertedPets.length, 'pets');
          setSelectedPetId((prev) => resolveSelectedPetId(convertedPets, prev));
        } else {
          console.log('[LoadPets] Nenhum pet — redirecionando para cadastro');
          router.push('/register-pet');
        }
        setIsChecking(false);
      } catch (error) {
        console.error('[LoadPets] ERRO ao carregar pets do backend:', error);
        setPets([]);
        router.replace('/login');
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
