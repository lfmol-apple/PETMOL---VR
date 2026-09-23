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
  UsersSection, FeaturesSection, DataQualitySection,
  RetentionSection, CommerceSection,
} from '@/components/admin/sections/sections';
import { PhotoLightboxProvider } from '@/components/admin/PhotoLightbox';
import { FeedingSection } from '@/components/admin/sections/FeedingSection';
import { JourneySection } from '@/components/admin/sections/JourneySection';
import { LocationsSection } from '@/components/admin/sections/LocationsSection';
import { ModerationSection } from '@/components/admin/sections/ModerationSection';
import { TacticalSection } from '@/components/admin/sections/TacticalSection';
import { TodaySection, BaseStrip } from '@/components/admin/sections/TodaySection';
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

type SectionLetter = 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';
const SECTION_IDS: Record<SectionLetter, string> = {
  B: 'mc-b', C: 'mc-c', D: 'mc-d', E: 'mc-e', F: 'mc-f', G: 'mc-g', H: 'mc-h', I: 'mc-i', J: 'mc-j',
  K: 'mc-k', L: 'mc-l',
};

/** Abas: 12 painéis empilhados viraram 5 telas por PERGUNTA do dono —
 * "como foi hoje?", "de onde vem gente?", "quem fica e volta?", "a loja
 * rende?", "quem são / está tudo funcionando?". Nenhuma seção foi perdida;
 * só mudou onde cada uma mora (a fusão de painéis redundantes vem depois). */
type TabKey = 'hoje' | 'aquisicao' | 'ativacao' | 'loja' | 'pessoas';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'hoje', label: '☀️ Hoje' },
  { key: 'aquisicao', label: '📣 Aquisição e campanhas' },
  { key: 'ativacao', label: '🌱 Ativação e retenção' },
  { key: 'loja', label: '🛒 Loja e receita' },
  { key: 'pessoas', label: '👥 Pessoas e operação' },
];
const TAB_OF_SECTION: Record<SectionLetter, TabKey> = {
  B: 'ativacao', C: 'ativacao', D: 'ativacao', E: 'ativacao', F: 'loja',
  G: 'aquisicao', H: 'pessoas', I: 'pessoas', J: 'pessoas', K: 'aquisicao', L: 'pessoas',
};
const isTabKey = (v: string): v is TabKey => TABS.some((t) => t.key === v);

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
  // Aba ativa — vive no hash da URL (/admin/dashboard#aquisicao), então o
  // link do boletim por e-mail e o botão "voltar" caem na aba certa.
  const [tab, setTabState] = useState<TabKey>('hoje');
  const setTab = (t: TabKey) => {
    setTabState(t);
    try { window.history.replaceState(null, '', `#${t}`); } catch { /* noop */ }
  };
  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '');
    if (isTabKey(fromHash)) setTabState(fromHash);
  }, []);

  // Tudo aberto por padrão — num desktop, o dono quer VER os dados sem
  // precisar clicar em nada primeiro (seção fechada por padrão virava
  // exatamente a mesma coisa que abas escondidas). O toggle continua
  // disponível pra quem quiser recolher alguma seção específica depois.
  const [open, setOpen] = useState<Record<SectionLetter, boolean>>({
    B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true, K: true, L: true,
  });

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) router.push('/home');
  }, [adminLoading, isAdmin, router]);

  const toggle = (letter: SectionLetter) => setOpen((o) => ({ ...o, [letter]: !o[letter] }));

  /** Filtro cruzado: abre a seção e rola até ela — usado quando um card ou
   * gráfico de outra seção aponta pra um recorte de Tutores & Pets. */
  const openAndScroll = (letter: SectionLetter) => {
    setTab(TAB_OF_SECTION[letter]);   // a seção pode morar em outra aba
    setOpen((o) => ({ ...o, [letter]: true }));
    // dá um respiro pra aba nova renderizar antes de rolar até a seção
    window.setTimeout(() => {
      document.getElementById(SECTION_IDS[letter])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

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

  const filterBar = (
    <>
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
        <select value={filter.platform || ''} aria-label="Plataforma"
          onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value || undefined }))}
          className="rounded-md border border-slate-200 px-2 py-1">
          <option value="">Todas as plataformas</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="pwa">App instalado (PWA)</option>
          <option value="web">Navegador</option>
        </select>
        <input placeholder="UF" value={filter.state || ''}
          onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value || undefined }))}
          className="w-16 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="cidade" value={filter.city || ''}
          onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value || undefined }))}
          className="w-36 rounded-md border border-slate-200 px-2 py-1" />
        {(filter.platform || filter.state || filter.city) && (
          <button type="button" onClick={() => setFilter((f) => ({ period_days: f.period_days, since: f.since, until: f.until }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">limpar</button>
        )}
      </div>
      <p className="mb-4 px-1 text-[11px] font-semibold text-slate-500">Analisando: {periodLabel(filter, datePreset)}</p>
    </>
  );

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
      <PhotoLightboxProvider>
        {/* Sem teto de largura — `wide` tira o max-w-2xl do PremiumScreenShell;
            este w-full é o que manda na largura. */}
        <div className="w-full px-4 py-4 sm:px-6 lg:px-10">
          {/* atalhos para as telas admin completas (fora do BI) */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ADMIN_TOOLS.map((t) => (
              <Link key={t.href} href={t.href}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  t.highlight
                    ? 'border-blue-300 bg-blue-50 text-[#0056D2] hover:border-blue-400'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
                }`}>
                {t.label}
              </Link>
            ))}
          </div>

          {/* abas por pergunta do dono */}
          <div role="tablist" className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-bold transition-colors ${
                  tab === t.key ? 'bg-[#0056D2] text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Hoje é sempre "hoje/ontem" — o filtro de período global não faz
              sentido ali, então só as outras abas mostram a barra. */}
          {tab !== 'hoje' && filterBar}
          <p className="mb-4 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Ao vivo — atualiza sozinho a cada 20s. Horários em Brasília.
          </p>

          {tab === 'hoje' && (
            <div className="space-y-4">
              <TodaySection
                onOpenPeople={openTutors}
                onOpenLocations={() => openLocations('downloads')}
                onOpenModeration={() => openAndScroll('L')}
              />
              <BaseStrip onOpenPeople={openTutors} onOpenMissingPets={openMissingPets} />
            </div>
          )}

          {tab === 'aquisicao' && (
            <div className="space-y-4">
              <AccordionPanel id={SECTION_IDS.K} letter="K" title="Locais" subtitle="segue o período · campanhas, custo e locais" open={open.K} onToggle={() => toggle('K')}>
                <LocationsSection filter={filter} sortBy={locationsSortBy} onSortByChange={setLocationsSortBy} onFilterByCity={filterByCity} />
              </AccordionPanel>
              <AccordionPanel id={SECTION_IDS.G} letter="G" title="Mapa dos Tutores" subtitle="segue o período (data de cadastro)" open={open.G} onToggle={() => toggle('G')}>
                <MapSection filter={filter} onFilterByCity={filterByCity} />
              </AccordionPanel>
            </div>
          )}

          {tab === 'ativacao' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
              <div className="space-y-4">
                <AccordionPanel id={SECTION_IDS.B} letter="B" title="Jornada e Conversão" subtitle="segue o período · cadastrados no período" open={open.B} onToggle={() => toggle('B')}>
                  <JourneySection filter={filter} />
                </AccordionPanel>
                <AccordionPanel id={SECTION_IDS.E} letter="E" title="Retenção" subtitle="foto geral — não segue o período" open={open.E} onToggle={() => toggle('E')}>
                  <RetentionSection filter={filter} onOpenTutors={openTutors} />
                </AccordionPanel>
              </div>
              <div className="space-y-4">
                <AccordionPanel id={SECTION_IDS.C} letter="C" title="Alimentação e Ração" subtitle="Prioridade comercial · foto atual, não segue o período" open={open.C} onToggle={() => toggle('C')}>
                  <FeedingSection filter={filter} onOpenTutors={openTutors} />
                </AccordionPanel>
                <AccordionPanel id={SECTION_IDS.D} letter="D" title="Utilização das Funcionalidades" subtitle="foto atual — não segue o período" open={open.D} onToggle={() => toggle('D')}>
                  <FeaturesSection filter={filter} />
                </AccordionPanel>
              </div>
            </div>
          )}

          {tab === 'loja' && (
            <AccordionPanel id={SECTION_IDS.F} letter="F" title="Loja e Monetização" subtitle="segue o período · intenção de compra, não venda" open={open.F} onToggle={() => toggle('F')}>
              <CommerceSection filter={filter} onOpenTutors={openTutors} />
            </AccordionPanel>
          )}

          {tab === 'pessoas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
                <div className="space-y-4">
                  <AccordionPanel id={SECTION_IDS.L} letter="L" title="Moderação de Fotografias" subtitle="IA + revisão humana" open={open.L} onToggle={() => toggle('L')}>
                    <ModerationSection />
                  </AccordionPanel>
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
                </div>
                <AccordionPanel id={SECTION_IDS.J} letter="J" title="Inteligência Tática" subtitle="O sistema recomenda; você decide" open={open.J} onToggle={() => toggle('J')}>
                  <TacticalSection filter={filter} />
                </AccordionPanel>
              </div>
              <AccordionPanel id={SECTION_IDS.H} letter="H" title="Tutores e Pets" subtitle="segue o período (data de cadastro) · busca e filtros" open={open.H} onToggle={() => toggle('H')}>
                <UsersSection filter={filter} />
              </AccordionPanel>
            </div>
          )}
        </div>
      </PhotoLightboxProvider>
    </PremiumScreenShell>
  );
}
