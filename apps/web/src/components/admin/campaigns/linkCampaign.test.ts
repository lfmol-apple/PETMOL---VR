import { describe, expect, it } from 'vitest';
import { composeCampaign } from './linkCampaign';

describe('campanha montada pela oferta', () => {
  it('Mercado Livre com preço e desconto: cita preço e destaca o desconto', () => {
    const c = composeCampaign({ store: 'Mercado Livre', title: 'Ração Premier 10kg', price: 129.9, list_price: 159.9, discount_pct: 19 });
    expect(c.name).toBe('Ração Premier 10kg');
    expect(c.title).toBe('{tutor}, oferta para {pets}: 19% de desconto');
    expect(c.message).toMatch(/^Ração Premier 10kg por R\$\s?129,90 \(de R\$\s?159,90\) — toque para ver\.$/);
  });
  it('Amazon NUNCA cita preço nem desconto (regra do programa de Associados)', () => {
    const c = composeCampaign({ store: 'Amazon', title: 'Coleira X', price: 49.9, list_price: 99.9, discount_pct: 50 });
    expect(c.message).toBe('Coleira X — toque para ver.');
    expect(c.title).toBe('{tutor}, olha este produto para {pets}');
  });
  it('sem preço lido: texto simples; desconto pequeno não vira título', () => {
    expect(composeCampaign({ store: 'Cobasi', title: 'Areia Y' }).message).toBe('Areia Y — toque para ver.');
    expect(composeCampaign({ store: 'Cobasi', title: 'Areia Y', price: 20, list_price: 21, discount_pct: 5 }).title).toBe('{tutor}, olha este produto para {pets}');
  });
  it('nome gigante é cortado para a mensagem caber em 240 caracteres', () => {
    const c = composeCampaign({ store: 'Shopee', title: 'x'.repeat(300), price: 9.9 });
    expect(c.message.length).toBeLessThanOrEqual(240);
    expect(c.name.length).toBeLessThanOrEqual(120);
  });
  it('sem nome não inventa mensagem', () => {
    expect(composeCampaign({ store: 'Shopee', title: null }).message).toBe('');
  });
});
