'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';

interface GlobalStats {
  total_users: number;
  total_owners: number;
  total_pets: number;
  total_vaccines: number;
  total_appointments: number;
  countries_count: number;
  cities_count: number;
}

interface ShopeeSyncProgress {
  running: boolean;
  total: number;
  processed: number;
  matched: number;
  percent: number;
  remaining: number;
  match_rate: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { isAdmin, adminData, isLoading: adminLoading } = useAdmin();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [shopeeProgress, setShopeeProgress] = useState<ShopeeSyncProgress | null>(null);
  const [shopeeProgressLoading, setShopeeProgressLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.push('/home');
      return;
    }
    loadStats();
    loadShopeeProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => {
      void loadShopeeProgress();
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, token]);

  const loadStats = async () => {
    try {
      if (!token) return;

      const response = await fetch('/api/v1/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShopeeProgress = async () => {
    try {
      if (!token) return;
      setShopeeProgressLoading((prev) => prev && !shopeeProgress);

      const response = await fetch('/handoff/shopee-sync-progress', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        setShopeeProgress(await response.json());
      }
    } catch (error) {
      console.error('Failed to load Shopee sync progress:', error);
    } finally {
      setShopeeProgressLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/home');
  };

  const progressPercent = Math.min(Math.max(shopeeProgress?.percent ?? 0, 0), 100);

  if (adminLoading || !isAdmin || !adminData) {
    return (
      <PremiumScreenShell title="PETMOL Admin" hideBack>
        <p className="text-center text-slate-500 py-16">Verificando autenticação...</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell
      title="Administração"
      subtitle={`${adminData.email} • ${adminData.role}`}
      hideBack
      rightAction={
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
        >
          Sair
        </button>
      }
    >
      <div className="px-4 py-4">
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100/50">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Sync Shopee</h2>
              <p className="text-sm text-slate-500">
                {shopeeProgressLoading
                  ? 'Carregando progresso...'
                  : shopeeProgress?.running
                    ? 'Rodando agora com Cobasi, Zee Now e Zee Dog'
                    : shopeeProgress?.finished_at
                      ? 'Última execução finalizada'
                      : 'Nenhuma execução ativa'}
              </p>
            </div>
            <button
              onClick={() => void loadShopeeProgress()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>

          {shopeeProgress?.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              Erro: {shopeeProgress.error}
            </div>
          ) : (
            <>
              <div className="mb-3 h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0066ff] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Progresso</div>
                  <div className="text-lg font-bold text-slate-900">{progressPercent.toFixed(2)}%</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Processados</div>
                  <div className="text-lg font-bold text-slate-900">{(shopeeProgress?.processed ?? 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Total</div>
                  <div className="text-lg font-bold text-slate-900">{(shopeeProgress?.total ?? 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Casados</div>
                  <div className="text-lg font-bold text-emerald-700">{(shopeeProgress?.matched ?? 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Índice</div>
                  <div className="text-lg font-bold text-slate-900">{(shopeeProgress?.match_rate ?? 0).toFixed(2)}%</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando estatísticas...</div>
        ) : stats ? (
          <>
            <div className="grid md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-[#0066ff] to-[#0056D2] rounded-2xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-2">👥</div>
                <div className="text-3xl font-bold mb-1">{stats.total_users.toLocaleString()}</div>
                <div className="text-blue-100">Usuários Ativos</div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-2">👨‍👩‍👧</div>
                <div className="text-3xl font-bold mb-1">{stats.total_owners.toLocaleString()}</div>
                <div className="text-green-100">Tutores</div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-2">🐾</div>
                <div className="text-3xl font-bold mb-1">{stats.total_pets.toLocaleString()}</div>
                <div className="text-purple-100">Pets Cadastrados</div>
              </div>

              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-2">🌍</div>
                <div className="text-3xl font-bold mb-1">{stats.countries_count}</div>
                <div className="text-orange-100">Países</div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="p-6 border border-slate-200 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">💉</div>
                  <div className="text-2xl font-bold text-slate-900">{stats.total_vaccines.toLocaleString()}</div>
                </div>
                <div className="text-sm text-slate-600">Vacinas Registradas</div>
              </div>

              <div className="p-6 border border-slate-200 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">📅</div>
                  <div className="text-2xl font-bold text-slate-900">{stats.total_appointments.toLocaleString()}</div>
                </div>
                <div className="text-sm text-slate-600">Consultas Agendadas</div>
              </div>

              <div className="p-6 border border-slate-200 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">🏙️</div>
                  <div className="text-2xl font-bold text-slate-900">{stats.cities_count}</div>
                </div>
                <div className="text-sm text-slate-600">Cidades Ativas</div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">Erro ao carregar estatísticas</div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 border border-slate-200 p-6 overflow-hidden">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Ações Rápidas</h2>
          <div className="grid md:grid-cols-4 gap-4">
            <a
              href="/admin/accounts"
              className="flex flex-col items-center gap-2 p-6 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <div className="text-3xl">📋</div>
              <div className="font-semibold text-blue-900">Ver Todas as Contas</div>
              <div className="text-sm text-[#0047ad]">Usuários, tutores e pets</div>
            </a>

            <a
              href="/admin/users"
              className="flex flex-col items-center gap-2 p-6 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <div className="text-3xl">👤</div>
              <div className="font-semibold text-purple-900">Gerenciar Usuários</div>
              <div className="text-sm text-purple-700">CRUD de usuários</div>
            </a>

            <a
              href="/admin/pets"
              className="flex flex-col items-center gap-2 p-6 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              <div className="text-3xl">🐾</div>
              <div className="font-semibold text-green-900">Gerenciar Pets</div>
              <div className="text-sm text-green-700">CRUD de pets</div>
            </a>

            <button
              onClick={handleLogout}
              className="flex flex-col items-center gap-2 p-6 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <div className="text-3xl">🚪</div>
              <div className="font-semibold text-red-900">Logout</div>
              <div className="text-sm text-red-700">Sair do sistema</div>
            </button>
          </div>
        </div>
      </div>
    </PremiumScreenShell>
  );
}
