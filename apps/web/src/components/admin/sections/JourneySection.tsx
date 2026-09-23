'use client';

/**
 * Jornada e Conversão — funil de aquisição completo, do cadastro até a loja.
 *
 * Cohort real (respeita o filtro de período/UF/cidade) + drill-down por
 * etapa. Continuação do painel de Alimentação e Ração: aquele mostra ONDE
 * o cadastro da ração para; este mostra a jornada inteira até ali (e além,
 * até a intenção de compra na Loja do Pet). Mesmas limitações declaradas —
 * ver a caixa "o que este painel NÃO mede hoje" no fim.
 */
import { useState } from 'react';
import { adminGet, filterParams, type GlobalFilter } from '@/lib/admin/analyticsApi';
import { Pagination } from '@/components/admin/DataTable';
import { PetPhotoThumb } from '@/components/admin/PhotoLightbox';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

interface JourneyStepRow {
  key: string; label: string; users: number; pct_of_total: number; pct_from_previous: number | null;
}
interface JourneyFunnelResponse {
  cohort_total: number;
  cohort_note: string;
  steps: JourneyStepRow[];
  instrumentation_gaps: string[];
}
interface JourneyStepPopulationItem {
  user_id: string; name: string | null; email: string; city: string | null; state: string | null;
  created_at: string | null;
  pet_thumbnails: { pet_id: string; name: string; species: string; photo_url: string | null }[];
}
interface JourneyStepPopulationResponse {
  step: string; label: string; total: number; page: number; page_size: number;
  items: JourneyStepPopulationItem[];
}

function StepDrilldown({ step, label, filter, onClose }: {
  step: string; label: string; filter: GlobalFilter; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync<JourneyStepPopulationResponse>(
    () => adminGet(`/journey-funnel/${step}/population`, { ...filterParams(filter), page, page_size: 20 }),
    [step, page, JSON.stringify(filter)],
  );

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Jornada e Conversão</div>
            <h3 className="text-[16px] font-bold text-slate-900">{label}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !data ? <Loading /> : error ? <ErrorBox msg={error} /> : data && (
            <>
              <p className="mb-3 text-[12px] text-slate-500">{numberFmt(data.total)} tutor(es)</p>
              <div className="space-y-2">
                {data.items.map((it) => (
                  <div key={it.user_id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="font-semibold text-slate-900">{it.name || '(sem nome)'}</div>
                    <div className="truncate text-[12px] text-slate-500">{it.email}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{[it.city, it.state].filter(Boolean).join('/') || '—'}</span>
                      {it.pet_thumbnails.length > 0 && (
                        <div className="flex items-center -space-x-2">
                          {it.pet_thumbnails.map((p) => (
                            <PetPhotoThumb key={p.pet_id} src={p.photo_url} alt={p.name} size={24} className="border-2 border-white" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {data.items.length === 0 && <p className="text-[13px] text-slate-400">Nenhum tutor nessa etapa.</p>}
              </div>
              <div className="mt-4"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function JourneySection({ filter }: { filter: GlobalFilter }) {
  const [drilldown, setDrilldown] = useState<{ step: string; label: string } | null>(null);
  const { data, error, loading } = useAsync<JourneyFunnelResponse>(
    () => adminGet('/journey-funnel', filterParams(filter)), [JSON.stringify(filter)],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <Panel title="Funil de aquisição — do cadastro até a loja" right={<span className="text-[11px] text-slate-400">{numberFmt(data.cohort_total)} tutores no cohort</span>}>
        <div className="space-y-2">
          {data.steps.map((s) => (
            <button key={s.key} type="button" onClick={() => setDrilldown({ step: s.key, label: s.label })}
              className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-slate-50">
              <div className="w-56 flex-shrink-0 text-[13px] text-slate-700">{s.label}</div>
              <div className="h-5 flex-1 rounded bg-slate-100">
                <div className="flex h-full items-center rounded bg-[#0056D2] px-2 text-[11px] font-bold text-white"
                  style={{ width: `${Math.max(4, s.pct_of_total * 100)}%` }}>
                  {numberFmt(s.users)}
                </div>
              </div>
              <div className="w-20 flex-shrink-0 text-right text-[12px] text-slate-500">{(s.pct_of_total * 100).toFixed(1)}% total</div>
              <div className="w-24 flex-shrink-0 text-right text-[11px] text-slate-400">
                {s.pct_from_previous != null ? `${(s.pct_from_previous * 100).toFixed(0)}% do anterior` : '—'}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{data.cohort_note}</p>
      </Panel>

      <Panel title="O que este painel NÃO mede hoje">
        <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-500">
          {data.instrumentation_gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </Panel>

      {drilldown && (
        <StepDrilldown step={drilldown.step} label={drilldown.label} filter={filter} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
