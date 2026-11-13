/**
 * Etapa 5.1 — contagem sempre vinda do servidor (sem somar/subtrair na tela), histórico de filtros, rótulos claros.
 * O servidor falso (testBackend) calcula tudo a partir de um "mundo" de 200 gatos (100 fêmeas) + 100 cães.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); be.useWorld(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openCampaign = async (name = 'Ração gatos') => {
  render(<SegmentedCampaigns />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByRole('heading', { name });
};
/** Texto do número de um quadro da contagem (ex.: "Ainda disponíveis"). */
const tile = (label: string) => {
  const l = screen.getAllByText(label).find((e) => e.tagName === 'P' && e.className.includes('uppercase'))!;
  return (l.nextElementSibling as HTMLElement).textContent;
};
const waitTiles = (expected: Record<string, string>) => waitFor(() => {
  for (const [k, v] of Object.entries(expected)) expect(tile(k)).toBe(v);
}, { timeout: 3500 });
const pickCats = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar bloco de filtros/ }));
  const group = screen.getByRole('group', { name: 'Escolha um filtro' });
  fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
  fireEvent.click(within(group).getByRole('button', { name: /^Espécie/ }));
  fireEvent.click(screen.getByLabelText('Gato'));
};
const typeQty = (n: string) => fireEvent.change(screen.getByLabelText('Quantidade de tutores no lote'), { target: { value: n } });
const lote = async (n: number) => {
  typeQty(String(n));
  await waitFor(() => expect((screen.getByRole('button', { name: /Conferir prévia|Gerar nova prévia/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Conferir prévia|Gerar nova prévia/ }));
  await screen.findByRole('region', { name: 'Prévia do lote' });
  fireEvent.change(screen.getByLabelText(new RegExp(`digite ${n}`)), { target: { value: String(n) } });
  fireEvent.click(screen.getByRole('button', { name: /Confirmar e enviar/ }));
  await screen.findByText(new RegExp(`reservado para ${n} tutores`));
};

describe('1. contagem após cada operação (exemplo obrigatório: 200 disponíveis → 50, 30, 100)', () => {
  it('50 usados/150 disponíveis → 80/120 → 180/20, sempre recalculado no servidor', async () => {
    be.addCampaign();
    await openCampaign();
    await pickCats();
    typeQty('50');
    await waitTiles({ 'Atendem aos filtros': '200', 'Já usados na campanha': '0', 'Ainda disponíveis': '200' });
    const countsBefore = be.count('POST', '/audience/count');
    await lote(50);
    await waitTiles({ 'Já usados na campanha': '50', 'Ainda disponíveis': '150' });
    expect(be.count('POST', '/audience/count')).toBeGreaterThan(countsBefore);      // veio de uma nova consulta, não de conta local
    await lote(30);
    await waitTiles({ 'Já usados na campanha': '80', 'Ainda disponíveis': '120' });
    await lote(100);
    await waitTiles({ 'Já usados na campanha': '180', 'Ainda disponíveis': '20' });
    // a tela não calcula nada: o valor exibido é exatamente o que o servidor devolveu
    const last = be.last('POST', '/audience/count')!;
    expect(last.body.campaign_id).toBeTruthy();
  });

  it('enquanto atualiza, o número antigo NÃO aparece como se fosse atual', async () => {
    be.addCampaign();
    await openCampaign();
    await pickCats();
    typeQty('50');
    await waitTiles({ 'Ainda disponíveis': '200' });
    be.countDelays.push(600);                                                        // a próxima contagem demora
    typeQty('40');
    await waitFor(() => expect(tile('Ainda disponíveis')).toBe('…'));              // some o número velho na hora
    expect(screen.getByText(/Atualizando a contagem no servidor/)).toBeTruthy();
    await waitTiles({ 'Ainda disponíveis': '200', 'Próximo lote': '40' });
  });

  it('resposta atrasada de uma consulta antiga não sobrescreve a mais recente', async () => {
    be.addCampaign();
    await openCampaign();
    await pickCats();
    typeQty('50');
    await waitTiles({ 'Atendem aos filtros': '200' });
    // 1ª consulta (gatos + fêmea) fica lenta; a 2ª (só gatos) é rápida. O resultado final tem que ser o da última escolha.
    fireEvent.click(screen.getByRole('button', { name: /Adicionar filtro/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Sexo do pet/ }));
    fireEvent.change(screen.getByLabelText('Sexo do pet'), { target: { value: 'female' } });
    be.countDelays.push(1500);                                                       // atrasa a consulta "gato + fêmea" (a próxima a sair)
    await new Promise((r) => setTimeout(r, 520));                                    // deixa a consulta lenta sair
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Sexo do pet' }));    // volta para "só gatos": consulta rápida
    await waitTiles({ 'Atendem aos filtros': '200' });
    await new Promise((r) => setTimeout(r, 1700));                                   // a resposta velha (100) chega depois…
    expect(tile('Atendem aos filtros')).toBe('200');                                 // …e é descartada
  });

  it('trocar de campanha mostra a contagem da outra campanha (sem números da anterior)', async () => {
    const a = be.addCampaign({ name: 'Campanha A' }); const b = be.addCampaign({ name: 'Campanha B' });
    be.usedSet(a.id); [...Array(60)].forEach((_, i) => be.usedSet(a.id).add(`g${i}`));
    be.usedSet(b.id);
    render(<SegmentedCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Campanha A/ }));
    await screen.findByRole('heading', { name: 'Campanha A' });
    typeQty('10');
    await waitTiles({ 'Já usados na campanha': '60', 'Ainda disponíveis': '240' });
    fireEvent.click(screen.getByRole('button', { name: /Voltar às campanhas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Campanha B/ }));
    await screen.findByRole('heading', { name: 'Campanha B' });
    typeQty('10');
    await waitTiles({ 'Já usados na campanha': '0', 'Ainda disponíveis': '300' });
  });

  it('filtros mudados entre lotes: o histórico de usados fica, e a tela diz quantos deles atendem aos filtros atuais', async () => {
    be.addCampaign();
    await openCampaign();
    await pickCats();                                                                // gatos
    fireEvent.click(screen.getByRole('button', { name: /Adicionar filtro/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Sexo do pet/ }));
    fireEvent.change(screen.getByLabelText('Sexo do pet'), { target: { value: 'female' } });
    typeQty('50');
    await waitTiles({ 'Atendem aos filtros': '100', 'Ainda disponíveis': '100' });
    await lote(50);                                                                  // 50 gatas usadas
    await waitTiles({ 'Já usados na campanha': '50', 'Ainda disponíveis': '50' });
    // troca para gatos MACHOS: nenhuma das 50 usadas atende ao filtro atual, mas o histórico continua 50
    fireEvent.change(screen.getByLabelText('Sexo do pet'), { target: { value: 'male' } });
    await waitTiles({ 'Atendem aos filtros': '100', 'Já usados na campanha': '50', 'Ainda disponíveis': '100' });
    expect(screen.getByText('0 deles atendem aos filtros atuais')).toBeTruthy();
    // e para "todos os gatos": as 50 usadas atendem, só 150 estão disponíveis
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Sexo do pet' }));
    await waitTiles({ 'Atendem aos filtros': '200', 'Já usados na campanha': '50', 'Ainda disponíveis': '150' });
    expect(screen.getByText('todos atendem aos filtros atuais')).toBeTruthy();
  });

  it('devolver nunca tentados e continuar atualizam a contagem a partir do servidor', async () => {
    const c = be.addCampaign();
    const ids = [...Array(40)].map((_, i) => `g${i}`); ids.forEach((id) => be.usedSet(c.id).add(id));
    const b = be.addBatch(c, { phase: 'interrupted', reserved: 40, requested: 40, counts: { reserved: 15, sending: 0, accepted: 20, failed: 2, uncertain: 3 }, filters: { version: 1, root: { kind: 'group', op: 'and', items: [] } }, ids });
    await openCampaign();
    typeQty('10');
    await waitTiles({ 'Já usados na campanha': '40', 'Ainda disponíveis': '260' });
    fireEvent.change(screen.getByLabelText(/digite 15/), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Devolver os 15 ao público/ }));
    await waitFor(() => expect(be.count('POST', `/batches/${b.id}/release`)).toBe(1));
    await waitTiles({ 'Já usados na campanha': '25', 'Ainda disponíveis': '275' });   // 15 voltaram para o público
  });

  it('continuar os nunca tentados mantém o total de usados e fecha o lote', async () => {
    const c = be.addCampaign();
    const ids = [...Array(40)].map((_, i) => `g${i}`); ids.forEach((id) => be.usedSet(c.id).add(id));
    const b = be.addBatch(c, { phase: 'interrupted', reserved: 40, requested: 40, counts: { reserved: 15, sending: 0, accepted: 25, failed: 0, uncertain: 0 }, filters: { version: 1, root: { kind: 'group', op: 'and', items: [] } }, ids });
    await openCampaign();
    typeQty('10');
    await waitTiles({ 'Já usados na campanha': '40', 'Ainda disponíveis': '260' });
    fireEvent.change(screen.getByLabelText(/digite 15/), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar só os 15 nunca tentados/ }));
    await waitFor(() => expect(be.count('POST', `/batches/${b.id}/resume`)).toBe(1));
    await waitFor(() => expect(screen.getAllByText(/Concluído/).length).toBeGreaterThan(0));
    await waitTiles({ 'Já usados na campanha': '40', 'Ainda disponíveis': '260' });
  });
});

describe('2. histórico dos filtros', () => {
  const FEMEA = { version: 1, root: { kind: 'group', op: 'and', items: [{ kind: 'group', op: 'and', pet_scope: 'same', items: [{ kind: 'rule', field: 'pet_species', op: 'in', value: ['cat'] }, { kind: 'rule', field: 'pet_sex', op: 'eq', value: 'female' }] }] } };

  it('cada lote mostra um resumo legível dos filtros usados na reserva', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { filters: FEMEA, ids: [] });
    be.addBatch(c, { filters: { version: 1, root: { kind: 'group', op: 'and', items: [] } }, ids: [] });
    await openCampaign();
    const l1 = screen.getByLabelText('Filtros do lote 1');
    expect(l1.textContent).toContain('Espécie: Gato E Sexo do pet: Fêmea');
    expect(l1.textContent).toContain('o mesmo pet atende a tudo');
    expect(screen.getByLabelText('Filtros do lote 2').textContent).toContain('Sem filtros: todos os tutores alcançáveis por push');
  });

  it('ao reabrir, os filtros do ÚLTIMO lote voltam como ponto de partida, com aviso de que podem ser alterados', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { filters: FEMEA, ids: [] });
    await openCampaign();
    expect((screen.getByLabelText('Gato') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Sexo do pet') as HTMLSelectElement).value).toBe('female');
    expect((screen.getByLabelText(/Tutor com vários pets/) as HTMLSelectElement).value).toBe('same');
    expect(screen.getByText(/Filtros do lote 1 carregados como ponto de partida/)).toBeTruthy();
    // a contagem já reflete esses filtros
    typeQty('10');
    await waitTiles({ 'Atendem aos filtros': '100' });
  });

  it('editar os filtros da tela NÃO altera o histórico do lote já reservado', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { filters: FEMEA, ids: [] });
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Sexo do pet' }));
    expect(screen.getByLabelText('Filtros do lote 1').textContent).toContain('Sexo do pet: Fêmea');
    expect(be.calls.filter((x) => x.method === 'POST' && /campaigns\/[^/]+$/.test(x.path))).toHaveLength(0);
  });

  it('campanha sem lotes começa sem filtros', async () => {
    be.addCampaign();
    await openCampaign();
    expect(screen.getByText(/Sem filtros: o público é/)).toBeTruthy();
    expect(screen.queryByText(/carregados como ponto de partida/)).toBeNull();
  });
});

describe('3. clareza', () => {
  it('destino e variáveis aparecem em linguagem comum, com exemplo; sem "produto"/"home" crus', async () => {
    be.addCampaign({ content: { title: '{tutor}, ração nova para {pets}', message: 'Oferta para {pets}.', goal: null, destination: 'produto', product_url: 'https://www.amazon.com.br/dp/X?tag=t-20', product_title: 'Ração X' } });
    await openCampaign();
    expect(screen.getByText('O produto do link (direto na loja)')).toBeTruthy();
    expect(screen.queryByText(/^produto$/)).toBeNull();
    expect(screen.getByText('Ana, ração nova para Thor')).toBeTruthy();
    expect(screen.getByText(/No envio, .*vira o nome de cada tutor/)).toBeTruthy();
  });

  it('no formulário de nova campanha a prévia do texto explica a substituição', async () => {
    render(<SegmentedCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: '{tutor}, olha para {pets}' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta para {pets}.' } });
    const box = screen.getByLabelText('Prévia do texto');
    expect(box.textContent).toContain('Ana, olha para Thor');
    expect(box.textContent).toContain('Oferta para Thor.');
    expect(box.textContent).toMatch(/Cada tutor recebe com o próprio nome/);
  });

  it('os passos têm numeração coerente: 1 Campanha, 2 Conteúdo, 3 Filtros, 4 Lote, 5 Histórico', async () => {
    be.addCampaign();
    await openCampaign();
    expect(screen.getByText('Campanha', { selector: 'p' })).toBeTruthy();
    const badges = Array.from(document.querySelectorAll('[aria-hidden="true"]')).map((e) => e.textContent).filter((t) => /^[1-5]$/.test(t ?? ''));
    expect(badges).toEqual(['1', '2', '3', '4', '5']);
  });

  it('E/OU é explicado com palavras simples (bloco e entre blocos), e muda conforme a escolha', async () => {
    be.addCampaign();
    await openCampaign();
    await pickCats();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar filtro/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Sexo do pet/ }));
    expect(screen.getByText('E: o tutor precisa atender a TODAS as condições deste bloco.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Bloco 1: combinar condições/), { target: { value: 'or' } });
    expect(screen.getByText('OU: basta o tutor atender a UMA das condições deste bloco.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Outro bloco de filtros/ }));
    fireEvent.click(screen.getByRole('button', { name: /Outro bloco de filtros/ }));
    expect(screen.getByText(/E: o tutor precisa atender a TODOS os blocos/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Como combinar os blocos'), { target: { value: 'or' } });
    expect(screen.getByText(/OU: basta o tutor atender a UM dos blocos/)).toBeTruthy();
    expect(screen.getByText(/E = o tutor precisa atender a todas as condições combinadas/)).toBeTruthy();
  });
});

describe('4. conferência do link comercial', () => {
  it('sem leitura externa: mensagem compreensível, o link não é alterado e nada é reescrito', async () => {
    be.on('POST /link-preview', (b) => ({ json: { url: b.url, store: 'Amazon', host: 'amzn.to', final_host: null, title: null, image: null, readable: false, reason: 'Não consegui abrir o link agora. Digite o nome do produto.' } }));
    render(<SegmentedCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    const link = 'https://www.amazon.com.br/dp/B0X?tag=amazonpetmol-20&linkCode=ll1&th=1&psc=1';
    fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Teste link' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Oferta' } });
    fireEvent.change(screen.getByLabelText(/Link do produto/), { target: { value: link } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
    await screen.findByText(/Não foi possível ler o nome do produto agora/);
    expect(screen.getByText(/ele continua exatamente como você colou/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Ração X' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await waitFor(() => expect(be.count('POST', '/campaigns')).toBe(1));
    expect(be.last('POST', '/campaigns')!.body.product_url).toBe(link);
  });
});

describe('5. envio avulso: o bloqueio continua; só a mensagem explica', () => {
  it('durante um lote em andamento a tela de campanhas avisa que o avulso também aguarda', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { phase: 'sending', counts: { reserved: 0, sending: 5, accepted: 45, failed: 0, uncertain: 0 }, filters: { version: 1, root: { kind: 'group', op: 'and', items: [] } }, ids: [] });
    await openCampaign();
    expect(screen.getByText('envio avulso', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(/só permite um envio por vez/)).toBeTruthy();
  });
});
