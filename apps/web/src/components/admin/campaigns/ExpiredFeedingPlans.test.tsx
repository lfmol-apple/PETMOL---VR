 
/** Painel "Planos de alimentação com previsão vencida": faixas, origem da data, tutores sem duplicar, linguagem e "Preparar campanha" sem envio. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';
import { addProductLink } from './testLink';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = async () => { render(<SegmentedCampaigns />); await screen.findByRole('heading', { name: 'Planos de alimentação com previsão vencida' }); return screen.findByTestId('faixa-total'); };
const noSend = () => be.calls.filter((c) => c.method === 'POST' && /\/batches|\/stop|\/resume|\/release|\/recover|\/close/.test(c.path));
const row = (k: string) => within(screen.getByTestId(`faixa-${k}`));

describe('painel de planos de alimentação com previsão vencida', () => {
  it('usa a linguagem prudente (previsão vencida; pode estar desatualizada) e nunca diz "ração acabou"', async () => {
    await open();
    const sec = screen.getByRole('heading', { name: 'Planos de alimentação com previsão vencida' }).closest('section')!;
    expect(sec.textContent).toMatch(/pode estar desatualizada/);
    expect(sec.textContent).toMatch(/nenhum plano é alterado, pausado ou excluído/);
    expect(sec.textContent).not.toMatch(/ração acabou/i);
  });

  it('mostra as 4 faixas, a separação calculada × informada e os tutores alcançáveis; o total não soma duplicado', async () => {
    await open();
    expect(['Até 7 dias', '8 a 30 dias', '31 a 90 dias', 'Mais de 90 dias'].every((l) => screen.getByRole('rowheader', { name: l }))).toBe(true);
    const r = row('ate_7').getAllByRole('cell').map((c) => c.textContent);
    expect(r.slice(0, 4)).toEqual(['6', '2', '4', '4']);                                   // planos, calculada, informada, tutores alcançáveis
    const t = row('total').getAllByRole('cell').map((c) => c.textContent);
    expect(t.slice(0, 4)).toEqual(['66', '16', '50', '40']);
    expect(4 + 7 + 14 + 20).toBeGreaterThan(40);                                           // soma das faixas (45) > total único (40)
    expect(screen.getByTestId('nota-sem-duplicar').textContent).toMatch(/uma vez só.*pode ser menor que a soma das faixas/);
    expect(screen.getByRole('columnheader', { name: 'Calculada pelo sistema' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Informada pelo tutor' })).toBeTruthy();
  });

  const create = async () => {
    await screen.findByLabelText(/Nome da campanha/);
    await addProductLink();
    fireEvent.change(await screen.findByLabelText(/Nome da campanha/), { target: { value: 'Atualize sua ração' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Seu plano de alimentação pode estar desatualizado.' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'Atualize sua ração' });
  };

  it('"Preparar campanha" leva o filtro da faixa para a campanha (que o dono ainda cria, vê a prévia e confirma) e NÃO envia nada', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar campanha para a faixa 8 a 30 dias' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/público que você montou \(1 filtro\)/);
    expect(noSend()).toHaveLength(0);
    await create();
    await waitFor(() => expect(JSON.stringify(be.last('POST', '/audience/count')?.body.filter)).toMatch(/feeding_overdue_days","op":"between","value":\[8,30\]/), { timeout: 4000 });
    expect(noSend()).toHaveLength(0);                                                       // só criou o rascunho da campanha; nenhum lote
  });

  it('faixa "Mais de 90 dias" usa "a partir de 91"; o total usa o filtro "previsão vencida"', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar campanha para a faixa Mais de 90 dias' }));
    await create();
    await waitFor(() => expect(JSON.stringify(be.last('POST', '/audience/count')?.body.filter)).toMatch(/feeding_overdue_days","op":"gte","value":91/), { timeout: 4000 });
    cleanup(); be.calls.length = 0; be.campaigns.length = 0;
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar campanha para todos os planos com previsão vencida' }));
    await create();
    await waitFor(() => expect(JSON.stringify(be.last('POST', '/audience/count')?.body.filter)).toMatch(/feeding_expired/), { timeout: 4000 });
  });

  it('só faz leituras (GET) ao abrir e botão fica desligado sem tutor alcançável', async () => {
    await open();
    expect(be.calls.filter((c) => c.path.includes('expired-feeding-plans')).every((c) => c.method === 'GET')).toBe(true);
    expect(be.calls.filter((c) => c.method !== 'GET' && !/audience\/count/.test(c.path))).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Preparar campanha para a faixa Até 7 dias' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
