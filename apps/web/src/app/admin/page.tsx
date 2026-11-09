'use client';

/**
 * Painel do dono — simples, 5 abas: Todos (tudo do sistema), Desempenho, E-mails, Push e Pets sumidos.
 * Só dados administrativos e comunicação com os tutores; nada aqui altera as contas em produção.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAdmin } from '@/hooks/useAdmin';
import { TodosTab } from '@/components/admin/tabs/TodosTab';
import { DesempenhoTab } from '@/components/admin/tabs/DesempenhoTab';
import { EmailsTab } from '@/components/admin/tabs/EmailsTab';
import { PushTab } from '@/components/admin/tabs/PushTab';
import { PetsSumidosTab } from '@/components/admin/tabs/PetsSumidosTab';

const TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'desempenho', label: 'Desempenho' },
  { key: 'emails', label: 'E-mails' },
  { key: 'push', label: 'Push' },
  { key: 'sumidos', label: 'Pets sumidos' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function AdminPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin, adminData, isLoading } = useAdmin();
  const fromUrl = params.get('aba');
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === fromUrl) ? (fromUrl as TabKey) : params.get('promo') ? 'push' : 'desempenho');

  useEffect(() => { if (!isLoading && !isAdmin) router.push('/home'); }, [isLoading, isAdmin, router]);

  const choose = (k: TabKey) => {
    setTab(k);
    try { window.history.replaceState(null, '', `/admin?aba=${k}`); } catch { /* sem histórico */ }
  };

  if (isLoading || !isAdmin || !adminData) {
    return <PremiumScreenShell title="Painel" hideBack wide><p className="py-16 text-center text-slate-500">Verificando autenticação…</p></PremiumScreenShell>;
  }

  return (
    <PremiumScreenShell title="Painel" hideBack wide>
      <div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-10">
        <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => choose(t.key)}
              className={`rounded-lg px-4 py-2 text-[14px] font-bold transition-colors ${tab === t.key ? 'bg-[#0056D2] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'todos' && <TodosTab />}
        {tab === 'desempenho' && <DesempenhoTab />}
        {tab === 'emails' && <EmailsTab />}
        {tab === 'push' && <PushTab />}
        {tab === 'sumidos' && <PetsSumidosTab />}
      </div>
    </PremiumScreenShell>
  );
}

export default function AdminPage() {
  return <Suspense fallback={null}><AdminPanel /></Suspense>;
}
