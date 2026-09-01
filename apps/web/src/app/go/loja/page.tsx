'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Ponte genérica de loja afiliada — hoje só a Cobasi/MAIS (ver
// homeShoppingPartners.cobasiBridgeUrl). Usada só no Android nativo.
//
// Objetivo: o Chrome Custom Tab que o @capacitor/browser abre PODE saltar
// pro app da Cobasi (assetlinks.json reivindica /*), e a compra lá dentro
// não carrega o cookie da UTM MAIS → comissão perdida. Esta página fica em
// petmol.com.br e navega pra Cobasi por JS (location.replace): uma
// navegação-redirect dentro de um browsing context não é elegível a App
// Link no Chrome, então o Custom Tab NÃO salta — o tutor termina a compra
// no navegador, onde a atribuição vale.

const ALLOWED_HOSTS = ['www.cobasi.com.br', 'cobasi.com.br', 'minhaloja.cobasi.com.br', 'mais.app'];
const AUTO_REDIRECT_MS = 350;

function safeTarget(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function LojaBridge() {
  const params = useSearchParams();
  const target = safeTarget((params?.get('to') ?? '').trim());
  const [redirecting, setRedirecting] = useState(false);
  const wentRef = useRef(false);

  const go = () => {
    if (wentRef.current || !target) return;
    wentRef.current = true;
    setRedirecting(true);
    if (typeof window !== 'undefined') window.location.replace(target);
  };

  useEffect(() => {
    if (!target) return;
    const t = window.setTimeout(go, AUTO_REDIRECT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
        {target ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Abrindo a loja…
            </p>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 18px' }}>
              {redirecting ? 'Só um instante.' : 'Abre automaticamente.'}
            </p>
            <button
              type="button"
              onClick={go}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 12,
                border: 'none',
                background: '#1d4ed8',
                color: '#fff',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Abrir agora
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Link inválido
            </p>
            <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
              Volte ao PETMOL e tente de novo.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function GoLojaBridgePage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100dvh' }} />}>
      <LojaBridge />
    </Suspense>
  );
}
