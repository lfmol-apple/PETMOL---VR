'use client';

/**
 * E-mails — as campanhas de e-mail numa lista só. O dono cria, testa, envia (para quantas pessoas quiser, SEM limite
 * por pessoa) e remove quando quiser. As campanhas antigas ficam como histórico. Quem pediu para parar nunca recebe.
 */
import { useState } from 'react';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { fmtDateTime } from '@/components/admin/DataTable';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';

interface Campaign {
  id: string; name: string; subject: string; body: string; template: 'custom' | 'recado' | 'foto';
  created_at: string | null; sent: number; control: number; last_sent_at: string | null;
  state: { phase: 'running' | 'done' | 'error'; sent: number; failed: number; total: number; error: string | null } | null;
}
interface ListResp { segments: Record<string, string>; campaigns: Campaign[] }
interface Preview { will_send: number; audience_total: number; already_received: number; sample: { subject: string; text: string } | null }

const input = 'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px]';

export function EmailsTab() {
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useAsync<ListResp>(() => adminApi('/email-campaigns'), [refresh], { intervalMs: 5000 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500">Sem limite por pessoa. Só quem pediu para parar de receber fica de fora.</p>
        <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-[#0056D2] px-3.5 py-2 text-[13px] font-bold text-white">Nova campanha</button>
      </div>
      {creating && <Editor onDone={() => { setCreating(false); setRefresh((n) => n + 1); }} />}
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : data.campaigns.length === 0 ? (
        <Card title="Nenhuma campanha"><p className="text-[13px] text-slate-500">Crie a primeira em “Nova campanha”.</p></Card>
      ) : data.campaigns.map((c) => (
        <CampaignCard key={c.id} c={c} segments={data.segments} onChange={() => setRefresh((n) => n + 1)} />
      ))}
    </div>
  );
}

function Editor({ onDone, initial, id }: { onDone: () => void; initial?: Campaign; id?: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await adminApi(id ? `/email-campaigns/${id}` : '/email-campaigns', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ name, subject, body }) });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  };
  return (
    <Card title={id ? 'Editar campanha' : 'Nova campanha'} subtitle="Use {nome} para o primeiro nome do tutor e {pets} para os nomes dos pets (ex.: “Baby e Mel”). Separe parágrafos com uma linha em branco.">
      <div className="space-y-2.5">
        <input className={input} placeholder="Nome da campanha (só para você)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <input className={input} placeholder="Assunto do e-mail" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        <textarea className={input} rows={9} placeholder="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} />
        {err && <p className="text-[12px] font-semibold text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || name.trim().length < 2 || subject.trim().length < 2 || body.trim().length < 5} onClick={save}
            className="rounded-lg bg-[#0056D2] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40">Salvar</button>
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600">Cancelar</button>
        </div>
      </div>
    </Card>
  );
}

function CampaignCard({ c, segments, onChange }: { c: Campaign; segments: Record<string, string>; onChange: () => void }) {
  const history = c.template !== 'custom';
  const [segment, setSegment] = useState('todos');
  const [kind, setKind] = useState<'test' | 'count' | 'all'>('test');
  const [count, setCount] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const running = c.state?.phase === 'running';

  const body = { segment, audience: { kind, count: kind === 'count' ? Number(count) || undefined : undefined } };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); onChange(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível.' }); }
    finally { setBusy(false); }
  };
  const invalidate = () => { setPreview(null); setTyped(''); };

  if (editing) return <Editor id={c.id} initial={c} onDone={() => { setEditing(false); onChange(); }} />;

  return (
    <Card title={c.name} subtitle={history ? 'Campanha antiga: só histórico do que já foi enviado.' : `Assunto: ${c.subject}`}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-slate-600">
        <span><strong className="text-slate-900">{numberFmt(c.sent)}</strong> enviados</span>
        {c.control > 0 && <span><strong className="text-slate-900">{numberFmt(c.control)}</strong> no grupo de controle (não receberam)</span>}
        {c.last_sent_at && <span>último envio {fmtDateTime(c.last_sent_at)}</span>}
      </div>
      {c.state && (
        <p className={`mt-2 rounded-lg p-2.5 text-[12.5px] ${c.state.phase === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
          {c.state.phase === 'running' ? `Enviando… ${numberFmt(c.state.sent)} de ${numberFmt(c.state.total)}` : `Último envio: ${numberFmt(c.state.sent)} enviados, ${numberFmt(c.state.failed)} falharam.`}
          {c.state.error ? ` ${c.state.error}` : ''}
        </p>
      )}

      {!history && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            {([['test', 'Só eu (teste)'], ['count', 'Uma quantidade'], ['all', 'Todos']] as const).map(([k, t]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="radio" name={`k-${c.id}`} checked={kind === k} onChange={() => { setKind(k); invalidate(); }} /> {t}
              </label>
            ))}
            {kind === 'count' && <input className="w-24 rounded-md border border-slate-200 px-2 py-1" inputMode="numeric" placeholder="quantas" value={count}
              onChange={(e) => { setCount(e.target.value.replace(/\D/g, '')); invalidate(); }} />}
            {kind !== 'test' && (
              <select className="rounded-md border border-slate-200 px-2 py-1" value={segment} onChange={(e) => { setSegment(e.target.value); invalidate(); }}>
                {Object.entries(segments).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => adminApi(`/email-campaigns/${c.id}/test`, { method: 'POST' }), 'Teste enviado para o seu e-mail.')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Enviar teste para mim</button>
            <button type="button" disabled={busy || running || (kind === 'count' && !Number(count))}
              onClick={() => run(async () => setPreview(await adminApi<Preview>(`/email-campaigns/${c.id}/preview`, { method: 'POST', body: JSON.stringify(body) })))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ver quantos recebem</button>
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600">Editar</button>
          </div>

          {preview && (
            <div className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-700">
              <p><strong>{numberFmt(preview.will_send)}</strong> {preview.will_send === 1 ? 'pessoa recebe' : 'pessoas recebem'} agora.
                {kind === 'all' && preview.already_received > 0 && <> {numberFmt(preview.already_received)} já receberam <em>esta</em> campanha e não repetem.</>}</p>
              {preview.sample && <p className="mt-1 text-[12px] text-slate-500">Exemplo de assunto: <strong>{preview.sample.subject}</strong></p>}
              {kind === 'test' ? (
                <button type="button" disabled={busy} onClick={() => run(() => adminApi(`/email-campaigns/${c.id}/send`, { method: 'POST', body: JSON.stringify(body) }), 'Enviado para você.')}
                  className="mt-2 rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar só para mim</button>
              ) : preview.will_send > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input className="w-40 rounded-md border border-slate-300 px-2 py-1 text-[12px]" inputMode="numeric" placeholder={`Digite ${preview.will_send} para confirmar`}
                    value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
                  <button type="button" disabled={busy || running || typed !== String(preview.will_send)}
                    onClick={() => run(() => adminApi(`/email-campaigns/${c.id}/send`, { method: 'POST', body: JSON.stringify({ ...body, confirm_count: preview.will_send }) }), 'Envio iniciado.')
                      .then(invalidate)}
                    className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar para {numberFmt(preview.will_send)}</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {msg && <p className={`mt-3 text-[12px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}

      <div className="mt-4 border-t border-slate-100 pt-3">
        {!removing ? (
          <button type="button" disabled={running} onClick={() => setRemoving(true)} className="text-[12px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-40">Remover campanha da lista</button>
        ) : (
          <span className="text-[12px] text-slate-600">Remover “{c.name}”? Quem já recebeu continua registrado.{' '}
            <button type="button" disabled={busy} onClick={() => run(() => adminApi(`/email-campaigns/${c.id}`, { method: 'DELETE' }))} className="font-bold text-rose-600">Sim, remover</button>
            {' · '}<button type="button" onClick={() => setRemoving(false)} className="font-bold text-slate-500">Cancelar</button>
          </span>
        )}
      </div>
    </Card>
  );
}
