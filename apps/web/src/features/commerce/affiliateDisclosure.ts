/**
 * Textos de relação comercial — fonte única.
 *
 * O aviso genérico verdadeiro (`genericDisclosure`) aparece em toda a área
 * editorial. Quando o PETMOL tem conta ATIVA num programa que exige
 * declaração própria, o objeto correspondente abaixo é preenchido com a
 * frase EXATA do programa — e ela passa a aparecer automaticamente onde
 * `<AmazonDisclosure />` for usado, num lugar só.
 */

export const genericDisclosure =
  'O PETMOL pode participar de programas de afiliados. Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.';

export interface ProgramDisclosure {
  /** Nome do programa (ex: "Programa de Associados da Amazon"). Vazio = sem conta ativa. */
  programName: string;
  /** Frase EXATA exigida pelo programa. Vazio até aprovação e obtenção do Tracking ID. */
  requiredStatement: string;
}

/**
 * Amazon Brasil — Programa de Associados (Tracking ID `amazonpetmol-20`).
 *
 * ATIVO na área /guias (web): os produtos de `features/guides/productCollections.ts`
 * usam links SiteStripe reais dessa conta. A frase abaixo é a exigida pelo
 * Contrato Operacional do Programa de Associados da Amazon (Brasil) e
 * precisa aparecer junto dos links de afiliado.
 *
 * NÃO se aplica ao app nativo — lá a seção de produtos Amazon não é
 * renderizada (ToS da Amazon para apps). Não se aplica a /recommendations,
 * que é a conta Amazon US (frase própria em inglês, ver features/recommendations/data.ts).
 */
export const amazonDisclosure: ProgramDisclosure = {
  programName: 'Programa de Associados da Amazon',
  requiredStatement: 'Como associado da Amazon, eu recebo por compras qualificadas.',
};

export function hasActiveProgramDisclosure(p: ProgramDisclosure): boolean {
  return p.programName.trim().length > 0 && p.requiredStatement.trim().length > 0;
}
