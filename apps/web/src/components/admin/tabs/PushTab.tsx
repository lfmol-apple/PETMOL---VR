'use client';

/**
 * Push — campanhas em lotes com objetivo e destino (compras/loja, alimentação, vacina…) OU com link de produto.
 * Em 16/11/2026 só o link ficou; aqui os objetivos/destinos voltaram (sem envio avulso), sem perder o link nem a segmentação.
 * (As campanhas automáticas existentes seguem abaixo só para acompanhamento.)
 */
import { CampaignsPanel, FoodCampaignCard } from '@/components/admin/CampaignsBlock';
import { SegmentedCampaigns } from '@/components/admin/campaigns/SegmentedCampaigns';

export function PushTab() {
  return (
    <div className="space-y-5">
      <div role="note" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[13px] leading-snug text-sky-900">
        <strong>Campanhas:</strong> escolha o objetivo (compras, alimentação, vacina…) e para onde o toque abre, ou cole o link do produto (com o seu afiliado) e ele abre direto na loja. Depois escolha quem recebe.
      </div>
      <SegmentedCampaigns />
      <CampaignsPanel />
      <FoodCampaignCard />
    </div>
  );
}
