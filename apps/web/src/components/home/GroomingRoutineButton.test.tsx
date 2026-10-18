import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GroomingRoutineButton } from './GroomingRoutineButton';

afterEach(cleanup);

describe('GroomingRoutineButton', () => {
  it('sem lembrete: apagado com risquinho; toque abre o sheet de banho e tosa', () => {
    const open = vi.fn();
    render(<GroomingRoutineButton active={false} onClick={open} />);
    expect(screen.getByTestId('banho-inativo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Banho e tosa' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('com lembrete: verde, sem risquinho', () => {
    render(<GroomingRoutineButton active onClick={vi.fn()} />);
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Banho e tosa — lembrete ligado' })).toBeTruthy();
  });
});
