'use client';

import { ArrowRight } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { trackClick } from '@/lib/analytics/click';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { HOME_SHOPPING_PARTNERS, MORE_STORE_IDS, moreStoreVisible, openMoreStore, type MoreStoreId } from './homeShoppingPartners';

const NAME: Record<MoreStoreId, string> = { amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee' };
// Padrão do site do dono: Shopee e Mercado Livre nas cores da marca, Amazon em azul-escuro com o logo ("Ver preço na amazon").
const BUTTON_STYLE: Record<MoreStoreId, string> = {
  amazon: 'bg-[#131921] text-white',
  mercadolivre: 'bg-[#FFE600] text-[#1F2937]',
  shopee: 'bg-[#FF5330] text-white',
};
const BUTTON_TEXT: Record<MoreStoreId, string> = { amazon: 'Ver preço na', mercadolivre: 'Ver no Mercado Livre', shopee: 'Ver na Shopee' };
const ARIA: Record<MoreStoreId, string> = { amazon: 'Ver na Amazon', mercadolivre: 'Ver no Mercado Livre', shopee: 'Ver na Shopee' };

/**
 * Cartões das outras lojas (Amazon, Mercado Livre, Shopee — mesmo sem preço) no MESMO formato do cartão da Petz, logo
 * abaixo dos cartões Cobasi/Petz de cada lista de compra. Sempre pelo link de afiliado do PETMOL (ver openMoreStore).
 * `term` = o que vai para a busca; `label` = o nome mostrado no cartão (padrão: o próprio termo).
 */
export function MoreStoresRow({ term, label, petId, source }: { term: string; label?: string; petId?: string; source: string }) {
  const stores = MORE_STORE_IDS.filter(moreStoreVisible);
  if (stores.length === 0) return null;
  const shown = (label || term).trim();

  const open = async (id: MoreStoreId) => {
    const r = await openMoreStore(id, term, copyText, { petId, surface: source });
    void trackClick({
      source, cta_type: 'more_stores_click', target: id, pet_id: petId,
      metadata: { opened: r.opened, term_copied: r.copied, has_term: Boolean(term.trim()) },
    });
    if (r.opened && r.copied) showAppToast('Nome do produto copiado. Cole na busca da loja.', { tone: 'success' });
  };

  return (
    <div className="space-y-3" data-testid="more-stores" onClick={(e) => e.stopPropagation()}>
      {stores.map((id) => {
        const logo = HOME_SHOPPING_PARTNERS.find((p) => p.id === id)?.logoSrc;
        const needsPaste = id !== 'amazon';
        return (
          <button
            key={id}
            type="button"
            aria-label={ARIA[id]}
            onClick={() => void open(id)}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all active:scale-[0.99] hover:border-slate-300"
          >
            <div className="flex items-center gap-3">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-9 w-9 flex-shrink-0 rounded-lg border border-gray-100 bg-white object-contain" />
              ) : <span className="h-9 w-9 flex-shrink-0 rounded-lg bg-gray-100" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold leading-tight text-gray-900">{shown || NAME[id]}</p>
                <p className="text-[12px] text-gray-500">{NAME[id]}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-[13px] font-black leading-tight text-slate-600">Ver preço</p>
                <p className="text-[11px] text-gray-500">na loja</p>
              </div>
            </div>
            <span className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold ${BUTTON_STYLE[id]}`} aria-hidden>
              {BUTTON_TEXT[id]}
              {id === 'amazon' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/partner-logos/amazon-white.png" alt="" className="h-[15px] w-auto translate-y-[1px]" />
              ) : (
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              )}
            </span>
            {needsPaste && shown && (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-600">Copiamos o nome do produto: cole na busca da loja</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
