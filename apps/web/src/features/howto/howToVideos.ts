/**
 * "Como usar o PETMOL" — vídeos tutoriais do canal oficial no YouTube.
 *
 * Nada do YouTube roda dentro do app: cada linha só ABRE o vídeo (aba do sistema no app
 * nativo, nova aba na web). Sem iframe, sem cookie de terceiro, sem mudança de privacidade.
 * Vídeo novo no canal = adicionar uma linha aqui; "Ver todos no canal" cobre o resto.
 */
export const HOWTO_CHANNEL_URL = 'https://www.youtube.com/@petmolinstitucional';

export interface HowToVideo {
  /** id curto e estável, usado na medição de cliques */
  key: string;
  title: string;
  subtitle: string;
  videoId: string;
}

export const HOWTO_VIDEOS: readonly HowToVideo[] = [
  { key: 'alimentacao', title: 'Ração e alimentação', subtitle: 'Registrar e saber quando acaba', videoId: '4WZlbyTXw8Y' },
  { key: 'vacinas', title: 'Vacinas', subtitle: 'Cadastrar a carteirinha', videoId: 'N2_rnDPyFPA' },
  { key: 'banho', title: 'Banho', subtitle: 'Cadastrar e receber lembretes', videoId: 'gYc16KzAS08' },
  { key: 'passeio', title: 'Passeio', subtitle: 'Cadastrar e lembrar dos passeios', videoId: 'P1WHbSu5P_c' },
  { key: 'emergencia', title: 'Emergência', subtitle: 'Botão de emergência veterinária', videoId: 'hmFi8oXxXDI' },
  { key: 'pet_sumido', title: 'Pet Sumido', subtitle: 'Como agir se o pet sumir', videoId: 'w0BiaefsN0E' },
];

export function howToVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** App nativo: aba do sistema por cima do app (o tutor volta ao PETMOL fechando). Web: nova aba. */
export async function openHowToUrl(url: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }
  } catch {
    // cai no window.open
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
