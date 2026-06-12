import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';

const toDateStr = (raw: string | null | undefined): string =>
  raw ? raw.replace('T', ' ').split(' ')[0] : '';

type ParsedHealthData = {
  photo?: string;
  photo_url?: string;
  pet_photo_url?: string;
  vaccines?: VaccineRecord[];
  parasite_controls?: ParasiteControl[];
  grooming_records?: GroomingRecord[];
  exams?: PetHealthProfile['exams'];
  prescriptions?: PetHealthProfile['prescriptions'];
  appointments?: PetHealthProfile['appointments'];
  surgeries?: PetHealthProfile['surgeries'];
  allergies?: PetHealthProfile['allergies'];
  chronic_conditions?: PetHealthProfile['chronic_conditions'];
  dental_records?: PetHealthProfile['dental_records'];
  parasite_history?: PetHealthProfile['parasite_history'];
  documents?: PetHealthProfile['documents'];
  daily_walks?: PetHealthProfile['daily_walks'];
  primary_vet?: PetHealthProfile['primary_vet'];
  [key: string]: unknown;
};

type BackendVaccineRecord = {
  id: string;
  deleted?: boolean;
  vaccine_type?: string;
  vaccine_name: string;
  applied_date?: string | null;
  next_dose_date?: string | null;
  veterinarian_name?: string | null;
  clinic_name?: string | null;
  notes?: string | null;
  // Catalog enrichment fields — must be preserved so vaccineGroupKey can use vaccine_code
  vaccine_code?: string | null;
  country_code?: string | null;
  next_due_source?: string | null;
  alert_days_before?: number | null;
  reminder_time?: string | null;
};

type BackendParasiteControlRecord = {
  id: string;
  deleted?: boolean;
  type: ParasiteControl['type'];
  product_name: string;
  date_applied?: string | null;
  next_due_date?: string | null;
  frequency_days: number;
  dosage?: string | null;
  application_form?: ParasiteControl['application_form'];
  veterinarian?: string | null;
  cost?: number;
  purchase_location?: string | null;
  reminder_days: number;
  collar_expiry_date?: string | null;
  alert_days_before?: number;
  reminder_time?: string | null;
  reminder_enabled?: boolean;
  notes?: string | null;
};

type BackendGroomingRecord = {
  id: string;
  deleted?: boolean;
  type: GroomingRecord['type'];
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
  frequency_days?: number;
  reminder_enabled?: boolean;
  alert_days_before?: number;
};

type BackendPet = {
  id: string | number;
  name: string;
  species: PetHealthProfile['species'];
  breed?: string;
  birth_date?: string;
  sex?: PetHealthProfile['sex'];
  neutered?: boolean;
  photo?: string;
  photo_url?: string;
  pet_photo_url?: string;
  weight_value?: number;
  weight_unit?: 'kg' | 'lb';
  updated_at?: string;
  created_at?: string;
  health_data?: unknown;
  vaccine_records?: BackendVaccineRecord[];
  parasite_control_records?: BackendParasiteControlRecord[];
  grooming_records?: BackendGroomingRecord[];
  insurance_provider?: string;
  user_id?: string;
};

const parseHealthData = (healthData: unknown): ParsedHealthData => {
  if (!healthData) return {};
  if (typeof healthData === 'string') {
    try {
      return JSON.parse(healthData) as ParsedHealthData;
    } catch {
      return {};
    }
  }
  if (typeof healthData === 'object') {
    return healthData as ParsedHealthData;
  }
  return {};
};

export function resolveBackendPetPhoto(pet: {
  photo?: string | null;
  photo_url?: string | null;
  pet_photo_url?: string | null;
  health_data?: unknown;
}): string | undefined {
  const healthData = parseHealthData(pet.health_data);
  return (
    pet.photo ||
    pet.photo_url ||
    pet.pet_photo_url ||
    healthData.photo ||
    healthData.photo_url ||
    healthData.pet_photo_url ||
    undefined
  );
}

export function normalizeBackendPetProfile(pet: BackendPet): PetHealthProfile {
  const healthData = parseHealthData(pet.health_data);
  const resolvedPhoto = resolveBackendPetPhoto(pet);

  const vaccines = (() => {
    const fromRecords = (pet.vaccine_records || [])
      .filter((v) => !v.deleted)
      .map((v): VaccineRecord => ({
        id: v.id,
        vaccine_type: (v.vaccine_type as VaccineRecord['vaccine_type']) || 'multiple',
        vaccine_name: v.vaccine_name,
        date_administered: toDateStr(v.applied_date),
        next_dose_date: v.next_dose_date ? toDateStr(v.next_dose_date) : undefined,
        veterinarian: v.veterinarian_name || '',
        clinic_name: v.clinic_name || '',
        notes: v.notes || undefined,
        // Preserve catalog enrichment fields — critical for vaccineGroupKey to use vaccine_code
        // instead of falling back to name normalization on initial page load.
        vaccine_code: v.vaccine_code || undefined,
        country_code: v.country_code || undefined,
        next_due_source: v.next_due_source || undefined,
        alert_days_before: v.alert_days_before ?? undefined,
        reminder_time: v.reminder_time || undefined,
      }));
    return fromRecords.length > 0 ? fromRecords : (healthData.vaccines || []);
  })();

  const parasiteControls = (pet.parasite_control_records || []).length > 0
    ? (pet.parasite_control_records || [])
    .filter((p) => !p.deleted)
    .map((p): ParasiteControl => ({
      id: p.id,
      type: p.type,
      product_name: p.product_name,
      date_applied: toDateStr(p.date_applied),
      next_due_date: p.next_due_date ? toDateStr(p.next_due_date) : undefined,
      frequency_days: p.frequency_days,
      dosage: p.dosage || '',
      application_form: p.application_form,
      veterinarian: p.veterinarian || '',
      cost: p.cost,
      purchase_location: p.purchase_location || '',
      reminder_days: p.reminder_days ?? p.alert_days_before ?? 7,
      collar_expiry_date: p.collar_expiry_date ? toDateStr(p.collar_expiry_date) : '',
      alert_days_before: p.alert_days_before,
      reminder_time: p.reminder_time || undefined,
      reminder_enabled: p.reminder_enabled,
      notes: p.notes || '',
    }))
    : (healthData.parasite_controls || []);

  const groomingRecords = (pet.grooming_records || []).length > 0
    ? (pet.grooming_records || [])
    .filter((g) => !g.deleted)
    .map((g): GroomingRecord => ({
      id: g.id,
      pet_id: String(pet.id),
      type: g.type,
      date: toDateStr(g.date),
      scheduled_time: g.scheduled_time,
      location: g.location || '',
      location_address: g.location_address || '',
      location_phone: g.location_phone || '',
      location_place_id: g.location_place_id || '',
      groomer: g.groomer || '',
      cost: g.cost,
      notes: g.notes || '',
      next_recommended_date: g.next_recommended_date ? toDateStr(g.next_recommended_date) : undefined,
      frequency_days: g.frequency_days,
      reminder_enabled: g.reminder_enabled,
      alert_days_before: g.alert_days_before,
    }))
    : (healthData.grooming_records || []);

  return {
    pet_id: String(pet.id),
    pet_name: pet.name,
    species: pet.species,
    breed: pet.breed,
    birth_date: pet.birth_date,
    sex: pet.sex,
    neutered: pet.neutered,
    photo: resolvedPhoto,
    weight_history: pet.weight_value ? [{
      id: Date.now().toString(),
      weight: pet.weight_value,
      weight_unit: pet.weight_unit || 'kg' as const,
      date: pet.updated_at || new Date().toISOString(),
      notes: 'Peso do cadastro',
    }] : [],
    vaccines,
    exams: healthData.exams || [],
    prescriptions: healthData.prescriptions || [],
    appointments: healthData.appointments || [],
    surgeries: healthData.surgeries || [],
    allergies: healthData.allergies || [],
    chronic_conditions: healthData.chronic_conditions || [],
    dental_records: healthData.dental_records || [],
    parasite_history: healthData.parasite_history || [],
    documents: healthData.documents || [],
    daily_walks: healthData.daily_walks || [],
    parasite_controls: parasiteControls,
    grooming_records: groomingRecords,
    health_data: healthData,
    primary_vet: healthData.primary_vet || { name: '', clinic: '', phone: '' },
    insurance_provider: pet.insurance_provider || undefined,
    owner_user_id: pet.user_id || undefined,
    created_at: pet.created_at || new Date().toISOString(),
    updated_at: pet.updated_at || new Date().toISOString(),
  } as PetHealthProfile;
}

export function normalizeBackendPetProfiles(backendPets: BackendPet[]): PetHealthProfile[] {
  const convertedPets = backendPets.map(normalizeBackendPetProfile);
  convertedPets.sort((a, b) => {
    const aName = (a.pet_name || '').toLowerCase();
    const bName = (b.pet_name || '').toLowerCase();
    if (aName === 'baby') return -1;
    if (bName === 'baby') return 1;
    return 0;
  });
  return convertedPets;
}
