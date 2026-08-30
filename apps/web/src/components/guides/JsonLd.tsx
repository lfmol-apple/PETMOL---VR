import type { Guide } from '@/features/guides';
import { getGuideCategory } from '@/features/guides';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const ORG = {
  '@type': 'Organization',
  name: 'PETMOL',
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
};

function JsonLdScript({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  // JSON.stringify de dados 100% controlados por nós (sem input de usuário).
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function GuideArticleJsonLd({ guide }: { guide: Guide }) {
  const url = `${SITE_URL}/guias/${guide.slug}`;
  const category = getGuideCategory(guide.category);

  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    inLanguage: 'pt-BR',
    articleSection: category.label,
    author: { '@type': 'Organization', name: 'Equipe PETMOL', url: `${SITE_URL}/sobre` },
    publisher: ORG,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isAccessibleForFree: true,
  };
  if (guide.hero) {
    article.image = `${SITE_URL}${guide.hero}`;
  }

  const blocks: Record<string, unknown>[] = [
    article,
    breadcrumbJsonLd([
      { name: 'Início', url: SITE_URL },
      { name: 'Guias', url: `${SITE_URL}/guias` },
      { name: category.label, url: `${SITE_URL}/guias?categoria=${category.id}` },
      { name: guide.title, url },
    ]),
  ];

  if (guide.faq && guide.faq.length > 0) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return <JsonLdScript data={blocks} />;
}

export function GuidesCollectionJsonLd({ count }: { count: number }) {
  return (
    <JsonLdScript
      data={[
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Guias PETMOL',
          description:
            'Guias práticos para tutores de cães: como escolher ração, comparar produtos por custo real, transporte, casa e primeiros cuidados.',
          url: `${SITE_URL}/guias`,
          inLanguage: 'pt-BR',
          isPartOf: { '@type': 'WebSite', name: 'PETMOL', url: SITE_URL },
          publisher: ORG,
          about: `${count} guias editoriais`,
        },
        breadcrumbJsonLd([
          { name: 'Início', url: SITE_URL },
          { name: 'Guias', url: `${SITE_URL}/guias` },
        ]),
      ]}
    />
  );
}

export function InstitutionalJsonLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return (
    <JsonLdScript
      data={[
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name,
          description,
          url: `${SITE_URL}${path}`,
          inLanguage: 'pt-BR',
          isPartOf: { '@type': 'WebSite', name: 'PETMOL', url: SITE_URL },
          publisher: ORG,
        },
        breadcrumbJsonLd([
          { name: 'Início', url: SITE_URL },
          { name, url: `${SITE_URL}${path}` },
        ]),
      ]}
    />
  );
}
