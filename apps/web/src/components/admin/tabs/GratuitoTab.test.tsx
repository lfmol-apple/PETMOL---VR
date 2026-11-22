import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('@/components/admin/AdminUi', async (orig) => ({ ...(await orig<object>()), adminApi: api.adminApi }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 't' }));

import { GratuitoTab, GRATUITO_PUSH_MESSAGE, GRATUITO_PUSH_TITLE } from './GratuitoTab';

const now = { downloads: 2411, cadastros: 1000, pets: 800, alimentacao: 500, notificacoes: 400, localizacao: 100 };
const situations = [
  { key: 'sem_pet_sem_push', label: 'Sem pet, sem notificação', people: 100, push: 'Não', email: 'E-mail' },
  { key: 'tudo', label: 'Tem tudo', people: 50, push: 'Não', email: 'Ninguém' },
];
const email = { campaign_id: 'g1', subject: 'Uma conversa sincera sobre a sua conta gratuita do PETMOL', sent: 0, last_sent_at: null, state: null,
  tracking: { recipients: 200, clicks: 40, clickers: 30, by_link: { alimentacao: 25, notificacoes: 15 }, with_food: 90, with_push: 120, with_pet: 180 } };
const base = { baseline: null, now, situations, email, email_groups: { dia0: 600, dia3: 120 } };
const card = (key: string, label: string, b: number, a: number, over: Record<string, unknown> = {}) => ({
  key, label, before: { abs: b, pct: key === 'cadastros' || key === 'downloads' ? null : (b / 1000) * 100 }, now: { abs: a, pct: key === 'cadastros' || key === 'downloads' ? null : (a / 1100) * 100 },
  delta_abs: a - b, delta_pp: 1.5, moved: 40, moved_pct: 20, new_with: 10, lost: 2, denominator: 'das pessoas cadastradas', ...over,
});
const withBaseline = { ...base, baseline: { taken_at: '2026-11-17T17:00:00Z', taken_by: 'dono@x.com', values: now },
  cards: [card('downloads', 'Downloads', 2411, 2500), card('cadastros', 'Pessoas cadastradas', 1000, 1100), card('pets', 'Pet cadastrado', 800, 900), card('alimentacao', 'Ração cadastrada', 500, 590), card('notificacoes', 'Notificação ativa', 400, 430), card('localizacao', 'Localização ativa', 100, 140)] };

describe('aba Gratuito', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('antes de congelar: mostra os números de hoje com % sobre cadastros (downloads só número) e oferece congelar', async () => {
    api.adminApi.mockResolvedValue(base);
    render(<GratuitoTab />);
    await screen.findByText('Congelar os números de hoje (início da campanha)');
    expect(screen.getByText('80% dos cadastros')).toBeTruthy();       // pet 800 de 1000
    expect(screen.getByText('50% dos cadastros')).toBeTruthy();       // ração
    expect(screen.getByText('base dos percentuais')).toBeTruthy();
    expect(screen.getByText(/Downloads hoje: 2\.411 \(só número/)).toBeTruthy();
  });

  it('congelar exige confirmação e chama o endpoint', async () => {
    api.adminApi.mockImplementation(async (path: string) => (path === '/gratuito/summary' ? base : { ok: true }));
    render(<GratuitoTab />);
    fireEvent.click(await screen.findByText('Congelar os números de hoje (início da campanha)'));
    expect(api.adminApi).not.toHaveBeenCalledWith('/gratuito/baseline', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Sim, congelar agora' }));
    await waitFor(() => expect(api.adminApi).toHaveBeenCalledWith('/gratuito/baseline', { method: 'POST', body: JSON.stringify({}) }));
  });

  it('depois de congelar: cada card mostra antes, agora, quem passou a ter e quem saiu; downloads fora dos cards de %', async () => {
    api.adminApi.mockResolvedValue(withBaseline);
    render(<GratuitoTab />);
    const c = await screen.findByTestId('card-alimentacao');
    expect(c.textContent).toContain('Antes: 500');
    expect(c.textContent).toContain('Agora: 590');
    expect(c.textContent).toContain('+40 passaram a ter');
    expect(c.textContent).toContain('20% de quem não tinha');
    expect(c.textContent).toContain('10 já entraram com');
    expect(c.textContent).toContain('2 deixaram de ter');
    expect(screen.queryByTestId('card-downloads')).toBeNull();
    expect(screen.getByText(/Downloads: 2\.411 → 2\.500 \(só número\)/)).toBeTruthy();
    expect(screen.getByTestId('card-cadastros').textContent).toContain('+40 novos cadastros');
  });

  it('quadro: lista as situações com a % dos cadastros', async () => {
    api.adminApi.mockResolvedValue(base);
    render(<GratuitoTab />);
    await screen.findByText('Quem recebe o quê');
    expect(screen.getByText('Sem pet, sem notificação')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();                     // 100 de 1000
  });

  it('notificação: texto fixo; o teste leva "TESTE." e vai para o atalho; "todos" usa o público faltam_passos e pede confirmação digitada', async () => {
    api.adminApi.mockImplementation(async (path: string) => {
      if (path === '/gratuito/summary') return base;
      if (path === '/broadcast/preview') return { will_send: 3, sample: { title: 'Ana, continue com o PETMOL gratuito', body: 'x' }, test_accounts: [{ name: 'Leonardo', has_push: true }], destination_label: 'Atalho' };
      return { id: 'b1' };
    });
    render(<GratuitoTab />);
    expect(await screen.findByText(GRATUITO_PUSH_TITLE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    await screen.findByText('Enviar teste');
    const first = api.adminApi.mock.calls.find(([p]) => p === '/broadcast/preview')!;
    const b = JSON.parse(first[1].body);
    expect(b).toMatchObject({ destination: 'atalho', goal: 'atalho', segment: 'todos', audience: { kind: 'test' }, title: GRATUITO_PUSH_TITLE });
    expect(b.message).toBe(`TESTE. ${GRATUITO_PUSH_MESSAGE}`);
    fireEvent.click(screen.getByLabelText(/Todos que falta algo/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    const send = await screen.findByRole('button', { name: 'Enviar para 3' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    const calls = api.adminApi.mock.calls.filter(([p]) => p === '/broadcast/preview');
    const all = JSON.parse(calls[calls.length - 1][1].body);
    expect(all).toMatchObject({ segment: 'faltam_passos', audience: { kind: 'all' } });
    expect(all.message).toBe(GRATUITO_PUSH_MESSAGE);                  // sem "TESTE." no envio real
    fireEvent.change(screen.getByLabelText('Para confirmar, digite 3'), { target: { value: '3' } });
    expect((screen.getByRole('button', { name: 'Enviar para 3' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('e-mail: grupos com contagem, ver como fica, e envio com confirmação digitada', async () => {
    api.adminApi.mockImplementation(async (path: string) => {
      if (path === '/gratuito/summary') return base;
      if (path.endsWith('/html')) return { subject: 'Assunto', html: '<p>corpo</p>' };
      if (path.endsWith('/preview')) return { will_send: 600, audience_total: 600, already_received: 0, sample: { subject: 'Assunto', text: '' } };
      return { started: true };
    });
    render(<GratuitoTab />);
    await screen.findByText(/Dia 0: quem a notificação não alcança \(600\)/);
    expect(screen.getByText(/Dia 3: 2º contato, tem notificação e ainda falta algo \(120\)/)).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && !!el.textContent?.includes('30 pessoas clicaram (15% de 200)'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver como o e-mail fica' }));
    await screen.findByTitle('Pré-visualização do e-mail');
    fireEvent.click(screen.getByLabelText('Todos do grupo'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos recebem' }));
    const send = await screen.findByRole('button', { name: 'Enviar para 600' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Digite 600 para confirmar'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 600' }));
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/email-campaigns/g1/send' && JSON.parse(i.body).confirm_count === 600 && JSON.parse(i.body).segment === 'gratuito_dia0')).toBe(true));
  });

  const progressBase = { found: true, id: 'b1', phase: 'sending', total: 200, processed: 50, accepted: 40, failed: 4, uncertain: 6, queued: 140, in_flight: 10, quiet_pending: 0, released: 0, created_at: '2026-11-21T12:00:00Z', quiet_due_now: 0, can_resume: false, can_release: false };
  const route = (over: Record<string, unknown> = {}) => api.adminApi.mockImplementation(async (path: string) => {
    if (path === '/gratuito/summary') return base;
    if (path === '/broadcast/progress/latest?goal=atalho') return over.progress ?? { found: false };
    if (path === '/broadcast/preview') return over.preview ?? { will_send: 3, already_received: 5, sample: null };
    return over.other ?? { id: 'b1' };
  });
  const lastPreview = () => { const c = api.adminApi.mock.calls.filter(([p]) => p === '/broadcast/preview'); return JSON.parse(c[c.length - 1][1].body); };

  it('notificação: por padrão quem já foi tratado fica de fora; reenvio é opção explícita e exige confirmação própria', async () => {
    route({ preview: { will_send: 3, already_received: 5, already_breakdown: { accepted: 3, uncertain: 2, in_progress: 0 }, sample: null } });
    render(<GratuitoTab />);
    await screen.findByText(GRATUITO_PUSH_TITLE);
    fireEvent.click(screen.getByLabelText(/Todos que falta algo/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    await screen.findByText(/5 já receberam antes e ficam de fora/);
    expect(screen.getByText(/2 incertas \(não serão reenviadas sozinhas\)/)).toBeTruthy();
    expect(lastPreview().include_already).toBeUndefined();
    expect(lastPreview().exclude_received_goal).toBeUndefined();            // a regra é do servidor; o front não manda mais o contrário
    fireEvent.click(screen.getByLabelText(/Incluir quem já recebeu esta notificação/));
    expect(screen.queryByText(/já receberam antes e ficam de fora/)).toBeNull();                 // mudar a opção invalida a prévia
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    await screen.findByText(/Reenvio manual\./);
    expect(lastPreview().include_already).toBe(true);
    fireEvent.change(screen.getByLabelText('Para confirmar, digite 3'), { target: { value: '3' } });
    const send = screen.getByRole('button', { name: 'Enviar para 3' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);                                        // digitou a contagem, mas falta confirmar o REENVIO
    fireEvent.click(screen.getByLabelText(/Confirmo que é um REENVIO/));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/broadcast/send' && JSON.parse(i.body).resend_confirmed === true && JSON.parse(i.body).include_already === true)).toBe(true));
  });

  it('notificação: envio normal NÃO manda resend_confirmed nem include_already', async () => {
    route({ preview: { will_send: 3, sample: null } });
    render(<GratuitoTab />);
    await screen.findByText(GRATUITO_PUSH_TITLE);
    fireEvent.click(screen.getByLabelText(/Todos que falta algo/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    fireEvent.change(await screen.findByLabelText('Para confirmar, digite 3'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 3' }));
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p]) => p === '/broadcast/send')).toBe(true));
    const sent = JSON.parse(api.adminApi.mock.calls.find(([p]) => p === '/broadcast/send')![1].body);
    expect(sent.resend_confirmed).toBeUndefined();
    expect(sent.include_already).toBeUndefined();
  });

  it('notificação: prévia mostra o horário de silêncio (quantos agora, quantos pendentes, quando abre) e o fuso desconhecido', async () => {
    route({ preview: { will_send: 10, sample: null, quiet: { applies: true, send_now: 4, pending: 6, unknown_tz: 3, next_open: '2026-11-22T11:00:00Z', rule: 'x' } } });
    render(<GratuitoTab />);
    await screen.findByText(GRATUITO_PUSH_TITLE);
    fireEvent.click(screen.getByLabelText(/Todos que falta algo/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e quantas pessoas' }));
    const q = await screen.findByTestId('push-quiet');
    expect(q.textContent).toContain('4 podem receber agora');
    expect(q.textContent).toContain('6 ficam pendentes');
    expect(q.textContent).toContain('Ninguém é descartado');
    expect(q.textContent).toContain('3 sem fuso conhecido');
    expect(q.textContent).toContain('10h e 21h de Brasília');
  });

  it('progresso: separa processadas, aceitas pelo provedor, falhas, incertas e fila — sem dizer "receberam"/"entregue"', async () => {
    route({ progress: progressBase });
    render(<GratuitoTab />);
    const box = await screen.findByTestId('push-progress');
    expect(box.textContent).toContain('Enviando a notificação');
    expect(box.textContent).toContain('Processadas: 50 de 200 (25%)');
    expect(box.textContent).toContain('40 aceitas pelo provedor');
    expect(box.textContent).toContain('4 falhas');
    expect(box.textContent).toContain('6 resultados incertos');
    expect(box.textContent).toContain('150 na fila (10 em envio agora)');
    expect(box.textContent).toContain('não confirma que chegou ao aparelho');
    expect(box.textContent).not.toMatch(/\breceberam\b/);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.queryByLabelText('Confirme digitando a quantidade')).toBeNull();     // enviando de verdade: sem botões de continuar/descartar
  });

  it('progresso: envio interrompido mostra Continuar/Descartar com a contagem digitada e chama os endpoints certos', async () => {
    route({ progress: { ...progressBase, phase: 'interrupted', queued: 12, in_flight: 0, quiet_pending: 3, quiet_due_now: 1, can_resume: true, can_release: true }, other: { ok: true } });
    render(<GratuitoTab />);
    const box = await screen.findByTestId('push-progress');
    expect(box.textContent).toContain('Envio interrompido (nada foi reenviado)');
    expect(box.textContent).toContain('3 pendentes pelo horário de silêncio');
    const input = screen.getByLabelText('Confirme digitando a quantidade');
    const cont = screen.getByRole('button', { name: 'Continuar enviando 13' }) as HTMLButtonElement;     // 12 nunca tentadas + 1 pendente com janela aberta
    expect(cont.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '13' } });
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/broadcast/b1/resume' && JSON.parse(i.body).confirm_count === 13)).toBe(true));
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar 15 pendentes' }));
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/broadcast/b1/release' && JSON.parse(i.body).confirm_count === 15)).toBe(true));
  });

  it('progresso: aguardando horário de silêncio e REENVIO aparecem com clareza', async () => {
    route({ progress: { ...progressBase, phase: 'waiting', is_resend: true, queued: 0, in_flight: 0, quiet_pending: 30, quiet_next_open: '2026-11-22T11:00:00Z', can_resume: false, can_release: true } });
    render(<GratuitoTab />);
    const box = await screen.findByTestId('push-progress');
    expect(box.textContent).toContain('Aguardando o fim do horário de silêncio');
    expect(box.textContent).toContain('REENVIO');
    expect(box.textContent).toContain('30 pendentes pelo horário de silêncio (22h–8h); a primeira janela abre em');
  });

  it('e-mail: "incluir quem já recebeu" vai como include_already e a prévia diz quantos já receberam (controle separado do push)', async () => {
    api.adminApi.mockImplementation(async (path: string) => {
      if (path === '/gratuito/summary') return base;
      if (path === '/broadcast/progress/latest?goal=atalho') return { found: false };
      if (path.endsWith('/preview')) return { will_send: 10, audience_total: 600, already_received: 590, sample: null };
      return { started: true };
    });
    render(<GratuitoTab />);
    await screen.findByText(/Dia 0: quem a notificação não alcança/);
    fireEvent.click(screen.getByLabelText('Todos do grupo'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos recebem' }));
    await screen.findByText(/590 já receberam antes e ficam de fora/);
    fireEvent.click(screen.getByLabelText(/Incluir quem já recebeu este e-mail/));
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos recebem' }));
    await screen.findByText(/Reenvio: quem já recebeu este e-mail vai receber de novo/);
    const c = api.adminApi.mock.calls.filter(([p]) => String(p).endsWith('/preview'));
    expect(JSON.parse(c[c.length - 1][1].body).include_already).toBe(true);
    expect(screen.queryByTestId('push-quiet')).toBeNull();                  // horário de silêncio é só do push
  });
});
