/**
 * VaccineCardUpload - IA OCR de Carteirinha de Vacina
 * 
 * Permite que o usuário tire foto da carteirinha e a IA extrai os dados automaticamente.
 * Funciona como preview: usuário confirma/ajusta antes de salvar.
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/auth-token';
import { AIPhotoConsentPrompt } from '@/features/ai/AIPhotoConsentPrompt';
import { declineAiPhotoConsent, ensureAiPhotoConsent, grantAiPhotoConsent } from '@/features/ai/aiPhotoConsent';

interface VaccineData {
  name: string;
  date: string | null;
  next_date: string | null;
  veterinarian: string | null;
  notes: string | null;
}

interface ExtractResult {
  vaccines: VaccineData[];
  confidence: number;
  raw_text?: string;
}

interface VaccineCardUploadProps {
  petId: string;
  onExtracted: (vaccines: VaccineData[]) => void;
  onCancel: () => void;
}

export function VaccineCardUpload({ petId, onExtracted, onCancel }: VaccineCardUploadProps) {
  const { tutor } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConsentSaving, setIsConsentSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [pendingConsentFile, setPendingConsentFile] = useState<File | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem (JPEG ou PNG)');
      return;
    }

    // Validar tamanho (4MB)
    if (file.size > 4 * 1024 * 1024) {
      setError('Imagem muito grande. Máximo: 4MB');
      return;
    }

    setError(null);
    setImagePreview(null);
    setExtractResult(null);
    setPendingConsentFile(null);

    // Criar preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    const token = getToken();
    const hasConsent = await ensureAiPhotoConsent(tutor?.id, token);
    if (hasConsent) {
      await processImage(file);
      return;
    }
    setPendingConsentFile(file);
  };

  const handleConsentAccept = async () => {
    if (!pendingConsentFile || tutor?.id == null) return;
    const token = getToken();
    if (!token) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }
    setIsConsentSaving(true);
    try {
      const granted = await grantAiPhotoConsent(tutor.id, token);
      if (!granted) {
        setError('Não foi possível registrar o consentimento agora. Tente novamente ou preencha manualmente.');
        return;
      }
      const file = pendingConsentFile;
      setPendingConsentFile(null);
      await processImage(file);
    } finally {
      setIsConsentSaving(false);
    }
  };

  const handleConsentDecline = () => {
    declineAiPhotoConsent();
    setPendingConsentFile(null);
    onCancel();
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Converter para base64
      const base64 = await fileToBase64(file);

      // Chamar API
      const token = getToken();
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/vision/extract-vaccine-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          image: base64,
          pet_id: petId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 403 && errorData?.detail?.error === 'ai_photo_consent_required') {
          setPendingConsentFile(file);
          throw new Error('Autorize o uso de IA para processar esta foto ou preencha manualmente.');
        }

        if (response.status === 403) {
          throw new Error('Recurso de IA não está habilitado. Configure FEATURE_AI_VACCINE_SCAN=true no backend.');
        }
        
        throw new Error(errorData.detail || `Erro ${response.status}: ${response.statusText}`);
      }

      const result: ExtractResult = await response.json();
      
      if (result.vaccines.length === 0) {
        setError('Não consegui identificar nenhuma vacina na imagem. Tente uma foto mais clara ou adicione manualmente.');
      } else {
        setExtractResult(result);
      }

    } catch (err: unknown) {
      console.error('Erro ao processar imagem:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleConfirm = () => {
    if (extractResult) {
      onExtracted(extractResult.vaccines);
    }
  };

  const handleRetry = () => {
    setImagePreview(null);
    setExtractResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h3 className="font-semibold text-blue-900">Carteirinha Mágica (Beta)</h3>
            <p className="text-sm text-[#0047ad] mt-1">
              Tire uma foto da carteirinha de vacina e nossa IA vai preencher os dados automaticamente!
            </p>
            <ul className="text-xs text-[#0056D2] mt-2 space-y-1">
              <li>✓ Foto clara e bem iluminada</li>
              <li>✓ Texto legível (sem reflexos)</li>
              <li>✓ Máximo 4MB (JPEG ou PNG)</li>
            </ul>
          </div>
        </div>
      </div>

      {!imagePreview && !isProcessing && (
        <div>
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-gray-600 font-medium">Clique para tirar foto ou selecionar imagem</p>
              <p className="text-xs text-gray-500 mt-1">JPEG ou PNG até 4MB</p>
            </div>
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/jpg"
              capture="environment"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}

      {pendingConsentFile && !isProcessing && !extractResult && (
        <AIPhotoConsentPrompt
          onAccept={handleConsentAccept}
          onDecline={handleConsentDecline}
          disabled={isConsentSaving}
        />
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-sm text-gray-600">🤖 Analisando carteirinha com IA...</p>
          <p className="text-xs text-gray-500">Isso pode levar alguns segundos</p>
        </div>
      )}

      {imagePreview && !isProcessing && !extractResult && (
        <div className="space-y-3">
          <img src={imagePreview} alt="Preview" className="w-full rounded-lg border border-gray-300" />
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Tentar outra foto
            </button>
          </div>
        </div>
      )}

      {extractResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">✓</span>
              <h4 className="font-semibold text-green-900">
                {extractResult.vaccines.length} vacina(s) encontrada(s)
              </h4>
            </div>
            <p className="text-sm text-green-700">
              Confiança: {Math.round(extractResult.confidence * 100)}%
            </p>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {extractResult.vaccines.map((vaccine, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h5 className="font-semibold text-gray-900">{vaccine.name}</h5>
                  <span className="text-xs text-gray-500">#{index + 1}</span>
                </div>
                
                {vaccine.date && (
                  <p className="text-sm text-gray-700">
                    📅 Aplicação: {new Date(vaccine.date).toLocaleDateString('pt-BR')}
                  </p>
                )}
                
                {vaccine.next_date && (
                  <p className="text-sm text-gray-700">
                    🔔 Próxima dose: {new Date(vaccine.next_date).toLocaleDateString('pt-BR')}
                  </p>
                )}
                
                {vaccine.veterinarian && (
                  <p className="text-sm text-gray-600">
                    👨‍⚕️ {vaccine.veterinarian}
                  </p>
                )}
                
                {vaccine.notes && (
                  <p className="text-xs text-gray-500 italic">
                    📝 {vaccine.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              ⚠️ <strong>Revise os dados antes de salvar!</strong> A IA pode cometer erros.
              Você poderá editar tudo depois.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Tentar outra foto
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2 bg-[#0056D2] text-white rounded-lg hover:bg-[#0047ad] transition-colors font-medium"
            >
              Usar esses dados ✓
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
