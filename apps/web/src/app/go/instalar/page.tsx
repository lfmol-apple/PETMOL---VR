'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { appStoreUrl, googlePlayUrl, type CampaignParams } from '@/lib/landingLinks';
import { detectStorePlatform, type StorePlatform } from '@/lib/appStores';
import { trackDownloadClick } from '@/lib/landingEvents';

/**
 * Encaminhamento direto pra loja — para quem já tocou em "Baixar" no anúncio (Instagram/Meta) e não
 * precisa ver a Home institucional de novo. Critério de aceitação (dono, 27/09/2026): quem clicou no
 * anúncio, o próximo passo é a instalação — nunca uma segunda propaganda.
 *
 * Só existe aqui, em /go/instalar — a Home pública (/) continua igual para quem chega espontaneamente
 * (busca, link compartilhado, digitação direta): NUNCA redireciona sozinha pra loja.
 *
 * iOS/Android: encaminha sozinho, NA MESMA ABA (`location.replace`, nunca `target="_blank"` — a
 * auditoria de 27/09/2026 achou que aba nova é o padrão que mais falha dentro do navegador interno do
 * Instagram/Facebook; navegação na mesma aba é o que a Apple/Google reconhecem de forma confiável para
 * abrir a loja de verdade, mesmo sem um novo toque do visitante). O botão fica visível e funciona na
 * hora, caso o navegador não deixe encaminhar sozinho.
 * Desktop/indefinido: nunca encaminha sozinho (não dá pra saber a loja certa) — os dois selos, para escolher.
 * Nunca há vídeo, telefone grande ou apresentação — é só o caminho até a loja.
 */
function InstallBridge() {
  const params = useSearchParams();
  const campaign: CampaignParams = {
    utm_source: params?.get('utm_source') ?? undefined,
    utm_medium: params?.get('utm_medium') ?? undefined,
    utm_campaign: params?.get('utm_campaign') ?? undefined,
    utm_content: params?.get('utm_content') ?? undefined,
  };
  // Igual ao usePlatform() de DownloadButton.tsx: 'navigator' não existe no servidor, então a
  // detecção só pode rodar DEPOIS de montar (useEffect) — calculá-la direto no render (como a 1ª
  // versão fazia) descasa o HTML do servidor do 1º render do cliente e o React refaz a árvore do
  // zero, abortando o encaminhamento automático no meio (bug achado no teste real, 27/09/2026).
  const [platform, setPlatform] = useState<StorePlatform | null>(null);
  useEffect(() => {
    setPlatform(detectStorePlatform(navigator.userAgent || '', navigator.maxTouchPoints || 0, navigator.platform || ''));
  }, []);
  const appleHref = appStoreUrl('go-instalar', campaign);
  const googleHref = googlePlayUrl('go-instalar', campaign);
  const store = platform === 'android' ? 'google' : platform === 'ios' ? 'apple' : null;
  const autoHref = store === 'apple' ? appleHref : store === 'google' ? googleHref : null;

  useEffect(() => {
    if (platform === null) return; // ainda não detectou — não mede nem encaminha com um valor provisório
    trackDownloadClick({ button: 'badge', placement: 'go-instalar-view', store: store ?? 'auto' });
    if (!autoHref) return;
    // location.replace (mesma aba): não conta como visita nova no histórico, e é a navegação que a
    // loja reconhece de forma confiável — nunca target="_blank"/window.open aqui.
    const t = window.setTimeout(() => window.location.replace(autoHref), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const onClick = (clicked: 'apple' | 'google') => trackDownloadClick({ button: 'badge', placement: 'go-instalar', store: clicked });

  return (
    <main
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '24px', background: '#fff', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 28, fontWeight: 900, color: '#0056D2', letterSpacing: '-0.02em' }}>
        Petmol<span style={{ marginLeft: 4 }} aria-hidden="true">🐾</span>
      </span>

      {platform === 'ios' && (
        <a href={appleHref} onClick={() => onClick('apple')} aria-label="Baixar na App Store"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#0056D2', color: '#fff', fontWeight: 800, fontSize: 18, padding: '16px 28px', borderRadius: 16, textDecoration: 'none' }}>
          Baixar o PETMOL
        </a>
      )}
      {platform === 'android' && (
        <a href={googleHref} onClick={() => onClick('google')} aria-label="Disponível no Google Play"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#0056D2', color: '#fff', fontWeight: 800, fontSize: 18, padding: '16px 28px', borderRadius: 16, textDecoration: 'none' }}>
          Baixar o PETMOL
        </a>
      )}
      {platform === 'desktop' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
          <a href={appleHref} onClick={() => onClick('apple')} target="_blank" rel="noopener noreferrer" aria-label="Baixar na App Store"
            style={{ background: '#0056D2', color: '#fff', fontWeight: 800, fontSize: 16, padding: '14px 20px', borderRadius: 14, textDecoration: 'none' }}>
            App Store
          </a>
          <a href={googleHref} onClick={() => onClick('google')} target="_blank" rel="noopener noreferrer" aria-label="Disponível no Google Play"
            style={{ background: '#0056D2', color: '#fff', fontWeight: 800, fontSize: 16, padding: '14px 20px', borderRadius: 14, textDecoration: 'none' }}>
            Google Play
          </a>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Grátis · para iPhone e Android</p>
    </main>
  );
}

export default function GoInstalarPage() {
  return (
    <Suspense fallback={null}>
      <InstallBridge />
    </Suspense>
  );
}
