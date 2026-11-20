'use client';

/**
 * Gratuito — a campanha "Continue com o PETMOL gratuito" num lugar só: medição (antes × agora), quadro de quem recebe o quê,
 * a NOTIFICAÇÃO e o E-MAIL (textos fixos, aprovados; sem campo livre para não sair nada diferente do combinado).
 *
 * Regras do dono (17/11/2026): percentuais sempre sobre "Se cadastrou" (downloads não entram em nenhum %); sem teste A/B e
 * sem grupo de controle; nenhuma conta ou cadastro é removido sem consentimento. A medição mostra o que SE MOVIMENTOU depois do
 * início, não o que o envio causou (sem controle, não dá para provar causa).
 */
import { useState } from 'react';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { fmtDateTime } from '@/components/admin/DataTable';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';

interface Side { abs: number; pct: number | null }
interface CardData {
  key: string; label: string; before: Side; now: Side; delta_abs: number; delta_pp: number | null;
  moved: number | null; moved_pct: number | null; new_with: number | null; lost: number | null; denominator: string | null;
}
interface Situation { key: string; label: string; people: number; push: string; email: string }
interface Tracking { recipients: number; clicks: number; clickers: number; by_link: Record<string, number>; with_food: number; with_push: number; with_pet: number }
interface EmailBlock {
  campaign_id: string; subject: string; sent: number; last_sent_at: string | null; tracking: Tracking | null;
  state: { phase: 'running' | 'done' | 'error'; sent: number; failed: number; total: number; error: string | null } | null;
}
interface Summary {
  baseline: { taken_at: string; taken_by: string | null; values: Record<string, number> } | null;
  now: Record<string, number>; cards?: CardData[]; situations: Situation[]; email: EmailBlock | null; email_groups: { dia0: number; dia3: number };
}
interface PushPreview { will_send: number; skipped?: { opt_out: number; weekly_cap: number; segment: number }; sample: { title: string; body: string } | null; test_accounts?: { name: string; has_push: boolean }[]; destination_label?: string }
interface EmailPreview { will_send: number; sample: { subject: string; text: string } | null }

/** Texto FIXO da notificação (aprovado pelo dono e pela revisão jurídica). No teste, entra "TESTE." na frente. */
export const GRATUITO_PUSH_TITLE = '{tutor}, continue com o PETMOL gratuito';
export const GRATUITO_PUSH_MESSAGE = 'Faltam poucos passos para você. Toque: o atalho fica aberto por 20 minutos.';

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const share = (part: number, base: number) => (base > 0 ? `${(Math.round((part / base) * 1000) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const NAMES: Record<string, string> = { botao: 'botão final', logo: 'faixa azul', loja: 'Loja do Pet', alimentacao: 'ração', pet: 'pet', notificacoes: 'notificações', localizacao: 'localização', vacinas: 'vacinas', ativar: 'ativar' };

export function GratuitoTab() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync<Summary>(() => adminApi('/gratuito/summary'), [refresh], { intervalMs: 8000 });
  const again = () => setRefresh((n) => n + 1);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-5">
      <Measurement data={data} onChange={again} />
      <Quadro data={data} />
      <PushSend onDone={again} />
      <EmailSend data={data} onDone={again} />
    </div>
  );
}

// ── Medição ──────────────────────────────────────────────────────────────────

function Measurement({ data, onChange }: { data: Summary; onChange: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = data.now.cadastros;
  const freeze = async () => {
    setBusy(true); setErr(null);
    try { await adminApi('/gratuito/baseline', { method: 'POST', body: JSON.stringify({}) }); setConfirm(false); onChange(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível congelar.'); } finally { setBusy(false); }
  };

  if (!data.baseline) {
    return (
      <Card title="Medição: antes × agora" subtitle="Congele os números de hoje no momento em que a campanha começar. Daí em diante o painel mostra, em cada item, o que era e o que passou a ser.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[['cadastros', 'Se cadastrou'], ['pets', 'Cadastrou o pet'], ['alimentacao', 'Cadastrou a alimentação'], ['notificacoes', 'Notificações ativas'], ['localizacao', 'Localização ativa']].map(([k, l]) => (
            <div key={k} className="rounded-xl border border-slate-200 p-4">
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{l}</p>
              <p className="mt-1 text-[30px] font-black leading-none text-slate-900">{numberFmt(data.now[k])}</p>
              <p className="mt-1.5 text-[13px] font-extrabold text-[#0056D2]">{k === 'cadastros' ? 'base dos percentuais' : `${share(data.now[k], base)} dos cadastros`}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Downloads hoje: {numberFmt(data.now.downloads)} (só número; não entra em percentual).</p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          {!confirm ? (
            <button type="button" onClick={() => setConfirm(true)} className="rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white">Congelar os números de hoje (início da campanha)</button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-slate-700">Isso marca o <strong>início da medição</strong> com os números de agora e a lista de pessoas de cada item. Só se refaz com uma confirmação nova.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={freeze} className="rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">Sim, congelar agora</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-600">Cancelar</button>
              </div>
            </div>
          )}
          {err && <p className="mt-2 text-[12px] font-semibold text-rose-600">{err}</p>}
        </div>
      </Card>
    );
  }

  const cards = (data.cards ?? []).filter((c) => c.key !== 'downloads');
  const dl = (data.cards ?? []).find((c) => c.key === 'downloads');
  return (
    <Card title="Medição: antes × agora" subtitle={`Medindo desde ${fmtDateTime(data.baseline.taken_at)}${data.baseline.taken_by ? ` (congelado por ${data.baseline.taken_by})` : ''}. Percentuais sobre "Se cadastrou".`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-slate-200 p-4" data-testid={`card-${c.key}`}>
            <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className="mt-2 text-[12px] text-slate-500">Antes: <strong className="text-slate-800">{numberFmt(c.before.abs)}</strong>{c.before.pct != null && <> · {pct(c.before.pct)}</>}</p>
            <p className="text-[12px] text-slate-500">Agora: <strong className="text-slate-900">{numberFmt(c.now.abs)}</strong>{c.now.pct != null && <> · <strong className="text-[#0056D2]">{pct(c.now.pct)}</strong></>}</p>
            {c.key === 'cadastros' ? (
              <p className="mt-2 text-[13px] font-extrabold text-[#0056D2]">+{numberFmt(c.moved ?? 0)} novos cadastros</p>
            ) : (
              <>
                <p className="mt-2 text-[13px] font-extrabold text-emerald-700">+{numberFmt(c.moved ?? 0)} passaram a ter{c.moved_pct != null && <span className="font-semibold text-slate-500"> ({pct(c.moved_pct)} de quem não tinha)</span>}</p>
                <p className="text-[11.5px] text-slate-500">{numberFmt(c.new_with ?? 0)} já entraram com · {numberFmt(c.lost ?? 0)} deixaram de ter</p>
                {c.delta_pp != null && <p className="text-[11.5px] font-semibold text-slate-500">variação: {c.delta_pp > 0 ? '+' : ''}{c.delta_pp.toLocaleString('pt-BR')} p.p.</p>}
              </>
            )}
          </div>
        ))}
      </div>
      {dl && <p className="mt-2 text-[12px] text-slate-500">Downloads: {numberFmt(dl.before.abs)} → {numberFmt(dl.now.abs)} (só número).</p>}
      <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-600">
        Leitura honesta: sem grupo de controle, isto mostra o que <strong>se movimentou</strong> depois do início (inclui o movimento natural e cadastros novos), não o que o envio causou. “Passaram a ter” conta só quem já era da base e não tinha o item no congelamento.
      </p>
    </Card>
  );
}

// ── Quadro: quem recebe o quê ────────────────────────────────────────────────

function Quadro({ data }: { data: Summary }) {
  const total = data.now.cadastros;
  return (
    <Card title="Quem recebe o quê" subtitle="Cada pessoa cadastrada cai em uma linha. A notificação só alcança quem tem notificação ativa; para as demais, o e-mail (e a página dentro do app).">
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr><th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Pessoas</th><th className="px-3 py-2 text-right">% dos cadastros</th><th className="px-3 py-2">Notificação</th><th className="px-3 py-2">E-mail</th></tr>
          </thead>
          <tbody>
            {data.situations.map((s) => (
              <tr key={s.key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-700">{s.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{numberFmt(s.people)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{share(s.people, total)}</td>
                <td className="px-3 py-1.5 text-slate-600">{s.push}</td>
                <td className="px-3 py-1.5 text-slate-600">{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Notificação ──────────────────────────────────────────────────────────────

function PushSend({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<'test' | 'all'>('test');
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const body = () => ({
    message: kind === 'test' ? `TESTE. ${GRATUITO_PUSH_MESSAGE}` : GRATUITO_PUSH_MESSAGE, title: GRATUITO_PUSH_TITLE, destination: 'atalho', goal: 'atalho',
    segment: kind === 'test' ? 'todos' : 'faltam_passos', audience: { kind },
    // Respeita o limite semanal no envio real: quem JÁ recebeu notificação nos últimos 7 dias (inclusive nesta mesma campanha, se o envio
    // for interrompido e retomado) fica de fora, para ninguém receber duas vezes. O teste não gasta a cota.
    ignore_weekly_cap: false,
  });
  const invalidate = () => { setPreview(null); setTyped(''); setMsg(null); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível.' }); } finally { setBusy(false); }
  };

  return (
    <Card title="Notificação" subtitle="Uma notificação só, para quem tem notificação ativa e ainda falta pet, ração ou localização. Ao tocar, abre a página-atalho (20 minutos, só o que falta).">
      <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-black/5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Texto fixo</p>
        <p className="mt-1 text-[14px] font-extrabold text-slate-900">{GRATUITO_PUSH_TITLE}</p>
        <p className="text-[13px] text-slate-700">{GRATUITO_PUSH_MESSAGE}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px]">
        {([['test', 'Teste (dono, Henrique e VEP, com "TESTE." na frente)'], ['all', 'Todos que falta algo']] as const).map(([k, t]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="radio" name="gratuito-push-kind" checked={kind === k} onChange={() => { setKind(k); invalidate(); }} /> {t}</label>
        ))}
      </div>
      <div className="mt-3">
        <button type="button" disabled={busy} onClick={() => run(async () => setPreview(await adminApi<PushPreview>('/broadcast/preview', { method: 'POST', body: JSON.stringify(body()) })))}
          className="rounded-lg border border-[#0056D2] px-4 py-2 text-[13px] font-bold text-[#0056D2] disabled:opacity-40">Ver prévia e quantas pessoas</button>
      </div>
      {preview && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700">
          {preview.sample && <p>Como chega: <strong>{preview.sample.title}</strong> — {preview.sample.body}</p>}
          {preview.destination_label && <p className="text-[12px] text-slate-500">Ao tocar abre: {preview.destination_label}</p>}
          <p>Vão receber: <strong>{numberFmt(preview.will_send)}</strong> {preview.will_send === 1 ? 'pessoa' : 'pessoas'}.</p>
          {kind === 'all' && <p className="text-[12px] text-slate-500" data-testid="push-skipped">Ficam de fora: {numberFmt(preview.skipped?.weekly_cap ?? 0)} que já receberam notificação nos últimos 7 dias (ninguém recebe duas vezes) e {numberFmt(preview.skipped?.opt_out ?? 0)} que pediram para parar.</p>}
          {kind === 'test' && preview.test_accounts && (
            <ul className="space-y-0.5 text-[12.5px]">
              {preview.test_accounts.map((a) => <li key={a.name} className={a.has_push ? '' : 'text-amber-800'}>{a.has_push ? '✓' : '⚠'} {a.name}{a.has_push ? '' : ' — sem notificação ativa: não vai receber'}</li>)}
            </ul>
          )}
          {kind === 'all' && preview.will_send > 0 && (
            <div>
              <label className="mb-1 block text-[12px] font-bold text-slate-600" htmlFor="gratuito-push-confirm">Para confirmar, digite {preview.will_send}</label>
              <input id="gratuito-push-confirm" inputMode="numeric" className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-[14px]" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <button type="button" disabled={busy || preview.will_send === 0 || (kind === 'all' && typed !== String(preview.will_send))}
            onClick={() => run(async () => {
              await adminApi('/broadcast/send', { method: 'POST', body: JSON.stringify({ ...body(), confirm_count: preview.will_send }) });
              setMsg({ ok: true, text: kind === 'test' ? 'Teste enviado. Confira no celular.' : 'Envio iniciado.' }); setPreview(null); setTyped(''); onDone();
            })}
            className="rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
            {kind === 'test' ? 'Enviar teste' : `Enviar para ${numberFmt(preview.will_send)}`}
          </button>
          <p className="text-[11px] text-slate-500">Depois de enviada, uma notificação não pode ser desfeita.</p>
        </div>
      )}
      {msg && <p className={`mt-3 text-[12.5px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </Card>
  );
}

// ── E-mail ───────────────────────────────────────────────────────────────────

function EmailSend({ data, onDone }: { data: Summary; onDone: () => void }) {
  const e = data.email;
  const [group, setGroup] = useState<'gratuito_dia0' | 'gratuito_dia3'>('gratuito_dia0');
  const [kind, setKind] = useState<'test' | 'count' | 'all'>('test');
  const [count, setCount] = useState('');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [html, setHtml] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!e) return null;
  const running = e.state?.phase === 'running';
  const body = { segment: group, audience: { kind, count: kind === 'count' ? Number(count) || undefined : undefined } };
  const invalidate = () => { setPreview(null); setTyped(''); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível.' }); } finally { setBusy(false); }
  };

  return (
    <Card title="E-mail" subtitle={`Um modelo só, que se adapta ao que falta na conta de cada pessoa (pet, ração, notificações, localização). Assunto: ${e.subject}`}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-slate-600">
        <span><strong className="text-slate-900">{numberFmt(e.sent)}</strong> enviados</span>
        {e.last_sent_at && <span>último envio {fmtDateTime(e.last_sent_at)}</span>}
      </div>
      {e.state && (
        <p className={`mt-2 rounded-lg p-2.5 text-[12.5px] ${e.state.phase === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
          {e.state.phase === 'running' ? `Enviando… ${numberFmt(e.state.sent)} de ${numberFmt(e.state.total)}` : `Último envio: ${numberFmt(e.state.sent)} enviados, ${numberFmt(e.state.failed)} falharam.`}{e.state.error ? ` ${e.state.error}` : ''}
        </p>
      )}
      {e.tracking && <Tracking t={e.tracking} />}

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <div className="space-y-1 text-[12.5px]">
          {([['gratuito_dia0', `Dia 0: quem a notificação não alcança (${numberFmt(data.email_groups.dia0)})`], ['gratuito_dia3', `Dia 3: 2º contato, tem notificação e ainda falta algo (${numberFmt(data.email_groups.dia3)})`]] as const).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="radio" name="gratuito-email-group" checked={group === k} onChange={() => { setGroup(k); invalidate(); }} /> {t}</label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          {([['test', 'Só eu (teste)'], ['count', 'Uma quantidade'], ['all', 'Todos do grupo']] as const).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="radio" name="gratuito-email-kind" checked={kind === k} onChange={() => { setKind(k); invalidate(); }} /> {t}</label>
          ))}
          {kind === 'count' && <input className="w-24 rounded-md border border-slate-200 px-2 py-1" inputMode="numeric" placeholder="quantas" value={count} onChange={(ev) => { setCount(ev.target.value.replace(/\D/g, '')); invalidate(); }} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => run(async () => setHtml(html ? null : await adminApi<{ subject: string; html: string }>(`/email-campaigns/${e.campaign_id}/html`)))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">{html ? 'Esconder o e-mail' : 'Ver como o e-mail fica'}</button>
          <button type="button" disabled={busy} onClick={() => run(async () => { await adminApi(`/email-campaigns/${e.campaign_id}/test`, { method: 'POST' }); setMsg({ ok: true, text: 'Teste enviado para o seu e-mail.' }); })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Enviar teste para mim</button>
          <button type="button" disabled={busy || running || (kind === 'count' && !Number(count))}
            onClick={() => run(async () => setPreview(await adminApi<EmailPreview>(`/email-campaigns/${e.campaign_id}/preview`, { method: 'POST', body: JSON.stringify(body) })))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ver quantos recebem</button>
        </div>
        {html && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <p className="bg-slate-50 px-3 py-1.5 text-[12px] text-slate-600">Assunto: <strong>{html.subject}</strong> · pré-visualização com os seus dados</p>
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={html.html} className="h-[640px] w-full border-0 bg-white" />
          </div>
        )}
        {preview && (
          <div className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-700">
            <p><strong>{numberFmt(preview.will_send)}</strong> {preview.will_send === 1 ? 'pessoa recebe' : 'pessoas recebem'} agora (quem já recebeu este e-mail não repete).</p>
            {preview.sample && <p className="mt-1 text-[12px] text-slate-500">Exemplo de assunto: <strong>{preview.sample.subject}</strong></p>}
            {kind === 'test' ? (
              <button type="button" disabled={busy} onClick={() => run(async () => { await adminApi(`/email-campaigns/${e.campaign_id}/send`, { method: 'POST', body: JSON.stringify(body) }); setMsg({ ok: true, text: 'Enviado para você.' }); setPreview(null); })}
                className="mt-2 rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar só para mim</button>
            ) : preview.will_send > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="w-44 rounded-md border border-slate-300 px-2 py-1 text-[12px]" inputMode="numeric" placeholder={`Digite ${preview.will_send} para confirmar`} value={typed} onChange={(ev) => setTyped(ev.target.value.replace(/\D/g, ''))} />
                <button type="button" disabled={busy || running || typed !== String(preview.will_send)}
                  onClick={() => run(async () => { await adminApi(`/email-campaigns/${e.campaign_id}/send`, { method: 'POST', body: JSON.stringify({ ...body, confirm_count: preview.will_send }) }); setMsg({ ok: true, text: 'Envio iniciado.' }); invalidate(); onDone(); })}
                  className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar para {numberFmt(preview.will_send)}</button>
              </div>
            )}
          </div>
        )}
        {msg && <p className={`text-[12.5px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

function Tracking({ t }: { t: Tracking }) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-600">
      <p className="font-bold text-slate-800">Acompanhamento do e-mail</p>
      <p className="mt-1"><strong className="text-slate-900">{numberFmt(t.clickers)}</strong> pessoas clicaram ({share(t.clickers, t.recipients)} de {numberFmt(t.recipients)}) · {numberFmt(t.clicks)} cliques
        {Object.keys(t.by_link).length > 0 && <> ({Object.entries(t.by_link).map(([k, n]) => `${NAMES[k] ?? k}: ${n}`).join(', ')})</>}</p>
      <p className="mt-1">Hoje, entre quem recebeu: <strong className="text-slate-900">{numberFmt(t.with_pet)}</strong> têm pet · <strong className="text-slate-900">{numberFmt(t.with_food)}</strong> têm ração · <strong className="text-slate-900">{numberFmt(t.with_push)}</strong> têm notificação ativa.</p>
      <p className="mt-1 text-[11.5px] text-slate-400">Cliques podem incluir verificações automáticas de segurança do e-mail. Abertura não é medida (o Apple Mail esconde). Sem grupo de controle.</p>
    </div>
  );
}
