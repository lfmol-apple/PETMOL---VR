/**
 * Structured IndexedDB analytics storage.
 *
 * Reserved for legacy/domain-specific analytics like shares and event-engine
 * flows. PETMOL V1 core product metrics should use '@/lib/v1Metrics'.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface AnalyticsEvent {
  id: string;
  event_type: string;
  event_category: 'handoff' | 'health' | 'event_engine' | 'share' | 'other';
  
  // Context
  pet_id?: string;
  place_id?: string;
  
  // Metadata (JSON)
  properties: Record<string, unknown>;
  
  // Geo
  country?: string;
  locale?: string;
  
  // Timestamps
  timestamp: string;
  synced_at?: string;
}

interface AnalyticsDB extends DBSchema {
  events: {
    key: string; // event id
    value: AnalyticsEvent;
    indexes: { 
      'by-type': string;
      'by-category': string;
      'by-timestamp': string;
      'by-synced': string;
    };
  };
  sync_queue: {
    key: string; // event id
    value: AnalyticsEvent;
    indexes: { 'by-timestamp': string };
  };
}

const DB_NAME = 'petmol_analytics';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AnalyticsDB> | null = null;

async function getDB(): Promise<IDBPDatabase<AnalyticsDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AnalyticsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Events store
      if (!db.objectStoreNames.contains('events')) {
        const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
        eventsStore.createIndex('by-type', 'event_type');
        eventsStore.createIndex('by-category', 'event_category');
        eventsStore.createIndex('by-timestamp', 'timestamp');
        eventsStore.createIndex('by-synced', 'synced_at');
      }

      // Sync queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        queueStore.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

// ========================================
// Track Events
// ========================================

export async function trackEvent(
  eventType: string,
  category: AnalyticsEvent['event_category'],
  properties: Record<string, unknown> = {},
  options?: {
    petId?: string;
    placeId?: string;
    country?: string;
    locale?: string;
  }
): Promise<void> {
  const event: AnalyticsEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    event_type: eventType,
    event_category: category,
    pet_id: options?.petId,
    place_id: options?.placeId,
    properties,
    country: options?.country,
    locale: options?.locale,
    timestamp: new Date().toISOString(),
  };

  const db = await getDB();
  
  // Save to events
  await db.put('events', event);
  
  // Add to sync queue
  await db.put('sync_queue', event);

  console.log('[Analytics] Event tracked:', eventType, properties);
}

// ========================================
// Handoff Events
// ========================================

export async function trackHandoffEvent(
  handoffType: 'directions' | 'call' | 'whatsapp' | 'website' | 'shopping' | 'external_maps_search',
  placeId: string,
  placeName: string,
  category: string,
  options?: {
    country?: string;
    locale?: string;
  }
): Promise<void> {
  await trackEvent(
    `handoff_${handoffType}`,
    'handoff',
    {
      place_name: placeName,
      category,
    },
    {
      placeId,
      country: options?.country,
      locale: options?.locale,
    }
  );
}

// ========================================
// Event Engine Events
// ========================================

export async function trackEventEngineAction(
  action: 'candidate_created' | 'event_confirmed' | 'event_ignored',
  placeId: string,
  petIds: string[],
  properties: Record<string, unknown> = {}
): Promise<void> {
  await trackEvent(
    `event_engine_${action}`,
    'event_engine',
    {
      ...properties,
      pet_count: petIds.length,
    },
    {
      petId: petIds[0], // primary pet
      placeId,
    }
  );
}

// ========================================
// Share Events
// ========================================

export async function trackShareEvent(
  action: 'created' | 'viewed' | 'revoked',
  shareType: 'emergency' | 'vet',
  shareId: string,
  petId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  await trackEvent(
    `share_${action}`,
    'share',
    {
      share_type: shareType,
      share_id: shareId,
      ...properties,
    },
    { petId }
  );
}

// ========================================
// Health Events
// ========================================

export async function trackHealthEvent(
  action: 'profile_created' | 'weight_added' | 'medical_added' | 'sync_completed',
  petId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  await trackEvent(
    `health_${action}`,
    'health',
    properties,
    { petId }
  );
}

// ========================================
// Query Events
// ========================================

export async function getEventsByCategory(
  category: AnalyticsEvent['event_category'],
  limit: number = 100
): Promise<AnalyticsEvent[]> {
  const db = await getDB();
  const events = await db.getAllFromIndex('events', 'by-category', category);
  return events.slice(-limit).reverse();
}

export async function getEventsByType(
  eventType: string,
  limit: number = 100
): Promise<AnalyticsEvent[]> {
  const db = await getDB();
  const events = await db.getAllFromIndex('events', 'by-type', eventType);
  return events.slice(-limit).reverse();
}

export async function getRecentEvents(limit: number = 50): Promise<AnalyticsEvent[]> {
  const db = await getDB();
  const events = await db.getAllFromIndex('events', 'by-timestamp');
  return events.slice(-limit).reverse();
}

// ========================================
// Sync Queue
// ========================================

export async function getSyncQueue(): Promise<AnalyticsEvent[]> {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'by-timestamp');
}

export async function markEventSynced(eventId: string): Promise<void> {
  const db = await getDB();
  const event = await db.get('events', eventId);
  
  if (event) {
    event.synced_at = new Date().toISOString();
    await db.put('events', event);
  }
  
  // Remove from sync queue
  await db.delete('sync_queue', eventId);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  const queue = await db.getAllFromIndex('sync_queue', 'by-timestamp');
  
  for (const event of queue) {
    await db.delete('sync_queue', event.id);
  }
}

// ========================================
// Stats
// ========================================

export async function getAnalyticsStats(): Promise<{
  totalEvents: number;
  pendingSync: number;
  eventsByCategory: Record<string, number>;
  topEventTypes: Array<{ type: string; count: number }>;
}> {
  const db = await getDB();
  
  const allEvents = await db.getAll('events');
  const syncQueue = await db.getAll('sync_queue');
  
  // Count by category
  const byCategory: Record<string, number> = {};
  for (const event of allEvents) {
    byCategory[event.event_category] = (byCategory[event.event_category] || 0) + 1;
  }
  
  // Count by type
  const byType: Record<string, number> = {};
  for (const event of allEvents) {
    byType[event.event_type] = (byType[event.event_type] || 0) + 1;
  }
  
  // Top types
  const topEventTypes = Object.entries(byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    totalEvents: allEvents.length,
    pendingSync: syncQueue.length,
    eventsByCategory: byCategory,
    topEventTypes,
  };
}

// ========================================
// Cleanup Old Events
// ========================================

export async function cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  
  const allEvents = await db.getAll('events');
  let deleted = 0;
  
  for (const event of allEvents) {
    if (new Date(event.timestamp) < cutoff && event.synced_at) {
      await db.delete('events', event.id);
      deleted++;
    }
  }
  
  console.log(`[Analytics] Cleaned up ${deleted} old events`);
  return deleted;
}
