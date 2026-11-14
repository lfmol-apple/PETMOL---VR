/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste */
/**
 * Tela de segmentação: texto do número, limite por lote, coerência chips × filtros avançados (E/OU) e preservação integral dos
 * filtros ao criar a campanha (sem nenhum envio automático).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); be.useWorld(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const section = () => screen.getByLabelText(/Explorar o público/, { selector: 'section' }) as HTMLElement;
const chip = (name: string | RegExp) => within(section()).getAllByRole('checkbox', { name }).find((e) => e.tagName === 'BUTTON') as HTMLElement;
const disabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const open = async () => { render(<SegmentedCampaigns />); await screen.findByRole('heading', { name: 'Explorar o público' }); };
const advanced = () => fireEvent.click(within(section()).getByRole('button', { name: /Mais filtros e combinações/ }));
const addBlock = () => fireEvent.click(within(section()).getByRole('button', { name: /Outro bloco de filtros|Adicionar bloco de filtros/ }));
const pick = (group: RegExp, field: RegExp) => {
  const g = within(section()).getByRole('group', { name: 'Escolha um filtro' });
  fireEvent.click(within(g).getByRole('button', { name: group })); fireEvent.click(within(g).getByRole('button', { name: field }));
};
const moreFilter = (i = -1) => { const bs = within(section()).getAllByRole('button', { name: /\+ Adicionar filtro/ }); fireEvent.click(bs.at(i)!); };
const lastBody = () => be.last('POST', '/audience/count')!.body;
const aside = () => within(screen.getByLabelText('Resumo do público'));

describe('número: "alcançáveis por push" = público elegível, não o que será enviado', () => {
  it('o rótulo mudou e a explicação cita o limite por lote do servidor', async () => {
    be.maxBatch = 1;
    await open();
    await waitFor(() => expect(screen.getByTestId('explicacao-alcancaveis').textContent).toMatch(/hoje: 1 tutor\b/));
    expect(screen.getAllByText(/Tutores alcançáveis por push/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tutores que serão alcançados/)).toBeNull();
    const t = screen.getByTestId('explicacao-alcancaveis').textContent!;
    expect(t).toMatch(/público elegível/); expect(t).toMatch(/não a quantidade enviada/); expect(t).toMatch(/respeita o limite por lote/);
  });
  it('limite plural e ausência do limite (servidor antigo) não quebram a frase', async () => {
    be.maxBatch = 50;
    await open();
    await waitFor(() => expect(screen.getByTestId('explicacao-alcancaveis').textContent).toMatch(/hoje: 50 tutores/));
  });
});

describe('chips × filtros avançados: nunca estados contraditórios', () => {
  it('campo que também está num bloco avançado trava o atalho e explica onde está', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced(); addBlock(); pick(/^Pet/, /^Espécie/);
    const caoInput = within(section()).getAllByLabelText('Cão').filter((e) => e.tagName === 'INPUT').at(-1) as HTMLInputElement;   // o do Bloco 2
    fireEvent.click(caoInput);
    await waitFor(() => expect(disabled(chip('Gato'))).toBe(true));
    expect(disabled(chip('Cão'))).toBe(true);
    expect(within(section()).getAllByRole('note').some((n) => /Já está nos filtros avançados \(Bloco 2\)/.test(n.textContent ?? ''))).toBe(true);
    expect(disabled(chip('Macho'))).toBe(false);                                   // outros grupos seguem livres
    expect(chip('Gato').getAttribute('aria-checked')).toBe('true');                // o que está ligado continua visível
  });

  it('OU entre blocos trava TODOS os atalhos; voltar para E libera', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced(); addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getByLabelText('Estado cadastrado pelo tutor'), { target: { value: 'SP' } });
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    await waitFor(() => expect(disabled(chip('Gato'))).toBe(true));
    for (const n of ['Cão', 'Macho', 'iPhone', 'Castrado']) expect(disabled(chip(n))).toBe(true);
    expect(within(section()).getAllByRole('note')[0].textContent).toMatch(/combinados com OU/);
    fireEvent.click(chip('Cão'));                                                    // clicar travado não muda nada
    expect(chip('Cão').getAttribute('aria-checked')).toBe('false');
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'and' } });
    await waitFor(() => expect(disabled(chip('Gato'))).toBe(false));
  });

  it('alterar o bloco dos atalhos para OU nos avançados trava os atalhos (a leitura "E, mesmo pet" deixaria de valer)', async () => {
    await open();
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Fêmea'));
    advanced();
    fireEvent.change(within(section()).getByLabelText(/Bloco 1: combinar condições/), { target: { value: 'or' } });
    await waitFor(() => expect(disabled(chip('Macho'))).toBe(true));
    expect(within(section()).getAllByRole('note')[0].textContent).toMatch(/foi alterado nos filtros avançados/);
    fireEvent.change(within(section()).getByLabelText(/Bloco 1: combinar condições/), { target: { value: 'and' } });
    await waitFor(() => expect(disabled(chip('Macho'))).toBe(false));
  });

  it('contradição no mesmo pet é avisada e bloqueia "Criar campanha"; em "algum pet" ou com OU não há aviso', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced(); addBlock(); pick(/^Pet/, /^Espécie/);
    fireEvent.click(within(section()).getAllByLabelText('Cão').filter((e) => e.tagName === 'INPUT').at(-1)!);        // o do Bloco 2
    await waitFor(() => expect(be.count('POST', '/audience/count')).toBeGreaterThan(0), { timeout: 3000 });
    expect(screen.queryByTestId('conflitos')).toBeNull();                              // atalhos (mesmo pet) × bloco 2 (algum pet) → pets diferentes: ok
    const scope = within(section()).getAllByLabelText(/Tutor com vários pets/)[1] as HTMLSelectElement;
    fireEvent.change(scope, { target: { value: 'all' } });                              // bloco 2: TODOS os pets são cães → gato no mesmo pet é impossível
    const box = await screen.findByTestId('conflitos');
    expect(box.textContent).toMatch(/Espécie: Gato/); expect(box.textContent).toMatch(/Espécie: Cão/); expect(box.textContent).toMatch(/nenhum pet/);
    expect((aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    await waitFor(() => expect(screen.queryByTestId('conflitos')).toBeNull());         // OU: nunca é contradição
  });

  it('dois valores do mesmo campo no mesmo bloco dos atalhos (macho e fêmea no mesmo pet) são apontados', async () => {
    await open();
    fireEvent.click(chip('Macho'));
    advanced(); moreFilter(0); pick(/^Pet/, /^Sexo do pet/);                           // 2ª condição de sexo no mesmo bloco
    const selects = within(section()).getAllByLabelText('Sexo do pet') as HTMLSelectElement[];
    fireEvent.change(selects[selects.length - 1], { target: { value: 'female' } });
    const box = await screen.findByTestId('conflitos');
    expect(box.textContent).toMatch(/Sexo do pet: Macho/); expect(box.textContent).toMatch(/Sexo do pet: Fêmea/);
  });

  it('chips e avançados mostram sempre o MESMO estado: o que se muda de um lado aparece do outro', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced();
    expect((within(section()).getAllByLabelText('Gato').find((e) => e.tagName === 'INPUT') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(section()).getAllByLabelText('Cão').find((e) => e.tagName === 'INPUT')!);        // marca Cão pelo avançado
    await waitFor(() => expect(chip('Cão').getAttribute('aria-checked')).toBe('true'));                      // o chip acompanha
    fireEvent.click(chip('Gato'));                                                                           // desmarca pelo chip
    expect((within(section()).getAllByLabelText('Gato').find((e) => e.tagName === 'INPUT') as HTMLInputElement).checked).toBe(false);
  });

  it('criar o bloco rápido não troca um OU já escolhido por E (ordem: avançado primeiro, chip depois)', async () => {
    await open();
    advanced(); addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getByLabelText('Estado cadastrado pelo tutor'), { target: { value: 'SP' } });
    addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getAllByLabelText('Estado cadastrado pelo tutor')[1], { target: { value: 'RJ' } });
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    // com OU entre blocos os atalhos já nascem travados: nenhum chip consegue virar um bloco E por baixo
    for (const n of ['Cão', 'Gato']) expect(disabled(chip(n))).toBe(true);
    fireEvent.click(chip('Gato'));
    await new Promise((r) => setTimeout(r, 500));
    expect(lastBody().filter.root.op).toBe('or');
    expect(JSON.stringify(lastBody().filter)).not.toMatch(/pet_species/);
  });
});

describe('"Criar campanha com este público" leva TODOS os filtros e nunca envia sozinho', () => {
  const noSend = () => be.calls.filter((c) => c.method === 'POST' && /\/batches|\/stop|\/resume|\/release|\/recover|\/close/.test(c.path));

  it('combinação avançada completa (atalhos + bloco OU com marca e estado + escopos) chega idêntica à campanha', async () => {
    await open();
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Fêmea')); fireEvent.click(chip(/^Adulto/)); fireEvent.click(chip('iPhone'));
    advanced(); addBlock();
    pick(/^Alimentação/, /^Marca\/produto/);
    fireEvent.change(within(section()).getByLabelText(/^Marca/), { target: { value: 'Premier' } });
    moreFilter(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getByLabelText('Estado cadastrado pelo tutor'), { target: { value: 'SP, RJ' } });
    fireEvent.change(within(section()).getByLabelText(/Bloco 2: combinar condições/), { target: { value: 'or' } });
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/Premier/), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 700));
    const antes = JSON.parse(JSON.stringify(lastBody().filter));
    expect(antes.root.items).toHaveLength(2);
    expect(antes.root.items[1]).toMatchObject({ kind: 'group', op: 'or' });
    const use = aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement;
    await waitFor(() => expect(use.disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(use);
    expect(noSend()).toHaveLength(0);
    fireEvent.change(await screen.findByLabelText(/Nome da campanha/), { target: { value: 'Combinação completa' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'Combinação completa' });
    await waitFor(() => expect(be.calls.filter((c) => c.path.endsWith('/audience/count') && c.body?.campaign_id).length).toBeGreaterThan(0), { timeout: 4000 });
    const depois = be.calls.filter((c) => c.path.endsWith('/audience/count') && c.body?.campaign_id).pop()!.body.filter;
    expect(depois).toEqual(antes);                                                      // mesmo filtro, byte a byte (JSON)
    // e o construtor da campanha mostra a combinação inteira
    expect(screen.getByText(/filtros que você montou na segmentação foram trazidos/)).toBeTruthy();
    expect((screen.getByLabelText('Gato') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Sexo do pet') as HTMLSelectElement).value).toBe('female');
    expect((screen.getByLabelText(/^Marca/) as HTMLInputElement).value).toBe('Premier');
    expect((screen.getByLabelText('Estado cadastrado pelo tutor') as HTMLInputElement).value).toBe('SP, RJ');
    expect((screen.getByLabelText(/Bloco 2: combinar condições/) as HTMLSelectElement).value).toBe('or');
    // nada de envio: só o rascunho foi criado, sem prévia, sem lote
    expect(be.count('POST', '/campaigns')).toBe(1);
    expect(be.calls.some((c) => c.method === 'POST' && /\/batches(\/preview)?$/.test(c.path))).toBe(false);
    expect(noSend()).toHaveLength(0);
  });

  it('com OU entre os blocos o filtro também chega inteiro (raiz OU preservada)', async () => {
    await open();
    advanced(); addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getByLabelText('Estado cadastrado pelo tutor'), { target: { value: 'SP' } });
    addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getAllByLabelText('Estado cadastrado pelo tutor')[1], { target: { value: 'RJ' } });
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    await new Promise((r) => setTimeout(r, 700));
    const antes = JSON.parse(JSON.stringify(lastBody().filter));
    expect(antes.root.op).toBe('or');
    const use = aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement;
    await waitFor(() => expect(use.disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(use);
    fireEvent.change(await screen.findByLabelText(/Nome da campanha/), { target: { value: 'Raiz OU' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'Raiz OU' });
    await waitFor(() => expect(be.calls.filter((c) => c.path.endsWith('/audience/count') && c.body?.campaign_id).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(be.calls.filter((c) => c.path.endsWith('/audience/count') && c.body?.campaign_id).pop()!.body.filter).toEqual(antes);
    expect((screen.getByLabelText('Como combinar os blocos') as HTMLSelectElement).value).toBe('or');
    expect(noSend()).toHaveLength(0);
  });

  it('"Voltar" descarta o que seria levado: a próxima campanha criada à mão começa sem filtros', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    const use = aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement;
    await waitFor(() => expect(use.disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(use);
    await screen.findByLabelText(/Nome da campanha/);
    fireEvent.click(screen.getByRole('button', { name: /Voltar às campanhas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    fireEvent.change(await screen.findByLabelText(/Nome da campanha/), { target: { value: 'À mão' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'À mão' });
    expect(screen.getByText(/Sem filtros: o público é/)).toBeTruthy();
    expect(screen.queryByText(/foram trazidos/)).toBeNull();
  });

  it('o botão fica desligado sem público (0 alcançáveis) e entrar na tela nunca dispara nada além de leituras', async () => {
    be.world = [];
    await open();
    await waitFor(() => expect(be.count('POST', '/audience/count')).toBeGreaterThan(0), { timeout: 3000 });
    fireEvent.click(chip('Gato'));
    await new Promise((r) => setTimeout(r, 700));
    expect((aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(be.calls.filter((c) => c.method === 'POST' && !/audience\/count/.test(c.path))).toHaveLength(0);
  });
});
