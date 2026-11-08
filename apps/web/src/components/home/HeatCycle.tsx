'use client';

/**
 * Registro de cio (fêmeas não castradas, cão e gato).
 *  - Botão discreto no canto da foto do pet (mesmo padrão da banheirinha); abre o sheet "Cio".
 *  - Tudo é ESTIMATIVA para o tutor se organizar — nunca "dias férteis" nem diagnóstico (ver lib/heatCycles.ts).
 *  - Previsão do próximo cio só para cadelas; gatas só registram (o ciclo delas varia muito).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SheetAvatar, SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { DateField } from '@/components/ui/DateField';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { createHeatCycle, deleteHeatCycle, fetchHeatCycles, updateHeatCycle } from '@/lib/heatApi';
import {
  cycleLengthDays, estimatedDueDate, heatButtonState, heatDayNumber, inPostHeatWatch, isLongHeat, openCycle,
  predictNextHeat, type HeatCycle,
} from '@/lib/heatCycles';
import { formatLocalDateOnly, localTodayISO } from '@/lib/localDate';
import { petSpeciesEmoji } from '@/lib/petTaxonomy';

const fmt = (iso: string) => formatLocalDateOnly(iso, 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtShort = (iso: string) => formatLocalDateOnly(iso, 'pt-BR', { day: '2-digit', month: '2-digit' });

interface Props {
  petId: string;
  petName: string;
  species: string;
  photoSrc?: string | null;
}

export function HeatCycleButton({ petId, petName, species, photoSrc }: Props) {
  const [cycles, setCycles] = useState<HeatCycle[] | null>(null);
  const [open, setOpen] = useState(false);
  const today = localTodayISO();

  useEffect(() => {
    let alive = true;
    void fetchHeatCycles(petId).then((list) => { if (alive) setCycles(list ?? []); });
    return () => { alive = false; };
  }, [petId]);

  const state = useMemo(() => heatButtonState(cycles ?? [], species, today), [cycles, species, today]);
  const label = state === 'in_heat' ? 'Cio — em andamento' : state === 'soon' ? 'Cio — chegando' : 'Cio';
  const tone =
    state === 'in_heat' ? 'border-white bg-rose-500 hover:bg-rose-600'
    : state === 'soon' ? 'border-amber-200 bg-amber-500 hover:bg-amber-600'
    : 'border-white/40 bg-black/30 hover:bg-black/50';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`relative flex h-8 items-center justify-center rounded-full border px-3 text-white shadow-lg backdrop-blur-md transition-all active:scale-90 sm:h-9 sm:px-3 ${tone}`}
      >
        {/* Só a palavra "Cio": nem o coração nem a gota diziam isso de imediato (feedback do dono, 08/11/2026). */}
        <span className="text-[12px] font-extrabold leading-none sm:text-[13px]">Cio</span>
      </button>
      {open && (
        <HeatSheet
          petId={petId}
          petName={petName}
          species={species}
          photoSrc={photoSrc ?? null}
          cycles={cycles ?? []}
          onChange={setCycles}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-slate-900';
const labelCls = 'mb-1 block text-[12px] font-bold text-slate-500';

function HeatSheet({
  petId, petName, species, photoSrc, cycles, onChange, onClose,
}: Props & { cycles: HeatCycle[]; onChange: (c: HeatCycle[]) => void; onClose: () => void }) {
  const today = localTodayISO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherDay, setOtherDay] = useState(false);
  const [startDay, setStartDay] = useState(today);
  const [editingId, setEditingId] = useState<string | null>(null);

  const current = openCycle(cycles);
  const prediction = predictNextHeat(cycles, species, today);
  const ordered = useMemo(() => [...cycles].sort((a, b) => b.started_on.localeCompare(a.started_on)), [cycles]);

  const run = useCallback(async <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, done?: string) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.message); return null; }
    if (done) showAppToast(done, { tone: 'success' });
    return r.data;
  }, []);

  const start = async () => {
    const created = await run(() => createHeatCycle(petId, { started_on: startDay }), `Cio de ${petName} registrado.`);
    if (created) { onChange([created, ...cycles]); setOtherDay(false); setStartDay(today); }
  };
  const finish = async () => {
    if (!current) return;
    const updated = await run(() => updateHeatCycle(petId, current.id, { ended_on: today }), 'Fim do cio registrado.');
    if (updated) onChange(cycles.map((c) => (c.id === updated.id ? updated : c)));
  };

  const status = current
    ? { label: `Em cio · dia ${heatDayNumber(current, today)}`, tone: 'warn' as const }
    : prediction && prediction.daysUntil <= 14
      ? { label: prediction.daysUntil >= 0 ? `Cio provável em ${prediction.daysUntil} dia${prediction.daysUntil === 1 ? '' : 's'}` : 'Cio provável agora', tone: 'warn' as const }
      : { label: cycles.length ? 'Fora do cio' : 'Sem registros', tone: 'neutral' as const };

  return (
    <SheetShell open onClose={onClose} hideHandle tone="grey" z={SHEET_Z.base}>
      <SheetHeader
        tone="petmol"
        withHandle
        title="Cio"
        subtitle={petName}
        status={status}
        media={<SheetAvatar src={photoSrc} alt={petName} fallback={petSpeciesEmoji(species)} />}
        onClose={onClose}
      />
      <SheetShell.Body>
        <div className="space-y-3">
          {/* Ação principal */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            {current ? (
              <>
                <p className="text-[15px] font-black text-slate-900">Em cio desde {fmt(current.started_on)}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">Dia {heatDayNumber(current, today)} do cio.</p>
                <button type="button" onClick={finish} disabled={busy}
                  className="mt-3 w-full rounded-xl bg-[#0056D2] py-3 text-[14px] font-extrabold text-white disabled:opacity-50 active:scale-[0.98]">
                  O cio terminou hoje
                </button>
                <button type="button" onClick={() => setEditingId(current.id)}
                  className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-[13px] font-bold text-slate-700 active:scale-[0.98]">
                  Anotar cruzamento ou observações
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-black text-slate-900">{cycles.length ? 'Começou um novo cio?' : `Registre o cio de ${petName}`}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">Um toque e o PETMOL guarda a data para você.</p>
                {otherDay && (
                  <div className="mt-3">
                    <label className={labelCls} htmlFor="heat-start">Dia em que começou</label>
                    <DateField id="heat-start" value={startDay} max={today} onChange={setStartDay} inputClassName={inputCls} />
                  </div>
                )}
                <button type="button" onClick={start} disabled={busy || !startDay}
                  className="mt-3 w-full rounded-xl bg-[#0056D2] py-3 text-[14px] font-extrabold text-white disabled:opacity-50 active:scale-[0.98]">
                  {otherDay ? 'Registrar cio' : 'Começou o cio hoje'}
                </button>
                {!otherDay && (
                  <button type="button" onClick={() => setOtherDay(true)}
                    className="mt-2 w-full text-center text-[12.5px] font-semibold text-slate-500 underline-offset-2 hover:underline">
                    Foi em outro dia
                  </button>
                )}
              </>
            )}
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{error}</p>}
          </section>

          {current && isLongHeat(current, today) && (
            <p className="rounded-2xl bg-amber-50 p-3.5 text-[13px] leading-snug text-amber-900">
              Este cio já passou de 4 semanas, mais do que o comum. Vale conversar com o veterinário.
            </p>
          )}

          {/* Previsão */}
          {!current && (
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Próximo cio</p>
              {species === 'dog' ? (
                prediction ? (
                  <>
                    <p className="mt-1 text-[15px] font-black text-slate-900">
                      Provável por volta de {fmt(prediction.nextOn)}
                    </p>
                    <p className="text-[13px] text-slate-500">
                      {prediction.daysUntil > 0 ? `Daqui a ${prediction.daysUntil} dias` : prediction.daysUntil === 0 ? 'É por volta de hoje' : `Já passou ${-prediction.daysUntil} dias da data estimada`}
                      {' · '}média de {prediction.intervalDays} dias entre cios ({prediction.samples} {prediction.samples === 1 ? 'intervalo' : 'intervalos'}).
                    </p>
                    <p className="mt-2 text-[12px] text-slate-400">É uma estimativa para você se organizar; cada cadela tem o seu ritmo.</p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] leading-snug text-slate-500">
                    Registre pelo menos dois cios e o PETMOL estima quando o próximo deve chegar.
                  </p>
                )
              ) : (
                <p className="mt-1 text-[13px] leading-snug text-slate-500">
                  Gatas têm ciclos bem irregulares, por isso aqui só registramos para você levar ao veterinário.
                </p>
              )}
            </section>
          )}

          {/* Cuidado depois do cio */}
          {inPostHeatWatch(cycles, today) && (
            <section className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
              <p className="text-[13px] font-black text-rose-800">Atenção nas próximas semanas</p>
              <p className="mt-1 text-[13px] leading-snug text-rose-900/90">
                Nas semanas depois do cio, se {petName} ficar muito abatida, beber água demais, perder o apetite, ter secreção ou a barriga inchada,
                procure um veterinário com urgência.
              </p>
            </section>
          )}

          {/* Histórico */}
          {ordered.length > 0 && (
            <section className="rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
              <p className="px-3 pb-1 pt-2.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">Histórico</p>
              <ul>
                {ordered.map((c) => {
                  const len = cycleLengthDays(c);
                  const due = estimatedDueDate(c.mated_on, species);
                  return (
                    <li key={c.id} className="border-t border-slate-100 first:border-t-0">
                      <button type="button" onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block text-[14px] font-bold text-slate-900">
                            {c.ended_on ? `${fmtShort(c.started_on)} → ${fmtShort(c.ended_on)}` : `Desde ${fmtShort(c.started_on)}`}
                            <span className="ml-1.5 text-[12px] font-semibold text-slate-400">{c.started_on.slice(0, 4)}</span>
                          </span>
                          <span className="block text-[12px] text-slate-500">
                            {len ? `${len} dias` : 'em andamento'}
                            {c.mated_on ? ` · cruzamento em ${fmtShort(c.mated_on)}` : ''}
                            {due ? ` · parto estimado ~${fmt(due)}` : ''}
                          </span>
                          {c.notes && <span className="mt-0.5 block truncate text-[12px] italic text-slate-400">{c.notes}</span>}
                        </span>
                        <span className="text-slate-300" aria-hidden>›</span>
                      </button>
                      {editingId === c.id && (
                        <HeatEditor
                          cycle={c}
                          petId={petId}
                          species={species}
                          today={today}
                          onSaved={(u) => { onChange(cycles.map((x) => (x.id === u.id ? u : x))); setEditingId(null); }}
                          onDeleted={() => { onChange(cycles.filter((x) => x.id !== c.id)); setEditingId(null); }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="px-1 pb-2 text-center text-[11.5px] leading-snug text-slate-400">
            As datas e estimativas ajudam você a se organizar e não substituem a orientação do veterinário.
          </p>
        </div>
      </SheetShell.Body>
    </SheetShell>
  );
}

function HeatEditor({
  cycle, petId, species, today, onSaved, onDeleted,
}: {
  cycle: HeatCycle; petId: string; species: string; today: string;
  onSaved: (c: HeatCycle) => void; onDeleted: () => void;
}) {
  const [startedOn, setStartedOn] = useState(cycle.started_on);
  const [endedOn, setEndedOn] = useState(cycle.ended_on ?? '');
  const [matedOn, setMatedOn] = useState(cycle.mated_on ?? '');
  const [notes, setNotes] = useState(cycle.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const due = estimatedDueDate(matedOn || null, species);

  const save = async () => {
    setBusy(true); setError(null);
    const r = await updateHeatCycle(petId, cycle.id, {
      started_on: startedOn,
      ended_on: endedOn || null,
      clear_ended_on: !endedOn && Boolean(cycle.ended_on),
      mated_on: matedOn || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    showAppToast('Cio atualizado.', { tone: 'success' });
    onSaved(r.data);
  };
  const remove = async () => {
    setBusy(true); setError(null);
    const r = await deleteHeatCycle(petId, cycle.id);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    showAppToast('Registro de cio removido.', { tone: 'success' });
    onDeleted();
  };

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-3 pb-3 pt-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls} htmlFor={`hs-${cycle.id}`}>Começou</label>
          <DateField id={`hs-${cycle.id}`} value={startedOn} max={today} onChange={setStartedOn} inputClassName={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`he-${cycle.id}`}>Terminou</label>
          <DateField id={`he-${cycle.id}`} value={endedOn} min={startedOn} max={today} onChange={setEndedOn} inputClassName={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor={`hm-${cycle.id}`}>Cruzamento (se houve)</label>
        <DateField id={`hm-${cycle.id}`} value={matedOn} min={startedOn} onChange={setMatedOn} inputClassName={inputCls} />
        {due && <p className="mt-1 text-[12px] text-slate-500">Parto estimado por volta de {fmt(due)} (estimativa).</p>}
      </div>
      <div>
        <label className={labelCls} htmlFor={`hn-${cycle.id}`}>Observações</label>
        <textarea id={`hn-${cycle.id}`} rows={2} maxLength={500} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: sangramento leve, mais carente, passeios só no quintal" />
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy || !startedOn}
          className="flex-1 rounded-xl bg-[#0056D2] py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-50 active:scale-[0.98]">Salvar</button>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy}
            className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] font-bold text-rose-600 disabled:opacity-50">Excluir</button>
        ) : (
          <button type="button" onClick={remove} disabled={busy}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-50">Confirmar</button>
        )}
      </div>
    </div>
  );
}
