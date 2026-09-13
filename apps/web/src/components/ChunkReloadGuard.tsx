'use client';

/**
 * ChunkReloadGuard
 *
 * Version skew: o app nativo carrega o site AO VIVO (server.url no
 * capacitor.config.ts) — não é um bundle empacotado no ipa/apk. Se o
 * usuário deixa o app aberto durante um deploy, o processo Next.js do
 * servidor troca de release (symlink + restart) enquanto o cliente ainda
 * referencia os chunks/RSC payload da release anterior. Uma navegação ou
 * import dinâmico feito depois disso pega 404 nesses arquivos — erro que
 * não passa pelos try/catch da aplicação (acontece no nível do router do
 * Next/webpack), e a tela fica presa no que estava renderizado.
 *
 * `deploymentId` (next.config.mjs) é o mecanismo oficial do Next pra isso,
 * mas cobre principalmente o carregamento de segmentos do próprio router;
 * este guard é a rede de segurança: detecta os erros característicos desse
 * tipo de falha em qualquer lugar (evento global) e força um reload
 * completo — que busca o HTML novo, já apontando pros chunks certos da
 * release atual. No máximo um reload por sessão, pra nunca entrar em loop
 * se o erro for outra coisa (rede realmente offline, por exemplo).
 */
import { useEffect } from 'react';

const RELOAD_FLAG_KEY = 'petmol_chunk_reload_at';

function looksLikeChunkLoadFailure(message: string | undefined, name: string | undefined): boolean {
  if (!message && !name) return false;
  const text = `${name || ''} ${message || ''}`;
  return (
    name === 'ChunkLoadError' ||
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Loading CSS chunk [\w-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text)
  );
}

function triggerReloadOnce(reason: string): void {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG_KEY)) {
      // Já tentamos uma vez nesta sessão — não recarrega de novo (evita
      // loop se o erro persistir por outro motivo, ex.: rede offline de
      // verdade). Só registra pra dar pra diagnosticar depois.
      console.error('[ChunkReloadGuard] erro de chunk repetido após reload — não recarregando de novo:', reason);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponível (modo privado, etc.) — segue e recarrega
    // mesmo assim; sem como marcar a tentativa, mas é melhor que travar.
  }
  console.warn('[ChunkReloadGuard] falha de carregamento de chunk detectada, recarregando:', reason);
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onError = (event: ErrorEvent) => {
      if (looksLikeChunkLoadFailure(event.message, event.error?.name)) {
        triggerReloadOnce(event.message || event.error?.name || 'error event');
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string; name?: string } | string | undefined;
      const message = typeof reason === 'string' ? reason : reason?.message;
      const name = typeof reason === 'string' ? undefined : reason?.name;
      if (looksLikeChunkLoadFailure(message, name)) {
        triggerReloadOnce(message || name || 'unhandledrejection');
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
