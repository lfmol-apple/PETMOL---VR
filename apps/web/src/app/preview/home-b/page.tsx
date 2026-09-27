'use client';

/**
 * ENTREGA B (prévia) — Home institucional simplificada, para quem chega espontaneamente ao domínio
 * (busca, link compartilhado, digitação direta). NÃO é a Home publicada (/): aquela está sob o teste
 * A/B em andamento (imagem × sem imagem) e só muda quando o dono mandar parar o teste.
 *
 * Direção (dono, 27/09/2026): sem telefone gigante como protagonista, sem "grátis" no argumento
 * principal, sem vídeo obrigatório, identidade visual em destaque, as DUAS lojas sempre visíveis
 * (não só a detectada pelo aparelho), benefício concreto na 1ª dobra, demonstração real abaixo.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appStoreUrl, googlePlayUrl, type CampaignParams } from '@/lib/landingLinks';
import { detectStorePlatform, type StorePlatform } from '@/lib/appStores';
import { DownloadButton } from '@/components/landing/DownloadButton';
import { AppPreview } from '@/components/landing/AppPreview';
import { trackDownloadClick } from '@/lib/landingEvents';

function useSafePlatform(): StorePlatform | null {
  // Mesmo cuidado do /go/instalar: calcular direto no render descasa o servidor do cliente.
  const [platform, setPlatform] = useState<StorePlatform | null>(null);
  useEffect(() => {
    setPlatform(detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || ''));
  }, []);
  return platform;
}

function MainCta({ placement }: { placement: string }) {
  const platform = useSafePlatform();
  const campaign: CampaignParams = {};
  const href = platform === 'android' ? googlePlayUrl(placement, campaign) : appStoreUrl(placement, campaign);
  const onClick = () => trackDownloadClick({ button: 'cta', placement, store: platform === 'android' ? 'google' : platform === 'ios' ? 'apple' : 'auto' });
  return (
    <a href={platform ? href : '#lojas-home-b'} onClick={onClick}
      className="flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-[19px] font-black tracking-tight text-[#0056D2] shadow-xl active:scale-[0.98]">
      Baixar o PETMOL
    </a>
  );
}

export default function HomeBPreview() {
  return (
    <div className="min-h-dvh bg-white">
      {/* Faixa de marca — identidade em destaque (a mesma paleta e patinha do app, sem telefone) */}
      <header className="relative overflow-hidden bg-gradient-to-b from-[#0056D2] to-[#0041a3] px-5 pb-10 pt-8 text-center text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-[120px] leading-none opacity-10 select-none">
          🐾 🐾 🐾 🐾
        </div>
        <span className="relative flex items-center justify-center gap-2 text-[40px] font-black leading-none tracking-tight">
          Petmol<span aria-hidden="true">🐾</span>
        </span>
        <h1 className="relative mx-auto mt-5 max-w-xs text-[26px] font-black leading-[1.15] tracking-tight text-balance">
          A rotina do seu pet, mais organizada. A sua, mais tranquila.
        </h1>
        <p className="relative mx-auto mt-2 max-w-xs text-[15px] font-medium leading-snug text-blue-100">
          Alimentação, vacinas e cuidados importantes reunidos em um só lugar.
        </p>
        <div id="lojas-home-b" className="relative mx-auto mt-6 flex max-w-sm flex-col items-center gap-3">
          <MainCta placement="home-b-hero" />
          <DownloadButton placement="home-b" compact />
          <p className="text-[12px] font-medium text-blue-100">Grátis · para iPhone e Android</p>
        </div>
      </header>

      {/* Demonstração real — capturas oficiais, não mockup */}
      <section className="px-5 py-10">
        <h2 className="text-center text-lg font-black text-slate-900">Veja como o PETMOL ajuda você.</h2>
        <div className="mt-4"><AppPreview /></div>
      </section>

      {/* CTA de fechamento */}
      <section className="flex flex-col items-center gap-3 px-5 pb-12 text-center">
        <MainCta placement="home-b-final" />
        <Link href="/login" className="text-sm font-semibold text-slate-400">Já tenho conta</Link>
      </section>

      <footer className="border-t border-slate-100 px-5 py-5 text-center">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <Link href="/sobre" className="hover:text-slate-600">Sobre</Link>
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacidade</Link>
          <Link href="/legal/terms" className="hover:text-slate-600">Termos de Uso</Link>
        </div>
        <p className="mt-2 text-xs text-slate-400">© 2026 PETMOL</p>
      </footer>
    </div>
  );
}
