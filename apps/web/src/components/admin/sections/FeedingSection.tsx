'use client';

/**
 * Alimentação e Ração — prioridade máxima do BI (pedido explícito do dono).
 *
 * O funil de cadastro aqui é por ESTADO salvo no banco (onde cada pet parou),
 * não por eventos no tempo — não existe instrumentação de tentativa de
 * leitura de código de barras nem de "abriu o formulário e não terminou".
 * Isso é mostrado explicitamente na tela (`instrumentation_gaps`), nunca
 * escondido. O funil comercial (loja → oferta → clique) já é por eventos
 * reais; venda/comissão confirmada não têm integração nenhuma hoje, também
 * declarado na tela em vez de inventado.
 */
import { useState } from 'react';
import { adminGet, filterParams, type GlobalFilter } from '@/lib/admin/analyticsApi';
import { Pagination } from '@/components/admin/DataTable';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

interface FeedingStageRow {
  key: string; label: string; pets: number; pets_at_or_beyond: number; pct_of_total: number;
}
interface FeedingFunnelResponse {
  total_pets: number;
  funnel: FeedingStageRow[];
  top_brands: { brand: string; pets: number }[];
  ending_soon_7d: number;
  instrumentation_gaps: string[];
}
interface FeedingStagePopulationItem {
  pet_id: string; pet_name: string; species: string; breed: string | null;
  photo_url: string | null; food_brand: string | null;
  user_id: string; tutor_name: string | null; tutor_email: string;
  city: string | null; state: string | null;
}
interface FeedingStagePopulationResponse {
  stage: string; label: string; total: number; page: number; page_size: number;
  items: FeedingStagePopulationItem[];
}
interface CommerceFunnelResponse {
  steps: { key: string; label: string; users: number }[];
  sale_confirmed: number | null;
  commission_confirmed: number | null;
  note: string;
}

function PetPhoto({ src }: { src: string | null }) {
  return (
    <div className="flex-shrink-0 overflow-hidden rounded-full bg-slate-100" style={{ width: 36, height: 36 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de usuário; sem remotePatterns novo
        <img src={src} alt="" width={36} height={36} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[15px]" aria-hidden>🐾</div>
      )}
    </div>
  );
}

/** Drill-down: painel lateral com os pets/tutores por trás de um estágio do funil. */
function StageDrilldown({ stage, label, filter, onClose }: {
  stage: string; label: string; filter: GlobalFilter; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync<FeedingStagePopulationResponse>(
    () => adminGet(`/feeding-funnel/${stage}/population`, { ...filterParams(filter), page, page_size: 20 }),
    [stage, page, JSON.stringify(filter)],
  );

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Alimentação e Ração</div>
            <h3 className="text-[16px] font-bold text-slate-900">{label}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !data ? <Loading /> : error ? <ErrorBox msg={error} /> : data && (
            <>
              <p className="mb-3 text-[12px] text-slate-500">{numberFmt(data.total)} pet(s)</p>
              <div className="space-y-2">
                {data.items.map((it) => (
                  <div key={it.pet_id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
                    <PetPhoto src={it.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{it.pet_name} <span className="font-normal text-slate-400">· {it.species}</span></div>
                      <div className="truncate text-[12px] text-slate-500">{it.tutor_name || '(sem nome)'} · {it.tutor_email}</div>
                      {(it.city || it.food_brand) && (
                        <div className="truncate text-[11px] text-slate-400">
                          {[it.city && it.state ? `${it.city}/${it.state}` : it.city, it.food_brand].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {data.items.length === 0 && <p className="text-[13px] text-slate-400">Nenhum pet nesse estágio.</p>}
              </div>
              <div className="mt-4"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedingSection({ filter }: { filter: GlobalFilter }) {
  const [drilldown, setDrilldown] = useState<{ stage: string; label: string } | null>(null);
  const { data, error, loading } = useAsync<FeedingFunnelResponse>(
    () => adminGet('/feeding-funnel', filterParams(filter)), [JSON.stringify(filter)],
  );
  const commerce = useAsync<CommerceFunnelResponse>(
    () => adminGet('/commerce-funnel', filterParams(filter)), [JSON.stringify(filter)],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" onClick={() => setDrilldown({ stage: 'controle_ativo', label: 'Controle alimentar ativo' })}
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left hover:border-emerald-400">
          <div className="text-[11px] font-bold uppercase text-emerald-700">Controle ativo</div>
          <div className="text-2xl font-black text-emerald-900">{numberFmt(data.funnel.find((s) => s.key === 'controle_ativo')?.pets)}</div>
        </button>
        <button type="button" onClick={() => setDrilldown({ stage: 'sem_inicio', label: 'Sem alimentação cadastrada' })}
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-left hover:border-rose-400">
          <div className="text-[11px] font-bold uppercase text-rose-700">Sem alimentação</div>
          <div className="text-2xl font-black text-rose-900">{numberFmt(data.funnel.find((s) => s.key === 'sem_inicio')?.pets)}</div>
          <div className="text-[11px] text-rose-600">
            {data.total_pets ? `${Math.round(((data.funnel.find((s) => s.key === 'sem_inicio')?.pets || 0) / data.total_pets) * 1000) / 10}% dos pets` : ''}
          </div>
        </button>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Ração acabando (7d)</div>
          <div className="text-2xl font-black text-slate-900">{numberFmt(data.ending_soon_7d)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Total de pets</div>
          <div className="text-2xl font-black text-slate-900">{numberFmt(data.total_pets)}</div>
        </div>
      </div>

      <Panel title="Onde o cadastro da ração para — clique numa etapa pra ver os pets/tutores">
        <div className="space-y-2">
          {data.funnel.map((s) => (
            <button key={s.key} type="button" onClick={() => setDrilldown({ stage: s.key, label: s.label })}
              className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-slate-50">
              <div className="w-56 flex-shrink-0 text-[13px] text-slate-700">{s.label}</div>
              <div className="h-5 flex-1 rounded bg-slate-100">
                <div className="flex h-full items-center rounded bg-[#0056D2] px-2 text-[11px] font-bold text-white"
                  style={{ width: `${Math.max(4, s.pct_of_total * 100)}%` }}>
                  {numberFmt(s.pets_at_or_beyond)}
                </div>
              </div>
              <div className="w-16 flex-shrink-0 text-right text-[12px] text-slate-500">{(s.pct_of_total * 100).toFixed(0)}%</div>
              <div className="w-24 flex-shrink-0 text-right text-[11px] text-slate-400">{s.pets} nesta etapa</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Barra = pets que chegaram até essa etapa ou além (cumulativo). &quot;Nesta etapa&quot; = pets que pararam exatamente aqui.
        </p>
      </Panel>

      <Panel title="Marcas mais cadastradas">
        {data.top_brands.length === 0 ? <p className="text-[13px] text-slate-400">Nenhuma marca cadastrada ainda.</p> : (
          <div className="flex flex-wrap gap-2">
            {data.top_brands.map((b) => (
              <span key={b.brand} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                {b.brand} <span className="text-slate-400">· {b.pets}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Funil comercial — Loja do Pet (eventos reais)">
        {commerce.loading && !commerce.data ? <Loading /> : commerce.data && (
          <div className="space-y-2">
            {commerce.data.steps.map((s) => (
              <div key={s.key} className="flex items-center gap-3 text-[13px]">
                <div className="w-56 flex-shrink-0 text-slate-600">{s.label}</div>
                <div className="h-5 flex-1 rounded bg-slate-100">
                  <div className="flex h-full items-center rounded bg-amber-500 px-2 text-[11px] font-bold text-white"
                    style={{ width: `${Math.max(4, (s.users / Math.max(1, commerce.data!.steps[0].users)) * 100)}%` }}>
                    {numberFmt(s.users)}
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {commerce.data.note}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="O que este painel NÃO mede hoje">
        <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-500">
          {data.instrumentation_gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </Panel>

      {drilldown && (
        <StageDrilldown stage={drilldown.stage} label={drilldown.label} filter={filter} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
