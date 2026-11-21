import type { ReactNode } from 'react';

/**
 * Bloco só para o contexto público (navegador/Google). No app nativo (User-Agent com `PetmolApp`, o mesmo marcador de
 * lib/nativeApp.ts) ele é escondido ANTES do primeiro quadro por um script mínimo no HTML, então o app nunca o vê.
 * Visitantes e buscadores recebem o texto no HTML do servidor. Não altera a página que está acima dele.
 */
const HIDE_IN_APP = `(function(){try{if(/PetmolApp/.test(navigator.userAgent))document.documentElement.setAttribute('data-petmol-app','1')}catch(e){}})();`;
const CSS = 'html[data-petmol-app] .public-only{display:none!important}';

export function PublicOnly({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: HIDE_IN_APP }} />
      <section aria-label={label} className="public-only bg-white px-5 py-10 text-slate-700">
        <div className="mx-auto max-w-2xl">{children}</div>
      </section>
    </>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-8 text-[19px] font-black leading-snug text-slate-900 first:mt-0">{children}</h2>
);
export const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-[15px] leading-relaxed">{children}</p>
);
export const UL = ({ children }: { children: ReactNode }) => (
  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">{children}</ul>
);
