import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { DateField } from './DateField';

/** Wrapper controlado — o uso real sempre guarda `value` no estado do pai. */
function Controlled({ initial = '', max }: { initial?: string; max?: string }) {
  const [value, setValue] = useState(initial);
  return <DateField value={value} onChange={setValue} max={max} />;
}

describe('DateField', () => {
  it('digitar DDMMAAAA pelo teclado formata e vira ISO', () => {
    render(<Controlled />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15032020' } });
    expect(input.value).toBe('15/03/2020');
  });

  it('data incompleta não dispara onChange ainda', () => {
    const onChange = vi.fn();
    render(<DateField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '1503' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mês inválido (>12) não gera ISO', () => {
    const onChange = vi.fn();
    render(<DateField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '15132020' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dia inválido pro mês (31 de abril) não gera ISO', () => {
    const onChange = vi.fn();
    render(<DateField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '31042020' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('valor inicial em ISO aparece formatado em pt-BR', () => {
    render(<Controlled initial="1998-07-04" />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA') as HTMLInputElement;
    expect(input.value).toBe('04/07/1998');
  });

  it('apagar o campo inteiro avisa o formulário (campo opcional limpo)', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-01-15" onChange={onChange} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('botão de calendário existe e é independente do campo de texto', () => {
    render(<Controlled />);
    expect(screen.getByRole('button', { name: 'Abrir calendário' })).toBeTruthy();
  });
});
