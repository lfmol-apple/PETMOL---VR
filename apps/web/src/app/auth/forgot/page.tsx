'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readApiMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({})) as { detail?: string; message?: string };
  return data.detail || data.message || fallback;
}

export default function ForgotPage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
  }, []);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!EMAIL_RE.test(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readApiMessage(response, 'Não foi possível enviar o e-mail.'));
      }
      setMessage('Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        throw new Error(await readApiMessage(response, 'Não foi possível redefinir a senha.'));
      }
      setDone(true);
      setMessage('Senha redefinida com sucesso. Você já pode entrar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandBackground showLogo={false}>
      <div className="flex min-h-[calc(100dvh-40px)] w-full items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/95 p-6 shadow-premium backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <PetmolTextLogo className="text-5xl drop-shadow-sm" color="#2563EB" />
          </div>

          <h1 className="text-2xl font-black text-slate-900">
            {token ? 'Redefinir senha' : 'Recuperar senha'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {token ? 'Defina uma nova senha para sua conta.' : 'Enviaremos um link de recuperação para seu e-mail.'}
          </p>

          {message && (
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          {!token ? (
            <form onSubmit={requestReset} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] py-3.5 text-[13px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              >
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>
          ) : (
            <form onSubmit={confirmReset} className="mt-6 space-y-4">
              <div>
                <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Nova senha
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || done}
                className="w-full rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] py-3.5 text-[13px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              >
                {loading ? 'Salvando...' : done ? 'Senha alterada' : 'Salvar nova senha'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm font-bold text-blue-600 hover:underline">
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </BrandBackground>
  );
}
