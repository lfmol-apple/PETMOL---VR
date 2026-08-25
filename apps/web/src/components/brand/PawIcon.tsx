/**
 * PawIcon - Single source of truth for the paw SVG used throughout the app
 * This same shape is used in the header, background pattern, and favicon
 */

interface PawIconProps {
  className?: string;
  size?: number;
  color?: string;
  /** For background use - removes default color so parent can control via currentColor */
  inherit?: boolean;
}

export function PawIcon({ 
  className = '', 
  size = 24, 
  color = '#1269FA',
  inherit = false 
}: PawIconProps) {
  const fillColor = inherit ? 'currentColor' : color;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Main pad */}
      <ellipse cx="16" cy="22" rx="9" ry="8" fill={fillColor}/>
      {/* Toe pads */}
      <ellipse cx="7" cy="11" rx="4.5" ry="5" fill={fillColor}/>
      <ellipse cx="16" cy="7" rx="4" ry="4.5" fill={fillColor}/>
      <ellipse cx="25" cy="11" rx="4.5" ry="5" fill={fillColor}/>
    </svg>
  );
}
