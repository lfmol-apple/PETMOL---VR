'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { formatLocalDateOnly } from '@/lib/localDate';
import { ReportAlertSheet } from '@/components/home/ReportAlertSheet';

// Área recuperável do Pet Sumido (PS-2): um alerta sério nunca pode depender
// só de um card efêmero na Home. Aqui ficam TODOS os alertas ativos que
// chegaram para este usuário (inclusive os que ele recolheu ou escondeu com
// "não mostrar por enquanto" na Home) — é o único jeito de recuperar um
// alerta escondido, então é o necessário pro mecanismo funcionar.
//
// Corte cirúrgico (13/09/2026): a seção de histórico ("já foram
// encontrados") saiu — o dono achou a tela carregada e pediu pra tirar o
// que não é essencial. O dado continua existindo em GET /missing-pets/
// history, só não é mais mostrado aqui. Consome só /missing-pets/my-alerts.

type RegionAlert = {
  id: string;
  pet_name: string;
  species: string | null;
  breed: string | null;
  last_seen_location: string | null;
  missing_date: string | null;
  missing_time: string | null;
  photo_url: string | null;
  public_slug: string | null;
};

function speciesEmoji(species: string | null): string {
  return species === 'cat' ? '🐱' : '🐶';
}

function missingLine(a: RegionAlert): string {
  if (!a.missing_date) return 'Desaparecido recentemente';
  const dateLabel = formatLocalDateOnly(a.missing_date, 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Desaparecido em ${dateLabel}${a.missing_time ? ' às ' + a.missing_time : ''}`;
}

export default function PetsDesaparecidosPage() {
  const router = useRouter();
  const [active, setActive] = useState<RegionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [abuseAlert, setAbuseAlert] = useState<RegionAlert | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/missing-pets/my-alerts`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setActive(await res.json() as RegionAlert[]);
    } catch {
      /* silent — tela mostra estado vazio */
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-[#f5f6f8]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 items-center gap-1.5 rounded-full bg-slate-100 pl-2.5 pr-3.5 text-[13px] font-bold text-slate-600 active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Voltar
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-black text-slate-900">Pets desaparecidos na região</h1>
      </header>

      <div className="mx-auto max-w-xl space-y-6 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">

        <section>
          <h2 className="mb-2.5 text-[12px] font-black uppercase tracking-wider text-slate-400">Ativos perto de você</h2>

          {loading ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-400">Carregando…</p>
          ) : active.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
              Nenhum alerta ativo na sua região agora.
            </p>
          ) : (
            <div className="space-y-2.5">
              {active.map((a) => {
                const photo = resolvePetPhotoUrl(a.photo_url);
                const descricao = a.breed ?? '';
                return (
                  <div key={a.id} className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => router.push(`/achei-um-pet?id=${a.id}`)}
                    className="flex w-full items-stretch gap-3 overflow-hidden text-left active:scale-[0.99] transition-transform"
                  >
                    <span className="flex w-[86px] flex-shrink-0 items-center justify-center self-stretch overflow-hidden bg-rose-50 text-3xl">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt={a.pet_name} className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden>{speciesEmoji(a.species)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="text-[13px]">🚨</span>
                        <span className="truncate text-[14px] font-black text-slate-900">{a.pet_name}</span>
                      </span>
                      {descricao && <span className="mt-0.5 block truncate text-[12px] text-slate-500">{descricao}</span>}
                      {a.last_seen_location && (
                        <span className="mt-0.5 block truncate text-[12px] text-rose-600">Visto em: {a.last_seen_location}</span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-slate-400">{missingLine(a)}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center pr-3 text-rose-400">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbuseAlert(a)}
                    className="w-full border-t border-rose-100 py-1.5 text-center text-[11px] font-semibold text-slate-400 active:bg-slate-50"
                  >
                    Denunciar
                  </button>
                  </div>
                );
              })}
            </div>
          )}

          {abuseAlert && (
            <ReportAlertSheet
              open
              alertId={abuseAlert.id}
              petName={abuseAlert.pet_name}
              onClose={() => setAbuseAlert(null)}
            />
          )}

          <button
            type="button"
            onClick={() => router.push('/achei-um-pet')}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-3 text-[13px] font-bold text-slate-600 active:scale-[0.99] transition-transform"
          >
            Ver todos os pets desaparecidos
          </button>
        </section>
      </div>
    </div>
  );
}
