/**
 * Emergency Page - /e/[code]
 * 
 * Página pública com informações de emergência do pet
 * Acessível via QR code ou link
 */

import { headers } from 'next/headers';
import { EmergencyShare } from '@/lib/shares/shareStorage';
import { t, type Locale } from '@/lib/i18n';

interface EmergencyPageProps {
  params: {
    code: string;
  };
}

async function getEmergencyInfo(code: string): Promise<EmergencyShare | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/shares/emergency/${code}`, {
      cache: 'no-store',
    });

    if (!response.ok) return null;

    return response.json();
  } catch (error) {
    console.error('[Emergency Page] Fetch failed:', error);
    return null;
  }
}

function getLocaleFromHeaders(): Locale {
  const accept = headers().get('accept-language')?.toLowerCase() || '';

  if (accept.startsWith('pt')) return 'pt-BR';
  if (accept.startsWith('es')) return 'es';
  return 'en';
}

function getSpeciesLabel(species: string, locale: Locale): string {
  if (species === 'dog') return t('species.dog', locale);
  if (species === 'cat') return t('species.cat', locale);
  return t('species.other', locale);
}

export default async function EmergencyPage({ params }: EmergencyPageProps) {
  const locale = getLocaleFromHeaders();
  const tr = (key: string, params?: Record<string, string | number>) => t(key, locale, params);
  const share = await getEmergencyInfo(params.code);

  if (!share) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center p-4">
        <div className="p-8 max-w-md w-full text-center bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
          <div className="text-8xl mb-6">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {tr('emergency.share.invalid.title')}
          </h1>
          <p className="text-gray-600 mb-6">
            {tr('emergency.share.invalid.subtitle')}
          </p>
          <a
            href="https://petmol.app"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
          >
            {tr('emergency.share.invalid.cta')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 to-red-500 p-4 py-8">
      {/* Premium top bar */}
      <div className="max-w-2xl mx-auto mb-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-4 h-12 flex items-center justify-between shadow-sm">
          <a href="/" className="flex items-center gap-2 text-primary-600 font-semibold text-sm hover:text-primary-700">
            <span>←</span>
            <span>🐾 PETMOL</span>
          </a>
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Emergência</span>
        </div>
      </div>
      <div className="max-w-2xl mx-auto">
        {/* Header - Emergency Badge */}
        <div className="bg-white/90 backdrop-blur rounded-t-3xl p-6 text-center border-b-4 border-red-500">
          <div className="text-6xl mb-3">🚨</div>
          <h1 className="text-3xl font-bold text-red-600 mb-2">
            {tr('emergency.share.header.title')}
          </h1>
          <p className="text-gray-700">
            {tr('emergency.share.header.subtitle')}
          </p>
        </div>

        {/* Pet Info */}
        <div className="p-8 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
          {/* Photo + Name */}
          <div className="flex items-center gap-6 mb-8 pb-8 border-b-2 border-gray-100">
            {share.pet_photo_url ? (
              <img
                src={share.pet_photo_url}
                alt={share.pet_name}
                className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-lg"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center border-4 border-white shadow-lg">
                <span className="text-6xl">
                  {share.pet_species === 'dog' ? '🐕' : share.pet_species === 'cat' ? '🐈' : '🐾'}
                </span>
              </div>
            )}
            
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {share.pet_name}
              </h2>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-2xl">
                  {share.pet_species === 'dog' ? '🐕' : share.pet_species === 'cat' ? '🐈' : '🐾'}
                </span>
                <span className="text-lg capitalize">{getSpeciesLabel(share.pet_species, locale)}</span>
              </div>
            </div>
          </div>

          {/* Owner Contact - DESTAQUE */}
          <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl p-6 mb-6 text-white shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">📞</span>
              <h3 className="text-2xl font-bold">{tr('emergency.share.owner.title')}</h3>
            </div>
            
            {share.owner_name && (
              <p className="text-lg mb-3 opacity-90">
                <span className="font-semibold">{tr('emergency.share.owner.name')}:</span> {share.owner_name}
              </p>
            )}
            
            <a
              href={`tel:${share.owner_contact}`}
              className="block text-center py-4 text-red-600 font-bold text-xl hover:bg-gray-50 transition-colors bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden"
            >
              📱 {share.owner_contact}
            </a>
          </div>

          {/* Emergency Notes */}
          {share.emergency_notes && (
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-xl font-bold text-gray-900">{tr('emergency.share.notes.title')}</h3>
              </div>
              <p className="text-gray-700 text-lg whitespace-pre-wrap">
                {share.emergency_notes}
              </p>
            </div>
          )}

          {/* Medical Conditions */}
          {share.medical_conditions && share.medical_conditions.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl">🏥</span>
                <h3 className="text-xl font-bold text-gray-900">{tr('emergency.share.conditions.title')}</h3>
              </div>
              <ul className="space-y-2">
                {share.medical_conditions.map((condition, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-700 text-lg">
                    <span className="text-red-500">•</span>
                    {condition}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Medications */}
          {share.medications && share.medications.length > 0 && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl">💊</span>
                <h3 className="text-xl font-bold text-gray-900">{tr('emergency.share.medications.title')}</h3>
              </div>
              <ul className="space-y-2">
                {share.medications.map((med, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-700 text-lg">
                    <span className="text-blue-500">•</span>
                    {med}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Veterinarian */}
          {(share.vet_name || share.vet_phone) && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl">🩺</span>
                <h3 className="text-xl font-bold text-gray-900">{tr('emergency.share.vet.title')}</h3>
              </div>
              
              {share.vet_name && (
                <p className="text-gray-700 text-lg mb-2">
                  <span className="font-semibold">{tr('emergency.share.vet.name')}:</span> {share.vet_name}
                </p>
              )}
              
              {share.vet_phone && (
                <a
                  href={`tel:${share.vet_phone}`}
                  className="inline-block mt-2 px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
                >
                  📞 {share.vet_phone}
                </a>
              )}
            </div>
          )}

          {/* Footer - Powered by PETMOL */}
          <div className="mt-8 pt-6 border-t-2 border-gray-100 text-center">
            <p className="text-gray-500 mb-3">
              🐾 {tr('emergency.share.footer.powered_by')}
            </p>
            <a
              href="https://petmol.app"
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
            >
              PETMOL
            </a>
            <p className="text-sm text-gray-400 mt-3">
              {tr('emergency.share.footer.cta')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: EmergencyPageProps) {
  const locale = getLocaleFromHeaders();
  const share = await getEmergencyInfo(params.code);

  if (!share) {
    return {
      title: t('emergency.share.meta.invalid_title', locale),
      description: t('emergency.share.meta.invalid_description', locale),
    };
  }

  return {
    title: t('emergency.share.meta.title', locale, { name: share.pet_name }),
    description: t('emergency.share.meta.description', locale, { name: share.pet_name }),
    robots: 'noindex, nofollow', // Don't index emergency pages
  };
}
