'use client';

import { useEffect } from 'react';

// CSS sozinho (overflow-x-hidden, overscroll-behavior-x, touch-action) não
// bastou — suporte a essas propriedades é inconsistente entre versões de
// iOS Safari/WKWebView (o navegador que abre quando o tutor toca num push
// notification), e o app continuava arrastável pros lados mesmo depois de
// três rodadas de ajuste de CSS (reportado pelo tutor). Esse componente é
// o backstop definitivo: intercepta o gesto em si, em JS, então funciona
// independente de qual propriedade CSS o navegador suporta ou não.
//
// Não bloqueia containers que legitimamente rolam na horizontal (abas de
// Cuidados, documentos recentes, tabelas do admin) — sobe a árvore de
// ancestrais a partir do toque e só intervém se nenhum deles for
// realmente scrollável na horizontal.
function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    // Nunca interceptar dentro de campo de texto — arrastar ali é
    // seleção/posicionamento de cursor nativo, não navegação de página.
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable) {
      return true;
    }
    const style = window.getComputedStyle(el);
    const scrollable = (style.overflowX === 'auto' || style.overflowX === 'scroll')
      && el.scrollWidth > el.clientWidth;
    if (scrollable) return true;
    el = el.parentElement;
  }
  return false;
}

export function HorizontalSwipeGuard() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let allowHorizontal = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      allowHorizontal = isInsideHorizontalScroller(e.target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (allowHorizontal || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return null;
}
