/**
 * ShareManager Component
 * 
 * Gerenciamento de links compartilhados (Emergency + Vet)
 * - Criar novos shares
 * - Ver shares ativos
 * - Revogar/renovar
 * - Copiar links
 */

'use client';

import { useState, useEffect } from 'react';
import {
  createEmergencyShare,
  createVetShare,
  getEmergencySharesByPet,
  getVetSharesByPet,
  revokeEmergencyShare,
  revokeVetShare,
  renewEmergencyShare,
  EmergencyShare,
  VetShareToken,
} from '@/lib/shares/shareStorage';
import { useI18n } from '@/lib/I18nContext';
import { trackShareEvent } from '@/lib/analytics/storage';
import { requestUserConfirmation } from '@/features/interactions/userPromptChannel';

interface ShareManagerProps {
  petId: string;
  petName: string;
  petSpecies: 'dog' | 'cat' | 'other';
  ownerPhone: string;
}

export function ShareManager({ petId, petName, petSpecies, ownerPhone }: ShareManagerProps) {
  const { t, geo } = useI18n();
  
  const [emergencyShares, setEmergencyShares] = useState<EmergencyShare[]>([]);
  const [vetShares, setVetShares] = useState<VetShareToken[]>([]);
  const [showCreateEmergency, setShowCreateEmergency] = useState(false);
  const [showCreateVet, setShowCreateVet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Load shares
  useEffect(() => {
    loadShares();
  }, [petId]);

  const loadShares = async () => {
    setLoading(true);
    try {
      const [emergency, vet] = await Promise.all([
        getEmergencySharesByPet(petId),
        getVetSharesByPet(petId),
      ]);
      setEmergencyShares(emergency.filter(s => s.is_active));
      setVetShares(vet.filter(s => s.is_active));
    } catch (error) {
      console.error('[ShareManager] Load failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create emergency share
  const handleCreateEmergency = async () => {
    try {
      const share = await createEmergencyShare(
        petId,
        petName,
        petSpecies,
        ownerPhone,
        {
          expiresInDays: undefined, // Never expires
        }
      );
      await trackShareEvent('created', 'emergency', share.code, petId, {
        pet_name: petName,
        pet_species: petSpecies,
      });
      await loadShares();
      setShowCreateEmergency(false);
    } catch (error) {
      console.error('[ShareManager] Create emergency failed:', error);
      showToast(t('share_manager.alerts.create_emergency_error'));
    }
  };

  // Create vet share
  const handleCreateVet = async () => {
    try {
      const share = await createVetShare(petId, {
        expiresInHours: 48, // 2 days default
      });
      await trackShareEvent('created', 'vet', share.token, petId);
      await loadShares();
      setShowCreateVet(false);
    } catch (error) {
      console.error('[ShareManager] Create vet share failed:', error);
      showToast(t('share_manager.alerts.create_vet_error'));
    }
  };

  // Copy to clipboard
  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    showToast(t('share_manager.alerts.copied'));
  };

  // Revoke
  const handleRevoke = async (type: 'emergency' | 'vet', id: string) => {
    const accepted = await requestUserConfirmation(t('share_manager.alerts.revoke_confirm'), {
      title: 'Revogar acesso',
      tone: 'danger',
      confirmLabel: 'Revogar',
    });
    if (!accepted) return;

    try {
      if (type === 'emergency') {
        await revokeEmergencyShare(id);
        await trackShareEvent('revoked', 'emergency', id, petId);
      } else {
        await revokeVetShare(id);
        await trackShareEvent('revoked', 'vet', id, petId);
      }
      await loadShares();
    } catch (error) {
      console.error('[ShareManager] Revoke failed:', error);
      showToast(t('share_manager.alerts.revoke_error'));
    }
  };

  // Renew
  const handleRenew = async (code: string, days: number) => {
    try {
      await renewEmergencyShare(code, days);
      await trackShareEvent('created', 'emergency', code, petId, { renewed_days: days });
      await loadShares();
    } catch (error) {
      console.error('[ShareManager] Renew failed:', error);
      showToast(t('share_manager.alerts.renew_error'));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin text-4xl">⏳</div>
        <p className="mt-2 text-gray-600">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-sm font-semibold text-blue-800 shadow-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-[11px] font-bold text-blue-600 underline">OK</button>
        </div>
      )}
      {/* Emergency Shares Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🚨</span>
            {t('share_manager.emergency.title')}
          </h3>
          <button
            onClick={() => setShowCreateEmergency(true)}
            className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            {t('share_manager.actions.create_new')}
          </button>
        </div>

        {emergencyShares.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
            {t('share_manager.emergency.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {emergencyShares.map((share) => (
              <div key={share.code} className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono font-bold text-lg">{share.code}</span>
                    <span className="ml-3 text-sm text-gray-500">
                      {t('share_manager.emergency.views', { count: share.view_count })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(`https://petmol.app/e/${share.code}`)}
                      className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-[#0056D2]"
                    >
                      {t('share_manager.actions.copy')}
                    </button>
                    <button
                      onClick={() => handleRevoke('emergency', share.code)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                    >
                      {t('share_manager.actions.revoke')}
                    </button>
                  </div>
                </div>
                <a
                  href={`https://petmol.app/e/${share.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0056D2] text-sm hover:underline block truncate"
                >
                  https://petmol.app/e/{share.code}
                </a>
                {share.expires_at ? (
                  <p className="text-xs text-gray-500 mt-2">
                    {t('share_manager.emergency.expires_at')}: {new Date(share.expires_at).toLocaleString(geo.locale)}
                  </p>
                ) : (
                  <p className="text-xs text-green-600 mt-2">{t('share_manager.emergency.no_expiration')}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vet Shares Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            {t('share_manager.vet.title')}
          </h3>
          <button
            onClick={() => setShowCreateVet(true)}
            className="px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-[#0056D2] transition-colors"
          >
            {t('share_manager.actions.create_new')}
          </button>
        </div>

        {vetShares.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
            {t('share_manager.vet.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {vetShares.map((share) => {
              const expiresAt = new Date(share.expires_at);
              const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));

              return (
                <div key={share.token} className="bg-white border-2 border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      {share.vet_name && (
                        <span className="font-semibold">{share.vet_name}</span>
                      )}
                      {share.vet_clinic && (
                        <span className="text-sm text-gray-500 ml-2">• {share.vet_clinic}</span>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {t('share_manager.vet.accesses', { count: share.access_count })}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        hoursRemaining < 24 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {hoursRemaining}h
                      </span>
                      <button
                        onClick={() => copyLink(`https://petmol.app/v/${share.token}`)}
                        className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-[#0056D2]"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => handleRevoke('vet', share.token)}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t('share_manager.vet.expires_at')}: {expiresAt.toLocaleString(geo.locale)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Emergency Modal (simplified) */}
      {showCreateEmergency && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">{t('share_manager.emergency.modal.title')}</h3>
            <p className="text-gray-600 mb-6">
              {t('share_manager.emergency.modal.description')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateEmergency(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
              >
                {t('share_manager.actions.cancel')}
              </button>
              <button
                onClick={handleCreateEmergency}
                className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600"
              >
                {t('share_manager.actions.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Vet Share Modal (simplified) */}
      {showCreateVet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">{t('share_manager.vet.modal.title')}</h3>
            <p className="text-gray-600 mb-6">
              {t('share_manager.vet.modal.description')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateVet(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
              >
                {t('share_manager.actions.cancel')}
              </button>
              <button
                onClick={handleCreateVet}
                className="flex-1 px-4 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-[#0056D2]"
              >
                {t('share_manager.actions.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
