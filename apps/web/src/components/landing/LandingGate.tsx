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

/**
 * Roda no HTML, antes do primeiro quadro: se há token (mesmas chaves do auth-token.ts: sessionStorage/localStorage
 * `petmol_token` ou cookie `petmol_auth`), marca <html> e a regra abaixo esconde a landing — quem já está logado não vê
 * a página pública piscar antes do redirecionamento. O mesmo vale para o app nativo (UA com `PetmolApp`), que o middleware já desvia de `/` no servidor. Visitante sem token e robôs de busca veem tudo normalmente.
 */
const EARLY_CHECK = `(function(){try{var d=document,t=null;try{t=sessionStorage.getItem('petmol_token')||localStorage.getItem('petmol_token')}catch(e){}if(!t&&/(?:^|;\\s*)petmol_auth=/.test(d.cookie))t='c';if(!t&&/PetmolApp/.test(navigator.userAgent))t='n';if(t)d.documentElement.setAttribute('data-landing-gate','1')}catch(e){}})();`;
const HIDE_CSS = 'html[data-landing-gate] .landing-root{visibility:hidden}';

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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: EARLY_CHECK }} />
      {redirecting ? <AppBootSplash /> : null}
    </>
  );
}
