'use client';

import { useState } from 'react';
import { ProductDetectionSheetGold } from '@/components/ProductDetectionSheet';
import type { ProductCategory, ScannedProduct } from '@/lib/productScanner';

interface ProductBarcodeScannerProps {
  label?: string;
  expectedCategory?: ProductCategory;
  petId?: string;
  petName?: string;
  defaultMode?: 'scan' | 'manual' | 'photo';
  allowScanning?: boolean;
  onProductConfirmed: (product: ScannedProduct) => void;
  /** Disparado quando o sheet é fechado sem confirmar produto (escaneou e
   * cancelou, ou fechou direto) — permite ao chamador liberar um caminho
   * alternativo (ex: formulário manual) sem travar o tutor no scanner. */
  onDismiss?: () => void;
}

/**
 * ProductBarcodeScanner — thin trigger that opens ProductDetectionSheet.
 * Drop-in replacement for the old inline html5-qrcode component.
 * The detection sheet handles all 3 paths: scan → photo → manual.
 */
export function ProductBarcodeScanner({
  label = 'Escanear produto',
  expectedCategory,
  petId,
  petName,
  defaultMode,
  allowScanning,
  onProductConfirmed,
  onDismiss,
}: ProductBarcodeScannerProps) {
  const [open, setOpen] = useState(false);
  const [openMode, setOpenMode] = useState<'scan' | 'manual' | 'photo' | undefined>(defaultMode);

  function openWithMode(mode: 'scan' | 'manual' | 'photo' | undefined) {
    setOpenMode(mode);
    setOpen(true);
  }

  return (
    <>
      {/* Busca por nome primeiro — feedback do tutor: quem não sabe/não
          quer usar código de barras ficava travado nesses dois botões
          orientados a código. O botão principal agora abre o sheet sem
          defaultMode, pousando na tela de busca (mesma base do catálogo
          usada na Loja); escanear/digitar código de barras vira o
          caminho secundário, pra quem já tem o código em mãos. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => openWithMode(undefined)}
          className="w-full flex items-center gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-left shadow-sm active:scale-[0.98] transition-all"
        >
          <span className="text-2xl">🔎</span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold text-blue-900">Buscar produto</span>
            <span className="block text-xs text-blue-600">Digite o nome ou a marca</span>
          </span>
          <span className="text-blue-300 text-lg">›</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openWithMode(defaultMode ?? 'scan')}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] font-bold text-slate-700 active:scale-[0.98] transition-all"
          >
            📷 {label}
          </button>
          <button
            type="button"
            onClick={() => openWithMode('manual')}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] font-bold text-slate-700 active:scale-[0.98] transition-all"
          >
            ⌨️ Digitar o código de barras
          </button>
        </div>
      </div>

      {open && (
        <ProductDetectionSheetGold
          petId={petId ?? ''}
          petName={petName}
          hint={expectedCategory}
          defaultMode={openMode}
          allowScanning={allowScanning}
          onProductConfirmed={product => {
            setOpen(false);
            onProductConfirmed(product);
          }}
          onClose={() => { setOpen(false); onDismiss?.(); }}
        />
      )}
    </>
  );
}
