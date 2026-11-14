'use client';

/**
 * Segmentação de público (tela principal de Campanhas): escolha o público com chips (espécie, sexo, idade, porte, aparelho, atividade…)
 * ou com os filtros avançados, e veja NA HORA quantos tutores serão alcançados. Só contagem: não cria campanha, não reserva, não envia
 * (usa apenas POST /audience/count, somente leitura). O botão "Criar campanha com este público" leva os filtros para a campanha.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { call, explainError, type AudienceCount, type FieldInfo } from './api';
import { FilterBuilder } from './FilterBuilder';
import { buildFilter, conditionCount, describeCond, emptyFilter, type FilterState } from './filters';
import { chipLocks, findConflicts } from './consistency';
import { AGE_BANDS, WEIGHT_BANDS, bandKey, pickBand, pickOne, quickCond, removeCond, toggleFlag, toggleIn } from './quickFilters';
import { numberFmt } from '@/components/admin/sections/sections';

function Chip({ on, onClick, children, hint, locked, title }: { on: boolean; onClick: () => void; children: React.ReactNode; hint?: string; locked?: string | null; title?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-disabled={!!locked} title={locked ?? title} onClick={() => { if (!locked) onClick(); }}
      className={`rounded-full border px-3.5 py-2 text-left text-[13.5px] font-semibold transition ${locked ? 'cursor-not-allowed opacity-50' : ''} ${on ? 'border-sky-600 bg-sky-600 text-white shadow-sm' : `border-slate-300 bg-white text-slate-700 ${locked ? '' : 'hover:border-sky-400 hover:bg-sky-50'}`}`}>
      {children}
      {hint && <span className={`ml-1.5 text-[11px] font-medium ${on ? 'text-sky-100' : 'text-slate-500'}`}>{hint}</span>}
    </button>
  );
}

function Group({ title, hint, children, note }: { title: string; hint?: string; children: React.ReactNode; note?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-[14px] font-extrabold text-slate-900">{title}</h4>
        {hint && <span className="text-[11.5px] text-slate-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note && <p role="note" className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] leading-snug text-amber-900">{note}</p>}
    </div>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] text-slate-600"><span>{label}</span><span>{numberFmt(n)}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden><div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function AudienceExplorer({ fields, state, onChange, onUse, locationNote, brandHints, maxBatch }: {
  maxBatch?: number | null; fields: FieldInfo[]; state: FilterState; onChange: (s: FilterState) => void; onUse?: (s: FilterState) => void;
  locationNote?: Record<string, string>; brandHints: { text: string; tutors: number }[];
}) {
  const built = useMemo(() => buildFilter(state, fields), [state, fields]);
  const sig = useMemo(() => JSON.stringify(built.filter), [built]);
  const [res, setRes] = useState<{ data: AudienceCount | null; sig: string | null; error: string | null }>({ data: null, sig: null, error: null });
  const [advanced, setAdvanced] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;                                    // resposta de consulta antiga nunca substitui a mais recente
    if (!built.ready) { setRes({ data: null, sig: null, error: null }); return; }
    const t = setTimeout(async () => {
      try {
        const data = await call<AudienceCount>('/audience/count', { filter: built.filter });
        if (mine === seq.current) setRes({ data, sig, error: null });
      } catch (e) { if (mine === seq.current) setRes({ data: null, sig: null, error: explainError(e).text }); }
    }, 400);
    return () => clearTimeout(t);
  }, [sig, built.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const by = useMemo(() => new Map(fields.map((f) => [f.field, f])), [fields]);
  const fresh = !!res.data && res.sig === sig;
  const d = fresh ? res.data! : null;
  const has = (field: string, v: string) => ((quickCond(state, field)?.value as string[] | undefined) ?? []).includes(v);
  const eq = (field: string, v: string) => quickCond(state, field)?.value === v;
  const chips = state.blocks.flatMap((b) => b.conds.map((c) => ({ id: c.id, text: describeCond(c, by.get(c.field)) })));
  const nothing = conditionCount(state) === 0;
  const locks = useMemo(() => chipLocks(state), [state]);
  const conflicts = useMemo(() => findConflicts(state, fields), [state, fields]);
  const lock = (...fs: string[]) => locks.all ?? fs.map((f) => locks.byField.get(f)).find(Boolean) ?? null;   // trava de um campo (ou geral)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── escolha do público ── */}
      <div className="space-y-3">
        {/* no celular o número fica sempre à vista enquanto você escolhe */}
        <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-3.5 py-2 text-white shadow-md lg:hidden" aria-hidden>
          <span className="text-[11px] font-bold uppercase tracking-wide text-sky-100">Alcançáveis por push</span>
          <span className="text-[22px] font-black leading-none">{!built.ready ? '—' : res.error ? '!' : d ? numberFmt(d.reachable) : '…'}</span>
          <span className="truncate text-[11.5px] text-sky-100">{nothing ? 'todos com push' : `${chips.length} filtro${chips.length === 1 ? '' : 's'}`}</span>
        </div>
        <Group title="Pet" hint="Os chips combinam no MESMO pet (ex.: gato + fêmea = gata)" note={locks.all ?? ['pet_species', 'pet_sex', 'pet_neutered_yes'].map((f) => locks.byField.get(f)).find(Boolean) ?? null}>
          <Chip locked={lock('pet_species')} on={has('pet_species', 'dog')} onClick={() => onChange(toggleIn(state, 'pet_species', 'dog'))}>Cão</Chip>
          <Chip locked={lock('pet_species')} on={has('pet_species', 'cat')} onClick={() => onChange(toggleIn(state, 'pet_species', 'cat'))}>Gato</Chip>
          <Chip locked={lock('pet_species')} on={has('pet_species', 'other')} onClick={() => onChange(toggleIn(state, 'pet_species', 'other'))}>Outro</Chip>
          <span className="mx-1 hidden w-px self-stretch bg-slate-200 sm:block" aria-hidden />
          <Chip locked={lock('pet_sex')} on={eq('pet_sex', 'male')} onClick={() => onChange(pickOne(state, 'pet_sex', 'male'))}>Macho</Chip>
          <Chip locked={lock('pet_sex')} on={eq('pet_sex', 'female')} onClick={() => onChange(pickOne(state, 'pet_sex', 'female'))}>Fêmea</Chip>
          <Chip locked={lock('pet_neutered_yes')} on={!!quickCond(state, 'pet_neutered_yes')} onClick={() => onChange(toggleFlag(state, 'pet_neutered_yes'))}>Castrado</Chip>
        </Group>
        <Group title="Idade do pet" hint="em meses completos; cada idade pertence a uma única faixa" note={lock('pet_age_months')}>
          {AGE_BANDS.map((b) => <Chip locked={lock('pet_age_months')} key={b.key} on={bandKey(state, 'pet_age_months', AGE_BANDS) === b.key} hint={b.hint} onClick={() => onChange(pickBand(state, 'pet_age_months', b))}>{b.label}</Chip>)}
        </Group>
        <Group title="Porte (peso)" hint="cada peso pertence a uma única faixa (peso com 2 casas, 0,01 kg)" note={lock('pet_weight_kg')}>
          {WEIGHT_BANDS.map((b) => <Chip locked={lock('pet_weight_kg')} key={b.key} on={bandKey(state, 'pet_weight_kg', WEIGHT_BANDS) === b.key} hint={b.hint} onClick={() => onChange(pickBand(state, 'pet_weight_kg', b))}>{b.label}</Chip>)}
        </Group>
        <Group title="Tutor" hint="Aparelho com push e atividade no app" note={lock('platform', 'tutor_activity')}>
          <Chip locked={lock('platform')} on={has('platform', 'ios')} onClick={() => onChange(toggleIn(state, 'platform', 'ios'))}>iPhone</Chip>
          <Chip locked={lock('platform')} on={has('platform', 'android')} onClick={() => onChange(toggleIn(state, 'platform', 'android'))}>Android</Chip>
          <Chip locked={lock('platform')} on={has('platform', 'web')} onClick={() => onChange(toggleIn(state, 'platform', 'web'))}>Navegador</Chip>
          <span className="mx-1 hidden w-px self-stretch bg-slate-200 sm:block" aria-hidden />
          <Chip locked={lock('tutor_activity')} on={eq('tutor_activity', 'last_7d')} onClick={() => onChange(pickOne(state, 'tutor_activity', 'last_7d'))}>Ativo nos últimos 7 dias</Chip>
          <Chip locked={lock('tutor_activity')} on={eq('tutor_activity', 'd8_30')} onClick={() => onChange(pickOne(state, 'tutor_activity', 'd8_30'))}>Ativo há 8 a 30 dias</Chip>
          <Chip locked={lock('tutor_activity')} on={eq('tutor_activity', 'over_30d')} onClick={() => onChange(pickOne(state, 'tutor_activity', 'over_30d'))}>Sumido há +30 dias</Chip>
        </Group>
        <Group title="Cuidados e ração" note={lock('feeding_registered', 'care_vaccine', 'care_parasite', 'care_grooming')}>
          <Chip locked={lock('feeding_registered')} on={!!quickCond(state, 'feeding_registered')} onClick={() => onChange(toggleFlag(state, 'feeding_registered'))}>Tem ração cadastrada</Chip>
          <Chip locked={lock('care_vaccine')} on={!!quickCond(state, 'care_vaccine')} onClick={() => onChange(toggleFlag(state, 'care_vaccine'))}>Tem vacina registrada</Chip>
          <Chip locked={lock('care_parasite')} on={!!quickCond(state, 'care_parasite')} onClick={() => onChange(toggleFlag(state, 'care_parasite'))}>Tem antipulgas/vermífugo</Chip>
          <Chip locked={lock('care_grooming')} on={!!quickCond(state, 'care_grooming')} onClick={() => onChange(toggleFlag(state, 'care_grooming'))}>Tem banho e tosa</Chip>
        </Group>

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
            <span><span className="text-[14px] font-extrabold text-slate-900">Mais filtros e combinações (E/OU)</span> <span className="text-[12px] text-slate-500">raça, cidade/estado, GPS, marca de ração, data de cadastro, vários blocos…</span></span>
            <span aria-hidden className="text-slate-500">{advanced ? '▾' : '▸'}</span>
          </button>
          {advanced && <div className="border-t border-slate-200 p-3"><FilterBuilder fields={fields} state={state} onChange={onChange} brandHints={brandHints} locationNote={locationNote} /></div>}
        </div>
      </div>

      {/* ── resumo ao vivo ── */}
      <aside aria-label="Resumo do público" className="lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-md">
          <div className="bg-gradient-to-br from-sky-600 to-indigo-600 p-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">Tutores alcançáveis por push</p>
            <p className="text-[44px] font-black leading-none" aria-live="polite" aria-busy={!fresh && built.ready}>
              {!built.ready ? '—' : res.error ? '!' : d ? numberFmt(d.reachable) : '…'}
            </p>
            <p className="mt-1 text-[12.5px] text-sky-100">
              {nothing ? 'Sem filtros: todos com push ativo' : d ? `${numberFmt(d.matches)} atendem aos filtros · ${numberFmt(d.not_reachable.no_push)} sem push · ${numberFmt(d.not_reachable.opt_out)} desligaram` : 'contando no servidor…'}
            </p>
          </div>
          <div className="space-y-3 p-4">
            <p className="rounded-lg bg-slate-50 p-2.5 text-[12px] leading-snug text-slate-700" data-testid="explicacao-alcancaveis">
              Este número é o <strong>público elegível</strong> (tutores com push ativo que atendem aos filtros), <strong>não a quantidade enviada</strong>. O envio é feito em lotes e cada lote respeita o limite por lote{typeof maxBatch === 'number' ? <> (hoje: <strong>{numberFmt(maxBatch)} tutor{maxBatch === 1 ? '' : 'es'}</strong>)</> : null}.
            </p>
            {conflicts.length > 0 && (
              <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[12.5px] leading-snug text-rose-900" data-testid="conflitos">
                <p className="font-bold">Filtros que se contradizem — ninguém será selecionado:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">{conflicts.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
              </div>
            )}
            {!built.ready && <p className="rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-900">Complete os filtros marcados com “Falta” para ver a contagem.</p>}
            {res.error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-800">{res.error}</p>}
            {d && (
              <div className="space-y-1.5" aria-label="Por aparelho">
                <Bar label="iPhone" n={d.by_platform.ios} total={d.reachable} />
                <Bar label="Android" n={d.by_platform.android} total={d.reachable} />
                <Bar label="Navegador" n={d.by_platform.web} total={d.reachable} />
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Seu filtro</p>
              {chips.length === 0 ? <p className="text-[12.5px] text-slate-500">Nenhum filtro: escolha ao lado.</p> : (
                <ul className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => onChange(removeCond(state, c.id))} aria-label={`Remover ${c.text}`}
                        className="rounded-full bg-sky-50 px-2.5 py-1 text-[12px] font-semibold text-sky-900 ring-1 ring-sky-200 hover:bg-rose-50 hover:text-rose-800 hover:ring-rose-200">{c.text} ✕</button>
                    </li>
                  ))}
                </ul>
              )}
              {chips.length > 0 && <button type="button" onClick={() => onChange(emptyFilter())} className="mt-2 text-[12px] font-semibold text-slate-600 underline">Limpar tudo</button>}
            </div>
            {d?.warnings.length ? (
              <ul className="space-y-1.5">
                {d.warnings.map((w, i) => <li key={`${w.code}-${i}`} className={`rounded-lg p-2 text-[12px] leading-snug ${w.level === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>{w.text}</li>)}
              </ul>
            ) : null}
            {onUse && (
              <button type="button" disabled={!built.ready || !d || d.reachable === 0 || conflicts.length > 0} onClick={() => onUse(state)}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-[14.5px] font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                Criar campanha com este público →
              </button>
            )}
            <p className="text-[11px] leading-snug text-slate-500">Aqui é só contagem: nada é criado, reservado ou enviado. O envio acontece em lotes, depois de você criar a campanha, ver a prévia e confirmar.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
