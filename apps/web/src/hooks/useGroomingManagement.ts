import { useState, useRef } from 'react';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { requestUserConfirmation, showAppToast, showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { addGroomingRecord, updateGroomingRecord, deleteGroomingRecord } from '@/services/groomingService';
import type { GroomingRecord, GroomingType, PlaceDetails } from '@/lib/types/home';
import type { GroomingFormData } from '@/lib/types/homeForms';
import type { PetHealthProfile } from '@/lib/petHealth';

interface UseGroomingManagementParams {
  selectedPetId: string | null;
  pets: PetHealthProfile[];
  setPets: React.Dispatch<React.SetStateAction<PetHealthProfile[]>>;
  fetchPetEvents: (petId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const createLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const DEFAULT_FORM: GroomingFormData = {
  type: 'bath' as GroomingType,
  date: '',
  scheduled_time: '',
  location: '',
  location_address: '',
  location_phone: '',
  location_place_id: '',
  cost: 0,
  notes: '',
  frequency_days: 14,
  reminder_enabled: true,
  alert_days_before: 3,
};

export function useGroomingManagement({
  selectedPetId,
  pets,
  setPets,
  fetchPetEvents,
  t,
}: UseGroomingManagementParams) {
  const [groomingRecords, setGroomingRecords] = useState<GroomingRecord[]>([]);
  const [editingGrooming, setEditingGrooming] = useState<GroomingRecord | null>(null);
  const [groomingDueAlerts, setGroomingDueAlerts] = useState<
    { petName: string; type: string; daysOverdue: number }[]
  >([]);
  const [groomingFormData, setGroomingFormData] = useState<GroomingFormData>({
    ...DEFAULT_FORM,
    date: localTodayISO(),
  });
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceDetails[]>([]);
  const [showPlaceSuggestions, setShowPlaceSuggestions] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [placeSearchTimeout, setPlaceSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const placeAbortController = useRef<AbortController | null>(null);

  const loadGroomingRecords = async () => {
    const pet = pets.find((p) => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    try {
      const savedToken = getToken();
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/grooming`, {
        headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : undefined,
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        type: GroomingType;
        date?: string | null;
        scheduled_time?: string;
        location?: string | null;
        location_address?: string | null;
        location_phone?: string | null;
        location_place_id?: string | null;
        groomer?: string | null;
        cost?: number;
        notes?: string | null;
        next_recommended_date?: string | null;
        frequency_days: number;
        reminder_enabled?: boolean;
        alert_days_before?: number;
      }> = await res.json();
      const _d = (raw: string | null | undefined): string =>
        raw ? raw.replace('T', ' ').split(' ')[0] : '';
      const records: GroomingRecord[] = data.map(
        (g) =>
          ({
            id: g.id,
            pet_id: pet.pet_id,
            type: g.type,
            date: _d(g.date),
            scheduled_time: g.scheduled_time,
            location: g.location || '',
            location_address: g.location_address || '',
            location_phone: g.location_phone || '',
            location_place_id: g.location_place_id || '',
            groomer: g.groomer || '',
            cost: g.cost,
            notes: g.notes || '',
            next_recommended_date: g.next_recommended_date ? _d(g.next_recommended_date) : undefined,
            frequency_days: g.frequency_days,
            reminder_enabled: g.reminder_enabled,
            alert_days_before: g.alert_days_before,
          }) as GroomingRecord,
      );
      const sorted = records.sort(
        (a, b) => createLocalDate(b.date).getTime() - createLocalDate(a.date).getTime(),
      );
      setGroomingRecords(sorted);
      setPets((prevPets) =>
        prevPets.map((p) => (p.pet_id === pet.pet_id ? { ...p, grooming_records: sorted } : p)),
      );

      // Banho/tosa fica como histórico/serviço, sem alerta ou cobrança de controle ativo.
      setGroomingDueAlerts([]);
    } catch {}
  };

  const searchPlaces = async (query: string) => {
    if (placeSearchTimeout) clearTimeout(placeSearchTimeout);
    if (placeAbortController.current) placeAbortController.current.abort();

    if (!query || query.length < 3) {
      setPlaceSuggestions([]);
      setShowPlaceSuggestions(false);
      return;
    }

    const timeout = setTimeout(async () => {
      const controller = new AbortController();
      placeAbortController.current = controller;
      setSearchingPlaces(true);
      try {
        const response = await fetch(`/api/places/search?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setPlaceSuggestions(data.results || []);
          setShowPlaceSuggestions((data.results?.length ?? 0) > 0);
        }
      } catch (error: unknown) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          console.error('[places/search] Erro:', error);
        }
      } finally {
        setSearchingPlaces(false);
      }
    }, 600);

    setPlaceSearchTimeout(timeout);
  };

  const selectPlace = async (place: PlaceDetails) => {
    setGroomingFormData((prev) => ({
      ...prev,
      location: place.name,
      location_address: place.formatted_address,
      location_phone: '',
      location_place_id: place.place_id,
    }));
    setShowPlaceSuggestions(false);
    setPlaceSuggestions([]);

    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(place.place_id)}`);
      if (res.ok) {
        const { result } = await res.json();
        if (result) {
          setGroomingFormData((prev) => ({
            ...prev,
            location_phone: result.formatted_phone_number || '',
          }));
        }
      }
    } catch {
      // silencioso — telefone fica vazio
    }
  };

  const handleSaveGrooming = async () => {
    const pet = pets.find((p) => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;

    if (!groomingFormData.date) {
      showBlockingNotice('Por favor, preencha a data do serviço');
      return;
    }
    if (groomingFormData.cost !== undefined && groomingFormData.cost < 0) {
      showBlockingNotice('O valor do serviço não pode ser negativo');
      return;
    }

    const frequencyMap: Record<string, number> = { bath: 14, grooming: 45, bath_grooming: 45 };
    const frequency = groomingFormData.frequency_days || frequencyMap[groomingFormData.type];
    const nextRecommended = createLocalDate(groomingFormData.date);
    nextRecommended.setDate(nextRecommended.getDate() + frequency);

    try {
      let success = false;

      if (editingGrooming) {
        const updatedRecord: Partial<GroomingRecord> = {
          type: groomingFormData.type,
          date: groomingFormData.date,
          scheduled_time: groomingFormData.scheduled_time || undefined,
          location: groomingFormData.location,
          location_address: groomingFormData.location_address,
          location_phone: groomingFormData.location_phone,
          location_place_id: groomingFormData.location_place_id,
          cost: groomingFormData.cost,
          notes: groomingFormData.notes,
          frequency_days: frequency,
          next_recommended_date: dateToLocalISO(nextRecommended),
          reminder_enabled: groomingFormData.reminder_enabled,
          alert_days_before: groomingFormData.alert_days_before,
        };

        success = await updateGroomingRecord(pet.pet_id, editingGrooming.id, updatedRecord);
        if (success) {
          setGroomingRecords((prev) =>
            prev.map((r) => (r.id === editingGrooming.id ? { ...r, ...updatedRecord } : r)),
          );
          showBlockingNotice('✅ Registro atualizado com sucesso!');
        }
      } else {
        const newRecord: GroomingRecord = {
          id: `groom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pet_id: pet.pet_id,
          type: groomingFormData.type,
          date: groomingFormData.date,
          scheduled_time: groomingFormData.scheduled_time || undefined,
          location: groomingFormData.location,
          location_address: groomingFormData.location_address,
          location_phone: groomingFormData.location_phone,
          location_place_id: groomingFormData.location_place_id,
          cost: groomingFormData.cost,
          notes: groomingFormData.notes,
          frequency_days: frequency,
          next_recommended_date: dateToLocalISO(nextRecommended),
          reminder_enabled: groomingFormData.reminder_enabled,
          alert_days_before: groomingFormData.alert_days_before,
        };

        success = await addGroomingRecord(pet.pet_id, newRecord);
        if (success) {
          showBlockingNotice('✅ Registro de banho/tosa salvo com sucesso!');
        }
      }

      if (success) {
        await loadGroomingRecords();
        setGroomingFormData({ ...DEFAULT_FORM, date: localTodayISO() });
        setEditingGrooming(null);
        if (selectedPetId) fetchPetEvents(selectedPetId);
      } else {
        showBlockingNotice(t('grooming.error_save'));
      }
    } catch (error) {
      console.error('Erro ao salvar registro de grooming:', error);
      showBlockingNotice(t('grooming.error_save'));
    }
  };

  const handleEditGrooming = (record: GroomingRecord) => {
    setEditingGrooming(record);
    setGroomingFormData({
      type: record.type,
      date: record.date,
      scheduled_time: record.scheduled_time || '',
      location: record.location || '',
      location_address: record.location_address || '',
      location_phone: record.location_phone || '',
      location_place_id: record.location_place_id || '',
      cost: record.cost || 0,
      notes: record.notes || '',
      frequency_days: record.frequency_days || 14,
      reminder_enabled: record.reminder_enabled ?? true,
      alert_days_before: record.alert_days_before ?? 3,
    });
  };

  const handleDeleteGrooming = async (record: GroomingRecord) => {
    const typeText =
      record.type === 'bath'
        ? t('grooming.bath').toLowerCase()
        : record.type === 'grooming'
          ? t('grooming.grooming').toLowerCase()
          : t('grooming.bath_and_grooming');

    const accepted = await requestUserConfirmation(
      t('grooming.delete_confirm', { type: typeText }),
      {
        title: 'Excluir registro de banho e tosa',
        tone: 'danger',
        confirmLabel: 'Excluir registro',
      },
    );
    if (!accepted) return;

    try {
      const pet = pets.find((p) => p.pet_id === selectedPetId) || pets[0];
      if (!pet) return;

      const success = await deleteGroomingRecord(pet.pet_id, record.id);
      if (success) {
        setGroomingRecords((prev) => prev.filter((r) => r.id !== record.id));
        showAppToast('Registro removido.');
        await loadGroomingRecords();
      } else {
        showBlockingNotice(t('grooming.error_delete'));
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      showBlockingNotice(t('grooming.error_delete'));
    }
  };

  const handleCancelEditGrooming = () => {
    setEditingGrooming(null);
    setGroomingFormData({ ...DEFAULT_FORM, date: localTodayISO() });
  };

  return {
    groomingRecords,
    setGroomingRecords,
    editingGrooming,
    setEditingGrooming,
    groomingDueAlerts,
    setGroomingDueAlerts,
    groomingFormData,
    setGroomingFormData,
    placeSuggestions,
    setPlaceSuggestions,
    showPlaceSuggestions,
    setShowPlaceSuggestions,
    searchingPlaces,
    placeAbortController,
    loadGroomingRecords,
    searchPlaces,
    selectPlace,
    handleSaveGrooming,
    handleEditGrooming,
    handleDeleteGrooming,
    handleCancelEditGrooming,
  };
}
