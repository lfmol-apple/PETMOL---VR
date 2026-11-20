/**
 * Home pública (www.petmol.com.br) — versão oficial, sem alternância (dono, 27/09/2026: "vamos parar
 * com este teste A/B. Criar a home oficial assim").
 *
 * Substitui de vez o teste A/B (imagem × sem imagem, `landing_imagem_2026_09`) e a introdução em vídeo
 * comercial: as duas eram só desta página, e nenhuma das duas roda mais aqui. Critério: mostrar a
 * utilidade do PETMOL (o que ele faz de verdade, com telas reais) antes da aparência — cinco blocos de
 * funcionalidade confirmadas no código (Alimentação, Vacinas, Pet Sumido, Loja do Pet, Perfil), cada um
 * com a captura oficial da própria App Store. Nada de telefone gigante isolado, nada de "grátis" como
 * argumento principal, nada de vídeo obrigatório.
 *
 * Quem clica em "Baixar" no anúncio do Instagram nunca passa por aqui — vai direto pra loja por
 * /go/instalar (ver aquela rota). Esta Home é só para quem chega espontaneamente ao domínio.
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { DownloadButton, DownloadCta } from '@/components/landing/DownloadButton';
import { LandingGate } from '@/components/landing/LandingGate';
import { AmazonFooterLink } from '@/components/landing/AmazonFooterLink';
import { SocialLinks } from '@/components/landing/SocialLinks';
import { SiteJsonLd } from '@/components/SiteJsonLd';

// SEO: esta página é renderizada NO SERVIDOR — o HTML inicial já traz o título, o texto e as imagens (antes vinha só uma
// tela de carregamento, e o Google via uma página praticamente vazia). Redirecionar quem já está logado (ou no app) é feito
// por <LandingGate/>, só no cliente; o app nativo nem chega aqui (o middleware o manda para /home).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

interface Feature {
  tag: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  img: string;
  alt: string;
}

/** As cinco funcionalidades confirmadas no código do app publicado — nada planejado, nada "Em breve". */
const FEATURES: Feature[] = [
  {
    tag: 'Alimentação', icon: '🍽️', color: '#F59E0B',
    title: 'Avisa antes da ração acabar',
    body: 'Você registra o pacote. O PETMOL acompanha o consumo, mostra quantos dias restam e deixa "Comprar novamente" sempre à mão.',
    img: '/landing/app-alimentacao.webp', alt: 'Tela de Alimentação com os dias restantes de ração',
  },
  {
    tag: 'Vacinas', icon: '💉', color: '#7C3AED',
    title: 'Vacinas com data e lembrete',
    body: 'Registro rápido ou completo, histórico de tudo o que já foi aplicado e lembrete antes do prazo — sem duplicar.',
    img: '/landing/app-vacinas.webp', alt: 'Tela de Vacinas com o histórico e as próximas doses',
  },
  {
    tag: 'Pet Sumido', icon: '🚨', color: '#DC2626',
    title: 'Se sumir, a região é avisada na hora',
    body: 'Um toque gera um alerta com card pra Instagram e WhatsApp e um aviso push pra quem está na região — a comunidade PETMOL ajuda a procurar.',
    img: '/landing/app-pet-sumido.webp', alt: 'Tela do alerta Pet Sumido',
  },
  {
    tag: 'Loja do Pet', icon: '🛒', color: '#0EA5E9',
    title: 'Compare ofertas do que seu pet já usa',
    body: 'Ração, antipulgas e mais, com preços de lojas parceiras lado a lado — pra você comparar antes de repor, sem sair procurando do zero.',
    img: '/landing/app-loja.webp', alt: 'Tela da Loja do Pet com as ofertas',
  },
  {
    tag: 'Perfil', icon: '🐾', color: '#0056D2',
    title: 'As informações do seu pet, organizadas',
    body: 'Espécie, raça, idade e peso num lugar só — a base que todo o resto do PETMOL usa pra te avisar na hora certa.',
    img: '/landing/app-home.webp', alt: 'Perfil do pet na tela inicial do PETMOL',
  },
];

export default function LandingPage() {
  return (
    <div className="landing-root min-h-dvh bg-white">
      <SiteJsonLd />
      <LandingGate />
      {/* Cabeçalho: a marca "Petmol 🐾" (mesma identidade do app) */}
      <header
        className="flex items-center justify-between bg-blue-50 px-5 pb-3"
        style={{ paddingTop: 'calc(0.9rem + env(safe-area-inset-top))' }}
      >
        <span className="flex items-center text-[32px] font-black leading-none tracking-tight text-[#0056D2]" aria-label="Petmol">
          Petmol<span className="ml-1.5 text-[28px]" aria-hidden="true">🐾</span>
        </span>
        <Link href="/login" className="px-2 py-1.5 text-[13px] font-bold text-[#0056D2]/80 active:opacity-60">
          Já tenho conta
        </Link>
      </header>

      {/* Hero — 1ª dobra: marca, benefício, os 4 principais reconhecíveis, CTA e as duas lojas */}
      <section className="bg-gradient-to-b from-blue-50 to-white px-5 pb-8 pt-6 text-center">
        <h1 className="mx-auto max-w-sm text-balance text-[27px] font-black leading-[1.18] tracking-tight text-slate-900 md:text-[32px]">
          Seu pet tem uma rotina.<br />O PETMOL ajuda você a cuidar dela.
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-[15px] font-medium leading-snug text-slate-600 md:max-w-sm">
          Alimentação, vacinas, alertas de pets desaparecidos e muito mais em um só lugar.
        </p>

        <ul className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-2.5 md:max-w-md">
          {FEATURES.slice(0, 4).map((f) => (
            <li key={f.tag} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm">
              <span className="text-xl" aria-hidden="true">{f.icon}</span>
              <span className="text-[13px] font-bold leading-tight text-slate-800">{f.tag}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-6 w-full max-w-sm">
          <DownloadCta placement="hero-botao" targetId="lojas-hero" label="Baixar o PETMOL" />
          <div className="mt-2.5"><DownloadButton placement="hero" compact /></div>
          <p className="mt-2 text-[12px] font-medium text-slate-500">Para iPhone e Android</p>
        </div>
      </section>

      {/* As 5 funcionalidades — cada uma com a captura oficial da própria App Store, alternando o lado */}
      <div className="mx-auto max-w-3xl px-5 py-6 md:py-10">
        {FEATURES.map((f, i) => (
          <section
            key={f.tag}
            className={`flex flex-col items-center gap-6 py-8 md:flex-row md:items-start md:gap-12 md:py-12 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''} ${i > 0 ? 'border-t border-slate-100' : ''}`}
          >
            <div className="flex-1 text-center md:text-left">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black uppercase tracking-wide"
                style={{ backgroundColor: `${f.color}1A`, color: f.color }}
              >
                <span aria-hidden="true">{f.icon}</span>{f.tag}
              </span>
              <h2 className="mt-3 text-[22px] font-black leading-tight tracking-tight text-slate-900 md:text-[26px]">
                {f.title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-slate-600 md:mx-0">
                {f.body}
              </p>
            </div>
            <div className="shrink-0">
              <Image
                src={f.img} alt={f.alt} width={480} height={1039} priority={i === 0}
                className="h-auto w-[220px] rounded-[22px] shadow-xl ring-1 ring-slate-900/5 md:w-[250px]"
              />
            </div>
          </section>
        ))}
      </div>

      {/* CTA de fechamento */}
      <section className="flex flex-col items-center gap-3 border-t border-slate-100 bg-slate-50 px-5 py-12 text-center">
        <h2 className="text-2xl font-black text-slate-900">Baixe o PETMOL e comece agora.</h2>
        <p className="text-sm font-medium text-slate-500">Adicione o seu pet em menos de 1 minuto.</p>
        <div className="mt-3 w-full max-w-xs" id="lojas-final">
          <DownloadCta placement="final-botao" targetId="lojas-final" label="Baixar o PETMOL" />
          <div className="mt-2.5"><DownloadButton placement="final" withWebLink compact /></div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-5 py-5 text-center">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <AmazonFooterLink />
          <Link href="/sobre" className="hover:text-slate-600">Sobre</Link>
          <Link href="/politica-editorial" className="hover:text-slate-600">Política editorial</Link>
          <Link href="/transparencia" className="hover:text-slate-600">Transparência</Link>
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacidade</Link>
          <Link href="/legal/terms" className="hover:text-slate-600">Termos de Uso</Link>
          <SocialLinks placement="home-rodape" className="hover:text-slate-600" />
        </div>
        <p className="mt-2 text-xs text-slate-400">© 2026 PETMOL</p>
      </footer>
    </div>
  );
}
