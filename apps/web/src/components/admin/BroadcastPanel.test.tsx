import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BroadcastPanel } from './BroadcastPanel';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

const segments = {
  weekly_cap_days: 7,
  destinations: { home: 'Tela inicial', loja: 'Lojas (Loja do Pet)', food: 'Ração' },
  segments: {
    todos: { label: 'Todos com notificação ativa', eligible: 10, skipped: { opt_out: 0, weekly_cap: 0, segment: 0 } },
    sem_racao: { label: 'Tem pet e ainda não cadastrou a ração', eligible: 4, skipped: { opt_out: 0, weekly_cap: 0, segment: 6 } },
  },
  goals: [
    { key: 'racao', group: 'Alimentação', label: 'Cadastrar a ração', segment: 'sem_racao', title: '{tutor}, a ração de {pets} vai acabar?', open: 'food', message: 'Cadastre a ração de {pets}.', why: 'Ração gera uso recorrente.', success: 'Cadastrou a ração em 24h.', eligible: 4 },
    { key: 'cupom', group: 'Compras', label: 'Usar o cupom da Petz', segment: 'todos', title: '{tutor}, 10% OFF na Petz para {pets}', open: 'loja', message: 'Use o cupom PETMOL nas lojas Petz.', why: 'Monetização.', success: 'Tocou em uma oferta.', eligible: 10 },
    { key: 'abrir', group: 'Engajamento', label: 'Só abrir o app', segment: 'todos', title: '{tutor}, novidade para {pets}', open: 'home', message: 'Tem novidade para {pets}.', why: 'Reativação.', success: 'Abriu o app em 24h.', eligible: 10 },
  ],
};
const history = { items: [{
  id: 'b1', created_at: '2026-11-07T12:00:00Z', message: 'Cadastre a ração de {pets}.', segment: 'sem_racao', audience_kind: 'count',
  audience_requested: 50, goal: 'racao', recipients_total: 50, delivered_total: 48, phase: 'done',
  metrics: { delivered: 48, tapped: 12, opened: 20, acted: 9, goal_hit: 7, goal_label: 'Cadastrar a ração', window_closed: true },
}] };

let calls: { url: string; body?: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d });
    if (url.endsWith('/segments')) return json(segments);
    if (url.endsWith('/history')) return json(history);
    if (url.endsWith('/preview')) return json({ will_send: 4, skipped: { opt_out: 1, weekly_cap: 2, segment: 6 }, sample: { title: 'Ana, uma novidade para Baby', body: 'Cadastre a ração de Baby.' } });
    if (url.endsWith('/send')) return json({ id: 'b2', will_send: 4, phase: 'sending' });
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('BroadcastPanel', () => {
  it('a meta do cupom leva o toque para as lojas e envia o destino', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/vai incentivar o usuário a/i), { target: { value: 'cupom' } });
    expect((screen.getByLabelText('Ao tocar na notificação, abrir') as HTMLSelectElement).value).toBe('loja');
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toBe('{tutor}, 10% OFF na Petz para {pets}');
    fireEvent.click(screen.getByText('Ver prévia e quantas pessoas'));
    await screen.findByText('Enviar só para mim');
    fireEvent.click(screen.getByText('Enviar só para mim'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/send'))).toBe(true));
    expect((calls.find((c) => c.url.endsWith('/send'))!.body as { destination: string }).destination).toBe('loja');
  });

  it('escolher a ação preenche mensagem e público e mostra como o êxito é medido', async () => {
    render(<BroadcastPanel />);
    const select = await screen.findByLabelText(/vai incentivar o usuário a/i);
    fireEvent.change(select, { target: { value: 'racao' } });
    expect((screen.getByLabelText('Mensagem principal') as HTMLTextAreaElement).value).toBe('Cadastre a ração de {pets}.');
    expect((screen.getByLabelText('Para quem') as HTMLSelectElement).value).toBe('sem_racao');
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toBe('{tutor}, a ração de {pets} vai acabar?');
    expect(screen.getByText(/Cadastrou a ração em 24h/)).toBeTruthy();
  });

  it('prévia mostra tutor+pet, pede a contagem digitada e só então envia', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/vai incentivar o usuário a/i), { target: { value: 'racao' } });
    fireEvent.click(screen.getByLabelText('Todos'));
    fireEvent.click(screen.getByText('Ver prévia e quantas pessoas'));
    expect(await screen.findByText('Ana, uma novidade para Baby')).toBeTruthy();

    const send = screen.getByText(/Enviar para 4 pessoas/) as HTMLButtonElement;
    expect(send.disabled).toBe(true);                       // sem digitar a contagem não envia
    fireEvent.change(screen.getByLabelText(/Para confirmar, digite 4/), { target: { value: '4' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/send'))).toBe(true));
    const sent = calls.find((c) => c.url.endsWith('/send'))!.body as { confirm_count: number; goal: string; title: string; audience: { kind: string } };
    expect(sent.title).toBe('{tutor}, a ração de {pets} vai acabar?');
    expect(sent.confirm_count).toBe(4);
    expect(sent.goal).toBe('racao');
    expect(sent.audience.kind).toBe('all');
  });

  it('o envio só para mim não exige digitar a contagem', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/vai incentivar o usuário a/i), { target: { value: 'abrir' } });
    fireEvent.click(screen.getByText('Ver prévia e quantas pessoas'));
    const send = (await screen.findByText('Enviar só para mim')) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('mostra o resultado do histórico: receberam, tocaram, abriram, fizeram algo e meta', async () => {
    render(<BroadcastPanel />);
    expect(await screen.findByText(/Meta atingida · 15%/)).toBeTruthy();      // 7 de 48
    expect(screen.getByText(/Tocaram na notificação · 25%/)).toBeTruthy();    // 12 de 48
    expect(screen.getByText(/Fizeram algo no app · 19%/)).toBeTruthy();       // 9 de 48
  });
});
