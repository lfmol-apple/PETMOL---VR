/**
 * petCareDomain.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CAMADA CANÔNICA de cálculo de lembretes de cuidados do pet.
 *
 * REGRAS ABSOLUTAS:
 *  - Função pura: nenhum side-effect, nenhuma leitura de localStorage
 *  - Inputs chegam como parâmetros tipados (vindos de backend/state)
 *  - Dedup por chave canônica robusta (pet_id|domain|entityType|recordId|dueDate)
 *  - Inclui itens VENCIDOS (diff < 0) para consumidores de alerta máximo
 *  - Status 'resolved' é EXCLUÍDO — lembrete só aparece se ainda é relevante
 *
 * CONSUMIDORES:
 *  - RemindersSection (chips "Próximos Lembretes", filtrando apenas hoje/futuro)
 *  - alertsEngine (badges multipet)
 *  - saude/[petId] (resumo e detalhe)
 *
 * DOMÍNIOS COBERTOS:
 *  vaccine | parasite (dewormer/flea_tick/collar) | food | medication | event
 *
 * Grooming/banho/tosa permanece como histórico/serviço, mas não é controle ativo.
 */

import type { VaccineRecord } from '@/lib/petHealth';
import type { ParasiteControl, GroomingRecord } from '@/lib/types/home';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { PetEventRecord } from '@/lib/petEvents';
import { parsePetEventExtraData } from '@/lib/petEvents';
import { latestVaccinePerGroup, vaccineGroupKey } from '@/lib/vaccineUtils';
import { dateToLocalISO } from '@/lib/localDate';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type CareReminderDomain =
  | 'vaccine'
  | 'parasite'
  | 'grooming'
  | 'food'
  | 'medication'
  | 'event';

export type CareReminderStatus = 'overdue' | 'today' | 'upcoming';

export type CareActionTarget =
  | 'health/vaccines'
  | 'health/parasites/dewormer'
  | 'health/parasites/flea_tick'
  | 'health/parasites/collar'
  | 'health/parasites'
  | 'health/grooming'
  | 'health/food'
  | 'health/medication'
  | 'health/events';

export interface PetCareReminder {
  /**
   * Chave canônica determinística para deduplicação.
   * Formato: `{pet_id}|{domain}|{entityType}|{recordId}|{dueDate}`
   */
  key: string;

  pet_id: string;
  pet_name: string;
  domain: CareReminderDomain;

  /** Label principal (nome do produto, vacina, tipo de serviço) */
  label: string;

  /** Info secundária (marca, tipo clínico, etc.) */
  sublabel?: string;

  /** Emoji representativo */
  icon: string;

  /** Data relevante em YYYY-MM-DD */
  due_date: string;

  /**
   * Dias a partir de hoje.
   * Negativo = vencido, 0 = hoje, positivo = futuro.
   */
  diff: number;

  status: CareReminderStatus;

  /** Qual modal/sheet abrir ao acionar */
  action_target: CareActionTarget;

  /** ID do registro de origem (para operações como quick-mark) */
  source_record_id?: string;

  /**
   * Só para domain='food': peso real do pacote (kg) que o tutor cadastrou.
   * Sem isso, a busca de oferta comercial pega o tamanho padrão que a loja
   * lista primeiro no catálogo dela, que pode não ser o pacote real do
   * tutor (ex: Royal Canin Urinary Small Dog vem em 2kg e 7,5kg).
   */
  packageSizeKg?: number;

  /**
   * true  → data calculada/derivada (ex: lastDate + frequencyDays)
   * false → data explicitamente salva no backend
   */
  is_derived: boolean;
}

export interface PetCareDomainParams {
  pet_id: string;
  pet_name: string;
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[];
  groomingRecords: GroomingRecord[];
  /** Plano alimentar do pet (null = não cadastrado) */
  feedingPlan: FeedingPlanEntry | null | undefined;
  /** Eventos do pet (medicações, consultas, etc.) */
  petEvents: PetEventRecord[];
}

// ─── Date Helpers (privados) ──────────────────────────────────────────────────

function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Força fuso local: "YYYY-MM-DD" → sem UTC shift
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffFromToday(date: Date): number {
  return Math.round((date.getTime() - todayMidnight().getTime()) / 86_400_000);
}

function toStatus(diff: number): CareReminderStatus {
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

// ─── Canonical Dedup Key ──────────────────────────────────────────────────────

function makeKey(
  petId: string,
  domain: CareReminderDomain,
  entityType: string,
  recordId: string,
  dueDate: string,
): string {
  return `${petId}|${domain}|${entityType}|${recordId}|${dueDate}`;
}

// ─── Domain Processors ────────────────────────────────────────────────────────

function processVaccines(p: PetCareDomainParams): PetCareReminder[] {
  // A pet with ZERO vaccine records has no next_dose_date to derive a
  // reminder from, so this used to just return [] — meaning the bell (and
  // everything downstream of it) had no way to say "you never even
  // started tracking vaccines for this pet", the single worst case,
  // silently treated as if there was nothing to remind about at all. Real
  // complaint: a pet with no vaccines showed as fully up to date in the
  // bell. A synthetic reminder here (diff deeply negative so it sorts and
  // groups as the most overdue thing) keeps this consistent with the
  // Saúde card dot and the household badge, both already fixed to treat
  // "no vaccine ever" as needing attention.
  if (!p.vaccines.length) {
    return [{
      key: makeKey(p.pet_id, 'vaccine', 'none', 'unregistered', 'none'),
      pet_id: p.pet_id,
      pet_name: p.pet_name,
      domain: 'vaccine',
      label: 'Nenhuma vacina registrada',
      icon: '💉',
      due_date: dateToLocalISO(todayMidnight()),
      diff: -9999,
      status: 'overdue',
      action_target: 'health/vaccines',
      is_derived: true,
    }];
  }

  const latestByGroup = latestVaccinePerGroup(p.vaccines);
  const vTypeLabels: Record<string, string | undefined> = {
    multiple: 'Polivalente',
    annual: 'Anual',
    rabies: 'Raiva',
  };

  // Secondary dedup by canonical group key — guards against latestByGroup having
  // multiple entries that resolve to the same canonical vaccine (e.g. one record with
  // vaccine_code="DOG_POLYVALENT_V8" and another with vaccine_code=null but
  // vaccine_name="v10", both canonicalising to the same group via the alias table).
  const byCanonicalGroup = new Map<string, PetCareReminder>();
  for (const v of Array.from(latestByGroup.values())) {
    const nextDate = parseLocalDate(v.next_dose_date);
    if (!nextDate) continue;
    const diff = diffFromToday(nextDate);
    const gKey = vaccineGroupKey(v);
    if (byCanonicalGroup.has(gKey)) continue;
    byCanonicalGroup.set(gKey, {
      key: makeKey(p.pet_id, 'vaccine', gKey, 'latest', dateToLocalISO(nextDate)),
      pet_id: p.pet_id,
      pet_name: p.pet_name,
      domain: 'vaccine',
      label: v.vaccine_name,
      sublabel: vTypeLabels[v.vaccine_type ?? ''],
      icon: '💉',
      due_date: dateToLocalISO(nextDate),
      diff,
      status: toStatus(diff),
      action_target: 'health/vaccines',
      source_record_id: v.id,
      is_derived: false,
    });
  }
  return Array.from(byCanonicalGroup.values());
}

function processParasites(p: PetCareDomainParams): PetCareReminder[] {
  if (!p.parasiteControls.length) return [];

  // Apenas o mais recente por tipo (por date_applied)
  const latestByType = new Map<string, ParasiteControl>();
  for (const c of p.parasiteControls) {
    const key = (c.type || 'other').toLowerCase();
    const prev = latestByType.get(key);
    if (!prev) { latestByType.set(key, c); continue; }
    const dt = parseLocalDate(c.date_applied)?.getTime() ?? 0;
    const prevDt = parseLocalDate(prev.date_applied)?.getTime() ?? 0;
    if (dt > prevDt) latestByType.set(key, c);
  }

  const typeIcons: Record<string, string> = {
    collar: '📿',
    dewormer: '🪱',
    flea_tick: '🛡️',
    heartworm: '💓',
    leishmaniasis: '🛡️',
  };
  const typeLabels: Record<string, string> = {
    collar: 'Coleira Repelente',
    dewormer: 'Vermífugo',
    flea_tick: 'Antipulgas/Carrapato',
    heartworm: 'Anti-heartworm',
    leishmaniasis: 'Anti-leishmaniose',
  };
  // heartworm e leishmaniasis mapeiam para o mesmo bucket visual de Vermífugo
  const typeTargets: Record<string, CareActionTarget> = {
    collar: 'health/parasites/collar',
    flea_tick: 'health/parasites/flea_tick',
    dewormer: 'health/parasites/dewormer',
    heartworm: 'health/parasites/dewormer',
    leishmaniasis: 'health/parasites/dewormer',
  };

  const result: PetCareReminder[] = [];
  for (const c of Array.from(latestByType.values())) {
    // normalizedType garante que capitalização inconsistente (ex: 'Flea_Tick') não quebre os lookups
    const normalizedType = (c.type || 'other').toLowerCase();

    // Coleira usa collar_expiry_date; outros usam next_due_date.
    // Fallback: derivar a data a partir de date_applied + frequency_days quando next_due_date não
    // foi salvo explicitamente (o backend não calcula automaticamente esse campo).
    let nextDateStr = c.collar_expiry_date || c.next_due_date || '';
    if (!nextDateStr && c.date_applied && c.frequency_days > 0) {
      const applied = parseLocalDate(c.date_applied);
      if (applied) {
        const derived = new Date(applied);
        derived.setDate(derived.getDate() + c.frequency_days);
        nextDateStr = dateToLocalISO(derived);
      }
    }
    const nextDate = parseLocalDate(nextDateStr);
    if (!nextDate) continue;
    const diff = diffFromToday(nextDate);
    result.push({
      key: makeKey(p.pet_id, 'parasite', normalizedType, c.id, dateToLocalISO(nextDate)),
      pet_id: p.pet_id,
      pet_name: p.pet_name,
      domain: 'parasite',
      label: c.product_name || typeLabels[normalizedType] || normalizedType,
      sublabel: typeLabels[normalizedType],
      icon: typeIcons[normalizedType] || '🦟',
      due_date: dateToLocalISO(nextDate),
      diff,
      status: toStatus(diff),
      action_target: (typeTargets[normalizedType] ?? 'health/parasites') as CareActionTarget,
      source_record_id: c.id,
      is_derived: c.frequency_days != null,
    });
  }
  return result;
}

function processGrooming(p: PetCareDomainParams): PetCareReminder[] {
  if (!p.groomingRecords.length) return [];

  const typeLabels: Record<string, string> = {
    bath: 'Banho',
    grooming: 'Tosa',
    bath_grooming: 'Banho e Tosa',
  };
  const typeIcons: Record<string, string> = {
    bath: '🛁',
    grooming: '✂️',
    bath_grooming: '🛁',
  };

  // Pega o registro mais recente por tipo
  const latestByType = new Map<string, GroomingRecord>();
  for (const g of p.groomingRecords) {
    const existing = latestByType.get(g.type);
    if (!existing || g.date > existing.date) {
      latestByType.set(g.type, g);
    }
  }

  const result: PetCareReminder[] = [];
  for (const g of latestByType.values()) {
    let nextDateStr: string | null = g.next_recommended_date ?? null;

    if (!nextDateStr && g.frequency_days && g.frequency_days > 0) {
      const lastDate = parseLocalDate(g.date);
      if (lastDate) {
        const derived = new Date(lastDate);
        derived.setDate(derived.getDate() + g.frequency_days);
        nextDateStr = dateToLocalISO(derived);
      }
    }

    if (!nextDateStr) continue;
    const nextDate = parseLocalDate(nextDateStr);
    if (!nextDate) continue;

    const diff = diffFromToday(nextDate);
    const label = typeLabels[g.type] ?? 'Banho e Tosa';

    result.push({
      key: makeKey(p.pet_id, 'grooming', g.type, g.id, dateToLocalISO(nextDate)),
      pet_id: p.pet_id,
      pet_name: p.pet_name,
      domain: 'grooming',
      label,
      icon: typeIcons[g.type] ?? '🛁',
      due_date: dateToLocalISO(nextDate),
      diff,
      status: toStatus(diff),
      action_target: 'health/grooming',
      source_record_id: g.id,
      is_derived: !g.next_recommended_date,
    });
  }
  return result;
}

function processFood(p: PetCareDomainParams): PetCareReminder[] {
  const plan = p.feedingPlan;
  if (!plan) return [];
  const primaryItem = Array.isArray(plan.items)
    ? plan.items.find((item) => Boolean(item?.is_primary)) ?? plan.items[0]
    : null;

  const manualPurchaseDate = parseLocalDate(plan.next_purchase_date);
  const manualReminderOffsetRaw = Number(
    plan.manual_reminder_days_before ?? plan.manualDaysBefore ?? Number.NaN
  );
  const hasManualReminderOffset = Number.isFinite(manualReminderOffsetRaw) && manualReminderOffsetRaw >= 0;

  let derivedManualReminderDate: string | null = null;
  if (manualPurchaseDate && hasManualReminderOffset) {
    const alertDate = new Date(manualPurchaseDate);
    alertDate.setDate(alertDate.getDate() - manualReminderOffsetRaw);
    derivedManualReminderDate = dateToLocalISO(alertDate);
  }

  // Prioridade canônica para lembretes:
  // 1. next_reminder_date    → data de alerta calculada/recomendada (backend)
  // 2. derivedManualReminder → data derivada de next_purchase_date - manual_reminder_days_before
  // 3. next_purchase_date    → data manual explícita de compra
  // 4. estimated_end_date    → fallback bruto de término do estoque
  // 5. cálculo local         → package_size_kg + daily_amount_g + last_refill_date
  let reminderDateStr: string =
    (plan.next_reminder_date ?? '') ||
    (derivedManualReminderDate ?? '') ||
    (plan.next_purchase_date ?? '') ||
    (plan.estimated_end_date ?? '');

  if (!reminderDateStr) {
    const pkgKg = Number(plan.package_size_kg ?? primaryItem?.package_size_kg ?? 0);
    const dailyG = Number(plan.daily_amount_g ?? primaryItem?.daily_amount_g ?? 0);
    const refillStr = (plan.last_refill_date ?? primaryItem?.last_refill_date ?? '') as string;
    if (pkgKg > 0 && dailyG > 0 && refillStr) {
      const refillDate = parseLocalDate(refillStr);
      if (refillDate) {
        const totalDays = Math.round((pkgKg * 1000) / dailyG);
        const warningBefore = hasManualReminderOffset ? manualReminderOffsetRaw : 5;
        const alertDate = new Date(refillDate);
        alertDate.setDate(alertDate.getDate() + totalDays - warningBefore);
        reminderDateStr = dateToLocalISO(alertDate);
      }
    }
  }

  if (!reminderDateStr) return [];

  const nextDate = parseLocalDate(reminderDateStr);
  if (!nextDate) return [];

  const alertDiff = diffFromToday(nextDate);
  const brand = (plan.food_brand || plan.brand || primaryItem?.food_brand || '').trim() || undefined;
  const packageSizeKg = Number(plan.package_size_kg ?? primaryItem?.package_size_kg ?? 0) || undefined;

  // Status do card deve refletir quando a ração VAI ACABAR, não quando o lembrete de compra disparou.
  // O lembrete de compra pode ter passado (alertDiff < 0) enquanto a ração ainda tem dias restantes —
  // nesse caso o card não deve mostrar "ATRASADO". Só mostra overdue quando a ração realmente acabou.
  const estimatedEndDate = plan.estimated_end_date ? parseLocalDate(plan.estimated_end_date) : null;
  const endDiff = estimatedEndDate ? diffFromToday(estimatedEndDate) : null;
  const cardDiff = endDiff !== null ? endDiff : alertDiff;
  const cardDate = estimatedEndDate ?? nextDate;

  return [{
    key: makeKey(p.pet_id, 'food', 'purchase', 'active-plan', dateToLocalISO(cardDate)),
    pet_id: p.pet_id,
    pet_name: p.pet_name,
    domain: 'food',
    label: 'Compra de ração',
    sublabel: brand,
    icon: '🥣',
    due_date: dateToLocalISO(cardDate),
    diff: cardDiff,
    status: toStatus(cardDiff),
    action_target: 'health/food',
    is_derived: reminderDateStr !== (plan.next_purchase_date ?? ''),
    packageSizeKg,
  }];
}

function processEvents(p: PetCareDomainParams): PetCareReminder[] {
  const eventIcons: Record<string, string> = {
    medicacao: '💊',
    consulta: '🩺',
    retorno: '🔁',
    exame_lab: '🔬',
    exame_imagem: '📷',
    cirurgia: '✂️',
    odonto: '🦷',
    emergencia: '🚨',
  };
  const eventLabels: Record<string, string> = {
    medicacao: 'Medicação',
    consulta: 'Consulta',
    retorno: 'Retorno',
    exame_lab: 'Exame Lab',
    exame_imagem: 'Exame Imagem',
    cirurgia: 'Cirurgia',
    odonto: 'Odontológico',
    emergencia: 'Emergência',
  };

  const result: PetCareReminder[] = [];

  for (const ev of p.petEvents) {
    if (
      !ev.next_due_date ||
      ev.source === 'document' ||
      ev.status === 'completed' ||
      ev.status === 'cancelled' ||
      ev.type === 'vaccine'   // auto-gerado por _ensure_vaccine_reminders — não exibir na UI
    ) continue;

    const extra = parsePetEventExtraData(ev.extra_data);

    // Medicações com treatment_days: incluir nos lembretes se o tratamento está ativo e a dose de hoje ainda está pendente
    if (ev.type === 'medicacao' && extra.treatment_days) {
      const totalDoses = parseInt(String(extra.treatment_days), 10);
      if (isNaN(totalDoses) || totalDoses <= 0) continue;
      const today = todayMidnight();
      const todayIso = dateToLocalISO(today);
      const startDate = parseLocalDate((ev.scheduled_at || '').split('T')[0]);
      if (!startDate) continue;
      const appliedDates: string[] = Array.isArray(extra.applied_dates) ? extra.applied_dates : [];
      const skippedDates: string[] = Array.isArray(extra.skipped_dates) ? extra.skipped_dates : [];
      // Tratamento já completo por contagem de doses?
      if (appliedDates.length >= totalDoses) continue;
      // Calcular data de término com dias perdidos
      const daysSinceStart = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000));
      const appliedBefore = appliedDates.filter(d => d < todayIso).length;
      const skippedBefore = skippedDates.filter(d => d < todayIso).length;
      const missedDays = Math.max(0, daysSinceStart - (appliedBefore + skippedBefore));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + totalDoses - 1 + missedDays);
      // Período de tratamento já encerrado?
      if (endDate < today) continue;
      // Dose de hoje já aplicada?
      if (appliedDates.includes(todayIso)) continue;
      // Dose de hoje ainda pendente — exibir como 'hoje' (ou futuro se não iniciado)
      const effectiveDue = startDate > today ? startDate : today;
      const treatDiff = Math.round((effectiveDue.getTime() - today.getTime()) / 86400000);
      const treatDueStr = dateToLocalISO(effectiveDue);
      result.push({
        key: makeKey(p.pet_id, 'medication', 'medicacao', ev.id, treatDueStr),
        pet_id: p.pet_id,
        pet_name: p.pet_name,
        domain: 'medication',
        label: ev.title,
        sublabel: extra.dosage ? String(extra.dosage) : eventLabels[ev.type],
        icon: '💊',
        due_date: treatDueStr,
        diff: treatDiff,
        status: toStatus(treatDiff),
        action_target: 'health/medication',
        source_record_id: ev.id,
        is_derived: false,
      });
      continue;
    }

    const nextDate = parseLocalDate(ev.next_due_date);
    if (!nextDate) continue;

    const diff = diffFromToday(nextDate);
    const dueStr = dateToLocalISO(nextDate);

    const sublabel: string | undefined =
      extra.dosage
        ? String(extra.dosage)
        : (extra.veterinarian || extra.clinic_name)
          ? [extra.veterinarian, extra.clinic_name].filter(Boolean).join(' · ')
          : eventLabels[ev.type];

    result.push({
      key: makeKey(
        p.pet_id,
        ev.type === 'medicacao' ? 'medication' : 'event',
        ev.type,
        ev.id,
        dueStr,
      ),
      pet_id: p.pet_id,
      pet_name: p.pet_name,
      domain: ev.type === 'medicacao' ? 'medication' : 'event',
      label: ev.title,
      sublabel,
      icon: eventIcons[ev.type] || '📅',
      due_date: dueStr,
      diff,
      status: toStatus(diff),
      action_target: ev.type === 'medicacao' ? 'health/medication' : 'health/events',
      source_record_id: ev.id,
      is_derived: false,
    });
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Constrói a lista canônica de lembretes de cuidado para um pet.
 *
 * Função pura — sem side effects, sem localStorage, sem fetch.
 * Todos os dados chegam como parâmetros.
 *
 * Inclui vencidos (diff < 0), hoje (diff = 0) e futuros.
 * Exclui apenas itens sem data relevante.
 *
 * Deduplicação robusta por chave canônica.
 * Ordenação: vencidos primeiro (por urgência desc), depois por data ascendente.
 */
export function buildPetCareReminders(
  params: PetCareDomainParams,
  options: {
    /** Janela máxima em dias (ex: 30 = só mostra até 30 dias no futuro) */
    maxDays?: number;
  } = {},
): PetCareReminder[] {
  try {
    const all: PetCareReminder[] = [
      ...processVaccines(params),
      ...processParasites(params),
      ...processGrooming(params),
      ...processFood(params),
      ...processEvents(params),
    ];

    // Deduplicação canônica
    const seen = new Set<string>();
    const deduped = all.filter(r => {
      if (seen.has(r.key)) return false;
      seen.add(r.key);
      return true;
    });

    // Filtragem por janela temporal
    const filtered =
      options.maxDays != null
        ? deduped.filter(r => r.diff <= options.maxDays!)
        : deduped;

    // Ordenação: vencidos primeiro (mais urgente = mais negativo), depois futuros por data
    return filtered.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      if (a.status === 'overdue' && b.status === 'overdue') {
        return a.diff - b.diff; // mais negativo = mais urgente = primeiro
      }
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  } catch {
    return [];
  }
}

/**
 * Helper: resolve qual função de abertura de modal chamar
 * a partir do action_target canônico.
 */
export function resolveCareCTA(
  target: CareActionTarget,
  handlers: {
    onOpenVaccines: () => void;
    onOpenVermifugo: () => void;
    onOpenAntipulgas: () => void;
    onOpenColeira: () => void;
    onOpenGrooming: () => void;
    onOpenFood: () => void;
    onOpenMedication: () => void;
    onOpenEvents: () => void;
  },
): () => void {
  switch (target) {
    case 'health/vaccines':             return handlers.onOpenVaccines;
    case 'health/parasites/dewormer':   return handlers.onOpenVermifugo;
    case 'health/parasites/flea_tick':  return handlers.onOpenAntipulgas;
    case 'health/parasites/collar':     return handlers.onOpenColeira;
    case 'health/parasites':            return handlers.onOpenVermifugo;
    case 'health/grooming':             return handlers.onOpenGrooming;
    case 'health/food':                 return handlers.onOpenFood;
    case 'health/medication':           return handlers.onOpenMedication;
    case 'health/events':               return handlers.onOpenEvents;
    default:                            return () => {};
  }
}
