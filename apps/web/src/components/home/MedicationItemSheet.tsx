'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import { extractMedicationBarcode } from '@/lib/petCareDomain';
import { Check, Home, Trash2 } from 'lucide-react';
import { SheetAvatar, SheetHeader, SheetShell } from '@/components/ui/sheet';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { buildRemindAt, listReminders, deleteReminder, createReminder, refreshSubscription } from '@/features/notifications/pushService';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import { IosSwitch } from '@/components/ui/IosSwitch';
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

const MONTH_FULL_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Todos os dias do mês (year/monthIndex0based), com blanks (null) de
 * preenchimento antes do dia 1 pra alinhar com a coluna do dia da semana
 * certa — o calendário sempre começa no domingo da semana do dia 1. */
function buildMonthCalendarCells(year: number, monthIndex: number): (string | null)[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = new Array(firstOfMonth.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(dateToLocalISO(new Date(year, monthIndex, day)));
  }
  return cells;
}

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

// ── Types ────────────────────────────────────────────────────────────────────
interface MedForm {
  title: string;
  scheduled_date: string;
  professional_name: string;
  dose: string;
  route: string;
  frequency: string;
  reminder_enabled: boolean;
  reminder_date: string;
  reminder_times: string[];
  treatment_days: string;
  custom_interval_days: string;
  total_doses: string;
  cost: string;
  notes: string;
  manufacturer: string;
  presentation: string;
  concentration: string;
  barcode: string;
}

const EMPTY_FORM: MedForm = {
  title: '',
  scheduled_date: localTodayISO(),
  professional_name: '',
  dose: '',
  route: 'oral',
  frequency: '2x_dia',
  reminder_enabled: false,
  reminder_date: '',
  reminder_times: ['08:00'],
  treatment_days: '',
  custom_interval_days: '',
  total_doses: '',
  cost: '',
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

const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';
const inputCls =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300';

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

  const active = medications.filter(ev => {
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function applyScannedProduct(product: ScannedProduct) {
    setForm(f => ({
      ...f,
      title: product.name || f.title,
      professional_name: f.professional_name,
      manufacturer: product.manufacturer || product.brand || f.manufacturer,
      presentation: product.presentation || product.weight || f.presentation,
      concentration: product.concentration || f.concentration,
      barcode: product.barcode,
    }));
    if (!product.found) showToast('Não encontramos os dados. Preencha manualmente.');
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
  }, [petId]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, scheduled_date: localTodayISO() });
    setEditingId(null);
    setShowManualForm(false);
    setMode('add');
  }

  function openEdit(ev: PetEventRecord) {
    const { dose, route, frequency, barcode, cleanNotes } = parseMedNotes(ev.notes || '');
    let treatmentDays = '';
    let customIntervalDays = '';
    let totalDoses = '';
    let reminderTimes = ['08:00'];
    let reminderTime = '08:00';
    let reminderDate = '';
    const nextDue = ev.next_due_date ? ev.next_due_date.split('T')[0] : '';
    try {
      const ex = parsePetEventExtraData(ev.extra_data);
      if (typeof ex.reminder_time === 'string' && ex.reminder_time) reminderTime = ex.reminder_time;
      if (ex.treatment_days) treatmentDays = String(ex.treatment_days);
      if (ex.custom_interval_days) customIntervalDays = String(ex.custom_interval_days);
      if (ex.total_doses) totalDoses = String(ex.total_doses);
      if (Array.isArray(ex.reminder_times) && (ex.reminder_times as string[]).length > 0)
        reminderTimes = ex.reminder_times as string[];
      else reminderTimes = [reminderTime];
    } catch {}
    if (nextDue) reminderDate = nextDue < localTodayISO() ? localTodayISO() : nextDue;

    setForm({
      title: ev.title || '',
      scheduled_date: (ev.scheduled_at || '').slice(0, 10) || localTodayISO(),
      professional_name: ev.professional_name || '',
      dose,
      route,
      frequency,
      reminder_enabled: !!nextDue,
      reminder_date: reminderDate,
      reminder_times: reminderTimes,
      treatment_days: treatmentDays,
      custom_interval_days: customIntervalDays,
      total_doses: totalDoses,
      cost: ev.cost != null ? String(ev.cost) : '',
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
        form.frequency ? `Frequência: ${form.frequency.replace('_', ' ')}` : '',
        form.manufacturer ? `Fabricante: ${form.manufacturer}` : '',
        form.presentation ? `Apresentação: ${form.presentation}` : '',
        form.concentration ? `Concentração: ${form.concentration}` : '',
        form.barcode ? `Código de barras: ${form.barcode}` : '',
      ].filter(Boolean).join(' | ');
      const finalNotes = medMeta + (form.notes.trim() ? '\n' + form.notes.trim() : '');

      const shouldKeepTreatmentActive =
        form.reminder_enabled || Boolean(form.treatment_days) || Boolean(form.custom_interval_days);

      const payload: Record<string, unknown> = {
        pet_id: petId,
        type: 'medicacao',
        scheduled_at: new Date(form.scheduled_date + 'T00:00:00').toISOString(),
        title: form.title.trim(),
        source: 'manual',
        status: shouldKeepTreatmentActive ? 'active' : 'completed',
      };
      if (form.professional_name.trim()) payload.professional_name = form.professional_name.trim();
      if (form.cost) payload.cost = parseFloat(form.cost);
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

        // A duração do tratamento (treatment_days pra frequência regular,
        // custom_interval_days/total_doses pra "personalizado") nunca
        // depende do toggle de lembrete — é isso que liga o calendário/
        // contagem de doses (ver a lista "active" mais acima). Bug real
        // corrigido aqui: antes isso só era gravado dentro do bloco de
        // lembretes, então registrar uma medicação sem lembrete nunca
        // salvava a duração, e o calendário nunca aparecia. Os campos do
        // formulário (Duração do tratamento / Total de doses) já eram
        // sempre visíveis — só a gravação estava presa ao toggle.
        if (form.frequency === 'personalizado') {
          delete extra.treatment_days;
          if (form.custom_interval_days) extra.custom_interval_days = parseInt(form.custom_interval_days, 10);
          else delete extra.custom_interval_days;
          if (form.total_doses) extra.total_doses = parseInt(form.total_doses, 10);
          else delete extra.total_doses;
        } else {
          delete extra.custom_interval_days;
          delete extra.total_doses;
          if (form.treatment_days) extra.treatment_days = parseInt(form.treatment_days);
          else delete extra.treatment_days;
        }

        if (form.reminder_enabled) {
          const normalizedTimes = form.reminder_times.filter(Boolean);
          extra.frequency = form.frequency;
          if (normalizedTimes.length > 0) {
            extra.reminder_times = normalizedTimes;
            extra.reminder_time = normalizedTimes[0];
          } else {
            extra.reminder_times = ['08:00'];
            extra.reminder_time = '08:00';
          }
          if (form.frequency === 'personalizado' && form.custom_interval_days) {
            const days = parseInt(form.custom_interval_days, 10);
            payload.next_due_date = Number.isFinite(days) && days > 0
              ? new Date(addDays(form.scheduled_date, days) + 'T00:00:00').toISOString()
              : null;
          } else {
            payload.next_due_date = form.reminder_date
              ? new Date(form.reminder_date + 'T00:00:00').toISOString()
              : null;
          }
        } else {
          // Ao desativar lembretes, limpar só o rastro de agendamento —
          // treatment_days/custom_interval_days/total_doses/applied_dates/
          // skipped_dates ficam intactos.
          delete extra.reminder_time;
          delete extra.reminder_times;
          delete extra.frequency;
          payload.next_due_date = null;
        }

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
        if (form.reminder_enabled && form.reminder_date && form.reminder_times.length > 0) {
          const title = `💊 ${form.title.trim()}`;
          const times = form.reminder_times.filter(Boolean);
          const totalDays = Math.min(parseInt(form.treatment_days) || 1, 365);
          const todayStr = new Date().toISOString().slice(0, 10);

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

            // Coletar payloads: um por dia × por horário
            const payloads: Parameters<typeof createReminder>[0][] = [];
            if (form.frequency === 'personalizado' && form.custom_interval_days) {
              const nextDate = addDays(form.scheduled_date, parseInt(form.custom_interval_days, 10));
              if (nextDate >= todayStr) {
                for (const time of times) {
                  payloads.push({ pet_id: petId, type: 'medication', title, body: `Hora de dar ${form.title.trim()} para ${petName}. Toque para registrar a dose.`, remind_at: buildRemindAt(nextDate, time) });
                }
              }
            } else {
              for (let day = 0; day < totalDays; day++) {
                const dateStr = addDays(form.reminder_date, day);
                if (dateStr < todayStr) continue;
                for (const time of times) {
                  payloads.push({ pet_id: petId, type: 'medication', title, body: `Hora de dar ${form.title.trim()} para ${petName}. Toque para registrar a dose.`, remind_at: buildRemindAt(dateStr, time) });
                }
              }
            }

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

  async function handleApplyDose(evId: string, action: 'apply' | 'skip' | 'unskip' | 'remove', date: string) {
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
        body: JSON.stringify({ date }),
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
    : medications.length > 0
      ? 'Sem tratamentos ativos'
      : 'Nenhuma medicação';
  const nextActive = active[0] ?? null;

  return (
    <SheetShell open onClose={onClose} hideHandle z={100}>
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <p className="mx-4 mt-3 mb-1 text-[11.5px] font-medium text-slate-500 text-center">ℹ️ Gerenciamento e controle apenas — consulte seu veterinário.</p>

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

                    // totalDoses/intervalDays cobre os dois modos de tratamento
                    // com o mesmo grid: frequência regular (treatment_days —
                    // uma dose por dia, intervalo 1) e "intervalo
                    // personalizado" (total_doses doses espaçadas por
                    // custom_interval_days). Mesmo comportamento pros dois —
                    // nunca dependia do modo, só faltava generalizar aqui.
                    let totalDoses = 0;
                    let intervalDays = 1;
                    let appliedDates: string[] = [];
                    let skippedDates: string[] = [];
                    try {
                      const ex = parsePetEventExtraData(ev.extra_data);
                      const treatmentDays = parseInt(String(ex.treatment_days), 10) || 0;
                      const customDoses = parseInt(String(ex.total_doses), 10) || 0;
                      const customInterval = parseInt(String(ex.custom_interval_days), 10) || 0;
                      if (treatmentDays > 0) {
                        totalDoses = treatmentDays;
                        intervalDays = 1;
                      } else if (customDoses > 0) {
                        totalDoses = customDoses;
                        intervalDays = customInterval > 0 ? customInterval : 1;
                      }
                      appliedDates = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
                      skippedDates = Array.isArray(ex.skipped_dates) ? ex.skipped_dates as string[] : [];
                    } catch {}

                    if (!totalDoses) return null;

                    const allDayDates: string[] = [];
                    for (let i = 0; i < totalDoses; i++) {
                      const d = new Date(startDate);
                      d.setDate(d.getDate() + i * intervalDays);
                      allDayDates.push(dateToLocalISO(d));
                    }

                    const allDayDatesSet = new Set(allDayDates);
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

                    const pct = Math.min(100, Math.round(appliedDates.length / totalDoses * 100));
                    const daysLeft = totalDoses - appliedDates.length;
                    const isBusy = saving && applyingId === ev.id;

                    return (
                      <div key={ev.id} className="rounded-2xl border border-purple-200 bg-white shadow-sm">
                        {/* Compact header */}
                        <div className="px-4 pt-3 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-gray-900 leading-tight">{ev.title}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {appliedDates.length}/{totalDoses} doses · {fmtDate(startDateStr)}
                                {ev.professional_name ? ` · ${ev.professional_name}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                appliedDates.includes(todayStr) ? 'bg-green-100 text-green-700' : daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {appliedDates.includes(todayStr) ? '✓ Hoje' : daysLeft === 0 ? 'Último' : intervalDays > 1 ? `${daysLeft} rest.` : `${daysLeft}d`}
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
                            <p className="text-[10px] text-gray-400 mt-0.5">{pct}% · {appliedDates.length} de {totalDoses} doses</p>
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
                              <div className="grid grid-cols-7 gap-1">
                                {WEEKDAY_LETTERS.map((letter, i) => (
                                  <div key={i} className="text-center text-[9px] font-bold text-gray-300">{letter}</div>
                                ))}
                                {buildMonthCalendarCells(group.year, group.monthIndex).map((dateStr, i) => {
                                  if (!dateStr) return <div key={`blank-${i}`} />;
                                  const inTreatment = allDayDatesSet.has(dateStr);
                                  const dayNum = parseInt(dateStr.slice(8, 10), 10);

                                  if (!inTreatment) {
                                    return (
                                      <div key={dateStr} className="aspect-square flex items-center justify-center text-[10px] text-gray-300">
                                        {dayNum}
                                      </div>
                                    );
                                  }

                                  const isApplied = appliedDates.includes(dateStr);
                                  const isSkipped = skippedDates.includes(dateStr);
                                  const isToday = dateStr === todayStr;
                                  const isFuture = dateStr > todayStr;

                                  let cls = '';
                                  if (isApplied) cls = 'bg-green-500 text-white shadow-sm shadow-green-500/40';
                                  else if (isSkipped) cls = 'bg-amber-500 text-white';
                                  else if (isFuture) cls = 'bg-gray-50 text-gray-300 border border-gray-100';
                                  else if (isToday) cls = 'bg-purple-500 text-white';
                                  else cls = 'bg-gray-100 text-gray-500 border border-gray-200';

                                  const dateLabel = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
                                  const label = isApplied
                                    ? `${dateLabel}, dose aplicada — toque pra desfazer`
                                    : isSkipped
                                      ? `${dateLabel}, dose pulada — toque pra desfazer`
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
                                        if (isApplied) handleApplyDose(ev.id, 'remove', dateStr);
                                        else if (isSkipped) handleApplyDose(ev.id, 'unskip', dateStr);
                                        else handleApplyDose(ev.id, 'apply', dateStr);
                                      }}
                                      onPointerDown={() => {
                                        if (isApplied || isSkipped || isFuture) return;
                                        startLongPress(() => handleApplyDose(ev.id, 'skip', dateStr));
                                      }}
                                      onPointerUp={cancelLongPress}
                                      onPointerLeave={cancelLongPress}
                                      onPointerCancel={cancelLongPress}
                                      className={`aspect-square rounded-lg text-[10px] font-bold transition-all active:scale-90 flex flex-col items-center justify-center ${cls} ${isFuture ? 'cursor-default opacity-50' : 'cursor-pointer'} disabled:opacity-40`}
                                    >
                                      <span>{dayNum}</span>
                                      {(isApplied || isSkipped) && <span className="text-[7px] leading-none mt-0.5">{isApplied ? '✓' : '↷'}</span>}
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
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black shadow-md shadow-emerald-500/25 active:scale-95 transition-all"
                >
                  Comprar medicamento
                </button>
              </div>
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
            <div className="px-4 pt-2 pb-4 space-y-3">
              {!showManualForm && mode === 'add' && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 space-y-3">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className={labelCls}>Fabricante</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ex: MSD"
                    value={form.manufacturer}
                    onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Apresentação</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ex: caixa, frasco 30 ml"
                    value={form.presentation}
                    onChange={e => setForm(f => ({ ...f, presentation: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Concentração</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ex: 50 mg/ml"
                  value={form.concentration}
                  onChange={e => setForm(f => ({ ...f, concentration: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Data de início *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.scheduled_date}
                  onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Veterinário prescritor (opcional)</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Dr. Nome"
                  value={form.professional_name}
                  onChange={e => setForm(f => ({ ...f, professional_name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className={labelCls}>Dose</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ex: 1 comprimido"
                    value={form.dose}
                    onChange={e => setForm(f => ({ ...f, dose: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Via</label>
                  <select
                    className={inputCls}
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
              </div>

              <div>
                <label className={labelCls}>Frequência</label>
                <select
                  className={inputCls}
                  value={form.frequency}
                  onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                >
                  <option value="dose_unica">💊 Dose única</option>
                  <option value="1x_dia">1× ao dia</option>
                  <option value="2x_dia">2× ao dia</option>
                  <option value="3x_dia">3× ao dia</option>
                  <option value="8h">A cada 8 horas</option>
                  <option value="12h">A cada 12 horas</option>
                  <option value="48h">A cada 48 horas</option>
                  <option value="personalizado">Intervalo personalizado</option>
                  <option value="semanal">Semanal</option>
                  <option value="conforme_necessidade">Conforme necessidade (SOS)</option>
                </select>
              </div>

              {form.frequency === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3 px-4 py-3 bg-purple-50 rounded-2xl border border-purple-200">
                  <div className="min-w-0">
                    <label className={labelCls}>Próxima dose em</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        placeholder="15"
                        className="w-full border border-purple-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                        value={form.custom_interval_days}
                        onChange={e => {
                          const value = e.target.value;
                          const days = parseInt(value, 10);
                          setForm(f => ({
                            ...f,
                            custom_interval_days: value,
                            reminder_date: Number.isFinite(days) && days > 0 ? addDays(f.scheduled_date, days) : f.reminder_date,
                          }));
                        }}
                      />
                      <span className="text-xs text-gray-500 whitespace-nowrap">dias</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className={labelCls}>Total de doses</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      placeholder="2"
                      className="w-full border border-purple-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                      value={form.total_doses}
                      onChange={e => setForm(f => ({ ...f, total_doses: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Lembretes toggle */}
              <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <span className="text-sm font-semibold text-amber-800">🔔 Quero lembretes desta medicação</span>
                <IosSwitch
                  checked={form.reminder_enabled}
                  onChange={() => setForm(f => ({
                    ...f,
                    reminder_enabled: !f.reminder_enabled,
                    reminder_date: !f.reminder_enabled ? (f.reminder_date || f.scheduled_date) : '',
                  }))}
                  size="sm"
                />
              </div>

              {form.reminder_enabled && (
                <div className="space-y-3 px-4 py-3 bg-amber-50 rounded-2xl border border-amber-200">
                  <div>
                    <label className={labelCls}>📅 Data do 1º lembrete</label>
                    <input
                      type="date"
                      className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                      value={form.reminder_date}
                      onChange={e => setForm(f => ({ ...f, reminder_date: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>⏰ Horários dos lembretes</label>
                    <div className="space-y-2">
                      {form.reminder_times.map((time, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={time}
                            onChange={e => {
                              const updated = [...form.reminder_times];
                              updated[idx] = e.target.value;
                              setForm(f => ({ ...f, reminder_times: updated }));
                            }}
                            className="flex-1 border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                          />
                          {form.reminder_times.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setForm(f => ({ ...f, reminder_times: f.reminder_times.filter((_, i) => i !== idx) }))}
                              className="w-9 h-9 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-sm hover:bg-red-200 flex-shrink-0"
                            >✕</button>
                          )}
                        </div>
                      ))}
                      {form.reminder_times.length < 6 && (
                        <button
                          type="button"
                          onClick={() => {
                            const last = form.reminder_times[form.reminder_times.length - 1] || '08:00';
                            const [h, m] = last.split(':').map(Number);
                            const nextH = (h + 8) % 24;
                            setForm(f => ({ ...f, reminder_times: [...f.reminder_times, `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`] }));
                          }}
                          className="w-full py-2.5 border border-dashed border-amber-300 rounded-xl text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          + Adicionar horário
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Duração do tratamento — sempre visível, independente do
                  toggle de lembretes: é isto que preenche extra_data.
                  treatment_days e liga o calendário de doses do tratamento
                  (ver a lista "active" e a grade de dias mais acima). Antes
                  ficava dentro do bloco de lembretes, então um tutor que só
                  queria registrar a medicação sem lembrete nunca via este
                  campo, nunca preenchia treatment_days, e o calendário nunca
                  aparecia pra esse tratamento. Frequência "personalizado" já
                  tem seu próprio par de campos (Total de doses/Próxima dose
                  em) mais acima, que já era incondicional — só este aqui
                  estava preso ao toggle. */}
              {form.frequency !== 'personalizado' && (
                <div>
                  <label className={labelCls}>📆 Duração do tratamento (dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="Ex: 7"
                    className={inputCls}
                    value={form.treatment_days}
                    onChange={e => setForm(f => ({ ...f, treatment_days: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">Preencha pra acompanhar as doses num calendário do tratamento.</p>
                </div>
              )}

              <div>
                <label className={labelCls}>Custo R$ (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  className={inputCls}
                  value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[15px] font-bold shadow-md disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : '✅ Confirmar registro'}
              </button>
              </>
              )}
            </div>
          )}

        </div>
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
    if (totalConfigured) {
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
