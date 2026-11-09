'use client';

/** Pets sumidos — todos os alertas: quem avisou, quantos foram notificados, achados e avistamentos. */
import { useState } from 'react';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { PhotoLightboxProvider, PetPhotoThumb } from '@/components/admin/PhotoLightbox';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';
import { fmtDateTime } from '@/components/admin/DataTable';

interface Item {
  id: string; pet_name: string; species: string | null; breed: string | null; status: string; photo_url: string | null;
  created_at: string | null; found_at: string | null; last_seen_location: string | null; radius_km: number | null;
  reporter_type: string | null; public_slug: string | null; tutor_name: string | null; tutor_email: string | null;
  notified: number; found_reports: number; sightings: number;
}
interface Resp { total: number; active: number; items: Item[] }

const FILTERS = [{ key: 'all', label: 'Todos' }, { key: 'active', label: 'Sumidos agora' }, { key: 'found', label: 'Encontrados' }] as const;
const SPECIES: Record<string, string> = { dog: 'Cão', cat: 'Gato' };

export function PetsSumidosTab() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const { data, error, loading } = useAsync<Resp>(() => adminApi('/missing-pets', { params: { status, limit: 300 } }), [status], { intervalMs: 30000 });

  const q = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter((i) => !q || [i.pet_name, i.tutor_name, i.tutor_email, i.last_seen_location, i.breed].some((v) => v?.toLowerCase().includes(q)));

  return (
    <PhotoLightboxProvider>
      <Card title="Pets sumidos" subtitle={data ? `${numberFmt(data.active)} sumidos agora · ${numberFmt(data.total)} alertas no total` : undefined}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setStatus(f.key)}
              className={`rounded-md px-2.5 py-1 font-semibold ${status === f.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{f.label}</button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pet, tutor ou lugar"
            className="ml-auto w-60 rounded-md border border-slate-200 px-2.5 py-1 text-[12px]" />
        </div>
        {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-500">Nenhum alerta aqui.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i) => {
              const active = i.status === 'active';
              return (
                <li key={i.id} className="flex gap-3 py-3">
                  <PetPhotoThumb src={i.photo_url} alt={i.pet_name} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-extrabold text-slate-900">
                      {i.pet_name}
                      <span className="text-[12px] font-medium text-slate-500">{[SPECIES[i.species ?? ''] ?? i.species, i.breed].filter(Boolean).join(' · ')}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {active ? 'Sumido' : 'Encontrado'}
                      </span>
                    </p>
                    <p className="text-[12px] text-slate-500">
                      Avisou: {i.tutor_name || '—'}{i.tutor_email ? ` · ${i.tutor_email}` : ''}{i.reporter_type && i.reporter_type !== 'tutor_app' ? ` · via ${i.reporter_type}` : ''}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {i.created_at ? `Desde ${fmtDateTime(i.created_at)}` : ''}{i.found_at ? ` · encontrado em ${fmtDateTime(i.found_at)}` : ''}
                      {i.last_seen_location ? ` · ${i.last_seen_location}` : ''}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 text-[12px] font-semibold text-slate-700">
                      <span>{numberFmt(i.notified)} notificados{i.radius_km ? ` (raio ${i.radius_km} km)` : ''}</span>
                      <span>{numberFmt(i.found_reports)} “achei”</span>
                      <span>{numberFmt(i.sightings)} avistamentos</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PhotoLightboxProvider>
  );
}
