/** Símbolo do YouTube (quadrado vermelho arredondado com o play branco), em SVG inline:
 *  nada é baixado nem carregado do YouTube. */
export function YouTubeMark({ className = 'h-[18px] w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 16" className={className} aria-hidden="true" focusable="false">
      <rect width="22" height="16" rx="4.5" fill="#FF0000" />
      <path d="M9 4.6v6.8L15 8z" fill="#FFFFFF" />
    </svg>
  );
}
