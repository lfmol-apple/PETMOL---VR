'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/I18nContext';
import {
  getHealthProfile,
  getHealthSummary,
  getUpcomingVaccines,
  getActivePrescriptions,
  getUpcomingAppointments,
  type PetHealthProfile,
  type HealthSummary,
} from '@/lib/petHealth';
import { PetShareExportPanel } from './PetShareExportPanel';
// ClinicVisitDetector removido — sem geolocalização

interface PetHealthDashboardProps {
  petId: string;
}

export function PetHealthDashboard({ petId }: PetHealthDashboardProps) {
  const { t, geo } = useI18n();
  const [profile, setProfile] = useState<PetHealthProfile | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRShare, setShowQRShare] = useState(false);

  useEffect(() => {
    loadHealthData();
  }, [petId]);

  const loadHealthData = () => {
    setLoading(true);
    const healthProfile = getHealthProfile(petId);
    const healthSummary = getHealthSummary(petId);
    setProfile(healthProfile);
    setSummary(healthSummary);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!profile || !summary) {
    return (
      <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏥</div>
          <h3 className="text-xl font-semibold mb-2">Sem histórico médico</h3>
          <p className="text-gray-600 mb-6">Crie o perfil de saúde do seu pet para começar</p>
          <button
            onClick={() => window.location.href = `/health/${petId}/setup`}
            className="px-6 py-3 bg-[#0056D2] text-white rounded-lg font-semibold hover:bg-[#0047ad]"
          >
            Criar Perfil de Saúde
          </button>
        </div>
      </div>

      
    );
  }

  const upcomingVaccines = getUpcomingVaccines(petId, 60);
  const activeMeds = getActivePrescriptions(petId);
  const upcomingAppts = getUpcomingAppointments(petId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-DEFAULT via-brand-light to-brand-dark rounded-[24px] shadow-premium p-6 sm:p-8 text-white relative overflow-hidden">
        {/* Efeito de brilho de fundo */}
        <div className="absolute top-0 right-0 -m-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 z-10">
          {/* Pet Photo */}
          {profile.photo && (() => {
            const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '')
              .replace(/\/api\/?$/, '')
              .replace(/\/$/, '');
            const base = configured || (typeof window !== 'undefined' ? window.location.origin : '');
            const normalized = String(profile.photo).replace(/^\/+/, '');
            const photoPath = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
            const src = profile.photo.startsWith('http') || profile.photo.startsWith('data:')
              ? profile.photo
              : `${base}${photoPath}`;
            return (
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/30 flex-shrink-0">
                <img src={src} alt={profile.pet_name} className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget.closest('div') as HTMLElement).style.display = 'none'; }} />
              </div>
            );
          })()}

          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-1">💚 Saúde de {profile.pet_name}</h2>
            <p className="text-blue-100">
              {profile.breed ? `${profile.breed} • ` : ''}
              {profile.species === 'dog' ? '🐕 Cachorro' : profile.species === 'cat' ? '🐱 Gato' : '🐾 Pet'}
              {profile.sex && ` • ${profile.sex === 'male' ? '♂️ Macho' : '♀️ Fêmea'}`}
              {profile.neutered && ' • Castrado'}
            </p>
          </div>

          <div className="text-right">
            {profile.birth_date && (
              <div className="text-sm text-blue-100">
                {new Date().getFullYear() - new Date(profile.birth_date).getFullYear()} anos
              </div>
            )}
            {summary.latest_weight && (
              <div className="text-lg font-semibold">
                {summary.latest_weight.weight} {summary.latest_weight.weight_unit}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon="💉"
          label="Vacinas"
          value={summary.total_vaccines}
          subtext={summary.upcoming_vaccines > 0 ? `${summary.upcoming_vaccines} próximas` : 'Em dia'}
          alert={summary.upcoming_vaccines > 0}
        />
        <StatCard
          icon="💊"
          label="Medicamentos"
          value={summary.active_medications}
          subtext={summary.active_medications > 0 ? 'Em uso' : 'Nenhum'}
        />
        <StatCard
          icon="📅"
          label="Consultas"
          value={summary.upcoming_appointments}
          subtext={summary.upcoming_appointments > 0 ? 'Agendadas' : 'Sem agenda'}
          alert={summary.upcoming_appointments > 0}
        />
        <StatCard
          icon="🔬"
          label="Exames"
          value={summary.total_exams}
          subtext="Realizados"
        />
      </div>

      {/* Alerts Section */}
      {(summary.upcoming_vaccines > 0 || summary.upcoming_appointments > 0 || profile.allergies.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-900 mb-2 flex items-center">
            <span className="mr-2">⚠️</span> Atenção
          </h3>
          <ul className="space-y-1 text-sm text-amber-800">
            {summary.upcoming_vaccines > 0 && (
              <li>• {summary.upcoming_vaccines} vacina(s) próxima(s) do vencimento</li>
            )}
            {summary.upcoming_appointments > 0 && (
              <li>• {summary.upcoming_appointments} consulta(s) agendada(s)</li>
            )}
            {profile.allergies.length > 0 && (
              <li>• {profile.allergies.length} alergia(s) registrada(s)</li>
            )}
          </ul>
        </div>
      )}

      {/* Upcoming Vaccines */}
      {upcomingVaccines.length > 0 && (
        <div className="bg-white rounded-[24px] shadow-premium border border-slate-100 p-6 overflow-hidden">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 flex items-center">
            <span className="mr-2 text-2xl">💉</span> Próximas Vacinas
          </h3>
          <div className="space-y-3">
            {upcomingVaccines.map(vaccine => (
              <div key={vaccine.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div>
                  <div className="font-bold text-slate-800">{vaccine.vaccine_name}</div>
                  <div className="text-[13px] font-medium text-slate-500 mt-1">
                    {new Date(vaccine.next_dose_date!).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="text-sm text-brand-DEFAULT bg-brand-DEFAULT/10 px-3 py-1.5 rounded-full font-bold self-start sm:self-auto mt-2 sm:mt-0">
                  {Math.ceil((new Date(vaccine.next_dose_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} dias
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Medications */}
      {activeMeds.length > 0 && (
        <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="mr-2">💊</span> Medicamentos Ativos
          </h3>
          <div className="space-y-3">
            {activeMeds.map(med => (
              <div key={med.id} className="p-4 bg-purple-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{med.medication_name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {med.dosage} • {med.frequency}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {med.reason}
                    </div>
                  </div>
                  {med.reminders_enabled && (
                    <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded">
                      🔔 Lembretes
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Appointments */}
      {upcomingAppts.length > 0 && (
        <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="mr-2">📅</span> Próximas Consultas
          </h3>
          <div className="space-y-3">
            {upcomingAppts.map(appt => (
              <div key={appt.id} className="p-4 bg-green-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{appt.reason}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {new Date(appt.date).toLocaleDateString('pt-BR')}
                      {appt.time && ` às ${appt.time}`}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {appt.clinic_name} • Dr(a). {appt.veterinarian}
                    </div>
                  </div>
                  {appt.clinic_phone && (
                    <a
                      href={`tel:${appt.clinic_phone}`}
                      className="text-sm text-green-600 hover:text-green-800"
                    >
                      📞 Ligar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allergies Warning */}
      {profile.allergies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-2 flex items-center">
            <span className="mr-2">🚨</span> Alergias
          </h3>
          <ul className="space-y-2">
            {profile.allergies.map(allergy => (
              <li key={allergy.id} className="text-sm text-red-800">
                <span className="font-medium">{allergy.allergen}</span>
                {' - '}
                {allergy.symptoms}
                {allergy.severity === 'severe' && ' ⚠️ SEVERA'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Chronic Conditions */}
      {profile.chronic_conditions.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="font-semibold text-orange-900 mb-2 flex items-center">
            <span className="mr-2">📋</span> Condições Crônicas
          </h3>
          <ul className="space-y-2">
            {profile.chronic_conditions.map(condition => (
              <li key={condition.id} className="text-sm text-orange-800">
                <span className="font-medium">{condition.condition_name}</span>
                {' - '}
                {condition.treatment}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Emergency Contacts */}
      <div className="bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 p-6 overflow-hidden">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <span className="mr-2">📞</span> Veterinários
        </h3>
        <div className="space-y-3">
          {profile.primary_vet.name && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">🏥 Veterinário Principal</div>
              <div className="text-sm text-gray-600 mt-1">
                Dr(a). {profile.primary_vet.name} • {profile.primary_vet.clinic}
              </div>
              <a
                href={`tel:${profile.primary_vet.phone}`}
                className="text-sm text-[#0056D2] hover:text-[#003889] mt-1 inline-block"
              >
                📞 {profile.primary_vet.phone}
              </a>
            </div>
          )}
          {profile.emergency_vet?.name && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="font-medium">🚨 Emergência 24h</div>
              <div className="text-sm text-gray-600 mt-1">
                Dr(a). {profile.emergency_vet.name} • {profile.emergency_vet.clinic}
              </div>
              <a
                href={`tel:${profile.emergency_vet.phone}`}
                className="text-sm text-red-600 hover:text-red-800 mt-1 inline-block"
              >
                📞 {profile.emergency_vet.phone}
              </a>
            </div>
          )}
        </div>
      </div>

        {/* Automation Info Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="text-5xl">✨</div>
          <div className="flex-1">
            <h3 className="font-bold text-emerald-900 mb-1">
              Sistema Automático Ativado
            </h3>
            <p className="text-sm text-emerald-700">
              O sistema detecta automaticamente quando você está em clínicas e petshops.
              Vai aparecer na hora certa para registrar tudo! 🎯
            </p>
          </div>
        </div>
      </div>

      {/* Share Medical History */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-purple-900 mb-1 flex items-center gap-2">
              <span className="text-2xl">📱</span>
              Compartilhar Histórico com Veterinário
            </h3>
            <p className="text-sm text-purple-700">
              Gere um QR code temporário para o veterinário acessar todo o histórico médico de {profile.pet_name}
            </p>
          </div>
          <button
            onClick={() => setShowQRShare(!showQRShare)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition ml-4"
          >
            {showQRShare ? '✕ Fechar' : '🎯 Gerar QR Code'}
          </button>
        </div>

        {showQRShare && (
          <div className="mt-6">
            <PetShareExportPanel
              pet={profile}
              vaccines={profile.vaccines}
              petEvents={[]}
              documents={[]}
              parasiteControls={profile.parasite_controls}
              groomingRecords={profile.grooming_records}
            />
          </div>
        )}
      </div>

      {/* View All Links */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <a href={`/health/${petId}/vaccines`} className="text-[#0056D2] hover:underline">
            Ver Todas Vacinas →
          </a>
          <a href={`/health/${petId}/prescriptions`} className="text-[#0056D2] hover:underline">
            Ver Medicamentos →
          </a>
          <a href={`/health/${petId}/appointments`} className="text-[#0056D2] hover:underline">
            Ver Consultas →
          </a>
          <a href={`/health/${petId}/exams`} className="text-[#0056D2] hover:underline">
            Ver Exames →
          </a>
        </div>
      </div>

      {/* ClinicVisitDetector removido — sem geolocalização (nova estratégia 2026-02) */}
    </div>
  );
}

// Helper Components
function StatCard({ icon, label, value, subtext, alert }: {
  icon: string;
  label: string;
  value: number;
  subtext: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-[20px] shadow-premium border border-slate-100 p-5 transition-transform hover:scale-[1.02] ${alert ? 'ring-2 ring-amber-400/60 shadow-amber-500/10' : ''} overflow-hidden`}>
      <div className="text-3xl sm:text-4xl mb-3 drop-shadow-sm">{icon}</div>
      <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mt-1">{label}</div>
      <div className="text-xs text-slate-400 mt-1.5 font-medium">{subtext}</div>
    </div>
  );
}

function ActionButton({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-xs text-center font-medium">{label}</div>
    </a>
  );
}
