'use client';
import { getToken } from '@/lib/auth-token';
import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { OwnerProfile, saveOwnerProfile } from '@/lib/ownerProfile';
import { PetHealthProfile, createHealthProfile } from '@/lib/petHealth';
import { PetSpecies } from '@/lib/petTaxonomy';
import { createTutor, updateTutor } from '@/lib/tutorApi';
import { isPetProfileCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { PetFormFluido } from './PetFormFluido';

interface OnboardingWizardProps {
  onComplete: () => void;
  initialStep?: 1 | 2;
}

// Complete dog breeds list (FCI + AKC recognized)
const DOG_BREEDS_PT = [
  'SRD (Sem Raça Definida)',
  'Affenpinscher',
  'Airedale Terrier',
  'Akita',
  'Akita Americano',
  'Malamute do Alasca',
  'Buhund Norueguês',
  'Pastor Alemão',
  'Pastor Australiano',
  'Terrier Australiano',
  'Basenji',
  'Basset Hound',
  'Beagle',
  'Bearded Collie',
  'Bedlington Terrier',
  'Pastor Belga (Groenendael)',
  'Pastor Belga (Laekenois)',
  'Pastor Belga (Malinois)',
  'Pastor Belga (Tervuren)',
  'Bernese Mountain Dog',
  'Bichon Frisé',
  'Bloodhound',
  'Border Collie',
  'Border Terrier',
  'Borzoi',
  'Boston Terrier',
  'Bouvier des Flandres',
  'Boxer',
  'Briard',
  'Brittany',
  'Brussels Griffon',
  'Bull Terrier',
  'Bulldog',
  'Bulldog Francês',
  'Bullmastiff',
  'Cairn Terrier',
  'Cane Corso',
  'Cavalier King Charles',
  'Chihuahua',
  'Chow Chow',
  'Clumber Spaniel',
  'Cocker Spaniel Americano',
  'Cocker Spaniel Inglês',
  'Collie',
  'Coonhound',
  'Corgi Cardigan',
  'Corgi Pembroke',
  'Coton de Tuléar',
  'Dachshund (Salsicha)',
  'Dálmata',
  'Doberman',
  'Dogo Argentino',
  'Dogue Alemão',
  'English Setter',
  'English Springer Spaniel',
  'Field Spaniel',
  'Fila Brasileiro',
  'Finnish Spitz',
  'Fox Terrier',
  'Foxhound Americano',
  'Foxhound Inglês',
  'Galgo Espanhol',
  'Golden Retriever',
  'Gordon Setter',
  'Great Pyrenees',
  'Greyhound',
  'Harrier',
  'Havanese',
  'Husky Siberiano',
  'Ibizan Hound',
  'Irish Setter',
  'Irish Terrier',
  'Irish Water Spaniel',
  'Irish Wolfhound',
  'Jack Russell Terrier',
  'Keeshond',
  'Kerry Blue Terrier',
  'Komondor',
  'Kuvasz',
  'Labrador Retriever',
  'Lakeland Terrier',
  'Leonberger',
  'Lhasa Apso',
  'Löwchen',
  'Maltês',
  'Manchester Terrier',
  'Mastiff',
  'Mastim dos Pireneus',
  'Mastim Tibetano',
  'Miniature Pinscher',
  'Newfoundland',
  'Norfolk Terrier',
  'Norwich Terrier',
  'Old English Sheepdog',
  'Otterhound',
  'Papillon',
  'Parson Russell Terrier',
  'Pekingese',
  'Pharaoh Hound',
  'Pitbull',
  'Pointer',
  'Pointer Alemão',
  'Pomeranian (Lulu)',
  'Poodle',
  'Poodle Toy',
  'Poodle Miniatura',
  'Poodle Standard',
  'Pug',
  'Puli',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Saint Bernard',
  'Saluki',
  'Samoyed',
  'Schipperke',
  'Schnauzer Gigante',
  'Schnauzer Miniatura',
  'Schnauzer Standard',
  'Scottish Deerhound',
  'Scottish Terrier',
  'Sealyham Terrier',
  'Setter Irlandês',
  'Shar Pei',
  'Shetland Sheepdog',
  'Shiba Inu',
  'Shih Tzu',
  'Silky Terrier',
  'Skye Terrier',
  'Smooth Fox Terrier',
  'Soft Coated Wheaten',
  'Spaniel Japonês',
  'Spinone Italiano',
  'Spitz Alemão',
  'Spitz Finlandês',
  'Staffordshire Bull Terrier',
  'Sussex Spaniel',
  'Teckel',
  'Terrier Brasileiro',
  'Tibetan Spaniel',
  'Tibetan Terrier',
  'Vizsla',
  'Weimaraner',
  'Welsh Corgi',
  'Welsh Springer Spaniel',
  'Welsh Terrier',
  'West Highland White',
  'Whippet',
  'Wire Fox Terrier',
  'Xoloitzcuintli',
  'Yorkshire Terrier',
  'Outro',
];

const DOG_BREEDS_EN = [
  'Mixed Breed',
  'Affenpinscher',
  'Afghan Hound',
  'Airedale Terrier',
  'Akita',
  'Alaskan Malamute',
  'American Bulldog',
  'American Eskimo Dog',
  'American Foxhound',
  'American Staffordshire',
  'Australian Cattle Dog',
  'Australian Shepherd',
  'Australian Terrier',
  'Basenji',
  'Basset Hound',
  'Beagle',
  'Bearded Collie',
  'Bedlington Terrier',
  'Belgian Malinois',
  'Belgian Sheepdog',
  'Belgian Tervuren',
  'Bernese Mountain Dog',
  'Bichon Frise',
  'Black Russian Terrier',
  'Bloodhound',
  'Border Collie',
  'Border Terrier',
  'Borzoi',
  'Boston Terrier',
  'Bouvier des Flandres',
  'Boxer',
  'Briard',
  'Brittany',
  'Brussels Griffon',
  'Bull Terrier',
  'Bulldog',
  'Bullmastiff',
  'Cairn Terrier',
  'Cane Corso',
  'Cavalier King Charles',
  'Chesapeake Bay Retriever',
  'Chihuahua',
  'Chinese Crested',
  'Chow Chow',
  'Cocker Spaniel',
  'Collie',
  'Coonhound',
  'Corgi',
  'Coton de Tulear',
  'Dachshund',
  'Dalmatian',
  'Doberman Pinscher',
  'Dogo Argentino',
  'English Bulldog',
  'English Setter',
  'English Springer Spaniel',
  'Field Spaniel',
  'Finnish Spitz',
  'Fox Terrier',
  'Foxhound',
  'French Bulldog',
  'German Shepherd',
  'German Shorthaired Pointer',
  'German Wirehaired Pointer',
  'Giant Schnauzer',
  'Golden Retriever',
  'Gordon Setter',
  'Great Dane',
  'Great Pyrenees',
  'Greyhound',
  'Havanese',
  'Ibizan Hound',
  'Irish Setter',
  'Irish Terrier',
  'Irish Wolfhound',
  'Italian Greyhound',
  'Jack Russell Terrier',
  'Japanese Chin',
  'Keeshond',
  'Kerry Blue Terrier',
  'Komondor',
  'Kuvasz',
  'Labrador Retriever',
  'Lakeland Terrier',
  'Leonberger',
  'Lhasa Apso',
  'Maltese',
  'Manchester Terrier',
  'Mastiff',
  'Miniature Pinscher',
  'Miniature Schnauzer',
  'Newfoundland',
  'Norfolk Terrier',
  'Norwegian Elkhound',
  'Norwich Terrier',
  'Old English Sheepdog',
  'Otterhound',
  'Papillon',
  'Pekingese',
  'Pharaoh Hound',
  'Pitbull',
  'Pointer',
  'Pomeranian',
  'Poodle',
  'Pug',
  'Puli',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Saint Bernard',
  'Saluki',
  'Samoyed',
  'Schipperke',
  'Scottish Terrier',
  'Shar Pei',
  'Shetland Sheepdog',
  'Shiba Inu',
  'Shih Tzu',
  'Siberian Husky',
  'Silky Terrier',
  'Smooth Fox Terrier',
  'Soft Coated Wheaten',
  'Spanish Water Dog',
  'Spinone Italiano',
  'Staffordshire Bull Terrier',
  'Standard Schnauzer',
  'Sussex Spaniel',
  'Tibetan Mastiff',
  'Tibetan Spaniel',
  'Tibetan Terrier',
  'Vizsla',
  'Weimaraner',
  'Welsh Springer Spaniel',
  'Welsh Terrier',
  'West Highland White',
  'Whippet',
  'Wire Fox Terrier',
  'Xoloitzcuintli',
  'Yorkshire Terrier',
  'Other',
];

const CAT_BREEDS_PT = [
  'SRD (Sem Raça Definida)',
  'Abissínio',
  'American Curl',
  'American Shorthair',
  'American Wirehair',
  'Angorá Turco',
  'Asiático',
  'Balinês',
  'Bengal',
  'Birmanês',
  'Bobtail Americano',
  'Bobtail Japonês',
  'Bombaim',
  'British Longhair',
  'British Shorthair',
  'Burmês',
  'Burmilla',
  'California Spangled',
  'Ceilão',
  'Chartreux',
  'Chausie',
  'Colorpoint Shorthair',
  'Cornish Rex',
  'Curl Americano',
  'Cymric',
  'Devon Rex',
  'Donskoy',
  'Egeu',
  'Egípcio Mau',
  'Exótico',
  'German Rex',
  'Havana Brown',
  'Himalaia',
  'Khao Manee',
  'Korat',
  'Kurilian Bobtail',
  'LaPerm',
  'Maine Coon',
  'Manx',
  'Mau Egípcio',
  'Mist Australiano',
  'Munchkin',
  'Nebelung',
  'Norueguês da Floresta',
  'Ocicat',
  'Ojos Azules',
  'Oriental',
  'Persa',
  'Peterbald',
  'Pixie-bob',
  'Ragamuffin',
  'Ragdoll',
  'Russian Blue',
  'Russian White',
  'Sagrado da Birmânia',
  'Savannah',
  'Scottish Fold',
  'Selkirk Rex',
  'Siamês',
  'Siberiano',
  'Singapura',
  'Snowshoe',
  'Sokoke',
  'Somali',
  'Sphynx',
  'Thai',
  'Tonquinês',
  'Toyger',
  'Turkish Angora',
  'Turkish Van',
  'Van Turco',
  'York Chocolate',
  'Outro',
];

const CAT_BREEDS_EN = [
  'Mixed Breed',
  'Abyssinian',
  'American Bobtail',
  'American Curl',
  'American Shorthair',
  'American Wirehair',
  'Balinese',
  'Bengal',
  'Birman',
  'Bombay',
  'British Longhair',
  'British Shorthair',
  'Burmese',
  'Burmilla',
  'California Spangled',
  'Chartreux',
  'Chausie',
  'Colorpoint Shorthair',
  'Cornish Rex',
  'Cymric',
  'Devon Rex',
  'Donskoy',
  'Egyptian Mau',
  'European Burmese',
  'Exotic Shorthair',
  'German Rex',
  'Havana Brown',
  'Himalayan',
  'Japanese Bobtail',
  'Khao Manee',
  'Korat',
  'Kurilian Bobtail',
  'LaPerm',
  'Maine Coon',
  'Manx',
  'Munchkin',
  'Nebelung',
  'Norwegian Forest Cat',
  'Ocicat',
  'Ojos Azules',
  'Oriental',
  'Persian',
  'Peterbald',
  'Pixie-bob',
  'Ragamuffin',
  'Ragdoll',
  'Russian Blue',
  'Russian White',
  'Savannah',
  'Scottish Fold',
  'Selkirk Rex',
  'Siamese',
  'Siberian',
  'Singapura',
  'Snowshoe',
  'Sokoke',
  'Somali',
  'Sphynx',
  'Thai',
  'Tonkinese',
  'Toyger',
  'Turkish Angora',
  'Turkish Van',
  'York Chocolate',
  'Other',
];

// Capitalize first letter
const capitalizeFirst = (text: string): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Validate email
const validateEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// Format phone number with mask
const formatPhone = (value: string, country: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (country === '+55') { // Brazil
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    }
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  } else if (country === '+1') { // USA/Canada
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  } else { // Generic
    return numbers;
  }
};

// Validate phone
const validatePhone = (phone: string, country: string): boolean => {
  const numbers = phone.replace(/\D/g, '');
  
  if (country === '+55') return numbers.length === 10 || numbers.length === 11;
  if (country === '+1') return numbers.length === 10;
  return numbers.length >= 8 && numbers.length <= 15;
};

export function OnboardingWizard({ onComplete, initialStep = 1 }: OnboardingWizardProps) {
  const { t, geo } = useI18n();
  const isPt = geo.locale.startsWith('pt');
  
  const [step, setStep] = useState(initialStep);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Owner data
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+55');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(true);
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [country, setCountry] = useState('Brasil');
  const [showAddress, setShowAddress] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  // Pré-preencher dados do tutor logado
  useEffect(() => {
    const prefill = async () => {
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
        const token = getToken();
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const me = await res.json();
        if (me.name)         setOwnerName(me.name);
        if (me.email)        setOwnerEmail(me.email);
        if (me.phone)        setOwnerPhone(me.phone.replace(/^\+55\s?/, '').replace(/^\+\d+\s?/, ''));
        if (me.postal_code)  setCep(me.postal_code);
        if (me.street)       setStreet(me.street);
        if (me.number)       setNumber(String(me.number));
        if (me.complement)   setComplement(me.complement);
        if (me.neighborhood) setNeighborhood(me.neighborhood);
        if (me.city)         setCity(me.city);
        if (me.state)        setStateUf(me.state);
        if (me.country)      setCountry(me.country);
      } catch {
        showToast('Erro ao sincronizar');
      }
    };
    prefill();
  }, []);
  
  // Validation states
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [medicalDisclaimerAccepted, setMedicalDisclaimerAccepted] = useState(false);
  const [firstValuePetName, setFirstValuePetName] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }
  
  // Pet data
  const [petName, setPetName] = useState('');
  const [petSpecies, setPetSpecies] = useState<PetSpecies>('dog');
  const [petBreed, setPetBreed] = useState('');
  const [petBirthDate, setPetBirthDate] = useState('');
  const [petSex, setPetSex] = useState<'male' | 'female'>('male');
  const [petNeutered, setPetNeutered] = useState<boolean>(false);
  const [petWeight, setPetWeight] = useState('');
  const [petWeightUnit, setPetWeightUnit] = useState<'kg' | 'lb'>(
    geo.units === 'imperial' ? 'lb' : 'kg'
  );
  const [petPhoto, setPetPhoto] = useState<string>('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      showToast(t('onboarding.validation.photo_too_large'));
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para no máximo 400x400 mantendo proporção
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 400;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Converter para base64 com qualidade reduzida (0.7 = 70%)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        console.log('Imagem comprimida (OnboardingWizard):', {
          larguraOriginal: img.width,
          alturaOriginal: img.height,
          larguraFinal: width,
          alturaFinal: height,
          tamanhoBase64: compressedBase64.length,
          tamanhoKB: (compressedBase64.length / 1024).toFixed(2)
        });
        
        // Base64 não deve ultrapassar ~100KB
        if (compressedBase64.length > 150000) {
          showToast(`Imagem muito grande: ${(compressedBase64.length / 1024).toFixed(0)}KB. Tente uma foto menor.`);
          return;
        }
        
        setPetPhoto(compressedBase64);
        setPhotoPreview(compressedBase64);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCepLookup = async () => {
    if (countryCode !== '+55') return;

    const normalized = cep.replace(/\D/g, '');
    if (normalized.length !== 8) {
      if (normalized.length > 0) {
        setCepError(t('onboarding.owner.cep_invalid'));
      }
      return;
    }

    setCepError('');
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
      const data = await response.json();
      if (data?.erro) {
        setCepError(t('onboarding.owner.cep_not_found'));
        setCepLoading(false);
        return;
      }

      setStreet(data.logradouro || '');
      setNeighborhood(data.bairro || '');
      setCity(data.localidade || '');
      setStateUf(data.uf || '');
      setCountry('Brasil');
      setShowAddress(true);
    } catch (error) {
      console.error('CEP lookup failed:', error);
      setCepError(t('onboarding.owner.cep_error'));
    } finally {
      setCepLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    if (ownerEmail && !validateEmail(ownerEmail)) {
      setEmailError(t('onboarding.validation.invalid_email'));
      return;
    }
    
    if (!validatePhone(ownerPhone, countryCode)) {
      setPhoneError(t('onboarding.validation.invalid_phone'));
      return;
    }

    // Save owner profile
    const ownerProfile: OwnerProfile = {
      owner_id: `owner_${Date.now()}`,
      name: ownerName,
      phone: `${countryCode} ${ownerPhone}`,
      whatsapp: ownerWhatsapp,
      email: ownerEmail || undefined,
      address: {
        postal_code: cep || undefined,
        street: street || undefined,
        number: number || undefined,
        complement: complement || undefined,
        neighborhood: neighborhood || undefined,
        city: city || undefined,
        state: stateUf || undefined,
        country: country || undefined,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveOwnerProfile(ownerProfile);

    const tutorPayload = {
      name: ownerName,
      phone: `${countryCode} ${ownerPhone}`,
      email: ownerEmail || undefined,
      whatsapp: ownerWhatsapp,
      postal_code: cep || undefined,
      street: street || undefined,
      number: number || undefined,
      complement: complement || undefined,
      neighborhood: neighborhood || undefined,
      city: city || undefined,
      state: stateUf || undefined,
      country: country || undefined,
    };

    void createTutor(tutorPayload).catch(() => {
      void updateTutor(tutorPayload).catch((error) => {
        console.error('Failed to persist tutor profile:', error);
      });
    });
    localStorage.setItem('petmol_medical_disclaimer_v1', 'true');
    
    // Save pet profile - BOTH localStorage AND API
    const parsedWeight = petWeight ? Number(petWeight.replace(',', '.')) : undefined;

    // Salvar SOMENTE no backend
    const token = getToken();
    if (!token) {
      showToast('Sessão expirada. Faça login novamente.');
      return;
    }

    const petApiPayload = {
      name: petName,
      species: petSpecies,
      breed: petBreed && petBreed !== 'Outro' && petBreed !== 'Other' ? capitalizeFirst(petBreed) : undefined,
      birth_date: petBirthDate || undefined,
      sex: petSex,
      neutered: petNeutered,
      weight_value: parsedWeight,
      photo: petPhoto || undefined,
    };

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(petApiPayload),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar pet');
      }

      const savedPet = await response.json();

      trackV1Metric('pet_created', {
        pet_id: savedPet.id,
        species: petSpecies,
        source: 'onboarding_wizard',
        has_photo: Boolean(petPhoto),
      });

      if (isPetProfileCompleted({
        name: petName,
        species: petSpecies,
        breed: petBreed,
        birth_date: petBirthDate,
        sex: petSex,
        weight: parsedWeight,
        photo: petPhoto,
      })) {
        trackV1Metric('pet_profile_completed', {
          pet_id: savedPet.id,
          source: 'onboarding_wizard',
          has_photo: Boolean(petPhoto),
        });
      }
    } catch (error) {
      console.error('Failed to save pet to API:', error);
      showToast('Erro ao salvar pet. Tente novamente.');
      return;
    }
    
    // Mark as completed
    localStorage.setItem('petmol_onboarding_complete', 'true');
    localStorage.setItem('petmol_activation_pet_created_v1', '1');
    setFirstValuePetName(petName || 'seu pet');
  };

  const handlePetFormComplete = async (data: {
    name: string;
    species: string;
    sex: 'male' | 'female';
    breed?: string;
    breedType?: string;
    weight?: number;
    weightUnit: 'kg' | 'lb';
    birthDate?: string;
    neutered?: boolean;
    photo?: string | null;
  }) => {
    // Save owner profile if step 1 was filled
    if (ownerName && ownerPhone) {
      const ownerProfile: OwnerProfile = {
        owner_id: `owner_${Date.now()}`,
        name: ownerName,
        phone: `${countryCode} ${ownerPhone}`,
        whatsapp: ownerWhatsapp,
        email: ownerEmail || undefined,
        address: {
          postal_code: cep || undefined,
          street: street || undefined,
          number: number || undefined,
          complement: complement || undefined,
          neighborhood: neighborhood || undefined,
          city: city || undefined,
          state: stateUf || undefined,
          country: country || undefined,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveOwnerProfile(ownerProfile);

      const tutorPayload = {
        name: ownerName,
        phone: `${countryCode} ${ownerPhone}`,
        email: ownerEmail || undefined,
        whatsapp: ownerWhatsapp,
        postal_code: cep || undefined,
        street: street || undefined,
        number: number || undefined,
        complement: complement || undefined,
        neighborhood: neighborhood || undefined,
        city: city || undefined,
        state: stateUf || undefined,
        country: country || undefined,
      };

      void createTutor(tutorPayload).catch(() => {
        void updateTutor(tutorPayload).catch((error) => {
          console.error('Failed to persist tutor profile:', error);
        });
      });
      localStorage.setItem('petmol_medical_disclaimer_v1', 'true');
    }

    const token = getToken();
    if (!token) {
      showToast('Sessão expirada. Faça login novamente.');
      return;
    }

    const petApiPayload = {
      name: data.name,
      species: data.species,
      breed: data.breedType === 'unknown' ? undefined : data.breed || undefined,
      birth_date: data.birthDate || undefined,
      sex: data.sex,
      neutered: data.neutered || false,
      weight_value: data.weight ?? undefined,
      photo: data.photo || undefined,
    };

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(petApiPayload),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar pet');
      }
      await response.json().catch(() => null);
    } catch (error) {
      console.error('Failed to save pet to API:', error);
      showToast('Erro ao salvar pet. Tente novamente.');
      return;
    }

    localStorage.setItem('petmol_onboarding_complete', 'true');
    localStorage.setItem('petmol_activation_pet_created_v1', '1');
    setFirstValuePetName(data.name || 'seu pet');
  };

  if (firstValuePetName) {
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-3xl z-[200] overflow-y-auto w-full h-full">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium max-w-md w-full p-8 border border-white/60">
            <h2 className="text-2xl font-black text-slate-900">Hoje com {firstValuePetName}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Primeiros cuidados para revisar agora.</p>
            <div className="mt-5 grid gap-3">
              {['Vacina anual', 'Vermífugo', 'Ração'].map((label) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-800">
                  {label}
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Os intervalos são recomendações gerais. Consulte um veterinário.
            </p>
            <button
              type="button"
              onClick={onComplete}
              className="mt-5 w-full py-4 bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold rounded-xl"
            >
              Entrar no PETMOL
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-3xl z-[200] overflow-y-auto w-full h-full">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[250] px-5 py-3 rounded-2xl bg-rose-50 border border-rose-200 shadow-lg text-sm font-semibold text-rose-800 max-w-sm w-[calc(100%-2rem)] flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="text-[11px] font-bold text-rose-600 underline">OK</button>
        </div>
      )}
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium max-w-2xl w-full p-8 md:p-10 border border-white/60 overflow-hidden">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                {t('pet_form.step', { step, total: 2 })}
              </span>
              <span className="text-sm text-slate-500">50%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary-500 to-blue-500 transition-all duration-500"
                style={{ width: step === 1 ? '50%' : '100%' }}
              />
            </div>
          </div>

          <div>
            {/* Step 1: Owner Info */}
            {step === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <div className="text-5xl mb-4">👋</div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">
                    {t('onboarding.welcome.title')}
                  </h2>
                  <p className="text-slate-600">
                    {t('onboarding.welcome.subtitle')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('onboarding.owner.name_label')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                    placeholder={t('onboarding.owner.name_placeholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('onboarding.owner.phone_label')} *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => {
                        setCountryCode(e.target.value);
                        setOwnerPhone('');
                        setPhoneError('');
                      }}
                      className="w-28 px-3 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                    >
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+351">🇵🇹 +351</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+33">🇫🇷 +33</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+39">🇮🇹 +39</option>
                      <option value="+54">🇦🇷 +54</option>
                      <option value="+52">🇲🇽 +52</option>
                    </select>
                    <div className="flex-1">
                      <input
                        type="tel"
                        required
                        value={ownerPhone}
                        onChange={(e) => {
                          const formatted = formatPhone(e.target.value, countryCode);
                          setOwnerPhone(formatted);
                          setPhoneError('');
                          
                          if (formatted.replace(/\D/g, '').length > 0) {
                            if (!validatePhone(formatted, countryCode)) {
                              setPhoneError(t('onboarding.validation.invalid_phone'));
                            }
                          }
                        }}
                        className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 outline-none transition-all ${
                          phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : 'border-slate-200 focus:border-primary-500 focus:ring-primary-200'
                        }`}
                        placeholder={countryCode === '+55' ? '(11) 99999-9999' : countryCode === '+1' ? '(555) 123-4567' : '123456789'}
                      />
                      {phoneError && (
                        <p className="text-xs text-red-600 mt-1">⚠️ {phoneError}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border-2 border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{t('onboarding.owner.whatsapp_label')}</div>
                    <div className="text-xs text-slate-500">{t('onboarding.owner.whatsapp_hint')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOwnerWhatsapp((v) => !v)}
                    className={`w-14 h-8 rounded-full p-1 transition ${ownerWhatsapp ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <div className={`h-6 w-6 bg-white rounded-full transition ${ownerWhatsapp ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('onboarding.owner.email_label')}
                  </label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => {
                      setOwnerEmail(e.target.value);
                      setEmailError('');
                      
                      if (e.target.value && !validateEmail(e.target.value)) {
                        setEmailError(t('onboarding.validation.invalid_email'));
                      }
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 outline-none transition-all ${
                      emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : 'border-slate-200 focus:border-primary-500 focus:ring-primary-200'
                    }`}
                    placeholder={t('onboarding.owner.email_placeholder')}
                  />
                  {emailError && (
                    <p className="text-xs text-red-600 mt-1">⚠️ {emailError}</p>
                  )}
                </div>

                {/* Endereço — colapsável, opcional */}
                <button
                  type="button"
                  onClick={() => setShowAddress((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-500 hover:border-primary-400 hover:text-slate-700 transition-all"
                >
                  <span>
                    📍 {showAddress ? 'Ocultar endereço' : 'Adicionar endereço'}
                    <span className="ml-1 font-normal text-slate-400">(opcional)</span>
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform ${showAddress ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showAddress && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {t('onboarding.owner.cep_label')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={cep}
                          onChange={(e) => {
                            setCep(e.target.value);
                            setCepError('');
                          }}
                          onBlur={handleCepLookup}
                          className={`flex-1 px-4 py-3 border-2 rounded-xl focus:ring-2 outline-none transition-all ${
                            cepError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : 'border-slate-200 focus:border-primary-500 focus:ring-primary-200'
                          }`}
                          placeholder={t('onboarding.owner.cep_placeholder')}
                        />
                        <button
                          type="button"
                          onClick={handleCepLookup}
                          disabled={cepLoading}
                          className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
                        >
                          {cepLoading ? t('onboarding.owner.cep_loading') : t('onboarding.owner.cep_lookup')}
                        </button>
                      </div>
                      {cepError && <p className="text-xs text-red-600 mt-1">⚠️ {cepError}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.street_label')}
                        </label>
                        <input
                          type="text"
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.street_placeholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.number_label')}
                        </label>
                        <input
                          type="text"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.number_placeholder')}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.complement_label')}
                        </label>
                        <input
                          type="text"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.complement_placeholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.neighborhood_label')}
                        </label>
                        <input
                          type="text"
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.neighborhood_placeholder')}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.city_label')}
                        </label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.city_placeholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.state_label')}
                        </label>
                        <input
                          type="text"
                          value={stateUf}
                          onChange={(e) => setStateUf(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.state_placeholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t('onboarding.owner.country_label')}
                        </label>
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                          placeholder={t('onboarding.owner.country_placeholder')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <label className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 ${medicalDisclaimerAccepted ? 'border-primary-200 bg-primary-50' : 'border-slate-200 bg-white'}`}>
                  <input
                    type="checkbox"
                    checked={medicalDisclaimerAccepted}
                    onChange={(e) => setMedicalDisclaimerAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Os intervalos são recomendações gerais. Consulte um veterinário.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!ownerName || !ownerPhone || !!phoneError || (!!ownerEmail && !!emailError) || !medicalDisclaimerAccepted}
                  className="w-full py-4 bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold rounded-xl hover:shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {t('onboarding.actions.continue')}
                </button>
                <p className="text-center text-xs text-slate-400 mt-2">
                  Você pode completar seu perfil depois, no próprio app.
                </p>
              </div>
            )}

            {/* Step 2: Pet Info - using PetFormFluido */}
            {step === 2 && (
              <PetFormFluido
                onComplete={handlePetFormComplete}
                onCancel={initialStep !== 2 ? () => setStep(1) : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
