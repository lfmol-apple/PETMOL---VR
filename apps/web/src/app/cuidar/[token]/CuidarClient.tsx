'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subscribeToPush } from '@/features/notifications/pushService';

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api';

type PetInfo = {
  pet_id: string;
  pet_name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  owner_name: string;
};

export default function CuidarClient({ token, initial }: { token: string; initial?: PetInfo | null }) {
  const router = useRouter();

  const [info, setInfo] = useState<PetInfo | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [invalid, setInvalid] = useState(false);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [mode, setMode] = useState<'guest' | 'login'>('guest');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [pushDone, setPushDone] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('petmol_token') : null;
    if (stored) setAuthToken(stored);

    if (!initial) {
      fetch(`${API}/pets/join/${token}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: PetInfo) => setInfo(d))
        .catch(() => setInvalid(true))
        .finally(() => setLoading(false));
    }
  }, [token, initial]);

  async function handleAuthenticatedJoin(tok: string) {
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`${API}/pets/join/${token}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        setJoined(true);
      } else {
        const d = await res.json() as { detail?: string };
        setError(d.detail ?? 'Erro ao entrar');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setJoining(false);
    }
  }

  async function handleGuestJoin() {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`${API}/pets/join/${token}/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const d = await res.json() as { access_token: string };
        localStorage.setItem('petmol_token', d.access_token);
        document.cookie = `petmol_auth=${d.access_token};path=/;max-age=${60 * 60 * 24 * 30}`;
        setAuthToken(d.access_token);
        setJoined(true);
      } else {
        const d = await res.json() as { detail?: string };
        setError(d.detail ?? 'Erro ao entrar');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setJoining(false);
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) { setError('Email ou senha incorretos.'); setJoining(false); return; }
      const d = await res.json() as { access_token: string };
      localStorage.setItem('petmol_token', d.access_token);
      document.cookie = `petmol_auth=${d.access_token};path=/;max-age=${60 * 60 * 24 * 30}`;
      await handleAuthenticatedJoin(d.access_token);
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setJoining(false);
    }
  }

  async function handlePush() {
    setPushLoading(true);
    try {
      const tok = authToken || localStorage.getItem('petmol_token');
      if (tok) await subscribeToPush(tok);
      setPushDone(true);
    } catch {
      setPushDone(true);
    } finally {
      setPushLoading(false);
    }
  }

  const emoji = info?.species === 'cat' ? '🐱' : '🐶';

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 px-6 text-center gap-4">
        <span className="text-5xl">😕</span>
        <h1 className="text-xl font-bold text-slate-700">Link inválido ou expirado</h1>
        <p className="text-slate-500 text-sm">Peça ao tutor um novo link de convite.</p>
        <Link href="/home" className="mt-4 px-6 py-3 rounded-2xl bg-amber-400 text-white font-bold text-sm">
          Ir para o app
        </Link>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6 text-center gap-5">
        <span className="text-6xl">🐾</span>
        <h1 className="text-2xl font-black text-slate-800">Você agora cuida de {info!.pet_name}!</h1>
        <p className="text-slate-500 text-sm max-w-xs">
          Ative as notificações para receber alertas se {info!.pet_name} sumir ou precisar de ajuda.
        </p>
        {!pushDone ? (
          <button
            onClick={handlePush}
            disabled={pushLoading}
            className="w-full max-w-xs py-4 rounded-2xl bg-amber-400 text-white font-black text-base active:opacity-80 disabled:opacity-50"
          >
            {pushLoading ? 'Ativando...' : '🔔 Ativar notificações'}
          </button>
        ) : (
          <p className="text-emerald-600 font-semibold text-sm">✅ Notificações ativas!</p>
        )}
        <button onClick={() => router.push('/home')} className="text-sm text-slate-400 underline">
          Abrir o PETMOL
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <div className="relative w-full aspect-square max-h-[50dvh] bg-slate-100 overflow-hidden">
        {info!.photo_url ? (
          <img src={info!.photo_url} alt={info!.pet_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl bg-amber-50">{emoji}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <p className="text-white/80 text-sm font-medium">{info!.owner_name} te convidou para cuidar de</p>
          <h1 className="text-white text-4xl font-black leading-tight">{info!.pet_name}</h1>
          {info!.breed && <p className="text-white/70 text-sm">{info!.breed}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-5 pb-8 gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-amber-800 text-sm font-semibold leading-snug">
            {emoji} Você vai receber alertas imediatos se {info!.pet_name} sumir — independente de onde estiver.
          </p>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        {authToken ? (
          <button
            onClick={() => handleAuthenticatedJoin(authToken)}
            disabled={joining}
            className="w-full py-4 rounded-2xl bg-amber-400 text-white font-black text-lg active:opacity-80 disabled:opacity-50"
          >
            {joining ? 'Entrando...' : `Cuidar de ${info!.pet_name} 🐾`}
          </button>
        ) : mode === 'guest' ? (
          <div className="flex flex-col gap-3">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGuestJoin()}
              placeholder="Como você quer ser chamado?"
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoFocus
            />
            <button
              onClick={handleGuestJoin}
              disabled={joining}
              className="w-full py-4 rounded-2xl bg-amber-400 text-white font-black text-lg active:opacity-80 disabled:opacity-50"
            >
              {joining ? 'Entrando...' : `Cuidar de ${info!.pet_name} 🐾`}
            </button>
            <button onClick={() => setMode('login')} className="text-center text-sm text-slate-500">
              Já tenho uma conta no PETMOL →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoFocus
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Senha"
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={handleLogin}
              disabled={joining}
              className="w-full py-4 rounded-2xl bg-amber-400 text-white font-black text-lg active:opacity-80 disabled:opacity-50"
            >
              {joining ? 'Entrando...' : 'Entrar e cuidar 🐾'}
            </button>
            <button onClick={() => setMode('guest')} className="text-center text-sm text-slate-500">
              ← Entrar sem conta
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-auto pt-2">
          Ao continuar você aceita os{' '}
          <Link href="/legal/terms" className="underline">termos de uso</Link> do PETMOL.
        </p>
      </div>
    </div>
  );
}
