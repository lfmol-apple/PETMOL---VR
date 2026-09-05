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
    // dividida com o status)
    const petLine = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Baby');
    expect(petLine).toBeTruthy();
    expect(petLine!.className).toContain('truncate');
    // o status vai numa linha separada, com a bolinha e podendo truncar
    expect(container.textContent).toContain('Próxima dose em 310 dias');
  });

  it('só subtítulo (sem status): fica numa linha só, inline', () => {
    const { container } = render(
      <SheetHeader tone="petmol" title="Vacinas" subtitle="Baby" onClose={() => {}} />,
    );
    expect(container.querySelectorAll('p').length).toBe(0); // sem o par empilhado
    expect(container.textContent).toContain('Baby');
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
