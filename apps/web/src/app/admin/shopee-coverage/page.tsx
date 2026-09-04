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
  cobasi_image_url: string | null;
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
  building_queue: 'Montando a lista do que buscar…',
  auditing_existing_shopee: 'Conferindo ofertas que já existem…',
  syncing: 'Buscando na Shopee…',
  finished: 'Concluído',
  error: 'Erro',
};

// Só estes 3 motivos melhoram com uma nova busca — os outros 2 exigem ação
// manual do admin (ver RETRIABLE_REASONS no backend, shopee_coverage_gaps.py).
const RETRIABLE_REASONS = ['never_searched', 'has_unverified_offer', 'api_error'];

const REASON_INFO: Record<string, { label: string; explanation: string; color: string; bg: string; border: string }> = {
  never_searched: {
    label: 'Nunca buscado',
    explanation: 'Ainda não tentamos procurar este produto na Shopee.',
    color: '#0969da', bg: '#eef6ff', border: '#c8e1ff',
  },
  has_unverified_offer: {
    label: 'Precisa confirmar',
    explanation: 'Já existe um anúncio salvo, mas sem título confirmado — uma nova busca resolve.',
    color: '#9a6700', bg: '#fff8e1', border: '#f2d675',
  },
  api_error: {
    label: 'Falhou por erro técnico',
    explanation: 'A última tentativa deu erro. Vale tentar de novo.',
    color: '#cf222e', bg: '#fff1f0', border: '#ffb3ab',
  },
  no_confident_match: {
    label: 'Sem certeza — precisa de você',
    explanation: 'Já buscamos, mas nenhum anúncio bateu com segurança. Buscar de novo não muda o resultado — cadastre o link certo (se achar) ou marque "só tem na Cobasi".',
    color: '#8250df', bg: '#f5f0ff', border: '#d8bfff',
  },
  only_conflicting: {
    label: 'Só achamos variante errada',
    explanation: 'Encontramos anúncios, mas de outro tamanho/sabor/cor. Cadastre o link certo (se achar) ou marque "só tem na Cobasi".',
    color: '#bc4c00', bg: '#fff1e5', border: '#ffcb92',
  },
};

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  open: { label: 'Em aberto', color: '#0969da' },
  cobasi_only: { label: 'Só Cobasi (confirmado)', color: '#57606a' },
  resolved: { label: 'Resolvido', color: '#1a7f37' },
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
  const LIMIT = 60;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [registerFor, setRegisterFor] = useState<Gap | null>(null);
  const [regUrl, setRegUrl] = useState('');
  const [regPrice, setRegPrice] = useState('');
  const [showHelp, setShowHelp] = useState(false);

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
  // desta tela (ex: timer noturno, ou o botão "Buscar agora" abaixo).
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

  // Além do sync em si, mantém a lista/summary sempre frescos — a tela é
  // "sempre dinâmica", mesmo sem sync rodando e sem nenhuma ação do admin.
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
    if (!confirm(`${action === 'cobasi_only' ? 'Marcar como "só tem na Cobasi"' : action === 'retry' ? 'Tentar buscar de novo' : 'Reabrir'} ${selected.size} produtos?`)) return;
    setBusy(true);
    try {
      const r = await adminFetch<{ done: number; errors: number }>('/shopee-coverage/bulk', {
        method: 'POST', body: JSON.stringify({ action, ids: [...selected] }),
      });
      alert(`Pronto: ${r.done} produtos atualizados${r.errors ? `, ${r.errors} com erro` : ''}.`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  async function rebuild() {
    setBusy(true);
    try { await adminFetch('/shopee-coverage/rebuild', { method: 'POST' }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const r = await adminFetch<{ started: boolean; reason?: string }>('/shopee-coverage/sync-now', { method: 'POST' });
      if (!r.started) alert('Já tem uma busca rodando agora — acompanhe a barra de progresso.');
    } catch (e) { alert(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
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
  const retriableCount = RETRIABLE_REASONS.reduce((sum, r) => sum + (summary?.by_reason[r] ?? 0), 0);
  const manualCount = (summary?.by_reason.no_confident_match ?? 0) + (summary?.by_reason.only_conflicting ?? 0);

  return (
    <PremiumScreenShell
      title="🛍️ Cobertura Shopee × Cobasi"
      subtitle={summary ? `${summary.by_status.open ?? 0} produtos em aberto · ${summary.tutor_open} já vistos por algum tutor` : undefined}
      backHref="/admin/dashboard"
    >
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 20, fontSize: 14 }}>

        {/* ── Explicação da tela (ensina a usar) ───────────────────────── */}
        <div style={card('#eef6ff', '#c8e1ff')}>
          <button onClick={() => setShowHelp(v => !v)} style={{ ...linkBtn, color: '#0969da', fontWeight: 700 }}>
            {showHelp ? '▾' : '▸'} O que é esta tela e como usar
          </button>
          {showHelp && (
            <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: '#1f2328' }}>
              <p style={{ margin: '0 0 8px' }}>
                Aqui aparecem os produtos que <b>existem na Cobasi</b> mas <b>não têm um link confirmado na Shopee</b> —
                por isso o tutor não vê comparação de preço com a Shopee nesses casos.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Cada produto tem um <b>motivo</b> colorido. Três motivos (azul, amarelo, vermelho) melhoram sozinhos se
                buscarmos de novo — é só clicar em <b>&quot;🔍 Buscar agora&quot;</b> abaixo. Os outros dois (roxo e laranja)
                já foram buscados e não resolvem com mais tentativas — aí é você quem decide: cola o link certo se achar,
                ou marca &quot;só tem na Cobasi mesmo&quot; pra tirar da lista.
              </p>
              <p style={{ margin: 0 }}>Nada aqui é automático demais: toda ação em massa pede confirmação antes de gravar.</p>
            </div>
          )}
        </div>

        {/* ── Buscar agora + progresso ao vivo ─────────────────────────── */}
        <div style={card('#f0fff4', '#a3e6b0')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a7f37' }}>🔍 Buscar na Shopee agora</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#3a4149' }}>
                {retriableCount > 0
                  ? <>Existem <b>{retriableCount} produtos</b> onde uma nova busca pode resolver o problema. Sem risco de repetir trabalho à toa.</>
                  : 'Nenhum produto pendente de nova busca no momento — tudo que dava pra tentar automaticamente já foi tentado.'}
              </p>
            </div>
            <button
              onClick={syncNow}
              disabled={busy || Boolean(sync?.running) || retriableCount === 0}
              style={{ ...bigBtn, background: sync?.running ? '#8c959f' : '#1a7f37', minWidth: 220 }}
            >
              {sync?.running ? '🔄 Já está buscando…' : `🔍 Buscar agora (${retriableCount})`}
            </button>
          </div>

          {sync && (sync.running || sync.phase === 'error' || (sync.finished_at && sync.started_at)) && (
            <div style={{
              marginTop: 14, border: `1px solid ${sync.error ? '#ffb3ab' : sync.running ? '#c8e1ff' : '#a3e6b0'}`,
              background: sync.error ? '#fff1f0' : sync.running ? '#eef6ff' : '#f6fef8',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <b>
                  {sync.running ? '🔄 Buscando na Shopee…' : sync.error ? '⚠️ Terminou com erro' : '✅ Última busca concluída'}
                  {' '}<span style={{ fontWeight: 400, color: '#57606a' }}>{PHASE_LABEL[sync.phase] ?? sync.phase}</span>
                </b>
                <span style={{ color: '#57606a', fontSize: 12.5 }}>
                  {sync.processed}/{sync.total || '?'} produtos · {sync.matched} encontrados
                  {sync.errors > 0 ? ` · ${sync.errors} erros` : ''}
                </span>
              </div>
              {sync.total > 0 && (
                <div style={{ marginTop: 8, height: 10, borderRadius: 5, background: '#d0d7de', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, sync.percent)}%`, height: '100%',
                    background: sync.error ? '#cf222e' : sync.running ? '#0969da' : '#1a7f37',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              )}
              <div style={{ marginTop: 4, color: '#57606a', fontSize: 12 }}>
                {sync.running
                  ? `${sync.percent.toFixed(0)}% concluído · ${sync.match_rate.toFixed(1)}% dos tentados já encontraram oferta`
                  : sync.finished_at
                    ? `Terminou em ${new Date(sync.finished_at).toLocaleString('pt-BR')} — a lista abaixo já mostra o resultado.`
                    : null}
                {sync.error && <span style={{ color: '#cf222e' }}> — {sync.error}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Resumo colorido, clicável pra filtrar ────────────────────── */}
        {summary && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#57606a', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Motivo — clique pra filtrar
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {Object.entries(summary.by_reason).sort((a, b) => b[1] - a[1]).map(([r, n]) => {
                const info = REASON_INFO[r] ?? { label: r, explanation: '', color: '#57606a', bg: '#f6f8fa', border: '#d0d7de' };
                const active = reason === r;
                return (
                  <button
                    key={r}
                    onClick={() => { setReason(active ? '' : r); setOffset(0); }}
                    style={{
                      textAlign: 'left', borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                      border: `2px solid ${active ? info.color : info.border}`,
                      background: info.bg, color: '#1f2328',
                      boxShadow: active ? `0 0 0 2px ${info.color}33` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, color: info.color }}>{info.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: info.color }}>{n}</span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.4, color: '#3a4149' }}>{info.explanation}</p>
                  </button>
                );
              })}
            </div>
            {manualCount > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#57606a' }}>
                💡 <b>{manualCount} produtos</b> (roxo + laranja) não melhoram com nova busca — precisam de uma decisão sua caso a caso, mais abaixo.
              </p>
            )}
          </div>
        )}

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div style={{ ...card('#fff', '#d0d7de'), display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Status">
            <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} style={sel}>
              <option value="open">Em aberto</option>
              <option value="cobasi_only">Só Cobasi (confirmado)</option>
              <option value="resolved">Resolvidos</option>
              <option value="all">Todos</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select value={category} onChange={e => { setCategory(e.target.value); setOffset(0); }} style={sel}>
              <option value="">Toda categoria</option>
              {summary?.by_category.map(c => <option key={c.category} value={c.category === '(sem)' ? '' : c.category}>{c.category} ({c.n})</option>)}
            </select>
          </Field>
          <Field label="Ordenar por">
            <select value={sort} onChange={e => setSort(e.target.value)} style={sel}>
              <option value="relevance">Relevância (tutor primeiro)</option>
              <option value="price_desc">Maior preço</option>
              <option value="price_asc">Menor preço</option>
            </select>
          </Field>
          <Field label="Buscar produto">
            <input placeholder="nome ou código de barras" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); load(); } }} style={{ ...sel, minWidth: 200 }} />
          </Field>
          <Field label="Preço mín.">
            <input placeholder="R$" value={minPrice} onChange={e => setMinPrice(e.target.value)} style={{ ...sel, width: 90 }} />
          </Field>
          <Field label="Preço máx.">
            <input placeholder="R$" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={{ ...sel, width: 90 }} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={tutorOnly} onChange={e => { setTutorOnly(e.target.checked); setOffset(0); }} />
            Só produtos que algum tutor já viu
          </label>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={() => { setOffset(0); load(); }} disabled={busy} style={btn}>✓ Aplicar filtros</button>
            <button onClick={exportCsv} style={btnGhost}>⬇️ Exportar CSV</button>
            <button onClick={rebuild} disabled={busy} style={btnGhost}>🔄 Recalcular lista agora</button>
          </div>
        </div>

        {/* ── Ações em massa ───────────────────────────────────────────── */}
        {selected.size > 0 && (
          <div style={{ ...card('#fff8e1', '#f2d675'), display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{selected.size} produtos selecionados —</b>
            <button onClick={() => bulk('cobasi_only')} disabled={busy} style={btn}>✅ Marcar todos: só tem na Cobasi mesmo</button>
            <button onClick={() => bulk('retry')} disabled={busy} style={btnGhost}>🔄 Tentar buscar de novo</button>
            {status !== 'open' && <button onClick={() => bulk('reopen')} disabled={busy} style={btnGhost}>↩️ Reabrir</button>}
            <button onClick={() => setSelected(new Set())} style={linkBtn}>Limpar seleção</button>
          </div>
        )}

        {error && <p style={{ color: '#cf222e', fontWeight: 600 }}>⚠️ {error}</p>}

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#57606a' }}>Carregando…</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#57606a' }}>
                <b>{total}</b> produtos{total > LIMIT ? ` · mostrando ${offset + 1}–${Math.min(offset + LIMIT, total)}` : ''}
              </p>
              {gaps.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={allOnPageSelected}
                    onChange={e => setSelected(e.target.checked ? new Set(gaps.map(g => g.id)) : new Set())} />
                  Selecionar todos desta página
                </label>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {gaps.map(g => (
                <GapCard
                  key={g.id}
                  g={g}
                  selected={selected.has(g.id)}
                  busy={busy}
                  onToggle={() => {
                    const n = new Set(selected);
                    if (n.has(g.id)) n.delete(g.id); else n.add(g.id);
                    setSelected(n);
                  }}
                  onRegister={() => { setRegisterFor(g); setRegUrl(''); setRegPrice(''); }}
                  onCobasiOnly={() => act(g.id, 'cobasi_only')}
                  onRetry={() => act(g.id, 'retry')}
                  onReopen={() => act(g.id, 'reopen')}
                />
              ))}
              {gaps.length === 0 && (
                <div style={{ ...card('#f6f8fa', '#d0d7de'), gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#57606a' }}>
                  Nada aqui com esses filtros. 🎉
                </div>
              )}
            </div>

            {total > LIMIT && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={btnGhost}>‹ Página anterior</button>
                <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} style={btnGhost}>Próxima página ›</button>
              </div>
            )}
          </>
        )}
      </div>

      {registerFor && (
        <div onClick={() => setRegisterFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 460, width: '100%', fontSize: 13.5 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>🔗 Cadastrar link da Shopee</h3>
            <p style={{ margin: '0 0 12px', color: '#57606a' }}>{registerFor.product_name} · {registerFor.gtin}</p>
            <label style={fieldLabel}>Link de afiliado</label>
            <p style={{ margin: '0 0 6px', color: '#57606a', fontSize: 12 }}>Cole o link do Portal (s.shopee.com.br/… ou shopee.com.br/…). Não alteramos o link.</p>
            <input autoFocus placeholder="https://s.shopee.com.br/…" value={regUrl} onChange={e => setRegUrl(e.target.value)} style={{ ...sel, width: '100%', marginBottom: 10 }} />
            <label style={fieldLabel}>Preço (opcional)</label>
            <input placeholder="ex: 49.90" value={regPrice} onChange={e => setRegPrice(e.target.value)} style={{ ...sel, width: '100%', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRegisterFor(null)} style={btnGhost}>Cancelar</button>
              <button onClick={submitRegister} disabled={busy || !regUrl.trim()} style={btn}>✓ Cadastrar e resolver</button>
            </div>
          </div>
        </div>
      )}
    </PremiumScreenShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function GapCard({ g, selected, busy, onToggle, onRegister, onCobasiOnly, onRetry, onReopen }: {
  g: Gap; selected: boolean; busy: boolean;
  onToggle: () => void; onRegister: () => void; onCobasiOnly: () => void; onRetry: () => void; onReopen: () => void;
}) {
  const info = REASON_INFO[g.reason] ?? { label: g.reason, explanation: g.reason_detail ?? '', color: '#57606a', bg: '#f6f8fa', border: '#d0d7de' };
  const statusInfo = STATUS_INFO[g.status] ?? { label: g.status, color: '#57606a' };
  const isManualOnly = g.reason === 'no_confident_match' || g.reason === 'only_conflicting';

  return (
    <div style={{
      border: `2px solid ${selected ? '#0969da' : info.border}`, borderRadius: 14, background: '#fff',
      boxShadow: selected ? '0 0 0 3px #0969da22' : '0 1px 2px rgba(0,0,0,.04)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', gap: 12, padding: 14, background: info.bg }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </label>
        <div style={{
          width: 64, height: 64, borderRadius: 10, background: '#fff', border: '1px solid #e3e7ea',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
        }}>
          {g.cobasi_image_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={g.cobasi_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 26 }}>📦</span>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.3, color: '#1f2328' }}>
            {g.product_name || 'Produto sem nome'}
          </p>
          <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 11, color: '#57606a' }}>{g.gtin}</p>
          <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: '#1f2328' }}>
            {g.cobasi_price != null ? `R$ ${g.cobasi_price.toFixed(2)}` : 'preço não informado'}
          </p>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={pill(info.color, info.bg)}>{info.label}</span>
          <span style={pill(statusInfo.color, '#f6f8fa')}>{statusInfo.label}</span>
          {g.seen_by_tutor && <span style={pill('#1a7f37', '#f0fff4')}>👁️ visto por tutor</span>}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: '#3a4149' }}>{info.explanation}</p>
        {g.discovery_attempts > 0 && (
          <p style={{ margin: 0, fontSize: 11.5, color: '#8c959f' }}>{g.discovery_attempts} tentativa(s) automática(s) já feitas.</p>
        )}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid #eaeef2', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {g.status === 'open' && <>
          <button onClick={onRegister} style={{ ...cardBtn, background: '#0969da', color: '#fff', border: '1px solid #0969da' }}>
            🔗 Já achei — cadastrar link da Shopee
          </button>
          {!isManualOnly && (
            <button onClick={onRetry} disabled={busy} style={{ ...cardBtn, background: '#fff', color: '#0969da', border: '1px solid #0969da' }}>
              🔄 Tentar buscar de novo
            </button>
          )}
          <button onClick={onCobasiOnly} disabled={busy} style={{ ...cardBtn, background: '#fff', color: '#57606a', border: '1px solid #d0d7de' }}>
            ✅ Confirmar: só tem na Cobasi mesmo
          </button>
          <a
            href={`https://shopee.com.br/search?keyword=${encodeURIComponent(g.product_name || g.gtin)}`}
            target="_blank" rel="noopener"
            style={{ ...cardBtn, background: '#fff', color: '#3a4149', border: '1px solid #d0d7de', textDecoration: 'none', textAlign: 'center' }}
          >
            🔎 Procurar manualmente na Shopee ↗
          </a>
        </>}
        {g.status !== 'open' && (
          <button onClick={onReopen} disabled={busy} style={{ ...cardBtn, background: '#fff', color: '#57606a', border: '1px solid #d0d7de' }}>
            ↩️ Reabrir este produto
          </button>
        )}
      </div>
    </div>
  );
}

function card(bg: string, border: string): React.CSSProperties {
  return { background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 16 };
}
function pill(color: string, bg: string): React.CSSProperties {
  return { display: 'inline-flex', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color, background: bg };
}

const fieldLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#57606a', textTransform: 'uppercase', letterSpacing: 0.3 };
const sel: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d7de', fontSize: 13.5 };
const btn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, border: '1px solid #0969da', background: '#0969da', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 };
const bigBtn: React.CSSProperties = { padding: '14px 22px', borderRadius: 12, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800 };
const btnGhost: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, border: '1px solid #d0d7de', background: '#fff', color: '#24292f', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 };
const linkBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, padding: 0 };
const cardBtn: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, display: 'block', width: '100%' };
