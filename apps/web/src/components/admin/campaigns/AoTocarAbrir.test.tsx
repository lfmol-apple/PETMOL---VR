 
/** "Ao tocar, abrir" precisa coincidir com o objetivo; com link, abre o link — nunca um destino sem link nem escondido. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => {
  be = new Backend(); be.install();
  be.on('GET /segments', () => ({ json: { goals: [
    { key: 'racao', group: 'Alimentação', label: 'Cadastrar a ração', title: 't', open: 'food', message: 'Cadastre a ração.' },
    { key: 'promocao_loja', group: 'Compras', label: 'Ver uma promoção da loja', title: 't', open: 'loja', message: 'Veja a promoção.' },
    { key: 'link_produto', group: 'Compras', label: 'Abrir um produto (link direto da loja)', title: 't', open: 'produto', message: 'Toque para ver o produto.' },
  ], destinations: { home: 'Tela inicial', loja: 'Lojas (Loja do Pet)', food: 'Ração', produto: 'O produto do link (direto na loja)' } } }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openForm = async () => {
  render(<SegmentedCampaigns />);
  fireEvent.click(await screen.findByRole('button', { name: '+ Nova campanha' }));
  await screen.findByLabelText(/Nome da campanha/);
};
const fill = () => {
  fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Campanha de teste' } });
  fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Mensagem de teste' } });
};
const goal = (k: string) => fireEvent.change(screen.getByLabelText(/vai incentivar o tutor a/), { target: { value: k } });
const dest = () => screen.getByLabelText(/Ao tocar na notificação, abrir/) as HTMLSelectElement;
const saveBtn = () => screen.getByRole('button', { name: /Salvar campanha e continuar/ }) as HTMLButtonElement;
const body = () => be.last('POST', '/campaigns')!.body;
const pasteLink = async () => {
  fireEvent.change(screen.getByLabelText(/Link do produto/), { target: { value: 'https://amzn.to/abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
  await screen.findByText(/Loja reconhecida/);
};

describe('Link: primeiro da lista e campanha preenchida pela oferta', () => {
  it('"Abrir um produto (link direto da loja)" é a primeira opção da lista de objetivos', async () => {
    await openForm();
    const select = screen.getByLabelText(/vai incentivar o tutor a/) as HTMLSelectElement;
    expect(select.options[0].value).toBe('link_produto');
  });

  it('colar o link confere sozinho e monta nome, título e mensagem pela oferta (sem digitar nada)', async () => {
    await openForm();
    const box = screen.getByLabelText(/Link do produto/);
    fireEvent.change(box, { target: { value: 'https://amzn.to/abc' } });     // o navegador troca o texto ao colar…
    fireEvent.paste(box, { clipboardData: { getData: () => 'https://amzn.to/abc' } });   // …e dispara a conferência automática
    await screen.findByText(/Loja reconhecida/);
    expect((screen.getByLabelText(/Nome da campanha/) as HTMLInputElement).value).toBe('Ração Premier Gatos 7,5kg');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toContain('Ração Premier Gatos 7,5kg');
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toBe('t');
    expect((screen.getByLabelText(/vai incentivar o tutor a/) as HTMLSelectElement).value).toBe('link_produto');
    expect(saveBtn().disabled).toBe(false);
  });

  it('o que você já digitou não é sobrescrito', async () => {
    await openForm(); fill();
    const box = screen.getByLabelText(/Link do produto/);
    fireEvent.change(box, { target: { value: 'https://amzn.to/abc' } });     // o navegador troca o texto ao colar…
    fireEvent.paste(box, { clipboardData: { getData: () => 'https://amzn.to/abc' } });   // …e dispara a conferência automática
    await screen.findByText(/Loja reconhecida/);
    expect((screen.getByLabelText(/Nome da campanha/) as HTMLInputElement).value).toBe('Campanha de teste');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toBe('Mensagem de teste');
  });
});

describe('Ao tocar, abrir × objetivo × link', () => {
  it('o objetivo escolhido define para onde o toque abre e a tela mostra isso', async () => {
    await openForm(); fill();
    goal('racao');
    expect(dest().value).toBe('food');
    goal('promocao_loja');
    expect(dest().value).toBe('loja');
    fireEvent.click(saveBtn());
    await waitFor(() => expect(body()).toMatchObject({ goal: 'promocao_loja', destination: 'loja', product_url: null }));
  });

  it('escolher um destino que não é o do objetivo avisa (sem travar) e oferece voltar ao recomendado', async () => {
    await openForm(); fill();
    goal('racao');
    fireEvent.change(dest(), { target: { value: 'loja' } });
    const note = within(screen.getByTestId('ao-tocar')).getByRole('note');
    expect(note.textContent).toMatch(/“Cadastrar a ração” costuma abrir Ração, e você escolheu Lojas/);
    expect(saveBtn().disabled).toBe(false);                                                   // aviso, não trava
    fireEvent.click(within(note).getByRole('button', { name: 'Usar Ração' }));
    expect(dest().value).toBe('food');
    expect(within(screen.getByTestId('ao-tocar')).queryByRole('note')).toBeNull();
  });

  it('com link, a tela diz que abre O LINK (não some o campo) e o que é salvo é o link', async () => {
    await openForm(); fill();
    await pasteLink();
    const box = screen.getByTestId('ao-tocar');
    expect(box.textContent).toMatch(/O link do produto.*direto na loja \(Amazon\).*abre exatamente o link colado/);
    expect(within(box).queryByRole('combobox')).toBeNull();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(body()).toMatchObject({ destination: 'produto', product_url: 'https://amzn.to/abc' }));
  });

  it('link + objetivo de outra tela: avisa que o toque abre o link, não a tela do objetivo', async () => {
    await openForm(); fill();
    goal('racao');
    await pasteLink();
    expect(within(screen.getByTestId('ao-tocar')).getByRole('note').textContent).toMatch(/“Cadastrar a ração” abriria Ração, mas como há um link, o toque abre o link do produto/);
  });

  it('objetivo "abrir um produto" sem link: não salva e explica; ao colar o link libera', async () => {
    await openForm(); fill();
    goal('link_produto');
    expect(saveBtn().disabled).toBe(true);
    expect(screen.getByText(/Este objetivo abre o link do produto: cole o link acima/)).toBeTruthy();
    expect(screen.getByText(/não há outra pergunta de destino/)).toBeTruthy();   // escolheu o link: não pergunta o destino de novo
    await pasteLink();
    expect(saveBtn().disabled).toBe(false);
  });

  it('tirar o link depois de conferi-lo volta ao destino do objetivo (nunca fica "produto" sem link)', async () => {
    await openForm(); fill();
    goal('racao');
    await pasteLink();
    fireEvent.change(screen.getByLabelText(/Link do produto/), { target: { value: '' } });
    expect(dest().value).toBe('food');
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(body()).toMatchObject({ goal: 'racao', destination: 'food', product_url: null }));
  });
});
