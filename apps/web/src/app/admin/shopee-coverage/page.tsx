'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PremiumScreenShell } from '@/components/premium';
import { getToken } from '@/lib/auth-token';
import { useAdmin } from '@/hooks/useAdmin';

type Gap = {
  id: number;
  gtin: string;
  product_name: string | null;
  category: string | null;
  cobasi_price: number | null;
  cobasi_title: string | null;
  reason: string;
  reason_detail: string | null;
  suggestion: string | null;
  seen_by_tutor: boolean;
  discovery_attempts: number;
  status: string;
};

type Summary = {
  by_status: Record<string, number>;
  by_reason: Record<string, number>;
  tutor_open: number;
  by_category: { category: string; n: number }[];
  last_rebuild: string | null;
};

type SyncProgress = {
  running: boolean;
  phase: string;
  total: number;
  processed: number;
  matched: number;
  percent: number;
  remaining: number;
  match_rate: number;
  refreshed_existing: number;
  new_matches: number;
  misses: number;
  errors: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

const PHASE_LABEL: Record<string, string> = {
  starting: 'Iniciando…',
  auditing: 'Auditando ofertas existentes…',
  syncing: 'Buscando na Shopee…',
  finished: 'Concluído',
  error: 'Erro',
};

const REASON_LABEL: Record<string, string> = {
  never_searched: 'Nunca buscado',
  no_confident_match: 'Buscado, sem match confiável',
  only_conflicting: 'Só anúncios de variante errada',
  has_unverified_offer: 'Tem oferta legada sem título',
  api_error: 'Erro da API Shopee',
};

async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) { window.location.href = '/home'; throw new Error('sem token'); }
  const res = await fetch(`/api/v1/admin${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) { window.location.href = '/home'; throw new Error('sem acesso'); }
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || `erro ${res.status}`);
  }
  return res.json();
}

export default function ShopeeCoveragePage() {
  const { isAdmin, isLoading: adminLoading } = useAdmin();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState('open');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [tutorOnly, setTutorOnly] = useState(false);
  const [q, setQ] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('relevance');
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [registerFor, setRegisterFor] = useState<Gap | null>(null);
  const [regUrl, setRegUrl] = useState('');
  const [regPrice, setRegPrice] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', status);
    if (reason) p.set('reason', reason);
    if (category) p.set('category', category);
    if (tutorOnly) p.set('seen_by_tutor', 'true');
    if (q.trim()) p.set('q', q.trim());
    if (minPrice) p.set('min_price', minPrice);
    if (maxPrice) p.set('max_price', maxPrice);
    p.set('sort', sort);
    p.set('limit', String(LIMIT));
    p.set('offset', String(offset));
    return p.toString();
  }, [status, reason, category, tutorOnly, q, minPrice, maxPrice, sort, offset]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [list, sum] = await Promise.all([
        adminFetch<{ total: number; items: Gap[] }>(`/shopee-coverage?${params}`),
        adminFetch<Summary>('/shopee-coverage/summary'),
      ]);
      setGaps(list.items); setTotal(list.total); setSummary(sum);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // Sincronização Shopee em andamento — barra de progresso ao vivo. Poll
  // curto (5s) enquanto está rodando pra sensação de "tempo real"; poll mais
  // espaçado (30s) quando parado, só pra notar se alguém iniciar de fora
  // desta tela (ex: timer noturno, ou o comando manual na VPS).
  const [sync, setSync] = useState<SyncProgress | null>(null);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      let nextDelay = 30000;
      try {
        const s = await adminFetch<SyncProgress>('/shopee-sync/progress');
        if (cancelled) return;
        setSync(s);
        // Sync terminou desde a última checagem — os dados de cobertura
        // podem ter mudado (o sync já regenera o rebuild sozinho no fim),
        // então recarrega a lista/summary automaticamente.
        if (wasRunning.current && !s.running) load();
        wasRunning.current = s.running;
        nextDelay = s.running ? 5000 : 30000;
      } catch {
        // silencioso — não interrompe a tela por causa do polling de progresso
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, nextDelay);
      }
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isAdmin, load]);

  // Além do sync em si, mantém a lista/summary sempre frescos mesmo sem
  // nenhuma ação do admin — a tela pediu pra ser "dinâmica, sempre se
  // atualizando".
  useEffect(() => {
    if (!isAdmin) return;
    const t = window.setInterval(() => load(), 30000);
    return () => window.clearInterval(t);
  }, [isAdmin, load]);

  async function act(id: number, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await adminFetch(`/shopee-coverage/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  async function bulk(action: string) {
    if (selected.size === 0) return;
    if (!confirm(`${action === 'cobasi_only' ? 'Marcar como só-Cobasi' : action === 'retry' ? 'Re-tentar' : 'Reabrir'} ${selected.size} itens?`)) return;
    setBusy(true);
    try {
      const r = await adminFetch<{ done: number; errors: number }>('/shopee-coverage/bulk', {
        method: 'POST', body: JSON.stringify({ action, ids: [...selected] }),
      });
      alert(`${r.done} ok, ${r.errors} erros`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  async function rebuild() {
    setBusy(true);
    try { await adminFetch('/shopee-coverage/rebuild', { method: 'POST' }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  function exportCsv() {
    const p = new URLSearchParams();
    p.set('status', status);
    if (reason) p.set('reason', reason);
    if (category) p.set('category', category);
    if (tutorOnly) p.set('seen_by_tutor', 'true');
    window.open(`/api/v1/admin/shopee-coverage/export.csv?${p.toString()}`, '_blank');
  }

  async function submitRegister() {
    if (!registerFor || !regUrl.trim()) return;
    await act(registerFor.id, 'register_offer', {
      affiliate_url: regUrl.trim(),
      price: regPrice ? Number(regPrice) : undefined,
    });
    setRegisterFor(null); setRegUrl(''); setRegPrice('');
  }

  if (adminLoading) return <PremiumScreenShell title="Cobertura Shopee" backHref="/admin/dashboard"><p style={{ padding: 24 }}>Carregando…</p></PremiumScreenShell>;
  if (!isAdmin) return <PremiumScreenShell title="Cobertura Shopee" backHref="/admin/dashboard"><p style={{ padding: 24 }}>Sem acesso.</p></PremiumScreenShell>;

  const allOnPageSelected = gaps.length > 0 && gaps.every(g => selected.has(g.id));

  return (
    <PremiumScreenShell
      title="Cobertura Shopee × Cobasi"
      subtitle={summary ? `${summary.by_status.open ?? 0} em aberto · ${summary.tutor_open} vistos por tutor · última varredura ${summary.last_rebuild ? new Date(summary.last_rebuild).toLocaleString('pt-BR') : '—'}` : undefined}
      backHref="/admin/dashboard"
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>

        {sync && (sync.running || sync.phase === 'error' || (sync.finished_at && sync.started_at)) && (
          <div style={{
            border: `1px solid ${sync.error ? '#cf222e' : sync.running ? '#0969da' : '#2da44e'}`,
            background: sync.error ? '#fff1f0' : sync.running ? '#eef6ff' : '#f0fff4',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b>
                {sync.running ? '🔄 Sincronizando com a Shopee…' : sync.error ? '⚠️ Sync terminou com erro' : '✅ Última sincronização concluída'}
                {' '}<span style={{ fontWeight: 400, color: '#57606a' }}>{PHASE_LABEL[sync.phase] ?? sync.phase}</span>
              </b>
              <span style={{ color: '#57606a', fontSize: 12 }}>
                {sync.processed}/{sync.total || '?'} produtos · {sync.matched} casados
                {sync.errors > 0 ? ` · ${sync.errors} erros` : ''}
              </span>
            </div>
            {sync.total > 0 && (
              <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: '#d0d7de', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, sync.percent)}%`, height: '100%',
                  background: sync.error ? '#cf222e' : sync.running ? '#0969da' : '#2da44e',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            )}
            <div style={{ marginTop: 4, color: '#57606a', fontSize: 11.5 }}>
              {sync.running
                ? `${sync.percent.toFixed(0)}% · índice de casamento ${sync.match_rate.toFixed(1)}%`
                : sync.finished_at
                  ? `Terminou em ${new Date(sync.finished_at).toLocaleString('pt-BR')} — a lista abaixo já reflete esse resultado.`
                  : null}
              {sync.error && <span style={{ color: '#cf222e' }}> — {sync.error}</span>}
            </div>
          </div>
        )}

        {summary && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(summary.by_reason).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <button key={r} onClick={() => { setReason(reason === r ? '' : r); setOffset(0); }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d0d7de', background: reason === r ? '#0969da' : '#fff', color: reason === r ? '#fff' : '#24292f', cursor: 'pointer' }}>
                {REASON_LABEL[r] || r}: <b>{n}</b>
              </button>
            ))}
          </div>
        )}

        {/* filtros */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} style={sel}>
            <option value="open">Em aberto</option>
            <option value="cobasi_only">Só-Cobasi</option>
            <option value="resolved">Resolvidos</option>
            <option value="all">Todos</option>
          </select>
          <select value={category} onChange={e => { setCategory(e.target.value); setOffset(0); }} style={sel}>
            <option value="">Toda categoria</option>
            {summary?.by_category.map(c => <option key={c.category} value={c.category === '(sem)' ? '' : c.category}>{c.category} ({c.n})</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={tutorOnly} onChange={e => { setTutorOnly(e.target.checked); setOffset(0); }} />
            Só vistos por tutor
          </label>
          <input placeholder="buscar nome / GTIN" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); load(); } }} style={{ ...sel, minWidth: 200 }} />
          <input placeholder="R$ min" value={minPrice} onChange={e => setMinPrice(e.target.value)} style={{ ...sel, width: 80 }} />
          <input placeholder="R$ max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={{ ...sel, width: 80 }} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={sel}>
            <option value="relevance">Relevância</option>
            <option value="price_desc">Maior preço</option>
            <option value="price_asc">Menor preço</option>
          </select>
          <button onClick={() => { setOffset(0); load(); }} disabled={busy} style={btn}>Aplicar</button>
          <button onClick={exportCsv} style={btnGhost}>Exportar CSV</button>
          <button onClick={rebuild} disabled={busy} style={btnGhost}>Regenerar agora</button>
        </div>

        {/* ações em massa */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff8e1', padding: '8px 12px', borderRadius: 8 }}>
            <b>{selected.size} selecionados</b>
            <button onClick={() => bulk('cobasi_only')} disabled={busy} style={btn}>Marcar só-Cobasi</button>
            <button onClick={() => bulk('retry')} disabled={busy} style={btnGhost}>Re-tentar</button>
            {status !== 'open' && <button onClick={() => bulk('reopen')} disabled={busy} style={btnGhost}>Reabrir</button>}
            <button onClick={() => setSelected(new Set())} style={btnGhost}>Limpar seleção</button>
          </div>
        )}

        {error && <p style={{ color: '#cf222e' }}>{error}</p>}
        {loading ? <p>Carregando…</p> : (
          <>
            <p style={{ color: '#57606a' }}>{total} resultados{total > LIMIT ? ` · mostrando ${offset + 1}–${Math.min(offset + LIMIT, total)}` : ''}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f6f8fa', textAlign: 'left' }}>
                    <th style={th}><input type="checkbox" checked={allOnPageSelected}
                      onChange={e => setSelected(e.target.checked ? new Set(gaps.map(g => g.id)) : new Set())} /></th>
                    <th style={th}>Produto</th>
                    <th style={th}>Cat.</th>
                    <th style={th}>Cobasi</th>
                    <th style={th}>Motivo</th>
                    <th style={th}>Tutor</th>
                    <th style={th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map(g => (
                    <tr key={g.id} style={{ borderBottom: '1px solid #eaeef2' }}>
                      <td style={td}><input type="checkbox" checked={selected.has(g.id)}
                        onChange={e => { const n = new Set(selected); if (e.target.checked) n.add(g.id); else n.delete(g.id); setSelected(n); }} /></td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{g.product_name || '—'}</div>
                        <div style={{ color: '#8c959f', fontFamily: 'monospace', fontSize: 11 }}>{g.gtin}</div>
                        {g.suggestion && <div style={{ color: '#57606a', marginTop: 3 }}>💡 {g.suggestion}</div>}
                      </td>
                      <td style={td}>{g.category || '—'}</td>
                      <td style={td}>{g.cobasi_price != null ? `R$ ${g.cobasi_price.toFixed(2)}` : '—'}</td>
                      <td style={td}>
                        <span style={{ fontWeight: 600 }}>{REASON_LABEL[g.reason] || g.reason}</span>
                        {g.reason_detail && <div style={{ color: '#8c959f', fontSize: 11 }}>{g.reason_detail}</div>}
                        {g.discovery_attempts > 0 && <div style={{ color: '#8c959f', fontSize: 11 }}>{g.discovery_attempts} tentativas</div>}
                      </td>
                      <td style={td}>{g.seen_by_tutor ? '👁️ sim' : '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {g.status === 'open' && <>
                          <button onClick={() => { setRegisterFor(g); setRegUrl(''); setRegPrice(''); }} style={btnSm}>Cadastrar link</button>{' '}
                          <button onClick={() => act(g.id, 'cobasi_only')} disabled={busy} style={btnSmGhost}>Só-Cobasi</button>{' '}
                          <button onClick={() => act(g.id, 'retry')} disabled={busy} style={btnSmGhost}>Re-tentar</button>
                        </>}
                        {g.status !== 'open' && <button onClick={() => act(g.id, 'reopen')} disabled={busy} style={btnSmGhost}>Reabrir</button>}
                        {' '}<a href={`https://shopee.com.br/search?keyword=${encodeURIComponent(g.product_name || g.gtin)}`} target="_blank" rel="noopener" style={btnSmGhost}>Buscar na Shopee ↗</a>
                      </td>
                    </tr>
                  ))}
                  {gaps.length === 0 && <tr><td style={td} colSpan={7}>Nada aqui.</td></tr>}
                </tbody>
              </table>
            </div>
            {total > LIMIT && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={btnGhost}>‹ Anterior</button>
                <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} style={btnGhost}>Próxima ›</button>
              </div>
            )}
          </>
        )}
      </div>

      {registerFor && (
        <div onClick={() => setRegisterFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 460, width: '100%', fontSize: 13 }}>
            <h3 style={{ margin: '0 0 4px' }}>Cadastrar link Shopee</h3>
            <p style={{ margin: '0 0 12px', color: '#57606a' }}>{registerFor.product_name} · {registerFor.gtin}</p>
            <p style={{ margin: '0 0 8px', color: '#57606a', fontSize: 12 }}>Cole o <b>link de afiliado</b> do Portal (s.shopee.com.br/… ou shopee.com.br/…). Não modificamos o link.</p>
            <input autoFocus placeholder="https://s.shopee.com.br/…" value={regUrl} onChange={e => setRegUrl(e.target.value)} style={{ ...sel, width: '100%', marginBottom: 8 }} />
            <input placeholder="preço (opcional)" value={regPrice} onChange={e => setRegPrice(e.target.value)} style={{ ...sel, width: '100%', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRegisterFor(null)} style={btnGhost}>Cancelar</button>
              <button onClick={submitRegister} disabled={busy || !regUrl.trim()} style={btn}>Cadastrar</button>
            </div>
          </div>
        </div>
      )}
    </PremiumScreenShell>
  );
}

const sel: React.CSSProperties = { padding: '6px 8px', borderRadius: 7, border: '1px solid #d0d7de', fontSize: 13 };
const btn: React.CSSProperties = { padding: '6px 12px', borderRadius: 7, border: '1px solid #0969da', background: '#0969da', color: '#fff', cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { padding: '6px 12px', borderRadius: 7, border: '1px solid #d0d7de', background: '#fff', color: '#24292f', cursor: 'pointer', fontSize: 13 };
const btnSm: React.CSSProperties = { padding: '3px 8px', borderRadius: 6, border: '1px solid #0969da', background: '#0969da', color: '#fff', cursor: 'pointer', fontSize: 11.5 };
const btnSmGhost: React.CSSProperties = { padding: '3px 8px', borderRadius: 6, border: '1px solid #d0d7de', background: '#fff', color: '#24292f', cursor: 'pointer', fontSize: 11.5, textDecoration: 'none' };
const th: React.CSSProperties = { padding: '7px 8px', borderBottom: '2px solid #d0d7de', fontWeight: 600 };
const td: React.CSSProperties = { padding: '7px 8px', verticalAlign: 'top' };
