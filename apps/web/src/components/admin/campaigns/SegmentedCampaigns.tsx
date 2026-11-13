'use client';

/**
 * Modo "Campanhas" da aba Push: campanhas comerciais segmentadas, enviadas em lotes sem repetir tutor.
 * Sequência: 1 campanha → 2 conteúdo → 3 filtros → 4 contagem → 5 tamanho → 6 prévia → 7 confirmação → 8 histórico.
 * NÃO mexe no envio avulso. Todas as regras de verdade (reserva, idempotência, recuperação) vivem no backend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, explainError, type Campaign, type CampaignListItem, type FieldInfo, type FieldsResponse } from './api';
import { ContentForm, ContentReadOnly, draftFrom, emptyDraft, type Draft, type Goal } from './ContentForm';
import { FilterBuilder } from './FilterBuilder';
import { BatchComposer } from './BatchComposer';
import { BatchHistory, CountChips } from './BatchHistory';
import { buildFilter, describeCond, emptyFilter, filterToState, type FilterState, type StoredFilter } from './filters';
import { Loading } from '@/components/admin/sections/sections';

interface Boot { fields: FieldsResponse; brands: { text: string; tutors: number }[]; goals: Goal[]; destinations: Record<string, string> }

function Step({ n, title, children, note }: { n: number; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 id={`step-${n}`} className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[12px] text-white" aria-hidden>{n}</span>{title}
      </h3>
      {note && <p className="mb-3 text-[12.5px] text-slate-600">{note}</p>}
      {children}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', active: 'Em andamento', closed: 'Encerrada' };

export function SegmentedCampaigns() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [list, setList] = useState<CampaignListItem[] | null>(null);
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'new'; draft: Draft } | { kind: 'open'; id: string }>({ kind: 'list' });
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(emptyFilter());
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await call<{ enabled: boolean }>('/config');
        if (!alive) return;
        setEnabled(cfg.enabled);
        if (!cfg.enabled) return;
        const [fields, brands, seg] = await Promise.all([
          call<FieldsResponse>('/fields'),
          call<{ suggestions: { text: string; tutors: number }[] }>('/suggestions/brands').catch(() => ({ suggestions: [] })),
          call<{ goals: Goal[]; destinations: Record<string, string> }>('/segments', undefined, { base: '/api/v1/admin/broadcast' }),
        ]);
        if (alive) setBoot({ fields, brands: brands.suggestions, goals: seg.goals, destinations: seg.destinations });
      } catch (e) { if (alive) { setBootErr(explainError(e).text); setEnabled((v) => v ?? false); } }
    })();
    return () => { alive = false; };
  }, []);

  const loadList = useCallback(async () => {
    try { setList((await call<{ campaigns: CampaignListItem[] }>('/campaigns')).campaigns); } catch (e) { setLoadErr(explainError(e).text); }
  }, []);
  useEffect(() => { if (enabled) void loadList(); }, [enabled, loadList]);

  const openId = view.kind === 'open' ? view.id : null;
  const reload = useCallback(async () => {
    if (!openId) return;
    try { setCampaign(await call<Campaign>(`/campaigns/${openId}`)); setLoadErr(null); } catch (e) { setLoadErr(explainError(e).text); }
  }, [openId]);
  useEffect(() => { setCampaign(null); setConfirmClose(false); setCloseErr(null); seededFor.current = null; setSeedNote(null); if (openId) void reload(); }, [openId, reload]);

  // Acompanha lotes em andamento (a thread de envio roda no servidor).
  const hasActive = !!campaign?.batches.some((b) => b.phase === 'reserved' || b.phase === 'sending');
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void reloadRef.current(), 4000);
    return () => clearInterval(t);
  }, [hasActive]);

  const fields: FieldInfo[] = useMemo(() => boot?.fields.fields ?? [], [boot]);
  // Ao abrir uma campanha com lotes, os filtros do ÚLTIMO lote viram o ponto de partida do próximo (editáveis; o histórico não muda).
  useEffect(() => {
    if (!campaign || !boot || seededFor.current === campaign.id) return;
    seededFor.current = campaign.id;
    const last = [...campaign.batches].sort((a, b) => b.batch_no - a.batch_no).find((b) => b.filters);
    if (last) { setFilter(filterToState(last.filters as StoredFilter, boot.fields.fields)); setSeedNote(`Filtros do lote ${last.batch_no} carregados como ponto de partida. Você pode alterá-los livremente: isso não muda o que já foi enviado.`); }
    else { setFilter(emptyFilter()); setSeedNote(null); }
  }, [campaign, boot]);
  const built = useMemo(() => buildFilter(filter, fields), [filter, fields]);
  const summary = useMemo(() => {
    const by = new Map(fields.map((f) => [f.field, f]));
    return filter.blocks.map((b, i) => `Bloco ${i + 1} (${b.op === 'and' ? 'todas' : 'qualquer'}): ` + b.conds.map((c) => describeCond(c, by.get(c.field))).join(b.op === 'and' ? ' E ' : ' OU ')).filter((s) => !s.endsWith(': '));
  }, [filter, fields]);

  if (enabled === null) return <Loading />;
  if (!enabled) {
    return (
      <p className="rounded-xl bg-slate-100 p-4 text-[13.5px] leading-snug text-slate-700">
        {bootErr ?? 'As campanhas segmentadas ainda não foram liberadas neste ambiente. O envio avulso continua funcionando normalmente.'}
      </p>
    );
  }
  if (!boot) return bootErr ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{bootErr}</p> : <Loading />;

  // ── 1. lista / nova ──
  if (view.kind === 'list') {
    return (
      <div className="space-y-4">
        <Step n={1} title="Criar ou continuar uma campanha" note="Cada campanha tem o seu conteúdo e a sua própria lista de quem já foi alcançado. Um tutor nunca recebe a mesma campanha duas vezes.">
          <button type="button" className="mb-3 rounded-lg bg-sky-700 px-4 py-2.5 text-[14px] font-bold text-white" onClick={() => setView({ kind: 'new', draft: emptyDraft() })}>+ Nova campanha</button>
          {loadErr && <p role="alert" className="mb-2 text-[13px] text-rose-800">{loadErr}</p>}
          {!list ? <Loading /> : list.length === 0 ? <p className="text-[13px] text-slate-500">Nenhuma campanha ainda.</p> : (
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setFilter(emptyFilter()); setView({ kind: 'open', id: c.id }); }} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[14px] font-bold text-slate-900">{c.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-sky-100 text-sky-900'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                    </span>
                    <span className="mt-1.5 block"><CountChips counts={c.counts} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Step>
      </div>
    );
  }

  if (view.kind === 'new') {
    return (
      <div className="space-y-4">
        <button type="button" className="text-[13px] font-semibold text-slate-600 underline" onClick={() => setView({ kind: 'list' })}>← Voltar às campanhas</button>
        <Step n={2} title="Conteúdo da campanha" note="Título, mensagem, produto e link comercial. Você cola o link monetizado; ele é guardado exatamente como colado.">
          <ContentForm goals={boot.goals} destinations={boot.destinations} initial={view.draft}
            onCreated={(c) => { setCampaign(c); setFilter(emptyFilter()); void loadList(); setView({ kind: 'open', id: c.id }); }} />
        </Step>
      </div>
    );
  }

  // ── campanha aberta ──
  const closeCampaign = async () => {
    if (!campaign) return;
    setCloseErr(null);
    try { await call(`/campaigns/${campaign.id}/close`, {}); setConfirmClose(false); await reload(); void loadList(); }
    catch (e) { setCloseErr(explainError(e).text); }
  };
  const busyBatch = !!campaign?.batches.some((b) => ['reserved', 'sending', 'interrupted'].includes(b.phase));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-[13px] font-semibold text-slate-600 underline" onClick={() => { setView({ kind: 'list' }); void loadList(); }}>← Voltar às campanhas</button>
        {campaign && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700" onClick={() => setView({ kind: 'new', draft: draftFrom(campaign) })}>Criar cópia editável</button>
            {campaign.status !== 'closed' && !confirmClose && <button type="button" className="rounded-lg border border-rose-300 px-3 py-1.5 text-[12.5px] font-semibold text-rose-800" onClick={() => setConfirmClose(true)}>Encerrar campanha</button>}
          </div>
        )}
      </div>
      {confirmClose && (
        <div role="alertdialog" aria-label="Confirmar encerramento" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-900">
          <p>Encerrar a campanha impede novos lotes. O histórico fica guardado. Não dá para reabrir.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-lg bg-rose-700 px-3 py-1.5 font-bold text-white" onClick={closeCampaign}>Sim, encerrar</button>
            <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700" onClick={() => setConfirmClose(false)}>Cancelar</button>
          </div>
          {closeErr && <p role="alert" className="mt-2">{closeErr}</p>}
        </div>
      )}
      {loadErr && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{loadErr}</p>}
      {!campaign ? <Loading /> : (
        <>
          <header className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[12px] font-extrabold text-white" aria-hidden>1</span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Campanha</p>
              <h2 className="text-[17px] font-extrabold text-slate-900">{campaign.name}</h2>
              <p className="text-[12.5px] text-slate-600">{STATUS_LABEL[campaign.status] ?? campaign.status} · já alcançados nesta campanha: {campaign.used_total}</p>
            </div>
          </header>
          <Step n={2} title="Conteúdo"><ContentReadOnly content={campaign.content} locked={campaign.content_locked} destinations={boot.destinations} /></Step>
          {campaign.status !== 'closed' && (
            <>
              <Step n={3} title="Quem recebe (filtros)" note="Os filtros podem mudar de um lote para o outro; quem já recebeu nunca volta. E = o tutor precisa atender a todas as condições combinadas. OU = basta atender a uma das alternativas.">
                {seedNote && <p role="status" className="mb-3 rounded-lg bg-sky-50 p-2.5 text-[12.5px] leading-snug text-sky-900">{seedNote}</p>}
                <FilterBuilder fields={fields} state={filter} onChange={setFilter} brandHints={boot.brands} locationNote={boot.fields.location_origins} />
              </Step>
              <Step n={4} title="Contagem, lote e confirmação" note="Veja quantos tutores atendem, escolha o tamanho do lote, confira a prévia e confirme.">
                <BatchComposer campaign={campaign} filter={built.filter} ready={built.ready} summary={summary} busyBatch={busyBatch}
                  onReserved={() => { void reload(); void loadList(); }} />
              </Step>
            </>
          )}
          {campaign.status === 'closed' && <p className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-700">Campanha encerrada: não aceita novos lotes.</p>}
          <Step n={5} title="Histórico e resultados">
            <div className="mb-3"><CountChips counts={campaign.counts} total={campaign.used_total} /></div>
            <BatchHistory batches={campaign.batches} fields={fields} onChanged={() => void reload()} />
          </Step>
        </>
      )}
    </div>
  );
}
