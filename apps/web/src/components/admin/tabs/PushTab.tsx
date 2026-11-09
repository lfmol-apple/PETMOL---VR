'use client';

/**
 * Push — enviar notificação a quem quiser (todos, uma quantidade ou só você), disparar gatilhos de promoção das lojas
 * e acompanhar o desempenho do que já foi enviado (histórico com abriu/agiu) e das campanhas automáticas.
 */
import { useCallback, useEffect, useState } from 'react';
import { BroadcastPanel, type BroadcastPrefill } from '@/components/admin/BroadcastPanel';
import { PromoRadarPanel } from '@/components/admin/PromoRadarPanel';
import { CampaignsPanel, FoodCampaignCard } from '@/components/admin/CampaignsBlock';
import { Card } from '@/components/admin/AdminUi';
import { getToken } from '@/lib/auth-token';

/** Busca o texto sugerido de uma promoção e devolve o preenchimento do envio (null se não achar). */
async function loadPromoPrefill(id: string): Promise<BroadcastPrefill | null> {
  try {
    const res = await fetch(`/api/v1/admin/store-promos/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const p = await res.json() as { name: string; merchantsLabel: string; message: { goal: string; title: string; message: string } };
    return { key: `${id}:${Date.now()}`, goal: p.message.goal, title: p.message.title, message: p.message.message, destination: 'loja', note: `Preenchido com a promoção “${p.name}” (${p.merchantsLabel}).` };
  } catch { return null; }
}

export function PushTab() {
  const [prefill, setPrefill] = useState<BroadcastPrefill | null>(null);
  const prepare = useCallback(async (id: string) => {
    const pf = await loadPromoPrefill(id);
    if (!pf) return;
    setPrefill(pf);
    setTimeout(() => document.getElementById('enviar-notificacao')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);
  // O aviso push do dono abre /admin?aba=push&promo=<id>: já chega com o envio preenchido.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('promo');
    if (id) void prepare(id);
  }, [prepare]);

  return (
    <div className="space-y-5">
      <div id="enviar-notificacao">
        <Card title="Enviar notificação" subtitle="Você escolhe o que a mensagem incentiva e para quem vai (todos, uma quantidade ou só você). O histórico abaixo mostra quantos abriram e agiram.">
          <BroadcastPanel prefill={prefill} />
        </Card>
      </div>
      <Card title="Promoções das lojas" subtitle="O PETMOL avisa você quando uma promoção se aproxima; você decide e envia.">
        <PromoRadarPanel onPrepare={prepare} />
      </Card>
      <CampaignsPanel />
      <FoodCampaignCard />
    </div>
  );
}
