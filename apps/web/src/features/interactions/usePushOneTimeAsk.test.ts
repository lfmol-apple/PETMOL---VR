import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePushOneTimeAsk } from './usePushOneTimeAsk';

beforeEach(() => localStorage.clear());

describe('usePushOneTimeAsk', () => {
  it('enabled=true e nunca visto: abre', () => {
    const { result } = renderHook(() => usePushOneTimeAsk('petmol_vaccine_push_ask_v1', true));
    expect(result.current.open).toBe(true);
  });

  it('enabled=false (já tem a permissão): nunca abre', () => {
    const { result } = renderHook(() => usePushOneTimeAsk('petmol_food_push_ask_v1', false));
    expect(result.current.open).toBe(false);
  });

  it('feedback de beta tester (04/10/2026): dispensar o pedido numa tela some com ele em TODAS as outras', () => {
    const { result: vaccine } = renderHook(() => usePushOneTimeAsk('petmol_vaccine_push_ask_v1', true));
    expect(vaccine.current.open).toBe(true);
    act(() => vaccine.current.dismiss());

    // Permissão do sistema continua 'default' (a pessoa só dispensou o
    // nosso pedido, nunca respondeu o prompt nativo) — mas nenhuma outra
    // tela deve perguntar de novo.
    const { result: food } = renderHook(() => usePushOneTimeAsk('petmol_food_push_ask_v1', true));
    expect(food.current.open).toBe(false);

    const { result: parasite } = renderHook(() => usePushOneTimeAsk('petmol_parasite_push_ask_v1', true));
    expect(parasite.current.open).toBe(false);
  });

  it('a primeira tela que a pessoa abrir é que pode perguntar — ordem não importa', () => {
    const { result: medication } = renderHook(() => usePushOneTimeAsk('petmol_medication_push_ask_v1', true));
    act(() => medication.current.dismiss());

    const { result: grooming } = renderHook(() => usePushOneTimeAsk('petmol_grooming_push_ask_v1', true));
    expect(grooming.current.open).toBe(false);
  });
});
