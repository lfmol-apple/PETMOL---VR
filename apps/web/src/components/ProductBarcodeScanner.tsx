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
}: ProductBarcodeScannerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 shadow-sm active:scale-[0.98] transition-all"
      >
        <span className="text-xl">🔍</span>
        <span className="flex-1 text-left">{label}</span>
        <span className="text-blue-300 text-lg">›</span>
      </button>

      {open && (
        <ProductDetectionSheetGold
          petId={petId ?? ''}
          petName={petName}
          hint={expectedCategory}
          defaultMode={defaultMode}
          allowScanning={allowScanning}
          onProductConfirmed={product => {
            setOpen(false);
            onProductConfirmed(product);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
