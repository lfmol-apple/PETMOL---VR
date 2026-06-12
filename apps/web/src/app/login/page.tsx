'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

export default function LoginPage() {
  const router = useRouter();
  const [redirectTo, setRedirectTo] = useState('/home');
  const { login, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('redirect') || '/home';
    const safe = (raw === '/' || raw.startsWith('/login')) ? '/home' : raw;
    setRedirectTo(safe);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('msg') === 'conta-excluida') {
      setAccountDeleted(true);
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandBackground showLogo={false}>
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-40px)] w-full px-4 py-8 animate-fadeIn">
        <div className="w-full max-w-sm flex flex-col items-center mb-10 animate-scaleIn">
          <PetmolTextLogo className="text-6xl drop-shadow-3xl" />
        </div>

        {/* Card de Login Centralizado */}
        <div className="bg-white/95 backdrop-blur-xl rounded-[40px] shadow-premium border border-white/60 w-full max-w-md p-8 md:p-10 animate-scaleIn">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Bem-vindo de volta</h2>
            <p className="text-slate-500 text-sm font-medium">Cuide dos seus pets com o PETMOL.</p>
          </div>

          {accountDeleted && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-sm flex items-center gap-2 animate-bounceIn">
              <span className="text-lg">✅</span>
              Conta excluída com sucesso.
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold flex items-center gap-3 animate-shake">
              <span className="text-lg">⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all outline-none text-slate-900 font-medium"
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 pl-1">
                <label htmlFor="password" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Senha
                </label>
                <Link href="/auth/forgot" className="text-xs font-bold text-[#0056D2] hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all outline-none text-slate-900 font-medium"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Carregando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-8">
            <p className="text-slate-500 text-sm font-medium">
              Ainda não tem conta?{' '}
            </p>
            <Link href="/register" className="inline-block mt-2 text-[#0056D2] font-black uppercase tracking-widest text-sm hover:underline active:scale-95 transition-transform">
              Criar conta grátis
            </Link>
          </div>
        </div>
        
        <p className="mt-8 text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-mono">PETMOL CORE SYNC</p>
      </div>
    </BrandBackground>
  );
}
