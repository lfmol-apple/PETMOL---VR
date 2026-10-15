/**
 * Estimativa de duração do pacote de ração — só para PRÉ-PREENCHER o cadastro rápido, nunca para decidir
 * por ele. Antes, o cadastro rápido gravava 30 dias para todo mundo (15/10/2026: ~38% dos lembretes de
 * reposição estavam no padrão de 30 dias), e o lembrete errava a data. Com o tamanho do pacote e o peso
 * do pet, a estimativa chega bem mais perto. Sempre editável e sempre rotulada como "estimativa".
 *
 * Consumo diário (energia de manutenção): cão ≈ 130·kg^0,75 kcal; gato ≈ 84·kg^0,75 kcal; ração seca
 * ≈ 3,6 kcal/g (cão) e 3,8 kcal/g (gato). Valores médios — filhote come mais, idoso menos; por isso o aviso.
 */

/** Tamanhos de pacote mais comuns no Brasil (kg). */
export const COMMON_PACKAGE_SIZES_KG = [1, 3, 10.1, 15, 20] as const;

export function estimateDailyGrams(species: 'dog' | 'cat' | undefined, weightKg: number | null | undefined): number | null {
  if (!weightKg || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 120) return null;
  const metabolic = Math.pow(weightKg, 0.75);
  const grams = species === 'cat' ? (84 * metabolic) / 3.8 : (130 * metabolic) / 3.6;
  return Math.round(grams);
}

/** Dias que o pacote dura, ou null se faltar dado. Limitado a 3–120 dias para não gerar absurdo. */
export function estimatePackageDays(
  species: 'dog' | 'cat' | undefined,
  weightKg: number | null | undefined,
  packageKg: number | null | undefined,
): number | null {
  const daily = estimateDailyGrams(species, weightKg);
  if (!daily || !packageKg || !Number.isFinite(packageKg) || packageKg <= 0) return null;
  const days = Math.round((packageKg * 1000) / daily);
  return Math.min(120, Math.max(3, days));
}
