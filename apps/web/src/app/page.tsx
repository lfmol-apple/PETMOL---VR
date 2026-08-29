'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth-token';
import { PetmolTextLogo } from '@/components/ui/BrandBackground';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) router.replace('/home');
  }, [router]);

  return (
    <div className="min-h-dvh bg-white flex flex-col">

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-3 flex items-center justify-between">
        <PetmolTextLogo className="text-3xl" color="#0056D2" />
        <div className="flex gap-2">
          <Link href="/login"
            className="px-4 py-2 rounded-xl text-sm font-bold text-[#0056D2] border border-[#0056D2]/30 active:bg-blue-50">
            Entrar
          </Link>
          <Link href="/register"
            className="px-4 py-2 rounded-xl text-sm font-black text-white bg-[#0056D2] shadow-sm active:scale-[0.97]">
            Criar conta
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-14 pb-12 text-center bg-gradient-to-b from-blue-50 to-white">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Sem anúncios
        </div>
        <h1 className="text-[32px] font-black text-slate-900 leading-[1.15] tracking-tight">
          Nunca esqueça nada<br />do que importa<br />pro seu pet.
        </h1>
        <p className="mt-4 text-base text-slate-500 leading-relaxed font-medium max-w-xs mx-auto">
          Vacinas, remédios e ração organizados, com aviso na hora certa — e comparação de preços entre lojas parceiras.
        </p>
        <Link href="/register"
          className="mt-8 inline-block w-full max-w-xs rounded-2xl bg-[#0056D2] px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]">
          Criar conta
        </Link>
      </section>

      {/* Features */}
      <section className="px-5 pb-10 space-y-4">
        <FeatureCard
          icon="💉"
          color="bg-purple-50 border-purple-100"
          iconBg="bg-purple-500"
          tag="Saúde"
          title="Nunca perca uma vacina"
          body="Registre o calendário de vacinas, vermífugos e remédios. Receba lembretes automáticos antes do prazo — sem precisar lembrar de nada."
        />
        <FeatureCard
          icon="🍗"
          color="bg-amber-50 border-amber-100"
          iconBg="bg-amber-500"
          tag="Ração"
          title="Ração no controle"
          body="Informe quanto tem. O PETMOL calcula o consumo diário e avisa antes de acabar. Chega de chegar em casa sem ração."
        />
        <FeatureCard
          icon="🛒"
          color="bg-blue-50 border-blue-100"
          iconBg="bg-blue-500"
          tag="Comprar"
          title="Compare preços, sem esforço"
          body="Remédio, ração ou antiparasitário: comparamos Cobasi, Petz, Mercado Livre e Shopee automaticamente e mostramos onde há opção de compra."
        />
      </section>

      {/* Social proof */}
      <section className="px-5 pb-10">
        <div className="rounded-3xl bg-slate-50 border border-slate-100 p-6 text-center">
          <p className="text-2xl font-black text-slate-900">&quot;Finalmente um app de pet<br />que funciona de verdade.&quot;</p>
          <p className="mt-3 text-sm text-slate-500">Feito para quem trata pet como família.</p>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-5 pb-12 text-center">
        <h2 className="text-2xl font-black text-slate-900">Comece agora.</h2>
        <p className="mt-2 text-sm text-slate-500 font-medium">Cadastre em menos de 1 minuto.</p>
        <Link href="/register"
          className="mt-6 inline-block w-full max-w-xs rounded-2xl bg-[#0056D2] px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]">
          Criar conta
        </Link>
        <Link href="/login" className="mt-3 inline-block text-sm text-slate-400 font-semibold">
          Já tenho conta
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-100 px-5 py-5 text-center">
        <p className="text-xs text-slate-400">© 2026 PETMOL</p>
        <div className="mt-1 flex justify-center gap-4 text-xs text-slate-400">
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacidade</Link>
          <Link href="/legal/terms" className="hover:text-slate-600">Termos de Uso</Link>
        </div>
      </footer>

    </div>
  );
}

function FeatureCard({ icon, color, iconBg, tag, title, body }: {
  icon: string;
  color: string;
  iconBg: string;
  tag: string;
  title: string;
  body: string;
}) {
  return (
    <div className={`rounded-3xl border p-6 ${color}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center text-xl flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{tag}</p>
          <h3 className="text-[16px] font-black text-slate-900 leading-tight">{title}</h3>
        </div>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
