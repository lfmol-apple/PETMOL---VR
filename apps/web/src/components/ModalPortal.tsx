'use client';

/**
 * ModalPortal — renderiza modais diretamente no document.body via createPortal.
 *
 * Isso garante que position: fixed funcione sempre relativo ao viewport,
 * independente de qualquer CSS / overflow / transform aplicado nos ancestrais.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

export function ModalPortal({ children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
