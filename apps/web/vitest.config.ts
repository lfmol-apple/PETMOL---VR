import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Setup mínimo — este repo não tinha test runner de frontend até agora
// (ver docs/AFFILIATES.md). Existe pra cobrir os geradores/validadores de
// link afiliado (Amazon/Shopee) e os componentes que dependem deles
// (ex: "renderização sem preço"); não é infraestrutura geral de testes
// de UI para o resto do app.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
