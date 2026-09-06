'use client';

/**
 * TalkToPetmolSheet — "Fale com o Petmol".
 *
 * Abre com um texto sugerido já preenchido (editável). Ao enviar, faz
 * POST /support/feedback — o backend grava e entrega de verdade na caixa
 * gerenciamento@petmol.com.br (Reply-To = e-mail do tutor).
 */
import { useState } from 'react';
import { Check, MessageCircleHeart, Send } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';

const SUGGESTION =
  'Tenho uma sugestão para o Petmol: ';

interface Props {
  open: boolean;
  onClose: () => void;
  /** de onde foi aberto — só telemetria/contexto no e-mail */
  source?: string;
}

export function TalkToPetmolSheet({ open, onClose, source = 'home' }: Props) {
  const [message, setMessage] = useState(SUGGESTION);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMessage(SUGGESTION);
    setSending(false);
    setDone(false);
    setError(null);
  }

  function handleClose() {
    onClose();
    // deixa a animação de saída rodar antes de limpar
    window.setTimeout(reset, 250);
  }

  async function submit() {
    const body = message.trim();
    if (body.length < 4 || sending) return;
    setSending(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/support/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category: 'suggestion',
          message: body,
          platform: 'web',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      trackV1Metric('feedback_submitted', { category: 'suggestion', source });
      setDone(true);
    } catch {
      setError('Não deu para enviar agora. Tente de novo em instantes.');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <SheetShell open onClose={handleClose} tone="grey" variant="center" size="sm" z={SHEET_Z.high}>
      <SheetHeader
        tone="petmol"
        withHandle
        title="Fale com o Petmol"
        subtitle={done ? 'Mensagem enviada' : 'Sugestão, elogio ou problema'}
        media={
          <SheetIcon tone={done ? 'emerald' : 'onPetmol'}>
            {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <MessageCircleHeart className="h-5 w-5" strokeWidth={2} />}
          </SheetIcon>
        }
        onClose={handleClose}
      />

      <SheetShell.Body>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[15px] font-semibold text-slate-800">Recebemos sua mensagem 💙</p>
            <p className="text-[13px] text-slate-500">
              A equipe do Petmol lê tudo. Se precisar de resposta, respondemos no seu e-mail.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white active:scale-[0.97]"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="mb-2 text-[13px] leading-snug text-slate-500">
              Escreva do seu jeito. Chega direto na gerência e ajuda a decidir o que vem primeiro.
            </p>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={4000}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Sua mensagem…"
            />
            {error && <p className="mt-2 text-[12.5px] font-medium text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={message.trim().length < 4 || sending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              <Send className="h-[16px] w-[16px]" strokeWidth={2.4} />
              {sending ? 'Enviando…' : 'Enviar para o Petmol'}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Enviado para gerenciamento@petmol.com.br
            </p>
          </>
        )}
      </SheetShell.Body>
    </SheetShell>
  );
}

export default TalkToPetmolSheet;
