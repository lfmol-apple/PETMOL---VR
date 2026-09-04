import Link from 'next/link';
import { amazonDisclosure, hasActiveProgramDisclosure } from '@/features/commerce/affiliateDisclosure';

/**
 * Aviso central e único de relação comercial dos Guias PETMOL.
 *
 * Declaração verdadeira sobre programas de afiliados. A frase própria
 * exigida por um programa específico (ex: Programa de Associados da Amazon)
 * vem de `features/commerce/affiliateDisclosure.ts` e só aparece quando a
 * conta está ativa — ver <AmazonDisclosure />.
 */
export function AffiliateDisclosure({ variant = 'inline' }: { variant?: 'inline' | 'compact' }) {
  const amazonActive = hasActiveProgramDisclosure(amazonDisclosure);

  if (variant === 'compact') {
    return (
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {amazonActive && <span className="text-slate-500">{amazonDisclosure.requiredStatement} </span>}
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
        conclusão do texto.
        {amazonActive && (
          <>
            {' '}
            <span className="font-semibold text-slate-700">{amazonDisclosure.requiredStatement}</span>
          </>
        )}{' '}
        Detalhes em{' '}
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

/**
 * Declaração obrigatória do Programa de Associados da Amazon, exibida junto
 * dos links de afiliado (não escondida no rodapé). Só renderiza quando a
 * conta está marcada como ativa em `affiliateDisclosure.ts`.
 */
export function AmazonDisclosure({ className = '' }: { className?: string }) {
  if (!hasActiveProgramDisclosure(amazonDisclosure)) return null;
  return (
    <aside
      aria-label="Declaração de afiliado Amazon"
      className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900 ${className}`}
    >
      <p className="font-bold">{amazonDisclosure.requiredStatement}</p>
      <p className="mt-1 text-amber-800">
        Preço, pagamento, disponibilidade e entrega são responsabilidade da Amazon. O PETMOL não
        vende nem processa a compra.
      </p>
    </aside>
  );
}
