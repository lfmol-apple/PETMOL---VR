'use client';

import { useState, useEffect } from 'react';
import { Check, Home, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { ParasiteControl } from '@/lib/types/home';
import { trackV1Metric } from '@/lib/v1Metrics';
import { MonetizedOffersList } from '@/features/commerce/MonetizedOffersList';
import { AffiliateCatalogSearch } from '@/features/commerce/AffiliateCatalogSearch';
import { SheetAvatar, SheetHeader, SheetShell } from '@/components/ui/sheet';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { scheduleUniqueReminder, buildRemindAt } from '@/features/notifications/pushService';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import type { ProductCategory, ScannedProduct } from '@/lib/productScanner';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

// ── Config por tipo ──────────────────────────────────────────────────────────
const CONFIG = {
  dewormer: {
    title: 'Vermífugo',
    icon: '🪱',
    why: 'Vermes são comuns e nem sempre dão sintoma. Com a data da última dose, o PETMOL lembra da próxima na hora certa.',
    ctaLabel: 'Aplicar agora',
    buyLabel: 'Comprar Vermífugo',
    defaultFrequency: 90,
    applicationForm: 'oral' as const,
    productHint: 'Ex: Drontal, Milbemax, Verm-X',
    colorBtn: 'bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200',
    colorAccent: 'text-emerald-700',
    colorLight: 'bg-emerald-50',
    colorBorder: 'border-emerald-200',
    colorRing: 'focus:ring-emerald-300',
  },
  flea_tick: {
    title: 'Antipulgas / Carrapatos',
    icon: '🛡️',
    why: 'Pulgas e carrapatos transmitem doenças. Registrando a proteção atual, o PETMOL avisa quando estiver na hora de reaplicar.',
    ctaLabel: 'Aplicar agora',
    buyLabel: 'Comprar Antipulgas',
    defaultFrequency: 30,
    applicationForm: 'topical' as const,
    productHint: 'Ex: Bravecto, Nexgard, Simparica',
    colorBtn: 'bg-orange-50 hover:bg-orange-100 active:bg-orange-200 text-orange-800 border border-orange-200',
    colorAccent: 'text-orange-700',
    colorLight: 'bg-orange-50',
    colorBorder: 'border-orange-200',
    colorRing: 'focus:ring-orange-300',
  },
  collar: {
    title: 'Coleira Antiparasitária',
    icon: '📿',
    why: 'A coleira protege por meses contra pulgas, carrapatos e o mosquito da leishmaniose. Com a data de troca, o PETMOL avisa antes de vencer.',
    ctaLabel: 'Troquei hoje',
    buyLabel: 'Comprar Coleira',
    defaultFrequency: 120,
    applicationForm: 'collar' as const,
    productHint: 'Ex: Seresto, Scalibor, Foresto',
    colorBtn: 'bg-violet-50 hover:bg-violet-100 active:bg-violet-200 text-violet-800 border border-violet-200',
    colorAccent: 'text-violet-700',
    colorLight: 'bg-violet-50',
    colorBorder: 'border-violet-200',
    colorRing: 'focus:ring-violet-300',
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateToLocalISO(dt);
}

function diffDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtCurrency(v?: number | null): string | null {
  return v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : null;
}

function getNextDate(ctrl: ParasiteControl): string | null {
  return ctrl.collar_expiry_date || ctrl.next_due_date || null;
}

function hasLaterParasiteRecord(records: ParasiteControl[], record: ParasiteControl): boolean {
  const recordTime = new Date(record.date_applied).getTime();
  return records.some((candidate) => {
    if (candidate.id === record.id) return false;
    const candidateTime = new Date(candidate.date_applied).getTime();
    return !Number.isNaN(candidateTime) && (Number.isNaN(recordTime) || candidateTime > recordTime);
  });
}

function computeStatus(nextDate?: string | null) {
  const diff = diffDays(nextDate);
  if (diff === null) return { label: 'Sem dados', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', isOverdue: false, overdueDays: 0 };
  if (diff < 0) {
    const days = Math.abs(diff);
    const label = days > 90 ? 'REVISÃO RECOMENDADA' : `ATRASADO ${days} dia${days !== 1 ? 's' : ''}`;
    return { label, bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', isOverdue: true, overdueDays: days };
  }
  if (diff === 0)    return { label: 'HOJE', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', isOverdue: false, overdueDays: 0 };
  if (diff <= 7)     return { label: 'EM BREVE', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', isOverdue: false, overdueDays: 0 };
  if (diff <= 14)    return { label: `Em ${diff} dias`, bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500', isOverdue: false, overdueDays: 0 };
  return { label: `Em ${diff} dias`, bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', isOverdue: false, overdueDays: 0 };
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ParasiteItemSheetProps {
  type: 'dewormer' | 'flea_tick' | 'collar';
  petId: string;
  petName?: string;
  petSpecies?: string;
  petPhotoUrl?: string | null;
  /** Controls already filtered by this.type, passed from parent */
  parasiteControls: ParasiteControl[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onGoHome?: () => void;
  initialMode?: 'view' | 'buy';
}

type ViewMode = 'view' | 'apply' | 'edit' | 'buy';

// ── Component ────────────────────────────────────────────────────────────────
export function ParasiteItemSheet({
  type,
  petId,
  petName,
  petSpecies,
  petPhotoUrl,
  parasiteControls,
  onClose,
  onRefresh,
  onGoHome,
  initialMode,
}: ParasiteItemSheetProps) {
  const cfg = CONFIG[type];
  const petPhotoSrc = resolvePetPhotoUrl(petPhotoUrl);
  const [mode, setMode] = useState<ViewMode>(initialMode === 'buy' ? 'buy' : 'view');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Formulário manual fica escondido até o tutor escanear com sucesso,
  // dispensar o scanner, ou escolher preencher na mão — scan é o caminho
  // feliz, não só uma opção ao lado de um form já visível.
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    void onRefresh();
    // onRefresh is intentionally excluded to avoid effect loops when parent recreates callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, type]);

  // Sorted most-recent-first
  const sorted = [...parasiteControls].sort(
    (a, b) => new Date(b.date_applied).getTime() - new Date(a.date_applied).getTime(),
  );
  const current = sorted[0] ?? null;
  const nextDate = current ? getNextDate(current) : null;
  const status = computeStatus(nextDate);

  // ── Apply form ────────────────────────────────────────────────────────────
  const [applyForm, setApplyForm] = useState({
    date: localTodayISO(),
    product_name: '',
    cost: '',
    notes: '',
    frequency_days: String(cfg.defaultFrequency),
    reminder_days: '3',
    reminder_time: '09:00',
    barcode: '',
  });

  useEffect(() => {
    if (mode === 'apply') {
      setShowManualForm(false);
      setApplyForm({
        date: localTodayISO(),
        product_name: current?.product_name ?? '',
        cost: '',
        notes: '',
        frequency_days: String(cfg.defaultFrequency),
        reminder_days: String((current as unknown as Record<string, unknown> | null)?.alert_days_before ?? 3),
        reminder_time: String((current as unknown as Record<string, unknown> | null)?.reminder_time ?? '09:00'),
        barcode: '',
      });
    }
  }, [mode, current, cfg.defaultFrequency]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState<ParasiteControl | null>(null);
  const [editForm, setEditForm] = useState({
    date_applied: '',
    product_name: '',
    cost: '',
    notes: '',
    barcode: '',
    next_due_date: '',
    collar_expiry_date: '',
    frequency_days: String(cfg.defaultFrequency),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function expectedCategoryForType(): ProductCategory {
    if (type === 'dewormer') return 'dewormer';
    if (type === 'collar') return 'collar';
    return 'antiparasite';
  }

  function applyScannedProduct(product: ScannedProduct) {
    setApplyForm(f => ({
      ...f,
      product_name: [product.brand, product.name].filter(Boolean).join(' ').trim() || f.product_name,
      notes: [
        f.notes,
        product.barcode ? `Código de barras: ${product.barcode}` : '',
        product.category ? `Categoria: ${product.category}` : '',
      ].filter(Boolean).join('\n'),
      // Campo estruturado — permite resolver oferta comercial por GTIN
      // exato (AwinFeedProvider), além do texto livre em `notes` acima
      // (mantido por retrocompatibilidade/legibilidade humana).
      barcode: product.barcode || f.barcode,
    }));
    if (!product.found) showToast('Não encontramos os dados. Preencha manualmente.');
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('petmol_pending_scanned_product');
      if (!raw) return;
      const payload = JSON.parse(raw) as { petId?: string; product?: ScannedProduct };
      const product = payload.product;
      if (!product || payload.petId !== petId) return;
      const expected = expectedCategoryForType();
      const matches =
        product.category === expected ||
        (type === 'flea_tick' && product.category === 'antiparasite');
      if (!matches) return;
      setMode('apply');
      applyScannedProduct(product);
      setShowManualForm(true);
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
  }, [petId, type]);

  async function handleApply() {
    if (!applyForm.date || !applyForm.product_name.trim()) {
      showToast('⚠️ Preencha data e produto.');
      return;
    }
    setSaving(true);
    try {
      const token = getToken();
      if (!token) { showToast('⚠️ Sessão expirada. Faça login novamente.'); return; }

      const freq = parseInt(applyForm.frequency_days, 10) || cfg.defaultFrequency;
      const computedNext = addDays(applyForm.date, freq);
      const payload = {
        type,
        product_name: applyForm.product_name.trim(),
        date_applied: applyForm.date,
        frequency_days: freq,
        next_due_date: type !== 'collar' ? computedNext : null,
        collar_expiry_date: type === 'collar' ? computedNext : null,
        cost: applyForm.cost ? parseFloat(applyForm.cost) : null,
        notes: applyForm.notes || null,
        application_form: cfg.applicationForm,
        reminder_enabled: true,
        alert_days_before: parseInt(applyForm.reminder_days) || 3,
        reminder_time: applyForm.reminder_time || '09:00',
        barcode: applyForm.barcode || null,
      };

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (type === 'dewormer') {
          trackV1Metric('worm_control_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
          });
          trackV1Metric('worm_control_applied', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.next_due_date,
          });
        }
        if (type === 'flea_tick') {
          trackV1Metric('flea_control_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
          });
          trackV1Metric('flea_control_applied', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.next_due_date,
          });
        }
        if (type === 'collar') {
          trackV1Metric(current ? 'collar_replaced' : 'collar_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.collar_expiry_date,
          });
        }

        const pushType = (type === 'flea_tick' ? 'flea' : type) as 'dewormer' | 'flea' | 'collar';
        void scheduleUniqueReminder(
          { pet_id: petId, type: pushType, title: `${cfg.icon} ${cfg.title}`, body: `Hora de comprar ${applyForm.product_name} para ${petName || 'seu pet'}. Verifique o estoque!`, remind_at: buildRemindAt(addDays(computedNext, -(parseInt(applyForm.reminder_days) || 3)), applyForm.reminder_time) },
          token!,
          false
        );
        setMode('view');
        // Track product usage for recurring product suggestions
        try {
          const usageKey = `petmol_product_usage_${petId}_${type}`;
          const existing = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
          const name = applyForm.product_name.trim();
          if (name) {
            const found = existing.find(item => item.name.toLowerCase() === name.toLowerCase());
            if (found) { found.count += 1; found.lastUsed = applyForm.date; }
            else existing.push({ name, count: 1, lastUsed: applyForm.date });
            existing.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
            localStorage.setItem(usageKey, JSON.stringify(existing));
          }
        } catch { /* silent */ }
        await onRefresh();
        setJustSaved(true);
      } else {
        showToast('❌ Erro ao salvar. Tente novamente.');
      }
    } catch {
      showToast('❌ Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(rec: ParasiteControl) {
    setEditRecord(rec);
    setEditForm({
      date_applied: rec.date_applied,
      product_name: rec.product_name,
      cost: rec.cost != null ? String(rec.cost) : '',
      notes: rec.notes || '',
      barcode: rec.barcode || '',
      next_due_date: rec.next_due_date || '',
      collar_expiry_date: rec.collar_expiry_date || '',
      frequency_days: String(rec.frequency_days ?? cfg.defaultFrequency),
      reminder_days: String((rec as unknown as Record<string, unknown>).alert_days_before ?? 3),
      reminder_time: String((rec as unknown as Record<string, unknown>).reminder_time ?? '09:00'),
    });
    setMode('edit');
  }

  async function handleSaveEdit() {
    if (!editRecord || !editForm.date_applied || !editForm.product_name.trim()) {
      showToast('⚠️ Preencha data e produto.');
      return;
    }
    setSaving(true);
    try {
      const token = getToken();
      if (!token) {
        showToast('⚠️ Sessão expirada. Faça login novamente.');
        return;
      }
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date_applied: editForm.date_applied,
          product_name: editForm.product_name.trim(),
          cost: editForm.cost ? parseFloat(editForm.cost) : null,
          notes: editForm.notes || null,
          frequency_days: parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency,
          next_due_date: type !== 'collar' ? addDays(editForm.date_applied, parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency) : null,
          collar_expiry_date: type === 'collar' ? addDays(editForm.date_applied, parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency) : null,
          reminder_enabled: true,
          alert_days_before: parseInt(editForm.reminder_days) || 3,
          reminder_time: editForm.reminder_time || '09:00',
          barcode: editForm.barcode || editRecord.barcode || null,
        }),
      });
      if (res.ok) {
        showToast('✅ Registro atualizado!');
        const nextDue = addDays(editForm.date_applied, parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency);
        const pushType = (type === 'flea_tick' ? 'flea' : type) as 'dewormer' | 'flea' | 'collar';
        void scheduleUniqueReminder(
          { pet_id: petId, type: pushType, title: `${cfg.icon} ${cfg.title}`, body: `Hora de comprar ${editForm.product_name} para ${petName || 'seu pet'}. Verifique o estoque!`, remind_at: buildRemindAt(addDays(nextDue, -(parseInt(editForm.reminder_days) || 3)), editForm.reminder_time) },
          token!,
          false
        );
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
    setSaving(true);
    try {
      const token = getToken();
      if (!token) {
        showToast('⚠️ Sessão expirada. Faça login novamente.');
        return;
      }
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${id}`, {
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
    } catch {
      showToast('❌ Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const inputCls = `w-full min-w-0 prime-input text-gray-800 ${cfg.colorRing}`;
  const labelCls = 'block text-[10px] font-black text-gray-400 uppercase tracking-[0.16em] mb-1.5 ml-1';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SheetShell open onClose={onClose} tone="cream" z={50}>
      {/* Success overlay */}
      {justSaved && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#fbfaf7] p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="mb-1 text-xl font-bold text-slate-900">{cfg.title} registrado!</h3>
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
        tone="cream"
        title={cfg.title}
        subtitle={petName || undefined}
        status={{
          label: status.label.charAt(0) + status.label.slice(1).toLowerCase(),
          tone: status.dot === 'bg-rose-500' ? 'danger' : status.dot === 'bg-amber-500' ? 'warn' : status.dot === 'bg-emerald-500' ? 'good' : 'neutral',
        }}
        media={<SheetAvatar src={petPhotoSrc} alt={petName || 'Pet'} fallback={petSpecies === 'cat' ? '🐱' : '🐶'} />}
        onClose={onClose}
        onBack={mode !== 'view' ? () => { setMode('view'); setEditRecord(null); } : undefined}
        action={mode === 'edit' && editRecord ? (
          <button
            type="button"
            onClick={() => setConfirmDeleteId(editRecord.id)}
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
          {mode === 'view' && (
            <p className="mx-4 mt-2 mb-0 text-[11.5px] font-medium text-slate-500 text-center">ℹ️ Gerenciamento e controle apenas — consulte seu veterinário.</p>
          )}

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="px-5 pt-3 pb-5 space-y-2.5">

              {/* Active product card */}
              {current && (() => {
                const urgentBorder =
                  status.dot === 'bg-rose-500' ? 'border-rose-200 bg-rose-50' :
                  status.dot === 'bg-amber-500' ? 'border-amber-200 bg-amber-50' :
                  status.dot === 'bg-yellow-500' ? 'border-yellow-200 bg-yellow-50' :
                  `${cfg.colorBorder} ${cfg.colorLight}`;
                const statusPill =
                  status.dot === 'bg-rose-500' ? 'bg-rose-100 text-rose-700' :
                  status.dot === 'bg-amber-500' ? 'bg-amber-100 text-amber-700' :
                  status.dot === 'bg-yellow-500' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-emerald-100 text-emerald-700';
                return (
                  <div className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border ${urgentBorder}`}>
                    <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center text-base flex-shrink-0">
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produto atual</p>
                      <p className={`text-[13px] font-bold ${cfg.colorAccent} leading-tight break-words`}>{current.product_name}</p>
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Aplicado {fmtDate(current.date_applied)}
                      </p>
                      <p className="text-[11px] leading-tight text-gray-500">
                        {nextDate
                          ? status.isOverdue
                            ? <>
                                <span className="font-semibold text-rose-700">Era para aplicar em {fmtDate(nextDate)}</span>
                                {status.overdueDays <= 90 && <> · <span className="text-rose-600">atrasado há {status.overdueDays} dia{status.overdueDays !== 1 ? 's' : ''}</span></>}
                              </>
                            : <>Próxima {type === 'collar' ? 'troca' : 'aplicação'} <span className={`font-semibold ${status.text}`}>· {fmtDate(nextDate)}</span></>
                          : 'Sem próxima data definida'}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${statusPill}`}>{status.label}</span>
                  </div>
                );
              })()}

              {/* Empty state — responde o que é, por que preencher e o que fazer */}
              {!current && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 text-center">
                  <p className="text-4xl mb-3">{cfg.icon}</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {petName ? `${petName} usa proteção contra ` : 'Proteção contra '}
                    {type === 'dewormer' ? 'vermes?' : type === 'collar' ? 'parasitas com coleira?' : 'pulgas e carrapatos?'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">{cfg.why}</p>
                  <p className="text-[11px] font-semibold text-gray-400 mt-3">Registre a última aplicação abaixo.</p>
                </div>
              )}

              {/* Registrar / Editar — logo abaixo do produto atual (ou do estado vazio), coloridos por tipo */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('apply')}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${cfg.colorBtn}`}
                >
                  <span>✅</span>
                  Registrar
                </button>
                {current && (
                  <button
                    onClick={() => startEdit(current)}
                    className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold active:scale-[0.98] transition-all ${cfg.colorBtn}`}
                  >
                    Editar
                  </button>
                )}
              </div>

              {/* History — collapsed accordion */}
              {sorted.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50"
                    onClick={() => { setHistoryExpanded(h => !h); setHistoryShowAll(false); }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Histórico</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">{sorted.length}</span>
                    </div>
                    <span className="text-gray-400 text-sm">{historyExpanded ? '▲' : '▼'}</span>
                  </button>

                  {historyExpanded && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100">
                      {(historyShowAll ? sorted : sorted.slice(0, 2)).map((rec, i) => (
                        (() => {
                          const isHistory = hasLaterParasiteRecord(sorted, rec);
                          return (
                        <div
                          key={rec.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${!isHistory ? cfg.colorLight : 'bg-gray-100'}`}>
                            {!isHistory ? cfg.icon : '·'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800 truncate">{rec.product_name}</p>
                              {!isHistory && diffDays(getNextDate(rec)) !== null && diffDays(getNextDate(rec))! < 0 && (
                                <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-white/50 flex-shrink-0">
                                  !
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {fmtDate(rec.date_applied)}
                              {rec.cost != null ? ` · ${fmtCurrency(rec.cost)}` : ''}
                              {getNextDate(rec) ? ` · até ${fmtDate(getNextDate(rec))}` : ''}
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
                        })()
                      ))}
                      {!historyShowAll && sorted.length > 2 && (
                        <button
                          onClick={() => setHistoryShowAll(true)}
                          className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-50"
                        >
                          Ver todos ({sorted.length - 2} restantes)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── APPLY FORM ────────────────────────────────────────────────── */}
          {mode === 'apply' && (
            <div className="px-4 pt-2 pb-4 space-y-3">
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">{cfg.ctaLabel}</h3>

              {!showManualForm && (
                <div className={`rounded-2xl border p-4 space-y-3 ${cfg.colorBorder} ${cfg.colorLight}`}>
                  <div>
                    <h3 className="text-[18px] font-black text-gray-900 leading-tight">Identifique o produto</h3>
                    <p className="text-[13px] text-gray-600 mt-1">Busque pelo nome ou marca — código de barras também funciona, se preferir.</p>
                  </div>
                  <ProductBarcodeScanner
                    label="Escanear código de barras"
                    expectedCategory={expectedCategoryForType()}
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
                    <label className={labelCls}>Data *</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={applyForm.date}
                      onChange={e => setApplyForm(f => ({
                        ...f,
                        date: e.target.value,
                      }))}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Produto *</label>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder={cfg.productHint}
                      value={applyForm.product_name}
                      onChange={e => setApplyForm(f => ({ ...f, product_name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Repetir a cada (dias)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      className={inputCls}
                      value={applyForm.frequency_days}
                      onChange={e => setApplyForm(f => ({ ...f, frequency_days: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">Recomendado: {cfg.defaultFrequency} dias</p>
                  </div>

                  <div>
                    <label className={labelCls}>Valor pago (opcional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputCls}
                      placeholder="Ex: 89,90"
                      value={applyForm.cost}
                      onChange={e => setApplyForm(f => ({ ...f, cost: e.target.value }))}
                    />
                  </div>

                  <ReminderPicker
                    days={applyForm.reminder_days}
                    time={applyForm.reminder_time}
                    onDaysChange={v => setApplyForm(f => ({ ...f, reminder_days: v }))}
                    onTimeChange={v => setApplyForm(f => ({ ...f, reminder_time: v }))}
                  />

                  <button
                    onClick={handleApply}
                    disabled={saving || !applyForm.date || !applyForm.product_name.trim()}
                    className={`w-full py-4 rounded-2xl text-[15px] font-bold shadow-sm disabled:opacity-50 ${cfg.colorBtn}`}
                  >
                    {saving ? 'Salvando...' : '✅ Confirmar registro'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
          {mode === 'edit' && editRecord && (
            <div className="px-4 pt-2 pb-4 space-y-3">
              <h3 className="text-[16px] font-bold text-gray-900">Editar registro</h3>

              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <label className={labelCls}>Data</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={editForm.date_applied}
                    onChange={e => setEditForm(f => ({ ...f, date_applied: e.target.value }))}
                  />
                </div>
                <div className="w-[92px] flex-shrink-0">
                  <label className={labelCls}>A cada (dias)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="365"
                    className={`${inputCls} text-center`}
                    value={editForm.frequency_days}
                    onChange={e => setEditForm(f => ({ ...f, frequency_days: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Produto</label>
                <input
                  type="text"
                  className={inputCls}
                  value={editForm.product_name}
                  onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor pago</label>
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
                className={`w-full py-3.5 rounded-2xl text-[15px] font-bold shadow-sm disabled:opacity-50 ${cfg.colorBtn}`}
              >
                {saving ? 'Salvando...' : '✅ Salvar alterações'}
              </button>
            </div>
          )}

          {/* ── BUY MODE ──────────────────────────────────────────────────── */}
          {mode === 'buy' && (
            <div className="px-4 pt-2 pb-4 space-y-3">
              <button
                type="button"
                onClick={() => setMode('view')}
                onTouchEnd={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>

              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[20px] leading-none">🛍️</span>
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">Compras Pet</h3>
                  <p className="text-xs text-gray-500">Buscando oferta…</p>
                </div>
              </div>

              {current?.product_name || current?.barcode ? (
                <MonetizedOffersList
                  query={
                    current?.product_name
                      ? current.product_name
                      : type === 'dewormer'
                        ? 'vermífugo cão'
                        : type === 'collar'
                          ? 'coleira antipulgas cão'
                          : 'antipulgas cão'
                  }
                  gtin={current?.barcode}
                  petId={petId}
                  productLabel={current?.product_name || cfg.title}
                  icon={cfg.icon}
                  source="parasite_sheet"
                  ctaType="parasite_buy_direct"
                  controlType={type}
                />
              ) : (
                <AffiliateCatalogSearch
                  petId={petId}
                />
              )}

              <button
                onClick={() => setMode('apply')}
                className={`w-full py-3 rounded-xl text-sm font-semibold shadow-sm ${cfg.colorBtn}`}
              >
                ✅ Já comprei — registrar aplicação
              </button>
            </div>
          )}

        </div>
        {/* End scrollable body */}

        {/* ── Pinned action footer (view mode only) ─────────────────────────── */}
        {mode === 'view' && (
          <div className="flex-shrink-0 px-5 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-gray-100 bg-white">
            <button
              onClick={() => setMode('buy')}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[15px] font-black shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
            >
              <span>🛒</span>
              {cfg.buyLabel}
            </button>
          </div>
        )}

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
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </SheetShell>
  );
}
