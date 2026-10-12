/**
 * tiktokAppEvents.ts — repassa eventos de conversão ao TikTok App Events SDK
 * nativo (iOS/Android). No-op seguro na web/PWA e se a ponte falhar: medir
 * anúncio nunca pode atrapalhar o cadastro. Instalação e abertura são
 * automáticas no SDK; aqui só vai o que o app nativo não enxerga sozinho.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface TikTokEventsPlugin {
  trackRegistration(): Promise<void>;
}

const TikTokEvents = registerPlugin<TikTokEventsPlugin>('TikTokEvents');

export function trackTikTokRegistration(): void {
  try {
    if (!Capacitor.isNativePlatform()) return;
    void TikTokEvents.trackRegistration().catch(() => {});
  } catch {
    /* ponte indisponível: ignora */
  }
}
