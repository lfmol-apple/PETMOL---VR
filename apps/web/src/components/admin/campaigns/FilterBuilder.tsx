'use client';

/**
 * Passo 3 — filtros combináveis. Blocos de condições (E/OU), escopo de pets por bloco, catálogo em grupos expansíveis.
 * Usa SÓ os campos que o backend publica em /fields (os 21 da Etapa 2). Nada de campo inventado.
 */
import { useState } from 'react';
import type { FieldInfo } from './api';
import { GROUPS, PET_SCOPE_LABEL, VALUE_LABEL, defaultCond, condError, kindOf, uid, type Block, type Cond, type FilterState, type Op, type PetScope } from './filters';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';
const small = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-slate-900';

function Multi({ id, f, c, onChange }: { id: string; f: FieldInfo; c: Cond; onChange: (v: unknown) => void }) {
  const sel = (c.value as string[]) ?? [];
  return (
    <fieldset>
      <legend className="sr-only">{f.label}</legend>
      <div className="flex flex-wrap gap-2">
        {(f.values ?? []).map((v) => {
          const on = sel.includes(String(v));
          return (
            <label key={String(v)} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] ${on ? 'border-sky-500 bg-sky-50 font-semibold text-sky-900' : 'border-slate-300 bg-white text-slate-700'}`}>
              <input type="checkbox" className="h-4 w-4" checked={on} id={`${id}-${v}`}
                onChange={() => onChange(on ? sel.filter((x) => x !== v) : [...sel, String(v)])} />
              {VALUE_LABEL[String(v)] ?? String(v)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CondEditor({ f, c, onChange, brandHints }: { f: FieldInfo; c: Cond; onChange: (patch: Partial<Cond>) => void; brandHints: { text: string; tutors: number }[] }) {
  const k = kindOf(f);
  const id = `cond-${c.id}`;
  if (k === 'flag') return <p className="text-[13px] text-slate-600">Quem tem este dado cadastrado.</p>;
  if (k === 'multi') return <Multi id={id} f={f} c={c} onChange={(value) => onChange({ value })} />;
  if (k === 'single') {
    return (
      <select aria-label={f.label} className={input} value={String(c.value ?? '')} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">Escolher…</option>
        {(f.values ?? []).map((v) => <option key={String(v)} value={String(v)}>{VALUE_LABEL[String(v)] ?? String(v)}</option>)}
      </select>
    );
  }
  if (k === 'text') {
    return (
      <div>
        <input aria-label={f.label} className={input} maxLength={60} value={String(c.value ?? '')} placeholder="Digite parte do texto (sem diferença de acento/maiúscula)"
          onChange={(e) => onChange({ value: e.target.value })} />
        {f.field === 'feeding_brand_contains' && brandHints.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Sugestões de marca">
            {brandHints.map((b) => (
              <button type="button" key={b.text} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-200" onClick={() => onChange({ value: b.text })}>
                {b.text} <span className="text-slate-500">· {b.tutors} tutores</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (k === 'list') {
    const text = Array.isArray(c.value) ? (c.value as string[]).join(', ') : '';
    return (
      <div>
        <input aria-label={f.label} className={input} value={text} placeholder={f.field.endsWith('state') ? 'Ex.: SP, RJ' : f.field.endsWith('city') ? 'Ex.: Campinas, Santos' : 'Ex.: São Paulo'}
          onChange={(e) => onChange({ value: e.target.value.split(',').map((s) => s.trimStart()) })} />
        <p className="mt-1 text-[11px] text-slate-500">Separe por vírgula (até 30). Aceita um ou mais.</p>
      </div>
    );
  }
  if (k === 'gps') {
    const o = (c.value ?? {}) as Record<string, string>;
    const set = (key: string, v: string) => onChange({ value: { ...o, [key]: v } });
    return (
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[12px] font-bold text-slate-600">Latitude<input inputMode="decimal" className={input} value={o.lat ?? ''} onChange={(e) => set('lat', e.target.value)} /></label>
        <label className="text-[12px] font-bold text-slate-600">Longitude<input inputMode="decimal" className={input} value={o.lng ?? ''} onChange={(e) => set('lng', e.target.value)} /></label>
        <label className="text-[12px] font-bold text-slate-600">Raio (km)<input inputMode="decimal" className={input} value={o.km ?? ''} onChange={(e) => set('km', e.target.value)} /></label>
      </div>
    );
  }
  // number | date
  const isDate = k === 'date';
  const pair = c.op === 'between';
  const arr = Array.isArray(c.value) ? (c.value as string[]) : ['', ''];
  const one = (v: unknown, onV: (s: string) => void, label: string) => (
    <input aria-label={label} type={isDate ? 'date' : 'number'} min={isDate ? undefined : 0} inputMode={isDate ? undefined : 'decimal'} className={input} value={String(v ?? '')} onChange={(e) => onV(e.target.value)} />
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`${f.label}: comparação`} className={small} value={c.op}
        onChange={(e) => onChange({ op: e.target.value, value: e.target.value === 'between' ? ['', ''] : '' })}>
        {f.ops.map((o) => <option key={o} value={o}>{{ eq: 'é igual a', gte: isDate ? 'a partir de' : 'no mínimo', lte: isDate ? 'até' : 'no máximo', between: 'entre' }[o] ?? o}</option>)}
      </select>
      {pair ? (
        <>
          <div className="min-w-[8rem] flex-1">{one(arr[0], (s) => onChange({ value: [s, arr[1] ?? ''] }), `${f.label}: início`)}</div>
          <span className="text-[12px] text-slate-500">e</span>
          <div className="min-w-[8rem] flex-1">{one(arr[1], (s) => onChange({ value: [arr[0] ?? '', s] }), `${f.label}: fim`)}</div>
        </>
      ) : <div className="min-w-[8rem] flex-1">{one(c.value, (s) => onChange({ value: s }), f.label)}</div>}
    </div>
  );
}

function FieldPicker({ fields, onPick, onClose }: { fields: FieldInfo[]; onPick: (f: FieldInfo) => void; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2" role="group" aria-label="Escolha um filtro">
      {GROUPS.map((g) => {
        const list = fields.filter((f) => f.group === g.key);
        if (!list.length) return null;
        const isOpen = open === g.key;
        return (
          <div key={g.key} className="border-b border-slate-200 last:border-0">
            <button type="button" aria-expanded={isOpen} className="flex w-full items-center justify-between gap-2 px-2 py-2.5 text-left" onClick={() => setOpen(isOpen ? null : g.key)}>
              <span><span className="text-[14px] font-bold text-slate-800">{g.title}</span> <span className="text-[12px] text-slate-500">{g.hint}</span></span>
              <span aria-hidden className="text-slate-500">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <ul className="space-y-1 px-1 pb-2">
                {list.map((f) => (
                  <li key={f.field}>
                    <button type="button" className="w-full rounded-lg bg-white px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-sky-50" onClick={() => { onPick(f); onClose(); }}>
                      {f.label}
                      {f.approximate && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-900">aproximada</span>}
                      <span className="block text-[11px] text-slate-500">Origem: {f.origin === 'cadastro' ? 'cidade/estado digitados pelo tutor' : f.origin === 'gps' ? 'GPS do aparelho' : f.origin === 'geoip' ? 'IP da última sessão' : f.origin}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <button type="button" className="mt-1 px-2 py-1.5 text-[12px] font-semibold text-slate-600 underline" onClick={onClose}>Fechar</button>
    </div>
  );
}

export function FilterBuilder({ fields, state, onChange, brandHints, locationNote }: {
  fields: FieldInfo[]; state: FilterState; onChange: (s: FilterState) => void; brandHints: { text: string; tutors: number }[]; locationNote?: Record<string, string>;
}) {
  const byField = new Map(fields.map((f) => [f.field, f]));
  const [picking, setPicking] = useState<string | null>(null);
  const setBlock = (id: string, patch: Partial<Block>) => onChange({ ...state, blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const setCond = (b: Block, cid: string, patch: Partial<Cond>) => setBlock(b.id, { conds: b.conds.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  const addBlock = () => { const b: Block = { id: uid('b'), op: 'and', petScope: 'any', conds: [] }; onChange({ ...state, blocks: [...state.blocks, b] }); setPicking(b.id); };

  return (
    <div className="space-y-3">
      {state.blocks.length === 0 && (
        <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">Sem filtros: o público é <strong>todos os tutores alcançáveis por push</strong> (quem desligou as notificações fica de fora). Adicione um bloco para segmentar.</p>
      )}
      {state.blocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
          O tutor precisa estar em
          <select aria-label="Como combinar os blocos" className={small} value={state.op} onChange={(e) => onChange({ ...state, op: e.target.value as Op })}>
            <option value="and">TODOS os blocos (E)</option>
            <option value="or">QUALQUER um dos blocos (OU)</option>
          </select>
          <p className="basis-full text-[12px] leading-snug text-slate-600">
            {state.op === 'and' ? 'E: o tutor precisa atender a TODOS os blocos ao mesmo tempo. Quanto mais blocos, menor o público.' : 'OU: basta o tutor atender a UM dos blocos. Quanto mais blocos, maior o público.'}
          </p>
        </div>
      )}
      {state.blocks.map((b, i) => {
        const hasPet = b.conds.some((c) => byField.get(c.field)?.scope === 'pet');
        return (
          <section key={b.id} aria-label={`Bloco ${i + 1}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[13px] font-bold text-slate-800">Bloco {i + 1}</h4>
              <div className="flex flex-wrap items-center gap-2">
                {b.conds.length > 1 && (
                  <select aria-label={`Bloco ${i + 1}: combinar condições`} className={small} value={b.op} onChange={(e) => setBlock(b.id, { op: e.target.value as Op })}>
                    <option value="and">todas as condições (E)</option>
                    <option value="or">qualquer condição (OU)</option>
                  </select>
                )}
                <button type="button" className="text-[12px] font-semibold text-rose-700 underline" onClick={() => onChange({ ...state, blocks: state.blocks.filter((x) => x.id !== b.id) })}>Remover bloco</button>
              </div>
              {b.conds.length > 1 && (
                <p className="basis-full text-[12px] leading-snug text-slate-600">
                  {b.op === 'and' ? 'E: o tutor precisa atender a TODAS as condições deste bloco.' : 'OU: basta o tutor atender a UMA das condições deste bloco.'}
                </p>
              )}
            </header>
            {hasPet && (
              <div className="mb-2 rounded-lg bg-sky-50 p-2.5">
                <label className="block text-[12px] font-bold text-sky-900" htmlFor={`scope-${b.id}`}>Tutor com vários pets: como valem as condições de pet?</label>
                <select id={`scope-${b.id}`} className={`${small} mt-1`} value={b.petScope} onChange={(e) => setBlock(b.id, { petScope: e.target.value as PetScope })}>
                  {(Object.keys(PET_SCOPE_LABEL) as PetScope[]).map((s) => <option key={s} value={s}>{PET_SCOPE_LABEL[s].label}</option>)}
                </select>
                <p className="mt-1 text-[11.5px] leading-snug text-sky-900">{PET_SCOPE_LABEL[b.petScope].help}</p>
              </div>
            )}
            <ul className="space-y-2.5">
              {b.conds.map((c) => {
                const f = byField.get(c.field);
                if (!f) return null;
                const err = condError(c, f);
                return (
                  <li key={c.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{f.label}</p>
                        <p className="text-[11px] text-slate-500">Origem: {f.origin === 'gps' || f.origin === 'geoip' || f.origin === 'cadastro' ? (locationNote?.[f.origin] ?? f.origin) : f.origin} · precisão {f.precision}</p>
                      </div>
                      <button type="button" aria-label={`Remover filtro ${f.label}`} className="shrink-0 rounded px-2 py-1 text-[12px] font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setBlock(b.id, { conds: b.conds.filter((x) => x.id !== c.id) })}>Remover</button>
                    </div>
                    <CondEditor f={f} c={c} brandHints={brandHints} onChange={(patch) => setCond(b, c.id, patch)} />
                    {f.approximate && (
                      <label className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[12px] leading-snug text-amber-900">
                        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={c.ack} onChange={(e) => setCond(b, c.id, { ack: e.target.checked })} />
                        Entendo que esta localização é <strong>aproximada</strong> ({f.precision}) e não representa a residência do tutor.
                      </label>
                    )}
                    {err && <p className="mt-1.5 text-[12px] text-amber-800" role="note">Falta: {err}</p>}
                  </li>
                );
              })}
            </ul>
            {picking === b.id
              ? <FieldPicker fields={fields} onClose={() => setPicking(null)} onPick={(f) => setBlock(b.id, { conds: [...b.conds, defaultCond(f)] })} />
              : <button type="button" className="mt-2 rounded-lg border border-dashed border-slate-400 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setPicking(b.id)}>+ Adicionar filtro</button>}
          </section>
        );
      })}
      <button type="button" className="rounded-lg bg-slate-800 px-3.5 py-2 text-[13px] font-bold text-white" onClick={addBlock}>
        {state.blocks.length ? '+ Outro bloco de filtros' : '+ Adicionar bloco de filtros'}
      </button>
    </div>
  );
}
