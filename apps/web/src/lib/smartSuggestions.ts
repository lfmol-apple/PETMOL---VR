/**
 * Smart Suggestions System
 * Analyzes patterns and context to proactively suggest actions
 *
 * 2026-04: Canais externos (browser notifications) foram desligados pela
 * governança master. Este módulo gera sugestões para a CENTRAL INTERNA
 * e UI local; não dispara mais notificações de navegador.
 */

import { daysUntilCalendarDate } from '@/lib/vaccineUtils';

export interface SmartSuggestion {
  id: string;
  type: 'vaccine_due' | 'walk_time' | 'grooming_due' | 'checkup_due' | 'medication_refill';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  action_label: string;
  action_url?: string;
  action_callback?: () => void;
  pet_id: string;
  created_at: number;
  expires_at?: number;
}

const STORAGE_KEY = 'petmol_suggestions';

/**
 * Analyze pet health data and generate smart suggestions
 */
export function generateSmartSuggestions(petId: string): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const now = Date.now();

  if (typeof window === 'undefined') return suggestions;

  try {
    // Load pet profile
    const profileJson = localStorage.getItem(`pet_health_profile_${petId}`);
    if (!profileJson) return suggestions;
    
    const profile = JSON.parse(profileJson);
    const petName = profile.pet_name;

    // Check vaccines
    const vaccinesJson = localStorage.getItem(`pet_vaccines_${petId}`);
    if (vaccinesJson) {
      const vaccines = JSON.parse(vaccinesJson);
      vaccines.forEach((vaccine: { id?: string; name?: string; next_dose_date?: string }) => {
        if (vaccine.next_dose_date) {
          const daysUntil = daysUntilCalendarDate(vaccine.next_dose_date);

          if (daysUntil !== null && daysUntil <= 7 && daysUntil >= 0) {
            suggestions.push({
              id: `vaccine_${vaccine.id}`,
              type: 'vaccine_due',
              priority: daysUntil <= 2 ? 'high' : 'medium',
              title: '💉 Vacina Próxima',
              message: `${vaccine.name} de ${petName} vence em ${daysUntil} dias`,
              action_label: 'Agendar Reforço',
              action_url: `/health/${petId}/vaccines`,
              pet_id: petId,
              created_at: now,
              expires_at: nextDose,
            });
          }
        }
      });
    }

    // Check walk patterns
    const walksJson = localStorage.getItem(`pet_walks_${petId}`);
    const patternsJson = localStorage.getItem(`walk_patterns_${petId}`);
    
    if (patternsJson) {
      const patterns = JSON.parse(patternsJson);
      const currentHour = new Date().getHours();
      const currentDay = new Date().getDay();
      
      // Check if it's usual walk time
      const usualPattern = patterns.find((p: { day: number; hour: number; frequency: number }) => 
        p.day === currentDay && 
        p.hour === currentHour &&
        p.frequency >= 3
      );
      
      if (usualPattern) {
        // Check if already walked today
        const todayWalks = walksJson ? JSON.parse(walksJson).filter((w: { date: string }) => {
          const walkDate = new Date(w.date);
          const today = new Date();
          return walkDate.toDateString() === today.toDateString();
        }) : [];
        
        if (todayWalks.length === 0) {
          suggestions.push({
            id: `walk_${now}`,
            type: 'walk_time',
            priority: 'medium',
            title: '🚶 Hora do Passeio?',
            message: `Normalmente você passeia com ${petName} agora`,
            action_label: 'Começar Passeio',
            action_url: `/health/${petId}/walks`,
            pet_id: petId,
            created_at: now,
            expires_at: now + 3600000, // 1 hour
          });
        }
      }
    }

    // Check last grooming
    const groomingJson = localStorage.getItem(`pet_grooming_${petId}`);
    if (groomingJson) {
      const groomingVisits = JSON.parse(groomingJson);
      const lastGrooming = groomingVisits[groomingVisits.length - 1];
      
      if (lastGrooming) {
        const daysSince = Math.floor((now - new Date(lastGrooming.date).getTime()) / (1000 * 60 * 60 * 24));
        
        // Suggest grooming every 30 days for dogs
        if (profile.species === 'dog' && daysSince >= 30) {
          suggestions.push({
            id: `grooming_${now}`,
            type: 'grooming_due',
            priority: 'low',
            title: '✂️ Banho & Tosa',
            message: `Já faz ${daysSince} dias desde o último banho de ${petName}`,
            action_label: 'Buscar Petshops',
            action_url: '/services',
            pet_id: petId,
            created_at: now,
          });
        }
      }
    }

    // Check last checkup
    const appointmentsJson = localStorage.getItem(`pet_appointments_${petId}`);
    if (appointmentsJson) {
      const appointments = JSON.parse(appointmentsJson);
      const checkups = appointments.filter((a: { type?: string; date?: string }) => 
        a.type === 'checkup' || a.type === 'consultation'
      );
      const lastCheckup = checkups[checkups.length - 1];
      
      if (lastCheckup) {
        const monthsSince = Math.floor((now - new Date(lastCheckup.date).getTime()) / (1000 * 60 * 60 * 24 * 30));
        
        // Suggest checkup every 6 months
        if (monthsSince >= 6) {
          suggestions.push({
            id: `checkup_${now}`,
            type: 'checkup_due',
            priority: monthsSince >= 12 ? 'high' : 'medium',
            title: '🏥 Check-up Anual',
            message: `${petName} não faz check-up há ${monthsSince} meses`,
            action_label: 'Buscar Clínicas',
            action_url: '/emergency',
            pet_id: petId,
            created_at: now,
          });
        }
      }
    }

    // Check active medications
    const prescriptionsJson = localStorage.getItem(`pet_prescriptions_${petId}`);
    if (prescriptionsJson) {
      const prescriptions = JSON.parse(prescriptionsJson);
      const activeMeds = prescriptions.filter((p: { end_date?: string; id?: string; medication?: string }) => {
        if (!p.end_date) return false;
        const endDate = new Date(p.end_date).getTime();
        return endDate >= now && endDate <= now + 7 * 24 * 60 * 60 * 1000; // Within 7 days
      });
      
      activeMeds.forEach((med: { id?: string; medication?: string; end_date: string }) => {
        const daysUntil = Math.floor((new Date(med.end_date).getTime() - now) / (1000 * 60 * 60 * 24));
        suggestions.push({
          id: `med_${med.id}`,
          type: 'medication_refill',
          priority: daysUntil <= 2 ? 'high' : 'medium',
          title: '💊 Medicação Acabando',
          message: `${med.medication} de ${petName} acaba em ${daysUntil} dias`,
          action_label: 'Comprar Mais',
          action_url: `/buy?q=${encodeURIComponent(med.medication || '')}`,
          pet_id: petId,
          created_at: now,
          expires_at: new Date(med.end_date).getTime(),
        });
      });
    }

  } catch (error) {
    console.error('Error generating suggestions:', error);
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

/**
 * Get all active suggestions for all pets
 */
export function getAllSmartSuggestions(): SmartSuggestion[] {
  const allSuggestions: SmartSuggestion[] = [];
  
  if (typeof window === 'undefined') return allSuggestions;
  
  try {
    const keys = Object.keys(localStorage);
    const petIds = keys
      .filter(k => k.startsWith('pet_health_profile_'))
      .map(k => k.replace('pet_health_profile_', ''));
    
    petIds.forEach(petId => {
      const suggestions = generateSmartSuggestions(petId);
      allSuggestions.push(...suggestions);
    });
  } catch (error) {
    console.error('Error loading suggestions:', error);
  }

  return allSuggestions;
}

/**
 * Show notification for high priority suggestions
 */
export function notifyHighPrioritySuggestions() {
  // 2026-04: fluxo externo (browser notifications) desativado.
  // Mantido como no-op para preservar API e permitir reativação futura
  // sob controle explícito da camada de governança master.
  return;
}
