'use client';

/**
 * Painel "Planos de alimentação com previsão vencida": quantos planos ativos têm a data de fim PREVISTA no passado, por faixa de atraso e
 * por origem da data (calculada pelo sistema × informada pelo tutor), e quantos tutores alcançáveis por push (sem contar o mesmo tutor duas
 * vezes). Só leitura: nada aqui altera, pausa ou exclui plano, nem envia notificação. O botão apenas PREPARA uma campanha (filtro pronto).
 */
import { useEffect, useState } from 'react';
import { call, explainError, type ExpiredBucket, type ExpiredFeedingPlans } from './api';
import { emptyFilter, type FilterState } from './filters';
import { setQuick } from './quickFilters';
import { numberFmt } from '@/components/admin/sections/sections';

const stateFor = (b: ExpiredBucket | null): FilterState => {
  if (!b) return setQuick(emptyFilter(), 'feeding_expired', { op: 'eq', value: true, ack: false });
  const cond = b.max_days === null ? { op: 'gte', value: String(b.min_days), ack: false } : { op: 'between', value: [String(b.min_days), String(b.max_days)], ack: false };
  return setQuick(emptyFilter(), 'feeding_overdue_days', cond);
};

export function ExpiredFeedingPlansPanel({ onPrepare }: { onPrepare: (s: FilterState) => void }) {
  const [data, setData] = useState<ExpiredFeedingPlans | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    call<ExpiredFeedingPlans>('/audience/expired-feeding-plans').then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr(explainError(e).text); });
    return () => { alive = false; };
  }, []);

  return (
    <section aria-labelledby="planos-vencidos" className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <header className="mb-3">
        <h3 id="planos-vencidos" className="text-[17px] font-black tracking-tight text-slate-900">Planos de alimentação com previsão vencida</h3>
        <p className="text-[12.5px] leading-snug text-slate-600">
          A data de fim vem do plano do tutor (calculada pelo sistema ou informada por ele) e <strong>pode estar desatualizada</strong>: ele pode já ter comprado.
          Aqui você só consulta e prepara uma campanha; nenhum plano é alterado, pausado ou excluído.
        </p>
      </header>
      {err && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-800">{err}</p>}
      {!data && !err && <p className="text-[13px] text-slate-500">Carregando…</p>}
      {data && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <caption className="sr-only">Planos com previsão vencida por faixa de atraso</caption>
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-1.5 pr-2">Atraso da previsão</th>
                  <th scope="col" className="px-2 text-right">Planos</th>
                  <th scope="col" className="px-2 text-right">Calculada pelo sistema</th>
                  <th scope="col" className="px-2 text-right">Informada pelo tutor</th>
                  <th scope="col" className="px-2 text-right">Tutores alcançáveis por push</th>
                  <th scope="col" className="pl-2"><span className="sr-only">Ação</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.buckets.map((b) => (
                  <tr key={b.key} data-testid={`faixa-${b.key}`}>
                    <th scope="row" className="py-2 pr-2 font-semibold text-slate-800">{b.label}</th>
                    <td className="px-2 text-right tabular-nums">{numberFmt(b.plans)}</td>
                    <td className="px-2 text-right tabular-nums">{numberFmt(b.calculated)}</td>
                    <td className="px-2 text-right tabular-nums">{numberFmt(b.manual)}</td>
                    <td className="px-2 text-right font-bold tabular-nums">{numberFmt(b.tutors_reachable)}</td>
                    <td className="pl-2 text-right">
                      <button type="button" disabled={b.tutors_reachable === 0} onClick={() => onPrepare(stateFor(b))} aria-label={`Preparar campanha para a faixa ${b.label}`}
                        className="rounded-lg border border-emerald-600 px-2.5 py-1 text-[12px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">Preparar campanha</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-extrabold text-slate-900" data-testid="faixa-total">
                  <th scope="row" className="py-2 pr-2">Total</th>
                  <td className="px-2 text-right tabular-nums">{numberFmt(data.total.plans)}</td>
                  <td className="px-2 text-right tabular-nums">{numberFmt(data.total.calculated)}</td>
                  <td className="px-2 text-right tabular-nums">{numberFmt(data.total.manual)}</td>
                  <td className="px-2 text-right tabular-nums">{numberFmt(data.total.tutors_reachable)}</td>
                  <td className="pl-2 text-right">
                    <button type="button" disabled={data.total.tutors_reachable === 0} onClick={() => onPrepare(stateFor(null))} aria-label="Preparar campanha para todos os planos com previsão vencida"
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Preparar campanha</button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11.5px] leading-snug text-slate-600" data-testid="nota-sem-duplicar">
            Tutores contam <strong>uma vez só</strong>, mesmo com vários pets vencidos: o total ({numberFmt(data.total.tutors_reachable)}) pode ser menor que a soma das faixas.
            Alcançáveis = com push ativo e sem ter desligado. Referência: hoje, {data.today} · {numberFmt(data.plans_with_end_date)} planos ativos com data de fim, de {numberFmt(data.active_plans)} ativos.
          </p>
          <p className="text-[11.5px] leading-snug text-slate-500">Preparar abre a criação de campanha com o filtro já escolhido (você revisa, vê a prévia e confirma). Nada é enviado automaticamente.</p>
        </div>
      )}
    </section>
  );
}
