'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isRealPetzUrl, PETZ_COUPON_CODE, PETZ_PARTNER_STORE_URL } from '@/features/commerce/homeShoppingPartners';
import { copyText } from '@/lib/clipboard';

// Ponte "Ver na Petz" — ver petzBridgeUrl() em
// features/commerce/homeShoppingPartners.ts para a causa raiz (o app da
// Petz interceptava o link via Universal Link / App Link).
//
// Esta página NÃO deixa o iOS/Android entregarem o link ao app da Petz:
// o SO só dispara isso num TOQUE de <a>, nunca num redirect por
// JavaScript. Aqui carrega petmol.com.br/go/petz (sem associação
// universal), deixa o cupom PETTMOL em destaque + no clipboard, e navega
// pra URL REAL da Petz por JS (location.replace / botão com onClick,
// nunca <a href>).
//
// LIMITE: a Petz não expõe forma de PRÉ-APLICAR o cupom por URL — o
// tutor cola PETTMOL no carrinho. Esta tela existe pra garantir que ele
// tenha o cupom em mãos antes de ir.

const AUTO_REDIRECT_MS = 3500;

function safePetzUrl(raw: string | null): string {
  return raw && isRealPetzUrl(raw) ? raw : PETZ_PARTNER_STORE_URL;
}

function PetzBridge() {
  const params = useSearchParams();
  const target = safePetzUrl(params?.get('to') ?? null);
  const [copied, setCopied] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const go = () => {
    if (redirecting) return;
    setRedirecting(true);
    // redirect por JS (não é toque de link) → o app da Petz não intercepta
    if (typeof window !== 'undefined') window.location.replace(target);
  };

  const copyAndGo = () => {
    void copyText(PETZ_COUPON_CODE).then((ok) => setCopied(ok || true));
    go();
  };

  useEffect(() => {
    let cancelled = false;
    void copyText(PETZ_COUPON_CODE).then((ok) => {
      if (!cancelled && ok) setCopied(true);
    });
    const t = window.setTimeout(go, AUTO_REDIRECT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
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
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🐾</div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
          Use o cupom na Petz para 10% de desconto
        </p>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Cole o código no carrinho antes de finalizar a compra.
        </p>

        <div
          style={{
            border: '2px dashed #1d4ed8',
            borderRadius: 14,
            padding: '14px 12px',
            background: '#eff6ff',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#1e40af' }}>
            CUPOM {copied ? '· copiado ✓' : ''}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#1d4ed8', letterSpacing: 2 }}>
            {PETZ_COUPON_CODE}
          </div>
        </div>

        <button
          type="button"
          onClick={copyAndGo}
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
          Copiar cupom e abrir a Petz
        </button>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '12px 0 0' }}>
          {redirecting ? 'Abrindo a Petz…' : 'Abre automaticamente em instantes…'}
        </p>
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
