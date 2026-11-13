/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste: corpos JSON livres */
/** Etapa 6.1 — "Parar envio" (confirmação, estados solicitada → reconhecida → decidir) e limite por lote na interface. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const FILTERS = { version: 1, root: { kind: 'group', op: 'and', items: [] } };
const openCampaign = async (name = 'Ração gatos') => {
  render(<SegmentedCampaigns />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByRole('heading', { name });
};
const sendingBatch = (c: any) => be.addBatch(c, { phase: 'sending', reserved: 20, requested: 20, counts: { reserved: 12, sending: 1, accepted: 7, failed: 0, uncertain: 0 }, filters: FILTERS });

describe('R1 — Parar envio', () => {
  it('o botão só aparece para lote em andamento (não em concluído nem interrompido)', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { phase: 'done', filters: FILTERS });
    be.addBatch(c, { phase: 'interrupted', counts: { reserved: 3, sending: 0, accepted: 5, failed: 0, uncertain: 0 }, filters: FILTERS });
    await openCampaign();
    expect(screen.queryByRole('button', { name: 'Parar envio' })).toBeNull();
    cleanup();
    be.campaigns.length = 0;
    const c2 = be.addCampaign(); sendingBatch(c2);
    await openCampaign();
    expect(screen.getByRole('button', { name: 'Parar envio' })).toBeTruthy();
  });

  it('exige confirmação explícita: clicar em "Parar envio" só abre a pergunta; cancelar não chama o servidor', async () => {
    const c = be.addCampaign(); sendingBatch(c);
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: 'Parar envio' }));
    const dlg = screen.getByRole('alertdialog', { name: 'Confirmar parada do envio' });
    expect(within(dlg).getByText(/já recebeu continua registrado/)).toBeTruthy();
    expect(within(dlg).getByText(/incertos nunca são reenviados/)).toBeTruthy();
    expect(be.count('POST', '/stop')).toBe(0);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(be.count('POST', '/stop')).toBe(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirmar envia {confirm:true}; a tela mostra "Parada solicitada" e some o botão (sem pedir de novo)', async () => {
    const c = be.addCampaign(); const b = sendingBatch(c);
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: 'Parar envio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, parar o envio' }));
    await screen.findByLabelText('Parada solicitada');
    expect(be.last('POST', `/batches/${b.id}/stop`)!.body).toEqual({ confirm: true });
    expect(screen.queryByRole('button', { name: 'Parar envio' })).toBeNull();
    expect(screen.getByText(/não é cancelado/)).toBeTruthy();                      // a chamada em curso não é dada como cancelada
    expect(screen.getByLabelText('Etapas da parada').textContent).toMatch(/Solicitada.*Reconhecida.*Decidir/);
  });

  it('clique duplicado em "Sim, parar" gera um único pedido', async () => {
    be.delayMs = 40;
    const c = be.addCampaign(); sendingBatch(c);
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: 'Parar envio' }));
    const yes = screen.getByRole('button', { name: 'Sim, parar o envio' });
    fireEvent.click(yes); fireEvent.click(yes); fireEvent.click(yes);
    await screen.findByLabelText('Parada solicitada');
    expect(be.count('POST', '/stop')).toBe(1);
  });

  it('quando o servidor reconhece a parada, a tela passa a "Envio parado a seu pedido" com continuar/devolver (sem reenviar falhos/incertos)', async () => {
    const c = be.addCampaign(); const b = sendingBatch(c);
    b.stop = { state: 'requested', requested_at: '2026-11-13T12:09:00Z', acknowledged_at: null };
    await openCampaign();
    expect(screen.getByLabelText('Parada solicitada')).toBeTruthy();
    b.counts = { reserved: 12, sending: 0, accepted: 7, failed: 0, uncertain: 1 };
    be.ackStop(b);
    await waitFor(() => expect(screen.getByText(/Envio parado a seu pedido/)).toBeTruthy(), { timeout: 6000 });
    expect(screen.getByRole('button', { name: /Continuar só os 12 nunca tentados/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Devolver os 12 ao público/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reenviar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Parar envio' })).toBeNull();
  }, 10000);

  it('lote que terminou antes da parada valer: aviso claro', async () => {
    const c = be.addCampaign();
    const b = be.addBatch(c, { phase: 'done', filters: FILTERS });
    b.stop = { state: 'finished_before_stop', requested_at: 'x', acknowledged_at: 'y' };
    await openCampaign();
    expect(screen.getByText(/pediu a parada, mas o lote já tinha terminado/)).toBeTruthy();
  });

  it('erro "lote não está mais em envio" é explicado e a tela se atualiza', async () => {
    const c = be.addCampaign(); sendingBatch(c);
    await openCampaign();
    be.on('POST /batches/' + c.batches[0].id + '/stop', () => ({ status: 409, json: { detail: { code: 'batch_not_running', message: 'x' } } }));
    fireEvent.click(screen.getByRole('button', { name: 'Parar envio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, parar o envio' }));
    expect(await screen.findByText(/já terminou ou já estava interrompido/)).toBeTruthy();
  });
});

describe('R2 — limite por lote na interface', () => {
  beforeEach(() => { be.maxBatch = 5; });

  it('informa o limite e que o sistema não divide nem reduz o pedido', async () => {
    be.addCampaign();
    await openCampaign();
    const box = await screen.findByTestId('limite-por-lote');
    expect(box.textContent).toContain('Limite por lote: 5 tutores');
    expect(box.textContent).toMatch(/não divide o pedido em vários lotes nem o reduz sozinho/);
  });

  it('pedido acima do limite: aviso em vermelho e "Conferir prévia" bloqueado; no limite: libera', async () => {
    be.addCampaign();
    await openCampaign();
    const qty = screen.getByLabelText('Quantidade de tutores no lote');
    fireEvent.change(qty, { target: { value: '6' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/pediu 6, acima do limite de 5/);
    expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(qty, { target: { value: '5' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('"Todos os disponíveis" acima do limite: orienta a escolher uma quantidade e bloqueia', async () => {
    be.available = 120;
    be.addCampaign();
    await openCampaign();
    fireEvent.click(screen.getByLabelText(/Todos os disponíveis/));
    expect((await screen.findByText(/Há 120 disponíveis, acima do limite de 5/)).textContent).toMatch(/Escolha “Quantidade” e informe até 5/);
    expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('limite de 1 (primeiro teste real): singular e só aceita 1', async () => {
    be.maxBatch = 1; be.available = 1;
    be.addCampaign();
    await openCampaign();
    expect((await screen.findByTestId('limite-por-lote')).textContent).toContain('Limite por lote: 1 tutor ');
    fireEvent.change(screen.getByLabelText('Quantidade de tutores no lote'), { target: { value: '2' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/acima do limite de 1/);
  });

  it('se o servidor recusar por teto (ex.: limite mudou), a mensagem do servidor aparece e a prévia é descartada', async () => {
    be.maxBatch = null;                                                         // a tela ainda não sabe do teto
    be.addCampaign();
    await openCampaign();
    fireEvent.change(screen.getByLabelText('Quantidade de tutores no lote'), { target: { value: '30' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(false));
    be.maxBatch = 10;                                                           // o servidor passa a ter teto
    fireEvent.click(screen.getByRole('button', { name: /Conferir prévia/ }));
    expect(await screen.findByText(/O limite por lote é 10 tutor\(es\) e você pediu 30/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Prévia do lote' })).toBeNull();
  });
});
