import type { MetadataRoute } from 'next';

/** Item de GET /missing-pets/public-cases (fonte: coluna MissingPet.status do backend). */
export type PublicCase = {
  slug: string;
  status?: string | null;
  updated_at?: string | null;
};

/**
 * Só alertas ATIVOS entram no sitemap: são os que ainda ajudam alguém a encontrar o animal.
 * Encontrados, expirados e removidos (denúncias) continuam acessíveis pelo link, mas não são oferecidos ao Google.
 * O filtro é dinâmico: lê o status de cada alerta a cada geração do sitemap; status ausente ou desconhecido fica de fora.
 */
export function activeAlertUrls(cases: PublicCase[], siteUrl: string): MetadataRoute.Sitemap {
  return cases
    .filter((item) => item.slug && item.status === 'active')
    .map((item) => ({
      url: `${siteUrl}/pet-perdido/${item.slug}`,
      lastModified: item.updated_at ? new Date(item.updated_at) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
}
