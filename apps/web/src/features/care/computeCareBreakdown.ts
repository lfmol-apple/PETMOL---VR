import { dateToLocalISO } from '@/lib/localDate';
import { getPetCareCollections } from '@/features/pets/healthCollections';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import type { PetInteractionItem } from '@/features/interactions/types';

function createLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

type CareItem = { key: string; compliant: boolean; label: string };

export interface CareBreakdown {
  totalItems: number;
  compliantItems: number;
  overdueItems: number;
  hoverReason: string;
}

type ExtendedVaccineRecord = VaccineRecord & { history_status?: string; tracking_mode?: string };

type MedicationEventLike = {
  id: string;
  type?: string;
  source?: string;
  status?: string;
  extra_data?: string | null;
  scheduled_at?: string;
  next_due_date?: string | null;
};

export function computeCareBreakdown(
  currentPet: PetHealthProfile | null | undefined,
  petEvents: unknown[],
  vaccines: VaccineRecord[] | null | undefined,
  parasiteControls: ParasiteControl[] | null | undefined,
  _groomingRecords: GroomingRecord[] | null | undefined,
  _selectedPetAllAlerts: PetInteractionItem[],
): CareBreakdown {
  const todayRef = new Date();
  todayRef.setHours(0, 0, 0, 0);
  const todayStr = dateToLocalISO(todayRef);

  const items: CareItem[] = [];

  const vaccinesData: ExtendedVaccineRecord[] = vaccines || [];
  const petCareCollections = getPetCareCollections(currentPet);
  const parasiteData: ParasiteControl[] = parasiteControls?.length ? parasiteControls : petCareCollections.parasiteControls;

  const currentVaccineRecords = vaccinesData.filter((v) => {
    const historyStatus = String(v?.history_status || '').toLowerCase();
    const trackingMode = String(v?.tracking_mode || '').toLowerCase();
    const dueSource = String(v?.next_due_source || '').toLowerCase();
    if (historyStatus === 'history') return false;
    if (historyStatus === 'current' || historyStatus === 'active') return true;
    if (trackingMode === 'active' || trackingMode === 'protocol') return true;
    if (dueSource === 'protocol') return true;
    return false;
  });

  const hasVaccineOverdue = currentVaccineRecords.some((v) => {
    const dueRaw = String(v?.next_dose_date || '').split('T')[0];
    if (!dueRaw) return false;
    const dueDate = createLocalDate(dueRaw);
    return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < todayRef.getTime();
  });

  items.push({ key: 'vaccine', compliant: currentVaccineRecords.length > 0 && !hasVaccineOverdue, label: 'Vacina' });

  const parasiteTypes: Array<'dewormer' | 'flea_tick' | 'collar'> = ['dewormer', 'flea_tick', 'collar'];
  parasiteTypes.forEach((type) => {
    const controlsForType = parasiteData.filter((c) => c.type === type);
    const latest = controlsForType
      .slice()
      .sort((a, b) => {
        const da = createLocalDate(String(a?.date_applied || '1970-01-01')).getTime();
        const db = createLocalDate(String(b?.date_applied || '1970-01-01')).getTime();
        return db - da;
      })[0];

    const dueRaw = latest?.next_due_date ? String(latest.next_due_date).split('T')[0] : '';
    const dueDate = dueRaw ? createLocalDate(dueRaw) : null;
    const compliant = !!dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() >= todayRef.getTime();
    const parasiteLabel = type === 'dewormer' ? 'Vermífugo' : type === 'flea_tick' ? 'Antipulgas' : 'Coleira';
    items.push({ key: `parasite-${type}`, compliant, label: parasiteLabel });
  });

  const medicationEvents = (petEvents as MedicationEventLike[]).filter((ev) => {
    if (ev.type !== 'medicacao' || ev.source === 'document' || ev.status === 'cancelled') return false;
    if (ev.status !== 'completed') return true;
    try {
      const ex = JSON.parse(String(ev.extra_data || '{}')) as Record<string, unknown>;
      if (ex.treatment_days) {
        const appliedDates = Array.isArray(ex.applied_dates) ? ex.applied_dates : [];
        return appliedDates.length < parseInt(String(ex.treatment_days), 10);
      }
    } catch {}
    return false;
  });

  medicationEvents.forEach((ev) => {
    let extra: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(ev.extra_data || '{}'));
      if (parsed && typeof parsed === 'object') extra = parsed as Record<string, unknown>;
    } catch {}

    const totalDoses = extra.treatment_days ? parseInt(String(extra.treatment_days), 10) : 0;
    const appliedDates: string[] = (Array.isArray(extra.applied_dates) ? extra.applied_dates : []).map(
      (d) => String(d).replace('T', ' ').split(' ')[0],
    );
    const skippedDates: string[] = (Array.isArray(extra.skipped_dates) ? extra.skipped_dates : []).map(
      (d) => String(d).replace('T', ' ').split(' ')[0],
    );

    let compliant = true;
    if (totalDoses > 0) {
      const startRaw = String(ev.scheduled_at || '').replace('T', ' ').split(' ')[0];
      const startDate = createLocalDate(startRaw);
      if (!Number.isNaN(startDate.getTime())) {
        if (startDate.getTime() > todayRef.getTime()) {
          compliant = true;
        } else {
          compliant = appliedDates.includes(todayStr) || skippedDates.includes(todayStr);
        }
      }
    } else if (ev.status !== 'completed') {
      const dueRaw = ev.next_due_date ? String(ev.next_due_date).split('T')[0] : '';
      const dueDate = dueRaw ? createLocalDate(dueRaw) : null;
      const dueNow = !dueDate || (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() <= todayRef.getTime());
      compliant = !dueNow || appliedDates.includes(todayStr) || skippedDates.includes(todayStr);
    }

    items.push({ key: `med-${ev.id}`, compliant, label: 'Medicação' });
  });

  const totalItems = items.length;
  const compliantItems = items.filter((i) => i.compliant).length;
  const overdueItems = Math.max(0, totalItems - compliantItems);
  const pendingItems = items.filter((i) => !i.compliant);
  const pendingCounts = pendingItems.reduce((acc: Record<string, number>, item) => {
    acc[item.label] = (acc[item.label] || 0) + 1;
    return acc;
  }, {});
  const pendingSummary = Object.entries(pendingCounts)
    .map(([label, count]) => (count > 1 ? `${label} (${count})` : label))
    .join(', ');

  const hoverReason =
    overdueItems === 0
      ? 'Tudo em dia: régua em 100%.'
      : `Régua abaixo de 100% porque ${overdueItems} item(ns) está(ão) pendente(s): ${pendingSummary}.`;

  return { totalItems, compliantItems, overdueItems, hoverReason };
}
