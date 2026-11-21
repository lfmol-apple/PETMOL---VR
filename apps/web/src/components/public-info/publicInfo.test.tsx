import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import AcheiLayout, { metadata as acheiMeta } from '@/app/achei-um-pet/layout';
import ReportarLayout, { metadata as reportarMeta } from '@/app/reportar-pet-perdido/layout';

const child = createElement('main', { id: 'tela-original' }, 'conteúdo do app');
const html = (L: typeof AcheiLayout) => renderToStaticMarkup(createElement(L, null, child));

describe('conteúdo público de /achei-um-pet e /reportar-pet-perdido', () => {
  it('a tela original é renderizada intacta e vem ANTES do texto público', () => {
    for (const L of [AcheiLayout, ReportarLayout]) {
      const h = html(L);
      expect(h).toContain('<main id="tela-original">conteúdo do app</main>');
      expect(h.indexOf('tela-original')).toBeLessThan(h.indexOf('public-only'));
    }
  });

  it('o texto está no HTML do servidor (H2) e o bloco é escondido no app nativo antes de pintar', () => {
    for (const L of [AcheiLayout, ReportarLayout]) {
      const h = html(L);
      expect(h).toContain('<h2');
      expect(h).toContain('PetmolApp');
      expect(h).toContain('html[data-petmol-app] .public-only{display:none!important}');
      expect(h).not.toContain('<h1'); // o H1 é da própria tela; não duplicamos
    }
  });

  it('/achei-um-pet: só descreve o que a tela faz', () => {
    const h = html(AcheiLayout);
    for (const t of ['Vi ou encontrei este pet', '5 a 8 segundos', '30 km', 'O telefone do tutor não é exibido', 'dinheiro ou PIX', 'registrar o avistamento']) expect(h).toContain(t);
  });

  it('/reportar-pet-perdido: só descreve o que a tela faz', () => {
    const h = html(ReportarLayout);
    for (const t of ['sem criar conta', 'sem mostrar o seu contato', 'Acompanhamento', 'não informar endereço sensível', 'Pet Sumido']) expect(h).toContain(t);
  });

  it('sem dados pessoais (telefone/e-mail) e links internos válidos para guias e páginas existentes', () => {
    for (const L of [AcheiLayout, ReportarLayout]) {
      const h = html(L);
      expect(h).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
      expect(h).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
      const hrefs = [...h.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(1);
      for (const href of hrefs) expect(href).toMatch(/^\/(guias\/[a-z0-9-]+|achei-um-pet|reportar-pet-perdido)$/);
    }
  });

  it('os metadados (título, descrição, canônica) não mudaram', () => {
    expect(acheiMeta.title).toBe('Achei um pet: avise o tutor | PETMOL');
    expect((acheiMeta.alternates as { canonical: string }).canonical).toBe('/achei-um-pet');
    expect(reportarMeta.title).toBe('Reportar pet perdido | PETMOL');
    expect((reportarMeta.alternates as { canonical: string }).canonical).toBe('/reportar-pet-perdido');
  });

  it('os guias linkados existem', async () => {
    const { getGuideBySlug } = await import('@/features/guides');
    for (const s of ['achei-um-cachorro-o-que-fazer', 'pet-perdido-o-que-fazer-nas-primeiras-horas', 'gato-fugiu-de-casa-volta-sozinho-o-que-fazer']) expect(getGuideBySlug(s), s).toBeDefined();
  });
});
