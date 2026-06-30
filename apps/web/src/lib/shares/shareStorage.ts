/**
 * Emergency Share System
 * 
 * Sistema de compartilhamento de informações de emergência do pet
 * - URLs públicas de curta duração
 * - Revogáveis a qualquer momento
 * - QR code para impressão
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface EmergencyShare {
  code: string; // 6-8 char unique code
  pet_id: string;
  pet_name: string;
  pet_species: 'dog' | 'cat' | 'other';
  pet_photo_url?: string;
  
  // Emergency info
  owner_contact: string; // phone
  owner_name?: string;
  emergency_notes?: string;
  medical_conditions?: string[];
  medications?: string[];
  vet_name?: string;
  vet_phone?: string;
  
  // Metadata
  created_at: string;
  expires_at?: string; // null = never expires
  is_active: boolean;
  view_count: number;
  last_viewed_at?: string;
}

export interface VetShareToken {
  token: string; // UUID
  pet_id: string;
  
  // What to share
  share_medical_history: boolean;
  share_vaccinations: boolean;
  share_medications: boolean;
  share_weight_history: boolean;
  
  // Vet info
  vet_name?: string;
  vet_clinic?: string;
  vet_email?: string;
  
  // Metadata
  created_at: string;
  expires_at: string; // required for vet shares
  is_active: boolean;
  access_count: number;
  last_accessed_at?: string;
}

interface ShareDB extends DBSchema {
  emergency_shares: {
    key: string; // code
    value: EmergencyShare;
    indexes: { 'by-pet': string; 'by-created': string };
  };
  vet_shares: {
    key: string; // token
    value: VetShareToken;
    indexes: { 'by-pet': string; 'by-expires': string };
  };
}

const DB_NAME = 'petmol_shares';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ShareDB> | null = null;

async function getDB(): Promise<IDBPDatabase<ShareDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ShareDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Emergency shares
      if (!db.objectStoreNames.contains('emergency_shares')) {
        const emergencyStore = db.createObjectStore('emergency_shares', { keyPath: 'code' });
        emergencyStore.createIndex('by-pet', 'pet_id');
        emergencyStore.createIndex('by-created', 'created_at');
      }

      // Vet shares
      if (!db.objectStoreNames.contains('vet_shares')) {
        const vetStore = db.createObjectStore('vet_shares', { keyPath: 'token' });
        vetStore.createIndex('by-pet', 'pet_id');
        vetStore.createIndex('by-expires', 'expires_at');
      }
    },
  });

  return dbInstance;
}

// ========================================
// Emergency Share (Public)
// ========================================

export function generateEmergencyCode(): string {
  // Format: PET-XXXX (8 chars total)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous chars
  let code = 'PET-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createEmergencyShare(
  petId: string,
  petName: string,
  petSpecies: 'dog' | 'cat' | 'other',
  ownerContact: string,
  options?: {
    ownerName?: string;
    emergencyNotes?: string;
    medicalConditions?: string[];
    medications?: string[];
    vetName?: string;
    vetPhone?: string;
    photoUrl?: string;
    expiresInDays?: number; // null = never expires
  }
): Promise<EmergencyShare> {
  const code = generateEmergencyCode();
  const now = new Date().toISOString();
  
  let expiresAt: string | undefined;
  if (options?.expiresInDays) {
    const expires = new Date();
    expires.setDate(expires.getDate() + options.expiresInDays);
    expiresAt = expires.toISOString();
  }

  const share: EmergencyShare = {
    code,
    pet_id: petId,
    pet_name: petName,
    pet_species: petSpecies,
    pet_photo_url: options?.photoUrl,
    owner_contact: ownerContact,
    owner_name: options?.ownerName,
    emergency_notes: options?.emergencyNotes,
    medical_conditions: options?.medicalConditions,
    medications: options?.medications,
    vet_name: options?.vetName,
    vet_phone: options?.vetPhone,
    created_at: now,
    expires_at: expiresAt,
    is_active: true,
    view_count: 0,
  };

  const db = await getDB();
  await db.put('emergency_shares', share);


  return share;
}

export async function getEmergencyShare(code: string): Promise<EmergencyShare | undefined> {
  const db = await getDB();
  const share = await db.get('emergency_shares', code);

  if (!share) return undefined;

  // Check expiration
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    share.is_active = false;
    await db.put('emergency_shares', share);
    return undefined;
  }

  if (!share.is_active) return undefined;

  // Increment view count
  share.view_count++;
  share.last_viewed_at = new Date().toISOString();
  await db.put('emergency_shares', share);

  return share;
}

export async function revokeEmergencyShare(code: string): Promise<void> {
  const db = await getDB();
  const share = await db.get('emergency_shares', code);
  
  if (share) {
    share.is_active = false;
    await db.put('emergency_shares', share);
    
  }
}

export async function renewEmergencyShare(code: string, daysToAdd: number): Promise<EmergencyShare | undefined> {
  const db = await getDB();
  const share = await db.get('emergency_shares', code);
  
  if (!share) return undefined;

  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + daysToAdd);
  share.expires_at = newExpiry.toISOString();
  share.is_active = true;

  await db.put('emergency_shares', share);


  return share;
}

export async function getEmergencySharesByPet(petId: string): Promise<EmergencyShare[]> {
  const db = await getDB();
  return db.getAllFromIndex('emergency_shares', 'by-pet', petId);
}

// ========================================
// Vet Share (Private - Temporary Access)
// ========================================

export function generateVetToken(): string {
  // UUID v4 format
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createVetShare(
  petId: string,
  options: {
    shareMedicalHistory?: boolean;
    shareVaccinations?: boolean;
    shareMedications?: boolean;
    shareWeightHistory?: boolean;
    vetName?: string;
    vetClinic?: string;
    vetEmail?: string;
    expiresInHours?: number; // default: 48h
  }
): Promise<VetShareToken> {
  const token = generateVetToken();
  const now = new Date();
  
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 48));

  const share: VetShareToken = {
    token,
    pet_id: petId,
    share_medical_history: options.shareMedicalHistory ?? true,
    share_vaccinations: options.shareVaccinations ?? true,
    share_medications: options.shareMedications ?? true,
    share_weight_history: options.shareWeightHistory ?? true,
    vet_name: options.vetName,
    vet_clinic: options.vetClinic,
    vet_email: options.vetEmail,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_active: true,
    access_count: 0,
  };

  const db = await getDB();
  await db.put('vet_shares', share);


  return share;
}

export async function getVetShare(token: string): Promise<VetShareToken | undefined> {
  const db = await getDB();
  const share = await db.get('vet_shares', token);

  if (!share) return undefined;

  // Check expiration
  if (new Date(share.expires_at) < new Date()) {
    share.is_active = false;
    await db.put('vet_shares', share);
    return undefined;
  }

  if (!share.is_active) return undefined;

  // Increment access count
  share.access_count++;
  share.last_accessed_at = new Date().toISOString();
  await db.put('vet_shares', share);

  return share;
}

export async function revokeVetShare(token: string): Promise<void> {
  const db = await getDB();
  const share = await db.get('vet_shares', token);
  
  if (share) {
    share.is_active = false;
    await db.put('vet_shares', share);
    
  }
}

export async function getVetSharesByPet(petId: string): Promise<VetShareToken[]> {
  const db = await getDB();
  return db.getAllFromIndex('vet_shares', 'by-pet', petId);
}

// ========================================
// Cleanup Expired
// ========================================

export async function cleanupExpiredShares(): Promise<{
  emergencyRemoved: number;
  vetRemoved: number;
}> {
  const db = await getDB();
  const now = new Date();
  
  let emergencyRemoved = 0;
  let vetRemoved = 0;

  // Cleanup emergency shares
  const emergencyShares = await db.getAll('emergency_shares');
  for (const share of emergencyShares) {
    if (share.expires_at && new Date(share.expires_at) < now) {
      await db.delete('emergency_shares', share.code);
      emergencyRemoved++;
    }
  }

  // Cleanup vet shares
  const vetShares = await db.getAll('vet_shares');
  for (const share of vetShares) {
    if (new Date(share.expires_at) < now) {
      await db.delete('vet_shares', share.token);
      vetRemoved++;
    }
  }

  return { emergencyRemoved, vetRemoved };
}
