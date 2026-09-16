import type { ParasiteControl } from '@/lib/types/home';

// Cidades brasileiras de alta incidência de leishmaniose visceral canina —
// lista inicial/heurística (não exaustiva; expandir com dado epidemiológico
// real quando disponível). Nessas regiões o aviso da Coleira fica sempre
// ativo mesmo com proteção já registrada — o risco local justifica
// vigilância contínua, não só "comprou uma vez" (feedback explícito do
// usuário, que citou Belo Horizonte como exemplo).
const LEISHMANIASIS_ENDEMIC_CITIES = new Set([
  'belo horizonte', 'aracatuba', 'camacari', 'aracaju', 'fortaleza',
  'teresina', 'palmas', 'campo grande', 'salvador', 'bauru', 'birigui',
  'santarem', 'contagem', 'betim',
]);

function normalizeCityName(city: string | undefined | null): string {
  return (city || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Cão sem NENHUM registro de coleira/leishmaniose ainda — mesmo tratamento
// que vacina zerada leva (neutral vira critical): não dá pra esperar um
// reminder de um registro que nunca existiu. Só cão porque a prevenção por
// coleira é especificamente uma recomendação canina. Extraído pra um lib
// compartilhado porque duas telas precisam do MESMO resultado — o card
// resumo "Cuidados" da Home e o card individual de Coleira dentro da sheet
// Cuidados só se ele já vier com o tom sobrescrito por aqui; passar o tom
// bruto (colorColeira) faz um piscar e o outro não, mesmo pet, mesmo dado.
export function needsLeishmaniaseAwareness(
  species: string | undefined | null,
  parasiteControls: ParasiteControl[],
  ownerCity: string | undefined | null,
): boolean {
  const hasLeishmaniaseProtection = parasiteControls.some(
    (p) => p.type === 'collar' || p.type === 'leishmaniasis',
  );
  const isInLeishmaniaseEndemicRegion = LEISHMANIASIS_ENDEMIC_CITIES.has(normalizeCityName(ownerCity));
  return species === 'dog' && (!hasLeishmaniaseProtection || isInLeishmaniaseEndemicRegion);
}

export function effectiveColeiraTone<T extends string>(
  needsAwareness: boolean,
  colorColeira: T | undefined,
  fallback: T,
): T | 'critical' {
  return needsAwareness ? 'critical' : (colorColeira ?? fallback);
}
