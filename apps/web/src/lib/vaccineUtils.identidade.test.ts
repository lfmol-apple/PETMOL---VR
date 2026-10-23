import { describe, expect, it } from 'vitest';
import { buildCanonicalVaccineState, latestVaccinePerGroup } from './vaccineUtils';

const rec = (id: string, name: string, type: string, code: string | null, applied: string, next?: string) =>
  ({ id, vaccine_name: name, vaccine_type: type, vaccine_code: code, date_administered: applied, next_dose_date: next }) as never;

const latestIds = (lista: unknown[]) => [...latestVaccinePerGroup(lista as never).values()].map((v) => v.id).sort();

/**
 * REGRA: o app NUNCA julga o que é clínico. Só a MESMA vacina (mesmo código OU mesmo nome) é substituída pela dose
 * mais nova. Versões diferentes (V4 × V5, V8 × V10) ficam separadas — quem decide se uma atende a outra é o veterinário.
 */
describe('a dose mais nova substitui a antiga SÓ quando é a mesma vacina', () => {
  it('ARON: "V4" antigo sem código + "V4" novo com CAT_POLYVALENT = mesma vacina (mesmo nome) → só o novo conta', () => {
    const aron = [
      rec('a1', 'V4', 'multiple', null, '2023-11-22', '2024-11-22'),
      rec('a3', 'V4', 'multiple', 'CAT_POLYVALENT', '2026-10-19', '2027-10-19'),
    ];
    expect(latestIds(aron)).toEqual(['a3']);
  });

  it('o nome é comparado sem acento/caixa/modificadores: "V4", "v4 (anual)" e "V4 reforço" são o mesmo nome', () => {
    expect(latestIds([rec('1', 'V4', 'multiple', null, '2024-01-01'), rec('2', 'v4 (anual)', 'multiple', null, '2025-01-01'), rec('3', 'V4 reforço', 'multiple', null, '2026-01-01')])).toEqual(['3']);
  });

  it('PERCY: V5 antiga × V4 nova são vacinas DIFERENTES — o app não decide; as duas seguem separadas', () => {
    const percy = [rec('p2', 'V5', 'multiple', null, '2024-12-13', '2024-12-19'), rec('p4', 'V4', 'multiple', null, '2026-10-19', '2027-10-19')];
    expect(latestIds(percy)).toEqual(['p2', 'p4']);
  });

  it('gatos: V3, V4 e V5 nunca se substituem sozinhos', () => {
    expect(latestIds([rec('a', 'V3', 'multiple', null, '2024-01-01'), rec('b', 'V5', 'multiple', null, '2026-01-01')])).toEqual(['a', 'b']);
    expect(latestIds([rec('a', 'V4', 'multiple', null, '2024-01-01'), rec('b', 'V5', 'multiple', null, '2026-01-01')])).toEqual(['a', 'b']);
  });

  it('o código de catálogo continua mandando: dois registros com o mesmo código são a mesma vacina', () => {
    expect(latestIds([rec('a', 'Polivalente', 'multiple', 'DOG_POLYVALENT_V10', '2024-01-01'), rec('b', 'V10 Nobivac', 'multiple', 'DOG_POLYVALENT_V10', '2026-01-01')])).toEqual(['b']);
  });

  it('raiva, giárdia e polivalente nunca se misturam', () => {
    const lista = [rec('r', 'Antirrábica', 'rabies', null, '2025-01-10'), rec('p', 'V10', 'multiple', null, '2026-10-01'), rec('g', 'Giárdia', 'giardia', null, '2025-02-01')];
    expect(latestIds(lista)).toEqual(['g', 'p', 'r']);
  });

  it('a dose mais ANTIGA nunca substitui a mais nova', () => {
    expect(latestIds([rec('novo', 'V4', 'multiple', null, '2026-10-19'), rec('velho', 'V4', 'multiple', 'CAT_POLYVALENT', '2024-12-13')])).toEqual(['novo']);
  });

  it('estado canônico mantém o código de catálogo do registro mais novo', () => {
    const grupos = buildCanonicalVaccineState([rec('a', 'V4', 'multiple', 'CAT_POLYVALENT', '2026-10-19', '2027-10-19')] as never);
    expect(grupos[0].code).toBe('CAT_POLYVALENT');
  });
});
