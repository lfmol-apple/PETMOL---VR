'use client';

/** Passo 8 — histórico de lotes, resultados e recuperação. "Aceito pelo provedor" NUNCA é chamado de "entregue". */
import { useRef, useState } from 'react';
import { call, explainError, type Batch, type BatchPhase, type RecipientState } from './api';
import { numberFmt } from '@/components/admin/sections/sections';

export const STATE_LABEL: Record<RecipientState, { label: string; help: string; cls: string }> = {
  reserved: { label: 'Reservados', help: 'Garantidos no servidor, ainda não tentados.', cls: 'bg-slate-100 text-slate-800' },
  sending: { label: 'Em envio', help: 'Tentativa registrada; aguardando resposta do provedor.', cls: 'bg-sky-100 text-sky-900' },
  accepted: { label: 'Aceitos pelo provedor', help: 'O provedor (Apple/Google/web push) recebeu o envio. Não confirma a entrega no celular.', cls: 'bg-emerald-100 text-emerald-900' },
  failed: { label: 'Com falha', help: 'O envio foi recusado ou o tutor não tem aparelho válido. Não é reenviado automaticamente.', cls: 'bg-rose-100 text-rose-900' },
  uncertain: { label: 'Resultado incerto', help: 'Não sabemos se o provedor recebeu. Por segurança, NÃO é reenviado automaticamente.', cls: 'bg-amber-100 text-amber-900' },
};
const ORDER: RecipientState[] = ['reserved', 'sending', 'accepted', 'failed', 'uncertain'];

export const PHASE_LABEL: Record<BatchPhase, string> = {
  reserved: 'Reservado, iniciando', sending: 'Enviando', done: 'Concluído', interrupted: 'Interrompido', error: 'Erro',
};

export function CountChips({ counts, total }: { counts: Record<RecipientState, number>; total?: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Situação dos destinatários">
      {ORDER.map((s) => (
        <li key={s} title={STATE_LABEL[s].help} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${STATE_LABEL[s].cls} ${counts[s] === 0 ? 'opacity-50' : ''}`}>
          {STATE_LABEL[s].label}: {numberFmt(counts[s])}
        </li>
      ))}
      {total !== undefined && <li className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 ring-1 ring-slate-200">Total: {numberFmt(total)}</li>}
    </ul>
  );
}

function Recovery({ b, onChanged }: { b: Batch; onChanged: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<null | 'resume' | 'release'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inFlight = useRef(false);
  const left = b.counts.reserved;
  const act = async (kind: 'resume' | 'release') => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(kind); setMsg(null);
    try { await call(`/batches/${b.id}/${kind}`, { confirm_count: left }); setTyped(''); onChanged(); }
    catch (e) { setMsg(explainError(e).text); onChanged(); }
    finally { inFlight.current = false; setBusy(null); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] leading-snug text-amber-950">
      <p><strong>Lote interrompido.</strong> O envio parou no meio (ex.: o servidor reiniciou). O sistema não reenviou nada sozinho.</p>
      {b.counts.uncertain > 0 && <p>{numberFmt(b.counts.uncertain)} tutor(es) com <strong>resultado incerto</strong>: podem ou não ter recebido. Eles <strong>não</strong> serão reenviados nem substituídos.</p>}
      {b.counts.failed > 0 && <p>{numberFmt(b.counts.failed)} com falha: também não serão reenviados.</p>}
      {left > 0 ? (
        <>
          <p>{numberFmt(left)} tutor(es) <strong>nunca foram tentados</strong>. Você escolhe: continuar o envio só para eles ou devolvê-los ao público (voltam a ficar disponíveis na campanha).</p>
          <div>
            <label htmlFor={`rc-${b.id}`} className="mb-1 block text-[12px] font-bold">Para confirmar, digite {left}</label>
            <input id={`rc-${b.id}`} inputMode="numeric" autoComplete="off" className="w-32 rounded-lg border border-amber-400 bg-white px-3 py-2 text-[14px]" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={typed !== String(left) || busy !== null} onClick={() => act('resume')} className="rounded-lg bg-emerald-700 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40">{busy === 'resume' ? 'Retomando…' : `Continuar só os ${left} nunca tentados`}</button>
            <button type="button" disabled={typed !== String(left) || busy !== null} onClick={() => act('release')} className="rounded-lg bg-slate-700 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40">{busy === 'release' ? 'Devolvendo…' : `Devolver os ${left} ao público`}</button>
          </div>
        </>
      ) : <p>Ninguém ficou sem ser tentado: não há nada a continuar.</p>}
      {msg && <p role="alert" className="text-rose-800">{msg}</p>}
    </div>
  );
}

function BatchCard({ b, onChanged }: { b: Batch; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inFlight = useRef(false);
  const total = Object.values(b.counts).reduce((a, n) => a + n, 0);
  const active = b.phase === 'reserved' || b.phase === 'sending';
  const reclassify = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMsg(null);
    try { await call(`/batches/${b.id}/recover`, {}); onChanged(); } catch (e) { setMsg(explainError(e).text); } finally { inFlight.current = false; setBusy(false); }
  };
  const tone = b.phase === 'done' ? 'border-emerald-200' : b.phase === 'interrupted' ? 'border-amber-300' : b.phase === 'error' ? 'border-rose-300' : 'border-sky-300';
  return (
    <li className={`space-y-2 rounded-xl border-2 bg-white p-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[14px] font-extrabold text-slate-900">Lote {b.batch_no}</h4>
        <span className="text-[12px] text-slate-600">{PHASE_LABEL[b.phase] ?? b.phase}{b.created_at ? ` · ${new Date(b.created_at).toLocaleString('pt-BR')}` : ''}</span>
      </div>
      <p className="text-[12px] text-slate-600">Pedido: {b.requested === 'all' ? 'todos os disponíveis' : numberFmt(b.requested as number)} · Reservados no início: {numberFmt(b.reserved)}</p>
      <CountChips counts={b.counts} total={total} />
      {active && !b.interrupted_suspected && <p role="status" className="text-[12.5px] text-sky-900">Envio em andamento. Esta tela se atualiza sozinha.</p>}
      {active && b.interrupted_suspected && (
        <div className="rounded-lg bg-amber-50 p-2.5 text-[12.5px] leading-snug text-amber-950">
          <p>Este lote parece parado (sem atividade há mais de 5 minutos). Você pode verificar: isso apenas <strong>reclassifica</strong> o que estava em envio como “incerto”; <strong>não envia nada</strong>.</p>
          <button type="button" disabled={busy} onClick={reclassify} className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">{busy ? 'Verificando…' : 'Verificar lote parado'}</button>
        </div>
      )}
      {b.phase === 'interrupted' && <Recovery b={b} onChanged={onChanged} />}
      {b.phase !== 'interrupted' && b.counts.uncertain > 0 && <p className="text-[12px] text-amber-900">{numberFmt(b.counts.uncertain)} com resultado incerto: não são reenviados automaticamente.</p>}
      {b.phase === 'done' && b.counts.failed > 0 && <p className="text-[12px] text-rose-800">{numberFmt(b.counts.failed)} com falha: não são reenviados nem substituídos por outros tutores.</p>}
      {b.metrics && b.counts.accepted > 0 && (
        <p className="text-[12px] text-slate-600">Resultado no app: {numberFmt(b.metrics.tapped)} tocaram na notificação · {numberFmt(b.metrics.opened)} abriram o app depois do envio.</p>
      )}
      <p className="text-[11px] text-slate-500">{b.accepted_note}</p>
      {msg && <p role="alert" className="text-[12.5px] text-rose-800">{msg}</p>}
    </li>
  );
}

export function BatchHistory({ batches, onChanged }: { batches: Batch[]; onChanged: () => void }) {
  if (!batches.length) return <p className="text-[13px] text-slate-500">Nenhum lote ainda. Depois do primeiro envio, o histórico aparece aqui.</p>;
  return <ul className="space-y-3">{[...batches].sort((a, b) => b.batch_no - a.batch_no).map((b) => <BatchCard key={b.id} b={b} onChanged={onChanged} />)}</ul>;
}
