import type { MetadataRoute } from 'next';
import { basePath, withBasePath } from '@/lib/base-path';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xadrez Essencial',
    short_name: 'Xadrez',
    description: 'Plataforma online de xadrez, aulas interativas e exercícios.',
    start_url: `${basePath}/app`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#14532d',
    theme_color: '#14532d',
    lang: 'pt-BR',
    icons: [
      { src: withBasePath('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: withBasePath('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
      {
        src: withBasePath('/icons/icon-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
