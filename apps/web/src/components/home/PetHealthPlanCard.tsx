'use client';

import { HeartPulse } from 'lucide-react';
import { petO } from '@/lib/petGender';
import {
  HEALTH_PLAN_COUPON,
  HEALTH_PLAN_ENABLED,
  resolveHealthPlanCtaUrl,
} from '@/features/healthPlan/config';

/**
 * Bloco "Plano de Saúde" da Home — área complementar/destaque, FORA da grade
 * de cards funcionais. Fica imediatamente abaixo dos cards e acima de
 * "Pet Sumido".
 *
 * DESATIVADO (padrão): versão neutra, "Em breve", sem parceiro, sem CTA
 * clicável, sem cupom. ATIVADO: ganha rótulo "Publicidade • Parceria" e um
 * CTA para a URL de afiliado configurada (ver features/healthPlan/config.ts).
 */
export function PetHealthPlanCard({
  petName,
  petSex,
}: {
  petName?: string;
  petSex?: 'male' | 'female' | null;
}) {
  const ctaUrl = resolveHealthPlanCtaUrl();
  const isActive = HEALTH_PLAN_ENABLED && !!ctaUrl;

  const title =
    petName && petName.trim()
      ? `Plano de saúde para ${petO({ sex: petSex })} ${petName.trim()}`
      : 'Plano de saúde para seu pet';

  return (
    <section
      aria-label="Plano de saúde para pets"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.05)] min-[390px]:rounded-[20px] min-[390px]:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0056D2] ring-1 ring-blue-100 min-[390px]:h-11 min-[390px]:w-11">
          <HeartPulse className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-bold leading-tight text-slate-900 min-[390px]:text-[15px]">
              {title}
            </h3>
            {!isActive && (
              <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Em breve
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-slate-500 min-[390px]:text-[13px]">
            Mais tranquilidade para cuidar da saúde de quem está sempre com você.
          </p>

          {isActive && (
            <>
              <a
                href={ctaUrl}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-xl bg-[#0056D2] px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#0047ad]"
              >
                Conhecer os planos
                <span aria-hidden>→</span>
              </a>
              {HEALTH_PLAN_COUPON && (
                <p className="mt-2 text-[12px] text-slate-500">
                  Cupom: <span className="font-semibold text-slate-700">{HEALTH_PLAN_COUPON}</span>
                </p>
              )}
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Publicidade • Parceria
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
