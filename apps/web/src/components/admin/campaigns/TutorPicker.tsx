'use client';

/**
 * Escolha manual de tutores: busca por nome, e-mail ou nome do pet; marca um a um. O valor guardado é só a lista de ids.
 * Quem não é alcançável (sem push ou pediu para parar) aparece marcado — escolher não fura essa regra: ele não recebe.
 */
import { useEffect, useRef, useState } from 'react';
import { lookupTutors, searchTutors, type TutorHit } from './api';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';

export function TutorPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TutorHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const known = useRef(new Map<string, TutorHit>());
  const [, bump] = useState(0);
  const seq = useRef(0);

  const remember = (list: TutorHit[]) => { list.forEach((t) => known.current.set(t.id, t)); bump((n) => n + 1); };

  // Reconhece uma seleção que veio de um lote anterior (só os ids).
  useEffect(() => {
    const missing = value.filter((id) => !known.current.has(id));
    if (!missing.length) return;
    let alive = true;
    void lookupTutors(missing).then((r) => { if (alive) remember(r.tutors); }).catch(() => {});
    return () => { alive = false; };
  }, [value]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setErr(null); return; }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      searchTutors(term)
        .then((r) => { if (mine !== seq.current) return; remember(r.tutors); setHits(r.tutors); setErr(null); })
        .catch((e: Error) => { if (mine === seq.current) setErr(e.message); })
        .finally(() => { if (mine === seq.current) setBusy(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div data-testid="tutor-picker">
      <label className="block text-[12px] font-bold text-slate-600" htmlFor="tutor-search">Buscar tutor (nome, e-mail ou nome do pet)</label>
      <input id="tutor-search" className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ao menos 2 letras" />
      {busy && <p className="mt-1 text-[12px] text-slate-500">Buscando…</p>}
      {err && <p className="mt-1 text-[12px] text-rose-700" role="alert">{err}</p>}
      {hits.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1" aria-label="Resultados da busca">
          {hits.map((t) => {
            const on = value.includes(t.id);
            return (
              <li key={t.id}>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] ${on ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={on} onChange={() => toggle(t.id)} aria-label={`Escolher ${t.name || t.email}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{t.name || '(sem nome)'}</span>
                    <span className="block break-all text-[11.5px] text-slate-500">{t.email}{t.pets.length ? ` · pets: ${t.pets.join(', ')}` : ''}</span>
                    {!t.reachable && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-900">não recebe push (sem notificação ou pediu para parar)</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[12px] font-bold text-slate-700">Escolhidos: {value.length}</p>
      {value.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Tutores escolhidos">
          {value.map((id) => {
            const t = known.current.get(id);
            return (
              <li key={id} className="flex items-center gap-1 rounded-full bg-sky-100 py-1 pl-2.5 pr-1 text-[12px] text-sky-900">
                {t ? (t.name || t.email) : 'Tutor…'}{t && !t.reachable ? ' ⚠' : ''}
                <button type="button" aria-label={`Tirar ${t?.name || t?.email || 'tutor'}`} className="rounded-full px-1.5 font-bold hover:bg-sky-200" onClick={() => toggle(id)}>×</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
