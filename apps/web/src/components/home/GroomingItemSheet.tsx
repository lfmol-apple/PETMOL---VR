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

function buildWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function resolveRemindAt(nextDateStr: string, daysBefore: number, time: string): string | null {
  const now = new Date();
  for (const d of [daysBefore, 3, 1, 0]) {
    const candidate = buildRemindAt(d > 0 ? subtractDays(nextDateStr, d) : nextDateStr, time);
    if (new Date(candidate) > now) return candidate;
  }
  return null;
}

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
    location_phone: '',
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
    location_phone: '',
    frequency_days: String(FREQ_DEFAULTS['bath_grooming']),
    reminder_days: '3',
    reminder_time: '09:00',
  });
  const [justSavedPhone, setJustSavedPhone] = useState<string | null>(null);

  // ── Start add (pre-fill from last record) ────────────────────────────────
  function startAdd() {
    const lastWithContact = sorted.find(r => r.location || r.location_phone);
    setAddForm(f => ({
      ...f,
      date: localTodayISO(),
      location: lastWithContact?.location || '',
      location_phone: lastWithContact?.location_phone || '',
    }));
    setMode('add');
  }

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

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: addForm.type,
          date: addForm.date,
          location: addForm.location || null,
          location_phone: addForm.location_phone || null,
          cost: null,
          notes: null,
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
          const remindAt = resolveRemindAt(nextDate, daysBefore, addForm.reminder_time || '09:00');
          if (remindAt) {
            const t = getToken();
            if (t) {
              const { icon, label } = groomingLabel(addForm.type);
              const petshopName = addForm.location?.trim();
              void scheduleUniqueReminder({
                pet_id: petId,
                type: 'grooming',
                title: `${icon} ${label}: ${petName || 'seu pet'}`,
                body: petshopName
                  ? `Agendar ${label.toLowerCase()} do ${petName || 'seu pet'} · Toque para falar com ${petshopName} 🐾`
                  : `Hora de agendar o ${label.toLowerCase()} do ${petName || 'seu pet'} no petshop 🐾`,
                remind_at: remindAt,
              }, t);
            }
          }
        } catch { /* push é best-effort */ }

        setMode('view');
        setJustSavedPhone(addForm.location_phone || null);
        setAddForm(f => ({ ...f, date: localTodayISO() }));
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
    setEditForm({
      date: rec.date,
      type: rec.type,
      location: rec.location || '',
      location_phone: rec.location_phone || '',
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

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: editForm.date,
          type: editForm.type,
          location: editForm.location || null,
          location_phone: editForm.location_phone || null,
          // cost/notes were only ever set via the fields removed from this
          // form (Produto utilizado, Valor R$) — pass the record's existing
          // values through unchanged instead of silently wiping them.
          cost: editRecord.cost ?? null,
          notes: editRecord.notes ?? null,
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
          const remindAt2 = resolveRemindAt(nextDate2, daysBefore2, editForm.reminder_time || '09:00');
          if (remindAt2) {
            const t = getToken();
            if (t) {
              const { icon, label } = groomingLabel(editForm.type);
              const petshopName2 = editForm.location?.trim();
              void scheduleUniqueReminder({
                pet_id: petId,
                type: 'grooming',
                title: `${icon} ${label}: ${petName || 'seu pet'}`,
                body: petshopName2
                  ? `Agendar ${label.toLowerCase()} do ${petName || 'seu pet'} · Toque para falar com ${petshopName2} 🐾`
                  : `Hora de agendar o ${label.toLowerCase()} do ${petName || 'seu pet'} no petshop 🐾`,
                remind_at: remindAt2,
              }, t);
            }
          }
        } catch { /* push é best-effort */ }

        showToast('✅ Registro atualizado!');
        setMode('view');
        setJustSavedPhone(editForm.location_phone || null);
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
      setMode('view');
      setEditRecord(null);
      await onRefresh();
    } else {
      const errorText = await res.text().catch(() => '');
      showToast(`❌ Erro ao remover (${res.status}). ${errorText || 'Tente novamente.'}`);
    }
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-[#E5E5EA] rounded-xl px-4 py-3 text-[15px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#5856D6]/30 placeholder:text-[#C7C7CC]';
  const labelCls = 'block text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-x-hidden overscroll-x-none touch-pan-y p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg isolate flex flex-col overflow-hidden rounded-[26px] bg-[#f2f2f7] shadow-[0_-8px_50px_-8px_rgba(15,23,42,0.35)] ring-1 ring-black/5 animate-scaleIn"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Success overlay */}
        {justSaved && (
          <div className="absolute inset-0 bg-[#F2F2F7] z-20 flex flex-col items-center justify-center gap-5 text-center p-8 rounded-[28px]">
            <div className="w-16 h-16 rounded-full bg-[#34C759] flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h3 className="text-[19px] font-bold text-[#1C1C1E] mb-1">Higiene registrada</h3>
              <p className="text-[14px] text-[#8E8E93]">Prontuário do pet atualizado.</p>
            </div>
            {justSavedPhone && (
              <a
                href={buildWhatsAppUrl(justSavedPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm active:opacity-70 transition-opacity text-left"
              >
                <div className="w-11 h-11 rounded-[12px] bg-[#25D366] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <WhatsAppIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#1C1C1E]">Agendar via WhatsApp</p>
                  <p className="text-[13px] text-[#8E8E93] truncate">Toque para abrir a conversa</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </a>
            )}
            <button
              onClick={() => onGoHome?.()}
              className="w-full py-[14px] rounded-[14px] bg-[#5856D6] text-white text-[16px] font-semibold active:opacity-80 transition-opacity"
            >
              Ir para a home
            </button>
            <button onClick={() => setJustSaved(false)} className="text-[14px] text-[#5856D6]">
              Ver prontuário
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-3 pb-3 bg-[#F2F2F7] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-[#E5E5EA] flex items-center justify-center text-2xl flex-shrink-0">
              {petPhotoSrc ? (
                <img src={petPhotoSrc} alt={petName || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span>{petSpecies === 'cat' ? '🐱' : '🐶'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-[#1C1C1E] leading-tight">Higiene e Petshop</h2>
              {petName && (
                <p className="text-[13px] text-[#8E8E93] mt-0.5">{petName}</p>
              )}
            </div>
            {mode !== 'view' ? (
              <button
                type="button"
                onClick={() => { setMode('view'); setEditRecord(null); }}
                onTouchEnd={() => { setMode('view'); setEditRecord(null); }}
                className="w-8 h-8 rounded-full bg-[#E5E5EA] flex items-center justify-center flex-shrink-0 active:opacity-60"
                aria-label="Voltar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#E5E5EA] flex items-center justify-center flex-shrink-0 active:opacity-60"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Status badge */}
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${status.bg} ${status.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {nextDate ? status.label : 'Sem agendamento'}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="px-4 pt-3 pb-5 space-y-2.5">

              {/* Last service card — iOS grouped table */}
              {last ? (
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 pt-3 pb-2">
                    <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">Último serviço</p>
                    <p className="text-[16px] font-semibold text-[#1C1C1E] mt-0.5">{TYPE_LABELS[last.type]}</p>
                  </div>
                  <div className="divide-y divide-[#F2F2F7]">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[14px] text-[#8E8E93]">Data</span>
                      <span className="text-[14px] font-medium text-[#1C1C1E]">{fmtDate(last.date)}</span>
                    </div>
                    {nextDate && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[14px] text-[#8E8E93]">Próximo</span>
                        <span className={`text-[14px] font-semibold ${status.text}`}>{fmtDate(nextDate)}</span>
                      </div>
                    )}
                    {last.location && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[14px] text-[#8E8E93]">Local</span>
                        <span className="text-[14px] font-medium text-[#1C1C1E] truncate max-w-[55%] text-right">{last.location}</span>
                      </div>
                    )}
                    {last.cost != null && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[14px] text-[#8E8E93]">Valor</span>
                        <span className="text-[14px] font-medium text-[#1C1C1E]">R$ {last.cost.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    {last.notes && (() => {
                      const productMatch = last.notes.match(/^Produto:\s*([^\n(]+)/);
                      const productName = productMatch ? productMatch[1].trim() : null;
                      const restNotes = last.notes.replace(/^Produto:[^\n]*(\n)?/, '').trim();
                      return (
                        <>
                          {productName && (
                            <div className="flex items-center justify-between px-4 py-3">
                              <span className="text-[14px] text-[#8E8E93]">Produto</span>
                              <a
                                href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(productName + ' pet')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[14px] font-medium text-[#5856D6] truncate max-w-[55%] text-right"
                              >
                                {productName}
                              </a>
                            </div>
                          )}
                          {restNotes && (
                            <div className="px-4 py-3">
                              <p className="text-[13px] text-[#8E8E93] italic">{restNotes}</p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                  <p className="text-4xl mb-3">🛁</p>
                  <p className="text-[15px] font-semibold text-[#1C1C1E]">Nenhum serviço registrado</p>
                  <p className="text-[13px] text-[#8E8E93] mt-1">Registre o primeiro serviço abaixo</p>
                </div>
              )}

              {/* WhatsApp — iOS action row */}
              {last?.location_phone && (
                <a
                  href={buildWhatsAppUrl(last.location_phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm active:opacity-70 transition-opacity"
                >
                  <div className="w-11 h-11 rounded-[12px] bg-[#25D366] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <WhatsAppIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">Agendar via WhatsApp</p>
                    {last.location && (
                      <p className="text-[13px] text-[#8E8E93] truncate">{last.location}</p>
                    )}
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </a>
              )}

              {/* Main CTAs */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={startAdd}
                  className="w-full py-[14px] rounded-[14px] bg-[#5856D6] text-white text-[16px] font-semibold shadow-sm active:opacity-80 transition-opacity"
                >
                  Registrar banho/tosa
                </button>
                {last && (
                  <button
                    onClick={() => nextEditableRecord && startEdit(nextEditableRecord)}
                    disabled={!nextEditableRecord}
                    className="w-full py-3 text-[15px] font-medium text-[#5856D6] disabled:opacity-30 active:opacity-60 transition-opacity"
                  >
                    Editar próximo agendamento
                  </button>
                )}
              </div>

              {/* History */}
              {sorted.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1 mb-2">
                    Histórico ({sorted.length})
                  </p>
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-[#F2F2F7]">
                    {sorted.map((rec) => {
                      const isHistory = hasLaterGroomingRecord(sorted, rec);
                      return (
                        <div key={rec.id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[17px] flex-shrink-0 ${!isHistory ? 'bg-[#F2F2F7]' : 'bg-[#F2F2F7]'}`}>
                            {TYPE_LABELS[rec.type].split(' ')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-[#1C1C1E]">{TYPE_LABELS[rec.type].replace(/^[^\s]+ /, '')}</p>
                            <p className="text-[12px] text-[#8E8E93]">
                              {fmtDate(rec.date)}
                              {rec.cost != null ? ` · R$ ${rec.cost.toFixed(2).replace('.', ',')}` : ''}
                              {rec.location ? ` · ${rec.location}` : ''}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => startEdit(rec)}
                              className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60"
                              aria-label="Editar"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(rec.id)}
                              className="w-8 h-8 rounded-full bg-[#FFF1F0] flex items-center justify-center active:opacity-60"
                              aria-label="Remover"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ADD FORM ──────────────────────────────────────────────────── */}
          {mode === 'add' && (
            <div className="px-4 pb-8 space-y-4 pt-2">
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="flex items-center gap-1 text-[#5856D6] text-[15px] font-medium mb-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>
                Voltar
              </button>
              <h3 className="text-[17px] font-bold text-[#1C1C1E]">Registrar serviço</h3>

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

              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">Petshop</p>
                </div>
                <datalist id={`grooming-loc-${petId}`}>
                  {[...new Set(groomingRecords.filter(r => r.location).map(r => r.location!))].map(loc => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
                <div className="px-4 pb-3 space-y-3 pt-2">
                  <div>
                    <label className={labelCls}>Nome do local</label>
                    <input
                      type="text"
                      list={`grooming-loc-${petId}`}
                      className={inputCls}
                      placeholder="Ex: Banho & Tosa da Ana, Cobasi..."
                      value={addForm.location}
                      onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>WhatsApp para agendamento</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                      </div>
                      <input
                        type="tel"
                        className={`${inputCls} pl-9`}
                        placeholder="(11) 99999-9999"
                        value={addForm.location_phone}
                        onChange={e => setAddForm(f => ({ ...f, location_phone: e.target.value }))}
                      />
                    </div>
                    {addForm.location_phone && (
                      <a
                        href={buildWhatsAppUrl(addForm.location_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-[#25D366]"
                      >
                        Testar este número ›
                      </a>
                    )}
                  </div>
                </div>
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
                className="w-full py-[14px] rounded-[14px] bg-[#5856D6] text-white text-[16px] font-semibold shadow-sm disabled:opacity-40 active:opacity-80 transition-opacity"
              >
                {saving ? 'Salvando...' : 'Confirmar serviço'}
              </button>
            </div>
          )}

          {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
          {mode === 'edit' && editRecord && (
            <div className="px-4 pb-4 space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setMode('view'); setEditRecord(null); }}
                  onTouchEnd={() => { setMode('view'); setEditRecord(null); }}
                  className="flex items-center gap-1 text-[#5856D6] text-[15px] font-semibold"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(editRecord.id)}
                  disabled={saving}
                  className="flex items-center gap-1 text-[13px] font-bold text-[#FF3B30] active:opacity-60 disabled:opacity-50"
                >
                  🗑 Excluir
                </button>
              </div>
              <h3 className="text-[17px] font-bold text-[#1C1C1E]">Editar registro</h3>

              <div className="grid grid-cols-2 gap-2.5">
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

              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">Petshop</p>
                </div>
                <datalist id={`grooming-loc-edit-${petId}`}>
                  {[...new Set(groomingRecords.filter(r => r.location).map(r => r.location!))].map(loc => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
                <div className="px-4 pb-3 space-y-3 pt-2">
                  <div>
                    <label className={labelCls}>Nome do local</label>
                    <input
                      type="text"
                      list={`grooming-loc-edit-${petId}`}
                      className={inputCls}
                      placeholder="Ex: Banho & Tosa da Ana, Cobasi..."
                      value={editForm.location}
                      onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>WhatsApp para agendamento</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                      </div>
                      <input
                        type="tel"
                        className={`${inputCls} pl-9`}
                        placeholder="(11) 99999-9999"
                        value={editForm.location_phone}
                        onChange={e => setEditForm(f => ({ ...f, location_phone: e.target.value }))}
                      />
                    </div>
                    {editForm.location_phone && (
                      <a
                        href={buildWhatsAppUrl(editForm.location_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-[#25D366]"
                      >
                        Testar este número ›
                      </a>
                    )}
                  </div>
                </div>
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
                className="w-full py-3.5 rounded-[14px] bg-[#5856D6] text-white text-[15px] font-semibold shadow-sm disabled:opacity-40 active:opacity-80 transition-opacity"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

        </div>
        {/* End scrollable body */}

        {/* ── Delete confirm ────────────────────────────────────────────────── */}
        {confirmDeleteId && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center p-4 z-10 rounded-[28px]">
            <div className="w-full max-w-sm bg-[#F2F2F7] rounded-[20px] overflow-hidden shadow-2xl">
              <div className="px-4 pt-4 pb-3 text-center border-b border-[#E5E5EA]">
                <p className="text-[13px] font-semibold text-[#1C1C1E]">Remover registro?</p>
                <p className="text-[12px] text-[#8E8E93] mt-0.5">Essa ação não pode ser desfeita.</p>
              </div>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="w-full py-3.5 text-[16px] font-semibold text-[#FF3B30] border-b border-[#E5E5EA] active:opacity-60 transition-opacity"
              >
                Remover
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full py-3.5 text-[16px] font-semibold text-[#5856D6] active:opacity-60 transition-opacity"
              >
                Cancelar
              </button>
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
