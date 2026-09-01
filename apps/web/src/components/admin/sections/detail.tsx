'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '@/lib/admin/analyticsApi';
import { Drawer, StatePill, fmtDate, fmtDateTime } from '@/components/admin/DataTable';

// ── User detail ───────────────────────────────────────────────────────────

interface UserDetail {
  user: Record<string, unknown> & { address: Record<string, unknown>; monthly_checkin: Record<string, number> };
  activity: {
    first_seen: string | null; last_activity: string | null; activity_status: string;
    active_days_last_30: number; events_total: number;
    events_by_name: Record<string, number>;
    platforms: { platform: string; events: number }[];
    app_versions: { version: string; events: number }[];
  };
  engagement_flags: Record<string, number>;
  pets: Array<{
    pet_id: string; name: string; species: string; breed: string | null;
    sex: string | null; birth_date: string | null; age_months: number | null;
    weight_value: number | null; weight_unit: string | null; neutered: boolean | null;
    has_photo: boolean; created_at: string; feature_states: Record<string, string>;
  }>;
}

export function UserDetailDrawer({ userId, onClose, onOpenPet }: {
  userId: string | null; onClose: () => void; onOpenPet: (petId: string) => void;
}) {
  const [data, setData] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setData(null); setErr(null);
    adminGet<UserDetail>(`/users/${userId}`).then(setData).catch((e) => setErr(String(e.message)));
  }, [userId]);

  return (
    <Drawer open={!!userId} onClose={onClose}
      title={data ? `${data.user.name || '(sem nome)'} · ${String(data.user.email)}` : 'Carregando…'}>
      {err && <p className="text-rose-600">{err}</p>}
      {!data && !err && <p className="text-slate-400">Carregando…</p>}
      {data && (
        <div className="space-y-5">
          <Section title="Cadastro">
            <Grid>
              <KV k="E-mail" v={String(data.user.email)} />
              <KV k="E-mail verificado" v={data.user.email_verified ? 'sim' : 'não'} />
              <KV k="Telefone" v={data.user.phone_present ? 'informado' : '—'} />
              <KV k="Criado em" v={fmtDateTime(String(data.user.created_at))} />
              <KV k="Cidade / UF" v={`${data.user.address.city || '—'} / ${data.user.address.state || '—'}`} />
              <KV k="Bairro" v={String(data.user.address.neighborhood || '—')} />
              <KV k="Termos" v={data.user.terms_accepted ? `aceitos (${data.user.terms_version || '?'})` : 'não'} />
            </Grid>
          </Section>

          <Section title="Atividade (analytics)">
            <Grid>
              <KV k="Primeira atividade" v={fmtDateTime(data.activity.first_seen)} />
              <KV k="Última atividade" v={fmtDateTime(data.activity.last_activity)} />
              <KV k="Status" v={<StatePill state={data.activity.activity_status} />} />
              <KV k="Dias ativos (30d)" v={String(data.activity.active_days_last_30)} />
              <KV k="Eventos totais" v={data.activity.events_total.toLocaleString('pt-BR')} />
              <KV k="Plataformas" v={data.activity.platforms.map((p) => `${p.platform} (${p.events})`).join(', ') || '—'} />
              <KV k="Versões" v={data.activity.app_versions.map((p) => `${p.version} (${p.events})`).join(', ') || '—'} />
            </Grid>
            {Object.keys(data.activity.events_by_name).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(data.activity.events_by_name).sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                  <span key={n} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{n}: {c}</span>
                ))}
              </div>
            )}
          </Section>

          <Section title="Sinais de engajamento">
            <Grid>
              <KV k="Push web" v={String(data.engagement_flags.push_web_devices)} />
              <KV k="Push nativo" v={String(data.engagement_flags.push_native_devices)} />
              <KV k="Pet Sumido" v={String(data.engagement_flags.missing_pet_reports)} />
              <KV k="Mensagens de suporte" v={String(data.engagement_flags.support_messages)} />
            </Grid>
          </Section>

          <Section title={`Pets (${data.pets.length})`}>
            <div className="space-y-2">
              {data.pets.map((p) => (
                <button key={p.pet_id} type="button" onClick={() => onOpenPet(p.pet_id)}
                  className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <span className="text-[12px] text-slate-500">
                      {p.species} · {p.breed || 'sem raça'} · {p.age_months != null ? `${p.age_months}m` : 'idade —'}
                      {p.weight_value ? ` · ${p.weight_value}${p.weight_unit || 'kg'}` : ''}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(p.feature_states).map(([k, s]) => (
                      <span key={k} className="text-[10px]"><span className="text-slate-400">{k}:</span> <StatePill state={s} /></span>
                    ))}
                  </div>
                </button>
              ))}
              {data.pets.length === 0 && <p className="text-[13px] text-slate-400">Sem pets.</p>}
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}

// ── Pet detail ────────────────────────────────────────────────────────────

interface PetDetail {
  pet: Record<string, unknown>;
  tutor: { user_id: string; email: string | null; name: string | null };
  feature_states: Record<string, string>;
  feeding: Record<string, unknown> | null;
  counts: Record<string, number>;
  vaccines: Array<Record<string, unknown>>;
  parasite_controls: Array<Record<string, unknown>>;
  grooming: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

export function PetDetailDrawer({ petId, onClose }: { petId: string | null; onClose: () => void }) {
  const [data, setData] = useState<PetDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!petId) return;
    setData(null); setErr(null);
    adminGet<PetDetail>(`/pets/${petId}`).then(setData).catch((e) => setErr(String(e.message)));
  }, [petId]);

  return (
    <Drawer open={!!petId} onClose={onClose} width="max-w-3xl"
      title={data ? `${String(data.pet.name)} · ${data.tutor.email || ''}` : 'Carregando…'}>
      {err && <p className="text-rose-600">{err}</p>}
      {!data && !err && <p className="text-slate-400">Carregando…</p>}
      {data && (
        <div className="space-y-5">
          <Section title="Cadastro">
            <Grid>
              <KV k="Espécie" v={String(data.pet.species)} />
              <KV k="Raça" v={String(data.pet.breed || '—')} />
              <KV k="Sexo" v={String(data.pet.sex || '—')} />
              <KV k="Nascimento" v={fmtDate(String(data.pet.birth_date || ''))} />
              <KV k="Idade" v={data.pet.age_months != null ? `${data.pet.age_months} meses` : '—'} />
              <KV k="Peso" v={data.pet.weight_value ? `${data.pet.weight_value} ${data.pet.weight_unit || 'kg'}` : '—'} />
              <KV k="Castrado" v={data.pet.neutered == null ? '—' : data.pet.neutered ? 'sim' : 'não'} />
              <KV k="Foto" v={data.pet.has_photo ? 'sim' : 'não'} />
              <KV k="Plano de saúde" v={String(data.pet.insurance_provider || '—')} />
              <KV k="Criado em" v={fmtDateTime(String(data.pet.created_at))} />
            </Grid>
          </Section>

          <Section title="Estado das funcionalidades">
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.feature_states).map(([k, s]) => (
                <span key={k} className="text-[11px]"><span className="text-slate-400">{k}</span> <StatePill state={s} /></span>
              ))}
            </div>
          </Section>

          {data.feeding && (
            <Section title="Alimentação">
              <Grid>
                <KV k="Habilitado" v={data.feeding.enabled ? 'sim' : 'não'} />
                <KV k="Modo" v={String(data.feeding.mode || '—')} />
                <KV k="Ração" v={String(data.feeding.food_brand || '—')} />
                <KV k="Pacote (kg)" v={String(data.feeding.package_size_kg ?? '—')} />
                <KV k="Consumo/dia (g)" v={String(data.feeding.daily_amount_g ?? '—')} />
                <KV k="Itens" v={String(data.feeding.items_count ?? 0)} />
                <KV k="Fim estimado" v={fmtDate(String(data.feeding.estimated_end_date || ''))} />
                <KV k="Atualizado" v={fmtDateTime(String(data.feeding.updated_at || ''))} />
              </Grid>
            </Section>
          )}

          <Section title="Contadores">
            <Grid>
              {Object.entries(data.counts).map(([k, v]) => <KV key={k} k={k} v={String(v)} />)}
            </Grid>
          </Section>

          <RecordList title={`Vacinas (${data.vaccines.length})`} rows={data.vaccines}
            cols={['name', 'applied', 'next_dose', 'dose_number']} />
          <RecordList title={`Antiparasitários (${data.parasite_controls.length})`} rows={data.parasite_controls}
            cols={['type', 'product', 'applied', 'next_due', 'collar_expiry', 'has_gtin']} />
          <RecordList title={`Banho & tosa (${data.grooming.length})`} rows={data.grooming}
            cols={['type', 'date', 'next_recommended', 'cost']} />
          <RecordList title={`Eventos (${data.events.length})`} rows={data.events}
            cols={['type', 'status', 'scheduled_at', 'completed_at', 'next_due', 'source']} />
        </div>
      )}
    </Drawer>
  );
}

// ── Population drawer (feature / data-quality drill-down) ──────────────────

export function PopulationDrawer({ path, title, onClose, onOpenUser, onOpenPet }: {
  path: string | null; title: string; onClose: () => void;
  onOpenUser: (id: string) => void; onOpenPet: (id: string) => void;
}) {
  const [data, setData] = useState<{ total: number; items: Array<Record<string, unknown>> } | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    setData(null); setErr(null);
    adminGet<{ total: number; items: Array<Record<string, unknown>> }>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&page_size=50`)
      .then(setData).catch((e) => setErr(String(e.message)));
  }, [path, page]);

  useEffect(() => { setPage(1); }, [path]);

  return (
    <Drawer open={!!path} onClose={onClose} title={title}>
      {err && <p className="text-rose-600">{err}</p>}
      {!data && !err && <p className="text-slate-400">Carregando…</p>}
      {data && (
        <div>
          <p className="mb-2 text-[13px] text-slate-500">{data.total.toLocaleString('pt-BR')} registros</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {data.items.map((it, i) => {
              const isPet = 'pet_id' in it;
              return (
                <button key={i} type="button"
                  onClick={() => isPet ? onOpenPet(String(it.pet_id)) : onOpenUser(String(it.user_id))}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-blue-50/40">
                  <span className="font-medium text-slate-800">
                    {isPet ? `${it.pet_name} (${it.species || '?'})` : String(it.name || it.email || it.user_id || '')}
                  </span>
                  <span className="text-[12px] text-slate-500">
                    {isPet ? String(it.tutor_email || '') : String(it.email || '')}
                    {'state' in it && it.state ? ` · ${it.state}` : ''}
                  </span>
                </button>
              );
            })}
            {data.items.length === 0 && <p className="px-3 py-6 text-center text-slate-400">Vazio.</p>}
          </div>
          {data.total > 50 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-[12px]">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Anterior</button>
              <span>{page} / {Math.ceil(data.total / 50)}</span>
              <button type="button" disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ── small building blocks ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-3">{children}</div>;
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</div>
      <div className="truncate text-[13px] text-slate-800">{v}</div>
    </div>
  );
}
function RecordList({ title, rows, cols }: { title: string; rows: Array<Record<string, unknown>>; cols: string[] }) {
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-[12px]">
          <thead><tr className="bg-slate-50 text-left text-slate-500">
            {cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1.5 text-slate-700">
                    {typeof r[c] === 'boolean' ? (r[c] ? 'sim' : 'não')
                      : (c.includes('date') || c.includes('_at') || c === 'applied' || c === 'next_due')
                        ? fmtDate(r[c] as string) : String(r[c] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
