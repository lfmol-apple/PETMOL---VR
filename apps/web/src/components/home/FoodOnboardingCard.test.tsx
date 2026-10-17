import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FoodOnboardingCard } from './FoodOnboardingCard';
import { readOnboardingStore } from '@/lib/onboardingProgress';

// Achado real (12/10/2026, Mission Control): 522 de 910 tutores com pet
// cadastraram o pet e pararam aí, sem configurar alimentação — a tela
// intermediária pedindo vacina+antipulgas+vermífugo+ração de uma vez
// (OnboardingChecklistCard) foi substituída por este passo focado, só
// alimentação. FoodControlTab (que faz o salvamento real) é mockado aqui —
// o que este arquivo testa é a MOLDURA de onboarding (cópia, pular, eventos,
// não repetir), não a lógica de alimentação em si (essa é responsabilidade
// de FoodControlTab, reaproveitada sem alteração).
const trackV1Metric = vi.fn();
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: (...args: unknown[]) => trackV1Metric(...args) }));

let capturedOnSaved: (() => void) | null = null;
let capturedOnStage: ((v: boolean) => void) | null = null;
vi.mock('@/components/FoodControlTab', () => ({
  FoodControlTab: (props: { onSaved?: () => void; onQuickStageChange?: (v: boolean) => void }) => {
    capturedOnSaved = props.onSaved ?? null;
    capturedOnStage = props.onQuickStageChange ?? null;
    return <div data-testid="food-control-tab-stub" />;
  },
}));

// Pedido do dono (12/10/2026): concluir a alimentação sem push ativo deve
// perguntar de novo, mesmo que outra tela já tenha dispensado o pedido
// global. `permissionState` começa 'granted' (caminho feliz, sem interromper
// as demais asserções) — os testes de push ajustam pra 'default'.
const { permissionState, requestPermission, subscribeToPush } = vi.hoisted(() => ({
  permissionState: { value: 'granted' as 'default' | 'granted' | 'denied' },
  requestPermission: vi.fn(async () => true),
  subscribeToPush: vi.fn(async () => true),
}));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({
    permission: permissionState.value,
    requestPermission,
    subscribeToPush,
  }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  capturedOnSaved = null;
});

beforeEach(() => {
  trackV1Metric.mockClear();
  permissionState.value = 'granted';
  requestPermission.mockClear();
  subscribeToPush.mockClear();
});

const baseProps = {
  petId: 'pet-123',
  petName: 'Duke',
  petSex: 'male' as const,
  onDone: vi.fn(),
};

describe('FoodOnboardingCard', () => {
  it('mostra o título com o nome real do pet e o artigo certo (masculino)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(screen.getByText('Saiba quando a ração do Duke vai acabar')).toBeTruthy();
  });

  it('enquanto só a busca está à vista, mostra a introdução e "Fazer depois"; quando o tutor chega no controle, os dois somem', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(screen.getByText('Fazer depois')).toBeTruthy();
    expect(screen.getByText(/Cadastre a alimentação e o PETMOL ajuda você/)).toBeTruthy();
    act(() => { capturedOnStage?.(true); });
    expect(screen.queryByText('Fazer depois')).toBeNull();
    expect(screen.queryByText(/Cadastre a alimentação e o PETMOL ajuda você/)).toBeNull();
    // o título (e o X do cabeçalho) continuam
    expect(screen.getByText('Saiba quando a ração do Duke vai acabar')).toBeTruthy();
  });

  it('usa o artigo feminino pra pet fêmea', () => {
    render(<FoodOnboardingCard {...baseProps} petName="Mel" petSex="female" onDone={vi.fn()} />);
    expect(screen.getByText('Saiba quando a ração da Mel vai acabar')).toBeTruthy();
  });

  it('dispara onboarding_food_step_viewed ao montar', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_viewed', { pet_id: 'pet-123' });
  });

  it('renderiza o FoodControlTab real (reaproveita 100% a lógica de alimentação, nada duplicado)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(screen.getByTestId('food-control-tab-stub')).toBeTruthy();
  });

  it('"Fazer depois" grava food:"later" no store, dispara skip e chama onDone — sem bloquear o tutor', () => {
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    fireEvent.click(screen.getByText('Fazer depois'));
    expect(readOnboardingStore('pet-123').food).toBe('later');
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_skipped', { pet_id: 'pet-123' });
    expect(onDone).toHaveBeenCalledTimes(1);
    // some da tela depois do pulo — não insiste na mesma sessão
    expect(screen.queryByText('Saiba quando a ração do Duke vai acabar')).toBeNull();
  });

  it('quando o FoodControlTab salva (onSaved), dispara completed e chama onDone', () => {
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    expect(capturedOnSaved).toBeTruthy();
    act(() => { capturedOnSaved!(); });
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_completed', { pet_id: 'pet-123' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('se o push ainda não foi decidido, salvar NÃO conclui direto — pergunta notificação antes', () => {
    permissionState.value = 'default';
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    act(() => { capturedOnSaved!(); });
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_completed', { pet_id: 'pet-123' });
    // ainda não fechou nem chamou onDone — o pedido de notificação aparece primeiro
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Ative as notificações')).toBeTruthy();
  });

  it('dispensar o pedido de notificação ("Agora não") conclui o onboarding mesmo assim', async () => {
    permissionState.value = 'default';
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    act(() => { capturedOnSaved!(); });
    await act(async () => { fireEvent.click(screen.getByText('Agora não')); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ativar notificações no pedido chama requestPermission/subscribeToPush e conclui o onboarding', async () => {
    permissionState.value = 'default';
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    act(() => { capturedOnSaved!(); });
    await act(async () => { fireEvent.click(screen.getByText('Ativar notificações')); });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribeToPush).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('se o push já foi decidido (concedido), salvar conclui direto, sem perguntar de novo', () => {
    permissionState.value = 'granted';
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    act(() => { capturedOnSaved!(); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Ative as notificações')).toBeNull();
  });

  it('fechar pelo X do cabeçalho conta como "fazer depois" (mesma gravação, não é dado como perdido sem motivo)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(readOnboardingStore('pet-123').food).toBe('later');
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_skipped', { pet_id: 'pet-123' });
  });

  it('pet já com "later" salvo não deveria nem ser montado pelo pai — mas se for, não quebra (idempotente)', () => {
    window.localStorage.setItem('petmol_onboarding_v2:pet-123', JSON.stringify({ food: 'later' }));
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    // o componente em si não decide "se deve aparecer" — isso é do pai
    // (home/page.tsx, via hasFoodData + readOnboardingStore); aqui só
    // confirma que montar de novo não corrompe o valor já salvo.
    expect(readOnboardingStore('pet-123').food).toBe('later');
  });
});
