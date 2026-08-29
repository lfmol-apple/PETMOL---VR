'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PETZ_COUPON_CODE, PETZ_PARTNER_STORE_URL } from '@/features/commerce/homeShoppingPartners';
import { copyText } from '@/lib/clipboard';

// Ponte "Ver na Petz".
//
// Duas coisas resolvidas aqui:
//
// 1. Interceptação pelo app da Petz (Universal Link / App Link): o SO só
//    entrega o link ao app num TOQUE de <a>, nunca num redirect por
//    JavaScript. Esta página (petmol.com.br, sem associação universal)
//    navega pra Petz via location.replace / botão com onClick — nunca
//    <a href> — então o app não intercepta.
//
// 2. Monetização: a comissão do Parceiro Petz só é garantida quando o
//    cliente ENTRA pela Loja Parceira (petz.com.br/parceiro/pettmol) —
//    aí o desconto de 10% já vem aplicado e a venda é atribuída. Por
//    isso a ponte SEMPRE leva pra /parceiro/pettmol (não pra página
//    solta do produto), mostrando o nome do produto pro cliente
//    procurar dentro da loja. O cupom PETTMOL vai pro clipboard só como
//    reserva (aplicação manual no carrinho, se o automático falhar).

const AUTO_REDIRECT_MS = 4000;
const TARGET = PETZ_PARTNER_STORE_URL;

function PetzBridge() {
  const params = useSearchParams();
  const productName = (params?.get('q') ?? '').trim();
  const [redirecting, setRedirecting] = useState(false);

  const go = () => {
    if (redirecting) return;
    setRedirecting(true);
    if (typeof window !== 'undefined') window.location.replace(TARGET);
  };

  const copyAndGo = () => {
    void copyText(PETZ_COUPON_CODE);
    go();
  };

  useEffect(() => {
    void copyText(PETZ_COUPON_CODE);
    const t = window.setTimeout(go, AUTO_REDIRECT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          Abrindo sua loja Petz
        </p>
        <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
          O desconto de <strong>10%</strong> já vem aplicado por entrar pela loja parceira.
        </p>

        {productName && (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px',
              background: '#fff',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b' }}>
              PROCURE POR
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {productName}
            </div>
          </div>
        )}

        <div
          style={{
            fontSize: 12,
            color: '#64748b',
            background: '#eff6ff',
            border: '1px dashed #bfdbfe',
            borderRadius: 10,
            padding: '8px 10px',
            marginBottom: 14,
          }}
        >
          Se o desconto não aparecer, use o cupom <strong>{PETZ_COUPON_CODE}</strong> no carrinho (já copiado).
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
          Abrir minha loja Petz
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
