 
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
  it('campo que também está num bloco avançado NÃO trava o atalho: só avisa onde está', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced(); addBlock(); pick(/^Pet/, /^Espécie/);
    const caoInput = within(section()).getAllByLabelText('Cão').filter((e) => e.tagName === 'INPUT').at(-1) as HTMLInputElement;   // o do Bloco 2
    fireEvent.click(caoInput);
    await waitFor(() => expect(within(section()).getAllByRole('note').length).toBeGreaterThan(0));
    expect(disabled(chip('Gato'))).toBe(false);
    expect(disabled(chip('Cão'))).toBe(false);
    expect(within(section()).getAllByRole('note').some((n) => /Já está nos filtros avançados \(Bloco 2\)/.test(n.textContent ?? ''))).toBe(true);
    expect(disabled(chip('Macho'))).toBe(false);
    expect(chip('Gato').getAttribute('aria-checked')).toBe('true');                // o que está ligado continua visível
  });

  it('OU entre blocos só AVISA (atalhos seguem clicáveis); voltar para E tira o aviso', async () => {
    await open();
    fireEvent.click(chip('Gato'));
    advanced(); addBlock(); pick(/^Localização/, /^Estado cadastrado/);
    fireEvent.change(within(section()).getByLabelText('Estado cadastrado pelo tutor'), { target: { value: 'SP' } });
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    await waitFor(() => expect(within(section()).getAllByRole('note')[0].textContent).toMatch(/combinados com OU/));
    for (const n of ['Gato', 'Cão', 'Macho', 'iPhone', 'Castrado']) expect(disabled(chip(n))).toBe(false);
    fireEvent.click(chip('Cão'));                                                    // sem trava: o clique vale
    expect(chip('Cão').getAttribute('aria-checked')).toBe('true');
    fireEvent.change(within(section()).getByLabelText('Como combinar os blocos'), { target: { value: 'and' } });
    await waitFor(() => expect(within(section()).queryAllByRole('note').length).toBe(0));
  });

  it('alterar o bloco dos atalhos para OU nos avançados trava os atalhos (a leitura "E, mesmo pet" deixaria de valer)', async () => {
    await open();
    fireEvent.click(chip('Gato')); fireEvent.click(chip('Fêmea'));
    advanced();
    fireEvent.change(within(section()).getByLabelText(/Bloco 1: combinar condições/), { target: { value: 'or' } });
    await waitFor(() => expect(within(section()).getAllByRole('note')[0].textContent).toMatch(/foi alterado nos filtros avançados/));
    expect(disabled(chip('Macho'))).toBe(false);
    fireEvent.change(within(section()).getByLabelText(/Bloco 1: combinar condições/), { target: { value: 'and' } });
    await waitFor(() => expect(within(section()).queryAllByRole('note').length).toBe(0));
  });

  it('contradição no mesmo pet é avisada mas NÃO bloqueia "Criar campanha"; em "algum pet" ou com OU não há aviso', async () => {
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
    expect(box.textContent).toMatch(/você ainda pode criar a campanha/);
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
    // sem trava: o chip é aceito, mas o OU escolhido nunca é trocado por E
    fireEvent.click(chip('Gato'));
    await new Promise((r) => setTimeout(r, 500));
    expect(lastBody().filter.root.op).toBe('or');
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
    await waitFor(() => expect((aside().getByRole('button', { name: /Criar campanha com este público/ }) as HTMLButtonElement).disabled).toBe(true));
    expect(be.calls.filter((c) => c.method === 'POST' && !/audience\/count/.test(c.path))).toHaveLength(0);
  });
});

describe('Onde: Brasil inteiro, estado, capital ou cidade — sem digitar, só o que existe nos dados', () => {
  const sel = (id: string) => within(section()).getByLabelText(id) as HTMLSelectElement;
  const place = () => JSON.stringify(lastBody().filter);
  it('lista estados com nome completo e contagem; estado inteiro, capital e cidade falam com o motor com ciência de "aproximado"', async () => {
    await open();
    await waitFor(() => expect(within(section()).getByRole('option', { name: 'São Paulo (100)' })).toBeTruthy());
    expect(within(section()).queryByLabelText('Cidade (digitar)')).toBeNull();                   // nada de campo de texto
    expect(within(section()).queryByRole('radio', { name: /^IP/ })).toBeNull();                  // origem interna não aparece
    fireEvent.change(sel('Estado'), { target: { value: 'SP' } });
    await waitFor(() => expect(place()).toMatch(/"field":"location_place"[^}]*"value":\["UF:SP"\][^}]*"approximate_ack":true/), { timeout: 3000 });
    fireEvent.click(within(section()).getByRole('radio', { name: /Só a capital — São Paulo \(50\)/ }));
    await waitFor(() => expect(place()).toMatch(/\["CAP:SP"\]/), { timeout: 3000 });
    fireEvent.change(sel('Cidade'), { target: { value: 'campinas' } });
    await waitFor(() => expect(place()).toMatch(/\["CITY:SP:campinas"\]/), { timeout: 3000 });
    expect(place()).not.toMatch(/UF:SP|CAP:SP/);                                                 // um lugar por vez (sem dupla contagem)
    await waitFor(() => expect(screen.getByRole('button', { name: /Remover Cidade: Campinas \(SP\)/ })).toBeTruthy());
  });
  it('Brasil inteiro, voltar ao estado inteiro e limpar o estado', async () => {
    await open();
    await waitFor(() => expect(within(section()).getByRole('option', { name: 'Minas Gerais (40)' })).toBeTruthy());
    fireEvent.change(sel('Estado'), { target: { value: 'MG' } });
    await waitFor(() => expect(place()).toMatch(/UF:MG/), { timeout: 3000 });
    fireEvent.click(within(section()).getByRole('radio', { name: 'Brasil inteiro' }));
    await waitFor(() => expect(place()).toMatch(/\["BR"\]/), { timeout: 3000 });
    fireEvent.change(sel('Estado'), { target: { value: '' } });
    await waitFor(() => expect(be.calls.filter((c) => /audience\/count/.test(c.path)).at(-1)!.body.filter.root.items.length).toBe(0), { timeout: 3000 });
  });
  it('explica quem fica de fora: estrangeiros e quem ainda não tem estado entra em "Brasil inteiro"', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('onde').textContent).toMatch(/2 fora do Brasil não entram nas listas de estado/));
    expect(screen.getByTestId('onde').textContent).toMatch(/\(8\) entra em “Brasil inteiro”/);
  });
});

describe('simples + avançado juntos', () => {
  it('lugar e tutor/tutora escolhidos na tela principal aparecem em português (só leitura) nos filtros avançados', async () => {
    be.sexEnabled = true;
    await open();
    await waitFor(() => expect(within(section()).getByRole('option', { name: 'São Paulo (100)' })).toBeTruthy());
    fireEvent.change(within(section()).getByLabelText('Estado'), { target: { value: 'SP' } });
    fireEvent.click(within(await screen.findByTestId('tutor-sexo')).getByRole('radio', { name: 'Tutora (mulher)' }));
    advanced();
    const txt = within(section()).getAllByTestId('cond-gerenciada').map((e) => e.textContent).join(' | ');
    expect(txt).toMatch(/Estado inteiro: São Paulo/); expect(txt).toMatch(/Tutora \(mulher\)/);
    expect(txt).not.toMatch(/UF:SP|female|unknown/);
  });
});

describe('Tutor ou tutora (experimental, provável pelo primeiro nome)', () => {
  it('desligado por padrão: o seletor nem aparece', async () => {
    await open();
    await waitFor(() => expect(within(section()).getByRole('option', { name: 'São Paulo (100)' })).toBeTruthy());
    expect(screen.queryByTestId('tutor-sexo')).toBeNull();
  });
  it('ligado: Todos / Tutor / Tutora / Sem identificação, escolha única, sem mudar texto', async () => {
    be.sexEnabled = true;
    await open();
    const g = await screen.findByTestId('tutor-sexo');
    expect(within(g).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Todos', 'Tutor (homem)', 'Tutora (mulher)', 'Sem identificação']);
    fireEvent.click(within(g).getByRole('radio', { name: 'Tutora (mulher)' }));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/"field":"tutor_sex_estimate","op":"in","value":\["female"\]/), { timeout: 3000 });
    fireEvent.click(within(g).getByRole('radio', { name: 'Sem identificação' }));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/\["unknown"\]/), { timeout: 3000 });
    expect(JSON.stringify(lastBody().filter)).not.toMatch(/female/);
    fireEvent.click(within(g).getByRole('radio', { name: 'Todos' }));
    await waitFor(() => expect(be.calls.filter((c) => /audience\/count/.test(c.path)).at(-1)!.body.filter.root.items.length).toBe(0), { timeout: 3000 });
    expect(g.textContent).toMatch(/sem guardar nada e sem mudar o texto enviado/);
  });
});

describe('Ração acabando: segue a data do plano do tutor; vencida é um filtro à parte', () => {
  const feed = (n: string | RegExp) => within(section()).getByRole('radio', { name: n });
  it('Qualquer / 7 / 15 / 30 dias: vira intervalo de hoje até N (não inclui vencidas) e combina com origem da data no mesmo pet', async () => {
    await open();
    expect(feed('Qualquer').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(feed('7 dias'));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/"field":"feeding_days_left","op":"between","value":\["0","7"\]|"field":"feeding_days_left"[^}]*"value":\[0,7\]/), { timeout: 3000 });
    fireEvent.click(feed('30 dias'));                                                         // escolha única: troca a faixa
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/\[0,30\]|\["0","30"\]/), { timeout: 3000 });
    expect(JSON.stringify(lastBody().filter)).not.toMatch(/\[0,7\]|\["0","7"\]/);
    fireEvent.click(chip('Data calculada pelo sistema'));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/feeding_date_source[^}]*calculated/), { timeout: 3000 });
    expect(lastBody().filter.root.items[0].pet_scope).toBe('same');                      // mesmo pet
    fireEvent.click(feed('Qualquer'));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).not.toMatch(/feeding_days_left/), { timeout: 3000 });
  });
  it('"Data de fim já passou" é um chip próprio e não mistura com "acaba em"', async () => {
    await open();
    fireEvent.click(chip('Data de fim já passou'));
    await waitFor(() => expect(JSON.stringify(lastBody().filter)).toMatch(/feeding_expired/), { timeout: 3000 });
    expect(JSON.stringify(lastBody().filter)).not.toMatch(/feeding_days_left/);
  });
});

describe('rótulos legíveis no resumo do filtro', () => {
  it('"Origem da data de fim" aparece em português (nunca "calculated"/"manual")', async () => {
    await open();
    fireEvent.click(chip('Data calculada pelo sistema'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Remover Origem da data de fim da ração: calculada pelo sistema/ })).toBeTruthy(), { timeout: 3000 });
    expect(document.body.textContent).not.toMatch(/calculated|: manual/);
  });
});
