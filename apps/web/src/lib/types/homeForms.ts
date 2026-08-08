import type { Dispatch, SetStateAction } from 'react';
import type { VaccineType } from '@/lib/petHealth';
import type { GroomingType, ParasiteControlType } from '@/lib/types/home';

export interface FeedingPlanEntry {
  items?: FeedingPlanItemEntry[];
  mode?: string | null;
  no_consumption_control?: boolean | null;
  food_brand?: string | null;
  brand?: string | null;
  next_purchase_date?: string | null;
  next_reminder_date?: string | null;
  estimated_end_date?: string | null;
  estimated_days_left?: number | null;
  package_size_kg?: number | null;
  daily_amount_g?: number | null;
  duration_days?: number | null;
  last_refill_date?: string | null;
  manual_reminder_days_before?: number | null;
  reminder_time?: string | null;
  [key: string]: unknown;
}

export interface FeedingPlanItemEntry {
  id?: string | null;
  label?: string | null;
  food_brand?: string | null;
  package_size_kg?: number | null;
  daily_amount_g?: number | null;
  duration_days?: number | null;
  last_refill_date?: string | null;
  mode?: string | null;
  barcode?: string | null;
  category?: string | null;
  notes?: string | null;
  is_primary?: boolean;
  [key: string]: unknown;
}

export interface VaccineFormData {
  vaccine_type: VaccineType;
  vaccine_name: string;
  date_administered: string;
  next_dose_date: string;
  frequency_days: number;
  veterinarian: string;
  clinic_name: string;
  notes: string;
  record_type: 'confirmed_application' | 'estimated_control_start';
  alert_days_before?: number;
  reminder_time?: string;
}

export interface ParasiteFormData {
  type: ParasiteControlType;
  product_name: string;
  date_applied: string;
  frequency_days: number;
  application_form: 'oral' | 'topical' | 'collar' | 'injection';
  dosage: string;
  veterinarian: string;
  cost: number;
  notes: string;
  collar_expiry_date: string;
  alert_days_before: number;
  reminder_time: string;
  purchase_location: string;
  reminder_enabled: boolean;
}

export interface GroomingFormData {
  type: GroomingType;
  date: string;
  scheduled_time: string;
  location: string;
  location_address: string;
  location_phone: string;
  location_place_id: string;
  cost: number;
  notes: string;
  frequency_days: number;
  reminder_enabled: boolean;
  alert_days_before: number;
}

export interface VetHistoryDocument {
  id?: string;
  event_id?: string | null;
  category?: string;
  title?: string;
  document_type?: string;
  document_date?: string;
  created_at?: string;
  storage_key?: string;
  file_name?: string;
  url?: string;
  mime_type?: string;
  establishment_name?: string;
  [key: string]: unknown;
}

export type DocFolderModalState = {
  cat: string;
  title: string;
  icon: string;
  color: string;
  docs: VetHistoryDocument[];
} | null;

export type VaccineFormSetter = Dispatch<SetStateAction<VaccineFormData>>;
export type ParasiteFormSetter = Dispatch<SetStateAction<ParasiteFormData>>;
export type GroomingFormSetter = Dispatch<SetStateAction<GroomingFormData>>;
