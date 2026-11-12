import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BroadcastPanel } from './BroadcastPanel';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

const segments = {
  weekly_cap_days: 7,
  destinations: { home: 'Tela inicial', loja: 'Lojas (Loja do Pet)', food: 'Ração', produto: 'O produto do link (direto na loja)' },
  segments: {
    todos: { label: 'Todos com notificação ativa', eligible: 10, skipped: { opt_out: 0, weekly_cap: 0, segment: 0 } },
    sem_racao: { label: 'Tem pet e ainda não cadastrou a ração', eligible: 4, skipped: { opt_out: 0, weekly_cap: 0, segment: 6 } },
  },
  goals: [
    { key: 'racao', group: 'Alimentação', label: 'Cadastrar a ração', segment: 'sem_racao', title: '{tutor}, a ração de {pets} vai acabar?', open: 'food', message: 'Cadastre a ração de {pets}.', why: 'Ração gera uso recorrente.', success: 'Cadastrou a ração em 24h.', eligible: 4 },
    { key: 'cupom', group: 'Compras', label: 'Usar o cupom da Petz', segment: 'todos', title: '{tutor}, 10% OFF na Petz para {pets}', open: 'loja', message: 'Use o cupom PETMOL nas lojas Petz.', why: 'Monetização.', success: 'Tocou em uma oferta.', eligible: 10 },
    { key: 'link_produto', group: 'Compras', label: 'Abrir um produto (link direto da loja)', segment: 'todos', title: '{tutor}, olha este produto para {pets}', open: 'produto', message: 'Toque para ver o produto direto na loja.', why: 'Leva direto ao produto.', success: 'Abriu o produto em 24h.', eligible: 10 },
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
    if (url.endsWith('/link-preview')) {
      if (String(body?.url).includes('evil')) return { ok: false, status: 422, json: async () => ({ detail: 'Este endereço não é de uma loja parceira (Amazon, Cobasi, Shopee…).' }) };
      if (String(body?.url).includes('shopee')) return json({ url: body.url, store: 'Shopee', host: 's.shopee.com.br', final_host: 'shopee.com.br', title: null, image: null, readable: false, reason: 'A loja não deixa ler o nome automaticamente. Digite o nome do produto.' });
      return json({ url: body.url, store: 'Amazon', host: 'amzn.to', final_host: 'www.amazon.com', title: 'KONG Classic Stuffable Dog Toy', image: null, readable: true, reason: null });
    }
    if (url.endsWith('/preview') && (body as { audience?: { kind?: string } })?.audience?.kind === 'test') return json({ will_send: 3, skipped: { opt_out: 0, weekly_cap: 0, segment: 0 }, sample: { title: 'Leonardo, olha este produto para Baby', body: 'KONG Classic Stuffable Dog Toy' }, destination_label: 'O produto do link (direto na loja)', product: { title: 'KONG Classic Stuffable Dog Toy', url: 'https://amzn.to/3SN1ORt' }, test_accounts: [{ name: 'Leonardo', has_push: true }, { name: 'Henrique', has_push: true }, { name: 'VEP', has_push: false }] });
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
    await screen.findByText(/Enviar teste \(/);
    fireEvent.click(screen.getByText(/Enviar teste \(/));
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

  it('o teste (3 contas) não exige digitar a contagem', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/vai incentivar o usuário a/i), { target: { value: 'abrir' } });
    fireEvent.click(screen.getByText('Ver prévia e quantas pessoas'));
    const send = (await screen.findByText(/Enviar teste \(/)) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('mostra o resultado do histórico: receberam, tocaram, abriram, fizeram algo e meta', async () => {
    render(<BroadcastPanel />);
    expect(await screen.findByText(/Meta atingida · 15%/)).toBeTruthy();      // 7 de 48
    expect(screen.getByText(/Tocaram na notificação · 25%/)).toBeTruthy();    // 12 de 48
    expect(screen.getByText(/Fizeram algo no app · 19%/)).toBeTruthy();       // 9 de 48
  });

  it('cola o link: confere o nome, prepara o envio e manda produto + nome conferido; o teste vai para as 3 contas', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/Link de produto/i), { target: { value: 'https://amzn.to/3SN1ORt' } });
    fireEvent.click(screen.getByText('Conferir link'));
    expect(await screen.findByText(/Nome lido do link: KONG Classic Stuffable Dog Toy/)).toBeTruthy();
    expect((screen.getByLabelText(/Nome do produto/i) as HTMLInputElement).value).toBe('KONG Classic Stuffable Dog Toy');
    expect((screen.getByLabelText('Mensagem principal') as HTMLTextAreaElement).value).toBe('KONG Classic Stuffable Dog Toy');
    expect((screen.getByLabelText('Ao tocar na notificação, abrir') as HTMLSelectElement).value).toBe('produto');

    fireEvent.click(screen.getByText('Ver prévia e quantas pessoas'));
    expect(await screen.findByText(/Produto: KONG Classic Stuffable Dog Toy/)).toBeTruthy();
    expect(screen.getByText(/✓ Henrique/)).toBeTruthy();
    expect(screen.getByText(/VEP — sem notificação ativa: não vai receber/)).toBeTruthy();
    fireEvent.click(screen.getByText('Enviar teste (3 contas)'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/send'))).toBe(true));
    const sent = calls.find((c) => c.url.endsWith('/send'))!.body as { product_url: string; product_title: string; destination: string; goal: string; confirm_count: number };
    expect(sent).toMatchObject({ product_url: 'https://amzn.to/3SN1ORt', product_title: 'KONG Classic Stuffable Dog Toy', destination: 'produto', goal: 'link_produto', confirm_count: 3 });
  });

  it('loja que não deixa ler o nome obriga o dono a digitar antes de seguir', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/Link de produto/i), { target: { value: 'https://s.shopee.com.br/4AzW1leQcW' } });
    fireEvent.click(screen.getByText('Conferir link'));
    expect(await screen.findByText(/Digite o nome do produto/)).toBeTruthy();
    expect((screen.getByLabelText('Mensagem principal') as HTMLTextAreaElement).value).toBe('Toque para ver o produto direto na loja.');
    const prev = screen.getByText('Ver prévia e quantas pessoas') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);                                       // sem nome conferido não avança
    fireEvent.change(screen.getByLabelText(/Nome do produto/i), { target: { value: 'Petisco Biscrok 500g' } });
    expect(prev.disabled).toBe(false);
  });

  it('link de fora das lojas é recusado com mensagem clara e nada é enviado', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/Link de produto/i), { target: { value: 'https://evil.com/amazon.com.br' } });
    fireEvent.click(screen.getByText('Conferir link'));
    expect(await screen.findByText(/não é de uma loja parceira/)).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/send'))).toBe(false);
  });

  it('remover o link volta ao envio normal (sem produto)', async () => {
    render(<BroadcastPanel />);
    fireEvent.change(await screen.findByLabelText(/Link de produto/i), { target: { value: 'https://amzn.to/3SN1ORt' } });
    fireEvent.click(screen.getByText('Conferir link'));
    await screen.findByText(/Nome lido do link/);
    fireEvent.click(screen.getByText('Remover link'));
    expect(screen.queryByText(/Nome lido do link/)).toBeNull();
    expect((screen.getByLabelText('Ao tocar na notificação, abrir') as HTMLSelectElement).disabled).toBe(false);
  });
});
