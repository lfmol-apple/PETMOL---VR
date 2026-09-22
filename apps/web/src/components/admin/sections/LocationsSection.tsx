'use client';

/**
 * Locais — de onde vêm os acessos e downloads do app.
 *
 * Antes disso, a única forma de ver "onde o PETMOL está sendo usado" era
 * vasculhar cada push/e-mail avulso de instalação um por um (o dono chegou
 * a receber mais de 300). Este painel agrega o MESMO dado (mesma fonte,
 * mesma distinção acesso/download do push e do e-mail diário) num ranking
 * por cidade, sem depender do filtro global — é um recorte pequeno por
 * natureza (o dono quer "os locais", não um corte fatiado por período).
 */
import { adminGet } from '@/lib/admin/analyticsApi';
import { StatCard } from '@/components/admin/charts/Charts';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

interface LocationRow {
  city: string; region: string; country: string;
  downloads: number; acessos: number; total: number;
}
interface LocationsResponse {
  downloads_today: number; acessos_today: number;
  downloads_campaign: number; acessos_campaign: number;
  total_campaign: number;
  places: LocationRow[]; places_total: number;
  note: string;
}

function placeLabel(p: LocationRow): string {
  return [p.city, p.region, p.country].filter(Boolean).join(' · ');
}

export function LocationsSection({ onFilterByCity }: {
  /** Clicar numa cidade filtra Tutores & Pets por ela — melhor esforço: o
   * local aqui vem de geo-IP, o cadastro do tutor é auto-declarado, então
   * nem sempre bate, mas quando bate poupa digitar o filtro à mão. */
  onFilterByCity?: (city: string) => void;
}) {
  const { data, error, loading } = useAsync<LocationsResponse>(
    () => adminGet('/locations'), [],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Downloads hoje" tone="good" value={numberFmt(data.downloads_today)} />
        <StatCard label="Acessos hoje" value={numberFmt(data.acessos_today)} />
        <StatCard label="Downloads (campanha)" tone="good" value={numberFmt(data.downloads_campaign)} />
        <StatCard label="Acessos (campanha)" value={numberFmt(data.acessos_campaign)} />
      </div>

      <Panel
        title="Por cidade"
        right={<span className="text-[11px] text-slate-400">
          {data.places_total > data.places.length
            ? `mostrando ${data.places.length} de ${data.places_total}`
            : `${data.places_total} local(is)`}
          {onFilterByCity ? ' · clique filtra Tutores & Pets' : ''}
        </span>}
      >
        {data.places.length === 0 ? (
          <p className="text-[13px] text-slate-400">Nenhum acesso/download registrado desde o corte da campanha.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
                <th className="py-1.5">Local</th>
                <th className="py-1.5 text-right">Downloads</th>
                <th className="py-1.5 text-right">Acessos</th>
                <th className="py-1.5 text-right">Total</th>
              </tr></thead>
              <tbody>
                {data.places.map((p) => {
                  const clickable = Boolean(onFilterByCity && p.city && p.city !== '—');
                  return (
                    <tr key={placeLabel(p)}
                      onClick={clickable ? () => onFilterByCity?.(p.city) : undefined}
                      className={`border-t border-slate-100 ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                      <td className="py-1.5 font-medium">{placeLabel(p)}</td>
                      <td className="py-1.5 text-right tabular-nums">{numberFmt(p.downloads)}</td>
                      <td className="py-1.5 text-right tabular-nums">{numberFmt(p.acessos)}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{numberFmt(p.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">{data.note}</p>
    </div>
  );
}
