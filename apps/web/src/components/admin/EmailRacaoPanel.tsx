'use client';

/** Campanhas de e-mail de ração, como eram na tela completa: teste, ensaio, envio real e resultado (enviados × controle). */
import { useState } from 'react';
import { Card, panelFetch } from '@/components/admin/AdminUi';
import { type CampaignState } from '@/lib/admin/growthApi';
import { useAsync, Loading, ErrorBox, numberFmt } from '@/components/admin/sections/sections';

type EmailRacaoSummary = {
  subject: string; sendgrid: boolean; eligible: number; no_food: number; no_push: number; skipped_recent: number;
  state: CampaignState; template?: string; variants?: { key: string; example: string }[]; multi_pet?: number;
};
type EmailArm = { people: number; no_food_at_send: number; food_now: number; no_push_at_send: number; push_now: number };

/** E-mail de campanha (2 modelos): teste só para o admin logado, ensaio, envio real e efeito (enviados × controle).
 *  template "recado" = Recado Importante (imagem única); "foto" = ração com nome do tutor e foto dos pets sem ração. */
export function EmailRacaoPanel({ template = 'recado' }: { template?: 'recado' | 'foto' }) {
  const [refresh, setRefresh] = useState(0);
  const [variant, setVariant] = useState('contando');
  const isFoto = template === 'foto';
  const { data, error, loading } = useAsync<EmailRacaoSummary>(() => panelFetch(`/email-racao/summary?template=${template}`), [refresh, template], { intervalMs: 8000 });
  const results = useAsync<{ sent: EmailArm | null; control: EmailArm | null }>(() => panelFetch(`/email-racao/results?template=${template}`), [refresh, template], { intervalMs: 60000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const act = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); setRefresh((n) => n + 1); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível.' }); }
    finally { setBusy(false); setConfirm(false); }
  };
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const st = data?.state;
  const r = st?.result as Record<string, unknown> | null | undefined;

  return (
    <Card title={isFoto ? 'E-mail: ração com a foto do pet' : 'E-mail: Recado Importante'}
      subtitle={isFoto
        ? 'Personalizado por tutor: nome dele e foto (nome embaixo) de cada pet SEM ração. Foto, faixa e botão abrem a página do app na loja (iPhone/Android). Uma mensagem por pessoa, no máximo 1 por semana.'
        : 'Imagem clicável + botão, com link para a loja certa (iPhone/Android). Uma mensagem por pessoa, mesmo com vários pets.'}>
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          {isFoto && data.variants ? (
            <fieldset className="mb-2">
              <legend className="text-[12px] font-bold text-slate-700">Assunto (você escolhe; o nome do tutor e do pet entram em cada e-mail)</legend>
              <div className="mt-1 space-y-1">
                {data.variants.map((v) => (
                  <label key={v.key} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-700">
                    <input type="radio" name={`variant-${template}`} checked={variant === v.key} onChange={() => setVariant(v.key)} />
                    <span>“{v.example}”</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-[12px] text-slate-500">Assunto: <strong className="text-slate-800">{data.subject}</strong></p>
          )}
          <p className="mt-1 text-[14px] font-extrabold text-slate-800">
            {numberFmt(data.eligible)} receberiam agora{' '}
            <span className="font-medium text-slate-500">
              {isFoto
                ? `(${numberFmt(data.multi_pet ?? 0)} com mais de um pet sem ração · ${numberFmt(data.skipped_recent)} já receberam este e-mail)`
                : `(${numberFmt(data.no_food)} com ração faltando · ${numberFmt(data.no_push)} sem notificação · ${numberFmt(data.skipped_recent)} já receberam este e-mail)`}
            </span>
          </p>
          {!data.sendgrid && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-900">
              O envio sai pela Hostinger: lotes de 10 a cada 3 minutos e no máximo 900 por dia (plano Starter Business Email da Hostinger). Se ela recusar, espera 1 hora e tenta de novo (até 3 vezes). Quando bater o teto, clique de novo no dia seguinte: quem já recebeu é pulado.
            </p>
          )}
          <p className="mt-2 text-[12px]">
            {st?.phase === 'running' ? <span className="font-semibold text-amber-700">Enviando{r && typeof r.progress === 'string' ? ` (${r.progress})` : ''}…</span>
              : st?.phase === 'error' ? <span className="font-semibold text-rose-600">Erro: {st.error}</span>
              : st?.phase === 'done' && r ? <span className="text-slate-600">
                  {r.dry_run ? 'Ensaio (nada enviado): ' : 'Concluído: '}{numberFmt(Number(r.total ?? 0))} pessoas
                  {typeof r.sent === 'number' ? ` · ${numberFmt(r.sent)} enviados` : ''}
                  {typeof r.failed === 'number' && r.failed > 0 ? ` · ${numberFmt(r.failed)} falhas` : ''}
                  {typeof r.holdout === 'number' ? ` · ${numberFmt(r.holdout)} no controle` : ''}
                  {typeof r.stopped === 'string' ? ` · ${r.stopped}` : ''}
                  {typeof r.capped === 'string' ? ` · ${r.capped}` : ''}
                  {typeof r.last_error === 'string' && r.last_error ? ` · último erro: ${r.last_error}` : ''}
                </span>
              : <span className="text-slate-400">Parado</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy}
              onClick={() => act(() => panelFetch(`/email-racao/test?template=${template}&variant=${variant}`, { method: 'POST' }), 'Teste enviado para o seu e-mail (com os seus pets).')}
              className="rounded-lg border border-[#0056D2] bg-white px-3 py-1.5 text-[12px] font-bold text-[#0056D2] disabled:opacity-40">Enviar teste para mim</button>
            <button type="button" disabled={busy || st?.phase === 'running'}
              onClick={() => act(() => panelFetch('/email-racao/run', { method: 'POST', body: JSON.stringify({ dry_run: true, template, variant }) }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ensaio</button>
            <button type="button" disabled={busy || st?.phase === 'running' || data.eligible === 0}
              onClick={() => setConfirm(true)}
              className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar para todos</button>
          </div>
          {confirm && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
              <p><strong>Enviar e-mail para cerca de {numberFmt(Math.round(data.eligible * 0.9))} pessoas agora?</strong> 10% ficam de fora de propósito (grupo de controle, para medir o efeito). Não dá para desfazer.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => act(() => panelFetch('/email-racao/run', { method: 'POST', body: JSON.stringify({ dry_run: false, holdout_pct: 10, template, variant }) }))}
                  className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white">Sim, enviar</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">Cancelar</button>
              </div>
            </div>
          )}
          {msg && <p className={`mt-3 text-[12px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
          {results.data?.sent && results.data.control && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-1 text-[12px] font-bold text-slate-700">Efeito (recebeu × controle)</p>
              <table className="w-full text-left text-[12px]">
                <thead><tr className="text-slate-400"><th className="py-1 pr-3"></th><th className="py-1 pr-3">Pessoas</th><th className="py-1 pr-3">Cadastraram a ração</th><th className="py-1 pr-3">Ativaram notificação</th></tr></thead>
                <tbody>
                  {([['Receberam', results.data.sent], ['Controle', results.data.control]] as [string, EmailArm][]).map(([label, a]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-1 pr-3 font-semibold">{label}</td>
                      <td className="py-1 pr-3">{numberFmt(a.people)}</td>
                      <td className="py-1 pr-3">{numberFmt(a.food_now)}/{numberFmt(a.no_food_at_send)} ({pct(a.food_now, a.no_food_at_send)})</td>
                      <td className="py-1 pr-3">{numberFmt(a.push_now)}/{numberFmt(a.no_push_at_send)} ({pct(a.push_now, a.no_push_at_send)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Resultado da campanha de Alimentação (push). Fora do prefixo /analytics, então fetch próprio. */
