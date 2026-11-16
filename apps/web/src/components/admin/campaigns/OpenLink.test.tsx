import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentReadOnly } from './ContentForm';

const base = { title: 'Oi', message: 'Olha isso', goal: null, destination: 'produto', product_title: 'Ração X' };

describe('ContentReadOnly: notificação clicável', () => {
  afterEach(() => cleanup());
  it('o cartão da notificação e o link abrem o destino em nova aba', () => {
    const url = 'https://loja.example/p?aff=1';
    render(<ContentReadOnly content={{ ...base, product_url: url, open_url: url }} locked destinations={{ produto: 'Produto' }} />);
    const card = screen.getByTestId('push-preview-link');
    expect(card.getAttribute('href')).toBe(url);
    expect(card.getAttribute('target')).toBe('_blank');
    expect(card.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: url }).getAttribute('href')).toBe(url);
  });
  it('destino de tela do app também é clicável', () => {
    render(<ContentReadOnly content={{ ...base, destination: 'food', product_url: null, open_url: '/home?modal=food' }} locked={false} destinations={{ food: 'Ração' }} />);
    expect(screen.getByTestId('push-preview-link').getAttribute('href')).toBe('/home?modal=food');
  });
});
