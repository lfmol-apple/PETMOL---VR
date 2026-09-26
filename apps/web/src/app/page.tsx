'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth-token';
import { AppBootSplash } from '@/components/AppBootSplash';
import { isNativeAppClient } from '@/lib/nativeApp';
import { DownloadButton, DownloadCta, StickyDownloadBar } from '@/components/landing/DownloadButton';
import { AppPreview, HeroPhones } from '@/components/landing/AppPreview';
import { useLandingContext } from '@/hooks/useLandingContext';
import { LANDING_COPY, readLandingContext } from '@/lib/landingContext';
import { getLandingVariant, VARIANT_HAS_IMAGE, type VariantInfo } from '@/lib/landingExperiment';
import { trackLandingEvent } from '@/lib/landingEvents';
import { LandingIntro } from '@/components/landing/LandingIntro';
import { decideIntro, isMobileVisitor, setIntroMode, wasIntroSeen } from '@/lib/landingIntro';

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
  // Teste A/B: a variante é definida ANTES da 1ª renderização da landing (no mesmo efeito que tira o splash),
  // então nunca aparece uma versão e troca para outra.
  const [exp, setExp] = useState<VariantInfo | null>(null);
  const viewSent = useRef(false);
  // Introdução em vídeo (só celular): decidida no mesmo instante em que a landing é liberada, então nunca
  // aparece a landing e depois a introdução por cima.
  const [intro, setIntro] = useState<{ show: boolean; preview: boolean }>({ show: false, preview: false });
  const [introDone, setIntroDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNativeAppClient()) {
      router.replace('/home');
      return;
    }
    if (getToken()) {
      router.replace('/home');
    } else {
      const ctx = readLandingContext(window.location.search, navigator.userAgent || '');
      const decision = decideIntro({ search: window.location.search, isMobile: isMobileVisitor(), isNative: false, seen: wasIntroSeen() });
      setIntroMode(decision.show ? 'shown' : 'none');
      setIntro({ show: decision.show, preview: decision.preview });
      // Mensagem por anúncio (?c=) é uma 3ª versão e a introdução em modo de teste também: ficam fora da estatística do A/B.
      const info = getLandingVariant({ search: window.location.search, forcePreview: ctx.variant !== 'default' || decision.preview });
      setExp(info);
      setPhase('guest');
      if (!viewSent.current) {
        viewSent.current = true;
        trackLandingEvent('landing_view', {}, info);
      }
    }
  }, [router]);

  useEffect(() => {
    setHideAmazonPicks(isNativeAppClient());
  }, []);

  const introOpen = intro.show && !introDone;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (introOpen) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [introOpen, phase]);

  if (phase === 'boot' || !exp) {
    return <AppBootSplash />;
  }
  const withImage = VARIANT_HAS_IMAGE[exp.variant];

  return (
    <div ref={rootRef} className="h-svh overflow-hidden overscroll-none touch-pan-x touch-pan-y bg-white flex flex-col md:h-auto md:min-h-dvh md:overflow-visible md:touch-auto">

      {/* Cabeçalho: a marca "Petmol 🐾" (mesma identidade do app) bem visível; sem nada que roube espaço */}
      <header
        className="flex shrink-0 items-center justify-between bg-blue-50 px-5 pb-1"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <span className="flex items-center text-[38px] font-black leading-none tracking-tight text-[#0056D2]" aria-label="Petmol">
          Petmol<span className="ml-1.5 text-[34px]" aria-hidden="true">🐾</span>
        </span>
        <Link href="/login" className="px-2 py-1.5 text-[13px] font-bold text-[#0056D2]/80 active:opacity-60">
          Já tenho conta
        </Link>
      </header>

      {/* Hero — no celular é a página inteira, parada: Home do app + botão + selos, sem rolagem */}
      <section className="flex flex-1 flex-col items-center justify-evenly bg-gradient-to-b from-blue-50 to-white px-5 pb-2 text-center md:flex-none md:justify-start md:pb-3 md:pt-1">
        <h1 className="hidden text-[26px] font-black text-slate-900 leading-[1.12] tracking-tight text-balance md:block">
          {copy.title.map((line, i) => (<span key={i}>{i > 0 && <br />}{line}</span>))}
        </h1>
        {/* Só no celular: o que o PETMOL faz, em texto normal acima do telefone */}
        {withImage ? (
          <>
            {/* Só no celular: o que o PETMOL faz, em texto normal acima do telefone */}
            <p className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-800 md:hidden">Cuidamos do seu pet.</p>
            <div className="md:mt-3"><HeroPhones /></div>
          </>
        ) : (
          /* Versão B do teste: SEM imagem do app — texto primeiro (só no celular; o desktop segue com o título e as seções) */
          <div className="flex w-full max-w-xs flex-col items-center gap-4 md:hidden">
            <p className="text-[36px] font-black leading-[1.03] tracking-tight text-slate-900">Cuidamos<br />do seu pet.</p>
            <ul className="w-full space-y-2.5 text-left">
              {[
                ['🩺', 'Vacinas e remédios com aviso antes do prazo'],
                ['🍽️', 'Avisa antes da ração acabar'],
                ['🚨', 'Pet Sumido: alerta para quem está por perto'],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-3.5 py-3 text-[15px] font-bold leading-snug text-slate-800 shadow-sm">
                  <span className="text-2xl" aria-hidden="true">{icon}</span>{text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mx-auto w-full max-w-sm pt-6 md:mt-3 md:pt-0">
          <DownloadCta placement="hero-botao" targetId="lojas-hero" />
          <div className="mt-2.5"><DownloadButton placement="hero" compact /></div>
          <p className="mt-2 text-[13px] font-semibold text-slate-700 md:text-xs md:text-slate-400">
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[12px] font-black uppercase tracking-wide text-emerald-800 md:bg-transparent md:p-0 md:text-xs md:font-semibold md:normal-case md:tracking-normal md:text-slate-400">Grátis</span>
            {' '}· sem anúncios · leva menos de 1 minuto
          </p>
        </div>
        <p className="text-[12px] font-medium text-slate-600 md:hidden">
          <Link href="/legal/privacy" className="underline underline-offset-2">Privacidade</Link> · <Link href="/legal/terms" className="underline underline-offset-2">Termos de Uso</Link>
        </p>
      </section>

      {/* Do subtítulo ao rodapé: só no desktop/tablet. No celular a página é uma tela única e fixa. */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
      <p className="px-6 pt-4 pb-6 text-center text-base text-slate-500 leading-relaxed font-medium max-w-sm mx-auto">
        {copy.subtitle}
      </p>

      {/* O app por dentro */}
      {withImage && <AppPreview />}

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
      {introOpen && <LandingIntro preview={intro.preview} onDone={() => setIntroDone(true)} />}
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
