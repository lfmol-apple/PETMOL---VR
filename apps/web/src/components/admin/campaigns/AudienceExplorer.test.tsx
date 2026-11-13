/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); be.useWorld(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Explorar o público: filtros visíveis ao entrar em Campanhas, sem criar campanha', () => {
  it('mostra o construtor de filtros e conta cães/gatos sem criar nada nem chamar envio', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByText(/Explorar o público/);
    const box = screen.getByLabelText(/Explorar o público/, { selector: 'section' });
    fireEvent.click(within(box).getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = within(box).getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Espécie/ }));
    fireEvent.click(within(box).getByLabelText('Gato'));
    await waitFor(() => expect(within(box).getByText('Atendem aos filtros').nextElementSibling?.textContent).toBe('200'), { timeout: 3000 });
    const last = be.last('POST', '/audience/count')!;
    expect(last.body.filter.root.items[0].items[0]).toMatchObject({ field: 'pet_species', value: ['cat'] });
    expect(last.body.campaign_id).toBeUndefined();                      // sem campanha
    expect(be.count('POST', '/campaigns')).toBe(0);                      // nada criado
    expect(be.calls.some((c) => c.method === 'POST' && /batches|stop|resume|release/.test(c.path))).toBe(false);   // nada reservado/enviado
  });

  it('oferece idade e peso entre os filtros do grupo Pet', async () => {
    render(<SegmentedCampaigns />);
    const box = (await screen.findByLabelText(/Explorar o público/, { selector: 'section' })) as HTMLElement;
    fireEvent.click(within(box).getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = within(box).getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    for (const f of [/^Espécie/, /^Sexo do pet/, /^Raça contém/, /^Idade do pet/, /^Peso do pet/, /^Castrado/]) expect(within(group).getByRole('button', { name: f })).toBeTruthy();
  });

  it('com filtro incompleto não consulta e avisa o que falta', async () => {
    render(<SegmentedCampaigns />);
    const box = (await screen.findByLabelText(/Explorar o público/, { selector: 'section' })) as HTMLElement;
    fireEvent.click(within(box).getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = within(box).getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Espécie/ }));
    expect(within(box).getByText(/Complete os filtros/)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 600));
    expect(be.count('POST', '/audience/count')).toBe(0);
  });
});
