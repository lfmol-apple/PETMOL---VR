/**
 * versionSkew.ts
 *
 * Livro-razão ÚNICO de "já recarreguei por causa da versão X" — compartilhado
 * entre BuildVersionGate (detecção proativa por polling) e ChunkReloadGuard
 * (reação imediata a um erro de chunk). Os dois nunca devem manter contadores
 * independentes: sem isso, um deploy podia disparar dois reloads
 * concorrentes (um de cada componente), cada um pensando que era o único.
 *
 * Fail-safe deliberado: se sessionStorage não estiver disponível (modo
 * privado, storage bloqueado), NÃO reload — key.mark() devolve `false` e o
 * chamador deve desistir, nunca seguir em frente sem a garantia de que o
 * reload já foi registrado. Preferimos deixar a tela presa a arriscar um
 * loop de reload infinito sem como provar que já tentamos.
 */

const KEY_PREFIX = 'petmol_reloaded_for_';

/** true se ESTA sessão já recarregou por causa da versão `sha`. */
export function hasReloadedForVersion(sha: string): boolean {
  try {
    return sessionStorage.getItem(KEY_PREFIX + sha) === '1';
  } catch {
    // Sem como confirmar — trata como "já recarregado" (lado seguro: não
    // reloada de novo se não dá pra checar o estado real).
    return true;
  }
}

/**
 * Tenta reservar o reload pra versão `sha`. Devolve `true` só se conseguiu
 * gravar a marca com certeza (então o chamador pode prosseguir com o
 * reload). Devolve `false` se já estava marcado OU se não deu pra gravar —
 * nos dois casos o chamador NÃO deve recarregar.
 */
export function claimReloadForVersion(sha: string): boolean {
  try {
    if (sessionStorage.getItem(KEY_PREFIX + sha) === '1') return false;
    sessionStorage.setItem(KEY_PREFIX + sha, '1');
    return true;
  } catch {
    return false;
  }
}
