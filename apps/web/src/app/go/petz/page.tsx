'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PETZ_PARTNER_STORE_URL,
  PETZ_COUPON_CODE,
  isRealPetzUrl,
  isPetzAppClaimedUrl,
} from '@/features/commerce/homeShoppingPartners';
import { copyText } from '@/lib/clipboard';

// Ponte "Ver na Petz".
//
// Objetivo: evitar que o app da Petz instalado intercepte o link (iOS
// Universal Link / Android App Link). Esta página fica em petmol.com.br
// (sem AASA) e navega pra Petz via location.replace / botão onClick —
// nunca <a href>.
//
// O `to` SÓ é aceito se for petz.com.br real E fora da AASA da Petz
// (`/`, `/produto/*`, `/colecao/*`, `/minhas-assinaturas/*` são
// reivindicados pelo app → o iOS entrega ao app mesmo num redirect JS,
// cai na tela "DETALHES" quebrada). Destinos válidos: `/busca?q=...` e
// `/parceiro/pettmol`. Qualquer outra coisa → Loja Parceira.
//
// `q`  = nome do produto (só exibição).
// Cupom PETTMOL copiado pro clipboard (10% + comissão ao colar no carrinho).

const AUTO_REDIRECT_MS = 2500;

function PetzBridge() {
  const params = useSearchParams();
  const productName = (params?.get('q') ?? '').trim();
  const rawTo = (params?.get('to') ?? '').trim();
  const target =
    rawTo && isRealPetzUrl(rawTo) && !isPetzAppClaimedUrl(rawTo) ? rawTo : PETZ_PARTNER_STORE_URL;
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
          {goesToSearch ? 'Abrindo a busca na Petz' : 'Abrindo sua loja Petz'}
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
          Abrir a Petz
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
