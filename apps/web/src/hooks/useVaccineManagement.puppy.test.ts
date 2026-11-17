import { describe, expect, it } from 'vitest';
import { puppyProtocolNextDose, vaccineFollowsPuppySeries } from './useVaccineManagement';

const nasc = '2026-03-15';                                   // Zara
const hoje = new Date(2026, 10, 17);

describe('protocolo de filhote — não gera "vencida" que não existe', () => {
  it('antirrábica e vacinas de dose única não entram na série', () => {
    expect(puppyProtocolNextDose(nasc, new Date(2026, 6, 17), 'Antirrábica Canina', new Date(2026, 6, 18))).toBeNull();
    for (const n of ['Antirrabica', 'Tosse dos Canis (Bordetella)', 'Gripe canina', 'Giárdia', 'Leishmaniose']) expect(vaccineFollowsPuppySeries(n)).toBe(false);
    expect(vaccineFollowsPuppySeries('Polivalente V8/V10')).toBe(true);
  });
  it('sugestão que já está no passado (dose antiga registrada depois) é descartada', () => {
    expect(puppyProtocolNextDose(nasc, new Date(2026, 5, 29), 'Polivalente V8/V10', hoje)).toBeNull();
  });
  it('filhote vacinado agora segue a série de 3 semanas', () => {
    const got = puppyProtocolNextDose('2026-10-01', new Date(2026, 10, 15), 'Polivalente V8/V10', new Date(2026, 10, 15));
    expect(got?.getFullYear()).toBe(2026); expect(got?.getMonth()).toBe(11); expect(got?.getDate()).toBe(6);
  });
});
