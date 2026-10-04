export type AgeGroup = 'puppy' | 'adult' | 'senior';

/**
 * Faixa etária estimada a partir da data de nascimento — feedback de beta
 * tester (04/10/2026): perguntar "filhote/adulto/idoso" manualmente gera
 * dúvida ("1 ano e meio é o quê?"), quando dá pra calcular. Corte simples e
 * popular entre tutores/vets: menos de 1 ano filhote, até 7 anos adulto,
 * 7+ idoso. Não diferencia por porte/espécie — aproximação deliberada.
 */
export function ageGroupFromBirthDate(birthDateIso: string, today: Date = new Date()): AgeGroup | '' {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateIso || '');
  if (!m) return '';
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime())) return '';

  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) years--;
  if (years < 0) return '';

  if (years < 1) return 'puppy';
  if (years < 7) return 'adult';
  return 'senior';
}
