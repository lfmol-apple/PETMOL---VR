'use client';

/**
 * Inteligência Tática — o sistema recomenda a partir de dados reais já
 * existentes; o master aprova, adia ou descarta. NENHUM push é enviado
 * daqui — aprovar só registra a decisão (TacticalDecision no backend),
 * pra quando/se uma campanha de verdade for desenhada, fora desta tela.
 */
import { useState } from 'react';
import { adminGet, filterParams, type GlobalFilter } from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

interface Decision {
  decision: string; decision_label: string; note: string | null;
  decided_by: string | null; decided_at: string | null;
}
interface Suggestion {
  key: string; title: string; body: string;
  example_message: string | null; audience_size: number;
  decision: Decision | null;
}
interface SuggestionsResponse { suggestions: Suggestion[]; note: string }

async function postDecision(key: string, decision: string, note?: string) {
  const token = getToken();
  const res = await fetch(`/api/v1/admin/analytics/tactical-decisions/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision, note: note || undefined }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function SuggestionCard({ suggestion, onDecided }: { suggestion: Suggestion; onDecided: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const decide = async (decision: string) => {
    setBusy(decision); setErr(null);
    try {
      await postDecision(suggestion.key, decision);
      onDecided();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Oportunidade a investigar</div>
      <h3 className="mt-1 text-[15px] font-bold text-slate-900">{suggestion.title}</h3>
      <p className="mt-1 text-[11px] font-semibold text-emerald-700">Público estimado: {numberFmt(suggestion.audience_size)}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{suggestion.body}</p>
      {suggestion.example_message && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[12px]">
          <span className="font-bold text-slate-700">Exemplo de mensagem — NÃO é campanha aprovada:</span>
          <p className="mt-1 italic text-slate-500">&quot;{suggestion.example_message}&quot;</p>
          <p className="mt-1 text-[11px] text-slate-400">Público, horário e frequência precisam de validação e aprovação do master.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => decide('approved_for_review')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
          {busy === 'approved_for_review' ? 'Enviando…' : 'Solicitar análise para aprovação'}
        </button>
        <button type="button" disabled={!!busy} onClick={() => decide('postponed')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50">
          {busy === 'postponed' ? 'Enviando…' : 'Adiar análise'}
        </button>
        <button type="button" disabled={!!busy} onClick={() => decide('discarded')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50">
          {busy === 'discarded' ? 'Enviando…' : 'Descartar sugestão'}
        </button>
      </div>
      {err && <p className="mt-2 text-[11px] text-rose-600">Erro ao registrar: {err}</p>}
      <p className="mt-2 text-[11px] text-slate-400">
        {suggestion.decision
          ? `${suggestion.decision.decision_label} por ${suggestion.decision.decided_by || '—'} em ${suggestion.decision.decided_at ? new Date(suggestion.decision.decided_at).toLocaleString('pt-BR') : '—'}. Nenhum push foi enviado por este painel.`
          : 'Nenhuma decisão registrada ainda. Nenhum push será enviado por este painel.'}
      </p>
    </div>
  );
}

export function TacticalSection({ filter }: { filter: GlobalFilter }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading } = useAsync<SuggestionsResponse>(
    () => adminGet('/tactical-suggestions', filterParams(filter)), [JSON.stringify(filter), refreshKey],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <Panel title="Regras de comunicação inteligente">
        <ul className="grid gap-1.5 text-[12px] text-slate-600 sm:grid-cols-2">
          <li>✓ Segmentar por comportamento real</li>
          <li>✓ Excluir quem já concluiu a ação</li>
          <li>✓ Respeitar permissão e histórico de push</li>
          <li>✓ Aplicar limite de frequência aprovado</li>
          <li>✓ Distinguir envio, entrega e interação</li>
          <li>✓ Aprovação humana antes de qualquer campanha</li>
        </ul>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Nunca modificar regras, agendamentos ou tokens push existentes por aqui.
        </p>
      </Panel>

      {data.suggestions.length === 0 ? (
        <Panel title="Sugestões"><p className="text-[13px] text-slate-400">Nenhuma oportunidade identificada com os dados atuais.</p></Panel>
      ) : (
        <div className="space-y-3">
          {data.suggestions.map((s) => (
            <SuggestionCard key={s.key} suggestion={s} onDecided={() => setRefreshKey((k) => k + 1)} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">{data.note}</p>
    </div>
  );
}
