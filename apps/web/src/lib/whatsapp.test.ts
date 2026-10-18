import { describe, expect, it } from 'vitest';
import { whatsAppHref } from './whatsapp';

describe('whatsAppHref', () => {
  it('com número: conversa direta, com 55 e sem texto', () => {
    expect(whatsAppHref('(11) 99999-8888')).toBe('https://wa.me/5511999998888');
    expect(whatsAppHref('5511999998888')).toBe('https://wa.me/5511999998888');
  });
  it('sem número (ou curto demais): só abre o WhatsApp', () => {
    expect(whatsAppHref('')).toBe('whatsapp://');
    expect(whatsAppHref(null)).toBe('whatsapp://');
    expect(whatsAppHref('123')).toBe('whatsapp://');
  });
});
