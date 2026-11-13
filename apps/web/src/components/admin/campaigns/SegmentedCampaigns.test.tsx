/* eslint-disable @typescript-eslint/no-explicit-any -- servidor falso de teste: corpos JSON livres */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SegmentedCampaigns } from './SegmentedCampaigns';
import { Backend, err } from './testBackend';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

let be: Backend;
beforeEach(() => { be = new Backend(); be.install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const openCampaign = async (name = 'Ração gatos') => {
  render(<SegmentedCampaigns />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByRole('heading', { name });
};
const typeQty = (n: string) => fireEvent.change(screen.getByLabelText('Quantidade de tutores no lote'), { target: { value: n } });
const gerarPrevia = async (n = '50') => {
  typeQty(n);
  await waitFor(() => expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Conferir prévia/ }));
  return screen.findByRole('region', { name: 'Prévia do lote' });
};
const confirmar = (n: number) => {
  fireEvent.change(screen.getByLabelText(new RegExp(`digite ${n}`)), { target: { value: String(n) } });
  return screen.getByRole('button', { name: /Confirmar e enviar/ }) as HTMLButtonElement;
};

describe('modo desligado', () => {
  it('com a flag desligada mostra aviso e não chama nenhum outro endpoint', async () => {
    be.enabled = false;
    render(<SegmentedCampaigns />);
    await screen.findByText(/ainda não foram liberadas/);
    expect(be.calls.map((c) => c.path)).toEqual(['/config']);
  });
});

describe('1–2. criar campanha e conteúdo', () => {
  it('cria a campanha com o link EXATAMENTE como foi colado e segue para os filtros', async () => {
    render(<SegmentedCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    const link = 'https://www.amazon.com.br/dp/B0TEST?tag=amazonpetmol-20&linkCode=ll1&th=1 ';
    fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Ração Premier gatos' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Premier com desconto.' } });
    fireEvent.change(screen.getByLabelText(/Link do produto/), { target: { value: link } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
    await screen.findByText(/Loja reconhecida/);
    fireEvent.click(screen.getByRole('button', { name: /Salvar campanha e continuar/ }));
    await screen.findByRole('heading', { name: 'Ração Premier gatos' });
    const body = be.last('POST', '/campaigns')!.body;
    expect(body.product_url).toBe(link.trim());                       // nenhum parâmetro de afiliado mexido
    expect(body.destination).toBe('produto');
    expect(be.count('POST', '/campaigns')).toBe(1);
  });
  it('clique duplicado em Salvar cria uma campanha só', async () => {
    be.delayMs = 30;
    render(<SegmentedCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    fireEvent.change(screen.getByLabelText(/Nome da campanha/), { target: { value: 'Teste dupla' } });
    fireEvent.change(screen.getByLabelText(/Mensagem principal/), { target: { value: 'Olá' } });
    const b = screen.getByRole('button', { name: /Salvar campanha e continuar/ });
    fireEvent.click(b); fireEvent.click(b); fireEvent.click(b);
    await screen.findByRole('heading', { name: 'Teste dupla' });
    expect(be.count('POST', '/campaigns')).toBe(1);
  });
  it('conteúdo de campanha com lote vem travado (só leitura) e há cópia editável', async () => {
    const c = be.addCampaign(); be.addBatch(c, {});
    await openCampaign();
    expect(screen.getByText(/Conteúdo travado/)).toBeTruthy();
    expect(screen.queryByLabelText(/Mensagem principal/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Criar cópia editável/ }));
    expect((screen.getByLabelText(/Nome da campanha/) as HTMLInputElement).value).toBe('Ração gatos (cópia)');
  });
});

describe('3–4. filtros e contagem dinâmica', () => {
  it('mostra os 6 grupos expansíveis e os 21 filtros', async () => {
    be.addCampaign();
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    let total = 0;
    for (const g of ['Tutor', 'Pet', 'Localização', 'Alimentação', 'Cuidados', 'Atividade']) {
      const btn = within(group).getByRole('button', { name: new RegExp(`^${g}`) });
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      total += within(group).getAllByRole('listitem').length;
      fireEvent.click(btn);
    }
    expect(total).toBe(21);
  });
  it('conta com os filtros montados e mostra tutores, alcançáveis, usados, disponíveis e próximo lote', async () => {
    be.available = 80; be.used = 20;
    be.addCampaign();
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Pet/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^Espécie/ }));
    fireEvent.click(screen.getByLabelText('Gato'));
    typeQty('30');
    await waitFor(() => expect(be.last('POST', '/audience/count')?.body.batch_size).toBe(30));
    const l = be.last('POST', '/audience/count')!.body;
    expect(l.filter.root.items[0].items[0]).toMatchObject({ field: 'pet_species', value: ['cat'] });
    expect(l.filter.root.items[0].pet_scope).toBe('any');
    expect(l.campaign_id).toBeTruthy();
    for (const t of ['Atendem aos filtros', 'Alcançáveis por push', 'Já usados na campanha', 'Ainda disponíveis', 'Próximo lote']) await screen.findByText(t);
  });
  it('não consulta enquanto houver condição incompleta', async () => {
    be.addCampaign();
    await openCampaign();
    be.calls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Localização/ }));
    fireEvent.click(within(group).getByRole('button', { name: /Perto de um ponto/ }));
    expect(screen.getByText(/Complete os filtros/)).toBeTruthy();
    expect(screen.getByText(/aproximada/, { selector: 'strong' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
    expect(be.count('POST', '/audience/count')).toBe(0);
  });
  it('sem destinatários disponíveis: não deixa gerar prévia nem enviar', async () => {
    be.available = 0;
    be.addCampaign();
    await openCampaign();
    typeQty('10');
    await screen.findByText(/Nenhum destinatário disponível/);
    expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('5–7. lote, prévia e confirmação', () => {
  it('fluxo feliz: prévia → digitar a quantidade → reserva com token, confirm_count e chave de idempotência', async () => {
    be.addCampaign();
    await openCampaign();
    const p = await gerarPrevia('50');
    expect(within(p).getByText(/Será reservado/).textContent).toContain('50');
    const btn = screen.getByRole('button', { name: /Confirmar e enviar/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);                       // só habilita digitando o número
    confirmar(50);
    fireEvent.click(btn);
    await screen.findByText(/reservado para 50 tutores/);
    const b = be.last('POST', '/batches')!.body;
    expect(b).toMatchObject({ batch_size: 50, all_available: false, confirm_count: 50 });
    expect(b.preview_token).toMatch(/^tok-/);
    expect(b.idempotency_key).toMatch(/^pc-/);
    expect(screen.queryByRole('region', { name: 'Prévia do lote' })).toBeNull();
    await screen.findByRole('heading', { name: 'Lote 1' });
  });
  it('"todos os disponíveis" envia all_available e sem batch_size', async () => {
    be.available = 37;
    be.addCampaign();
    await openCampaign();
    fireEvent.click(screen.getByLabelText(/Todos os disponíveis/));
    await waitFor(() => expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Conferir prévia/ }));
    await screen.findByRole('region', { name: 'Prévia do lote' });
    confirmar(37);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e enviar/ }));
    await screen.findByText(/reservado para 37/);
    expect(be.last('POST', '/batches')!.body).toMatchObject({ all_available: true, batch_size: null, confirm_count: 37 });
  });
  it('clique duplicado em Confirmar reserva uma vez só', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('20');
    const btn = confirmar(20);
    be.delayMs = 40;
    fireEvent.click(btn); fireEvent.click(btn); fireEvent.click(btn);
    await screen.findByText(/reservado para 20/);
    expect(be.count('POST', '/batches')).toBe(1);
  });
  it('público menor que o pedido: avisa com clareza e exige confirmar o número real', async () => {
    be.available = 12;
    be.addCampaign();
    await openCampaign();
    const p = await gerarPrevia('50');
    expect(within(p).getByRole('alert').textContent).toMatch(/pediu 50.*só há 12.*lote será de 12/);
    expect(screen.queryByLabelText(/digite 50/)).toBeNull();
    confirmar(12);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e enviar/ }));
    await screen.findByText(/reservado para 12/);
  });
  it('mudar quantidade ou filtros descarta a prévia (o token é preso a eles)', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    typeQty('60');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Prévia do lote' })).toBeNull());
  });
  it.each([
    ['token_expired', /prévia expirou/],
    ['preview_stale', /público mudou/],
    ['audience_changed', /público mudou/],
    ['reservation_conflict', /ao mesmo tempo/],
  ])('erro %s: explica, nada é reservado e pede nova prévia', async (code, rx) => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    be.on('POST /campaigns/camp1/batches', () => err(code, 'x'));
    fireEvent.click(confirmar(50));
    expect(await screen.findByText(rx)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Prévia do lote' })).toBeNull();
    expect(screen.getByRole('button', { name: /Conferir prévia/ })).toBeTruthy();
  });
  it('falha de rede: oferece repetir com a MESMA chave de idempotência (sem duplicar)', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const real = fetchMock.getMockImplementation()!;
    let failOnce = true;
    let lost: any = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (failOnce && String(url).endsWith('/batches') && init?.method === 'POST') { failOnce = false; lost = JSON.parse(String(init.body)); return Promise.reject(new TypeError('Failed to fetch')); }
      return real(url, init);
    });
    fireEvent.click(confirmar(50));
    await screen.findByText(/Sem conexão com o servidor/);
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    await screen.findByText(/reservado para 50/);
    expect(be.last('POST', '/batches')!.body.idempotency_key).toBe(lost.idempotency_key);
    expect(be.last('POST', '/batches')!.body.preview_token).toBe(lost.preview_token);
  });
  it('repetição devolvida pelo servidor (idempotent_replay) é informada como já processada', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    be.on('POST /campaigns/camp1/batches', (_b, s) => { const batch = s.addBatch(s.campaigns[0], {}); return { json: { batch, idempotent_replay: true, started: false } }; });
    fireEvent.click(confirmar(50));
    await screen.findByText(/já tinha sido processada/);
  });
  it('prévia expira na tela: o botão de confirmar fica bloqueado', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    const real = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => real() + 11 * 60 * 1000);
    await screen.findByText(/Prévia expirada/, undefined, { timeout: 3000 });
    expect((screen.getByRole('button', { name: /Confirmar e enviar/ }) as HTMLButtonElement).disabled).toBe(true);
    vi.restoreAllMocks();
  });
  it('lote em andamento bloqueia o próximo', async () => {
    const c = be.addCampaign(); be.addBatch(c, { phase: 'sending', counts: { reserved: 0, sending: 5, accepted: 45, failed: 0, uncertain: 0 } });
    await openCampaign();
    expect(screen.getByText(/Há um lote em andamento/)).toBeTruthy();
    typeQty('10');
    expect((screen.getByRole('button', { name: /Conferir prévia/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('campanha encerrada não aceita novos lotes', async () => {
    be.addCampaign({ status: 'closed' });
    await openCampaign();
    expect(screen.getAllByText(/encerrada/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Quantidade de tutores no lote')).toBeNull();
  });
});

describe('8. histórico, estados e recuperação', () => {
  it('mostra os cinco estados e nunca chama aceitação do provedor de "entregue"', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { counts: { reserved: 0, sending: 0, accepted: 40, failed: 6, uncertain: 4 }, reserved: 50 });
    await openCampaign();
    for (const t of ['Reservados:', 'Em envio:', 'Aceitos pelo provedor:', 'Com falha:', 'Resultado incerto:']) expect(screen.getAllByText(new RegExp(t)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/não é confirmação de entrega/i).length).toBeGreaterThan(0);
    const text = (document.body.textContent ?? '').replace(/(não é confirmação de|não confirma a) entrega( no celular| ao celular)?/gi, '');
    expect(/entregue/i.test(text)).toBe(false);
    expect(screen.getAllByText(/não são reenviados/i).length).toBeGreaterThan(0);
  });
  it('lote parado: reclassificar só chama /recover (não envia)', async () => {
    const c = be.addCampaign(); const b = be.addBatch(c, { phase: 'sending', interrupted_suspected: true, counts: { reserved: 0, sending: 5, accepted: 45, failed: 0, uncertain: 0 } });
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: /Verificar lote parado/ }));
    await waitFor(() => expect(be.count('POST', `/batches/${b.id}/recover`)).toBe(1));
    expect(be.count('POST', '/batches')).toBe(0);
  });
  it('lote interrompido: continuar SÓ os nunca tentados exige digitar o número', async () => {
    const c = be.addCampaign();
    const b = be.addBatch(c, { phase: 'interrupted', reserved: 50, counts: { reserved: 12, sending: 0, accepted: 30, failed: 3, uncertain: 5 } });
    await openCampaign();
    expect(screen.getByText(/Lote interrompido/)).toBeTruthy();
    expect(screen.getByText(/resultado incerto/, { selector: 'strong' })).toBeTruthy();
    const resume = screen.getByRole('button', { name: /Continuar só os 12 nunca tentados/ }) as HTMLButtonElement;
    expect(resume.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/digite 12/), { target: { value: '12' } });
    expect(resume.disabled).toBe(false);
    fireEvent.click(resume);
    await waitFor(() => expect(be.count('POST', `/batches/${b.id}/resume`)).toBe(1));
    expect(be.last('POST', `/batches/${b.id}/resume`)!.body).toEqual({ confirm_count: 12 });
  });
  it('devolver os nunca tentados também exige confirmação digitada', async () => {
    const c = be.addCampaign();
    const b = be.addBatch(c, { phase: 'interrupted', reserved: 20, counts: { reserved: 8, sending: 0, accepted: 10, failed: 0, uncertain: 2 } });
    await openCampaign();
    const rel = screen.getByRole('button', { name: /Devolver os 8 ao público/ }) as HTMLButtonElement;
    expect(rel.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/digite 8/), { target: { value: '8' } });
    fireEvent.click(rel);
    await waitFor(() => expect(be.count('POST', `/batches/${b.id}/release`)).toBe(1));
  });
  it('não existe botão de reenviar falhas ou incertos', async () => {
    const c = be.addCampaign();
    be.addBatch(c, { phase: 'interrupted', reserved: 20, counts: { reserved: 0, sending: 0, accepted: 10, failed: 5, uncertain: 5 } });
    await openCampaign();
    expect(screen.queryByRole('button', { name: /reenviar/i })).toBeNull();
    expect(screen.getByText(/Ninguém ficou sem ser tentado/)).toBeTruthy();
  });
  it('acompanha lote em envio sozinho até concluir', async () => {
    const c = be.addCampaign(); const b = be.addBatch(c, { phase: 'sending', counts: { reserved: 0, sending: 10, accepted: 0, failed: 0, uncertain: 0 }, reserved: 10 });
    await openCampaign();
    expect(screen.getByText(/Envio em andamento/)).toBeTruthy();
    b.phase = 'done'; b.counts = { reserved: 0, sending: 0, accepted: 10, failed: 0, uncertain: 0 };
    await waitFor(() => expect(screen.getByText(/Concluído/)).toBeTruthy(), { timeout: 6000 });
  }, 10000);
  it('encerrar campanha pede confirmação', async () => {
    const c = be.addCampaign();
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    expect(be.count('POST', `/campaigns/${c.id}/close`)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, encerrar' }));
    await waitFor(() => expect(be.count('POST', `/campaigns/${c.id}/close`)).toBe(1));
  });
});

describe('acessibilidade básica', () => {
  it('todo campo, botão e select tem nome acessível', async () => {
    const c = be.addCampaign(); be.addBatch(c, { phase: 'interrupted', reserved: 20, counts: { reserved: 8, sending: 0, accepted: 10, failed: 0, uncertain: 2 } });
    await openCampaign();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar bloco de filtros/ }));
    const group = screen.getByRole('group', { name: 'Escolha um filtro' });
    fireEvent.click(within(group).getByRole('button', { name: /^Tutor/ }));
    fireEvent.click(within(group).getByRole('button', { name: /Quantidade de pets/ }));
    const unnamed = Array.from(document.querySelectorAll('input,select,textarea,button')).filter((el) => {
      const e = el as HTMLElement;
      const labelled = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label') || (e.textContent ?? '').trim();
      return !labelled;
    });
    expect(unnamed.map((e) => e.outerHTML)).toEqual([]);
  });
  it('erros usam role=alert e a contagem usa região viva', async () => {
    be.addCampaign();
    await openCampaign();
    await gerarPrevia('50');
    be.on('POST /campaigns/camp1/batches', () => err('token_expired', 'x'));
    fireEvent.click(confirmar(50));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
  it('os passos aparecem em ordem (a ordem do teclado segue a leitura)', async () => {
    be.addCampaign();
    await openCampaign();
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/^\d/, '').trim());
    expect(heads).toEqual(['Conteúdo', 'Quem recebe (filtros)', 'Contagem, lote e confirmação', 'Histórico e resultados']);
  });
});
