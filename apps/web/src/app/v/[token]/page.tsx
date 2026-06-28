/**
 * Vet Share Page - /v/[token]
 * 
 * Página privada para veterinários acessarem dados temporários do pet
 * Requer autenticação via token único
 */

import { headers } from 'next/headers';
import { VetShareToken } from '@/lib/shares/shareStorage';
import { PetHealthProfile } from '@/lib/health/syncStorage';
import { t, type Locale } from '@/lib/i18n';

interface VetSharePageProps {
  params: Promise<{
    token: string;
  }>;
}

async function getVetShareData(token: string): Promise<{
  share: VetShareToken;
  healthProfile: PetHealthProfile;
} | null> {
  try {
    // TODO: Fetch from Supabase with RLS
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/shares/vet/${token}`, {
      cache: 'no-store',
    });

    if (!response.ok) return null;

    return response.json();
  } catch (error) {
    console.error('[Vet Share] Fetch failed:', error);
    return null;
  }
}

async function getLocaleFromHeaders(): Promise<Locale> {
  const accept = (await headers()).get('accept-language')?.toLowerCase() || '';

  if (accept.startsWith('pt')) return 'pt-BR';
  if (accept.startsWith('es')) return 'es';
  if (accept.startsWith('fr')) return 'fr';
  if (accept.startsWith('it')) return 'it';
  return 'en';
}

function getSpeciesLabel(species: string, locale: Locale): string {
  if (species === 'dog') return t('species.dog', locale);
  if (species === 'cat') return t('species.cat', locale);
  return t('species.other', locale);
}

export default async function VetSharePage({ params }: VetSharePageProps) {
  const { token } = await params;
  const locale = await getLocaleFromHeaders();
  const tr = (key: string, params?: Record<string, string | number>) => t(key, locale, params);
  const data = await getVetShareData(token);

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="p-8 max-w-md w-full text-center border-2 border-red-200 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
          <div className="text-8xl mb-6">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {tr('vet_share.invalid.title')}
          </h1>
          <p className="text-gray-600 mb-6">
            {tr('vet_share.invalid.subtitle')}
          </p>
          <a
            href="https://petmol.app"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
          >
            {tr('vet_share.invalid.cta')}
          </a>
        </div>
      </div>
    );
  }

  const { share, healthProfile } = data;
  const expiresAt = new Date(share.expires_at);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      {/* Premium top bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm mb-6">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-primary-600 font-semibold text-sm hover:text-primary-700">
            <span>←</span>
            <span>🐾 PETMOL</span>
          </a>
          <span className="text-sm font-medium text-slate-700">{tr('vet_share.header.title')}</span>
          <span className="text-xs text-slate-400">Vet Share</span>
        </div>
      </div>
      <div className="max-w-4xl mx-auto">
        {/* Header - Vet Info */}
        <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-[#0066ff] to-cyan-500 rounded-full flex items-center justify-center">
                <span className="text-3xl">🩺</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {tr('vet_share.header.title')}
                </h1>
                <p className="text-gray-600">
                  {share.vet_name && `${tr('vet_share.vet_prefix')} ${share.vet_name}`}
                  {share.vet_clinic && ` - ${share.vet_clinic}`}
                </p>
              </div>
            </div>

            {/* Expiration Badge */}
            <div className="text-right">
              <div className={`inline-block px-4 py-2 rounded-xl font-medium ${
                hoursRemaining < 24
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                <div className="text-2xl font-bold">{hoursRemaining}h</div>
                <div className="text-xs">{tr('vet_share.header.remaining')}</div>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="mt-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  <strong>{tr('vet_share.notice.title')}</strong> {tr('vet_share.notice.message', {
                    date: expiresAt.toLocaleString(locale),
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pet Info Card */}
        <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
              <span className="text-5xl">
                {healthProfile.species === 'dog' ? '🐕' : healthProfile.species === 'cat' ? '🐈' : '🐾'}
              </span>
            </div>
            
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                {healthProfile.name}
              </h2>
              <div className="flex items-center gap-4 text-gray-600">
                <span className="capitalize">{getSpeciesLabel(healthProfile.species, locale)}</span>
                {healthProfile.breed && <span>• {healthProfile.breed}</span>}
                {healthProfile.birth_date && (
                  <span>
                    • {tr('vet_share.pet.age_years', {
                      count: Math.floor((Date.now() - new Date(healthProfile.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Medical History */}
        {share.share_medical_history && healthProfile.medical_history.length > 0 && (
          <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">📋</span>
              {tr('vet_share.sections.medical_history')}
            </h3>
            
            <div className="space-y-4">
              {healthProfile.medical_history.slice(0, 10).map((record) => (
                <div key={record.id} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{record.title}</h4>
                    <span className="text-sm text-gray-500">
                      {new Date(record.date).toLocaleDateString(locale)}
                    </span>
                  </div>
                  {record.description && (
                    <p className="text-gray-600 text-sm mb-2">{record.description}</p>
                  )}
                  {record.place_name && (
                    <p className="text-xs text-gray-500">📍 {record.place_name}</p>
                  )}
                  {record.tags.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {record.tags.map((tag, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-blue-100 text-[#0047ad] rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vaccinations */}
        {share.share_vaccinations && healthProfile.vaccinations.length > 0 && (
          <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">💉</span>
              {tr('vet_share.sections.vaccinations')}
            </h3>
            
            <div className="grid gap-4">
              {healthProfile.vaccinations.map((vac) => (
                <div key={vac.id} className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{vac.vaccine_name}</h4>
                    <span className="text-sm text-gray-600">
                      {new Date(vac.date).toLocaleDateString(locale)}
                    </span>
                  </div>
                  {vac.next_dose && (
                    <p className="text-sm text-green-700">
                      {tr('vet_share.vaccinations.next_dose')}: {new Date(vac.next_dose).toLocaleDateString(locale)}
                    </p>
                  )}
                  {vac.batch_number && (
                    <p className="text-xs text-gray-500 mt-1">{tr('vet_share.vaccinations.batch')}: {vac.batch_number}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Medications */}
        {share.share_medications && healthProfile.medications.length > 0 && (
          <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">💊</span>
              {tr('vet_share.sections.medications')}
            </h3>
            
            <div className="space-y-4">
              {healthProfile.medications.map((med) => (
                <div key={med.id} className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">{med.medication_name}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">{tr('vet_share.medications.dosage')}:</span>
                      <span className="ml-2 font-medium">{med.dosage}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">{tr('vet_share.medications.frequency')}:</span>
                      <span className="ml-2 font-medium">{med.frequency}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {tr('vet_share.medications.start')}: {new Date(med.start_date).toLocaleDateString(locale)}
                    {med.end_date && ` • ${tr('vet_share.medications.end')}: ${new Date(med.end_date).toLocaleDateString(locale)}`}
                  </div>
                  {med.notes && (
                    <p className="mt-2 text-sm text-gray-600 italic">{med.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight History */}
        {share.share_weight_history && healthProfile.weight_history.length > 0 && (
          <div className="p-6 mb-6 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">⚖️</span>
              {tr('vet_share.sections.weight_history')}
            </h3>
            
            <div className="space-y-3">
              {healthProfile.weight_history.slice(-5).reverse().map((record) => (
                <div key={record.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-semibold text-gray-900">
                      {record.weight} {record.weight_unit}
                    </span>
                    {record.notes && (
                      <span className="ml-3 text-sm text-gray-600">{record.notes}</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(record.measured_at).toLocaleDateString(locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 text-center bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
          <p className="text-gray-500 mb-3">
            🐾 {tr('vet_share.footer.powered_by')}
          </p>
          <a
            href="https://petmol.app"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
          >
            PETMOL
          </a>
          <p className="text-xs text-gray-400 mt-4">
            {tr('vet_share.footer.notice')}
          </p>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: VetSharePageProps) {
  await params;
  const locale = await getLocaleFromHeaders();
  return {
    title: t('vet_share.meta.title', locale),
    description: t('vet_share.meta.description', locale),
    robots: 'noindex, nofollow', // Don't index vet share pages
  };
}
