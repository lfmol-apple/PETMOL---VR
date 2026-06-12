'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { requestUserConfirmation, showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';

export interface EventFormState {
  type: string;
  scheduled_at: string;
  title: string;
  location_name: string;
  professional_name: string;
  cost: string;
  notes: string;
  next_due_date: string;
  dose: string;
  frequency: string;
  route: string;
  reminder_enabled: boolean;
  reminder_date: string;
  reminder_time: string;
  reminder_times: string[];
  treatment_days: string;
  result: string;
  severity: string;
  /** Campos de extra_data não editáveis no formulário — preservados entre edições (ex: applied_dates, skipped_dates, dose_notes) */
  _preserved_extra?: Record<string, unknown>;
}

interface UsePetEventManagementParams {
  selectedPetId: string | null;
  healthActiveTab: string;
  setHealthActiveTab: (tab: string) => void;
  setShowVetHistoryModal: (value: boolean) => void;
  setShowHealthModal: (value: boolean) => void;
  setEventTypeLocked: (value: boolean) => void;
}

interface UsePetEventManagementResult {
  petEvents: PetEventRecord[];
  setPetEvents: Dispatch<SetStateAction<PetEventRecord[]>>;
  eventsLoading: boolean;
  eventFormData: EventFormState;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  eventSaving: boolean;
  setEventSaving: (value: boolean) => void;
  createdEventId: string | null;
  setCreatedEventId: (value: string | null) => void;
  showAttachDoc: boolean;
  setShowAttachDoc: (value: boolean) => void;
  attachDocFiles: File[];
  setAttachDocFiles: (files: File[]) => void;
  editingEventId: string | null;
  setEditingEventId: (value: string | null) => void;
  fetchPetEvents: (petId: string) => Promise<void>;
  handleDeleteEvent: (eventId: string) => Promise<void>;
  openEditEvent: (event: PetEventRecord) => void;
}

const createDefaultEventFormData = (type = 'consulta', reminderEnabled = true): EventFormState => ({
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
  reminder_enabled: reminderEnabled,
  reminder_date: '',
  reminder_time: '08:00',
  reminder_times: ['08:00'],
  treatment_days: '',
  result: '',
  severity: 'moderada',
});

export function usePetEventManagement({
  selectedPetId,
  healthActiveTab,
  setHealthActiveTab,
  setShowVetHistoryModal,
  setShowHealthModal,
  setEventTypeLocked,
}: UsePetEventManagementParams): UsePetEventManagementResult {
  const [petEvents, setPetEvents] = useState<PetEventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventFormData, setEventFormData] = useState<EventFormState>(createDefaultEventFormData());
  const [eventSaving, setEventSaving] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [showAttachDoc, setShowAttachDoc] = useState(false);
  const [attachDocFiles, setAttachDocFiles] = useState<File[]>([]);

  const fetchPetEvents = useCallback(async (petId: string) => {
    const token = getToken();
    if (!petId) return;
    setEventsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/events?pet_id=${petId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.ok) {
        const data: PetEventRecord[] = await response.json();
        setPetEvents(Array.isArray(data) ? data : []);
      } else if (response.status === 401 || response.status === 403) {
        setPetEvents([]);
      }
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    const accepted = await requestUserConfirmation('Excluir este registro? Esta ação não pode ser desfeita.', {
      title: 'Excluir evento de saúde',
      tone: 'danger',
      confirmLabel: 'Excluir registro',
    });
    if (!accepted) return;
    const token = getToken();
    try {
      await fetch(`${API_BASE_URL}/events/${eventId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (selectedPetId) {
        await fetchPetEvents(selectedPetId);
      }
    } catch {
      showBlockingNotice('Erro ao excluir registro.');
    }
  }, [fetchPetEvents, selectedPetId]);

  const openEditEvent = useCallback((event: PetEventRecord) => {
    const notes = event.notes || '';
    let dose = '';
    let route = 'oral';
    let frequency = '2x_dia';
    let cleanNotes = notes;
    let severity = 'moderada';
    let reminderEnabled = false;
    let reminderDate = '';
    let reminderTime = '08:00';
    let treatmentDays = '';
    let reminderTimes: string[] = ['08:00'];
    const nextDueDate = event.next_due_date ? event.next_due_date.split('T')[0] : '';

    let preservedExtra: Record<string, unknown> | undefined;
    try {
      const extraData = parsePetEventExtraData(event.extra_data);
      if (extraData.reminder_time) reminderTime = extraData.reminder_time;
      if (extraData.treatment_days) treatmentDays = String(extraData.treatment_days);
      if (Array.isArray(extraData.reminder_times) && extraData.reminder_times.length > 0) {
        reminderTimes = extraData.reminder_times;
      } else if (extraData.reminder_time) {
        reminderTimes = [extraData.reminder_time];
      }
      // Preservar campos não editáveis no formulário para evitar perda de histórico ao editar.
      const preserved: Record<string, unknown> = { ...extraData };
      delete preserved.reminder_time;
      delete preserved.reminder_times;
      delete preserved.frequency;
      delete preserved.treatment_days;
      if (Object.keys(preserved).length > 0) preservedExtra = preserved;
    } catch {}

    if (event.type === 'medicacao') {
      const lines = notes.split('\n');
      const firstLine = lines[0] || '';
      const rest = lines.slice(1).join('\n').trim();
      const doseMatch = firstLine.match(/Dose:\s*([^|]+)/);
      const routeMatch = firstLine.match(/Via:\s*([^|]+)/);
      const frequencyMatch = firstLine.match(/Frequência:\s*([^|]+)/);
      if (doseMatch) dose = doseMatch[1].trim();
      if (routeMatch) route = routeMatch[1].trim().toLowerCase();
      if (frequencyMatch) frequency = frequencyMatch[1].trim().replace(' ', '_');
      if (doseMatch || routeMatch || frequencyMatch) cleanNotes = rest;
      if (nextDueDate) {
        reminderEnabled = true;
        reminderDate = nextDueDate;
      } else {
        // Restore reminder state from extra_data even when next_due_date is absent.
        try {
          const extraCheck = parsePetEventExtraData(event.extra_data);
          if (extraCheck.reminder_time || (Array.isArray(extraCheck.reminder_times) && (extraCheck.reminder_times as string[]).length > 0)) {
            reminderEnabled = true;
          }
        } catch {}
      }
    }

    if (event.type === 'emergencia') {
      const severityMatch = notes.match(/^Gravidade:\s*(.+)/m);
      const severityMap: Record<string, string> = {
        Leve: 'leve',
        Moderada: 'moderada',
        Grave: 'grave',
        'Crítica': 'critica',
      };
      if (severityMatch) {
        severity = severityMap[severityMatch[1].trim()] || 'moderada';
        cleanNotes = notes.replace(/^Gravidade:.*\n?/m, '').trim();
      }
    }

    setEventFormData({
      type: event.type || 'consulta',
      scheduled_at: event.scheduled_at ? event.scheduled_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
      title: event.title || '',
      location_name: event.location_name || '',
      professional_name: event.professional_name || '',
      cost: event.cost != null ? String(event.cost) : '',
      notes: cleanNotes,
      next_due_date: nextDueDate,
      dose,
      frequency,
      route,
      reminder_enabled: reminderEnabled,
      reminder_date: reminderDate,
      reminder_time: reminderTime,
      reminder_times: reminderTimes,
      treatment_days: treatmentDays,
      result: '',
      severity,
      _preserved_extra: preservedExtra,
    });
    setEditingEventId(event.id);
    setEventTypeLocked(false);
    setShowVetHistoryModal(false);
    setShowHealthModal(true);
    if (event.type === 'medicacao' || event.type === 'medication') {
      setHealthActiveTab('medication');
    } else {
      setHealthActiveTab('eventos');
    }
  }, [setEventTypeLocked, setHealthActiveTab, setShowHealthModal, setShowVetHistoryModal]);

  useEffect(() => {
    if (selectedPetId) {
      fetchPetEvents(selectedPetId);
    }
  }, [fetchPetEvents, selectedPetId]);

  useEffect(() => {
    if (healthActiveTab === 'eventos' && selectedPetId) {
      fetchPetEvents(selectedPetId);
    }
  }, [fetchPetEvents, healthActiveTab, selectedPetId]);

  useEffect(() => {
    if ((healthActiveTab === 'medication' || healthActiveTab === 'medications') && selectedPetId) {
      fetchPetEvents(selectedPetId);
    }
  }, [fetchPetEvents, healthActiveTab, selectedPetId]);

  return {
    petEvents,
    setPetEvents,
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
  };
}
