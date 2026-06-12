// Tipos específicos para a página home - extraídos de home/page.tsx
// Para evitar arquivo gigante e melhor organização

// Tipos para controle de vermífugos/antiparasitários
export type ParasiteControlType = 'dewormer' | 'flea_tick' | 'heartworm' | 'collar' | 'leishmaniasis';

export interface ParasiteControl {
  id: string;
  type: ParasiteControlType;
  product_name: string;
  active_ingredient?: string;
  date_applied: string;
  next_due_date?: string;
  frequency_days: number;
  pet_weight_kg?: number;
  dosage?: string;
  application_form?: 'oral' | 'topical' | 'collar' | 'injection'; // Formato de aplicação
  veterinarian?: string;
  clinic_name?: string;
  batch_number?: string;
  cost?: number;
  notes?: string;
  reminder_days: number;
  collar_expiry_date?: string; // Para coleiras (Seresto, Scalibor)
  alert_days_before?: number; // Dias de antecedência para alertar sobre compra
  reminder_time?: string;
  purchase_location?: string; // Onde foi comprado (Petz, Cobasi, internet, etc)
  reminder_enabled?: boolean; // Se o lembrete está ativo
}

// Tipos para controle de higiene (banho e tosa)
export type GroomingType = 'bath' | 'grooming' | 'bath_grooming';

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
}

export interface GroomingRecord {
  id: string;
  pet_id: string;
  type: GroomingType;
  date: string;
  scheduled_time?: string; // Hora do agendamento (HH:MM)
  location?: string; // Nome do estabelecimento ou "Casa"
  location_address?: string; // Endereço completo
  location_phone?: string; // Telefone do estabelecimento
  location_place_id?: string; // Google Place ID para referência
  groomer?: string; // Nome do profissional
  cost?: number;
  notes?: string;
  next_recommended_date?: string;
  frequency_days?: number; // Frequência ideal (14 dias para banho, 45 para tosa, etc)
  reminder_enabled?: boolean;
  alert_days_before?: number;
}

// Interface de resposta da API de OCR de cartão de vacina
export interface VaccineCardOcrResponse {
  success: boolean;
  vaccines: Array<{
    name: string;
    date: string;
    manufacturer?: string;
    batch?: string;
    veterinarian?: string;
    confidence: number;
  }>;
  raw_text?: string;
  error?: string;
}