import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { VaccineRecord } from '@/lib/petHealth';

export const updateVaccine = async (
  _petId: string,
  vaccineId: string,
  updates: Partial<VaccineRecord>,
): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const payload: Record<string, unknown> = {};
    if (updates.vaccine_name) payload.vaccine_name = updates.vaccine_name;
    if (updates.date_administered) payload.applied_date = updates.date_administered;
    if (updates.next_dose_date !== undefined) payload.next_dose_date = updates.next_dose_date || null;
    if (updates.notes !== undefined) payload.notes = updates.notes || null;
    if (updates.record_type) payload.record_type = updates.record_type;
    if (updates.alert_days_before !== undefined) payload.alert_days_before = updates.alert_days_before;
    if (updates.reminder_time !== undefined) payload.reminder_time = updates.reminder_time || null;
    if (updates.reminder_enabled !== undefined) payload.reminder_enabled = updates.reminder_enabled;
    if (updates.vaccine_type !== undefined) payload.vaccine_type = updates.vaccine_type;
    if (updates.veterinarian !== undefined) payload.veterinarian_name = updates.veterinarian || null;

    const response = await fetch(`${API_BASE_URL}/vaccines/${vaccineId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${savedToken}`,
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch (error) {
    console.error('Erro ao atualizar vacina:', error);
    return false;
  }
};

export const deleteVaccine = async (_petId: string, vaccineId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const response = await fetch(`${API_BASE_URL}/vaccines/${vaccineId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${savedToken}` },
    });

    return response.ok || response.status === 204;
  } catch (error) {
    console.error('Error deleting vaccine:', error);
    return false;
  }
};

export const clearAllVaccines = async (petId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const listRes = await fetch(`${API_BASE_URL}/pets/${petId}/vaccines`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    });
    if (!listRes.ok) return false;

    const list: { id: string }[] = await listRes.json();
    if (list.length === 0) return true;

    const results = await Promise.all(
      list.map((v) =>
        fetch(`${API_BASE_URL}/vaccines/${v.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${savedToken}` },
        }),
      ),
    );

    return results.every((r) => r.ok || r.status === 204);
  } catch (error) {
    console.error('Error clearing all vaccines:', error);
    return false;
  }
};
