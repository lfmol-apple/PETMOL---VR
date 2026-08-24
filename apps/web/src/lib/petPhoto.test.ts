import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPhotosBase = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL;
const originalApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_PHOTOS_BASE_URL = originalPhotosBase;
  process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBase;
  vi.resetModules();
});

describe('resolvePetPhotoUrl', () => {
  it('does not prefix uploaded pet photos with the API base path', async () => {
    process.env.NEXT_PUBLIC_PHOTOS_BASE_URL = '';
    process.env.NEXT_PUBLIC_API_BASE_URL = '/api';

    const { resolvePetPhotoUrl } = await import('./petPhoto');

    expect(resolvePetPhotoUrl('uploads/pets/baby.jpg')).toBe(
      'http://localhost:3000/uploads/pets/baby.jpg',
    );
    expect(resolvePetPhotoUrl('pets/baby.jpg')).toBe(
      'http://localhost:3000/uploads/pets/baby.jpg',
    );
  });

  it('normalizes an explicit photos base that accidentally includes /api', async () => {
    process.env.NEXT_PUBLIC_PHOTOS_BASE_URL = 'https://www.petmol.com.br/api';

    const { resolvePetPhotoUrl } = await import('./petPhoto');

    expect(resolvePetPhotoUrl('uploads/pets/baby.jpg')).toBe(
      'https://www.petmol.com.br/uploads/pets/baby.jpg',
    );
  });
});
