'use client';

/**
 * Convite para instalar o PETMOL ao fim de cada guia — o tráfego orgânico dos guias não tinha nenhum caminho até o app.
 * Só na web (dentro do app nativo a pessoa já o tem). O clique é medido com `placement = guia-<slug>`, o que permite
 * ver quais guias geram instalação. O texto fala só de recursos que o app tem hoje; nada de promessa de resultado.
 */
import { useEffect, useState } from 'react';
import { DownloadButton } from '@/components/landing/DownloadButton';
import { isNativeAppClient } from '@/lib/nativeApp';
import type { GuideCategoryId } from '@/features/guides/types';

const COPY: Record<string, { title: string; body: string }> = {
  alimentacao: {
    title: 'Saiba quando a ração vai acabar',
    body: 'No PETMOL você registra o pacote e acompanha quantos dias de ração restam, com aviso antes de acabar.',
  },
  'compras-inteligentes': {
    title: 'Compare antes de repor',
    body: 'No PETMOL você acompanha o consumo da ração e compara ofertas de lojas parceiras na hora de comprar de novo.',
  },
  'primeiros-cuidados': {
    title: 'Tudo do seu pet em um só lugar',
    body: 'O PETMOL organiza vacinas com lembrete, ração e o alerta de Pet Sumido para a sua região.',
  },
};
const DEFAULT_COPY = {
  title: 'Cuide da rotina do seu pet no PETMOL',
  body: 'Controle de ração, vacinas com lembrete e alerta de Pet Sumido, em um só app para cães e gatos.',
};

export function GuideInstallCta({ slug, category }: { slug: string; category: GuideCategoryId }) {
  // Começa ESCONDIDO e só aparece na web depois de confirmar que não é o app nativo (os guias também abrem dentro do app):
  // o app nunca vê o convite, nem por um instante.
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!isNativeAppClient()); }, []);
  if (!show) return null;
  const copy = COPY[category] ?? DEFAULT_COPY;
  return (
    <aside aria-label="Baixar o PETMOL" className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-6 text-center">
      <h2 className="text-[18px] font-black text-slate-900">{copy.title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-slate-600">{copy.body}</p>
      <div className="mt-4">
        <DownloadButton placement={`guia-${slug}`} compact />
      </div>
    </aside>
  );
}
