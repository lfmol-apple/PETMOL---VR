import type { Metadata, Viewport } from 'next';
import { Inter, Outfit, Fredoka } from 'next/font/google';
import './globals.css';
import './theme-prime.css';
import { I18nProvider } from '@/lib/I18nContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocationProvider } from '@/contexts/LocationContext';
import { AppShell } from '@/components/AppShell';
import { StorageMigrator } from '@/components/StorageMigrator';
import { UserPromptHost } from '@/components/UserPromptHost';
// GlobalAutoDetector removido — sem geolocalização (nova estratégia 2026-02)
// import { GlobalAutoDetector } from '@/components/GlobalAutoDetector';
import { SmartSuggestionsWidget } from '@/components/SmartSuggestionsWidget';
import { EventNudge } from '@/components/EventNudge';
import { TravelDetectionNotification } from '@/components/TravelDetectionNotification';
import { OfflineIndicator, ConnectivityStatus } from '@/components/OfflineIndicator';
import { PushAutoRefresh } from '@/components/PushAutoRefresh';
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
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'PETMOL - Carteirinha Digital e Gestão Completa do Seu Pet',
  description: 'Carteirinha digital, controle de vacinas, histórico de saúde e agenda completa. O melhor app para cuidar do seu pet, tudo em um só lugar.',
  keywords: ['pet', 'cachorro', 'gato', 'carteirinha digital', 'vacinas', 'saúde pet', 'agenda pet'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
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
    title: 'PETMOL - Cuidados do Seu Pet',
    description: 'Carteirinha digital, vacinas e saúde para seu pet',
    url: siteUrl,
    siteName: 'PETMOL',
    locale: 'pt_BR',
    type: 'website',
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
            <LocationProvider>
            <OfflineIndicator />
            <ConnectivityStatus />
            <StorageMigrator />
            <PushAutoRefresh />
            <TravelDetectionNotification />
            <UserPromptHost />
            {/* GlobalAutoDetector desativado — detecção por geolocalização removida */}
            {/* <SmartSuggestionsWidget /> */}
            {isEventNudgeEnabled() && <EventNudge />}
            <AppShell>{children}</AppShell>
            </LocationProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
