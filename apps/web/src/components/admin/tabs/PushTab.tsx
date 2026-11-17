'use client';

/**
 * Push — SÓ campanhas que abrem o link de um produto. Decisão do dono (16/11/2026): nada de envio avulso, nem de campanhas
 * para abrir o app, cadastrar ração, vacina etc., até o link funcionar 100%. Os outros tipos voltam, um a um, depois disso.
 * (As campanhas automáticas existentes seguem abaixo só para acompanhamento.)
 */
import { CampaignsPanel, FoodCampaignCard } from '@/components/admin/CampaignsBlock';
import { SegmentedCampaigns } from '@/components/admin/campaigns/SegmentedCampaigns';

export function PushTab() {
  return (
    <div className="space-y-5">
      <div role="note" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[13px] leading-snug text-sky-900">
        <strong>Campanhas de link:</strong> cole o link do produto (com o seu afiliado) e escolha quem recebe. Quem tocar na notificação abre o produto na loja.
      </div>
      <SegmentedCampaigns />
      <CampaignsPanel />
      <FoodCampaignCard />
    </div>
  );
}
