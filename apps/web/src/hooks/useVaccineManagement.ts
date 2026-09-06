import { useState } from 'react';
import { localTodayISO } from '@/lib/localDate';
import { dateToLocalISO } from '@/lib/localDate';
import {
  requestUserConfirmation,
  showAppToast,
  showBlockingNotice,
} from '@/features/interactions/userPromptChannel';
import { trackV1Metric } from '@/lib/v1Metrics';
import { API_BACKEND_BASE, API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { scheduleUniqueReminder, buildRemindAt, subtractDays } from '@/features/notifications/pushService';
import { updateVaccine, deleteVaccine, clearAllVaccines } from '@/services/vaccineService';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';
import {
  mapTipoVacinaToVaccineType,
  type VaccineCardOcrRecord,
} from '@/lib/vaccineOcr';
import {
  learnFromCorrections,
  type VaccineOcrRecordLike,
} from '@/lib/vaccineLearning';
import type { PetHealthProfile, VaccineRecord, VaccineType } from '@/lib/petHealth';
import type { VaccineFormData } from '@/lib/types/homeForms';

interface UseVaccineManagementParams {
  selectedPetId: string | null;
  pets: PetHealthProfile[];
  setPets: React.Dispatch<React.SetStateAction<PetHealthProfile[]>>;
  fetchPetEvents: (petId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  // review state from useVaccineCardWorkflow (needed by handleImportAnalyzedVaccines)
  reviewRegistros: VaccineCardOcrRecord[] | null;
  reviewConfirmed: boolean;
  reviewExpectedCount: number;
  rawRegistros: VaccineCardOcrRecord[] | null;
  reviewLearnEnabled: boolean;
  cardAnalysis: { leitura_confiavel?: boolean } | null;
  closeCardAnalysis: () => void;
}

const createLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// --- Puppy/kitten age-gated protocol (WSAVA 2024 guidelines) ---------------
// Mirrors the backend's _puppy_protocol_next_dose (services/price-service/
// src/health/router.py) — kept in sync deliberately, same constants. Needed
// HERE too, not just on the backend: the form always computes and sends an
// explicit next_due_on (see handleSaveVaccine below), and the backend only
// applies its own age-gated logic when next_due_on is ABSENT — so without
// this, the frontend's flat 365-day guess would always win before the
// backend's age-aware one ever got a chance to run.
// Source: WSAVA Vaccination Guidelines Group, 2024
// (https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf) —
// core series every 2-4 weeks until 16+ weeks old, one more booster at 26+
// weeks, then the normal adult schedule. This is a SUGGESTION pre-filled
// into an editable date field — the tutor (or vet) can always change it.
const PUPPY_SERIES_CUTOFF_DAYS = 16 * 7;   // 112
const PUPPY_BOOSTER_CUTOFF_DAYS = 26 * 7;  // 182
const PUPPY_SERIES_INTERVAL_DAYS = 21;     // 3 weeks

function puppyProtocolNextDose(petBirthDate: string | undefined, appliedDate: Date): Date | null {
  if (!petBirthDate) return null;
  const birth = createLocalDate(petBirthDate);
  const ageDays = Math.round((appliedDate.getTime() - birth.getTime()) / 86_400_000);
  if (ageDays < 0 || ageDays >= PUPPY_BOOSTER_CUTOFF_DAYS) return null;
  if (ageDays < PUPPY_SERIES_CUTOFF_DAYS) {
    const next = new Date(appliedDate);
    next.setDate(next.getDate() + PUPPY_SERIES_INTERVAL_DAYS);
    return next;
  }
  // 16-26 weeks old: suggest the 26-week safety booster, floored so it's
  // never sooner than a normal series gap even if already close to 26 weeks.
  const boosterDate = new Date(birth);
  boosterDate.setDate(boosterDate.getDate() + PUPPY_BOOSTER_CUTOFF_DAYS);
  const floorDate = new Date(appliedDate);
  floorDate.setDate(floorDate.getDate() + 14);
  return boosterDate.getTime() > floorDate.getTime() ? boosterDate : floorDate;
}

const DEFAULT_VACCINE_FORM: VaccineFormData = {
  vaccine_type: 'multiple' as VaccineType,
  vaccine_name: '',
  date_administered: '',
  next_dose_date: '',
  frequency_days: 365,
  veterinarian: '',
  clinic_name: '',
  notes: '',
  record_type: 'confirmed_application',
  alert_days_before: 3,
  reminder_time: '09:00',
};

export function useVaccineManagement({
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
}: UseVaccineManagementParams) {
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [showVaccineForm, setShowVaccineForm] = useState(false);
  const [vaccineFormSaving, setVaccineFormSaving] = useState(false);
  const [importVaccineLoading, setImportVaccineLoading] = useState(false);
  const [showQuickAddVaccine, setShowQuickAddVaccine] = useState(false);
  const [showAIUpload, setShowAIUpload] = useState(false);
  const [editingVaccine, setEditingVaccine] = useState<VaccineRecord | null>(null);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackVaccine, setFeedbackVaccine] = useState<VaccineRecord | null>(null);
  const [feedbackFormData, setFeedbackFormData] = useState({
    field_corrected: 'name' as 'name' | 'type' | 'date_administered' | 'next_dose_date' | 'veterinarian' | 'brand',
    original_value: '',
    corrected_value: '',
    user_comment: '',
  });

  const [vaccineFormData, setVaccineFormData] = useState<VaccineFormData>(DEFAULT_VACCINE_FORM);
  const [quickAddData, setQuickAddData] = useState({
    vaccine_type: 'rabies' as VaccineType,
    vaccine_name: '',
    date_administered: localTodayISO(),
    next_dose_date: '',
    veterinarian: '',
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  const getCurrentPet = () => pets.find((p) => p.pet_id === selectedPetId) || pets[0];

  const calculateNextDose = (dateApplied: string, frequencyDays: number): string => {
    const date = createLocalDate(dateApplied);
    date.setDate(date.getDate() + frequencyDays);
    return dateToLocalISO(date);
  };

  // ── loadVaccines ─────────────────────────────────────────────────────────

  const loadVaccines = async () => {
    const pet = pets.find((p) => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    const savedToken = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/vaccines`, {
        headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : undefined,
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        deleted?: boolean;
        vaccine_type?: string;
        vaccine_name: string;
        applied_date?: string | null;
        next_dose_date?: string | null;
        veterinarian_name?: string | null;
        clinic_name?: string | null;
        notes?: string | null;
        vaccine_code?: string | null;
        country_code?: string | null;
        next_due_source?: string | null;
        record_type?: 'confirmed_application' | 'estimated_control_start' | null;
        alert_days_before?: number | null;
        reminder_time?: string | null;
      }> = await res.json();
      const toDateStr = (raw: string | null | undefined): string => {
        if (!raw) return '';
        return raw.replace('T', ' ').split(' ')[0];
      };
      const mapped: VaccineRecord[] = data
        .filter((v) => !v.deleted)
        .map((v) => ({
          id: v.id,
          vaccine_type: (v.vaccine_type as VaccineType) || 'multiple',
          vaccine_name: v.vaccine_name,
          date_administered: toDateStr(v.applied_date),
          next_dose_date: v.next_dose_date ? toDateStr(v.next_dose_date) : undefined,
          veterinarian: v.veterinarian_name || '',
          clinic_name: v.clinic_name || '',
          notes: v.notes || undefined,
          vaccine_code: v.vaccine_code || undefined,
          country_code: v.country_code || undefined,
          next_due_source: v.next_due_source || undefined,
          record_type: v.record_type || 'confirmed_application',
          alert_days_before: v.alert_days_before ?? 3,
          reminder_time: v.reminder_time || '09:00',
        }))
        .sort(
          (a, b) =>
            createLocalDate(b.date_administered).getTime() -
            createLocalDate(a.date_administered).getTime(),
        );
      setVaccines(mapped);
      setPets((prevPets) =>
        prevPets.map((p) => (p.pet_id === pet.pet_id ? { ...p, vaccines: mapped } : p)),
      );
    } catch (err) {
      console.error('Erro ao carregar vacinas:', err);
    }
  };

  // ── resetVaccineForm ──────────────────────────────────────────────────────

  const resetVaccineForm = () => {
    setVaccineFormData(DEFAULT_VACCINE_FORM);
    setEditingVaccine(null);
    setShowVaccineForm(false);
  };

  // ── handleSaveVaccine ─────────────────────────────────────────────────────

  const handleSaveVaccine = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet || !vaccineFormData.vaccine_name || !vaccineFormData.date_administered) {
      showBlockingNotice('Preencha os campos obrigatórios: Nome da vacina e Data de aplicação');
      return;
    }

    setVaccineFormSaving(true);
    try {
      if (editingVaccine) {
        const updates: Partial<VaccineRecord> = {
          vaccine_type: vaccineFormData.vaccine_type,
          vaccine_name: vaccineFormData.vaccine_name,
          date_administered: vaccineFormData.date_administered,
          next_dose_date: vaccineFormData.next_dose_date || undefined,
          veterinarian: vaccineFormData.veterinarian,
          clinic_name: vaccineFormData.clinic_name || '',
          batch_number: undefined,
          notes: vaccineFormData.notes || undefined,
          record_type: vaccineFormData.record_type,
          alert_days_before: vaccineFormData.alert_days_before ?? 3,
          reminder_time: vaccineFormData.reminder_time ?? '09:00',
          reminder_enabled: true,
        };
        const success = await updateVaccine(currentPet.pet_id, editingVaccine.id, updates);

        if (success) {
          setVaccines((prevVaccines) =>
            prevVaccines.map((v) =>
              v.id === editingVaccine.id ? { ...v, ...updates } : v,
            ),
          );
          setPets((prevPets) =>
            prevPets.map((p) =>
              p.pet_id === currentPet.pet_id
                ? {
                    ...p,
                    vaccines: (p.vaccines || []).map((v) =>
                      v.id === editingVaccine.id ? { ...v, ...updates } : v,
                    ),
                  }
                : p,
            ),
          );
          showAppToast('Vacina atualizada com sucesso.');
          const editNextDate = vaccineFormData.next_dose_date;
          const editDaysBefore = vaccineFormData.alert_days_before ?? 3;
          const editTime = (vaccineFormData.reminder_time ?? '09:00').slice(0, 5);
          if (editNextDate && editDaysBefore > 0) {
            const remindAt = buildRemindAt(subtractDays(editNextDate, editDaysBefore), editTime);
            if (new Date(remindAt) > new Date()) {
              const editToken = getToken();
              if (editToken) {
                void scheduleUniqueReminder({ pet_id: currentPet.pet_id, type: 'vaccine', title: `💉 Reforço: ${vaccineFormData.vaccine_name}`, body: `Hora de levar ${currentPet.pet_name} ao veterinário para o reforço. Agende a consulta!`, remind_at: remindAt }, editToken);
              }
            }
          }
        } else {
          showBlockingNotice('❌ Erro ao atualizar vacina. Tente novamente.');
        }
      } else {
        const savedToken = getToken();
        if (!savedToken) {
          showBlockingNotice('❌ Sessão expirada. Faça login novamente.');
          return;
        }
        const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';
        const vaccinePayload: Record<string, unknown> = {
          display_name: vaccineFormData.vaccine_name,
          applied_on: vaccineFormData.date_administered,
          source: 'manual',
          confirmed_by_user: true,
        };
        const puppyNextDose = vaccineFormData.date_administered
          ? puppyProtocolNextDose(currentPet.birth_date, createLocalDate(vaccineFormData.date_administered))
          : null;
        const computedNextDose = vaccineFormData.date_administered
          ? (puppyNextDose ? dateToLocalISO(puppyNextDose) : calculateNextDose(vaccineFormData.date_administered, vaccineFormData.frequency_days || 365))
          : null;
        const nextDoseHint = vaccineFormData.next_dose_date || computedNextDose;
        if (nextDoseHint) vaccinePayload.next_due_on = nextDoseHint;
        if (vaccineFormData.notes) vaccinePayload.notes = vaccineFormData.notes;
        if (vaccineFormData.veterinarian) vaccinePayload.veterinarian = vaccineFormData.veterinarian;
        if (vaccineFormData.clinic_name) vaccinePayload.clinic_name = vaccineFormData.clinic_name;
        vaccinePayload.record_type = vaccineFormData.record_type;
        vaccinePayload.alert_days_before = vaccineFormData.alert_days_before ?? 3;
        vaccinePayload.reminder_time = vaccineFormData.reminder_time ?? '09:00';
        vaccinePayload.reminder_enabled = true;

        const res = await fetch(
          `${API_BACKEND_BASE}/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${savedToken}`,
            },
            body: JSON.stringify({
              country_code: countryCode,
              species: currentPet.species || 'dog',
              vaccines: [vaccinePayload],
            }),
          },
        );

        if (!res.ok) {
          showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.');
          return;
        }

        const data = await res.json();
        const saved = data.vaccines[0];

        const createdVaccine: VaccineRecord = {
          id: saved.id,
          vaccine_type: vaccineFormData.vaccine_type,
          vaccine_name: saved.display_name,
          date_administered: saved.applied_on,
          next_dose_date: saved.next_due_on || vaccineFormData.next_dose_date || undefined,
          veterinarian: vaccineFormData.veterinarian,
          clinic_name: '',
          notes: saved.notes || vaccineFormData.notes || undefined,
          record_type: saved.record_type || vaccineFormData.record_type,
          vaccine_code: saved.vaccine_code || undefined,
          country_code: saved.country_code || undefined,
          next_due_source: saved.next_due_source || 'unknown',
          alert_days_before: saved.alert_days_before ?? vaccineFormData.alert_days_before ?? 3,
          reminder_time: saved.reminder_time ?? vaccineFormData.reminder_time ?? '09:00',
        };

        trackV1Metric('vaccine_record_created', {
          pet_id: currentPet.pet_id,
          vaccine_id: saved.id,
          vaccine_name: saved.display_name,
          source: 'manual_form',
        });

        setVaccines((prevVaccines) => [...prevVaccines, createdVaccine]);
        setPets((prevPets) =>
          prevPets.map((p) =>
            p.pet_id === currentPet.pet_id
              ? { ...p, vaccines: [...(p.vaccines || []), createdVaccine] }
              : p,
          ),
        );

        const now = new Date();
        const nextDate = saved.next_due_on ? new Date(saved.next_due_on) : null;
        const diff = nextDate
          ? Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        let statusLabel = 'Em dia';
        if (diff !== null && diff <= 30 && diff >= 0) statusLabel = 'Pode estar na hora de revisar';
        if (diff !== null && diff < 0) statusLabel = 'Vale confirmar com seu veterinário';
        let msg = `Vacina registrada.\nStatus: ${statusLabel}\nLembrete ativo`;
        if (saved.next_due_on) msg += `\nPróxima previsão: ${saved.next_due_on}`;
        showAppToast(msg, { title: 'Registro salvo', tone: 'success', durationMs: 3600 });

        const newNextDate = createdVaccine.next_dose_date;
        const newDaysBefore = createdVaccine.alert_days_before ?? 3;
        const newTime = (createdVaccine.reminder_time ?? '09:00').slice(0, 5);
        if (newNextDate && newDaysBefore > 0) {
          const remindAt = buildRemindAt(subtractDays(newNextDate, newDaysBefore), newTime);
          if (new Date(remindAt) > new Date()) {
            void scheduleUniqueReminder({ pet_id: currentPet.pet_id, type: 'vaccine', title: `💉 Reforço: ${createdVaccine.vaccine_name}`, body: `${currentPet.pet_name} tem reforço vacinal em ${newNextDate}. Agende com o veterinário!`, remind_at: remindAt }, savedToken);
          }
        }
      }

      resetVaccineForm();
      if (selectedPetId) fetchPetEvents(selectedPetId);
    } catch (error) {
      console.error('Erro ao salvar vacina:', error);
      showBlockingNotice(t('health.vaccines.error_save'));
    } finally {
      setVaccineFormSaving(false);
    }
  };

  // ── handleEditVaccine ─────────────────────────────────────────────────────

  const handleEditVaccine = (vaccine: VaccineRecord) => {
    setEditingVaccine(vaccine);
    setVaccineFormData({
      vaccine_type: vaccine.vaccine_type,
      vaccine_name: vaccine.vaccine_name,
      date_administered: vaccine.date_administered,
      next_dose_date: vaccine.next_dose_date || '',
      frequency_days: 365,
      veterinarian: vaccine.veterinarian,
      clinic_name: vaccine.clinic_name || '',
      notes: vaccine.notes || '',
      record_type: vaccine.record_type || 'confirmed_application',
      alert_days_before:
        (vaccine as unknown as Record<string, unknown>).alert_days_before as number ?? 3,
      reminder_time:
        (vaccine as unknown as Record<string, unknown>).reminder_time as string ?? '09:00',
    });
    setShowVaccineForm(true);
  };

  // ── handleDeleteVaccine ───────────────────────────────────────────────────

  const handleDeleteVaccine = async (vaccine: VaccineRecord) => {
    const currentPet = getCurrentPet();
    const accepted = await requestUserConfirmation(
      'Excluir este registro? Essa ação remove o item do histórico.',
      {
        title: 'Excluir vacina',
        tone: 'danger',
        confirmLabel: 'Excluir vacina',
      },
    );
    if (!accepted) return;

    try {
      const success = await deleteVaccine(currentPet?.pet_id ?? '', vaccine.id);
      if (success) {
        setVaccines((prev) => prev.filter((v) => v.id !== vaccine.id));
        if (currentPet) {
          setPets((prevPets) =>
            prevPets.map((p) =>
              p.pet_id === currentPet.pet_id
                ? { ...p, vaccines: (p.vaccines || []).filter((v) => v.id !== vaccine.id) }
                : p,
            ),
          );
        }
        showAppToast('Vacina removida do prontuário.');
      } else {
        showBlockingNotice('Erro ao excluir vacina do banco de dados.');
      }
    } catch (error) {
      console.error('Erro ao excluir vacina:', error);
      showBlockingNotice(t('health.vaccines.error_delete'));
    }
  };

  // ── handleDeleteAllVaccines ───────────────────────────────────────────────

  const handleDeleteAllVaccines = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet) return;

    const count = vaccines.length;
    if (count === 0) {
      showBlockingNotice('Não há vacinas para remover.');
      return;
    }

    const accepted = await requestUserConfirmation(
      `⚠️ ATENÇÃO: Você está prestes a REMOVER TODAS as ${count} vacinas do prontuário!\n\nEsta ação NÃO pode ser desfeita.\n\nDeseja continuar?`,
      {
        title: 'Remover todas as vacinas',
        tone: 'danger',
        confirmLabel: 'Remover todas',
      },
    );
    if (!accepted) return;

    try {
      const success = await clearAllVaccines(currentPet.pet_id);
      if (success) {
        setVaccines([]);
        setPets((prevPets) =>
          prevPets.map((p) =>
            p.pet_id === currentPet.pet_id ? { ...p, vaccines: [] } : p,
          ),
        );
        showAppToast(`Todas as ${count} vacinas foram removidas.`);
      } else {
        showBlockingNotice('❌ Erro ao limpar vacinas. Tente novamente.');
      }
    } catch (error) {
      console.error('Erro ao limpar vacinas:', error);
      showBlockingNotice('❌ Erro ao limpar vacinas. Tente novamente.');
    }
  };

  // ── handleReportVaccineIssue ──────────────────────────────────────────────

  const handleReportVaccineIssue = (vaccine: VaccineRecord) => {
    setFeedbackVaccine(vaccine);
    setFeedbackFormData({
      field_corrected: 'name',
      original_value: vaccine.vaccine_name,
      corrected_value: '',
      user_comment: '',
    });
    setShowFeedbackModal(true);
  };

  // ── handleSubmitFeedback ──────────────────────────────────────────────────

  const handleSubmitFeedback = async () => {
    const currentPet = getCurrentPet();
    if (!feedbackVaccine || !currentPet) return;

    if (!feedbackFormData.corrected_value.trim()) {
      showBlockingNotice('Por favor, informe o valor correto.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/feedback/vaccine-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pet_id: currentPet.pet_id,
          vaccine_id: feedbackVaccine.id,
          field_corrected: feedbackFormData.field_corrected,
          original_value: feedbackFormData.original_value,
          corrected_value: feedbackFormData.corrected_value,
          user_comment: feedbackFormData.user_comment,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        const result = await response.json();

        try {
          const updateData: Partial<VaccineRecord> = {};
          switch (feedbackFormData.field_corrected) {
            case 'name':
            case 'brand':
              updateData.vaccine_name = feedbackFormData.corrected_value;
              break;
            case 'type':
              updateData.vaccine_type = feedbackFormData.corrected_value as VaccineType;
              break;
            case 'date_administered':
              updateData.date_administered = feedbackFormData.corrected_value;
              break;
            case 'next_dose_date':
              updateData.next_dose_date = feedbackFormData.corrected_value;
              break;
            case 'veterinarian':
              updateData.veterinarian = feedbackFormData.corrected_value;
              break;
          }

          const success = await updateVaccine(currentPet.pet_id, feedbackVaccine.id, updateData);

          if (success) {
            setVaccines((prevVaccines) =>
              prevVaccines.map((v) =>
                v.id === feedbackVaccine.id ? { ...v, ...updateData } : v,
              ),
            );

            let message = t('feedback.correction_success');
            if (result.impact?.similar_corrections > 2) {
              message += `\n\n📊 Este erro já foi reportado ${result.impact.similar_corrections}x. Estamos trabalhando na correção automática!`;
            }
            showBlockingNotice(message);
            loadVaccines();
          } else {
            showBlockingNotice(
              '✅ Feedback registrado, mas não foi possível atualizar a vacina.\n\nUse o botão ✏️ para editar manualmente.',
            );
          }
        } catch (updateError) {
          console.error('Erro ao atualizar vacina:', updateError);
          showBlockingNotice(
            '✅ Feedback registrado!\n\n💡 Use o botão ✏️ para aplicar a correção manualmente.',
          );
        }

        setShowFeedbackModal(false);
        setFeedbackVaccine(null);
      } else {
        showBlockingNotice(t('feedback.error_send'));
      }
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      showBlockingNotice(t('feedback.error_connection'));
    }
  };

  // ── handleQuickAddVaccine ─────────────────────────────────────────────────

  const handleQuickAddVaccine = async (selectedVaccine: {
    type: VaccineType;
    name: string;
    icon: string;
    code: string;
  }, when: 'today' | 'this_month' | 'unknown') => {
    const currentPet = getCurrentPet();
    if (!currentPet) return;

    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('❌ Sessão expirada. Faça login novamente.');
      return;
    }

    const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';
    const today = localTodayISO();
    const firstDayOfMonth = `${today.slice(0, 8)}01`;
    const appliedOn = when === 'today' ? today : when === 'this_month' ? firstDayOfMonth : today;
    const isUnknownDate = when === 'unknown';
    const quickNotes = isUnknownDate
      ? 'Data aproximada (date_unknown=true). Vale confirmar com seu veterinário.'
      : t('health.added_via_quick');
    const quickNextDueOn = isUnknownDate
      ? dateToLocalISO(puppyProtocolNextDose(currentPet.birth_date, createLocalDate(today)) ?? createLocalDate(calculateNextDose(today, 365)))
      : undefined;

    try {
      const res = await fetch(
        `${API_BACKEND_BASE}/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify({
            country_code: countryCode,
            species: currentPet.species || 'dog',
            vaccines: [
              {
                display_name: selectedVaccine.name,
                applied_on: appliedOn,
                source: 'quick_add',
                confirmed_by_user: true,
                notes: quickNotes,
                record_type: isUnknownDate ? 'estimated_control_start' : 'confirmed_application',
                ...(quickNextDueOn ? { next_due_on: quickNextDueOn } : {}),
              },
            ],
          }),
        },
      );

      if (!res.ok) {
        showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.');
        return;
      }

      const data = await res.json();
      const saved = data.vaccines[0];

      const createdVaccine: VaccineRecord = {
        id: saved.id,
        vaccine_type: selectedVaccine.type,
        vaccine_name: saved.display_name,
        date_administered: saved.applied_on,
        next_dose_date: saved.next_due_on || undefined,
        veterinarian: '',
        clinic_name: '',
        notes: saved.notes || quickNotes,
        record_type: saved.record_type || (isUnknownDate ? 'estimated_control_start' : 'confirmed_application'),
        vaccine_code: saved.vaccine_code || undefined,
        country_code: saved.country_code || undefined,
        next_due_source: saved.next_due_source || 'unknown',
      };

      trackV1Metric('vaccine_record_created', {
        pet_id: currentPet.pet_id,
        vaccine_id: saved.id,
        vaccine_name: saved.display_name,
        source: 'quick_add',
      });

      setVaccines((prevVaccines) => [...prevVaccines, createdVaccine]);
      setPets((prevPets) =>
        prevPets.map((p) =>
          p.pet_id === currentPet.pet_id
            ? { ...p, vaccines: [...(p.vaccines || []), createdVaccine] }
            : p,
        ),
      );

      const now = new Date();
      const nextDate = saved.next_due_on ? new Date(saved.next_due_on) : null;
      const diff = nextDate
        ? Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      let statusLabel = 'Em dia';
      if (diff !== null && diff <= 30 && diff >= 0) statusLabel = 'Pode estar na hora de revisar';
      if (diff !== null && diff < 0) statusLabel = 'Vale confirmar com seu veterinário';
      let msg = `✅ ${selectedVaccine.name} registrada!\nStatus: ${statusLabel}\nLembrete ativo`;
      if (saved.next_due_on) msg += `\nPróxima previsão: ${saved.next_due_on}`;
      showBlockingNotice(msg);

      setShowQuickAddVaccine(false);
      setQuickAddData({
        vaccine_type: 'rabies',
        vaccine_name: '',
        date_administered: localTodayISO(),
        next_dose_date: '',
        veterinarian: '',
      });
      if (selectedPetId) fetchPetEvents(selectedPetId);
    } catch (error) {
      console.error('Erro ao adicionar vacina:', error);
      showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.');
    }
  };

  // ── handleImportAnalyzedVaccines ──────────────────────────────────────────

  const handleImportAnalyzedVaccines = async (): Promise<boolean> => {
    const currentPet = getCurrentPet();
    if (!currentPet) return false;

    const registrosToImport = reviewRegistros || [];
    if (registrosToImport.length === 0) return false;

    if (!reviewConfirmed) {
      showBlockingNotice('Antes de importar, confirme/edite os registros.');
      return false;
    }
    if (registrosToImport.some((r) => !r.data_aplicacao)) {
      showBlockingNotice(
        'Preencha a data de aplicação em todos os registros antes de importar.',
      );
      return false;
    }

    setImportVaccineLoading(true);

    // 🧠 ML: Aprender com correções antes de importar
    try {
      if (reviewLearnEnabled && rawRegistros && rawRegistros.length > 0) {
        const corrections: Array<{
          original: VaccineCardOcrRecord;
          corrected: VaccineCardOcrRecord;
        }> = [];

        reviewRegistros?.forEach((corrected, index) => {
          const original = rawRegistros[index];
          if (original) {
            const hasChanges =
              original.nome_comercial !== corrected.nome_comercial ||
              original.tipo_vacina !== corrected.tipo_vacina ||
              original.data_aplicacao !== corrected.data_aplicacao ||
              original.data_revacina !== corrected.data_revacina ||
              original.veterinario_responsavel !== corrected.veterinario_responsavel;

            if (hasChanges) {
              corrections.push({ original, corrected });
            }
          }
        });

        if (corrections.length > 0) {
          try {
            const originals: VaccineOcrRecordLike[] = corrections.map((c) => ({
              tipo_vacina: c.original.tipo_vacina || 'Vacina',
              nome_comercial: c.original.nome_comercial || '',
              data_aplicacao: c.original.data_aplicacao || '',
              data_revacina: c.original.data_revacina || null,
              veterinario_responsavel: c.original.veterinario_responsavel || null,
            }));
            const corrected: VaccineOcrRecordLike[] = corrections.map((c) => ({
              tipo_vacina: c.corrected.tipo_vacina || 'Vacina',
              nome_comercial: c.corrected.nome_comercial || '',
              data_aplicacao: c.corrected.data_aplicacao || '',
              data_revacina: c.corrected.data_revacina || null,
              veterinario_responsavel: c.corrected.veterinario_responsavel || null,
            }));
            await learnFromCorrections(originals, corrected);
          } catch (error) {
            console.error('❌ ML: Erro ao aplicar aprendizado:', error);
          }
        }
      }
    } catch (mlError) {
      console.warn('⚠️ ML: Erro no aprendizado (não crítico):', mlError);
    }

    const existingVaccines = vaccines || [];
    const newRecords: VaccineCardOcrRecord[] = [];
    const duplicates: VaccineCardOcrRecord[] = [];

    registrosToImport.forEach((detected: VaccineCardOcrRecord) => {
      const detectedName = (detected.nome_comercial || detected.tipo_vacina || '').toLowerCase().trim();
      const detectedDate = detected.data_aplicacao || '';
      const isDuplicate = existingVaccines.some((existing) => {
        const existingName = (existing.vaccine_name || '').toLowerCase().trim();
        const existingDate = existing.date_administered || '';
        return existingName === detectedName && existingDate === detectedDate;
      });
      if (isDuplicate) duplicates.push(detected);
      else newRecords.push(detected);
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map((d) => d.nome_comercial || d.tipo_vacina).join(', ');
      if (
        !(await requestUserConfirmation(
          `⚠️ Detectadas ${duplicates.length} vacina(s) que já existem no prontuário:\n\n${duplicateNames}\n\nEstas serão IGNORADAS. Apenas ${newRecords.length} nova(s) vacina(s) será(ão) importada(s).\n\nContinuar?`,
          {
            title: 'Duplicatas encontradas',
            tone: 'warning',
            confirmLabel: 'Continuar importação',
          },
        ))
      ) {
        return false;
      }
    }

    if (newRecords.length === 0) {
      showBlockingNotice(
        '❌ Todas as vacinas do cartão já estão no prontuário. Nenhuma nova vacina para importar.',
      );
      return false;
    }

    let importedCount = 0;
    const createdVaccines: VaccineRecord[] = [];
    const savedToken = getToken();
    const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';
    const validRecords = newRecords.filter((d) => !!d.data_aplicacao);

    if (!savedToken) {
      showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
      return false;
    }

    if (validRecords.length === 0) {
      showBlockingNotice(
        '❌ Nenhuma vacina com data de aplicação válida para importar.',
      );
      return false;
    }

    try {
      const ocrNotes = `${t('health.imported_ocr')}${cardAnalysis?.leitura_confiavel ? '' : ' (leitura parcial)'}`;
      const vaccinePayloads = validRecords.map((detected) => ({
        display_name: detected.nome_comercial || detected.tipo_vacina || 'Vacina',
        applied_on: detected.data_aplicacao as string,
        ...(detected.data_revacina ? { next_due_on: detected.data_revacina } : {}),
        notes: ocrNotes,
        source: 'ocr_card',
        confirmed_by_user: true,
        ...(detected.veterinario_responsavel
          ? { veterinarian: detected.veterinario_responsavel }
          : {}),
      }));

      const res = await fetch(
        `${API_BACKEND_BASE}/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify({
            country_code: countryCode,
            species: currentPet.species || 'dog',
            vaccines: vaccinePayloads,
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        for (let i = 0; i < data.vaccines.length; i++) {
          const saved = data.vaccines[i];
          const detected = validRecords[i];
          createdVaccines.push({
            id: saved.id,
            vaccine_type: mapTipoVacinaToVaccineType(detected.tipo_vacina || 'Outro'),
            vaccine_name: saved.display_name,
            date_administered: saved.applied_on,
            next_dose_date: saved.next_due_on || detected.data_revacina || undefined,
            veterinarian: detected.veterinario_responsavel || '',
            clinic_name: '',
            notes: saved.notes || ocrNotes,
            record_type: saved.record_type || 'confirmed_application',
            vaccine_code: saved.vaccine_code || undefined,
            country_code: saved.country_code || undefined,
            next_due_source: saved.next_due_source || 'unknown',
          });
        }
        importedCount = createdVaccines.length;
      } else if (res.status === 401 || res.status === 403) {
        showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
        return false;
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`bulk-confirm retornou ${res.status}: ${errText}`);
      }
    } catch (error) {
      console.error('Erro ao importar vacinas via bulk-confirm:', error);
    }

    // Fallback individual
    if (createdVaccines.length === 0) {
      for (const detected of validRecords) {
        try {
          const ocrNotes = `${t('health.imported_ocr')}${cardAnalysis?.leitura_confiavel ? '' : ' (leitura parcial)'}`;
          const appliedDate = detected.data_aplicacao as string;
          const nextDoseDate =
            detected.data_revacina ||
            (() => {
              const d = new Date(appliedDate);
              d.setFullYear(d.getFullYear() + 1);
              return dateToLocalISO(d);
            })();

          const res = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/vaccines`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${savedToken}`,
            },
            body: JSON.stringify({
              vaccine_name: detected.nome_comercial || detected.tipo_vacina || 'Vacina',
              applied_date: appliedDate,
              next_dose_date: nextDoseDate,
              notes: `${ocrNotes}${detected.veterinario_responsavel ? ` | Dr(a). ${detected.veterinario_responsavel}` : ''}`,
            }),
          });

          if (res.ok) {
            const saved = await res.json();
            createdVaccines.push({
              id: saved.id,
              vaccine_type: mapTipoVacinaToVaccineType(detected.tipo_vacina || 'Outro'),
              vaccine_name: saved.vaccine_name,
              date_administered: saved.applied_date,
              next_dose_date: saved.next_dose_date || detected.data_revacina || undefined,
              veterinarian: detected.veterinario_responsavel || '',
              clinic_name: '',
              notes: saved.notes || ocrNotes,
              record_type: 'confirmed_application',
            });
            importedCount++;
          } else if (res.status === 401 || res.status === 403) {
            showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
            return false;
          }
        } catch (error) {
          console.error('Erro ao importar vacina (fallback):', error);
        }
      }
    }

    if (createdVaccines.length > 0) {
      createdVaccines.forEach((vaccine) => {
        trackV1Metric('vaccine_record_created', {
          pet_id: currentPet.pet_id,
          vaccine_id: vaccine.id,
          vaccine_name: vaccine.vaccine_name,
          source: 'ocr_import',
        });
      });

      setVaccines((prevVaccines) => [...prevVaccines, ...createdVaccines]);
      setPets((prevPets) =>
        prevPets.map((p) =>
          p.pet_id === currentPet.pet_id
            ? { ...p, vaccines: [...(p.vaccines || []), ...createdVaccines] }
            : p,
        ),
      );
    }

    if (importedCount > 0) {
      if (selectedPetId) fetchPetEvents(selectedPetId);

      const allVaccinesNow = [...(vaccines || []), ...createdVaccines];
      const latestByType = latestVaccinePerGroup(allVaccinesNow);

      const overdueCurrent = Array.from(latestByType.values()).filter((v) => {
        if (!v.next_dose_date) return false;
        const next = createLocalDate(v.next_dose_date);
        return !Number.isNaN(next.getTime()) && next.getTime() < Date.now();
      });

      if (overdueCurrent.length > 0) {
        localStorage.setItem(
          'vaccine_alerts',
          JSON.stringify({
            count: overdueCurrent.length,
            vaccines: overdueCurrent.map((v) => v.vaccine_name),
            timestamp: Date.now(),
          }),
        );
      }
      setImportVaccineLoading(false);
      return true;
    } else {
      showBlockingNotice(
        '❌ Nenhuma vacina foi importada. Verifique se você está logado e tente novamente.',
      );
    }
    setImportVaccineLoading(false);
    return false;
  };

  // ── return ────────────────────────────────────────────────────────────────

  return {
    vaccines,
    setVaccines,
    showVaccineForm,
    setShowVaccineForm,
    vaccineFormSaving,
    setVaccineFormSaving,
    importVaccineLoading,
    setImportVaccineLoading,
    showQuickAddVaccine,
    setShowQuickAddVaccine,
    showAIUpload,
    setShowAIUpload,
    editingVaccine,
    setEditingVaccine,
    showFeedbackModal,
    setShowFeedbackModal,
    feedbackVaccine,
    setFeedbackVaccine,
    feedbackFormData,
    setFeedbackFormData,
    vaccineFormData,
    setVaccineFormData,
    quickAddData,
    setQuickAddData,
    loadVaccines,
    resetVaccineForm,
    calculateNextDose,
    handleSaveVaccine,
    handleEditVaccine,
    handleDeleteVaccine,
    handleDeleteAllVaccines,
    handleReportVaccineIssue,
    handleSubmitFeedback,
    handleQuickAddVaccine,
    handleImportAnalyzedVaccines,
  };
}
