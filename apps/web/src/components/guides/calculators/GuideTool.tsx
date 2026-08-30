import type { GuideToolId } from '@/features/guides';
import { RationBagDuration } from './RationBagDuration';
import { RationMonthlyCost } from './RationMonthlyCost';
import { RationCompare } from './RationCompare';

/**
 * Server Component: escolhe qual calculadora (Client Component pequeno e
 * isolado) renderizar. A página do guia continua Server Component — só a
 * calculadora carrega JS.
 */
export function GuideTool({ tool }: { tool: GuideToolId }) {
  switch (tool) {
    case 'duracao-saco-racao':
      return <RationBagDuration />;
    case 'custo-mensal-racao':
      return <RationMonthlyCost />;
    case 'comparar-racoes-custo-diario':
      return <RationCompare />;
    default:
      return null;
  }
}

export const TOOL_LABELS: Record<GuideToolId, string> = {
  'duracao-saco-racao': 'Calculadora: quanto tempo dura um saco de ração',
  'custo-mensal-racao': 'Calculadora: custo mensal de ração',
  'comparar-racoes-custo-diario': 'Calculadora: comparar duas rações pelo custo diário',
};
