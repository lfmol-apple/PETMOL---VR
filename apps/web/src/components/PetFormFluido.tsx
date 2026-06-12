'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, Save } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { PetSpecies } from '@/lib/petHealth';
import { localTodayISO } from '@/lib/localDate';

type CropPoint = { x: number; y: number };
type CropArea = { x: number; y: number; width: number; height: number };

// ============================================================
// LISTAS COMPLETAS DE RAÇAS — FCI + AKC + TICA + GCCF (PT-BR)
// ============================================================

const DOG_BREEDS: string[] = [
  'SRD (Sem Raça Definida)',
  'Affenpinscher',
  'Afghan Hound (Galgo Afegão)',
  'Airedale Terrier',
  'Akita Americano',
  'Akita Japonês',
  'Alano Espanhol',
  'Malamute do Alasca',
  'American Bully',
  'American Pit Bull Terrier',
  'American Staffordshire Terrier',
  'Anatolian Shepherd',
  'Appenzeller Sennenhund',
  'Australian Cattle Dog (Blue Heeler)',
  'Pastor Australiano',
  'Silky Terrier Australiano',
  'Terrier Australiano',
  'Basenji',
  'Basset Hound',
  'Beagle',
  'Bearded Collie',
  'Beauceron',
  'Bedlington Terrier',
  'Pastor Belga Groenendael',
  'Pastor Belga Laekenois',
  'Pastor Belga Malinois',
  'Pastor Belga Tervuren',
  'Berger Picard',
  'Bernese Mountain Dog (Pastor de Berna)',
  'Bichon Frisé',
  'Bloodhound (São Humberto)',
  'Boerboel',
  'Border Collie',
  'Border Terrier',
  'Borzoi (Galgo Russo)',
  'Boston Terrier',
  'Bouvier des Flandres',
  'Boxer',
  'Braco Alemão de Pelo Curto',
  'Braco Alemão de Pelo Duro',
  'Briard',
  'Brittany Spaniel',
  'Brussels Griffon',
  'Bull Terrier',
  'Bull Terrier Miniatura',
  'Bulldog Americano',
  'Bulldog Francês',
  'Bulldog Inglês',
  'Bullmastiff',
  'Cairn Terrier',
  'Cane Corso',
  'Cavalier King Charles Spaniel',
  'Chesapeake Bay Retriever',
  'Chihuahua',
  'Chinese Crested',
  'Chow Chow',
  'Clumber Spaniel',
  'Cocker Spaniel Americano',
  'Cocker Spaniel Inglês',
  'Collie Rough (Lassie)',
  'Collie Smooth',
  'Coonhound',
  'Corgi Cardigan',
  'Corgi Pembroke',
  'Coton de Tuléar',
  'Dachshund (Salsicha) Padrão',
  'Dachshund (Salsicha) Miniatura',
  'Dálmata',
  'Dandie Dinmont Terrier',
  'Deerhound Escocês',
  'Doberman Pinscher',
  'Dogo Argentino',
  'Dogue Alemão',
  'Dogue de Bordeaux',
  'Dogo Canário (Presa Canário)',
  'Elkhound Norueguês',
  'Entlebucher Sennenhund',
  'English Setter',
  'English Springer Spaniel',
  'Eurasier',
  'Field Spaniel',
  'Fila Brasileiro',
  'Finnish Lapphund',
  'Finnish Spitz',
  'Flat-Coated Retriever',
  'Fox Terrier de Pelo Duro',
  'Fox Terrier de Pelo Liso',
  'Foxhound Americano',
  'Foxhound Inglês',
  'Galgo Espanhol',
  'Galgo Italiano',
  'Golden Retriever',
  'Gordon Setter',
  'Great Pyrenees (Montanha dos Pirineus)',
  'Greyhound',
  'Harrier',
  'Havanese',
  'Hokkaido',
  'Hovawart',
  'Husky Siberiano',
  'Ibizan Hound (Podenco Ibicenco)',
  'Irish Red and White Setter',
  'Irish Setter',
  'Irish Terrier',
  'Irish Water Spaniel',
  'Irish Wolfhound',
  'Jack Russell Terrier',
  'Kai Ken',
  'Kangal',
  'Keeshond (Spitz Holandês)',
  'Kerry Blue Terrier',
  'Kishu',
  'Komondor',
  'Korean Jindo',
  'Kuvasz',
  'Labrador Retriever',
  'Labradoodle',
  'Lagotto Romagnolo',
  'Lakeland Terrier',
  'Leonberger',
  'Lhasa Apso',
  'Löwchen',
  'Maltês',
  'Manchester Terrier',
  'Mastiff Inglês',
  'Mastiff Napolitano',
  'Mastiff Tibetano',
  'Miniature Pinscher',
  'Miniature Schnauzer',
  'Mudi',
  'Newfoundland (Terra Nova)',
  'Norfolk Terrier',
  'Norwich Terrier',
  'Nova Scotia Duck Tolling Retriever',
  'Old English Sheepdog (Bobtail)',
  'Otterhound',
  'Papillon',
  'Parson Russell Terrier',
  'Pekingese',
  'Pharaoh Hound',
  'Pitbull',
  'Plott Hound',
  'Pointer',
  'Pomerânia (Spitz Anão / Lulu da Pomerânia)',
  'Poodle Gigante',
  'Poodle Grande',
  'Poodle Médio',
  'Poodle Miniatura',
  'Poodle Toy',
  'Pudelpointer',
  'Pug',
  'Puli',
  'Pumi',
  'Rat Terrier',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Saint Bernard (São Bernardo)',
  'Saluki',
  'Samoyed',
  'Schipperke',
  'Schnauzer Gigante',
  'Schnauzer Standard',
  'Sealyham Terrier',
  'Shar Pei',
  'Shetland Sheepdog (Sheltie)',
  'Shiba Inu',
  'Shih Tzu',
  'Skye Terrier',
  'Sloughi',
  'Soft Coated Wheaten Terrier',
  'Spaniel Japonês',
  'Spinone Italiano',
  'Spitz Alemão Médio',
  'Spitz Alemão Grande',
  'Spitz Finlandês',
  'Spitz Japonês',
  'Staffordshire Bull Terrier',
  'Sussex Spaniel',
  'Terrier Brasileiro',
  'Tibetan Mastiff',
  'Tibetan Spaniel',
  'Tibetan Terrier',
  'Vizsla (Braco Húngaro)',
  'Weimaraner',
  'Welsh Corgi',
  'Welsh Springer Spaniel',
  'Welsh Terrier',
  'West Highland White Terrier (Westie)',
  'Whippet',
  'Xoloitzcuintli',
  'Yorkshire Terrier',
  'Zuchon',
  'Outro',
];

const CAT_BREEDS: string[] = [
  'SRD (Sem Raça Definida)',
  'Abissínio',
  'American Bobtail',
  'American Curl',
  'American Shorthair',
  'American Wirehair',
  'Angorá Turco',
  'Asiático',
  'Balinês',
  'Bengal',
  'Birmanês (Sagrado da Birmânia)',
  'Bobtail Japonês',
  'Bobtail das Ilhas Curilanas',
  'Bombaim',
  'British Longhair',
  'British Shorthair',
  'Burmês',
  'Burmilla',
  'California Spangled',
  'Chartreux',
  'Chausie',
  'Colorpoint Shorthair',
  'Cornish Rex',
  'Cymric',
  'Devon Rex',
  'Donskoy (Don Sphynx)',
  'Egeu',
  'Egípcio Mau',
  'Exótico (Exotic Shorthair)',
  'German Rex',
  'Havana Brown',
  'Himalaia',
  'Khao Manee',
  'Korat',
  'Kurilian Bobtail',
  'LaPerm',
  'Lykoi',
  'Maine Coon',
  'Manx',
  'Mist Australiano',
  'Munchkin',
  'Nebelung',
  'Norueguês da Floresta',
  'Ocicat',
  'Ojos Azules',
  'Oriental Longhair',
  'Oriental Shorthair',
  'Persa',
  'Peterbald',
  'Pixie-bob',
  'Ragamuffin',
  'Ragdoll',
  'Russian Blue',
  'Russian White',
  'Savannah',
  'Scottish Fold',
  'Scottish Straight',
  'Selkirk Rex',
  'Serengeti',
  'Siamês',
  'Siberiano',
  'Singapura',
  'Snowshoe',
  'Sokoke',
  'Somali',
  'Sphynx (Esfinge)',
  'Thai',
  'Tonquinês',
  'Toyger',
  'Turkish Angora',
  'Turkish Van',
  'York Chocolate',
  'Outro',
];

// Helper para URL de foto
const getPhotoUrl = (p: string | undefined | null): string | null => {
  if (!p) return null;
  if (p.startsWith('data:') || p.startsWith('http')) return p;
  const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  const normalized = p.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${base}${path}`;
};

interface PetFormData {
  name: string;
  species: PetSpecies;
  sex: 'male' | 'female';
  breed?: string;
  breedType?: 'standard' | 'mixed' | 'other' | 'unknown';
  weight?: number;
  weightUnit: 'kg' | 'lb';
  birthDate?: string;
  neutered?: boolean;
  photo?: string | null;
}

interface PetFormFluidoProps {
  onComplete: (data: PetFormData) => void;
  onCancel?: () => void;
  initialData?: Partial<PetFormData>;
}

/**
 * PetFormFluido — Cadastro de pet no onboarding.
 * Layout idêntico ao EditPetModal, com lista completa de raças mundiais.
 */
export function PetFormFluido({ onComplete, onCancel, initialData }: PetFormFluidoProps) {
  const [name, setName]         = useState(initialData?.name || '');
  const [species, setSpecies]   = useState<PetSpecies>(initialData?.species || 'dog');
  const [sex, setSex]           = useState<'male' | 'female'>(initialData?.sex || 'male');
  const [breed, setBreed]       = useState(initialData?.breed || '');
  const [birthDate, setBirthDate] = useState(initialData?.birthDate || '');
  const [weight, setWeight]     = useState<string>(initialData?.weight?.toString() || '');
  const [neutered, setNeutered] = useState(initialData?.neutered || false);
  const [photo, setPhoto]       = useState<string>(initialData?.photo || '');
  const [vetName, setVetName]   = useState('');
  const [vetClinic, setVetClinic] = useState('');
  const [vetPhone, setVetPhone]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [cropError, setCropError]  = useState<string | null>(null);

  // Photo crop
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const [showCropModal, setShowCropModal]           = useState(false);
  const [imageToCrop, setImageToCrop]               = useState<string | null>(null);
  const [crop, setCrop]                             = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom]                             = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels]   = useState<CropArea | null>(null);
  
  const breeds = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : null;

  const onCropComplete = useCallback((_: CropArea, pixels: CropArea) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const createCroppedImage = async (src: string, pixelCrop: CropArea): Promise<Blob> => {
    const image = new Image();
    image.src = src;
    return new Promise((resolve, reject) => {
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas error')); return; }
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;
        ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('blob error')), 'image/jpeg', 0.70);
      };
      image.onerror = () => reject(new Error('load error'));
    });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageToCrop(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    try {
      const blob = await createCroppedImage(imageToCrop, croppedAreaPixels);
      const reader = new FileReader();
      reader.onloadend = () => setPhoto(reader.result as string);
      reader.readAsDataURL(blob);
      setShowCropModal(false);
      setImageToCrop(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      setCropError('Erro ao recortar imagem. Tente novamente.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const data: PetFormData = {
      name: name.trim(),
      species,
      sex,
      breed: breed || undefined,
      breedType: !breed ? 'unknown' : breed.startsWith('SRD') ? 'mixed' : 'standard',
      weight: weight ? parseFloat(weight) : undefined,
      weightUnit: 'kg',
      birthDate: birthDate || undefined,
      neutered,
      photo: photo || undefined,
    };
    localStorage.removeItem('petmol_pet_form_draft');
    onComplete(data);
    setLoading(false);
  };

  return (
    <>
      {/* Título da etapa */}
      <div className="mb-6 text-center">
        <div className="text-4xl mb-2">🐾</div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Dados do seu pet</h2>
        <p className="text-slate-500 text-sm">Preencha as informações abaixo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Foto */}
        <div className="text-center">
          <div className="relative inline-block w-full max-w-sm">
            {getPhotoUrl(photo) ? (
              <img
                src={getPhotoUrl(photo)!}
                alt={name}
                className="w-full h-32 sm:h-40 rounded-xl object-cover mx-auto"
              />
            ) : (
              <div className="w-full h-32 sm:h-40 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mx-auto gap-1">
                <span className="text-4xl">📸</span>
                <span className="text-xs text-gray-400">Foto do pet (opcional)</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 bg-blue-500 hover:bg-[#0056D2] text-white p-2 rounded-full shadow-lg transition"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>
        </div>

        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            🐾 Nome do Pet *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent text-sm sm:text-base"
            placeholder="Como você chama seu pet?"
            autoFocus
          />
        </div>

        {/* Espécie + Sexo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              🐕 Espécie *
            </label>
            <select
              required
              value={species}
              onChange={e => {
                setSpecies(e.target.value as PetSpecies);
                setBreed('');
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
            >
              <option value="dog">🐕 Cachorro</option>
              <option value="cat">🐱 Gato</option>
              <option value="bird">🦜 Pássaro</option>
              <option value="fish">🐠 Peixe</option>
              <option value="rabbit">🐰 Coelho</option>
              <option value="hamster">🐹 Hamster</option>
              <option value="other">🐾 Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ♂️♀️ Sexo *
            </label>
            <select
              required
              value={sex}
              onChange={e => setSex(e.target.value as 'male' | 'female')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
            >
              <option value="male">♂️ Macho</option>
              <option value="female">♀️ Fêmea</option>
            </select>
          </div>
        </div>

        {/* Raça */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            🎯 Raça
          </label>
          {breeds ? (
            <select
              value={breed}
              onChange={e => setBreed(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
            >
              <option value="">Selecione a raça...</option>
              {breeds.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={breed}
              onChange={e => setBreed(e.target.value)}
              placeholder="Digite a raça ou deixe em branco"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
            />
          )}
        </div>

        {/* Data de Nascimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            📅 Data de Nascimento
          </label>
          <input
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
            max={localTodayISO()}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
          />
        </div>

        {/* Veterinário de Confiança */}
        <div className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👨‍⚕️</span>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Veterinário de Confiança</h3>
              <p className="text-xs text-gray-500">Configure para acesso rápido em emergências</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">👤 Nome do Veterinário</label>
              <input
                type="text"
                value={vetName}
                onChange={e => setVetName(e.target.value)}
                placeholder="Ex: Dr. Bruno Reis"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">🏥 Clínica</label>
              <input
                type="text"
                value={vetClinic}
                onChange={e => setVetClinic(e.target.value)}
                placeholder="Ex: Clínica Veterinária PetCare"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">📱 Telefone/WhatsApp</label>
              <input
                type="tel"
                value={vetPhone}
                onChange={e => setVetPhone(e.target.value)}
                placeholder="Ex: (31) 99999-9999"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm bg-white"
              />
            </div>
            <div className="bg-blue-100 border border-blue-300 rounded-lg p-2">
              <p className="text-xs text-blue-800">
                💡 <strong>Opcional mas recomendado!</strong> Você poderá contatar rapidamente em caso de emergência.
              </p>
            </div>
          </div>
        </div>

        {/* Peso + Castrado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ⚖️ Peso Atual (kg)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="Ex: 12.5"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] text-sm sm:text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ✂️ Castrado?
            </label>
            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-4 py-3 h-[50px]">
              <span className="text-sm text-gray-700">
                {neutered ? '✅ Sim' : '❌ Não'}
              </span>
              <button
                type="button"
                onClick={() => setNeutered(v => !v)}
                className={`w-12 h-7 rounded-full p-1 transition-colors ${neutered ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div
                  className="h-5 w-5 bg-white rounded-full shadow transition-transform"
                  style={{ transform: neutered ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-[15px] font-semibold text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 py-3.5 rounded-2xl bg-brand-DEFAULT text-white text-[15px] font-semibold active:scale-[0.98] transition-all disabled:opacity-50 disabled:bg-slate-400 shadow-md shadow-brand-DEFAULT/20 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {loading ? 'Salvando...' : 'Concluir cadastro'}
          </button>
        </div>
      </form>

      {/* Modal de Crop de foto */}
      {showCropModal && imageToCrop && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 max-w-2xl w-full max-h-[95vh] overflow-y-auto overflow-hidden">
            <div className="bg-gradient-to-r from-[#0066ff] to-cyan-500 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
              <h3 className="text-lg sm:text-xl font-bold">✂️ Ajustar Foto do Pet</h3>
              <p className="text-xs sm:text-sm text-blue-100 mt-1">
                Dê zoom e mova a foto para enquadrar perfeitamente
              </p>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Área do Cropper */}
              <div className="relative w-full h-64 sm:h-80 bg-black rounded-xl overflow-hidden border-4 border-blue-500">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  style={{
                    containerStyle: { background: '#000' },
                    cropAreaStyle: { border: '3px solid #3b82f6' },
                  }}
                />
              </div>

              {/* Zoom */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  🔍 Zoom: {zoom.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Botões */}
              {cropError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700 flex items-center gap-2">
                  <span>⚠️</span>
                  <span className="flex-1">{cropError}</span>
                  <button type="button" onClick={() => setCropError(null)} className="text-xs font-bold text-rose-600 underline">OK</button>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCropModal(false); setImageToCrop(null); setCrop({ x: 0, y: 0 }); setZoom(1); }}
                  className="flex-1 px-4 py-3 border-2 border-gray-400 text-gray-700 rounded-xl hover:bg-gray-100 font-bold"
                >
                  ✖️ Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCropConfirm}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold shadow-xl"
                >
                  ✅ Usar esta foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
