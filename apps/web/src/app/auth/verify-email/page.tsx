'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

type State = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setState('no-token');
      return;
    }

    fetch(`/api/auth/verify-email/confirm?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as { detail?: string; message?: string };
        if (res.ok) {
          setState('success');
          setMessage(data.message || 'E-mail confirmado com sucesso!');
        } else {
          setState('error');
          setMessage(data.detail || 'Link inválido ou expirado.');
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Não foi possível confirmar o e-mail. Tente novamente.');
      });
  }, []);

  return (
    <BrandBackground showLogo={false}>
      <div className="flex min-h-[calc(100dvh-40px)] w-full items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/95 p-8 shadow-premium backdrop-blur-xl text-center">
          <div className="mb-6 flex justify-center">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          {state === 'loading' && (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-8 w-8 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h1 className="text-xl font-black text-slate-900">Verificando seu e-mail…</h1>
              <p className="mt-2 text-sm text-slate-500">Aguarde um momento.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <span className="text-3xl">✅</span>
              </div>
              <h1 className="text-xl font-black text-slate-900">E-mail confirmado!</h1>
              <p className="mt-2 text-sm text-slate-500">{message}</p>
              <Link
                href="/home"
                className="mt-8 block w-full rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] py-3.5 text-[13px] font-black uppercase tracking-widest text-white"
              >
                Ir para o app
              </Link>
            </>
          )}

          {(state === 'error' || state === 'no-token') && (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50">
                <span className="text-3xl">❌</span>
              </div>
              <h1 className="text-xl font-black text-slate-900">Link inválido</h1>
              <p className="mt-2 text-sm text-slate-500">
                {state === 'no-token'
                  ? 'Nenhum token encontrado. Use o link enviado por e-mail.'
                  : message}
              </p>
              <Link
                href="/home"
                className="mt-8 block w-full rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] py-3.5 text-[13px] font-black uppercase tracking-widest text-white"
              >
                Voltar ao app
              </Link>
            </>
          )}
        </div>
      </div>
    </BrandBackground>
  );
}
