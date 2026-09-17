'use client';

// Letreiro passando (marquee) — substitui o selo de atenção nessa posição
// (ao lado do nome do pet) quando há pet(s) sumido(s) na região. Pedido
// explícito do dono, com print marcado à mão mostrando onde. Clicável — leva
// pro mesmo destino do botão "Pet Sumido" (aba "Perto de você"). O botão
// "Pet Sumido" lá embaixo continua existindo sem nenhuma mudança.
interface NearbyMissingPetsTickerProps {
  count: number;
  onOpen: () => void;
}

export function NearbyMissingPetsTicker({ count, onOpen }: NearbyMissingPetsTickerProps) {
  if (count <= 0) return null;

  const message = count === 1
    ? 'ATENÇÃO! 1 PET DESAPARECIDO ESTÁ PERTO DE VOCÊ! TOQUE E VEJA QUAL É'
    : `ATENÇÃO! ${count} PETS DESAPARECIDOS ESTÃO PERTO DE VOCÊ! TOQUE E VEJA QUAIS SÃO`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={message}
      className="relative w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-600 to-rose-500 py-1.5 shadow-sm active:scale-95 transition-transform"
    >
      <div className="flex w-max animate-marquee whitespace-nowrap">
        <span className="pr-10 text-[10px] font-black tracking-wide text-white">🚨 {message}</span>
        <span className="pr-10 text-[10px] font-black tracking-wide text-white" aria-hidden>🚨 {message}</span>
      </div>
    </button>
  );
}
