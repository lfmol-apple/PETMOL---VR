'use client';

/**
 * Buscas — o que as pessoas procuram na Loja e onde ainda falta link comissionável.
 * Dados agregados por dia + termo (sem tutor, sem IP, sem aparelho, sem texto bruto). Só termos com 3+ buscas.
 * "Comissionável" é calculado na hora, por loja; "Amazon" é curadoria manual e não é consultável por produto.
 */
import { useState } from 'react';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';

export interface SearchItem {
  kind: string; label: string; key: string; searches: number; zero_results: number; zero_pct: number; matched_products: number;
  no_result: boolean; no_commissionable_link: boolean; ml_gap: boolean;
  commission: { cobasi: boolean; mercadolivre: boolean; amazon: boolean | null };
}
export interface SearchReport {
  days: number; min_searches: number; total_searches: number; unrecognized_searches: number; rejected_total: number; collecting: boolean;
  rejected_searches: { reason: string; label: string; searches: number }[];
  no_result: SearchItem[]; no_commissionable_link: SearchItem[]; opportunities: SearchItem[]; items: SearchItem[];
  retention: { daily_days: number; monthly_months: number; monthly_min_searches: number };
}

function Dot({ ok, na }: { ok: boolean | null; na?: boolean }) {
  if (ok === null || na) return <span className="text-slate-300" title="Não consultável por produto">—</span>;
  return ok ? <span className="font-bold text-emerald-600">Sim</span> : <span className="font-bold text-rose-600">Não</span>;
}

function Table({ rows, empty }: { rows: SearchItem[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-slate-400">
          <tr><th className="py-2 pr-3">Produto ou termo</th><th className="px-2">Buscas</th><th className="px-2">Sem resultado</th><th className="px-2">Cobasi</th><th className="px-2">Mercado Livre</th><th className="px-2">Amazon</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.key}`} className="border-t border-slate-100">
              <td className="py-2 pr-3 font-semibold text-slate-800">{r.label}{r.kind === 'gtin' && <span className="ml-1.5 text-[11px] font-normal text-slate-400">código de barras</span>}</td>
              <td className="px-2 tabular-nums">{numberFmt(r.searches)}</td>
              <td className="px-2 tabular-nums">{r.zero_pct}%</td>
              <td className="px-2"><Dot ok={r.commission.cobasi} /></td>
              <td className="px-2"><Dot ok={r.commission.mercadolivre} /></td>
              <td className="px-2"><Dot ok={r.commission.amazon} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BuscasTab() {
  const [days, setDays] = useState<7 | 30>(30);
  const rep = useAsync<SearchReport>(() => adminApi('/search-demand/report', { params: { days } }), [days], { intervalMs: 300000 });
  const d = rep.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {([7, 30] as const).map((n) => (
          <button key={n} type="button" onClick={() => setDays(n)}
            className={`rounded-md px-2.5 py-1 font-semibold ${days === n ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{n} dias</button>
        ))}
        {d && <span className={`ml-2 rounded-full px-2.5 py-1 font-semibold ${d.collecting ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{d.collecting ? 'Coleta ligada' : 'Coleta desligada — nada está sendo registrado'}</span>}
      </div>

      {rep.loading && !d ? <Loading /> : rep.error || !d ? <ErrorBox msg={rep.error} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Buscas</p><p className="mt-1 text-[32px] font-black leading-none text-slate-900">{numberFmt(d.total_searches)}</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Sem resultado</p><p className="mt-1 text-[32px] font-black leading-none text-slate-900">{numberFmt(d.no_result.length)}</p><p className="mt-1 text-[12px] text-slate-500">termos com 3+ buscas</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Sem link no Mercado Livre</p><p className="mt-1 text-[32px] font-black leading-none text-[#0056D2]">{numberFmt(d.items.filter((i) => i.ml_gap && !i.no_result).length)}</p><p className="mt-1 text-[12px] text-slate-500">com resultado, sem link comissionável</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Não reconhecidas</p><p className="mt-1 text-[32px] font-black leading-none text-slate-900">{numberFmt(d.unrecognized_searches + d.rejected_total)}</p><p className="mt-1 text-[12px] text-slate-500">contadas sem guardar o texto</p></div>
          </div>

          <Card title="Produtos mais pesquisados" subtitle="Tudo o que as pessoas procuraram no período (3+ buscas), da maior demanda para a menor — com ou sem resultado, com ou sem link.">
            <Table rows={d.items} empty="Nenhum termo com 3 ou mais buscas no período." />
          </Card>

          <Card title="Oportunidades comerciais por demanda" subtitle="Soma das duas listas abaixo mais produtos que têm link na Cobasi mas ainda não no Mercado Livre — ordenadas por número de buscas.">
            <Table rows={d.opportunities} empty="Nenhum termo com 3 ou mais buscas no período." />
          </Card>

          <Card title="Buscas sem resultado" subtitle="O produto não existe no catálogo — a solução é incluir o produto, não gerar link.">
            <Table rows={d.no_result} empty="Nenhuma busca frequente ficou sem resultado." />
          </Card>

          <Card title="Com resultado, sem link comissionável" subtitle="O produto existe, mas nenhuma loja com comissão conhecida cobre ele hoje.">
            <Table rows={d.no_commissionable_link} empty="Todos os produtos buscados têm ao menos uma loja comissionável." />
          </Card>

          <Card title="Privacidade" subtitle="O que este painel nunca mostra.">
            <p className="text-[13px] text-slate-600">
              Não guardamos quem buscou, IP, aparelho, sessão nem o texto digitado. Só contagem por dia de termos do catálogo e códigos de barras válidos; termos com
              nomes, contatos ou números pessoais viram apenas uma contagem. Dados diários ficam {d.retention.daily_days} dias; o resumo mensal ({d.retention.monthly_months} meses) só guarda termos com {d.retention.monthly_min_searches}+ buscas.
              {d.rejected_searches.length > 0 && <> Rejeitadas: {d.rejected_searches.map((r) => `${r.label} (${r.searches})`).join(', ')}.</>}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
