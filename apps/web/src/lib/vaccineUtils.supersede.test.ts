import { describe, expect, it } from 'vitest';
import { buildCanonicalVaccineState, latestVaccinePerGroup, vaccineSupersedeKey } from './vaccineUtils';

const rec = (id: string, name: string, type: string, code: string | null, applied: string, next?: string) =>
  ({ id, vaccine_name: name, vaccine_type: type, vaccine_code: code, date_administered: applied, next_dose_date: next }) as never;

const venc = (lista: unknown[], hoje: string) =>
  [...latestVaccinePerGroup(lista as never).values()]
    .filter((v) => v.next_dose_date && v.next_dose_date < hoje)
    .map((v) => v.id);

describe('dose nova substitui a antiga (o caso real do chamado do Rodrigo)', () => {
  const HOJE = '2026-10-23';

  it('ARON: V4 antigo SEM código + V4 novo com código CAT_POLYVALENT → o antigo não fica vencido', () => {
    const aron = [
      rec('a1', 'V4', 'multiple', null, '2023-11-22', '2024-11-22'),
      rec('a2', 'Antirrábica', 'rabies', null, '2023-12-13', '2024-12-12'),
      rec('a3', 'V4', 'multiple', 'CAT_POLYVALENT', '2026-10-19', '2027-10-19'),
      rec('a4', 'Antirrábica', 'rabies', null, '2026-10-19', '2027-10-19'),
    ];
    expect(venc(aron, HOJE)).toEqual([]);
  });

  it('PERCY: cartão antigo V5 + dose nova V4 → mesma família polivalente, o V5 antigo não fica vencido', () => {
    const percy = [
      rec('p1', 'Antirrábica', 'rabies', null, '2024-12-13', '2023-12-13'),
      rec('p2', 'V5', 'multiple', null, '2024-12-13', '2024-12-19'),
      rec('p3', 'Antirrábica', 'rabies', null, '2026-10-19', '2027-10-19'),
      rec('p4', 'V4', 'multiple', null, '2026-10-19', '2027-10-19'),
    ];
    expect(venc(percy, HOJE)).toEqual([]);
  });

  it('família polivalente: V3/V4/V5 (gatos) e V8/V10/V11 (cães), "múltipla" e "polivalente" são um grupo só', () => {
    for (const nome of ['V3', 'V4', 'V5', 'V8', 'V10', 'V11', 'v 10', 'Polivalente', 'Múltipla']) {
      expect(vaccineSupersedeKey({ vaccine_name: nome, vaccine_type: undefined, vaccine_code: undefined } as never)).toBe('POLYVALENT');
    }
    expect(vaccineSupersedeKey({ vaccine_name: 'qualquer', vaccine_type: 'multiple' } as never)).toBe('POLYVALENT');
    expect(vaccineSupersedeKey({ vaccine_name: 'x', vaccine_code: 'DOG_POLYVALENT_V10' } as never)).toBe('POLYVALENT');
  });

  it('vacinas DIFERENTES continuam separadas: raiva, giárdia, leishmaniose não substituem a polivalente', () => {
    const lista = [
      rec('r', 'Antirrábica', 'rabies', null, '2025-01-10', '2026-01-10'),       // vencida de verdade
      rec('p', 'V10', 'multiple', null, '2026-10-01', '2027-10-01'),
      rec('g', 'Giárdia', 'giardia', null, '2025-02-01', '2026-02-01'),           // vencida de verdade
    ];
    expect(venc(lista, HOJE).sort()).toEqual(['g', 'r']);
  });

  it('a dose mais ANTIGA nunca substitui a mais nova', () => {
    const lista = [rec('novo', 'V4', 'multiple', null, '2026-10-19', '2027-10-19'), rec('velho', 'V5', 'multiple', null, '2024-12-13', '2024-12-19')];
    const latest = [...latestVaccinePerGroup(lista as never).values()];
    expect(latest.map((v) => v.id)).toEqual(['novo']);
  });

  it('estado canônico mantém o código de catálogo do registro mais novo (não vira "POLYVALENT")', () => {
    const grupos = buildCanonicalVaccineState([rec('a', 'V4', 'multiple', 'CAT_POLYVALENT', '2026-10-19', '2027-10-19')] as never);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].code).toBe('CAT_POLYVALENT');
  });
});
