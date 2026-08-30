import type { Metadata } from 'next';
import Link from 'next/link';
import { InstitutionalLayout, Bullets } from '@/components/guides/InstitutionalLayout';
import { InstitutionalJsonLd } from '@/components/guides/JsonLd';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const DESCRIPTION =
  'Como os conteúdos dos Guias PETMOL são produzidos: critérios, uso de fontes, separação entre conteúdo editorial e relações comerciais, e política de correção de erros.';

export const metadata: Metadata = {
  title: 'Política editorial | PETMOL',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/politica-editorial` },
  openGraph: { title: 'Política editorial do PETMOL', description: DESCRIPTION, url: `${SITE_URL}/politica-editorial`, type: 'website' },
};

export default function PoliticaEditorialPage() {
  return (
    <>
      <InstitutionalJsonLd name="Política editorial do PETMOL" description={DESCRIPTION} path="/politica-editorial" />
      <InstitutionalLayout
        title="Política editorial"
        intro="As regras que valem para todo conteúdo publicado nos Guias PETMOL."
        updatedAt="30/08/2026"
      >
        <h2>Por que os guias existem</h2>
        <p>
          Cada guia começa por uma dúvida concreta de quem cuida de um pet — &ldquo;que ração
          escolher&rdquo;, &ldquo;quanto custa alimentar um cão&rdquo;, &ldquo;coleira ou
          peitoral&rdquo;. O objetivo é responder essa dúvida de forma direta e prática. Um guia só é
          publicado quando responde à pergunta de verdade, não quando atinge um tamanho.
        </p>

        <h2>Como os conteúdos são produzidos</h2>
        <Bullets
          items={[
            'A pauta parte de dúvidas reais e recorrentes de tutores, não de volume de busca.',
            'O texto é escrito para dar critério de decisão: o que comparar, o que priorizar, quais erros evitar.',
            'Afirmações técnicas que merecem origem trazem fonte confiável — órgãos públicos, universidades, entidades veterinárias reconhecidas, literatura científica e documentação oficial. Fabricantes só são citados para especificações objetivas dos próprios produtos.',
            'O guia é revisado uma segunda vez para remover repetição, generalidade e qualquer trecho que não acrescente informação.',
            'Cada guia mostra a autoria (Equipe PETMOL), a data de publicação, a data da última atualização e o tempo estimado de leitura.',
          ]}
        />

        <h2>O que não fazemos</h2>
        <Bullets
          items={[
            'Não inventamos estudos, estatísticas, citações ou credenciais profissionais.',
            'Não criamos avaliações, notas por estrelas, "mais vendido" ou "escolha do editor" sem critério declarado.',
            'Não copiamos texto de fabricantes, de lojas ou de concorrentes.',
            'Não usamos blogs de afiliados como fonte primária.',
            'Não transformamos guias em catálogo de produtos.',
          ]}
        />

        <h2>Conteúdo sobre saúde</h2>
        <p>
          O PETMOL não faz diagnóstico, não recomenda medicamento, não prescreve dieta terapêutica e
          não substitui o veterinário. Quando um guia toca em saúde, ele diz explicitamente que
          situações individuais e clínicas devem ser avaliadas por um médico-veterinário. Não
          enchemos todos os textos de avisos — usamos o aviso onde ele é necessário.
        </p>

        <h2>Separação entre conteúdo e relação comercial</h2>
        <Bullets
          items={[
            'O PETMOL pode participar de programas de afiliados. Alguns links de compra podem gerar comissão, sem custo adicional para você.',
            'A conclusão de um guia — o que recomendar, o que evitar — não depende de existir ou não um link comercial associado.',
            'Um guia é escrito para continuar útil mesmo se todos os links de compra fossem removidos. É esse o teste que aplicamos antes de publicar.',
            'Toda relação comercial é identificada. Detalhes na página de ',
          ]}
        />
        <p>
          <Link href="/transparencia">transparência</Link>.
        </p>

        <h2>Atualização e correção de erros</h2>
        <p>
          Informação envelhece — preços, práticas recomendadas, regras de transporte. Revisamos os
          guias periodicamente e a data de &ldquo;atualizado em&rdquo; reflete a última revisão real
          do conteúdo, não uma alteração cosmética.
        </p>
        <p>
          Se você identificar um erro factual em qualquer guia, escreva para{' '}
          <a href="mailto:contato@petmol.com.br">contato@petmol.com.br</a>. Erros confirmados são
          corrigidos e a data de atualização do guia muda para registrar a correção.
        </p>
      </InstitutionalLayout>
    </>
  );
}
