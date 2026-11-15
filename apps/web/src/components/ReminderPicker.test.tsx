import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ReminderPicker, daysPhrase, indexFromScroll } from './ReminderPicker';

afterEach(() => cleanup());

function Host({ start = '3', onDays = vi.fn(), onTime = vi.fn(), time = '09:00', max }: { start?: string; onDays?: (v: string) => void; onTime?: (v: string) => void; time?: string; max?: number }) {
  const [d, setD] = useState(start);
  return <ReminderPicker days={d} time={time} max={max} onDaysChange={(v) => { onDays(v); setD(v); }} onTimeChange={onTime} />;
}
const slider = () => screen.getByRole('slider', { name: /Antecedência do lembrete/ });

describe('ReminderPicker (roleta vertical)', () => {
  it('mostra o valor atual por extenso e como controle deslizante acessível (0 a 30)', () => {
    render(<Host start="3" />);
    const s = slider();
    expect(s.getAttribute('aria-valuemin')).toBe('0'); expect(s.getAttribute('aria-valuemax')).toBe('30');
    expect(s.getAttribute('aria-valuenow')).toBe('3'); expect(s.getAttribute('aria-valuetext')).toBe('3 dias antes');
    expect(screen.getByText('3 dias antes')).toBeTruthy();   // frase ao lado da roleta
    expect(document.querySelectorAll('[data-day]').length).toBe(31);
    expect(document.querySelector('[data-selected]')?.getAttribute('data-day')).toBe('3');
  });

  it('frases: no próprio dia, singular e plural', () => {
    expect(daysPhrase(0)).toBe('no próprio dia'); expect(daysPhrase(1)).toBe('1 dia antes'); expect(daysPhrase(7)).toBe('7 dias antes'); expect(daysPhrase(null)).toBe('não definido');
  });

  it('teclado: ↑↓ ±1, PageDown/PageUp ±5, Home/End; respeita os limites e entrega TEXTO (contrato antigo)', () => {
    const onDays = vi.fn();
    render(<Host start="3" onDays={onDays} />);
    const s = slider();
    fireEvent.keyDown(s, { key: 'ArrowDown' }); expect(onDays).toHaveBeenLastCalledWith('4');
    fireEvent.keyDown(s, { key: 'ArrowUp' }); fireEvent.keyDown(s, { key: 'ArrowUp' }); expect(onDays).toHaveBeenLastCalledWith('2');
    fireEvent.keyDown(s, { key: 'PageDown' }); expect(onDays).toHaveBeenLastCalledWith('7');
    fireEvent.keyDown(s, { key: 'PageUp' }); expect(onDays).toHaveBeenLastCalledWith('2');
    fireEvent.keyDown(s, { key: 'End' }); expect(onDays).toHaveBeenLastCalledWith('30');
    fireEvent.keyDown(s, { key: 'ArrowDown' }); expect(onDays.mock.calls.at(-1)![0]).toBe('30');    // não passa do fim
    fireEvent.keyDown(s, { key: 'Home' }); expect(onDays).toHaveBeenLastCalledWith('0');
    expect(slider().getAttribute('aria-valuetext')).toBe('no próprio dia');
    expect(typeof onDays.mock.calls[0][0]).toBe('string');
  });

  it('tocar num dia escolhe esse dia; tocar no já escolhido não dispara mudança', () => {
    const onDays = vi.fn();
    render(<Host start="3" onDays={onDays} />);
    fireEvent.click(document.querySelector('[data-day="12"]')!);
    expect(onDays).toHaveBeenCalledTimes(1); expect(onDays).toHaveBeenCalledWith('12');
    fireEvent.click(document.querySelector('[data-day="12"]')!);
    expect(onDays).toHaveBeenCalledTimes(1);
  });

  it('PRESERVA valores já cadastrados: fora da faixa vira dia extra e nada muda sozinho; inválido fica "não definido" sem escrever nada', () => {
    const onDays = vi.fn();
    const { unmount } = render(<Host start="45" onDays={onDays} />);
    expect(slider().getAttribute('aria-valuenow')).toBe('45');
    expect(document.querySelector('[data-selected]')?.getAttribute('data-day')).toBe('45');
    expect(document.querySelectorAll('[data-day]').length).toBe(32);
    expect(onDays).not.toHaveBeenCalled();
    unmount();
    render(<Host start="" onDays={onDays} />);
    expect(slider().getAttribute('aria-valuetext')).toBe('não definido');
    expect(slider().hasAttribute('aria-valuenow')).toBe(false);
    expect(document.querySelector('[data-selected]')).toBeNull();
    expect(onDays).not.toHaveBeenCalled();                                                 // abrir não grava (o padrão 3 continua com o formulário)
  });

  it('sem valor definido, a 1ª seta parte de 3 (o padrão) e não de 0', () => {
    const onDays = vi.fn();
    render(<Host start="" onDays={onDays} />);
    fireEvent.keyDown(slider(), { key: 'ArrowDown' });
    expect(onDays).toHaveBeenCalledWith('4');
  });

  it('hora do lembrete continua editável (formato HH:MM) com rótulo próprio', () => {
    const onTime = vi.fn();
    render(<Host onTime={onTime} time="09:00" />);
    const t = screen.getByLabelText('Horário do lembrete') as HTMLInputElement;
    expect(t.value).toBe('09:00');
    fireEvent.change(t, { target: { value: '07:45' } });
    expect(onTime).toHaveBeenCalledWith('07:45');
  });

  it('rolagem: o dia do centro (índice = scrollTop ÷ passo) vale ao parar; limites e entradas ruins são seguros', () => {
    expect(indexFromScroll(0, 30, 31)).toBe(0);
    expect(indexFromScroll(30 * 7 + 10, 30, 31)).toBe(7);
    expect(indexFromScroll(30 * 7 + 20, 30, 31)).toBe(8);
    expect(indexFromScroll(99999, 30, 31)).toBe(30);
    expect(indexFromScroll(-40, 30, 31)).toBe(0);
    expect(indexFromScroll(NaN, 30, 31)).toBe(0);
    vi.useFakeTimers();
    const onDays = vi.fn();
    render(<Host start="3" onDays={onDays} />);
    const strip = screen.getByTestId('reminder-wheel');
    Object.defineProperty(strip, 'scrollTop', { value: 30 * 9, configurable: true, writable: true });
    vi.advanceTimersByTime(500);                                                           // fim do "scroll programático" da abertura
    fireEvent.scroll(strip);
    vi.advanceTimersByTime(200);
    expect(onDays).toHaveBeenCalledWith('9');
    vi.useRealTimers();
  });

  it('o limite máximo é configurável (ex.: 60) sem mudar o padrão de 30', () => {
    render(<Host start="3" max={60} />);
    expect(document.querySelectorAll('[data-day]').length).toBe(61);
    expect(slider().getAttribute('aria-valuemax')).toBe('60');
  });
});
