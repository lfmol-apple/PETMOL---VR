/**
 * Teste A/B da landing — atribuição da variante. Experimento atual: COM imagem (A) × SEM imagem (B).
 *
 * - 50/50, aleatória (crypto.getRandomValues) e PERSISTENTE: gravada em localStorage e num cookie de 90 dias;
 *   o mesmo navegador continua vendo a mesma versão ao atualizar/voltar. Nada alterna sozinho.
 * - Sem armazenamento (navegação privada): a variante fica só em memória durante a página — melhor esforço,
 *   e o visitante é contado por `anonymous_id`, que também é instável nesse caso (limitação documentada).
 * - Pré-visualização (`?ab=A|B`, ou `?c=` de mensagem por anúncio): mostra a versão pedida sem gravar
 *   nada e marca os eventos como `preview` — o Mission Control ignora esses eventos.
 * - Nenhum fingerprinting: só um bit sorteado e o id anônimo que o PETMOL já usa.
 */
export const EXPERIMENT_ID = 'landing_imagem_2026_09';
export type LandingVariant = 'A' | 'B';

const STORAGE_KEY = 'petmol_exp_landing_v1';
const COOKIE_KEY = 'petmol_lp_variant_img';
const COOKIE_DAYS = 90;

export interface VariantInfo {
  variant: LandingVariant;
  /** true = não entra na estatística (pré-visualização ou mensagem por anúncio). */
  preview: boolean;
  /** true = ficou gravada no navegador. */
  persisted: boolean;
}

/** A = com a imagem do app (atual). B = SEM imagem: mesmo texto, título maior e 3 benefícios curtos. */
export const VARIANT_HAS_IMAGE: Record<LandingVariant, boolean> = { A: true, B: false };

export function secureRandomVariant(): LandingVariant {
  try {
    const buf = new Uint8Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] & 1) === 0 ? 'A' : 'B';
  } catch {
    return Math.random() < 0.5 ? 'A' : 'B';
  }
}

const isVariant = (v: unknown): v is LandingVariant => v === 'A' || v === 'B';

function readCookie(): LandingVariant | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
    const v = m ? decodeURIComponent(m[1]) : '';
    return isVariant(v) ? v : null;
  } catch {
    return null;
  }
}

function writeCookie(v: LandingVariant): void {
  try {
    document.cookie = `${COOKIE_KEY}=${v}; max-age=${COOKIE_DAYS * 86400}; path=/; SameSite=Lax`;
  } catch { /* sem cookie */ }
}

function readStored(): LandingVariant | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { experiment_id?: string; variant?: string };
    return parsed.experiment_id === EXPERIMENT_ID && isVariant(parsed.variant) ? parsed.variant : null;
  } catch {
    return null;
  }
}

function writeStored(v: LandingVariant): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ experiment_id: EXPERIMENT_ID, variant: v, assigned_at: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

let memo: VariantInfo | null = null;

/** Sorteia (uma única vez por navegador) ou devolve a variante já atribuída. Síncrona: nunca há "troca" depois. */
export function getLandingVariant(opts: { search?: string; random?: () => LandingVariant; forcePreview?: boolean } = {}): VariantInfo {
  if (memo) return memo;

  const forced = new URLSearchParams(opts.search ?? '').get('ab')?.toUpperCase();
  if (isVariant(forced)) {
    memo = { variant: forced, preview: true, persisted: false };
    return memo;
  }
  if (opts.forcePreview) {
    memo = { variant: readStored() ?? 'A', preview: true, persisted: false };
    return memo;
  }

  const existing = readStored() ?? readCookie();
  if (existing) {
    const persisted = writeStored(existing); // reidrata o que estiver faltando (ex.: só o cookie sobreviveu)
    writeCookie(existing);
    memo = { variant: existing, preview: false, persisted };
    return memo;
  }

  const variant = (opts.random ?? secureRandomVariant)();
  const persisted = writeStored(variant);
  writeCookie(variant);
  memo = { variant, preview: false, persisted };
  return memo;
}

/** Só para testes. */
export function __resetLandingVariantMemo(): void {
  memo = null;
}
