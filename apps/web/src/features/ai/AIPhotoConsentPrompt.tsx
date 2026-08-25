'use client';

interface AIPhotoConsentPromptProps {
  onAccept: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

export function AIPhotoConsentPrompt({ onAccept, onDecline, disabled = false }: AIPhotoConsentPromptProps) {
  return (
    <div className="space-y-4 p-1">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Usar inteligência artificial nesta foto?</h3>
        <p className="mt-1 text-sm text-[#0047ad]">
          Para tentar identificar estas informações automaticamente, esta foto será enviada ao Google
          Gemini para processamento. Você pode continuar sem usar IA e preencher manualmente.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Usar IA
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={disabled}
          className="w-full rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Continuar manualmente
        </button>
      </div>
    </div>
  );
}
