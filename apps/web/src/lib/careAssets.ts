/**
 * Fonte ÚNICA de verdade das 10 artes de categoria PETMOL (Home + Cuidados +
 * futuramente os sheets). Nenhum componente deve importar HOME_ART, um
 * arquivo .webp antigo ou um arquivo de apps/web/src/assets/petmol-premium/
 * diretamente — importa daqui, por conceito.
 *
 * Família PETMOL definitiva (07/10/2026): os 10 conceitos foram aprovados
 * e integrados — apps/web/src/assets/petmol-premium/*.webp, 512×512,
 * alpha real, 3D realista/mesma câmera/mesma escala. `placeholder: false`
 * em todos. As artes antigas (HOME_ART) continuam no repo pra rollback,
 * mas nenhum componente as consome mais.
 *
 * QUANDO PRECISAR TROCAR UM ASSET NO FUTURO: troque só o `src` (import +
 * referência) na entrada correspondente de CARE_ASSETS, abaixo. Nenhum
 * componente consumidor muda.
 */
import food from '@/assets/petmol-premium/food.webp';
import care from '@/assets/petmol-premium/care.webp';
import vaccine from '@/assets/petmol-premium/vaccine.webp';
import store from '@/assets/petmol-premium/store.webp';
import dewormer from '@/assets/petmol-premium/dewormer.webp';
import fleaTick from '@/assets/petmol-premium/flea-tick.webp';
import collar from '@/assets/petmol-premium/collar.webp';
import medication from '@/assets/petmol-premium/medication.webp';
import grooming from '@/assets/petmol-premium/grooming.webp';
import petshops from '@/assets/petmol-premium/petshops.webp';

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
  /** URL do asset ativo agora */
  src: string;
  /** true = arte antiga de transição; false = já é a família 3D definitiva */
  placeholder: boolean;
}

export const CARE_ASSETS: Record<CareAssetKey, CareAssetSpec> = {
  food: { label: 'Alimentação', src: food.src, placeholder: false },
  care: { label: 'Cuidados', src: care.src, placeholder: false },
  vaccine: { label: 'Vacina', src: vaccine.src, placeholder: false },
  store: { label: 'Loja', src: store.src, placeholder: false },
  dewormer: { label: 'Vermífugo', src: dewormer.src, placeholder: false },
  fleaTick: { label: 'Antipulgas', src: fleaTick.src, placeholder: false },
  collar: { label: 'Coleira', src: collar.src, placeholder: false },
  medication: { label: 'Medicação', src: medication.src, placeholder: false },
  grooming: { label: 'Banho e Tosa', src: grooming.src, placeholder: false },
  petshops: { label: 'PetShops', src: petshops.src, placeholder: false },
};

/** Atalho pro caso comum (só a URL). */
export function careAssetSrc(key: CareAssetKey): string {
  return CARE_ASSETS[key].src;
}
