'use client';

import { medicationTreatmentState, EXPIRED_UNCONFIRMED_LABEL } from '@/lib/medicationTreatment';
import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import { extractMedicationBarcode } from '@/lib/petCareDomain';
import { Check, Home, Trash2 } from 'lucide-react';
import { SheetAvatar, SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { CARE_STATE } from '@/lib/careState';
import { CARE_AREA_THEME } from '@/lib/careAreaTheme';
import { listReminders, deleteReminder, createReminder, refreshSubscription } from '@/features/notifications/pushService';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import type { ScannedProduct } from '@/lib/productScanner';
import { requestUserDecision } from '@/features/interactions/userPromptChannel';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { MonetizedOffersList } from '@/features/commerce/MonetizedOffersList';
import { AffiliateCatalogSearch } from '@/features/commerce/AffiliateCatalogSearch';

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function createLocalDate(str: string) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function buildLocalDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = (timeStr || '08:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

const MONTH_FULL_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Todos os dias do mês (year/monthIndex0based), com blanks (null) de
 * preenchimento antes do dia 1 pra alinhar com a coluna do dia da semana
 * certa — o calendário sempre começa no domingo da semana do dia 1. */
function parseMedNotes(notes: string) {
  const lines = notes.split('\n');
  const firstLine = lines[0] || '';
  const rest = lines
    .slice(1)
    .filter(line => !/Código de barras:\s*[^|\n]+/i.test(line))
    .join('\n')
    .trim();
  const doseMatch = firstLine.match(/Dose:\s*([^|]+)/);
  const routeMatch = firstLine.match(/Via:\s*([^|]+)/);
  const freqMatch = firstLine.match(/Frequência:\s*([^|]+)/);
  // Sem isto, reabrir pra editar sempre zerava form.barcode (ver openEdit),
  // e salvar de novo apagava de vez o código de barras já escaneado das
  // notes — o card de "Comprar novamente" perdia o gtin numa edição
  // qualquer, mesmo tendo sido escaneado direito no cadastro original.
  const barcodeMatch = notes.match(/Código de barras:\s*([^|\n]+)/);
  if (doseMatch || routeMatch || freqMatch || barcodeMatch) {
    return {
      dose: doseMatch?.[1].trim() ?? '',
      route: routeMatch?.[1].trim().toLowerCase() ?? 'oral',
      frequency: freqMatch?.[1].trim().replace(' ', '_') ?? '2x_dia',
      barcode: barcodeMatch?.[1].trim() ?? '',
      cleanNotes: rest,
    };
  }
  return { dose: '', route: 'oral', frequency: '2x_dia', barcode: '', cleanNotes: notes };
}

type MedicationFrequencyMode = 'dose_unica' | 'vezes_dia' | 'intervalo' | 'intervalo_dias' | 'conforme_necessidade';

function normalizeFrequencyForForm(
  rawFrequency: string,
  extra?: Record<string, unknown>,
): {
  frequency: MedicationFrequencyMode;
  times_per_day: string;
  interval_hours: string;
  interval_minutes: string;
  first_dose_time: string;
  custom_interval_days: string;
  total_doses: string;
} {
  const raw = (rawFrequency || '').toLowerCase();
  const savedMode = typeof extra?.frequency_mode === 'string' ? extra.frequency_mode : '';
  const savedTimesPerDay = extra?.times_per_day != null ? String(extra.times_per_day) : '';
  const savedIntervalMinutes = parseInt(String(extra?.interval_minutes ?? ''), 10);
  const savedCustomIntervalDays = extra?.custom_interval_days != null ? String(extra.custom_interval_days) : '';
  const savedTotalDoses = extra?.total_doses != null ? String(extra.total_doses) : '';
  const savedReminderTimes = extra?.reminder_times;
  const savedFirstDoseTime =
    typeof extra?.first_dose_time === 'string' && extra.first_dose_time
      ? extra.first_dose_time
      : typeof extra?.reminder_time === 'string' && extra.reminder_time
        ? extra.reminder_time
        : Array.isArray(savedReminderTimes) && typeof savedReminderTimes[0] === 'string'
          ? savedReminderTimes[0]
          : '08:00';
  const base = { interval_hours: '8', interval_minutes: '0', custom_interval_days: '15', total_doses: '2' };

  if (savedMode === 'dose_unica' || raw === 'dose_unica') {
    return { ...base, frequency: 'dose_unica', times_per_day: '1', first_dose_time: savedFirstDoseTime };
  }
  if (savedMode === 'conforme_necessidade' || raw.includes('conforme')) {
    return { ...base, frequency: 'conforme_necessidade', times_per_day: '1', first_dose_time: savedFirstDoseTime };
  }
  // Restaurado (18/09/2026, pedido do dono — "tínhamos uma forma de
  // registrar as doses do tratamento e você a removeu"): tratamentos com
  // intervalo em DIAS e número finito de doses (ex.: reforço de vacina em
  // 15 dias, 2 doses só) — era o modo "personalizado" antigo, tinha
  // "Próxima dose em X dias" + "Total de doses". Continua distinto do
  // "intervalo" em horas/minutos (uso contínuo tipo antibiótico 8/8h).
  if (savedMode === 'intervalo_dias' || (raw === 'personalizado' && extra?.total_doses)) {
    return {
      ...base,
      frequency: 'intervalo_dias',
      times_per_day: '1',
      custom_interval_days: savedCustomIntervalDays || '15',
      total_doses: savedTotalDoses || '2',
      first_dose_time: savedFirstDoseTime,
    };
  }
  if (savedMode === 'intervalo' || raw === '8h' || raw === '12h' || raw === '48h' || raw === 'personalizado') {
    const totalMinutes = Number.isFinite(savedIntervalMinutes) && savedIntervalMinutes > 0
      ? savedIntervalMinutes
      : raw === '48h'
        ? 2880
        : raw === '12h'
          ? 720
          : raw === 'personalizado' && extra?.custom_interval_days
            ? parseInt(String(extra.custom_interval_days), 10) * 1440
            : 480;
    return {
      ...base,
      frequency: 'intervalo',
      times_per_day: '2',
      interval_hours: String(Math.floor(totalMinutes / 60)),
      interval_minutes: String(totalMinutes % 60),
      first_dose_time: savedFirstDoseTime,
    };
  }

  const timesMatch = raw.match(/(\d+)x/);
  return {
    ...base,
    frequency: 'vezes_dia',
    times_per_day: savedTimesPerDay || (timesMatch?.[1] ?? '2'),
    first_dose_time: savedFirstDoseTime,
  };
}

function buildFrequencyLabel(form: MedForm): string {
  if (form.frequency === 'dose_unica') return 'Dose única';
  if (form.frequency === 'conforme_necessidade') return 'SOS / conforme necessidade';
  if (form.frequency === 'intervalo_dias') {
    const days = Math.max(1, parseInt(form.custom_interval_days, 10) || 1);
    const doses = Math.max(1, parseInt(form.total_doses, 10) || 1);
    return `A cada ${days} dia${days === 1 ? '' : 's'} · ${doses} dose${doses === 1 ? '' : 's'}`;
  }
  if (form.frequency === 'intervalo') {
    const hours = parseInt(form.interval_hours, 10) || 0;
    const minutes = parseInt(form.interval_minutes, 10) || 0;
    const chunks = [
      hours > 0 ? `${hours}h` : '',
      minutes > 0 ? `${minutes}min` : '',
    ].filter(Boolean);
    return `A cada ${chunks.join(' ') || '0min'}`;
  }
  const times = Math.max(1, parseInt(form.times_per_day, 10) || 1);
  return `${times}x ao dia`;
}

function getDailyDoseTimes(timesPerDayRaw: string, firstDoseTime: string): string[] {
  const timesPerDay = Math.max(1, Math.min(12, parseInt(timesPerDayRaw, 10) || 1));
  const start = buildLocalDateTime('2000-01-01', firstDoseTime || '08:00');
  const spacing = Math.round(1440 / timesPerDay);
  return Array.from({ length: timesPerDay }, (_, index) => {
    const next = addMinutes(start, spacing * index);
    return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
  });
}

const CONTINUOUS_REMINDER_DAYS = 365;
const MAX_MEDICATION_REMINDERS = 1500;

function buildMedicationReminderPayloads(
  form: MedForm,
  petId: string,
  title: string,
  petName?: string,
): Parameters<typeof createReminder>[0][] {
  if (form.frequency === 'conforme_necessidade') return [];

  const body = `Hora de dar ${form.title.trim()} para ${petName || 'seu pet'}. Toque para registrar a dose.`;
  const now = new Date();
  const totalDays = Math.min(
    Math.max(1, parseInt(form.treatment_days, 10) || CONTINUOUS_REMINDER_DAYS),
    CONTINUOUS_REMINDER_DAYS,
  );
  const pushPayloads: Parameters<typeof createReminder>[0][] = [];

  const addPayload = (date: Date) => {
    if (date < now || pushPayloads.length >= MAX_MEDICATION_REMINDERS) return;
    pushPayloads.push({
      pet_id: petId,
      type: 'medication',
      title,
      body,
      remind_at: date.toISOString(),
    });
  };

  if (form.frequency === 'dose_unica') {
    addPayload(buildLocalDateTime(form.scheduled_date, form.first_dose_time));
    return pushPayloads;
  }

  if (form.frequency === 'intervalo_dias') {
    const days = Math.max(1, parseInt(form.custom_interval_days, 10) || 1);
    const doses = Math.max(1, Math.min(60, parseInt(form.total_doses, 10) || 1));
    let current = buildLocalDateTime(form.scheduled_date, form.first_dose_time);
    for (let i = 0; i < doses; i++) {
      addPayload(current);
      current = addMinutes(current, days * 1440);
    }
    return pushPayloads;
  }

  if (form.frequency === 'vezes_dia') {
    const times = getDailyDoseTimes(form.times_per_day, form.first_dose_time);
    for (let day = 0; day < totalDays; day++) {
      const dateStr = addDays(form.scheduled_date, day);
      for (const time of times) {
        addPayload(buildLocalDateTime(dateStr, time));
      }
    }
    return pushPayloads;
  }

  const intervalMinutes =
    (parseInt(form.interval_hours, 10) || 0) * 60 + (parseInt(form.interval_minutes, 10) || 0);
  if (intervalMinutes <= 0) return pushPayloads;

  const start = buildLocalDateTime(form.scheduled_date, form.first_dose_time);
  const end = addMinutes(start, totalDays * 1440);
  for (let current = start; current < end && pushPayloads.length < MAX_MEDICATION_REMINDERS; current = addMinutes(current, intervalMinutes)) {
    addPayload(current);
  }
  return pushPayloads;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface MedForm {
  title: string;
  scheduled_date: string;
  dose: string;
  route: string;
  frequency: MedicationFrequencyMode;
  times_per_day: string;
  interval_hours: string;
  interval_minutes: string;
  custom_interval_days: string;
  total_doses: string;
  first_dose_time: string;
  treatment_days: string;
  notes: string;
  manufacturer: string;
  presentation: string;
  concentration: string;
  barcode: string;
}

const EMPTY_FORM: MedForm = {
  title: '',
  scheduled_date: localTodayISO(),
  dose: '',
  route: 'oral',
  frequency: 'vezes_dia',
  times_per_day: '2',
  interval_hours: '8',
  interval_minutes: '0',
  custom_interval_days: '15',
  total_doses: '2',
  first_dose_time: '08:00',
  treatment_days: '',
  notes: '',
  manufacturer: '',
  presentation: '',
  concentration: '',
  barcode: '',
};

export interface MedicationItemSheetProps {
  petId: string;
  petName?: string;
  petSpecies?: string;
  petPhotoUrl?: string | null;
  petEvents: PetEventRecord[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onGoHome?: () => void;
  initialMode?: 'view' | 'buy';
}

type Mode = 'view' | 'add' | 'edit' | 'buy';

const medTheme = CARE_AREA_THEME.medication;
const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';
const inputCls =
  `w-full min-w-0 border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`;

// ── Component ────────────────────────────────────────────────────────────────
export function MedicationItemSheet({
  petId,
  petName,
  petSpecies,
  petPhotoUrl,
  petEvents,
  onClose,
  onRefresh,
  onGoHome,
  initialMode,
}: MedicationItemSheetProps) {
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<Mode>(initialMode === 'buy' ? 'buy' : 'view');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MedForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [medHistoryExpanded, setMedHistoryExpanded] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // Grade de dias: tratamentos longos (ex: 90 doses) viram uma parede de
  // quadradinhos — colapsa por padrão pra mostrar só a janela recente,
  // com opção de expandir pro histórico completo.
  const [expandedDayGridIds, setExpandedDayGridIds] = useState<Set<string>>(new Set());
  // Formulário manual fica escondido até o tutor escanear com sucesso,
  // dispensar o scanner, ou escolher preencher na mão — scan é o caminho
  // feliz, não só uma opção ao lado de um form já visível.
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    void onRefresh();
    // onRefresh is intentionally excluded to avoid effect loops when parent recreates callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  const medications = petEvents.filter(
    ev => ev.type === 'medicacao' || ev.type === 'medication',
  );

  const stateOf = (ev: PetEventRecord) => {
    try {
      return medicationTreatmentState(ev, parsePetEventExtraData(ev.extra_data), dateToLocalISO(new Date()));
    } catch {
      return 'active' as const;
    }
  };
  const active = medications.filter(ev => {
    if (stateOf(ev) !== 'active') return false;
    try {
      const ex = parsePetEventExtraData(ev.extra_data);
      const totalConfigured = ex.total_doses || ex.treatment_days;
      if (totalConfigured) {
        const applied = (ex.applied_dates as string[] || []).length;
        return applied < parseInt(String(totalConfigured), 10);
      }
    } catch {}
    return false;
  });
  const expiredUnconfirmed = medications.filter(ev => stateOf(ev) === 'expired_unconfirmed');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function applyScannedProduct(product: ScannedProduct) {
    setForm(f => ({
      ...f,
      title: product.name || f.title,
      manufacturer: product.manufacturer || product.brand || f.manufacturer,
      presentation: product.presentation || product.weight || f.presentation,
      concentration: product.concentration || f.concentration,
      barcode: product.barcode,
    }));
    if (!product.found) showToast('Não achamos os dados — você pode preencher à mão.');
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('petmol_pending_scanned_product');
      if (!raw) return;
      const payload = JSON.parse(raw) as { petId?: string; product?: ScannedProduct };
      if (payload.petId !== petId || !payload.product || payload.product.category !== 'medication') return;
      setForm({ ...EMPTY_FORM, scheduled_date: localTodayISO() });
      setEditingId(null);
      setMode('add');
      applyScannedProduct(payload.product);
      setShowManualForm(true);
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
    // This should run when the pet changes; applyScannedProduct is intentionally stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, scheduled_date: localTodayISO() });
    setEditingId(null);
    setShowManualForm(false);
    setMode('add');
  }

  function openEdit(ev: PetEventRecord) {
    const { dose, route, frequency: rawFrequency, barcode, cleanNotes } = parseMedNotes(ev.notes || '');
    let treatmentDays = '';
    let extra: Record<string, unknown> = {};
    try {
      extra = parsePetEventExtraData(ev.extra_data);
      if (extra.treatment_days) treatmentDays = String(extra.treatment_days);
    } catch {}
    const frequencyForm = normalizeFrequencyForForm(rawFrequency, extra);

    setForm({
      title: ev.title || '',
      scheduled_date: (ev.scheduled_at || '').slice(0, 10) || localTodayISO(),
      dose,
      route,
      ...frequencyForm,
      treatment_days: treatmentDays,
      notes: cleanNotes,
      manufacturer: '',
      presentation: '',
      concentration: '',
      barcode,
    });
    setEditingId(ev.id);
    setShowManualForm(true);
    setMode('edit');
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const intervalMinutes =
      (parseInt(form.interval_hours, 10) || 0) * 60 + (parseInt(form.interval_minutes, 10) || 0);
    if (form.frequency === 'intervalo' && intervalMinutes <= 0) {
      showToast('⚠️ Informe um intervalo maior que zero.');
      return;
    }
    if (form.frequency === 'intervalo_dias') {
      const days = parseInt(form.custom_interval_days, 10) || 0;
      const doses = parseInt(form.total_doses, 10) || 0;
      if (days <= 0 || doses <= 0) {
        showToast('⚠️ Informe o intervalo em dias e o total de doses.');
        return;
      }
    }
    setSaving(true);
    try {
      const token = getToken();
      if (!token) {
        showToast('⚠️ Sessão expirada. Faça login novamente.');
        return;
      }

      const medMeta = [
        form.dose ? `Dose: ${form.dose}` : '',
        form.route ? `Via: ${form.route}` : '',
        `Frequência: ${buildFrequencyLabel(form)}`,
        form.barcode ? `Código de barras: ${form.barcode}` : '',
      ].filter(Boolean).join(' | ');
      const finalNotes = medMeta + (form.notes.trim() ? '\n' + form.notes.trim() : '');

      const payload: Record<string, unknown> = {
        pet_id: petId,
        type: 'medicacao',
        scheduled_at: new Date(form.scheduled_date + 'T00:00:00').toISOString(),
        title: form.title.trim(),
        source: 'manual',
        status: 'active',
      };
      if (finalNotes) payload.notes = finalNotes;

      {
        // Ao editar, preservar applied_dates/skipped_dates/dose_notes da medicação existente
        let extra: Record<string, unknown> = {};
        if (editingId) {
          const existing = medications.find(ev => ev.id === editingId);
          if (existing?.extra_data) {
            try { extra = { ...parsePetEventExtraData(existing.extra_data) }; } catch { /* silent */ }
          }
        }

        const dailyTimes = form.frequency === 'vezes_dia'
          ? getDailyDoseTimes(form.times_per_day, form.first_dose_time)
          : [form.first_dose_time || '08:00'];

        extra.frequency = buildFrequencyLabel(form);
        extra.frequency_mode = form.frequency;
        extra.first_dose_time = form.first_dose_time || '08:00';
        extra.reminder_time = form.first_dose_time || '08:00';
        extra.reminder_times = dailyTimes;

        if (form.frequency === 'vezes_dia') {
          extra.times_per_day = Math.max(1, Math.min(12, parseInt(form.times_per_day, 10) || 1));
          delete extra.interval_minutes;
        } else if (form.frequency === 'intervalo') {
          extra.interval_minutes = intervalMinutes;
          delete extra.times_per_day;
        } else {
          delete extra.times_per_day;
          delete extra.interval_minutes;
        }

        if (form.frequency === 'dose_unica') {
          extra.total_doses = 1;
          delete extra.treatment_days;
          delete extra.custom_interval_days;
        } else if (form.frequency === 'intervalo_dias') {
          extra.custom_interval_days = Math.max(1, parseInt(form.custom_interval_days, 10) || 1);
          extra.total_doses = Math.max(1, Math.min(60, parseInt(form.total_doses, 10) || 1));
          delete extra.treatment_days;
        } else if (form.treatment_days) {
          extra.treatment_days = parseInt(form.treatment_days, 10);
          delete extra.total_doses;
          delete extra.custom_interval_days;
        } else {
          delete extra.treatment_days;
          delete extra.total_doses;
          delete extra.custom_interval_days;
        }

        payload.next_due_date = form.frequency === 'conforme_necessidade'
          ? null
          : buildLocalDateTime(form.scheduled_date, form.first_dose_time || '08:00').toISOString();

        payload.extra_data = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
      }

      const url = editingId
        ? `${API_BASE_URL}/events/${editingId}`
        : `${API_BASE_URL}/events`;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(editingId ? '✅ Medicação atualizada' : '✅ Medicação registrada');
        if (form.frequency !== 'conforme_necessidade') {
          const title = `💊 ${form.title.trim()}`;

          try {
            // Limpar lembretes antigos desta medicação (caso de edição, inclusive se o título mudou)
            const prevTitle = editingId
              ? `💊 ${medications.find(ev => ev.id === editingId)?.title ?? form.title.trim()}`
              : title;
            const existing = await listReminders(token);
            const stale = existing.filter(r =>
              r.type === 'medication' &&
              r.pet_id === petId &&
              (r.title === title || r.title === prevTitle)
            );
            await Promise.all(stale.map(r => deleteReminder(r.id, token)));

            const payloads = buildMedicationReminderPayloads(form, petId, title, petName);

            if (payloads.length > 0) {
              // Renovar subscription com a VAPID key atual (resolve VapidPkHashMismatch)
              try { await refreshSubscription(token); } catch { /* best-effort */ }

              // Criar reminders no banco independentemente do estado da subscription
              await Promise.all(payloads.map(p => createReminder(p, token)));
            }
          } catch { /* lembretes são best-effort; nunca bloqueiam o fluxo */ }
        }
        setMode('view');
        setEditingId(null);
        await onRefresh();
        setJustSaved(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ Erro ao salvar: ' + (err.detail || res.status));
      }
    } finally {
      setSaving(false);
    }
  }

  // Toque-e-segure num círculo pendente da grade de dias marca como pulado
  // em vez de aplicado — permite as duas ações sem precisar de um segundo
  // botão fora do círculo (ver grade abaixo em "Cronograma"). longPressFiredRef
  // evita que o "click" que o navegador dispara ao soltar o dedo, depois de
  // já ter disparado a ação de segurar, aplique a dose por cima do que
  // acabou de ser marcado como pulado.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  function startLongPress(action: () => void) {
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      action();
    }, 480);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  async function handleApplyDose(evId: string, action: 'apply' | 'skip' | 'unskip' | 'remove', date: string, slot?: string) {
    const token = getToken();
    if (!token) {
      showToast('⚠️ Sessão expirada. Faça login novamente.');
      return;
    }
    setSaving(true);
    setApplyingId(evId);
    try {
      const endpoint =
        action === 'apply'
          ? `/events/${evId}/apply-dose`
          : action === 'skip'
            ? `/events/${evId}/skip-dose`
            : action === 'unskip'
              ? `/events/${evId}/unskip-dose`
              : `/events/${evId}/remove-dose`;
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(slot ? { date, scheduled_time: slot } : { date }),
      });
      if (res.ok) {
        showToast(
          action === 'apply' ? '✅ Dose registrada'
          : action === 'skip' ? '↷ Dose marcada como pulada'
          : action === 'unskip' ? '↷ Pulo removido'
          : '🗑 Dose removida',
        );
        await onRefresh();
      } else {
        showToast('❌ Erro ao registrar dose');
      }
    } finally {
      setSaving(false);
      setApplyingId(null);
    }
  }

  async function handleDelete(evId: string) {
    const token = getToken();
    if (!token) {
      showToast('⚠️ Sessão expirada. Faça login novamente.');
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/events/${evId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        showToast(`❌ Erro ao excluir registro (${res.status}).`);
        return false;
      }
      showToast('🗑️ Registro removido');
      await onRefresh();
      return true;
    } catch {
      showToast('❌ Erro ao excluir registro. Tente novamente.');
      return false;
    }
  }

  async function confirmDeleteCurrent() {
    if (!editingId) return;
    const accepted = await requestUserDecision(
      'Excluir esta medicação? Essa ação remove o registro atual e não pode ser desfeita.',
      {
        title: 'Excluir medicação',
        tone: 'danger',
        confirmLabel: 'Excluir medicação',
      },
    );
    if (!accepted) return;

    setSaving(true);
    const deleted = await handleDelete(editingId);
    if (deleted) {
      setEditingId(null);
      setMode('view');
      setForm(EMPTY_FORM);
    }
    setSaving(false);
  }

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusLabel = active.length > 0
    ? `${active.length} em tratamento`
    : expiredUnconfirmed.length > 0
      ? EXPIRED_UNCONFIRMED_LABEL
      : medications.length > 0
      ? 'Sem tratamentos ativos'
      : 'Nenhuma medicação';

  return (
    <SheetShell open onClose={onClose} hideHandle z={SHEET_Z.top}>
        {/* Success overlay */}
        {justSaved && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Check className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="mb-1 text-xl font-bold text-slate-900">Medicação registrada!</h3>
              <p className="text-sm text-slate-400">O prontuário do pet foi atualizado.</p>
            </div>
            <button
              onClick={() => onGoHome?.()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)] transition-transform active:scale-[0.97]"
            >
              <Home className="h-[18px] w-[18px]" strokeWidth={2.3} />
              Ir para a home
            </button>
            <button onClick={() => setJustSaved(false)} className="text-sm text-slate-400 underline">
              Ver prontuário
            </button>
          </div>
        )}

        <SheetHeader
          tone="petmol"
          withHandle
          title="Medicação"
          subtitle={mode === 'view' ? (petName || undefined) : mode === 'add' ? 'Novo registro' : 'Editar medicação'}
          status={mode === 'view' ? { label: statusLabel, tone: active.length > 0 ? 'good' : 'neutral' } : undefined}
          media={<SheetAvatar src={petPhotoSrc} alt={petName || 'Pet'} fallback={petSpecies === 'cat' ? '🐱' : '🐶'} />}
          onClose={onClose}
          onBack={mode !== 'view' ? () => setMode('view') : undefined}
          action={mode === 'edit' && editingId ? (
            <button
              type="button"
              onClick={confirmDeleteCurrent}
              disabled={saving}
              aria-label="Excluir"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.3} />
            </button>
          ) : undefined}
        />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-gradient-to-b from-sky-50 via-white to-violet-50">
          <p className="mx-4 mt-3 mb-1 text-[11.5px] font-medium text-slate-500 text-center">ℹ️ Aqui é pra acompanhar e não esquecer os cuidados — o tratamento é sempre com o veterinário.</p>

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="p-5 space-y-4 pb-8">
              {/* Toast */}
              {toast && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 border border-green-200 text-sm font-semibold text-green-700">
                  {toast}
                </div>
              )}

              {/* Empty state — o que é, por que preencher, o que fazer */}
              {medications.length === 0 && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 text-center">
                  <p className="text-4xl mb-3">💊</p>
                  <p className="text-sm font-semibold text-gray-700">Nenhum remédio em andamento</p>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Se {petName || 'seu pet'} está tomando algum medicamento, registre aqui: o PETMOL
                    lembra a hora de cada dose e avisa quando a caixa estiver acabando.
                  </p>
                  <p className="text-[11px] font-semibold text-gray-400 mt-3">Registre a prescrição acima.</p>
                </div>
              )}

              {/* Active treatments — date grid */}
              {active.length > 0 && (
                <div className="space-y-3">
                  {active.map(ev => {
                    const todayStr = localTodayISO();
                    const startDateStr = (ev.scheduled_at || todayStr).split('T')[0];
                    const startDate = createLocalDate(startDateStr);

                    // totalDays/intervalDays cobre os dois modos de tratamento
                    // com o mesmo grid: frequência regular (treatment_days —
                    // um DIA por célula, intervalo 1) e "intervalo
                    // personalizado" (total_doses doses espaçadas por
                    // custom_interval_days, 1 dose por célula).
                    //
                    // Bug real (18/09/2026, "o calendário não dialoga com a
                    // frequência" + "não sei como registro a 2ª dose do
                    // dia"): pra frequências com MAIS de uma dose por dia
                    // (ex.: "a cada 8 horas" = 3x/dia, ou "X vezes ao dia"
                    // com X>1), o texto chamava o número de DIAS de "doses",
                    // E não tinha como registrar cada dose do dia
                    // separadamente. O backend já tinha applied_slots
                    // (POST .../apply-dose aceita scheduled_time) pra isso —
                    // só faltava esta tela usar. daySlots computa os N
                    // horários do dia (mesma getDailyDoseTimes do form);
                    // cada toque marca o PRÓXIMO horário ainda não feito.
                    let totalDays = 0;
                    let intervalDays = 1;
                    let dosesPerDay = 1;
                    let firstDoseTime = '08:00';
                    let appliedDates: string[] = [];
                    let skippedDates: string[] = [];
                    let appliedSlots: Record<string, string[]> = {};
                    try {
                      const ex = parsePetEventExtraData(ev.extra_data);
                      const treatmentDays = parseInt(String(ex.treatment_days), 10) || 0;
                      const customDoses = parseInt(String(ex.total_doses), 10) || 0;
                      const customInterval = parseInt(String(ex.custom_interval_days), 10) || 0;
                      if (typeof ex.first_dose_time === 'string' && ex.first_dose_time) firstDoseTime = ex.first_dose_time;
                      if (treatmentDays > 0) {
                        totalDays = treatmentDays;
                        intervalDays = 1;
                        const freqMode = String(ex.frequency_mode || '');
                        if (freqMode === 'vezes_dia') {
                          dosesPerDay = Math.max(1, parseInt(String(ex.times_per_day), 10) || 1);
                        } else if (freqMode === 'intervalo') {
                          const intervalMinutes = parseInt(String(ex.interval_minutes), 10) || 0;
                          if (intervalMinutes > 0) dosesPerDay = Math.max(1, Math.round(1440 / intervalMinutes));
                        }
                      } else if (customDoses > 0) {
                        totalDays = customDoses;
                        intervalDays = customInterval > 0 ? customInterval : 1;
                      }
                      appliedDates = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
                      skippedDates = Array.isArray(ex.skipped_dates) ? ex.skipped_dates as string[] : [];
                      if (ex.applied_slots && typeof ex.applied_slots === 'object') {
                        appliedSlots = ex.applied_slots as Record<string, string[]>;
                      }
                    } catch {}

                    if (!totalDays) return null;
                    const totalDoses = totalDays * dosesPerDay;
                    const daySlots = dosesPerDay > 1 ? getDailyDoseTimes(String(dosesPerDay), firstDoseTime) : [];

                    const allDayDates: string[] = [];
                    for (let i = 0; i < totalDays; i++) {
                      const d = new Date(startDate);
                      d.setDate(d.getDate() + i * intervalDays);
                      allDayDates.push(dateToLocalISO(d));
                    }

                    const isDayGridExpanded = expandedDayGridIds.has(ev.id);

                    // Um calendário de verdade por mês (Março completo,
                    // Abril completo...) em vez de uma parede de quadrados
                    // soltos — dias fora do tratamento (antes do início, ou
                    // "furos" de intervalo personalizado) ficam como
                    // preenchimento apagado, só pra manter o calendário
                    // alinhado; só dias do tratamento são clicáveis.
                    const monthGroups: { key: string; year: number; monthIndex: number }[] = [];
                    {
                      const seenMonths = new Set<string>();
                      for (const d of allDayDates) {
                        const key = d.slice(0, 7);
                        if (!seenMonths.has(key)) {
                          seenMonths.add(key);
                          const [y, m] = key.split('-').map(Number);
                          monthGroups.push({ key, year: y, monthIndex: m - 1 });
                        }
                      }
                    }
                    const needsMonthCollapse = monthGroups.length > 1;
                    const todayMonthKey = todayStr.slice(0, 7);
                    const collapsedMonthKey = monthGroups.some(g => g.key === todayMonthKey)
                      ? todayMonthKey
                      : monthGroups[monthGroups.length - 1]?.key;
                    const visibleMonthGroups = needsMonthCollapse && !isDayGridExpanded
                      ? monthGroups.filter(g => g.key === collapsedMonthKey)
                      : monthGroups;

                    // Progresso é sempre em DIAS (o que o backend de fato
                    // rastreia) — "doses" só aparece como informação extra
                    // quando dosesPerDay > 1, nunca substitui a contagem real
                    // de dias marcados. Um dia só conta como "feito" quando
                    // TODOS os horários daquele dia foram registrados
                    // (appliedSlots), não só o primeiro — applied_dates
                    // ganha uma entrada já na 1ª dose do dia, então usá-lo
                    // direto aqui inflava o progresso de dias parcialmente
                    // feitos.
                    const daysFullyDone = dosesPerDay > 1
                      ? allDayDates.filter(d => (appliedSlots[d] || []).length >= dosesPerDay).length
                      : appliedDates.length;
                    const doneToday = dosesPerDay > 1 ? (appliedSlots[todayStr] || []).length : (appliedDates.includes(todayStr) ? 1 : 0);
                    const pct = Math.min(100, Math.round(daysFullyDone / totalDays * 100));
                    const daysLeft = totalDays - daysFullyDone;
                    const isBusy = saving && applyingId === ev.id;
                    const progressLabel = dosesPerDay > 1
                      ? `${daysFullyDone}/${totalDays} dias · ${dosesPerDay}× ao dia · ${totalDoses} doses`
                      : `${daysFullyDone}/${totalDays} doses`;

                    return (
                      <div key={ev.id} className="rounded-2xl border border-purple-200 bg-white shadow-sm">
                        {/* Compact header */}
                        <div className="px-4 pt-3 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-gray-900 leading-tight">{ev.title}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {progressLabel} · {fmtDate(startDateStr)}
                                {ev.professional_name ? ` · ${ev.professional_name}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                doneToday >= dosesPerDay
                                  ? `${CARE_STATE.ok.chip} ${CARE_STATE.ok.chipText}`
                                  : doneToday > 0
                                    ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                    : daysLeft <= 3
                                      ? `${CARE_STATE.attention.chip} ${CARE_STATE.attention.chipText}`
                                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}>
                                {doneToday >= dosesPerDay
                                  ? '✓ Hoje'
                                  : doneToday > 0
                                    ? `${doneToday}/${dosesPerDay} hoje`
                                    : daysLeft === 0 ? 'Último' : intervalDays > 1 ? `${daysLeft} rest.` : `${daysLeft}d`}
                              </span>
                              <button
                                type="button"
                                onClick={() => openEdit(ev)}
                                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-200 transition-colors"
                                title="Editar"
                              >✏️</button>
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="h-1 bg-purple-100 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{pct}% · {daysFullyDone} de {totalDays} dia{totalDays === 1 ? '' : 's'}{dosesPerDay > 1 ? ` (${dosesPerDay}× ao dia)` : ''}</p>
                          </div>
                        </div>

                        {/* Calendário mensal de verdade (Março completo,
                            Abril completo...) em vez de uma parede de
                            quadrados soltos — cada mês com cabeçalho de dia
                            da semana, dias fora do tratamento como
                            preenchimento apagado só pra alinhar a grade.
                            Dias aplicados/pulados ficam sólidos (verde/
                            âmbar) pra saltar aos olhos mesmo fora do dia de
                            hoje. Toque marca a dose na hora; toque e segure
                            pula o dia; toque de novo num dia já
                            aplicado/pulado desfaz. */}
                        <div className="px-3 pb-3 border-t border-purple-50 pt-2.5 space-y-4">
                          {visibleMonthGroups.map((group) => (
                            <div key={group.key}>
                              <p className="text-[11px] font-black text-gray-500 mb-1.5">
                                {MONTH_FULL_NAMES[group.monthIndex]} {group.year}
                              </p>
                              {/* Só os dias do TRATAMENTO (pedido do dono, 19/09/2026):
                                  com 4 medicações o mês inteiro com dias apagados
                                  deixava a tela enorme. Sem cabeçalho de semana,
                                  sem dias de enchimento — 7 dias = 1 linha. */}
                              <div className="grid grid-cols-7 gap-1">
                                {allDayDates.filter(d => d.startsWith(group.key)).map((dateStr) => {
                                  const dayNum = parseInt(dateStr.slice(8, 10), 10);

                                  // Multi-dose/dia: doneToday conta os HORÁRIOS
                                  // já registrados (applied_slots[dia]), não
                                  // só "aconteceu ou não" — é o que permite
                                  // marcar a 2ª/3ª dose do mesmo dia.
                                  const doneToday = dosesPerDay > 1 ? (appliedSlots[dateStr] || []).length : (appliedDates.includes(dateStr) ? 1 : 0);
                                  const isSkipped = skippedDates.includes(dateStr);
                                  const isFullyApplied = !isSkipped && doneToday >= dosesPerDay;
                                  const isPartial = !isSkipped && doneToday > 0 && !isFullyApplied;
                                  const isFuture = dateStr > todayStr;
                                  // Pedido do dono (18/09/2026): destacar em
                                  // cor diferente os dias que ainda precisam
                                  // de dose — hoje ou atrasado, nada feito
                                  // ainda, sem ter sido pulado.
                                  const needsDose = !isFullyApplied && !isSkipped && !isFuture && doneToday === 0;

                                  let cls = '';
                                  if (isFullyApplied) cls = 'bg-green-500 text-white shadow-sm shadow-green-500/40';
                                  else if (isPartial) cls = 'bg-orange-400 text-white shadow-sm shadow-orange-400/40';
                                  else if (isSkipped) cls = 'bg-amber-500 text-white';
                                  // Pedido do dono (18/09/2026): "falta
                                  // colorir os dias de tratamento" — dias
                                  // futuros dentro do tratamento (ainda não
                                  // vencidos) ficavam quase idênticos aos
                                  // dias de fora (mesmo cinza claro sem
                                  // contraste) — agora usam o tom da própria
                                  // área (roxo) pra dar pra ver de longe até
                                  // onde o tratamento vai.
                                  else if (isFuture) cls = `${medTheme.accentBg} ${medTheme.accentText} border ${medTheme.accentBorder}`;
                                  else if (needsDose) cls = 'bg-rose-500 text-white shadow-sm shadow-rose-500/40';
                                  else cls = 'bg-gray-100 text-gray-500 border border-gray-200';

                                  const dateLabel = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
                                  const doseWord = dosesPerDay > 1 ? `${doneToday}/${dosesPerDay} doses` : 'dose aplicada';
                                  const label = isFullyApplied
                                    ? `${dateLabel}, ${doseWord} — toque pra desfazer a última`
                                    : isSkipped
                                      ? `${dateLabel}, dia pulado — toque pra desfazer`
                                      : isPartial
                                        ? `${dateLabel}, ${doseWord} — toque pra marcar a próxima`
                                        : needsDose
                                          ? `${dateLabel}, precisa registrar a dose`
                                          : `${dateLabel} — toque pra marcar aplicada, toque e segure pra pular`;

                                  return (
                                    <button
                                      key={dateStr}
                                      type="button"
                                      disabled={isFuture || isBusy}
                                      title={label}
                                      aria-label={label}
                                      onClick={() => {
                                        if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                                        if (isSkipped) { handleApplyDose(ev.id, 'unskip', dateStr); return; }
                                        if (dosesPerDay > 1) {
                                          if (isFullyApplied) {
                                            // Desfaz a última dose registrada do dia.
                                            const done = appliedSlots[dateStr] || [];
                                            const lastSlot = done[done.length - 1];
                                            handleApplyDose(ev.id, 'remove', dateStr, lastSlot);
                                          } else {
                                            const done = appliedSlots[dateStr] || [];
                                            const nextSlot = daySlots.find(s => !done.includes(s)) || daySlots[done.length];
                                            handleApplyDose(ev.id, 'apply', dateStr, nextSlot);
                                          }
                                          return;
                                        }
                                        if (isFullyApplied) handleApplyDose(ev.id, 'remove', dateStr);
                                        else handleApplyDose(ev.id, 'apply', dateStr);
                                      }}
                                      onPointerDown={() => {
                                        if (doneToday > 0 || isSkipped || isFuture) return;
                                        startLongPress(() => handleApplyDose(ev.id, 'skip', dateStr));
                                      }}
                                      onPointerUp={cancelLongPress}
                                      onPointerLeave={cancelLongPress}
                                      onPointerCancel={cancelLongPress}
                                      className={`aspect-square rounded-lg text-[10px] font-bold transition-all active:scale-90 flex flex-col items-center justify-center ${cls} ${isFuture ? 'cursor-default opacity-50' : 'cursor-pointer'} disabled:opacity-40`}
                                    >
                                      <span>{dayNum}</span>
                                      {isFullyApplied && <span className="text-[7px] leading-none mt-0.5">✓</span>}
                                      {isPartial && <span className="text-[7px] leading-none mt-0.5">{doneToday}/{dosesPerDay}</span>}
                                      {isSkipped && <span className="text-[7px] leading-none mt-0.5">↷</span>}
                                      {needsDose && <span className="text-[7px] leading-none mt-0.5">!</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] text-gray-400">Toque marca a dose · toque e segure pula o dia</p>
                            {needsMonthCollapse && (
                              <button
                                type="button"
                                onClick={() => setExpandedDayGridIds(prev => {
                                  const next = new Set(prev);
                                  if (isDayGridExpanded) next.delete(ev.id);
                                  else next.add(ev.id);
                                  return next;
                                })}
                                className="text-[10px] font-bold text-purple-600 hover:text-purple-700 flex-shrink-0"
                              >
                                {isDayGridExpanded ? 'Mostrar menos' : `Ver histórico completo (${monthGroups.length} meses)`}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All history — collapsed accordion */}
              {medications.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setMedHistoryExpanded(e => !e)}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      🗂️ Todas as medicações ({medications.length})
                    </p>
                    <span className="text-gray-400 text-sm">{medHistoryExpanded ? '▲' : '▼'}</span>
                  </button>
                  {medHistoryExpanded && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100">
                      {medications.map(ev => (
                        <MedRow
                          key={ev.id}
                          ev={ev}
                          onEdit={openEdit}
                          accentText="text-gray-700"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={openAdd}
                  className="w-full py-3 rounded-2xl border border-purple-200 bg-white text-sm font-semibold text-purple-700 hover:bg-purple-50 active:scale-95 transition-all"
                >
                  Nova medicação
                </button>
                <button
                  onClick={() => setMode('buy')}
                  className="w-full py-3 rounded-2xl bg-[#0056D2] hover:bg-[#004ab8] text-white text-sm font-black shadow-md shadow-blue-500/25 active:scale-95 transition-all"
                >
                  Comprar medicamento
                </button>
              </div>
              {/* Checklist item 2 — registrar (aqui: anotar doses e novas
                  medicações no histórico) é a rotina; comprar é só achar onde
                  repor, independente da loja. */}
              <p className="text-[11px] leading-snug text-gray-400">
                Anote as doses e medicações aqui pra manter o histórico e os lembretes. <span className="font-semibold text-gray-500">Comprar</span> serve só pra achar onde repor.
              </p>
            </div>
          )}

          {/* ── BUY MODE ─────────────────────────────────────────────────── */}
          {mode === 'buy' && (
            <div className="p-5 pb-8 space-y-4">
              <h3 className="text-[16px] font-bold text-gray-900">Onde comprar</h3>

              {medications.length > 0 ? (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    ❤️ Preço das medicações {petName ? `de ${petName}` : 'do pet'}
                  </p>
                  <div className="space-y-5">
                    {medications.map(ev => (
                      <div key={ev.id}>
                        <p className="font-bold text-gray-900 text-[14px] mb-2 truncate">{ev.title}</p>
                        <MonetizedOffersList
                          query={ev.title?.trim() || 'medicamento pet'}
                          gtin={extractMedicationBarcode(ev.notes)}
                          petId={petId}
                          productLabel={ev.title}
                          icon="💊"
                          source="medication_sheet"
                          ctaType="medication_buy_direct"
                          controlType="medication"
                          emptyStateTitle="Preço indisponível"
                          emptyStateSubtitle="Ainda não encontramos uma oferta ativa para esta medicação."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500 mb-3">Busque pelo nome ou marca do medicamento.</p>
                  <AffiliateCatalogSearch
                    petId={petId}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── ADD / EDIT FORM ───────────────────────────────────────────── */}
          {(mode === 'add' || mode === 'edit') && (
            <div className="px-4 pt-3 pb-4 space-y-3">
              {!showManualForm && mode === 'add' && (
                <div className={`rounded-2xl border ${medTheme.accentBorder} ${medTheme.accentBg}/40 p-4 space-y-3`}>
                  <div>
                    <h3 className="text-[18px] font-black text-gray-900 leading-tight">Identifique o medicamento</h3>
                    <p className="text-[13px] text-gray-600 mt-1">Busque pelo nome ou marca — código de barras também funciona, se preferir.</p>
                  </div>
                  <ProductBarcodeScanner
                    label="Escanear código de barras"
                    expectedCategory="medication"
                    defaultMode="scan"
                    petId={petId}
                    petName={petName}
                    allowScanning
                    manualEntryLabel="Preencher manualmente"
                    onManualEntry={() => setShowManualForm(true)}
                    onProductConfirmed={(product) => {
                      applyScannedProduct(product);
                      setShowManualForm(true);
                    }}
                    onDismiss={() => setShowManualForm(true)}
                  />
                </div>
              )}

              {showManualForm && (
              <>
              <div className={`rounded-2xl border ${medTheme.accentBorder} ${medTheme.accentBg}/40 p-3.5 space-y-3`}>
                <div>
                  <label className={labelCls}>Nome do medicamento *</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ex: Amoxicilina, Prednisolona..."
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                {/* O date input nativo do iOS não encolhe bem em coluna
                    estreita (mesma lição de GroomingItemSheet.tsx) — Data
                    fica sozinha na própria linha. */}
                <div>
                  <label className={labelCls}>Data de início *</label>
                  <input
                    type="date"
                    className={`${inputCls} px-2`}
                    value={form.scheduled_date}
                    onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                  />
                </div>

                {/* 1ª dose, Via e Dose cada um na própria linha (pedido do
                    dono, 18/09/2026: mesmo 1ª dose+Via emparelhados ficaram
                    "encavalados" no aparelho real — depois de duas rodadas
                    de queixa de campo apertado, para de arriscar pareamento
                    nesta seção e dá largura total pra cada um). */}
                <div>
                  <label className={labelCls}>1ª dose</label>
                  <input
                    type="time"
                    className={`${inputCls} px-2`}
                    value={form.first_dose_time}
                    onChange={e => setForm(f => ({ ...f, first_dose_time: e.target.value }))}
                  />
                </div>

                <div>
                  <label className={labelCls}>Via</label>
                  <select
                    className={`${inputCls} px-2`}
                    value={form.route}
                    onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                  >
                    <option value="oral">💊 Oral</option>
                    <option value="injetavel">💉 Injetável</option>
                    <option value="topico">🖐 Tópico</option>
                    <option value="oftalmico">👁️ Oftálmico</option>
                    <option value="auricular">👂 Auricular</option>
                    <option value="inalatorio">💨 Inalatório</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Dose</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ex: 1 comprimido"
                    value={form.dose}
                    onChange={e => setForm(f => ({ ...f, dose: e.target.value }))}
                  />
                </div>

                {/* Frequência como lista recolhida (pedido do dono,
                    18/09/2026), em vez dos 4 botões sempre visíveis — só o
                    bloco da opção escolhida abre embaixo. */}
                <div>
                  <label className={labelCls}>Frequência</label>
                  <select
                    className={`${inputCls} px-2`}
                    value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value as MedicationFrequencyMode }))}
                  >
                    <option value="vezes_dia">🔁 X vezes ao dia</option>
                    <option value="intervalo">⏱️ A cada X horas</option>
                    <option value="intervalo_dias">📆 A cada X dias, doses limitadas</option>
                    <option value="dose_unica">1️⃣ Dose única</option>
                    <option value="conforme_necessidade">🆘 SOS / conforme necessidade</option>
                  </select>
                </div>

                {form.frequency === 'vezes_dia' && (
                  <div className={`grid grid-cols-[92px_1fr] gap-2.5 rounded-2xl border ${medTheme.accentBorder} ${medTheme.accentBg} p-3`}>
                    <div className="min-w-0">
                      <label className={labelCls}>Vezes/dia</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        placeholder="2"
                        className={`w-full min-w-0 border ${medTheme.accentBorder} rounded-xl px-2 py-3 text-sm text-center bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`}
                        value={form.times_per_day}
                        onChange={e => setForm(f => ({ ...f, times_per_day: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Próximos</label>
                      <div className={`min-h-[46px] flex items-center rounded-xl border ${medTheme.accentBorder} bg-white px-3 py-2 text-[12px] font-semibold ${medTheme.accentText} leading-snug`}>
                        {getDailyDoseTimes(form.times_per_day, form.first_dose_time).slice(0, 4).join(' · ')}
                      </div>
                    </div>
                  </div>
                )}

                {form.frequency === 'intervalo' && (
                  <div className={`grid grid-cols-2 gap-3 rounded-2xl border ${medTheme.accentBorder} ${medTheme.accentBg} p-3`}>
                    <div className="min-w-0">
                      <label className={labelCls}>Horas</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="168"
                        placeholder="8"
                        className={`w-full border ${medTheme.accentBorder} rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`}
                        value={form.interval_hours}
                        onChange={e => setForm(f => ({ ...f, interval_hours: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Minutos</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="59"
                        placeholder="0"
                        className={`w-full border ${medTheme.accentBorder} rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`}
                        value={form.interval_minutes}
                        onChange={e => setForm(f => ({ ...f, interval_minutes: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Restaurado (18/09/2026, pedido do dono): tratamento com
                    intervalo em DIAS e total de doses limitado — reforço de
                    vacina em 15 dias/2 doses, por exemplo. Existia antes
                    ("Intervalo personalizado"), foi removido no redesenho
                    anterior sem avisar; o calendário de doses (ver "active"
                    no modo view, mais acima) sempre soube ler
                    total_doses/custom_interval_days — só faltava este
                    formulário pra preenchê-los de novo. */}
                {form.frequency === 'intervalo_dias' && (
                  <div className={`grid grid-cols-2 gap-3 rounded-2xl border ${medTheme.accentBorder} ${medTheme.accentBg} p-3`}>
                    <div className="min-w-0">
                      <label className={labelCls}>A cada (dias)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="365"
                        placeholder="15"
                        className={`w-full border ${medTheme.accentBorder} rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`}
                        value={form.custom_interval_days}
                        onChange={e => setForm(f => ({ ...f, custom_interval_days: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Total de doses</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="60"
                        placeholder="2"
                        className={`w-full border ${medTheme.accentBorder} rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${medTheme.focusRing}`}
                        value={form.total_doses}
                        onChange={e => setForm(f => ({ ...f, total_doses: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {form.frequency !== 'dose_unica' && form.frequency !== 'conforme_necessidade' && form.frequency !== 'intervalo_dias' && (
                  <div>
                    <label className={labelCls}>Duração do tratamento (dias)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Em branco = contínuo"
                      className={inputCls}
                      value={form.treatment_days}
                      onChange={e => setForm(f => ({ ...f, treatment_days: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          )}

        </div>
        {/* Fora do scroll — nunca fica escondido abaixo da rolagem */}
        {(mode === 'add' || mode === 'edit') && showManualForm && (
          <div className="flex-shrink-0 px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-gray-100 bg-white">
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="w-full py-3.5 rounded-2xl bg-[#0056D2] hover:bg-[#004ab8] active:bg-[#003f9e] text-white text-[15px] font-bold shadow-md disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Confirmar registro'}
            </button>
          </div>
        )}
    </SheetShell>
  );
}

// ── Row sub-component ────────────────────────────────────────────────────────
function MedRow({
  ev,
  onEdit,
  accentText,
}: {
  ev: PetEventRecord;
  onEdit: (ev: PetEventRecord) => void;
  accentText: string;
}) {
  let badgeCls = 'bg-yellow-100 text-yellow-700';
  let badgeTxt = 'Pendente';
  let notesCaption = '';

  try {
    const ex = parsePetEventExtraData(ev.extra_data);
    // Mesma contagem usada pra decidir "ativo" no grid acima e no backend
    // (apply-dose/remove-dose): total_doses pra frequência personalizada,
    // treatment_days pra regular. Ignorar total_doses aqui fazia um
    // tratamento personalizado ativo cair no "Pendente" genérico.
    const totalConfigured = parseInt(String(ex.total_doses || ex.treatment_days), 10);
    const treatmentState = medicationTreatmentState(ev, ex, dateToLocalISO(new Date()));
    if (treatmentState === 'interrupted') {
      badgeCls = 'bg-gray-100 text-gray-600'; badgeTxt = 'Interrompido';
    } else if (treatmentState === 'expired_unconfirmed') {
      badgeCls = 'bg-amber-100 text-amber-800'; badgeTxt = EXPIRED_UNCONFIRMED_LABEL;
    } else if (totalConfigured) {
      const applied = (ex.applied_dates as string[] || []).length;
      if (applied >= totalConfigured) {
        badgeCls = 'bg-green-100 text-green-700'; badgeTxt = 'Concluído';
      } else {
        badgeCls = 'bg-purple-100 text-purple-700'; badgeTxt = `Em tratamento (${applied}/${totalConfigured})`;
      }
    } else if (ev.status === 'completed') {
      badgeCls = 'bg-green-100 text-green-700'; badgeTxt = 'Concluído';
    }
  } catch {
    if (ev.status === 'completed') { badgeCls = 'bg-green-100 text-green-700'; badgeTxt = 'Concluído'; }
  }

  // Extract dose/via/freq from notes first line
  const notes = ev.notes || '';
  const firstLine = notes.split('\n')[0] || '';
  if (firstLine.includes('Dose:') || firstLine.includes('Via:') || firstLine.includes('Frequência:')) {
    notesCaption = firstLine;
  }

  const dateStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date((ev.scheduled_at || '').replace(' ', 'T')),
  );

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${accentText} truncate`}>{ev.title}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeCls}`}>{badgeTxt}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          <span className="text-xs text-gray-500">{dateStr}{ev.professional_name ? ` · ${ev.professional_name}` : ''}</span>
          {ev.cost != null && <span className="text-xs text-green-700 font-medium">R$ {Number(ev.cost).toFixed(2)}</span>}
          {notesCaption && <span className="text-xs text-gray-400 truncate max-w-full">{notesCaption}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(ev)}
          className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xs hover:bg-purple-100 transition-colors"
          title="Editar"
        >✏️</button>
      </div>
    </div>
  );
}
