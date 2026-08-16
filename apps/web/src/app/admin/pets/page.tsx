'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { requestUserConfirmation } from '@/features/interactions/userPromptChannel';
import { getToken } from '@/lib/auth-token';
import { useAdmin } from '@/hooks/useAdmin';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  birth_date?: string;
  weight_value?: number;
  weight_unit?: string;
  neutered?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  detail?: string;
}

type PetsResponse = ApiResponse<Pet[]>;
type PetResponse = ApiResponse<Pet>;

function formatDate(isoString?: string) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString('pt-BR');
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

async function fetchPets(): Promise<Pet[]> {
  const data = await apiCall<PetsResponse>('/pets');
  return data.data;
}

async function createPet(petData: Record<string, unknown>): Promise<Pet> {
  const data = await apiCall<PetResponse>('/pets', {
    method: 'POST',
    body: JSON.stringify(petData),
  });
  return data.data;
}

async function updatePet(id: string, petData: Record<string, unknown>): Promise<Pet> {
  const data = await apiCall<PetResponse>(`/pets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(petData),
  });
  return data.data;
}

async function deletePet(id: string): Promise<void> {
  await apiCall<{ success: boolean; message: string }>(`/pets/${id}`, {
    method: 'DELETE',
  });
}

export default function AdminPetsPage() {
  const router = useRouter();
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [formData, setFormData] = useState({
    user_id: '',
    name: '',
    species: '',
    breed: '',
    birth_date: '',
    weight_value: '',
    weight_unit: 'kg',
    neutered: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPets = pets.filter(pet => 
    pet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pet.species.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (pet.breed && pet.breed.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const loadPets = async () => {
    try {
      setLoading(true);
      const petsData = await fetchPets();
      setPets(petsData);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.species) return;

    try {
      setSubmitting(true);
      setFormError(null);
      
      const petData = {
        ...formData,
        weight_value: formData.weight_value ? parseFloat(formData.weight_value) : undefined,
        birth_date: formData.birth_date || undefined,
      };

      const newPet = await createPet(petData);
      setPets([newPet, ...pets]);
      setFormData({
        user_id: '',
        name: '',
        species: '',
        breed: '',
        birth_date: '',
        weight_value: '',
        weight_unit: 'kg',
        neutered: false,
      });
      setShowCreateForm(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar pet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPet) return;

    try {
      setSubmitting(true);
      setFormError(null);
      
      const petData = {
        name: formData.name,
        species: formData.species,
        breed: formData.breed || undefined,
        birth_date: formData.birth_date || undefined,
        weight_value: formData.weight_value ? parseFloat(formData.weight_value) : undefined,
        weight_unit: formData.weight_unit || undefined,
        neutered: formData.neutered,
      };

      const updatedPet = await updatePet(editingPet.id, petData);
      setPets(pets.map(p => p.id === updatedPet.id ? updatedPet : p));
      setEditingPet(null);
      resetForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao atualizar pet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePet = async (pet: Pet) => {
    const accepted = await requestUserConfirmation(`Tem certeza que deseja excluir o pet ${pet.name}?`, {
      title: 'Excluir pet',
      tone: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!accepted) return;

    const typed = window.prompt(`Para confirmar, digite o nome exato do pet:\n${pet.name}`);
    if (typed?.trim().toLowerCase() !== pet.name.trim().toLowerCase()) {
      setError('Exclusão cancelada: o nome digitado não confere.');
      return;
    }

    try {
      await deletePet(pet.id);
      setPets(pets.filter(p => p.id !== pet.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir pet');
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: '',
      name: '',
      species: '',
      breed: '',
      birth_date: '',
      weight_value: '',
      weight_unit: 'kg',
      neutered: false,
    });
  };

  const startEdit = (pet: Pet) => {
    setEditingPet(pet);
    setFormData({
      user_id: '', // Not needed for edit
      name: pet.name,
      species: pet.species,
      breed: pet.breed || '',
      birth_date: pet.birth_date || '',
      weight_value: pet.weight_value?.toString() || '',
      weight_unit: pet.weight_unit || 'kg',
      neutered: pet.neutered || false,
    });
    setShowCreateForm(false);
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingPet(null);
    setShowCreateForm(false);
    resetForm();
    setFormError(null);
  };

  const startCreate = () => {
    setEditingPet(null);
    setShowCreateForm(true);
    resetForm();
    setFormError(null);
  };

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.push('/home');
      return;
    }
    loadPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  if (adminLoading || !isAdmin) {
    return (
      <PremiumScreenShell title="Pets" backHref="/admin/dashboard">
        <p className="text-center text-slate-500 py-16">Verificando autenticação...</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell title="Pets" subtitle={`Total: ${pets.length} pets`} backHref="/admin/dashboard">
      <div className="px-4 py-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciar Pets</h1>
            <p className="text-gray-600">Total: {pets.length} pets</p>
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
              + Novo Pet
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por nome, espécie ou raça..."
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
        {(showCreateForm || editingPet) && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">
              {editingPet ? 'Editar Pet' : 'Criar Novo Pet'}
            </h3>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{formError}</p>
              </div>
            )}
            <form onSubmit={editingPet ? handleUpdatePet : handleCreatePet} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!editingPet && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ID do Usuário (dono)</label>
                    <input
                      type="text"
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Espécie</label>
                  <select
                    value={formData.species}
                    onChange={(e) => setFormData({ ...formData, species: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    required
                  >
                    <option value="">Selecione...</option>
                    <option value="dog">Cachorro</option>
                    <option value="cat">Gato</option>
                    <option value="bird">Pássaro</option>
                    <option value="fish">Peixe</option>
                    <option value="rabbit">Coelho</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Raça (opcional)</label>
                  <input
                    type="text"
                    value={formData.breed}
                    onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento (opcional)</label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Peso (opcional)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.weight_value}
                      onChange={(e) => setFormData({ ...formData, weight_value: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                    <select
                      value={formData.weight_unit}
                      onChange={(e) => setFormData({ ...formData, weight_unit: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="lb">lb</option>
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.neutered}
                    onChange={(e) => setFormData({ ...formData, neutered: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Pet castrado</span>
                </label>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0056D2] text-white rounded-lg hover:bg-[#0047ad] disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : editingPet ? 'Salvar Alterações' : 'Criar Pet'}
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

        {/* Pets Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">Carregando pets...</p>
            </div>
          ) : filteredPets.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">
                {searchTerm ? 'Nenhum pet encontrado.' : 'Nenhum pet cadastrado.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto [touch-action:pan-x]">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Espécie/Raça
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Nascimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Peso
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Castrado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPets.map((pet) => (
                    <tr key={pet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{pet.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {pet.species}
                          {pet.breed && <span className="text-gray-500"> • {pet.breed}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(pet.birth_date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {pet.weight_value ? `${pet.weight_value} ${pet.weight_unit || 'kg'}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          pet.neutered 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {pet.neutered ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-gray-500 font-mono">{pet.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(pet)}
                            className="text-[#0056D2] hover:text-blue-900"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeletePet(pet)}
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
