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
  { key: 'geral', title: 'Tutorial geral', subtitle: 'O app inteiro em poucos minutos', videoId: '9bx3GMVmQdU' },
  { key: 'alimentacao', title: 'Ração e alimentação', subtitle: 'Registrar e saber quando acaba', videoId: 'LAetKGeRH2c' },
  { key: 'vacinas', title: 'Vacinas', subtitle: 'Cadastrar a carteirinha', videoId: 'n-Z6W7r9fHI' },
  { key: 'cuidados', title: 'Cuidados', subtitle: 'Vermífugo, antipulgas, medicações', videoId: 'JkZjyBP3g-U' },
  { key: 'passeio', title: 'Passeio', subtitle: 'O reloginho na foto do perfil', videoId: 'FeRpzpsAAsE' },
  { key: 'emergencia', title: 'Emergência', subtitle: 'Caminho até o socorro mais próximo', videoId: 'XHQRy16DLgc' },
  { key: 'pet_sumido', title: 'Pet Sumido', subtitle: 'Como usar o botão', videoId: '4N3qQjCYo6w' },
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
