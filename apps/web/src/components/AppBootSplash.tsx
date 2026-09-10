'use client';

/**
 * AppBootSplash
 *
 * Tela azul cheia com o logo — mesma cara do splash nativo do app
 * (Splash.imageset, ~#013EA8). Serve pra cobrir o intervalo entre "app
 * abriu" e "sei se o usuário está logado" / "Home carregou", em vez de
 * piscar a landing pública ou um spinner. Continuidade visual: splash
 * nativo → este → Home, sem transição feia.
 */
import { PetmolTextLogo } from '@/components/ui/BrandBackground';

export function AppBootSplash() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: '#013EA8' }}
    >
      <PetmolTextLogo className="text-6xl drop-shadow-[0_6px_20px_rgba(0,0,0,0.25)]" color="#FFFFFF" />
    </div>
  );
}
