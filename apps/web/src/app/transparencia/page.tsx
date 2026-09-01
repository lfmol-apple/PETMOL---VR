import type { Metadata } from 'next';
import Link from 'next/link';
import { InstitutionalLayout, Bullets } from '@/components/guides/InstitutionalLayout';
import { InstitutionalJsonLd } from '@/components/guides/JsonLd';
import { hasActiveProgramDisclosure, amazonDisclosure } from '@/features/commerce/affiliateDisclosure';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const DESCRIPTION =
  'Como o PETMOL se sustenta: participação em programas de afiliados, o que isso significa para você, e como as relações comerciais são separadas do conteúdo editorial.';

export const metadata: Metadata = {
  title: 'Transparência comercial | PETMOL',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/transparencia` },
  openGraph: { title: 'Transparência comercial do PETMOL', description: DESCRIPTION, url: `${SITE_URL}/transparencia`, type: 'website' },
};

export default function TransparenciaPage() {
  const amazonActive = hasActiveProgramDisclosure(amazonDisclosure);

  return (
    <>
      <InstitutionalJsonLd name="Transparência comercial do PETMOL" description={DESCRIPTION} path="/transparencia" />
      <InstitutionalLayout
        title="Transparência comercial"
        intro="O PETMOL é gratuito para o usuário. Esta página explica como o serviço se financia."
        updatedAt="30/08/2026"
      >
        <h2>Como o PETMOL se sustenta</h2>
        <p>
          O aplicativo e os <Link href="/guias">guias</Link> são gratuitos. Para manter o serviço, o
          PETMOL pode participar de <strong>programas de afiliados</strong> de lojas parceiras.
        </p>

        <h2>O que é um programa de afiliados</h2>
        <Bullets
          items={[
            'Quando você acessa uma loja parceira por um link do PETMOL e faz uma compra, o PETMOL pode receber uma comissão dessa loja.',
            'Essa comissão é paga pela loja com a margem dela. Não é um acréscimo ao seu preço — você paga o mesmo que pagaria acessando a loja direto.',
            'A comissão não é garantida: a venda pode não ocorrer, ficar fora da janela de atribuição, ser atribuída a outro parceiro, ser cancelada ou sofrer estorno.',
          ]}
        />

        <h2>Como isso aparece no PETMOL</h2>
        <Bullets
          items={[
            'Nas telas onde o PETMOL sugere onde comprar um produto (comparação de preço, "comprar novamente"), há um aviso de que alguns links podem gerar comissão.',
            'Nos guias, o rodapé de cada artigo traz o mesmo aviso.',
            'Nenhum conteúdo editorial é apresentado como independente quando não é.',
          ]}
        />

        <h2>Separação entre comissão e conteúdo</h2>
        <p>
          A existência de uma comissão não decide o que um guia recomenda. O critério de cada
          conteúdo está descrito na <Link href="/politica-editorial">política editorial</Link>: um
          guia precisa ser útil mesmo se todos os links de compra fossem removidos.
        </p>

        <h2>Lojas parceiras</h2>
        <p>
          O PETMOL trabalha com um conjunto pequeno de lojas parceiras para a experiência de compra.
          Esse conjunto muda ao longo do tempo conforme parcerias são firmadas ou encerradas.
        </p>

        <h2>Programa de Associados da Amazon (Amazon Associates US)</h2>
        <p>
          O PETMOL participa do <strong>Amazon Associates US</strong> apenas na página pública e
          editorial <Link href="/recommendations">PETMOL Recommendations</Link>, em inglês, onde
          lista produtos que considera úteis ou interessantes. Nessa página o PETMOL pode receber
          uma comissão sobre compras qualificadas (<em>commission on qualifying purchases</em>),
          sem custo adicional para você. A frase exigida pela Amazon — <em>&ldquo;As an Amazon
          Associate I earn from qualifying purchases.&rdquo;</em> — aparece junto aos links naquela
          página.
        </p>
        <p>
          Fora dessa página, <strong>a Amazon não está ativa no PETMOL</strong>: não há links da
          Amazon no aplicativo, na comparação de preços, na tela de compras do tutor nem no app
          nativo (iOS/Android).
        </p>
        {amazonActive && <p>{amazonDisclosure.requiredStatement}</p>}

        <h2>Dúvidas</h2>
        <p>
          Escreva para <a href="mailto:contato@petmol.com.br">contato@petmol.com.br</a>.
        </p>
      </InstitutionalLayout>
    </>
  );
}
