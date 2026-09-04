import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import TransparenciaPage from './page';

describe('/transparencia — trecho da Amazon após entrar no Amazon Associates US', () => {
  it('não afirma mais que a Amazon está inativa / que o PETMOL não participa', () => {
    const { container } = render(<TransparenciaPage />);
    const text = container.textContent || '';
    expect(text).not.toMatch(/não participa.*Amazon/i);
    expect(text).not.toMatch(/não há links de afiliado da Amazon ativos/i);
  });

  it('deixa claro que há comissão sobre compras qualificadas na página /recommendations', () => {
    const { container } = render(<TransparenciaPage />);
    const text = container.textContent || '';
    expect(text).toMatch(/Amazon Associates US/);
    expect(text).toMatch(/qualifying purchases/i);
    expect(text).toMatch(/As an Amazon Associate I earn from qualifying purchases\./);
  });

  it('mantém claro que a Amazon não está na comparação de preços / app nativo', () => {
    const { container } = render(<TransparenciaPage />);
    const text = container.textContent || '';
    expect(text).toMatch(/Amazon não está ativa no PETMOL/i);
    expect(text.toLowerCase()).toContain('app nativo');
  });

  it('declara o Programa de Associados da Amazon Brasil na área /guias (web) com a frase exigida', () => {
    const { container } = render(<TransparenciaPage />);
    const text = container.textContent || '';
    expect(text).toMatch(/Programa de Associados da Amazon/);
    expect(text).toMatch(/Amazon\.com\.br/);
    expect(text).toMatch(/Como associado da Amazon, eu recebo por compras qualificadas\./);
    // deixa explícito que no app nativo a seção Amazon não aparece
    expect(text.toLowerCase()).toContain('app nativo');
    expect(text).toMatch(/não é exibida/i);
  });
});
