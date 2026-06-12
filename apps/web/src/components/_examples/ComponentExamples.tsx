/**
 * EXEMPLO DE USO DOS COMPONENTES
 * 
 * Este arquivo demonstra como usar ScreenShell, TabShell e componentes base
 * em diferentes contextos (páginas standalone e tabs em modais).
 */

'use client';

import { useState } from 'react';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { TabShell } from '@/components/layout/TabShell';
import { 
  PrimaryButton, 
  SecondaryButton, 
  DangerButton,
  Field, 
  TextareaField,
  LoadingSpinner,
  EmptyState 
} from '@/components/ui/BaseComponents';
import { requestUserConfirmation, showBlockingNotice } from '@/features/interactions/userPromptChannel';

// ═════════════════════════════════════════════════════════════════════════════
// EXEMPLO 1: Página Standalone com ScreenShell
// ═════════════════════════════════════════════════════════════════════════════

export function ExemploPageStandalone() {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    setLoading(true);
    // Simular save
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
    showBlockingNotice('Salvo com sucesso!', { tone: 'success' });
  };

  return (
    <ScreenShell
      title="Cadastro de Vacina"
      subtitle="Adicione uma nova vacina ao histórico do seu pet"
      actions={
        <>
          <SecondaryButton onClick={() => window.history.back()}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton 
            icon="💾" 
            onClick={handleSave} 
            loading={loading}
          >
            Salvar
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-6">
        {/* Formulário */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Nome da Vacina"
            placeholder="Ex: V10 (Múltipla)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="Digite o nome completo da vacina"
            required
          />
          
          <Field
            label="Data de Aplicação"
            type="date"
            value=""
            onChange={() => {}}
            required
          />
        </div>

        <TextareaField
          label="Observações"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Aplicada na clínica Dr. Silva, sem reações adversas..."
          helperText="Informações adicionais sobre a vacinação"
        />

        {/* Dicas */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">💡 Dica:</span> Guarde a carteirinha de vacinação em local seguro e tire fotos de backup.
          </p>
        </div>
      </div>
    </ScreenShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXEMPLO 2: Tab dentro de Modal com TabShell
// ═════════════════════════════════════════════════════════════════════════════

export function ExemploTabModal() {
  const [vaccines, setVaccines] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  return (
    <TabShell
      description="Mantenha o histórico de vacinação completo e atualizado do seu pet"
      actions={
        <PrimaryButton 
          icon="➕" 
          onClick={() => showBlockingNotice('Adicionar nova vacina')}
        >
          Nova Vacina
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {/* Botões de ação rápida */}
        <div className="grid grid-cols-3 gap-3">
          <SecondaryButton icon="📷">
            Importar Cartão
          </SecondaryButton>
          <SecondaryButton icon="⚡">
            Quick Add
          </SecondaryButton>
          <SecondaryButton icon="📄">
            Relatório
          </SecondaryButton>
        </div>

        {/* Lista de vacinas */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : vaccines.length === 0 ? (
          <EmptyState
            icon="💉"
            title="Nenhuma vacina cadastrada"
            description="Comece adicionando a primeira vacina do histórico do seu pet ou importe uma carteirinha de vacinação"
            action={
              <PrimaryButton icon="➕" onClick={() => showBlockingNotice('Adicionar')}>
                Adicionar Vacina
              </PrimaryButton>
            }
          />
        ) : (
          <div className="space-y-3">
            {vaccines.map((vaccine, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
              >
                {/* Conteúdo da vacina aqui */}
              </div>
            ))}
          </div>
        )}
      </div>
    </TabShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXEMPLO 3: Formulário Completo com Validação
// ═════════════════════════════════════════════════════════════════════════════

export function ExemploFormularioCompleto() {
  const [formData, setFormData] = useState({
    vaccine_name: '',
    date_applied: '',
    next_dose_date: '',
    veterinarian: '',
    clinic: '',
    batch_number: '',
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.vaccine_name) {
      newErrors.vaccine_name = 'Nome da vacina é obrigatório';
    }
    if (!formData.date_applied) {
      newErrors.date_applied = 'Data de aplicação é obrigatória';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    setSaving(true);
    // Simular save
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    showBlockingNotice('Vacina registrada com sucesso!', { tone: 'success' });
  };

  return (
    <ScreenShell
      title="Registrar Vacina"
      subtitle="Preencha os dados da vacina aplicada"
    >
      <div className="space-y-6">
        {/* Informações da Vacina */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-4">Informações da Vacina</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Nome da Vacina"
              placeholder="Ex: V10, V8, Antirrábica"
              value={formData.vaccine_name}
              onChange={(e) => setFormData({...formData, vaccine_name: e.target.value})}
              error={errors.vaccine_name}
              required
            />
            
            <Field
              label="Data de Aplicação"
              type="date"
              value={formData.date_applied}
              onChange={(e) => setFormData({...formData, date_applied: e.target.value})}
              error={errors.date_applied}
              required
            />
            
            <Field
              label="Próxima Dose"
              type="date"
              value={formData.next_dose_date}
              onChange={(e) => setFormData({...formData, next_dose_date: e.target.value})}
              helperText="Deixe em branco se não houver próxima dose"
            />
            
            <Field
              label="Lote/Batch"
              placeholder="Ex: 123456"
              value={formData.batch_number}
              onChange={(e) => setFormData({...formData, batch_number: e.target.value})}
              helperText="Número do lote da vacina (opcional)"
            />
          </div>
        </div>

        {/* Dados do Veterinário */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-4">Veterinário e Clínica</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Nome do Veterinário"
              placeholder="Ex: Dr. João Silva"
              value={formData.veterinarian}
              onChange={(e) => setFormData({...formData, veterinarian: e.target.value})}
            />
            
            <Field
              label="Nome da Clínica"
              placeholder="Ex: Clínica Pet Care"
              value={formData.clinic}
              onChange={(e) => setFormData({...formData, clinic: e.target.value})}
            />
          </div>
        </div>

        {/* Observações */}
        <TextareaField
          label="Observações"
          rows={4}
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Ex: Pet reagiu bem, sem efeitos colaterais..."
          helperText="Informações adicionais sobre a aplicação"
        />

        {/* Botões de Ação */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <PrimaryButton 
            fullWidth 
            icon="💾" 
            onClick={handleSubmit}
            loading={saving}
          >
            Salvar Vacina
          </PrimaryButton>
          <SecondaryButton onClick={() => window.history.back()}>
            Cancelar
          </SecondaryButton>
        </div>
      </div>
    </ScreenShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXEMPLO 4: Lista com Ações (CRUD)
// ═════════════════════════════════════════════════════════════════════════════

export function ExemploListaCRUD() {
  const [items, setItems] = useState([
    { id: 1, name: 'V10 (Múltipla)', date: '2026-01-15', status: 'OK' },
    { id: 2, name: 'Antirrábica', date: '2026-01-15', status: 'OK' },
    { id: 3, name: 'Gripe Canina', date: '2025-12-10', status: 'Vencida' },
  ]);

  const handleDelete = async (id: number) => {
    if (await requestUserConfirmation('Tem certeza que deseja excluir esta vacina?', { tone: 'danger' })) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  return (
    <ScreenShell
      title="Histórico de Vacinas"
      subtitle={`${items.length} vacina${items.length !== 1 ? 's' : ''} cadastrada${items.length !== 1 ? 's' : ''}`}
      actions={
        <PrimaryButton icon="➕" onClick={() => showBlockingNotice('Adicionar')}>
          Nova Vacina
        </PrimaryButton>
      }
    >
      <div className="space-y-3">
        {items.map(item => (
          <div 
            key={item.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{item.name}</h4>
                <p className="text-sm text-gray-600">
                  Aplicada em {new Date(item.date).toLocaleDateString('pt-BR')}
                </p>
                <span className={`inline-block mt-2 px-2 py-1 text-xs font-medium rounded-full ${
                  item.status === 'OK' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {item.status}
                </span>
              </div>
              
              <div className="flex gap-2">
                <SecondaryButton onClick={() => showBlockingNotice('Editar ' + item.id)}>
                  ✏️
                </SecondaryButton>
                <DangerButton onClick={() => handleDelete(item.id)}>
                  🗑️
                </DangerButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}
