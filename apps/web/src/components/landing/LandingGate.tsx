'use client';

/**
 * Parte "só no cliente" da home pública: quem já está logado (ou dentro do app) é levado para /home, e a visita de quem
 * chega pela web é registrada. A página em si é renderizada no servidor (ver app/page.tsx) para que os mecanismos de
 * busca recebam o conteúdo; enquanto o redirecionamento acontece, a tela de abertura cobre a landing para ela não piscar.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { AppBootSplash } from '@/components/AppBootSplash';
import { isNativeAppClient } from '@/lib/nativeApp';
import { trackLandingEvent } from '@/lib/landingEvents';
import type { VariantInfo } from '@/lib/landingExperiment';

// Evento de visita sem passar pelo teste A/B: nenhuma variante é sorteada nem gravada.
const NO_EXPERIMENT: VariantInfo = { variant: 'A', preview: false, persisted: false };

export function LandingGate() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const viewSent = useRef(false);

  useEffect(() => {
    if (isNativeAppClient() || getToken()) {
      setRedirecting(true);
      router.replace('/home');
      return;
    }
    if (!viewSent.current) {
      viewSent.current = true;
      trackLandingEvent('landing_view', {}, NO_EXPERIMENT);
    }
  }, [router]);

  return redirecting ? <AppBootSplash /> : null;
}
