'use client';
import { getToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { API_BASE_URL } from '@/lib/api';
import { requestUserConfirmation, showBlockingNotice } from '@/features/interactions/userPromptChannel';

interface Establishment {
  id: string;
  display_name: string;
  email: string;
  phone: string;
  claim_status: string;
  plan: string;
  phone_verified: boolean;
  created_at: string;
  claimed_place_id?: string;
}

export default function AdminEstablishmentsPage() {
  const router = useRouter();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [filter, setFilter] = useState<'pending' | 'verified' | 'all'>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEstablishments();
  }, [filter]);

  const loadEstablishments = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const endpoint = filter === 'all' 
        ? '/api/admin/establishments/all'
        : filter === 'pending'
        ? '/api/admin/establishments/pending'
        : `/api/admin/establishments/all?status_filter=${filter}`;

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEstablishments(data);
      } else if (response.status === 403) {
        showBlockingNotice('Acesso negado. Apenas admins podem acessar.', { tone: 'danger' });
        router.push('/');
      }
    } catch (error) {
      console.error('Erro ao carregar estabelecimentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, partnerLevel: number = 1) => {
    const accepted = await requestUserConfirmation('Aprovar este estabelecimento?', {
      title: 'Aprovar estabelecimento',
      confirmLabel: 'Aprovar',
    });
    if (!accepted) return;

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/admin/establishments/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'approve',
          partner_level: partnerLevel
        })
      });

      if (response.ok) {
        showBlockingNotice('Estabelecimento aprovado!', { tone: 'success' });
        loadEstablishments();
      } else {
        showBlockingNotice('Erro ao aprovar', { tone: 'danger' });
      }
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Motivo da rejeição (opcional):');
    if (reason === null) return; // Cancelou

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/admin/establishments/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'reject',
          reason: reason || undefined
        })
      });

      if (response.ok) {
        showBlockingNotice('Estabelecimento rejeitado', { tone: 'success' });
        loadEstablishments();
      } else {
        showBlockingNotice('Erro ao rejeitar', { tone: 'danger' });
      }
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    verified: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800'
  };

  return (
    <PremiumScreenShell title="Estabelecimentos" subtitle="Aprovar ou rejeitar cadastros" backHref="/admin/dashboard">
      <div className="px-4 py-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Voltar ao Admin
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🏪 Gestão de Estabelecimentos
          </h1>
          <p className="text-gray-600">
            Aprovar ou rejeitar cadastros de estabelecimentos
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="flex gap-3">
            <button
              onClick={() => setFilter('pending')}
              className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                filter === 'pending'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ⏳ Pendentes ({establishments.length})
            </button>
            <button
              onClick={() => setFilter('verified')}
              className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                filter === 'verified'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✅ Aprovados
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                filter === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 Todos
            </button>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-600">Carregando...</div>
        ) : establishments.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            Nenhum estabelecimento encontrado
          </div>
        ) : (
          <div className="space-y-4">
            {establishments.map((estab) => (
              <div key={estab.id} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {estab.display_name}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[estab.claim_status]}`}>
                        {estab.claim_status}
                      </span>
                      {estab.phone_verified && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          ✓ Tel Verificado
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                      <div>
                        <span className="font-semibold">Email:</span> {estab.email}
                      </div>
                      <div>
                        <span className="font-semibold">Telefone:</span> {estab.phone}
                      </div>
                      <div>
                        <span className="font-semibold">Plano:</span> {estab.plan}
                      </div>
                      <div>
                        <span className="font-semibold">Cadastrado em:</span>{' '}
                        {new Date(estab.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>

                    {estab.claimed_place_id && (
                      <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded">
                        Google Place ID: {estab.claimed_place_id}
                      </div>
                    )}
                  </div>

                  {estab.claim_status === 'pending' && (
                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => handleApprove(estab.id, 1)}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all whitespace-nowrap"
                      >
                        ✅ Aprovar (Nível 1)
                      </button>
                      <button
                        onClick={() => handleApprove(estab.id, 2)}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all whitespace-nowrap"
                      >
                        ⭐ Aprovar (Nível 2)
                      </button>
                      <button
                        onClick={() => handleReject(estab.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all whitespace-nowrap"
                      >
                        ❌ Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PremiumScreenShell>
  );
}
