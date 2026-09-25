'use client';

import { useEffect, useState } from 'react';
import { readLandingContext, type LandingContext } from '@/lib/landingContext';

const EMPTY: LandingContext = { variant: 'default', iab: 'none', campaign: {}, hasFbclid: false };

/** Contexto da visita (variação do anúncio, UTM, navegador do Instagram) — lido só no cliente. */
export function useLandingContext(): LandingContext {
  const [ctx, setCtx] = useState<LandingContext>(EMPTY);
  useEffect(() => {
    try {
      setCtx(readLandingContext(window.location.search, navigator.userAgent || ''));
    } catch { /* sem contexto: mensagem padrão */ }
  }, []);
  return ctx;
}
