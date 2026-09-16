'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary de rota (Next.js App Router) — não existia nenhum antes
 * (nem este nem global-error.tsx). Sem isso, qualquer exceção não tratada
 * durante a renderização de uma tela deixava a tela em branco pra sempre,
 * sem nenhuma saída pro usuário — exatamente o sintoma da rejeição da Apple
 * (iPad), só que por uma causa diferente (aqui seria um bug de render em
 * vez do bug de navegação do Capacitor, já corrigido em capacitor.config.ts).
 * Nunca expõe a mensagem/stack do erro pro usuário.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RouteError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50 px-6 text-center">
      <span className="text-5xl" aria-hidden>🐾</span>
      <div>
        <h1 className="text-lg font-black text-slate-900">Algo deu errado</h1>
        <p className="mt-1.5 max-w-xs text-sm text-slate-500">
          Essa tela travou por um erro inesperado. Você pode tentar de novo ou voltar para o início.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white active:scale-[0.98] transition-all"
        >
          Tentar de novo
        </button>
        <Link
          href="/home"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-center text-sm font-bold text-slate-600 active:scale-[0.98] transition-all"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
