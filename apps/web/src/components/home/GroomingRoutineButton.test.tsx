import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GroomingRoutineButton } from './GroomingRoutineButton';

afterEach(cleanup);

describe('GroomingRoutineButton', () => {
  it('nunca controlado: apagado com risquinho; toque abre o sheet', () => {
    const open = vi.fn();
    render(<GroomingRoutineButton state="none" onClick={open} />);
    expect(screen.getByTestId('banho-inativo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Banho e tosa' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('agendado e a ocorrer: verde, sem risquinho e sem piscar', () => {
    render(<GroomingRoutineButton state="scheduled" onClick={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Banho e tosa — agendado' });
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
    expect(b.className).toContain('bg-emerald-500');
    expect(b.className).not.toContain('animate-pulse');
  });

  it('carregando: neutro e SEM risquinho (não mostra o "nunca controlado" falso)', () => {
    render(<GroomingRoutineButton state="loading" onClick={vi.fn()} />);
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
    const b = screen.getByRole('button', { name: 'Banho e tosa' });
    expect(b.className).not.toContain('bg-emerald-500');
    expect(b.className).not.toContain('animate-pulse');
  });

  it('é hora (dentro da folga): âmbar fixo, sem piscar e sem risquinho', () => {
    render(<GroomingRoutineButton state="due" onClick={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Banho e tosa — é hora' });
    expect(b.className).toContain('bg-amber-500');
    expect(b.className).not.toContain('animate-pulse');
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
  });

  it('atrasado: pisca âmbar (diferente do vermelho do sino e da localização)', () => {
    render(<GroomingRoutineButton state="overdue" onClick={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Banho e tosa — atrasado' });
    expect(b.className).toContain('animate-pulse');
    expect(b.className).toContain('bg-amber-500');
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
  });
});
