'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PETZ_PARTNER_STORE_URL,
  PETZ_COUPON_CODE,
  isRealPetzUrl,
} from '@/features/commerce/homeShoppingPartners';
import { copyText } from '@/lib/clipboard';

// Ponte "Ver na Petz".
//
// Único objetivo: evitar que o app da Petz instalado intercepte o link
// (iOS Universal Link / Android App Link). O SO só entrega o link ao app
// num TOQUE de <a>, nunca num redirect por JavaScript. Esta página fica
// em petmol.com.br (sem associação universal) e navega pra Petz via
// location.replace / botão com onClick — nunca <a href>.
//
// `to` = destino final na Petz (página do produto, ou busca com o termo).
//        Validado como URL real de petz.com.br — sem open-redirect.
// `q`  = nome do produto (só exibição).
//
// O cupom PETTMOL é copiado pro clipboard (garante os 10% + a comissão do
// Parceiro Petz quando o cliente cola no carrinho — ver docs/AFFILIATES.md).

const AUTO_REDIRECT_MS = 2500;

function PetzBridge() {
  const params = useSearchParams();
  const productName = (params?.get('q') ?? '').trim();
  const rawTo = (params?.get('to') ?? '').trim();
  const target = rawTo && isRealPetzUrl(rawTo) ? rawTo : PETZ_PARTNER_STORE_URL;
  const goesToProduct = target.includes('/produto/');
  const goesToSearch = target.includes('/busca');

  const [redirecting, setRedirecting] = useState(false);

  const go = () => {
    if (redirecting) return;
    setRedirecting(true);
    if (typeof window !== 'undefined') window.location.replace(target);
  };

  useEffect(() => {
    void copyText(PETZ_COUPON_CODE);
    const t = window.setTimeout(go, AUTO_REDIRECT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const heading = goesToProduct
    ? 'Abrindo o produto na Petz'
    : goesToSearch
      ? 'Abrindo a busca na Petz'
      : 'Abrindo sua loja Petz';

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
        <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
          {heading}
        </p>
        <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
          Cupom <strong>{PETZ_COUPON_CODE}</strong> copiado — cole no carrinho da Petz pra
          <strong> 10% de desconto</strong>.
        </p>

        {productName && goesToSearch && (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px',
              background: '#fff',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b' }}>
              RESULTADO PARA
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {productName}
            </div>
          </div>
        )}

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
          {goesToProduct ? 'Abrir o produto na Petz' : 'Abrir a Petz'}
        </button>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '12px 0 0' }}>
          {redirecting ? 'Abrindo…' : 'Abre automaticamente em instantes…'}
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
