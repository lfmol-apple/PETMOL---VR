'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';
import { trackV1Metric } from '@/lib/v1Metrics';

export default function WelcomePage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [showVideoSoon, setShowVideoSoon] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    // small delay so the animation is felt
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-dvh w-full flex flex-col items-center justify-center px-5 py-10">

        {/* Logo */}
        <div
          className="mb-8 transition-all duration-700 ease-out"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-16px)' }}
        >
          <PetmolTextLogo className="text-6xl drop-shadow-[0_8px_24px_rgba(0,0,0,0.2)]" />
        </div>

        {/* Card */}
        <div
          className="w-full max-w-md transition-all duration-700 ease-out delay-150"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium px-7 py-8 text-center">

            {/* Paw icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center shadow-inner">
                <img src="/brand/pata-custom.png" alt="🐾" className="w-9 h-9 object-contain"
                  style={{ filter: 'brightness(0) invert(32%) sepia(86%) saturate(1478%) hue-rotate(204deg) brightness(97%) contrast(93%)' }} />
              </div>
            </div>

            {/* Confirmation chip */}
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider mb-5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Conta criada com sucesso
            </div>

            {/* Headline */}
            <h1 className="text-[28px] font-black text-slate-900 leading-tight tracking-tight">
              Vamos preparar o PETMOL para o seu pet 🐾
            </h1>

            {/* Subtext */}
            <p className="mt-3 text-sm text-slate-500 leading-relaxed font-medium">
              Leva cerca de 2 minutos. Você pode completar o restante depois.
            </p>

            {/* Vídeo — espaço opcional, ajuda complementar (ainda sem vídeo hospedado) */}
            <button
              type="button"
              onClick={() => setShowVideoSoon(true)}
              className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left active:bg-slate-100 transition-colors"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#0056D2] text-white text-sm">▶</span>
              <span className="text-[13px] font-bold text-slate-700">Como funciona o PETMOL — 45 segundos</span>
            </button>

            {/* Divider */}
            <div className="my-6 h-px bg-slate-100" />

            {/* CTA */}
            <button
              type="button"
              onClick={() => { trackV1Metric('welcome_register_pet_clicked', {}); router.push('/home?addPet=1'); }}
              className="w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
            >
              Adicionar meu pet
            </button>
            <button
              type="button"
              onClick={() => { trackV1Metric('welcome_skipped', {}); router.push('/home'); }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-500 active:bg-slate-50 transition-colors"
            >
              Fazer isso depois
            </button>
          </div>
        </div>

      </div>

      {showVideoSoon && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-4"
          onClick={() => setShowVideoSoon(false)}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl text-[#0056D2]">▶</div>
            <p className="text-base font-black text-slate-900">Vídeo em breve</p>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Estamos preparando um resumo de 45 segundos. Por enquanto, o próprio app te guia — é só adicionar seu pet.
            </p>
            <button
              type="button"
              onClick={() => setShowVideoSoon(false)}
              className="mt-4 w-full rounded-2xl bg-[#0056D2] py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </BrandBackground>
  );
}
