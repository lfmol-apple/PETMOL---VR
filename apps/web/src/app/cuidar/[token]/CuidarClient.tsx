'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subscribeToPush } from '@/features/notifications/pushService';

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json() as { detail?: string; message?: string };
      return data.detail || data.message || fallback;
    }
    const text = (await res.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

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
  const [joinedAsGuest, setJoinedAsGuest] = useState(false);
  const [error, setError] = useState('');
  const [pushDone, setPushDone] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const autoJoinAttemptedRef = useRef(false);
  const redirectParam = encodeURIComponent(`/cuidar/${token}`);

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

  useEffect(() => {
    if (!authToken || loading || invalid || joined || joining || autoJoinAttemptedRef.current) return;
    autoJoinAttemptedRef.current = true;
    void handleAuthenticatedJoin(authToken);
  }, [authToken, loading, invalid, joined, joining]);

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
        setError(await readErrorMessage(res, 'Erro ao entrar'));
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
        setAccountName(name.trim());
        setJoinedAsGuest(true);
        setJoined(true);
      } else {
        setError(await readErrorMessage(res, 'Erro ao entrar'));
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

  async function handleCompleteGuestAccount() {
    const tok = authToken || localStorage.getItem('petmol_token');
    if (!tok) return;
    if (!accountEmail.trim() || accountPassword.length < 6) {
      setAccountError('Informe e-mail e senha com pelo menos 6 caracteres.');
      return;
    }
    setAccountSaving(true);
    setAccountError('');
    try {
      const res = await fetch(`${API}/auth/complete-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          name: accountName.trim() || undefined,
          email: accountEmail.trim(),
          password: accountPassword,
        }),
      });
      if (res.ok) {
        setAccountSaved(true);
        setJoinedAsGuest(false);
      } else {
        setAccountError(await readErrorMessage(res, 'Não foi possível salvar seu acesso.'));
      }
    } catch {
      setAccountError('Erro de conexão. Tente novamente.');
    } finally {
      setAccountSaving(false);
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
      <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-white px-5 py-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 text-center">
          <span className="text-6xl">🐾</span>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Você agora cuida de {info!.pet_name}!</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              O PETMOL já está liberado neste aparelho. Para funcionar bem no dia a dia, ative alertas e salve seu acesso.
            </p>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-4 text-left shadow-xl shadow-amber-900/5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl">🔔</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-slate-800">Receber alertas importantes</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Avisos de pet sumido e cuidados chegam como notificação do app.
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
                  <p className="mt-3 text-sm font-bold text-emerald-600">Notificações ativas.</p>
                )}
              </div>
            </div>
          </div>

          {joinedAsGuest && !accountSaved && (
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-left shadow-xl shadow-blue-900/5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-xl">🔐</div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black text-blue-950">Salve seu acesso</h2>
                  <p className="mt-1 text-xs leading-relaxed text-blue-800/75">
                    Se trocar de celular ou limpar o navegador, e-mail e senha recuperam o acesso a {info!.pet_name}.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Seu nome"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder="E-mail"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Senha"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    {accountError && <p className="text-xs font-semibold text-rose-600">{accountError}</p>}
                    <button
                      onClick={handleCompleteGuestAccount}
                      disabled={accountSaving}
                      className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white active:opacity-80 disabled:opacity-50"
                    >
                      {accountSaving ? 'Salvando...' : 'Salvar acesso'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {accountSaved && (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              Acesso salvo. Agora você pode entrar no PETMOL com seu e-mail e senha.
            </p>
          )}

          <div className="rounded-3xl border border-slate-100 bg-white p-4 text-left">
            <h2 className="text-sm font-black text-slate-800">Para ter o app no celular</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              No iPhone, toque em compartilhar e escolha “Adicionar à Tela de Início”. No Android, abra o menu do navegador e toque em “Instalar app” ou “Adicionar à tela inicial”.
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
            {emoji} Você vai ajudar nos alertas e cuidados de {info!.pet_name}. Para não perder o acesso, entre ou crie uma conta.
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
            <Link
              href={`/register?redirect=${redirectParam}`}
              className="w-full rounded-2xl bg-blue-600 py-4 text-center text-base font-black text-white shadow-lg shadow-blue-600/20 active:opacity-80"
            >
              Entrar ou criar conta grátis
            </Link>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-center text-sm font-black text-slate-700 active:bg-slate-50"
            >
              Já tenho conta no PETMOL
            </button>
            <div className="my-1 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">ou rápido</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
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
              className="w-full py-3.5 rounded-2xl bg-amber-400 text-white font-black text-base active:opacity-80 disabled:opacity-50"
            >
              {joining ? 'Entrando...' : `Entrar só com meu nome`}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-slate-400">
              Modo rápido funciona neste navegador. Depois você poderá salvar e-mail e senha para não perder acesso.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center">
              <p className="text-sm font-bold text-slate-700">Entre para aceitar o convite de {info!.pet_name}.</p>
            </div>
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
            <Link href={`/register?redirect=${redirectParam}`} className="text-center text-sm font-bold text-blue-600">
              Criar conta grátis
            </Link>
            <button onClick={() => setMode('guest')} className="text-center text-sm text-slate-500">
              ← Voltar
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
