export interface PetEventExtraData {
  treatment_days?: string | number;
  custom_interval_days?: string | number;
  total_doses?: string | number;
  applied_dates?: string[];
  skipped_dates?: string[];
  dose_notes?: Record<string, string>;
  reminder_time?: string;
  reminder_times?: string[];
  dosage?: string;
  veterinarian?: string;
  clinic_name?: string;
  [key: string]: unknown;
}

export interface PetEventRecord {
  id: string;
  type: string;
  title: string;
  scheduled_at: string;
  status: string;
  source?: string;
  notes?: string;
  next_due_date?: string;
  location_name?: string;
  professional_name?: string;
  cost?: string | number | null;
  extra_data?: string | PetEventExtraData | null;
}

export function parsePetEventExtraData(extraData: PetEventRecord['extra_data']): PetEventExtraData {
  if (!extraData) return {};
  if (typeof extraData === 'object') return extraData;

  try {
    const parsed = JSON.parse(extraData);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
