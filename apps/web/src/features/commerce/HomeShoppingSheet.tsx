'use client';

import { HOME_SHOPPING_PARTNERS, openHomeShoppingPartner } from '@/features/commerce/homeShoppingPartners';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
}

export function HomeShoppingSheet({ open, onClose }: HomeShoppingSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[32px] p-5 pb-6 shadow-premium border border-white/60 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1">
          <div className="flex items-center gap-3 mb-5">
            <div className="relative w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[22px] leading-none">🛒</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Compras Pet</h2>
              <p className="text-xs text-gray-500">Escolha onde comprar</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {HOME_SHOPPING_PARTNERS.map((partner) => (
              <button
                key={partner.id}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl hover:shadow-md active:scale-[0.98] transition-all w-full text-left"
                onClick={async () => {
                  onClose();
                  await openHomeShoppingPartner(partner.id);
                }}
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center bg-white border border-gray-100 flex-shrink-0 p-1">
                  <img src={partner.logoSrc} alt={partner.logoAlt} className="w-full h-full object-contain" loading="lazy" decoding="async" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-900 text-sm">{partner.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{partner.description}</div>
                </div>
                <span className="text-blue-700 font-semibold text-sm">Ver preços</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}