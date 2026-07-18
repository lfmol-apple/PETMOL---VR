'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { GroomingRecord, GroomingType } from '@/lib/types/home';
import { ModalPortal } from '@/components/ModalPortal';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { scheduleUniqueReminder, buildRemindAt, subtractDays } from '@/features/notifications/pushService';

// ── Helpers ──────────────────────────────────────────────────────────────────
function groomingLabel(type: string): { icon: string; label: string } {
  if (type === 'bath') return { icon: '🛁', label: 'Banho' };
  if (type === 'grooming') return { icon: '✂️', label: 'Tosa' };
  return { icon: '🛁✂️', label: 'Banho e Tosa' };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateToLocalISO(dt);
}

function diffDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function hasLaterGroomingRecord(records: GroomingRecord[], record: GroomingRecord): boolean {
  const recordTime = new Date(record.date).getTime();
  return records.some((candidate) => {
    if (candidate.id === record.id || candidate.type !== record.type) return false;
    const candidateTime = new Date(candidate.date).getTime();
    return !Number.isNaN(candidateTime) && (Number.isNaN(recordTime) || candidateTime > recordTime);
  });
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const TYPE_LABELS: Record<GroomingType, string> = {
  bath: '🚿 Banho',
  grooming: '✂️ Tosa',
  bath_grooming: '🛁 Banho + Tosa',
};

const FREQ_DEFAULTS: Record<GroomingType, number> = {
  bath: 21,
  grooming: 45,
  bath_grooming: 30,
};

function computeStatus(nextDate?: string | null) {
  const diff = diffDays(nextDate);
  if (diff === null) return { label: 'Sem agendamento', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  if (diff < 0)      return { label: `Precisa de atenção · atrasado há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`, bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' };
  if (diff === 0)    return { label: 'hoje', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
  if (diff <= 7)     return { label: `em ${diff} dia${diff !== 1 ? 's' : ''}`, bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
  return { label: `em ${diff} dias`, bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
}

// ── Types ────────────────────────────────────────────────────────────────────
interface GroomingItemSheetProps {
  petId: string;
  petName?: string;
  petSpecies?: string;
  petPhotoUrl?: string | null;
  groomingRecords: GroomingRecord[];
  onClose: () => void;
  onGoHome?: () => void;
  onRefresh: () => Promise<void>;
}

type ViewMode = 'view' | 'add' | 'edit';

// ── Component ────────────────────────────────────────────────────────────────
export function GroomingItemSheet({
  petId,
  petName,
  petSpecies,
  petPhotoUrl,
  groomingRecords,
  onClose,
  onRefresh,
  onGoHome,
}: GroomingItemSheetProps) {
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<ViewMode>('view');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void onRefresh();
    // onRefresh is intentionally excluded to avoid effect loops when parent recreates callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  const sorted = [...groomingRecords].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const last = sorted[0] ?? null;
  const nextEditableRecord = sorted.find((r) => !!r.next_recommended_date) ?? last;
  const nextDate = last?.next_recommended_date?.split('T')[0] ?? null;
  const status = computeStatus(nextDate);

  // ── Add form ──────────────────────────────────────────────────────────────
  const [addForm, setAddForm] = useState({
    date: localTodayISO(),
    type: 'bath_grooming' as GroomingType,
    location: '',
    cost: '',
    notes: '',
    product_name: '',
    barcode: '',
    frequency_days: String(FREQ_DEFAULTS['bath_grooming']),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState<GroomingRecord | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    type: 'bath_grooming' as GroomingType,
    location: '',
    cost: '',
    notes: '',
    product_name: '',
    barcode: '',
    frequency_days: String(FREQ_DEFAULTS['bath_grooming']),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  // ── Add handler ───────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!addForm.date) return;
    setSaving(true);
    try {
      const token = getToken();
      if (!token) { showToast('⚠️ Sessão expirada. Faça login novamente.'); return; }

      const freq = parseInt(addForm.frequency_days, 10) || FREQ_DEFAULTS[addForm.type];
      const nextRec = addDays(addForm.date, freq);

      const productLine = addForm.product_name.trim()
        ? `Produto: ${addForm.product_name.trim()}${addForm.barcode ? ` (EAN: ${addForm.barcode})` : ''}`
        : '';
      const finalNotes = [productLine, addForm.notes.trim()].filter(Boolean).join('\n') || null;

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: addForm.type,
          date: addForm.date,
          location: addForm.location || null,
          cost: addForm.cost ? parseFloat(addForm.cost) : null,
          notes: finalNotes,
          next_recommended_date: nextRec,
          frequency_days: freq,
          reminder_enabled: true,
          alert_days_before: parseInt(addForm.reminder_days) || 3,
          scheduled_time: addForm.reminder_time || '09:00',
        }),
      });

      if (res.ok) {
        // Agendar lembrete de push para próximo serviço
        try {
          const freq = parseInt(addForm.frequency_days, 10) || FREQ_DEFAULTS[addForm.type];
          const nextDate = addDays(addForm.date, freq);
          const daysBefore = parseInt(addForm.reminder_days, 10) || 3;
          const remindAt = buildRemindAt(subtractDays(nextDate, daysBefore), addForm.reminder_time || '09:00');
          if (new Date(remindAt) > new Date()) {
            const t = getToken();
            if (t) {
              const { icon, label } = groomingLabel(addForm.type);
              void scheduleUniqueReminder({
                pet_id: petId,
                type: 'grooming',
                title: `${icon} ${label}: ${petName || 'seu pet'}`,
                body: `Hora de agendar o ${label.toLowerCase()} de ${petName || 'seu pet'} no pet shop!`,
                remind_at: remindAt,
              }, t);
            }
          }
        } catch { /* push é best-effort */ }

        // Track hygiene product usage for recurring suggestions
        const productName = addForm.product_name.trim();
        if (productName) {
          try {
            const usageKey = `petmol_product_usage_${petId}_hygiene`;
            const existing = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
            const found = existing.find(item => item.name.toLowerCase() === productName.toLowerCase());
            if (found) { found.count += 1; found.lastUsed = addForm.date; }
            else existing.push({ name: productName, count: 1, lastUsed: addForm.date });
            existing.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
            localStorage.setItem(usageKey, JSON.stringify(existing));
          } catch { /* silent */ }
        }
        setMode('view');
        setAddForm(f => ({ ...f, date: localTodayISO(), cost: '', notes: '', location: '', product_name: '', barcode: '' }));
        await onRefresh();
        setJustSaved(true);
      } else {
        const errorText = await res.text().catch(() => '');
        showToast(`❌ Erro ao salvar (${res.status}). ${errorText || 'Tente novamente.'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function startEdit(rec: GroomingRecord) {
    setEditRecord(rec);
    // Extract product_name from notes if previously stored
    const notesRaw = rec.notes || '';
    const productMatch = notesRaw.match(/^Produto:\s*([^\n(]+)/);
    const productName = productMatch ? productMatch[1].trim() : '';
    const cleanNotes = productName
      ? notesRaw.replace(/^Produto:[^\n]*(\n)?/, '').trim()
      : notesRaw;
    setEditForm({
      date: rec.date,
      type: rec.type,
      location: rec.location || '',
      cost: rec.cost != null ? String(rec.cost) : '',
      notes: cleanNotes,
      product_name: productName,
      barcode: '',
      frequency_days: String(rec.frequency_days ?? FREQ_DEFAULTS[rec.type]),
      reminder_days: String((rec as unknown as Record<string, unknown>).alert_days_before ?? 3),
      reminder_time: String((rec as unknown as Record<string, unknown>).scheduled_time ?? '09:00'),
    });
    setMode('edit');
  }

  async function handleSaveEdit() {
    if (!editRecord || !editForm.date) return;
    setSaving(true);
    try {
      const token = getToken();
      if (!token) {
        showToast('⚠️ Sessão expirada. Faça login novamente.');
        return;
      }

      const editFreq = parseInt(editForm.frequency_days, 10) || FREQ_DEFAULTS[editForm.type];
      const productLine = editForm.product_name.trim()
        ? `Produto: ${editForm.product_name.trim()}${editForm.barcode ? ` (EAN: ${editForm.barcode})` : ''}`
        : '';
      const finalNotes = [productLine, editForm.notes.trim()].filter(Boolean).join('\n') || null;

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: editForm.date,
          type: editForm.type,
          location: editForm.location || null,
          cost: editForm.cost ? parseFloat(editForm.cost) : null,
          notes: finalNotes,
          next_recommended_date: addDays(editForm.date, editFreq),
          frequency_days: editFreq,
          reminder_enabled: true,
          alert_days_before: parseInt(editForm.reminder_days) || 3,
          scheduled_time: editForm.reminder_time || '09:00',
        }),
      });

      if (res.ok) {
        // Agendar lembrete de push para próximo serviço
        try {
          const editFreq2 = parseInt(editForm.frequency_days, 10) || FREQ_DEFAULTS[editForm.type];
          const nextDate2 = addDays(editForm.date, editFreq2);
          const daysBefore2 = parseInt(editForm.reminder_days, 10) || 3;
          const remindAt2 = buildRemindAt(subtractDays(nextDate2, daysBefore2), editForm.reminder_time || '09:00');
          if (new Date(remindAt2) > new Date()) {
            const t = getToken();
            if (t) {
              const { icon, label } = groomingLabel(editForm.type);
              void scheduleUniqueReminder({
                pet_id: petId,
                type: 'grooming',
                title: `${icon} ${label}: ${petName || 'seu pet'}`,
                body: `Hora de agendar o ${label.toLowerCase()} de ${petName || 'seu pet'} no pet shop!`,
                remind_at: remindAt2,
              }, t);
            }
          }
        } catch { /* push é best-effort */ }

        showToast('✅ Registro atualizado!');
        setMode('view');
        setEditRecord(null);
        await onRefresh();
        setJustSaved(true);
      } else {
        const errorText = await res.text().catch(() => '');
        showToast(`❌ Erro ao atualizar (${res.status}). ${errorText || 'Tente novamente.'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    const token = getToken();
    if (!token) {
      showToast('⚠️ Sessão expirada. Faça login novamente.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('🗑️ Registro removido');
      await onRefresh();
    } else {
      const errorText = await res.text().catch(() => '');
      showToast(`❌ Erro ao remover (${res.status}). ${errorText || 'Tente novamente.'}`);
    }
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300';
  const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-x-hidden overscroll-x-none touch-pan-y p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col overflow-x-hidden overflow-y-hidden animate-scaleIn"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Success overlay */}
        {justSaved && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center gap-6 text-center p-8 rounded-[32px]">
            <div className="text-6xl">✅</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Higiene registrada!</h3>
              <p className="text-sm text-gray-500">O prontuário do pet foi atualizado.</p>
            </div>
            <button
              onClick={() => onGoHome?.()}
              className="w-full rounded-2xl bg-blue-600 py-3.5 text-[15px] font-black text-white shadow-md shadow-blue-500/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Ir para a home
            </button>
            <button onClick={() => setJustSaved(false)} className="text-sm text-gray-400 underline">
              Ver prontuário
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-4 pb-4 bg-white border-b border-emerald-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center text-3xl flex-shrink-0">
              {petPhotoSrc ? (
                <img src={petPhotoSrc} alt={petName || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span>{petSpecies === 'cat' ? '🐱' : '🐶'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 leading-tight">Higiene e Petshop</h2>
              {petName && (
                <p className="mt-1.5">
                  <span className="inline-flex max-w-full items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-black tracking-[0.04em] whitespace-normal break-all leading-tight border border-emerald-100">
                    {petName}
                  </span>
                </p>
              )}
            </div>
            {mode !== 'view' ? (
              <button
                type="button"
                onClick={() => { setMode('view'); setEditRecord(null); }}
                onTouchEnd={() => { setMode('view'); setEditRecord(null); }}
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

          {/* Status badge */}
          <div className={`mt-3 inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${status.bg} ${status.text}`}>
            {status.dot === 'bg-rose-500' ? (
              <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                !
              </div>
            ) : (
              <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            )}
            {nextDate ? status.label : 'Sem agendamento'}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="p-5 space-y-4 pb-8">
              {/* Last service card */}
              {last ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Último serviço</p>
                  <p className="text-[17px] font-bold text-gray-900">{TYPE_LABELS[last.type]}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-[11px] text-gray-400 font-medium">Data</p>
                      <p className="font-semibold text-gray-800">{fmtDate(last.date)}</p>
                    </div>
                    {nextDate && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Próximo</p>
                        <p className={`font-semibold ${status.text}`}>{fmtDate(nextDate)}</p>
                      </div>
                    )}
                    {last.location && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Local</p>
                        <p className="font-semibold text-gray-800 truncate">{last.location}</p>
                      </div>
                    )}
                    {last.cost != null && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Valor</p>
                        <p className="font-semibold text-gray-800">R$ {last.cost.toFixed(2).replace('.', ',')}</p>
                      </div>
                    )}
                  </div>
                  {last.notes && (() => {
                    const productMatch = last.notes.match(/^Produto:\s*([^\n(]+)/);
                    const productName = productMatch ? productMatch[1].trim() : null;
                    const restNotes = last.notes.replace(/^Produto:[^\n]*(\n)?/, '').trim();
                    return (
                      <>
                        {productName && (
                          <div className="flex items-center justify-between gap-2 border-t border-sky-100 pt-2">
                            <p className="text-xs text-sky-700 font-semibold truncate">🧴 {productName}</p>
                            <a
                              href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(productName + ' pet')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-bold text-sky-600 underline whitespace-nowrap flex-shrink-0"
                            >
                              Ver produto
                            </a>
                          </div>
                        )}
                        {restNotes && (
                          <p className="text-xs text-gray-500 italic border-t border-sky-100 pt-2">{restNotes}</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                  <p className="text-4xl mb-3">🛁</p>
                  <p className="text-sm font-semibold text-gray-600">Nenhum serviço registrado</p>
                  <p className="text-xs text-gray-400 mt-1">Registre o primeiro serviço abaixo</p>
                </div>
              )}

              {/* Main CTA */}
              {last ? (
                <div className="space-y-2">
                  <button
                    onClick={() => setMode('add')}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[15px] font-bold shadow-md shadow-emerald-500/20 transition-colors"
                  >
                    Registrar banho/tosa
                  </button>
                  <button
                    onClick={() => nextEditableRecord && startEdit(nextEditableRecord)}
                    disabled={!nextEditableRecord}
                    className="w-full py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Editar próximo
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setMode('add')}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[15px] font-bold shadow-md transition-colors"
                >
                  Registrar banho/tosa
                </button>
              )}

              {/* History */}
              {sorted.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Histórico ({sorted.length})
                  </p>
                  {sorted.map((rec) => {
                    const isHistory = hasLaterGroomingRecord(sorted, rec);
                    return (
                      <div
                        key={rec.id}
                        className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${!isHistory ? 'bg-sky-50' : 'bg-gray-50'}`}>
                          {!isHistory ? '🛁' : '·'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">{TYPE_LABELS[rec.type]}</p>
                            {!isHistory && diffDays(rec.next_recommended_date) !== null && diffDays(rec.next_recommended_date)! < 0 && (
                              <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                                !
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {fmtDate(rec.date)}
                            {rec.cost != null ? ` · R$ ${rec.cost.toFixed(2).replace('.', ',')}` : ''}
                            {rec.location ? ` · ${rec.location}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => startEdit(rec)}
                            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm hover:bg-gray-200"
                            aria-label="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(rec.id)}
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm hover:bg-red-100"
                            aria-label="Remover"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ADD FORM ──────────────────────────────────────────────────── */}
          {mode === 'add' && (
            <div className="p-5 pb-8 space-y-4">
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">Registrar serviço</h3>

              <div>
                <label className={labelCls}>Produto utilizado (opcional)</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ex: Sanol Dog, Johnson's Baby..."
                  value={addForm.product_name}
                  onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Data *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={addForm.date}
                  onChange={e => setAddForm(f => ({
                    ...f,
                    date: e.target.value,
                  }))}  
                />
              </div>

              <div>
                <label className={labelCls}>Tipo *</label>
                <select
                  className={inputCls}
                  value={addForm.type}
                  onChange={e => setAddForm(f => ({
                    ...f,
                    type: e.target.value as GroomingType,
                    frequency_days: String(FREQ_DEFAULTS[e.target.value as GroomingType]),
                  }))}
                >
                  <option value="bath">🚿 Somente Banho</option>
                  <option value="grooming">✂️ Somente Tosa</option>
                  <option value="bath_grooming">🛁 Banho + Tosa</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Local (opcional)</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ex: Petshop Feliz, em casa"
                  value={addForm.location}
                  onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor R$ (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  placeholder="Ex: 80,00"
                  value={addForm.cost}
                  onChange={e => setAddForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Repetir a cada (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={inputCls}
                  value={addForm.frequency_days}
                  onChange={e => setAddForm(f => ({ ...f, frequency_days: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Recomendado: {FREQ_DEFAULTS[addForm.type]} dias</p>
              </div>

              <ReminderPicker
                days={addForm.reminder_days}
                time={addForm.reminder_time}
                onDaysChange={v => setAddForm(f => ({ ...f, reminder_days: v }))}
                onTimeChange={v => setAddForm(f => ({ ...f, reminder_time: v }))}
              />

              <button
                onClick={handleAdd}
                disabled={saving || !addForm.date}
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-[15px] font-bold shadow-md disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '✅ Confirmar serviço'}
              </button>
            </div>
          )}

          {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
          {mode === 'edit' && editRecord && (
            <div className="p-5 pb-8 space-y-4">
              <button
                type="button"
                onClick={() => { setMode('view'); setEditRecord(null); }}
                onTouchEnd={() => { setMode('view'); setEditRecord(null); }}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">Editar registro</h3>

              <div>
                <label className={labelCls}>Produto utilizado (opcional)</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ex: Sanol Dog, Johnson's Baby..."
                  value={editForm.product_name}
                  onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Data *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Tipo</label>
                <select
                  className={inputCls}
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value as GroomingType }))}
                >
                  <option value="bath">🚿 Somente Banho</option>
                  <option value="grooming">✂️ Somente Tosa</option>
                  <option value="bath_grooming">🛁 Banho + Tosa</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Repetir a cada (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={inputCls}
                  value={editForm.frequency_days}
                  onChange={e => setEditForm(f => ({ ...f, frequency_days: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Local</label>
                <input
                  type="text"
                  className={inputCls}
                  value={editForm.location}
                  onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor R$</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={editForm.cost}
                  onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <ReminderPicker
                days={editForm.reminder_days}
                time={editForm.reminder_time}
                onDaysChange={v => setEditForm(f => ({ ...f, reminder_days: v }))}
                onTimeChange={v => setEditForm(f => ({ ...f, reminder_time: v }))}
              />

              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-[15px] font-bold shadow-md disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '✅ Salvar alterações'}
              </button>
            </div>
          )}

        </div>
        {/* End scrollable body */}

        {/* ── Delete confirm ────────────────────────────────────────────────── */}
        {confirmDeleteId && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-5 z-10 rounded-3xl">
            <div className="p-5 w-full max-w-xs bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
              <p className="text-base font-bold text-gray-900 mb-2">Remover registro?</p>
              <p className="text-sm text-gray-500 mb-5">Essa ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ─────────────────────────────────────────────────────────── */}
        {toast && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-20 text-center break-words pointer-events-none">
            {toast}
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
