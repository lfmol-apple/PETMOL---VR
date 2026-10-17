import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FoodControlTab } from './FoodControlTab';

// Pedido do dono (17/10/2026): a tela da 1ª ração ("Saiba quando a ração do Baby vai acabar") só perguntava a
// duração. Agora, no modo rápido, mostra a MESMA escolha da edição — Por peso / Por duração — com os campos de cada.

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
vi.mock('@/features/notifications/pushService', () => ({
  scheduleFoodReminder: vi.fn(), buildRemindAt: vi.fn(() => null),
}));
vi.mock('@/features/interactions/userPromptChannel', () => ({ requestUserDecision: vi.fn(), showAppToast: vi.fn() }));
// o leitor de código de barras só nos interessa para "digitar manualmente" (revela o formulário)
vi.mock('@/components/ProductBarcodeScanner', () => ({
  ProductBarcodeScanner: (p: { onManualEntry?: () => void; onProductConfirmed?: (x: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => p.onManualEntry?.()}>revelar-formulario</button>
      <button type="button" onClick={() => p.onProductConfirmed?.({ barcode: '789', name: 'Ração Golden Adultos', category: 'food', found: true })}>
        confirmar-produto
      </button>
    </div>
  ),
}));

const posted: unknown[] = [];

beforeEach(() => {
  posted.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => ({ plan: { enabled: true, items: [] }, estimate: {} }), text: async () => '' };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function open() {
  render(<FoodControlTab petId="p1" petName="Baby" species="dog" embedded hideInternalHeader formRequest={{ id: 1, mode: 'quick_setup' }} />);
  fireEvent.click(screen.getByText('revelar-formulario'));
}

describe('FoodControlTab — modo rápido (1ª ração)', () => {
  it('Por peso NÃO volta para 30 dias quando o pai re-renderiza com um formRequest novo', async () => {
    const props = { petId: 'p1', petName: 'Baby', species: 'dog' as const, embedded: true, hideInternalHeader: true };
    const { rerender } = render(<FoodControlTab {...props} formRequest={{ id: 1, mode: 'quick_setup' }} />);
    fireEvent.click(screen.getByText('revelar-formulario'));
    fireEvent.click(await screen.findByText('Por peso'));
    expect(screen.getByText('Pacote (kg)')).toBeTruthy();
    // objeto NOVO (mesmo id/mode), como o pai faz a cada render
    rerender(<FoodControlTab {...props} formRequest={{ id: 1, mode: 'quick_setup' }} />);
    rerender(<FoodControlTab {...props} formRequest={{ id: 1, mode: 'quick_setup' }} />);
    expect(screen.getByText('Pacote (kg)')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ex: 30')).toBeNull();
  });

  it('mostra a escolha Por peso / Por duração, com Por duração (30 dias) já escolhida', async () => {
    open();
    expect(await screen.findByText('Por peso')).toBeTruthy();
    expect(screen.getByText('Por duração')).toBeTruthy();
    expect(screen.getByText('Como controlar a reposição desta ração:')).toBeTruthy();
    // 30 é só a sugestão: a tela pede para o tutor CONFIRMAR (ou trocar) o tempo
    expect(screen.getByText('Confirme o tempo: por quantos dias esse pacote dura? (você pode trocar)')).toBeTruthy();
    expect((screen.getByPlaceholderText('Ex: 30') as HTMLInputElement).value).toBe('30');
  });

  it('Por peso mostra Pacote (kg) e Consumo/dia (g) em vez da duração', async () => {
    open();
    fireEvent.click(await screen.findByText('Por peso'));
    expect(screen.getByText('Pacote (kg)')).toBeTruthy();
    expect(screen.getByText('Consumo/dia (g)')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ex: 30')).toBeNull();
  });

  it('Por peso exige pacote e consumo antes de salvar', async () => {
    open();
    fireEvent.click(await screen.findByText('Por peso'));
    fireEvent.change(screen.getByPlaceholderText('Ex: Royal Canin, Guabi Natural, petisco...'), { target: { value: 'Golden' } });
    fireEvent.click(screen.getByText('✅ Confirmar alimentação'));
    expect(await screen.findByText('Informe o tamanho do pacote em kg.')).toBeTruthy();
    expect(posted.length).toBe(0);
    fireEvent.change(screen.getByPlaceholderText('Ex: 15'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('✅ Confirmar alimentação'));
    expect(await screen.findByText('Informe o consumo diário em gramas.')).toBeTruthy();
    expect(posted.length).toBe(0);
  });

  it('Por peso salva pacote e consumo (sem forçar a duração)', async () => {
    open();
    fireEvent.click(await screen.findByText('Por peso'));
    fireEvent.change(screen.getByPlaceholderText('Ex: Royal Canin, Guabi Natural, petisco...'), { target: { value: 'Golden' } });
    fireEvent.change(screen.getByPlaceholderText('Ex: 15'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('Ex: 300'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('✅ Confirmar alimentação'));
    await waitFor(() => expect(posted.length).toBe(1));
    const body = posted[0] as { package_size_kg: number; daily_amount_g: number; no_consumption_control: boolean };
    expect(body.package_size_kg).toBe(10);
    expect(body.daily_amount_g).toBe(250);
    expect(body.no_consumption_control).toBe(false);
  });

  it('Por duração continua salvando só com a duração (padrão de 30 dias), sem pedir mais nada', async () => {
    open();
    fireEvent.change(await screen.findByPlaceholderText('Ex: Royal Canin, Guabi Natural, petisco...'), { target: { value: 'Golden' } });
    fireEvent.click(screen.getByText('✅ Confirmar alimentação'));
    await waitFor(() => expect(posted.length).toBe(1));
    const body = posted[0] as { duration_days: number; no_consumption_control: boolean; daily_amount_g: number | null };
    expect(body.duration_days).toBe(30);
    expect(body.no_consumption_control).toBe(true);
    expect(body.daily_amount_g).toBeNull();
  });

  it('depois que a ração é confirmada, a busca (Buscar/Não encontrei/Escanear) some e fica só o controle, com "Trocar produto"', async () => {
    render(<FoodControlTab petId="p1" petName="Baby" species="dog" embedded hideInternalHeader formRequest={{ id: 1, mode: 'quick_setup' }} />);
    // produto escolhido pela busca/leitura
    fireEvent.click(screen.getByText('confirmar-produto'));
    expect(await screen.findByText('Por peso')).toBeTruthy();
    expect(screen.queryByText('confirmar-produto')).toBeNull();          // a busca saiu
    expect(screen.queryByText('revelar-formulario')).toBeNull();
    expect(screen.getByText('Trocar produto')).toBeTruthy();
    // "Voltar" reabre a busca
    fireEvent.click(screen.getByText('Trocar produto'));
    expect(screen.getByText('confirmar-produto')).toBeTruthy();
    expect(screen.queryByText('Trocar produto')).toBeNull();
  });

  it('no caminho manual, a busca some quando o tutor termina de digitar o produto', async () => {
    open();
    const campo = await screen.findByPlaceholderText('Ex: Royal Canin, Guabi Natural, petisco...');
    expect(screen.getByText('confirmar-produto')).toBeTruthy();           // enquanto digita, a busca continua à mão
    fireEvent.change(campo, { target: { value: 'Golden Adultos' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(screen.queryByText('confirmar-produto')).toBeNull());
    expect(screen.getByText('Trocar produto')).toBeTruthy();
  });

  it('com a ração confirmada, mostra um cartão compacto com o nome (sem o campo Marca/Produto)', async () => {
    render(<FoodControlTab petId="p1" petName="Baby" species="dog" embedded hideInternalHeader formRequest={{ id: 1, mode: 'quick_setup' }} />);
    fireEvent.click(screen.getByText('confirmar-produto'));
    expect(await screen.findByText('Ração Golden Adultos')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ex: Royal Canin, Guabi Natural, petisco...')).toBeNull();
  });

  it('a data de início vira uma linha "Começa em… · alterar" e só abre o campo se o tutor quiser', async () => {
    render(<FoodControlTab petId="p1" petName="Baby" species="dog" embedded hideInternalHeader formRequest={{ id: 1, mode: 'quick_setup' }} />);
    fireEvent.click(screen.getByText('confirmar-produto'));
    expect(await screen.findByText(/Começa em/)).toBeTruthy();
    expect(screen.queryByText('Data início')).toBeNull();
    fireEvent.click(screen.getByText('alterar'));
    expect(screen.getByText('Data início')).toBeTruthy();
  });

  it('avisa o pai quando a tela do controle fica à vista (para tirar "Fazer depois")', async () => {
    const onStage = vi.fn();
    render(<FoodControlTab petId="p1" petName="Baby" species="dog" embedded hideInternalHeader onQuickStageChange={onStage}
      formRequest={{ id: 1, mode: 'quick_setup' }} />);
    await waitFor(() => expect(onStage).toHaveBeenLastCalledWith(false));   // só a busca à vista
    fireEvent.click(screen.getByText('confirmar-produto'));
    await waitFor(() => expect(onStage).toHaveBeenLastCalledWith(true));
  });
});
