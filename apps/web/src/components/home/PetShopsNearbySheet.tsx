'use client';

import { Building2, ChevronRight, Scissors, Store } from 'lucide-react';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';

const MAPS = (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`;

/**
 * "PetShops perto de você" — busca por PetShop / banho e tosa / hospedagem
 * no Google Maps. Funcionalidade preservada da Home; agora vive dentro da
 * área Cuidados (ver HomeNavigationModals). Sem mudança de lógica.
 */
export function PetShopsNearbySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <SheetShell open onClose={onClose} tone="glassSheer" variant="center" size="sm" z={90}>
      <SheetHeader
        tone="petmol"
        withHandle
        title="PetShops perto de você"
        subtitle="Abre no Google Maps"
        media={<SheetIcon tone="onPetmol"><Store className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />
      <SheetShell.Body className="space-y-3">
        {[
          { Icon: Store, label: 'PetShops', desc: 'Lojas de produtos e serviços pet', q: 'petshop perto de mim',
            border: 'border-blue-200/70', chip: 'bg-blue-50 text-blue-600 ring-blue-100' },
          { Icon: Scissors, label: 'Banho e tosa', desc: 'Estética e higiene do pet', q: 'banho e tosa para cães perto de mim',
            border: 'border-teal-200/70', chip: 'bg-teal-50 text-teal-600 ring-teal-100' },
          { Icon: Building2, label: 'Hotéis e creches', desc: 'Hospedagem e day care', q: 'hotel para pet creche para cachorro perto de mim',
            border: 'border-amber-200/70', chip: 'bg-amber-50 text-amber-600 ring-amber-100' },
        ].map(({ Icon, label, desc, q, border, chip }) => (
          <a
            key={label}
            href={MAPS(q)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={`flex items-center gap-3.5 rounded-2xl border bg-white p-4 shadow-[0_10px_24px_-12px_rgba(15,23,42,0.28)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-14px_rgba(15,23,42,0.34)] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${border}`}
          >
            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${chip}`}>
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-slate-900">{label}</div>
              <div className="mt-0.5 text-[12px] text-slate-500">{desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" strokeWidth={2.5} />
          </a>
        ))}
      </SheetShell.Body>
    </SheetShell>
  );
}
