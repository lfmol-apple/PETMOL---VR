'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { requestUserConfirmation } from '@/features/interactions/userPromptChannel';
import { getToken } from '@/lib/auth-token';
import { useAdmin } from '@/hooks/useAdmin';

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  detail?: string;
}

type UsersResponse = ApiResponse<User[]>;
type UserResponse = ApiResponse<User>;

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  if (!token) {
    window.location.href = '/home';
    throw new Error('Token não encontrado');
  }

  const response = await fetch(`/api/v1/admin${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      // Sem acesso admin (token inválido ou e-mail não é o master)
      window.location.href = '/home';
      throw new Error('Sessão expirada');
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Erro na requisição');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.detail || 'Erro na requisição');
  }

  return data;
}

async function fetchUsers(): Promise<User[]> {
  const data = await apiCall<UsersResponse>('/users');
  return data.data;
}

async function createUser(email: string, password: string): Promise<User> {
  const data = await apiCall<UserResponse>('/users', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.data;
}

async function updateUser(id: string, email?: string, password?: string): Promise<User> {
  const data = await apiCall<UserResponse>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ email, password }),
  });
  return data.data;
}

async function deleteUser(id: string): Promise<void> {
  await apiCall<{ success: boolean; message: string }>(`/users/${id}`, {
    method: 'DELETE',
  });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await fetchUsers();
      setUsers(usersData);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password) return;

    try {
      setSubmitting(true);
      setFormError(null);
      const newUser = await createUser(formData.email, formData.password);
      setUsers([newUser, ...users]);
      setFormData({ email: '', password: '' });
      setShowCreateForm(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSubmitting(true);
      setFormError(null);
      const updatedUser = await updateUser(
        editingUser.id, 
        formData.email || undefined, 
        formData.password || undefined
      );
      setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
      setFormData({ email: '', password: '' });
      setEditingUser(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao atualizar usuário');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const accepted = await requestUserConfirmation(`Tem certeza que deseja excluir o usuário ${user.email}?`, {
      title: 'Excluir usuário',
      tone: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!accepted) return;

    const typed = window.prompt(`Para confirmar, digite o e-mail exato do usuário:\n${user.email}`);
    if (typed?.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      setError('Exclusão cancelada: o e-mail digitado não confere.');
      return;
    }

    try {
      await deleteUser(user.id);
      setUsers(users.filter(u => u.id !== user.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário');
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({ email: user.email, password: '' });
    setShowCreateForm(false);
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setShowCreateForm(false);
    setFormData({ email: '', password: '' });
    setFormError(null);
  };

  const startCreate = () => {
    setEditingUser(null);
    setShowCreateForm(true);
    setFormData({ email: '', password: '' });
    setFormError(null);
  };

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.push('/home');
      return;
    }
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  if (adminLoading || !isAdmin) {
    return (
      <PremiumScreenShell title="Usuários" backHref="/admin/dashboard">
        <p className="text-center text-slate-500 py-16">Verificando autenticação...</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell title="Usuários" subtitle={`Total: ${users.length} usuários`} backHref="/admin/dashboard">
      <div className="px-4 py-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciar Usuários</h1>
            <p className="text-gray-600">Total: {users.length} usuários</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              ← Voltar
            </button>
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-[#0056D2] text-white rounded-lg hover:bg-[#0047ad]"
            >
              + Novo Usuário
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Create/Edit Form */}
        {(showCreateForm || editingUser) && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">
              {editingUser ? 'Editar Usuário' : 'Criar Novo Usuário'}
            </h3>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{formError}</p>
              </div>
            )}
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  required={!editingUser}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder={editingUser ? "Deixe vazio para manter a senha atual" : ""}
                  required={!editingUser}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0056D2] text-white rounded-lg hover:bg-[#0047ad] disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">Carregando usuários...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">
                {searchTerm ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto [touch-action:pan-x]">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Criado em
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-gray-500 font-mono">{user.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(user.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(user)}
                            className="text-[#0056D2] hover:text-blue-900"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PremiumScreenShell>
  );
}
