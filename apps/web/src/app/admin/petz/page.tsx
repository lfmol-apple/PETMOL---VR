'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { useAdmin } from '@/hooks/useAdmin';

/**
 * Casamento assistido produto PETMOL ↔ Petz.
 *
 * A identidade vem da Cobasi (loja irmã, maior cobertura) já enriquecida no
 * catálogo. A Petz não tem deep link de produto e bloqueia busca
 * server-side (403 Akamai), então o humano abre a busca da Petz, acha o
 * produto certo, cola a URL e o backend pontua contra a identidade do
 * catálogo com o MESMO motor da guarda de identidade (structural_conflict).
 * Confirmado uma vez, vale pra todo tutor que tiver aquele produto.
 */

interface QueueItem {
  gtin: string;
  product_id: number;
  name: string;
  canonical_name: string | null;
  brand: string | null;
  weight_kg: number | null;
  pack_count: number | null;
  species: string | null;
  thumbnail_url: string | null;
  scans: number;
  match_status: string;
  rejection_reason: string | null;
  petz_search_url: string;
}

interface QueueResponse {
  total: number;
  limit: number;
  offset: number;
  only_cobasi: boolean;
  items: QueueItem[];
}

interface EvalResponse {
  verdict: 'match' | 'weak' | 'conflict' | 'invalid';
  reason: string | null;
  would_confirm: boolean;
  deslug_text: string | null;
  extracted_weight_kg: number | null;
  petz_product_id: string | null;
  catalog_weight_kg: number | null;
  cart_test_url: string | null;
  coupon_apply_url: string | null;
}

const VERDICT_UI: Record<EvalResponse['verdict'], { icon: string; label: string; cls: string }> = {
  match: { icon: '🟢', label: 'Casa com o produto do catálogo', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  weak: { icon: '🟡', label: 'Provável — confira o tamanho antes de confirmar', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  conflict: { icon: '🔴', label: 'Peso/tamanho diverge — é outro produto', cls: 'border-red-200 bg-red-50 text-red-800' },
  invalid: { icon: '⚠️', label: 'Não é uma URL de produto da Petz', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const STATUS_BADGE: Record<string, string> = {
  unknown: 'bg-slate-100 text-slate-600',
  candidate: 'bg-blue-100 text-blue-700',
  ambiguous: 'bg-amber-100 text-amber-800',
};

async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    window.location.href = '/home';
    throw new Error('Sem sessão');
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/home';
      throw new Error('Sessão expirada');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Erro ${res.status}`);
  }
  return res.json();
}

function fmtWeight(kg: number | null): string {
  if (kg == null) return '—';
  return `${(`${kg}`).replace('.', ',')} kg`;
}

export default function AdminPetzMatchPage() {
  const router = useRouter();
  const { isAdmin, isLoading: adminLoading } = useAdmin();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [onlyCobasi, setOnlyCobasi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGtin, setOpenGtin] = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace('/home');
  }, [adminLoading, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<QueueResponse>(`/v1/admin/petz/queue?only_cobasi=${onlyCobasi}&limit=100`);
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar a fila');
    } finally {
      setLoading(false);
    }
  }, [onlyCobasi]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const removeRow = (gtin: string) => {
    setItems((prev) => prev.filter((i) => i.gtin !== gtin));
    setTotal((t) => Math.max(0, t - 1));
    setOpenGtin(null);
  };

  if (adminLoading || !isAdmin) return null;

  return (
    <PremiumScreenShell
      title="Casamento Petz"
      subtitle="Identidade ancorada na Cobasi · confirme o produto certo na Petz"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 pb-24">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700 leading-relaxed">
          A Cobasi tem a maior cobertura e é loja irmã da Petz. Aqui você casa cada
          produto com a página certa da Petz — <b>no tamanho certo</b>. Feito uma
          vez, vale pra todo tutor que tiver o produto. Só volta pra fila se a Petz
          mudar a página.
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {loading ? 'Carregando…' : `${total} produto${total === 1 ? '' : 's'} na fila`}
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={onlyCobasi}
              onChange={(e) => setOnlyCobasi(e.target.checked)}
              className="h-4 w-4"
            />
            só produtos da Cobasi
          </label>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {!loading && items.length === 0 && !error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nada esperando. 🎉
          </div>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <QueueRow
              key={item.gtin}
              item={item}
              open={openGtin === item.gtin}
              onToggle={() => setOpenGtin((g) => (g === item.gtin ? null : item.gtin))}
              onDone={() => removeRow(item.gtin)}
            />
          ))}
        </div>
      </div>
    </PremiumScreenShell>
  );
}

function QueueRow({
  item,
  open,
  onToggle,
  onDone,
}: {
  item: QueueItem;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const runEval = async () => {
    if (!url.trim()) return;
    try {
      setEvaluating(true);
      setRowError(null);
      setResult(null);
      const r = await api<EvalResponse>(`/v1/admin/petz/products/${item.gtin}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({ product_url: url.trim() }),
      });
      setResult(r);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Erro ao avaliar');
    } finally {
      setEvaluating(false);
    }
  };

  const confirm = async () => {
    if (!result?.petz_product_id) {
      setRowError('A URL não tem o id numérico do produto Petz no fim — confira o link.');
      return;
    }
    try {
      setBusy(true);
      setRowError(null);
      await api(`/v1/admin/petz/products/${item.gtin}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          petz_product_id: result.petz_product_id,
          product_url: url.trim(),
          variant_label: result.extracted_weight_kg ? fmtWeight(result.extracted_weight_kg) : null,
          variant_weight_kg: result.extracted_weight_kg,
          match_confidence: result.verdict === 'match' ? 0.95 : 0.7,
        }),
      });
      onDone();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Erro ao confirmar');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    try {
      setBusy(true);
      setRowError(null);
      await api(`/v1/admin/petz/products/${item.gtin}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Sem produto equivalente na Petz' }),
      });
      onDone();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Erro ao marcar');
    } finally {
      setBusy(false);
    }
  };

  const v = result ? VERDICT_UI[result.verdict] : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left active:bg-slate-50"
      >
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-contain bg-slate-50 shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-slate-100 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{item.canonical_name || item.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {item.brand || '—'} · {fmtWeight(item.weight_kg)}
            {item.pack_count && item.pack_count > 1 ? ` · ${item.pack_count}un` : ''} · {item.scans} scans
          </p>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full shrink-0 ${STATUS_BADGE[item.match_status] || 'bg-slate-100 text-slate-600'}`}>
          {item.match_status}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3 space-y-3">
          <div className="text-xs text-slate-500 grid grid-cols-2 gap-1">
            <span>GTIN: <span className="font-mono text-slate-700">{item.gtin}</span></span>
            <span>Espécie: {item.species || '—'}</span>
          </div>

          {item.match_status === 'ambiguous' && item.rejection_reason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Marcado ambíguo: {item.rejection_reason}
            </div>
          )}

          <a
            href={item.petz_search_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl border border-[#0056D2] py-2.5 text-center text-sm font-semibold text-[#0056D2] active:opacity-80"
          >
            1. Abrir busca na Petz ↗
          </a>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">2. Colar a URL do produto da Petz</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.petz.com.br/produto/…-123456"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={runEval}
              disabled={evaluating || !url.trim()}
              className="w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {evaluating ? 'Avaliando…' : '3. Avaliar'}
            </button>
          </div>

          {rowError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{rowError}</div>
          )}

          {result && v && (
            <div className={`rounded-xl border p-3 text-sm space-y-2 ${v.cls}`}>
              <p className="font-semibold">{v.icon} {v.label}</p>
              {result.reason && <p className="text-xs opacity-90">{result.reason}</p>}
              <div className="text-xs opacity-90">
                Peso na URL: <b>{fmtWeight(result.extracted_weight_kg)}</b> · catálogo: <b>{fmtWeight(result.catalog_weight_kg)}</b>
                {result.petz_product_id ? <> · id Petz: <b>{result.petz_product_id}</b></> : ' · sem id numérico na URL'}
              </div>
              {result.cart_test_url && (
                <div className="text-xs">
                  <a href={result.coupon_apply_url || '#'} target="_blank" rel="noopener noreferrer" className="underline">aplicar cupom</a>
                  {' → '}
                  <a href={result.cart_test_url} target="_blank" rel="noopener noreferrer" className="underline">testar no carrinho ↗</a>
                </div>
              )}

              {result.would_confirm && result.verdict !== 'conflict' && (
                <button
                  onClick={confirm}
                  disabled={busy}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"
                >
                  {busy ? '…' : 'Confirmar casamento'}
                </button>
              )}
            </div>
          )}

          <button
            onClick={reject}
            disabled={busy}
            className="w-full rounded-xl border border-slate-300 py-2 text-xs font-medium text-slate-500 active:bg-slate-50 disabled:opacity-40"
          >
            Não achei na Petz / nenhum serve
          </button>
        </div>
      )}
    </div>
  );
}
