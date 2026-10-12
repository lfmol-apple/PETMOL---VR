import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SheetHeader, SheetIcon, SheetAvatar } from './SheetHeader';

describe('SheetHeader', () => {
  it('tone claro: título escuro, botão fechar cinza, hairline presente', () => {
    const { container } = render(
      <SheetHeader tone="white" title="Alimentação" subtitle="Baby" onClose={() => {}} />,
    );
    const h2 = container.querySelector('h2')!;
    expect(h2.className).toContain('text-slate-900');
    expect(h2.textContent).toBe('Alimentação');
    // hairline (só nos tons claros)
    expect(container.querySelector('.bg-gradient-to-r')).toBeTruthy();
    const close = container.querySelector('button[aria-label="Fechar"]')!;
    expect(close.className).toContain('bg-slate-900/[0.06]');
  });

  it('tone="petmol": bloco azul, título branco/black, botões brancos, sem hairline', () => {
    const { container } = render(
      <SheetHeader
        tone="petmol"
        withHandle
        title="Alimentação do Baby"
        subtitle="Sobra pra 12 dias"
        onClose={() => {}}
      />,
    );
    const header = container.firstElementChild as HTMLElement;
    expect(header.className).toContain('bg-[#0056D2]');
    expect(header.className).toContain('text-white');

    const h2 = container.querySelector('h2')!;
    expect(h2.className).toContain('text-white');
    expect(h2.className).toContain('font-black');

    // sem hairline no petmol
    expect(container.querySelector('.bg-gradient-to-r')).toBeNull();

    // botão fechar branco translúcido, focus ring branco + offset azul
    const close = container.querySelector('button[aria-label="Fechar"]')!;
    expect(close.className).toContain('bg-white/15');
    expect(close.className).toContain('text-white');
    expect(close.className).toContain('focus-visible:ring-offset-[#0056D2]');

    // puxador do bottom-sheet dentro do header
    expect(container.querySelector('.bg-white\\/40')).toBeTruthy();
  });

  it('petmol preserva onBack (chevron) com o mesmo estilo de botão', () => {
    const { container } = render(
      <SheetHeader tone="petmol" title="Comprar ração" onBack={() => {}} />,
    );
    const back = container.querySelector('button[aria-label="Voltar"]')!;
    expect(back).toBeTruthy();
    expect(back.className).toContain('bg-white/15');
  });

  it('subtítulo + status: empilhados, nome do pet numa linha própria (não some pra caber o status)', () => {
    const { container } = render(
      <SheetHeader
        tone="petmol"
        withHandle
        title="Vacinas"
        subtitle="Baby"
        status={{ label: 'Próxima dose em 310 dias', tone: 'warn' }}
        onClose={() => {}}
      />,
    );
    // o nome do pet aparece inteiro (não truncado dentro de uma linha
    // dividida com o status) e NÃO em caixa alta ("BABY" parecia grito)
    const petLine = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Baby');
    expect(petLine).toBeTruthy();
    expect(petLine!.className).toContain('truncate');
    expect(petLine!.className).not.toContain('uppercase');
    // o status vai numa linha separada, com a bolinha, em caixa alta (eyebrow)
    expect(container.textContent).toContain('Próxima dose em 310 dias');
    const statusLine = Array.from(container.querySelectorAll('p')).find((p) => p.textContent?.includes('Próxima dose'));
    expect(statusLine!.className).toContain('uppercase');
  });

  it('só subtítulo (sem status): linha única, sem caixa alta', () => {
    const { container } = render(
      <SheetHeader tone="petmol" title="Vacinas" subtitle="Baby" onClose={() => {}} />,
    );
    const petLine = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Baby');
    expect(petLine).toBeTruthy();
    expect(petLine!.className).not.toContain('uppercase');
  });

  it('só status (sem subtítulo): linha única, em caixa alta', () => {
    const { container } = render(
      <SheetHeader tone="petmol" title="Vacinas" status={{ label: 'Em dia', tone: 'good' }} onClose={() => {}} />,
    );
    const statusLine = Array.from(container.querySelectorAll('p')).find((p) => p.textContent?.includes('Em dia'));
    expect(statusLine).toBeTruthy();
    expect(statusLine!.className).toContain('uppercase');
  });

  it('status longo corta com reticências em vez de estourar atrás do botão de fechar (achado real 12/10/2026)', () => {
    const { container } = render(
      <SheetHeader
        tone="petmol"
        title="Vacinas"
        subtitle="Princesa"
        status={{ label: 'Pode estar na hora de revisar 1 registro', tone: 'danger' }}
        onClose={() => {}}
      />,
    );
    // .find() pegaria o <span> wrapper primeiro (vem antes no DOM e seu
    // textContent também inclui o texto do filho) — pega o ÚLTIMO span cujo
    // texto bate, que é o <span> de texto mais interno, não o wrapper.
    const matches = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.textContent === 'Pode estar na hora de revisar 1 registro',
    );
    const statusTextSpan = matches[matches.length - 1]!;
    expect(statusTextSpan).toBeTruthy();
    // precisa das três classes juntas pra truncate funcionar dentro de um
    // flex row: min-w-0 (aceita encolher abaixo do conteúdo), flex-1 (ocupa
    // o espaço restante, não o tamanho do texto) e truncate (corta com "...").
    expect(statusTextSpan.className).toContain('min-w-0');
    expect(statusTextSpan.className).toContain('flex-1');
    expect(statusTextSpan.className).toContain('truncate');
    // o wrapper precisa ser "flex" (bloco), não "inline-flex" — um elemento
    // inline não ganha uma caixa encolhível de verdade só com min-w-0 no pai.
    const wrapper = statusTextSpan.parentElement!;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).not.toContain('inline-flex');
  });

  it('wrapTitle deixa o título quebrar (sem truncate)', () => {
    const { container } = render(
      <SheetHeader tone="petmol" wrapTitle title="Continue os cuidados da Nine Mol" onClose={() => {}} />,
    );
    const h2 = container.querySelector('h2')!;
    expect(h2.className).not.toContain('truncate');
    expect(h2.className).toContain('overflow-wrap:anywhere');
  });
});

describe('SheetIcon tone="onPetmol"', () => {
  it('fica branco com ícone azul, pra usar sobre o cabeçalho petmol', () => {
    const { container } = render(<SheetIcon tone="onPetmol"><svg /></SheetIcon>);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('bg-white');
    expect(box.className).toContain('text-[#0056D2]');
  });
});

describe('SheetAvatar', () => {
  it('usa anel branco translúcido (funciona em fundo claro e azul)', () => {
    const { container } = render(<SheetAvatar fallback="🐶" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('ring-white/70');
  });
});
