'use client';

import { useEffect } from 'react';

/**
 * Última linha de defesa: só dispara se o próprio RootLayout (layout.tsx)
 * quebrar — precisa desenhar <html>/<body> do zero porque substitui o layout
 * inteiro. Sem isto, um erro aqui (ex.: um provider global lançando na
 * primeira renderização) deixava a tela branca sem NENHUMA saída, nem o
 * error.tsx normal ajuda (ele roda DENTRO do layout, que já quebrou).
 * Estilo inline de propósito — não dá pra confiar que CSS/fontes carregaram
 * se chegou até aqui.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 24px', textAlign: 'center',
        }}>
          <span style={{ fontSize: 48 }} aria-hidden>🐾</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0F172A', margin: 0 }}>O PETMOL travou</h1>
            <p style={{ marginTop: 6, maxWidth: 320, fontSize: 14, color: '#64748B' }}>
              Ocorreu um erro inesperado ao abrir o app. Tentar de novo geralmente resolve.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              width: '100%', maxWidth: 320, borderRadius: 16, background: '#2563EB',
              color: '#fff', border: 'none', padding: '14px 0', fontSize: 14, fontWeight: 700,
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
