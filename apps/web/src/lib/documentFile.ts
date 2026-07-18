import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

export async function fetchDocumentBlob(petId: string, docId: string, options?: { download?: boolean }): Promise<Blob> {
  const token = getToken();
  if (!token) {
    throw new Error('Sessão expirada');
  }

  const params = new URLSearchParams();
  if (options?.download) params.set('dl', '1');
  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${docId}/file${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

export function buildDocumentFilename(title: string, mimeType: string, fallbackName?: string | null): string {
  const trimmedTitle = title.trim() || fallbackName?.trim() || 'documento';
  const ext = fallbackName?.match(/\.[^.]+$/)?.[0] || MIME_EXTENSION_MAP[mimeType] || '';
  return trimmedTitle.endsWith(ext) ? trimmedTitle : `${trimmedTitle}${ext}`;
}

export function triggerBrowserDownload(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Compartilha ou baixa um blob. Preferencia:
 * 1. navigator.share com arquivo (iOS share sheet, AirDrop, etc.)
 * 2. <a download> com blob URL (desktop)
 * Sempre libera o blob URL após uso.
 */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  title?: string,
): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });

  const canShare =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShare) {
    await navigator.share({ files: [file], title: title ?? filename });
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  try {
    triggerBrowserDownload(blobUrl, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  }
}
