'use client';

/**
 * Hoje — a tela que se abre de manhã. Mesma fonte do boletim diário por
 * e-mail (backend: briefing_bi.build_brief): o que aparece aqui e o que
 * chega no e-mail nunca divergem.
 *
 * "Hoje" é parcial (o dia ainda não acabou) — comparar um dia pela metade
 * com o dia anterior fechado daria "queda" toda manhã, então nele os
 * números de referência aparecem CRUS (ontem / média de 7 dias), sem %.
 * Dia fechado (ontem, ou uma data escolhida) mostra a variação em %.
 */
import { useState } from 'react';
import { adminGet, type BriefResponse, type BriefMetric, type OverviewResponse } from '@/lib/admin/analyticsApi';
import { StatCard } from '@/components/admin/charts/Charts';
import { spIsoDate, spYesterdayRange } from '@/lib/analytics/spTime';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

type DayMode = 'today' | 'yesterday' | 'custom';

const SEVERITY_ICON = { critical: '🔴', attention: '🟠', info: '🔵' } as const;

function deltaText(pct: number | null): string {
  if (pct === null) return 'sem base';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function metricSub(m: BriefMetric, isToday: boolean): string {
  if (isToday) return `ontem ${numberFmt(m.prev)} · média 7d ${numberFmt(m.avg7)}`;
  return `${deltaText(m.delta_prev_pct)} vs dia anterior · ${deltaText(m.delta_avg7_pct)} vs média 7d`;
}

export function TodaySection({ onOpenPeople, onOpenLocations, onOpenModeration }: {
  onOpenPeople?: () => void;
  onOpenLocations?: () => void;
  onOpenModeration?: () => void;
}) {
  const [mode, setMode] = useState<DayMode>('today');
  const [customDay, setCustomDay] = useState('');

  const day = mode === 'yesterday' ? spIsoDate(spYesterdayRange().start) : mode === 'custom' ? customDay : '';
  const ready = mode !== 'custom' || Boolean(customDay);

  const { data, error, loading } = useAsync<BriefResponse | null>(
    () => (!ready ? Promise.resolve(null) : day ? adminGet<BriefResponse>('/brief', { day }) : adminGet<BriefResponse>('/today')),
    [mode, day],
  );

  const tabs: { key: DayMode; label: string }[] = [
    { key: 'today', label: 'Hoje (parcial)' }, { key: 'yesterday', label: 'Ontem (fechado)' }, { key: 'custom', label: 'Outra data' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setMode(t.key)}
            className={`rounded-md px-2.5 py-1 font-semibold ${
              mode === t.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
            {t.label}
          </button>
        ))}
        {mode === 'custom' && (
          <input type="date" value={customDay} aria-label="Dia" onChange={(e) => setCustomDay(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1" />
        )}
        {data && <span className="ml-1 font-semibold text-slate-500">{data.label}</span>}
      </div>

      {!ready ? <p className="text-[13px] text-slate-400">Escolha um dia.</p>
        : loading && !data ? <Loading />
        : error || !data ? <ErrorBox msg={error} />
        : (
          <>
            {data.attention.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Precisa de você</p>
                <ul className="space-y-1 text-[13px] text-slate-700">
                  {data.attention.map((a) => {
                    const action = a.key === 'moderation' ? onOpenModeration : a.key === 'stuck_no_pet' ? onOpenPeople : undefined;
                    return (
                      <li key={a.key}>
                        {SEVERITY_ICON[a.severity]}{' '}
                        {action ? <button type="button" onClick={action} className="text-left underline decoration-dotted hover:text-slate-900">{a.message}</button> : a.message}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <StatCard label="Downloads" tone="good" value={numberFmt(data.metrics.downloads.value)}
                sub={metricSub(data.metrics.downloads, data.is_today)} onClick={onOpenLocations} />
              <StatCard label="Acessos" value={numberFmt(data.metrics.acessos.value)}
                sub={`${numberFmt(data.metrics.visitantes.value)} visitantes únicos · ${metricSub(data.metrics.acessos, data.is_today)}`}
                onClick={onOpenLocations} />
              <StatCard label="Cadastros" tone="green" value={numberFmt(data.metrics.cadastros.value)}
                sub={metricSub(data.metrics.cadastros, data.is_today)} onClick={onOpenPeople} />
              <StatCard label="Pets cadastrados" tone="blue" value={numberFmt(data.metrics.pets_novos.value)}
                sub={metricSub(data.metrics.pets_novos, data.is_today)} onClick={onOpenPeople} />
              <StatCard label="Tutores ativos" tone="violet" value={numberFmt(data.metrics.ativos.value)}
                sub={metricSub(data.metrics.ativos, data.is_today)} onClick={onOpenPeople} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Funil do dia">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {data.funnel.map((f, i) => (
                    <span key={f.label} className="flex items-center gap-2">
                      {i > 0 && <span className="text-slate-300">→</span>}
                      <span><b className="text-[16px] tabular-nums">{numberFmt(f.n)}</b> <span className="text-slate-500">{f.label.toLowerCase()}</span></span>
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Loja e Pet Sumido">
                <p className="text-[13px] text-slate-700">
                  Loja: <b>{numberFmt(data.metrics.loja_aberturas.value)}</b> aberturas · <b>{numberFmt(data.metrics.loja_cliques.value)}</b> cliques em ofertas<br />
                  Pet Sumido: <b>{numberFmt(data.metrics.sumido_novos.value)}</b> novo(s) alerta(s) · <b>{numberFmt(data.metrics.sumido_encontrados.value)}</b> encontrado(s)
                </p>
              </Panel>

              <Panel title="Campanhas (top 3)">
                {data.campaigns.length === 0 ? <p className="text-[13px] text-slate-400">Sem acessos/downloads no dia.</p> : (
                  <table className="w-full text-[13px]"><tbody>
                    {data.campaigns.map((c) => (
                      <tr key={`${c.utm_source}|${c.utm_campaign}`} className="border-t border-slate-100 first:border-0">
                        <td className="py-1.5 font-medium">{c.utm_campaign}<span className="text-slate-400"> · {c.utm_source}</span></td>
                        <td className="py-1.5 text-right tabular-nums">{numberFmt(c.downloads)} downloads</td>
                        <td className="py-1.5 text-right tabular-nums">{numberFmt(c.acessos)} acessos</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
                {!data.has_campaign_attribution && data.campaigns.length > 0 && (
                  <p className="mt-2 text-[11px] text-amber-700">Nenhum tráfego com UTM no dia — tudo caiu em direto/orgânico.</p>
                )}
              </Panel>

              <Panel title="Onde (top 5 cidades, por IP)" right={onOpenLocations && (
                <button type="button" onClick={onOpenLocations} className="text-[11px] font-semibold text-[#0056D2] hover:underline">ver tudo →</button>
              )}>
                {data.cities.length === 0 ? <p className="text-[13px] text-slate-400">Sem acessos/downloads no dia.</p> : (
                  <table className="w-full text-[13px]"><tbody>
                    {data.cities.map((c) => (
                      <tr key={`${c.city}|${c.region}`} className="border-t border-slate-100 first:border-0">
                        <td className="py-1.5 font-medium">{c.city}{c.region ? <span className="text-slate-400"> · {c.region}</span> : null}</td>
                        <td className="py-1.5 text-right tabular-nums">{numberFmt(c.downloads)} downloads</td>
                        <td className="py-1.5 text-right tabular-nums">{numberFmt(c.acessos)} acessos</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </Panel>
            </div>

            {data.suggestion && (
              <Panel title="Sugestão do dia">
                <p className="text-[13px] font-semibold text-slate-800">{data.suggestion.title}</p>
                <p className="mt-1 text-[12px] text-slate-600">{data.suggestion.body}</p>
              </Panel>
            )}

            <p className="text-[11px] text-slate-400">{data.note}</p>
          </>
        )}
    </div>
  );
}


interface MissingPetsSummary { active: number; found_total: number; found_with_petmol_participation: number }

/** Base total — o que sobrou de útil dos antigos "Indicadores gerais" (o
 * resto era repetido em Alimentação, Funcionalidades, Qualidade dos dados e
 * Plataformas): quantos tutores/pets existem, quantos estão parados e quantos
 * voltam. Muda devagar — atualiza a cada 60s, não a cada 20s. */
export function BaseStrip({ onOpenPeople, onOpenMissingPets }: {
  onOpenPeople?: () => void; onOpenMissingPets?: () => void;
}) {
  const ov = useAsync<OverviewResponse>(() => adminGet('/overview'), [], { intervalMs: 60000 });
  const missing = useAsync<MissingPetsSummary>(() => adminGet('/missing-pets-summary'), [], { intervalMs: 60000 });
  if (ov.loading && !ov.data) return <Loading />;
  if (ov.error || !ov.data) return <ErrorBox msg={ov.error} />;
  const d = ov.data;

  return (
    <Panel title="Base total" right={<span className="text-[11px] text-slate-400">a foto de agora, não do dia</span>}>
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Tutores" tone="green" value={numberFmt(d.totals.users)}
          sub={`+${numberFmt(d.totals.new_users_7d)} em 7d · +${numberFmt(d.totals.new_users_30d)} em 30d`} onClick={onOpenPeople} />
        <StatCard label="Pets" tone="blue" value={numberFmt(d.totals.pets)}
          sub={`${d.tutors.avg_pets_per_tutor} por tutor`} onClick={onOpenPeople} />
        <StatCard label="Tutores sem pet" value={numberFmt(d.tutors.without_pet)}
          tone={d.tutors.without_pet > 0 ? 'warn' : 'default'} onClick={onOpenPeople} />
        <StatCard label="Ativos 24h" tone="violet" value={numberFmt(d.engagement.active_users_24h)}
          sub={`semana ${numberFmt(d.engagement.wau)} · mês ${numberFmt(d.engagement.mau)}`} onClick={onOpenPeople} />
        <StatCard label="Pets desaparecidos" tone="red" value={missing.data ? numberFmt(missing.data.active) : '—'}
          sub="ativos agora" onClick={onOpenMissingPets} />
        <StatCard label="Encontrados c/ ajuda" tone="teal"
          value={missing.data ? numberFmt(missing.data.found_with_petmol_participation) : '—'}
          sub={missing.data ? `${numberFmt(missing.data.found_total)} no total` : undefined} onClick={onOpenMissingPets} />
      </div>
    </Panel>
  );
}
