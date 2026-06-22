'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

export default function WelcomePage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

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
              Nós te ajudamos a cuidar de quem ama você
            </h1>

            {/* Subtext */}
            <p className="mt-3 text-sm text-slate-500 leading-relaxed font-medium">
              O PETMOL organiza vacinas, remédios, ração e tudo mais — para você nunca esquecer nada do que importa.
            </p>

            {/* Divider */}
            <div className="my-6 h-px bg-slate-100" />

            {/* CTA */}
            <button
              type="button"
              onClick={() => router.push('/register-pet')}
              className="w-full rounded-2xl bg-[#0056D2] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
            >
              Cadastrar meu pet
            </button>
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-500 active:bg-slate-50 transition-colors"
            >
              Fazer isso depois
            </button>
          </div>
        </div>

      </div>
    </BrandBackground>
  );
}
