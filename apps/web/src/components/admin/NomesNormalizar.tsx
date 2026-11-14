'use client';

/**
 * PÁGINA TEMPORÁRIA (/admin/nomes): normalizar primeiros nomes que o sistema não identificou como tutor/tutora.
 * Cada clique grava só "primeiro nome → Homem/Mulher" (um dicionário, sem ligação com nenhum tutor); vale para todos com aquele nome.
 * Não mostra e-mail nem id. Quando a lista acabar (ou o dono achar suficiente), a página pode ser removida.
 */
import { useState } from 'react';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';

export interface NamesResp {
  reachable: number; classified: number; classified_percent: number; by_ibge: number; by_manual: number; by_email: number; unusable_name: number;
  pending_tutors: number; pending_names: number; enabled: boolean;
  pending: { key: string; name: string; tutors: number }[]; decided: { key: string; sex: 'male' | 'female' }[];
}

export function NomesNormalizar() {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading } = useAsync<NamesResp>(() => adminApi('/tutor-names'), [tick], { live: false });

  const act = async (key: string, sex: 'male' | 'female' | null) => {
    setBusy(key); setErr(null);
    try {
      await adminApi(`/tutor-names/${encodeURIComponent(key)}`, sex ? { method: 'PUT', body: JSON.stringify({ sex }), headers: { 'Content-Type': 'application/json' } } : { method: 'DELETE' });
      setTick((t) => t + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setBusy(null); }
  };

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;
  return (
    <div className="space-y-5">
      <Card title="Normalizar nomes (tutor ou tutora)" subtitle="Página temporária. Para cada primeiro nome que o sistema não reconheceu, diga se é Homem ou Mulher. Vale para todos os tutores com esse nome.">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase text-slate-400">Identificados</p><p className="mt-1 text-[28px] font-black">{data.classified_percent}%</p><p className="text-[12px] text-slate-500">{numberFmt(data.classified)} de {numberFmt(data.reachable)}</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase text-slate-400">Faltam</p><p className="mt-1 text-[28px] font-black">{numberFmt(data.pending_tutors)}</p><p className="text-[12px] text-slate-500">em {numberFmt(data.pending_names)} primeiros nomes</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase text-slate-400">Pela base do IBGE</p><p className="mt-1 text-[28px] font-black">{numberFmt(data.by_ibge)}</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-[12px] font-bold uppercase text-slate-400">Por você</p><p className="mt-1 text-[28px] font-black">{numberFmt(data.by_manual)}</p><p className="text-[12px] text-slate-500">+ {numberFmt(data.by_email)} pelo e-mail (nome ilegível)</p></div>
        </div>
        {!data.enabled && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-900">O filtro Tutor/Tutora está desligado em produção; o que você marcar aqui só passa a valer quando ele for ligado.</p>}
        {err && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-800">{err}</p>}
      </Card>

      <Card title="Nomes para decidir" subtitle="Do mais comum para o menos comum. Na dúvida (nome que serve para os dois), deixe sem marcar.">
        {data.pending.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">Nada pendente.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.pending.map((n) => (
              <li key={n.key} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-[14px] font-bold text-slate-900">{n.name} <span className="text-[12px] font-normal text-slate-500">· {n.tutors} tutor{n.tutors === 1 ? '' : 'es'}</span></span>
                <button type="button" disabled={busy === n.key} onClick={() => act(n.key, 'male')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-semibold hover:border-sky-500 hover:bg-sky-50 disabled:opacity-50">Homem</button>
                <button type="button" disabled={busy === n.key} onClick={() => act(n.key, 'female')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-semibold hover:border-pink-500 hover:bg-pink-50 disabled:opacity-50">Mulher</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.decided.length > 0 && (
        <Card title="Já decididos" subtitle="Clique em Desfazer para voltar o nome à lista.">
          <ul className="flex flex-wrap gap-2">
            {data.decided.map((d) => (
              <li key={d.key}><button type="button" onClick={() => act(d.key, null)} aria-label={`Desfazer ${d.key}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-[12.5px] font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">{d.key.charAt(0) + d.key.slice(1).toLowerCase()} · {d.sex === 'male' ? 'Homem' : 'Mulher'} ✕</button></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
