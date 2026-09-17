'use client';

// Indicador de "pet sumido perto de você" no lugar do selo de atenção
// (ao lado do nome do pet) — mesma cor/estilo do selo de sempre, fonte
// maior, com um pisco lento pra chamar atenção sem ser um letreiro
// passando. Clicável — leva pro mesmo destino do botão "Pet Sumido"
// (visualizador em tela cheia estilo Stories). O botão "Pet Sumido" lá
// embaixo continua existindo sem nenhuma mudança.
interface NearbyMissingPetsTickerProps {
  count: number;
  onOpen: () => void;
}

export function NearbyMissingPetsTicker({ count, onOpen }: NearbyMissingPetsTickerProps) {
  if (count <= 0) return null;

  const message = count === 1
    ? '1 PET PERDIDO PERTO DE VOCÊ'
    : `${count} PETS PERDIDOS PERTO DE VOCÊ`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={message}
      className="inline-flex max-w-[60%] flex-shrink-0 animate-blink-slow items-center rounded-full bg-gradient-to-r from-rose-600 to-rose-500 px-2.5 py-1 shadow-sm active:scale-95 transition-transform"
    >
      <span className="text-[12px] font-black leading-tight text-white [overflow-wrap:anywhere]">
        🚨 {message}
      </span>
    </button>
  );
}
