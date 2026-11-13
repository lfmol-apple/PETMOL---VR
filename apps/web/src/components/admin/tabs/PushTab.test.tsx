import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PushTab } from './PushTab';
import { Backend } from '@/components/admin/campaigns/testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
// Os blocos do envio avulso têm testes próprios; aqui só interessa que continuem ali, intactos.
vi.mock('@/components/admin/BroadcastPanel', () => ({ BroadcastPanel: () => <div data-testid="avulso">painel avulso</div> }));
vi.mock('@/components/admin/PromoRadarPanel', () => ({ PromoRadarPanel: () => <div>radar</div> }));
vi.mock('@/components/admin/CampaignsBlock', () => ({ CampaignsPanel: () => <div>campanhas automáticas</div>, FoodCampaignCard: () => <div>ração</div> }));

let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('aba Push — dois modos', () => {
  it('abre no Envio avulso, com o painel de sempre e sem chamar nada de campanhas', () => {
    render(<PushTab />);
    expect(screen.getByRole('tab', { name: /Envio avulso/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('avulso')).toBeTruthy();
    expect(screen.getByText('radar')).toBeTruthy();
    expect(screen.getByText('campanhas automáticas')).toBeTruthy();
    expect(be.calls).toEqual([]);
  });
  it('trocar para Campanhas esconde o avulso SEM desmontá-lo (o que estava sendo escrito não se perde)', async () => {
    render(<PushTab />);
    const avulso = screen.getByTestId('avulso');
    fireEvent.click(screen.getByRole('tab', { name: /Campanhas/ }));
    expect(screen.getByRole('tab', { name: /Campanhas/ }).getAttribute('aria-selected')).toBe('true');
    expect(avulso.isConnected).toBe(true);
    expect(avulso.closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(true);
    await screen.findByRole('button', { name: /Nova campanha/ });
    fireEvent.click(screen.getByRole('tab', { name: /Envio avulso/ }));
    expect(screen.getByTestId('avulso').closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(false);
  });
  it('com a flag desligada, o modo Campanhas só avisa; o avulso segue funcionando', async () => {
    be.enabled = false;
    render(<PushTab />);
    fireEvent.click(screen.getByRole('tab', { name: /Campanhas/ }));
    await screen.findByText(/ainda não foram liberadas/);
    fireEvent.click(screen.getByRole('tab', { name: /Envio avulso/ }));
    expect(screen.getByTestId('avulso')).toBeTruthy();
  });
});
