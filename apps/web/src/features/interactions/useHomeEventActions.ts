'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';

interface UseHomeEventActionsParams {
  selectedPetId: string | null;
  eventFormData: EventFormState;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  setEventSaving: (value: boolean) => void;
  attachDocFiles: File[];
  setAttachDocFiles: (files: File[]) => void;
  editingEventId: string | null;
  setEditingEventId: (value: string | null) => void;
  fetchPetEvents: (petId: string) => void;
  setCreatedEventId: (value: string | null) => void;
  setShowAttachDoc: (value: boolean) => void;
  eventTypeLocked: boolean;
}

const buildEventDefaults = (type: string): EventFormState => ({
  type,
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
  reminder_enabled: false,
  reminder_date: '',
  reminder_time: '08:00',
  reminder_times: ['08:00'],
  treatment_days: '',
  custom_interval_days: '',
  total_doses: '',
  result: '',
  severity: 'moderada',
});

export function useHomeEventActions({
  selectedPetId,
  eventFormData,
  setEventFormData,
  setEventSaving,
  attachDocFiles,
  setAttachDocFiles,
  editingEventId,
  setEditingEventId,
  fetchPetEvents,
  setCreatedEventId,
  setShowAttachDoc,
  eventTypeLocked,
}: UseHomeEventActionsParams) {
  const cancelEventForm = useCallback(() => {
    const resetType = eventTypeLocked ? eventFormData.type : 'consulta';
    setEventFormData(buildEventDefaults(resetType));
    setEditingEventId(null);
    setAttachDocFiles([]);
  }, [
    eventFormData.type,
    eventTypeLocked,
    setAttachDocFiles,
    setEditingEventId,
    setEventFormData,
  ]);

  const saveEvent = useCallback(async () => {
    if (!selectedPetId) return;
    const token = getToken();
    if (!token) return;
    setEventSaving(true);

    const t_type = eventFormData.type;

    try {
      // Build enriched notes per event type
      let finalNotes = eventFormData.notes.trim();
      if (t_type === 'emergencia' && eventFormData.severity) {
        const sevMap: Record<string, string> = {
          leve: 'Leve',
          moderada: 'Moderada',
          grave: 'Grave',
          critica: 'Crítica',
        };
        finalNotes =
          `Gravidade: ${sevMap[eventFormData.severity] || eventFormData.severity}` +
          (finalNotes ? '\n' + finalNotes : '');
      }
      if (
        (t_type === 'exame_lab' || t_type === 'exame_imagem') &&
        eventFormData.result
      ) {
        const resMap: Record<string, string> = {
          normal: 'Normal',
          alterado: 'Alterado',
          aguardando_laudo: 'Aguardando laudo',
        };
        finalNotes =
          `Resultado: ${resMap[eventFormData.result] || eventFormData.result}` +
          (finalNotes ? '\n' + finalNotes : '');
      }

      const payload: Record<string, unknown> = {
        pet_id: selectedPetId,
        type: t_type,
        scheduled_at: new Date(eventFormData.scheduled_at).toISOString(),
        title: eventFormData.title.trim(),
        source: 'manual',
        status: 'completed',
      };
      if (eventFormData.location_name.trim()) payload.location_name = eventFormData.location_name.trim();
      if (eventFormData.professional_name.trim()) payload.professional_name = eventFormData.professional_name.trim();
      if (eventFormData.cost) payload.cost = parseFloat(eventFormData.cost);
      if (finalNotes) payload.notes = finalNotes;
      if (eventFormData.next_due_date)
        payload.next_due_date = new Date(eventFormData.next_due_date).toISOString();

      const evEditId = editingEventId;
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
              source: 'health_modal_consultation',
            });
          }
        }
        setEventFormData(buildEventDefaults('consulta'));
        setEditingEventId(null);
        setAttachDocFiles([]);
        setCreatedEventId(null);
        setShowAttachDoc(false);
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
    attachDocFiles,
    editingEventId,
    eventFormData,
    fetchPetEvents,
    selectedPetId,
    setAttachDocFiles,
    setCreatedEventId,
    setEditingEventId,
    setEventFormData,
    setEventSaving,
    setShowAttachDoc,
  ]);

  return { saveEvent, cancelEventForm };
}
