/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); be.useWorld(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const chip = (name: string | RegExp) => screen.getByRole('checkbox', { name });
const lastFilter = () => be.last('POST', '/audience/count')!.body.filter.root;
const bigNumber = () => screen.getByLabelText('Resumo do público').querySelector('[aria-live]')!.textContent;

describe('Segmentação de público: chips + contagem ao vivo, sem criar campanha', () => {
  it('gato + fêmea (mesmo pet) conta no servidor e mostra o número grande; nada é criado nem enviado', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Fêmea'));
    await waitFor(() => expect(bigNumber()).toBe('100'), { timeout: 3000 });
    const g = lastFilter().items[0];
    expect(g).toMatchObject({ kind: 'group', op: 'and', pet_scope: 'same' });
    expect(g.items.map((r: any) => [r.field, r.op, r.value])).toEqual([['pet_species', 'in', ['cat']], ['pet_sex', 'eq', 'female']]);
    expect(be.last('POST', '/audience/count')!.body.campaign_id).toBeUndefined();
    expect(be.count('POST', '/campaigns')).toBe(0);
    expect(be.calls.some((c) => c.method === 'POST' && /batches|stop|resume|release/.test(c.path))).toBe(false);
  });

  it('idade, porte, aparelho e atividade viram as regras certas do motor (faixas em meses/kg)', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip(/^Filhote/)); fireEvent.click(chip(/^Grande/)); fireEvent.click(chip('iPhone')); fireEvent.click(chip(/Ativo nos últimos 7 dias/)); fireEvent.click(chip('Castrado'));
    await waitFor(() => expect(be.count('POST', '/audience/count')).toBeGreaterThan(0), { timeout: 3000 });
    await waitFor(() => expect(lastFilter().items[0].items.length).toBe(5), { timeout: 3000 });
    const rules = Object.fromEntries(lastFilter().items[0].items.map((r: any) => [r.field, [r.op, r.value]]));
    expect(rules.pet_age_months).toEqual(['between', [0, 12]]);
    expect(rules.pet_weight_kg).toEqual(['between', [25, 200]]);
    expect(rules.platform).toEqual(['in', ['ios']]);
    expect(rules.tutor_activity).toEqual(['eq', 'last_7d']);
    expect(rules.pet_neutered_yes).toEqual(['eq', true]);
  });

  it('chips de escolha única trocam entre si e clicar no selecionado limpa; os de múltipla escolha somam', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip('Macho')); fireEvent.click(chip('Fêmea'));
    expect(chip('Macho').getAttribute('aria-checked')).toBe('false');
    expect(chip('Fêmea').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(chip('Fêmea'));
    expect(chip('Fêmea').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(chip('Cão')); fireEvent.click(chip('Gato'));
    expect(chip('Cão').getAttribute('aria-checked')).toBe('true'); expect(chip('Gato').getAttribute('aria-checked')).toBe('true');
  });

  it('o resumo lista o filtro em palavras e cada item pode ser removido; "Limpar tudo" zera', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Castrado'));
    const aside = screen.getByLabelText('Resumo do público');
    expect(within(aside).getByRole('button', { name: /Remover Espécie: Gato/ })).toBeTruthy();
    fireEvent.click(within(aside).getByRole('button', { name: /Remover Espécie: Gato/ }));
    expect(chip('Gato').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(within(aside).getByRole('button', { name: 'Limpar tudo' }));
    expect(within(aside).getByText(/Nenhum filtro/)).toBeTruthy();
    expect(chip('Castrado').getAttribute('aria-checked')).toBe('false');
  });

  it('"Mais filtros" abre os filtros avançados com os chips já refletidos', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip('Gato'));
    fireEvent.click(screen.getByRole('button', { name: /Mais filtros e combinações/ }));
    expect((screen.getByLabelText('Gato') as HTMLInputElement).checked).toBe(true);        // o mesmo estado, sem divergência
    expect(screen.getByRole('button', { name: /Adicionar bloco de filtros|Outro bloco de filtros/ })).toBeTruthy();
  });

  it('"Criar campanha com este público" leva os filtros: depois de salvar, a campanha já abre com eles e a contagem', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Fêmea'));
    const use = screen.getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement;
    await waitFor(() => expect(use.disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(use);
    expect(await screen.findByText(/vai usar o/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Ração gata' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta para gatas' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'Ração gata' });
    expect(screen.getByText(/filtros que você montou na segmentação foram trazidos/)).toBeTruthy();
    expect((screen.getByLabelText('Gato') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Sexo do pet') as HTMLSelectElement).value).toBe('female');
    expect(be.count('POST', '/campaigns')).toBe(1);                               // a única escrita é a criação do rascunho que você pediu
    expect(be.calls.some((c) => c.method === 'POST' && /\/batches$/.test(c.path))).toBe(false);   // e nada foi reservado/enviado
  });

  it('sem nenhum filtro o botão de criar já funciona (todos com push) e o resumo explica', async () => {
    render(<SegmentedCampaigns />);
    await screen.findByRole('heading', { name: 'Explorar o público' });
    expect(screen.getByText(/Sem filtros: todos com push ativo/)).toBeTruthy();
  });
});
