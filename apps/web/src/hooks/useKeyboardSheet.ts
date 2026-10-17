'use client';

import { useEffect, useRef } from 'react';

const KB_MIN_SHRINK_PX = 120;

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true;
}

/**
 * Mantém o sheet inteiro visível quando o teclado abre (iOS e Android).
 *
 * - iOS: o teclado cobre a página e o WebView "empurra" o layout pra cima — o
 *   cabeçalho e o campo de busca somem. Aqui o wrapper `fixed` é preso à área
 *   realmente visível (`visualViewport`), então o sheet fica ancorado no topo
 *   e o conteúdo rola por dentro.
 * - Android: o WebView encolhe sozinho; o mesmo ajuste vale.
 *
 * Com o teclado aberto o wrapper recebe `data-kb="true"` — as classes
 * `data-[kb=true]:*` do sheet viram "altura total, colado no topo".
 */
export function useKeyboardSheet(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let baseline = Math.max(vv.height, window.innerHeight);

    const apply = () => {
      const el = ref.current;
      if (!el) return;
      if (!isEditable(document.activeElement)) baseline = Math.max(vv.height, window.innerHeight);
      const keyboardOpen = isEditable(document.activeElement) && baseline - vv.height > KB_MIN_SHRINK_PX;
      if (keyboardOpen) {
        el.dataset.kb = 'true';
        el.style.top = `${vv.offsetTop}px`;
        el.style.height = `${vv.height}px`;
        el.style.bottom = 'auto';
      } else {
        delete el.dataset.kb;
        el.style.top = '';
        el.style.height = '';
        el.style.bottom = '';
      }
    };

    // o foco chega antes do teclado terminar de subir — reavalia algumas vezes
    const onFocusChange = () => {
      apply();
      window.setTimeout(apply, 120);
      window.setTimeout(apply, 350);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, [open]);

  return ref;
}
