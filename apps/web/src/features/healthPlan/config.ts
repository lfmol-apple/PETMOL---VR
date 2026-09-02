/**
 * Plano de Saúde para pets — preparação para futura integração.
 *
 * ESTADO ATUAL: DESATIVADO. O bloco na Home mostra a versão neutra
 * ("Plano de saúde para seu pet" + "Em breve"), SEM marca de parceiro,
 * SEM CTA que redirecione, SEM cupom, SEM afirmação de parceria.
 *
 * Para ATIVAR depois da aprovação no programa de afiliados do parceiro,
 * bastam estas 3 variáveis de ambiente (não commitar valores):
 *
 *   NEXT_PUBLIC_PETLOVE_SAUDE_ENABLED=true
 *   NEXT_PUBLIC_PETLOVE_SAUDE_AFFILIATE_URL=<url oficial de afiliado do parceiro>
 *   NEXT_PUBLIC_PETLOVE_SAUDE_COUPON=<cupom, se houver>
 *
 * Regras de compliance quando ativo (ver docs/HEALTH_PLAN_PETLOVE.md):
 * - chamar de "Plano de Saúde", NUNCA "seguro";
 * - identificação de publicidade visível ("Publicidade • Parceria");
 * - nada de cobertura / preço / carência / coparticipação sem fonte oficial;
 * - o CTA vai para HEALTH_PLAN_GO_PATH (rota própria de rastreamento do
 *   PETMOL) quando ela existir; enquanto não existir, vai direto para a
 *   `HEALTH_PLAN_AFFILIATE_URL` configurada.
 */

function envBool(v: string | undefined): boolean {
  return (v ?? '').trim().toLowerCase() === 'true';
}

function envStr(v: string | undefined): string {
  return (v ?? '').trim();
}

/** DESATIVADO por padrão. Só `true` liga a versão comercial do bloco. */
export const HEALTH_PLAN_ENABLED = envBool(process.env.NEXT_PUBLIC_PETLOVE_SAUDE_ENABLED);

/** URL oficial de afiliado do parceiro. Vazia enquanto não aprovado. */
export const HEALTH_PLAN_AFFILIATE_URL = envStr(process.env.NEXT_PUBLIC_PETLOVE_SAUDE_AFFILIATE_URL);

/** Cupom do parceiro, se houver. Vazio enquanto não aprovado. */
export const HEALTH_PLAN_COUPON = envStr(process.env.NEXT_PUBLIC_PETLOVE_SAUDE_COUPON);

/**
 * Rota própria de redirecionamento/rastreamento do PETMOL para o Plano de
 * Saúde. AINDA NÃO IMPLEMENTADA — quando a parceria for aprovada, criar
 * `apps/web/src/app/go/petlove-saude/route.ts` (mesmo padrão de
 * `app/go/petz/`) que registra o clique e faz 302 para
 * `HEALTH_PLAN_AFFILIATE_URL`. Até lá, `resolveHealthPlanCtaUrl()` cai
 * direto na URL de afiliado, e nada aponta para cá.
 */
export const HEALTH_PLAN_GO_PATH = '/go/petlove-saude';

/**
 * Só devolve destino quando a integração está ativa E há URL configurada.
 * Enquanto desativado, retorna `null` — o bloco NÃO tem CTA clicável.
 */
export function resolveHealthPlanCtaUrl(): string | null {
  if (!HEALTH_PLAN_ENABLED) return null;
  if (!HEALTH_PLAN_AFFILIATE_URL) return null;
  // Trocar para HEALTH_PLAN_GO_PATH quando a rota de rastreamento existir.
  return HEALTH_PLAN_AFFILIATE_URL;
}
