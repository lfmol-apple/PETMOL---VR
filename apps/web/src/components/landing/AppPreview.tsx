'use client';

import { DownloadButton } from '@/components/landing/DownloadButton';

/** Capturas oficiais da App Store (as mesmas da ficha do app), em WebP leve. */
const SCREENS = [
  { src: '/landing/app-home.webp', alt: 'Tela inicial do PETMOL com os cuidados do pet', title: 'Tudo do seu pet numa tela', body: 'Alimentação, cuidados, vacinas e loja a um toque.' },
  { src: '/landing/app-alimentacao.webp', alt: 'Tela de alimentação mostrando quantos dias de ração restam', title: 'Quantos dias de ração ainda faltam', body: 'O PETMOL avisa antes de acabar.' },
  { src: '/landing/app-vacinas.webp', alt: 'Tela de vacinas com as próximas doses', title: 'Vacinas com data e lembrete', body: 'Você não precisa lembrar — ele avisa antes do prazo.' },
  { src: '/landing/app-pet-sumido.webp', alt: 'Tela do alerta Pet Sumido', title: 'Se sumir, alerte quem está perto', body: 'Alerta geolocalizado para a região, na hora.' },
  { src: '/landing/app-loja.webp', alt: 'Tela da loja com os produtos que o pet já usa', title: 'Reponha o que seu pet já usa', body: 'Ração e antipulgas, sem procurar de novo.' },
] as const;

const W = 480;
const H = Math.round((W * 2778) / 1284);

/** "Veja por dentro": o visitante que veio do anúncio vê o app antes de decidir baixar. */
export function AppPreview() {
  return (
    <section aria-labelledby="app-preview-title" className="pb-10 bg-white pt-2">
      <h2 id="app-preview-title" className="sr-only">É assim que o PETMOL cuida do seu pet</h2>
      <p className="px-5 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Telas reais do app · deslize</p>

      <ul
        className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1.25rem,calc(50vw-118px))] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Telas do aplicativo"
      >
        {SCREENS.map((s, i) => (
          <li key={s.src} className="w-[236px] shrink-0 snap-center">
            <div className="overflow-hidden rounded-[2rem] border-[5px] border-slate-900 bg-slate-900 shadow-xl shadow-blue-900/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.src}
                alt={s.alt}
                width={W}
                height={H}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="block h-auto w-full rounded-[1.6rem]"
              />
            </div>
            <p className="mt-3 text-center text-[15px] font-black leading-snug text-slate-900">{s.title}</p>
            <p className="mt-0.5 text-center text-[13px] leading-snug text-slate-500">{s.body}</p>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-6 w-full max-w-xs px-5">
        <DownloadButton placement="telas" />
        <p className="mt-2 text-center text-xs font-semibold text-slate-400">Grátis · sem anúncios</p>
      </div>
    </section>
  );
}
