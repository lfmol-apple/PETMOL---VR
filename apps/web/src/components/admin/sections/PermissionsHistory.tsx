'use client';

/**
 * Evolução das permissões: compara a linha de base (1ª fotografia, gravada antes das melhorias)
 * com o estado mais recente e lista todas as fotografias. "Gravar agora" tira uma nova (só JWT de admin).
 */
import { useState } from 'react';
import { adminGet, type PermissionSnapshotRow } from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import { fmtDateTime } from '@/components/admin/DataTable';
import { useAsync, Panel, numberFmt } from './sections';

const KIND_LABEL: Record<PermissionSnapshotRow['kind'], string> = { baseline: 'Linha de base', daily: 'Diária', manual: 'Manual' };

const METRICS: { key: keyof PermissionSnapshotRow; label: string; goodWhenUp: boolean }[] = [
  { key: 'push_active', label: 'Com notificação', goodWhenUp: true },
  { key: 'gps', label: 'Compartilham localização', goodWhenUp: true },
  { key: 'gps_fresh', label: 'Localização atualizada (30 dias)', goodWhenUp: true },
  { key: 'both', label: 'Os dois', goodWhenUp: true },
  { key: 'neither', label: 'Nenhum dos dois', goodWhenUp: false },
];

function Delta({ from, to, goodWhenUp }: { from: number; to: number; goodWhenUp: boolean }) {
  const d = to - from;
  if (d === 0) return <span className="text-slate-400">sem mudança</span>;
  const good = goodWhenUp ? d > 0 : d < 0;
  return <span className={`font-bold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>{d > 0 ? '+' : ''}{d}</span>;
}

export function PermissionsHistory() {
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const history = useAsync<{ items: PermissionSnapshotRow[] }>(() => adminGet('/permissions/history'), [refresh], { live: false });

  const snapshotNow = async () => {
    setBusy(true); setErr(null);
    try {
      const token = getToken();
      const res = await fetch('/api/v1/admin/analytics/permissions/snapshots', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRefresh((n) => n + 1);
    } catch (e) {
      setErr(`Não foi possível gravar agora (${String((e as Error).message)})`);
    } finally {
      setBusy(false);
    }
  };

  const items = history.data?.items ?? [];
  const base = items[0];
  const last = items[items.length - 1];

  return (
    <Panel title="Evolução das permissões" right={
      <button type="button" onClick={snapshotNow} disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:border-blue-300 disabled:opacity-50">
        {busy ? 'Gravando…' : 'Gravar agora'}
      </button>
    }>
      {history.error && <p className="text-[12px] text-rose-600">Erro: {history.error}</p>}
      {err && <p className="text-[12px] text-rose-600">{err}</p>}
      {base && last && (
        <>
          <p className="mb-2 text-[12px] text-slate-500">
            Linha de base gravada em <strong>{fmtDateTime(base.taken_at)}</strong>
            {last.id !== base.id && <> · última fotografia em <strong>{fmtDateTime(last.taken_at)}</strong></>}
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {METRICS.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1 text-[13px]">
                <span className="text-slate-600">{m.label}</span>
                <span className="tabular-nums text-slate-800">
                  {numberFmt(base[m.key] as number)} → <strong>{numberFmt(last[m.key] as number)}</strong>{' '}
                  {last.id !== base.id && <Delta from={base[m.key] as number} to={last[m.key] as number} goodWhenUp={m.goodWhenUp} />}
                </span>
              </div>
            ))}
          </div>
          {items.length > 1 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-semibold text-blue-700 underline">
              {showAll ? 'esconder histórico' : `ver as ${items.length} fotografias`}
            </button>
          )}
          {showAll && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-slate-50 text-left text-[11px] font-bold uppercase text-slate-500">
                  <th className="px-2 py-1.5">Quando</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5 text-right">Tutores</th>
                  <th className="px-2 py-1.5 text-right">Notif.</th><th className="px-2 py-1.5 text-right">GPS</th>
                  <th className="px-2 py-1.5 text-right">GPS atual</th><th className="px-2 py-1.5 text-right">Os dois</th><th className="px-2 py-1.5 text-right">Nenhum</th>
                </tr></thead>
                <tbody>
                  {[...items].reverse().map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 tabular-nums">
                      <td className="px-2 py-1.5">{fmtDateTime(r.taken_at)}</td><td className="px-2 py-1.5">{KIND_LABEL[r.kind]}</td>
                      <td className="px-2 py-1.5 text-right">{r.total_users}</td><td className="px-2 py-1.5 text-right">{r.push_active}</td>
                      <td className="px-2 py-1.5 text-right">{r.gps}</td><td className="px-2 py-1.5 text-right">{r.gps_fresh}</td>
                      <td className="px-2 py-1.5 text-right">{r.both}</td><td className="px-2 py-1.5 text-right">{r.neither}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
