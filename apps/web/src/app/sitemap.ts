import { MetadataRoute } from 'next';
import { getAllGuides } from '@/features/guides';
import { PUBLIC_GUIDES_PAGE_ENABLED } from './publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const SERVER_API_BASE_URL = API_BASE_URL.startsWith('http')
  ? API_BASE_URL.replace(/\/$/, '')
  : `${SITE_URL.replace(/\/$/, '')}${API_BASE_URL}`;

type PublicCase = {
  slug: string;
  updated_at?: string | null;
};

async function getPublicMissingPetUrls(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${SERVER_API_BASE_URL}/missing-pets/public-cases`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const cases = (await res.json()) as PublicCase[];
    return cases
      .filter((item) => item.slug)
      .map((item) => ({
        url: `${SITE_URL}/pet-perdido/${item.slug}`,
        lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
  } catch {
    return [];
  }
}

/** Guias + área editorial — derivado da fonte central `features/guides`. */
function getEditorialUrls(): MetadataRoute.Sitemap {
  if (!PUBLIC_GUIDES_PAGE_ENABLED) return [];
  const guides = getAllGuides();
  const latest = guides.reduce(
    (acc, g) => (g.updatedAt > acc ? g.updatedAt : acc),
    guides[0]?.updatedAt ?? '2026-08-30',
  );
  return [
    {
      url: `${SITE_URL}/guias`,
      lastModified: new Date(latest),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...guides.map((guide) => ({
      url: `${SITE_URL}/guias/${guide.slug}`,
      lastModified: new Date(guide.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/sobre`, lastModified: new Date('2026-08-30'), changeFrequency: 'yearly' as const, priority: 0.4 },
    { url: `${SITE_URL}/politica-editorial`, lastModified: new Date('2026-08-30'), changeFrequency: 'yearly' as const, priority: 0.4 },
    { url: `${SITE_URL}/transparencia`, lastModified: new Date('2026-08-30'), changeFrequency: 'yearly' as const, priority: 0.4 },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/achei-um-pet`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/reportar-pet-perdido`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/emergency`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/services`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/coverage`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  return [...staticPages, ...getEditorialUrls(), ...(await getPublicMissingPetUrls())];
}
