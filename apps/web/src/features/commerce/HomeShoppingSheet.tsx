'use client';

import { HOME_SHOPPING_PARTNERS, openHomeShoppingPartner, type HomeShoppingPartnerId } from '@/features/commerce/homeShoppingPartners';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
}

const PET_STORE_IDS: HomeShoppingPartnerId[] = ['cobasi', 'petz', 'petlove', 'doglife'];
const MARKETPLACE_IDS: HomeShoppingPartnerId[] = ['amazon', 'shopee', 'mercadolivre', 'araujo'];

export function HomeShoppingSheet({ open, onClose }: HomeShoppingSheetProps) {
  if (!open) return null;

  const petStores = HOME_SHOPPING_PARTNERS.filter((p) => PET_STORE_IDS.includes(p.id));
  const marketplaces = HOME_SHOPPING_PARTNERS.filter((p) => MARKETPLACE_IDS.includes(p.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl border border-gray-100 flex flex-col"
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-gray-900">Compras Pet</h2>
            <p className="text-[12px] text-gray-400">Escolha onde comprar</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-5 pb-8 space-y-5">

          {/* Lojas especializadas */}
          {petStores.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Lojas especializadas</p>
              <div className="grid grid-cols-2 gap-3">
                {petStores.map((partner) => (
                  <StoreCard key={partner.id} partner={partner} onClose={onClose} />
                ))}
              </div>
            </div>
          )}

          {/* Marketplaces e farmácias */}
          {marketplaces.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Marketplaces e farmácias</p>
              <div className="grid grid-cols-2 gap-3">
                {marketplaces.map((partner) => (
                  <StoreCard key={partner.id} partner={partner} onClose={onClose} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function StoreCard({ partner, onClose }: { partner: (typeof HOME_SHOPPING_PARTNERS)[number]; onClose: () => void }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.97] transition-all text-center shadow-sm"
      onClick={() => {
        onClose();
        openHomeShoppingPartner(partner.id);
      }}
    >
      <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-gray-50 border border-gray-100 flex-shrink-0 p-1.5">
        <img
          src={partner.logoSrc}
          alt={partner.logoAlt}
          className="w-full h-full object-contain"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = 'none';
            const fallback = el.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <span className="hidden w-full h-full items-center justify-center text-2xl">🏪</span>
      </div>
      <div className="w-full min-w-0">
        <p className="text-[13px] font-bold text-gray-900 leading-tight line-clamp-1">{partner.name}</p>
      </div>
    </button>
  );
}
