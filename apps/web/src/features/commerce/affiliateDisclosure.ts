/**
 * Textos de relação comercial — fonte única.
 *
 * Enquanto não houver conta ATIVA e aprovada num programa que exija
 * declaração própria, `programName`/`requiredStatement` ficam vazios e o
 * PETMOL só exibe o aviso genérico verdadeiro (`genericDisclosure`).
 *
 * Quando o PETMOL for aprovado (ex: Programa de Associados da Amazon),
 * preencher `requiredStatement` com a frase exata exigida pelo programa —
 * e ela passa a aparecer automaticamente onde `<AmazonDisclosure />` for
 * usado. Nada de declarar "Como associado Amazon..." antes disso.
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
 * Amazon — desativado. A conta anterior foi rejeitada; não há Tracking ID
 * válido. NÃO preencher isto sem uma nova aprovação real.
 */
export const amazonDisclosure: ProgramDisclosure = {
  programName: '',
  requiredStatement: '',
};

export function hasActiveProgramDisclosure(p: ProgramDisclosure): boolean {
  return p.programName.trim().length > 0 && p.requiredStatement.trim().length > 0;
}
