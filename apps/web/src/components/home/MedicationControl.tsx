'use client';

import { useState, useMemo } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import { trackV1Metric } from '@/lib/v1Metrics';
import { dateToLocalISO } from '@/lib/localDate';

interface MedicationControlProps {
  petName: string;
  petEvents: PetEventRecord[];
  onRefreshEvents: () => Promise<void>;
  onOpenFullHistory: () => void;
}

interface Treatment {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  totalDoses: number;
  appliedDates: string[];
  doseNotes: Record<string, string>;
  skippedDates: string[];
  reminderTime?: string;
  missedDays: number;
  skippedDays: number;
  dosage?: string;
  notes?: string;
}

interface SimpleMed {
  id: string;
  title: string;
  reminderTime?: string;
  todayDone: boolean;
}

const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const fmtD = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;

function createLocalDate(str: string) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function extractDate(s: string) {
  return (s || '').replace('T', ' ').split(' ')[0];
}

export function MedicationControl({ petName, petEvents, onRefreshEvents, onOpenFullHistory }: MedicationControlProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionDate, setActionDate] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', dosage: '', notes: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = dateToLocalISO(today);

  // Parse medications from events
  const { treatments, simpleMeds } = useMemo(() => {
    const treatments: Treatment[] = [];
    const simpleMeds: SimpleMed[] = [];

    petEvents
      .filter((ev) => {
        if (ev.type !== 'medicacao' || ev.source === 'document' || ev.status === 'cancelled') return false;
        if (ev.status !== 'completed') return true;
        const extraData = parsePetEventExtraData(ev.extra_data);
        if (extraData.treatment_days) {
          return (extraData.applied_dates || []).length < parseInt(String(extraData.treatment_days), 10);
        }
        return false;
      })
      .forEach((ev) => {
        const extra = parsePetEventExtraData(ev.extra_data);
        const totalDoses = extra.treatment_days ? parseInt(String(extra.treatment_days), 10) : 0;
        if (!totalDoses) {
          const appliedDates: string[] = extra.applied_dates || [];
          simpleMeds.push({
            id: ev.id, title: ev.title,
            reminderTime: extra.reminder_time,
            todayDone: appliedDates.includes(todayStr),
          });
          return;
        }
        const startDate = createLocalDate(extractDate(ev.scheduled_at));
        const appliedDates: string[] = extra.applied_dates || [];
        const skippedDates: string[] = extra.skipped_dates || [];
        const daysSinceStart = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000));
        const appliedBeforeToday = appliedDates.filter((d) => d < todayStr).length;
        const skippedBeforeToday = skippedDates.filter((d) => d < todayStr).length;
        const missedDays = Math.max(0, daysSinceStart - (appliedBeforeToday + skippedBeforeToday));
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + totalDoses - 1 + missedDays);
        if (endDate < today) return;
        treatments.push({
          id: ev.id, title: ev.title, startDate, endDate,
          totalDoses, appliedDates, skippedDates,
          doseNotes: extra.dose_notes || {},
          reminderTime: extra.reminder_time,
          missedDays, skippedDays: skippedBeforeToday,
          dosage: extra.dosage || undefined,
          notes: ev.notes || undefined,
        });
      });

    return { treatments, simpleMeds };
  }, [petEvents, today, todayStr]);

  const totalActive = treatments.length + simpleMeds.length;

  // Find next dose time
  const nextDoseInfo = useMemo(() => {
    const allTimes = [
      ...treatments.filter(t => !t.appliedDates.includes(todayStr)).map(t => ({ title: t.title, time: t.reminderTime })),
      ...simpleMeds.filter(s => !s.todayDone).map(s => ({ title: s.title, time: s.reminderTime })),
    ].filter(t => t.time);
    if (allTimes.length === 0) return null;
    allTimes.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return allTimes[0];
  }, [treatments, simpleMeds, todayStr]);

  const allDoneToday = treatments.every(t => t.appliedDates.includes(todayStr)) && simpleMeds.every(s => s.todayDone);

  if (totalActive === 0) return null;

  async function apiCall(endpoint: string, body: Record<string, unknown>) {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      await onRefreshEvents();
      if (endpoint.includes('/apply-dose')) {
        trackV1Metric('medication_taken', {
          source: 'medication_sheet',
          pet_name: petName,
          date: body.date ?? null,
        });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado';
      showToast(`❌ ${message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function apiCallPatch(eventId: string, body: Record<string, unknown>) {
    const token = getToken();
    if (!token) return false;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      await onRefreshEvents();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado';
      showToast(`❌ ${message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function apiCallDelete(eventId: string) {
    const token = getToken();
    if (!token) return false;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(`Erro ${res.status}`);
      await onRefreshEvents();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado';
      showToast(`❌ ${message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <>
      {/* Inline preview below pet name */}
      <button
        onClick={() => setShowPanel(true)}
        className="w-full rounded-xl border border-purple-200 border-l-[3px] border-l-purple-400 bg-gradient-to-r from-purple-50 to-white px-3 py-2.5 shadow-sm active:scale-[0.98] transition-all text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <span className="text-base leading-none">💊</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-purple-900 leading-tight">Medicação</p>
            <p className="text-[11px] text-purple-600/90 font-medium leading-tight mt-0.5 truncate">
              {allDoneToday ? (
                <span className="text-green-600">✓ Em dia hoje</span>
              ) : nextDoseInfo ? (
                <span>{nextDoseInfo.title}{nextDoseInfo.time ? ` · ${nextDoseInfo.time}` : ''}</span>
              ) : (
                <span>{totalActive} {totalActive === 1 ? 'ativa' : 'ativas'}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!allDoneToday && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />}
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${allDoneToday ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
              {totalActive}
            </span>
            <span className="text-purple-300 text-base leading-none">›</span>
          </div>
        </div>
      </button>

      {/* Full medication panel */}
      {showPanel && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setShowPanel(false)}
          />

          {/* Sheet */}
          <div
            className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col overflow-hidden animate-scaleIn"
            style={{ maxHeight: '92dvh' }}
            onClick={e => e.stopPropagation()}
          >

            {/* Header — compact: icon · title · petName · status inline */}
            <div className="px-4 pt-3 pb-3 bg-purple-50 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl flex-shrink-0">
                  💊
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <h2 className="text-[15px] font-bold text-gray-900 leading-tight">Medicação</h2>
                    {petName && <span className="text-[12px] text-gray-400 truncate">· {petName}</span>}
                  </div>
                  <p className={`text-[11px] font-semibold leading-tight mt-0.5 truncate ${
                    allDoneToday ? 'text-green-600' : 'text-purple-600'
                  }`}>
                    {allDoneToday
                      ? '✓ Tudo em dia hoje'
                      : nextDoseInfo
                        ? `Próxima: ${nextDoseInfo.title}${nextDoseInfo.time ? ` às ${nextDoseInfo.time}` : ''}`
                        : `${totalActive} ${totalActive === 1 ? 'medicação ativa' : 'medicações ativas'}`
                    }
                  </p>
                </div>
                <button
                  onClick={() => setShowPanel(false)}
                  className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-gray-400 hover:bg-white shadow-sm flex-shrink-0 text-[13px]"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3 pb-0">
              {/* Toast */}
              {toast && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-100 border border-green-300 shadow-sm">
                  <span className="text-green-500 text-base">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-green-800 truncate">{toast}</p>
                    <p className="text-[11px] text-green-700">Dose registrada no histórico</p>
                  </div>
                  <button onClick={() => setToast(null)} className="text-[11px] font-bold text-green-700 underline flex-shrink-0">OK</button>
                </div>
              )}

              {/* Treatment cards */}
              {treatments.map(tr => {
                const applied = tr.appliedDates.length;
                const pct = Math.min(100, Math.round(applied / tr.totalDoses * 100));
                const todayDone = tr.appliedDates.includes(todayStr);
                const isOpen = expandedId === tr.id;
                const daysLeft = Math.ceil((tr.endDate.getTime() - today.getTime()) / 86400000);

                return (
                  <div key={tr.id} className="rounded-xl border border-purple-300 bg-purple-100/70 shadow-sm overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedId(isOpen ? null : tr.id);
                        setActionNotes('');
                        setActionDate(todayStr);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:scale-[0.98] transition-all"
                    >
                      <span className="text-base leading-none">💊</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{tr.title}</p>
                        <p className="text-xs text-purple-700 font-semibold mt-0.5">
                          {applied}/{tr.totalDoses} doses · {fmtD(tr.startDate)} → {fmtD(tr.endDate)}
                          {tr.reminderTime ? ` · 🕐 ${tr.reminderTime}` : ''}
                        </p>
                        {tr.dosage && (
                          <p className="text-xs text-purple-500 mt-0.5">💊 {tr.dosage}</p>
                        )}
                        {tr.missedDays > 0 && (
                          <p className="text-xs text-orange-500 font-semibold mt-0.5">
                            ⚠️ {tr.missedDays} dia{tr.missedDays > 1 ? 's' : ''} em atraso
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          todayDone ? 'bg-green-200 text-green-800' : daysLeft <= 3 ? 'bg-orange-200 text-orange-800' : 'bg-purple-200 text-purple-800'
                        }`}>
                          {todayDone ? '✓ Hoje' : daysLeft === 0 ? 'Último dia' : `${daysLeft}d`}
                        </span>
                        <span className={`text-xs font-bold ${isOpen ? 'text-purple-400' : todayDone ? 'text-gray-300' : 'text-purple-500'}`}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Progress bar */}
                    <div className="mx-3 mb-2.5">
                      <div className="h-1.5 bg-purple-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{pct}% concluído</p>
                    </div>

                    {/* CTA strip — só aparece quando não expandido e dose pendente */}
                    {!isOpen && !todayDone && (
                      <div className="mx-3 mb-3 rounded-xl bg-purple-500 text-white text-[13px] font-bold py-2.5 text-center tracking-wide shadow-sm">
                        Registrar dose de hoje →
                      </div>
                    )}
                    {!isOpen && todayDone && (
                      <div className="mx-3 mb-3 rounded-xl bg-green-100 border border-green-200 text-green-700 text-[12px] font-semibold py-2 text-center">
                        ✓ Dose de hoje registrada · toque para detalhes
                      </div>
                    )}

                    {/* Expanded actions */}
                    {isOpen && (() => {
                      const selectedDate = actionDate || todayStr;
                      const alreadyDone = tr.appliedDates.includes(selectedDate);
                      const alreadySkipped = tr.skippedDates.includes(selectedDate);
                      const daysSinceStart = Math.floor((today.getTime() - tr.startDate.getTime()) / 86400000);
                      const recentDays: string[] = [];
                      for (let i = daysSinceStart; i >= 0; i--) {
                        const d = new Date(today);
                        d.setDate(d.getDate() - i);
                        recentDays.push(dateToLocalISO(d));
                      }

                      return (
                        <div className="px-3 pb-3 border-t border-purple-100 bg-white/70 pt-2.5">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Últimos dias</p>
                          <div className="flex gap-1 flex-wrap mb-3">
                            {recentDays.map(d => {
                              const done = tr.appliedDates.includes(d);
                              const skipped = tr.skippedDates.includes(d);
                              const isSelected = d === selectedDate;
                              const dayNum = parseInt(d.split('-')[2]);
                              return (
                                <button
                                  key={d}
                                  onClick={() => { setActionDate(d); setActionNotes(''); }}
                                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all active:scale-90 flex flex-col items-center justify-center ${
                                    isSelected
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
                                  Dose de {selectedDate.slice(8)}/{selectedDate.slice(5,7)} registrada
                                </p>
                              </div>
                              <button
                                disabled={saving}
                                onClick={async () => {
                                  const ok = await apiCall(`/events/${tr.id}/remove-dose`, { date: selectedDate });
                                  if (ok) { setActionDate(todayStr); showToast('Dose removida'); }
                                }}
                                className="w-full text-sm font-semibold text-red-500 py-1.5 border-t border-green-200 bg-white/60 active:bg-red-50 transition-all disabled:opacity-40"
                              >{saving ? '...' : '🗑 Desfazer'}</button>
                            </div>
                          ) : alreadySkipped ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-2.5 py-2">
                                <span className="text-amber-500">↷</span>
                                <p className="text-sm text-amber-700 font-semibold flex-1">
                                  Dia {selectedDate.slice(8)}/{selectedDate.slice(5,7)} marcado como pulado
                                </p>
                              </div>
                              <button
                                disabled={saving}
                                onClick={async () => {
                                  const ok = await apiCall(`/events/${tr.id}/unskip-dose`, { date: selectedDate });
                                  if (ok) showToast('Dia pulado removido');
                                }}
                                className="w-full text-sm font-semibold text-amber-700 py-1.5 border-t border-amber-200 bg-white/70 active:bg-amber-100 transition-all disabled:opacity-40"
                              >{saving ? '...' : 'Desfazer pulado'}</button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Primary CTA — full width */}
                              <button
                                disabled={saving}
                                onClick={async () => {
                                  const ok = await apiCall(`/events/${tr.id}/apply-dose`, { date: selectedDate, notes: actionNotes.trim() || undefined });
                                  if (ok) { setExpandedId(null); showToast(`${tr.title} registrado`); }
                                }}
                                className="w-full text-[15px] font-bold py-3.5 rounded-2xl bg-purple-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-40"
                              >{saving ? '...' : '✓ Administrado hoje'}</button>

                              {/* Secondary row — Adiar + Pular */}
                              <div className="flex gap-2">
                                <button
                                  disabled={saving || selectedDate > todayStr}
                                  onClick={async () => {
                                    const ok = await apiCall(`/events/${tr.id}/skip-dose`, { date: selectedDate, notes: 'adiado' });
                                    if (ok) { setExpandedId(null); showToast(`Dose adiada — tente mais tarde hoje`); }
                                  }}
                                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 active:scale-95 transition-all disabled:opacity-40"
                                >{saving ? '...' : '⏰ Adiar'}</button>
                                <button
                                  disabled={saving || selectedDate > todayStr}
                                  onClick={async () => {
                                    const ok = await apiCall(`/events/${tr.id}/skip-dose`, { date: selectedDate, notes: actionNotes.trim() || undefined });
                                    if (ok) { setExpandedId(null); showToast('Dia marcado como pulado'); }
                                  }}
                                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 active:scale-95 transition-all disabled:opacity-40"
                                >{saving ? '...' : '↷ Pular'}</button>
                              </div>

                              {/* Secondary actions row */}
                              <div className="flex gap-2 pt-1 border-t border-purple-100">
                                <button
                                  onClick={() => {
                                    setEditingId(editingId === tr.id ? null : tr.id);
                                    setEditForm({ title: tr.title, dosage: tr.dosage || '', notes: tr.notes || '' });
                                    setConfirmDeleteId(null);
                                  }}
                                  className="flex-1 text-xs font-semibold py-2 rounded-xl bg-gray-100 text-gray-700 border border-gray-200 active:scale-95 transition-all"
                                >✏️ Editar</button>
                                <button
                                  disabled={saving}
                                  onClick={async () => {
                                    if (confirmDeleteId !== tr.id) {
                                      setConfirmDeleteId(tr.id);
                                      return;
                                    }
                                    const ok = await apiCallDelete(tr.id);
                                    if (ok) { setExpandedId(null); setConfirmDeleteId(null); showToast('Tratamento encerrado'); }
                                  }}
                                  className={`flex-1 text-xs font-semibold py-2 rounded-xl border active:scale-95 transition-all disabled:opacity-40 ${
                                    confirmDeleteId === tr.id
                                      ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-red-50 text-red-600 border-red-200'
                                  }`}
                                >{saving ? '...' : confirmDeleteId === tr.id ? '⚠️ Confirmar encerramento' : '🛑 Encerrar'}</button>
                              </div>

                              {/* Inline edit form */}
                              {editingId === tr.id && (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Editar tratamento</p>
                                  <div>
                                    <label className="text-[11px] text-gray-500 font-medium">Nome</label>
                                    <input
                                      type="text"
                                      value={editForm.title}
                                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                      className="w-full mt-0.5 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                                      placeholder="Nome do medicamento"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] text-gray-500 font-medium">Dose</label>
                                    <input
                                      type="text"
                                      value={editForm.dosage}
                                      onChange={e => setEditForm(f => ({ ...f, dosage: e.target.value }))}
                                      className="w-full mt-0.5 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                                      placeholder="Ex: 1 comprimido, 5ml..."
                                    />
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={() => { setEditingId(null); }}
                                      className="flex-1 text-sm font-semibold py-2 rounded-xl bg-gray-100 text-gray-600 border border-gray-200 active:scale-95"
                                    >Cancelar</button>
                                    <button
                                      disabled={saving || !editForm.title.trim()}
                                      onClick={async () => {
                                        const extraDataBase = {
                                          treatment_days: tr.totalDoses,
                                          applied_dates: tr.appliedDates,
                                          skipped_dates: tr.skippedDates,
                                          dose_notes: tr.doseNotes,
                                          reminder_time: tr.reminderTime,
                                          dosage: editForm.dosage.trim() || undefined,
                                        };
                                        const ok = await apiCallPatch(tr.id, {
                                          title: editForm.title.trim(),
                                          notes: editForm.notes.trim() || null,
                                          extra_data: JSON.stringify(extraDataBase),
                                        });
                                        if (ok) { setEditingId(null); showToast('Tratamento atualizado'); }
                                      }}
                                      className="flex-[2] text-sm font-bold py-2 rounded-xl bg-purple-500 text-white active:scale-95 transition-all disabled:opacity-40"
                                    >{saving ? '...' : '✓ Salvar'}</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}

              {/* Simple medications */}
              {simpleMeds.length > 0 && (
                <div className={`grid gap-2 ${simpleMeds.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {simpleMeds.map(sm => (
                    <div key={sm.id} className={`rounded-xl border overflow-hidden ${sm.todayDone ? 'border-green-200 bg-green-50/40' : 'border-purple-200 bg-purple-50/40'}`}>
                      <div className="px-2.5 py-2 flex items-center gap-1.5">
                        <span className="text-sm">💊</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{sm.title}</p>
                          {sm.reminderTime && <p className="text-xs text-purple-500">🕐 {sm.reminderTime}</p>}
                        </div>
                        {sm.todayDone && <span className="text-green-500">✓</span>}
                      </div>
                      {sm.todayDone ? (
                        <button
                          disabled={saving}
                          onClick={async () => {
                            const ok = await apiCall(`/events/${sm.id}/remove-dose`, { date: todayStr });
                            if (ok) showToast('Dose removida');
                          }}
                          className="w-full text-xs font-semibold text-green-700 py-1.5 border-t border-green-200 bg-white/50 active:bg-red-50 transition-all"
                        >Desfazer</button>
                      ) : (
                        <button
                          disabled={saving}
                          onClick={async () => {
                            const ok = await apiCall(`/events/${sm.id}/apply-dose`, { date: todayStr });
                            if (ok) showToast(`${sm.title} — dose registrada`);
                          }}
                          className="w-full text-sm font-bold py-1.5 border-t border-purple-100 bg-purple-500 text-white active:scale-[0.98] transition-all disabled:opacity-40"
                        >{saving ? '...' : '✓ Confirmar hoje'}</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3 bg-gray-50 rounded-b-3xl">
              <button
                onClick={() => { setShowPanel(false); onOpenFullHistory(); }}
                className="w-full py-2.5 text-sm font-semibold text-purple-600 hover:text-purple-700 active:scale-95 transition-all"
              >
                Ver histórico completo →
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
