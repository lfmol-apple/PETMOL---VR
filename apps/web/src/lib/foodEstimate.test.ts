import { describe, expect, it } from 'vitest';
import { COMMON_PACKAGE_SIZES_KG, estimateDailyGrams, estimatePackageDays } from './foodEstimate';

describe('estimativa de duração do pacote', () => {
  it('consumo diário em ordem de grandeza razoável', () => {
    expect(estimateDailyGrams('dog', 10)).toBeGreaterThan(180);
    expect(estimateDailyGrams('dog', 10)).toBeLessThan(230);       // cão de 10 kg ~ 200 g/dia
    expect(estimateDailyGrams('dog', 30)!).toBeGreaterThan(estimateDailyGrams('dog', 10)!);
    expect(estimateDailyGrams('cat', 4)).toBeGreaterThan(50);
    expect(estimateDailyGrams('cat', 4)).toBeLessThan(80);          // gato de 4 kg ~ 60 g/dia
  });

  it('dias do pacote: 10,1 kg para um cão de 10 kg dura ~50 dias; 1 kg para um gato de 4 kg ~16', () => {
    const dog = estimatePackageDays('dog', 10, 10.1)!;
    expect(dog).toBeGreaterThan(40); expect(dog).toBeLessThan(60);
    const cat = estimatePackageDays('cat', 4, 1)!;
    expect(cat).toBeGreaterThan(12); expect(cat).toBeLessThan(22);
  });

  it('sem peso, sem pacote ou valores absurdos: não estima (o cadastro mantém o padrão)', () => {
    expect(estimatePackageDays('dog', null, 10)).toBeNull();
    expect(estimatePackageDays('dog', 10, null)).toBeNull();
    expect(estimatePackageDays('dog', 0, 10)).toBeNull();
    expect(estimateDailyGrams('dog', 500)).toBeNull();
  });

  it('limita entre 3 e 120 dias', () => {
    expect(estimatePackageDays('dog', 2, 20)).toBe(120);
    expect(estimatePackageDays('dog', 80, 1)).toBe(3);
  });

  it('os tamanhos comuns incluem 10,1 kg e 15 kg', () => {
    expect(COMMON_PACKAGE_SIZES_KG).toContain(10.1);
    expect(COMMON_PACKAGE_SIZES_KG).toContain(15);
  });
});
