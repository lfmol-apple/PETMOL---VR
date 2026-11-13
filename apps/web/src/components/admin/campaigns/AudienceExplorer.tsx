'use client';

/**
 * "Explorar o público": os MESMOS filtros da campanha, visíveis logo ao entrar em Campanhas, só com a contagem de quem atende.
 * Não cria campanha, não reserva ninguém e não envia nada (usa só POST /audience/count, que é somente leitura).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { call, explainError, type AudienceCount, type FieldInfo } from './api';
import { FilterBuilder } from './FilterBuilder';
import { buildFilter, emptyFilter, type FilterState } from './filters';
import { numberFmt } from '@/components/admin/sections/sections';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-slate-900">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-[22px] font-extrabold leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}

export function AudienceExplorer({ fields, locationNote, brandHints }: {
  fields: FieldInfo[]; locationNote?: Record<string, string>; brandHints: { text: string; tutors: number }[];
}) {
  const [state, setState] = useState<FilterState>(emptyFilter());
  const built = useMemo(() => buildFilter(state, fields), [state, fields]);
  const sig = useMemo(() => JSON.stringify(built.filter), [built]);
  const [res, setRes] = useState<{ data: AudienceCount | null; sig: string | null; error: string | null }>({ data: null, sig: null, error: null });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;                                    // resposta de consulta antiga nunca substitui a mais recente
    if (!built.ready) { setRes({ data: null, sig: null, error: null }); return; }
    const t = setTimeout(async () => {
      try {
        const data = await call<AudienceCount>('/audience/count', { filter: built.filter });
        if (mine === seq.current) setRes({ data, sig, error: null });
      } catch (e) { if (mine === seq.current) setRes({ data: null, sig: null, error: explainError(e).text }); }
    }, 450);
    return () => clearTimeout(t);
  }, [sig, built.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = !!res.data && res.sig === sig;
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-sky-50 p-2.5 text-[12.5px] leading-snug text-sky-900">
        Monte os filtros (cão, gato, sexo, idade, peso, raça, cidade, ração, vacinas, atividade…) e veja <strong>quantos tutores</strong> atendem. Aqui é <strong>só contagem</strong>: nada é criado, reservado ou enviado. Para enviar, crie uma campanha abaixo e use os mesmos filtros.
      </p>
      <FilterBuilder fields={fields} state={state} onChange={setState} brandHints={brandHints} locationNote={locationNote} />
      <div aria-live="polite" aria-busy={!fresh && built.ready}>
        {!built.ready ? <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Complete os filtros marcados com “Falta” para ver a contagem.</p>
          : res.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{res.error}</p>
          : !fresh ? <p role="status" className="text-[13px] text-slate-500">Contando no servidor…</p> : (
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label="Atendem aos filtros" value={numberFmt(res.data!.matches)} />
                <Tile label="Alcançáveis por push" value={numberFmt(res.data!.reachable)} hint={`sem push ${numberFmt(res.data!.not_reachable.no_push)} · desligaram ${numberFmt(res.data!.not_reachable.opt_out)}`} />
                <Tile label="iPhone / Android" value={`${numberFmt(res.data!.by_platform.ios)} / ${numberFmt(res.data!.by_platform.android)}`} hint={`web ${numberFmt(res.data!.by_platform.web)}`} />
                <Tile label="Quem receberia (máx. por lote)" value="até o limite" hint="o limite por lote vale no envio" />
              </div>
              {res.data!.warnings.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {res.data!.warnings.map((w, i) => <li key={`${w.code}-${i}`} className={`rounded-lg p-2.5 text-[12.5px] leading-snug ${w.level === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>{w.text}</li>)}
                </ul>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
