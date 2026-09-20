import { useEffect, useRef } from 'react';

type Entry = { fn: () => void };
const stack: Entry[] = [];

export function registerBackHandler(fn: () => void): () => void {
  const entry: Entry = { fn };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Chama o handler do overlay mais recente; false se não há nenhum aberto. */
export function runTopBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}

/** Enquanto `active`, o Voltar físico do Android fecha este overlay (só o do topo). */
export function useBackHandler(active: boolean, onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => ref.current());
  }, [active]);
}
