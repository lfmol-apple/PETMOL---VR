import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateField } from './DateField';

afterEach(cleanup);

describe('DateField — regra de datas do PETMOL: digitar é o padrão; o calendário abre o seletor do aparelho', () => {
  it('digitar DD/MM/AAAA no teclado numérico formata e entrega a data ISO', () => {
    const onChange = vi.fn();
    render(<DateField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    fireEvent.change(input, { target: { value: '19102026' } });
    expect(input.value).toBe('19/10/2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19');
  });

  it('data inválida ou incompleta não dispara mudança; apagar avisa com vazio', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-10-19" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '31022026' } });      // 31/02 não existe
    fireEvent.change(input, { target: { value: '1910' } });          // incompleta
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('o calendário abre o seletor nativo do aparelho: <input type="date"> transparente POR CIMA do ícone, tocável (iOS exige o toque direto)', () => {
    const onChange = vi.fn();
    const { container } = render(<DateField value="2026-10-19" onChange={onChange} />);
    const native = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(native).toBeTruthy();
    expect(native.className).toContain('opacity-0');
    expect(native.className).not.toContain('pointer-events-none');   // o dedo precisa chegar nele
    expect(native.className).toMatch(/\bright-0\b/);                  // fica sobre o ícone, à direita
    fireEvent.change(native, { target: { value: '2026-11-02' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-02');
  });

  it('o botão do calendário continua para teclado/leitor de tela e usa showPicker quando existe', () => {
    const showPicker = vi.fn();
    const { container } = render(<DateField value="2026-10-19" onChange={vi.fn()} />);
    const native = container.querySelector('input[type="date"]') as HTMLInputElement & { showPicker?: () => void };
    native.showPicker = showPicker;
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('aceita rótulo de acessibilidade para filtros compactos', () => {
    render(<DateField value="" onChange={vi.fn()} ariaLabel="De" />);
    expect(screen.getByLabelText('De')).toBeTruthy();
  });
});
