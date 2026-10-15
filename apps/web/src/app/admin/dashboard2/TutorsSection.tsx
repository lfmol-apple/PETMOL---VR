'use client';

/**
 * Tutores — a tabela de pessoas do Dashboard 2, com os dados de conta que o
 * BI antigo escondia (telefone, bairro, forma de login, termos, origem da
 * campanha) e a edição da conta a pedido do usuário.
 */
import { useEffect, useState } from 'react';
import { adminGet, filterParams, type GlobalFilter } from '@/lib/admin/analyticsApi';
import {
  editAccount, getAccount,
  type AccountEdit, type AccountRecord, type TutorRow, type TutorsListResponse,
} from '@/lib/admin/tutorsApi';
import { Pagination, fmtDateTime } from '@/components/admin/DataTable';
import { ErrorBox, Loading, PetAvatarStack, numberFmt, useAsync } from '@/components/admin/sections/sections';

type Tri = '' | 'yes' | 'no';
interface Extra {
  hasPet: Tri; hasFeeding: Tri; emailVerified: Tri;
  activity: '' | 'active' | 'recent' | 'cooling' | 'dormant' | 'no_analytics';
  push: '' | 'active' | 'none';
}
const NO_EXTRA: Extra = { hasPet: '', hasFeeding: '', emailVerified: '', activity: '', push: '' };

const ACTIVITY_LABEL: Record<string, string> = {
  active: 'Ativo', recent: 'Recente', cooling: 'Esfriando', dormant: 'Adormecido', no_analytics: 'Sem dados',
};
const PLATFORM_LABEL: Record<string, string> = { iphone: 'iPhone', ipad: 'iPad', android: 'Android', desktop: 'Desktop', outros: 'Outros' };

export function TutorsSection({ filter }: { filter: GlobalFilter }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const [editing, setEditing] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);
  const filterKey = JSON.stringify(filter);
  const extraKey = JSON.stringify(extra);
  useEffect(() => { setPage(1); }, [debounced, filterKey, extraKey]);

  const { data, error, loading } = useAsync<TutorsListResponse>(
    () => adminGet('/users', {
      ...filterParams(filter), page, page_size: 50, search: debounced || undefined,
      sort: 'created_at', direction: 'desc',
      has_pet: extra.hasPet || undefined, has_feeding: extra.hasFeeding || undefined,
      email_verified: extra.emailVerified || undefined, activity: extra.activity || undefined,
      push: extra.push || undefined,
    }),
    [page, debounced, filterKey, extraKey, version],
  );

  const set = <K extends keyof Extra>(key: K, value: Extra[K]) => setExtra((e) => ({ ...e, [key]: value }));
  const sel = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px]';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-[15px] font-extrabold text-slate-800">Tutores</h2>
      <p className="mb-3 mt-0.5 text-[12px] text-slate-500">
        Quem se cadastrou no período, com os dados de conta. Clique em Editar para corrigir uma conta a pedido do usuário.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou e-mail"
          className="w-56 rounded-md border border-slate-200 px-2.5 py-1 text-[12px]" />
        <select className={sel} value={extra.hasPet} onChange={(e) => set('hasPet', e.target.value as Tri)}>
          <option value="">Pet: todos</option><option value="yes">Com pet</option><option value="no">Sem pet</option>
        </select>
        <select className={sel} value={extra.hasFeeding} onChange={(e) => set('hasFeeding', e.target.value as Tri)}>
          <option value="">Ração: todos</option><option value="yes">Com ração</option><option value="no">Sem ração</option>
        </select>
        <select className={sel} value={extra.emailVerified} onChange={(e) => set('emailVerified', e.target.value as Tri)}>
          <option value="">E-mail: todos</option><option value="yes">Verificado</option><option value="no">Não verificado</option>
        </select>
        <select className={sel} value={extra.push} onChange={(e) => set('push', e.target.value as Extra['push'])}>
          <option value="">Notificação: todos</option><option value="active">Ativa</option><option value="none">Sem notificação</option>
        </select>
        <select className={sel} value={extra.activity} onChange={(e) => set('activity', e.target.value as Extra['activity'])}>
          <option value="">Atividade: todas</option>
          {Object.entries(ACTIVITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {JSON.stringify(extra) !== JSON.stringify(NO_EXTRA) && (
          <button type="button" onClick={() => setExtra(NO_EXTRA)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-500">limpar</button>
        )}
        {data && <span className="ml-auto text-[12px] text-slate-500">{numberFmt(data.total)} tutores</span>}
      </div>

      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-3">Tutor</th>
                  <th className="px-2">Contato</th>
                  <th className="px-2">Cadastro</th>
                  <th className="px-2">Origem</th>
                  <th className="px-2">Local</th>
                  <th className="px-2">Conta</th>
                  <th className="px-2">Atividade</th>
                  <th className="px-2">Notificação / GPS</th>
                  <th className="px-2">Pets</th>
                  <th className="px-2">Dispositivo</th>
                  <th className="pl-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => <TutorRowView key={u.user_id} u={u} onEdit={() => setEditing(u.user_id)} />)}
                {data.items.length === 0 && (
                  <tr><td colSpan={11} className="py-8 text-center text-slate-400">Nenhum tutor com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}

      {editing && (
        <AccountEditor
          userId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </section>
  );
}

function Chip({ tone, children }: { tone: 'good' | 'warn' | 'muted'; children: React.ReactNode }) {
  const cls = tone === 'good' ? 'bg-emerald-100 text-emerald-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function TutorRowView({ u, onEdit }: { u: TutorRow; onEdit: () => void }) {
  const place = [u.neighborhood, u.city && u.state ? `${u.city} / ${u.state}` : u.city || u.state, u.country && u.country !== 'BR' && u.country !== 'Brasil' ? u.country : null]
    .filter(Boolean).join(' · ');
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-3">
        <div className="font-semibold text-slate-800">{u.name || '—'}</div>
        <div className="text-slate-500">{u.email}</div>
      </td>
      <td className="px-2">
        {u.phone ? <div className="text-slate-700">{u.phone}</div> : <span className="text-slate-300">sem telefone</span>}
        {u.phone && <div className="text-[11px] text-slate-400">{u.whatsapp ? 'aceita WhatsApp' : 'sem WhatsApp'}</div>}
      </td>
      <td className="px-2 whitespace-nowrap">
        <div>{fmtDateTime(u.created_at)}</div>
        {u.first_seen && <div className="text-[11px] text-slate-400">1º uso {fmtDateTime(u.first_seen)}</div>}
      </td>
      <td className="px-2">
        {u.origin_campaign
          ? <><div className="font-semibold text-slate-700">{u.origin_campaign}</div><div className="text-[11px] text-slate-400">{u.origin_source || ''}</div></>
          : <span className="text-slate-300">orgânico / sem origem</span>}
      </td>
      <td className="px-2 text-slate-600">{place || <span className="text-slate-300">—</span>}</td>
      <td className="px-2">
        <div className="flex flex-wrap gap-1">
          {u.login_methods.map((m) => <Chip key={m} tone="muted">{m}</Chip>)}
          <Chip tone={u.email_verified ? 'good' : 'warn'}>{u.email_verified ? 'e-mail verificado' : 'e-mail não verificado'}</Chip>
          <Chip tone={u.terms_accepted ? 'good' : 'warn'}>{u.terms_accepted ? `termos ${u.terms_version || ''}`.trim() : 'sem aceite dos termos'}</Chip>
        </div>
      </td>
      <td className="px-2 whitespace-nowrap">
        <div className="font-semibold text-slate-700">{ACTIVITY_LABEL[u.activity_status] || u.activity_status}</div>
        <div className="text-[11px] text-slate-400">{u.last_activity ? fmtDateTime(u.last_activity) : 'nunca'}</div>
      </td>
      <td className="px-2">
        <div className="flex flex-wrap gap-1">
          <Chip tone={u.push_active ? 'good' : 'warn'}>{u.push_active ? 'notificação ativa' : 'sem notificação'}</Chip>
          <Chip tone={u.location_shared ? 'good' : 'muted'}>{u.location_shared ? 'GPS' : 'sem GPS'}</Chip>
        </div>
      </td>
      <td className="px-2">
        <div className="flex items-center gap-2">
          <PetAvatarStack pets={u.pet_thumbnails} size={26} />
          <span className="text-slate-600">{u.pets}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {u.has_feeding ? 'com ração' : 'sem ração'} · {u.active_control_pets} controle(s)
        </div>
      </td>
      <td className="px-2 whitespace-nowrap">
        <div>{u.device_type ? PLATFORM_LABEL[u.device_type] : '—'}</div>
        <div className="text-[11px] text-slate-400">{u.app_version_label}</div>
      </td>
      <td className="pl-2 text-right">
        <button type="button" onClick={onEdit}
          className="rounded-md border border-[#0056D2] px-2.5 py-1 text-[12px] font-bold text-[#0056D2] hover:bg-blue-50">
          Editar
        </button>
      </td>
    </tr>
  );
}

// ── Edição da conta ───────────────────────────────────────────────────────

const TEXT_FIELDS: { key: keyof AccountEdit; label: string; type?: string }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'postal_code', label: 'CEP' },
  { key: 'street', label: 'Rua' },
  { key: 'number', label: 'Número' },
  { key: 'complement', label: 'Complemento' },
  { key: 'neighborhood', label: 'Bairro' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'UF' },
  { key: 'country', label: 'País' },
];

function AccountEditor({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void }) {
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [form, setForm] = useState<AccountEdit>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    getAccount(userId)
      .then((a) => { if (alive) setAccount(a); })
      .catch((e) => { if (alive) setLoadError(String(e?.message || e)); });
    return () => { alive = false; };
  }, [userId]);

  const value = <K extends keyof AccountEdit>(key: K) =>
    (key in form ? form[key] : account?.[key as keyof AccountRecord]) as AccountEdit[K];
  const change = <K extends keyof AccountEdit>(key: K, v: AccountEdit[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: v }));
  };
  const dirty = Object.keys(form).length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await editAccount(userId, form);
      setAccount(updated);
      setForm({});
      setSaved(true);
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Editar conta">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-extrabold text-slate-800">Editar conta</h3>
            {account && <p className="text-[12px] text-slate-500">{account.email}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[13px] font-semibold text-slate-500 hover:bg-slate-100">Fechar</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loadError && <ErrorBox msg={loadError} />}
          {!account && !loadError && <Loading />}
          {account && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {TEXT_FIELDS.map((f) => (
                  <label key={f.key} className={`block text-[11px] font-bold uppercase tracking-wide text-slate-400 ${
                    ['name', 'email', 'street', 'complement'].includes(f.key) ? 'col-span-2' : ''}`}>
                    {f.label}
                    <input
                      type={f.type || 'text'}
                      value={(value(f.key) as string | null) ?? ''}
                      onChange={(e) => change(f.key, e.target.value as never)}
                      className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-slate-800"
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" checked={Boolean(value('whatsapp'))} onChange={(e) => change('whatsapp', e.target.checked)} />
                Aceita contato por WhatsApp
              </label>
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" checked={Boolean(value('email_verified'))} onChange={(e) => change('email_verified', e.target.checked)} />
                E-mail verificado
              </label>

              <div className="rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Só leitura</p>
                <p>Entra com: {account.login_methods.join(', ') || '—'}</p>
                <p>Termos: {account.terms_accepted ? `aceitos (versão ${account.terms_version || '—'}) em ${fmtDateTime(account.terms_accepted_at)}` : 'não aceitos'}</p>
                <p>Localização: {account.location_source || 'não compartilha'}{account.location_updated_at ? ` · ${fmtDateTime(account.location_updated_at)}` : ''}</p>
                <p>Check-in mensal: dia {account.monthly_checkin_day}, {String(account.monthly_checkin_hour).padStart(2, '0')}h</p>
                <p>Conta criada {fmtDateTime(account.created_at)} · alterada {fmtDateTime(account.updated_at)}</p>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          {saveError && <p className="mb-2 text-[12px] font-semibold text-rose-600">{saveError}</p>}
          {saved && <p className="mb-2 text-[12px] font-semibold text-emerald-600">Salvo.</p>}
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="w-full rounded-xl bg-[#0056D2] py-2.5 text-[14px] font-bold text-white disabled:opacity-40">
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Cada alteração fica registrada no log do servidor, com quem editou e quais campos mudaram.
          </p>
        </div>
      </div>
    </div>
  );
}
