'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';

export interface PetDocument {
  id: string;
  petId: string;
  tipo_documento: string;
  categoria_aba: string; // 'exames' | 'receitas' | 'laudos' | 'comprovantes' | 'fotos' | 'vacinas'
  titulo_identificado: string;
  data_documento: string;
  clinica_laboratorio?: {
    nome?: string;
    endereco?: string;
    telefone?: string;
    cnpj?: string;
  };
  medico_veterinario?: {
    nome?: string;
    crmv?: string;
  };
  conteudo_resumo: string;
  contem_selo_vacina: boolean;
  contem_assinatura: boolean;
  confianca_leitura: number;
  imageUrl: string;
  createdAt: number;
}

interface Props {
  petId: string;
  petName?: string;
}

const TABS = [
  { id: 'exames', label: 'Exames' },
  { id: 'receitas', label: 'Receitas' },
  { id: 'laudos', label: 'Laudos' },
  { id: 'comprovantes', label: 'Comprovantes' },
  { id: 'fotos', label: 'Fotos' }
];

export function DocumentManager({ petId, petName }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [documents, setDocuments] = useState<PetDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showVaccineModal, setShowVaccineModal] = useState<PetDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // In a real app, you would fetch these from Firebase/Postgres
  // useEffect(() => { fetchDocs(petId)... }, [petId])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          setUploadError('Por favor, envie apenas imagens (JPEG, PNG, etc).');
          continue;
        }

        const base64 = await fileToBase64(file);
        
        // Calling actual backend API replacing mock capability
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const response = await fetch(`${apiUrl}/vision/documents/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pet_id: petId,
            image_base64: base64.replace(/^data:image\/[a-z]+;base64,/, '')
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.detail || `API returned ${response.status}`);
        }
        
        const classification = await response.json();

        const newDoc: PetDocument = {
          id: Date.now().toString(),
          petId,
          imageUrl: URL.createObjectURL(file), // Local preview
          createdAt: Date.now(),
          ...classification
        };

        setDocuments(prev => [newDoc, ...prev]);

        // Auto-switch to the correct tab
        if (TABS.find(t => t.id === classification.categoria_aba)) {
          setActiveTab(classification.categoria_aba);
        }

        if (classification.contem_selo_vacina) {
          setShowVaccineModal(newDoc);
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError('Erro ao processar o documento. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };



  const filteredDocs = documents.filter(d => d.categoria_aba === activeTab);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">
          Documentos — {petName}
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Upload area */}
      {uploadError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700 flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-xs font-bold text-rose-600 underline">OK</button>
        </div>
      )}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
          isDragging 
            ? 'border-primary-500 bg-primary-50' 
            : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'
        }`}
      >
        {isUploading ? (
          <div className="space-y-4">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-600 font-medium">A Inteligência Artificial está lendo e classificando...</p>
          </div>
        ) : (
          <div className="space-y-3 relative">
            <div className="text-4xl">📄</div>
            <p className="text-slate-700 font-medium">Arraste seus Exames, Receitas, Laudos ou Fotos aqui</p>
            <p className="text-slate-500 text-sm">A IA vai ler e enviar para a aba correta ({activeTab})</p>
            <input 
              type="file" 
              multiple 
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Ou clique para selecionar"
            />
            <button className="mt-4 px-6 py-2 bg-white border border-slate-300 rounded-xl shadow-sm text-sm font-medium hover:bg-slate-50">
              Ou clique para fazer upload
            </button>
          </div>
        )}
      </div>

      {/* Document List */}
      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            Nenhum documento na aba <strong>{TABS.find(t=>t.id === activeTab)?.label}</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocs.map(doc => (
              <div key={doc.id} className="bg-white border text-left border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-800">{doc.titulo_identificado || 'Documento sem título'}</h3>
                    {doc.data_documento && <p className="text-xs text-slate-500 mt-1">📅 {doc.data_documento}</p>}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 bg-primary-100 text-primary-700 rounded-full">
                    {Math.round(doc.confianca_leitura * 100)}% Match
                  </span>
                </div>
                
                {/* Body */}
                <div className="p-4 flex gap-4 flex-1">
                  <div className="w-1/3 aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.imageUrl} alt={doc.titulo_identificado} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 text-sm text-slate-600 space-y-2">
                    <p className="bg-slate-50 p-2 rounded-md italic">"{doc.conteudo_resumo}"</p>
                    
                    {doc.clinica_laboratorio?.nome && (
                      <p><strong>🏥 Local:</strong> {doc.clinica_laboratorio.nome}</p>
                    )}
                    {doc.medico_veterinario?.nome && (
                      <p><strong>👨‍⚕️ Vet:</strong> {doc.medico_veterinario.nome}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vaccine Modal */}
      {showVaccineModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="text-4xl text-center">💉</div>
            <h3 className="text-xl font-bold text-center">Selos de Vacina Detectados!</h3>
            <p className="text-slate-600 text-center">
              A IA notou adesivos de vacina neste documento. Deseja adicionar à Carteirinha Oficial de Vacinação?
            </p>
            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setShowVaccineModal(null)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium"
              >
                Apenas Guardar
              </button>
              <button 
                onClick={() => {
                  setShowVaccineModal(null);
                }}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-xl font-medium"
              >
                Sim, Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
