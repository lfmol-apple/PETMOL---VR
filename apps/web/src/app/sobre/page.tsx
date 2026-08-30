import type { Metadata } from 'next';
import Link from 'next/link';
import { InstitutionalLayout, Bullets } from '@/components/guides/InstitutionalLayout';
import { InstitutionalJsonLd } from '@/components/guides/JsonLd';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const DESCRIPTION =
  'O PETMOL é uma plataforma brasileira de informação e ferramentas para tutores de pets: organiza a rotina de cuidados, ajuda a entender custos e a tomar decisões mais informadas.';

export const metadata: Metadata = {
  title: 'Sobre o PETMOL',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/sobre` },
  openGraph: { title: 'Sobre o PETMOL', description: DESCRIPTION, url: `${SITE_URL}/sobre`, type: 'website' },
};

export default function SobrePage() {
  return (
    <>
      <InstitutionalJsonLd name="Sobre o PETMOL" description={DESCRIPTION} path="/sobre" />
      <InstitutionalLayout
        title="Sobre o PETMOL"
        intro="Uma plataforma brasileira de informação, ferramentas e organização para quem cuida de um pet."
      >
        <h2>O que é o PETMOL</h2>
        <p>
          O PETMOL nasceu de um problema simples: cuidar de um pet gera muita informação solta —
          quando foi a última vacina, quanto tempo dura o saco de ração, qual antiparasitário usar,
          quanto isso tudo custa por mês. O PETMOL junta essas peças num lugar só.
        </p>
        <p>Na prática, o PETMOL tem duas partes:</p>
        <Bullets
          items={[
            <>
              <strong>O aplicativo</strong> (com conta gratuita): registro de vacinas, controle de
              ração com lembrete de recompra, agenda de cuidados, carteirinha digital do pet e alerta
              comunitário quando um pet se perde.
            </>,
            <>
              <strong>Os <Link href="/guias">Guias</Link></strong> (públicos, sem login): conteúdo
              prático sobre alimentação, compras inteligentes, transporte, casa e primeiros cuidados,
              com calculadoras para planejar o gasto com ração.
            </>,
          ]}
        />

        <h2>Para quem o PETMOL existe</h2>
        <p>
          Para tutores de cães e gatos que querem organização e clareza — do primeiro dia de adoção à
          rotina de um pet idoso. O foco é a decisão do dia a dia: o que comprar, quanto vai custar,
          o que priorizar.
        </p>

        <h2>O que o PETMOL não é</h2>
        <Bullets
          items={[
            'Não é uma loja: o PETMOL não vende nem entrega produtos. A compra acontece em lojas parceiras.',
            'Não é atendimento veterinário: o conteúdo é informativo e não substitui a avaliação de um médico-veterinário. Qualquer situação clínica ou individual deve ser tratada por um profissional habilitado.',
            'Não é um catálogo disfarçado: os guias são escritos para serem úteis mesmo se todo link de compra fosse removido.',
          ]}
        />

        <h2>Como o PETMOL se sustenta</h2>
        <p>
          O aplicativo é gratuito. Para financiar o serviço, o PETMOL pode participar de programas de
          afiliados de lojas parceiras — alguns links de compra podem gerar comissão para o PETMOL,
          sem custo adicional para você. Essa relação comercial é sempre identificada e não determina
          a conclusão dos conteúdos. Detalhes na{' '}
          <Link href="/politica-editorial">política editorial</Link> e na{' '}
          <Link href="/transparencia">página de transparência</Link>.
        </p>

        <h2>Quem escreve os conteúdos</h2>
        <p>
          Os guias são produzidos pela Equipe PETMOL, com base em documentação oficial, entidades
          veterinárias reconhecidas e literatura pública — as fontes ficam listadas ao final de cada
          guia quando há afirmação técnica que mereça referência. O PETMOL não emprega veterinários
          para consulta individual e não apresenta os conteúdos como orientação clínica.
        </p>

        <h2>Contato</h2>
        <p>
          Para dúvidas, correções ou sugestões sobre os conteúdos:{' '}
          <a href="mailto:contato@petmol.com.br">contato@petmol.com.br</a>. Se você identificar um
          erro em algum guia, esse é o caminho — corrigir informação faz parte do compromisso
          editorial.
        </p>
      </InstitutionalLayout>
    </>
  );
}
