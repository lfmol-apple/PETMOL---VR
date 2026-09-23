'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PremiumScreenShell } from '@/components/premium';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import type { GlobalFilter } from '@/lib/admin/analyticsApi';
import { AccordionPanel } from '@/components/admin/AccordionPanel';
import {
  OverviewSection, UsersSection, FeaturesSection, DataQualitySection,
  RetentionSection, CommerceSection, GeoSection,
} from '@/components/admin/sections/sections';
import { PhotoLightboxProvider } from '@/components/admin/PhotoLightbox';
import { FeedingSection } from '@/components/admin/sections/FeedingSection';
import { JourneySection } from '@/components/admin/sections/JourneySection';
import { LocationsSection } from '@/components/admin/sections/LocationsSection';
import { ModerationSection } from '@/components/admin/sections/ModerationSection';
import { TacticalSection } from '@/components/admin/sections/TacticalSection';
import dynamic from 'next/dynamic';
import { OperationsSection } from '@/components/admin/sections/OperationsSection';
import { spStartOfToday, spYesterdayRange, fmtSpDate } from '@/lib/analytics/spTime';

// Leaflet toca em `window`/`document` no import — dinâmico e sem SSR, senão
// quebra a renderização no servidor.
const MapSection = dynamic(
  () => import('@/components/admin/sections/MapSection').then((m) => m.MapSection),
  { ssr: false, loading: () => <p className="py-16 text-center text-[13px] text-slate-400">Carregando mapa…</p> },
);

type DatePresetKey = '24h' | 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'all' | 'custom';

const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: '24h', label: 'Últimas 24h' },
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'Tudo' },
];

/** Presets finos calculam since/until (ISO, timestamp exato — o backend já
 * aceita, AnalyticsFilters.build só não tinha como expor via period_days em
 * dias inteiros); 7d/30d/90d/Tudo continuam mandando period_days como
 * sempre mandaram, sem mudar o que já funcionava. "Hoje"/"Ontem" usam
 * fronteira de dia em America/Sao_Paulo (spTime.ts) — nunca meia-noite do
 * fuso do navegador de quem está olhando o painel. */
function presetToFilterPatch(key: DatePresetKey): Pick<GlobalFilter, 'period_days' | 'since' | 'until'> {
  const now = new Date();
  switch (key) {
    case '24h':
      return { period_days: undefined, since: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(), until: undefined };
    case 'today':
      return { period_days: undefined, since: spStartOfToday(now).toISOString(), until: undefined };
    case 'yesterday': {
      const { start, end } = spYesterdayRange(now);
      return { period_days: undefined, since: start.toISOString(), until: end.toISOString() };
    }
    case '7d': return { period_days: 7, since: undefined, until: undefined };
    case '30d': return { period_days: 30, since: undefined, until: undefined };
    case '90d': return { period_days: 90, since: undefined, until: undefined };
    case 'all': return { period_days: undefined, since: undefined, until: undefined };
    case 'custom': return { period_days: undefined, since: undefined, until: undefined };
  }
}

/** Rótulo explícito do período em análise (item 1: "exibir claramente o
 * período que está sendo analisado") — sempre em DD/MM/AAAA, horário de SP. */
function periodLabel(filter: GlobalFilter, datePreset: DatePresetKey): string {
  if (datePreset === 'all' || (!filter.since && !filter.until && !filter.period_days)) {
    return 'Todo o período (desde o início)';
  }
  if (filter.since && filter.until) {
    return `${fmtSpDate(new Date(filter.since))} até ${fmtSpDate(new Date(filter.until))}`;
  }
  if (filter.since) {
    return `Desde ${fmtSpDate(new Date(filter.since))}`;
  }
  if (filter.period_days) {
    return `Últimos ${filter.period_days} dias`;
  }
  return 'Todo o período (desde o início)';
}

type SectionLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';
const SECTION_IDS: Record<SectionLetter, string> = {
  A: 'mc-a', B: 'mc-b', C: 'mc-c', D: 'mc-d', E: 'mc-e', F: 'mc-f', G: 'mc-g', H: 'mc-h', I: 'mc-i', J: 'mc-j',
  K: 'mc-k', L: 'mc-l',
};

/** Telas admin completas (fora do BI) — atalhos fixos no topo do painel. */
const ADMIN_TOOLS: { href: string; label: string; highlight?: boolean }[] = [
  { href: '/admin/establishments', label: '🏪 Estabelecimentos' },
  { href: '/admin/accounts', label: '👤 Contas' },
  { href: '/admin/pets', label: '🐾 Pets' },
  { href: '/admin/notifications', label: '🔔 Notificações' },
  // 'Casamento Petz' saiu do menu (não do app) — página, endpoints e
  // integração Petz seguem intactos em /admin/petz, só não tem mais atalho
  // aqui. Se ainda usa em rotina, o link continua funcionando direto.
  // Página PÚBLICA (GET /missing-pets sem filtro geográfico — até 200 mais
  // recentes, ativos + já encontrados) — não existe uma tela "admin" à
  // parte porque esta já mostra a plataforma inteira, não só "perto de
  // você". Atalho aqui é só pra ficar achável a partir do painel.
  { href: '/achei-um-pet', label: '🚨 Pets Desaparecidos' },
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { isAdmin, adminData, isLoading: adminLoading } = useAdmin();
  // Padrão "Tudo" (item 1 do pedido de evolução do dashboard) — nunca abre
  // recortado em 7/30 dias. since/until vazios = sem filtro de período
  // nenhum, o backend já trata isso como "todos os registros".
  const [filter, setFilter] = useState<GlobalFilter>({});
  // Só pra destacar o botão certo — o filtro de verdade é `filter` acima
  // (since/until/period_days). Precisa separado porque since/until
  // calculado de "Hoje" não dá pra distinguir de um range customizado só
  // olhando os valores.
  const [datePreset, setDatePreset] = useState<DatePresetKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Qual coluna vem ordenada primeiro em Locais — muda quando o dono clica
  // no card Downloads ou Acessos em Indicadores Executivos (item 5).
  const [locationsSortBy, setLocationsSortBy] = useState<'total' | 'downloads' | 'acessos'>('total');

  const applyDatePreset = (key: DatePresetKey) => {
    setDatePreset(key);
    setFilter((f) => ({ ...f, ...presetToFilterPatch(key) }));
  };
  const applyCustomRange = (from: string, to: string) => {
    setDatePreset('custom');
    setFilter((f) => ({
      ...f,
      period_days: undefined,
      since: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      until: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }));
  };
  // Tudo aberto por padrão — num desktop, o dono quer VER os dados sem
  // precisar clicar em nada primeiro (seção fechada por padrão virava
  // exatamente a mesma coisa que abas escondidas). O toggle continua
  // disponível pra quem quiser recolher alguma seção específica depois.
  const [open, setOpen] = useState<Record<SectionLetter, boolean>>({
    A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true, K: true, L: true,
  });

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) router.push('/home');
  }, [adminLoading, isAdmin, router]);

  const toggle = (letter: SectionLetter) => setOpen((o) => ({ ...o, [letter]: !o[letter] }));

  /** Filtro cruzado: abre a seção e rola até ela — usado quando um card ou
   * gráfico de outra seção aponta pra um recorte de Tutores & Pets. */
  const openAndScroll = (letter: SectionLetter) => {
    setOpen((o) => ({ ...o, [letter]: true }));
    requestAnimationFrame(() => {
      document.getElementById(SECTION_IDS[letter])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const crossFilterPlatform = (platform: string) => {
    setFilter((f) => ({ ...f, platform }));
    openAndScroll('H');
  };
  const openFeeding = () => openAndScroll('C');
  /** Todo indicador cujo drill-down natural é "quem são essas pessoas/pets"
   * leva pra Seção H (tabela real, com busca) — nenhum card deve ficar
   * decorativo. */
  const openTutors = () => openAndScroll('H');
  /** "Pets desaparecidos" / "Encontrados" levam pra tela real do recurso —
   * é conteúdo público, não uma seção do BI, então navega mesmo. */
  const openMissingPets = () => router.push('/achei-um-pet');
  /** Clicar numa cidade no painel de Locais filtra Tutores & Pets por ela —
   * melhor esforço (o local vem de geo-IP, o cadastro é auto-declarado). */
  const filterByCity = (city: string) => {
    setFilter((f) => ({ ...f, city }));
    openAndScroll('H');
  };
  /** Clicar no card Downloads/Acessos em Indicadores Executivos abre Locais
   * já ordenado pela coluna correspondente, preservando o período
   * selecionado (item 5 do pedido de evolução do dashboard). */
  const openLocations = (kind: 'downloads' | 'acessos') => {
    setLocationsSortBy(kind);
    openAndScroll('K');
  };

  if (adminLoading || !isAdmin || !adminData) {
    return (
      <PremiumScreenShell title="PETMOL Admin" hideBack wide>
        <p className="py-16 text-center text-slate-500">Verificando autenticação…</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell
      title="Mission Control"
      subtitle={`${adminData.email} • ${adminData.role}`}
      hideBack
      wide
      rightAction={
        <button onClick={() => { logout(); router.push('/home'); }}
          className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200">Sair</button>
      }
    >
      {/* Sem teto de largura — um painel BI de desktop usa a tela toda. As
          tentativas anteriores (1400px, depois 1800px) mexiam só aqui, mas
          o teto de verdade era o PremiumScreenShell por fora — `max-w-2xl`
          pensado pra tela secundária de celular, aplicado incondicionalmente
          no <main>. `wide` (acima) tira esse teto pra esta página; este
          w-full aqui é o que efetivamente passa a mandar na largura. As
          grades de card por trás usam auto-fit, então se ajustam sozinhas
          à largura real de cada coluna em vez de depender de breakpoint. */}
      <PhotoLightboxProvider>
      <div className="w-full px-4 py-4 sm:px-6 lg:px-10">
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

        {/* filtro global — vale pra todas as seções abaixo (as que não usam,
            como Qualidade dos Dados, simplesmente o ignoram) */}
        <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
          <span className="font-bold uppercase tracking-wide text-slate-400">Filtro</span>
          <div className="flex flex-wrap gap-1">
            {DATE_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => applyDatePreset(p.key)}
                className={`rounded-md px-2.5 py-1 font-semibold ${
                  datePreset === p.key ? 'bg-[#0056D2] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input type="date" value={customFrom} aria-label="De"
              onChange={(e) => { const v = e.target.value; setCustomFrom(v); applyCustomRange(v, customTo); }}
              className={`rounded-md border px-2 py-1 ${datePreset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
            <span className="text-slate-400">até</span>
            <input type="date" value={customTo} aria-label="Até"
              onChange={(e) => { const v = e.target.value; setCustomTo(v); applyCustomRange(customFrom, v); }}
              className={`rounded-md border px-2 py-1 ${datePreset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
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
            <button type="button" onClick={() => setFilter((f) => ({ period_days: f.period_days, since: f.since, until: f.until }))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">limpar</button>
          )}
        </div>
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Ao vivo — cada painel se atualiza sozinho a cada 20s, sem precisar recarregar a página.
          </span>
          <span className="font-semibold text-slate-500">Analisando: {periodLabel(filter, datePreset)}</span>
        </p>

        {/* A–J, tudo aberto por padrão, em duas colunas num desktop — usa a
            largura real da tela em vez de empilhar tudo numa coluna só.
            Mapa e Tutores & Pets (tabela larga) ficam em largura cheia,
            fora da grade de 2 colunas, porque precisam do espaço. */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          <div className="space-y-4">
            <AccordionPanel id={SECTION_IDS.A} letter="A" title="Indicadores Executivos" open={open.A} onToggle={() => toggle('A')}>
              <OverviewSection filter={filter} onCrossFilterPlatform={crossFilterPlatform} onOpenFeeding={openFeeding}
                onOpenTutors={openTutors} onOpenMissingPets={openMissingPets} onOpenLocations={openLocations} />
            </AccordionPanel>

            <AccordionPanel id={SECTION_IDS.C} letter="C" title="Alimentação e Ração" subtitle="Prioridade comercial" open={open.C} onToggle={() => toggle('C')}>
              <FeedingSection filter={filter} onOpenTutors={openTutors} />
            </AccordionPanel>
          </div>

          <div className="space-y-4">
            <AccordionPanel id={SECTION_IDS.B} letter="B" title="Jornada e Conversão" open={open.B} onToggle={() => toggle('B')}>
              <JourneySection filter={filter} />
            </AccordionPanel>

            <AccordionPanel id={SECTION_IDS.D} letter="D" title="Utilização das Funcionalidades" open={open.D} onToggle={() => toggle('D')}>
              <FeaturesSection filter={filter} />
            </AccordionPanel>
          </div>
        </div>

        {/* Locais logo abaixo de Indicadores Executivos (item 6 do pedido de
            evolução do dashboard) — largura cheia porque a tabela de
            agrupamento/drill-down precisa do espaço. */}
        <div className="mt-4">
          <AccordionPanel id={SECTION_IDS.K} letter="K" title="Locais" subtitle="De onde vêm os acessos, downloads e cadastros" open={open.K} onToggle={() => toggle('K')}>
            <LocationsSection filter={filter} sortBy={locationsSortBy} onSortByChange={setLocationsSortBy} onFilterByCity={filterByCity} />
          </AccordionPanel>
        </div>

        <div className="mt-4">
          <AccordionPanel id={SECTION_IDS.G} letter="G" title="Mapa dos Tutores" open={open.G} onToggle={() => toggle('G')}>
            <div className="space-y-4">
              <MapSection filter={filter} onFilterByCity={filterByCity} />
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Agregado por UF/cidade (sem coordenada)</p>
                <GeoSection />
              </div>
            </div>
          </AccordionPanel>
        </div>

        <div className="mt-4">
          <AccordionPanel id={SECTION_IDS.L} letter="L" title="Moderação de Fotografias" subtitle="IA + revisão humana" open={open.L} onToggle={() => toggle('L')}>
            <ModerationSection />
          </AccordionPanel>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          <div className="space-y-4">
            <AccordionPanel id={SECTION_IDS.E} letter="E" title="Retenção" open={open.E} onToggle={() => toggle('E')}>
              <RetentionSection filter={filter} onOpenTutors={openTutors} />
            </AccordionPanel>

            <AccordionPanel id={SECTION_IDS.F} letter="F" title="Loja e Monetização" open={open.F} onToggle={() => toggle('F')}>
              <CommerceSection filter={filter} onOpenTutors={openTutors} />
            </AccordionPanel>
          </div>

          <div className="space-y-4">
            <AccordionPanel id={SECTION_IDS.I} letter="I" title="Indicadores Técnicos Avançados" open={open.I} onToggle={() => toggle('I')}>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Qualidade dos dados</p>
                  <DataQualitySection />
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Saúde da operação</p>
                  <OperationsSection />
                </div>
              </div>
            </AccordionPanel>

            <AccordionPanel id={SECTION_IDS.J} letter="J" title="Inteligência Tática" subtitle="O sistema recomenda; você decide" open={open.J} onToggle={() => toggle('J')}>
              <TacticalSection filter={filter} />
            </AccordionPanel>
          </div>
        </div>

        <div className="mt-4">
          <AccordionPanel id={SECTION_IDS.H} letter="H" title="Tutores e Pets" subtitle="Tabela completa, com busca e filtros" open={open.H} onToggle={() => toggle('H')}>
            <UsersSection filter={filter} />
          </AccordionPanel>
        </div>
      </div>
      </PhotoLightboxProvider>
    </PremiumScreenShell>
  );
}
