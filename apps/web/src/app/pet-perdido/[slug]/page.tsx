import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';

type PublicMissingPet = {
  id: string;
  slug: string;
  pet_name: string;
  species: string | null;
  breed: string | null;
  characteristics: string | null;
  region: string | null;
  missing_date: string | null;
  missing_time: string | null;
  photo_url: string | null;
  status: string;
  created_at: string | null;
  found_at: string | null;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const SERVER_API_BASE_URL = API_BASE_URL.startsWith('http')
  ? API_BASE_URL
  : `${SITE_URL.replace(/\/$/, '')}${API_BASE_URL}`;

async function getPublicPet(slug: string): Promise<PublicMissingPet | null> {
  try {
    const res = await fetch(`${SERVER_API_BASE_URL}/missing-pets/public/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'Data não informada';
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

type PetPerdidoPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PetPerdidoPageProps): Promise<Metadata> {
  const { slug } = await params;
  const pet = await getPublicPet(slug);
  if (!pet) {
    return {
      title: 'Pet perdido | PETMOL',
      description: 'Alerta público de pet perdido no PETMOL.',
    };
  }
  const region = pet.region ? ` em ${pet.region}` : '';
  return {
    title: `${pet.pet_name} perdido${region} | PETMOL`,
    description: `Ajude a encontrar ${pet.pet_name}${region}. Alerta público de pet perdido no PETMOL.`,
    openGraph: {
      title: `${pet.pet_name} perdido${region}`,
      description: `Ajude a encontrar ${pet.pet_name}${region}.`,
      type: 'article',
      images: pet.photo_url ? [resolvePetPhotoUrl(pet.photo_url)].filter(Boolean) as string[] : undefined,
    },
  };
}

export default async function PetPerdidoPage({ params }: PetPerdidoPageProps) {
  const { slug } = await params;
  const pet = await getPublicPet(slug);
  if (!pet) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
        <div className="mx-auto max-w-2xl rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-black">Alerta não encontrado</h1>
          <p className="mt-2 text-slate-600">Este link pode ter expirado ou sido removido.</p>
          <Link href="/achei-um-pet" className="mt-5 inline-flex rounded-full bg-blue-600 px-5 py-3 font-black text-white">Achei um pet</Link>
        </div>
      </main>
    );
  }

  const photoUrl = resolvePetPhotoUrl(pet.photo_url);
  const found = pet.status === 'found';

  return (
    <main className="min-h-screen bg-[#F7FAFC] text-slate-950">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-2xl font-black text-blue-700">Petmol</Link>
          <Link href="/achei-um-pet" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">Tenho informações</Link>
        </div>

        <div className="grid overflow-hidden rounded-[32px] bg-white shadow-sm ring-1 ring-slate-200 md:grid-cols-[1.05fr_0.95fr]">
          <div className="relative min-h-[360px] bg-slate-900">
            {photoUrl ? (
              <img src={photoUrl} alt={pet.pet_name} className="h-full min-h-[360px] w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center bg-slate-800 text-lg font-black text-white">Sem foto</div>
            )}
            <div className="absolute left-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
              {found ? 'Encontrado' : 'Desaparecido'}
            </div>
          </div>

          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-red-600">Pet perdido</p>
            <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">{pet.pet_name}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {pet.species && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{pet.species === 'dog' ? 'Cachorro' : pet.species === 'cat' ? 'Gato' : pet.species}</span>}
              {pet.breed && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{pet.breed}</span>}
              {pet.region && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{pet.region}</span>}
            </div>

            <dl className="mt-6 grid gap-4">
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Desapareceu em</dt>
                <dd className="mt-1 text-lg font-bold">{formatDate(pet.missing_date)}{pet.missing_time ? ` às ${pet.missing_time}` : ''}</dd>
              </div>
              {pet.characteristics && (
                <div>
                  <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Características</dt>
                  <dd className="mt-1 leading-7 text-slate-700">{pet.characteristics}</dd>
                </div>
              )}
            </dl>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href={`/achei-um-pet?id=${encodeURIComponent(pet.id)}`} className="rounded-2xl bg-blue-600 px-5 py-4 text-center text-base font-black text-white">
                Enviar informação
              </Link>
              <Link href="/reportar-pet-perdido" className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center text-base font-black text-slate-700">
                Reportar outro pet
              </Link>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Por privacidade, o contato e o endereço completo do reportante não aparecem nesta página pública.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
