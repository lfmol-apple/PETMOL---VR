'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { defaultLocaleForCountry, isValidLocale, localeNames } from '@/lib/i18n';
import { requestUserConfirmation, showBlockingNotice } from '@/features/interactions/userPromptChannel';

const STORAGE_KEY_LAST_COUNTRY = 'petmol_last_detected_country';
const CHECK_INTERVAL = 5 * 60 * 1000; // Verifica a cada 5 minutos

// Mapeamento de códigos de país
const countryNames: Record<string, Record<string, string>> = {
  'BR': { 'pt-BR': 'Brasil', 'en': 'Brazil', 'es': 'Brasil', 'fr': 'Brésil', 'it': 'Brasile' },
  'US': { 'pt-BR': 'Estados Unidos', 'en': 'United States', 'es': 'Estados Unidos', 'fr': 'États-Unis', 'it': 'Stati Uniti' },
  'GB': { 'pt-BR': 'Reino Unido', 'en': 'United Kingdom', 'es': 'Reino Unido', 'fr': 'Royaume-Uni', 'it': 'Regno Unito' },
  'DE': { 'pt-BR': 'Alemanha', 'en': 'Germany', 'es': 'Alemania', 'fr': 'Allemagne', 'it': 'Germania' },
  'FR': { 'pt-BR': 'França', 'en': 'France', 'es': 'Francia', 'fr': 'France', 'it': 'Francia' },
  'IT': { 'pt-BR': 'Itália', 'en': 'Italy', 'es': 'Italia', 'fr': 'Italie', 'it': 'Italia' },
  'ES': { 'pt-BR': 'Espanha', 'en': 'Spain', 'es': 'España', 'fr': 'Espagne', 'it': 'Spagna' },
  'MX': { 'pt-BR': 'México', 'en': 'Mexico', 'es': 'México', 'fr': 'Mexique', 'it': 'Messico' },
  'AR': { 'pt-BR': 'Argentina', 'en': 'Argentina', 'es': 'Argentina', 'fr': 'Argentine', 'it': 'Argentina' },
  'CA': { 'pt-BR': 'Canadá', 'en': 'Canada', 'es': 'Canadá', 'fr': 'Canada', 'it': 'Canada' },
  'AU': { 'pt-BR': 'Austrália', 'en': 'Australia', 'es': 'Australia', 'fr': 'Australie', 'it': 'Australia' },
  'PT': { 'pt-BR': 'Portugal', 'en': 'Portugal', 'es': 'Portugal', 'fr': 'Portugal', 'it': 'Portogallo' },
  'CO': { 'pt-BR': 'Colômbia', 'en': 'Colombia', 'es': 'Colombia', 'fr': 'Colombie', 'it': 'Colombia' },
  'CL': { 'pt-BR': 'Chile', 'en': 'Chile', 'es': 'Chile', 'fr': 'Chili', 'it': 'Cile' },
};

async function detectCountryByIP(): Promise<string | null> {
  try {
    // Tenta 2 serviços diferentes para máxima confiabilidade
    // Serviço 1: ipapi.co (mais rápido)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const response = await fetch('https://ipapi.co/json/', { 
        signal: controller.signal,
        cache: 'no-store'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.country_code) {
          console.log('🌍 País detectado:', data.country_code, data.country_name);
          return data.country_code;
        }
      }
    } catch (e) {
      console.log('⏭️ Tentando serviço alternativo...');
    }
    
    // Serviço 2: api.country.is (fallback gratuito, retorna apenas país)
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 4000);
      
      const response2 = await fetch('https://api.country.is', {
        signal: controller2.signal,
        cache: 'no-store'
      });
      
      clearTimeout(timeoutId2);
      
      if (response2.ok) {
        const data = await response2.json();
        if (data.country && data.country.length === 2) {
          console.log('🌍 País detectado (fallback):', data.country);
          return data.country.toUpperCase();
        }
      }
    } catch (e) {
      // Silencioso
    }
    
    return null;
  } catch (error) {
    // Silencioso - não afeta funcionalidade
    return null;
  }
}

export function useLocationDetection() {
  const { locale, geo, setCountry, setLocale, t } = useI18n();
  const [showNotification, setShowNotification] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [suggestedLocale, setSuggestedLocale] = useState<string>('');

  useEffect(() => {
    const checkLocation = async () => {
      const lastCountry = localStorage.getItem(STORAGE_KEY_LAST_COUNTRY);
      
      const newCountry = await detectCountryByIP();
      if (!newCountry) {
        console.log('⚠️ Não foi possível detectar país');
        return;
      }

      console.log('🌍 País detectado:', newCountry);

      // Se é primeira vez, apenas salva e sugere idioma se for diferente do atual
      if (!lastCountry) {
        localStorage.setItem(STORAGE_KEY_LAST_COUNTRY, newCountry);
        
        // Sugere idioma apropriado na primeira detecção
        if (newCountry !== 'BR' && locale === 'pt-BR') {
          const newLocale = defaultLocaleForCountry(newCountry);
          const countryName = countryNames[newCountry]?.[locale] || newCountry;
          const languageName = localeNames[newLocale] || newLocale;
          
          const userWantsChange = await requestUserConfirmation(
            `🌍 Bem-vindo!\n\n` +
            `Detectamos que você está em: ${countryName}\n\n` +
            `Gostaria de usar o app em ${languageName}?\n\n` +
            `(Você pode mudar depois no menu de idiomas)`,
            {
              title: 'Idioma do app',
              confirmLabel: 'Mudar idioma',
              cancelLabel: 'Manter atual',
            },
          );
          
          if (userWantsChange) {
            setCountry(newCountry);
            setLocale(newLocale);
            console.log('✅ Idioma alterado para:', newLocale);
          }
        }
        return;
      }

      // Salva o país detectado
      localStorage.setItem(STORAGE_KEY_LAST_COUNTRY, newCountry);

      // Se o país não mudou, não faz nada
      if (lastCountry === newCountry) {
        return;
      }

      // País mudou! Detectou viagem internacional
      console.log(`✈️ VIAGEM DETECTADA: ${lastCountry} → ${newCountry}`);
      
      const newLocale = defaultLocaleForCountry(newCountry);
      const countryName = countryNames[newCountry]?.[locale] || newCountry;
      const oldCountryName = countryNames[lastCountry]?.[locale] || lastCountry;
      const languageName = localeNames[newLocale] || newLocale;

      // Sempre pergunta ao usuário se quer mudar o idioma
      const userWantsChange = await requestUserConfirmation(
        `✈️ Viagem Internacional Detectada!\n\n` +
        `De: ${oldCountryName} → Para: ${countryName}\n\n` +
        `Deseja mudar o idioma do app para ${languageName}?\n\n` +
        `(Ideal para buscar clínicas e serviços locais)`,
        {
          title: 'Idioma local',
          confirmLabel: 'Mudar idioma',
          cancelLabel: 'Manter atual',
        },
      );

      if (userWantsChange) {
        setCountry(newCountry);
        setLocale(newLocale);
        console.log('✅ Idioma alterado para:', newLocale);
        showBlockingNotice(`App configurado para ${countryName}!`);
      } else {
        console.log('👤 Usuário optou por manter idioma atual');
      }
    };

    // Verifica ao carregar a página
    checkLocation();

    // Verifica periodicamente (a cada 5 minutos)
    const interval = setInterval(checkLocation, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [locale, setCountry, setLocale]);

  const handleAcceptLanguageChange = () => {
    if (detectedCountry) {
      setCountry(detectedCountry);
      if (isValidLocale(suggestedLocale)) {
        setLocale(suggestedLocale);
      }
      setShowNotification(false);
    }
  };

  const handleDismiss = () => {
    setShowNotification(false);
  };

  return {
    showNotification,
    detectedCountry,
    suggestedLocale,
    handleAcceptLanguageChange,
    handleDismiss,
    getCountryName: (code: string) => countryNames[code]?.[locale] || code
  };
}
