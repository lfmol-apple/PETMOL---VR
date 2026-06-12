'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';

interface UseHomeMedicationActionsParams {
  selectedPetId: string | null;
  eventFormData: EventFormState;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  setEventSaving: (value: boolean) => void;
  attachDocFiles: File[];
  setAttachDocFiles: (files: File[]) => void;
  editingEventId: string | null;
  setEditingEventId: (value: string | null) => void;
  fetchPetEvents: (petId: string) => void;
}

const buildMedicationDefaults = (reminderEnabled: boolean): EventFormState => ({
  type: 'medicacao',
  scheduled_at: new Date().toISOString().slice(0, 16),
  title: '',
  location_name: '',
  professional_name: '',
  cost: '',
  notes: '',
  next_due_date: '',
  dose: '',
  frequency: '2x_dia',
  route: 'oral',
  reminder_enabled: reminderEnabled,
  reminder_date: '',
  reminder_time: '08:00',
  reminder_times: ['08:00'],
  treatment_days: '',
  result: '',
  severity: 'moderada',
});

export function useHomeMedicationActions({
  selectedPetId,
  eventFormData,
  setEventFormData,
  setEventSaving,
  attachDocFiles,
  setAttachDocFiles,
  editingEventId,
  setEditingEventId,
  fetchPetEvents,
}: UseHomeMedicationActionsParams) {
  const _resetForm = useCallback(
    (reminderEnabled: boolean) => {
      setEventFormData(buildMedicationDefaults(reminderEnabled));
      setEditingEventId(null);
      setAttachDocFiles([]);
    },
    [setAttachDocFiles, setEditingEventId, setEventFormData],
  );

  const cancelMedicationForm = useCallback(() => {
    _resetForm(true);
  }, [_resetForm]);

  const saveMedication = useCallback(async () => {
    if (!selectedPetId) return;
    const token = getToken();
    if (!token) return;
    setEventSaving(true);
    try {
      // Build enriched notes for medication
      let finalNotes = eventFormData.notes.trim();
      const medMeta = [
        eventFormData.dose ? `Dose: ${eventFormData.dose}` : '',
        eventFormData.route ? `Via: ${eventFormData.route}` : '',
        eventFormData.frequency ? `Frequência: ${eventFormData.frequency.replace('_', ' ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      if (medMeta) finalNotes = medMeta + (finalNotes ? '\n' + finalNotes : '');

      const shouldKeepTreatmentActive = eventFormData.reminder_enabled || Boolean(eventFormData.treatment_days);

      const payload: Record<string, unknown> = {
        pet_id: selectedPetId,
        type: 'medicacao',
        scheduled_at: new Date(eventFormData.scheduled_at).toISOString(),
        title: eventFormData.title.trim(),
        source: 'manual',
        status: shouldKeepTreatmentActive ? 'active' : 'completed',
      };
      if (eventFormData.professional_name.trim()) payload.professional_name = eventFormData.professional_name.trim();
      if (eventFormData.cost) payload.cost = parseFloat(eventFormData.cost);
      if (finalNotes) payload.notes = finalNotes;

      const evEditId = editingEventId;

      // extra_data/reminder handling
      const preservedExtra =
        evEditId && eventFormData._preserved_extra ? { ...eventFormData._preserved_extra } : {};
      if (eventFormData.reminder_enabled) {
        const extraData: Record<string, unknown> = { ...preservedExtra };
        const normalizedTimes = (eventFormData.reminder_times || []).filter(Boolean);
        if (eventFormData.frequency) extraData.frequency = eventFormData.frequency;
        if (eventFormData.treatment_days) extraData.treatment_days = parseInt(eventFormData.treatment_days, 10);
        if (normalizedTimes.length > 0) {
          extraData.reminder_times = normalizedTimes;
          extraData.reminder_time = normalizedTimes[0];
        } else if (eventFormData.reminder_time) {
          extraData.reminder_times = [eventFormData.reminder_time];
          extraData.reminder_time = eventFormData.reminder_time;
        }
        if (Object.keys(extraData).length > 0) payload.extra_data = JSON.stringify(extraData);
      } else if (evEditId) {
        // Ao desligar lembrete em edição, limpamos agendamento para não manter estado antigo no backend.
        payload.next_due_date = null;
        payload.extra_data = Object.keys(preservedExtra).length > 0 ? JSON.stringify(preservedExtra) : null;
      }

      // Reminder date takes priority over next_due_date
      const nextDate =
        eventFormData.reminder_enabled && eventFormData.reminder_date
          ? eventFormData.reminder_date
          : eventFormData.next_due_date;
      if (nextDate) payload.next_due_date = new Date(nextDate).toISOString();

      const res = await fetch(
        evEditId ? `${API_BASE_URL}/events/${evEditId}` : `${API_BASE_URL}/events`,
        {
          method: evEditId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const saved = await res.json();
        if (!evEditId) {
          trackV1Metric('medication_created', {
            pet_id: selectedPetId,
            event_id: saved.id,
            title: eventFormData.title.trim(),
            treatment_days: eventFormData.treatment_days ? parseInt(eventFormData.treatment_days, 10) : null,
            reminder_times: eventFormData.reminder_times?.length ?? 0,
          });
        }
        // Upload documents for new events only
        if (!evEditId && attachDocFiles.length > 0) {
          const form = new FormData();
          attachDocFiles.forEach(f => form.append('files', f));
          form.append('event_id', saved.id);
          const uploadResponse = await fetch(
            `${API_BASE_URL}/pets/${selectedPetId}/documents/upload`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          ).catch(() => null);
          if (uploadResponse?.ok) {
            trackV1Metric('document_uploaded', {
              pet_id: selectedPetId,
              file_count: attachDocFiles.length,
              source: 'health_modal_medication',
            });
          }
        }
        _resetForm(true);
        fetchPetEvents(selectedPetId);
      } else {
        const err = await res.json().catch(() => ({}));
        showBlockingNotice('Erro ao salvar: ' + (err.detail || res.status));
      }
    } catch {
      showBlockingNotice('Erro de conexão ao salvar evento');
    } finally {
      setEventSaving(false);
    }
  }, [
    _resetForm,
    attachDocFiles,
    editingEventId,
    eventFormData,
    fetchPetEvents,
    selectedPetId,
    setEventSaving,
  ]);

  return { saveMedication, cancelMedicationForm };
}
