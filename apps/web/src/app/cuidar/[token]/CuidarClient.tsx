'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subscribeToPush } from '@/features/notifications/pushService';

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const d = await res.json() as { detail?: string; message?: string };
      return d.detail || d.message || fallback;
    }
    return (await res.text()).trim() || fallback;
  } catch { return fallback; }
}

type PetInfo = { pet_id: string; pet_name: string; species: string; breed: string | null; photo_url: string | null; owner_name: string };

export default function CuidarClient({ token, initial }: { token: string; initial?: PetInfo | null }) {
  const router = useRouter();

  const [info, setInfo] = useState<PetInfo | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [invalid, setInvalid] = useState(false);

  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [autoJoining, setAutoJoining] = useState(false);
  const autoJoinAttempted = useRef(false);

  // Form mode
  const [mode, setMode] = useState<'register' | 'login'>('register');

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Process state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(false);

  // Post-join
  const [pushDone, setPushDone] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('petmol_token') : null;
    if (stored) { setAuthToken(stored); setAutoJoining(true); }

    if (!initial) {
      fetch(`${API}/pets/join/${token}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: PetInfo) => setInfo(d))
        .catch(() => setInvalid(true))
        .finally(() => setLoading(false));
    }
  }, [token, initial]);

  // Auto-join for already-authenticated users
  useEffect(() => {
    if (!authToken || loading || invalid || joined || submitting || autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    void joinWithToken(authToken);
  }, [authToken, loading, invalid, joined, submitting]);

  // ── Core join ─────────────────────────────────────────────────────────────
  async function joinWithToken(tok: string) {
    try {
      const res = await fetch(`${API}/pets/join/${token}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        setJoined(true);
      } else {
        setError(await readError(res, 'Não foi possível entrar.'));
        setAutoJoining(false);
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setAutoJoining(false);
    }
  }

  // ── Register → login → join ───────────────────────────────────────────────
  async function handleRegister() {
    const n = name.trim(), e = email.trim();
    if (!n || !e || password.length < 6) {
      setError('Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // 1. Create account
      const regRes = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, email: e, password, terms_accepted: true }),
      });
      if (!regRes.ok) {
        const msg = await readError(regRes, 'Erro ao criar conta.');
        if (/cadastrado|existe/i.test(msg)) {
          setError('Este e-mail já tem cadastro. Use "Já tenho conta" para entrar.');
        } else {
          setError(msg);
        }
        return;
      }

      // 2. Login to get token
      const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, password }),
      });
      if (!loginRes.ok) { setError('Conta criada, mas não foi possível entrar automaticamente. Use "Já tenho conta".'); return; }
      const { access_token } = await loginRes.json() as { access_token: string };
      localStorage.setItem('petmol_token', access_token);
      document.cookie = `petmol_auth=${access_token};path=/;max-age=${60 * 60 * 24 * 30}`;
      setAuthToken(access_token);

      // 3. Join
      await joinWithToken(access_token);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Login → join ──────────────────────────────────────────────────────────
  async function handleLogin() {
    const e = email.trim();
    if (!e || !password) { setError('Preencha e-mail e senha.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, password }),
      });
      if (!res.ok) { setError('E-mail ou senha incorretos.'); return; }
      const { access_token } = await res.json() as { access_token: string };
      localStorage.setItem('petmol_token', access_token);
      document.cookie = `petmol_auth=${access_token};path=/;max-age=${60 * 60 * 24 * 30}`;
      setAuthToken(access_token);
      await joinWithToken(access_token);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePush() {
    setPushLoading(true);
    try {
      const tok = authToken || localStorage.getItem('petmol_token');
      if (tok) await subscribeToPush(tok);
      setPushDone(true);
    } catch { setPushDone(true); }
    finally { setPushLoading(false); }
  }

  const emoji = info?.species === 'cat' ? '🐱' : '🐶';

  // ── Loading / auto-joining ────────────────────────────────────────────────
  if (loading || (autoJoining && !error && !joined)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          {autoJoining && <p className="text-sm text-slate-500 font-medium">Entrando…</p>}
        </div>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 px-6 text-center gap-4">
        <span className="text-5xl">😕</span>
        <h1 className="text-xl font-bold text-slate-700">Link inválido ou expirado</h1>
        <p className="text-slate-500 text-sm">Peça ao tutor um novo link de convite.</p>
        <Link href="/home" className="mt-4 px-6 py-3 rounded-2xl bg-amber-400 text-white font-bold text-sm">Ir para o app</Link>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (joined) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-white px-5 py-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 text-center">
          <span className="text-6xl">🐾</span>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Você agora cuida de {info!.pet_name}!</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ative as notificações para receber alertas de saúde e avisos de pet sumido.
            </p>
          </div>

          {/* Notificações */}
          <div className="rounded-3xl border border-white bg-white/90 p-4 text-left shadow-xl shadow-amber-900/5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl">🔔</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-slate-800">Ativar notificações</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Avisos de vacina, ração e pet sumido chegam diretamente no seu celular.
                </p>
                {!pushDone ? (
                  <button
                    onClick={handlePush}
                    disabled={pushLoading}
                    className="mt-3 w-full rounded-2xl bg-amber-400 py-3 text-sm font-black text-white active:opacity-80 disabled:opacity-50"
                  >
                    {pushLoading ? 'Ativando...' : 'Ativar notificações'}
                  </button>
                ) : (
                  <p className="mt-3 text-sm font-bold text-emerald-600">✓ Notificações ativas</p>
                )}
              </div>
            </div>
          </div>

          {/* Acesso salvo */}
          {accountSaved && (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              Acesso salvo. Entre com e-mail e senha em qualquer dispositivo.
            </p>
          )}

          {/* Instalar PWA */}
          <div className="rounded-3xl border border-slate-100 bg-white p-4 text-left">
            <h2 className="text-sm font-black text-slate-800">Adicionar o app ao celular</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              iPhone: toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.<br />
              Android: menu do navegador → <strong>Instalar app</strong>.
            </p>
          </div>

          <button
            onClick={() => router.push('/home')}
            className="w-full rounded-2xl bg-slate-900 py-4 text-base font-black text-white active:opacity-80"
          >
            Abrir o PETMOL
          </button>
        </div>
      </div>
    );
  }

  // ── Invite form ───────────────────────────────────────────────────────────
  const isRegister = mode === 'register';

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      {/* Pet hero */}
      <div className="relative w-full aspect-[4/3] max-h-[42dvh] bg-slate-100 overflow-hidden flex-shrink-0">
        {info!.photo_url
          ? <img src={info!.photo_url} alt={info!.pet_name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-8xl bg-amber-50">{emoji}</div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
          <p className="text-white/75 text-[13px] font-medium">{info!.owner_name} te convidou para cuidar de</p>
          <h1 className="text-white text-3xl font-black leading-tight">{info!.pet_name}</h1>
          {info!.breed && <p className="text-white/65 text-xs mt-0.5">{info!.breed}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4 overflow-y-auto">

        {/* Authenticated user: auto-join failed — show error with recovery */}
        {authToken && error ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
              <p className="text-rose-700 text-sm font-semibold">{error}</p>
            </div>
            <button
              onClick={() => router.push('/home')}
              className="w-full py-4 rounded-2xl bg-slate-900 text-white font-black text-base active:opacity-80"
            >
              Ir para o app
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('petmol_token');
                document.cookie = 'petmol_auth=;path=/;max-age=0';
                setAuthToken(null);
                setError('');
                autoJoinAttempted.current = false;
              }}
              className="w-full py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm active:bg-slate-50"
            >
              Entrar com outra conta
            </button>
          </div>
        ) : !authToken && (
          <>
            {/* Tab selector */}
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black transition-all ${isRegister ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Criar conta
              </button>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black transition-all ${!isRegister ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Já tenho conta
              </button>
            </div>

            {error && (
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
                <p className="text-rose-700 text-sm font-semibold">{error}</p>
              </div>
            )}

            {/* Register form */}
            {isRegister && (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="E-mail"
                  autoComplete="email"
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  placeholder="Senha (mín. 6 caracteres)"
                  autoComplete="new-password"
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleRegister}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 active:opacity-80 disabled:opacity-50"
                >
                  {submitting ? 'Criando conta...' : `Criar conta e cuidar de ${info!.pet_name} 🐾`}
                </button>
              </div>
            )}

            {/* Login form */}
            {!isRegister && (
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="E-mail"
                  autoComplete="email"
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Senha"
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <Link
                  href="/auth/forgot"
                  className="text-right text-xs font-semibold text-slate-400 -mt-1"
                >
                  Esqueci minha senha
                </Link>
                <button
                  onClick={handleLogin}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-amber-400 text-white font-black text-base active:opacity-80 disabled:opacity-50"
                >
                  {submitting ? 'Entrando...' : `Entrar e cuidar de ${info!.pet_name} 🐾`}
                </button>
              </div>
            )}

            <p className="text-center text-[11px] leading-relaxed text-slate-400 mt-auto pt-1">
              Ao continuar você aceita os{' '}
              <Link href="/legal/terms" className="underline">termos de uso</Link> do PETMOL.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
