'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { localTodayISO } from '@/lib/localDate';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';

interface PetOut {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
}

interface TutorOut {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface AccountOut {
  user_id: string;
  email: string;
  created_at: string;
  tutor?: TutorOut | null;
  pets: PetOut[];
}

interface AccountsListResponse {
  success: boolean;
  data: AccountOut[];
  detail?: string;
}

export default function AdminAccountsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const [accounts, setAccounts] = useState<AccountOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.push('/home');
      return;
    }
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/admin/all-accounts', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data: AccountsListResponse = await response.json();
      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          router.push('/home');
          return;
        }
        throw new Error(data.detail || 'Falha ao carregar contas');
      }

      setAccounts(data.data || []);
    } catch (err: unknown) {
      console.error('Failed to load accounts:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar contas');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      if (a.email?.toLowerCase().includes(q)) return true;
      if (a.tutor?.name?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [accounts, query]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(filteredAccounts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `petmol_accounts_${localTodayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (adminLoading || !isAdmin || loading) {
    return (
      <PremiumScreenShell title="Contas" backHref="/admin/dashboard">
        <p className="text-center text-slate-500 py-16">Carregando dados...</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell title="Contas" subtitle="Usuários, tutores e pets" backHref="/admin/dashboard">
      <div className="px-4 py-4">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <a
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:text-slate-900"
            >
              <span>‹</span>
              <span>Voltar</span>
            </a>
            <button
              onClick={exportData}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              📥 Exportar Dados
            </button>
          </div>
          <h1 className="text-3xl font-bold mb-2">📋 Contas Cadastradas</h1>
          <p className="text-gray-600">Lista mundial (usuários, tutor e pets)</p>
        </div>

        <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-4 mb-6 border border-slate-200 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="font-semibold text-slate-900">Total: {filteredAccounts.length}</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por email ou nome do tutor"
              className="w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
            />
          </div>
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
          {filteredAccounts.length === 0 ? (
            <p className="text-gray-500 text-center py-6">Nenhuma conta encontrada.</p>
          ) : (
            <div className="space-y-4">
              {filteredAccounts.map((acc) => (
                <div key={acc.user_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{acc.email}</div>
                      <div className="text-xs text-slate-500">Criado em {formatDate(acc.created_at)}</div>
                      <div className="text-xs font-mono text-slate-500">User: {acc.user_id}</div>
                    </div>

                    <div className="text-sm text-slate-700">
                      <div className="font-medium">Tutor</div>
                      {acc.tutor ? (
                        <div>
                          <div>{acc.tutor.name}</div>
                          <div className="text-xs text-slate-500">
                            {acc.tutor.city || '—'}
                            {acc.tutor.state ? `, ${acc.tutor.state}` : ''}
                            {acc.tutor.country ? ` • ${acc.tutor.country}` : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">(sem tutor)</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-medium text-slate-900 mb-2">Pets ({acc.pets?.length || 0})</div>
                    {acc.pets && acc.pets.length > 0 ? (
                      <div className="grid md:grid-cols-2 gap-2">
                        {acc.pets.map((p) => (
                          <div key={p.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-600">
                              {p.species}
                              {p.breed ? ` • ${p.breed}` : ''}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">Pet: {p.id}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">(sem pets)</div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
                    <a
                      href={`/admin/users`}
                      className="px-3 py-1.5 bg-blue-100 text-[#0047ad] rounded text-sm hover:bg-blue-200"
                    >
                      ✏️ Gerenciar Usuários
                    </a>
                    {acc.tutor && (
                      <button className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200">
                        🐾 Ver Tutor
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PremiumScreenShell>
  );
}
