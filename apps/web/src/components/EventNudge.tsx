/**
 * EventNudge Component
 * 
 * Modal para confirmar eventos detectados
 */

'use client';

import { useEffect, useState } from 'react';
import { EventCandidate, EventConfirmation, EventType } from '@/lib/events/types';
import { getEventEngine } from '@/lib/events/eventEngine';
import { ignoreAnchor } from '@/lib/places/anchorsStore';
import { addIgnoreRule } from '@/lib/events/storage';
import { canShowPrompt, recordPrompt, pauseAllPrompts } from '@/lib/events/antiSpam';
import { useI18n } from '@/lib/I18nContext';
import { addMedicalRecord } from '@/lib/health/syncStorage';
import { getAllHealthProfiles } from '@/lib/health/syncStorage';
import { trackEventEngineAction } from '@/lib/analytics/storage';
import { requestUserConfirmation } from '@/features/interactions/userPromptChannel';

interface Pet {
  id: string;
  name: string;
  emoji: string;
}

export function EventNudge() {
  const { t } = useI18n();
  const [candidate, setCandidate] = useState<EventCandidate | null>(null);
  const [selectedPets, setSelectedPets] = useState<string[]>([]);
  const [eventType, setEventType] = useState<EventType>('vet_visit');
  const [notes, setNotes] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);

  useEffect(() => {
    const loadPets = async () => {
      try {
        const profiles = await getAllHealthProfiles();
        const mapped = profiles
          .filter((p) => p.pet_id && p.name)
          .map((p) => ({ id: p.pet_id, name: p.name, emoji: '🐾' }));
        setPets(mapped);
      } catch (error) {
        console.warn('[EventNudge] Failed to load pets', error);
        setPets([]);
      }
    };

    loadPets();
    const interval = setInterval(loadPets, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const engine = getEventEngine();
    engine.init();

    // Listen for ready candidates
    engine.onCandidateReady(async (newCandidate) => {
      // Anti-spam check
      const check = await canShowPrompt();
      
      if (!check.allowed) {
        console.log(`[EventNudge] Prompt blocked: ${check.reason}`, {
          remainingMinutes: check.remainingMinutes,
        });
        
        // Silently ignore the candidate
        const confirmation: EventConfirmation = {
          candidate_id: newCandidate.id,
          confirmed: false,
          confirmed_at: new Date().toISOString(),
          pet_ids: [],
        };
        await engine.confirmEvent(confirmation);
        return;
      }

      // Show prompt
      setCandidate(newCandidate);
      setSelectedPets([]);
      setEventType('vet_visit');
      setNotes('');
      setIsVisible(true);
      
      // Record that we showed the prompt
      recordPrompt(newCandidate.place_id, newCandidate.id);
    });

    return () => {
      engine.stop();
    };
  }, []);

  const handleConfirm = async () => {
    if (!candidate) return;

    const confirmation: EventConfirmation = {
      candidate_id: candidate.id,
      confirmed: true,
      event_type: eventType,
      pet_ids: selectedPets,
      notes: notes.trim() || undefined,
      confirmed_at: new Date().toISOString(),
    };

    const engine = getEventEngine();
    await engine.confirmEvent(confirmation);
    await trackEventEngineAction('event_confirmed', candidate.place_id, selectedPets, {
      event_type: eventType,
      place_name: candidate.place_name,
    });

    const petIdsToUse = selectedPets.length
      ? selectedPets
      : pets.length === 1
        ? [pets[0].id]
        : [];

    if (petIdsToUse.length && (eventType === 'vet_visit' || eventType === 'service_visit')) {
      const title = eventType === 'vet_visit'
        ? t('event_nudge.record.title.vet')
        : t('event_nudge.record.title.service');
      const description = candidate.place_name
        ? t('event_nudge.record.description.with_place', { place: candidate.place_name })
        : t('event_nudge.record.description.auto');

      await Promise.all(
        petIdsToUse.map((petId) =>
          addMedicalRecord(petId, {
            type: 'visit',
            title,
            description,
            date: new Date().toISOString(),
            attachments: [],
            tags: ['auto', 'visit'],
            place_id: candidate.place_id,
            place_name: candidate.place_name,
          })
        )
      );
    }

    // Show success with option to add medical details
    if (eventType === 'vet_visit') {
      const addDetails = await requestUserConfirmation(
        `${t('event_nudge.confirmed.title')}\n\n${t('event_nudge.confirmed.details_question')}`,
        {
          title: t('event_nudge.confirmed.title'),
          tone: 'neutral',
          confirmLabel: 'Adicionar detalhes',
          cancelLabel: 'Agora não',
        }
      );
      
      if (addDetails) {
        // TODO: Open MedicalAssistant
        // For now, just log
        console.log('User wants to add medical details');
      }
    }

    setIsVisible(false);
    setCandidate(null);
  };

  const handleIgnore = async () => {
    if (!candidate) return;

    const confirmation: EventConfirmation = {
      candidate_id: candidate.id,
      confirmed: false,
      confirmed_at: new Date().toISOString(),
      pet_ids: [],
    };

    const engine = getEventEngine();
    await engine.confirmEvent(confirmation);
    await trackEventEngineAction('event_ignored', candidate.place_id, [], {
      place_name: candidate.place_name,
    });

    setIsVisible(false);
    setCandidate(null);
  };

  const handlePause = async (hours: number) => {
    if (!candidate) return;

    // Set global pause (affects all future prompts)
    await pauseAllPrompts(hours);

    // Also ignore this specific place temporarily
    const until = new Date();
    until.setHours(until.getHours() + hours);
    await ignoreAnchor(candidate.place_id, until.toISOString());

    await handleIgnore();
  };

  const handleIgnorePlace = async () => {
    if (!candidate) return;

    // Add to ignore list permanently
    await addIgnoreRule({
      place_id: candidate.place_id,
      created_at: new Date().toISOString(),
    });

    await ignoreAnchor(candidate.place_id);

    await handleIgnore();
  };

  const togglePet = (petId: string) => {
    setSelectedPets(prev =>
      prev.includes(petId)
        ? prev.filter(id => id !== petId)
        : [...prev, petId]
    );
  };

  if (!isVisible || !candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md backdrop-blur-sm p-4">
      <div className="dark:bg-gray-800 w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                <span className="text-2xl">📍</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">
                  {t('event_nudge.title')}
                </h3>
                <p className="text-white/80 text-sm">
                  {candidate.place_name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Question */}
          <div className="text-center">
            <p className="text-gray-700 dark:text-gray-300 text-lg">
              {t('event_nudge.question')}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-500">
              <span>⏱️ {Math.floor(candidate.dwell_seconds / 60)}min</span>
              <span>•</span>
              <span>🎯 {candidate.confidence_score}%</span>
            </div>
          </div>

          {/* Pet Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('event_nudge.select_pets')}
            </label>
            {pets.length === 0 ? (
              <div className="text-xs text-slate-500">
                {t('event_nudge.no_pets')}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pets.map((pet) => (
                  <button
                    key={pet.id}
                    onClick={() => togglePet(pet.id)}
                    className={
                      `
                      px-4 py-2 rounded-full border-2 transition-all
                      ${selectedPets.includes(pet.id)
                        ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
                        : 'border-gray-200 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                      }
                      `
                    }
                  >
                    <span className="mr-1">{pet.emoji}</span>
                    {pet.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('event_nudge.event_type')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'vet_visit', label: t('event_nudge.vet_visit'), icon: '🏥' },
                { value: 'service_visit', label: t('event_nudge.service_visit'), icon: '✨' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setEventType(option.value as EventType)}
                  className={
                    `
                    p-3 rounded-xl border-2 transition-all text-left
                    ${eventType === option.value
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }
                    `
                  }
                >
                  <span className="text-2xl block mb-1">{option.icon}</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('event_nudge.notes_optional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('event_nudge.notes_placeholder')}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleConfirm}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
            >
              {t('event_nudge.confirm')}
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleIgnore}
                className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
              >
                {t('event_nudge.not_now')}
              </button>
              <button
                onClick={() => handlePause(24)}
                className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
              >
                {t('event_nudge.pause_24h')}
              </button>
            </div>

            <button
              onClick={handleIgnorePlace}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {t('event_nudge.ignore_place')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
