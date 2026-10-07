/**
 * Fonte ÚNICA de verdade das 10 artes de categoria PETMOL (Home + Cuidados +
 * futuramente os sheets). Nenhum componente deve importar HOME_ART ou um
 * arquivo .webp diretamente — importa daqui, por conceito.
 *
 * Estado atual (07/10/2026): os 10 conceitos apontam pras artes .webp
 * ANTIGAS (criadas pelo dono, já em produção), marcadas `placeholder: true`.
 * Elas são deliberadamente TEMPORÁRIAS — ver auditoria de redesign: os
 * prints mostraram que essas 9 artes (nota: hoje são 9 arquivos físicos pra
 * 10 conceitos — `care` e `grooming` reaproveitam o MESMO arquivo,
 * cuidados-pets-banho.webp, porque "Cuidados" nunca teve asset próprio)
 * parecem pertencer a famílias visuais diferentes entre si. A família nova
 * (3D realista, câmera/escala/iluminação únicas, fundo transparente) ainda
 * não foi gerada — ver docs técnicas no final deste arquivo.
 *
 * QUANDO A ARTE NOVA DE UM CONCEITO CHEGAR: troque só o `src` (e marque
 * `placeholder: false`) na entrada correspondente de CARE_ASSETS, abaixo.
 * Nenhum componente consumidor muda.
 */
import { HOME_ART } from './homeArt';

export type CareAssetKey =
  | 'food'
  | 'care'
  | 'vaccine'
  | 'store'
  | 'dewormer'
  | 'fleaTick'
  | 'collar'
  | 'medication'
  | 'grooming'
  | 'petshops';

export interface CareAssetSpec {
  /** rótulo humano, só para debug/dev tools — não é o texto exibido na tela (isso continua vindo de cada componente/i18n) */
  label: string;
  /** URL do asset ativo agora — placeholder (webp antigo) ou, no futuro, o 3D definitivo */
  src: string;
  /** true = ainda é a arte antiga de transição; false = já é a família 3D definitiva */
  placeholder: boolean;
}

export const CARE_ASSETS: Record<CareAssetKey, CareAssetSpec> = {
  food: { label: 'Alimentação', src: HOME_ART.alimentacao, placeholder: true },
  // "Cuidados" (ícone agregado do card da Home) nunca teve arte própria —
  // hoje reaproveita a de Banho e Tosa só porque precisava de alguma coisa.
  // É o único dos 10 que não tem NENHUM asset dedicado ainda, nem antigo.
  care: { label: 'Cuidados', src: HOME_ART.banho, placeholder: true },
  vaccine: { label: 'Vacina', src: HOME_ART.vacina, placeholder: true },
  store: { label: 'Loja', src: HOME_ART.loja, placeholder: true },
  dewormer: { label: 'Vermífugo', src: HOME_ART.vermifugo, placeholder: true },
  fleaTick: { label: 'Antipulgas', src: HOME_ART.antipulgas, placeholder: true },
  collar: { label: 'Coleira', src: HOME_ART.coleira, placeholder: true },
  medication: { label: 'Medicação', src: HOME_ART.medicacao, placeholder: true },
  grooming: { label: 'Banho e Tosa', src: HOME_ART.banho, placeholder: true },
  petshops: { label: 'PetShops', src: HOME_ART.petshops, placeholder: true },
};

/** Atalho pro caso comum (só a URL). */
export function careAssetSrc(key: CareAssetKey): string {
  return CARE_ASSETS[key].src;
}
