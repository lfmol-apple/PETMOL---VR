'use client';

/**
 * Mapa dos tutores — cada marcador é um tutor com pelo menos um pet
 * cadastrado. Usa SOMENTE localização já persistida (User.lat/lng, mesma
 * coluna do Pet Sumido) — nenhuma permissão nova, nenhuma coordenada
 * inventada. Leaflet + OpenStreetMap (biblioteca já usada neste projeto
 * antes, removida só por ficar órfã, não por problema técnico — ver
 * histórico do OsmMap.tsx). CSS importado aqui mesmo (não em globals.css)
 * pra não repetir o bug de import órfão de antes.
 */
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, MarkerClusterGroup } from 'leaflet';
import { adminGet, filterParams, type GlobalFilter, DEVICE_TYPE_LABEL } from '@/lib/admin/analyticsApi';
import { useAsync, Loading, ErrorBox, numberFmt } from './sections';
import { UserDetailDrawer, PetDetailDrawer } from './detail';

interface MapMarkerData {
  user_id: string; name: string | null; email: string;
  lat: number; lng: number; precision: 'gps' | 'city' | 'outros';
  city: string | null; state: string | null;
  pet_count: number;
  pet_thumbnails: { pet_id: string; name: string; species: string; photo_url: string | null }[];
  device_type: string | null;
  last_activity: string | null;
}
interface MapResponse {
  markers: MapMarkerData[];
  total_tutors_with_pet: number;
  mapped_count: number;
  unmapped_count: number;
  precision: { gps: number; city: number; outros: number };
  note: string;
}

function popupHtml(m: MapMarkerData): string {
  const petLine = m.pet_thumbnails
    .map((p) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">
      ${p.photo_url ? `<img src="${p.photo_url}" style="width:20px;height:20px;border-radius:9999px;object-fit:cover" />` : '🐾'}
      <span style="font-size:11px;color:#475569">${p.name}</span>
    </span>`).join('');
  const device = m.device_type ? (DEVICE_TYPE_LABEL as Record<string, string>)[m.device_type] || m.device_type : 'Não identificado';
  return `
    <div style="min-width:200px">
      <div style="font-weight:700;color:#0f172a">${m.name || '(sem nome)'}</div>
      <div style="font-size:12px;color:#64748b">${m.email}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">${[m.city, m.state].filter(Boolean).join('/') || '—'} · ${device}</div>
      <div style="margin-top:6px">${petLine || '<span style="font-size:11px;color:#94a3b8">sem pets visíveis</span>'}</div>
      <button data-open-tutor="${m.user_id}" style="margin-top:8px;width:100%;padding:6px 10px;border-radius:8px;background:#0056D2;color:white;font-size:12px;font-weight:700;border:none;cursor:pointer">
        Abrir cadastro completo
      </button>
    </div>`;
}

function LeafletMapView({ markers, onOpenTutor }: { markers: MapMarkerData[]; onOpenTutor: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const clusterRef = useRef<MarkerClusterGroup | null>(null);
  const onOpenTutorRef = useRef(onOpenTutor);
  onOpenTutorRef.current = onOpenTutor;

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    let alive = true;

    // Import dinâmico, só no cliente — leaflet mexe em `window`/`document`
    // direto e quebra em SSR. leaflet.markercluster é um plugin no formato
    // antigo (assume `window.L` já existir, como um <script> global) — por
    // isso importa leaflet PRIMEIRO, expõe em window.L, só depois importa
    // o plugin; import em paralelo (Promise.all) dá "L is not defined".
    import('leaflet').then(async (leafletMod) => {
      if (!alive || !containerRef.current) return;
      const L = leafletMod.default;
      (window as unknown as { L: typeof L }).L = L;
      await import('leaflet.markercluster');
      if (!alive || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView([-14.235, -51.9253], 4); // centro do Brasil
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map);
        map.getContainer().addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('[data-open-tutor]');
          if (btn) onOpenTutorRef.current(btn.getAttribute('data-open-tutor')!);
        });
        mapRef.current = map;
      }
      const map = mapRef.current;

      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
      }
      const cluster: MarkerClusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 });
      const icon = (color: string) => L.divIcon({
        className: '',
        html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -26],
      });

      markers.forEach((m) => {
        const marker = L.marker([m.lat, m.lng], {
          icon: icon(m.precision === 'gps' ? '#0056D2' : '#f59e0b'),
        });
        marker.bindPopup(popupHtml(m));
        cluster.addLayer(marker);
      });
      map.addLayer(cluster);
      clusterRef.current = cluster;

      if (markers.length > 0) {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    });

    return () => { alive = false; };
  }, [markers]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <div ref={containerRef} className="h-[520px] w-full rounded-xl border border-slate-200" />;
}

export function MapSection({ filter }: { filter: GlobalFilter }) {
  const [feedingFilter, setFeedingFilter] = useState<'' | 'true' | 'false'>('');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openPet, setOpenPet] = useState<string | null>(null);
  const { data, error, loading } = useAsync<MapResponse>(
    () => adminGet('/map-tutors', { ...filterParams(filter), has_feeding: feedingFilter || undefined }),
    [feedingFilter, JSON.stringify(filter)],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Tutores com pet</div>
          <div className="text-2xl font-black text-slate-900">{numberFmt(data.total_tutors_with_pet)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] font-bold uppercase text-emerald-700">No mapa</div>
          <div className="text-2xl font-black text-emerald-900">{numberFmt(data.mapped_count)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-bold uppercase text-amber-700">Sem localização</div>
          <div className="text-2xl font-black text-amber-900">{numberFmt(data.unmapped_count)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">GPS / cidade</div>
          <div className="text-2xl font-black text-slate-900">{data.precision.gps} <span className="text-slate-300">/</span> {data.precision.city}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={feedingFilter} onChange={(e) => setFeedingFilter(e.target.value as typeof feedingFilter)}
          className="rounded-lg border border-slate-300 px-2.5 py-2 text-[13px] text-slate-600 outline-none focus:border-blue-400">
          <option value="">Todos (alimentação)</option>
          <option value="true">Com alimentação cadastrada</option>
          <option value="false">Sem alimentação cadastrada</option>
        </select>
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#0056D2]" /> GPS
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> centro da cidade
        </span>
      </div>

      <LeafletMapView markers={data.markers} onOpenTutor={setOpenUser} />

      <p className="text-[11px] text-slate-400">{data.note}</p>

      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)} onOpenPet={(id) => setOpenPet(id)} />
      <PetDetailDrawer petId={openPet} onClose={() => setOpenPet(null)} />
    </div>
  );
}
