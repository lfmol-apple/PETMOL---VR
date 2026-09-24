'use client';

/**
 * Moderação de Fotografias — painel compacto (Mission Control). Toda foto
 * pública do app (perfil do pet, Pet Sumido, avistamento) passa pela IA
 * antes de virar pública; aqui é só a revisão humana do que a IA marcou
 * como pendente, mais o histórico de aprovadas/rejeitadas. Escrita
 * (aprovar/rejeitar) exige JWT de admin de verdade — a chave de operação
 * de só leitura nem lista fotos pendentes/rejeitadas (ver moderation/router.py).
 */
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth-token';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';
import { fmtSpDateTime } from '@/lib/analytics/spTime';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

const BASE = '/api/v1/admin/moderation';

interface Decision {
  id: string; context: string; entity_type: string | null; entity_id: string | null;
  uploader_user_id: string | null; status: 'approved' | 'rejected' | 'pending';
  ai_decision: string | null; ai_reason: string | null; ai_confidence: number | null;
  ai_species: string | null; ai_image_type: string | null; ai_is_main_subject: boolean | null;
  ai_unavailable: boolean; reviewed_by_admin_id: string | null; reviewed_at: string | null;
  review_note: string | null; has_image: boolean; photo_key: string | null; image_note: string | null; created_at: string;
}
interface Summary { approved: number; rejected: number; pending: number; total: number }
interface ListResponse { total: number; items: Decision[] }

const CONTEXT_LABEL: Record<string, string> = {
  pet_profile: 'Perfil do pet', missing_pet_alert: 'Pet Sumido', pet_sighting: 'Avistamento/achador',
};

async function moderationFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function DecisionImage({ decisionId }: { decisionId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getToken();
    fetch(`${BASE}/${decisionId}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [decisionId]);

  if (failed) return <div className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-400">Sem imagem</div>;
  if (!src) return <div className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-400">Carregando…</div>;
  // eslint-disable-next-line @next/next/no-img-element -- vem de blob: URL autenticada, não de storage remoto
  return <img src={src} alt="Foto em revisão" className="h-40 w-full rounded-lg object-cover" />;
}

function DecisionCard({ d, onChanged }: { d: Decision; onChanged: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action); setErr(null);
    try {
      await moderationFetch(`/${d.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      onChanged();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        {d.has_image ? <DecisionImage decisionId={d.id} /> : d.photo_key ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pública aprovada (mesma URL do resto do app)
          <img src={resolvePetPhotoUrl(d.photo_key) || ''} alt="Foto aprovada" className="h-40 w-full rounded-lg object-cover bg-slate-100" />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 p-2 text-center text-[10px] leading-snug text-slate-400">
            {d.image_note || (d.status === 'approved' ? 'Foto removida (não está mais pública)' : 'Sem imagem')}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
              {CONTEXT_LABEL[d.context] || d.context}
            </span>
            {d.ai_species && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{d.ai_species}</span>}
            {d.ai_unavailable && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">IA indisponível</span>}
          </div>
          <p className="text-[12px] text-slate-700">{d.ai_reason || '—'}</p>
          <p className="text-[11px] text-slate-400">
            Confiança: {d.ai_confidence != null ? `${Math.round(d.ai_confidence * 100)}%` : '—'}
            {d.ai_image_type ? ` · tipo: ${d.ai_image_type}` : ''}
          </p>
          <p className="text-[10px] text-slate-400">{fmtSpDateTime(d.created_at)}</p>
          {d.status === 'pending' && (
            <div className="mt-1.5 flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => act('approve')}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
                {busy === 'approve' ? 'Aprovando…' : 'Aprovar'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => act('reject')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50">
                {busy === 'reject' ? 'Rejeitando…' : 'Rejeitar'}
              </button>
            </div>
          )}
          {d.status !== 'pending' && (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              {d.status === 'approved' ? '✅ Aprovada' : '🚫 Rejeitada'}
              {d.reviewed_by_admin_id ? ' (revisão manual)' : ' (decisão da IA)'}
            </p>
          )}
          {err && <p className="mt-1 text-[11px] text-rose-600">Erro: {err}</p>}
        </div>
      </div>
    </div>
  );
}

export function ModerationSection() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'rejected' | 'approved'>('pending');
  const [refreshKey, setRefreshKey] = useState(0);

  const summary = useAsync<Summary>(() => moderationFetch('/summary'), [refreshKey]);
  const list = useAsync<ListResponse>(
    () => moderationFetch(`?status=${statusFilter}&limit=30`), [statusFilter, refreshKey],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <button type="button" onClick={() => setStatusFilter('pending')}
          className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-md ${statusFilter === 'pending' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-[11px] font-bold uppercase text-amber-700">Aguardando revisão</div>
          <div className="text-2xl font-black text-amber-900">{summary.data ? numberFmt(summary.data.pending) : '—'}</div>
        </button>
        <button type="button" onClick={() => setStatusFilter('approved')}
          className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-md ${statusFilter === 'approved' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-[11px] font-bold uppercase text-emerald-700">Aprovadas</div>
          <div className="text-2xl font-black text-emerald-900">{summary.data ? numberFmt(summary.data.approved) : '—'}</div>
        </button>
        <button type="button" onClick={() => setStatusFilter('rejected')}
          className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-md ${statusFilter === 'rejected' ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-[11px] font-bold uppercase text-rose-700">Rejeitadas</div>
          <div className="text-2xl font-black text-rose-900">{summary.data ? numberFmt(summary.data.rejected) : '—'}</div>
        </button>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Total moderado</div>
          <div className="text-2xl font-black text-slate-900">{summary.data ? numberFmt(summary.data.total) : '—'}</div>
        </div>
      </div>

      <Panel title={`Fotos — ${statusFilter === 'pending' ? 'aguardando revisão' : statusFilter === 'approved' ? 'aprovadas' : 'rejeitadas'}`}>
        {list.loading ? <Loading /> : list.error ? <ErrorBox msg={list.error} /> : (
          <div className="space-y-2">
            {list.data && list.data.items.length === 0 && (
              <p className="text-[13px] text-slate-400">Nenhuma foto nesse status agora.</p>
            )}
            {list.data?.items.map((d) => (
              <DecisionCard key={d.id} d={d} onChanged={() => setRefreshKey((k) => k + 1)} />
            ))}
          </div>
        )}
      </Panel>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
        Toda fotografia pública do app (perfil do pet, Pet Sumido, avistamento) passa por classificação de IA antes
        de publicar. Aprovadas mostram a foto publicada; recusadas por &quot;não é um pet&quot; ficam guardadas em
        área privada por 30 dias, só pra você conferir a decisão da IA (recusadas por conteúdo sensível nunca são
        guardadas). Aprovar/rejeitar exige login de admin de verdade (não a chave de operação).
      </p>
    </div>
  );
}
