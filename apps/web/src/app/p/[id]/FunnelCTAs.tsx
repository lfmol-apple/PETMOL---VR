'use client';

/**
 * FunnelCTAs — Motor de Intenção calmo
 * Exibido na página pública do pet (/p/[id]).
 *
 * CTA 1: "Encontrei este pet"   → analytics + mensagem      (obrigatório)
 * CTA 2: "Criar RG do meu pet"  → /rg                       (conversão orgânica)
 * CTA 3: "Lojas parceiras"     → modal discreto (opcional) (monetização)
 */
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface FunnelCTAsProps {
  petPublicId: string;
  petName: string;
}

async function trackClick(opts: {
  source: string;
  cta_type: string;
  target?: string;
  rg_public_id?: string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/analytics/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...opts }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.lead_id ?? null;
    }
  } catch {
    // best-effort
  }
  return null;
}

export default function FunnelCTAs({ petPublicId, petName }: FunnelCTAsProps) {
  const [foundSent, setFoundSent] = useState(false);
  const [showBenefitsModal, setShowBenefitsModal] = useState(false);
  const [benefitsLoading, setBenefitsLoading] = useState<string | null>(null);

  // ── CTA 1: Encontrei este pet ─────────────────────────────────────────
  const handleFoundPet = async () => {
    setFoundSent(true);
    await trackClick({
      source: 'rg_public',
      cta_type: 'found_pet',
      rg_public_id: petPublicId,
    });
  };

  // ── CTA 3: Lojas parceiras ───────────────────────────────────────────
  const handleBenefitsClick = async () => {
    setBenefitsLoading('shop');
    const lead = await trackClick({
      source: 'rg_public',
      cta_type: 'shop_redirect',
      target: 'cobasi',
      rg_public_id: petPublicId,
    });
    const params = new URLSearchParams();
    if (lead) params.set('lead_id', lead);
    params.set('partner', 'cobasi');

    const url = `/api/handoff/shop?${params.toString()}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    setBenefitsLoading(null);
    setShowBenefitsModal(false);
  };

  return (
    <>
      {/* ─── Bloco de CTAs ─────────────────────────────────────────────── */}
      <div className="mt-6 space-y-3">
        {/* CTA 1 — Encontrei este pet */}
        {!foundSent ? (
          <button
            onClick={handleFoundPet}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-xl font-semibold text-sm hover:shadow-md transition-all"
          >
            🐾 Encontrei este pet
          </button>
        ) : (
          <div className="w-full bg-green-50 border border-green-200 text-green-700 py-3 px-6 rounded-xl text-sm text-center font-medium">
            ✅ Obrigado! O dono foi notificado.
          </div>
        )}

        {/* CTA 2 — Cadastra no PETMOL */}
        <a
          href="/register"
          onClick={() =>
            trackClick({ source: 'rg_public', cta_type: 'register_from_funnel', target: 'internal', rg_public_id: petPublicId })
          }
          className="block w-full text-center border-2 border-primary-300 text-primary-700 py-3 px-6 rounded-xl font-semibold text-sm hover:bg-primary-50 transition-all"
        >
          🐾 Cadastrar meu pet no PETMOL
        </a>

        {/* CTA 3 — Lojas parceiras (discreto) */}
        <button
          onClick={() => {
            trackClick({ source: 'rg_public', cta_type: 'benefits_view', rg_public_id: petPublicId });
            setShowBenefitsModal(true);
          }}
          className="w-full text-center text-gray-400 text-xs py-2 hover:text-gray-600 transition-colors underline-offset-2 hover:underline"
        >
          Ver lojas parceiras (opcional)
        </button>
      </div>

      {/* ─── Modal de lojas parceiras ───────────────────────────────────── */}
      {showBenefitsModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setShowBenefitsModal(false)}
        >
          <div
            className="max-w-sm w-full p-6 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              Lojas para {petName}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              Links de lojas parceiras — totalmente opcional. Sem compromisso.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleBenefitsClick}
                disabled={benefitsLoading !== null}
                className="w-full bg-gradient-to-r from-orange-400 to-amber-500 text-white py-3 rounded-xl font-semibold text-sm hover:shadow-md transition-all disabled:opacity-50"
              >
                {benefitsLoading === 'shop' ? 'Abrindo...' : '🛍️ Ver lojas parceiras (opcional)'}
              </button>

              <button
                onClick={() => setShowBenefitsModal(false)}
                className="w-full text-gray-400 text-xs py-2 hover:text-gray-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
