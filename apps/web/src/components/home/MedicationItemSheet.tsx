'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import { ModalPortal } from '@/components/ModalPortal';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { buildRemindAt, listReminders, deleteReminder, createReminder } from '@/features/notifications/pushService';
import { trackPartnerClicked } from '@/lib/v1Metrics';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import { IosSwitch } from '@/components/ui/IosSwitch';
import type { ScannedProduct } from '@/lib/productScanner';
import { requestUserDecision } from '@/features/interactions/userPromptChannel';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

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

function parseMedNotes(notes: string) {
  const lines = notes.split('\n');
  const firstLine = lines[0] || '';
  const rest = lines.slice(1).join('\n').trim();
  const doseMatch = firstLine.match(/Dose:\s*([^|]+)/);
  const routeMatch = firstLine.match(/Via:\s*([^|]+)/);
  const freqMatch = firstLine.match(/Frequência:\s*([^|]+)/);
  if (doseMatch || routeMatch || freqMatch) {
    return {
      dose: doseMatch?.[1].trim() ?? '',
      route: routeMatch?.[1].trim().toLowerCase() ?? 'oral',
      frequency: freqMatch?.[1].trim().replace(' ', '_') ?? '2x_dia',
      cleanNotes: rest,
    };
  }
  return { dose: '', route: 'oral', frequency: '2x_dia', cleanNotes: notes };
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
  initialMode?: 'view' | 'buy';
}

type Mode = 'view' | 'add' | 'edit' | 'buy';

const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';
const inputCls =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300';

// ── Component ────────────────────────────────────────────────────────────────
export function MedicationItemSheet({
  petId,
  petName,
  petSpecies,
  petPhotoUrl,
  petEvents,
  onClose,
  onRefresh,
  initialMode,
}: MedicationItemSheetProps) {
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<Mode>(initialMode === 'buy' ? 'buy' : 'view');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MedForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [medHistoryExpanded, setMedHistoryExpanded] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null);
  const [actionDate, setActionDate] = useState(localTodayISO());
  const [actionNotes, setActionNotes] = useState('');
  const [confirmingDoseId, setConfirmingDoseId] = useState<string | null>(null);
  const [confirmingEarlier, setConfirmingEarlier] = useState(false);

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
      if (ex.treatment_days) {
        const applied = (ex.applied_dates as string[] || []).length;
        return applied < parseInt(String(ex.treatment_days), 10);
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
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
  }, [petId]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, scheduled_date: localTodayISO() });
    setEditingId(null);
    setMode('add');
  }

  function openEdit(ev: PetEventRecord) {
    const { dose, route, frequency, cleanNotes } = parseMedNotes(ev.notes || '');
    let treatmentDays = '';
    let reminderTimes = ['08:00'];
    let reminderTime = '08:00';
    let reminderDate = '';
    const nextDue = ev.next_due_date ? ev.next_due_date.split('T')[0] : '';
    try {
      const ex = parsePetEventExtraData(ev.extra_data);
      if (typeof ex.reminder_time === 'string' && ex.reminder_time) reminderTime = ex.reminder_time;
      if (ex.treatment_days) treatmentDays = String(ex.treatment_days);
      if (Array.isArray(ex.reminder_times) && (ex.reminder_times as string[]).length > 0)
        reminderTimes = ex.reminder_times as string[];
      else reminderTimes = [reminderTime];
    } catch {}
    if (nextDue) reminderDate = nextDue;

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
      cost: ev.cost != null ? String(ev.cost) : '',
      notes: cleanNotes,
      manufacturer: '',
      presentation: '',
      concentration: '',
      barcode: '',
    });
    setEditingId(ev.id);
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
        form.barcode ? `EAN/GTIN: ${form.barcode}` : '',
      ].filter(Boolean).join(' | ');
      const finalNotes = medMeta + (form.notes.trim() ? '\n' + form.notes.trim() : '');

      const shouldKeepTreatmentActive = form.reminder_enabled || Boolean(form.treatment_days);

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

      if (form.reminder_enabled) {
        // Ao editar, preservar applied_dates/skipped_dates/dose_notes da medicação existente
        let extra: Record<string, unknown> = {};
        if (editingId) {
          const existing = medications.find(ev => ev.id === editingId);
          if (existing?.extra_data) {
            try { extra = { ...parsePetEventExtraData(existing.extra_data) }; } catch { /* silent */ }
          }
        }
        const normalizedTimes = form.reminder_times.filter(Boolean);
        extra.frequency = form.frequency;
        if (normalizedTimes.length > 0) {
          extra.reminder_times = normalizedTimes;
          extra.reminder_time = normalizedTimes[0];
        } else {
          extra.reminder_times = ['08:00'];
          extra.reminder_time = '08:00';
        }
        if (form.treatment_days) extra.treatment_days = parseInt(form.treatment_days);
        payload.extra_data = JSON.stringify(extra);
        if (form.reminder_date) payload.next_due_date = new Date(form.reminder_date + 'T00:00:00').toISOString();
      } else if (editingId) {
        // Ao desativar lembretes, limpar rastros de agendamento para não reativar silenciosamente no reload.
        let extra: Record<string, unknown> = {};
        const existing = medications.find(ev => ev.id === editingId);
        if (existing?.extra_data) {
          try { extra = { ...parsePetEventExtraData(existing.extra_data) }; } catch { /* silent */ }
        }
        delete extra.reminder_time;
        delete extra.reminder_times;
        delete extra.frequency;
        delete extra.treatment_days;
        payload.next_due_date = null;
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
            for (let day = 0; day < totalDays; day++) {
              const dateStr = addDays(form.reminder_date, day);
              if (dateStr < todayStr) continue;
              for (const time of times) {
                payloads.push({ pet_id: petId, type: 'medication', title, body: 'Hora da medicação', remind_at: buildRemindAt(dateStr, time) });
              }
            }

            if (payloads.length > 0) {
              // Sincronizar subscription (best-effort — não bloqueia criação dos reminders)
              try {
                const reg = await navigator.serviceWorker.ready;
                const existingSub = await reg.pushManager.getSubscription();
                if (existingSub) {
                  await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/notifications/subscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ subscription: existingSub.toJSON() }),
                  });
                }
              } catch { /* best-effort */ }

              // Criar reminders no banco independentemente do estado da subscription
              await Promise.all(payloads.map(p => createReminder(p, token)));
            }
          } catch { /* lembretes são best-effort; nunca bloqueiam o fluxo */ }
        }
        setMode('view');
        setEditingId(null);
        await onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ Erro ao salvar: ' + (err.detail || res.status));
      }
    } finally {
      setSaving(false);
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
  const statusCls = active.length > 0
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
  const dotCls = active.length > 0 ? 'bg-purple-500' : 'bg-gray-400';
  const nextActive = active[0] ?? null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-x-hidden overscroll-x-none touch-pan-y p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col overflow-x-hidden overflow-y-hidden animate-scaleIn"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >


        {/* Header */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-purple-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center text-3xl flex-shrink-0">
              {petPhotoSrc ? (
                <img src={petPhotoSrc} alt={petName || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span>{petSpecies === 'cat' ? '🐱' : '🐶'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-[16px] font-bold text-gray-900 leading-tight whitespace-nowrap">Medicação</h2>
              </div>
              {petName && (
                <p className="mt-1">
                  <span className="inline-flex max-w-full items-center px-2.5 py-1 rounded-full bg-white text-purple-800 text-xs font-black tracking-[0.04em] shadow-sm border border-purple-100 whitespace-normal break-all leading-tight">
                    {petName}
                  </span>
                </p>
              )}
              {mode === 'view' && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
                  <span className={`text-[13px] font-semibold truncate ${active.length > 0 ? 'text-purple-700' : 'text-gray-500'}`}>{statusLabel}</span>
                </div>
              )}
              {mode !== 'view' && (
                <span className="text-[13px] font-semibold text-purple-600 mt-0.5">
                  {mode === 'add' ? 'Novo registro' : 'Editar medicação'}
                </span>
              )}
            </div>
            {mode !== 'view' ? (
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
                aria-label="Voltar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="p-5 space-y-4 pb-8">
              {/* Toast */}
              {toast && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 border border-green-200 text-sm font-semibold text-green-700">
                  {toast}
                </div>
              )}

              {/* Primary CTA */}
              {nextActive ? (
                <div className="rounded-3xl border border-purple-100 bg-purple-50/70 p-4 space-y-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Cuidado de hoje</p>
                    <p className="mt-1 text-lg font-black text-gray-900 break-words">{nextActive.title}</p>
                    <p className="mt-0.5 text-sm text-purple-800/70">Registre a dose para manter o tratamento em dia.</p>
                  </div>
                  {confirmingDoseId === nextActive.id ? (
                    <div className="space-y-2">
                      <p className="text-[13px] font-semibold text-purple-900 text-center">
                        Você deu a dose de <span className="font-black">{nextActive.title}</span>?
                      </p>
                      {confirmingEarlier && (
                        <input
                          type="date"
                          className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                          value={actionDate}
                          max={localTodayISO()}
                          onChange={e => setActionDate(e.target.value)}
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => { handleApplyDose(nextActive.id, 'apply', confirmingEarlier ? actionDate : localTodayISO()); setConfirmingDoseId(null); setConfirmingEarlier(false); }}
                          className="py-3 rounded-xl bg-purple-600 text-white text-[13px] font-bold disabled:opacity-50"
                        >
                          {confirmingEarlier ? 'Registrar' : 'Sim, agora'}
                        </button>
                        {!confirmingEarlier ? (
                          <button
                            type="button"
                            onClick={() => { setConfirmingEarlier(true); setActionDate(localTodayISO()); }}
                            className="py-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-[13px] font-semibold"
                          >
                            Foi mais cedo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingEarlier(false)}
                            className="py-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-[13px] font-semibold"
                          >
                            Voltar
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setConfirmingDoseId(null); setConfirmingEarlier(false); }}
                        className="w-full text-center text-[12px] text-gray-400 py-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={saving && applyingId === nextActive.id}
                      onClick={() => setConfirmingDoseId(nextActive.id)}
                      className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[15px] font-bold shadow-md shadow-purple-500/20 disabled:opacity-50 transition-colors"
                    >
                      {saving && applyingId === nextActive.id ? 'Registrando...' : 'Registrar dose'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={openAdd}
                  className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[15px] font-bold shadow-md shadow-purple-500/20 transition-colors"
                >
                  Registrar medicação
                </button>
              )}

              {/* Empty state */}
              {medications.length === 0 && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                  <p className="text-4xl mb-3">💊</p>
                  <p className="text-sm font-semibold text-gray-600">Nenhuma medicação registrada</p>
                  <p className="text-xs text-gray-400 mt-1">Registre uma prescrição acima</p>
                </div>
              )}

              {/* Daily application section */}
              {active.length > 0 && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50/70 overflow-hidden">
                  <div className="px-4 py-3 border-b border-purple-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                      Tratamentos em andamento · {active.length}
                    </p>
                  </div>
                  {active.map(ev => {
                    let totalDays = 0;
                    let appliedDates: string[] = [];
                    let skippedDates: string[] = [];
                    try {
                      const ex = parsePetEventExtraData(ev.extra_data);
                      totalDays = parseInt(String(ex.treatment_days), 10) || 0;
                      appliedDates = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
                      skippedDates = Array.isArray(ex.skipped_dates) ? ex.skipped_dates as string[] : [];
                    } catch {}
                    const todayStr = localTodayISO();
                    const pct = totalDays > 0 ? Math.min(100, Math.round(appliedDates.length / totalDays * 100)) : 0;
                    const isOpen = expandedTreatmentId === ev.id;
                    const isBusy = saving && applyingId === ev.id;
                    const startDate = createLocalDate((ev.scheduled_at || todayStr).split('T')[0]);
                    const nowDay = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
                    const daysSinceStart = Math.max(0, Math.floor((nowDay.getTime() - startDate.getTime()) / 86400000));
                    const recentDays: string[] = [];
                    for (let i = daysSinceStart; i >= 0; i--) {
                      const d = new Date(nowDay);
                      d.setDate(d.getDate() - i);
                      recentDays.push(dateToLocalISO(d));
                    }
                    const selectedDate = isOpen ? actionDate : todayStr;
                    const alreadyDone = appliedDates.includes(selectedDate);
                    const alreadySkipped = skippedDates.includes(selectedDate);

                    return (
                      <div key={ev.id} className="border-b border-purple-100 last:border-b-0">
                        {/* Clickable header */}
                        <button
                          onClick={() => {
                            setExpandedTreatmentId(isOpen ? null : ev.id);
                            setActionDate(todayStr);
                            setActionNotes('');
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-left active:scale-[0.99] transition-all"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-purple-900 truncate">{ev.title}</p>
                          </div>
                          {totalDays > 0 && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                              appliedDates.includes(todayStr) ? 'bg-green-100 text-green-700' : 'bg-purple-200 text-purple-700'
                            }`}>
                              Dia {appliedDates.length} de {totalDays}
                            </span>
                          )}
                          <span className="text-gray-300 text-xs ml-1">{isOpen ? '▲' : '▼'}</span>
                        </button>

                        {/* Progress bar */}
                        {totalDays > 0 && (
                          <div className="mx-4 mb-2">
                            <div className="h-1.5 bg-purple-200 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Dia {appliedDates.length} de {totalDays}
                              {totalDays > appliedDates.length ? ` · Faltam ${totalDays - appliedDates.length} dias` : ' · Concluído'}
                            </p>
                          </div>
                        )}

                        {/* CTA inline — visível sem precisar expandir */}
                        {!isOpen && (
                          <div className="mx-4 mb-3 flex gap-2">
                            {appliedDates.includes(todayStr) ? (
                              <>
                                <div className="flex-1 rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 text-center">
                                  ✓ Aplicada hoje
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openEdit(ev)}
                                  className="rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-50 active:scale-95"
                                >✏️</button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleApplyDose(ev.id, 'apply', todayStr)}
                                  className="flex-1 rounded-xl border border-purple-200 bg-white py-2.5 text-sm font-semibold text-purple-700 active:scale-95 transition-all disabled:opacity-40"
                                >
                                  {isBusy ? '...' : 'Registrar dose'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedTreatmentId(ev.id);
                                    setActionDate(todayStr);
                                    setActionNotes('');
                                  }}
                                  className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 active:scale-95"
                                  title="Ver histórico"
                                >⋯</button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(ev)}
                                  className="rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-50 active:scale-95"
                                >✏️</button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Expanded: day calendar */}
                        {isOpen && (
                          <div className="px-4 pb-4 pt-1 bg-white/70 border-t border-purple-100">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Últimos dias</p>
                            <div className="flex gap-1 flex-wrap mb-3">
                              {recentDays.map(d => {
                                const done = appliedDates.includes(d);
                                const skipped = skippedDates.includes(d);
                                const isSel = d === selectedDate;
                                const dayNum = parseInt(d.split('-')[2]);
                                return (
                                  <button
                                    key={d}
                                    onClick={() => { setActionDate(d); setActionNotes(''); }}
                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all active:scale-90 flex flex-col items-center justify-center ${
                                      isSel
                                        ? done ? 'bg-green-500 text-white' : skipped ? 'bg-amber-500 text-white' : 'bg-purple-500 text-white'
                                        : done ? 'bg-green-100 text-green-700 border border-green-200'
                                        : skipped ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                                    }`}
                                  >
                                    <span>{dayNum}</span>
                                    {(done || skipped) && <span className="text-[8px]">{done ? '✓' : '↷'}</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {alreadyDone ? (
                              <div className="rounded-lg border border-green-200 bg-green-50 overflow-hidden">
                                <div className="flex items-center gap-1.5 px-2.5 py-2">
                                  <span className="text-green-500">✓</span>
                                  <p className="text-sm text-green-700 font-semibold flex-1">
                                    Dose de {selectedDate.slice(8)}/{selectedDate.slice(5, 7)} registrada
                                  </p>
                                </div>
                                <button
                                  disabled={isBusy}
                                  onClick={() => handleApplyDose(ev.id, 'remove', selectedDate)}
                                  className="w-full text-sm font-semibold text-red-500 py-1.5 border-t border-green-200 bg-white/60 active:bg-red-50 transition-all disabled:opacity-40"
                                >{isBusy ? '...' : '🗑 Desfazer'}</button>
                              </div>
                            ) : alreadySkipped ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                                <div className="flex items-center gap-1.5 px-2.5 py-2">
                                  <span className="text-amber-500">↷</span>
                                  <p className="text-sm text-amber-700 font-semibold flex-1">
                                    Dia {selectedDate.slice(8)}/{selectedDate.slice(5, 7)} marcado como pulado
                                  </p>
                                </div>
                                <button
                                  disabled={isBusy}
                                  onClick={() => handleApplyDose(ev.id, 'unskip', selectedDate)}
                                  className="w-full text-sm font-semibold text-amber-700 py-1.5 border-t border-amber-200 bg-white/70 active:bg-amber-100 transition-all disabled:opacity-40"
                                >{isBusy ? '...' : 'Desfazer pulado'}</button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <button
                                  disabled={isBusy}
                                  onClick={() => handleApplyDose(ev.id, 'apply', selectedDate)}
                                  className="w-full text-[15px] font-bold py-3.5 rounded-2xl bg-purple-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-40"
                                >{isBusy ? '...' : 'Registrar dose'}</button>
                                <div className="flex gap-2">
                                  <button
                                    disabled={isBusy || selectedDate > todayStr}
                                    onClick={() => handleApplyDose(ev.id, 'skip', selectedDate)}
                                    className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 active:scale-95 transition-all disabled:opacity-40"
                                  >{isBusy ? '...' : '↷ Pular'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
                {nextActive && (
                  <button
                    onClick={openAdd}
                    className="w-full py-3 rounded-2xl border border-purple-200 bg-white text-sm font-semibold text-purple-700 hover:bg-purple-50 active:scale-95 transition-all"
                  >
                    Nova medicação
                  </button>
                )}
                <button
                  onClick={() => setMode('buy')}
                  className={`${nextActive ? '' : 'col-span-2'} w-full py-3 rounded-2xl border border-blue-200 bg-white text-sm font-semibold text-blue-700 hover:bg-blue-50 active:scale-95 transition-all`}
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
              <p className="text-sm text-gray-500">Escolha onde encontrar medicamentos e itens de saúde:</p>

              <div className="space-y-3">
                {[
                  { name: 'Cobasi', url: 'https://www.cobasi.com.br/capsulas-e-saude/medicamentos', emoji: '🐾' },
                  { name: 'Petz', url: 'https://www.petz.com.br/cachorro/farmacia', emoji: '🐕' },
                  { name: 'Petlove', url: 'https://www.petlove.com.br/cachorro/medicina-e-saude', emoji: '❤️' },
                  { name: 'Amazon Pet', url: 'https://www.amazon.com.br/s?k=medicamento+pet', emoji: '📦' },
                ].map(store => (
                  <button
                    key={store.name}
                    onClick={() => {
                      trackPartnerClicked({
                        source: 'medication_sheet',
                        partner: store.name.toLowerCase(),
                        pet_id: petId,
                        control_type: 'medication',
                      });
                      window.open(store.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                  >
                    <span className="text-2xl">{store.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{store.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Comprar medicamentos</p>
                    </div>
                    <span className="text-gray-400 text-lg">›</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
              >
                Voltar para tratamentos
              </button>
            </div>
          )}

          {/* ── ADD / EDIT FORM ───────────────────────────────────────────── */}
          {(mode === 'add' || mode === 'edit') && (
            <div className="p-5 pb-8 space-y-4">
              <ProductBarcodeScanner
                label="Escanear medicamento"
                expectedCategory="medication"
                petId={petId}
                petName={petName}
                onProductConfirmed={applyScannedProduct}
              />

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
                <div>
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
                  <option value="semanal">Semanal</option>
                  <option value="conforme_necessidade">Conforme necessidade (SOS)</option>
                </select>
              </div>

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

                  <div>
                    <label className={labelCls}>📆 Duração do tratamento (dias)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Ex: 7"
                      className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                      value={form.treatment_days}
                      onChange={e => setForm(f => ({ ...f, treatment_days: e.target.value }))}
                    />
                  </div>
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
                className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[15px] font-bold shadow-md disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : '✅ Confirmar registro'}
              </button>

              {mode === 'edit' && editingId && (
                <button
                  type="button"
                  onClick={confirmDeleteCurrent}
                  disabled={saving}
                  className="w-full py-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-[15px] font-bold shadow-sm disabled:opacity-50 transition-colors hover:bg-red-100"
                >
                  {saving ? 'Excluindo...' : '🗑 Excluir medicação'}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
    </ModalPortal>
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
    if (ex.treatment_days) {
      const applied = (ex.applied_dates as string[] || []).length;
      const total = parseInt(String(ex.treatment_days), 10);
      if (applied >= total) {
        badgeCls = 'bg-green-100 text-green-700'; badgeTxt = 'Concluído';
      } else {
        badgeCls = 'bg-purple-100 text-purple-700'; badgeTxt = `Em tratamento (${applied}/${total})`;
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
