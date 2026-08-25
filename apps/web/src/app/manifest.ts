import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PETMOL - Carteirinha Digital do Seu Pet',
    short_name: 'PETMOL',
    description: 'Carteirinha digital, vacinas, saúde e agenda completa para seu pet',
    start_url: '/home',
    display: 'standalone',
    background_color: '#003DA8',
    theme_color: '#003DA8',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['health', 'lifestyle', 'pets'],
    lang: 'pt-BR',
    shortcuts: [
      {
        name: 'Início',
        url: '/home',
        description: 'Ir para início',
      },
    ],
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          { name: 'files', accept: ['image/*', 'application/pdf'] },
        ],
      },
    },
  } as MetadataRoute.Manifest;
}

