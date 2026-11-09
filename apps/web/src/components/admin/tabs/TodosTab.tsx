'use client';

/** Todos — a lista completa de tutores com pets, fotos e os dados de conta, com os filtros de período, plataforma e local. */
import { useState } from 'react';
import type { GlobalFilter } from '@/lib/admin/analyticsApi';
import { spDayBounds } from '@/lib/analytics/spTime';
import { FilterBar, presetPatch, type PresetKey } from '@/components/admin/AdminUi';
import { TutorsSection } from './TutorsSection';

export function TodosTab() {
  const [filter, setFilter] = useState<GlobalFilter>({});
  const [preset, setPreset] = useState<PresetKey>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const applyPreset = (key: PresetKey) => { setPreset(key); setFilter((f) => ({ ...f, ...presetPatch(key) })); };
  const applyRange = (a: string, b: string) => {
    setPreset('custom');
    setFilter((f) => ({ ...f, period_days: undefined, since: a ? spDayBounds(a)?.start.toISOString() : undefined, until: b ? spDayBounds(b)?.end.toISOString() : undefined }));
  };
  return (
    <div className="space-y-4">
      <FilterBar filter={filter} setFilter={setFilter} preset={preset} applyPreset={applyPreset} from={from} to={to} setFrom={setFrom} setTo={setTo} applyRange={applyRange} />
      <TutorsSection filter={filter} />
    </div>
  );
}
