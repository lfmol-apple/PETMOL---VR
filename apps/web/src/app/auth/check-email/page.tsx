'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

export default function CheckEmailPage() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-email/send', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({})) as { detail?: string };
        setError(data.detail || 'Não foi possível reenviar. Tente novamente.');
      }
    } catch {
      setError('Erro de rede. Verifique sua conexão.');
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
  };

  return (
    <BrandBackground showLogo={false}>
      <div className="flex min-h-[calc(100dvh-40px)] w-full items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/95 p-8 shadow-premium backdrop-blur-xl text-center">
          <div className="mb-6 flex justify-center">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-blue-600" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          <h1 className="text-xl font-black text-slate-900">Confirme seu e-mail</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Enviamos um link de verificação para o seu e-mail. Clique no link para ativar sua conta.
          </p>

          <div className="mt-6 space-y-3">
            {sent ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700">
                E-mail reenviado! Verifique sua caixa de entrada.
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={sending}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[13px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                {sending ? 'Enviando...' : 'Reenviar e-mail de verificação'}
              </button>
            )}

            {error && (
              <p className="text-sm text-rose-600 font-semibold">{error}</p>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-3 text-sm font-semibold text-slate-400 active:text-slate-600 transition-colors"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    </BrandBackground>
  );
}
