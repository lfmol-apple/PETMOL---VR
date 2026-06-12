import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';
import type { GroomingRecord } from '@/lib/types/home';

export const addGroomingRecord = async (petId: string, record: GroomingRecord): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Por favor, faça login novamente para salvar os dados.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
      body: JSON.stringify({
        type: record.type,
        date: record.date,
        scheduled_time: record.scheduled_time || null,
        location: record.location || null,
        location_address: record.location_address || null,
        location_phone: record.location_phone || null,
        location_place_id: record.location_place_id || null,
        groomer: record.groomer || null,
        cost: record.cost ?? null,
        notes: record.notes || null,
        next_recommended_date: record.next_recommended_date || null,
        frequency_days: record.frequency_days ?? null,
        reminder_enabled: record.reminder_enabled ?? true,
        alert_days_before: record.alert_days_before ?? null,
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [GROOMING] Erro ao salvar: ${res.status}`, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ [GROOMING] ERRO CRÍTICO ao adicionar registro:', error);
    return false;
  }
};

export const updateGroomingRecord = async (
  petId: string,
  recordId: string,
  updates: Partial<GroomingRecord>,
): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Faça login novamente.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [GROOMING UPDATE] Erro ao atualizar: ${res.status}`, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ [GROOMING UPDATE] ERRO CRÍTICO:', error);
    return false;
  }
};

export const deleteGroomingRecord = async (petId: string, recordId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${recordId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${savedToken}` },
    });
    return res.ok;
  } catch (error) {
    console.error('Erro ao deletar registro de grooming:', error);
    return false;
  }
};
