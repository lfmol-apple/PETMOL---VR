'use client';

import { ReactNode, useState } from 'react';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';

/**
 * Pedido CONTEXTUAL de ativação (push ou localização) — nosso aviso primeiro,
 * explicando o motivo exato daquela tela, só então chamando o pedido nativo
 * do iOS/Android (via `onActivate`). Nunca pula direto pro popup do sistema:
 * se a pessoa disser não aqui, o SO nem chega a ser consultado, então a
 * única chance dele continua intacta pra uma próxima tela/contexto.
 *
 * Aparece no máximo 1x por tela (ver `useOneTimeAsk`) — não é um popup que
 * insiste; é uma segunda (terceira, quarta) chance espalhada pelos
 * momentos em que aquilo já faz sentido, não um aviso genérico repetido.
 */
export function ActivationAskSheet({
  open, icon, title, body, ctaLabel = 'Ativar', onActivate, onDismiss,
}: {
  open: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  ctaLabel?: string;
  onActivate: () => Promise<void> | void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const activate = async () => {
    setBusy(true);
    try {
      await onActivate();
    } finally {
      setBusy(false);
      onDismiss();
    }
  };

  return (
    <SheetShell open={open} onClose={onDismiss} variant="center" size="sm" z={SHEET_Z.top}>
      <SheetHeader title={title} media={<SheetIcon tone="blue">{icon}</SheetIcon>} onClose={onDismiss} />
      <SheetShell.Body className="space-y-4">
        <p className="text-[13px] leading-relaxed text-slate-600">{body}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-[12px] font-bold text-slate-600 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy}
            className="flex-1 rounded-2xl bg-[#0056D2] py-3 text-[12px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Ativando...' : ctaLabel}
          </button>
        </div>
      </SheetShell.Body>
    </SheetShell>
  );
}
