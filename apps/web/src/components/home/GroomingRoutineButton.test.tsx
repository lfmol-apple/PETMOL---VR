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

  it('atrasado: pisca vermelho, igual ao sino e à localização', () => {
    render(<GroomingRoutineButton state="overdue" onClick={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Banho e tosa — atrasado' });
    expect(b.className).toContain('animate-pulse');
    expect(b.className).toContain('bg-red-500');
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
  });
});
