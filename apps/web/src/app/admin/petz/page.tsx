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
 * server-side (403 Akamai), então o humano lê a ficha da Cobasi, abre a
 * busca da Petz, acha o produto certo, cola a URL e o backend pontua com o
 * MESMO motor da guarda de identidade (structural_conflict). Confirmado
 * uma vez, vale pra todo tutor que tiver aquele produto.
 */

interface QueueItem {
  gtin: string;
  product_id: number;
  name: string;
  canonical_name: string | null;
  brand: string | null;
  weight_kg: number | null;
  volume_ml: number | null;
  pack_count: number | null;
  species: string | null;
  product_line: string | null;
  product_family: string | null;
  flavor: string | null;
  breed_size: string | null;
  animal_weight_min_kg: number | null;
  animal_weight_max_kg: number | null;
  thumbnail_url: string | null;
  scans: number;
  match_status: string;
  rejection_reason: string | null;
  needs_reverify: boolean;
  current_petz_product_id: string | null;
  current_petz_url: string | null;
  current_variant_label: string | null;
  petz_search_url: string;
  suggested_search_term: string;
  cobasi_title: string | null;
  cobasi_description: string | null;
  cobasi_category: string | null;
  cobasi_url: string | null;
  cobasi_image_url: string | null;
  cobasi_price: number | null;
}

interface QueueResponse {
  total: number;
  limit: number;
  offset: number;
  only_cobasi: boolean;
  catalog_total: number;
  matched: number;
  rejected: number;
  items: QueueItem[];
}

interface AttrCompare {
  attribute: string;
  catalog: string | null;
  petz: string | null;
  status: 'match' | 'conflict' | 'unknown';
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
  comparison: AttrCompare[];
}

const VERDICT_UI: Record<EvalResponse['verdict'], { icon: string; label: string; cls: string }> = {
  match: { icon: '🟢', label: 'Casa com o produto do catálogo — pode confirmar', cls: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  weak: { icon: '🟡', label: 'Provável — confira a tabela antes de confirmar', cls: 'border-amber-200 bg-amber-50 text-amber-900' },
  conflict: { icon: '🔴', label: 'Peso/tamanho diverge — é outro produto', cls: 'border-red-200 bg-red-50 text-red-900' },
  invalid: { icon: '⚠️', label: 'Não é uma URL de produto da Petz', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const STATUS_BADGE: Record<string, string> = {
  unknown: 'bg-slate-100 text-slate-600',
  candidate: 'bg-blue-100 text-blue-700',
  ambiguous: 'bg-amber-100 text-amber-800',
  reconferir: 'bg-red-100 text-red-700',
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

const fmtKg = (kg: number | null): string => (kg == null ? '—' : `${`${kg}`.replace('.', ',')} kg`);
const fmtBRL = (v: number | null): string =>
  v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminPetzMatchPage() {
  const router = useRouter();
  const { isAdmin, isLoading: adminLoading } = useAdmin();

  const [data, setData] = useState<QueueResponse | null>(null);
  const [onlyCobasi, setOnlyCobasi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGtin, setOpenGtin] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace('/home');
  }, [adminLoading, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api<QueueResponse>(`/v1/admin/petz/queue?only_cobasi=${onlyCobasi}&limit=100`);
      setData(d);
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
    setData((prev) =>
      prev
        ? { ...prev, total: Math.max(0, prev.total - 1), matched: prev.matched + 1, items: prev.items.filter((i) => i.gtin !== gtin) }
        : prev,
    );
    setOpenGtin(null);
  };
  const rejectRow = (gtin: string) => {
    setData((prev) =>
      prev
        ? { ...prev, total: Math.max(0, prev.total - 1), rejected: prev.rejected + 1, items: prev.items.filter((i) => i.gtin !== gtin) }
        : prev,
    );
    setOpenGtin(null);
  };

  if (adminLoading || !isAdmin) return null;

  const done = data ? data.matched + data.rejected : 0;
  const pct = data && data.catalog_total ? Math.round((done / data.catalog_total) * 100) : 0;

  return (
    <PremiumScreenShell
      title="Casamento Petz"
      subtitle="Identidade ancorada na Cobasi · leve o tutor ao produto certo na Petz"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 pb-24">
        {/* Como funciona */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50 overflow-hidden">
          <button
            onClick={() => setShowHelp((s) => !s)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="text-sm font-semibold text-slate-900">Como funciona {showHelp ? '▾' : '▸'}</span>
          </button>
          {showHelp && (
            <div className="px-4 pb-4 text-sm text-slate-700 leading-relaxed space-y-2">
              <p>A Cobasi tem a maior cobertura e é loja irmã da Petz. Aqui você casa cada produto com a página certa da Petz — <b>no tamanho certo</b>. Feito uma vez, vale pra todo tutor. Só volta pra fila se a Petz mudar a página.</p>
              <ol className="list-decimal list-inside space-y-1">
                <li><b>Leia a ficha da Cobasi</b> (título, descrição, peso, sabor…) — é a verdade do produto.</li>
                <li><b>Abra a busca da Petz</b> e ache o mesmo produto, no mesmo tamanho.</li>
                <li><b>Cole a URL</b> e clique em Avaliar. A tabela mostra Catálogo × Petz atributo por atributo.</li>
                <li><b>Confirme</b> se bate (🟢/🟡). Se não achou nada equivalente, marque “não achei”.</li>
              </ol>
              <p className="text-xs text-slate-500">
                🟢 casa · 🟡 provável, confira · 🔴 peso/tamanho diverge (é outro produto) · ⚠️ URL inválida
              </p>
            </div>
          )}
        </div>

        {/* Cobertura */}
        {data && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-900">{data.matched} de {data.catalog_total} casados</span>
              <span className="text-slate-500">{data.total} na fila · {data.rejected} sem Petz</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 pt-1">
              <input type="checkbox" checked={onlyCobasi} onChange={(e) => setOnlyCobasi(e.target.checked)} className="h-4 w-4" />
              só produtos que a Cobasi tem
            </label>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}

        {!loading && data && data.items.length === 0 && !error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nada esperando. 🎉
          </div>
        )}

        <div className="space-y-3">
          {data?.items.map((item) => (
            <QueueRow
              key={item.gtin}
              item={item}
              open={openGtin === item.gtin}
              onToggle={() => setOpenGtin((g) => (g === item.gtin ? null : item.gtin))}
              onConfirmed={() => removeRow(item.gtin)}
              onRejected={() => rejectRow(item.gtin)}
            />
          ))}
        </div>
      </div>
    </PremiumScreenShell>
  );
}

function Chip({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function QueueRow({
  item,
  open,
  onToggle,
  onConfirmed,
  onRejected,
}: {
  item: QueueItem;
  open: boolean;
  onToggle: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
}) {
  const [url, setUrl] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const img = item.thumbnail_url || item.cobasi_image_url;
  const petRange =
    item.animal_weight_min_kg != null || item.animal_weight_max_kg != null
      ? `${item.animal_weight_min_kg ?? '?'}–${item.animal_weight_max_kg ?? '?'} kg`
      : null;

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
          variant_label: result.extracted_weight_kg ? fmtKg(result.extracted_weight_kg) : null,
          variant_weight_kg: result.extracted_weight_kg,
          match_confidence: result.verdict === 'match' ? 0.95 : 0.7,
        }),
      });
      onConfirmed();
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
      onRejected();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Erro ao marcar');
    } finally {
      setBusy(false);
    }
  };

  const v = result ? VERDICT_UI[result.verdict] : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left active:bg-slate-50">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-12 w-12 rounded-lg object-contain bg-slate-50 shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-slate-100 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{item.canonical_name || item.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {item.brand || '—'} · {fmtKg(item.weight_kg)}
            {item.pack_count && item.pack_count > 1 ? ` · ${item.pack_count}un` : ''} · {item.scans} scans
          </p>
        </div>
        {(() => {
          const label = item.needs_reverify ? 'reconferir' : item.match_status;
          return (
            <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full shrink-0 ${STATUS_BADGE[label] || 'bg-slate-100 text-slate-600'}`}>
              {label}
            </span>
          );
        })()}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3 space-y-4">
          {item.needs_reverify && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 space-y-1">
              <p className="font-semibold">⚠️ Casamento automático — reconfira</p>
              <p>
                Aponta hoje pra Petz <b>{item.current_petz_product_id || '?'}</b>
                {item.current_variant_label ? ` (${item.current_variant_label})` : ''} — nunca foi conferido por um humano e pode estar no tamanho errado.
              </p>
              {item.current_petz_url && (
                <a href={item.current_petz_url} target="_blank" rel="noopener noreferrer" className="underline">abrir o que está mapeado ↗</a>
              )}
            </div>
          )}
          {item.match_status === 'ambiguous' && item.rejection_reason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Marcado ambíguo automaticamente: {item.rejection_reason}
            </div>
          )}

          {/* O que a Cobasi diz */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">O que a Cobasi diz</p>
            {item.cobasi_title ? (
              <>
                <p className="text-sm font-medium text-slate-800">{item.cobasi_title}</p>
                {item.cobasi_description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{item.cobasi_description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                  {item.cobasi_category && <span>{item.cobasi_category}</span>}
                  {item.cobasi_price != null && <span>· {fmtBRL(item.cobasi_price)}</span>}
                </div>
                {item.cobasi_url && (
                  <a href={item.cobasi_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold text-[#0056D2]">
                    Ver na Cobasi ↗
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">Sem ficha da Cobasi para este GTIN — use os atributos abaixo.</p>
            )}
          </div>

          {/* Atributos estruturais */}
          <div className="flex flex-wrap gap-1.5">
            <Chip label="peso" value={fmtKg(item.weight_kg)} />
            <Chip label="volume" value={item.volume_ml ? `${item.volume_ml} ml` : null} />
            <Chip label="unid." value={item.pack_count && item.pack_count > 1 ? item.pack_count : null} />
            <Chip label="sabor" value={item.flavor} />
            <Chip label="porte" value={item.breed_size} />
            <Chip label="pet" value={petRange} />
            <Chip label="espécie" value={item.species} />
            <Chip label="linha" value={item.product_line} />
            <Chip label="família" value={item.product_family} />
            <Chip label="GTIN" value={item.gtin} />
          </div>

          {/* Passo 1 */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-600">1. Ache este produto na Petz</p>
            <a
              href={item.petz_search_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl border border-[#0056D2] py-2.5 text-center text-sm font-semibold text-[#0056D2] active:opacity-80"
            >
              Abrir busca na Petz ↗
            </a>
            <p className="text-[11px] text-slate-400">busca por: <span className="font-mono">{item.suggested_search_term}</span></p>
          </div>

          {/* Passo 2 + 3 */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">2. Cole a URL do produto da Petz</label>
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

          {rowError && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{rowError}</div>}

          {result && v && (
            <div className={`rounded-xl border p-3 space-y-3 ${v.cls}`}>
              <p className="text-sm font-semibold">{v.icon} {v.label}</p>
              {result.reason && <p className="text-xs opacity-90">{result.reason}</p>}

              {result.comparison.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left opacity-60">
                      <th className="py-1 font-medium">Atributo</th>
                      <th className="py-1 font-medium">Catálogo</th>
                      <th className="py-1 font-medium">Petz (da URL)</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparison.map((c) => (
                      <tr key={c.attribute} className="border-t border-black/5">
                        <td className="py-1 pr-2">{c.attribute}</td>
                        <td className="py-1 pr-2 font-semibold">{c.catalog ?? '—'}</td>
                        <td className="py-1 pr-2 font-semibold">{c.petz ?? '—'}</td>
                        <td className="py-1 text-right">
                          {c.status === 'match' ? '✓' : c.status === 'conflict' ? '✗' : '·'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="text-xs opacity-90">
                id Petz: <b>{result.petz_product_id || 'não encontrado na URL'}</b>
              </div>
              {result.cart_test_url && (
                <div className="text-xs">
                  Testar:{' '}
                  <a href={result.coupon_apply_url || '#'} target="_blank" rel="noopener noreferrer" className="underline">aplicar cupom</a>
                  {' → '}
                  <a href={result.cart_test_url} target="_blank" rel="noopener noreferrer" className="underline">abrir no carrinho ↗</a>
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
