import { describe, expect, it } from 'vitest';
import { metadata } from './layout';

describe('/go/instalar — cartão de pré-visualização do link (WhatsApp)', () => {
  it('tem título, descrição e imagem 1200×630 para o cartão', () => {
    const og = metadata.openGraph as { title?: string; description?: string; images?: { url: string; width: number; height: number }[] };
    expect(og.title).toContain('Petmol');
    expect(og.description).toMatch(/iPhone e Android/);
    expect(og.images?.[0]).toMatchObject({ url: '/og/petmol-instalar.jpg', width: 1200, height: 630 });
  });

  it('usa o cartão grande no Twitter/X e não indexa a página de passagem', () => {
    expect((metadata.twitter as { card?: string }).card).toBe('summary_large_image');
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
