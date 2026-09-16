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
 * `BuildVersionGate` já cobre isso por POLLING (mount + 60s + foco) — mas só
 * reage no seu próprio ciclo, não na hora exata em que o erro acontece (e se
 * o fetch de /version.json falhar bem na janela do restart, o BuildVersionGate
 * engole o erro e só tenta nos próximos 60s). Este guard é a reação
 * IMEDIATA ao sintoma: escuta os erros característicos de chunk em
 * qualquer lugar do app e força a mesma decisão que o BuildVersionGate
 * tomaria — nunca uma decisão própria e paralela.
 *
 * Nunca reloada sozinho: pergunta /version.json pra saber a versão-alvo e
 * usa o MESMO livro-razão compartilhado (lib/versionSkew.ts) que o
 * BuildVersionGate usa — um reload por versão-alvo, não um por componente.
 * Se não der pra confirmar a versão-alvo ou gravar a marca de "já
 * recarreguei", NÃO recarrega (fail-safe: preferimos deixar a tela presa a
 * arriscar loop sem garantia de que o reload já foi tentado).
 */
import { useEffect } from 'react';
import { claimReloadForVersion } from '@/lib/versionSkew';

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

// Bug real (Android, set/2026): tocar em "Perfil" no Header não abria a
// tela — voltava pra Home ou Loja, dependendo de onde o tutor estava antes.
// Causa: o Next App Router só troca a URL (pushState) DEPOIS que o payload
// RSC do destino termina de buscar. Se esse fetch pega 404 por version skew
// (ver comentário do arquivo) bem no meio da navegação, window.location.href
// ainda é a página de ORIGEM — reload() só recarregava ela de novo, nunca
// chegava no Perfil. Pra recarregar pro lugar certo, guardamos qual link o
// tutor realmente clicou (capturado no clique real do <a>, antes do Next
// interceptar com preventDefault) e usamos isso como destino do reload.
const INTENT_TTL_MS = 8000;
let lastIntendedPath: { path: string; at: number } | null = null;

function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function trackLinkIntent(event: MouseEvent): void {
  if (!isPlainLeftClick(event)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a');
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/')) return;
  lastIntendedPath = { path: href, at: Date.now() };
}

function consumeRecentIntent(): string | null {
  if (!lastIntendedPath) return null;
  const isRecent = Date.now() - lastIntendedPath.at <= INTENT_TTL_MS;
  return isRecent ? lastIntendedPath.path : null;
}

/** Só para teste — variável é module-level (única fonte de verdade entre
 * todos os cliques da sessão), então sobrevive entre `it()`s sem isso. */
export function __resetLinkIntentForTests(): void {
  lastIntendedPath = null;
}

async function reactToChunkFailure(reason: string): Promise<void> {
  let liveSha: string | null = null;
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const { v } = (await res.json()) as { v?: string };
    liveSha = (v || '').split('-')[0] || null;
  } catch (e) {
    // Sem versão-alvo confirmada, sem como provar "um reload só pra essa
    // versão" — não recarrega. Melhor ficar preso do que arriscar loop.
    console.error('[ChunkReloadGuard] erro de chunk, mas não deu pra confirmar a versão-alvo — não recarregando:', reason, e);
    return;
  }

  if (!liveSha || !claimReloadForVersion(liveSha)) {
    // Ou não tem SHA válido, ou o BuildVersionGate (ou esta própria função,
    // numa chamada anterior) já reclamou o reload pra essa versão — não
    // duplica.
    console.error('[ChunkReloadGuard] erro de chunk repetido/já tratado — não recarregando de novo:', reason);
    return;
  }

  const intendedPath = consumeRecentIntent();
  console.warn('[ChunkReloadGuard] falha de carregamento de chunk detectada, recarregando pra versão', liveSha, intendedPath ? `(destino: ${intendedPath})` : '(destino: página atual)', ':', reason);
  if (intendedPath) {
    window.location.href = intendedPath;
  } else {
    window.location.reload();
  }
}

export function ChunkReloadGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onError = (event: ErrorEvent) => {
      if (looksLikeChunkLoadFailure(event.message, event.error?.name)) {
        void reactToChunkFailure(event.message || event.error?.name || 'error event');
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string; name?: string } | string | undefined;
      const message = typeof reason === 'string' ? reason : reason?.message;
      const name = typeof reason === 'string' ? undefined : reason?.name;
      if (looksLikeChunkLoadFailure(message, name)) {
        void reactToChunkFailure(message || name || 'unhandledrejection');
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // capture: true — precisa ver o clique ANTES do Next.js interceptar
    // com preventDefault() no <Link>, senão o evento chega sem o href útil.
    document.addEventListener('click', trackLinkIntent, { capture: true });
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      document.removeEventListener('click', trackLinkIntent, { capture: true });
    };
  }, []);

  return null;
}
