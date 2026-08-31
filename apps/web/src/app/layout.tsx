import type { Metadata, Viewport } from 'next';
import { Inter, Outfit, Fredoka } from 'next/font/google';
import './globals.css';
import './theme-prime.css';
import { I18nProvider } from '@/lib/I18nContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import { StorageMigrator } from '@/components/StorageMigrator';
import { HorizontalSwipeGuard } from '@/components/HorizontalSwipeGuard';
import { UserPromptHost } from '@/components/UserPromptHost';
// GlobalAutoDetector removido — sem geolocalização (nova estratégia 2026-02)
// import { GlobalAutoDetector } from '@/components/GlobalAutoDetector';
import { SmartSuggestionsWidget } from '@/components/SmartSuggestionsWidget';
import { EventNudge } from '@/components/EventNudge';
import { TravelDetectionNotification } from '@/components/TravelDetectionNotification';
import { OfflineIndicator, ConnectivityStatus } from '@/components/OfflineIndicator';
import { PushAutoRefresh } from '@/components/PushAutoRefresh';
import { AnalyticsBootstrap } from '@/components/AnalyticsBootstrap';
import { 
  isEventNudgeEnabled
} from '@/lib/featureFlags';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka' });

// Site URL from environment (no hardcoded domain)
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // safe-area iOS
  themeColor: '#003DA8',
};

export const metadata: Metadata = {
  title: 'PETMOL — Cuidado completo do seu pet: ração, vacinas e pet perdido',
  description: 'Controle de ração, vacinas e saúde do seu pet, com alerta inteligente de pet perdido. Tudo em um só app.',
  keywords: ['pet', 'cachorro', 'gato', 'carteirinha digital', 'vacinas', 'saúde pet', 'agenda pet'],
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PETMOL',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'PETMOL — Cuidado completo do seu pet: ração, vacinas e pet perdido',
    description: 'Controle de ração, vacinas e saúde do seu pet, com alerta inteligente de pet perdido. Tudo em um só app.',
    url: siteUrl,
    siteName: 'PETMOL',
    locale: 'pt_BR',
    type: 'website',
    // Card 1200×630 dedicado — sem isto o WhatsApp puxava o ícone quadrado
    // do PWA e esticava, deixando o "P" distorcido no preview do link.
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'PETMOL' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PETMOL — Cuidado completo do seu pet',
    description: 'Ração, vacinas e saúde do seu pet, com alerta de pet perdido. Tudo em um só app.',
    images: ['/og-image.png'],
  },
  metadataBase: new URL(siteUrl),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.className} ${outfit.variable} ${fredoka.variable} antialiased bg-slate-50 theme-prime`}>
        <I18nProvider>
          <AuthProvider>
            {/* Sem LocationProvider global: geolocalização é solicitada só em
                contexto (Pet Sumido, "achei um pet", push geolocalizado),
                nunca no cold start. */}
            <OfflineIndicator />
            <ConnectivityStatus />
            <StorageMigrator />
            <AnalyticsBootstrap />
            <HorizontalSwipeGuard />
            <PushAutoRefresh />
            <TravelDetectionNotification />
            <UserPromptHost />
            {/* GlobalAutoDetector desativado — detecção por geolocalização removida */}
            {/* <SmartSuggestionsWidget /> */}
            {isEventNudgeEnabled() && <EventNudge />}
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
