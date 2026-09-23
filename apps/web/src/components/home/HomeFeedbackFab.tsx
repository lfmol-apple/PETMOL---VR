'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';

type Category = 'suggestion' | 'bug' | 'help';

// (31) 97152-7644 — número de contato do PETMOL no WhatsApp
export const SUPPORT_WHATSAPP_URL =
  'https://wa.me/5531971527644?text=' +
  encodeURIComponent('Olá, equipe PETMOL! Sou usuário do app e quero contar uma ideia ou um problema: ');

const OPTIONS: Array<{ key: Category; label: string }> = [
  { key: 'suggestion', label: 'Tenho uma ideia ou sugestão' },
  { key: 'bug', label: 'Algo não funcionou como eu esperava' },
  { key: 'help', label: 'Tenho uma dúvida' },
];

/**
 * Canal de escuta dos primeiros usuários, direto na Home: botão flutuante
 * discreto que abre uma folha acolhedora (mesmo endpoint do "Ajude a melhorar
 * o PETMOL" do perfil) e, se a pessoa preferir conversar, WhatsApp direto.
 */
export function HomeFeedbackFab() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'form' | 'sending' | 'done' | 'error'>('form');

  const close = () => {
    setOpen(false);
    if (state === 'done') {
      setCategory(null);
      setMessage('');
      setState('form');
    }
  };

  const submit = async () => {
    if (!category || !message.trim() || state === 'sending') return;
    setState('sending');
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/support/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          category,
          message: message.trim(),
          platform: 'web',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
        }),
      });
      if (!res.ok) throw new Error('send failed');
      trackV1Metric('feedback_submitted', { category, source: 'home_fab' });
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Contar uma ideia ou um problema ao PETMOL"
        className="fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2.5 text-[12px] font-bold text-[#0056D2] shadow-lg shadow-slate-900/15 ring-1 ring-slate-200 backdrop-blur transition-transform active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.4} />
        Sua opinião
      </button>

      {open && (
        <SheetShell open onClose={close} size="md" z={SHEET_Z.raised}>
          <SheetHeader
            title="Sua opinião importa"
            subtitle="Ajude a melhorar o PETMOL"
            media={<SheetIcon tone="blue"><MessageCircle className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
            onClose={close}
          />
          <SheetShell.Body className="space-y-4">
            {state === 'done' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center space-y-1.5">
                <p className="text-[15px] font-bold text-emerald-700">Recebemos, obrigado! 💙</p>
                <p className="text-[13px] text-emerald-700/90">
                  Cada mensagem é lida pela equipe — é assim que o PETMOL melhora.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-slate-600">
                  Você está entre as primeiras pessoas a usar o PETMOL, e o que você conta aqui ajuda a decidir o que
                  vem a seguir. Sem formalidade: pode ser uma ideia, algo que não saiu como esperado ou uma dúvida.
                </p>

                <div className="grid grid-cols-1 gap-2">
                  {OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setCategory(opt.key)}
                      aria-pressed={category === opt.key}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                        category === opt.key
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {category && (
                  <div className="space-y-2">
                    <label htmlFor="home-feedback-message" className="sr-only">Sua mensagem</label>
                    <textarea
                      id="home-feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Conte do seu jeito, em poucas palavras…"
                      rows={4}
                      maxLength={600}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
                    />
                    <p className="text-right text-[11px] text-slate-400">{message.length}/600</p>
                    {state === 'error' && (
                      <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                        Não conseguimos enviar agora. Tente de novo em instantes — ou fale com a gente pelo WhatsApp.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={state === 'sending' || !message.trim()}
                      className="w-full rounded-2xl bg-[#0056D2] py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 disabled:opacity-50"
                    >
                      {state === 'sending' ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                )}

                <a
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-center text-[13px] font-bold text-emerald-700 active:scale-[0.99]"
                >
                  Prefere conversar? Fale com a gente no WhatsApp
                </a>
              </>
            )}
          </SheetShell.Body>
        </SheetShell>
      )}
    </>
  );
}
