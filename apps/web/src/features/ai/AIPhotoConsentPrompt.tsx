'use client';

import { grantAiPhotoConsent, declineAiPhotoConsent } from './aiPhotoConsent';

interface AIPhotoConsentPromptProps {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Tela de consentimento just-in-time — precisa aparecer ANTES de
 * qualquer requisição ao Gemini, nunca depois (ver aiPhotoConsent.ts).
 */
export function AIPhotoConsentPrompt({ onAccept, onDecline }: AIPhotoConsentPromptProps) {
  const handleAccept = () => {
    grantAiPhotoConsent();
    onAccept();
  };

  const handleDecline = () => {
    declineAiPhotoConsent();
    onDecline();
  };

  return (
    <div className="space-y-4 p-1">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">🤖</span>
        <div>
          <h3 className="font-semibold text-blue-900">Usar inteligência artificial nesta foto?</h3>
          <p className="text-sm text-[#0047ad] mt-1">
            Para tentar identificar estas informações automaticamente, esta foto será enviada ao
            Google Gemini para processamento. Você pode continuar sem usar IA e preencher
            manualmente.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleAccept}
          className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 text-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          Usar IA
        </button>
        <button
          type="button"
          onClick={handleDecline}
          className="w-full rounded-xl bg-white border border-gray-300 text-gray-700 font-semibold py-3 text-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
        >
          Continuar manualmente
        </button>
      </div>
    </div>
  );
}
