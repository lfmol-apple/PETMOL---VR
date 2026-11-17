/** Campanha SÓ de link: o formulário não oferece objetivo nem destino; sem link não salva; com link, abre o produto direto na loja. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openForm = async () => {
  render(<SegmentedCampaigns />);
  fireEvent.click(await screen.findByRole('button', { name: '+ Nova campanha' }));
  await screen.findByLabelText(/Link do produto/);
};
const saveBtn = () => screen.getByRole('button', { name: /Salvar campanha e continuar/ }) as HTMLButtonElement;
const body = () => be.last('POST', '/campaigns')!.body;
const paste = (url = 'https://amzn.to/abc') => {
  const box = screen.getByLabelText(/Link do produto/);
  fireEvent.change(box, { target: { value: url } });
  fireEvent.paste(box, { clipboardData: { getData: () => url } });         // o navegador troca o texto ao colar e dispara a conferência
};

describe('Campanha só de link', () => {
  it('não há objetivo, destino nem "escrever livremente": só o link', async () => {
    await openForm();
    expect(screen.queryByLabelText(/vai incentivar o tutor a/)).toBeNull();
    expect(screen.queryByLabelText(/Ao tocar na notificação, abrir/)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByTestId('ao-tocar').textContent).toMatch(/produto direto na loja/);
  });

  it('sem link não salva e diz o que falta', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta' } });
    expect(saveBtn().disabled).toBe(true);
    expect(screen.getByText(/Cole o link do produto/)).toBeTruthy();
  });

  it('colar o link confere sozinho e monta nome, título e mensagem pela oferta (sem digitar nada) e salva só com o link', async () => {
    await openForm();
    paste();
    await screen.findByText(/Loja reconhecida/);
    expect((screen.getByLabelText(/Nome da campanha/) as HTMLInputElement).value).toBe('Ração Premier Gatos 7,5kg');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toContain('Ração Premier Gatos 7,5kg');
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toContain('{tutor}');
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(body()).toMatchObject({ goal: 'link_produto', destination: 'produto', product_url: 'https://amzn.to/abc', product_title: 'Ração Premier Gatos 7,5kg' }));
  });

  it('o que você já digitou não é sobrescrito', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Campanha de teste' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Mensagem de teste' } });
    paste();
    await screen.findByText(/Loja reconhecida/);
    expect((screen.getByLabelText(/Nome da campanha/) as HTMLInputElement).value).toBe('Campanha de teste');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toBe('Mensagem de teste');
  });

  it('oferta com preço e desconto (Mercado Livre): a campanha já sai montada com o preço e o desconto', async () => {
    be.on('POST /link-preview', (b) => ({ json: { url: b.url, store: 'Mercado Livre', host: 'meli.la', final_host: 'mercadolivre.com.br', title: 'Ração Premier 10kg', image: null, readable: true, reason: null, price: 129.9, list_price: 159.9, discount_pct: 19 } }));
    await openForm();
    paste('https://meli.la/abc');
    await screen.findByTestId('oferta-preco');
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toBe('{tutor}, oferta para {pets}: 19% de desconto');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toMatch(/Ração Premier 10kg por R\$\s?129,90/);
    expect(screen.getByTestId('oferta-preco').textContent).toMatch(/19% de desconto/);
    expect(saveBtn().disabled).toBe(false);
  });

  it('Amazon: o preço lido aparece só para você e NÃO vai para a notificação', async () => {
    be.on('POST /link-preview', (b) => ({ json: { url: b.url, store: 'Amazon', host: 'amzn.to', final_host: 'amazon.com.br', title: 'Coleira X', image: null, readable: true, reason: null, price: 49.9, list_price: 99.9, discount_pct: 50 } }));
    await openForm();
    paste();
    await screen.findByTestId('oferta-preco');
    expect((screen.getByLabelText(/Mensagem principal/) as HTMLTextAreaElement).value).toBe('Coleira X — toque para ver.');
    expect(screen.getByTestId('oferta-preco').textContent).toMatch(/Na Amazon o preço não é citado/);
  });
});
