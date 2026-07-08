'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api';

type PetInfo = {
  pet_id: string;
  pet_name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  owner_name: string;
};

export default function CuidarPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [info, setInfo] = useState<PetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/pets/join/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: PetInfo) => setInfo(d))
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('petmol_token') : null;
    if (!stored) {
      // Salva o token de convite para usar após login/registro
      router.push(`/login?redirect=/cuidar/${token}`);
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`${API}/pets/join/${token}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored}` },
      });
      if (res.ok) {
        setJoined(true);
      } else {
        const d = await res.json() as { detail?: string };
        setError(d.detail ?? 'Erro ao entrar no time');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setJoining(false);
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
          Você vai receber notificações se {info!.pet_name} sumir ou precisar de ajuda.
        </p>
        <button
          onClick={() => router.push('/home')}
          className="mt-2 w-full max-w-xs py-4 rounded-2xl bg-amber-400 text-white font-bold text-base active:opacity-80"
        >
          Abrir o PETMOL
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      {/* Hero */}
      <div className="relative w-full aspect-square max-h-[55dvh] bg-slate-100 overflow-hidden">
        {info!.photo_url ? (
          <img
            src={info!.photo_url}
            alt={info!.pet_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl bg-amber-50">
            {emoji}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <p className="text-white/80 text-sm font-medium">{info!.owner_name} te convidou para cuidar de</p>
          <h1 className="text-white text-4xl font-black leading-tight">{info!.pet_name}</h1>
          {info!.breed && <p className="text-white/70 text-sm">{info!.breed}</p>}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-6 pt-6 pb-safe pb-8 gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4">
          <p className="text-amber-800 text-sm font-semibold leading-snug">
            {emoji} Como cuidador, você vai receber um alerta imediato se {info!.pet_name} sumir — independente de onde você estiver.
          </p>
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full py-4 rounded-2xl bg-amber-400 text-white font-black text-lg active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {joining ? 'Entrando...' : `Cuidar de ${info!.pet_name} 🐾`}
        </button>

        <p className="text-center text-xs text-slate-400">
          Ao continuar você aceita os{' '}
          <Link href="/legal/terms" className="underline">termos de uso</Link> do PETMOL.
        </p>

        <div className="mt-auto pt-4 text-center">
          <p className="text-xs text-slate-400">Não tem conta?</p>
          <Link
            href={`/register?redirect=/cuidar/${token}`}
            className="text-sm text-amber-600 font-semibold underline"
          >
            Criar conta grátis
          </Link>
        </div>
      </div>
    </div>
  );
}
