import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import FunnelCTAs from './FunnelCTAs';

const getPetPhotoSrc = (photoPath?: string): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('http') || photoPath.startsWith('data:')) return photoPath;
  const normalized = photoPath.replace(/^\/+/, '');
  if (normalized.startsWith('uploads/')) return `/${normalized}`;
  return `/uploads/${normalized}`;
};

interface RGData {
  pet_public_id: string;
  pet_name: string;
  pet_species: string;
  pet_breed?: string;
  pet_birth_date?: string;
  pet_photo_url?: string;
  template: string;
  is_public: boolean;
  view_count: number;
  created_at: string;
}

async function getRGData(id: string): Promise<RGData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/rg/${id}`, {
      cache: 'no-store', // Always fetch fresh data
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching RG:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getRGData(id);

  if (!data) {
    return {
      title: 'RG não encontrado - PETMOL',
    };
  }

  return {
    title: `${data.pet_name} - Carteirinha Digital | PETMOL`,
    description: `Conheça ${data.pet_name}! ${data.pet_species === 'dog' ? 'Cachorro' : data.pet_species === 'cat' ? 'Gato' : 'Pet'} com carteirinha digital na PETMOL.`,
    openGraph: {
      title: `🐾 ${data.pet_name}`,
      description: `Carteirinha Digital - ${data.pet_species === 'dog' ? 'Cachorro' : data.pet_species === 'cat' ? 'Gato' : 'Pet'}`,
      images: data.pet_photo_url ? [getPetPhotoSrc(data.pet_photo_url) || ''] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `🐾 ${data.pet_name}`,
      description: 'Carteirinha Digital PETMOL',
    },
  };
}

export default async function PublicRGPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getRGData(id);

  if (!data) {
    notFound();
  }

  const petIcon = data.pet_species === 'dog' ? '🐕' : data.pet_species === 'cat' ? '🐱' : '🐾';
  const speciesName = data.pet_species === 'dog' ? 'Cachorro' : data.pet_species === 'cat' ? 'Gato' : 'Pet';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 flex items-center justify-center p-4">
      {/* Premium top bar */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-primary-600 font-semibold text-sm hover:text-primary-700">
            <span>←</span>
            <span>🐾 PETMOL</span>
          </a>
          <span className="text-sm font-medium text-slate-700">Carteirinha Digital</span>
          <span className="text-xs text-slate-400">{data.pet_name}</span>
        </div>
      </div>
      <div className="max-w-2xl w-full mt-14">
        {/* Card Principal */}
        <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden">
          {/* Header com gradiente */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-center relative">
            <div className="absolute top-4 right-4 text-white/20 text-6xl">🐾</div>
            <h1 className="text-white text-4xl font-bold mb-2">CARTEIRINHA DIGITAL</h1>
            <p className="text-purple-100 text-sm">Documento Digital PETMOL</p>
          </div>

          {/* Conteúdo */}
          <div className="p-8">
            {/* Foto e Nome */}
            <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
              {/* Foto circular */}
              <div className="relative">
                <div className="w-40 h-40 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center border-4 border-yellow-400 shadow-lg">
                  {data.pet_photo_url ? (
                    <img
                      src={getPetPhotoSrc(data.pet_photo_url) || ''}
                      alt={data.pet_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-6xl">{petIcon}</span>
                  )}
                </div>
                {/* Selo Digital */}
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-purple-600 to-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  DIGITAL
                </div>
              </div>

              {/* Informações */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-4xl font-bold text-gray-900 mb-3">{data.pet_name}</h2>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <span className="text-gray-600 font-semibold">ESPÉCIE:</span>
                    <span className="text-gray-900">{petIcon} {speciesName}</span>
                  </div>
                  
                  {data.pet_breed && (
                    <div className="flex items-center gap-2 justify-center md:justify-start">
                      <span className="text-gray-600 font-semibold">RAÇA:</span>
                      <span className="text-gray-900">{data.pet_breed}</span>
                    </div>
                  )}
                  
                  {data.pet_birth_date && (
                    <div className="flex items-center gap-2 justify-center md:justify-start">
                      <span className="text-gray-600 font-semibold">NASCIMENTO:</span>
                      <span className="text-gray-900">
                        {new Date(data.pet_birth_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Linha divisória */}
            <div className="border-t-2 border-gray-200 my-6"></div>

            {/* QR Code */}
            <div className="text-center mb-6">
              <div className="inline-block bg-gray-100 p-6 rounded-2xl border-2 border-gray-300">
                <div className="text-gray-400 text-sm mb-2">QR CODE</div>
                <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-6xl">📱</span>
                </div>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                Escaneie para ver o perfil completo
              </p>
            </div>

            {/* Estatísticas */}
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <div className="text-purple-600 text-sm font-semibold">
                👁️ {data.view_count} visualizações
              </div>
              <div className="text-gray-500 text-xs mt-1">
                Criado em {new Date(data.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>

            {/* CTA Funnel — Motor de Intenção */}
            <FunnelCTAs petPublicId={data.pet_public_id} petName={data.pet_name} />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-gray-600 text-sm">
          <p>petmol.com • Sua carteirinha digital</p>
        </div>
      </div>
    </div>
  );
}
