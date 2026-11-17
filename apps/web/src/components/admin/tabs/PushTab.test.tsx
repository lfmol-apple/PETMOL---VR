import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PushTab } from './PushTab';
import { Backend } from '@/components/admin/campaigns/testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/components/admin/CampaignsBlock', () => ({ CampaignsPanel: () => <div>campanhas automáticas</div>, FoodCampaignCard: () => <div>ração</div> }));

let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('aba Push — só campanhas de link', () => {
  it('não há envio avulso nem modo para escolher: só campanhas de link', async () => {
    render(<PushTab />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText(/Envio avulso/)).toBeNull();
    expect(screen.queryByText(/Enviar notificação/)).toBeNull();
    await screen.findByRole('button', { name: /Nova campanha/ });
  });
  it('com a flag desligada, só avisa', async () => {
    be.enabled = false;
    render(<PushTab />);
    await screen.findByText(/ainda não foram liberadas/);
  });
});
