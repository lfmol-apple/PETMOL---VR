import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Disable static page generation for dynamic routes
  experimental: {
    // This helps with monorepo React issues
    externalDir: true,
  },
  // Ignorar arquivos deprecated no build
  webpack: (config) => {
    config.module.rules.push({
      test: /\/_deprecated\//,
      loader: 'ignore-loader',
    });
    // pdfjs-dist usa canvas opcionalmente — desabilitar no browser build
    config.resolve.alias.canvas = false;
    return config;
  },
  // Proxy para backend local funcionar no ngrok/mobile
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
  // Aumentar limites para upload de imagens
  serverRuntimeConfig: {
    maxReqSize: '50mb',
  },
  // Headers para proxy e cache
  async headers() {
    return [
      // Evita que mobile/browsers cacheiem o HTML das páginas
      {
        source: '/((?!_next/static|_next/image|icons|images|favicon).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      // CORS para proxy do backend local
      {
        source: '/api/backend/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
