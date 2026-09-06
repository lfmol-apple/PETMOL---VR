'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth-token';
import { PetmolTextLogo } from '@/components/ui/BrandBackground';
import { isNativeAppClient } from '@/lib/nativeApp';

export default function LandingPage() {
  const router = useRouter();
  // "Recommendations" (Amazon US) é conteúdo editorial só web — deixado
  // no rodapé, nunca competindo com a proposta PETMOL. Escondido no app.
  const [hideAmazonPicks, setHideAmazonPicks] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace('/home');
  }, [router]);

  useEffect(() => {
    setHideAmazonPicks(isNativeAppClient());
  }, []);

  return (
    <div className="min-h-dvh bg-white flex flex-col">

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-3 flex items-center justify-between">
        <PetmolTextLogo className="text-3xl" color="#0056D2" />
        <div className="flex items-center gap-2">
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
      <section className="px-5 pt-14 pb-12 text-center bg-gradient-to-b from-blue-50 to-white">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Sem anúncios
        </div>
        <h1 className="text-[32px] font-black text-slate-900 leading-[1.15] tracking-tight text-balance">
          O PETMOL <br className="sm:hidden" />conhece<br />o seu pet.
        </h1>
        <p className="mt-4 text-base text-slate-500 leading-relaxed font-medium max-w-xs mx-auto">
          Acompanha a alimentação, as vacinas, os remédios e a proteção — e mostra o que vem a seguir, na hora certa.
        </p>
        <Link href="/register"
          className="mt-8 inline-block w-full max-w-xs rounded-2xl bg-[#0056D2] px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]">
          Criar conta
        </Link>
        <p className="mt-3 text-xs text-slate-400 font-semibold">Leva menos de 1 minuto.</p>
      </section>

      {/* Como o PETMOL acompanha — benefício → como funciona */}
      <section className="px-5 pb-8 space-y-4">
        <FeatureCard
          icon="🩺"
          color="bg-purple-50 border-purple-100"
          iconBg="bg-purple-500"
          tag="Saúde e proteção"
          title="Sabe o que já foi feito e o que está perto"
          body="Vacinas, vermífugo, antipulgas e remédios num lugar só. O PETMOL guarda cada data e avisa antes do prazo — você não precisa ficar de olho."
        />
        <FeatureCard
          icon="🍽️"
          color="bg-amber-50 border-amber-100"
          iconBg="bg-amber-500"
          tag="Alimentação"
          title="Avisa antes da ração acabar"
          body="Você diz quanto tem em casa. O PETMOL calcula quanto dura pelo consumo do seu pet e lembra a tempo de repor."
        />
        <FeatureCard
          icon="🗓️"
          color="bg-blue-50 border-blue-100"
          iconBg="bg-blue-500"
          tag="Rotina no lugar"
          body="Cada cuidado tem uma data. O PETMOL organiza tudo, prioriza o que vem primeiro e, quando for hora de repor, ajuda a comprar o produto que o seu pet já usa."
          title="O próximo cuidado, sempre à vista"
        />
      </section>

      {/* Fechamento — sem depoimento fabricado */}
      <section className="px-5 pb-10">
        <div className="rounded-3xl bg-slate-50 border border-slate-100 p-6 text-center">
          <p className="text-[17px] font-black text-slate-900 leading-snug">
            Cuidar do pet deixa de ser<br />uma coisa a mais pra lembrar.
          </p>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            O PETMOL acompanha a rotina do seu pet e te avisa quando algo precisa de atenção.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-5 pb-12 flex flex-col items-center text-center">
        <h2 className="text-2xl font-black text-slate-900">Comece agora.</h2>
        <p className="mt-2 text-sm text-slate-500 font-medium">Crie a conta e adicione o seu pet.</p>
        <Link href="/register"
          className="mt-6 block w-full max-w-xs rounded-2xl bg-[#0056D2] px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]">
          Criar conta
        </Link>
        <Link href="/login" className="mt-3 text-sm text-slate-400 font-semibold">
          Já tenho conta
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-100 px-5 py-5 text-center">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          {!hideAmazonPicks && (
            <Link href="/recommendations" className="hover:text-slate-600">Recommendations</Link>
          )}
          <Link href="/sobre" className="hover:text-slate-600">Sobre</Link>
          <Link href="/politica-editorial" className="hover:text-slate-600">Política editorial</Link>
          <Link href="/transparencia" className="hover:text-slate-600">Transparência</Link>
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacidade</Link>
          <Link href="/legal/terms" className="hover:text-slate-600">Termos de Uso</Link>
        </div>
        <p className="mt-2 text-xs text-slate-400">© 2026 PETMOL</p>
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
