'use client';

/**
 * BrandedHeader — Header premium com identidade visual PETMOL
 * 
 * Features:
 * - 3 variantes de tema (glass, ribbon, night)
 * - Sticky top com safe-area padding (iOS notch)
 * - Shadow aparece no scroll
 * - Glass effect com backdrop-blur
 * - Paw watermark sutil no background
 * - Slots customizáveis (logo, avatar, actions)
 * 
 * Uso:
 *   <BrandedHeader
 *     title="Rex"
 *     subtitle="Prontuário"
 *     variant="glass"
 *     leftSlot={<img src={petPhoto} />}
 *     rightActions={<button>🔔</button>}
 *   />
 */

import React, { useState, useEffect } from 'react';
import { PawWatermark } from './PawWatermark';
import { brandTokens, type HeaderVariant } from './brandTokens';

// ────────────────────────────────────────────────────────────────────────────
// TIPOS
// ────────────────────────────────────────────────────────────────────────────

export interface BrandedHeaderProps {
  /** Título principal (ex: nome do pet, "PETMOL") */
  title?: React.ReactNode;
  
  /** Subtítulo/breadcrumb (ex: "Prontuário", "Alimentação") */
  subtitle?: React.ReactNode;
  
  /** Variante visual: glass (default), ribbon, night */
  variant?: HeaderVariant;
  
  /** Botões/ações no canto direito (ex: sino, perfil, menu) */
  rightActions?: React.ReactNode;
  
  /** Slot esquerdo (ex: avatar do pet, ícone, botão voltar) */
  leftSlot?: React.ReactNode;
  
  /** Se true, mostra divider sutil quando scroll > 4px. Default: true */
  showDividerOnScroll?: boolean;
  
  /** Se true, mostra logo PETMOL ao invés de title. Default: false */
  showLogo?: boolean;
  
  /** Classes extras para o container */
  className?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ────────────────────────────────────────────────────────────────────────────

export function BrandedHeader({
  title,
  subtitle,
  variant = 'glass',
  rightActions,
  leftSlot,
  showDividerOnScroll = true,
  showLogo = false,
  className = '',
}: BrandedHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  // ──────────────────────────────────────────────────────────────────────
  // SCROLL DETECTION
  // ──────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 4);
    };

    handleScroll(); // Check inicial
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // VARIANT CONFIG
  // ──────────────────────────────────────────────────────────────────────
  
  const variantConfig = brandTokens.variants[variant];

  // ──────────────────────────────────────────────────────────────────────
  // CLASSES DINÂMICAS
  // ──────────────────────────────────────────────────────────────────────
  
  const shadowClass = isScrolled 
    ? brandTokens.shadows.onScroll 
    : brandTokens.shadows.subtle;
  
  const dividerClass = showDividerOnScroll && isScrolled
    ? `border-b ${variantConfig.dividerColor}`
    : 'border-b border-transparent';

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────
  
  return (
    <header
      className={`
        sticky top-0 
        z-${brandTokens.header.zIndex}
        ${shadowClass}
        ${dividerClass}
        ${brandTokens.transitions.shadow}
        ${className}
      `.trim()}
      style={{
        paddingTop: brandTokens.safeArea.top,
        backgroundImage: variantConfig.gradient,
      }}
    >
      {/* Glass Overlay Layer */}
      <div 
        className={`absolute inset-0 ${variantConfig.backdropBlur}`}
        style={{ 
          backgroundColor: variantConfig.glassOverlay,
          pointerEvents: 'none',
        }}
      />

      {/* Paw Watermark (background decorativo sutil) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.04]">
        <PawWatermark
          position="tr"
          opacity={0.2}
          scale={0.8}
          colorClass="text-white"
          blendMode="soft-light"
        />
      </div>

      {/* Content Container */}
      <div
        className="relative z-10 max-w-7xl mx-auto flex items-center justify-between gap-3"
        style={{
          height: brandTokens.header.height,
          paddingLeft: brandTokens.header.paddingX,
          paddingRight: brandTokens.header.paddingX,
        }}
      >
        {/* ──────────────────────────────────────────────────────────────── */}
        {/* LEFT SECTION */}
        {/* ──────────────────────────────────────────────────────────────── */}
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Left Slot (avatar, ícone, botão voltar) */}
          {leftSlot && (
            <div 
              className="flex-shrink-0"
              style={{
                width: brandTokens.header.avatarSize,
                height: brandTokens.header.avatarSize,
              }}
            >
              {leftSlot}
            </div>
          )}

          {/* Logo ou Title/Subtitle */}
          <div className="flex flex-col justify-center min-w-0 flex-1">
            {showLogo ? (
              // Todas as variantes deste header (glass/ribbon/night) são
              // fundos coloridos/escuros — a marca é sempre branca. Usa
              // petmol-mark-transparent.png (alpha real, sem fundo azul
              // embutido) como máscara CSS em vez de um PNG opaco + filter,
              // que deixava a marca ilegível na variante 'night' (o filtro
              // brightness(0)+invert(1) clareava o retângulo azul de fundo
              // junto com o texto, virando um bloco branco sólido).
              <div
                role="img"
                aria-label="PETMOL"
                className="h-8 w-[120px]"
                style={{
                  backgroundColor: '#FFFFFF',
                  WebkitMaskImage: 'url(/brand/petmol-mark-transparent.png)',
                  maskImage: 'url(/brand/petmol-mark-transparent.png)',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'left center',
                  maskPosition: 'left center',
                }}
              />
            ) : (
              <>
                {/* Title */}
                {title && (
                  <h1 
                    className={`
                      text-base sm:text-lg font-semibold 
                      ${variantConfig.textColor}
                      truncate
                    `.trim()}
                  >
                    {title}
                  </h1>
                )}

                {/* Subtitle */}
                {subtitle && (
                  <p 
                    className={`
                      text-[11px] sm:text-xs 
                      ${variantConfig.textColor} 
                      opacity-75
                      truncate
                    `.trim()}
                  >
                    {subtitle}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* RIGHT SECTION (Actions) */}
        {/* ──────────────────────────────────────────────────────────────── */}
        
        {rightActions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {rightActions}
          </div>
        )}
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ACTION BUTTON HELPER (para uso em rightActions)
// ────────────────────────────────────────────────────────────────────────────

export interface HeaderActionButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  label?: string;
  variant?: HeaderVariant;
  className?: string;
}

export function HeaderActionButton({
  icon,
  onClick,
  label,
  variant = 'glass',
  className = '',
}: HeaderActionButtonProps) {
  const variantConfig = brandTokens.variants[variant];
  
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`
        flex items-center justify-center
        ${variantConfig.iconColor}
        hover:bg-white/20 active:bg-white/30
        ${brandTokens.radius.button}
        ${brandTokens.transitions.hover}
        ${className}
      `.trim()}
      style={{
        width: brandTokens.header.actionButtonSize,
        height: brandTokens.header.actionButtonSize,
        minWidth: brandTokens.header.actionButtonSize,
        minHeight: brandTokens.header.actionButtonSize,
      }}
    >
      <span style={{ fontSize: brandTokens.header.actionIconSize }}>
        {icon}
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AVATAR HELPER (para uso em leftSlot)
// ────────────────────────────────────────────────────────────────────────────

export interface HeaderAvatarProps {
  src?: string | null;
  alt: string;
  fallbackIcon?: React.ReactNode;
  className?: string;
}

export function HeaderAvatar({
  src,
  alt,
  fallbackIcon = '🐾',
  className = '',
}: HeaderAvatarProps) {
  return (
    <div
      className={`
        relative rounded-full overflow-hidden 
        bg-white/20 border-2 border-white/40
        flex items-center justify-center
        ${className}
      `.trim()}
      style={{
        width: brandTokens.header.avatarSize,
        height: brandTokens.header.avatarSize,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-2xl">{fallbackIcon}</span>
      )}
    </div>
  );
}
