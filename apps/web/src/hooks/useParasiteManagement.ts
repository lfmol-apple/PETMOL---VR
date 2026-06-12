'use client';

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { dateToLocalISO } from '@/lib/localDate';
import {
  requestUserConfirmation,
  showAppToast,
  showBlockingNotice,
} from '@/features/interactions/userPromptChannel';
import { trackV1Metric } from '@/lib/v1Metrics';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { ParasiteControl, ParasiteControlType } from '@/lib/types/home';
import type { ParasiteFormData } from '@/lib/types/homeForms';

// ---------------------------------------------------------------------------
// Module-level API helpers (extracted from page.tsx)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const generateParasiteId = () =>
  `par_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const addParasiteControl = async (
  petId: string,
  control: Partial<ParasiteControl>,
): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Faça login novamente.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${savedToken}`,
      },
      body: JSON.stringify({
        type: control.type,
        product_name: control.product_name,
        date_applied: control.date_applied,
        next_due_date: control.next_due_date || null,
        frequency_days: control.frequency_days ?? 30,
        dosage: control.dosage || null,
        application_form: control.application_form || null,
        veterinarian: control.veterinarian || null,
        cost: control.cost ?? null,
        purchase_location: control.purchase_location || null,
        collar_expiry_date: control.collar_expiry_date || null,
        reminder_enabled: control.reminder_enabled ?? true,
        reminder_days: control.reminder_days ?? control.alert_days_before ?? 7,
        alert_days_before: control.alert_days_before ?? null,
        reminder_time: control.reminder_time || null,
        notes: control.notes || null,
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [PARASITE] Erro ao salvar: ${res.status}`, errorText);
      return false;
    }

    if (control.type === 'dewormer') {
      trackV1Metric('worm_control_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
      });
      trackV1Metric('worm_control_applied', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.next_due_date ?? null,
      });
    }

    if (control.type === 'flea_tick') {
      trackV1Metric('flea_control_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
      });
      trackV1Metric('flea_control_applied', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.next_due_date ?? null,
      });
    }

    if (control.type === 'collar') {
      trackV1Metric('collar_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.collar_expiry_date ?? null,
      });
    }

    return true;
  } catch (error) {
    console.error('❌ [PARASITE] ERRO CRÍTICO:', error);
    return false;
  }
};

const updateParasiteControl = async (
  petId: string,
  controlId: string,
  updates: Partial<ParasiteControl>,
): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    // Sanitize: convert empty strings to null for optional datetime/string fields
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      sanitized[k] = v === '' || v === undefined ? null : v;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${controlId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${savedToken}`,
      },
      body: JSON.stringify(sanitized),
    });
    if (!res.ok) {
      console.error('Erro ao atualizar controle de parasitas:', res.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Erro ao atualizar controle de parasitas:', error);
    return false;
  }
};

const deleteParasiteControl = async (
  petId: string,
  controlId: string,
): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${controlId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${savedToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARASITE_FORM_DEFAULTS: ParasiteFormData = {
  type: 'dewormer' as ParasiteControlType,
  product_name: '',
  date_applied: '',
  frequency_days: 90, // Padrão Brasil: 3 meses para vermífugo
  application_form: 'oral',
  dosage: '',
  veterinarian: '',
  cost: 0,
  notes: '',
  collar_expiry_date: '',
  alert_days_before: 7, // Padrão: 7 dias de antecedência
  reminder_time: '09:00',
  purchase_location: '',
  reminder_enabled: true, // Lembrete ativado por padrão
};

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseParasiteManagementParams {
  selectedPetId: string | null;
  pets: PetHealthProfile[];
  setPets: Dispatch<SetStateAction<PetHealthProfile[]>>;
  fetchPetEvents: (petId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useParasiteManagement({
  selectedPetId,
  pets,
  setPets,
  fetchPetEvents,
  t,
}: UseParasiteManagementParams) {
  const [parasiteControls, setParasiteControls] = useState<ParasiteControl[]>([]);
  const [showParasiteForm, setShowParasiteForm] = useState(false);
  const [editingParasite, setEditingParasite] = useState<ParasiteControl | null>(null);
  const [parasiteFormData, setParasiteFormData] = useState<ParasiteFormData>(
    PARASITE_FORM_DEFAULTS,
  );

  // Helper: parse YYYY-MM-DD without timezone shift
  const createLocalDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const getCurrentPet = () => pets.find(p => p.pet_id === selectedPetId) || pets[0];

  const calculateNextDose = (dateApplied: string, frequencyDays: number): string => {
    const date = createLocalDate(dateApplied);
    date.setDate(date.getDate() + frequencyDays);
    return dateToLocalISO(date);
  };

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  const loadParasiteControls = async () => {
    const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    try {
      const savedToken = getToken();
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/parasites`, {
        headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : undefined,
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        type: ParasiteControlType;
        product_name: string;
        date_applied?: string | null;
        next_due_date?: string | null;
        frequency_days: number;
        dosage?: string | null;
        application_form?: ParasiteFormData['application_form'];
        veterinarian?: string | null;
        cost?: number;
        purchase_location?: string | null;
        reminder_days: number;
        collar_expiry_date?: string | null;
        alert_days_before?: number;
        reminder_time?: string | null;
        reminder_enabled?: boolean;
        notes?: string | null;
      }> = await res.json();
      const _d = (raw: string | null | undefined): string =>
        raw ? raw.replace('T', ' ').split(' ')[0] : '';
      const mapped: ParasiteControl[] = data.map(p => ({
        id: p.id,
        type: p.type,
        product_name: p.product_name,
        date_applied: _d(p.date_applied),
        next_due_date: p.next_due_date ? _d(p.next_due_date) : undefined,
        frequency_days: p.frequency_days,
        dosage: p.dosage || '',
        application_form: p.application_form,
        veterinarian: p.veterinarian || '',
        cost: p.cost,
        purchase_location: p.purchase_location || '',
        reminder_days: p.reminder_days,
        collar_expiry_date: p.collar_expiry_date ? _d(p.collar_expiry_date) : '',
        alert_days_before: p.alert_days_before,
        reminder_time: p.reminder_time || undefined,
        reminder_enabled: p.reminder_enabled,
        notes: p.notes || '',
      } as ParasiteControl));
      const sorted = mapped.sort(
        (a, b) =>
          createLocalDate(b.date_applied).getTime() -
          createLocalDate(a.date_applied).getTime(),
      );
      setParasiteControls(sorted);
      setPets(prevPets =>
        prevPets.map(p =>
          p.pet_id === pet.pet_id ? { ...p, parasite_controls: sorted } : p,
        ),
      );
    } catch {}
  };

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const resetParasiteForm = () => {
    setParasiteFormData({ ...PARASITE_FORM_DEFAULTS });
    setEditingParasite(null);
    setShowParasiteForm(false);
  };

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSaveParasite = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet || !parasiteFormData.product_name || !parasiteFormData.date_applied) {
      showBlockingNotice('Preencha os campos obrigatórios: Produto e Data de aplicação');
      return;
    }

    try {
      const nextDueDate = calculateNextDose(
        parasiteFormData.date_applied,
        parasiteFormData.frequency_days,
      );

      const normalizedProductName = parasiteFormData.product_name.trim();

      const controlData: Partial<ParasiteControl> = {
        ...parasiteFormData,
        product_name: normalizedProductName,
        next_due_date: nextDueDate,
        pet_weight_kg:
          (currentPet as PetHealthProfile & { weight_kg?: number })?.weight_kg || undefined,
      };

      let success = false;
      if (editingParasite) {
        success = await updateParasiteControl(currentPet.pet_id, editingParasite.id, controlData);
        if (success) {
          setParasiteControls(prev =>
            prev.map(c =>
              c.id === editingParasite.id ? ({ ...c, ...controlData } as ParasiteControl) : c,
            ),
          );
          showBlockingNotice('✅ Controle atualizado com sucesso!');
        }
      } else {
        success = await addParasiteControl(currentPet.pet_id, controlData);
        if (success) {
          showBlockingNotice('✅ Controle registrado no prontuário!');
        }
      }

      if (success) {
        await loadParasiteControls();
        resetParasiteForm();
        if (selectedPetId) fetchPetEvents(selectedPetId);
      } else {
        showBlockingNotice(t('parasite.error_save'));
      }
    } catch (error) {
      console.error('Erro ao salvar controle:', error);
      showBlockingNotice(t('parasite.error_save'));
    }
  };

  // -------------------------------------------------------------------------
  // Edit
  // -------------------------------------------------------------------------

  const handleEditParasite = (control: ParasiteControl) => {
    setEditingParasite(control);
    setParasiteFormData({
      type: control.type,
      product_name: control.product_name,
      date_applied: control.date_applied,
      frequency_days: control.frequency_days,
      application_form: control.application_form || 'oral',
      dosage: control.dosage || '',
      veterinarian: control.veterinarian || '',
      cost: control.cost || 0,
      notes: control.notes || '',
      collar_expiry_date: control.collar_expiry_date || '',
      alert_days_before: control.alert_days_before || 7,
      reminder_time: control.reminder_time || '09:00',
      purchase_location: control.purchase_location || '',
      reminder_enabled:
        control.reminder_enabled !== undefined ? control.reminder_enabled : true,
    });
    setShowParasiteForm(true);
  };

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const handleDeleteParasite = async (control: ParasiteControl) => {
    const currentPet = getCurrentPet();
    if (!currentPet) return;

    const accepted = await requestUserConfirmation(
      t('parasite.delete_confirm', { name: control.product_name }),
      {
        title: 'Excluir controle parasitário',
        tone: 'danger',
        confirmLabel: 'Excluir registro',
      },
    );
    if (!accepted) return;

    try {
      const success = await deleteParasiteControl(currentPet.pet_id, control.id);
      if (success) {
        setParasiteControls(prev => prev.filter(c => c.id !== control.id));
        showAppToast('Registro removido.');
        await loadParasiteControls();
      } else {
        showBlockingNotice(t('parasite.error_delete'));
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      showBlockingNotice(t('parasite.error_delete'));
    }
  };

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    parasiteControls,
    setParasiteControls,
    showParasiteForm,
    setShowParasiteForm,
    editingParasite,
    setEditingParasite,
    parasiteFormData,
    setParasiteFormData,
    loadParasiteControls,
    handleSaveParasite,
    handleEditParasite,
    handleDeleteParasite,
    resetParasiteForm,
  };
}
