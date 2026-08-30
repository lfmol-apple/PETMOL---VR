import Link from 'next/link';

/**
 * Aviso central e único de relação comercial dos Guias PETMOL.
 *
 * Declaração verdadeira e genérica sobre programas de afiliados. NÃO
 * declara participação ativa em nenhum programa específico — quando o
 * PETMOL for aprovado num programa que exija texto próprio (ex: Amazon
 * Associados), a frase obrigatória entra aqui, num lugar só, via
 * `features/commerce/affiliateDisclosure.ts`.
 */
export function AffiliateDisclosure({ variant = 'inline' }: { variant?: 'inline' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <p className="text-[11px] text-slate-400 leading-relaxed">
        O PETMOL pode participar de programas de afiliados. Alguns links de compra podem gerar
        comissão, sem custo adicional para você. Os critérios de conteúdo não dependem disso —{' '}
        <Link href="/politica-editorial" className="underline hover:text-slate-600">
          política editorial
        </Link>{' '}
        e{' '}
        <Link href="/transparencia" className="underline hover:text-slate-600">
          transparência
        </Link>
        .
      </p>
    );
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-[13px] text-slate-600 leading-relaxed">
      <p className="font-bold text-slate-700 mb-1">Transparência</p>
      <p>
        Este conteúdo é editorial e foi escrito para ser útil por si só. O PETMOL pode participar de
        programas de afiliados de lojas parceiras — alguns links de compra podem gerar comissão para o
        PETMOL, sem custo adicional para você. Isso ajuda a manter o serviço, mas não determina a
        conclusão do texto. Detalhes em{' '}
        <Link href="/politica-editorial" className="font-semibold text-blue-600 hover:underline">
          política editorial
        </Link>{' '}
        e{' '}
        <Link href="/transparencia" className="font-semibold text-blue-600 hover:underline">
          transparência
        </Link>
        .
      </p>
    </aside>
  );
}
