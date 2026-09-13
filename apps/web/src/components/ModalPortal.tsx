'use client';

/**
 * ModalPortal — renderiza modais diretamente no document.body via createPortal.
 *
 * Isso garante que position: fixed funcione sempre relativo ao viewport,
 * independente de qualquer CSS / overflow / transform aplicado nos ancestrais.
 */
import { useLayoutEffect, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

// useEffect só roda DEPOIS do primeiro paint — todo sheet do app usa este
// portal (via SheetShell), então esse primeiro paint sem conteúdo nenhum é
// exatamente o "pisca" de tela de baixo aparecendo por um frame antes do
// sheet. useLayoutEffect roda antes do navegador pintar, então o portal já
// nasce montado no mesmo frame em que o sheet abre. Guard de SSR porque
// useLayoutEffect não existe no servidor (mesmo padrão já usado em
// app/home/page.tsx).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function ModalPortal({ children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
