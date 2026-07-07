const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];

function isOwnHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return OWN_PHOTO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function resolvePhotosBase(): string {
  // NEXT_PUBLIC_PHOTOS_BASE_URL takes priority (e.g. "https://petmol.com.br/api")
  // Fall back to NEXT_PUBLIC_API_BASE_URL which is "/api" in production — uploads live there
  const configured = String(
    process.env.NEXT_PUBLIC_PHOTOS_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    '',
  ).replace(/\/$/, '');

  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function resolvePetPhotoUrl(photoPath: string | undefined | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;

  if (photoPath.startsWith('http')) {
    if (isOwnHost(photoPath)) return photoPath;
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }

  const photosBase = resolvePhotosBase();
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}`;
}
