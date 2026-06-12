/**
 * Pet Health Management System
 * Complete medical history tracking: vaccines, exams, prescriptions, appointments, etc.
 * All data stored locally in localStorage
 */

import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';


// ============================================================
// TYPES & INTERFACES
// ============================================================

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'fish' | 'rabbit' | 'hamster' | 'other';
export type VaccineType =
  | 'rabies'
  | 'multiple'
  | 'distemper'
  | 'parvovirus'
  | 'adenovirus'
  | 'hepatitis'
  | 'parainfluenza'
  | 'bordetella'
  | 'leptospirosis'
  | 'kennel_cough'
  | 'giardia'
  | 'coronavirus'
  | 'influenza'
  | 'lyme'
  | 'leishmaniasis'
  | 'feline_leukemia'
  | 'feline_distemper'
  | 'other';
export type ExamType = 'blood' | 'urine' | 'feces' | 'xray' | 'ultrasound' | 'ecg' | 'biopsy' | 'other';
export type AppointmentType = 'routine' | 'emergency' | 'vaccination' | 'surgery' | 'dental' | 'grooming' | 'behavioral' | 'other';
export type MedicationType = 'pill' | 'liquid' | 'injection' | 'topical' | 'other';
export type AllergyType = 'food' | 'environmental' | 'medication' | 'parasite' | 'other';
export type BloodType = 'DEA1.1+' | 'DEA1.1-' | 'A' | 'B' | 'AB' | 'unknown';
export type WalkIntensity = 'light' | 'moderate' | 'intense';
export type ActivityType = 'walk' | 'run' | 'play' | 'training' | 'other';

export interface VaccineRecord {
  id: string;
  vaccine_type: VaccineType;
  vaccine_name: string; // e.g., "V10", "Raiva", "Triple Felina"
  date_administered: string; // ISO date
  next_dose_date?: string; // ISO date for boosters
  veterinarian: string;
  clinic_name: string;
  batch_number?: string;
  notes?: string;
  certificate_photo?: string; // base64 or URL
  // Catalog enrichment fields (set when saved via /vaccines/bulk-confirm)
  vaccine_code?: string;      // e.g. "DOG_RABIES", "CAT_POLYVALENT"
  country_code?: string;      // e.g. "BR", "US"
  next_due_source?: string;   // "protocol" | "manual" | "unknown"
  record_type?: 'confirmed_application' | 'estimated_control_start';
  alert_days_before?: number;
  reminder_time?: string;
  reminder_enabled?: boolean;
  deleted_at?: string;
}

export interface MedicalExam {
  id: string;
  exam_type: ExamType;
  exam_name: string;
  date: string; // ISO date
  veterinarian: string;
  clinic_name: string;
  results: string; // Description of results
  files?: string[]; // base64 images/PDFs
  diagnosis?: string;
  recommendations?: string;
  cost?: number;
  cost_currency?: string;
}

export interface Prescription {
  id: string;
  medication_name: string;
  medication_type: MedicationType;
  dosage: string; // e.g., "10mg", "2 comprimidos"
  frequency: string; // e.g., "2x ao dia", "a cada 12h"
  duration: string; // e.g., "7 dias", "uso contínuo"
  start_date: string; // ISO date
  end_date?: string; // ISO date
  veterinarian: string;
  clinic_name: string;
  reason: string; // Why prescribed
  notes?: string;
  prescription_photo?: string; // base64 or URL
  is_active: boolean; // Currently taking
  reminders_enabled: boolean; // Send notifications
}

export interface Appointment {
  id: string;
  appointment_type: AppointmentType;
  date: string; // ISO date
  time?: string; // e.g., "14:30"
  veterinarian: string;
  clinic_name: string;
  clinic_address?: string;
  clinic_phone?: string;
  reason: string;
  symptoms?: string;
  diagnosis?: string;
  treatment?: string;
  cost?: number;
  cost_currency?: string;
  notes?: string;
  follow_up_date?: string; // ISO date
  is_completed: boolean;
}

export interface Surgery {
  id: string;
  surgery_name: string;
  date: string; // ISO date
  veterinarian: string;
  clinic_name: string;
  description: string;
  anesthesia_used?: string;
  complications?: string;
  recovery_instructions: string;
  cost?: number;
  cost_currency?: string;
  files?: string[]; // Photos, documents
  follow_up_date?: string;
}

export interface Allergy {
  id: string;
  allergy_type: AllergyType;
  allergen: string; // What causes the allergy
  symptoms: string;
  severity: 'mild' | 'moderate' | 'severe';
  diagnosed_date: string; // ISO date
  treatment?: string;
  notes?: string;
}

export interface ChronicCondition {
  id: string;
  condition_name: string;
  diagnosed_date: string; // ISO date
  severity: 'mild' | 'moderate' | 'severe';
  treatment: string;
  medications?: string[]; // Medication names
  management_notes: string;
  veterinarian: string;
}

export interface WeightRecord {
  id: string;
  date: string; // ISO date
  weight: number;
  weight_unit: 'kg' | 'lb';
  body_condition_score?: number; // 1-9 scale
  notes?: string;
}

export interface DentalRecord {
  id: string;
  date: string; // ISO date
  procedure: string; // e.g., "Limpeza", "Extração"
  teeth_extracted?: string[]; // Which teeth
  veterinarian: string;
  clinic_name: string;
  notes?: string;
  cost?: number;
  next_cleaning_date?: string;
}

export interface Parasite {
  id: string;
  parasite_type: string; // e.g., "Pulgas", "Carrapatos", "Vermes"
  detected_date: string; // ISO date
  treatment: string;
  treatment_date: string;
  veterinarian: string;
  resolved: boolean;
  notes?: string;
}

export interface DailyWalk {
  id: string;
  date: string; // ISO date
  time?: string; // e.g., "07:30", "18:00"
  duration_minutes: number;
  distance_km?: number;
  activity_type: ActivityType;
  intensity: WalkIntensity;
  location?: string; // e.g., "Parque Municipal", "Bairro"
  weather?: string; // e.g., "Ensolarado", "Chuvoso"
  behavior_notes?: string; // How the pet behaved
  incidents?: string; // Any incidents (fights, injuries, etc.)
  poop?: boolean; // Did the pet poop?
  pee?: boolean; // Did the pet pee?
  companions?: string[]; // Other pets/people who joined
  photos?: string[]; // base64 photos from the walk
  calories_burned?: number; // Estimated calories
}

export interface ActivityGoals {
  daily_walks_target: number; // How many walks per day
  daily_minutes_target: number; // Total minutes of activity per day
  weekly_distance_target?: number; // Target distance in km per week
}

export interface HealthDocument {
  id: string;
  document_type: string; // e.g., "Atestado", "Exame", "Receita"
  title: string;
  date: string; // ISO date
  file_data: string; // base64 PDF/image
  file_type: string; // MIME type
  notes?: string;
}

export interface PetHealthProfile {
  pet_id: string; // Links to main pet profile
  pet_name: string;
  species: PetSpecies;
  breed?: string;
  birth_date?: string; // ISO date
  sex?: 'male' | 'female';
  neutered?: boolean;
  blood_type?: BloodType;
  microchip_number?: string;
  photo?: string; // Base64 image data
  owner_user_id?: string; // ID do dono do pet (pode ser diferente do usuário logado em contas família)
  
  // Medical history
  vaccines: VaccineRecord[];
  exams: MedicalExam[];
  prescriptions: Prescription[];
  appointments: Appointment[];
  surgeries: Surgery[];
  allergies: Allergy[];
  chronic_conditions: ChronicCondition[];
  weight_history: WeightRecord[];
  dental_records: DentalRecord[];
  parasite_history: Parasite[];
  parasite_controls?: ParasiteControl[]; // Controles parasitários (vermífugos, antipulgas, etc)
  grooming_records?: GroomingRecord[]; // Registros de banho e tosa
  documents: HealthDocument[];
  daily_walks: DailyWalk[];
  activity_goals?: ActivityGoals;
  health_data?: Record<string, unknown>; // Dados completos de saúde do backend
  
  // Emergency contacts
  primary_vet: {
    name: string;
    clinic: string;
    phone: string;
    address?: string;
  };
  emergency_vet?: {
    name: string;
    clinic: string;
    phone: string;
    address?: string;
  };
  
  // Insurance / plan
  insurance_provider?: string; // e.g. 'petlove' | 'doglife' | custom name

  // Metadata
  created_at: string;
  updated_at: string;
}

// ============================================================
// STORAGE KEYS
// ============================================================

const STORAGE_KEY = 'petmol_health_profiles';
const STORAGE_VERSION = 'v1';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getCurrentISODate(): string {
  return new Date().toISOString();
}

// Check if localStorage is available
function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

// Safe storage operations with fallback
const storageAvailable = typeof window !== 'undefined' && isStorageAvailable();

function safeGetItem(key: string): string | null {
  if (!storageAvailable) return null;
  
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error('Failed to get item from storage:', error);
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  if (!storageAvailable) {
    console.warn('Storage not available, data will not persist');
    return false;
  }
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error('Failed to set item in storage:', error);
    return false;
  }
}

// ============================================================
// CRUD OPERATIONS - Health Profile
// ============================================================

export function getHealthProfile(petId: string): PetHealthProfile | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const profiles: Record<string, PetHealthProfile> = JSON.parse(stored);
    return profiles[petId] || null;
  } catch (error) {
    console.error('Failed to get health profile:', error);
    return null;
  }
}

export function getAllHealthProfiles(): PetHealthProfile[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const profiles: Record<string, PetHealthProfile> = JSON.parse(stored);
    return Object.values(profiles);
  } catch (error) {
    console.error('Failed to get health profiles:', error);
    return [];
  }
}

export function createHealthProfile(
  petId: string,
  petName: string,
  species: PetSpecies,
  additionalData?: Partial<PetHealthProfile>
): PetHealthProfile {
  if (typeof window === 'undefined') throw new Error('Cannot create profile on server');
  
  const newProfile: PetHealthProfile = {
    pet_id: petId,
    pet_name: petName,
    species,
    vaccines: [],
    exams: [],
    prescriptions: [],
    appointments: [],
    surgeries: [],
    allergies: [],
    chronic_conditions: [],
    weight_history: [],
    dental_records: [],
    parasite_history: [],
    documents: [],
    daily_walks: [],
    primary_vet: { name: '', clinic: '', phone: '' },
    created_at: getCurrentISODate(),
    updated_at: getCurrentISODate(),
    ...additionalData,
  };
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const profiles: Record<string, PetHealthProfile> = stored ? JSON.parse(stored) : {};
    profiles[petId] = newProfile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    return newProfile;
  } catch (error) {
    console.error('Failed to create health profile:', error);
    // Return profile anyway for in-memory use
    return newProfile;
  }
}

export function updateHealthProfile(petId: string, updates: Partial<PetHealthProfile>): PetHealthProfile | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const profiles: Record<string, PetHealthProfile> = JSON.parse(stored);
    const profile = profiles[petId];
    if (!profile) return null;
    
    profiles[petId] = {
      ...profile,
      ...updates,
      updated_at: getCurrentISODate(),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    return profiles[petId];
  } catch (error) {
    console.error('Failed to update health profile:', error);
    return null;
  }
}

export function deleteHealthProfile(petId: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    
    const profiles: Record<string, PetHealthProfile> = JSON.parse(stored);
    delete profiles[petId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    return true;
  } catch (error) {
    console.error('Failed to delete health profile:', error);
    return false;
  }
}

// ============================================================
// VACCINE MANAGEMENT
// ============================================================

export function addVaccine(petId: string, vaccine: Omit<VaccineRecord, 'id'>): VaccineRecord | null {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return null;
    
    const newVaccine: VaccineRecord = {
      ...vaccine,
      id: generateId(),
    };
    
    profile.vaccines.push(newVaccine);
    updateHealthProfile(petId, { vaccines: profile.vaccines });
    return newVaccine;
  } catch (error) {
    console.error('Failed to add vaccine:', error);
    return null;
  }
}

export function updateVaccine(petId: string, vaccineId: string, updates: Partial<VaccineRecord>): boolean {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return false;
    
    const index = profile.vaccines.findIndex(v => v.id === vaccineId);
    if (index === -1) return false;
    
    profile.vaccines[index] = { ...profile.vaccines[index], ...updates };
    updateHealthProfile(petId, { vaccines: profile.vaccines });
    return true;
  } catch (error) {
    console.error('Failed to update vaccine:', error);
    return false;
  }
}

export function deleteVaccine(petId: string, vaccineId: string): boolean {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return false;
    
    profile.vaccines = profile.vaccines.filter(v => v.id !== vaccineId);
    updateHealthProfile(petId, { vaccines: profile.vaccines });
    return true;
  } catch (error) {
    console.error('Failed to delete vaccine:', error);
    return false;
  }
}

export function getUpcomingVaccines(petId: string, daysAhead: number = 30): VaccineRecord[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  return profile.vaccines
    .filter(v => v.next_dose_date)
    .filter(v => {
      const nextDose = new Date(v.next_dose_date!);
      return nextDose >= now && nextDose <= futureDate;
    })
    .sort((a, b) => new Date(a.next_dose_date!).getTime() - new Date(b.next_dose_date!).getTime());
}

// ============================================================
// PRESCRIPTION MANAGEMENT
// ============================================================

export function addPrescription(petId: string, prescription: Omit<Prescription, 'id'>): Prescription | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newPrescription: Prescription = {
    ...prescription,
    id: generateId(),
  };
  
  profile.prescriptions.push(newPrescription);
  updateHealthProfile(petId, { prescriptions: profile.prescriptions });
  return newPrescription;
}

export function getActivePrescriptions(petId: string): Prescription[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const now = new Date();
  
  return profile.prescriptions
    .filter(p => p.is_active)
    .filter(p => {
      if (!p.end_date) return true; // Continuous use
      return new Date(p.end_date) >= now;
    })
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
}

export function updatePrescription(petId: string, prescriptionId: string, updates: Partial<Prescription>): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  const index = profile.prescriptions.findIndex(p => p.id === prescriptionId);
  if (index === -1) return false;
  
  profile.prescriptions[index] = { ...profile.prescriptions[index], ...updates };
  updateHealthProfile(petId, { prescriptions: profile.prescriptions });
  return true;
}

export function deletePrescription(petId: string, prescriptionId: string): boolean {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return false;
    
    profile.prescriptions = profile.prescriptions.filter(p => p.id !== prescriptionId);
    updateHealthProfile(petId, { prescriptions: profile.prescriptions });
    return true;
  } catch (error) {
    console.error('Failed to delete prescription:', error);
    return false;
  }
}

// ============================================================
// EXAM MANAGEMENT
// ============================================================

export function addExam(petId: string, exam: Omit<MedicalExam, 'id'>): MedicalExam | null {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return null;
    
    const newExam: MedicalExam = {
      ...exam,
      id: generateId(),
    };
    
    profile.exams.push(newExam);
    updateHealthProfile(petId, { exams: profile.exams });
    return newExam;
  } catch (error) {
    console.error('Failed to add exam:', error);
    return null;
  }
}

export function getExamsByType(petId: string, examType: ExamType): MedicalExam[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  return profile.exams
    .filter(e => e.exam_type === examType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function deleteExam(petId: string, examId: string): boolean {
  try {
    const profile = getHealthProfile(petId);
    if (!profile) return false;
    
    profile.exams = profile.exams.filter(e => e.id !== examId);
    updateHealthProfile(petId, { exams: profile.exams });
    return true;
  } catch (error) {
    console.error('Failed to delete exam:', error);
    return false;
  }
}

// ============================================================
// APPOINTMENT MANAGEMENT
// ============================================================

export function addAppointment(petId: string, appointment: Omit<Appointment, 'id'>): Appointment | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newAppointment: Appointment = {
    ...appointment,
    id: generateId(),
  };
  
  profile.appointments.push(newAppointment);
  updateHealthProfile(petId, { appointments: profile.appointments });
  return newAppointment;
}

export function getUpcomingAppointments(petId: string): Appointment[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const now = new Date();
  
  return profile.appointments
    .filter(a => !a.is_completed)
    .filter(a => new Date(a.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function updateAppointment(petId: string, appointmentId: string, updates: Partial<Appointment>): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  const index = profile.appointments.findIndex(a => a.id === appointmentId);
  if (index === -1) return false;
  
  profile.appointments[index] = { ...profile.appointments[index], ...updates };
  updateHealthProfile(petId, { appointments: profile.appointments });
  return true;
}

export function deleteAppointment(petId: string, appointmentId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.appointments = profile.appointments.filter(a => a.id !== appointmentId);
  updateHealthProfile(petId, { appointments: profile.appointments });
  return true;
}

// ============================================================
// WEIGHT TRACKING
// ============================================================

export function addWeightRecord(petId: string, weight: Omit<WeightRecord, 'id'>): WeightRecord | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newWeight: WeightRecord = {
    ...weight,
    id: generateId(),
  };
  
  profile.weight_history.push(newWeight);
  updateHealthProfile(petId, { weight_history: profile.weight_history });
  return newWeight;
}

export function getWeightHistory(petId: string, limit?: number): WeightRecord[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const sorted = [...profile.weight_history].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  return limit ? sorted.slice(0, limit) : sorted;
}

export function getLatestWeight(petId: string): WeightRecord | null {
  const history = getWeightHistory(petId, 1);
  return history[0] || null;
}

// ============================================================
// ALLERGY MANAGEMENT
// ============================================================

export function addAllergy(petId: string, allergy: Omit<Allergy, 'id'>): Allergy | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newAllergy: Allergy = {
    ...allergy,
    id: generateId(),
  };
  
  profile.allergies.push(newAllergy);
  updateHealthProfile(petId, { allergies: profile.allergies });
  return newAllergy;
}

export function deleteAllergy(petId: string, allergyId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.allergies = profile.allergies.filter(a => a.id !== allergyId);
  updateHealthProfile(petId, { allergies: profile.allergies });
  return true;
}

// ============================================================
// CHRONIC CONDITIONS
// ============================================================

export function addChronicCondition(petId: string, condition: Omit<ChronicCondition, 'id'>): ChronicCondition | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newCondition: ChronicCondition = {
    ...condition,
    id: generateId(),
  };
  
  profile.chronic_conditions.push(newCondition);
  updateHealthProfile(petId, { chronic_conditions: profile.chronic_conditions });
  return newCondition;
}

export function deleteChronicCondition(petId: string, conditionId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.chronic_conditions = profile.chronic_conditions.filter(c => c.id !== conditionId);
  updateHealthProfile(petId, { chronic_conditions: profile.chronic_conditions });
  return true;
}

// ============================================================
// SURGERY MANAGEMENT
// ============================================================

export function addSurgery(petId: string, surgery: Omit<Surgery, 'id'>): Surgery | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newSurgery: Surgery = {
    ...surgery,
    id: generateId(),
  };
  
  profile.surgeries.push(newSurgery);
  updateHealthProfile(petId, { surgeries: profile.surgeries });
  return newSurgery;
}

export function deleteSurgery(petId: string, surgeryId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.surgeries = profile.surgeries.filter(s => s.id !== surgeryId);
  updateHealthProfile(petId, { surgeries: profile.surgeries });
  return true;
}

// ============================================================
// DOCUMENT MANAGEMENT
// ============================================================

export function addDocument(petId: string, document: Omit<HealthDocument, 'id'>): HealthDocument | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newDocument: HealthDocument = {
    ...document,
    id: generateId(),
  };
  
  profile.documents.push(newDocument);
  updateHealthProfile(petId, { documents: profile.documents });
  return newDocument;
}

export function deleteDocument(petId: string, documentId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.documents = profile.documents.filter(d => d.id !== documentId);
  updateHealthProfile(petId, { documents: profile.documents });
  return true;
}

// ============================================================
// HEALTH SUMMARY & STATISTICS
// ============================================================

export interface HealthSummary {
  total_vaccines: number;
  upcoming_vaccines: number;
  total_exams: number;
  active_medications: number;
  upcoming_appointments: number;
  allergies_count: number;
  chronic_conditions_count: number;
  latest_weight?: WeightRecord;
  last_appointment?: Appointment;
  next_appointment?: Appointment;
}

export function getHealthSummary(petId: string): HealthSummary | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const upcomingVaccines = getUpcomingVaccines(petId, 60); // 60 days
  const activeMeds = getActivePrescriptions(petId);
  const upcomingAppts = getUpcomingAppointments(petId);
  const latestWeight = getLatestWeight(petId);
  
  const pastAppointments = profile.appointments
    .filter(a => a.is_completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return {
    total_vaccines: profile.vaccines.length,
    upcoming_vaccines: upcomingVaccines.length,
    total_exams: profile.exams.length,
    active_medications: activeMeds.length,
    upcoming_appointments: upcomingAppts.length,
    allergies_count: profile.allergies.length,
    chronic_conditions_count: profile.chronic_conditions.length,
    latest_weight: latestWeight || undefined,
    last_appointment: pastAppointments[0] || undefined,
    next_appointment: upcomingAppts[0] || undefined,
  };
}

// ============================================================
// EXPORT / IMPORT (For backup or sharing with vet)
// ============================================================

export function exportHealthProfile(petId: string): string | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  return JSON.stringify(profile, null, 2);
}

export function importHealthProfile(jsonData: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const profile: PetHealthProfile = JSON.parse(jsonData);
    
    // Validate structure
    if (!profile.pet_id || !profile.pet_name || !profile.species) {
      throw new Error('Invalid health profile structure');
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    const profiles: Record<string, PetHealthProfile> = stored ? JSON.parse(stored) : {};
    profiles[profile.pet_id] = profile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    return true;
  } catch (error) {
    console.error('Failed to import health profile:', error);
    return false;
  }
}

// ============================================================
// CLEAR ALL DATA (For privacy)
// ============================================================

export function clearAllHealthData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================================
// DAILY WALKS & ACTIVITY TRACKING
// ============================================================
// TEMPORARILY DISABLED - Will be re-enabled in future version

/*
export function addWalk(petId: string, walk: Omit<DailyWalk, 'id'>): DailyWalk | null {
  const profile = getHealthProfile(petId);
  if (!profile) return null;
  
  const newWalk: DailyWalk = {
    ...walk,
    id: generateId(),
  };
  
  profile.daily_walks.push(newWalk);
  updateHealthProfile(petId, { daily_walks: profile.daily_walks });
  return newWalk;
}

export function updateWalk(petId: string, walkId: string, updates: Partial<DailyWalk>): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  const index = profile.daily_walks.findIndex(w => w.id === walkId);
  if (index === -1) return false;
  
  profile.daily_walks[index] = { ...profile.daily_walks[index], ...updates };
  updateHealthProfile(petId, { daily_walks: profile.daily_walks });
  return true;
}

export function deleteWalk(petId: string, walkId: string): boolean {
  const profile = getHealthProfile(petId);
  if (!profile) return false;
  
  profile.daily_walks = profile.daily_walks.filter(w => w.id !== walkId);
  updateHealthProfile(petId, { daily_walks: profile.daily_walks });
  return true;
}

export function getWalksByDate(petId: string, date: string): DailyWalk[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  return profile.daily_walks
    .filter(w => w.date === date)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

export function getWalksByDateRange(petId: string, startDate: string, endDate: string): DailyWalk[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return profile.daily_walks
    .filter(w => {
      const walkDate = new Date(w.date);
      return walkDate >= start && walkDate <= end;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getTodayWalks(petId: string): DailyWalk[] {
  const today = localTodayISO();
  return getWalksByDate(petId, today);
}

export function getWalkHistory(petId: string, limit?: number): DailyWalk[] {
  const profile = getHealthProfile(petId);
  if (!profile) return [];
  
  const sorted = [...profile.daily_walks].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  return limit ? sorted.slice(0, limit) : sorted;
}

// Activity Goals Management
export function setActivityGoals(petId: string, goals: ActivityGoals): boolean {
  return updateHealthProfile(petId, { activity_goals: goals }) !== null;
}

export function getActivityGoals(petId: string): ActivityGoals | null {
  const profile = getHealthProfile(petId);
  return profile?.activity_goals || null;
}

// Statistics & Analytics
export interface WalkStatistics {
  total_walks: number;
  total_minutes: number;
  total_distance_km: number;
  average_duration_minutes: number;
  average_distance_km: number;
  walks_per_day_average: number;
  most_common_location?: string;
  most_active_time?: string; // Morning, Afternoon, Evening, Night
  goal_achievement?: {
    walks_completed: number;
    walks_target: number;
    minutes_completed: number;
    minutes_target: number;
    on_track: boolean;
  };
}

export function getWalkStatistics(petId: string, days: number = 7): WalkStatistics {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const walks = getWalksByDateRange(
    petId,
    dateToLocalISO(startDate),
    dateToLocalISO(endDate)
  );
  
  const totalWalks = walks.length;
  const totalMinutes = walks.reduce((sum, w) => sum + w.duration_minutes, 0);
  const totalDistance = walks.reduce((sum, w) => sum + (w.distance_km || 0), 0);
  
  // Location frequency
  const locationCount: Record<string, number> = {};
  walks.forEach(w => {
    if (w.location) {
      locationCount[w.location] = (locationCount[w.location] || 0) + 1;
    }
  });
  const mostCommonLocation = Object.entries(locationCount)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  // Time of day analysis
  const timeSlots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  walks.forEach(w => {
    if (!w.time) return;
    const hour = parseInt(w.time.split(':')[0]);
    if (hour >= 5 && hour < 12) timeSlots.morning++;
    else if (hour >= 12 && hour < 17) timeSlots.afternoon++;
    else if (hour >= 17 && hour < 21) timeSlots.evening++;
    else timeSlots.night++;
  });
  const mostActiveTime = Object.entries(timeSlots)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  const stats: WalkStatistics = {
    total_walks: totalWalks,
    total_minutes: totalMinutes,
    total_distance_km: totalDistance,
    average_duration_minutes: totalWalks > 0 ? Math.round(totalMinutes / totalWalks) : 0,
    average_distance_km: totalWalks > 0 ? parseFloat((totalDistance / totalWalks).toFixed(2)) : 0,
    walks_per_day_average: parseFloat((totalWalks / days).toFixed(1)),
    most_common_location: mostCommonLocation,
    most_active_time: mostActiveTime,
  };
  
  // Check goal achievement
  const goals = getActivityGoals(petId);
  if (goals) {
    const todayWalks = getTodayWalks(petId);
    const todayMinutes = todayWalks.reduce((sum, w) => sum + w.duration_minutes, 0);
    
    stats.goal_achievement = {
      walks_completed: todayWalks.length,
      walks_target: goals.daily_walks_target,
      minutes_completed: todayMinutes,
      minutes_target: goals.daily_minutes_target,
      on_track: todayWalks.length >= goals.daily_walks_target && todayMinutes >= goals.daily_minutes_target,
    };
  }
  
  return stats;
}

export function getTodayProgress(petId: string): {
  walks: number;
  minutes: number;
  distance_km: number;
  goals_met: boolean;
} {
  const todayWalks = getTodayWalks(petId);
  const goals = getActivityGoals(petId);
  
  const walks = todayWalks.length;
  const minutes = todayWalks.reduce((sum, w) => sum + w.duration_minutes, 0);
  const distance = todayWalks.reduce((sum, w) => sum + (w.distance_km || 0), 0);
  
  let goalsMet = true;
  if (goals) {
    goalsMet = walks >= goals.daily_walks_target && minutes >= goals.daily_minutes_target;
  }
  
  return {
    walks,
    minutes,
    distance_km: parseFloat(distance.toFixed(2)),
    goals_met: goalsMet,
  };
}
*/
