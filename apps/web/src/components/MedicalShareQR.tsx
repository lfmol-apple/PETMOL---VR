'use client';

import { useState } from 'react';
import QRCode from 'qrcode';

// Em localhost usa o domínio público para que o QR seja escaneável
const APP_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ? String(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '') : undefined) ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'https://petmol.com.br'
    : typeof window !== 'undefined' ? window.location.origin : 'https://petmol.com.br');

interface MedicalShareQRProps {
  petId: string;
  petName: string;
  shareToken?: string;
}

export function MedicalShareQR({ petId, petName, shareToken }: MedicalShareQRProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(30); // minutes
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const generateQR = async () => {
    setIsGenerating(true);

    try {
      // Generate share token with expiration
      const token = shareToken || crypto.randomUUID();
      const expiresAt = Date.now() + expiresIn * 60 * 1000;

      // Store share token with expiration
      const shareData = {
        token,
        petId,
        petName,
        expiresAt,
        createdAt: Date.now(),
      };
      localStorage.setItem(`medical_share_${token}`, JSON.stringify(shareData));

      // Generate QR code URL
      const shareUrl = `${APP_URL}/health/share/${token}`;
      const qrUrl = await QRCode.toDataURL(shareUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
      });

      setQrDataUrl(qrUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      showToast('Erro ao gerar QR code. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;

    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${petName}_historico_medico.png`;
    link.click();
  };

  const copyLink = async () => {
    if (!shareToken) return;

    const shareUrl = `${APP_URL}/health/share/${shareToken}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copiado!');
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };

  return (
    <div className="bg-white rounded-[24px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-sm font-semibold text-blue-800 flex items-center gap-2">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-[11px] font-bold text-blue-600 underline">OK</button>
        </div>
      )}
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">📱</div>
        <h3 className="text-xl font-bold text-slate-900 mb-1">
          Compartilhar Histórico Médico
        </h3>
        <p className="text-sm text-slate-600">
          Gere um QR code para o veterinário acessar o histórico de {petName}
        </p>
      </div>

      {!qrDataUrl ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              ⏱️ Validade do acesso
            </label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(parseInt(e.target.value))}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2]"
            >
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={180}>3 horas</option>
              <option value={1440}>24 horas</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Após esse período, o QR code expira por segurança
            </p>
          </div>

          <button
            onClick={generateQR}
            disabled={isGenerating}
            className="w-full py-3 bg-[#0056D2] hover:bg-[#0047ad] text-white font-semibold rounded-xl disabled:opacity-50"
          >
            {isGenerating ? '🔄 Gerando...' : '🎯 Gerar QR Code'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border-4 border-slate-200 flex items-center justify-center">
            <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-sm text-blue-900">
              <strong>Como usar:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Mostre este QR code para o veterinário</li>
                <li>Ele escaneia com a câmera do celular</li>
                <li>Abre o histórico completo de {petName}</li>
                <li>Válido por {expiresIn} minutos</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={downloadQR}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
            >
              💾 Baixar
            </button>
            <button
              onClick={copyLink}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
            >
              🔗 Copiar Link
            </button>
          </div>

          <button
            onClick={() => {
              setQrDataUrl('');
            }}
            className="w-full py-3 text-slate-600 hover:text-slate-800 font-semibold"
          >
            ← Gerar novo QR code
          </button>
        </div>
      )}

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
        <div className="text-xs text-yellow-900">
          <strong>🔒 Segurança:</strong> O QR code expira automaticamente. Só compartilhe com
          profissionais de confiança. O histórico médico contém dados sensíveis do seu pet.
        </div>
      </div>
    </div>
  );
}
