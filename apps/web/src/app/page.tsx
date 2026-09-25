'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth-token';
import { PetmolTextLogo } from '@/components/ui/BrandBackground';
import { AppBootSplash } from '@/components/AppBootSplash';
import { isNativeAppClient } from '@/lib/nativeApp';
import { DownloadButton, DownloadCta, StickyDownloadBar } from '@/components/landing/DownloadButton';
import { AppPreview, HeroPhones } from '@/components/landing/AppPreview';
import { useLandingContext } from '@/hooks/useLandingContext';
import { LANDING_COPY } from '@/lib/landingContext';

export default function LandingPage() {
  const router = useRouter();
  // "Recommendations" (Amazon US) é conteúdo editorial só web — deixado
  // no rodapé, nunca competindo com a proposta PETMOL. Escondido no app.
  const [hideAmazonPicks, setHideAmazonPicks] = useState(false);
  // 'boot' = ainda não sei se está logado → mostra o splash (nunca a landing).
  // Usuário logado abrindo o app cai direto no /home sem piscar esta tela.
  const [phase, setPhase] = useState<'boot' | 'guest'>('boot');
  const { variant } = useLandingContext();
  const copy = LANDING_COPY[variant];

  useEffect(() => {
    if (isNativeAppClient()) {
      router.replace('/home');
      return;
    }
    if (getToken()) {
      router.replace('/home');
    } else {
      setPhase('guest');
    }
  }, [router]);

  useEffect(() => {
    setHideAmazonPicks(isNativeAppClient());
  }, []);

  if (phase === 'boot') {
    return <AppBootSplash />;
  }

  return (
    <div className="min-h-dvh bg-white flex flex-col">

      {/* Cabeçalho mínimo: não é fixo e ocupa pouco — o botão Baixar é o protagonista */}
      <header
        className="flex items-center justify-between bg-blue-50 px-5 pb-1"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <PetmolTextLogo className="text-2xl" color="#0056D2" />
        <Link href="/login" className="px-2 py-1.5 text-[13px] font-bold text-[#0056D2]/80 active:opacity-60">
          Já tenho conta
        </Link>
      </header>

      {/* Hero — título, telas passando e selos das lojas na MESMA dobra (sem depender de rolagem) */}
      <section className="px-5 pt-1 pb-3 text-center bg-gradient-to-b from-blue-50 to-white">
        <h1 className="text-[26px] font-black text-slate-900 leading-[1.12] tracking-tight text-balance">
          {copy.title.map((line, i) => (<span key={i}>{i > 0 && <br />}{line}</span>))}
        </h1>
        <div className="mt-3"><HeroPhones /></div>
        <div className="mx-auto mt-3 w-full max-w-sm">
          <DownloadCta placement="hero-botao" targetId="lojas-hero" />
          <div className="mt-2.5"><DownloadButton placement="hero" compact /></div>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 font-semibold">Grátis · sem anúncios · leva menos de 1 minuto</p>
      </section>

      <p className="px-6 pt-4 pb-6 text-center text-base text-slate-500 leading-relaxed font-medium max-w-sm mx-auto">
        {copy.subtitle}
      </p>

      {/* O app por dentro — quem veio do anúncio vê antes de decidir */}
      <AppPreview />

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
        <FeatureCard
          icon="🚨"
          color="bg-red-50 border-red-100"
          iconBg="bg-red-500"
          tag="Pet Sumido"
          title="Se sumir, a comunidade ajuda a procurar"
          body="Um alerta geolocalizado avisa quem está por perto na hora — sem precisar sair procurando sozinho."
        />
      </section>

      {/* Download no meio da página, logo depois dos benefícios */}
      <section className="px-5 pb-10">
        <div className="mx-auto max-w-xs rounded-3xl bg-[#0056D2] p-6 text-center text-white">
          <p className="text-lg font-black leading-snug">Tenha os avisos do seu pet no bolso.</p>
          <p className="mt-1 text-sm text-blue-100">Notificação na hora certa, mesmo com o app fechado.</p>
          <div className="mt-4"><DownloadButton placement="meio" className="!bg-white !text-[#0056D2] !shadow-none" /></div>
        </div>
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
        <h2 className="text-2xl font-black text-slate-900">Baixe o PETMOL e comece agora.</h2>
        <p className="mt-2 text-sm text-slate-500 font-medium">Adicione o seu pet em menos de 1 minuto.</p>
        <div className="mt-6 w-full max-w-xs"><div className="space-y-3"><DownloadCta placement="final-botao" targetId="lojas-final" /><DownloadButton placement="final" withWebLink /></div></div>
        <Link href="/login" className="mt-3 text-sm text-slate-400 font-semibold">
          Já tenho conta
        </Link>
      </section>

      <StickyDownloadBar />

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
