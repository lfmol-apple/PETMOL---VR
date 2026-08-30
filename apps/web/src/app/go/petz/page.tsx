'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
// Dois objetivos:
// 1. Evitar que o app da Petz intercepte o link (iOS Universal Link):
//    esta página fica em petmol.com.br (sem AASA) e navega pra Petz por
//    JS (location.replace) pra um path FORA da AASA da Petz
//    (`/busca`, `/parceiro/*` — nunca `/`, `/produto/*`, `/colecao/*`).
// 2. Entregar o cupom PETTMOL: no app (WKWebView) `navigator.clipboard`
//    é instável, mas AQUI a página roda no SFSafariViewController /
//    navegador do sistema, onde `copyText` funciona SOB GESTO. Por isso
//    o cupom é o herói da tela, com botão de copiar, e o "Ir pra a
//    Petz" copia antes de redirecionar.

const AUTO_REDIRECT_MS = 8000;

function PetzBridge() {
  const params = useSearchParams();
  const productName = (params?.get('q') ?? '').trim();
  const rawTo = (params?.get('to') ?? '').trim();
  const target =
    rawTo && isRealPetzUrl(rawTo) && !isPetzAppClaimedUrl(rawTo) ? rawTo : PETZ_PARTNER_STORE_URL;
  const goesToSearch = target.includes('/busca');

  const [copied, setCopied] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const wentRef = useRef(false);

  const doCopy = async () => {
    const ok = await copyText(PETZ_COUPON_CODE).catch(() => false);
    if (ok) setCopied(true);
    return ok;
  };

  const go = () => {
    if (wentRef.current) return;
    wentRef.current = true;
    setRedirecting(true);
    if (typeof window !== 'undefined') window.location.replace(target);
  };

  useEffect(() => {
    // 1ª tentativa (pode falhar sem gesto — o botão é o caminho confiável).
    void doCopy();
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
          Use o cupom <strong>{PETZ_COUPON_CODE}</strong> na Petz
        </p>
        <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
          Cole no carrinho pra <strong>10% de desconto</strong>.
        </p>

        <button
          type="button"
          onClick={() => void doCopy()}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            border: `2px dashed ${copied ? '#16a34a' : '#cbd5e1'}`,
            borderRadius: 12,
            padding: '14px 16px',
            background: '#fff',
            marginBottom: 12,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 2,
              color: '#0f172a',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}
          >
            {PETZ_COUPON_CODE}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: copied ? '#16a34a' : '#1d4ed8' }}>
            {copied ? 'Copiado ✓' : 'Copiar'}
          </span>
        </button>

        {goesToSearch && (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '10px 12px',
              background: '#fff',
              marginBottom: 14,
              textAlign: 'left',
            }}
          >
            {productName && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#64748b' }}>
                  PROCURANDO NA PETZ
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '2px 0 8px' }}>
                  {productName}
                </div>
              </>
            )}
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
              Na lista da Petz, toque no <strong>➕</strong> do produto pra adicionar ao
              carrinho. Tocar na foto abre o app da Petz.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            void doCopy().finally(go);
          }}
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
          Ir pra a Petz
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
