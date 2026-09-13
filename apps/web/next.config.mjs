import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Version skew: cada deploy troca o processo Next.js rodando (release
  // symlink + restart), mas um cliente com o app já aberto (o shell
  // Capacitor carrega o site ao vivo, não empacotado) continua referenciando
  // os chunks/RSC payloads da release anterior. Sem isso, um navegação ou
  // import dinâmico logo após um deploy pega 404 nesses arquivos — o
  // mecanismo oficial do Next detecta a inconsistência de deploymentId e
  // permite recuperação (worker do lado do cliente reconhece a versão
  // errada). NEXT_DEPLOYMENT_ID é setado só no build de release (ver
  // ci.yml, job "package") — precisa existir em tempo de `next build`, não
  // é lido em runtime.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  // Disable static page generation for dynamic routes
  experimental: {
    // This helps with monorepo React issues
    externalDir: true,
  },
  // Módulos Node.js que não devem ser incluídos no bundle do browser
  serverExternalPackages: ['@napi-rs/canvas', 'canvas'],
  // Ignorar arquivos deprecated no build
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\/_deprecated\//,
      loader: 'ignore-loader',
    });
    if (!isServer) {
      // pdfjs-dist referencia canvas e @napi-rs/canvas opcionalmente — stub no browser
      config.resolve.alias['canvas'] = false;
      config.resolve.alias['@napi-rs/canvas'] = false;
    }
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
