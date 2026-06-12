'use client';

import React from 'react';

export function PetmolMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* Dedos ovais e verticais conforme pata.png */}
      <ellipse cx="20" cy="45" rx="10" ry="14" />
      <ellipse cx="40" cy="28" rx="11" ry="17" />
      <ellipse cx="60" cy="28" rx="11" ry="17" />
      <ellipse cx="80" cy="45" rx="10" ry="14" />
      
      {/* Metacarpo com ombros definidos conforme pata.png */}
      <path d="M50,50 C30,50 15,60 15,80 C15,95 30,100 50,100 C70,100 85,95 85,80 C85,60 70,50 50,50 Z" />
    </svg>
  );
}

export function PetmolTextLogo({ className, showMark = true, color }: { className?: string; showMark?: boolean; color?: string }) {
  return (
    <div className={`relative flex items-center gap-3 select-none pointer-events-none ${className}`}>
      <span className="font-bold tracking-[-0.04em]" 
            style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: color || '#FFFFFF' }}>
        petmol
      </span>

      {/* Uso da IMAGEM REAL fornecida pelo usuário */}
      {showMark && (
        <div className="flex items-center space-x-1 -translate-y-1 ml-1">
          <img 
            src="/brand/pata-custom.png" 
            alt="🐾" 
            className="w-5 h-5 object-contain rotate-[-10deg]" 
            style={{ filter: color ? 'brightness(0) invert(32%) sepia(86%) saturate(1478%) hue-rotate(204deg) brightness(97%) contrast(93%)' : 'brightness(0) invert(1)' }}
          />
          <img 
            src="/brand/pata-custom.png" 
            alt="🐾" 
            className="w-5 h-5 object-contain rotate-[15deg] -mt-3 opacity-70" 
            style={{ filter: color ? 'brightness(0) invert(32%) sepia(86%) saturate(1478%) hue-rotate(204deg) brightness(97%) contrast(93%)' : 'brightness(0) invert(1)' }}
          />
        </div>
      )}
    </div>
  );
}

interface BrandBackgroundProps {
  children: React.ReactNode;
  showLogo?: boolean;
}

export function BrandBackground({ children, showLogo = true }: BrandBackgroundProps) {
  return (
    <div className="min-h-dvh w-full bg-[#1D4ED8] relative overflow-hidden flex flex-col items-center">
      {/* Premium Radial Background emulating the 'petmol-logo-final.png' sphere */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        {/* Main Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_#3B82F6_0%,_#1E40AF_60%,_#1D4ED8_100%)]" />
        
        {/* Subtle animated light patches */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-20 bg-[radial-gradient(circle,_white_0%,_transparent_50%)] blur-[100px]" />
        
        {/* Large Ghost Logo in Background */}
        <div className="absolute bottom-[-10%] right-[-10%] opacity-[0.05] scale-[2] rotate-[-15deg] blur-[2px]">
          <PetmolTextLogo className="text-[120px]" showMark={false} />
        </div>
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full flex flex-col items-center">
        {showLogo && (
          <div className="pt-24 pb-12 flex flex-col items-center animate-fadeInDown">
            <PetmolTextLogo className="text-7xl drop-shadow-[0_8px_24px_rgba(0,0,0,0.2)]" />
            <div className="h-1 w-20 bg-white/20 rounded-full mt-8 animate-scaleIn blur-[0.5px]" />
          </div>
        )}
        <div className="w-full flex-1 flex flex-col items-center">
          {children}
        </div>
      </div>
    </div>
  );
}
