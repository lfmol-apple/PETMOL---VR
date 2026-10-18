/**
 * features/pets/types.ts
 * Tipagem central para pets — frontend PETMOL.
 * Compatível com PetHealthProfile de home/page.tsx (não duplica, apenas
 * expõe subset estável para uso fora da Home).
 */

import type { VaccineRecord } from '@/lib/petHealth';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';

// --------------------------------------------------------------------------
// Pet base (compartilhado entre features)
// --------------------------------------------------------------------------
export interface PetBase {
  pet_id: string;
  pet_name: string;
  species?: 'dog' | 'cat' | string;
  breed?: string;
  birth_date?: string;
  photo?: string;
  gender?: string;
}

// --------------------------------------------------------------------------
// Pet com dados de saúde opcionais (subset agnóstico da Home)
// --------------------------------------------------------------------------
export interface PetWithHealth extends PetBase {
  vaccines?: VaccineRecord[];
  parasite_controls?: ParasiteControl[];
  grooming_records?: GroomingRecord[];
  grooming_routine?: { active: boolean; resumed_on?: string | null };
  health_data?: {
    vaccines?: VaccineRecord[];
    parasite_controls?: ParasiteControl[];
    grooming_records?: GroomingRecord[];
  };
}

// --------------------------------------------------------------------------
// Estado de seleção multipet
// --------------------------------------------------------------------------
export interface PetSelectionState {
  pets: PetWithHealth[];
  selectedPetId: string | null;
  currentPet: PetWithHealth | null;
}
