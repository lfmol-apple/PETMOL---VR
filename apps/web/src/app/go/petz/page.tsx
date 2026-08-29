'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { isRealPetzUrl, PETZ_COUPON_CODE, PETZ_PARTNER_STORE_URL } from '@/features/commerce/homeShoppingPartners';

// Ponte "Ver na Petz" — ver petzBridgeUrl() em
// features/commerce/homeShoppingPartners.ts para a causa raiz.
//
// Esta página existe só para NÃO deixar o iOS/Android entregar o link ao
// app da Petz instalado (Universal Link / App Link). O SO só dispara isso
// num TOQUE de <a>, nunca num redirect por JavaScript. Então: carrega
// petmol.com.br/go/petz (sem associação universal), copia o cupom (best-
// effort — o app já copiou no toque) e faz location.replace() para a URL
// REAL da Petz. O botão manual também navega por JS (não é um <a href>),
// pelo mesmo motivo.

const REDIRECT_DELAY_MS = 700;

function safePetzUrl(raw: string | null): string {
  return raw && isRealPetzUrl(raw) ? raw : PETZ_PARTNER_STORE_URL;
}

function PetzBridge() {
  const params = useSearchParams();
  const target = safePetzUrl(params?.get('to') ?? null);

  const goNow = () => {
    if (typeof window !== 'undefined') window.location.replace(target);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(PETZ_COUPON_CODE);
        }
      } catch {
        // best-effort — o clique no app já copiou o cupom
      }
      if (cancelled) return;
    })();

    const timer = window.setTimeout(goNow, REDIRECT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🐾</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
          Cupom <span style={{ color: '#1d4ed8' }}>PETTMOL</span> copiado
        </p>
        <p style={{ fontSize: 13, color: '#475569', margin: '0 0 18px' }}>
          Cole no carrinho da Petz antes de finalizar para 10% de desconto.
        </p>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>Abrindo a Petz…</p>
        <button
          type="button"
          onClick={goNow}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            border: 'none',
            background: '#1d4ed8',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Abrir a Petz agora
        </button>
      </div>
    </main>
  );
}

export default function GoPetzBridgePage() {
  return (
    <Suspense fallback={null}>
      <PetzBridge />
    </Suspense>
  );
}
