import type { Metadata } from 'next';
import CuidarClient from './CuidarClient';

type PetInfo = {
  pet_id: string;
  pet_name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  owner_name: string;
};

async function fetchPetInfo(token: string): Promise<PetInfo | null> {
  try {
    const base = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:8000';
    const res = await fetch(`${base}/pets/join/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<PetInfo>;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const pet = await fetchPetInfo(token);
  if (!pet) return { title: 'Convite PETMOL 🐾' };

  const title = `${pet.owner_name} te convidou para cuidar de ${pet.pet_name} 🐾`;
  const description = `Clique para confirmar que você vai cuidar de ${pet.pet_name} e receber alertas se ele sumir.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: pet.photo_url ? [{ url: pet.photo_url, width: 800, height: 800, alt: pet.pet_name }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: pet.photo_url ? [pet.photo_url] : [],
    },
  };
}

export default async function CuidarPage(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pet = await fetchPetInfo(token);
  return <CuidarClient token={token} initial={pet} />;
}
