'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PremiumScreenShell } from '@/components/premium';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import type { GlobalFilter } from '@/lib/admin/analyticsApi';
import {
  OverviewSection, UsersSection, FeaturesSection, DataQualitySection,
  RetentionSection, CommerceSection, GeoSection,
} from '@/components/admin/sections/sections';
import { OperationsSection } from '@/components/admin/sections/OperationsSection';

type SectionKey =
  | 'overview' | 'users' | 'features' | 'retention' | 'commerce' | 'geo' | 'quality' | 'ops';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'users', label: 'Tutores & Pets' },
  { key: 'features', label: 'Funcionalidades' },
  { key: 'quality', label: 'Qualidade dos Dados' },
  { key: 'retention', label: 'Retenção' },
  { key: 'commerce', label: 'Commerce' },
  { key: 'geo', label: 'Localização' },
  { key: 'ops', label: 'Operação' },
];

const PERIODS = [
  { label: '7d', v: 7 }, { label: '30d', v: 30 }, { label: '90d', v: 90 }, { label: 'Tudo', v: undefined },
];

/** Telas admin completas (fora do BI) — atalhos fixos no topo do painel. */
const ADMIN_TOOLS: { href: string; label: string; highlight?: boolean }[] = [
  { href: '/admin/establishments', label: '🏪 Estabelecimentos' },
  { href: '/admin/accounts', label: '👤 Contas' },
  { href: '/admin/pets', label: '🐾 Pets' },
  { href: '/admin/notifications', label: '🔔 Notificações' },
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { isAdmin, adminData, isLoading: adminLoading } = useAdmin();
  const [section, setSection] = useState<SectionKey>('overview');
  const [filter, setFilter] = useState<GlobalFilter>({ period_days: 30 });

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) router.push('/home');
  }, [adminLoading, isAdmin, router]);

  if (adminLoading || !isAdmin || !adminData) {
    return (
      <PremiumScreenShell title="PETMOL Admin" hideBack>
        <p className="py-16 text-center text-slate-500">Verificando autenticação…</p>
      </PremiumScreenShell>
    );
  }

  const showFilter = section !== 'ops' && section !== 'quality';

  return (
    <PremiumScreenShell
      title="Mission Control"
      subtitle={`${adminData.email} • ${adminData.role}`}
      hideBack
      rightAction={
        <button onClick={() => { logout(); router.push('/home'); }}
          className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200">Sair</button>
      }
    >
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        {/* section nav */}
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSection(s.key)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                section === s.key ? 'bg-[#0056D2] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* atalhos para as telas admin completas (fora do BI) */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ADMIN_TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                t.highlight
                  ? 'border-blue-300 bg-blue-50 text-[#0056D2] hover:border-blue-400'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* global filter */}
        {showFilter && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
            <span className="font-bold uppercase tracking-wide text-slate-400">Filtro</span>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button key={p.label} type="button" onClick={() => setFilter((f) => ({ ...f, period_days: p.v }))}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    filter.period_days === p.v ? 'bg-[#0056D2] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <input placeholder="plataforma" value={filter.platform || ''}
              onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value || undefined }))}
              className="w-28 rounded-md border border-slate-200 px-2 py-1" />
            <input placeholder="versão" value={filter.app_version || ''}
              onChange={(e) => setFilter((f) => ({ ...f, app_version: e.target.value || undefined }))}
              className="w-28 rounded-md border border-slate-200 px-2 py-1" />
            <input placeholder="UF" value={filter.state || ''}
              onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value || undefined }))}
              className="w-16 rounded-md border border-slate-200 px-2 py-1" />
            <input placeholder="cidade" value={filter.city || ''}
              onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value || undefined }))}
              className="w-36 rounded-md border border-slate-200 px-2 py-1" />
            {(filter.platform || filter.app_version || filter.state || filter.city) && (
              <button type="button" onClick={() => setFilter({ period_days: filter.period_days })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">limpar</button>
            )}
          </div>
        )}

        {section === 'overview' && <OverviewSection filter={filter} />}
        {section === 'users' && <UsersSection filter={filter} />}
        {section === 'features' && <FeaturesSection filter={filter} />}
        {section === 'quality' && <DataQualitySection />}
        {section === 'retention' && <RetentionSection filter={filter} />}
        {section === 'commerce' && <CommerceSection filter={filter} />}
        {section === 'geo' && <GeoSection />}
        {section === 'ops' && <OperationsSection />}
      </div>
    </PremiumScreenShell>
  );
}
