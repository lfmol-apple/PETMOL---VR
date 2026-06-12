/**
 * PETMOL i18n System
 * 
 * Simple internationalization without external dependencies.
 * Supports: pt-BR, en, es, fr, it, de-DE, ja-JP, zh-CN, ru-RU, tr-TR
 */

export type Locale = 'pt-BR' | 'en' | 'es' | 'fr' | 'it';
export type UnitSystem = 'metric' | 'imperial';

export interface GeoContext {
  country: string;
  locale: Locale;
  localeLocked: boolean;
  units: UnitSystem;
  pricesEnabled: boolean;
}

// Default context
export const defaultGeoContext: GeoContext = {
  country: 'BR',
  locale: 'pt-BR',
  localeLocked: false,
  units: 'metric',
  pricesEnabled: true
};

// Countries with price comparison enabled
export const pricesEnabledCountries = new Set(['BR', 'AR', 'MX', 'CO', 'CL']);

/**
 * All supported locales
 */
export const supportedLocales: Locale[] = [
  'pt-BR', 'en', 'es', 'fr', 'it'
];

/**
 * Locale display names (short labels for selector)
 */
export const localeLabels: Record<Locale, string> = {
  'pt-BR': 'PT',
  'en': 'EN',
  'es': 'ES',
  'fr': 'FR',
  'it': 'IT'
};

/**
 * Locale full names
 */
export const localeNames: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'it': 'Italiano'
};

/**
 * Check if a string is a valid locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return supportedLocales.includes(locale as Locale);
}

/**
 * Get default locale for a country code (ISO-3166 alpha-2)
 */
export function defaultLocaleForCountry(country: string): Locale {
  const upper = country.toUpperCase();
  
  // Português (Brasil, Portugal)
  if (['BR', 'PT'].includes(upper)) return 'pt-BR';
  
  // Espanhol (Espanha e países hispânicos)
  if (['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CR', 'PA', 'DO', 'GT', 'HN', 'SV', 'NI', 'CU', 'PR'].includes(upper)) return 'es';
  
  // Francês (França e países francófonos)
  if (['FR', 'BE', 'LU', 'MC'].includes(upper)) return 'fr';
  
  // Italiano (Itália)
  if (['IT', 'SM', 'VA'].includes(upper)) return 'it';
  
  // Inglês para países anglófonos e fallback
  return 'en';
}

/**
 * Detect user's preferred locale from browser
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  
  // Check localStorage first
  const stored = localStorage.getItem('petmol_locale');
  if (stored && isValidLocale(stored)) {
    return stored;
  }
  
  // Check navigator.language
  const navLang = navigator.language.toLowerCase();
  
  if (navLang.startsWith('pt')) return 'pt-BR';
  if (navLang.startsWith('es')) return 'es';
  if (navLang.startsWith('fr')) return 'fr';
  if (navLang.startsWith('it')) return 'it';
  
  return 'en';
}

/**
 * Detect user's country from browser language
 * Maps navigator.language to country code
 */
export function detectCountryFromBrowser(): string {
  if (typeof window === 'undefined') return 'US';
  
  const navLang = navigator.language;
  
  // Mapear idioma-região para país (ex: pt-BR → BR, en-US → US, es-MX → MX)
  if (navLang.includes('-')) {
    const region = navLang.split('-')[1].toUpperCase();
    return region;
  }
  
  // Mapear apenas idioma para país mais comum
  const lang = navLang.toLowerCase().substring(0, 2);
  
  const langToCountry: Record<string, string> = {
    'pt': 'BR',  // Português → Brasil
    'es': 'ES',  // Espanhol → Espanha
    'fr': 'FR',  // Francês → França
    'it': 'IT',  // Italiano → Itália
    'de': 'DE',  // Alemão → Alemanha
    'en': 'US',  // Inglês → Estados Unidos
    'ja': 'JP',  // Japonês → Japão
    'zh': 'CN',  // Chinês → China
    'ru': 'RU',  // Russo → Rússia
    'ar': 'SA',  // Árabe → Arábia Saudita
    'ko': 'KR',  // Coreano → Coreia do Sul
    'nl': 'NL',  // Holandês → Holanda
    'pl': 'PL',  // Polonês → Polônia
    'tr': 'TR',  // Turco → Turquia
  };
  
  return langToCountry[lang] || 'US';
}

/**
 * Save user's locale preference
 */
export function saveLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('petmol_locale', locale);
  }
}

/**
 * Get GeoContext from country code
 */
export function getGeoContext(country: string, localeLocked: boolean = false): GeoContext {
  return {
    country,
    locale: defaultLocaleForCountry(country),
    localeLocked,
    units: country === 'US' ? 'imperial' : 'metric',
    pricesEnabled: pricesEnabledCountries.has(country)
  };
}

// ============================================================
// TRANSLATIONS - Partial<Record<Locale, string>> allows missing keys
// Fallback order: requested locale → 'en' → key
// ============================================================

type TranslationEntry = Partial<Record<Locale, string>>;

export const translations: Record<string, TranslationEntry> = {
  // App
  'app.name': {
    'en': 'PETMOL'
  },
  'app.tagline': {
    'pt-BR': 'Encontre ofertas de produtos para pets',
    'en': 'Find pet product deals',
    'es': 'Encuentra ofertas de productos para mascotas',
    'fr': 'Trouvez des offres de produits pour animaux',
    'it': 'Trova offerte di prodotti per animali'
  },
  'home.compare_realtime': {
    'pt-BR': 'Abrimos o Google Shopping para você comparar e escolher o melhor preço.',
    'en': 'We open Google Shopping so you can compare and choose the best price.',
    'es': 'Abrimos Google Shopping para que compares y elijas el mejor precio.',
    'fr': 'Nous ouvrons Google Shopping pour comparer et choisir le meilleur prix.',
    'it': 'Apriamo Google Shopping per confrontare e scegliere il miglior prezzo.'
  },
  'home.find_services': {
    'pt-BR': 'Encontre serviços e informações para seu pet.',
    'en': 'Find services and information for your pet.',
    'es': 'Encuentra servicios e información para tu mascota.',
    'fr': 'Trouvez des services et informations pour votre animal.',
    'it': 'Trova servizi e informazioni per il tuo animale.'
  },
  
  // Search
  'search.placeholder': {
    'pt-BR': 'Busque ração, petiscos, brinquedos...',
    'en': 'Search food, treats, toys...',
    'es': 'Busca comida, golosinas, juguetes...',
    'fr': 'Rechercher nourriture, friandises, jouets...',
    'it': 'Cerca cibo, snack, giocattoli...'
  },
  
  // Home actions
  'home.reorder': {
    'pt-BR': 'Recompra', 'en': 'Reorder', 'es': 'Recompra', 'fr': 'Renouveler', 'it': 'Riordina'
  },
  'home.reorder.desc': {
    'pt-BR': 'Pra não faltar', 'en': 'Never run out', 'es': 'Para no quedarte sin',
    'fr': 'Ne manquez jamais', 'it': 'Non restare senza'
  },
  'home.emergency': {
    'pt-BR': 'Socorro Agora', 'en': 'Emergency Now', 'es': 'Urgencia Ahora',
    'fr': 'Urgence', 'it': 'Emergenza'
  },
  'home.emergency.desc': {
    'pt-BR': 'Veterinário 24h aberto', 'en': '24h vet open now', 'es': 'Veterinario 24h abierto',
    'fr': 'Vétérinaire 24h ouvert', 'it': 'Veterinario 24h aperto'
  },
  'home.services': {
    'pt-BR': 'Serviços', 'en': 'Services', 'es': 'Servicios', 'fr': 'Services', 'it': 'Servizi'
  },
  'home.services.desc': {
    'pt-BR': 'Petshops, clínicas, banho...', 'en': 'Pet shops, clinics, grooming...',
    'es': 'Tiendas, clínicas, baño...', 'fr': 'Animaleries, cliniques...', 'it': 'Negozi, cliniche...'
  },
  'home.health': {
    'pt-BR': 'Saúde do Pet', 'en': 'Pet Health', 'es': 'Salud de Mascota',
    'fr': 'Santé Animale', 'it': 'Salute Animale'
  },
  'home.health.desc': {
    'pt-BR': 'Vacinas, receitas, exames', 'en': 'Vaccines, meds, exams',
    'es': 'Vacunas, recetas, exámenes', 'fr': 'Vaccins, médicaments, examens', 'it': 'Vaccini, medicine, esami'
  },
  'home.logged.title': {
    'pt-BR': 'O que você pode fazer no PETMOL', 'en': 'What you can do on PETMOL',
    'es': 'Qué puedes hacer en PETMOL', 'fr': 'Ce que vous pouvez faire sur PETMOL', 'it': 'Cosa puoi fare su PETMOL'
  },
  'home.title': {
    'pt-BR': 'Tudo para o seu pet, no lugar certo', 'en': 'Everything for your pet, in the right place',
    'es': 'Todo para tu MASCOTA', 'fr': 'Tout pour votre ANIMAL', 'it': 'Tutto per il tuo ANIMALE'
  },
  'home.subtitle': {
    'pt-BR': 'Encontre serviços, emergência 24h, ofertas e organize a saúde do pet.',
    'en': 'Find services, 24h emergency care, deals, and organize pet health.',
    'es': 'Encuentra servicios, urgencias 24h, ofertas y organiza la salud de tu mascota.',
    'fr': 'Trouvez services, urgences 24h, offres et organisez la santé de votre animal.',
    'it': 'Trova servizi, emergenze 24h, offerte e organizza la salute del tuo animale.'
  },
  'welcome.title': {
    'pt-BR': 'Bem-vindo ao PETMOL',
    'en': 'Welcome to PETMOL',
    'es': 'Bienvenido a PETMOL',
    'fr': 'Bienvenue sur PETMOL',
    'it': 'Benvenuto su PETMOL'
  },
  'welcome.subtitle': {
    'pt-BR': 'Seu app para encontrar serviços, emergências e cuidar da saúde do pet.',
    'en': 'Your app to find services, emergencies, and manage pet health.',
    'es': 'Tu app para encontrar servicios, emergencias y gestionar la salud de tu mascota.',
    'fr': 'Votre app pour trouver des services, urgences et gérer la santé de votre animal.',
    'it': 'La tua app per trovare servizi, emergenze e gestire la salute del tuo animale.'
  },
  'welcome.item1.title': {
    'pt-BR': 'Serviços próximos',
    'en': 'Nearby services',
    'es': 'Servicios cercanos',
    'fr': 'Services à proximité',
    'it': 'Servizi vicini'
  },
  'welcome.item1.desc': {
    'pt-BR': 'Petshops, clínicas, banho e tosa com rotas e ligação rápida.',
    'en': 'Pet shops, clinics, grooming with routes and quick call.',
    'es': 'Petshops, clínicas y grooming con rutas y llamada rápida.',
    'fr': 'Animaleries, cliniques, toilettage avec itinéraires et appel rapide.',
    'it': 'Pet shop, cliniche, toelettatura con percorso e chiamata rapida.'
  },
  'welcome.item2.title': {
    'pt-BR': 'Emergência 24h',
    'en': '24h emergency',
    'es': 'Emergencia 24h',
    'fr': 'Urgence 24h',
    'it': 'Emergenza 24h'
  },
  'welcome.item2.desc': {
    'pt-BR': 'Encontre atendimento aberto agora, ordenado por distância.',
    'en': 'Shows open now with distance and direct contact.',
    'es': 'Muestra abiertos ahora con distancia y contacto directo.',
    'fr': 'Affiche ouverts maintenant avec distance et contact direct.',
    'it': 'Mostra aperti ora con distanza e contatto diretto.'
  },
  'welcome.item3.title': {
    'pt-BR': 'Histórico e alertas',
    'en': 'Health organized',
    'es': 'Salud organizada',
    'fr': 'Santé organisée',
    'it': 'Salute organizzata'
  },
  'welcome.item3.desc': {
    'pt-BR': 'Registre visitas e tenha sugestões inteligentes para seu pet.',
    'en': 'History, vaccines, exams, and pet records.',
    'es': 'Historial, vacunas, exámenes y registros de la mascota.',
    'fr': 'Historique, vaccins, examens et dossiers de l’animal.',
    'it': 'Storico, vaccini, esami e registri dell’animale.'
  },
  'welcome.cta_login': {
    'pt-BR': 'Entrar',
    'en': 'Log in',
    'es': 'Entrar',
    'fr': 'Se connecter',
    'it': 'Accedi'
  },
  'welcome.cta_signup': {
    'pt-BR': 'Criar conta',
    'en': 'Create account',
    'es': 'Crear cuenta',
    'fr': 'Créer un compte',
    'it': 'Crea account'
  },
  'welcome.access_note': {
    'pt-BR': 'Para acessar o sistema, faça login ou crie sua conta.',
    'en': 'To access the system, log in or create an account.',
    'es': 'Para acceder al sistema, inicia sesión o crea una cuenta.',
    'fr': 'Pour accéder au système, connectez-vous ou créez un compte.',
    'it': 'Per accedere al sistema, accedi o crea un account.'
  },
  'home.value.title': {
    'pt-BR': 'O que o PETMOL faz',
    'en': 'What PETMOL does',
    'es': 'Qué hace PETMOL',
    'fr': 'Ce que fait PETMOL',
    'it': 'Cosa fa PETMOL'
  },
  'home.value.subtitle': {
    'pt-BR': 'Um app prático para decisões rápidas no cuidado do seu pet.',
    'en': 'A practical app for fast decisions in pet care.',
    'es': 'Una app práctica para decisiones rápidas en el cuidado de tu mascota.',
    'fr': 'Une app pratique pour des décisions rapides dans les soins.',
    'it': 'Un’app pratica per decisioni rapide nella cura del tuo animale.'
  },
  'home.value.item1.title': {
    'pt-BR': 'Serviços próximos',
    'en': 'Nearby services',
    'es': 'Servicios cercanos',
    'fr': 'Services à proximité',
    'it': 'Servizi vicini'
  },
  'home.value.item1.desc': {
    'pt-BR': 'Petshops, clínicas, banho e tosa com rotas e ligação rápida.',
    'en': 'Pet shops, clinics, grooming with routes and quick call.',
    'es': 'Petshops, clínicas, baño y corte con rutas y llamada rápida.',
    'fr': 'Animaleries, cliniques, toilettage avec itinéraires et appel rapide.',
    'it': 'Pet shop, cliniche, toelettatura con percorso e chiamata rapida.'
  },
  'home.value.item2.title': {
    'pt-BR': 'Emergência 24h',
    'en': '24h emergency',
    'es': 'Emergencia 24h',
    'fr': 'Urgence 24h',
    'it': 'Emergenza 24h'
  },
  'home.value.item2.desc': {
    'pt-BR': 'Encontre atendimento aberto agora, ordenado por distância.',
    'en': 'Find open care now, sorted by distance.',
    'es': 'Encuentra atención abierta ahora, ordenada por distancia.',
    'fr': 'Trouvez un service ouvert, trié par distance.',
    'it': 'Trova assistenza aperta ora, ordinata per distanza.'
  },
  'home.value.item3.title': {
    'pt-BR': 'Histórico e alertas',
    'en': 'History and alerts',
    'es': 'Historial y alertas',
    'fr': 'Historique et alertes',
    'it': 'Storico e avvisi'
  },
  'home.value.item3.desc': {
    'pt-BR': 'Registre visitas e tenha sugestões inteligentes para seu pet.',
    'en': 'Log visits and get smart suggestions for your pet.',
    'es': 'Registra visitas y recibe sugerencias inteligentes.',
    'fr': 'Enregistrez les visites et recevez des suggestions intelligentes.',
    'it': 'Registra visite e ricevi suggerimenti intelligenti.'
  },
  'home.shop': {
    'pt-BR': 'Comprar / Ofertas', 'en': 'Shop / Deals',
    'es': 'Comprar / Ofertas', 'fr': 'Acheter / Offres', 'it': 'Acquista / Offerte'
  },
  'home.shop.desc': {
    'pt-BR': 'Produtos e minhas compras', 'en': 'Products and purchases',
    'es': 'Productos y mis compras', 'fr': 'Produits et achats', 'it': 'Prodotti e acquisti'
  },
  'home.features_preview': {
    'pt-BR': 'O que você pode fazer no PETMOL',
    'en': 'What you can do on PETMOL',
    'es': 'Lo que puedes hacer en PETMOL',
    'fr': 'Ce que vous pouvez faire sur PETMOL',
    'it': 'Cosa puoi fare su PETMOL'
  },
  'home.login_prompt': {
    'pt-BR': 'Faça login para acessar todas as funcionalidades',
    'en': 'Log in to access all features',
    'es': 'Inicia sesión para acceder a todas las funciones',
    'fr': 'Connectez-vous pour accéder à toutes les fonctionnalités',
    'it': 'Accedi per accedere a tutte le funzionalità'
  },
  'loading': {
    'pt-BR': 'Carregando...', 'en': 'Loading...', 'es': 'Cargando...',
    'fr': 'Chargement...', 'it': 'Caricamento...'
  },
  'home.tips': {
    'pt-BR': 'Dúvidas rápidas', 'en': 'Quick tips', 'es': 'Consejos rápidos',
    'fr': 'Conseils rapides', 'it': 'Consigli rapidi'
  },
  'home.tips.desc': {
    'pt-BR': 'Comportamento e cuidados', 'en': 'Behavior and care', 'es': 'Comportamiento y cuidados',
    'fr': 'Comportement et soins', 'it': 'Comportamento e cure'
  },
  'home.favorites': {
    'pt-BR': 'Favoritos', 'en': 'Favorites', 'es': 'Favoritos', 'fr': 'Favoris', 'it': 'Preferiti'
  },
  'home.favorites.desc': {
    'pt-BR': 'Seus produtos e locais', 'en': 'Your products and places', 'es': 'Tus productos y lugares',
    'fr': 'Vos produits et lieux', 'it': 'I tuoi prodotti e luoghi'
  },
  'home.consultation.title': {
    'pt-BR': 'Consulta Particular', 'en': 'Private Consultation', 'es': 'Consulta Particular',
    'fr': 'Consultation Privée', 'it': 'Consulenza Privata'
  },
  'home.consultation.desc': {
    'pt-BR': 'Atendimento Online 💰', 'en': 'Online Service 💰', 'es': 'Servicio en Línea 💰',
    'fr': 'Service en Ligne 💰', 'it': 'Servizio Online 💰'
  },
  'home.search.title': {
    'pt-BR': 'Procurar', 'en': 'Search', 'es': 'Buscar',
    'fr': 'Rechercher', 'it': 'Cerca'
  },
  'home.search.services': {
    'pt-BR': 'Estabelecimentos próximos:', 'en': 'Nearby places:', 'es': 'Lugares cercanos:',
    'fr': 'Lieux à proximité:', 'it': 'Luoghi vicini:'
  },
  'home.search.clinics': {
    'pt-BR': '24h + Clínicas', 'en': '24h + Clinics', 'es': '24h + Clínicas',
    'fr': '24h + Cliniques', 'it': '24h + Cliniche'
  },
  'home.search.petshops': {
    'pt-BR': 'Petshops', 'en': 'Pet Shops', 'es': 'Petshops',
    'fr': 'Animaleries', 'it': 'Pet Shop'
  },
  'home.search.hotels': {
    'pt-BR': 'Hotéis', 'en': 'Hotels', 'es': 'Hoteles',
    'fr': 'Hôtels', 'it': 'Hotel'
  },
  'home.search.daycare': {
    'pt-BR': 'Creches', 'en': 'Daycare', 'es': 'Guarderías',
    'fr': 'Garderies', 'it': 'Asili'
  },
  'home.shopping.title': {
    'pt-BR': 'Shopping', 'en': 'Shopping', 'es': 'Shopping',
    'fr': 'Shopping', 'it': 'Shopping'
  },
  'home.shopping.products': {
    'pt-BR': 'Produtos para Pets', 'en': 'Pet Products', 'es': 'Productos para Mascotas',
    'fr': 'Produits pour Animaux', 'it': 'Prodotti per Animali'
  },
  'home.family.title': {
    'pt-BR': 'Dê acesso a sua família', 'en': 'Give your family access', 'es': 'Da acceso a tu familia',
    'fr': 'Donnez accès à votre famille', 'it': 'Dai accesso alla tua famiglia'
  },
  'home.family.desc': {
    'pt-BR': '🔗 Família & Cuidadores', 'en': '🔗 Family & Caregivers', 'es': '🔗 Familia y Cuidadores',
    'fr': '🔗 Famille & Aidants', 'it': '🔗 Famiglia e Caregiver'
  },
  'home.archive.title': {
    'pt-BR': 'Arquivo', 'en': 'Archive', 'es': 'Archivo',
    'fr': 'Archives', 'it': 'Archivio'
  },
  'home.veterinary_history.title': {
    'pt-BR': 'Histórico Veterinário', 'en': 'Veterinary History', 'es': 'Historial Veterinario',
    'fr': 'Historique Vétérinaire', 'it': 'Storia Veterinaria'
  },
  'home.veterinary_history.records': {
    'pt-BR': 'Consultas & Procedimentos', 'en': 'Consultations & Procedures', 'es': 'Consultas y Procedimientos',
    'fr': 'Consultations & Procédures', 'it': 'Consultazioni e Procedure'
  },
  'home.veterinary_history.documents': {
    'pt-BR': 'Documentos & Arquivos', 'en': 'Documents & Files', 'es': 'Documentos y Archivos',
    'fr': 'Documents & Fichiers', 'it': 'Documenti e File'
  },
  'home.veterinary_history.documents_desc': {
    'pt-BR': 'PDFs, fotos, exames', 'en': 'PDFs, photos, exams', 'es': 'PDFs, fotos, exámenes',
    'fr': 'PDFs, photos, examens', 'it': 'PDF, foto, esami'
  },
  'common.add_pet': {
    'pt-BR': 'Adicionar Pet', 'en': 'Add Pet', 'es': 'Añadir Mascota',
    'fr': 'Ajouter Animal', 'it': 'Aggiungi Animale'
  },
  'common.simulate_arrival': {
    'pt-BR': 'Simular Chegada', 'en': 'Simulate Arrival', 'es': 'Simular Llegada',
    'fr': 'Simuler Arrivée', 'it': 'Simula Arrivo'
  },
  'common.update_data': {
    'pt-BR': 'Atualizar Dados', 'en': 'Update Data', 'es': 'Actualizar Datos',
    'fr': 'Mettre à Jour', 'it': 'Aggiorna Dati'
  },
  'common.coming_soon': {
    'pt-BR': 'Em breve', 'en': 'Coming soon', 'es': 'Próximamente',
    'fr': 'Bientôt', 'it': 'Prossimamente'
  },
  'common.cancel': {
    'pt-BR': 'Cancelar', 'en': 'Cancel', 'es': 'Cancelar',
    'fr': 'Annuler', 'it': 'Annulla'
  },
  'common.selected': {
    'pt-BR': 'Selecionado:', 'en': 'Selected:', 'es': 'Seleccionado:',
    'fr': 'Sélectionné:', 'it': 'Selezionato:'
  },
  'common.view_vaccines': {
    'pt-BR': 'Ver Vacinas', 'en': 'View Vaccines', 'es': 'Ver Vacunas',
    'fr': 'Voir les Vaccins', 'it': 'Vedi Vaccini'
  },
  'common.clear': {
    'pt-BR': 'Limpar', 'en': 'Clear', 'es': 'Limpiar',
    'fr': 'Effacer', 'it': 'Pulisci'
  },
  'common.close_guide': {
    'pt-BR': 'Fechar Guia', 'en': 'Close Guide', 'es': 'Cerrar Guía',
    'fr': 'Fermer le Guide', 'it': 'Chiudi Guida'
  },
  'common.remove': {
    'pt-BR': 'Remover', 'en': 'Remove', 'es': 'Eliminar',
    'fr': 'Supprimer', 'it': 'Rimuovi'
  },
  'common.search': {
    'pt-BR': 'Buscar', 'en': 'Search', 'es': 'Buscar',
    'fr': 'Rechercher', 'it': 'Cerca'
  },
  'home.just_browsing': {
    'pt-BR': 'Estou só de passagem', 'en': 'Just Browsing', 'es': 'Solo mirando',
    'fr': 'Je regarde juste', 'it': 'Sto solo guardando'
  },
  'common.send_now': {
    'pt-BR': 'Enviar agora', 'en': 'Send now', 'es': 'Enviar ahora',
    'fr': 'Envoyer maintenant', 'it': 'Invia ora'
  },
  'parasite.vet_instructions': {
    'pt-BR': 'ℹ️ Configure conforme orientação do seu veterinário e instruções da embalagem',
    'en': 'ℹ️ Configure as directed by your vet and product instructions',
    'es': 'ℹ️ Configure según las indicaciones de su veterinario e instrucciones del producto',
    'fr': 'ℹ️ Configurez selon les conseils de votre vétérinaire et les instructions du produit',
    'it': 'ℹ️ Configura come indicato dal tuo veterinario e dalle istruzioni del prodotto'
  },
  /* ── Shopping modal items ── */
  'shopping.dog_food': { 'pt-BR': 'Ração', 'en': 'Pet Food', 'es': 'Alimento', 'fr': 'Croquettes', 'it': 'Crocchette' },
  'shopping.shampoo': { 'pt-BR': 'Shampoo pet', 'en': 'Pet Shampoo', 'es': 'Champú pet', 'fr': 'Shampooing animal', 'it': 'Shampoo animali' },
  'shopping.pee_pad': { 'pt-BR': 'Tapete higiênico', 'en': 'Potty Pad', 'es': 'Tapete higiénico', 'fr': 'Tapis hygiénique', 'it': 'Tappetino igienico' },
  'shopping.cat_litter': { 'pt-BR': 'Areia para gato', 'en': 'Cat Litter', 'es': 'Arena para gato', 'fr': 'Litière pour chat', 'it': 'Lettiera per gatto' },
  'shopping.flea_product': { 'pt-BR': 'Antipulgas', 'en': 'Flea Treatment', 'es': 'Antipulgas', 'fr': 'Antipuces', 'it': 'Antipulci' },
  'shopping.toy': { 'pt-BR': 'Brinquedo', 'en': 'Toy', 'es': 'Juguete', 'fr': 'Jouet', 'it': 'Giocattolo' },
  'shopping.bed': { 'pt-BR': 'Cama / caixinha', 'en': 'Pet Bed / Crate', 'es': 'Cama / jaula', 'fr': 'Lit / Caisse', 'it': 'Cuccia / Trasportino' },
  'shopping.medication': { 'pt-BR': 'Medicamentos', 'en': 'Medications', 'es': 'Medicamentos', 'fr': 'Médicaments', 'it': 'Medicinali' },
  'shopping.google_shopping': { 'pt-BR': 'Google Shopping →', 'en': 'Google Shopping →', 'es': 'Google Shopping →', 'fr': 'Google Shopping →', 'it': 'Google Shopping →' },
  'shopping.not_found': { 'pt-BR': 'Não achou? Digite o produto:', 'en': 'Not found? Type the product:', 'es': '¿No encontró? Escriba el producto:', 'fr': 'Pas trouvé ? Tapez le produit :', 'it': 'Non trovato? Digita il prodotto:' },
  'shopping.search_placeholder': { 'pt-BR': 'Ex: coleira, aquecedor...', 'en': 'Ex: collar, heater...', 'es': 'Ej: collar, calefactor...', 'fr': 'Ex : collier, chauffage...', 'it': 'Es: collare, riscaldatore...' },
  /* ── Services modal items ── */
  'services.vet_clinics_label': { 'pt-BR': 'Clínicas Veterinárias', 'en': 'Vet Clinics', 'es': 'Clínicas Veterinarias', 'fr': 'Cliniques Vétérinaires', 'it': 'Cliniche Veterinarie' },
  'services.vet_hospital_label': { 'pt-BR': 'Hospitais Veterinários', 'en': 'Veterinary Hospitals', 'es': 'Hospitales Veterinarios', 'fr': 'Hôpitaux Vétérinaires', 'it': 'Ospedali Veterinari' },
  'services.vet_emergency_label': { 'pt-BR': 'Emergência Veterinária 24h', 'en': '24h Vet Emergency', 'es': 'Emergencia Veterinaria 24h', 'fr': 'Urgences Vétérinaires 24h', 'it': 'Emergenza Veterinaria 24h' },
  'services.petshop_label': { 'pt-BR': 'Petshops', 'en': 'Pet Shops', 'es': 'Tiendas de mascotas', 'fr': 'Animaleries', 'it': 'Negozi per animali' },
  'services.hotel_label': { 'pt-BR': 'Hotel para Pet', 'en': 'Pet Hotel', 'es': 'Hotel para mascotas', 'fr': 'Hôtel pour animaux', 'it': 'Hotel per animali' },
  'services.training_label': { 'pt-BR': 'Adestramento', 'en': 'Dog Training', 'es': 'Adiestramiento', 'fr': 'Éducation canine', 'it': 'Addestramento' },
  'services.open_maps': { 'pt-BR': 'Abrir Maps →', 'en': 'Open Maps →', 'es': 'Abrir Maps →', 'fr': 'Ouvrir Maps →', 'it': 'Apri Maps →' },
  /* ── Profile page ── */
  'profile.title': { 'pt-BR': 'Meu Perfil', 'en': 'My Profile', 'es': 'Mi Perfil', 'fr': 'Mon Profil', 'it': 'Il Mio Profilo' },
  'profile.personal_data': { 'pt-BR': 'Dados Pessoais', 'en': 'Personal Data', 'es': 'Datos Personales', 'fr': 'Données Personnelles', 'it': 'Dati Personali' },
  'profile.full_name': { 'pt-BR': 'Nome Completo *', 'en': 'Full Name *', 'es': 'Nombre Completo *', 'fr': 'Nom Complet *', 'it': 'Nome Completo *' },
  'profile.phone_label': { 'pt-BR': 'Telefone/WhatsApp *', 'en': 'Phone/WhatsApp *', 'es': 'Teléfono/WhatsApp *', 'fr': 'Téléphone/WhatsApp *', 'it': 'Telefono/WhatsApp *' },
  'profile.valid_mobile': { 'pt-BR': 'Celular válido', 'en': 'Valid mobile', 'es': 'Celular válido', 'fr': 'Mobile valide', 'it': 'Cellulare valido' },
  'profile.valid_landline': { 'pt-BR': 'Telefone fixo válido', 'en': 'Valid landline', 'es': 'Teléfono fijo válido', 'fr': 'Fixe valide', 'it': 'Rete fissa valida' },
  'profile.mobile_badge': { 'pt-BR': '📱 Celular', 'en': '📱 Mobile', 'es': '📱 Celular', 'fr': '📱 Mobile', 'it': '📱 Cellulare' },
  'profile.whatsapp_badge': { 'pt-BR': '💬 WhatsApp', 'en': '💬 WhatsApp', 'es': '💬 WhatsApp', 'fr': '💬 WhatsApp', 'it': '💬 WhatsApp' },
  'profile.landline_badge': { 'pt-BR': '☎️ Fixo', 'en': '☎️ Landline', 'es': '☎️ Fijo', 'fr': '☎️ Fixe', 'it': '☎️ Fisso' },
  'profile.accept_reminders': { 'pt-BR': 'Aceito receber lembretes via WhatsApp', 'en': 'I accept reminders via WhatsApp', 'es': 'Acepto recibir recordatorios por WhatsApp', 'fr': "J'accepte les rappels par WhatsApp", 'it': 'Accetto i promemoria via WhatsApp' },
  'profile.reminder_day': { 'pt-BR': 'Dia do mês do lembrete', 'en': 'Monthly reminder day', 'es': 'Día del mes del recordatorio', 'fr': 'Jour du rappel mensuel', 'it': 'Giorno del promemoria mensile' },
  'profile.day_option': { 'pt-BR': 'Dia {d}', 'en': 'Day {d}', 'es': 'Día {d}', 'fr': 'Jour {d}', 'it': 'Giorno {d}' },
  'profile.last_day_option': { 'pt-BR': 'Último dia do mês', 'en': 'Last day of month', 'es': 'Último día del mes', 'fr': 'Dernier jour du mois', 'it': 'Ultimo giorno del mese' },
  'profile.reminder_info': { 'pt-BR': 'A partir desse dia, o PETMOL exibirá um lembrete mensal para você registrar eventos e documentos do seu pet.', 'en': 'From this day, PETMOL will show a monthly reminder to log events and documents for your pet.', 'es': 'A partir de este día, PETMOL mostrará un recordatorio mensual para registrar eventos y documentos de su mascota.', 'fr': 'À partir de ce jour, PETMOL affichera un rappel mensuel pour enregistrer les événements et documents de votre animal.', 'it': 'Da questo giorno, PETMOL mostrerà un promemoria mensile per registrare eventi e documenti del tuo animale.' },
  'profile.address': { 'pt-BR': 'Endereço', 'en': 'Address', 'es': 'Dirección', 'fr': 'Adresse', 'it': 'Indirizzo' },
  'profile.postal_code': { 'pt-BR': 'CEP', 'en': 'Postal Code', 'es': 'Código Postal', 'fr': 'Code Postal', 'it': 'Codice Postale' },
  'profile.street': { 'pt-BR': 'Rua/Avenida', 'en': 'Street', 'es': 'Calle', 'fr': 'Rue', 'it': 'Via' },
  'profile.number': { 'pt-BR': 'Número', 'en': 'Number', 'es': 'Número', 'fr': 'Numéro', 'it': 'Numero' },
  'profile.complement': { 'pt-BR': 'Complemento', 'en': 'Complement', 'es': 'Complemento', 'fr': 'Complément', 'it': 'Complemento' },
  'profile.neighborhood': { 'pt-BR': 'Bairro', 'en': 'Neighborhood', 'es': 'Barrio', 'fr': 'Quartier', 'it': 'Quartiere' },
  'profile.city': { 'pt-BR': 'Cidade', 'en': 'City', 'es': 'Ciudad', 'fr': 'Ville', 'it': 'Città' },
  'profile.state': { 'pt-BR': 'Estado', 'en': 'State', 'es': 'Estado', 'fr': 'État', 'it': 'Stato' },
  'profile.country': { 'pt-BR': 'País', 'en': 'Country', 'es': 'País', 'fr': 'Pays', 'it': 'Paese' },
  'profile.save_changes': { 'pt-BR': 'Salvar Alterações', 'en': 'Save Changes', 'es': 'Guardar Cambios', 'fr': 'Enregistrer', 'it': 'Salva Modifiche' },
  'profile.saving': { 'pt-BR': 'Salvando...', 'en': 'Saving...', 'es': 'Guardando...', 'fr': 'Enregistrement...', 'it': 'Salvataggio...' },
  'profile.family_title': { 'pt-BR': 'Gerenciar Familiares', 'en': 'Manage Family', 'es': 'Gestionar Familiares', 'fr': 'Gérer la Famille', 'it': 'Gestisci Famiglia' },
  'profile.family_desc': { 'pt-BR': 'Adicione familiares ou cuidadores que podem acessar os dados dos seus pets.', 'en': "Add family members or caregivers who can access your pets' data.", 'es': 'Añade familiares o cuidadores que puedan acceder a los datos de tus mascotas.', 'fr': 'Ajoutez des membres de la famille ou des soignants pouvant accéder aux données de vos animaux.', 'it': 'Aggiungi familiari o caregiver che possono accedere ai dati dei tuoi animali.' },
  'profile.family_access': { 'pt-BR': 'Acessar Gerenciamento de Família', 'en': 'Access Family Management', 'es': 'Acceder a Gestión de Familia', 'fr': 'Gérer la Famille', 'it': 'Accedi alla Gestione Famiglia' },
  'profile.danger_zone': { 'pt-BR': 'Zona de Perigo', 'en': 'Danger Zone', 'es': 'Zona de Peligro', 'fr': 'Zone Dangereuse', 'it': 'Zona Pericolosa' },
  'profile.delete_account_desc': { 'pt-BR': 'Ao excluir sua conta, todos os seus dados serão permanentemente removidos.', 'en': 'Deleting your account will permanently remove all your data.', 'es': 'Al eliminar su cuenta, todos sus datos serán eliminados permanentemente.', 'fr': 'La suppression de votre compte supprimera définitivement toutes vos données.', 'it': "L'eliminazione dell'account rimuoverà permanentemente tutti i tuoi dati." },
  'profile.delete_account': { 'pt-BR': 'Excluir Minha Conta', 'en': 'Delete My Account', 'es': 'Eliminar Mi Cuenta', 'fr': 'Supprimer Mon Compte', 'it': 'Elimina Il Mio Account' },
  'profile.confirm_deletion': { 'pt-BR': 'Confirmar Exclusão', 'en': 'Confirm Deletion', 'es': 'Confirmar Eliminación', 'fr': 'Confirmer la Suppression', 'it': 'Conferma Eliminazione' },
  /* ── Pet form ── */
  'pet.name_label': { 'pt-BR': '🐾 Nome do Pet *', 'en': '🐾 Pet Name *', 'es': '🐾 Nombre de la Mascota *', 'fr': "🐾 Nom de l'Animal *", 'it': "🐾 Nome dell'Animale *" },
  'pet.name_placeholder': { 'pt-BR': 'Nome do seu pet', 'en': "Your pet's name", 'es': 'Nombre de tu mascota', 'fr': 'Nom de votre animal', 'it': 'Nome del tuo animale' },
  'pet.species_label': { 'pt-BR': '🐕 Espécie *', 'en': '🐕 Species *', 'es': '🐕 Especie *', 'fr': '🐕 Espèce *', 'it': '🐕 Specie *' },
  'pet.sex_label': { 'pt-BR': '♂️♀️ Sexo *', 'en': '♂️♀️ Sex *', 'es': '♂️♀️ Sexo *', 'fr': '♂️♀️ Sexe *', 'it': '♂️♀️ Sesso *' },
  'pet.dog': { 'pt-BR': '🐕 Cachorro', 'en': '🐕 Dog', 'es': '🐕 Perro', 'fr': '🐕 Chien', 'it': '🐕 Cane' },
  'pet.cat': { 'pt-BR': '🐱 Gato', 'en': '🐱 Cat', 'es': '🐱 Gato', 'fr': '🐱 Chat', 'it': '🐱 Gatto' },
  'pet.bird': { 'pt-BR': '🦜 Pássaro', 'en': '🦜 Bird', 'es': '🦜 Pájaro', 'fr': '🦜 Oiseau', 'it': '🦜 Uccello' },
  'pet.fish': { 'pt-BR': '🐠 Peixe', 'en': '🐠 Fish', 'es': '🐠 Pez', 'fr': '🐠 Poisson', 'it': '🐠 Pesce' },
  'pet.rabbit': { 'pt-BR': '🐰 Coelho', 'en': '🐰 Rabbit', 'es': '🐰 Conejo', 'fr': '🐰 Lapin', 'it': '🐰 Coniglio' },
  'pet.hamster': { 'pt-BR': '🐹 Hamster', 'en': '🐹 Hamster', 'es': '🐹 Hámster', 'fr': '🐹 Hamster', 'it': '🐹 Criceto' },
  'pet.other_species': { 'pt-BR': '🐾 Outro', 'en': '🐾 Other', 'es': '🐾 Otro', 'fr': '🐾 Autre', 'it': '🐾 Altro' },
  'pet.male': { 'pt-BR': '♂️ Macho', 'en': '♂️ Male', 'es': '♂️ Macho', 'fr': '♂️ Mâle', 'it': '♂️ Maschio' },
  'pet.female': { 'pt-BR': '♀️ Fêmea', 'en': '♀️ Female', 'es': '♀️ Hembra', 'fr': '♀️ Femelle', 'it': '♀️ Femmina' },
  'pet.breed_label': { 'pt-BR': '🎯 Raça', 'en': '🎯 Breed', 'es': '🎯 Raza', 'fr': '🎯 Race', 'it': '🎯 Razza' },
  'pet.breed_select': { 'pt-BR': 'Selecione a raça...', 'en': 'Select breed...', 'es': 'Seleccione la raza...', 'fr': 'Sélectionnez la race...', 'it': 'Seleziona la razza...' },
  'pet.breed_placeholder': { 'pt-BR': 'Digite a raça ou deixe em branco', 'en': 'Enter breed or leave blank', 'es': 'Ingrese la raza o deje en blanco', 'fr': 'Entrez la race ou laissez vide', 'it': 'Inserire la razza o lasciare vuoto' },
  'pet.birth_date': { 'pt-BR': '📅 Data de Nascimento', 'en': '📅 Date of Birth', 'es': '📅 Fecha de Nacimiento', 'fr': '📅 Date de Naissance', 'it': '📅 Data di Nascita' },
  'pet.weight_label': { 'pt-BR': '⚖️ Peso Atual (kg)', 'en': '⚖️ Current Weight (kg)', 'es': '⚖️ Peso Actual (kg)', 'fr': '⚖️ Poids Actuel (kg)', 'it': '⚖️ Peso Attuale (kg)' },
  'pet.neutered_label': { 'pt-BR': '✂️ Castrado?', 'en': '✂️ Neutered?', 'es': '✂️ Esterilizado?', 'fr': '✂️ Stérilisé ?', 'it': '✂️ Sterilizzato?' },
  'pet.neutered_yes': { 'pt-BR': '✅ Sim', 'en': '✅ Yes', 'es': '✅ Sí', 'fr': '✅ Oui', 'it': '✅ Sì' },
  'pet.neutered_no': { 'pt-BR': '❌ Não', 'en': '❌ No', 'es': '❌ No', 'fr': '❌ Non', 'it': '❌ No' },
  'pet.delete_permanent': { 'pt-BR': 'Excluir este pet permanentemente', 'en': 'Delete this pet permanently', 'es': 'Eliminar esta mascota permanentemente', 'fr': 'Supprimer définitivement cet animal', 'it': 'Elimina questo animale definitivamente' },
  'pet.saving': { 'pt-BR': 'Salvando...', 'en': 'Saving...', 'es': 'Guardando...', 'fr': 'Enregistrement...', 'it': 'Salvataggio...' },
  'profile.cep_hint': { 'pt-BR': '💡 Digite o CEP e o endereço será preenchido automaticamente', 'en': '💡 Enter the postal code and the address will be filled in automatically', 'es': '💡 Ingrese el código postal y la dirección se completará automáticamente', 'fr': '💡 Entrez le code postal et l’adresse sera remplie automatiquement', 'it': '💡 Inserisci il codice postale e l’indirizzo verrà compilato automaticamente' },
  'pet.confirm_delete': { 'pt-BR': '🗑️ Confirmar Exclusão', 'en': '🗑️ Confirm Deletion', 'es': '🗑️ Confirmar Eliminación', 'fr': '🗑️ Confirmer la Suppression', 'it': '🗑️ Conferma Eliminazione' },
  'pet.save_photo': { 'pt-BR': '✅ SALVAR FOTO', 'en': '✅ SAVE PHOTO', 'es': '✅ GUARDAR FOTO', 'fr': '✅ ENREGISTRER LA PHOTO', 'it': '✅ SALVA FOTO' },
  'pet.edit_prefix': { 'pt-BR': 'Editar', 'en': 'Edit', 'es': 'Editar', 'fr': 'Modifier', 'it': 'Modifica' },
  'common.or': {
    'pt-BR': 'ou', 'en': 'or', 'es': 'o',
    'fr': 'ou', 'it': 'o'
  },
  'common.close': {
    'pt-BR': 'Fechar', 'en': 'Close', 'es': 'Cerrar',
    'fr': 'Fermer', 'it': 'Chiudi'
  },
  'common.edit': {
    'pt-BR': 'Editar', 'en': 'Edit', 'es': 'Editar',
    'fr': 'Modifier', 'it': 'Modifica'
  },
  'common.delete': {
    'pt-BR': 'Excluir', 'en': 'Delete', 'es': 'Eliminar',
    'fr': 'Supprimer', 'it': 'Elimina'
  },
  'common.at': {
    'pt-BR': 'às', 'en': 'at', 'es': 'a las',
    'fr': 'à', 'it': 'alle'
  },
  'common.login': {
    'pt-BR': 'Entrar', 'en': 'Login', 'es': 'Entrar',
    'fr': 'Connexion', 'it': 'Accedi'
  },
  'common.logout': {
    'pt-BR': 'Sair', 'en': 'Logout', 'es': 'Salir',
    'fr': 'Déconnexion', 'it': 'Esci'
  },
  'common.logging_out': {
    'pt-BR': 'Saindo...', 'en': 'Logging out...', 'es': 'Saliendo...',
    'fr': 'Déconnexion...', 'it': 'Disconnessione...'
  },
  'common.profile': {
    'pt-BR': 'Perfil', 'en': 'Profile', 'es': 'Perfil',
    'fr': 'Profil', 'it': 'Profilo'
  },
  'common.save': {
    'pt-BR': 'Salvar', 'en': 'Save', 'es': 'Guardar',
    'fr': 'Enregistrer', 'it': 'Salva'
  },
  'common.confirm': {
    'pt-BR': 'Confirmar', 'en': 'Confirm', 'es': 'Confirmar',
    'fr': 'Confirmer', 'it': 'Conferma'
  },
  'common.error': {
    'pt-BR': 'Erro', 'en': 'Error', 'es': 'Error',
    'fr': 'Erreur', 'it': 'Errore'
  },
  'common.success': {
    'pt-BR': 'Sucesso', 'en': 'Success', 'es': 'Éxito',
    'fr': 'Succès', 'it': 'Successo'
  },
  'common.loading': {
    'pt-BR': 'Carregando', 'en': 'Loading', 'es': 'Cargando',
    'fr': 'Chargement', 'it': 'Caricamento'
  },
  'common.add': {
    'pt-BR': 'Adicionar', 'en': 'Add', 'es': 'Añadir',
    'fr': 'Ajouter', 'it': 'Aggiungi'
  },
  'common.back': {
    'pt-BR': 'Voltar', 'en': 'Back', 'es': 'Volver',
    'fr': 'Retour', 'it': 'Indietro'
  },
  'common.next': {
    'pt-BR': 'Próximo', 'en': 'Next', 'es': 'Siguiente',
    'fr': 'Suivant', 'it': 'Avanti'
  },
  'common.previous': {
    'pt-BR': 'Anterior', 'en': 'Previous', 'es': 'Anterior',
    'fr': 'Précédent', 'it': 'Precedente'
  },
  
  // Health Record
  'health.record_title': {
    'pt-BR': 'Prontuário de Saúde', 'en': 'Health Record', 'es': 'Historial de Salud',
    'fr': 'Dossier de Santé', 'it': 'Cartella Clinica'
  },
  'health.vaccines': {
    'pt-BR': 'Vacinas', 'en': 'Vaccines', 'es': 'Vacunas',
    'fr': 'Vaccins', 'it': 'Vaccini'
  },
  'health.parasite_control': {
    'pt-BR': 'Antiparasitários', 'en': 'Parasite Control', 'es': 'Antiparasitarios',
    'fr': 'Antiparasitaires', 'it': 'Antiparassitari'
  },
  'health.grooming': {
    'pt-BR': 'Banho & Tosa', 'en': 'Bath & Grooming', 'es': 'Baño y Peluquería',
    'fr': 'Bain & Toilettage', 'it': 'Bagno e Toelettatura'
  },
  'health.food': {
    'pt-BR': 'Alimentação', 'en': 'Food', 'es': 'Alimentación',
    'fr': 'Alimentation', 'it': 'Alimentazione'
  },
  'health.import_card': {
    'pt-BR': 'Importar Cartão', 'en': 'Import Card', 'es': 'Importar Tarjeta',
    'fr': 'Importer Carte', 'it': 'Importa Tessera'
  },
  'health.quick_add': {
    'pt-BR': 'Preenchimento Rápido', 'en': 'Quick Fill', 'es': 'Llenado Rápido',
    'fr': 'Saisie Rapide', 'it': 'Compilazione Rapida'
  },
  'health.full_form': {
    'pt-BR': 'Formulário Completo', 'en': 'Full Form', 'es': 'Formulario Completo',
    'fr': 'Formulaire Complet', 'it': 'Modulo Completo'
  },
  'health.quick_entry': {
    'pt-BR': 'Entrada Rápida de Vacinas Comuns', 'en': 'Quick Entry for Common Vaccines', 'es': 'Entrada Rápida de Vacunas Comunes',
    'fr': 'Saisie Rapide de Vaccins Courants', 'it': 'Inserimento Rapido Vaccini Comuni'
  },
  'health.click_hint': {
    'pt-BR': 'Clique em uma vacina comum para preencher automaticamente e ajustar apenas os detalhes', 'en': 'Click on a common vaccine to auto-fill and adjust only the details', 'es': 'Haz clic en una vacuna común para autocompletar y ajustar solo los detalles',
    'fr': 'Cliquez sur un vaccin courant pour pré-remplir et ajuster seulement les détails', 'it': 'Fai clic su un vaccino comune per compilare automaticamente e regolare solo i dettagli'
  },
  'health.clear_all': {
    'pt-BR': 'Limpar Todas', 'en': 'Clear All', 'es': 'Limpiar Todas',
    'fr': 'Tout Effacer', 'it': 'Cancella Tutte'
  },
  'health.status_title': {
    'pt-BR': 'Status do Prontuário Atual', 'en': 'Current Record Status', 'es': 'Estado del Historial Actual',
    'fr': 'État du Dossier Actuel', 'it': 'Stato della Cartella Attuale'
  },
  'health.total_vaccines': {
    'pt-BR': 'Total de Vacinas', 'en': 'Total Vaccines', 'es': 'Total de Vacunas',
    'fr': 'Total de Vaccins', 'it': 'Totale Vaccini'
  },
  'health.upcoming': {
    'pt-BR': 'Próximas (60 dias)', 'en': 'Upcoming (60 days)', 'es': 'Próximas (60 días)',
    'fr': 'À Venir (60 jours)', 'it': 'Prossime (60 giorni)'
  },
  'health.overdue': {
    'pt-BR': 'Em Atraso', 'en': 'Overdue', 'es': 'Atrasadas',
    'fr': 'En Retard', 'it': 'In Ritardo'
  },
  'health.full_history': {
    'pt-BR': 'Histórico Completo', 'en': 'Full History', 'es': 'Historial Completo',
    'fr': 'Historique Complet', 'it': 'Storia Completa'
  },
  'health.applied': {
    'pt-BR': 'Aplicada', 'en': 'Applied', 'es': 'Aplicada',
    'fr': 'Administré', 'it': 'Somministrato'
  },
  'health.next': {
    'pt-BR': 'Próxima', 'en': 'Next', 'es': 'Próxima',
    'fr': 'Prochain', 'it': 'Prossimo'
  },
  'health.veterinarian': {
    'pt-BR': 'Veterinário', 'en': 'Veterinarian', 'es': 'Veterinario',
    'fr': 'Vétérinaire', 'it': 'Veterinario'
  },
  'health.added_via_quick': {
    'pt-BR': 'Adicionado via Quick Add', 'en': 'Added via Quick Add', 'es': 'Añadido vía Quick Add',
    'fr': 'Ajouté via Quick Add', 'it': 'Aggiunto tramite Quick Add'
  },
  'health.imported_ocr': {
    'pt-BR': 'Importado via OCR do cartão de vacina', 'en': 'Imported via OCR from vaccine card', 'es': 'Importado vía OCR de la tarjeta de vacunación',
    'fr': 'Importé via OCR de la carte de vaccination', 'it': 'Importato tramite OCR dalla tessera vaccinale'
  },
  'health.history': {
    'pt-BR': 'Histórico', 'en': 'History', 'es': 'Historial',
    'fr': 'Historique', 'it': 'Storico'
  },
  'health.expired': {
    'pt-BR': 'Vencida', 'en': 'Expired', 'es': 'Vencida',
    'fr': 'Expirée', 'it': 'Scaduto'
  },
  'health.booster_overdue': {
    'pt-BR': 'Reforço em atraso', 'en': 'Booster overdue', 'es': 'Refuerzo atrasado',
    'fr': 'Rappel en retard', 'it': 'Richiamo in ritardo'
  },
  'health.disclaimer': {
    'pt-BR': 'Este sistema é apenas para gerenciamento e controle. Consulte seu veterinário para orientação sobre vacinação.', 'en': 'This system is for management and control only. Consult your veterinarian for vaccination guidance.', 'es': 'Este sistema es solo para gestión y control. Consulta a tu veterinario para orientación sobre vacunación.',
    'fr': 'Ce système est uniquement pour la gestion et le contrôle. Consultez votre vétérinaire pour les conseils de vaccination.', 'it': 'Questo sistema è solo per gestione e controllo. Consulta il tuo veterinario per consigli sulle vaccinazioni.'
  },
  'health.add_new_procedure': {
    'pt-BR': 'Adicionar Novo Procedimento', 'en': 'Add New Procedure', 'es': 'Agregar Nuevo Procedimiento',
    'fr': 'Ajouter Nouvelle Procédure', 'it': 'Aggiungi Nuova Procedura'
  },
  'health.applied_date': {
    'pt-BR': 'Aplicado', 'en': 'Applied on', 'es': 'Aplicado',
    'fr': 'Appliqué', 'it': 'Applicato'
  },
  'health.next_date': {
    'pt-BR': 'Próxima', 'en': 'Next', 'es': 'Próxima',
    'fr': 'Prochain', 'it': 'Prossimo'
  },
  'health.collar_expiry': {
    'pt-BR': 'Validade da coleira', 'en': 'Collar expiry', 'es': 'Vencimiento del collar',
    'fr': 'Expiration du collier', 'it': 'Scadenza collare'
  },
  'health.days_overdue': {
    'pt-BR': 'Atrasado', 'en': 'Overdue', 'es': 'Atrasado',
    'fr': 'En retard', 'it': 'In ritardo'
  },
  'health.days_remaining': {
    'pt-BR': 'dias', 'en': 'days', 'es': 'días',
    'fr': 'jours', 'it': 'giorni'
  },
  'health.location_label': {
    'pt-BR': 'Local', 'en': 'Location', 'es': 'Lugar',
    'fr': 'Lieu', 'it': 'Luogo'
  },
  'health.date_label': {
    'pt-BR': 'Data', 'en': 'Date', 'es': 'Fecha',
    'fr': 'Date', 'it': 'Data'
  },
  'health.check_in_date': {
    'pt-BR': 'Data de entrada', 'en': 'Check-in date', 'es': 'Fecha de entrada',
    'fr': 'Date d\'entrée', 'it': 'Data di ingresso'
  },
  
  // Coming Soon Feature Alerts
  'alert.online_consultation_title': {
    'pt-BR': '👨‍⚕️ CONSULTA PARTICULAR ONLINE\n\n�\n\n🔜 Em breve!', 'en': '👨‍⚕️ PRIVATE ONLINE CONSULTATION\n\n💰\n\n🔜 Coming soon!', 'es': '👨‍⚕️ CONSULTA PRIVADA EN LÍNEA\n\n💰\n\n🔜 ¡Próximamente!',
    'fr': '👨‍⚕️ CONSULTATION PRIVÉE EN LIGNE\n\n💰\n\n🔜 Bientôt !', 'it': '👨‍⚕️ CONSULTA PRIVATA ONLINE\n\n💰\n\n🔜 Prossimamente!'
  },
  'alert.online_consultation_features': {
    'pt-BR': '\n\nVocê poderá:\n• Falar com veterinário por vídeo\n• Tirar dúvidas com especialista\n• Orientação profissional\n• Sem sair de casa', 'en': '\n\nYou will be able to:\n• Talk to a vet via video\n• Ask questions to a specialist\n• Professional guidance\n• From the comfort of home', 'es': '\n\nPodrás:\n• Hablar con veterinario por video\n• Hacer preguntas a un especialista\n• Orientación profesional\n• Sin salir de casa',
    'fr': '\n\nVous pourrez :\n• Parler à un vétérinaire par vidéo\n• Poser des questions à un spécialiste\n• Orientation professionnelle\n• Sans sortir de chez vous', 'it': '\n\nPotrai:\n• Parlare con un veterinario tramite video\n• Fare domande a uno specialista\n• Orientamento professionale\n• Senza uscire di casa'
  },
  'alert.share_card_title': {
    'pt-BR': '👥 COMPARTILHAR CARTEIRINHA\n\n🔜 Em breve!', 'en': '👥 SHARE HEALTH CARD\n\n🔜 Coming soon!', 'es': '👥 COMPARTIR CARNET\n\n🔜 ¡Próximamente!',
    'fr': '👥 PARTAGER CARNET\n\n🔜 Bientôt !', 'it': '👥 CONDIVIDI TESSERA\n\n🔜 Prossimamente!'
  },
  'alert.share_card_features': {
    'pt-BR': '\n\nVocê poderá:\n• Compartilhar com família\n• QR Code instantâneo\n• Acesso para cuidadores\n• Histórico completo', 'en': '\n\nYou will be able to:\n• Share with family\n• Instant QR Code\n• Access for caregivers\n• Complete history', 'es': '\n\nPodrás:\n• Compartir con familia\n• Código QR instantáneo\n• Acceso para cuidadores\n• Historial completo',
    'fr': '\n\nVous pourrez :\n• Partager avec la famille\n• QR Code instantané\n• Accès pour les soignants\n• Historique complet', 'it': '\n\nPotrai:\n• Condividere con la famiglia\n• QR Code istantaneo\n• Accesso per i caregiver\n• Storia completa'
  },
  'alert.documents_title': {
    'pt-BR': 'Funcionalidade de Documentos em breve!', 'en': 'Documents feature coming soon!', 'es': '¡Funcionalidad de Documentos próximamente!',
    'fr': 'Fonctionnalité Documents bientôt !', 'it': 'Funzionalità Documenti prossimamente!'
  },
  'alert.documents_features': {
    'pt-BR': '\n\nAqui você poderá armazenar:\n• Exames laboratoriais\n• Laudos veterinários\n• Certificados de vacinação\n• RG Pet e Microchip', 'en': '\n\nHere you can store:\n• Lab tests\n• Veterinary reports\n• Vaccination certificates\n• Pet ID and Microchip', 'es': '\n\nAquí podrás almacenar:\n• Exámenes de laboratorio\n• Informes veterinarios\n• Certificados de vacunación\n• ID de Mascota y Microchip',
    'fr': '\n\nVous pourrez stocker :\n• Analyses de laboratoire\n• Rapports vétérinaires\n• Certificats de vaccination\n• ID Animal et Puce', 'it': '\n\nQui potrai archiviare:\n• Test di laboratorio\n• Referti veterinari\n• Certificati di vaccinazione\n• ID Pet e Microchip'
  },
  'alert.vet_documents_title': {
    'pt-BR': 'Arquivo Veterinário em desenvolvimento!', 'en': 'Veterinary Archive in development!', 'es': '¡Archivo Veterinario en desarrollo!',
    'fr': 'Archive Vétérinaire en développement !', 'it': 'Archivio Veterinario in sviluppo!'
  },
  'alert.vet_documents_features': {
    'pt-BR': '\n\nEm breve você poderá:\n• Organizar todos os documentos vet\n• Upload de fotos e PDFs\n• Busca inteligente por data/tipo\n• Backup automático na nuvem\n• Compartilhar com veterinários', 'en': '\n\nSoon you will be able to:\n• Organize all vet documents\n• Upload photos and PDFs\n• Smart search by date/type\n• Automatic cloud backup\n• Share with veterinarians', 'es': '\n\nPronto podrás:\n• Organizar todos los documentos vet\n• Subir fotos y PDFs\n• Búsqueda inteligente por fecha/tipo\n• Respaldo automático en la nube\n• Compartir con veterinarios',
    'fr': '\n\nBientôt vous pourrez :\n• Organiser tous les documents vét\n• Télécharger photos et PDF\n• Recherche intelligente par date/type\n• Sauvegarde automatique cloud\n• Partager avec vétérinaires', 'it': '\n\nProssimamente potrai:\n• Organizzare tutti i documenti vet\n• Caricare foto e PDF\n• Ricerca intelligente per data/tipo\n• Backup automatico nel cloud\n• Condividere con veterinari'
  },
  'alert.arrival_vaccine_registered': {
    'pt-BR': '✅ Formulário pré-preenchido com a vacina atrasada:', 'en': '✅ Form pre-filled with overdue vaccine:', 'es': '✅ Formulario pre-llenado con vacuna atrasada:',
    'fr': '✅ Formulaire pré-rempli avec vaccin en retard :', 'it': '✅ Modulo precompilato con vaccino in ritardo:'
  },
  'alert.arrival_vaccine_message': {
    'pt-BR': 'Revise e confirme!', 'en': 'Review and confirm!', 'es': '¡Revisa y confirma!',
    'fr': 'Vérifiez et confirmez !', 'it': 'Rivedi e conferma!'
  },
  'alert.arrival_data_prefilled': {
    'pt-BR': '✅ Dados pré-preenchidos:', 'en': '✅ Data pre-filled:', 'es': '✅ Datos pre-llenados:',
    'fr': '✅ Données pré-remplies :', 'it': '✅ Dati precompilati:'
  },
  'alert.arrival_fill_details': {
    'pt-BR': 'Preencha o tipo, nome da vacina e veterinário!', 'en': 'Fill in the type, vaccine name and veterinarian!', 'es': '¡Completa el tipo, nombre de vacuna y veterinario!',
    'fr': 'Remplissez le type, nom du vaccin et vétérinaire !', 'it': 'Compila il tipo, nome del vaccino e veterinario!'
  },
  'alert.arrival_grooming_registered': {
    'pt-BR': '✅ Dados pré-preenchidos automaticamente:', 'en': '✅ Data prefilled automatically:', 'es': '✅ Datos pre-llenados automáticamente:',
    'fr': '✅ Données pré-remplies automatiquement :', 'it': '✅ Dati precompilati automaticamente:'
  },
  'alert.arrival_fill_service_type': {
    'pt-BR': 'Preencha apenas o tipo de serviço!', 'en': 'Just fill in the service type!', 'es': '¡Solo completa el tipo de servicio!',
    'fr': 'Remplissez uniquement le type de service !', 'it': 'Compila solo il tipo di servizio!'
  },
  'alert.arrival_parasite_registered': {
    'pt-BR': '✅ Formulário pré-preenchido com o produto atrasado:', 'en': '✅ Form pre-filled with overdue product:', 'es': '✅ Formulario pre-llenado con producto atrasado:',
    'fr': '✅ Formulaire pré-rempli avec produit en retard :', 'it': '✅ Modulo precompilato con prodotto in ritardo:'
  },
  'alert.arrival_fill_product': {
    'pt-BR': 'Preencha o produto comprado!', 'en': 'Fill in the product purchased!', 'es': '¡Completa el producto comprado!',
    'fr': 'Remplissez le produit acheté !', 'it': 'Compila il prodotto acquistato!'
  },
  'alert.consultation_registered': {
    'pt-BR': '🩺 Consulta registrada!', 'en': '🩺 Consultation registered!', 'es': '🩺 ¡Consulta registrada!',
    'fr': '🩺 Consultation enregistrée !', 'it': '🩺 Consulta registrata!'
  },
  'alert.procedure_registered': {
    'pt-BR': '🔬 Procedimento registrado!', 'en': '🔬 Procedure registered!', 'es': '🔬 ¡Procedimiento registrado!',
    'fr': '🔬 Procédure enregistrée !', 'it': '🔬 Procedura registrata!'
  },
  'alert.exams_registered': {
    'pt-BR': '🧪 Exames registrados!', 'en': '🧪 Exams registered!', 'es': '🧪 ¡Exámenes registrados!',
    'fr': '🧪 Examens enregistrés !', 'it': '🧪 Esami registrati!'
  },
  'alert.accommodation_registered': {
    'pt-BR': '🏨 Hospedagem registrada!', 'en': '🏨 Accommodation registered!', 'es': '🏨 ¡Hospedaje registrado!',
    'fr': '🏨 Hébergement enregistré !', 'it': '🏨 Alloggio registrato!'
  },
  'alert.add_more_details': {
    'pt-BR': '✅ Em breve você poderá adicionar mais detalhes.', 'en': '✅ Soon you will be able to add more details.', 'es': '✅ Pronto podrás agregar más detalles.',
    'fr': '✅ Bientôt vous pourrez ajouter plus de détails.', 'it': '✅ Presto potrai aggiungere più dettagli.'
  },
  'alert.add_more_info': {
    'pt-BR': '✅ Em breve você poderá adicionar data de saída, valor e observações.', 'en': '✅ Soon you will be able to add check-out date, cost and notes.', 'es': '✅ Pronto podrás agregar fecha de salida, costo y observaciones.',
    'fr': '✅ Bientôt vous pourrez ajouter date de sortie, coût et notes.', 'it': '✅ Presto potrai aggiungere data di uscita, costo e note.'
  },
  
  // Feedback System
  'feedback.help_improve': {
    'pt-BR': 'Ajude-nos a melhorar o sistema de leitura! Indique o que está incorreto nesta vacina:', 'en': 'Help us improve the reading system! Indicate what is incorrect in this vaccine:', 'es': '¡Ayúdanos a mejorar el sistema de lectura! Indica qué es incorrecto en esta vacuna:',
    'fr': 'Aidez-nous à améliorer le système de lecture ! Indiquez ce qui est incorrect dans ce vaccin :', 'it': 'Aiutaci a migliorare il sistema di lettura! Indica cosa è errato in questo vaccino:'
  },
  'feedback.vaccine_label': {
    'pt-BR': 'Vacina:', 'en': 'Vaccine:', 'es': 'Vacuna:',
    'fr': 'Vaccin :', 'it': 'Vaccino:'
  },
  'feedback.correction_success': {
    'pt-BR': '✅ Correção aplicada com sucesso!\n\nVocê está ajudando a melhorar o sistema de leitura.', 'en': '✅ Correction applied successfully!\n\nYou are helping to improve the reading system.', 'es': '✅ ¡Corrección aplicada con éxito!\n\nEstás ayudando a mejorar el sistema de lectura.',
    'fr': '✅ Correction appliquée avec succès !\n\nVous aidez à améliorer le système de lecture.', 'it': '✅ Correzione applicata con successo!\n\nStai aiutando a migliorare il sistema di lettura.'
  },
  'feedback.ocr_error': {
    'pt-BR': 'Erro ao analisar o(s) cartão(ões) de vacina.', 'en': 'Error analyzing vaccine card(s).', 'es': 'Error al analizar la(s) tarjeta(s) de vacunación.',
    'fr': 'Erreur lors de l\'analyse de la/des carte(s) de vaccination.', 'it': 'Errore nell\'analisi della/e tessera/e vaccinale/i.'
  },
  'feedback.try_again_clearer': {
    'pt-BR': 'Tente novamente ou tire uma foto mais clara.', 'en': 'Try again or take a clearer photo.', 'es': 'Intenta de nuevo o toma una foto más clara.',
    'fr': 'Réessayez ou prenez une photo plus claire.', 'it': 'Riprova o scatta una foto più chiara.'
  },
  'feedback.photo_instructions': {
    'pt-BR': '📸 <strong>Tire uma foto clara da carteirinha</strong> para extrair os dados automaticamente.<br/>⚠️ <strong>"Se não leu, deixa em branco"</strong> - campos não confiáveis ficarão vazios para você preencher.', 'en': '📸 <strong>Take a clear photo of the card</strong> to extract data automatically.<br/>⚠️ <strong>"If it didn\'t read, leave it blank"</strong> - unreliable fields will be empty for you to fill.', 'es': '📸 <strong>Toma una foto clara del carnet</strong> para extraer datos automáticamente.<br/>⚠️ <strong>"Si no leyó, déjalo en blanco"</strong> - los campos no confiables quedarán vacíos para que los completes.',
    'fr': '📸 <strong>Prenez une photo claire de la carte</strong> pour extraire les données automatiquement.<br/>⚠️ <strong>"Si elle n\'a pas lu, laissez vide"</strong> - les champs non fiables seront vides pour que vous les remplissiez.', 'it': '📸 <strong>Scatta una foto chiara della tessera</strong> per estrarre i dati automaticamente.<br/>⚠️ <strong>"Se non ha letto, lascia vuoto"</strong> - i campi inaffidabili saranno vuoti per te da compilare.'
  },
  'feedback.what_incorrect': {
    'pt-BR': 'O que está incorreto? *', 'en': 'What is incorrect? *', 'es': '¿Qué es incorrecto? *',
    'fr': 'Qu\'est-ce qui est incorrect ? *', 'it': 'Cosa è errato? *'
  },
  'feedback.field_vaccine_name': {
    'pt-BR': 'Nome da vacina', 'en': 'Vaccine name', 'es': 'Nombre de la vacuna',
    'fr': 'Nom du vaccin', 'it': 'Nome del vaccino'
  },
  'feedback.field_brand': {
    'pt-BR': 'Marca comercial', 'en': 'Commercial brand', 'es': 'Marca comercial',
    'fr': 'Marque commerciale', 'it': 'Marca commerciale'
  },
  'feedback.field_type': {
    'pt-BR': 'Tipo (Raiva, Múltipla, etc.)', 'en': 'Type (Rabies, Multiple, etc.)', 'es': 'Tipo (Rabia, Múltiple, etc.)',
    'fr': 'Type (Rage, Multiple, etc.)', 'it': 'Tipo (Rabbia, Multiplo, ecc.)'
  },
  'feedback.field_date_administered': {
    'pt-BR': 'Data de aplicação', 'en': 'Application date', 'es': 'Fecha de aplicación',
    'fr': 'Date d\'application', 'it': 'Data di applicazione'
  },
  'feedback.field_next_dose': {
    'pt-BR': 'Data de reforço', 'en': 'Booster date', 'es': 'Fecha de refuerzo',
    'fr': 'Date de rappel', 'it': 'Data di richiamo'
  },
  'feedback.field_veterinarian': {
    'pt-BR': 'Veterinário', 'en': 'Veterinarian', 'es': 'Veterinario',
    'fr': 'Vétérinaire', 'it': 'Veterinario'
  },
  'feedback.detected_value': {
    'pt-BR': 'Valor detectado (incorreto)', 'en': 'Detected value (incorrect)', 'es': 'Valor detectado (incorrecto)',
    'fr': 'Valeur détectée (incorrecte)', 'it': 'Valore rilevato (errato)'
  },
  'feedback.correct_value': {
    'pt-BR': 'Valor correto *', 'en': 'Correct value *', 'es': 'Valor correcto *',
    'fr': 'Valeur correcte *', 'it': 'Valore corretto *'
  },
  'feedback.placeholder_correct': {
    'pt-BR': 'Digite o valor correto', 'en': 'Enter the correct value', 'es': 'Ingresa el valor correcto',
    'fr': 'Entrez la valeur correcte', 'it': 'Inserisci il valore corretto'
  },
  'feedback.additional_comment': {
    'pt-BR': 'Comentário adicional (opcional)', 'en': 'Additional comment (optional)', 'es': 'Comentario adicional (opcional)',
    'fr': 'Commentaire additionnel (facultatif)', 'it': 'Commento aggiuntivo (opzionale)'
  },
  'feedback.placeholder_comment': {
    'pt-BR': 'Ex: A marca é \'Nobivac Raiva\', não \'Nobivac R\'', 'en': 'Ex: The brand is \'Nobivac Rabies\', not \'Nobivac R\'', 'es': 'Ej: La marca es \'Nobivac Rabia\', no \'Nobivac R\'',
    'fr': 'Ex : La marque est \'Nobivac Rage\', pas \'Nobivac R\'', 'it': 'Es: La marca è \'Nobivac Rabbia\', non \'Nobivac R\''
  },
  'feedback.send_correction': {
    'pt-BR': 'Enviar Correção', 'en': 'Send Correction', 'es': 'Enviar Corrección',
    'fr': 'Envoyer la Correction', 'it': 'Invia Correzione'
  },
  'feedback.help_all_users': {
    'pt-BR': '💡 Suas correções ajudam a melhorar a precisão do sistema para todos os usuários!', 'en': '💡 Your corrections help improve system accuracy for all users!', 'es': '💡 ¡Tus correcciones ayudan a mejorar la precisión del sistema para todos los usuarios!',
    'fr': '💡 Vos corrections aident à améliorer la précision du système pour tous les utilisateurs !', 'it': '💡 Le tue correzioni aiutano a migliorare la precisione del sistema per tutti gli utenti!'
  },
  'feedback.error_send': {
    'pt-BR': '❌ Erro ao enviar correção. Tente novamente.', 'en': '❌ Error sending correction. Try again.', 'es': '❌ Error al enviar corrección. Intenta de nuevo.',
    'fr': '❌ Erreur lors de l\'envoi de la correction. Réessayez.', 'it': '❌ Errore nell\'invio della correzione. Riprova.'
  },
  'feedback.error_connection': {
    'pt-BR': '❌ Erro ao enviar correção. Verifique sua conexão.', 'en': '❌ Error sending correction. Check your connection.', 'es': '❌ Error al enviar corrección. Verifica tu conexión.',
    'fr': '❌ Erreur lors de l\'envoi de la correction. Vérifiez votre connexion.', 'it': '❌ Errore nell\'invio della correzione. Controlla la tua connessione.'
  },
  
  // Import Card Modal
  'import.title': {
    'pt-BR': 'Importar Cartão de Vacina', 'en': 'Import Vaccine Card', 'es': 'Importar Tarjeta de Vacunación',
    'fr': 'Importer Carte de Vaccination', 'it': 'Importa Tessera Vaccinale'
  },
  'import.system_will': {
    'pt-BR': 'O sistema vai:', 'en': 'The system will:', 'es': 'El sistema hará:',
    'fr': 'Le système va :', 'it': 'Il sistema farà:'
  },
  'import.identify_auto': {
    'pt-BR': 'Identificar vacinas automaticamente', 'en': 'Identify vaccines automatically', 'es': 'Identificar vacunas automáticamente',
    'fr': 'Identifier automatiquement les vaccins', 'it': 'Identificare automaticamente i vaccini'
  },
  'import.extract_data': {
    'pt-BR': 'Extrair datas e informações', 'en': 'Extract dates and information', 'es': 'Extraer fechas e información',
    'fr': 'Extraire dates et informations', 'it': 'Estrarre date e informazioni'
  },
  'import.create_digital': {
    'pt-BR': 'Criar seu prontuário digital', 'en': 'Create your digital record', 'es': 'Crear tu historial digital',
    'fr': 'Créer votre dossier numérique', 'it': 'Creare la tua cartella digitale'
  },
  'import.take_photo': {
    'pt-BR': 'Tirar Foto', 'en': 'Take Photo', 'es': 'Tomar Foto',
    'fr': 'Prendre Photo', 'it': 'Scatta Foto'
  },
  'import.use_camera': {
    'pt-BR': 'Usar câmera', 'en': 'Use camera', 'es': 'Usar cámara',
    'fr': 'Utiliser caméra', 'it': 'Usa fotocamera'
  },
  'import.gallery': {
    'pt-BR': 'Galeria', 'en': 'Gallery', 'es': 'Galería',
    'fr': 'Galerie', 'it': 'Galleria'
  },
  'import.multiple_photos': {
    'pt-BR': 'Várias fotos', 'en': 'Multiple photos', 'es': 'Varias fotos',
    'fr': 'Plusieurs photos', 'it': 'Più foto'
  },
  'import.photo_limit': {
    'pt-BR': 'Limite de fotos', 'en': 'Photo limit', 'es': 'Límite de fotos',
    'fr': 'Limite de photos', 'it': 'Limite di foto'
  },
  'import.recommended': {
    'pt-BR': 'recomendado', 'en': 'recommended', 'es': 'recomendado',
    'fr': 'recommandé', 'it': 'consigliato'
  },
  'import.important_note': {
    'pt-BR': 'Atenção importante:', 'en': 'Important note:', 'es': 'Nota importante:',
    'fr': 'Note importante :', 'it': 'Nota importante:'
  },
  'import.accuracy_warning': {
    'pt-BR': 'Alguns cartões podem não ser lidos com total exatidão, dependendo da qualidade da foto, caligrafia e formato.\nVocê é responsável por revisar e corrigir os dados importados antes de confiar neles.',
    'en': 'Some cards may not be read with complete accuracy, depending on photo quality, handwriting, and format.\nYou are responsible for reviewing and correcting imported data before relying on it.',
    'es': 'Algunas tarjetas pueden no leerse con total precisión, dependiendo de la calidad de la foto, caligrafía y formato.\nEres responsable de revisar y corregir los datos importados antes de confiar en ellos.',
    'fr': 'Certaines cartes peuvent ne pas être lues avec une précision totale, selon la qualité de la photo, de l\'écriture et du format.\nVous êtes responsable de vérifier et corriger les données importées avant de vous y fier.',
    'it': 'Alcune tessere potrebbero non essere lette con totale precisione, a seconda della qualità della foto, della calligrafia e del formato.\nSei responsabile di rivedere e correggere i dati importati prima di affidarti ad essi.'
  },
  'import.tips_title': {
    'pt-BR': 'Dicas para melhor resultado:', 'en': 'Tips for best results:', 'es': 'Consejos para mejores resultados:',
    'fr': 'Conseils pour de meilleurs résultats :', 'it': 'Consigli per risultati migliori:'
  },
  
  // Quick Add Modal 
  'quick_add.title': {
    'pt-BR': 'Preenchimento Rápido de Vacina', 'en': 'Quick Fill Vaccine', 'es': 'Llenado Rápido de Vacuna',
    'fr': 'Saisie Rapide Vaccin', 'it': 'Compilazione Rapida Vaccino'
  },
  'quick_add.subtitle': {
    'pt-BR': 'Registre vacinas comuns em segundos!', 'en': 'Register common vaccines in seconds!', 'es': '¡Registra vacunas comunes en segundos!',
    'fr': 'Enregistrez des vaccins courants en quelques secondes !', 'it': 'Registra vaccini comuni in pochi secondi!'
  },
  'quick_add.when_applied': {
    'pt-BR': 'Quando foi aplicada?', 'en': 'When was it applied?', 'es': '¿Cuándo se aplicó?',
    'fr': 'Quand a-t-il été administré ?', 'it': 'Quando è stato somministrato?'
  },
  'quick_add.select_vaccine': {
    'pt-BR': 'Selecione a vacina:', 'en': 'Select vaccine:', 'es': 'Selecciona la vacuna:',
    'fr': 'Sélectionnez le vaccin :', 'it': 'Seleziona il vaccino:'
  },
  'quick_add.or_type': {
    'pt-BR': 'Ou digite outro nome...', 'en': 'Or type another name...', 'es': 'O escribe otro nombre...',
    'fr': 'Ou saisissez un autre nom...', 'it': 'O digita un altro nome...'
  },
  'quick_add.booster': {
    'pt-BR': 'Reforço', 'en': 'Booster', 'es': 'Refuerzo',
    'fr': 'Rappel', 'it': 'Richiamo'
  },
  'quick_add.protocol_calc': {
    'pt-BR': 'Data pelo protocolo', 'en': 'Date by protocol', 'es': 'Fecha por protocolo',
    'fr': 'Date par protocole', 'it': 'Data da protocollo'
  },
  'quick_add.select_vet_first': {
    'pt-BR': 'Selecione ou digite o veterinário primeiro', 'en': 'Select or type veterinarian first', 'es': 'Selecciona o escribe el veterinario primero',
    'fr': 'Sélectionnez ou saisissez le vétérinaire d\'abord', 'it': 'Seleziona o digita il veterinario prima'
  },
  
  // New Vaccine Form
  'vaccine_form.title': {
    'pt-BR': 'Nova Vacina', 'en': 'New Vaccine', 'es': 'Nueva Vacuna',
    'fr': 'Nouveau Vaccin', 'it': 'Nuovo Vaccino'
  },
  'vaccine_form.read_card': {
    'pt-BR': 'Ler carteirinha', 'en': 'Read card', 'es': 'Leer tarjeta',
    'fr': 'Lire carte', 'it': 'Leggi tessera'
  },
  'vaccine_form.vaccine_type': {
    'pt-BR': 'Tipo de Vacina', 'en': 'Vaccine Type', 'es': 'Tipo de Vacuna',
    'fr': 'Type de Vaccin', 'it': 'Tipo di Vaccino'
  },
  'vaccine_form.vaccine_name': {
    'pt-BR': 'Nome da Vacina', 'en': 'Vaccine Name', 'es': 'Nombre de la Vacuna',
    'fr': 'Nom du Vaccin', 'it': 'Nome del Vaccino'
  },
  'vaccine_form.application_date': {
    'pt-BR': 'Data de Aplicação', 'en': 'Application Date', 'es': 'Fecha de Aplicación',
    'fr': 'Date d\'Administration', 'it': 'Data di Somministrazione'
  },
  'vaccine_form.revaccination': {
    'pt-BR': 'Revacinação', 'en': 'Revaccination', 'es': 'Revacunación',
    'fr': 'Revaccination', 'it': 'Rivaccinazione'
  },
  'vaccine_form.observations': {
    'pt-BR': 'Observações', 'en': 'Observations', 'es': 'Observaciones',
    'fr': 'Observations', 'it': 'Osservazioni'
  },
  'vaccine_form.add_vaccine': {
    'pt-BR': 'Adicionar Vacina', 'en': 'Add Vaccine', 'es': 'Añadir Vacuna',
    'fr': 'Ajouter Vaccin', 'it': 'Aggiungi Vaccino'
  },
  
  // Service Type Modal
  'service_modal.title': {
    'pt-BR': 'O que você precisa?', 'en': 'What do you need?', 'es': '¿Qué necesitas?',
    'fr': 'De quoi avez-vous besoin ?', 'it': 'Di cosa hai bisogno?'
  },
  'service_modal.choose': {
    'pt-BR': 'Escolha o tipo de serviço que você está procurando:', 'en': 'Choose the type of service you are looking for:', 'es': 'Elige el tipo de servicio que buscas:',
    'fr': 'Choisissez le type de service que vous recherchez :', 'it': 'Scegli il tipo di servizio che stai cercando:'
  },
  'service_modal.emergency': {
    'pt-BR': 'Emergência Veterinária 24h', 'en': '24h Veterinary Emergency', 'es': 'Emergencia Veterinaria 24h',
    'fr': 'Urgence Vétérinaire 24h', 'it': 'Emergenza Veterinaria 24h'
  },
  'service_modal.clinics': {
    'pt-BR': 'Clínicas Veterinárias', 'en': 'Veterinary Clinics', 'es': 'Clínicas Veterinarias',
    'fr': 'Cliniques Vétérinaires', 'it': 'Cliniche Veterinarie'
  },
  'service_modal.petshops': {
    'pt-BR': 'Petshops & Banho e Tosa', 'en': 'Pet Shops & Grooming', 'es': 'Petshops y Peluquería',
    'fr': 'Animaleries & Toilettage', 'it': 'Pet Shop e Toelettatura'
  },
  'service_modal.hotels': {
    'pt-BR': 'Hotelzinho Pet', 'en': 'Pet Hotel', 'es': 'Hotel para Mascotas',
    'fr': 'Hôtel pour Animaux', 'it': 'Hotel per Animali'
  },
  'service_modal.daycare': {
    'pt-BR': 'Creche & Day Care', 'en': 'Daycare & Day Care', 'es': 'Guardería',
    'fr': 'Garderie', 'it': 'Asilo'
  },

  // Grooming Modal
  'grooming.edit_record': {
    'pt-BR': 'Editar Registro', 'en': 'Edit Record', 'es': 'Editar Registro',
    'fr': 'Modifier Enregistrement', 'it': 'Modifica Registro'
  },
  'grooming.bath': {
    'pt-BR': 'Banho', 'en': 'Bath', 'es': 'Baño',
    'fr': 'Bain', 'it': 'Bagno'
  },
  'grooming.grooming': {
    'pt-BR': 'Tosa', 'en': 'Grooming', 'es': 'Peluquería',
    'fr': 'Toilettage', 'it': 'Toelettatura'
  },
  'grooming.complete': {
    'pt-BR': 'Completo', 'en': 'Complete', 'es': 'Completo',
    'fr': 'Complet', 'it': 'Completo'
  },
  'grooming.service_type': {
    'pt-BR': 'Tipo de Serviço', 'en': 'Service Type', 'es': 'Tipo de Servicio',
    'fr': 'Type de Service', 'it': 'Tipo di Servizio'
  },
  'grooming.service_date': {
    'pt-BR': 'Data do Serviço', 'en': 'Service Date', 'es': 'Fecha del Servicio',
    'fr': 'Date du Service', 'it': 'Data del Servizio'
  },
  'grooming.location': {
    'pt-BR': 'Petshop 🏪', 'en': 'Petshop 🏪', 'es': 'Tienda 🏪',
    'fr': 'Animalerie 🏪', 'it': 'Petshop 🏪'
  },
  'grooming.location_placeholder': {
    'pt-BR': 'Digite o Nome do Petshop', 'en': 'Enter the PetShop Name', 'es': 'Escribe el Nombre de la Tienda',
    'fr': 'Entrez le Nom de l\'Animalerie', 'it': 'Inserisci il Nome del Petshop'
  },
  'grooming.establishment_selected': {
    'pt-BR': '✓ Estabelecimento Selecionado', 'en': '✓ Establishment Selected', 'es': '✓ Establecimiento Seleccionado',
    'fr': '✓ Établissement Sélectionné', 'it': '✓ Struttura Selezionata'
  },
  'grooming.clear_selection': {
    'pt-BR': 'Limpar seleção', 'en': 'Clear selection', 'es': 'Limpiar selección',
    'fr': 'Effacer sélection', 'it': 'Cancella selezione'
  },
  'grooming.professional': {
    'pt-BR': 'Profissional', 'en': 'Professional', 'es': 'Profesional',
    'fr': 'Professionnel', 'it': 'Professionista'
  },
  'grooming.professional_placeholder': {
    'pt-BR': 'Nome do tosador/banhista', 'en': 'Groomer/bather name', 'es': 'Nombre del peluquero',
    'fr': 'Nom du toiletteur', 'it': 'Nome del toelettatore'
  },
  'grooming.cost': {
    'pt-BR': 'Custo (R$)', 'en': 'Cost ($)', 'es': 'Costo ($)',
    'fr': 'Coût (€)', 'it': 'Costo (€)'
  },
  'grooming.next_in_days': {
    'pt-BR': 'Próximo em (dias)', 'en': 'Next in (days)', 'es': 'Próximo en (días)',
    'fr': 'Prochain dans (jours)', 'it': 'Prossimo tra (giorni)'
  },
  'grooming.notes_placeholder': {
    'pt-BR': 'Anotações sobre o serviço...', 'en': 'Service notes...', 'es': 'Notas del servicio...',
    'fr': 'Notes sur le service...', 'it': 'Note sul servizio...'
  },
  'grooming.update': {
    'pt-BR': 'Atualizar', 'en': 'Update', 'es': 'Actualizar',
    'fr': 'Mettre à jour', 'it': 'Aggiorna'
  },

  // Parasite Control
  'parasite.new_record': {
    'pt-BR': 'Novo Registro', 'en': 'New Record', 'es': 'Nuevo Registro',
    'fr': 'Nouvel Enregistrement', 'it': 'Nuovo Registro'
  },
  'parasite.edit_record': {
    'pt-BR': 'Editar Registro', 'en': 'Edit Record', 'es': 'Editar Registro',
    'fr': 'Modifier Enregistrement', 'it': 'Modifica Registro'
  },
  'parasite.reminders_organizational': {
    'pt-BR': 'Lembretes são apenas organizacionais.', 'en': 'Reminders are organizational only.', 'es': 'Los recordatorios son solo organizativos.',
    'fr': 'Les rappels sont uniquement organisationnels.', 'it': 'I promemoria sono solo organizzativi.'
  },
  'parasite.consult_vet': {
    'pt-BR': 'Para informações sobre uso correto, dosagens e indicações, consulte sempre um veterinário.', 'en': 'For correct use, dosages and indications, always consult a veterinarian.', 'es': 'Para información sobre uso correcto, dosis e indicaciones, consulte siempre a un veterinario.',
    'fr': 'Pour les informations sur l\'utilisation correcte, les dosages et les indications, consultez toujours un vétérinaire.', 'it': 'Per informazioni su uso corretto, dosaggi e indicazioni, consulta sempre un veterinario.'
  },
  'parasite.control_type': {
    'pt-BR': 'Tipo de Controle', 'en': 'Control Type', 'es': 'Tipo de Control',
    'fr': 'Type de Contrôle', 'it': 'Tipo di Controllo'
  },
  'parasite.dewormer': {
    'pt-BR': 'Controle de Vermes', 'en': 'Dewormer', 'es': 'Desparasitante',
    'fr': 'Vermifuge', 'it': 'Vermifugo'
  },
  'parasite.dewormer_subtitle': {
    'pt-BR': 'Comprimidos ou líquidos', 'en': 'Tablets or liquids', 'es': 'Comprimidos o líquidos',
    'fr': 'Comprimés ou liquides', 'it': 'Compresse o liquidi'
  },
  'parasite.flea_tick': {
    'pt-BR': 'Antipulgas/Carrapatos', 'en': 'Flea/Tick Control', 'es': 'Antipulgas/Garrapatas',
    'fr': 'Anti-puces/Tiques', 'it': 'Antipulci/Zecche'
  },
  'parasite.flea_tick_subtitle': {
    'pt-BR': 'Pipetas, comprimidos ou coleiras', 'en': 'Pipettes, tablets or collars', 'es': 'Pipetas, comprimidos o collares',
    'fr': 'Pipettes, comprimés ou colliers', 'it': 'Pipette, compresse o collari'
  },
  'parasite.collar': {
    'pt-BR': 'Coleira Repelente (Leishmaniose)', 'en': 'Repellent Collar (Leishmaniasis)', 'es': 'Collar Repelente (Leishmaniasis)',
    'fr': 'Collier Répulsif (Leishmaniose)', 'it': 'Collare Repellente (Leishmaniosi)'
  },
  'parasite.collar_subtitle': {
    'pt-BR': 'Proteção contra mosquito-palha', 'en': 'Protection against sandflies', 'es': 'Protección contra mosquito flebótomo',
    'fr': 'Protection contre les phlébotomes', 'it': 'Protezione contro pappataci'
  },
  'parasite.selected': {
    'pt-BR': 'Selecionado:', 'en': 'Selected:', 'es': 'Seleccionado:',
    'fr': 'Sélectionné :', 'it': 'Selezionato:'
  },
  'parasite.configure_per_vet': {
    'pt-BR': 'Configure conforme orientação do seu veterinário e instruções da embalagem', 'en': 'Configure according to veterinarian guidance and package instructions', 'es': 'Configure según la orientación del veterinario y las instrucciones del paquete',
    'fr': 'Configurez selon les conseils du vétérinaire et les instructions de l\'emballage', 'it': 'Configura secondo l\'orientamento del veterinario e le istruzioni della confezione'
  },
  'parasite.type_or_choose': {
    'pt-BR': 'Digite ou escolha da lista', 'en': 'Type or choose from list', 'es': 'Escribe o elige de la lista',
    'fr': 'Saisissez ou choisissez dans la liste', 'it': 'Digita o scegli dall\'elenco'
  },
  'parasite.application_date': {
    'pt-BR': 'Data de Aplicação', 'en': 'Application Date', 'es': 'Fecha de Aplicación',
    'fr': 'Date d\'Application', 'it': 'Data di Applicazione'
  },
  'parasite.collar_date': {
    'pt-BR': 'Data que colocou a coleira', 'en': 'Collar placement date', 'es': 'Fecha que colocó el collar',
    'fr': 'Date de mise en place du collier', 'it': 'Data di posizionamento del collare'
  },

  // Veterinary History
  'vet_history.title': {
    'pt-BR': 'Histórico Veterinário', 'en': 'Veterinary History', 'es': 'Historial Veterinario',
    'fr': 'Historique Vétérinaire', 'it': 'Storia Veterinaria'
  },
  'vet_history.all_consultations': {
    'pt-BR': 'Todas as consultas e procedimentos', 'en': 'All consultations and procedures', 'es': 'Todas las consultas y procedimientos',
    'fr': 'Toutes les consultations et procédures', 'it': 'Tutte le consultazioni e procedure'
  },

  // Home Management Section
  'home.management_controls': {
    'pt-BR': 'Gerenciamento e Controles', 'en': 'Management & Controls', 'es': 'Gestión y Controles',
    'fr': 'Gestion et Contrôles', 'it': 'Gestione e Controlli'
  },
  'home.health_card': {
    'pt-BR': 'Saúde', 'en': 'Health', 'es': 'Salud',
    'fr': 'Santé', 'it': 'Salute'
  },

  // Pet Tabs
  'pet_tabs.slide_to_navigate': {
    'pt-BR': 'Deslize para navegar', 'en': 'Swipe to navigate', 'es': 'Desliza para navegar',
    'fr': 'Glisser pour naviguer', 'it': 'Scorri per navigare'
  },

  // Pet Card (RG) Labels
  'pet_card.age': {
    'pt-BR': 'Idade', 'en': 'Age', 'es': 'Edad',
    'fr': 'Âge', 'it': 'Età'
  },
  'pet_card.sex': {
    'pt-BR': 'Sexo', 'en': 'Sex', 'es': 'Sexo',
    'fr': 'Sexe', 'it': 'Sesso'
  },
  'pet_card.weight': {
    'pt-BR': 'Peso', 'en': 'Weight', 'es': 'Peso',
    'fr': 'Poids', 'it': 'Peso'
  },
  'pet_card.breed': {
    'pt-BR': 'Raça', 'en': 'Breed', 'es': 'Raza',
    'fr': 'Race', 'it': 'Razza'
  },
  'pet_card.color': {
    'pt-BR': 'Cor', 'en': 'Color', 'es': 'Color',
    'fr': 'Couleur', 'it': 'Colore'
  },

  // Grooming Extended
  'grooming.new_service': {
    'pt-BR': 'Registrar Novo Serviço', 'en': 'Register New Service', 'es': 'Registrar Nuevo Servicio',
    'fr': 'Enregistrer Nouveau Service', 'it': 'Registra Nuovo Servizio'
  },
  'grooming.edit_service': {
    'pt-BR': 'Editar Registro', 'en': 'Edit Record', 'es': 'Editar Registro',
    'fr': 'Modifier l\'Enregistrement', 'it': 'Modifica Registro'
  },
  'grooming.cancel_edit': {
    'pt-BR': 'Cancelar edição', 'en': 'Cancel edit', 'es': 'Cancelar edición',
    'fr': 'Annuler la modification', 'it': 'Annulla modifica'
  },
  'grooming.service_type_label': {
    'pt-BR': 'Tipo de Serviço', 'en': 'Service Type', 'es': 'Tipo de Servicio',
    'fr': 'Type de Service', 'it': 'Tipo di Servizio'
  },
  'grooming.grooming_only': {
    'pt-BR': 'Tosa', 'en': 'Grooming', 'es': 'Peluquería',
    'fr': 'Toilettage', 'it': 'Toelettatura'
  },
  'grooming.bath_grooming': {
    'pt-BR': 'Completo', 'en': 'Complete', 'es': 'Completo',
    'fr': 'Complet', 'it': 'Completo'
  },
  'grooming.service_date_label': {
    'pt-BR': 'Data do Serviço', 'en': 'Service Date', 'es': 'Fecha del Servicio',
    'fr': 'Date du Service', 'it': 'Data del Servizio'
  },
  'grooming.scheduled_time': {
    'pt-BR': 'Horário (opcional)', 'en': 'Time (optional)', 'es': 'Hora (opcional)',
    'fr': 'Heure (optionnel)', 'it': 'Orario (opzionale)'
  },
  'grooming.time_reminder_hint': {
    'pt-BR': 'Informe o horário para receber lembretes mais precisos', 'en': 'Provide time for more accurate reminders', 'es': 'Proporcione hora para recordatorios más precisos',
    'fr': 'Fournir l\'heure pour des rappels plus précis', 'it': 'Fornire l\'ora per promemoria più precisi'
  },
  'grooming.location_label': {
    'pt-BR': 'Petshop 🏪', 'en': 'Petshop 🏪', 'es': 'Tienda 🏪',
    'fr': 'Animalerie 🏪', 'it': 'Petshop 🏪'
  },
  'grooming.location_search': {
    'pt-BR': 'Digite o Nome do Petshop', 'en': 'Enter the PetShop Name', 'es': 'Escribe el Nombre de la Tienda',
    'fr': 'Entrez le Nom de l\'Animalerie', 'it': 'Inserisci il Nome del Petshop'
  },
  'grooming.location_hint': {
    'pt-BR': 'Digite o Nome do seu Petshop', 'en': 'Type your PetShop Name', 'es': 'Escribe el Nombre de tu Tienda',
    'fr': 'Entrez le Nom de votre Animalerie', 'it': 'Inserisci il Nome del tuo Petshop'
  },
  'grooming.professional_name': {
    'pt-BR': 'Profissional', 'en': 'Professional', 'es': 'Profesional',
    'fr': 'Professionnel', 'it': 'Professionista'
  },
  'grooming.groomer_placeholder': {
    'pt-BR': 'Nome do tosador/banhista', 'en': 'Groomer/Bather name', 'es': 'Nombre del peluquero/bañista',
    'fr': 'Nom du toiletteur/baigneur', 'it': 'Nome del toelettatore'
  },
  'grooming.cost_label': {
    'pt-BR': 'Custo (R$)', 'en': 'Cost', 'es': 'Costo',
    'fr': 'Coût', 'it': 'Costo'
  },
  'grooming.next_service_days': {
    'pt-BR': 'Próximo serviço em (dias)', 'en': 'Next service in (days)', 'es': 'Próximo servicio en (días)',
    'fr': 'Prochain service dans (jours)', 'it': 'Prossimo servizio tra (giorni)'
  },
  'grooming.recommended_days_bath': {
    'pt-BR': 'Recomendado: 14 dias (banho)', 'en': 'Recommended: 14 days (bath)', 'es': 'Recomendado: 14 días (baño)',
    'fr': 'Recommandé: 14 jours (bain)', 'it': 'Consigliato: 14 giorni (bagno)'
  },
  'grooming.recommended_days_grooming': {
    'pt-BR': 'Recomendado: 45 dias (tosa)', 'en': 'Recommended: 45 days (grooming)', 'es': 'Recomendado: 45 días (peluquería)',
    'fr': 'Recommandé: 45 jours (toilettage)', 'it': 'Consigliato: 45 giorni (toelettatura)'
  },
  'grooming.observations_label': {
    'pt-BR': 'Observações', 'en': 'Notes', 'es': 'Observaciones',
    'fr': 'Notes', 'it': 'Note'
  },
  'grooming.observations_placeholder': {
    'pt-BR': 'Anotações sobre o serviço...', 'en': 'Service notes...', 'es': 'Notas del servicio...',
    'fr': 'Notes sur le service...', 'it': 'Note sul servizio...'
  },
  'grooming.save_record': {
    'pt-BR': 'Salvar Registro', 'en': 'Save Record', 'es': 'Guardar Registro',
    'fr': 'Enregistrer', 'it': 'Salva Registro'
  },
  'grooming.service_history': {
    'pt-BR': 'Histórico de Serviços', 'en': 'Service History', 'es': 'Historial de Servicios',
    'fr': 'Historique des Services', 'it': 'Cronologia Servizi'
  },
  'grooming.bath_plus_grooming': {
    'pt-BR': 'Banho + Tosa', 'en': 'Bath + Grooming', 'es': 'Baño + Peluquería',
    'fr': 'Bain + Toilettage', 'it': 'Bagno + Toelettatura'
  },
  'grooming.next_recommended': {
    'pt-BR': 'Próximo recomendado', 'en': 'Next recommended', 'es': 'Próximo recomendado',
    'fr': 'Prochain recommandé', 'it': 'Prossimo consigliato'
  },
  'grooming.delete_confirm': {
    'pt-BR': 'Tem certeza que deseja excluir este registro de {type}?',
    'en': 'Are you sure you want to delete this {type} record?',
    'es': '¿Está seguro de que desea eliminar este registro de {type}?',
    'fr': 'Êtes-vous sûr de vouloir supprimer cet enregistrement de {type}?',
    'it': 'Sei sicuro di voler eliminare questo record di {type}?'
  },
  'grooming.bath_and_grooming': {
    'pt-BR': 'banho e tosa', 'en': 'bath and grooming', 'es': 'baño y peluquería',
    'fr': 'bain et toilettage', 'it': 'bagno e toelettatura'
  },
  'grooming.error_save': {
    'pt-BR': 'Erro ao salvar. Tente novamente.',
    'en': 'Error saving. Please try again.',
    'es': 'Error al guardar. Intente de nuevo.',
    'fr': 'Erreur lors de l\'enregistrement. Réessayez.',
    'it': 'Errore nel salvare. Riprova.'
  },
  'grooming.error_delete': {
    'pt-BR': 'Erro ao excluir. Tente novamente.',
    'en': 'Error deleting. Please try again.',
    'es': 'Error al eliminar. Intente de nuevo.',
    'fr': 'Erreur lors de la suppression. Réessayez.',
    'it': 'Errore nell\'eliminare. Riprova.'
  },

  // Parasite Control Extended
  'parasite.register_application': {
    'pt-BR': 'Registrar Aplicação', 'en': 'Register Application', 'es': 'Registrar Aplicación',
    'fr': 'Enregistrer l\'Application', 'it': 'Registra Applicazione'
  },
  'parasite.history_records': {
    'pt-BR': 'Histórico', 'en': 'History', 'es': 'Historial',
    'fr': 'Historique', 'it': 'Cronologia'
  },
  'parasite.records_count': {
    'pt-BR': 'registros', 'en': 'records', 'es': 'registros',
    'fr': 'enregistrements', 'it': 'registrazioni'
  },
  'parasite.collar_repellent': {
    'pt-BR': 'Coleira Repelente', 'en': 'Repellent Collar', 'es': 'Collar Repelente',
    'fr': 'Collier Répulsif', 'it': 'Collare Repellente'
  },
  'parasite.worm_control': {
    'pt-BR': 'Controle de Vermes', 'en': 'Worm Control', 'es': 'Control de Gusanos',
    'fr': 'Contrôle des Vers', 'it': 'Controllo dei Vermi'
  },
  'parasite.every_3_months': {
    'pt-BR': 'a cada 3 meses', 'en': 'every 3 months', 'es': 'cada 3 meses',
    'fr': 'tous les 3 mois', 'it': 'ogni 3 mesi'
  },
  'parasite.applied': {
    'pt-BR': 'Aplicado', 'en': 'Applied', 'es': 'Aplicado',
    'fr': 'Appliqué', 'it': 'Applicato'
  },
  'parasite.next_due': {
    'pt-BR': 'Próxima', 'en': 'Next', 'es': 'Próxima',
    'fr': 'Prochaine', 'it': 'Prossima'
  },
  'parasite.active_reminder': {
    'pt-BR': 'Lembrete ativo', 'en': 'Active reminder', 'es': 'Recordatorio activo',
    'fr': 'Rappel actif', 'it': 'Promemoria attivo'
  },
  'parasite.alert_days_before': {
    'pt-BR': 'alerta 7 dias antes', 'en': 'alert 7 days before', 'es': 'alerta 7 días antes',
    'fr': 'alerte 7 jours avant', 'it': 'avviso 7 giorni prima'
  },
  'parasite.type_control': {
    'pt-BR': 'Tipo de Controle', 'en': 'Control Type', 'es': 'Tipo de Control',
    'fr': 'Type de Contrôle', 'it': 'Tipo di Controllo'
  },
  'parasite.worm_control_subtitle': {
    'pt-BR': 'Comprimidos ou líquidos', 'en': 'Tablets or liquids', 'es': 'Tabletas o líquidos',
    'fr': 'Comprimés ou liquides', 'it': 'Compresse o liquidi'
  },
  'parasite.collar_leishmaniasis': {
    'pt-BR': 'Coleira Repelente (Leishmaniose)', 'en': 'Repellent Collar (Leishmaniasis)', 'es': 'Collar Repelente (Leishmaniasis)',
    'fr': 'Collier Répulsif (Leishmaniose)', 'it': 'Collare Repellente (Leishmaniosi)'
  },
  'parasite.delete_confirm': {
    'pt-BR': 'Tem certeza que deseja excluir "{name}"?',
    'en': 'Are you sure you want to delete "{name}"?',
    'es': '¿Está seguro de que desea eliminar "{name}"?',
    'fr': 'Êtes-vous sûr de vouloir supprimer "{name}"?',
    'it': 'Sei sicuro di voler eliminare "{name}"?'
  },
  'parasite.error_save': {
    'pt-BR': 'Erro ao salvar. Tente novamente.',
    'en': 'Error saving. Please try again.',
    'es': 'Error al guardar. Intente de nuevo.',
    'fr': 'Erreur lors de l\'enregistrement. Réessayez.',
    'it': 'Errore nel salvare. Riprova.'
  },
  'parasite.error_delete': {
    'pt-BR': 'Erro ao excluir. Tente novamente.',
    'en': 'Error deleting. Please try again.',
    'es': 'Error al eliminar. Intente de nuevo.',
    'fr': 'Erreur lors de la suppression. Réessayez.',
    'it': 'Errore nell\'eliminare. Riprova.'
  },

  // Veterinary History Extended
  'vet_history.events': {
    'pt-BR': 'eventos', 'en': 'events', 'es': 'eventos',
    'fr': 'événements', 'it': 'eventi'
  },
  'vet_history.event': {
    'pt-BR': 'evento', 'en': 'event', 'es': 'evento',
    'fr': 'événement', 'it': 'evento'
  },
  'vet_history.completed': {
    'pt-BR': 'Realizado', 'en': 'Completed', 'es': 'Realizado',
    'fr': 'Réalisé', 'it': 'Completato'
  },
  'vet_history.add_procedure': {
    'pt-BR': 'Adicionar Novo Procedimento', 'en': 'Add New Procedure', 'es': 'Agregar Nuevo Procedimiento',
    'fr': 'Ajouter Nouvelle Procédure', 'it': 'Aggiungi Nuova Procedura'
  },
  'vet_history.no_procedures': {
    'pt-BR': 'Nenhum procedimento registrado ainda', 'en': 'No procedures recorded yet', 'es': 'Ningún procedimiento registrado aún',
    'fr': 'Aucune procédure enregistrée', 'it': 'Nessuna procedura registrata'
  },
  'vet_history.register_first': {
    'pt-BR': 'Registrar Primeiro Procedimento', 'en': 'Register First Procedure', 'es': 'Registrar Primer Procedimiento',
    'fr': 'Enregistrer Première Procédure', 'it': 'Registra Prima Procedura'
  },
  'vet_history.not_informed': {
    'pt-BR': 'Não informado', 'en': 'Not informed', 'es': 'No informado',
    'fr': 'Non renseigné', 'it': 'Non specificato'
  },

  // Arrival Detection Modal
  'arrival.you_arrived': {
    'pt-BR': 'Você chegou!', 'en': 'You arrived!', 'es': '¡Llegaste!',
    'fr': 'Vous êtes arrivé!', 'it': 'Sei arrivato!'
  },
  'arrival.automatic_detection': {
    'pt-BR': 'Detecção automática ativada', 'en': 'Automatic detection enabled', 'es': 'Detección automática activada',
    'fr': 'Détection automatique activée', 'it': 'Rilevamento automatico attivato'
  },
  'arrival.vaccines_overdue': {
    'pt-BR': 'VACINAS ATRASADAS!', 'en': 'OVERDUE VACCINES!', 'es': '¡VACUNAS ATRASADAS!',
    'fr': 'VACCINS EN RETARD!', 'it': 'VACCINI SCADUTI!'
  },
  'arrival.pet_overdue_with': {
    'pt-BR': 'está com', 'en': 'has', 'es': 'tiene',
    'fr': 'a', 'it': 'ha'
  },
  'arrival.overdue_since': {
    'pt-BR': 'vencida há', 'en': 'overdue for', 'es': 'vencida hace',
    'fr': 'en retard depuis', 'it': 'scaduta da'
  },
  'arrival.days': {
    'pt-BR': 'dias', 'en': 'days', 'es': 'días',
    'fr': 'jours', 'it': 'giorni'
  },
  'arrival.apply_now_hint': {
    'pt-BR': 'Aproveite que você está aqui para aplicar agora', 'en': 'Take advantage that you\'re here to apply now', 'es': 'Aprovecha que estás aquí para aplicar ahora',
    'fr': 'Profitez que vous êtes ici pour appliquer maintenant', 'it': 'Approfitta che sei qui per applicare ora'
  },
  'arrival.what_came_for': {
    'pt-BR': 'O que você veio fazer?', 'en': 'What did you come to do?', 'es': '¿Qué viniste a hacer?',
    'fr': 'Que venez-vous faire?', 'it': 'Cosa sei venuto a fare?'
  },
  'arrival.register_consultation': {
    'pt-BR': 'Registrar Consulta / Vacina', 'en': 'Register Consultation / Vaccine', 'es': 'Registrar Consulta / Vacuna',
    'fr': 'Enregistrer Consultation / Vaccin', 'it': 'Registra Visita / Vaccino'
  },
  'arrival.register_grooming': {
    'pt-BR': 'Registrar Banho & Tosa', 'en': 'Register Bath & Grooming', 'es': 'Registrar Baño y Peluquería',
    'fr': 'Enregistrer Bain & Toilettage', 'it': 'Registra Bagno e Toelettatura'
  },
  'arrival.register_purchase': {
    'pt-BR': 'Registrar Compra (Antipulgas, etc)', 'en': 'Register Purchase (Flea control, etc)', 'es': 'Registrar Compra (Antipulgas, etc)',
    'fr': 'Enregistrer Achat (Antipuces, etc)', 'it': 'Registra Acquisto (Antipulci, ecc)'
  },
  'arrival.register_service': {
    'pt-BR': 'Registrar Atendimento', 'en': 'Register Service', 'es': 'Registrar Atención',
    'fr': 'Enregistrer Service', 'it': 'Registra Servizio'
  },
  'arrival.service_type': {
    'pt-BR': 'Tipo de Atendimento:', 'en': 'Service Type:', 'es': 'Tipo de Atención:',
    'fr': 'Type de Service :', 'it': 'Tipo di Servizio:'
  },
  'arrival.back': {
    'pt-BR': 'Voltar', 'en': 'Back', 'es': 'Volver',
    'fr': 'Retour', 'it': 'Indietro'
  },
  'arrival.consultation': {
    'pt-BR': 'Consulta', 'en': 'Consultation', 'es': 'Consulta',
    'fr': 'Consultation', 'it': 'Consulta'
  },
  'arrival.procedure': {
    'pt-BR': 'Procedimento', 'en': 'Procedure', 'es': 'Procedimiento',
    'fr': 'Procédure', 'it': 'Procedura'
  },
  'arrival.exams': {
    'pt-BR': 'Exames', 'en': 'Exams', 'es': 'Exámenes',
    'fr': 'Examens', 'it': 'Esami'
  },
  'arrival.register_hosting': {
    'pt-BR': 'Registrar Hospedagem', 'en': 'Register Boarding', 'es': 'Registrar Hospedaje',
    'fr': 'Enregistrer Pension', 'it': 'Registra Pensione'
  },
  'arrival.just_passing': {
    'pt-BR': 'Estou só de passagem', 'en': 'Just passing by', 'es': 'Solo de paso',
    'fr': 'Je passe juste', 'it': 'Solo di passaggio'
  },
  'arrival.system_detected': {
    'pt-BR': 'O sistema detectou automaticamente sua chegada usando GPS', 'en': 'The system automatically detected your arrival using GPS', 'es': 'El sistema detectó automáticamente tu llegada usando GPS',
    'fr': 'Le système a détecté automatiquement votre arrivée via GPS', 'it': 'Il sistema ha rilevato automaticamente il tuo arrivo tramite GPS'
  },

  // Documents/Privacy
  'docs.privacy_title': {
    'pt-BR': 'Privacidade', 'en': 'Privacy', 'es': 'Privacidad',
    'fr': 'Confidentialité', 'it': 'Privacy'
  },
  'docs.only_you_access': {
    'pt-BR': 'Apenas você tem acesso aos seus dados', 'en': 'Only you have access to your data', 'es': 'Solo tú tienes acceso a tus datos',
    'fr': 'Vous seul avez accès à vos données', 'it': 'Solo tu hai accesso ai tuoi dati'
  },
  'docs.always_available': {
    'pt-BR': 'Sempre disponível', 'en': 'Always available', 'es': 'Siempre disponible',
    'fr': 'Toujours disponible', 'it': 'Sempre disponibile'
  },
  'docs.available_any_device': {
    'pt-BR': 'Acesse de qualquer dispositivo com seu login', 'en': 'Access from any device with your login', 'es': 'Accede desde cualquier dispositivo con tu inicio de sesión',
    'fr': 'Accédez depuis n\'importe quel appareil avec votre connexion', 'it': 'Accedi da qualsiasi dispositivo con il tuo login'
  },
  'docs.automatic_backup': {
    'pt-BR': 'Backup automático', 'en': 'Automatic backup', 'es': 'Copia de seguridad automática',
    'fr': 'Sauvegarde automatique', 'it': 'Backup automatico'
  },
  'docs.data_not_lost': {
    'pt-BR': 'Seus dados não serão perdidos', 'en': 'Your data will not be lost', 'es': 'Tus datos no se perderán',
    'fr': 'Vos données ne seront pas perdues', 'it': 'I tuoi dati non andranno persi'
  },
  'docs.secure_database': {
    'pt-BR': 'Banco de Dados Seguro', 'en': 'Secure Database', 'es': 'Base de Datos Segura',
    'fr': 'Base de Données Sécurisée', 'it': 'Database Sicuro'
  },
  'docs.your_data_safe': {
    'pt-BR': 'Seus dados estão seguros', 'en': 'Your data is safe', 'es': 'Tus datos están seguros',
    'fr': 'Vos données sont en sécurité', 'it': 'I tuoi dati sono al sicuro'
  },
  'docs.stored_protected': {
    'pt-BR': 'Armazenados em banco de dados protegido', 'en': 'Stored in protected database', 'es': 'Almacenados en base de datos protegida',
    'fr': 'Stockés dans une base de données protégée', 'it': 'Memorizzati in database protetto'
  },
  'docs.files_saved_browser': {
    'pt-BR': 'Arquivos salvos no navegador', 'en': 'Files saved in browser', 'es': 'Archivos guardados en el navegador',
    'fr': 'Fichiers sauvegardés dans le navigateur', 'it': 'File salvati nel browser'
  },
  'docs.saved_locally': {
    'pt-BR': 'Salvo localmente', 'en': 'Saved locally', 'es': 'Guardado localmente',
    'fr': 'Enregistré localement', 'it': 'Salvato localmente'
  },
  'docs.view': {
    'pt-BR': 'Visualizar', 'en': 'View', 'es': 'Ver',
    'fr': 'Voir', 'it': 'Visualizza'
  },
  'docs.download': {
    'pt-BR': 'Download', 'en': 'Download', 'es': 'Descargar',
    'fr': 'Télécharger', 'it': 'Scarica'
  },
  'docs.share': {
    'pt-BR': 'Compartilhar', 'en': 'Share', 'es': 'Compartir',
    'fr': 'Partager', 'it': 'Condividi'
  },

  // Vaccine Modal Extended
  'vaccine.quick_hint': {
    'pt-BR': 'Clique em uma vacina comum para preencher automaticamente e ajustar apenas os detalhes', 
    'en': 'Click a common vaccine to auto-fill and adjust only the details', 
    'es': 'Haga clic en una vacuna común para completar automáticamente y ajustar solo los detalles',
    'fr': 'Cliquez sur un vaccin courant pour remplir automatiquement et ajuster uniquement les détails', 
    'it': 'Clicca su un vaccino comune per compilare automaticamente e regolare solo i dettagli'
  },
  'vaccine.complete_history': {
    'pt-BR': 'Histórico Completo', 'en': 'Complete History', 'es': 'Historial Completo',
    'fr': 'Historique Complet', 'it': 'Storia Completa'
  },
  'vaccine.vaccines_count': {
    'pt-BR': 'vacinas', 'en': 'vaccines', 'es': 'vacunas',
    'fr': 'vaccins', 'it': 'vaccini'
  },
  'vaccine.refresh': {
    'pt-BR': 'Atualizar', 'en': 'Refresh', 'es': 'Actualizar',
    'fr': 'Actualiser', 'it': 'Aggiorna'
  },
  'vaccine.no_vaccine': {
    'pt-BR': 'Nenhuma vacina registrada', 'en': 'No vaccines registered', 'es': 'No hay vacunas registradas',
    'fr': 'Aucun vaccin enregistré', 'it': 'Nessun vaccino registrato'
  },
  'vaccine.use_import_or_manual': {
    'pt-BR': 'Use "Importar Cartão" ou "Nova Vacina Manual"', 'en': 'Use "Import Card" or "New Manual Vaccine"', 'es': 'Use "Importar Tarjeta" o "Nueva Vacuna Manual"',
    'fr': 'Utilisez "Importer Carte" ou "Nouveau Vaccin Manuel"', 'it': 'Usa "Importa Tessera" o "Nuovo Vaccino Manuale"'
  },
  'vaccine.check_booster_needed': {
    'pt-BR': 'Verificar necessidade de reforço', 'en': 'Check if booster needed', 'es': 'Verificar necesidad de refuerzo',
    'fr': 'Vérifier le besoin de rappel', 'it': 'Verifica necessità richiamo'
  },
  'vaccine.applied_years_ago': {
    'pt-BR': 'Aplicada há', 'en': 'Applied', 'es': 'Aplicada hace',
    'fr': 'Appliqué il y a', 'it': 'Applicato'
  },
  'vaccine.years_ago': {
    'pt-BR': 'ano(s)', 'en': 'year(s) ago', 'es': 'año(s)',
    'fr': 'an(s)', 'it': 'anno/i fa'
  },
  'vaccine.consult_vet_booster': {
    'pt-BR': 'Consulte seu veterinário para saber se precisa de reforço.', 'en': 'Consult your veterinarian to know if a booster is needed.', 'es': 'Consulte a su veterinario para saber si necesita refuerzo.',
    'fr': 'Consultez votre vétérinaire pour savoir si un rappel est nécessaire.', 'it': 'Consulta il veterinario per sapere se è necessario un richiamo.'
  },
  'vaccine.tip_click_edit': {
    'pt-BR': 'Dica: Clique em "✏️" para adicionar a data de revacina', 'en': 'Tip: Click "✏️" to add revaccination date', 'es': 'Consejo: Haga clic en "✏️" para agregar fecha de revacunación',
    'fr': 'Astuce: Cliquez sur "✏️" pour ajouter la date de rappel', 'it': 'Suggerimento: Clicca su "✏️" per aggiungere la data di richiamo'
  },
  'vaccine.not_defined': {
    'pt-BR': 'Não definida', 'en': 'Not defined', 'es': 'No definida',
    'fr': 'Non définie', 'it': 'Non definita'
  },
  
  // Common Vaccine Names
  'vaccine.names.v10': {
    'pt-BR': 'V10', 'en': 'V10', 'es': 'V10',
    'fr': 'V10', 'it': 'V10'
  },
  'vaccine.names.v8': {
    'pt-BR': 'V8', 'en': 'V8', 'es': 'V8',
    'fr': 'V8', 'it': 'V8'
  },
  'vaccine.names.rabies': {
    'pt-BR': 'Raiva', 'en': 'Rabies', 'es': 'Rabia',
    'fr': 'Rage', 'it': 'Rabbia'
  },
  'vaccine.names.kennel_cough': {
    'pt-BR': 'Gripe', 'en': 'Kennel Cough', 'es': 'Gripe',
    'fr': 'Toux de Chenil', 'it': 'Tosse dei Canili'
  },
  'vaccine.names.giardia': {
    'pt-BR': 'Giárdia', 'en': 'Giardia', 'es': 'Giardia',
    'fr': 'Giardia', 'it': 'Giardia'
  },
  'vaccine.names.leishmaniasis': {
    'pt-BR': 'Leishmaniose', 'en': 'Leishmaniasis', 'es': 'Leishmaniasis',
    'fr': 'Leishmaniose', 'it': 'Leishmaniosi'
  },
  'vaccine.leishmaniasis_discontinued': {
    'pt-BR': 'Leishmaniose (Descontinuada)', 'en': 'Leishmaniasis (Discontinued)', 'es': 'Leishmaniasis (Descontinuada)',
    'fr': 'Leishmaniose (Discontinué)', 'it': 'Leishmaniosi (Interrotto)'
  },
  'vaccine.v5_cat': {
    'pt-BR': 'V5 (Quíntupla)', 'en': 'V5 (Fivefold)', 'es': 'V5 (Quíntuple)',
    'fr': 'V5 (Quintuple)', 'it': 'V5 (Quintuplo)'
  },
  'vaccine.triple_cat': {
    'pt-BR': 'Tríplice Felina', 'en': 'Feline Triple', 'es': 'Triple Felina',
    'fr': 'Triple Félin', 'it': 'Trivalente Felino'
  },
  'vaccine.felv': {
    'pt-BR': 'FeLV', 'en': 'FeLV', 'es': 'FeLV',
    'fr': 'FeLV', 'it': 'FeLV'
  },

  'common.welcome': {
    'pt-BR': 'Bem-vindo ao PETMOL', 'en': 'Welcome to PETMOL', 'es': 'Bienvenido a PETMOL',
    'fr': 'Bienvenue sur PETMOL', 'it': 'Benvenuto su PETMOL'
  },
  'common.tagline': {
    'pt-BR': 'Sua central de cuidados pet', 'en': 'Your pet care hub', 'es': 'Tu centro de cuidado de mascotas',
    'fr': 'Votre centre de soins pour animaux', 'it': 'Il tuo centro per la cura degli animali'
  },
  'common.event': {
    'pt-BR': 'evento', 'en': 'event', 'es': 'evento',
    'fr': 'événement', 'it': 'evento'
  },
  'common.events': {
    'pt-BR': 'eventos', 'en': 'events', 'es': 'eventos',
    'fr': 'événements', 'it': 'eventi'
  },
  'common.service': {
    'pt-BR': 'serviço', 'en': 'service', 'es': 'servicio',
    'fr': 'service', 'it': 'servizio'
  },
  'common.services': {
    'pt-BR': 'serviços', 'en': 'services', 'es': 'servicios',
    'fr': 'services', 'it': 'servizi'
  },
  'common.record': {
    'pt-BR': 'registro', 'en': 'record', 'es': 'registro',
    'fr': 'enregistrement', 'it': 'registro'
  },
  'common.records': {
    'pt-BR': 'registros', 'en': 'records', 'es': 'registros',
    'fr': 'enregistrements', 'it': 'registri'
  },
  'common.vaccine': {
    'pt-BR': 'vacina', 'en': 'vaccine', 'es': 'vacuna',
    'fr': 'vaccin', 'it': 'vaccino'
  },
  'common.vaccines': {
    'pt-BR': 'vacinas', 'en': 'vaccines', 'es': 'vacunas',
    'fr': 'vaccins', 'it': 'vaccini'
  },
  'common.documents': {
    'pt-BR': 'Documentos', 'en': 'Documents', 'es': 'Documentos',
    'fr': 'Documents', 'it': 'Documenti'
  },
  'common.documents.desc': {
    'pt-BR': 'Exames, laudos, certificados', 'en': 'Exams, reports, certificates', 'es': 'Exámenes, informes, certificados',
    'fr': 'Examens, rapports, certificats', 'it': 'Esami, referti, certificati'
  },
  'home.vet_history': {
    'pt-BR': 'Histórico Veterinário', 'en': 'Veterinary History', 'es': 'Historial Veterinario',
    'fr': 'Historique Vétérinaire', 'it': 'Storia Veterinaria'
  },
  'home.complete_history': {
    'pt-BR': 'Histórico Completo', 'en': 'Complete History', 'es': 'Historial Completo',
    'fr': 'Historique Complet', 'it': 'Storia Completa'
  },
  'home.service_history': {
    'pt-BR': 'Histórico de Serviços', 'en': 'Service History', 'es': 'Historial de Servicios',
    'fr': 'Historique des Services', 'it': 'Storico dei Servizi'
  },
  'home.hygiene': {
    'pt-BR': 'Higiene', 'en': 'Grooming', 'es': 'Higiene',
    'fr': 'Hygiène', 'it': 'Igiene'
  },
  'home.hygiene.desc': {
    'pt-BR': 'Banho e tosa', 'en': 'Bath and trim', 'es': 'Baño y corte',
    'fr': 'Bain et toilettage', 'it': 'Bagno e toelettatura'
  },
  'home.family': {
    'pt-BR': 'Família', 'en': 'Family', 'es': 'Familia',
    'fr': 'Famille', 'it': 'Famiglia'
  },
  'home.family.share': {
    'pt-BR': 'Compartilhar', 'en': 'Share', 'es': 'Compartir',
    'fr': 'Partager', 'it': 'Condividere'
  },
  'home.vet_online': {
    'pt-BR': 'Veterinário Online', 'en': 'Online Vet', 'es': 'Veterinario Online',
    'fr': 'Vétérinaire en Ligne', 'it': 'Veterinario Online'
  },
  'home.vet_online.desc': {
    'pt-BR': '💬 Consultas pelo app', 'en': '💬 Consultations via app', 'es': '💬 Consultas por la app',
    'fr': '💬 Consultations via l\'app', 'it': '💬 Consulti tramite app'
  },
  'home.history': {
    'pt-BR': 'Histórico', 'en': 'History', 'es': 'Historial',
    'fr': 'Historique', 'it': 'Storico'
  },
  'home.history.desc': {
    'pt-BR': 'Documentos', 'en': 'Documents', 'es': 'Documentos',
    'fr': 'Documents', 'it': 'Documenti'
  },
  'home.training': {
    'pt-BR': 'Adestramento', 'en': 'Training', 'es': 'Entrenamiento',
    'fr': 'Dressage', 'it': 'Addestramento'
  },
  'home.training.desc': {
    'pt-BR': 'Dicas e tutoriais', 'en': 'Tips and tutorials', 'es': 'Consejos y tutoriales',
    'fr': 'Conseils et tutoriels', 'it': 'Suggerimenti e tutorial'
  },
  'home.coming_soon': {
    'pt-BR': 'Em Breve', 'en': 'Coming Soon', 'es': 'Próximamente',
    'fr': 'Bientôt', 'it': 'Prossimamente'
  },
  'home.interested': {
    'pt-BR': '⭐ Tenho interesse', 'en': '⭐ I\'m interested', 'es': '⭐ Me interesa',
    'fr': '⭐ Intéressé(e)', 'it': '⭐ Interessato'
  },
  'home.interested.active': {
    'pt-BR': '⭐ Interessado', 'en': '⭐ Interested', 'es': '⭐ Interesado',
    'fr': '⭐ Intéressé', 'it': '⭐ Interessato'
  },
  'home.health.title': {
    'pt-BR': 'Saúde', 'en': 'Health', 'es': 'Salud',
    'fr': 'Santé', 'it': 'Salute'
  },
  'home.health.vaccines': {
    'pt-BR': 'Vacinas · Antiparasitários', 'en': 'Vaccines · Antiparasitics', 'es': 'Vacunas · Antiparasitarios',
    'fr': 'Vaccins · Antiparasitaires', 'it': 'Vaccini · Antiparassitari'
  },
  'home.shopping.desc': {
    'pt-BR': 'Produtos com desconto', 'en': 'Products', 'es': 'Productos',
    'fr': 'Produits', 'it': 'Prodotti'
  },
  'home.services.clinics': {
    'pt-BR': 'clínicas e mais', 'en': 'clinics & more', 'es': 'clínicas y más',
    'fr': 'cliniques et plus', 'it': 'cliniche e altro'
  },
  'home.services.emergency': {
    'pt-BR': 'emergência', 'en': 'emergency', 'es': 'emergencia',
    'fr': 'urgences', 'it': 'emergenza'
  },
  'home.food.title': {
    'pt-BR': 'Alimentação', 'en': 'Feeding', 'es': 'Alimentación',
    'fr': 'Alimentation', 'it': 'Alimentazione'
  },
  'home.food.desc': {
    'pt-BR': 'Lembretes · Consumo', 'en': 'Reminders · Consumption', 'es': 'Recordatorios · Consumo',
    'fr': 'Rappels · Consommation', 'it': 'Promemoria · Consumo'
  },
  'common.no_records': {
    'pt-BR': 'Sem registros', 'en': 'No records', 'es': 'Sin registros',
    'fr': 'Aucun enregistrement', 'it': 'Nessun registro'
  },
  'common.all_up_to_date': {
    'pt-BR': 'Tudo em dia', 'en': 'All up to date', 'es': 'Todo al día',
    'fr': 'Tout à jour', 'it': 'Tutto in regola'
  },
  'common.overdue': {
    'pt-BR': 'atraso', 'en': 'overdue', 'es': 'atrasado',
    'fr': 'en retard', 'it': 'in ritardo'
  },
  'home.grooming.bath': {
    'pt-BR': 'Banho', 'en': 'Bath', 'es': 'Baño',
    'fr': 'Bain', 'it': 'Bagno'
  },
  'home.grooming.trim': {
    'pt-BR': 'Tosa', 'en': 'Trim', 'es': 'Corte',
    'fr': 'Toilettage', 'it': 'Toelettatura'
  },
  'home.grooming.complete': {
    'pt-BR': 'Completo', 'en': 'Complete', 'es': 'Completo',
    'fr': 'Complet', 'it': 'Completo'
  },

  // Auth
  'auth.access_title': {
    'pt-BR': 'PETMOL - Acesso',
    'en': 'PETMOL - Access',
    'es': 'PETMOL - Acceso',
    'fr': 'PETMOL - Accès',
    'it': 'PETMOL - Accesso'
  },
  'auth.access_description': {
    'pt-BR': 'Login e cadastro no PETMOL',
    'en': 'Login and signup on PETMOL',
    'es': 'Inicio de sesión y registro en PETMOL',
    'fr': 'Connexion et inscription sur PETMOL',
    'it': 'Accesso e registrazione su PETMOL'
  },
  'auth.login': {
    'pt-BR': 'Entrar',
    'en': 'Log in',
    'es': 'Iniciar sesión',
    'fr': 'Se connecter',
    'it': 'Accedi'
  },
  'auth.logout': {
    'pt-BR': 'Sair',
    'en': 'Log out',
    'es': 'Salir',
    'fr': 'Se déconnecter',
    'it': 'Esci'
  },
  'auth.logging_out': {
    'pt-BR': 'Saindo...',
    'en': 'Signing out...',
    'es': 'Saliendo...',
    'fr': 'Déconnexion...',
    'it': 'Disconnessione...'
  },
  'auth.signup': {
    'pt-BR': 'Criar conta',
    'en': 'Create account',
    'es': 'Crear cuenta',
    'fr': 'Créer un compte',
    'it': 'Crea account'
  },
  'auth.login_title': {
    'pt-BR': 'Entrar na sua conta',
    'en': 'Sign in to your account',
    'es': 'Inicia sesión en tu cuenta',
    'fr': 'Connectez-vous à votre compte',
    'it': 'Accedi al tuo account'
  },
  'auth.signup_title': {
    'pt-BR': 'Criar nova conta',
    'en': 'Create a new account',
    'es': 'Crear una nueva cuenta',
    'fr': 'Créer un nouveau compte',
    'it': 'Crea un nuovo account'
  },
  'auth.email_label': {
    'pt-BR': 'Email',
    'en': 'Email',
    'es': 'Correo',
    'fr': 'E-mail',
    'it': 'Email'
  },
  'auth.password_label': {
    'pt-BR': 'Senha',
    'en': 'Password',
    'es': 'Contraseña',
    'fr': 'Mot de passe',
    'it': 'Password'
  },
  'auth.email_placeholder': {
    'pt-BR': 'voce@email.com',
    'en': 'you@email.com',
    'es': 'tu@email.com',
    'fr': 'vous@email.com',
    'it': 'tu@email.com'
  },
  'auth.password_placeholder': {
    'pt-BR': '••••••••',
    'en': '••••••••',
    'es': '••••••••',
    'fr': '••••••••',
    'it': '••••••••'
  },
  'auth.login_error': {
    'pt-BR': 'Credenciais inválidas.',
    'en': 'Invalid credentials.',
    'es': 'Credenciales inválidas.',
    'fr': 'Identifiants invalides.',
    'it': 'Credenziali non valide.'
  },
  'auth.signup_error': {
    'pt-BR': 'Não foi possível criar a conta.',
    'en': 'Could not create account.',
    'es': 'No se pudo crear la cuenta.',
    'fr': 'Impossible de créer le compte.',
    'it': 'Impossibile creare l’account.'
  },
  'auth.signup_success': {
    'pt-BR': 'Conta criada com sucesso.',
    'en': 'Account created successfully.',
    'es': 'Cuenta creada con éxito.',
    'fr': 'Compte créé avec succès.',
    'it': 'Account creato con successo.'
  },
  'auth.login_loading': {
    'pt-BR': 'Entrando...',
    'en': 'Signing in...',
    'es': 'Ingresando...',
    'fr': 'Connexion...',
    'it': 'Accesso in corso...'
  },
  'auth.signup_loading': {
    'pt-BR': 'Criando...',
    'en': 'Creating...',
    'es': 'Creando...',
    'fr': 'Création...',
    'it': 'Creazione...'
  },
  'auth.forgot_title': {
    'pt-BR': 'Recuperar senha',
    'en': 'Reset password',
    'es': 'Recuperar contraseña',
    'fr': 'Réinitialiser le mot de passe',
    'it': 'Reimposta password'
  },
  'auth.forgot_unavailable': {
    'pt-BR': 'Recuperação de senha ainda não está disponível. Entre em contato com o suporte.',
    'en': 'Password recovery is not available yet. Please contact support.',
    'es': 'La recuperación de contraseña no está disponible aún. Contacta al soporte.',
    'fr': 'La récupération du mot de passe n’est pas disponible. Contactez le support.',
    'it': 'Il recupero password non è ancora disponibile. Contatta il supporto.'
  },
  'auth.back_to_login': {
    'pt-BR': 'Voltar ao login',
    'en': 'Back to login',
    'es': 'Volver al login',
    'fr': 'Retour à la connexion',
    'it': 'Torna al login'
  },
  'auth.no_account': {
    'pt-BR': 'Não tem conta?',
    'en': 'Don’t have an account?',
    'es': '¿No tienes cuenta?',
    'fr': 'Pas de compte ?',
    'it': 'Non hai un account?'
  },
  'auth.have_account': {
    'pt-BR': 'Já tem conta?',
    'en': 'Already have an account?',
    'es': '¿Ya tienes cuenta?',
    'fr': 'Vous avez déjà un compte ?',
    'it': 'Hai già un account?'
  },
  'auth.forgot_link': {
    'pt-BR': 'Esqueci minha senha',
    'en': 'Forgot my password',
    'es': 'Olvidé mi contraseña',
    'fr': 'Mot de passe oublié',
    'it': 'Ho dimenticato la password'
  },
  'auth.redirecting': {
    'pt-BR': 'Redirecionando...',
    'en': 'Redirecting...',
    'es': 'Redirigiendo...',
    'fr': 'Redirection...',
    'it': 'Reindirizzamento...'
  },

  // Buy
  'buy.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'buy.title': {
    'pt-BR': 'Buscar Ofertas',
    'en': 'Search Deals',
    'es': 'Buscar Ofertas',
    'fr': 'Rechercher des offres',
    'it': 'Cerca offerte'
  },
  'buy.subtitle': {
    'pt-BR': 'Encontre produtos para seu pet no Google Shopping',
    'en': 'Find pet products on Google Shopping',
    'es': 'Encuentra productos para tu mascota en Google Shopping',
    'fr': 'Trouvez des produits pour animaux sur Google Shopping',
    'it': 'Trova prodotti per animali su Google Shopping'
  },
  'buy.my_purchases': {
    'pt-BR': 'Minhas Compras',
    'en': 'My Purchases',
    'es': 'Mis Compras',
    'fr': 'Mes Achats',
    'it': 'I miei acquisti'
  },
  'buy.clear': {
    'pt-BR': 'Limpar',
    'en': 'Clear',
    'es': 'Limpiar',
    'fr': 'Effacer',
    'it': 'Pulisci'
  },
  'buy.remove': {
    'pt-BR': 'Remover',
    'en': 'Remove',
    'es': 'Quitar',
    'fr': 'Supprimer',
    'it': 'Rimuovi'
  },
  'buy.clear_confirm': {
    'pt-BR': 'Limpar todas as compras?',
    'en': 'Clear all purchases?',
    'es': '¿Limpiar todas las compras?',
    'fr': 'Effacer tous les achats ?',
    'it': 'Cancellare tutti gli acquisti?'
  },
  'buy.search_products': {
    'pt-BR': 'Buscar Produtos',
    'en': 'Search Products',
    'es': 'Buscar Productos',
    'fr': 'Rechercher des produits',
    'it': 'Cerca prodotti'
  },
  'buy.how_it_works': {
    'pt-BR': 'Como funciona',
    'en': 'How it works',
    'es': 'Cómo funciona',
    'fr': 'Comment ça marche',
    'it': 'Come funziona'
  },
  'buy.how_it_works.step1': {
    'pt-BR': 'Digite o que procura (ração, brinquedo, etc)',
    'en': 'Type what you\'re looking for (food, toy, etc)',
    'es': 'Escribe lo que buscas (comida, juguete, etc.)',
    'fr': 'Tapez ce que vous cherchez (nourriture, jouet, etc.)',
    'it': 'Scrivi ciò che cerchi (cibo, gioco, ecc.)'
  },
  'buy.how_it_works.step2': {
    'pt-BR': 'Clique em "Buscar" para ver ofertas no Google Shopping',
    'en': 'Click "Search" to see deals on Google Shopping',
    'es': 'Haz clic en "Buscar" para ver ofertas en Google Shopping',
    'fr': 'Cliquez sur « Rechercher » pour voir les offres sur Google Shopping',
    'it': 'Clicca su "Cerca" per vedere le offerte su Google Shopping'
  },
  'buy.how_it_works.step3': {
    'pt-BR': 'Suas buscas aparecem em "Minhas Compras"',
    'en': 'Your searches appear in "My Purchases"',
    'es': 'Tus búsquedas aparecen en "Mis Compras"',
    'fr': 'Vos recherches apparaissent dans « Mes Achats »',
    'it': 'Le tue ricerche compaiono in "I miei acquisti"'
  },
  'buy.how_it_works.step4': {
    'pt-BR': 'O PETMOL não vende nem compara preços de produtos',
    'en': 'PETMOL does not sell or compare product prices',
    'es': 'PETMOL no vende ni compara precios de productos',
    'fr': 'PETMOL ne vend pas et ne compare pas les prix des produits',
    'it': 'PETMOL non vende né confronta i prezzi dei prodotti'
  },

  // Coverage
  'coverage.services.title': {
    'pt-BR': 'Serviços e Socorro Agora',
    'en': 'Services & Emergency',
    'es': 'Servicios y Urgencia',
    'fr': 'Services et urgence',
    'it': 'Servizi ed emergenze'
  },
  'coverage.services.available': {
    'pt-BR': 'Disponível mundialmente',
    'en': 'Available worldwide',
    'es': 'Disponible mundialmente',
    'fr': 'Disponible dans le monde',
    'it': 'Disponibile in tutto il mondo'
  },
  'coverage.services.description': {
    'pt-BR': 'Encontre petshops, veterinários 24h, banho e tosa, hotéis para pets e adestradores em qualquer país.',
    'en': 'Find pet shops, 24h veterinarians, grooming, pet hotels, and trainers in any country.',
    'es': 'Encuentra tiendas de mascotas, veterinarios 24h, peluquería, hoteles para mascotas y entrenadores en cualquier país.',
    'fr': 'Trouvez animaleries, vétérinaires 24h, toilettage, hôtels pour animaux et éducateurs dans tout pays.',
    'it': 'Trova negozi per animali, veterinari 24h, toelettatura, hotel per animali e addestratori in qualsiasi paese.'
  },
  'coverage.prices.title': {
    'pt-BR': 'Comparação de Preços',
    'en': 'Price Comparison',
    'es': 'Comparación de Precios',
    'fr': 'Comparaison des prix',
    'it': 'Confronto prezzi'
  },
  'coverage.prices.available_in': {
    'pt-BR': 'Comparação de preços disponível nestes países:',
    'en': 'Price comparison available in these countries:',
    'es': 'Comparación de precios disponible en estos países:',
    'fr': 'Comparaison des prix disponible dans ces pays :',
    'it': 'Confronto prezzi disponibile in questi paesi:'
  },
  'coverage.prices.more_soon': {
    'pt-BR': 'Mais países em breve. Entre em contato se quiser ver o PETMOL no seu país!',
    'en': 'More countries coming soon. Contact us if you want PETMOL in your country!',
    'es': 'Más países pronto. ¡Contáctanos si quieres ver PETMOL en tu país!',
    'fr': 'Plus de pays bientôt. Contactez-nous si vous voulez PETMOL dans votre pays !',
    'it': 'Altri paesi presto. Contattaci se vuoi PETMOL nel tuo paese!'
  },
  'coverage.languages.title': {
    'pt-BR': 'Idiomas Suportados',
    'en': 'Supported Languages',
    'es': 'Idiomas Soportados',
    'fr': 'Langues prises en charge',
    'it': 'Lingue supportate'
  },

  // Countries
  'country.BR': {
    'pt-BR': 'Brasil',
    'en': 'Brazil',
    'es': 'Brasil',
    'fr': 'Brésil',
    'it': 'Brasile'
  },
  'country.AR': {
    'pt-BR': 'Argentina',
    'en': 'Argentina',
    'es': 'Argentina',
    'fr': 'Argentine',
    'it': 'Argentina'
  },
  'country.MX': {
    'pt-BR': 'México',
    'en': 'Mexico',
    'es': 'México',
    'fr': 'Mexique',
    'it': 'Messico'
  },
  'country.CO': {
    'pt-BR': 'Colômbia',
    'en': 'Colombia',
    'es': 'Colombia',
    'fr': 'Colombie',
    'it': 'Colombia'
  },
  'country.CL': {
    'pt-BR': 'Chile',
    'en': 'Chile',
    'es': 'Chile',
    'fr': 'Chili',
    'it': 'Cile'
  },
  
  // Services
  'services.title': {
    'pt-BR': 'Serviços para seu pet', 'en': 'Pet Services', 'es': 'Servicios para tu mascota',
    'fr': 'Services pour animaux', 'it': 'Servizi per animali'
  },
  'services.subtitle': {
    'pt-BR': 'Estabelecimentos reais perto de você', 'en': 'Real establishments near you',
    'es': 'Establecimientos reales cerca de ti', 'fr': 'Établissements réels près de chez vous',
    'it': 'Strutture reali vicino a te'
  },
  'services.need_location': {
    'pt-BR': 'Precisamos da sua localização para mostrar serviços próximos',
    'en': 'We need your location to show nearby services',
    'es': 'Necesitamos tu ubicación para mostrar servicios cercanos',
    'fr': 'Nous avons besoin de votre position pour afficher les services à proximité',
    'it': 'Abbiamo bisogno della tua posizione per mostrare i servizi nelle vicinanze'
  },
  'services.petshop': {
    'pt-BR': 'Petshops', 'en': 'Pet Shops', 'es': 'Tiendas',
    'fr': 'Animaleries', 'it': 'Negozi'
  },
  'services.vet_clinic': {
    'pt-BR': 'Clínicas', 'en': 'Clinics', 'es': 'Clínicas',
    'fr': 'Cliniques', 'it': 'Cliniche'
  },
  'services.grooming': {
    'pt-BR': 'Banho & Tosa', 'en': 'Grooming', 'es': 'Peluquería', 
    'fr': 'Toilettage', 'it': 'Toelettatura'
  },
  'services.hotel': {
    'pt-BR': 'Hotel / Creche', 'en': 'Pet Hotel / Daycare', 'es': 'Hotel / Guardería',
    'fr': 'Hôtel / Garderie', 'it': 'Hotel / Asilo'
  },
  'services.trainer': {
    'pt-BR': 'Adestrador', 'en': 'Dog Trainer', 'es': 'Adiestrador', 
    'fr': 'Éducateur canin', 'it': 'Addestratore'
  },
  'services.radius': {
    'pt-BR': 'Raio de busca', 'en': 'Search radius', 'es': 'Radio de búsqueda',
    'fr': 'Rayon de recherche', 'it': 'Raggio di ricerca'
  },
  'services.open_filter': {
    'pt-BR': 'Apenas abertos', 'en': 'Open only', 'es': 'Solo abiertos',
    'fr': 'Ouvert seulement', 'it': 'Solo aperti'
  },
  'services.open_filter_desc': {
    'pt-BR': 'Filtra estabelecimentos abertos agora', 'en': 'Filter open places only',
    'es': 'Filtrar lugares abiertos ahora', 'fr': 'Filtrer les lieux ouverts',
    'it': 'Filtra luoghi aperti ora'
  },
  'services.updating': {
    'pt-BR': 'Atualizando resultados...', 'en': 'Updating results...', 'es': 'Actualizando resultados...',
    'fr': 'Mise à jour des résultats...', 'it': 'Aggiornamento risultati...'
  },
  'services.searching': {
    'pt-BR': 'Buscando estabelecimentos reais…', 'en': 'Searching real places…',
    'es': 'Buscando establecimientos reales…', 'fr': 'Recherche d\'établissements…',
    'it': 'Ricerca di luoghi reali…'
  },
  'services.wait': {
    'pt-BR': 'Aguarde um momento', 'en': 'Please wait', 'es': 'Por favor espera',
    'fr': 'Veuillez patienter', 'it': 'Attendere prego'
  },
  'services.no_results': {
    'pt-BR': 'Nenhum resultado', 'en': 'No results', 'es': 'Sin resultados',
    'fr': 'Aucun résultat', 'it': 'Nessun risultato'
  },
  'services.no_results_hint': {
    'pt-BR': 'Aumente o raio ou desligue "Apenas abertos".', 'en': 'Increase radius or turn off "Open only".',
    'es': 'Aumenta el radio o desactiva "Solo abiertos".', 'fr': 'Augmentez le rayon ou désactivez "Ouvert seulement".',
    'it': 'Aumenta il raggio o disattiva "Solo aperti".'
  },
  'services.expand_search': {
    'pt-BR': 'Ampliar busca', 'en': 'Expand search', 'es': 'Ampliar búsqueda',
    'fr': 'Élargir la recherche', 'it': 'Espandi ricerca'
  },
  'services.search_no_filter': {
    'pt-BR': 'Buscar sem filtro', 'en': 'Search without filter', 'es': 'Buscar sin filtro',
    'fr': 'Rechercher sans filtre', 'it': 'Cerca senza filtro'
  },
  'services.go_car': {
    'pt-BR': 'Ir de Carro', 'en': 'Drive', 'es': 'Ir en Auto',
    'fr': 'En voiture', 'it': 'In Auto'
  },
  'services.error_load': {
    'pt-BR': 'Não foi possível carregar', 'en': 'Could not load', 'es': 'No se pudo cargar',
    'fr': 'Impossible de charger', 'it': 'Impossibile caricare'
  },
  'services.rate_limit': {
    'pt-BR': 'Limite temporário atingido. Aguarde {seconds}s.', 
    'en': 'Temporary limit reached. Wait {seconds}s.',
    'es': 'Límite temporal alcanzado. Espera {seconds}s.',
    'fr': 'Limite temporaire atteinte. Attendez {seconds}s.',
    'it': 'Limite temporaneo raggiunto. Attendi {seconds}s.'
  },
  
  // Emergency
  'emergency.title': {
    'pt-BR': 'Emergência Veterinária', 'en': 'Veterinary Emergency', 'es': 'Emergencia Veterinaria',
    'fr': 'Urgence Vétérinaire', 'it': 'Emergenza Veterinaria'
  },
  'emergency.subtitle': {
    'pt-BR': 'Encontre atendimento veterinário 24h mais próximo de você',
    'en': 'Find the nearest 24h veterinary care',
    'es': 'Encuentra la atención veterinaria 24h más cercana',
    'fr': 'Trouvez les soins vétérinaires 24h les plus proches',
    'it': 'Trova l’assistenza veterinaria 24h più vicina'
  },
  'emergency.finding': {
    'pt-BR': 'Buscando veterinário 24h mais próximo...', 'en': 'Finding nearest 24h vet...'
  },
  'emergency.search_error': {
    'pt-BR': 'Erro na busca',
    'en': 'Search error',
    'es': 'Error en la búsqueda',
    'fr': 'Erreur de recherche',
    'it': 'Errore di ricerca'
  },
  'emergency.radius.title': {
    'pt-BR': 'Raio de busca',
    'en': 'Search radius',
    'es': 'Radio de búsqueda',
    'fr': 'Rayon de recherche',
    'it': 'Raggio di ricerca'
  },
  'emergency.loading.searching': {
    'pt-BR': 'Buscando veterinários de emergência…',
    'en': 'Searching emergency vets…',
    'es': 'Buscando veterinarios de emergencia…',
    'fr': 'Recherche de vétérinaires d’urgence…',
    'it': 'Ricerca di veterinari d’emergenza…'
  },
  'emergency.loading.subtitle': {
    'pt-BR': 'Procurando atendimento 24h',
    'en': 'Looking for 24h care',
    'es': 'Buscando atención 24h',
    'fr': 'Recherche de soins 24h',
    'it': 'Ricerca di assistenza 24h'
  },
  'emergency.none_found.title': {
    'pt-BR': 'Nenhum veterinário encontrado',
    'en': 'No vets found',
    'es': 'No se encontraron veterinarios',
    'fr': 'Aucun vétérinaire trouvé',
    'it': 'Nessun veterinario trovato'
  },
  'emergency.none_found.description': {
    'pt-BR': 'Não encontramos veterinários de emergência neste raio. Tente aumentar a distância.',
    'en': 'No emergency vets found in this radius. Try increasing the distance.',
    'es': 'No encontramos veterinarios de emergencia en este radio. Intenta aumentar la distancia.',
    'fr': 'Aucun vétérinaire d’urgence trouvé dans ce rayon. Essayez d’augmenter la distance.',
    'it': 'Nessun veterinario d’emergenza trovato in questo raggio. Prova ad aumentare la distanza.'
  },
  'emergency.none_found.expand': {
    'pt-BR': 'Ampliar busca',
    'en': 'Expand search',
    'es': 'Ampliar búsqueda',
    'fr': 'Élargir la recherche',
    'it': 'Espandi ricerca'
  },
  'emergency.location.loading.title': {
    'pt-BR': 'Obtendo localização...',
    'en': 'Getting location...',
    'es': 'Obteniendo ubicación...',
    'fr': 'Obtention de la localisation...',
    'it': 'Ottenimento della posizione...'
  },
  'emergency.location.loading.message': {
    'pt-BR': 'Por favor, aguarde',
    'en': 'Please wait',
    'es': 'Por favor, espera',
    'fr': 'Veuillez patienter',
    'it': 'Attendere prego'
  },
  'emergency.location.loading.manual': {
    'pt-BR': 'Permitir localização manualmente',
    'en': 'Allow location manually',
    'es': 'Permitir ubicación manualmente',
    'fr': 'Autoriser la localisation manuellement',
    'it': 'Consenti la posizione manualmente'
  },
  'emergency.location.error.title': {
    'pt-BR': 'Localização necessária',
    'en': 'Location required',
    'es': 'Ubicación necesaria',
    'fr': 'Localisation requise',
    'it': 'Posizione necessaria'
  },
  'emergency.location.error.hint': {
    'pt-BR': 'Para usar este recurso, habilite a localização nas configurações do navegador e recarregue a página.',
    'en': 'To use this feature, enable location in your browser settings and reload the page.',
    'es': 'Para usar esta función, habilita la ubicación en el navegador y recarga la página.',
    'fr': 'Pour utiliser cette fonctionnalité, activez la localisation dans votre navigateur et rechargez la page.',
    'it': 'Per usare questa funzione, abilita la posizione nel browser e ricarica la pagina.'
  },
  'emergency.location.error.alert': {
    'pt-BR': 'Erro ao obter localização: {message}',
    'en': 'Error getting location: {message}',
    'es': 'Error al obtener ubicación: {message}',
    'fr': 'Erreur de localisation : {message}',
    'it': 'Errore nel recupero della posizione: {message}'
  },

  // Favorites
  'favorites.title': {
    'pt-BR': 'Meus Lugares',
    'en': 'My Places',
    'es': 'Mis Lugares',
    'fr': 'Mes lieux',
    'it': 'I miei luoghi'
  },
  'favorites.subtitle': {
    'pt-BR': 'Clínicas, petshops e serviços favoritos',
    'en': 'Favorite clinics, pet shops, and services',
    'es': 'Clínicas, tiendas y servicios favoritos',
    'fr': 'Cliniques, animaleries et services favoris',
    'it': 'Cliniche, negozi e servizi preferiti'
  },
  'favorites.empty.title': {
    'pt-BR': 'Nenhum lugar salvo',
    'en': 'No saved places',
    'es': 'No hay lugares guardados',
    'fr': 'Aucun lieu enregistré',
    'it': 'Nessun luogo salvato'
  },
  'favorites.empty.subtitle': {
    'pt-BR': 'Favorite lugares em Serviços ou Socorro 24h',
    'en': 'Favorite places in Services or Emergency',
    'es': 'Guarda lugares en Servicios o Emergencia',
    'fr': 'Ajoutez des lieux dans Services ou Urgence',
    'it': 'Aggiungi luoghi in Servizi o Emergenza'
  },
  'favorites.empty.services': {
    'pt-BR': 'Ver Serviços',
    'en': 'View Services',
    'es': 'Ver Servicios',
    'fr': 'Voir les services',
    'it': 'Vedi servizi'
  },
  'favorites.empty.emergency': {
    'pt-BR': 'Socorro 24h',
    'en': 'Emergency',
    'es': 'Emergencia',
    'fr': 'Urgence',
    'it': 'Emergenza'
  },
  'favorites.count': {
    'pt-BR': '{count} lugares salvos',
    'en': '{count} saved places',
    'es': '{count} lugares guardados',
    'fr': '{count} lieux enregistrés',
    'it': '{count} luoghi salvati'
  },
  'favorites.clear_all': {
    'pt-BR': 'Limpar tudo',
    'en': 'Clear all',
    'es': 'Limpiar todo',
    'fr': 'Tout effacer',
    'it': 'Cancella tutto'
  },
  'favorites.clear_confirm': {
    'pt-BR': 'Remover todos os favoritos?',
    'en': 'Remove all favorites?',
    'es': '¿Eliminar todos los favoritos?',
    'fr': 'Supprimer tous les favoris ?',
    'it': 'Rimuovere tutti i preferiti?'
  },
  'favorites.remove': {
    'pt-BR': 'Remover',
    'en': 'Remove',
    'es': 'Quitar',
    'fr': 'Supprimer',
    'it': 'Rimuovi'
  },
  'favorites.whatsapp': {
    'pt-BR': 'WhatsApp',
    'en': 'WhatsApp',
    'es': 'WhatsApp',
    'fr': 'WhatsApp',
    'it': 'WhatsApp'
  },
  'favorites.directions': {
    'pt-BR': 'Rotas',
    'en': 'Directions',
    'es': 'Rutas',
    'fr': 'Itinéraire',
    'it': 'Indicazioni'
  },
  'emergency.openNow': {
    'pt-BR': 'Aberto agora', 'en': 'Open now', 'es': 'Abierto ahora', 
    'fr': 'Ouvert maintenant', 'it': 'Aperto ora'
  },
  'emergency.none_open': {
    'pt-BR': 'Não encontramos veterinário 24h aberto agora', 'en': 'No 24h vet found open right now'
  },
  'emergency.see_nearby': {
    'pt-BR': 'Ver mais próximos (horário a confirmar)', 'en': 'See nearby (confirm hours)'
  },
  'emergency.call_nearest': {
    'pt-BR': 'Ligar para o mais próximo', 'en': 'Call the nearest'
  },
  'emergency.change_location': {
    'pt-BR': 'Trocar cidade/bairro', 'en': 'Change location'
  },
  'emergency.go_now': {
    'pt-BR': 'Ir Agora', 'en': 'Go Now', 'es': 'Ir Ahora', 
    'fr': 'Y aller', 'it': 'Vai Ora'
  },
  
  // Shortcuts
  'shortcuts.title': {
    'pt-BR': '⚡ Meus Atalhos', 'en': '⚡ My Shortcuts', 'es': '⚡ Mis Atajos',
    'fr': '⚡ Mes Raccourcis', 'it': '⚡ I Miei Collegamenti'
  },
  'shortcuts.subtitle': {
    'pt-BR': 'Mais acionados por você', 'en': 'Most used by you', 'es': 'Más usados por ti',
    'fr': 'Les plus utilisés', 'it': 'I più usati'
  },
  'shortcuts.empty_title': {
    'pt-BR': 'Seus atalhos', 'en': 'Your shortcuts', 'es': 'Tus atajos',
    'fr': 'Vos raccourcis', 'it': 'I tuoi collegamenti'
  },
  'shortcuts.empty_hint': {
    'pt-BR': 'Seus atalhos aparecerão aqui conforme você usar o app', 
    'en': 'Your shortcuts will appear here as you use the app',
    'es': 'Tus atajos aparecerán aquí mientras uses la app',
    'fr': 'Vos raccourcis apparaîtront ici au fur et à mesure que vous utilisez l\'app',
    'it': 'I tuoi collegamenti appariranno qui mentre usi l\'app'
  },
  
  // Prices
  'prices.not_available': {
    'pt-BR': 'Comparação de preços ainda não disponível no seu país',
    'en': 'Price comparison not yet available in your country'
  },
  'prices.updated_ago': {
    'pt-BR': 'Atualizado há {minutes} min', 'en': 'Updated {minutes} min ago'
  },
  'prices.refresh': {
    'pt-BR': 'Atualizar agora', 'en': 'Refresh now'
  },
  
  // Common
  'common.open_now': {
    'pt-BR': 'Aberto agora', 'en': 'Open now', 'es': 'Abierto ahora', 
    'fr': 'Ouvert', 'it': 'Aperto'
  },
  'common.open': {
    'pt-BR': 'Aberto', 'en': 'Open', 'es': 'Abierto', 
    'fr': 'Ouvert', 'it': 'Aperto'
  },
  'common.closed': {
    'pt-BR': 'Fechado', 'en': 'Closed', 'es': 'Cerrado', 
    'fr': 'Fermé', 'it': 'Chiuso'
  },
  'common.go': {
    'pt-BR': 'Ir', 'en': 'Go', 'es': 'Ir', 
    'fr': 'Aller', 'it': 'Vai'
  },
  'common.call': {
    'pt-BR': 'Ligar', 'en': 'Call', 'es': 'Llamar', 
    'fr': 'Appeler', 'it': 'Chiama'
  },
  'common.message': {
    'pt-BR': 'Mensagem', 'en': 'Message', 'es': 'Mensaje', 
    'fr': 'Message', 'it': 'Messaggio'
  },
  'common.reviews': {
    'pt-BR': 'avaliações', 'en': 'reviews'
  },
  'common.retry': {
    'pt-BR': 'Tentar novamente', 'en': 'Try again', 'es': 'Intentar de nuevo',
    'fr': 'Réessayer', 'it': 'Riprova'
  },
  'common.pet': {
    'pt-BR': 'Seu pet', 'en': 'Your pet', 'es': 'Tu mascota',
    'fr': 'Votre animal', 'it': 'Il tuo animale'
  },
  'common.refresh': {
    'pt-BR': 'Atualizar', 'en': 'Refresh', 'es': 'Actualizar',
    'fr': 'Actualiser', 'it': 'Aggiorna'
  },
  'common.results_count': {
    'pt-BR': '{count} resultados', 'en': '{count} results', 'es': '{count} resultados',
    'fr': '{count} résultats', 'it': '{count} risultati'
  },
  'common.updated_now': {
    'pt-BR': 'Atualizado agora', 'en': 'Updated just now', 'es': 'Actualizado ahora',
    'fr': 'Mis à jour à l’instant', 'it': 'Aggiornato ora'
  },
  'common.updated_minutes_ago': {
    'pt-BR': 'Atualizado há {minutes} min', 'en': 'Updated {minutes} min ago',
    'es': 'Actualizado hace {minutes} min', 'fr': 'Mis à jour il y a {minutes} min',
    'it': 'Aggiornato {minutes} min fa'
  },
  'common.back_to_search': {
    'pt-BR': 'Voltar para a busca', 'en': 'Back to search', 'es': 'Volver a la búsqueda',
    'fr': 'Retour à la recherche', 'it': 'Torna alla ricerca'
  },
  'common.no_results': {
    'pt-BR': 'Nenhum resultado encontrado', 'en': 'No results found', 'es': 'No se encontraron resultados',
    'fr': 'Aucun résultat trouvé', 'it': 'Nessun risultato trovato'
  },
  'common.auto': {
    'pt-BR': 'Auto', 'en': 'Auto'
  },
  
  // Errors
  'error.timeout': {
    'pt-BR': 'Conexão lenta. Tente novamente.', 'en': 'Slow connection. Please try again.'
  },
  'error.network': {
    'pt-BR': 'Sem conexão. Verifique sua internet.', 'en': 'No connection. Check your internet.'
  },
  'error.search': {
    'pt-BR': 'Erro ao buscar. Tente novamente.', 'en': 'Search failed. Please try again.'
  },
  
  // Attribution
  'attribution.google': {
    'pt-BR': 'Dados de locais por Google', 'en': 'Location data by Google'
  },
  
  // Location
  'location.requesting': {
    'pt-BR': 'Solicitando sua localização...', 'en': 'Requesting your location...',
    'es': 'Solicitando tu ubicación...', 'fr': 'Demande de votre position...',
    'it': 'Richiedendo la tua posizione...'
  },
  'location.obtaining': {
    'pt-BR': 'Obtendo localização...', 'en': 'Getting location...',
    'es': 'Obteniendo ubicación...', 'fr': 'Obtention de la position...',
    'it': 'Ottenimento posizione...'
  },
  'location.please_wait': {
    'pt-BR': 'Por favor, aguarde', 'en': 'Please wait',
    'es': 'Por favor espera', 'fr': 'Veuillez patienter',
    'it': 'Attendere prego'
  },
  'location.allow_manual': {
    'pt-BR': 'Permitir localização manualmente', 'en': 'Allow location manually',
    'es': 'Permitir ubicación manualmente', 'fr': 'Autoriser manuellement la position',
    'it': 'Consenti manualmente la posizione'
  },
  'location.denied': {
    'pt-BR': 'Localização não permitida', 'en': 'Location not allowed',
    'es': 'Ubicación no permitida', 'fr': 'Position non autorisée',
    'it': 'Posizione non consentita'
  },
  'location.enable': {
    'pt-BR': 'Permitir localização', 'en': 'Enable location',
    'es': 'Permitir ubicación', 'fr': 'Activer la position',
    'it': 'Abilita posizione'
  },
  'location.required': {
    'pt-BR': 'Localização necessária', 'en': 'Location required',
    'es': 'Ubicación requerida', 'fr': 'Position requise',
    'it': 'Posizione richiesta'
  },
  'location.required_hint': {
    'pt-BR': 'Para usar este recurso, habilite a localização nas configurações do navegador e recarregue a página.',
    'en': 'To use this feature, enable location in browser settings and reload the page.',
    'es': 'Para usar esta función, habilita la ubicación en la configuración del navegador y recarga la página.',
    'fr': 'Pour utiliser cette fonctionnalité, activez la position dans les paramètres du navigateur et rechargez la page.',
    'it': 'Per usare questa funzione, abilita la posizione nelle impostazioni del browser e ricarica la pagina.'
  },
  'location.try_again': {
    'pt-BR': 'Tentar Novamente', 'en': 'Try Again',
    'es': 'Intentar de Nuevo', 'fr': 'Réessayer',
    'it': 'Riprova'
  },
  'location.error.permission_denied': {
    'pt-BR': 'Permissão de localização negada. Por favor, habilite nas configurações do navegador.',
    'en': 'Location permission denied. Please enable it in your browser settings.',
    'es': 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.',
    'fr': 'Autorisation de localisation refusée. Activez-la dans les paramètres du navigateur.',
    'it': 'Permesso di localizzazione negato. Abilitalo nelle impostazioni del browser.'
  },
  'location.error.unavailable': {
    'pt-BR': 'Informação de localização indisponível no momento.',
    'en': 'Location information is unavailable right now.',
    'es': 'La información de ubicación no está disponible en este momento.',
    'fr': 'Les informations de localisation sont indisponibles pour le moment.',
    'it': 'Le informazioni sulla posizione non sono disponibili al momento.'
  },
  'location.error.timeout': {
    'pt-BR': 'Tempo esgotado ao tentar obter localização.',
    'en': 'Timed out while trying to get location.',
    'es': 'Se agotó el tiempo al intentar obtener la ubicación.',
    'fr': 'Délai dépassé lors de l’obtention de la localisation.',
    'it': 'Tempo scaduto nel tentativo di ottenere la posizione.'
  },
  'location.error.unsupported': {
    'pt-BR': 'Geolocalização não suportada pelo navegador.',
    'en': 'Geolocation is not supported by this browser.',
    'es': 'La geolocalización no es compatible con este navegador.',
    'fr': 'La géolocalisation n’est pas prise en charge par ce navigateur.',
    'it': 'La geolocalizzazione non è supportata da questo browser.'
  },
  'location.error.unknown': {
    'pt-BR': 'Erro desconhecido ao obter localização.',
    'en': 'Unknown error while getting location.',
    'es': 'Error desconocido al obtener la ubicación.',
    'fr': 'Erreur inconnue lors de l’obtention de la localisation.',
    'it': 'Errore sconosciuto durante il recupero della posizione.'
  },
  'location.error.alert': {
    'pt-BR': 'Erro ao obter localização: {message}',
    'en': 'Error getting location: {message}',
    'es': 'Error al obtener ubicación: {message}',
    'fr': 'Erreur de localisation : {message}',
    'it': 'Errore nel recupero della posizione: {message}'
  },
  
  // Pages
  'page.reorder.title': {
    'pt-BR': 'Recompra', 'en': 'Reorder'
  },
  'page.tips.title': {
    'pt-BR': 'Dúvidas e Dicas', 'en': 'Tips & Questions'
  },
  'page.favorites.title': {
    'pt-BR': 'Favoritos', 'en': 'Favorites'
  },
  'pages.reorder.description': {
    'pt-BR': 'Em breve você poderá salvar seus produtos favoritos e receber alertas para não faltar.',
    'en': 'Soon you can save your favorite products and get alerts so you never run out.',
    'es': 'Pronto podrás guardar tus productos favoritos y recibir alertas para no quedarte sin.',
    'fr': 'Bientôt vous pourrez sauvegarder vos produits favoris et recevoir des alertes.',
    'it': 'Presto potrai salvare i tuoi prodotti preferiti e ricevere avvisi.'
  },
  'pages.reorder.hint': {
    'pt-BR': 'Por enquanto, use a busca para encontrar seus produtos',
    'en': 'For now, use search to find your products',
    'es': 'Por ahora, usa la búsqueda para encontrar tus productos',
    'fr': 'Pour l\'instant, utilisez la recherche pour trouver vos produits',
    'it': 'Per ora, usa la ricerca per trovare i tuoi prodotti'
  },

  'pages.tips.description': {
    'pt-BR': 'Dicas de comportamento e cuidados para seu pet.',
    'en': 'Behavior tips and care advice for your pet.',
    'es': 'Consejos de comportamiento y cuidados para tu mascota.',
    'fr': 'Conseils de comportement et de soins pour votre animal.',
    'it': 'Consigli sul comportamento e la cura del tuo animale.'
  },
  'pages.tips.hint': {
    'pt-BR': 'Em breve teremos dicas úteis aqui. Para emergências, use o Socorro Agora.',
    'en': 'We\'ll have helpful tips here soon. For emergencies, use Emergency Now.',
    'es': 'Pronto tendremos consejos útiles aquí. Para emergencias, usa Socorro Ahora.',
    'fr': 'Nous aurons bientôt des conseils utiles ici. Pour les urgences, utilisez Urgence.',
    'it': 'Presto avremo consigli utili qui. Per le emergenze, usa Emergenza.'
  },
  'pages.favorites.description': {
    'pt-BR': 'Seus produtos e locais favoritos.',
    'en': 'Your favorite products and places.',
    'es': 'Tus productos y lugares favoritos.',
    'fr': 'Vos produits et lieux favoris.',
    'it': 'I tuoi prodotti e luoghi preferiti.'
  },
  'pages.favorites.empty': {
    'pt-BR': 'Nenhum favorito ainda',
    'en': 'No favorites yet',
    'es': 'Sin favoritos aún',
    'fr': 'Pas encore de favoris',
    'it': 'Nessun preferito ancora'
  },
  'pages.favorites.hint': {
    'pt-BR': 'Ao buscar produtos, você poderá salvá-los aqui para acesso rápido.',
    'en': 'When searching for products, you can save them here for quick access.',
    'es': 'Al buscar productos, podrás guardarlos aquí para acceso rápido.',
    'fr': 'En recherchant des produits, vous pourrez les sauvegarder ici pour un accès rapide.',
    'it': 'Cercando prodotti, potrai salvarli qui per un accesso rapido.'
  },
  
  // Locale selector
  'locale.country': {
    'pt-BR': 'País', 'en': 'Country', 'es': 'País', 
    'fr': 'Pays', 'it': 'Paese'
  },
  'locale.language': {
    'pt-BR': 'Idioma', 'en': 'Language', 'es': 'Idioma', 
    'fr': 'Langue', 'it': 'Lingua'
  },
  'locale.travel_detected': {
    'pt-BR': '✈️ Viagem Detectada!', 'en': '✈️ Travel Detected!', 'es': '✈️ ¡Viaje Detectado!',
    'fr': '✈️ Voyage Détecté !', 'it': '✈️ Viaggio Rilevato!'
  },
  'locale.arrived_in': {
    'pt-BR': 'Parece que você chegou em', 'en': 'It looks like you arrived in', 'es': 'Parece que llegaste a',
    'fr': 'Il semble que vous soyez arrivé en', 'it': 'Sembra che tu sia arrivato in'
  },
  'locale.change_language_question': {
    'pt-BR': 'Deseja mudar o idioma para', 'en': 'Would you like to change language to', 'es': '¿Quieres cambiar el idioma a',
    'fr': 'Voulez-vous changer la langue en', 'it': 'Vuoi cambiare la lingua in'
  },
  'locale.yes_change': {
    'pt-BR': 'Sim, mudar idioma', 'en': 'Yes, change language', 'es': 'Sí, cambiar idioma',
    'fr': 'Oui, changer la langue', 'it': 'Sì, cambia lingua'
  },
  'locale.keep_current': {
    'pt-BR': 'Manter idioma atual', 'en': 'Keep current language', 'es': 'Mantener idioma actual',
    'fr': 'Garder la langue actuelle', 'it': 'Mantieni lingua attuale'
  },
  'locale.auto_updated': {
    'pt-BR': '✅ Idioma atualizado automaticamente para o país atual', 'en': '✅ Language automatically updated for current country', 'es': '✅ Idioma actualizado automáticamente para el país actual',
    'fr': '✅ Langue mise à jour automatiquement pour le pays actuel', 'it': '✅ Lingua aggiornata automaticamente per il paese attuale'
  },
  
  // Footer
  'footer.privacy': {
    'pt-BR': 'Privacidade', 'en': 'Privacy', 'es': 'Privacidad',
    'fr': 'Confidentialité', 'it': 'Privacy'
  },
  'footer.terms': {
    'pt-BR': 'Termos de Uso', 'en': 'Terms of Use', 'es': 'Términos de Uso',
    'fr': 'Conditions', 'it': 'Termini'
  },
  'footer.coverage': {
    'pt-BR': 'Cobertura', 'en': 'Coverage', 'es': 'Cobertura',
    'fr': 'Couverture', 'it': 'Copertura'
  },
  
  // Page titles
  'privacy.title': {
    'pt-BR': 'Política de Privacidade', 'en': 'Privacy Policy', 'es': 'Política de Privacidad',
    'fr': 'Politique de Confidentialité', 'it': 'Politica sulla Privacy'
  },
  'terms.title': {
    'pt-BR': 'Termos de Uso', 'en': 'Terms of Use', 'es': 'Términos de Uso',
    'fr': 'Conditions d\'Utilisation', 'it': 'Termini di Utilizzo'
  },
  'privacy.last_updated.label': {
    'pt-BR': 'Última atualização:',
    'en': 'Last updated:',
    'es': 'Última actualización:',
    'fr': 'Dernière mise à jour :',
    'it': 'Ultimo aggiornamento:'
  },
  'privacy.last_updated.value': {
    'pt-BR': 'Dezembro 2024',
    'en': 'December 2024',
    'es': 'Diciembre 2024',
    'fr': 'Décembre 2024',
    'it': 'Dicembre 2024'
  },
  'privacy.section1.title': {
    'pt-BR': '1. Dados que coletamos',
    'en': '1. Data we collect',
    'es': '1. Datos que recopilamos',
    'fr': '1. Données que nous collectons',
    'it': '1. Dati che raccogliamo'
  },
  'privacy.section1.location.label': {
    'pt-BR': 'Localização:',
    'en': 'Location:',
    'es': 'Ubicación:',
    'fr': 'Localisation :',
    'it': 'Posizione:'
  },
  'privacy.section1.location.text': {
    'pt-BR': 'Apenas quando você autoriza, para mostrar serviços próximos. Não armazenamos histórico de localização.',
    'en': 'Only when you authorize it, to show nearby services. We don\'t store location history.',
    'es': 'Solo cuando lo autorizas, para mostrar servicios cercanos. No almacenamos el historial de ubicación.',
    'fr': 'Uniquement lorsque vous l\'autorisez, pour afficher les services à proximité. Nous ne stockons pas l\'historique de localisation.',
    'it': 'Solo quando lo autorizzi, per mostrare servizi vicini. Non conserviamo la cronologia della posizione.'
  },
  'privacy.section1.preferences.label': {
    'pt-BR': 'Preferências:',
    'en': 'Preferences:',
    'es': 'Preferencias:',
    'fr': 'Préférences :',
    'it': 'Preferenze:'
  },
  'privacy.section1.preferences.text': {
    'pt-BR': 'País e idioma escolhidos (localStorage no seu dispositivo).',
    'en': 'Country and language choices (localStorage on your device).',
    'es': 'País e idioma elegidos (localStorage en tu dispositivo).',
    'fr': 'Pays et langue choisis (localStorage sur votre appareil).',
    'it': 'Paese e lingua scelti (localStorage sul tuo dispositivo).'
  },
  'privacy.section1.searches.label': {
    'pt-BR': 'Buscas:',
    'en': 'Searches:',
    'es': 'Búsquedas:',
    'fr': 'Recherches :',
    'it': 'Ricerche:'
  },
  'privacy.section1.searches.text': {
    'pt-BR': 'Termos de busca são enviados ao servidor apenas para retornar resultados. Não associamos buscas a você pessoalmente.',
    'en': 'Search terms are sent to the server only to return results. We don\'t associate searches with you personally.',
    'es': 'Los términos de búsqueda se envían al servidor solo para devolver resultados. No asociamos búsquedas contigo personalmente.',
    'fr': 'Les termes de recherche sont envoyés au serveur uniquement pour retourner des résultats. Nous ne les associons pas à votre identité.',
    'it': 'I termini di ricerca vengono inviati al server solo per restituire risultati. Non associamo le ricerche alla tua identità.'
  },
  'privacy.section2.title': {
    'pt-BR': '2. Dados que NÃO coletamos',
    'en': '2. Data we do NOT collect',
    'es': '2. Datos que NO recopilamos',
    'fr': '2. Données que nous ne collectons PAS',
    'it': '2. Dati che NON raccogliamo'
  },
  'privacy.section2.item1': {
    'pt-BR': 'Não coletamos nome, e-mail, telefone ou outros dados pessoais identificáveis.',
    'en': 'We don\'t collect name, email, phone, or other personally identifiable information.',
    'es': 'No recopilamos nombre, correo, teléfono ni otros datos personales identificables.',
    'fr': 'Nous ne collectons pas de nom, e-mail, téléphone ou autres données personnelles identifiables.',
    'it': 'Non raccogliamo nome, email, telefono o altri dati personali identificabili.'
  },
  'privacy.section2.item2': {
    'pt-BR': 'Não rastreamos você entre sites.',
    'en': 'We don\'t track you across websites.',
    'es': 'No te rastreamos entre sitios web.',
    'fr': 'Nous ne vous suivons pas d\'un site à l\'autre.',
    'it': 'Non ti tracciamo tra siti web.'
  },
  'privacy.section2.item3': {
    'pt-BR': 'Não vendemos dados a terceiros.',
    'en': 'We don\'t sell data to third parties.',
    'es': 'No vendemos datos a terceros.',
    'fr': 'Nous ne vendons pas de données à des tiers.',
    'it': 'Non vendiamo dati a terzi.'
  },
  'privacy.section3.title': {
    'pt-BR': '3. Dados de terceiros',
    'en': '3. Third-party data',
    'es': '3. Datos de terceros',
    'fr': '3. Données de tiers',
    'it': '3. Dati di terze parti'
  },
  'privacy.section3.text': {
    'pt-BR': 'Usamos o Google Places para mostrar locais como petshops e veterinários. Os dados são fornecidos pelo Google e sujeitos à política de privacidade deles.',
    'en': 'We use Google Places to show locations like pet shops and veterinarians. Data is provided by Google and subject to their privacy policy.',
    'es': 'Usamos Google Places para mostrar lugares como tiendas y veterinarios. Los datos son proporcionados por Google y están sujetos a su política de privacidad.',
    'fr': 'Nous utilisons Google Places pour afficher des lieux comme les animaleries et vétérinaires. Les données sont fournies par Google et soumises à leur politique de confidentialité.',
    'it': 'Usiamo Google Places per mostrare luoghi come negozi per animali e veterinari. I dati sono forniti da Google e soggetti alla loro politica sulla privacy.'
  },
  'privacy.section4.title': {
    'pt-BR': '4. Retenção',
    'en': '4. Retention',
    'es': '4. Retención',
    'fr': '4. Rétention',
    'it': '4. Conservazione'
  },
  'privacy.section4.text': {
    'pt-BR': 'Logs de servidor são mantidos por no máximo 30 dias para fins de diagnóstico e não contêm informações pessoais identificáveis.',
    'en': 'Server logs are kept for a maximum of 30 days for diagnostics and do not contain personally identifiable information.',
    'es': 'Los registros del servidor se mantienen por un máximo de 30 días para diagnóstico y no contienen información personal identificable.',
    'fr': 'Les journaux serveur sont conservés au maximum 30 jours à des fins de diagnostic et ne contiennent pas d\'informations personnelles identifiables.',
    'it': 'I log del server vengono conservati per un massimo di 30 giorni a fini diagnostici e non contengono informazioni personali identificabili.'
  },
  'privacy.section5.title': {
    'pt-BR': '5. Contato',
    'en': '5. Contact',
    'es': '5. Contacto',
    'fr': '5. Contact',
    'it': '5. Contatto'
  },
  'privacy.section5.text': {
    'pt-BR': 'Dúvidas sobre privacidade: entre em contato pelo site.',
    'en': 'Privacy questions: contact us through the website.',
    'es': 'Dudas sobre privacidad: contáctanos a través del sitio.',
    'fr': 'Questions de confidentialité : contactez-nous via le site.',
    'it': 'Dubbi sulla privacy: contattaci tramite il sito.'
  },
  'terms.last_updated.label': {
    'pt-BR': 'Última atualização:',
    'en': 'Last updated:',
    'es': 'Última actualización:',
    'fr': 'Dernière mise à jour :',
    'it': 'Ultimo aggiornamento:'
  },
  'terms.last_updated.value': {
    'pt-BR': 'Dezembro 2024',
    'en': 'December 2024',
    'es': 'Diciembre 2024',
    'fr': 'Décembre 2024',
    'it': 'Dicembre 2024'
  },
  'terms.section1.title': {
    'pt-BR': '1. Sobre o PETMOL',
    'en': '1. About PETMOL',
    'es': '1. Sobre PETMOL',
    'fr': '1. À propos de PETMOL',
    'it': '1. Informazioni su PETMOL'
  },
  'terms.section1.text': {
    'pt-BR': 'O PETMOL é uma plataforma de informações para facilitar a busca de serviços e produtos para pets.',
    'en': 'PETMOL is an information platform to help you find pet services and products.',
    'es': 'PETMOL es una plataforma de información para ayudarte a encontrar servicios y productos para mascotas.',
    'fr': 'PETMOL est une plateforme d\'information pour vous aider à trouver des services et produits pour animaux.',
    'it': 'PETMOL è una piattaforma informativa per aiutarti a trovare servizi e prodotti per animali.'
  },
  'terms.section2.title': {
    'pt-BR': '2. Isenção de responsabilidade médica',
    'en': '2. Medical disclaimer',
    'es': '2. Exención de responsabilidad médica',
    'fr': '2. Avis médical',
    'it': '2. Esclusione di responsabilità medica'
  },
  'terms.section2.warning': {
    'pt-BR': '⚠️ O PETMOL NÃO substitui atendimento veterinário profissional.',
    'en': '⚠️ PETMOL does NOT replace professional veterinary care.',
    'es': '⚠️ PETMOL NO reemplaza la atención veterinaria profesional.',
    'fr': '⚠️ PETMOL ne remplace PAS les soins vétérinaires professionnels.',
    'it': '⚠️ PETMOL NON sostituisce le cure veterinarie professionali.'
  },
  'terms.section2.text': {
    'pt-BR': 'Sempre consulte um veterinário para questões de saúde do seu pet. Informações de horário de funcionamento e disponibilidade podem variar.',
    'en': 'Always consult a veterinarian for your pet\'s health questions. Business hours and availability information may vary.',
    'es': 'Consulta siempre a un veterinario para cuestiones de salud de tu mascota. Los horarios y la disponibilidad pueden variar.',
    'fr': 'Consultez toujours un vétérinaire pour la santé de votre animal. Les horaires et la disponibilité peuvent varier.',
    'it': 'Consulta sempre un veterinario per la salute del tuo animale. Orari e disponibilità possono variare.'
  },
  'terms.section3.title': {
    'pt-BR': '3. Dados de terceiros',
    'en': '3. Third-party data',
    'es': '3. Datos de terceros',
    'fr': '3. Données de tiers',
    'it': '3. Dati di terze parti'
  },
  'terms.section3.text': {
    'pt-BR': 'Informações de locais (endereço, horário, avaliações) são fornecidas por Google Places e podem não estar atualizadas. Recomendamos confirmar diretamente com o estabelecimento.',
    'en': 'Location information (address, hours, reviews) is provided by Google Places and may not be up to date. We recommend confirming directly with the business.',
    'es': 'La información de lugares (dirección, horario, reseñas) es proporcionada por Google Places y puede no estar actualizada. Recomendamos confirmar con el establecimiento.',
    'fr': 'Les informations de lieux (adresse, horaires, avis) sont fournies par Google Places et peuvent ne pas être à jour. Nous recommandons de confirmer avec l\'établissement.',
    'it': 'Le informazioni sui luoghi (indirizzo, orari, recensioni) sono fornite da Google Places e potrebbero non essere aggiornate. Consigliamo di confermare con l\'attività.'
  },
  'terms.section4.title': {
    'pt-BR': '4. Preços',
    'en': '4. Prices',
    'es': '4. Precios',
    'fr': '4. Prix',
    'it': '4. Prezzi'
  },
  'terms.section4.text': {
    'pt-BR': 'Preços exibidos são informativos e podem variar. O PETMOL não vende produtos diretamente - redirecionamos você para as lojas parceiras.',
    'en': 'Displayed prices are for information only and may vary. PETMOL does not sell products directly — we redirect you to partner stores.',
    'es': 'Los precios mostrados son informativos y pueden variar. PETMOL no vende productos directamente: te redirigimos a tiendas asociadas.',
    'fr': 'Les prix affichés sont indicatifs et peuvent varier. PETMOL ne vend pas directement — nous vous redirigeons vers des partenaires.',
    'it': 'I prezzi mostrati sono indicativi e possono variare. PETMOL non vende direttamente — ti reindirizziamo ai partner.'
  },
  'terms.section5.title': {
    'pt-BR': '5. Uso adequado',
    'en': '5. Acceptable use',
    'es': '5. Uso adecuado',
    'fr': '5. Usage acceptable',
    'it': '5. Uso appropriato'
  },
  'terms.section5.text': {
    'pt-BR': 'Use o serviço de forma responsável. Não é permitido uso automatizado ou que sobrecarregue nossos sistemas.',
    'en': 'Use the service responsibly. Automated use or overloading our systems is not allowed.',
    'es': 'Usa el servicio de forma responsable. No se permite el uso automatizado ni sobrecargar nuestros sistemas.',
    'fr': 'Utilisez le service de manière responsable. L\'usage automatisé ou la surcharge de nos systèmes n\'est pas autorisé.',
    'it': 'Usa il servizio responsabilmente. Non è consentito l\'uso automatizzato o il sovraccarico dei nostri sistemi.'
  },
  'coverage.title': {
    'pt-BR': 'Cobertura do PETMOL', 'en': 'PETMOL Coverage', 'es': 'Cobertura de PETMOL',
    'fr': 'Couverture PETMOL', 'it': 'Copertura PETMOL'
  },
  
  // Event Nudge
  'event_nudge.title': {
    'pt-BR': 'Foi visitar alguém?', 'en': 'Did you visit?', 'es': '¿Hiciste una visita?',
    'fr': 'Une visite?', 'it': 'Hai fatto una visita?'
  },
  'event_nudge.question': {
    'pt-BR': 'Você levou seu pet neste local?', 'en': 'Did you take your pet to this place?',
    'es': '¿Llevaste tu mascota a este lugar?', 'fr': 'Avez-vous emmené votre animal ici?',
    'it': 'Hai portato il tuo animale qui?'
  },
  'event_nudge.select_pets': {
    'pt-BR': 'Quais pets?', 'en': 'Which pets?', 'es': '¿Cuáles mascotas?',
    'fr': 'Quels animaux?', 'it': 'Quali animali?'
  },
  'event_nudge.no_pets': {
    'pt-BR': 'Nenhum pet cadastrado. Cadastre no módulo Saúde para vincular este evento.',
    'en': 'No pets registered. Add one in Health to link this event.',
    'es': 'No hay mascotas registradas. Añade una en Salud para vincular este evento.',
    'fr': 'Aucun animal enregistré. Ajoutez-en un dans Santé pour lier cet événement.',
    'it': 'Nessun animale registrato. Aggiungine uno in Salute per collegare questo evento.'
  },
  'event_nudge.event_type': {
    'pt-BR': 'Tipo de visita', 'en': 'Visit type', 'es': 'Tipo de visita',
    'fr': 'Type de visite', 'it': 'Tipo di visita'
  },
  'event_nudge.vet_visit': {
    'pt-BR': 'Consulta', 'en': 'Vet Visit', 'es': 'Consulta',
    'fr': 'Consultation', 'it': 'Visita'
  },
  'event_nudge.service_visit': {
    'pt-BR': 'Serviço', 'en': 'Service', 'es': 'Servicio',
    'fr': 'Service', 'it': 'Servizio'
  },
  'event_nudge.notes_optional': {
    'pt-BR': 'Notas (opcional)', 'en': 'Notes (optional)', 'es': 'Notas (opcional)',
    'fr': 'Notes (optionnel)', 'it': 'Note (facoltativo)'
  },
  'event_nudge.notes_placeholder': {
    'pt-BR': 'Ex: Aplicou vacina antirrábica', 'en': 'Ex: Applied rabies vaccine',
    'es': 'Ej: Aplicó vacuna antirrábica', 'fr': 'Ex: Vaccin contre la rage',
    'it': 'Es: Vaccinazione antirabbica'
  },
  'event_nudge.confirm': {
    'pt-BR': 'Sim, confirmar visita', 'en': 'Yes, confirm visit', 'es': 'Sí, confirmar visita',
    'fr': 'Oui, confirmer', 'it': 'Sì, conferma visita'
  },
  'event_nudge.not_now': {
    'pt-BR': 'Agora não', 'en': 'Not now', 'es': 'Ahora no',
    'fr': 'Pas maintenant', 'it': 'Non ora'
  },
  'event_nudge.pause_24h': {
    'pt-BR': 'Pausar 24h', 'en': 'Pause 24h', 'es': 'Pausar 24h',
    'fr': 'Pause 24h', 'it': 'Pausa 24h'
  },
  'event_nudge.ignore_place': {
    'pt-BR': 'Nunca perguntar sobre este local', 'en': 'Never ask about this place',
    'es': 'Nunca preguntar sobre este lugar', 'fr': 'Ne plus demander pour ce lieu',
    'it': 'Non chiedere più per questo posto'
  },

  // Event Engine Config
  'event_config.quiet_hours': {
    'pt-BR': 'Horário de silêncio', 'en': 'Quiet hours',
    'es': 'Horario silencioso', 'fr': 'Heures de silence',
    'it': 'Ore silenziose'
  },
  'event_config.quiet_hours_desc': {
    'pt-BR': 'Não mostrar prompts entre 22h e 8h', 'en': 'Don\'t show prompts 10PM-8AM',
    'es': 'No mostrar avisos entre 22h y 8h', 'fr': 'Pas d\'invites 22h-8h',
    'it': 'Nessun prompt 22-8'
  },
  'event_config.pause_all': {
    'pt-BR': 'Pausar todos os prompts', 'en': 'Pause all prompts',
    'es': 'Pausar avisos', 'fr': 'Pause invites',
    'it': 'Pausa prompt'
  },

  // Identity Kit
  'identity_kit.title': {
    'pt-BR': 'Kit Identidade', 'en': 'Identity Kit',
    'es': 'Kit de Identidad', 'fr': 'Kit d\'Identité',
    'it': 'Kit Identità'
  },
  'identity_kit.passport_title': {
    'pt-BR': 'PET PASSPORT', 'en': 'PET PASSPORT',
    'es': 'PASAPORTE DE MASCOTA', 'fr': 'PASSEPORT ANIMALIER',
    'it': 'PASSAPORTO PET'
  },
  'identity_kit.passport_subtitle': {
    'pt-BR': 'República Unida dos Pets', 'en': 'United Republic of Pets',
    'es': 'República Unida de las Mascotas', 'fr': 'République Unie des Animaux',
    'it': 'Repubblica Unita degli Animali'
  },
  'identity_kit.doc_label': {
    'pt-BR': 'DOC', 'en': 'DOC',
    'es': 'DOC', 'fr': 'DOC',
    'it': 'DOC'
  },
  'identity_kit.qr_title': {
    'pt-BR': 'QR DE EMERGÊNCIA', 'en': 'EMERGENCY QR',
    'es': 'QR DE EMERGENCIA', 'fr': 'QR D\'URGENCE',
    'it': 'QR DI EMERGENZA'
  },
  'identity_kit.qr_message': {
    'pt-BR': 'Se eu me perdi, escaneie', 'en': 'If I\'m lost, please scan',
    'es': 'Si estoy perdido, escanea', 'fr': 'Si je suis perdu, scannez',
    'it': 'Se sono perso, scansiona'
  },
  'identity_kit.species': {
    'pt-BR': 'Espécie', 'en': 'Species',
    'es': 'Especie', 'fr': 'Espèce',
    'it': 'Specie'
  },
  'identity_kit.breed': {
    'pt-BR': 'Raça', 'en': 'Breed',
    'es': 'Raza', 'fr': 'Race',
    'it': 'Razza'
  },
  'identity_kit.issued': {
    'pt-BR': 'Emitido', 'en': 'Issued',
    'es': 'Emitido', 'fr': 'Émis',
    'it': 'Emesso'
  },
  'identity_kit.name': {
    'pt-BR': 'Nome', 'en': 'Name',
    'es': 'Nombre', 'fr': 'Nom',
    'it': 'Nome'
  },
  'identity_kit.signature_label': {
    'pt-BR': 'Assinatura — Tutor(a)', 'en': 'Signature — Guardian',
    'es': 'Firma — Tutor(a)', 'fr': 'Signature — Tuteur',
    'it': 'Firma — Tutore'
  },
  'identity_kit.stamp': {
    'pt-BR': 'APROVADO', 'en': 'APPROVED',
    'es': 'APROBADO', 'fr': 'APPROUVÉ',
    'it': 'APPROVATO'
  },
  'identity_kit.disclaimer': {
    'pt-BR': 'Este é um documento de entretenimento.', 'en': 'This is an entertainment document.',
    'es': 'Este es un documento de entretenimiento.', 'fr': 'Ceci est un document de divertissement.',
    'it': 'Questo è un documento di intrattenimento.'
  },
  'identity_kit.watermark': {
    'pt-BR': 'Gerado no PETMOL — faça o do seu pet', 'en': 'Generated on PETMOL — Create yours',
    'es': 'Generado en PETMOL — Crea el tuyo', 'fr': 'Généré sur PETMOL — Créez le vôtre',
    'it': 'Generato su PETMOL — Crea il tuo'
  },
  'identity_kit.generate_passport': {
    'pt-BR': '🎫 Gerar Passaporte', 'en': '🎫 Generate Passport',
    'es': '🎫 Generar Pasaporte', 'fr': '🎫 Générer Passeport',
    'it': '🎫 Genera Passaporto'
  },
  'identity_kit.generate_qr': {
    'pt-BR': '📱 Gerar QR de Emergência', 'en': '📱 Generate Emergency QR',
    'es': '📱 Generar QR de Emergencia', 'fr': '📱 Générer QR d\'Urgence',
    'it': '📱 Genera QR di Emergenza'
  },
  'identity_kit.share': {
    'pt-BR': '📤 Compartilhar', 'en': '📤 Share',
    'es': '📤 Compartir', 'fr': '📤 Partager',
    'it': '📤 Condividi'
  },
  'identity_kit.theme_classic': {
    'pt-BR': 'Clássico', 'en': 'Classic',
    'es': 'Clásico', 'fr': 'Classique',
    'it': 'Classico'
  },
  'identity_kit.theme_cute': {
    'pt-BR': 'Fofo', 'en': 'Cute',
    'es': 'Lindo', 'fr': 'Mignon',
    'it': 'Carino'
  },
  'identity_kit.theme_neon': {
    'pt-BR': 'Neon Tokyo', 'en': 'Neon Tokyo',
    'es': 'Neon Tokyo', 'fr': 'Neon Tokyo',
    'it': 'Neon Tokyo'
  },
  'identity_kit.theme_label': {
    'pt-BR': 'Tema', 'en': 'Theme',
    'es': 'Tema', 'fr': 'Thème',
    'it': 'Tema'
  },
  'identity_kit.generating': {
    'pt-BR': '⏳ Gerando...', 'en': '⏳ Generating...',
    'es': '⏳ Generando...', 'fr': '⏳ Génération...',
    'it': '⏳ Generazione...'
  },
  'identity_kit.preview_alt': {
    'pt-BR': 'Preview do Identity Kit', 'en': 'Identity Kit preview',
    'es': 'Vista previa del Identity Kit', 'fr': 'Aperçu Identity Kit',
    'it': 'Anteprima Identity Kit'
  },

  'health.delete_pet': {
    'pt-BR': 'Excluir Pet', 'en': 'Delete pet',
    'es': 'Eliminar mascota', 'fr': 'Supprimer l’animal',
    'it': 'Elimina animale'
  },
  'health.identity_cta_title': {
    'pt-BR': 'Gere o Pet ID agora', 'en': 'Generate the Pet ID now',
    'es': 'Genera el Pet ID ahora', 'fr': 'Générez le Pet ID maintenant',
    'it': 'Genera il Pet ID ora'
  },
  'health.identity_cta_desc': {
    'pt-BR': 'Crie o Passaporte e o QR em 1 toque para compartilhar.',
    'en': 'Create the Passport and QR in one tap to share.',
    'es': 'Crea el Pasaporte y el QR en un toque para compartir.',
    'fr': 'Créez le Passeport et le QR en un tap pour partager.',
    'it': 'Crea Passaporto e QR con un tap per condividere.'
  },
  'health.identity_cta_button': {
    'pt-BR': 'Gerar Pet ID', 'en': 'Generate Pet ID',
    'es': 'Generar Pet ID', 'fr': 'Générer Pet ID',
    'it': 'Genera Pet ID'
  },

  'go.error.title.non_pet': {
    'pt-BR': '🐾 Busca apenas produtos pet',
    'en': '🐾 Pet products only',
    'es': '🐾 Solo productos para mascotas',
    'fr': '🐾 Produits pour animaux uniquement',
    'it': '🐾 Solo prodotti per animali'
  },
  'go.error.title.missing_location': {
    'pt-BR': '📍 Localização necessária',
    'en': '📍 Location required',
    'es': '📍 Se requiere ubicación',
    'fr': '📍 Localisation requise',
    'it': '📍 Posizione richiesta'
  },
  'go.error.title.rate_limited': {
    'pt-BR': '⏳ Aguarde um pouco',
    'en': '⏳ Please wait',
    'es': '⏳ Por favor espera',
    'fr': '⏳ Veuillez patienter',
    'it': '⏳ Attendi un momento'
  },
  'go.error.title.provider_error': {
    'pt-BR': '🗺️ Erro no mapa',
    'en': '🗺️ Map error',
    'es': '🗺️ Error en el mapa',
    'fr': '🗺️ Erreur de carte',
    'it': '🗺️ Errore della mappa'
  },
  'go.error.title.default': {
    'pt-BR': '⚠️ Ops!',
    'en': '⚠️ Oops!',
    'es': '⚠️ ¡Ups!',
    'fr': '⚠️ Oups !',
    'it': '⚠️ Ops!'
  },
  'go.error.message.non_pet': {
    'pt-BR': 'Este termo não parece ser relacionado a pets. O PETMOL busca apenas produtos para animais de estimação.',
    'en': 'This term doesn\'t appear to be pet-related. PETMOL only searches for pet products.',
    'es': 'Este término no parece estar relacionado con mascotas. PETMOL solo busca productos para mascotas.',
    'fr': 'Ce terme ne semble pas lié aux animaux. PETMOL ne cherche que des produits pour animaux.',
    'it': 'Questo termine non sembra legato agli animali. PETMOL cerca solo prodotti per animali.'
  },
  'go.error.message.invalid_query': {
    'pt-BR': 'Busca inválida. Digite pelo menos 2 caracteres para buscar produtos pet.',
    'en': 'Invalid search. Type at least 2 characters to search for pet products.',
    'es': 'Búsqueda inválida. Escribe al menos 2 caracteres para buscar productos para mascotas.',
    'fr': 'Recherche invalide. Tapez au moins 2 caractères pour chercher des produits pour animaux.',
    'it': 'Ricerca non valida. Digita almeno 2 caratteri per cercare prodotti per animali.'
  },
  'go.error.message.missing_phone_whatsapp': {
    'pt-BR': 'Número de telefone não fornecido. Não foi possível abrir o WhatsApp.',
    'en': 'Phone number not provided. Could not open WhatsApp.',
    'es': 'Número de teléfono no proporcionado. No se pudo abrir WhatsApp.',
    'fr': 'Numéro de téléphone non fourni. Impossible d\'ouvrir WhatsApp.',
    'it': 'Numero di telefono non fornito. Impossibile aprire WhatsApp.'
  },
  'go.error.message.missing_phone_call': {
    'pt-BR': 'Número de telefone não fornecido. Não foi possível fazer a ligação.',
    'en': 'Phone number not provided. Could not make the call.',
    'es': 'Número de teléfono no proporcionado. No se pudo realizar la llamada.',
    'fr': 'Numéro de téléphone non fourni. Impossible d\'appeler.',
    'it': 'Numero di telefono non fornito. Impossibile effettuare la chiamata.'
  },
  'go.error.message.missing_phone': {
    'pt-BR': 'Número de telefone não fornecido.',
    'en': 'Phone number not provided.',
    'es': 'Número de teléfono no proporcionado.',
    'fr': 'Numéro de téléphone non fourni.',
    'it': 'Numero di telefono non fornito.'
  },
  'go.error.message.missing_location': {
    'pt-BR': 'Não conseguimos acessar sua localização. Para usar serviços próximos ou emergência, você precisa permitir o acesso à localização.',
    'en': 'We couldn\'t access your location. To use nearby services or emergency features, you need to allow location access.',
    'es': 'No pudimos acceder a tu ubicación. Para usar servicios cercanos o emergencias, necesitas permitir el acceso a la ubicación.',
    'fr': 'Nous n\'avons pas pu accéder à votre localisation. Pour utiliser des services proches ou l\'urgence, autorisez la localisation.',
    'it': 'Non siamo riusciti ad accedere alla tua posizione. Per usare servizi vicini o emergenze, devi consentire l\'accesso alla posizione.'
  },
  'go.error.message.provider_error': {
    'pt-BR': 'Não foi possível abrir o aplicativo de mapas selecionado. Tente usar outro aplicativo.',
    'en': 'Could not open the selected maps app. Try using another app.',
    'es': 'No se pudo abrir la app de mapas seleccionada. Intenta usar otra app.',
    'fr': 'Impossible d\'ouvrir l\'app de cartes sélectionnée. Essayez une autre app.',
    'it': 'Impossibile aprire l\'app mappe selezionata. Prova un\'altra app.'
  },
  'go.error.message.rate_limited': {
    'pt-BR': 'Muitas tentativas em pouco tempo. Por favor, aguarde alguns segundos antes de tentar novamente.',
    'en': 'Too many attempts in a short time. Please wait a few seconds before trying again.',
    'es': 'Demasiados intentos en poco tiempo. Espera unos segundos antes de intentar nuevamente.',
    'fr': 'Trop de tentatives en peu de temps. Veuillez attendre quelques secondes avant de réessayer.',
    'it': 'Troppi tentativi in poco tempo. Attendi qualche secondo prima di riprovare.'
  },
  'go.error.message.default': {
    'pt-BR': 'Ocorreu um erro. Por favor, tente novamente.',
    'en': 'An error occurred. Please try again.',
    'es': 'Ocurrió un error. Por favor, inténtalo de nuevo.',
    'fr': 'Une erreur s\'est produite. Veuillez réessayer.',
    'it': 'Si è verificato un errore. Riprova.'
  },
  'go.error.suggestions.title': {
    'pt-BR': '🐾 Experimente buscar por:',
    'en': '🐾 Try searching for:',
    'es': '🐾 Prueba buscar:',
    'fr': '🐾 Essayez de rechercher :',
    'it': '🐾 Prova a cercare:'
  },
  'go.error.actions.back': {
    'pt-BR': '← Voltar ao PETMOL',
    'en': '← Back to PETMOL',
    'es': '← Volver a PETMOL',
    'fr': '← Retour à PETMOL',
    'it': '← Torna a PETMOL'
  },
  'go.error.actions.retry': {
    'pt-BR': '↻ Tentar novamente',
    'en': '↻ Try again',
    'es': '↻ Intentar de nuevo',
    'fr': '↻ Réessayer',
    'it': '↻ Riprova'
  },
  'go.error.footer.location.title': {
    'pt-BR': '💡 Como ativar a localização:',
    'en': '💡 How to enable location:',
    'es': '💡 Cómo activar la ubicación:',
    'fr': '💡 Comment activer la localisation :',
    'it': '💡 Come abilitare la posizione:'
  },
  'go.error.footer.location.chrome': {
    'pt-BR': 'Clique no cadeado → Localização → Permitir',
    'en': 'Click padlock → Location → Allow',
    'es': 'Haz clic en el candado → Ubicación → Permitir',
    'fr': 'Cliquez sur le cadenas → Localisation → Autoriser',
    'it': 'Fai clic sul lucchetto → Posizione → Consenti'
  },
  'go.error.footer.location.safari': {
    'pt-BR': 'Configurações → Safari → Localização → Permitir',
    'en': 'Settings → Safari → Location → Allow',
    'es': 'Configuración → Safari → Ubicación → Permitir',
    'fr': 'Réglages → Safari → Localisation → Autoriser',
    'it': 'Impostazioni → Safari → Posizione → Consenti'
  },
  'go.error.footer.location.firefox': {
    'pt-BR': 'Clique no ícone de localização na barra',
    'en': 'Click location icon in address bar',
    'es': 'Haz clic en el icono de ubicación en la barra',
    'fr': 'Cliquez sur l’icône de localisation dans la barre d’adresse',
    'it': 'Fai clic sull’icona della posizione nella barra degli indirizzi'
  },
  'go.error.footer.pet_only': {
    'pt-BR': 'O PETMOL busca apenas produtos para pets (cães, gatos, pássaros, peixes, etc.). Não vendemos produtos diretamente.',
    'en': 'PETMOL only searches for pet products (dogs, cats, birds, fish, etc.). We don\'t sell products directly.',
    'es': 'PETMOL solo busca productos para mascotas (perros, gatos, aves, peces, etc.). No vendemos productos directamente.',
    'fr': 'PETMOL ne cherche que des produits pour animaux (chiens, chats, oiseaux, poissons, etc.). Nous ne vendons pas directement.',
    'it': 'PETMOL cerca solo prodotti per animali (cani, gatti, uccelli, pesci, ecc.). Non vendiamo prodotti direttamente.'
  },
  'go.shopping.invalid.title': {
    'pt-BR': '❌ Busca inválida',
    'en': '❌ Invalid search',
    'es': '❌ Búsqueda inválida',
    'fr': '❌ Recherche invalide',
    'it': '❌ Ricerca non valida'
  },
  'go.shopping.invalid.subtitle': {
    'pt-BR': 'Não conseguimos processar sua busca.',
    'en': 'We couldn\'t process your search.',
    'es': 'No pudimos procesar tu búsqueda.',
    'fr': 'Nous n\'avons pas pu traiter votre recherche.',
    'it': 'Non siamo riusciti a elaborare la tua ricerca.'
  },
  'go.shopping.invalid.back': {
    'pt-BR': 'Voltar ao PETMOL',
    'en': 'Back to PETMOL',
    'es': 'Volver a PETMOL',
    'fr': 'Retour à PETMOL',
    'it': 'Torna a PETMOL'
  },
  'go.shopping.title': {
    'pt-BR': 'Abrindo Google Shopping...',
    'en': 'Opening Google Shopping...',
    'es': 'Abriendo Google Shopping...',
    'fr': 'Ouverture de Google Shopping...',
    'it': 'Apertura di Google Shopping...'
  },
  'go.shopping.searching': {
    'pt-BR': 'Buscando',
    'en': 'Searching',
    'es': 'Buscando',
    'fr': 'Recherche',
    'it': 'Ricerca'
  },
  'go.shopping.lead': {
    'pt-BR': 'Lead',
    'en': 'Lead',
    'es': 'Lead',
    'fr': 'Lead',
    'it': 'Lead'
  },
  'go.shopping.open_now': {
    'pt-BR': '🔍 Abrir Google Shopping agora',
    'en': '🔍 Open Google Shopping now',
    'es': '🔍 Abrir Google Shopping ahora',
    'fr': '🔍 Ouvrir Google Shopping maintenant',
    'it': '🔍 Apri Google Shopping ora'
  },
  'go.shopping.back': {
    'pt-BR': '← Voltar ao PETMOL',
    'en': '← Back to PETMOL',
    'es': '← Volver a PETMOL',
    'fr': '← Retour à PETMOL',
    'it': '← Torna a PETMOL'
  },
  'go.shopping.reorder_saved': {
    'pt-BR': '✓ Salvo para recompra!',
    'en': '✓ Saved for reorder!',
    'es': '✓ Guardado para recompra',
    'fr': '✓ Enregistré pour réachat',
    'it': '✓ Salvato per riordino'
  },
  'go.shopping.reorder_save': {
    'pt-BR': '⭐ Salvar como recompra',
    'en': '⭐ Save for reorder',
    'es': '⭐ Guardar como recompra',
    'fr': '⭐ Enregistrer pour réachat',
    'it': '⭐ Salva per riordino'
  },
  'go.shopping.disclaimer': {
    'pt-BR': 'Você será redirecionado ao Google Shopping. O PETMOL não vende nem compara preços de produtos diretamente.',
    'en': 'You will be redirected to Google Shopping. PETMOL does not sell or compare product prices directly.',
    'es': 'Serás redirigido a Google Shopping. PETMOL no vende ni compara precios directamente.',
    'fr': 'Vous serez redirigé vers Google Shopping. PETMOL ne vend ni ne compare les prix directement.',
    'it': 'Sarai reindirizzato a Google Shopping. PETMOL non vende né confronta i prezzi direttamente.'
  },
  'species.dog': {
    'pt-BR': 'cão',
    'en': 'dog',
    'es': 'perro',
    'fr': 'chien',
    'it': 'cane'
  },
  'species.cat': {
    'pt-BR': 'gato',
    'en': 'cat',
    'es': 'gato',
    'fr': 'chat',
    'it': 'gatto'
  },
  'species.other': {
    'pt-BR': 'pet',
    'en': 'pet',
    'es': 'mascota',
    'fr': 'animal',
    'it': 'animale'
  },
  'emergency.share.invalid.title': {
    'pt-BR': 'Link Inválido ou Expirado',
    'en': 'Invalid or expired link',
    'es': 'Enlace inválido o caducado',
    'fr': 'Lien invalide ou expiré',
    'it': 'Link non valido o scaduto'
  },
  'emergency.share.invalid.subtitle': {
    'pt-BR': 'Este link de emergência não existe ou foi desativado pelo dono do pet.',
    'en': 'This emergency link does not exist or was disabled by the pet owner.',
    'es': 'Este enlace de emergencia no existe o fue desactivado por el tutor.',
    'fr': 'Ce lien d’urgence n’existe pas ou a été désactivé par le tuteur.',
    'it': 'Questo link di emergenza non esiste o è stato disattivato dal proprietario.'
  },
  'emergency.share.invalid.cta': {
    'pt-BR': 'Ir para PETMOL',
    'en': 'Go to PETMOL',
    'es': 'Ir a PETMOL',
    'fr': 'Aller à PETMOL',
    'it': 'Vai a PETMOL'
  },
  'emergency.share.header.title': {
    'pt-BR': 'INFORMAÇÕES DE EMERGÊNCIA',
    'en': 'EMERGENCY INFORMATION',
    'es': 'INFORMACIÓN DE EMERGENCIA',
    'fr': 'INFORMATIONS D’URGENCE',
    'it': 'INFORMAZIONI DI EMERGENZA'
  },
  'emergency.share.header.subtitle': {
    'pt-BR': 'Se você encontrou este pet, por favor entre em contato',
    'en': 'If you found this pet, please get in touch',
    'es': 'Si encontraste a esta mascota, por favor contáctanos',
    'fr': 'Si vous avez trouvé cet animal, veuillez nous contacter',
    'it': 'Se hai trovato questo animale, contattaci'
  },
  'emergency.share.owner.title': {
    'pt-BR': 'Contato do Dono',
    'en': 'Owner contact',
    'es': 'Contacto del tutor',
    'fr': 'Contact du propriétaire',
    'it': 'Contatto del proprietario'
  },
  'emergency.share.owner.name': {
    'pt-BR': 'Nome',
    'en': 'Name',
    'es': 'Nombre',
    'fr': 'Nom',
    'it': 'Nome'
  },
  'emergency.share.notes.title': {
    'pt-BR': 'Observações Importantes',
    'en': 'Important notes',
    'es': 'Observaciones importantes',
    'fr': 'Observations importantes',
    'it': 'Note importanti'
  },
  'emergency.share.conditions.title': {
    'pt-BR': 'Condições Médicas',
    'en': 'Medical conditions',
    'es': 'Condiciones médicas',
    'fr': 'Conditions médicales',
    'it': 'Condizioni mediche'
  },
  'emergency.share.medications.title': {
    'pt-BR': 'Medicações',
    'en': 'Medications',
    'es': 'Medicaciones',
    'fr': 'Médicaments',
    'it': 'Medicazioni'
  },
  'emergency.share.vet.title': {
    'pt-BR': 'Veterinário',
    'en': 'Veterinarian',
    'es': 'Veterinario',
    'fr': 'Vétérinaire',
    'it': 'Veterinario'
  },
  'emergency.share.vet.name': {
    'pt-BR': 'Nome',
    'en': 'Name',
    'es': 'Nombre',
    'fr': 'Nom',
    'it': 'Nome'
  },
  'emergency.share.footer.powered_by': {
    'pt-BR': 'Informações geradas via',
    'en': 'Information generated via',
    'es': 'Información generada vía',
    'fr': 'Informations générées via',
    'it': 'Informazioni generate tramite'
  },
  'emergency.share.footer.cta': {
    'pt-BR': 'Crie o cartão de emergência do seu pet gratuitamente',
    'en': 'Create your pet’s emergency card for free',
    'es': 'Crea gratis la tarjeta de emergencia de tu mascota',
    'fr': 'Créez gratuitement la carte d’urgence de votre animal',
    'it': 'Crea gratis la scheda di emergenza del tuo animale'
  },
  'emergency.share.meta.invalid_title': {
    'pt-BR': 'Link Inválido - PETMOL',
    'en': 'Invalid Link - PETMOL',
    'es': 'Enlace inválido - PETMOL',
    'fr': 'Lien invalide - PETMOL',
    'it': 'Link non valido - PETMOL'
  },
  'emergency.share.meta.invalid_description': {
    'pt-BR': 'Este link de emergência não existe ou foi desativado.',
    'en': 'This emergency link does not exist or was disabled.',
    'es': 'Este enlace de emergencia no existe o fue desactivado.',
    'fr': 'Ce lien d’urgence n’existe pas ou a été désactivé.',
    'it': 'Questo link di emergenza non esiste o è stato disattivato.'
  },
  'emergency.share.meta.title': {
    'pt-BR': '{name} - Emergência | PETMOL',
    'en': '{name} - Emergency | PETMOL',
    'es': '{name} - Emergencia | PETMOL',
    'fr': '{name} - Urgence | PETMOL',
    'it': '{name} - Emergenza | PETMOL'
  },
  'emergency.share.meta.description': {
    'pt-BR': 'Informações de emergência de {name}. Se você encontrou este pet, entre em contato com o dono.',
    'en': 'Emergency information for {name}. If you found this pet, please contact the owner.',
    'es': 'Información de emergencia de {name}. Si encontraste a esta mascota, contacta al tutor.',
    'fr': 'Informations d’urgence de {name}. Si vous avez trouvé cet animal, contactez le propriétaire.',
    'it': 'Informazioni di emergenza di {name}. Se hai trovato questo animale, contatta il proprietario.'
  },
  'vet_share.invalid.title': {
    'pt-BR': 'Acesso Negado',
    'en': 'Access denied',
    'es': 'Acceso denegado',
    'fr': 'Accès refusé',
    'it': 'Accesso negato'
  },
  'vet_share.invalid.subtitle': {
    'pt-BR': 'Este link de compartilhamento não existe, expirou ou foi revogado.',
    'en': 'This sharing link does not exist, has expired, or was revoked.',
    'es': 'Este enlace de compartición no existe, expiró o fue revocado.',
    'fr': 'Ce lien de partage n’existe pas, a expiré ou a été révoqué.',
    'it': 'Questo link di condivisione non esiste, è scaduto o è stato revocato.'
  },
  'vet_share.invalid.cta': {
    'pt-BR': 'Ir para PETMOL',
    'en': 'Go to PETMOL',
    'es': 'Ir a PETMOL',
    'fr': 'Aller à PETMOL',
    'it': 'Vai a PETMOL'
  },
  'vet_share.header.title': {
    'pt-BR': 'Compartilhamento Veterinário',
    'en': 'Veterinary share',
    'es': 'Compartición veterinaria',
    'fr': 'Partage vétérinaire',
    'it': 'Condivisione veterinaria'
  },
  'vet_share.vet_prefix': {
    'pt-BR': 'Dr(a).',
    'en': 'Dr.',
    'es': 'Dr.',
    'fr': 'Dr.',
    'it': 'Dr.'
  },
  'vet_share.header.remaining': {
    'pt-BR': 'restantes',
    'en': 'remaining',
    'es': 'restantes',
    'fr': 'restantes',
    'it': 'rimanenti'
  },
  'vet_share.notice.title': {
    'pt-BR': 'Acesso Temporário:',
    'en': 'Temporary access:',
    'es': 'Acceso temporal:',
    'fr': 'Accès temporaire :',
    'it': 'Accesso temporaneo:'
  },
  'vet_share.notice.message': {
    'pt-BR': 'Este link expira em {date}. Os dados são compartilhados de forma limitada conforme autorização do tutor.',
    'en': 'This link expires on {date}. Data is shared in a limited way based on the owner’s authorization.',
    'es': 'Este enlace expira el {date}. Los datos se comparten de forma limitada según autorización del tutor.',
    'fr': 'Ce lien expire le {date}. Les données sont partagées de manière limitée selon l’autorisation du tuteur.',
    'it': 'Questo link scade il {date}. I dati sono condivisi in modo limitato secondo l’autorizzazione del tutor.'
  },
  'vet_share.pet.age_years': {
    'pt-BR': '{count} anos',
    'en': '{count} years',
    'es': '{count} años',
    'fr': '{count} ans',
    'it': '{count} anni'
  },
  'vet_share.sections.medical_history': {
    'pt-BR': 'Histórico Médico',
    'en': 'Medical history',
    'es': 'Historial médico',
    'fr': 'Historique médical',
    'it': 'Storico medico'
  },
  'vet_share.sections.vaccinations': {
    'pt-BR': 'Vacinações',
    'en': 'Vaccinations',
    'es': 'Vacunaciones',
    'fr': 'Vaccinations',
    'it': 'Vaccinazioni'
  },
  'vet_share.vaccinations.next_dose': {
    'pt-BR': 'Próxima dose',
    'en': 'Next dose',
    'es': 'Próxima dosis',
    'fr': 'Prochaine dose',
    'it': 'Prossima dose'
  },
  'vet_share.vaccinations.batch': {
    'pt-BR': 'Lote',
    'en': 'Batch',
    'es': 'Lote',
    'fr': 'Lot',
    'it': 'Lotto'
  },
  'vet_share.sections.medications': {
    'pt-BR': 'Medicações Atuais',
    'en': 'Current medications',
    'es': 'Medicaciones actuales',
    'fr': 'Médicaments actuels',
    'it': 'Medicazioni attuali'
  },
  'vet_share.medications.dosage': {
    'pt-BR': 'Dosagem',
    'en': 'Dosage',
    'es': 'Dosis',
    'fr': 'Dosage',
    'it': 'Dosaggio'
  },
  'vet_share.medications.frequency': {
    'pt-BR': 'Frequência',
    'en': 'Frequency',
    'es': 'Frecuencia',
    'fr': 'Fréquence',
    'it': 'Frequenza'
  },
  'vet_share.medications.start': {
    'pt-BR': 'Início',
    'en': 'Start',
    'es': 'Inicio',
    'fr': 'Début',
    'it': 'Inizio'
  },
  'vet_share.medications.end': {
    'pt-BR': 'Fim',
    'en': 'End',
    'es': 'Fin',
    'fr': 'Fin',
    'it': 'Fine'
  },
  'vet_share.sections.weight_history': {
    'pt-BR': 'Histórico de Peso',
    'en': 'Weight history',
    'es': 'Historial de peso',
    'fr': 'Historique du poids',
    'it': 'Storico del peso'
  },
  'vet_share.footer.powered_by': {
    'pt-BR': 'Dados compartilhados via',
    'en': 'Data shared via',
    'es': 'Datos compartidos vía',
    'fr': 'Données partagées via',
    'it': 'Dati condivisi tramite'
  },
  'vet_share.footer.notice': {
    'pt-BR': 'Este compartilhamento expira automaticamente e pode ser revogado pelo tutor a qualquer momento.',
    'en': 'This share expires automatically and can be revoked by the owner at any time.',
    'es': 'Este compartido expira automáticamente y puede ser revocado por el tutor en cualquier momento.',
    'fr': 'Ce partage expire automatiquement et peut être révoqué par le tuteur à tout moment.',
    'it': 'Questa condivisione scade automaticamente e può essere revocata dal tutor in qualsiasi momento.'
  },
  'vet_share.meta.title': {
    'pt-BR': 'Compartilhamento Veterinário - PETMOL',
    'en': 'Veterinary Share - PETMOL',
    'es': 'Compartición Veterinaria - PETMOL',
    'fr': 'Partage Vétérinaire - PETMOL',
    'it': 'Condivisione Veterinaria - PETMOL'
  },
  'vet_share.meta.description': {
    'pt-BR': 'Acesso temporário a dados de saúde do pet compartilhados pelo tutor.',
    'en': 'Temporary access to pet health data shared by the owner.',
    'es': 'Acceso temporal a datos de salud de la mascota compartidos por el tutor.',
    'fr': 'Accès temporaire aux données de santé de l’animal partagées par le tuteur.',
    'it': 'Accesso temporaneo ai dati sanitari dell’animale condivisi dal tutor.'
  },
  'demo_auto.pet_name': {
    'pt-BR': 'Rex',
    'en': 'Rex',
    'es': 'Rex',
    'fr': 'Rex',
    'it': 'Rex'
  },
  'demo_auto.header.title': {
    'pt-BR': 'Detecção Automática em Ação',
    'en': 'Automatic Detection in Action',
    'es': 'Detección automática en acción',
    'fr': 'Détection automatique en action',
    'it': 'Rilevamento automatico in azione'
  },
  'demo_auto.header.subtitle': {
    'pt-BR': 'Demonstração de como o app reconhece um local e sugere ações úteis.',
    'en': 'Demo of how the app recognizes a place and suggests useful actions.',
    'es': 'Demostración de cómo la app reconoce un lugar y sugiere acciones útiles.',
    'fr': 'Démo de la reconnaissance d’un lieu et des actions suggérées.',
    'it': 'Demo su come l’app riconosce un luogo e suggerisce azioni utili.'
  },
  'demo_auto.badge': {
    'pt-BR': 'Demonstração atualizada',
    'en': 'Updated demo',
    'es': 'Demostración actualizada',
    'fr': 'Démo mise à jour',
    'it': 'Demo aggiornata'
  },
  'demo_auto.real.title': {
    'pt-BR': 'Como funciona na prática',
    'en': 'How it works in practice',
    'es': 'Cómo funciona en la práctica',
    'fr': 'Comment cela fonctionne en pratique',
    'it': 'Come funziona nella pratica'
  },
  'demo_auto.real.item1': {
    'pt-BR': 'Raio de detecção até 500m (configurável)',
    'en': 'Detection radius up to 500m (configurable)',
    'es': 'Radio de detección hasta 500m (configurable)',
    'fr': 'Rayon de détection jusqu’à 500 m (configurable)',
    'it': 'Raggio di rilevamento fino a 500 m (configurabile)'
  },
  'demo_auto.real.item2': {
    'pt-BR': 'Permanência mínima ~90s para confirmar',
    'en': 'Minimum stay ~90s to confirm',
    'es': 'Estancia mínima ~90s para confirmar',
    'fr': 'Séjour minimum ~90 s pour confirmer',
    'it': 'Permanenza minima ~90s per confermare'
  },
  'demo_auto.real.item3': {
    'pt-BR': 'Usuário confirma o tipo de visita',
    'en': 'User confirms visit type',
    'es': 'El usuario confirma el tipo de visita',
    'fr': 'L’utilisateur confirme le type de visite',
    'it': 'L’utente conferma il tipo di visita'
  },
  'demo_auto.real.item4': {
    'pt-BR': 'Dados ficam no histórico do pet',
    'en': 'Data is saved to pet history',
    'es': 'Los datos se guardan en el historial',
    'fr': 'Les données sont enregistrées dans l’historique',
    'it': 'I dati vengono salvati nello storico'
  },
  'demo_auto.timeline.step1.title': {
    'pt-BR': '10:00 - Localização permitida no app',
    'en': '10:00 - Location allowed in the app',
    'es': '10:00 - Ubicación permitida en la app',
    'fr': '10:00 - Localisation autorisée dans l’app',
    'it': '10:00 - Posizione consentita nell’app'
  },
  'demo_auto.timeline.step1.description': {
    'pt-BR': 'Com a permissão, o app consegue detectar locais próximos.',
    'en': 'With permission, the app can detect nearby places.',
    'es': 'Con permiso, la app puede detectar lugares cercanos.',
    'fr': 'Avec autorisation, l’app détecte les lieux proches.',
    'it': 'Con il permesso, l’app rileva luoghi vicini.'
  },
  'demo_auto.timeline.step2.title': {
    'pt-BR': '10:25 - Chegando ao petshop/clínica',
    'en': '10:25 - Arriving at a pet shop/clinic',
    'es': '10:25 - Llegando a un petshop/clínica',
    'fr': '10:25 - Arrivée à une animalerie/clinique',
    'it': '10:25 - Arrivo a pet shop/clinica'
  },
  'demo_auto.timeline.step2.description': {
    'pt-BR': 'Detecção por GPS dentro do raio configurado (até 500m).',
    'en': 'GPS detection within the configured radius (up to 500m).',
    'es': 'Detección GPS dentro del radio configurado (hasta 500m).',
    'fr': 'Détection GPS dans le rayon configuré (jusqu’à 500 m).',
    'it': 'Rilevamento GPS nel raggio configurato (fino a 500 m).'
  },
  'demo_auto.timeline.step3.title': {
    'pt-BR': '10:26 - Permanência confirmada (90s)',
    'en': '10:26 - Stay confirmed (90s)',
    'es': '10:26 - Permanencia confirmada (90s)',
    'fr': '10:26 - Présence confirmée (90s)',
    'it': '10:26 - Permanenza confermata (90s)'
  },
  'demo_auto.timeline.step3.description': {
    'pt-BR': 'O app confirma que você realmente está no local.',
    'en': 'The app confirms you are actually at the place.',
    'es': 'La app confirma que realmente estás en el lugar.',
    'fr': 'L’app confirme que vous êtes bien sur place.',
    'it': 'L’app conferma che sei davvero sul posto.'
  },
  'demo_auto.timeline.step4.title': {
    'pt-BR': '10:26 - O app sugere ações',
    'en': '10:26 - The app suggests actions',
    'es': '10:26 - La app sugiere acciones',
    'fr': '10:26 - L’app suggère des actions',
    'it': '10:26 - L’app suggerisce azioni'
  },
  'demo_auto.timeline.step4.description': {
    'pt-BR': 'Você confirma a visita e registra no histórico do pet.',
    'en': 'You confirm the visit and it is saved to pet history.',
    'es': 'Confirmas la visita y se guarda en el historial.',
    'fr': 'Vous confirmez la visite et elle est enregistrée.',
    'it': 'Confermi la visita e viene salvata nello storico.'
  },
  'demo_auto.modal.title': {
    'pt-BR': 'Visita Detectada!',
    'en': 'Visit detected!',
    'es': '¡Visita detectada!',
    'fr': 'Visite détectée !',
    'it': 'Visita rilevata!'
  },
  'demo_auto.modal.location': {
    'pt-BR': 'Você está em {clinic}',
    'en': 'You are at {clinic}',
    'es': 'Estás en {clinic}',
    'fr': 'Vous êtes à {clinic}',
    'it': 'Sei presso {clinic}'
  },
  'demo_auto.modal.question': {
    'pt-BR': 'O que você fez hoje com {name}?',
    'en': 'What did you do today with {name}?',
    'es': '¿Qué hiciste hoy con {name}?',
    'fr': 'Qu’avez-vous fait aujourd’hui avec {name} ?',
    'it': 'Cosa avete fatto oggi con {name}?'
  },
  'demo_auto.modal.options.consult.title': {
    'pt-BR': 'Consulta Veterinária',
    'en': 'Vet consultation',
    'es': 'Consulta veterinaria',
    'fr': 'Consultation vétérinaire',
    'it': 'Visita veterinaria'
  },
  'demo_auto.modal.options.consult.description': {
    'pt-BR': 'Diagnóstico, exames, receitas, tratamento',
    'en': 'Diagnosis, exams, prescriptions, treatment',
    'es': 'Diagnóstico, exámenes, recetas, tratamiento',
    'fr': 'Diagnostic, examens, prescriptions, traitement',
    'it': 'Diagnosi, esami, prescrizioni, trattamento'
  },
  'demo_auto.modal.options.vaccination.title': {
    'pt-BR': 'Vacinação',
    'en': 'Vaccination',
    'es': 'Vacunación',
    'fr': 'Vaccination',
    'it': 'Vaccinazione'
  },
  'demo_auto.modal.options.vaccination.description': {
    'pt-BR': 'Registrar vacinas aplicadas e próximas doses',
    'en': 'Log administered vaccines and next doses',
    'es': 'Registrar vacunas aplicadas y próximas dosis',
    'fr': 'Enregistrer vaccins administrés et prochaines doses',
    'it': 'Registra vaccini somministrati e prossime dosi'
  },
  'demo_auto.modal.options.grooming.title': {
    'pt-BR': 'Banho & Tosa',
    'en': 'Grooming',
    'es': 'Baño y corte',
    'fr': 'Toilettage',
    'it': 'Toelettatura'
  },
  'demo_auto.modal.options.grooming.description': {
    'pt-BR': 'Serviços realizados e próximo agendamento',
    'en': 'Services performed and next appointment',
    'es': 'Servicios realizados y próxima cita',
    'fr': 'Services réalisés et prochain rendez-vous',
    'it': 'Servizi effettuati e prossimo appuntamento'
  },
  'demo_auto.modal.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'demo_auto.widget.title': {
    'pt-BR': 'Sugestões Inteligentes',
    'en': 'Smart suggestions',
    'es': 'Sugerencias inteligentes',
    'fr': 'Suggestions intelligentes',
    'it': 'Suggerimenti intelligenti'
  },
  'demo_auto.widget.subtitle': {
    'pt-BR': '3 sugestões para você',
    'en': '3 suggestions for you',
    'es': '3 sugerencias para ti',
    'fr': '3 suggestions pour vous',
    'it': '3 suggerimenti per te'
  },
  'demo_auto.widget.cards.vaccine.title': {
    'pt-BR': '💉 Vacina Próxima',
    'en': '💉 Vaccine due soon',
    'es': '💉 Vacuna próxima',
    'fr': '💉 Vaccin bientôt',
    'it': '💉 Vaccino in arrivo'
  },
  'demo_auto.widget.cards.vaccine.description': {
    'pt-BR': 'Antirrábica de {name} vence em 2 dias',
    'en': '{name}’s rabies shot is due in 2 days',
    'es': 'La antirrábica de {name} vence en 2 días',
    'fr': 'Le vaccin antirabique de {name} arrive à échéance dans 2 jours',
    'it': 'Il vaccino antirabbico di {name} scade tra 2 giorni'
  },
  'demo_auto.widget.cards.vaccine.action': {
    'pt-BR': 'Agendar Reforço →',
    'en': 'Schedule booster →',
    'es': 'Agendar refuerzo →',
    'fr': 'Planifier le rappel →',
    'it': 'Pianifica richiamo →'
  },
  'demo_auto.widget.cards.walk.title': {
    'pt-BR': '🚶 Hora do Passeio?',
    'en': '🚶 Time for a walk?',
    'es': '🚶 ¿Hora del paseo?',
    'fr': '🚶 C’est l’heure de la promenade ?',
    'it': '🚶 È ora della passeggiata?'
  },
  'demo_auto.widget.cards.walk.description': {
    'pt-BR': 'Normalmente você passeia com {name} agora',
    'en': 'You usually walk {name} now',
    'es': 'Normalmente paseas con {name} ahora',
    'fr': 'Vous promenez généralement {name} à cette heure',
    'it': 'Di solito porti {name} a passeggio adesso'
  },
  'demo_auto.widget.cards.walk.action': {
    'pt-BR': 'Começar Passeio →',
    'en': 'Start walk →',
    'es': 'Empezar paseo →',
    'fr': 'Démarrer la promenade →',
    'it': 'Inizia passeggiata →'
  },
  'demo_auto.widget.cards.grooming.title': {
    'pt-BR': '✂️ Banho & Tosa',
    'en': '✂️ Grooming',
    'es': '✂️ Baño y corte',
    'fr': '✂️ Toilettage',
    'it': '✂️ Toelettatura'
  },
  'demo_auto.widget.cards.grooming.description': {
    'pt-BR': 'Já faz 32 dias desde o último banho de {name}',
    'en': 'It has been 32 days since {name}’s last bath',
    'es': 'Han pasado 32 días desde el último baño de {name}',
    'fr': 'Cela fait 32 jours depuis le dernier bain de {name}',
    'it': 'Sono passati 32 giorni dall’ultimo bagno di {name}'
  },
  'demo_auto.widget.cards.grooming.action': {
    'pt-BR': 'Buscar Petshops →',
    'en': 'Find pet shops →',
    'es': 'Buscar petshops →',
    'fr': 'Trouver des animaleries →',
    'it': 'Trova pet shop →'
  },
  'demo_auto.info.fast.title': {
    'pt-BR': 'Detecção Rápida',
    'en': 'Fast detection',
    'es': 'Detección rápida',
    'fr': 'Détection rapide',
    'it': 'Rilevamento rapido'
  },
  'demo_auto.info.fast.item1': {
    'pt-BR': 'Raio de 150 metros',
    'en': '150-meter radius',
    'es': 'Radio de 150 metros',
    'fr': 'Rayon de 150 mètres',
    'it': 'Raggio di 150 metri'
  },
  'demo_auto.info.fast.item2': {
    'pt-BR': 'Confirma em 3 minutos',
    'en': 'Confirms in 3 minutes',
    'es': 'Confirma en 3 minutos',
    'fr': 'Confirme en 3 minutes',
    'it': 'Conferma in 3 minuti'
  },
  'demo_auto.info.fast.item3': {
    'pt-BR': 'Notificação imediata',
    'en': 'Instant notification',
    'es': 'Notificación inmediata',
    'fr': 'Notification immédiate',
    'it': 'Notifica immediata'
  },
  'demo_auto.info.fast.item4': {
    'pt-BR': 'Modal abre automaticamente',
    'en': 'Modal opens automatically',
    'es': 'El modal se abre automáticamente',
    'fr': 'La fenêtre s’ouvre automatiquement',
    'it': 'Il modal si apre automaticamente'
  },
  'demo_auto.info.smart.title': {
    'pt-BR': 'Sugestões Inteligentes',
    'en': 'Smart suggestions',
    'es': 'Sugerencias inteligentes',
    'fr': 'Suggestions intelligentes',
    'it': 'Suggerimenti intelligenti'
  },
  'demo_auto.info.smart.item1': {
    'pt-BR': 'Aprende seus horários',
    'en': 'Learns your schedule',
    'es': 'Aprende tus horarios',
    'fr': 'Apprend vos horaires',
    'it': 'Impara i tuoi orari'
  },
  'demo_auto.info.smart.item2': {
    'pt-BR': 'Lembra de vacinas',
    'en': 'Reminds about vaccines',
    'es': 'Recuerda vacunas',
    'fr': 'Rappelle les vaccins',
    'it': 'Ricorda i vaccini'
  },
  'demo_auto.info.smart.item3': {
    'pt-BR': 'Sugere passeios',
    'en': 'Suggests walks',
    'es': 'Sugiere paseos',
    'fr': 'Suggère des promenades',
    'it': 'Suggerisce passeggiate'
  },
  'demo_auto.info.smart.item4': {
    'pt-BR': 'Alerta medicações',
    'en': 'Alerts medications',
    'es': 'Alerta medicaciones',
    'fr': 'Alerte sur les médicaments',
    'it': 'Avvisa sulle medicazioni'
  },
  'demo_auto.cta.title': {
    'pt-BR': 'Sistema 100% Automático',
    'en': '100% Automatic system',
    'es': 'Sistema 100% automático',
    'fr': 'Système 100 % automatique',
    'it': 'Sistema 100% automatico'
  },
  'demo_auto.cta.subtitle': {
    'pt-BR': 'Você não precisa fazer nada. O sistema aparece na hora certa!',
    'en': 'You don’t need to do anything. The system shows up at the right time!',
    'es': 'No necesitas hacer nada. ¡El sistema aparece en el momento adecuado!',
    'fr': 'Vous n’avez rien à faire. Le système apparaît au bon moment !',
    'it': 'Non devi fare nulla. Il sistema appare al momento giusto!'
  },
  'demo_auto.cta.primary': {
    'pt-BR': 'Criar Perfil do Pet →',
    'en': 'Create Pet Profile →',
    'es': 'Crear perfil de mascota →',
    'fr': 'Créer le profil de l’animal →',
    'it': 'Crea profilo animale →'
  },
  'demo_auto.cta.secondary': {
    'pt-BR': '🔄 Ver Demo Novamente',
    'en': '🔄 Watch demo again',
    'es': '🔄 Ver demo nuevamente',
    'fr': '🔄 Revoir la démo',
    'it': '🔄 Rivedi la demo'
  },
  'family.title': {
    'pt-BR': 'Família & Cuidadores',
    'en': 'Family & caregivers',
    'es': 'Familia y cuidadores',
    'fr': 'Famille et aidants',
    'it': 'Famiglia e caregiver'
  },
  'family.subtitle': {
    'pt-BR': 'Compartilhe o cuidado do seu pet com familiares ou cuidadores de confiança.',
    'en': 'Share your pet’s care with trusted family members or caregivers.',
    'es': 'Comparte el cuidado de tu mascota con familiares o cuidadores de confianza.',
    'fr': 'Partagez les soins de votre animal avec des proches ou aidants de confiance.',
    'it': 'Condividi la cura del tuo animale con familiari o caregiver di fiducia.'
  },
  'family.defaults.owner': {
    'pt-BR': 'Tutor',
    'en': 'Owner',
    'es': 'Tutor',
    'fr': 'Propriétaire',
    'it': 'Proprietario'
  },
  'family.defaults.caregiver': {
    'pt-BR': 'Cuidador',
    'en': 'Caregiver',
    'es': 'Cuidador',
    'fr': 'Aidant',
    'it': 'Caregiver'
  },
  'family.alerts.name_required': {
    'pt-BR': 'Informe seu nome',
    'en': 'Please enter your name',
    'es': 'Ingresa tu nombre',
    'fr': 'Veuillez saisir votre nom',
    'it': 'Inserisci il tuo nome'
  },
  'family.alerts.invalid_invite': {
    'pt-BR': 'Convite inválido ou expirado',
    'en': 'Invalid or expired invite',
    'es': 'Invitación inválida o caducada',
    'fr': 'Invitation invalide ou expirée',
    'it': 'Invito non valido o scaduto'
  },
  'family.alerts.invite_accepted': {
    'pt-BR': 'Convite aceito com sucesso!',
    'en': 'Invite accepted successfully!',
    'es': '¡Invitación aceptada con éxito!',
    'fr': 'Invitation acceptée avec succès !',
    'it': 'Invito accettato con successo!'
  },
  'family.alerts.select_pet': {
    'pt-BR': 'Selecione pelo menos um pet',
    'en': 'Select at least one pet',
    'es': 'Selecciona al menos una mascota',
    'fr': 'Sélectionnez au moins un animal',
    'it': 'Seleziona almeno un animale'
  },
  'family.alerts.link_copied': {
    'pt-BR': 'Link copiado!',
    'en': 'Link copied!',
    'es': '¡Enlace copiado!',
    'fr': 'Lien copié !',
    'it': 'Link copiato!'
  },
  'family.accept_invite.title': {
    'pt-BR': 'Aceitar convite',
    'en': 'Accept invite',
    'es': 'Aceptar invitación',
    'fr': 'Accepter l’invitation',
    'it': 'Accetta invito'
  },
  'family.accept_invite.code': {
    'pt-BR': 'Código',
    'en': 'Code',
    'es': 'Código',
    'fr': 'Code',
    'it': 'Codice'
  },
  'family.accept_invite.name': {
    'pt-BR': 'Nome',
    'en': 'Name',
    'es': 'Nombre',
    'fr': 'Nom',
    'it': 'Nome'
  },
  'family.accept_invite.email': {
    'pt-BR': 'Email',
    'en': 'Email',
    'es': 'Email',
    'fr': 'Email',
    'it': 'Email'
  },
  'family.accept_invite.phone': {
    'pt-BR': 'Telefone',
    'en': 'Phone',
    'es': 'Teléfono',
    'fr': 'Téléphone',
    'it': 'Telefono'
  },
  'family.accept_invite.accept': {
    'pt-BR': 'Aceitar convite',
    'en': 'Accept invite',
    'es': 'Aceptar invitación',
    'fr': 'Accepter l’invitation',
    'it': 'Accetta invito'
  },
  'family.accept_invite.accepting': {
    'pt-BR': 'Aceitando...',
    'en': 'Accepting...',
    'es': 'Aceptando...',
    'fr': 'Acceptation...',
    'it': 'Accettazione...'
  },
  'family.invite_section.title': {
    'pt-BR': 'Convite para família / cuidadores',
    'en': 'Family / caregiver invite',
    'es': 'Invitación para familia / cuidadores',
    'fr': 'Invitation famille / aidants',
    'it': 'Invito per famiglia / caregiver'
  },
  'family.invite_section.pets': {
    'pt-BR': 'Pets',
    'en': 'Pets',
    'es': 'Mascotas',
    'fr': 'Animaux',
    'it': 'Animali'
  },
  'family.invite_section.no_pets': {
    'pt-BR': 'Nenhum pet cadastrado.',
    'en': 'No pets registered.',
    'es': 'No hay mascotas registradas.',
    'fr': 'Aucun animal enregistré.',
    'it': 'Nessun animale registrato.'
  },
  'family.invite_section.permission': {
    'pt-BR': 'Permissão',
    'en': 'Permission',
    'es': 'Permiso',
    'fr': 'Autorisation',
    'it': 'Permesso'
  },
  'family.invite_section.expires_hours': {
    'pt-BR': 'Expira em (horas)',
    'en': 'Expires in (hours)',
    'es': 'Expira en (horas)',
    'fr': 'Expire dans (heures)',
    'it': 'Scade tra (ore)'
  },
  'family.invite_section.generate': {
    'pt-BR': 'Gerar convite',
    'en': 'Generate invite',
    'es': 'Generar invitación',
    'fr': 'Générer l’invitation',
    'it': 'Genera invito'
  },
  'family.invite_created': {
    'pt-BR': 'Convite criado',
    'en': 'Invite created',
    'es': 'Invitación creada',
    'fr': 'Invitation créée',
    'it': 'Invito creato'
  },
  'family.invite_copy_link': {
    'pt-BR': 'Copiar link',
    'en': 'Copy link',
    'es': 'Copiar enlace',
    'fr': 'Copier le lien',
    'it': 'Copia link'
  },
  'family.invites_sent.title': {
    'pt-BR': 'Convites enviados',
    'en': 'Invites sent',
    'es': 'Invitaciones enviadas',
    'fr': 'Invitations envoyées',
    'it': 'Inviti inviati'
  },
  'family.invites_sent.code': {
    'pt-BR': 'Código',
    'en': 'Code',
    'es': 'Código',
    'fr': 'Code',
    'it': 'Codice'
  },
  'family.invites_sent.status': {
    'pt-BR': 'Status',
    'en': 'Status',
    'es': 'Estado',
    'fr': 'Statut',
    'it': 'Stato'
  },
  'family.invites_sent.copy': {
    'pt-BR': 'Copiar',
    'en': 'Copy',
    'es': 'Copiar',
    'fr': 'Copier',
    'it': 'Copia'
  },
  'family.invites_sent.revoke': {
    'pt-BR': 'Revogar',
    'en': 'Revoke',
    'es': 'Revocar',
    'fr': 'Révoquer',
    'it': 'Revoca'
  },
  'family.invites_sent.empty': {
    'pt-BR': 'Nenhum convite enviado.',
    'en': 'No invites sent.',
    'es': 'No se enviaron invitaciones.',
    'fr': 'Aucune invitation envoyée.',
    'it': 'Nessun invito inviato.'
  },
  'family.status.pending': {
    'pt-BR': 'Pendente',
    'en': 'Pending',
    'es': 'Pendiente',
    'fr': 'En attente',
    'it': 'In attesa'
  },
  'family.status.active': {
    'pt-BR': 'Ativo',
    'en': 'Active',
    'es': 'Activo',
    'fr': 'Actif',
    'it': 'Attivo'
  },
  'family.status.accepted': {
    'pt-BR': 'Aceito',
    'en': 'Accepted',
    'es': 'Aceptado',
    'fr': 'Accepté',
    'it': 'Accettato'
  },
  'family.status.revoked': {
    'pt-BR': 'Revogado',
    'en': 'Revoked',
    'es': 'Revocado',
    'fr': 'Révoqué',
    'it': 'Revocato'
  },
  'family.status.expired': {
    'pt-BR': 'Expirado',
    'en': 'Expired',
    'es': 'Expirado',
    'fr': 'Expiré',
    'it': 'Scaduto'
  },
  'family.caregivers.title': {
    'pt-BR': 'Cuidadores ativos',
    'en': 'Active caregivers',
    'es': 'Cuidadores activos',
    'fr': 'Aidants actifs',
    'it': 'Caregiver attivi'
  },
  'family.caregivers.pets_count': {
    'pt-BR': 'Pets: {count}',
    'en': 'Pets: {count}',
    'es': 'Mascotas: {count}',
    'fr': 'Animaux : {count}',
    'it': 'Animali: {count}'
  },
  'family.caregivers.last_access': {
    'pt-BR': 'Último acesso',
    'en': 'Last access',
    'es': 'Último acceso',
    'fr': 'Dernier accès',
    'it': 'Ultimo accesso'
  },
  'family.caregivers.none': {
    'pt-BR': 'Nenhum cuidador ativo.',
    'en': 'No active caregivers.',
    'es': 'No hay cuidadores activos.',
    'fr': 'Aucun aidant actif.',
    'it': 'Nessun caregiver attivo.'
  },
  'family.caregivers.remove': {
    'pt-BR': 'Remover',
    'en': 'Remove',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Rimuovi'
  },
  'family.caregivers.remove_confirm': {
    'pt-BR': 'Remover cuidador?',
    'en': 'Remove caregiver?',
    'es': '¿Eliminar cuidador?',
    'fr': 'Supprimer l’aidant ?',
    'it': 'Rimuovere il caregiver?'
  },
  'family.roles.view_only': {
    'pt-BR': 'Somente visualizar',
    'en': 'View only',
    'es': 'Solo ver',
    'fr': 'Lecture seule',
    'it': 'Solo visualizzazione'
  },
  'family.roles.can_edit': {
    'pt-BR': 'Pode editar',
    'en': 'Can edit',
    'es': 'Puede editar',
    'fr': 'Peut modifier',
    'it': 'Può modificare'
  },
  'family.roles.emergency_contact': {
    'pt-BR': 'Contato de emergência',
    'en': 'Emergency contact',
    'es': 'Contacto de emergencia',
    'fr': 'Contact d’urgence',
    'it': 'Contatto di emergenza'
  },
  'clinic_visit.saved_title': {
    'pt-BR': '✅ Registro Salvo',
    'en': '✅ Record saved',
    'es': '✅ Registro guardado',
    'fr': '✅ Enregistrement sauvegardé',
    'it': '✅ Registrazione salvata'
  },
  'clinic_visit.saved_body': {
    'pt-BR': 'Dados médicos de {petName} salvos com sucesso!',
    'en': 'Medical data for {petName} saved successfully!',
    'es': '¡Datos médicos de {petName} guardados con éxito!',
    'fr': 'Données médicales de {petName} enregistrées avec succès !',
    'it': 'Dati medici di {petName} salvati con successo!'
  },
  'upload.invalid_file': {
    'pt-BR': 'Arquivo inválido',
    'en': 'Invalid file',
    'es': 'Archivo inválido',
    'fr': 'Fichier invalide',
    'it': 'File non valido'
  },
  'upload.upload_failed': {
    'pt-BR': 'Falha no upload',
    'en': 'Upload failed',
    'es': 'Error al subir',
    'fr': 'Échec du téléversement',
    'it': 'Caricamento non riuscito'
  },
  'upload.preview_alt': {
    'pt-BR': 'Pré-visualização',
    'en': 'Preview',
    'es': 'Vista previa',
    'fr': 'Aperçu',
    'it': 'Anteprima'
  },
  'pet_panel.greeting': {
    'pt-BR': 'Olá, {petName}!',
    'en': 'Hello, {petName}!',
    'es': '¡Hola, {petName}!',
    'fr': 'Bonjour, {petName} !',
    'it': 'Ciao, {petName}!'
  },
  'pet_panel.reorder.title': {
    'pt-BR': 'Comprar novamente',
    'en': 'Reorder',
    'es': 'Recomprar',
    'fr': 'Commander à nouveau',
    'it': 'Riordina'
  },
  'pet_panel.reorder.view_all': {
    'pt-BR': 'Ver todos →',
    'en': 'View all →',
    'es': 'Ver todos →',
    'fr': 'Voir tout →',
    'it': 'Vedi tutti →'
  },
  'pet_panel.emergency.title': {
    'pt-BR': 'Socorro 24h',
    'en': 'Emergency 24h',
    'es': 'Emergencia 24h',
    'fr': 'Urgence 24h',
    'it': 'Emergenza 24h'
  },
  'pet_panel.emergency.subtitle': {
    'pt-BR': 'Veterinários abertos agora',
    'en': 'Open vets now',
    'es': 'Veterinarios abiertos ahora',
    'fr': 'Vétérinaires ouverts maintenant',
    'it': 'Veterinari aperti ora'
  },
  'pet_panel.services.title': {
    'pt-BR': 'Serviços perto',
    'en': 'Services nearby',
    'es': 'Servicios cerca',
    'fr': 'Services à proximité',
    'it': 'Servizi vicini'
  },
  'pet_panel.services.subtitle': {
    'pt-BR': 'Clínicas, hotéis, adestradores...',
    'en': 'Clinics, hotels, trainers...',
    'es': 'Clínicas, hoteles, entrenadores...',
    'fr': 'Cliniques, hôtels, éducateurs...',
    'it': 'Cliniche, hotel, addestratori...'
  },
  'pet_panel.buy.title': {
    'pt-BR': 'Comprar algo novo',
    'en': 'Buy something new',
    'es': 'Comprar algo nuevo',
    'fr': 'Acheter quelque chose de nouveau',
    'it': 'Compra qualcosa di nuovo'
  },
  'pet_panel.buy.subtitle': {
    'pt-BR': 'Busca assistida para produtos pet',
    'en': 'Assisted search for pet products',
    'es': 'Búsqueda asistida de productos para mascotas',
    'fr': 'Recherche assistée de produits pour animaux',
    'it': 'Ricerca assistita di prodotti per animali'
  },
  'pet_panel.quick_links.favorites': {
    'pt-BR': 'Favoritos',
    'en': 'Favorites',
    'es': 'Favoritos',
    'fr': 'Favoris',
    'it': 'Preferiti'
  },
  'pet_panel.quick_links.tips': {
    'pt-BR': 'Dicas',
    'en': 'Tips',
    'es': 'Consejos',
    'fr': 'Conseils',
    'it': 'Consigli'
  },
  'walk.quick_button.title': {
    'pt-BR': 'Passear com {petName}',
    'en': 'Walk with {petName}',
    'es': 'Pasear con {petName}',
    'fr': 'Promener {petName}',
    'it': 'Passeggia con {petName}'
  },
  'walk.quick_button.subtitle': {
    'pt-BR': 'Tracking automático GPS',
    'en': 'Auto GPS tracking',
    'es': 'Seguimiento GPS automático',
    'fr': 'Suivi GPS automatique',
    'it': 'Tracciamento GPS automatico'
  },
  'walk_tracker.geolocation_unavailable': {
    'pt-BR': 'Geolocalização não disponível',
    'en': 'Geolocation not available',
    'es': 'Geolocalización no disponible',
    'fr': 'Géolocalisation non disponible',
    'it': 'Geolocalizzazione non disponibile'
  },
  'walk_tracker.behavior.auto_stopped': {
    'pt-BR': 'Passeio parado automaticamente (sem movimento)',
    'en': 'Walk stopped automatically (no movement)',
    'es': 'Paseo detenido automáticamente (sin movimiento)',
    'fr': 'Promenade arrêtée automatiquement (sans mouvement)',
    'it': 'Passeggiata interrotta automaticamente (senza movimento)'
  },
  'walk_tracker.behavior.auto_tracked': {
    'pt-BR': 'Registrado automaticamente via GPS',
    'en': 'Auto-tracked via GPS',
    'es': 'Registrado automáticamente por GPS',
    'fr': 'Enregistré automatiquement via GPS',
    'it': 'Registrato automaticamente via GPS'
  },
  'walk_tracker.start_title': {
    'pt-BR': 'Iniciar Passeio com {petName}',
    'en': 'Start walk with {petName}',
    'es': 'Iniciar paseo con {petName}',
    'fr': 'Démarrer la promenade avec {petName}',
    'it': 'Inizia passeggiata con {petName}'
  },
  'walk_tracker.start_subtitle': {
    'pt-BR': 'Tracking automático de tempo e distância',
    'en': 'Auto-tracking time & distance',
    'es': 'Seguimiento automático de tiempo y distancia',
    'fr': 'Suivi automatique du temps et de la distance',
    'it': 'Tracciamento automatico di tempo e distanza'
  },
  'walk_tracker.header_title': {
    'pt-BR': 'Passeio com {petName}',
    'en': 'Walking with {petName}',
    'es': 'Paseando con {petName}',
    'fr': 'Promenade avec {petName}',
    'it': 'Passeggiata con {petName}'
  },
  'walk_tracker.live_tracking': {
    'pt-BR': 'Tracking em tempo real',
    'en': 'Live tracking',
    'es': 'Seguimiento en tiempo real',
    'fr': 'Suivi en temps réel',
    'it': 'Tracciamento in tempo reale'
  },
  'walk_tracker.stats.time': {
    'pt-BR': 'Tempo',
    'en': 'Time',
    'es': 'Tiempo',
    'fr': 'Temps',
    'it': 'Tempo'
  },
  'walk_tracker.stats.distance': {
    'pt-BR': 'Distância',
    'en': 'Distance',
    'es': 'Distancia',
    'fr': 'Distance',
    'it': 'Distanza'
  },
  'walk_tracker.stats.current_speed': {
    'pt-BR': 'Velocidade Atual',
    'en': 'Current Speed',
    'es': 'Velocidad actual',
    'fr': 'Vitesse actuelle',
    'it': 'Velocità attuale'
  },
  'walk_tracker.auto_stop_warning': {
    'pt-BR': 'Sem movimento detectado. Parando automaticamente em 2 min...',
    'en': 'No movement detected. Auto-stopping in 2 min...',
    'es': 'Sin movimiento detectado. Se detendrá automáticamente en 2 min...',
    'fr': 'Aucun mouvement détecté. Arrêt automatique dans 2 min...',
    'it': 'Nessun movimento rilevato. Arresto automatico tra 2 min...'
  },
  'walk_tracker.controls.pause': {
    'pt-BR': 'Pausar',
    'en': 'Pause',
    'es': 'Pausar',
    'fr': 'Pause',
    'it': 'Pausa'
  },
  'walk_tracker.controls.finish': {
    'pt-BR': 'Finalizar',
    'en': 'Finish',
    'es': 'Finalizar',
    'fr': 'Terminer',
    'it': 'Termina'
  },
  'walk_tracker.controls.resume': {
    'pt-BR': 'Continuar',
    'en': 'Resume',
    'es': 'Continuar',
    'fr': 'Reprendre',
    'it': 'Riprendi'
  },
  'walk_tracker.info_auto_stop': {
    'pt-BR': '💡 O passeio para automaticamente após 5 min sem movimento',
    'en': '💡 Walk stops automatically after 5 min without movement',
    'es': '💡 El paseo se detiene automáticamente después de 5 min sin movimiento',
    'fr': '💡 La promenade s’arrête automatiquement après 5 min sans mouvement',
    'it': '💡 La passeggiata si interrompe automaticamente dopo 5 min senza movimento'
  },
  'walk_detection.notifications_enabled_title': {
    'pt-BR': '🐾 Notificações Ativadas!',
    'en': '🐾 Notifications enabled!',
    'es': '🐾 ¡Notificaciones activadas!',
    'fr': '🐾 Notifications activées !',
    'it': '🐾 Notifiche attivate!'
  },
  'walk_detection.notifications_enabled_body': {
    'pt-BR': 'Vamos te avisar quando detectarmos que você está passeando com {petName}',
    'en': 'We will notify you when we detect you are walking with {petName}',
    'es': 'Te avisaremos cuando detectemos que paseas con {petName}',
    'fr': 'Nous vous informerons lorsque nous détecterons que vous promenez {petName}',
    'it': 'Ti avviseremo quando rileveremo che stai passeggiando con {petName}'
  },
  'walk_detection.enable_notifications_first': {
    'pt-BR': 'Ative as notificações primeiro!',
    'en': 'Enable notifications first!',
    'es': '¡Activa las notificaciones primero!',
    'fr': 'Activez d’abord les notifications !',
    'it': 'Attiva prima le notifiche!'
  },
  'walk_detection.title': {
    'pt-BR': 'Detecção Automática',
    'en': 'Automatic detection',
    'es': 'Detección automática',
    'fr': 'Détection automatique',
    'it': 'Rilevamento automatico'
  },
  'walk_detection.subtitle': {
    'pt-BR': 'Sistema inteligente que detecta quando você está passeando',
    'en': 'Smart system that detects when you are walking',
    'es': 'Sistema inteligente que detecta cuando estás paseando',
    'fr': 'Système intelligent qui détecte quand vous vous promenez',
    'it': 'Sistema intelligente che rileva quando stai passeggiando'
  },
  'walk_detection.notifications_title': {
    'pt-BR': 'Notificações',
    'en': 'Notifications',
    'es': 'Notificaciones',
    'fr': 'Notifications',
    'it': 'Notifiche'
  },
  'walk_detection.notifications_description': {
    'pt-BR': 'Receba alertas para registrar passeios',
    'en': 'Get alerts to log walks',
    'es': 'Recibe alertas para registrar paseos',
    'fr': 'Recevez des alertes pour enregistrer les promenades',
    'it': 'Ricevi avvisi per registrare le passeggiate'
  },
  'walk_detection.notifications_active': {
    'pt-BR': '✓ Ativado',
    'en': '✓ Enabled',
    'es': '✓ Activado',
    'fr': '✓ Activé',
    'it': '✓ Attivo'
  },
  'walk_detection.notifications_enable': {
    'pt-BR': 'Ativar',
    'en': 'Enable',
    'es': 'Activar',
    'fr': 'Activer',
    'it': 'Attiva'
  },
  'walk_detection.monitoring_title': {
    'pt-BR': 'Monitoramento de Atividade',
    'en': 'Activity monitoring',
    'es': 'Monitoreo de actividad',
    'fr': 'Suivi d’activité',
    'it': 'Monitoraggio attività'
  },
  'walk_detection.monitoring_description': {
    'pt-BR': 'Detecta movimento e pergunta se está passeando',
    'en': 'Detects movement and asks if you are walking',
    'es': 'Detecta movimiento y pregunta si estás paseando',
    'fr': 'Détecte le mouvement et demande si vous promenez',
    'it': 'Rileva il movimento e chiede se stai passeggiando'
  },
  'walk_detection.monitoring_toggle_label': {
    'pt-BR': 'Alternar monitoramento',
    'en': 'Toggle monitoring',
    'es': 'Alternar monitoreo',
    'fr': 'Basculer le suivi',
    'it': 'Attiva/disattiva monitoraggio'
  },
  'walk_detection.monitoring_active_note': {
    'pt-BR': '✓ Sistema ativo. Você receberá uma notificação quando detectarmos que está caminhando.',
    'en': '✓ System active. You will receive a notification when we detect you are walking.',
    'es': '✓ Sistema activo. Recibirás una notificación cuando detectemos que estás caminando.',
    'fr': '✓ Système actif. Vous recevrez une notification lorsque nous détecterons que vous marchez.',
    'it': '✓ Sistema attivo. Riceverai una notifica quando rileveremo che stai camminando.'
  },
  'walk_detection.patterns_title': {
    'pt-BR': 'Padrões de Passeio',
    'en': 'Walk patterns',
    'es': 'Patrones de paseo',
    'fr': 'Habitudes de promenade',
    'it': 'Schemi di passeggio'
  },
  'walk_detection.patterns_usual_time': {
    'pt-BR': 'Geralmente você passeia com {petName} neste horário',
    'en': 'You usually walk with {petName} around this time',
    'es': 'Normalmente paseas con {petName} a esta hora',
    'fr': 'Vous promenez généralement {petName} à cette heure',
    'it': 'Di solito passeggi con {petName} a quest’ora'
  },
  'walk_detection.patterns_next_walk': {
    'pt-BR': 'Próximo passeio sugerido',
    'en': 'Next suggested walk',
    'es': 'Próximo paseo sugerido',
    'fr': 'Prochaine promenade suggérée',
    'it': 'Prossima passeggiata suggerita'
  },
  'walk_detection.patterns_hint': {
    'pt-BR': 'Continue registrando passeios para o sistema aprender seus horários habituais',
    'en': 'Keep logging walks so the system learns your usual times',
    'es': 'Sigue registrando paseos para que el sistema aprenda tus horarios habituales',
    'fr': 'Continuez à enregistrer les promenades pour que le système apprenne vos horaires habituels',
    'it': 'Continua a registrare le passeggiate per aiutare il sistema a imparare i tuoi orari abituali'
  },
  'walk_detection.how_it_works_title': {
    'pt-BR': 'Como funciona?',
    'en': 'How it works?',
    'es': '¿Cómo funciona?',
    'fr': 'Comment ça marche ?',
    'it': 'Come funziona?'
  },
  'walk_detection.how_it_works.item1': {
    'pt-BR': 'Detecta quando você está caminhando (GPS em segundo plano)',
    'en': 'Detects when you are walking (background GPS)',
    'es': 'Detecta cuando estás caminando (GPS en segundo plano)',
    'fr': 'Détecte lorsque vous marchez (GPS en arrière-plan)',
    'it': 'Rileva quando stai camminando (GPS in background)'
  },
  'walk_detection.how_it_works.item2': {
    'pt-BR': 'Aprende seus horários habituais de passeio',
    'en': 'Learns your usual walk times',
    'es': 'Aprende tus horarios habituales de paseo',
    'fr': 'Apprend vos horaires habituels de promenade',
    'it': 'Impara i tuoi orari abituali di passeggio'
  },
  'walk_detection.how_it_works.item3': {
    'pt-BR': 'Envia notificação perguntando se quer registrar',
    'en': 'Sends a notification asking if you want to log it',
    'es': 'Envía una notificación preguntando si quieres registrarlo',
    'fr': 'Envoie une notification pour demander si vous voulez l’enregistrer',
    'it': 'Invia una notifica chiedendo se vuoi registrarlo'
  },
  'walk_detection.how_it_works.item4': {
    'pt-BR': 'Você pode confirmar ou ignorar',
    'en': 'You can confirm or ignore',
    'es': 'Puedes confirmar o ignorar',
    'fr': 'Vous pouvez confirmer ou ignorer',
    'it': 'Puoi confermare o ignorare'
  },
  'walk_detection.how_it_works.item5': {
    'pt-BR': 'Economiza bateria (só monitora em horários prováveis)',
    'en': 'Saves battery (only monitors likely times)',
    'es': 'Ahorra batería (solo monitorea en horarios probables)',
    'fr': 'Économise la batterie (surveille uniquement les heures probables)',
    'it': 'Risparmia batteria (monitora solo negli orari probabili)'
  },
  'search.min_chars': {
    'pt-BR': 'Digite pelo menos 2 caracteres',
    'en': 'Type at least 2 characters',
    'es': 'Escribe al menos 2 caracteres',
    'fr': 'Saisissez au moins 2 caractères',
    'it': 'Digita almeno 2 caratteri'
  },
  'search.non_pet_warning': {
    'pt-BR': 'Este termo não parece ser relacionado a pets. Tente uma das sugestões abaixo:',
    'en': 'This term doesn’t appear to be pet-related. Try one of the suggestions below:',
    'es': 'Este término no parece estar relacionado con mascotas. Prueba una de las sugerencias abajo:',
    'fr': 'Ce terme ne semble pas lié aux animaux. Essayez une des suggestions ci-dessous :',
    'it': 'Questo termine non sembra legato agli animali. Prova una delle suggerimenti qui sotto:'
  },
  'search.process_failed': {
    'pt-BR': 'Não foi possível processar a busca',
    'en': 'Could not process search',
    'es': 'No se pudo procesar la búsqueda',
    'fr': 'Impossible de traiter la recherche',
    'it': 'Impossibile elaborare la ricerca'
  },
  'search.aria_label': {
    'pt-BR': 'Buscar produtos para pets',
    'en': 'Search for pet products',
    'es': 'Buscar productos para mascotas',
    'fr': 'Rechercher des produits pour animaux',
    'it': 'Cerca prodotti per animali'
  },
  'search.clear_label': {
    'pt-BR': 'Limpar busca',
    'en': 'Clear search',
    'es': 'Limpiar búsqueda',
    'fr': 'Effacer la recherche',
    'it': 'Cancella ricerca'
  },
  'search.search_label': {
    'pt-BR': 'Buscar',
    'en': 'Search',
    'es': 'Buscar',
    'fr': 'Rechercher',
    'it': 'Cerca'
  },
  'search.disclaimer': {
    'pt-BR': 'Você será redirecionado ao Google Shopping. O PETMOL não vende nem compara preços de produtos.',
    'en': 'You will be redirected to Google Shopping. PETMOL does not sell or compare product prices.',
    'es': 'Serás redirigido a Google Shopping. PETMOL no vende ni compara precios de productos.',
    'fr': 'Vous serez redirigé vers Google Shopping. PETMOL ne vend ni ne compare les prix des produits.',
    'it': 'Sarai reindirizzato a Google Shopping. PETMOL non vende né confronta i prezzi dei prodotti.'
  },
  'medical_share_qr.alerts.generate_error': {
    'pt-BR': 'Erro ao gerar QR code',
    'en': 'Failed to generate QR code',
    'es': 'Error al generar el código QR',
    'fr': 'Erreur lors de la génération du QR code',
    'it': 'Errore nella generazione del QR code'
  },
  'medical_share_qr.alerts.link_copied': {
    'pt-BR': 'Link copiado!',
    'en': 'Link copied!',
    'es': '¡Enlace copiado!',
    'fr': 'Lien copié !',
    'it': 'Link copiato!'
  },
  'medical_share_qr.title': {
    'pt-BR': 'Compartilhar Histórico Médico',
    'en': 'Share medical history',
    'es': 'Compartir historial médico',
    'fr': 'Partager l’historique médical',
    'it': 'Condividi la storia medica'
  },
  'medical_share_qr.subtitle': {
    'pt-BR': 'Gere um QR code para o veterinário acessar o histórico de {petName}',
    'en': 'Generate a QR code so the vet can access {petName}’s history',
    'es': 'Genera un código QR para que el veterinario acceda al historial de {petName}',
    'fr': 'Générez un QR code pour que le vétérinaire accède à l’historique de {petName}',
    'it': 'Genera un QR code per permettere al veterinario di accedere alla storia di {petName}'
  },
  'medical_share_qr.validity_label': {
    'pt-BR': 'Validade do acesso',
    'en': 'Access validity',
    'es': 'Validez del acceso',
    'fr': 'Validité d’accès',
    'it': 'Validità dell’accesso'
  },
  'medical_share_qr.validity_15': {
    'pt-BR': '15 minutos',
    'en': '15 minutes',
    'es': '15 minutos',
    'fr': '15 minutes',
    'it': '15 minuti'
  },
  'medical_share_qr.validity_30': {
    'pt-BR': '30 minutos',
    'en': '30 minutes',
    'es': '30 minutos',
    'fr': '30 minutes',
    'it': '30 minuti'
  },
  'medical_share_qr.validity_60': {
    'pt-BR': '1 hora',
    'en': '1 hour',
    'es': '1 hora',
    'fr': '1 heure',
    'it': '1 ora'
  },
  'medical_share_qr.validity_180': {
    'pt-BR': '3 horas',
    'en': '3 hours',
    'es': '3 horas',
    'fr': '3 heures',
    'it': '3 ore'
  },
  'medical_share_qr.validity_1440': {
    'pt-BR': '24 horas',
    'en': '24 hours',
    'es': '24 horas',
    'fr': '24 heures',
    'it': '24 ore'
  },
  'medical_share_qr.validity_hint': {
    'pt-BR': 'Após esse período, o QR code expira por segurança',
    'en': 'After this period, the QR code expires for security',
    'es': 'Después de este período, el código QR expira por seguridad',
    'fr': 'Après cette période, le QR code expire pour des raisons de sécurité',
    'it': 'Dopo questo periodo, il QR code scade per sicurezza'
  },
  'medical_share_qr.generating': {
    'pt-BR': '🔄 Gerando...',
    'en': '🔄 Generating...',
    'es': '🔄 Generando...',
    'fr': '🔄 Génération...',
    'it': '🔄 Generazione...'
  },
  'medical_share_qr.generate': {
    'pt-BR': '🎯 Gerar QR Code',
    'en': '🎯 Generate QR Code',
    'es': '🎯 Generar QR Code',
    'fr': '🎯 Générer le QR Code',
    'it': '🎯 Genera QR Code'
  },
  'medical_share_qr.qr_alt': {
    'pt-BR': 'QR Code',
    'en': 'QR Code',
    'es': 'QR Code',
    'fr': 'QR Code',
    'it': 'QR Code'
  },
  'medical_share_qr.how_to_use_title': {
    'pt-BR': 'Como usar:',
    'en': 'How to use:',
    'es': 'Cómo usar:',
    'fr': 'Comment utiliser :',
    'it': 'Come usare:'
  },
  'medical_share_qr.how_to_use.item1': {
    'pt-BR': 'Mostre este QR code para o veterinário',
    'en': 'Show this QR code to the vet',
    'es': 'Muestra este código QR al veterinario',
    'fr': 'Montrez ce QR code au vétérinaire',
    'it': 'Mostra questo QR code al veterinario'
  },
  'medical_share_qr.how_to_use.item2': {
    'pt-BR': 'Ele escaneia com a câmera do celular',
    'en': 'They scan it with the phone camera',
    'es': 'Lo escanean con la cámara del celular',
    'fr': 'Il le scanne avec l’appareil photo du téléphone',
    'it': 'Lo scansiona con la fotocamera del telefono'
  },
  'medical_share_qr.how_to_use.item3': {
    'pt-BR': 'Abre o histórico completo de {petName}',
    'en': 'Opens the full history of {petName}',
    'es': 'Abre el historial completo de {petName}',
    'fr': 'Ouvre l’historique complet de {petName}',
    'it': 'Apre la storia completa di {petName}'
  },
  'medical_share_qr.how_to_use.item4': {
    'pt-BR': 'Válido por {minutes} minutos',
    'en': 'Valid for {minutes} minutes',
    'es': 'Válido por {minutes} minutos',
    'fr': 'Valable {minutes} minutes',
    'it': 'Valido per {minutes} minuti'
  },
  'medical_share_qr.actions.download': {
    'pt-BR': 'Baixar',
    'en': 'Download',
    'es': 'Descargar',
    'fr': 'Télécharger',
    'it': 'Scarica'
  },
  'medical_share_qr.actions.copy_link': {
    'pt-BR': 'Copiar Link',
    'en': 'Copy link',
    'es': 'Copiar enlace',
    'fr': 'Copier le lien',
    'it': 'Copia link'
  },
  'medical_share_qr.actions.generate_new': {
    'pt-BR': '← Gerar novo QR code',
    'en': '← Generate new QR code',
    'es': '← Generar nuevo QR code',
    'fr': '← Générer un nouveau QR code',
    'it': '← Genera nuovo QR code'
  },
  'medical_share_qr.security_title': {
    'pt-BR': '🔒 Segurança:',
    'en': '🔒 Security:',
    'es': '🔒 Seguridad:',
    'fr': '🔒 Sécurité :',
    'it': '🔒 Sicurezza:'
  },
  'medical_share_qr.security_body': {
    'pt-BR': 'O QR code expira automaticamente. Só compartilhe com profissionais de confiança. O histórico médico contém dados sensíveis do seu pet.',
    'en': 'The QR code expires automatically. Only share with trusted professionals. The medical history contains sensitive pet data.',
    'es': 'El código QR expira automáticamente. Compártelo solo con profesionales de confianza. El historial médico contiene datos sensibles de tu mascota.',
    'fr': 'Le QR code expire automatiquement. Ne partagez qu’avec des professionnels de confiance. L’historique médical contient des données sensibles.',
    'it': 'Il QR code scade automaticamente. Condividi solo con professionisti fidati. La storia medica contiene dati sensibili.'
  },
  'medical_assistant.answer_required': {
    'pt-BR': 'Por favor, responda esta pergunta',
    'en': 'Please answer this question',
    'es': 'Por favor, responde esta pregunta',
    'fr': 'Veuillez répondre à cette question',
    'it': 'Per favore, rispondi a questa domanda'
  },
  'medical_assistant.select_placeholder': {
    'pt-BR': 'Selecione...',
    'en': 'Select...',
    'es': 'Selecciona...',
    'fr': 'Sélectionner...',
    'it': 'Seleziona...'
  },
  'medical_assistant.yes': {
    'pt-BR': 'Sim',
    'en': 'Yes',
    'es': 'Sí',
    'fr': 'Oui',
    'it': 'Sì'
  },
  'medical_assistant.no': {
    'pt-BR': 'Não',
    'en': 'No',
    'es': 'No',
    'fr': 'Non',
    'it': 'No'
  },
  'medical_assistant.files_attached': {
    'pt-BR': '{count} arquivo(s) anexado(s)',
    'en': '{count} file(s) attached',
    'es': '{count} archivo(s) adjunto(s)',
    'fr': '{count} fichier(s) joint(s)',
    'it': '{count} file allegato/i'
  },
  'medical_assistant.question_progress': {
    'pt-BR': 'Pergunta {current} de {total}',
    'en': 'Question {current} of {total}',
    'es': 'Pregunta {current} de {total}',
    'fr': 'Question {current} sur {total}',
    'it': 'Domanda {current} di {total}'
  },
  'medical_assistant.next': {
    'pt-BR': 'Próxima →',
    'en': 'Next →',
    'es': 'Siguiente →',
    'fr': 'Suivante →',
    'it': 'Avanti →'
  },
  'medical_assistant.finish': {
    'pt-BR': '✓ Concluir',
    'en': '✓ Finish',
    'es': '✓ Finalizar',
    'fr': '✓ Terminer',
    'it': '✓ Completa'
  },
  'smart_suggestions.title': {
    'pt-BR': 'Sugestões Inteligentes',
    'en': 'Smart suggestions',
    'es': 'Sugerencias inteligentes',
    'fr': 'Suggestions intelligentes',
    'it': 'Suggerimenti intelligenti'
  },
  'smart_suggestions.summary': {
    'pt-BR': '{count} sugestões para você',
    'en': '{count} suggestions for you',
    'es': '{count} sugerencias para ti',
    'fr': '{count} suggestions pour vous',
    'it': '{count} suggerimenti per te'
  },
  'popular_today.title': {
    'pt-BR': 'Populares hoje',
    'en': 'Popular today',
    'es': 'Populares hoy',
    'fr': 'Populaires aujourd’hui',
    'it': 'Popolari oggi'
  },
  'popular_today.subtitle': {
    'pt-BR': 'Baseado nas buscas recentes no PETMOL',
    'en': 'Based on recent searches on PETMOL',
    'es': 'Basado en búsquedas recientes en PETMOL',
    'fr': 'Basé sur les recherches récentes sur PETMOL',
    'it': 'Basato sulle ricerche recenti su PETMOL'
  },
  'popular_today.empty': {
    'pt-BR': 'Ainda sem dados. Faça uma busca!',
    'en': 'No data yet. Try a search!',
    'es': 'Aún no hay datos. ¡Haz una búsqueda!',
    'fr': 'Pas encore de données. Faites une recherche !',
    'it': 'Ancora nessun dato. Fai una ricerca!'
  },
  'popular_today.retry': {
    'pt-BR': 'Tentar novamente',
    'en': 'Try again',
    'es': 'Intentar de nuevo',
    'fr': 'Réessayer',
    'it': 'Riprova'
  },
  'popular_today.errors.timeout': {
    'pt-BR': 'Conexão lenta. Tente novamente.',
    'en': 'Slow connection. Try again.',
    'es': 'Conexión lenta. Intenta de nuevo.',
    'fr': 'Connexion lente. Réessayez.',
    'it': 'Connessione lenta. Riprova.'
  },
  'popular_today.errors.network': {
    'pt-BR': 'Sem conexão. Verifique sua internet.',
    'en': 'No connection. Check your internet.',
    'es': 'Sin conexión. Verifica tu internet.',
    'fr': 'Pas de connexion. Vérifiez votre internet.',
    'it': 'Nessuna connessione. Controlla la tua rete.'
  },
  'popular_today.errors.generic': {
    'pt-BR': 'Erro ao carregar. Tente novamente.',
    'en': 'Failed to load. Try again.',
    'es': 'Error al cargar. Intenta de nuevo.',
    'fr': 'Erreur de chargement. Réessayez.',
    'it': 'Errore nel caricamento. Riprova.'
  },
  'popular_today.errors.fallback': {
    'pt-BR': 'Erro ao carregar populares.',
    'en': 'Failed to load popular items.',
    'es': 'Error al cargar populares.',
    'fr': 'Impossible de charger les populaires.',
    'it': 'Impossibile caricare i popolari.'
  },
  'shortcuts.usage_singular': {
    'pt-BR': '{count} uso',
    'en': '{count} use',
    'es': '{count} uso',
    'fr': '{count} utilisation',
    'it': '{count} uso'
  },
  'shortcuts.usage_plural': {
    'pt-BR': '{count} usos',
    'en': '{count} uses',
    'es': '{count} usos',
    'fr': '{count} utilisations',
    'it': '{count} usi'
  },
  'health.dashboard.no_history_title': {
    'pt-BR': 'Sem histórico médico',
    'en': 'No medical history',
    'es': 'Sin historial médico',
    'fr': 'Aucun historique médical',
    'it': 'Nessuna storia medica'
  },
  'health.dashboard.no_history_description': {
    'pt-BR': 'Crie o perfil de saúde do seu pet para começar',
    'en': 'Create your pet’s health profile to get started',
    'es': 'Crea el perfil de salud de tu mascota para comenzar',
    'fr': 'Créez le profil de santé de votre animal pour commencer',
    'it': 'Crea il profilo salute del tuo animale per iniziare'
  },
  'health.dashboard.create_profile': {
    'pt-BR': 'Criar Perfil de Saúde',
    'en': 'Create health profile',
    'es': 'Crear perfil de salud',
    'fr': 'Créer le profil de santé',
    'it': 'Crea profilo salute'
  },
  'health.dashboard.title': {
    'pt-BR': 'Saúde de {petName}',
    'en': 'Health for {petName}',
    'es': 'Salud de {petName}',
    'fr': 'Santé de {petName}',
    'it': 'Salute di {petName}'
  },
  'health.dashboard.species.dog': {
    'pt-BR': '🐕 Cachorro',
    'en': '🐕 Dog',
    'es': '🐕 Perro',
    'fr': '🐕 Chien',
    'it': '🐕 Cane'
  },
  'health.dashboard.species.cat': {
    'pt-BR': '🐱 Gato',
    'en': '🐱 Cat',
    'es': '🐱 Gato',
    'fr': '🐱 Chat',
    'it': '🐱 Gatto'
  },
  'health.dashboard.species.other': {
    'pt-BR': '🐾 Pet',
    'en': '🐾 Pet',
    'es': '🐾 Mascota',
    'fr': '🐾 Animal',
    'it': '🐾 Pet'
  },
  'health.dashboard.sex.male': {
    'pt-BR': '♂️ Macho',
    'en': '♂️ Male',
    'es': '♂️ Macho',
    'fr': '♂️ Mâle',
    'it': '♂️ Maschio'
  },
  'health.dashboard.sex.female': {
    'pt-BR': '♀️ Fêmea',
    'en': '♀️ Female',
    'es': '♀️ Hembra',
    'fr': '♀️ Femelle',
    'it': '♀️ Femmina'
  },
  'health.dashboard.neutered': {
    'pt-BR': 'Castrado',
    'en': 'Neutered',
    'es': 'Castrado',
    'fr': 'Stérilisé',
    'it': 'Castrato'
  },
  'health.dashboard.age_years': {
    'pt-BR': '{count} anos',
    'en': '{count} years',
    'es': '{count} años',
    'fr': '{count} ans',
    'it': '{count} anni'
  },
  'health.dashboard.stats.vaccines.label': {
    'pt-BR': 'Vacinas',
    'en': 'Vaccines',
    'es': 'Vacunas',
    'fr': 'Vaccins',
    'it': 'Vaccini'
  },
  'health.dashboard.stats.vaccines.upcoming': {
    'pt-BR': '{count} próximas',
    'en': '{count} upcoming',
    'es': '{count} próximas',
    'fr': '{count} à venir',
    'it': '{count} in arrivo'
  },
  'health.dashboard.stats.vaccines.on_time': {
    'pt-BR': 'Em dia',
    'en': 'Up to date',
    'es': 'Al día',
    'fr': 'À jour',
    'it': 'In regola'
  },
  'health.dashboard.stats.medications.label': {
    'pt-BR': 'Medicamentos',
    'en': 'Medications',
    'es': 'Medicamentos',
    'fr': 'Médicaments',
    'it': 'Farmaci'
  },
  'health.dashboard.stats.medications.in_use': {
    'pt-BR': 'Em uso',
    'en': 'In use',
    'es': 'En uso',
    'fr': 'En cours',
    'it': 'In uso'
  },
  'health.dashboard.stats.medications.none': {
    'pt-BR': 'Nenhum',
    'en': 'None',
    'es': 'Ninguno',
    'fr': 'Aucun',
    'it': 'Nessuno'
  },
  'health.dashboard.stats.appointments.label': {
    'pt-BR': 'Consultas',
    'en': 'Appointments',
    'es': 'Citas',
    'fr': 'Rendez-vous',
    'it': 'Visite'
  },
  'health.dashboard.stats.appointments.scheduled': {
    'pt-BR': 'Agendadas',
    'en': 'Scheduled',
    'es': 'Programadas',
    'fr': 'Planifiées',
    'it': 'Programmate'
  },
  'health.dashboard.stats.appointments.none': {
    'pt-BR': 'Sem agenda',
    'en': 'No upcoming',
    'es': 'Sin agenda',
    'fr': 'Aucun prévu',
    'it': 'Nessuna in agenda'
  },
  'health.dashboard.stats.exams.label': {
    'pt-BR': 'Exames',
    'en': 'Exams',
    'es': 'Exámenes',
    'fr': 'Examens',
    'it': 'Esami'
  },
  'health.dashboard.stats.exams.completed': {
    'pt-BR': 'Realizados',
    'en': 'Completed',
    'es': 'Realizados',
    'fr': 'Réalisés',
    'it': 'Eseguiti'
  },
  'health.dashboard.stats.walks.label': {
    'pt-BR': 'Passeios Hoje',
    'en': 'Walks today',
    'es': 'Paseos hoy',
    'fr': 'Promenades aujourd’hui',
    'it': 'Passeggiate oggi'
  },
  'health.dashboard.stats.walks.minutes': {
    'pt-BR': '{minutes} min',
    'en': '{minutes} min',
    'es': '{minutes} min',
    'fr': '{minutes} min',
    'it': '{minutes} min'
  },
  'health.dashboard.walks.goal_met': {
    'pt-BR': '✅ Meta de Passeios Atingida!',
    'en': '✅ Walk goal achieved!',
    'es': '✅ ¡Meta de paseos alcanzada!',
    'fr': '✅ Objectif de promenades atteint !',
    'it': '✅ Obiettivo passeggiate raggiunto!'
  },
  'health.dashboard.walks.today': {
    'pt-BR': '🚶 Passeios de Hoje',
    'en': '🚶 Today’s walks',
    'es': '🚶 Paseos de hoy',
    'fr': '🚶 Promenades du jour',
    'it': '🚶 Passeggiate di oggi'
  },
  'health.dashboard.walks.summary': {
    'pt-BR': '{walks} passeio(s) • {minutes} minutos • {distance} km',
    'en': '{walks} walk(s) • {minutes} minutes • {distance} km',
    'es': '{walks} paseo(s) • {minutes} minutos • {distance} km',
    'fr': '{walks} promenade(s) • {minutes} minutes • {distance} km',
    'it': '{walks} passeggiata/e • {minutes} minuti • {distance} km'
  },
  'health.dashboard.walks.view_details': {
    'pt-BR': 'Ver Detalhes →',
    'en': 'View details →',
    'es': 'Ver detalles →',
    'fr': 'Voir les détails →',
    'it': 'Vedi dettagli →'
  },
  'health.dashboard.alerts.title': {
    'pt-BR': 'Atenção',
    'en': 'Attention',
    'es': 'Atención',
    'fr': 'Attention',
    'it': 'Attenzione'
  },
  'health.dashboard.alerts.vaccines': {
    'pt-BR': '{count} vacina(s) próxima(s) do vencimento',
    'en': '{count} vaccine(s) nearing expiration',
    'es': '{count} vacuna(s) cerca de vencer',
    'fr': '{count} vaccin(s) proche(s) de l’expiration',
    'it': '{count} vaccino/i in scadenza'
  },
  'health.dashboard.alerts.appointments': {
    'pt-BR': '{count} consulta(s) agendada(s)',
    'en': '{count} scheduled appointment(s)',
    'es': '{count} cita(s) programada(s)',
    'fr': '{count} rendez-vous planifié(s)',
    'it': '{count} visita/e programmata/e'
  },
  'health.dashboard.alerts.allergies': {
    'pt-BR': '{count} alergia(s) registrada(s)',
    'en': '{count} recorded allergy(ies)',
    'es': '{count} alergia(s) registrada(s)',
    'fr': '{count} allergie(s) enregistrée(s)',
    'it': '{count} allergia/e registrata/e'
  },
  'health.dashboard.upcoming_vaccines.title': {
    'pt-BR': 'Próximas Vacinas',
    'en': 'Upcoming vaccines',
    'es': 'Próximas vacunas',
    'fr': 'Vaccins à venir',
    'it': 'Vaccini in arrivo'
  },
  'health.dashboard.days': {
    'pt-BR': '{count} dias',
    'en': '{count} days',
    'es': '{count} días',
    'fr': '{count} jours',
    'it': '{count} giorni'
  },
  'health.dashboard.active_medications.title': {
    'pt-BR': 'Medicamentos Ativos',
    'en': 'Active medications',
    'es': 'Medicamentos activos',
    'fr': 'Médicaments actifs',
    'it': 'Farmaci attivi'
  },
  'health.dashboard.active_medications.reminders': {
    'pt-BR': 'Lembretes',
    'en': 'Reminders',
    'es': 'Recordatorios',
    'fr': 'Rappels',
    'it': 'Promemoria'
  },
  'health.dashboard.upcoming_appointments.title': {
    'pt-BR': 'Próximas Consultas',
    'en': 'Upcoming appointments',
    'es': 'Próximas citas',
    'fr': 'Prochains rendez-vous',
    'it': 'Prossime visite'
  },
  'health.dashboard.upcoming_appointments.at_time': {
    'pt-BR': 'às {time}',
    'en': 'at {time}',
    'es': 'a las {time}',
    'fr': 'à {time}',
    'it': 'alle {time}'
  },
  'health.dashboard.upcoming_appointments.doctor_prefix': {
    'pt-BR': 'Dr(a).',
    'en': 'Dr.',
    'es': 'Dr(a).',
    'fr': 'Dr',
    'it': 'Dr.'
  },
  'health.dashboard.allergies.title': {
    'pt-BR': 'Alergias',
    'en': 'Allergies',
    'es': 'Alergias',
    'fr': 'Allergies',
    'it': 'Allergie'
  },
  'health.dashboard.allergies.severe': {
    'pt-BR': 'SEVERA',
    'en': 'SEVERE',
    'es': 'SEVERA',
    'fr': 'SÉVÈRE',
    'it': 'GRAVE'
  },
  'health.dashboard.chronic_conditions.title': {
    'pt-BR': 'Condições Crônicas',
    'en': 'Chronic conditions',
    'es': 'Condiciones crónicas',
    'fr': 'Affections chroniques',
    'it': 'Condizioni croniche'
  },
  'health.dashboard.vets.title': {
    'pt-BR': 'Veterinários',
    'en': 'Veterinarians',
    'es': 'Veterinarios',
    'fr': 'Vétérinaires',
    'it': 'Veterinari'
  },
  'health.dashboard.vets.primary': {
    'pt-BR': 'Veterinário Principal',
    'en': 'Primary veterinarian',
    'es': 'Veterinario principal',
    'fr': 'Vétérinaire principal',
    'it': 'Veterinario principale'
  },
  'health.dashboard.vets.emergency': {
    'pt-BR': 'Emergência 24h',
    'en': '24h emergency',
    'es': 'Emergencia 24h',
    'fr': 'Urgence 24h',
    'it': 'Emergenza 24h'
  },
  'health.dashboard.automation.title': {
    'pt-BR': 'Sistema Automático Ativado',
    'en': 'Automatic system enabled',
    'es': 'Sistema automático activado',
    'fr': 'Système automatique activé',
    'it': 'Sistema automatico attivato'
  },
  'health.dashboard.automation.description': {
    'pt-BR': 'O sistema detecta automaticamente quando você está em clínicas ou petshops. Vai aparecer na hora certa para registrar tudo! 🎯',
    'en': 'The system detects when you are at clinics or pet shops. It will appear at the right time to log everything! 🎯',
    'es': 'El sistema detecta automáticamente cuando estás en clínicas o pet shops. Aparecerá en el momento adecuado para registrar todo. 🎯',
    'fr': 'Le système détecte automatiquement quand vous êtes en clinique ou animalerie. Il apparaîtra au bon moment pour tout enregistrer ! 🎯',
    'it': 'Il sistema rileva automaticamente quando sei in cliniche o pet shop. Apparirà al momento giusto per registrare tutto! 🎯'
  },
  'health.dashboard.share.title': {
    'pt-BR': 'Compartilhar Histórico com Veterinário',
    'en': 'Share history with veterinarian',
    'es': 'Compartir historial con el veterinario',
    'fr': 'Partager l’historique avec le vétérinaire',
    'it': 'Condividi la storia con il veterinario'
  },
  'health.dashboard.share.description': {
    'pt-BR': 'Gere um QR code temporário para o veterinário acessar todo o histórico médico de {petName}',
    'en': 'Generate a temporary QR code so the vet can access {petName}’s full medical history',
    'es': 'Genera un QR code temporal para que el veterinario acceda al historial médico completo de {petName}',
    'fr': 'Générez un QR code temporaire pour que le vétérinaire accède à tout l’historique médical de {petName}',
    'it': 'Genera un QR code temporaneo per permettere al veterinario di accedere alla storia medica completa di {petName}'
  },
  'health.dashboard.share.close': {
    'pt-BR': '✕ Fechar',
    'en': '✕ Close',
    'es': '✕ Cerrar',
    'fr': '✕ Fermer',
    'it': '✕ Chiudi'
  },
  'health.dashboard.share.generate_qr': {
    'pt-BR': '🎯 Gerar QR Code',
    'en': '🎯 Generate QR Code',
    'es': '🎯 Generar QR Code',
    'fr': '🎯 Générer le QR Code',
    'it': '🎯 Genera QR Code'
  },
  'health.dashboard.links.vaccines': {
    'pt-BR': 'Vacinas',
    'en': 'Vaccines',
    'es': 'Vacunas',
    'fr': 'Vaccins',
    'it': 'Vaccini'
  },
  'health.dashboard.links.medications': {
    'pt-BR': 'Medicamentos',
    'en': 'Medications',
    'es': 'Medicamentos',
    'fr': 'Médicaments',
    'it': 'Farmaci'
  },
  'health.dashboard.links.appointments': {
    'pt-BR': 'Consultas',
    'en': 'Appointments',
    'es': 'Citas',
    'fr': 'Rendez-vous',
    'it': 'Visite'
  },
  'health.dashboard.links.exams': {
    'pt-BR': 'Exames',
    'en': 'Exams',
    'es': 'Exámenes',
    'fr': 'Examens',
    'it': 'Esami'
  },
  'health.dashboard.links.walks': {
    'pt-BR': 'Passeios',
    'en': 'Walks',
    'es': 'Paseos',
    'fr': 'Promenades',
    'it': 'Passeggiate'
  },
  'diagnostics.title': {
    'pt-BR': '🔍 Diagnóstico PETMOL',
    'en': '🔍 PETMOL diagnostics',
    'es': '🔍 Diagnóstico PETMOL',
    'fr': '🔍 Diagnostic PETMOL',
    'it': '🔍 Diagnostica PETMOL'
  },
  'diagnostics.subtitle': {
    'pt-BR': 'Testando todos os componentes do sistema',
    'en': 'Testing all system components',
    'es': 'Probando todos los componentes del sistema',
    'fr': 'Test de tous les composants du système',
    'it': 'Test di tutti i componenti del sistema'
  },
  'diagnostics.tests.api_health.title': {
    'pt-BR': 'API Health',
    'en': 'API Health',
    'es': 'API Health',
    'fr': 'API Health',
    'it': 'API Health'
  },
  'diagnostics.tests.api_health.description': {
    'pt-BR': 'Testa se o backend está respondendo',
    'en': 'Checks if the backend is responding',
    'es': 'Comprueba si el backend responde',
    'fr': 'Vérifie si le backend répond',
    'it': 'Verifica se il backend risponde'
  },
  'diagnostics.tests.api_base_url.title': {
    'pt-BR': 'API Base URL',
    'en': 'API Base URL',
    'es': 'URL base de API',
    'fr': 'URL de base API',
    'it': 'URL base API'
  },
  'diagnostics.tests.api_base_url.description': {
    'pt-BR': 'Verifica qual URL está configurada',
    'en': 'Shows which URL is configured',
    'es': 'Verifica qué URL está configurada',
    'fr': 'Vérifie l’URL configurée',
    'it': 'Verifica quale URL è configurato'
  },
  'diagnostics.tests.geolocation.title': {
    'pt-BR': 'Geolocation',
    'en': 'Geolocation',
    'es': 'Geolocalización',
    'fr': 'Géolocalisation',
    'it': 'Geolocalizzazione'
  },
  'diagnostics.tests.geolocation.description': {
    'pt-BR': 'Testa se o navegador tem geolocalização',
    'en': 'Checks if the browser supports geolocation',
    'es': 'Comprueba si el navegador tiene geolocalización',
    'fr': 'Vérifie si le navigateur prend en charge la géolocalisation',
    'it': 'Verifica se il browser supporta la geolocalizzazione'
  },
  'diagnostics.tests.geolocation.unavailable': {
    'pt-BR': 'Geolocalização não disponível',
    'en': 'Geolocation unavailable',
    'es': 'Geolocalización no disponible',
    'fr': 'Géolocalisation indisponible',
    'it': 'Geolocalizzazione non disponibile'
  },
  'diagnostics.tests.geolocation.error': {
    'pt-BR': 'Erro: {message}',
    'en': 'Error: {message}',
    'es': 'Error: {message}',
    'fr': 'Erreur : {message}',
    'it': 'Errore: {message}'
  },
  'diagnostics.tests.emergency_fixed.title': {
    'pt-BR': 'Emergency API (Coordenadas fixas)',
    'en': 'Emergency API (fixed coordinates)',
    'es': 'Emergency API (coordenadas fijas)',
    'fr': 'Emergency API (coordonnées fixes)',
    'it': 'Emergency API (coordinate fisse)'
  },
  'diagnostics.tests.emergency_fixed.description': {
    'pt-BR': 'Testa endpoint de emergência com BH',
    'en': 'Tests emergency endpoint with BH',
    'es': 'Prueba el endpoint de emergencia con BH',
    'fr': 'Teste l’endpoint d’urgence avec BH',
    'it': 'Testa l’endpoint di emergenza con BH'
  },
  'diagnostics.tests.places_fixed.title': {
    'pt-BR': 'Places API (Coordenadas fixas)',
    'en': 'Places API (fixed coordinates)',
    'es': 'Places API (coordenadas fijas)',
    'fr': 'Places API (coordonnées fixes)',
    'it': 'Places API (coordinate fisse)'
  },
  'diagnostics.tests.places_fixed.description': {
    'pt-BR': 'Testa endpoint de lugares com BH',
    'en': 'Tests places endpoint with BH',
    'es': 'Prueba el endpoint de lugares con BH',
    'fr': 'Teste l’endpoint des lieux avec BH',
    'it': 'Testa l’endpoint dei luoghi con BH'
  },
  'diagnostics.tests.cors.title': {
    'pt-BR': 'CORS',
    'en': 'CORS',
    'es': 'CORS',
    'fr': 'CORS',
    'it': 'CORS'
  },
  'diagnostics.tests.cors.description': {
    'pt-BR': 'Verifica se há problemas de CORS',
    'en': 'Checks for CORS issues',
    'es': 'Verifica problemas de CORS',
    'fr': 'Vérifie les problèmes CORS',
    'it': 'Verifica problemi CORS'
  },
  'diagnostics.tests.cors.ok': {
    'pt-BR': 'OK',
    'en': 'OK',
    'es': 'OK',
    'fr': 'OK',
    'it': 'OK'
  },
  'diagnostics.actions.test': {
    'pt-BR': '▶️ Testar',
    'en': '▶️ Run',
    'es': '▶️ Probar',
    'fr': '▶️ Tester',
    'it': '▶️ Testa'
  },
  'diagnostics.actions.testing': {
    'pt-BR': '⏳',
    'en': '⏳',
    'es': '⏳',
    'fr': '⏳',
    'it': '⏳'
  },
  'diagnostics.actions.run_all': {
    'pt-BR': '🚀 Executar Todos os Testes',
    'en': '🚀 Run all tests',
    'es': '🚀 Ejecutar todas las pruebas',
    'fr': '🚀 Exécuter tous les tests',
    'it': '🚀 Esegui tutti i test'
  },
  'diagnostics.result.success': {
    'pt-BR': '✅ Sucesso',
    'en': '✅ Success',
    'es': '✅ Éxito',
    'fr': '✅ Succès',
    'it': '✅ Successo'
  },
  'diagnostics.result.failure': {
    'pt-BR': '❌ Falhou',
    'en': '❌ Failed',
    'es': '❌ Falló',
    'fr': '❌ Échec',
    'it': '❌ Fallito'
  },
  'diagnostics.instructions.title': {
    'pt-BR': '📋 Instruções:',
    'en': '📋 Instructions:',
    'es': '📋 Instrucciones:',
    'fr': '📋 Instructions :',
    'it': '📋 Istruzioni:'
  },
  'diagnostics.instructions.step1': {
    'pt-BR': 'Execute cada teste na ordem',
    'en': 'Run each test in order',
    'es': 'Ejecuta cada prueba en orden',
    'fr': 'Exécutez chaque test dans l’ordre',
    'it': 'Esegui ogni test in ordine'
  },
  'diagnostics.instructions.step2': {
    'pt-BR': 'Anote quais falharam',
    'en': 'Note which ones failed',
    'es': 'Anota cuáles fallaron',
    'fr': 'Notez ceux qui ont échoué',
    'it': 'Annota quelli che hanno fallito'
  },
  'diagnostics.instructions.step3': {
    'pt-BR': 'Se "Emergency API" retornar vazio mas sem erro = problema no Google Maps',
    'en': 'If "Emergency API" returns empty without error = Google Maps issue',
    'es': 'Si "Emergency API" devuelve vacío sin error = problema en Google Maps',
    'fr': 'Si "Emergency API" renvoie vide sans erreur = problème Google Maps',
    'it': 'Se "Emergency API" restituisce vuoto senza errore = problema Google Maps'
  },
  'diagnostics.instructions.step4': {
    'pt-BR': 'Se "Emergency API" falhar com erro = problema no backend',
    'en': 'If "Emergency API" fails with error = backend issue',
    'es': 'Si "Emergency API" falla con error = problema en el backend',
    'fr': 'Si "Emergency API" échoue avec erreur = problème backend',
    'it': 'Se "Emergency API" fallisce con errore = problema backend'
  },
  'diagnostics.instructions.step5': {
    'pt-BR': 'Se "Geolocation" falhar = problema no navegador',
    'en': 'If "Geolocation" fails = browser issue',
    'es': 'Si "Geolocation" falla = problema del navegador',
    'fr': 'Si "Geolocation" échoue = problème navigateur',
    'it': 'Se "Geolocation" fallisce = problema del browser'
  },
  'diagnostics.strategy.title': {
    'pt-BR': '🎯 Estratégia de Resolução:',
    'en': '🎯 Resolution strategy:',
    'es': '🎯 Estrategia de resolución:',
    'fr': '🎯 Stratégie de résolution :',
    'it': '🎯 Strategia di risoluzione:'
  },
  'diagnostics.strategy.section1.title': {
    'pt-BR': '1. Backend não responde:',
    'en': '1. Backend not responding:',
    'es': '1. El backend no responde:',
    'fr': '1. Backend ne répond pas :',
    'it': '1. Backend non risponde:'
  },
  'diagnostics.strategy.section1.item1': {
    'pt-BR': 'Verificar se API está rodando (porta 8000)',
    'en': 'Check if the API is running (port 8000)',
    'es': 'Verificar si la API está ejecutándose (puerto 8000)',
    'fr': 'Vérifier si l’API tourne (port 8000)',
    'it': 'Verifica che l’API sia in esecuzione (porta 8000)'
  },
  'diagnostics.strategy.section1.item2': {
    'pt-BR': 'Verificar CORS no backend',
    'en': 'Check CORS on the backend',
    'es': 'Verificar CORS en el backend',
    'fr': 'Vérifier CORS côté backend',
    'it': 'Verifica CORS sul backend'
  },
  'diagnostics.strategy.section1.item3': {
    'pt-BR': 'Verificar NEXT_PUBLIC_API_BASE_URL no .env.local',
    'en': 'Check NEXT_PUBLIC_API_BASE_URL in .env.local',
    'es': 'Verificar NEXT_PUBLIC_API_BASE_URL en .env.local',
    'fr': 'Vérifier NEXT_PUBLIC_API_BASE_URL dans .env.local',
    'it': 'Verifica NEXT_PUBLIC_API_BASE_URL in .env.local'
  },
  'diagnostics.strategy.section2.title': {
    'pt-BR': '2. Backend responde mas retorna vazio:',
    'en': '2. Backend responds but returns empty:',
    'es': '2. El backend responde pero devuelve vacío:',
    'fr': '2. Le backend répond mais renvoie vide :',
    'it': '2. Backend risponde ma restituisce vuoto:'
  },
  'diagnostics.strategy.section2.item1': {
    'pt-BR': 'Problema na chave do Google Maps',
    'en': 'Issue with the Google Maps key',
    'es': 'Problema con la clave de Google Maps',
    'fr': 'Problème avec la clé Google Maps',
    'it': 'Problema con la chiave Google Maps'
  },
  'diagnostics.strategy.section2.item2': {
    'pt-BR': 'Verificar restrições no Google Cloud Console',
    'en': 'Check restrictions in Google Cloud Console',
    'es': 'Verificar restricciones en Google Cloud Console',
    'fr': 'Vérifier les restrictions dans Google Cloud Console',
    'it': 'Verifica le restrizioni in Google Cloud Console'
  },
  'diagnostics.strategy.section2.item3': {
    'pt-BR': 'Criar nova chave sem restrições de referer',
    'en': 'Create a new key without referrer restrictions',
    'es': 'Crear una nueva clave sin restricciones de referer',
    'fr': 'Créer une nouvelle clé sans restrictions de referer',
    'it': 'Crea una nuova chiave senza restrizioni di referer'
  },
  'diagnostics.strategy.section3.title': {
    'pt-BR': '3. Frontend trava/loop:',
    'en': '3. Frontend freeze/loop:',
    'es': '3. Frontend se bloquea/bucle:',
    'fr': '3. Frontend bloque/boucle :',
    'it': '3. Frontend blocca/loop:'
  },
  'diagnostics.strategy.section3.item1': {
    'pt-BR': 'Problema no useEffect',
    'en': 'Issue in useEffect',
    'es': 'Problema en useEffect',
    'fr': 'Problème dans useEffect',
    'it': 'Problema in useEffect'
  },
  'diagnostics.strategy.section3.item2': {
    'pt-BR': 'Dependências circulares',
    'en': 'Circular dependencies',
    'es': 'Dependencias circulares',
    'fr': 'Dépendances circulaires',
    'it': 'Dipendenze circolari'
  },
  'diagnostics.strategy.section3.item3': {
    'pt-BR': 'Estado sendo atualizado infinitamente',
    'en': 'State updating infinitely',
    'es': 'Estado actualizándose infinitamente',
    'fr': 'État mis à jour à l’infini',
    'it': 'Stato aggiornato all’infinito'
  },
  'test_simple.title': {
    'pt-BR': 'Teste Simples - Emergency API',
    'en': 'Simple Test - Emergency API',
    'es': 'Prueba simple - Emergency API',
    'fr': 'Test simple - Emergency API',
    'it': 'Test semplice - Emergency API'
  },
  'test_simple.has_open': {
    'pt-BR': 'Tem abertos:',
    'en': 'Has open:',
    'es': 'Hay abiertos:',
    'fr': 'Ouverts :',
    'it': 'Aperti:'
  },
  'test_simple.yes': {
    'pt-BR': 'Sim',
    'en': 'Yes',
    'es': 'Sí',
    'fr': 'Oui',
    'it': 'Sì'
  },
  'test_simple.no': {
    'pt-BR': 'Não',
    'en': 'No',
    'es': 'No',
    'fr': 'Non',
    'it': 'No'
  },
  'test_simple.total_places': {
    'pt-BR': 'Total de locais: {count}',
    'en': 'Total places: {count}',
    'es': 'Total de lugares: {count}',
    'fr': 'Total de lieux : {count}',
    'it': 'Totale luoghi: {count}'
  },
  'test_simple.places_found': {
    'pt-BR': 'Locais Encontrados:',
    'en': 'Places found:',
    'es': 'Lugares encontrados:',
    'fr': 'Lieux trouvés :',
    'it': 'Luoghi trovati:'
  },
  'test_simple.full_json': {
    'pt-BR': 'JSON Completo',
    'en': 'Full JSON',
    'es': 'JSON completo',
    'fr': 'JSON complet',
    'it': 'JSON completo'
  },
  'test_simple.error': {
    'pt-BR': 'Erro: {message}',
    'en': 'Error: {message}',
    'es': 'Error: {message}',
    'fr': 'Erreur : {message}',
    'it': 'Errore: {message}'
  },
  'version.title': {
    'pt-BR': 'PETMOL Versão',
    'en': 'PETMOL Version',
    'es': 'Versión PETMOL',
    'fr': 'Version PETMOL',
    'it': 'Versione PETMOL'
  },
  'version.service': {
    'pt-BR': 'Serviço',
    'en': 'Service',
    'es': 'Servicio',
    'fr': 'Service',
    'it': 'Servizio'
  },
  'version.git_sha': {
    'pt-BR': 'Git SHA',
    'en': 'Git SHA',
    'es': 'Git SHA',
    'fr': 'Git SHA',
    'it': 'Git SHA'
  },
  'version.built_at': {
    'pt-BR': 'Build em',
    'en': 'Built at',
    'es': 'Compilado en',
    'fr': 'Compilé le',
    'it': 'Compilato il'
  },
  'share_manager.alerts.create_emergency_error': {
    'pt-BR': 'Erro ao criar link de emergência',
    'en': 'Failed to create emergency link',
    'es': 'Error al crear el enlace de emergencia',
    'fr': 'Erreur lors de la création du lien d’urgence',
    'it': 'Errore nella creazione del link di emergenza'
  },
  'share_manager.alerts.create_vet_error': {
    'pt-BR': 'Erro ao criar compartilhamento veterinário',
    'en': 'Failed to create vet share',
    'es': 'Error al crear el compartir veterinario',
    'fr': 'Erreur lors de la création du partage vétérinaire',
    'it': 'Errore nella creazione della condivisione veterinaria'
  },
  'share_manager.alerts.copied': {
    'pt-BR': 'Link copiado!',
    'en': 'Link copied!',
    'es': '¡Enlace copiado!',
    'fr': 'Lien copié !',
    'it': 'Link copiato!'
  },
  'share_manager.alerts.revoke_confirm': {
    'pt-BR': 'Tem certeza que deseja revogar este compartilhamento?',
    'en': 'Are you sure you want to revoke this share?',
    'es': '¿Seguro que deseas revocar este compartido?',
    'fr': 'Voulez-vous vraiment révoquer ce partage ?',
    'it': 'Vuoi davvero revocare questa condivisione?'
  },
  'share_manager.alerts.revoke_error': {
    'pt-BR': 'Erro ao revogar',
    'en': 'Failed to revoke',
    'es': 'Error al revocar',
    'fr': 'Erreur lors de la révocation',
    'it': 'Errore nella revoca'
  },
  'share_manager.alerts.renew_error': {
    'pt-BR': 'Erro ao renovar',
    'en': 'Failed to renew',
    'es': 'Error al renovar',
    'fr': 'Erreur lors du renouvellement',
    'it': 'Errore nel rinnovo'
  },
  'share_manager.emergency.title': {
    'pt-BR': 'Links de Emergência',
    'en': 'Emergency links',
    'es': 'Enlaces de emergencia',
    'fr': 'Liens d’urgence',
    'it': 'Link di emergenza'
  },
  'share_manager.actions.create_new': {
    'pt-BR': '+ Criar Novo',
    'en': '+ Create new',
    'es': '+ Crear nuevo',
    'fr': '+ Créer nouveau',
    'it': '+ Crea nuovo'
  },
  'share_manager.actions.copy': {
    'pt-BR': '📋 Copiar',
    'en': '📋 Copy',
    'es': '📋 Copiar',
    'fr': '📋 Copier',
    'it': '📋 Copia'
  },
  'share_manager.actions.revoke': {
    'pt-BR': '🗑️ Revogar',
    'en': '🗑️ Revoke',
    'es': '🗑️ Revocar',
    'fr': '🗑️ Révoquer',
    'it': '🗑️ Revoca'
  },
  'share_manager.actions.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'share_manager.actions.create': {
    'pt-BR': 'Criar',
    'en': 'Create',
    'es': 'Crear',
    'fr': 'Créer',
    'it': 'Crea'
  },
  'share_manager.emergency.empty': {
    'pt-BR': 'Nenhum link de emergência ativo',
    'en': 'No active emergency links',
    'es': 'No hay enlaces de emergencia activos',
    'fr': 'Aucun lien d’urgence actif',
    'it': 'Nessun link di emergenza attivo'
  },
  'share_manager.emergency.views': {
    'pt-BR': '{count} visualizações',
    'en': '{count} views',
    'es': '{count} visualizaciones',
    'fr': '{count} vues',
    'it': '{count} visualizzazioni'
  },
  'share_manager.emergency.expires_at': {
    'pt-BR': 'Expira em',
    'en': 'Expires at',
    'es': 'Expira en',
    'fr': 'Expire à',
    'it': 'Scade il'
  },
  'share_manager.emergency.no_expiration': {
    'pt-BR': '✓ Sem expiração',
    'en': '✓ No expiration',
    'es': '✓ Sin expiración',
    'fr': '✓ Sans expiration',
    'it': '✓ Nessuna scadenza'
  },
  'share_manager.vet.title': {
    'pt-BR': 'Compartilhamentos Veterinários',
    'en': 'Veterinary shares',
    'es': 'Compartidos veterinarios',
    'fr': 'Partages vétérinaires',
    'it': 'Condivisioni veterinarie'
  },
  'share_manager.vet.empty': {
    'pt-BR': 'Nenhum compartilhamento veterinário ativo',
    'en': 'No active veterinary shares',
    'es': 'No hay compartidos veterinarios activos',
    'fr': 'Aucun partage vétérinaire actif',
    'it': 'Nessuna condivisione veterinaria attiva'
  },
  'share_manager.vet.accesses': {
    'pt-BR': '{count} acessos',
    'en': '{count} accesses',
    'es': '{count} accesos',
    'fr': '{count} accès',
    'it': '{count} accessi'
  },
  'share_manager.vet.expires_at': {
    'pt-BR': 'Expira',
    'en': 'Expires',
    'es': 'Expira',
    'fr': 'Expire',
    'it': 'Scade'
  },
  'share_manager.emergency.modal.title': {
    'pt-BR': 'Criar Link de Emergência',
    'en': 'Create emergency link',
    'es': 'Crear enlace de emergencia',
    'fr': 'Créer un lien d’urgence',
    'it': 'Crea link di emergenza'
  },
  'share_manager.emergency.modal.description': {
    'pt-BR': 'Link público com informações básicas do pet para caso ele se perca.',
    'en': 'Public link with basic pet info in case they get lost.',
    'es': 'Enlace público con información básica de la mascota en caso de pérdida.',
    'fr': 'Lien public avec les infos de base de l’animal en cas de perte.',
    'it': 'Link pubblico con info di base dell’animale in caso di smarrimento.'
  },
  'share_manager.vet.modal.title': {
    'pt-BR': 'Compartilhar com Veterinário',
    'en': 'Share with veterinarian',
    'es': 'Compartir con veterinario',
    'fr': 'Partager avec le vétérinaire',
    'it': 'Condividi con il veterinario'
  },
  'share_manager.vet.modal.description': {
    'pt-BR': 'Link temporário (48h) com acesso a histórico médico, vacinas e medicações.',
    'en': 'Temporary link (48h) with access to medical history, vaccines, and medications.',
    'es': 'Enlace temporal (48h) con acceso a historial médico, vacunas y medicaciones.',
    'fr': 'Lien temporaire (48h) avec accès à l’historique médical, vaccins et médicaments.',
    'it': 'Link temporaneo (48h) con accesso a storico medico, vaccini e farmaci.'
  },
  'event_nudge.record.title.vet': {
    'pt-BR': 'Visita veterinária',
    'en': 'Vet visit',
    'es': 'Visita veterinaria',
    'fr': 'Visite vétérinaire',
    'it': 'Visita veterinaria'
  },
  'event_nudge.record.title.service': {
    'pt-BR': 'Visita a serviço pet',
    'en': 'Pet service visit',
    'es': 'Visita a servicio pet',
    'fr': 'Visite de service animalier',
    'it': 'Visita a servizio pet'
  },
  'event_nudge.record.description.with_place': {
    'pt-BR': 'Visita detectada em {place}',
    'en': 'Visit detected at {place}',
    'es': 'Visita detectada en {place}',
    'fr': 'Visite détectée à {place}',
    'it': 'Visita rilevata presso {place}'
  },
  'event_nudge.record.description.auto': {
    'pt-BR': 'Visita detectada automaticamente',
    'en': 'Visit detected automatically',
    'es': 'Visita detectada automáticamente',
    'fr': 'Visite détectée automatiquement',
    'it': 'Visita rilevata automaticamente'
  },
  'event_nudge.notification.title': {
    'pt-BR': '✅ Registro automático salvo',
    'en': '✅ Automatic record saved',
    'es': '✅ Registro automático guardado',
    'fr': '✅ Enregistrement automatique enregistré',
    'it': '✅ Registrazione automatica salvata'
  },
  'event_nudge.notification.body_singular': {
    'pt-BR': 'Visita registrada para seu pet.',
    'en': 'Visit recorded for your pet.',
    'es': 'Visita registrada para tu mascota.',
    'fr': 'Visite enregistrée pour votre animal.',
    'it': 'Visita registrata per il tuo animale.'
  },
  'event_nudge.notification.body_plural': {
    'pt-BR': 'Visita registrada para seus pets.',
    'en': 'Visit recorded for your pets.',
    'es': 'Visita registrada para tus mascotas.',
    'fr': 'Visite enregistrée pour vos animaux.',
    'it': 'Visita registrata per i tuoi animali.'
  },
  'event_nudge.confirmed.title': {
    'pt-BR': '✅ Visita confirmada!',
    'en': '✅ Visit confirmed!',
    'es': '✅ ¡Visita confirmada!',
    'fr': '✅ Visite confirmée !',
    'it': '✅ Visita confermata!'
  },
  'event_nudge.confirmed.details_question': {
    'pt-BR': 'Deseja adicionar detalhes médicos (exames, vacinas, diagnóstico)?',
    'en': 'Would you like to add medical details (exams, vaccines, diagnosis)?',
    'es': '¿Deseas agregar detalles médicos (exámenes, vacunas, diagnóstico)?',
    'fr': 'Souhaitez-vous ajouter des détails médicaux (examens, vaccins, diagnostic) ?',
    'it': 'Vuoi aggiungere dettagli medici (esami, vaccini, diagnosi)?'
  },
  'map.error.load_failed': {
    'pt-BR': 'Google Maps não carregou corretamente',
    'en': 'Google Maps did not load correctly',
    'es': 'Google Maps no se cargó correctamente',
    'fr': 'Google Maps ne s’est pas chargé correctement',
    'it': 'Google Maps non si è caricato correttamente'
  },
  'map.error.init_failed': {
    'pt-BR': 'Erro ao carregar Google Maps',
    'en': 'Error loading Google Maps',
    'es': 'Error al cargar Google Maps',
    'fr': 'Erreur lors du chargement de Google Maps',
    'it': 'Errore nel caricamento di Google Maps'
  },
  'map.user_location': {
    'pt-BR': 'Você está aqui',
    'en': 'You are here',
    'es': 'Estás aquí',
    'fr': 'Vous êtes ici',
    'it': 'Sei qui'
  },
  'map.loading': {
    'pt-BR': 'Carregando mapa...',
    'en': 'Loading map...',
    'es': 'Cargando mapa...',
    'fr': 'Chargement de la carte...',
    'it': 'Caricamento della mappa...'
  },
  'map.legend.user': {
    'pt-BR': 'Você',
    'en': 'You',
    'es': 'Tú',
    'fr': 'Vous',
    'it': 'Tu'
  },
  'handoff.error.title': {
    'pt-BR': 'Ops! Algo deu errado',
    'en': 'Oops! Something went wrong',
    'es': '¡Ups! Algo salió mal',
    'fr': 'Oups ! Quelque chose s\'est mal passé',
    'it': 'Ops! Qualcosa è andato storto'
  },
  'handoff.error.message.invalid_query': {
    'pt-BR': 'Busca inválida. Por favor, tente novamente com um produto pet.',
    'en': 'Invalid search. Please try again with a pet product.',
    'es': 'Búsqueda inválida. Por favor, intenta de nuevo con un producto para mascotas.',
    'fr': 'Recherche invalide. Veuillez réessayer avec un produit pour animaux.',
    'it': 'Ricerca non valida. Riprova con un prodotto per animali.'
  },
  'handoff.error.message.non_pet': {
    'pt-BR': 'Este termo não parece ser relacionado a pets. O PETMOL busca apenas produtos para animais de estimação.',
    'en': 'This term doesn\'t appear to be pet-related. PETMOL only searches for pet products.',
    'es': 'Este término no parece estar relacionado con mascotas. PETMOL solo busca productos para mascotas.',
    'fr': 'Ce terme ne semble pas lié aux animaux. PETMOL ne cherche que des produits pour animaux.',
    'it': 'Questo termine non sembra legato agli animali. PETMOL cerca solo prodotti per animali.'
  },
  'handoff.error.message.invalid_phone': {
    'pt-BR': 'Telefone inválido. Verifique o número e tente novamente.',
    'en': 'Invalid phone number. Please check and try again.',
    'es': 'Teléfono inválido. Verifica el número e inténtalo de nuevo.',
    'fr': 'Numéro de téléphone invalide. Vérifiez et réessayez.',
    'it': 'Numero di telefono non valido. Controlla e riprova.'
  },
  'handoff.error.message.unsafe_redirect': {
    'pt-BR': 'Redirecionamento não autorizado.',
    'en': 'Unauthorized redirect.',
    'es': 'Redirección no autorizada.',
    'fr': 'Redirection non autorisée.',
    'it': 'Reindirizzamento non autorizzato.'
  },
  'handoff.error.message.default': {
    'pt-BR': 'Ocorreu um erro. Por favor, tente novamente.',
    'en': 'An error occurred. Please try again.',
    'es': 'Ocurrió un error. Por favor, inténtalo de nuevo.',
    'fr': 'Une erreur s\'est produite. Veuillez réessayer.',
    'it': 'Si è verificato un errore. Riprova.'
  },
  'handoff.error.search_label': {
    'pt-BR': 'Busca:',
    'en': 'Search:',
    'es': 'Búsqueda:',
    'fr': 'Recherche :',
    'it': 'Ricerca:'
  },
  'handoff.error.suggestions.title': {
    'pt-BR': '🐾 Experimente buscar por:',
    'en': '🐾 Try searching for:',
    'es': '🐾 Prueba buscar:',
    'fr': '🐾 Essayez de rechercher :',
    'it': '🐾 Prova a cercare:'
  },
  'handoff.error.actions.back': {
    'pt-BR': '← Voltar ao PETMOL',
    'en': '← Back to PETMOL',
    'es': '← Volver a PETMOL',
    'fr': '← Retour à PETMOL',
    'it': '← Torna a PETMOL'
  },
  'handoff.error.actions.retry': {
    'pt-BR': '↻ Tentar novamente',
    'en': '↻ Try again',
    'es': '↻ Intentar de nuevo',
    'fr': '↻ Réessayer',
    'it': '↻ Riprova'
  },
  'handoff.error.disclaimer': {
    'pt-BR': 'O PETMOL busca apenas produtos para pets (cães, gatos, pássaros, peixes, etc.). Não vendemos produtos diretamente.',
    'en': 'PETMOL only searches for pet products (dogs, cats, birds, fish, etc.). We don\'t sell products directly.',
    'es': 'PETMOL solo busca productos para mascotas (perros, gatos, aves, peces, etc.). No vendemos productos directamente.',
    'fr': 'PETMOL ne cherche que des produits pour animaux (chiens, chats, oiseaux, poissons, etc.). Nous ne vendons pas directement.',
    'it': 'PETMOL cerca solo prodotti per animali (cani, gatti, uccelli, pesci, ecc.). Non vendiamo prodotti direttamente.'
  },
  'health.page.loading': {
    'pt-BR': 'Carregando...',
    'en': 'Loading...',
    'es': 'Cargando...',
    'fr': 'Chargement...',
    'it': 'Caricamento...'
  },
  'health.page.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'health.page.title': {
    'pt-BR': 'Saúde do Pet',
    'en': 'Pet Health',
    'es': 'Salud de la Mascota',
    'fr': 'Santé de l’animal',
    'it': 'Salute dell’animale'
  },
  'health.page.subtitle': {
    'pt-BR': 'Histórico médico completo: vacinas, exames, receitas e muito mais',
    'en': 'Complete medical history: vaccines, exams, prescriptions and more',
    'es': 'Historial médico completo: vacunas, exámenes, recetas y más',
    'fr': 'Historique médical complet : vaccins, examens, prescriptions et plus',
    'it': 'Storico medico completo: vaccini, esami, prescrizioni e altro'
  },
  'health.page.empty.title': {
    'pt-BR': 'Comece o Histórico de Saúde',
    'en': 'Start the Health History',
    'es': 'Comienza el Historial de Salud',
    'fr': 'Commencez l’historique de santé',
    'it': 'Inizia lo storico della salute'
  },
  'health.page.empty.description': {
    'pt-BR': 'Crie o perfil de saúde do seu pet para armazenar vacinas, exames, receitas médicas e muito mais.',
    'en': 'Create your pet’s health profile to store vaccines, exams, prescriptions and more.',
    'es': 'Crea el perfil de salud de tu mascota para guardar vacunas, exámenes, recetas y más.',
    'fr': 'Créez le profil de santé de votre animal pour stocker vaccins, examens, prescriptions et plus.',
    'it': 'Crea il profilo di salute del tuo animale per salvare vaccini, esami, prescrizioni e altro.'
  },
  'health.page.empty.action': {
    'pt-BR': 'Criar Perfil de Saúde',
    'en': 'Create Health Profile',
    'es': 'Crear Perfil de Salud',
    'fr': 'Créer le profil de santé',
    'it': 'Crea profilo salute'
  },
  'health.page.add_pet': {
    'pt-BR': 'Adicionar Pet',
    'en': 'Add pet',
    'es': 'Agregar mascota',
    'fr': 'Ajouter un animal',
    'it': 'Aggiungi animale'
  },
  'health.page.edit_pet': {
    'pt-BR': 'Editar Pet',
    'en': 'Edit pet',
    'es': 'Editar mascota',
    'fr': 'Modifier l’animal',
    'it': 'Modifica animale'
  },
  'health.page.edit_title': {
    'pt-BR': 'Editar informações do pet',
    'en': 'Edit pet information',
    'es': 'Editar información de la mascota',
    'fr': 'Modifier les informations de l’animal',
    'it': 'Modifica informazioni dell’animale'
  },
  'health.page.edit_subtitle': {
    'pt-BR': 'Atualize dados essenciais de saúde e identificação.',
    'en': 'Update essential health and identification data.',
    'es': 'Actualiza datos esenciales de salud e identificación.',
    'fr': 'Mettez à jour les données de santé et d’identification essentielles.',
    'it': 'Aggiorna i dati essenziali di salute e identificazione.'
  },
  'health.page.update_error': {
    'pt-BR': 'Não foi possível atualizar o pet.',
    'en': 'Could not update the pet.',
    'es': 'No se pudo actualizar la mascota.',
    'fr': 'Impossible de mettre à jour l’animal.',
    'it': 'Impossibile aggiornare l’animale.'
  },
  'health.page.create_error': {
    'pt-BR': 'Erro ao criar perfil de saúde',
    'en': 'Failed to create health profile',
    'es': 'Error al crear el perfil de salud',
    'fr': 'Erreur lors de la création du profil de santé',
    'it': 'Errore durante la creazione del profilo di salute'
  },
  'health.page.delete_confirm': {
    'pt-BR': 'Excluir o perfil de {name}? Esta ação não pode ser desfeita.',
    'en': 'Delete {name}’s profile? This action cannot be undone.',
    'es': '¿Eliminar el perfil de {name}? Esta acción no se puede deshacer.',
    'fr': 'Supprimer le profil de {name} ? Cette action est irréversible.',
    'it': 'Eliminare il profilo di {name}? Questa azione non può essere annullata.'
  },
  'health.page.delete_failed': {
    'pt-BR': 'Não foi possível excluir o perfil.',
    'en': 'Could not delete the profile.',
    'es': 'No se pudo eliminar el perfil.',
    'fr': 'Impossible de supprimer le profil.',
    'it': 'Impossibile eliminare il profilo.'
  },
  'health.share.loading': {
    'pt-BR': 'Carregando histórico médico...',
    'en': 'Loading medical history...',
    'es': 'Cargando historial médico...',
    'fr': 'Chargement de l’historique médical...',
    'it': 'Caricamento della cronologia medica...'
  },
  'health.share.expired.title': {
    'pt-BR': 'QR Code Expirado',
    'en': 'QR Code Expired',
    'es': 'Código QR caducado',
    'fr': 'QR code expiré',
    'it': 'QR code scaduto'
  },
  'health.share.expired.message': {
    'pt-BR': 'Este link de acesso expirou por segurança. Solicite um novo QR code ao tutor do pet.',
    'en': 'This access link has expired for security. Request a new QR code from the pet’s owner.',
    'es': 'Este enlace de acceso expiró por seguridad. Solicita un nuevo código QR al tutor de la mascota.',
    'fr': 'Ce lien d’accès a expiré pour des raisons de sécurité. Demandez un nouveau QR code au tuteur.',
    'it': 'Questo link di accesso è scaduto per sicurezza. Richiedi un nuovo QR code al tutor.'
  },
  'health.share.expired.notice': {
    'pt-BR': '🔒 Os QR codes expiram automaticamente para proteger a privacidade dos dados médicos.',
    'en': '🔒 QR codes expire automatically to protect medical data privacy.',
    'es': '🔒 Los códigos QR caducan automáticamente para proteger la privacidad de los datos médicos.',
    'fr': '🔒 Les QR codes expirent automatiquement pour protéger la confidentialité des données médicales.',
    'it': '🔒 I QR code scadono automaticamente per proteggere la privacy dei dati medici.'
  },
  'health.share.header.title': {
    'pt-BR': 'Histórico Médico Completo',
    'en': 'Full Medical History',
    'es': 'Historial médico completo',
    'fr': 'Historique médical complet',
    'it': 'Storico medico completo'
  },
  'health.share.header.temporary_access': {
    'pt-BR': '🔒 Acesso temporário',
    'en': '🔒 Temporary access',
    'es': '🔒 Acceso temporal',
    'fr': '🔒 Accès temporaire',
    'it': '🔒 Accesso temporaneo'
  },
  'health.share.expires_in': {
    'pt-BR': 'Expira em {minutes} minutos',
    'en': 'Expires in {minutes} minutes',
    'es': 'Expira en {minutes} minutos',
    'fr': 'Expire dans {minutes} minutes',
    'it': 'Scade tra {minutes} minuti'
  },
  'health.share.stats.records': {
    'pt-BR': 'Registros',
    'en': 'Records',
    'es': 'Registros',
    'fr': 'Enregistrements',
    'it': 'Registri'
  },
  'health.share.stats.types': {
    'pt-BR': 'Tipos',
    'en': 'Types',
    'es': 'Tipos',
    'fr': 'Types',
    'it': 'Tipi'
  },
  'health.share.stats.last_visit': {
    'pt-BR': 'Última visita',
    'en': 'Last visit',
    'es': 'Última visita',
    'fr': 'Dernière visite',
    'it': 'Ultima visita'
  },
  'health.share.type.appointment': {
    'pt-BR': 'Consulta',
    'en': 'Appointment',
    'es': 'Consulta',
    'fr': 'Consultation',
    'it': 'Visita'
  },
  'health.share.type.vaccination': {
    'pt-BR': 'Vacinação',
    'en': 'Vaccination',
    'es': 'Vacunación',
    'fr': 'Vaccination',
    'it': 'Vaccinazione'
  },
  'health.share.type.grooming': {
    'pt-BR': 'Banho & Tosa',
    'en': 'Grooming',
    'es': 'Baño y corte',
    'fr': 'Toilettage',
    'it': 'Toelettatura'
  },
  'health.share.type.surgery': {
    'pt-BR': 'Cirurgia',
    'en': 'Surgery',
    'es': 'Cirugía',
    'fr': 'Chirurgie',
    'it': 'Chirurgia'
  },
  'health.share.type.other': {
    'pt-BR': 'Outros',
    'en': 'Other',
    'es': 'Otros',
    'fr': 'Autres',
    'it': 'Altro'
  },
  'health.share.veterinarian_prefix': {
    'pt-BR': 'Dr(a).',
    'en': 'Dr.',
    'es': 'Dr.',
    'fr': 'Dr.',
    'it': 'Dr.'
  },
  'health.share.section.diagnosis': {
    'pt-BR': 'Diagnóstico',
    'en': 'Diagnosis',
    'es': 'Diagnóstico',
    'fr': 'Diagnostic',
    'it': 'Diagnosi'
  },
  'health.share.section.medications': {
    'pt-BR': 'Medicações',
    'en': 'Medications',
    'es': 'Medicaciones',
    'fr': 'Médicaments',
    'it': 'Medicazioni'
  },
  'health.share.section.exams': {
    'pt-BR': 'Exames',
    'en': 'Exams',
    'es': 'Exámenes',
    'fr': 'Examens',
    'it': 'Esami'
  },
  'health.share.section.notes': {
    'pt-BR': 'Observações',
    'en': 'Notes',
    'es': 'Observaciones',
    'fr': 'Observations',
    'it': 'Note'
  },
  'health.share.section.follow_up': {
    'pt-BR': 'Retorno',
    'en': 'Follow-up',
    'es': 'Seguimiento',
    'fr': 'Suivi',
    'it': 'Follow-up'
  },
  'health.share.section.cost': {
    'pt-BR': 'Custo:',
    'en': 'Cost:',
    'es': 'Costo:',
    'fr': 'Coût :',
    'it': 'Costo:'
  },
  'health.share.no_records.title': {
    'pt-BR': 'Nenhum registro ainda',
    'en': 'No records yet',
    'es': 'Aún no hay registros',
    'fr': 'Aucun enregistrement pour le moment',
    'it': 'Nessun record ancora'
  },
  'health.share.no_records.description': {
    'pt-BR': 'O histórico médico de {name} aparecerá aqui quando houver registros.',
    'en': '{name}’s medical history will appear here when there are records.',
    'es': 'El historial médico de {name} aparecerá aquí cuando haya registros.',
    'fr': 'L’historique médical de {name} apparaîtra ici lorsqu’il y aura des enregistrements.',
    'it': 'Lo storico medico di {name} apparirà qui quando ci saranno record.'
  },
  'health.appointments.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'health.appointments.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.appointments.title': {
    'pt-BR': 'Consultas de {name}',
    'en': '{name}’s appointments',
    'es': 'Consultas de {name}',
    'fr': 'Consultations de {name}',
    'it': 'Visite di {name}'
  },
  'health.appointments.subtitle': {
    'pt-BR': 'Histórico e agendamentos',
    'en': 'History and schedules',
    'es': 'Historial y agendas',
    'fr': 'Historique et rendez-vous',
    'it': 'Storico e appuntamenti'
  },
  'health.appointments.form.title.edit': {
    'pt-BR': 'Editar Consulta',
    'en': 'Edit appointment',
    'es': 'Editar consulta',
    'fr': 'Modifier la consultation',
    'it': 'Modifica visita'
  },
  'health.appointments.form.title.new': {
    'pt-BR': 'Nova Consulta',
    'en': 'New appointment',
    'es': 'Nueva consulta',
    'fr': 'Nouvelle consultation',
    'it': 'Nuova visita'
  },
  'health.appointments.form.type': {
    'pt-BR': 'Tipo',
    'en': 'Type',
    'es': 'Tipo',
    'fr': 'Type',
    'it': 'Tipo'
  },
  'health.appointments.form.type.routine': {
    'pt-BR': 'Rotina',
    'en': 'Routine',
    'es': 'Rutina',
    'fr': 'Routine',
    'it': 'Routine'
  },
  'health.appointments.form.type.emergency': {
    'pt-BR': 'Emergência',
    'en': 'Emergency',
    'es': 'Emergencia',
    'fr': 'Urgence',
    'it': 'Emergenza'
  },
  'health.appointments.form.type.vaccination': {
    'pt-BR': 'Vacinação',
    'en': 'Vaccination',
    'es': 'Vacunación',
    'fr': 'Vaccination',
    'it': 'Vaccinazione'
  },
  'health.appointments.form.type.surgery': {
    'pt-BR': 'Cirurgia',
    'en': 'Surgery',
    'es': 'Cirugía',
    'fr': 'Chirurgie',
    'it': 'Chirurgia'
  },
  'health.appointments.form.type.dental': {
    'pt-BR': 'Dental',
    'en': 'Dental',
    'es': 'Dental',
    'fr': 'Dentaire',
    'it': 'Dentale'
  },
  'health.appointments.form.type.grooming': {
    'pt-BR': 'Banho & Tosa',
    'en': 'Grooming',
    'es': 'Baño y corte',
    'fr': 'Toilettage',
    'it': 'Toelettatura'
  },
  'health.appointments.form.type.behavioral': {
    'pt-BR': 'Comportamental',
    'en': 'Behavioral',
    'es': 'Comportamental',
    'fr': 'Comportemental',
    'it': 'Comportamentale'
  },
  'health.appointments.form.type.other': {
    'pt-BR': 'Outro',
    'en': 'Other',
    'es': 'Otro',
    'fr': 'Autre',
    'it': 'Altro'
  },
  'health.appointments.form.date': {
    'pt-BR': 'Data',
    'en': 'Date',
    'es': 'Fecha',
    'fr': 'Date',
    'it': 'Data'
  },
  'health.appointments.form.time': {
    'pt-BR': 'Hora',
    'en': 'Time',
    'es': 'Hora',
    'fr': 'Heure',
    'it': 'Ora'
  },
  'health.appointments.form.veterinarian': {
    'pt-BR': 'Veterinário',
    'en': 'Veterinarian',
    'es': 'Veterinario',
    'fr': 'Vétérinaire',
    'it': 'Veterinario'
  },
  'health.appointments.form.veterinarian_placeholder': {
    'pt-BR': 'Nome do veterinário',
    'en': 'Veterinarian name',
    'es': 'Nombre del veterinario',
    'fr': 'Nom du vétérinaire',
    'it': 'Nome del veterinario'
  },
  'health.appointments.form.clinic': {
    'pt-BR': 'Clínica',
    'en': 'Clinic',
    'es': 'Clínica',
    'fr': 'Clinique',
    'it': 'Clinica'
  },
  'health.appointments.form.clinic_placeholder': {
    'pt-BR': 'Nome da clínica',
    'en': 'Clinic name',
    'es': 'Nombre de la clínica',
    'fr': 'Nom de la clinique',
    'it': 'Nome della clinica'
  },
  'health.appointments.form.address': {
    'pt-BR': 'Endereço',
    'en': 'Address',
    'es': 'Dirección',
    'fr': 'Adresse',
    'it': 'Indirizzo'
  },
  'health.appointments.form.address_placeholder': {
    'pt-BR': 'Endereço da clínica',
    'en': 'Clinic address',
    'es': 'Dirección de la clínica',
    'fr': 'Adresse de la clinique',
    'it': 'Indirizzo della clinica'
  },
  'health.appointments.form.phone': {
    'pt-BR': 'Telefone',
    'en': 'Phone',
    'es': 'Teléfono',
    'fr': 'Téléphone',
    'it': 'Telefono'
  },
  'health.appointments.form.phone_placeholder': {
    'pt-BR': '(31) 99999-9999',
    'en': '(555) 555-5555',
    'es': '(55) 5555-5555',
    'fr': '01 23 45 67 89',
    'it': '02 1234 5678'
  },
  'health.appointments.form.reason': {
    'pt-BR': 'Motivo',
    'en': 'Reason',
    'es': 'Motivo',
    'fr': 'Motif',
    'it': 'Motivo'
  },
  'health.appointments.form.reason_placeholder': {
    'pt-BR': 'Ex: Check-up, vômito, vacina',
    'en': 'Ex: Check-up, vomiting, vaccine',
    'es': 'Ej: chequeo, vómito, vacuna',
    'fr': 'Ex : bilan, vomissements, vaccin',
    'it': 'Es: check-up, vomito, vaccino'
  },
  'health.appointments.form.symptoms': {
    'pt-BR': 'Sintomas',
    'en': 'Symptoms',
    'es': 'Síntomas',
    'fr': 'Symptômes',
    'it': 'Sintomi'
  },
  'health.appointments.form.diagnosis': {
    'pt-BR': 'Diagnóstico',
    'en': 'Diagnosis',
    'es': 'Diagnóstico',
    'fr': 'Diagnostic',
    'it': 'Diagnosi'
  },
  'health.appointments.form.treatment': {
    'pt-BR': 'Tratamento',
    'en': 'Treatment',
    'es': 'Tratamiento',
    'fr': 'Traitement',
    'it': 'Trattamento'
  },
  'health.appointments.form.cost': {
    'pt-BR': 'Custo (R$)',
    'en': 'Cost',
    'es': 'Costo',
    'fr': 'Coût',
    'it': 'Costo'
  },
  'health.appointments.form.follow_up': {
    'pt-BR': 'Retorno',
    'en': 'Follow-up',
    'es': 'Seguimiento',
    'fr': 'Suivi',
    'it': 'Follow-up'
  },
  'health.appointments.form.notes': {
    'pt-BR': 'Observações',
    'en': 'Notes',
    'es': 'Observaciones',
    'fr': 'Observations',
    'it': 'Note'
  },
  'health.appointments.form.completed': {
    'pt-BR': 'Consulta concluída',
    'en': 'Appointment completed',
    'es': 'Consulta completada',
    'fr': 'Consultation terminée',
    'it': 'Visita completata'
  },
  'health.appointments.form.save': {
    'pt-BR': 'Salvar',
    'en': 'Save',
    'es': 'Guardar',
    'fr': 'Enregistrer',
    'it': 'Salva'
  },
  'health.appointments.form.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.appointments.form.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.appointments.empty': {
    'pt-BR': 'Nenhuma consulta registrada ainda.',
    'en': 'No appointments recorded yet.',
    'es': 'Aún no hay consultas registradas.',
    'fr': 'Aucune consultation enregistrée pour le moment.',
    'it': 'Nessuna visita registrata.'
  },
  'health.appointments.status.completed': {
    'pt-BR': 'Concluída',
    'en': 'Completed',
    'es': 'Completada',
    'fr': 'Terminée',
    'it': 'Completata'
  },
  'health.appointments.status.scheduled': {
    'pt-BR': 'Agendada',
    'en': 'Scheduled',
    'es': 'Programada',
    'fr': 'Planifiée',
    'it': 'Programmata'
  },
  'health.appointments.field.symptoms': {
    'pt-BR': 'Sintomas',
    'en': 'Symptoms',
    'es': 'Síntomas',
    'fr': 'Symptômes',
    'it': 'Sintomi'
  },
  'health.appointments.field.diagnosis': {
    'pt-BR': 'Diagnóstico',
    'en': 'Diagnosis',
    'es': 'Diagnóstico',
    'fr': 'Diagnostic',
    'it': 'Diagnosi'
  },
  'health.appointments.field.treatment': {
    'pt-BR': 'Tratamento',
    'en': 'Treatment',
    'es': 'Tratamiento',
    'fr': 'Traitement',
    'it': 'Trattamento'
  },
  'health.appointments.actions.edit': {
    'pt-BR': 'Editar',
    'en': 'Edit',
    'es': 'Editar',
    'fr': 'Modifier',
    'it': 'Modifica'
  },
  'health.appointments.actions.mark_pending': {
    'pt-BR': 'Marcar como pendente',
    'en': 'Mark as pending',
    'es': 'Marcar como pendiente',
    'fr': 'Marquer comme en attente',
    'it': 'Segna come in sospeso'
  },
  'health.appointments.actions.mark_completed': {
    'pt-BR': 'Marcar como concluída',
    'en': 'Mark as completed',
    'es': 'Marcar como completada',
    'fr': 'Marquer comme terminée',
    'it': 'Segna come completata'
  },
  'health.appointments.actions.delete': {
    'pt-BR': 'Excluir',
    'en': 'Delete',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Elimina'
  },
  'health.appointments.confirm_delete': {
    'pt-BR': 'Tem certeza que deseja excluir esta consulta?',
    'en': 'Are you sure you want to delete this appointment?',
    'es': '¿Seguro que deseas eliminar esta consulta?',
    'fr': 'Voulez-vous vraiment supprimer cette consultation ?',
    'it': 'Vuoi davvero eliminare questa visita?'
  },
  'health.exams.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'health.exams.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.exams.title': {
    'pt-BR': 'Exames de {name}',
    'en': '{name}’s exams',
    'es': 'Exámenes de {name}',
    'fr': 'Examens de {name}',
    'it': 'Esami di {name}'
  },
  'health.exams.subtitle': {
    'pt-BR': 'Resultados e laudos',
    'en': 'Results and reports',
    'es': 'Resultados e informes',
    'fr': 'Résultats et rapports',
    'it': 'Risultati e referti'
  },
  'health.exams.form.title.new': {
    'pt-BR': 'Novo Exame',
    'en': 'New exam',
    'es': 'Nuevo examen',
    'fr': 'Nouvel examen',
    'it': 'Nuovo esame'
  },
  'health.exams.form.type': {
    'pt-BR': 'Tipo',
    'en': 'Type',
    'es': 'Tipo',
    'fr': 'Type',
    'it': 'Tipo'
  },
  'health.exams.form.type.blood': {
    'pt-BR': 'Sangue',
    'en': 'Blood',
    'es': 'Sangre',
    'fr': 'Sang',
    'it': 'Sangue'
  },
  'health.exams.form.type.urine': {
    'pt-BR': 'Urina',
    'en': 'Urine',
    'es': 'Orina',
    'fr': 'Urine',
    'it': 'Urina'
  },
  'health.exams.form.type.feces': {
    'pt-BR': 'Fezes',
    'en': 'Feces',
    'es': 'Heces',
    'fr': 'Selles',
    'it': 'Feci'
  },
  'health.exams.form.type.xray': {
    'pt-BR': 'Raio-X',
    'en': 'X-ray',
    'es': 'Rayos X',
    'fr': 'Radiographie',
    'it': 'Radiografia'
  },
  'health.exams.form.type.ultrasound': {
    'pt-BR': 'Ultrassom',
    'en': 'Ultrasound',
    'es': 'Ultrasonido',
    'fr': 'Échographie',
    'it': 'Ecografia'
  },
  'health.exams.form.type.ecg': {
    'pt-BR': 'ECG',
    'en': 'ECG',
    'es': 'ECG',
    'fr': 'ECG',
    'it': 'ECG'
  },
  'health.exams.form.type.biopsy': {
    'pt-BR': 'Biópsia',
    'en': 'Biopsy',
    'es': 'Biopsia',
    'fr': 'Biopsie',
    'it': 'Biopsia'
  },
  'health.exams.form.type.other': {
    'pt-BR': 'Outro',
    'en': 'Other',
    'es': 'Otro',
    'fr': 'Autre',
    'it': 'Altro'
  },
  'health.exams.form.name': {
    'pt-BR': 'Nome do Exame',
    'en': 'Exam name',
    'es': 'Nombre del examen',
    'fr': 'Nom de l’examen',
    'it': 'Nome dell’esame'
  },
  'health.exams.form.name_placeholder': {
    'pt-BR': 'Ex: Hemograma completo',
    'en': 'Ex: Complete blood count',
    'es': 'Ej: Hemograma completo',
    'fr': 'Ex : NFS complète',
    'it': 'Es: Emocromo completo'
  },
  'health.exams.form.date': {
    'pt-BR': 'Data',
    'en': 'Date',
    'es': 'Fecha',
    'fr': 'Date',
    'it': 'Data'
  },
  'health.exams.form.veterinarian': {
    'pt-BR': 'Veterinário',
    'en': 'Veterinarian',
    'es': 'Veterinario',
    'fr': 'Vétérinaire',
    'it': 'Veterinario'
  },
  'health.exams.form.veterinarian_placeholder': {
    'pt-BR': 'Nome do veterinário',
    'en': 'Veterinarian name',
    'es': 'Nombre del veterinario',
    'fr': 'Nom du vétérinaire',
    'it': 'Nome del veterinario'
  },
  'health.exams.form.clinic': {
    'pt-BR': 'Clínica',
    'en': 'Clinic',
    'es': 'Clínica',
    'fr': 'Clinique',
    'it': 'Clinica'
  },
  'health.exams.form.clinic_placeholder': {
    'pt-BR': 'Nome da clínica',
    'en': 'Clinic name',
    'es': 'Nombre de la clínica',
    'fr': 'Nom de la clinique',
    'it': 'Nome della clinica'
  },
  'health.exams.form.cost': {
    'pt-BR': 'Custo (R$)',
    'en': 'Cost',
    'es': 'Costo',
    'fr': 'Coût',
    'it': 'Costo'
  },
  'health.exams.form.results': {
    'pt-BR': 'Resultados',
    'en': 'Results',
    'es': 'Resultados',
    'fr': 'Résultats',
    'it': 'Risultati'
  },
  'health.exams.form.diagnosis': {
    'pt-BR': 'Diagnóstico',
    'en': 'Diagnosis',
    'es': 'Diagnóstico',
    'fr': 'Diagnostic',
    'it': 'Diagnosi'
  },
  'health.exams.form.recommendations': {
    'pt-BR': 'Recomendações',
    'en': 'Recommendations',
    'es': 'Recomendaciones',
    'fr': 'Recommandations',
    'it': 'Raccomandazioni'
  },
  'health.exams.form.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.exams.form.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.exams.empty': {
    'pt-BR': 'Nenhum exame registrado ainda.',
    'en': 'No exams recorded yet.',
    'es': 'Aún no hay exámenes registrados.',
    'fr': 'Aucun examen enregistré pour le moment.',
    'it': 'Nessun esame registrato.'
  },
  'health.exams.field.results': {
    'pt-BR': 'Resultados',
    'en': 'Results',
    'es': 'Resultados',
    'fr': 'Résultats',
    'it': 'Risultati'
  },
  'health.exams.field.diagnosis': {
    'pt-BR': 'Diagnóstico',
    'en': 'Diagnosis',
    'es': 'Diagnóstico',
    'fr': 'Diagnostic',
    'it': 'Diagnosi'
  },
  'health.exams.field.recommendations': {
    'pt-BR': 'Recomendações',
    'en': 'Recommendations',
    'es': 'Recomendaciones',
    'fr': 'Recommandations',
    'it': 'Raccomandazioni'
  },
  'health.exams.actions.delete': {
    'pt-BR': 'Excluir',
    'en': 'Delete',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Elimina'
  },
  'health.exams.confirm_delete': {
    'pt-BR': 'Tem certeza que deseja excluir este exame?',
    'en': 'Are you sure you want to delete this exam?',
    'es': '¿Seguro que deseas eliminar este examen?',
    'fr': 'Voulez-vous vraiment supprimer cet examen ?',
    'it': 'Vuoi davvero eliminare questo esame?'
  },
  'health.prescriptions.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'health.prescriptions.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.prescriptions.title': {
    'pt-BR': 'Medicamentos de {name}',
    'en': '{name}’s medications',
    'es': 'Medicamentos de {name}',
    'fr': 'Médicaments de {name}',
    'it': 'Farmaci di {name}'
  },
  'health.prescriptions.subtitle': {
    'pt-BR': 'Receitas e medicamentos prescritos',
    'en': 'Prescriptions and prescribed medications',
    'es': 'Recetas y medicamentos prescritos',
    'fr': 'Ordonnances et médicaments prescrits',
    'it': 'Prescrizioni e farmaci prescritti'
  },
  'health.prescriptions.filter.active_only': {
    'pt-BR': 'Mostrar apenas ativos',
    'en': 'Show active only',
    'es': 'Mostrar solo activos',
    'fr': 'Afficher uniquement les actifs',
    'it': 'Mostra solo attivi'
  },
  'health.prescriptions.form.title.edit': {
    'pt-BR': 'Editar Medicamento',
    'en': 'Edit medication',
    'es': 'Editar medicamento',
    'fr': 'Modifier le médicament',
    'it': 'Modifica farmaco'
  },
  'health.prescriptions.form.title.new': {
    'pt-BR': 'Novo Medicamento',
    'en': 'New medication',
    'es': 'Nuevo medicamento',
    'fr': 'Nouveau médicament',
    'it': 'Nuovo farmaco'
  },
  'health.prescriptions.form.name': {
    'pt-BR': 'Nome do Medicamento',
    'en': 'Medication name',
    'es': 'Nombre del medicamento',
    'fr': 'Nom du médicament',
    'it': 'Nome del farmaco'
  },
  'health.prescriptions.form.name_placeholder': {
    'pt-BR': 'Ex: Amoxicilina, Rimadyl',
    'en': 'Ex: Amoxicillin, Rimadyl',
    'es': 'Ej: Amoxicilina, Rimadyl',
    'fr': 'Ex : Amoxicilline, Rimadyl',
    'it': 'Es: Amoxicillina, Rimadyl'
  },
  'health.prescriptions.form.type': {
    'pt-BR': 'Tipo',
    'en': 'Type',
    'es': 'Tipo',
    'fr': 'Type',
    'it': 'Tipo'
  },
  'health.prescriptions.form.type.pill': {
    'pt-BR': 'Comprimido',
    'en': 'Pill',
    'es': 'Comprimido',
    'fr': 'Comprimé',
    'it': 'Compressa'
  },
  'health.prescriptions.form.type.liquid': {
    'pt-BR': 'Líquido/Xarope',
    'en': 'Liquid/Syrup',
    'es': 'Líquido/Jarabe',
    'fr': 'Liquide/Sirop',
    'it': 'Liquido/Sciroppo'
  },
  'health.prescriptions.form.type.injection': {
    'pt-BR': 'Injeção',
    'en': 'Injection',
    'es': 'Inyección',
    'fr': 'Injection',
    'it': 'Iniezione'
  },
  'health.prescriptions.form.type.topical': {
    'pt-BR': 'Tópico (pomada/creme)',
    'en': 'Topical (ointment/cream)',
    'es': 'Tópico (pomada/crema)',
    'fr': 'Topique (pommade/crème)',
    'it': 'Topico (pomata/crema)'
  },
  'health.prescriptions.form.type.other': {
    'pt-BR': 'Outro',
    'en': 'Other',
    'es': 'Otro',
    'fr': 'Autre',
    'it': 'Altro'
  },
  'health.prescriptions.form.dosage': {
    'pt-BR': 'Dosagem',
    'en': 'Dosage',
    'es': 'Dosis',
    'fr': 'Dosage',
    'it': 'Dosaggio'
  },
  'health.prescriptions.form.dosage_placeholder': {
    'pt-BR': 'Ex: 10mg, 2 comprimidos',
    'en': 'Ex: 10mg, 2 pills',
    'es': 'Ej: 10mg, 2 comprimidos',
    'fr': 'Ex : 10mg, 2 comprimés',
    'it': 'Es: 10mg, 2 compresse'
  },
  'health.prescriptions.form.frequency': {
    'pt-BR': 'Frequência',
    'en': 'Frequency',
    'es': 'Frecuencia',
    'fr': 'Fréquence',
    'it': 'Frequenza'
  },
  'health.prescriptions.form.frequency_placeholder': {
    'pt-BR': 'Ex: 2x ao dia, a cada 12h',
    'en': 'Ex: twice a day, every 12h',
    'es': 'Ej: 2 veces al día, cada 12h',
    'fr': 'Ex : 2 fois par jour, toutes les 12h',
    'it': 'Es: 2 volte al giorno, ogni 12h'
  },
  'health.prescriptions.form.duration': {
    'pt-BR': 'Duração',
    'en': 'Duration',
    'es': 'Duración',
    'fr': 'Durée',
    'it': 'Durata'
  },
  'health.prescriptions.form.duration_placeholder': {
    'pt-BR': 'Ex: 7 dias, uso contínuo',
    'en': 'Ex: 7 days, ongoing use',
    'es': 'Ej: 7 días, uso continuo',
    'fr': 'Ex : 7 jours, usage continu',
    'it': 'Es: 7 giorni, uso continuo'
  },
  'health.prescriptions.form.start_date': {
    'pt-BR': 'Data Início',
    'en': 'Start date',
    'es': 'Fecha de inicio',
    'fr': 'Date de début',
    'it': 'Data di inizio'
  },
  'health.prescriptions.form.end_date': {
    'pt-BR': 'Data Fim (opcional)',
    'en': 'End date (optional)',
    'es': 'Fecha de fin (opcional)',
    'fr': 'Date de fin (optionnelle)',
    'it': 'Data di fine (opzionale)'
  },
  'health.prescriptions.form.veterinarian': {
    'pt-BR': 'Veterinário',
    'en': 'Veterinarian',
    'es': 'Veterinario',
    'fr': 'Vétérinaire',
    'it': 'Veterinario'
  },
  'health.prescriptions.form.clinic': {
    'pt-BR': 'Clínica',
    'en': 'Clinic',
    'es': 'Clínica',
    'fr': 'Clinique',
    'it': 'Clinica'
  },
  'health.prescriptions.form.reason': {
    'pt-BR': 'Motivo da Prescrição',
    'en': 'Prescription reason',
    'es': 'Motivo de la prescripción',
    'fr': 'Motif de l’ordonnance',
    'it': 'Motivo della prescrizione'
  },
  'health.prescriptions.form.reason_placeholder': {
    'pt-BR': 'Ex: Infecção respiratória, dor pós-cirúrgica',
    'en': 'Ex: Respiratory infection, post-surgery pain',
    'es': 'Ej: Infección respiratoria, dolor postoperatorio',
    'fr': 'Ex : Infection respiratoire, douleur post-opératoire',
    'it': 'Es: Infezione respiratoria, dolore post-operatorio'
  },
  'health.prescriptions.form.notes': {
    'pt-BR': 'Observações',
    'en': 'Notes',
    'es': 'Observaciones',
    'fr': 'Observations',
    'it': 'Note'
  },
  'health.prescriptions.form.notes_placeholder': {
    'pt-BR': 'Instruções especiais, efeitos colaterais, etc.',
    'en': 'Special instructions, side effects, etc.',
    'es': 'Instrucciones especiales, efectos secundarios, etc.',
    'fr': 'Instructions spéciales, effets secondaires, etc.',
    'it': 'Istruzioni speciali, effetti collaterali, ecc.'
  },
  'health.prescriptions.form.active': {
    'pt-BR': 'Em uso ativo',
    'en': 'Active use',
    'es': 'En uso activo',
    'fr': 'En usage actif',
    'it': 'Uso attivo'
  },
  'health.prescriptions.form.reminders': {
    'pt-BR': '🔔 Habilitar lembretes',
    'en': '🔔 Enable reminders',
    'es': '🔔 Habilitar recordatorios',
    'fr': '🔔 Activer les rappels',
    'it': '🔔 Abilita promemoria'
  },
  'health.prescriptions.form.save': {
    'pt-BR': 'Salvar Alterações',
    'en': 'Save changes',
    'es': 'Guardar cambios',
    'fr': 'Enregistrer les modifications',
    'it': 'Salva modifiche'
  },
  'health.prescriptions.form.add': {
    'pt-BR': 'Adicionar Medicamento',
    'en': 'Add medication',
    'es': 'Agregar medicamento',
    'fr': 'Ajouter un médicament',
    'it': 'Aggiungi farmaco'
  },
  'health.prescriptions.form.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.prescriptions.empty.active_title': {
    'pt-BR': 'Nenhum medicamento ativo',
    'en': 'No active medications',
    'es': 'No hay medicamentos activos',
    'fr': 'Aucun médicament actif',
    'it': 'Nessun farmaco attivo'
  },
  'health.prescriptions.empty.all_title': {
    'pt-BR': 'Nenhuma receita registrada',
    'en': 'No prescriptions recorded',
    'es': 'No hay recetas registradas',
    'fr': 'Aucune ordonnance enregistrée',
    'it': 'Nessuna prescrizione registrata'
  },
  'health.prescriptions.empty.active_subtitle': {
    'pt-BR': 'Desmarque o filtro para ver histórico completo',
    'en': 'Disable the filter to see full history',
    'es': 'Desactiva el filtro para ver el historial completo',
    'fr': 'Désactivez le filtre pour voir l’historique complet',
    'it': 'Disattiva il filtro per vedere lo storico completo'
  },
  'health.prescriptions.empty.all_subtitle': {
    'pt-BR': 'Adicione o primeiro medicamento',
    'en': 'Add the first medication',
    'es': 'Agrega el primer medicamento',
    'fr': 'Ajoutez le premier médicament',
    'it': 'Aggiungi il primo farmaco'
  },
  'health.prescriptions.badge.active': {
    'pt-BR': '✓ ATIVO',
    'en': '✓ ACTIVE',
    'es': '✓ ACTIVO',
    'fr': '✓ ACTIF',
    'it': '✓ ATTIVO'
  },
  'health.prescriptions.badge.reminders': {
    'pt-BR': '🔔 Lembretes',
    'en': '🔔 Reminders',
    'es': '🔔 Recordatorios',
    'fr': '🔔 Rappels',
    'it': '🔔 Promemoria'
  },
  'health.prescriptions.field.reason': {
    'pt-BR': 'Motivo',
    'en': 'Reason',
    'es': 'Motivo',
    'fr': 'Motif',
    'it': 'Motivo'
  },
  'health.prescriptions.field.start': {
    'pt-BR': 'Início',
    'en': 'Start',
    'es': 'Inicio',
    'fr': 'Début',
    'it': 'Inizio'
  },
  'health.prescriptions.field.end': {
    'pt-BR': 'Fim',
    'en': 'End',
    'es': 'Fin',
    'fr': 'Fin',
    'it': 'Fine'
  },
  'health.prescriptions.field.vet_prefix': {
    'pt-BR': 'Dr(a).',
    'en': 'Dr.',
    'es': 'Dr.',
    'fr': 'Dr.',
    'it': 'Dr.'
  },
  'health.prescriptions.actions.deactivate': {
    'pt-BR': 'Desativar',
    'en': 'Deactivate',
    'es': 'Desactivar',
    'fr': 'Désactiver',
    'it': 'Disattiva'
  },
  'health.prescriptions.actions.reactivate': {
    'pt-BR': 'Reativar',
    'en': 'Reactivate',
    'es': 'Reactivar',
    'fr': 'Réactiver',
    'it': 'Riattiva'
  },
  'health.prescriptions.actions.edit': {
    'pt-BR': 'Editar',
    'en': 'Edit',
    'es': 'Editar',
    'fr': 'Modifier',
    'it': 'Modifica'
  },
  'health.prescriptions.actions.delete': {
    'pt-BR': 'Excluir',
    'en': 'Delete',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Elimina'
  },
  'health.prescriptions.confirm_delete': {
    'pt-BR': 'Tem certeza que deseja excluir esta receita?',
    'en': 'Are you sure you want to delete this prescription?',
    'es': '¿Seguro que deseas eliminar esta receta?',
    'fr': 'Voulez-vous vraiment supprimer cette ordonnance ?',
    'it': 'Vuoi davvero eliminare questa prescrizione?'
  },
  'health.vaccines.back': {
    'pt-BR': 'Voltar',
    'en': 'Back',
    'es': 'Volver',
    'fr': 'Retour',
    'it': 'Indietro'
  },
  'health.vaccines.add': {
    'pt-BR': 'Adicionar',
    'en': 'Add',
    'es': 'Agregar',
    'fr': 'Ajouter',
    'it': 'Aggiungi'
  },
  'health.vaccines.title': {
    'pt-BR': 'Vacinas de {name}',
    'en': '{name}’s vaccines',
    'es': 'Vacunas de {name}',
    'fr': 'Vaccins de {name}',
    'it': 'Vaccini di {name}'
  },
  'health.vaccines.subtitle': {
    'pt-BR': 'Histórico completo de vacinação',
    'en': 'Complete vaccination history',
    'es': 'Historial completo de vacunación',
    'fr': 'Historique complet de vaccination',
    'it': 'Storico completo delle vaccinazioni'
  },
  'health.vaccines.form.title.edit': {
    'pt-BR': 'Editar Vacina',
    'en': 'Edit vaccine',
    'es': 'Editar vacuna',
    'fr': 'Modifier le vaccin',
    'it': 'Modifica vaccino'
  },
  'health.vaccines.form.title.new': {
    'pt-BR': 'Nova Vacina',
    'en': 'New vaccine',
    'es': 'Nueva vacuna',
    'fr': 'Nouveau vaccin',
    'it': 'Nuovo vaccino'
  },
  'health.vaccines.form.type': {
    'pt-BR': 'Tipo de Vacina',
    'en': 'Vaccine type',
    'es': 'Tipo de vacuna',
    'fr': 'Type de vaccin',
    'it': 'Tipo di vaccino'
  },
  'health.vaccines.form.type.rabies': {
    'pt-BR': 'Raiva',
    'en': 'Rabies',
    'es': 'Rabia',
    'fr': 'Rage',
    'it': 'Rabbia'
  },
  'health.vaccines.form.type.distemper': {
    'pt-BR': 'Cinomose',
    'en': 'Distemper',
    'es': 'Moquillo',
    'fr': 'Maladie de Carré',
    'it': 'Cimurro'
  },
  'health.vaccines.form.type.parvovirus': {
    'pt-BR': 'Parvovirose',
    'en': 'Parvovirus',
    'es': 'Parvovirosis',
    'fr': 'Parvovirose',
    'it': 'Parvovirosi'
  },
  'health.vaccines.form.type.bordetella': {
    'pt-BR': 'Bordetella',
    'en': 'Bordetella',
    'es': 'Bordetella',
    'fr': 'Bordetella',
    'it': 'Bordetella'
  },
  'health.vaccines.form.type.leptospirosis': {
    'pt-BR': 'Leptospirose',
    'en': 'Leptospirosis',
    'es': 'Leptospirosis',
    'fr': 'Leptospirose',
    'it': 'Leptospirosi'
  },
  'health.vaccines.form.type.feline_leukemia': {
    'pt-BR': 'Leucemia Felina',
    'en': 'Feline leukemia',
    'es': 'Leucemia felina',
    'fr': 'Leucémie féline',
    'it': 'Leucemia felina'
  },
  'health.vaccines.form.type.feline_distemper': {
    'pt-BR': 'Panleucopenia Felina',
    'en': 'Feline panleukopenia',
    'es': 'Panleucopenia felina',
    'fr': 'Panleucopénie féline',
    'it': 'Panleucopenia felina'
  },
  'health.vaccines.form.type.other': {
    'pt-BR': 'Outra',
    'en': 'Other',
    'es': 'Otra',
    'fr': 'Autre',
    'it': 'Altra'
  },
  'health.vaccines.form.name': {
    'pt-BR': 'Nome da Vacina',
    'en': 'Vaccine name',
    'es': 'Nombre de la vacuna',
    'fr': 'Nom du vaccin',
    'it': 'Nome del vaccino'
  },
  'health.vaccines.form.name_placeholder': {
    'pt-BR': 'Ex: V10, V8, Antirrábica',
    'en': 'Ex: DHPP, Rabies',
    'es': 'Ej: V10, Antirrábica',
    'fr': 'Ex : DHPP, Rage',
    'it': 'Es: V10, Rabbia'
  },
  'health.vaccines.form.date_administered': {
    'pt-BR': 'Data Aplicada',
    'en': 'Date administered',
    'es': 'Fecha aplicada',
    'fr': 'Date d’administration',
    'it': 'Data di somministrazione'
  },
  'health.vaccines.form.next_dose': {
    'pt-BR': 'Próxima Dose (Reforço)',
    'en': 'Next dose (booster)',
    'es': 'Próxima dosis (refuerzo)',
    'fr': 'Prochaine dose (rappel)',
    'it': 'Prossima dose (richiamo)'
  },
  'health.vaccines.form.veterinarian': {
    'pt-BR': 'Veterinário',
    'en': 'Veterinarian',
    'es': 'Veterinario',
    'fr': 'Vétérinaire',
    'it': 'Veterinario'
  },
  'health.vaccines.form.veterinarian_placeholder': {
    'pt-BR': 'Nome do veterinário',
    'en': 'Veterinarian name',
    'es': 'Nombre del veterinario',
    'fr': 'Nom du vétérinaire',
    'it': 'Nome del veterinario'
  },
  'health.vaccines.form.clinic': {
    'pt-BR': 'Clínica',
    'en': 'Clinic',
    'es': 'Clínica',
    'fr': 'Clinique',
    'it': 'Clinica'
  },
  'health.vaccines.form.clinic_placeholder': {
    'pt-BR': 'Nome da clínica',
    'en': 'Clinic name',
    'es': 'Nombre de la clínica',
    'fr': 'Nom de la clinique',
    'it': 'Nome della clinica'
  },
  'health.vaccines.form.batch': {
    'pt-BR': 'Lote (Batch)',
    'en': 'Batch',
    'es': 'Lote',
    'fr': 'Lot',
    'it': 'Lotto'
  },
  'health.vaccines.form.batch_placeholder': {
    'pt-BR': 'Número do lote',
    'en': 'Batch number',
    'es': 'Número de lote',
    'fr': 'Numéro de lot',
    'it': 'Numero di lotto'
  },
  'health.vaccines.form.notes': {
    'pt-BR': 'Observações',
    'en': 'Notes',
    'es': 'Observaciones',
    'fr': 'Observations',
    'it': 'Note'
  },
  'health.vaccines.form.notes_placeholder': {
    'pt-BR': 'Reações, observações, etc.',
    'en': 'Reactions, notes, etc.',
    'es': 'Reacciones, observaciones, etc.',
    'fr': 'Réactions, observations, etc.',
    'it': 'Reazioni, note, ecc.'
  },
  'health.vaccines.form.save': {
    'pt-BR': 'Salvar Alterações',
    'en': 'Save changes',
    'es': 'Guardar cambios',
    'fr': 'Enregistrer les modifications',
    'it': 'Salva modifiche'
  },
  'health.vaccines.form.read_card': {
    'pt-BR': 'Ler carteirinha',
    'en': 'Read vaccine card',
    'es': 'Leer cartilla',
    'fr': 'Lire le carnet',
    'it': 'Leggi libretto'
  },
  'health.vaccines.delete_confirm': {
    'pt-BR': 'Tem certeza que deseja excluir a vacina "{name}"?',
    'en': 'Are you sure you want to delete the vaccine "{name}"?',
    'es': '¿Está seguro de que desea eliminar la vacuna "{name}"?',
    'fr': 'Êtes-vous sûr de vouloir supprimer le vaccin "{name}"?',
    'it': 'Sei sicuro di voler eliminare il vaccino "{name}"?'
  },
  'health.vaccines.error_save': {
    'pt-BR': 'Erro ao salvar vacina. Tente novamente.',
    'en': 'Error saving vaccine. Please try again.',
    'es': 'Error al guardar vacuna. Intente de nuevo.',
    'fr': 'Erreur lors de l\'enregistrement du vaccin. Réessayez.',
    'it': 'Errore nel salvare il vaccino. Riprova.'
  },
  'health.vaccines.error_delete': {
    'pt-BR': 'Erro ao excluir vacina. Tente novamente.',
    'en': 'Error deleting vaccine. Please try again.',
    'es': 'Error al eliminar vacuna. Intente de nuevo.',
    'fr': 'Erreur lors de la suppression du vaccin. Réessayez.',
    'it': 'Errore nell\'eliminare il vaccino. Riprova.'
  },
  'health.vaccines.no_vaccines_detected': {
    'pt-BR': 'Nenhuma vacina foi detectada na imagem. Tente uma foto mais clara.',
    'en': 'No vaccines detected in the image. Try a clearer photo.',
    'es': 'No se detectaron vacunas en la imagen. Intente con una foto más clara.',
    'fr': 'Aucun vaccin détecté dans l\'image. Essayez une photo plus claire.',
    'it': 'Nessun vaccino rilevato nell\'immagine. Prova con una foto più chiara.'
  },
  'health.vaccines.title_edit': {
    'pt-BR': 'Editar vacina',
    'en': 'Edit vaccine',
    'es': 'Editar vacuna',
    'fr': 'Modifier le vaccin',
    'it': 'Modifica vaccino'
  },
  'health.vaccines.title_delete': {
    'pt-BR': 'Excluir vacina',
    'en': 'Delete vaccine',
    'es': 'Eliminar vacuna',
    'fr': 'Supprimer le vaccin',
    'it': 'Elimina vaccino'
  },
  'health.vaccines.form.add': {
    'pt-BR': 'Adicionar Vacina',
    'en': 'Add vaccine',
    'es': 'Agregar vacuna',
    'fr': 'Ajouter un vaccin',
    'it': 'Aggiungi vaccino'
  },
  'health.vaccines.form.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.vaccines.empty.title': {
    'pt-BR': 'Nenhuma vacina registrada',
    'en': 'No vaccines recorded',
    'es': 'No hay vacunas registradas',
    'fr': 'Aucun vaccin enregistré',
    'it': 'Nessun vaccino registrato'
  },
  'health.vaccines.empty.subtitle': {
    'pt-BR': 'Adicione a primeira vacina do seu pet',
    'en': 'Add your pet’s first vaccine',
    'es': 'Agrega la primera vacuna de tu mascota',
    'fr': 'Ajoutez le premier vaccin de votre animal',
    'it': 'Aggiungi il primo vaccino del tuo animale'
  },
  'health.vaccines.badge.upcoming': {
    'pt-BR': '⚠️ Reforço Próximo',
    'en': '⚠️ Booster due soon',
    'es': '⚠️ Refuerzo próximo',
    'fr': '⚠️ Rappel bientôt',
    'it': '⚠️ Richiamo in arrivo'
  },
  'health.vaccines.field.administered': {
    'pt-BR': 'Aplicada em',
    'en': 'Administered on',
    'es': 'Aplicada el',
    'fr': 'Administrée le',
    'it': 'Somministrata il'
  },
  'health.vaccines.field.next_dose': {
    'pt-BR': 'Próxima dose',
    'en': 'Next dose',
    'es': 'Próxima dosis',
    'fr': 'Prochaine dose',
    'it': 'Prossima dose'
  },
  'health.vaccines.field.days_left': {
    'pt-BR': '{days} dias',
    'en': '{days} days',
    'es': '{days} días',
    'fr': '{days} jours',
    'it': '{days} giorni'
  },
  'health.vaccines.field.vet_prefix': {
    'pt-BR': 'Dr(a).',
    'en': 'Dr.',
    'es': 'Dr.',
    'fr': 'Dr.',
    'it': 'Dr.'
  },
  'health.vaccines.field.batch': {
    'pt-BR': 'Lote',
    'en': 'Batch',
    'es': 'Lote',
    'fr': 'Lot',
    'it': 'Lotto'
  },
  'health.vaccines.actions.edit': {
    'pt-BR': 'Editar',
    'en': 'Edit',
    'es': 'Editar',
    'fr': 'Modifier',
    'it': 'Modifica'
  },
  'health.vaccines.actions.delete': {
    'pt-BR': 'Excluir',
    'en': 'Delete',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Elimina'
  },
  'health.vaccines.confirm_delete': {
    'pt-BR': 'Tem certeza que deseja excluir esta vacina?',
    'en': 'Are you sure you want to delete this vaccine?',
    'es': '¿Seguro que deseas eliminar esta vacuna?',
    'fr': 'Voulez-vous vraiment supprimer ce vaccin ?',
    'it': 'Vuoi davvero eliminare questo vaccino?'
  },
  'health.walks.disabled.title': {
    'pt-BR': 'Passeios desativados',
    'en': 'Walks disabled',
    'es': 'Paseos desactivados',
    'fr': 'Promenades désactivées',
    'it': 'Passeggiate disattivate'
  },
  'health.walks.disabled.subtitle': {
    'pt-BR': 'Esta funcionalidade foi removida do MVP.',
    'en': 'This feature was removed from the MVP.',
    'es': 'Esta funcionalidad fue eliminada del MVP.',
    'fr': 'Cette fonctionnalité a été retirée du MVP.',
    'it': 'Questa funzionalità è stata rimossa dall’MVP.'
  },
  'health.walks.disabled.back': {
    'pt-BR': 'Voltar à Saúde',
    'en': 'Back to Health',
    'es': 'Volver a Salud',
    'fr': 'Retour à la santé',
    'it': 'Torna alla salute'
  },
  'health.walks.back': {
    'pt-BR': 'Voltar à Saúde',
    'en': 'Back to Health',
    'es': 'Volver a Salud',
    'fr': 'Retour à la santé',
    'it': 'Torna alla salute'
  },
  'health.walks.title': {
    'pt-BR': 'Passeios de {name}',
    'en': '{name}’s walks',
    'es': 'Paseos de {name}',
    'fr': 'Promenades de {name}',
    'it': 'Passeggiate di {name}'
  },
  'health.walks.subtitle': {
    'pt-BR': 'Registro de atividades e exercícios diários',
    'en': 'Daily activity and exercise log',
    'es': 'Registro de actividades y ejercicio diario',
    'fr': 'Journal d’activité et d’exercice quotidien',
    'it': 'Registro attività ed esercizi quotidiani'
  },
  'health.walks.pet_label': {
    'pt-BR': 'Pet',
    'en': 'Pet',
    'es': 'Mascota',
    'fr': 'Animal',
    'it': 'Animale'
  },
  'health.walks.progress.goal_met': {
    'pt-BR': '✅ Meta Atingida!',
    'en': '✅ Goal achieved!',
    'es': '✅ ¡Meta alcanzada!',
    'fr': '✅ Objectif atteint !',
    'it': '✅ Obiettivo raggiunto!'
  },
  'health.walks.progress.today': {
    'pt-BR': '🎯 Progresso de Hoje',
    'en': '🎯 Today’s progress',
    'es': '🎯 Progreso de hoy',
    'fr': '🎯 Progrès du jour',
    'it': '🎯 Progressi di oggi'
  },
  'health.walks.progress.walks': {
    'pt-BR': 'Passeios',
    'en': 'Walks',
    'es': 'Paseos',
    'fr': 'Promenades',
    'it': 'Passeggiate'
  },
  'health.walks.progress.minutes': {
    'pt-BR': 'Minutos',
    'en': 'Minutes',
    'es': 'Minutos',
    'fr': 'Minutes',
    'it': 'Minuti'
  },
  'health.walks.progress.km': {
    'pt-BR': 'km',
    'en': 'km',
    'es': 'km',
    'fr': 'km',
    'it': 'km'
  },
  'health.walks.progress.goals': {
    'pt-BR': '⚙️ Metas',
    'en': '⚙️ Goals',
    'es': '⚙️ Metas',
    'fr': '⚙️ Objectifs',
    'it': '⚙️ Obiettivi'
  },
  'health.walks.goals.title': {
    'pt-BR': 'Definir Metas de Atividade',
    'en': 'Set activity goals',
    'es': 'Definir metas de actividad',
    'fr': 'Définir les objectifs d’activité',
    'it': 'Imposta obiettivi di attività'
  },
  'health.walks.goals.walks_per_day': {
    'pt-BR': 'Passeios por dia',
    'en': 'Walks per day',
    'es': 'Paseos por día',
    'fr': 'Promenades par jour',
    'it': 'Passeggiate al giorno'
  },
  'health.walks.goals.minutes_per_day': {
    'pt-BR': 'Minutos por dia',
    'en': 'Minutes per day',
    'es': 'Minutos por día',
    'fr': 'Minutes par jour',
    'it': 'Minuti al giorno'
  },
  'health.walks.goals.weekly_distance': {
    'pt-BR': 'Distância semanal (km)',
    'en': 'Weekly distance (km)',
    'es': 'Distancia semanal (km)',
    'fr': 'Distance hebdomadaire (km)',
    'it': 'Distanza settimanale (km)'
  },
  'health.walks.goals.save': {
    'pt-BR': 'Salvar Metas',
    'en': 'Save goals',
    'es': 'Guardar metas',
    'fr': 'Enregistrer les objectifs',
    'it': 'Salva obiettivi'
  },
  'health.walks.goals.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.walks.week.title': {
    'pt-BR': '📊 Estatísticas dos Últimos 7 Dias',
    'en': '📊 Last 7 days statistics',
    'es': '📊 Estadísticas de los últimos 7 días',
    'fr': '📊 Statistiques des 7 derniers jours',
    'it': '📊 Statistiche degli ultimi 7 giorni'
  },
  'health.walks.week.walks': {
    'pt-BR': 'Passeios',
    'en': 'Walks',
    'es': 'Paseos',
    'fr': 'Promenades',
    'it': 'Passeggiate'
  },
  'health.walks.week.minutes': {
    'pt-BR': 'Minutos',
    'en': 'Minutes',
    'es': 'Minutos',
    'fr': 'Minutes',
    'it': 'Minuti'
  },
  'health.walks.week.km_total': {
    'pt-BR': 'km totais',
    'en': 'km total',
    'es': 'km totales',
    'fr': 'km au total',
    'it': 'km totali'
  },
  'health.walks.week.average': {
    'pt-BR': 'Média/dia',
    'en': 'Average/day',
    'es': 'Promedio/día',
    'fr': 'Moyenne/jour',
    'it': 'Media/giorno'
  },
  'health.walks.week.favorite_place': {
    'pt-BR': 'Lugar favorito',
    'en': 'Favorite place',
    'es': 'Lugar favorito',
    'fr': 'Lieu préféré',
    'it': 'Luogo preferito'
  },
  'health.walks.actions.add_walk': {
    'pt-BR': 'Registrar Passeio',
    'en': 'Log walk',
    'es': 'Registrar paseo',
    'fr': 'Enregistrer une promenade',
    'it': 'Registra passeggiata'
  },
  'health.walks.actions.edit': {
    'pt-BR': 'Editar',
    'en': 'Edit',
    'es': 'Editar',
    'fr': 'Modifier',
    'it': 'Modifica'
  },
  'health.walks.actions.delete': {
    'pt-BR': 'Excluir',
    'en': 'Delete',
    'es': 'Eliminar',
    'fr': 'Supprimer',
    'it': 'Elimina'
  },
  'health.walks.form.title.edit': {
    'pt-BR': 'Editar Passeio',
    'en': 'Edit walk',
    'es': 'Editar paseo',
    'fr': 'Modifier la promenade',
    'it': 'Modifica passeggiata'
  },
  'health.walks.form.title.new': {
    'pt-BR': 'Novo Passeio',
    'en': 'New walk',
    'es': 'Nuevo paseo',
    'fr': 'Nouvelle promenade',
    'it': 'Nuova passeggiata'
  },
  'health.walks.form.date': {
    'pt-BR': 'Data',
    'en': 'Date',
    'es': 'Fecha',
    'fr': 'Date',
    'it': 'Data'
  },
  'health.walks.form.time': {
    'pt-BR': 'Horário',
    'en': 'Time',
    'es': 'Hora',
    'fr': 'Heure',
    'it': 'Ora'
  },
  'health.walks.form.duration': {
    'pt-BR': 'Duração (minutos)',
    'en': 'Duration (minutes)',
    'es': 'Duración (minutos)',
    'fr': 'Durée (minutes)',
    'it': 'Durata (minuti)'
  },
  'health.walks.form.duration_placeholder': {
    'pt-BR': 'Ex: 30',
    'en': 'Ex: 30',
    'es': 'Ej: 30',
    'fr': 'Ex : 30',
    'it': 'Es: 30'
  },
  'health.walks.form.distance': {
    'pt-BR': 'Distância (km)',
    'en': 'Distance (km)',
    'es': 'Distancia (km)',
    'fr': 'Distance (km)',
    'it': 'Distanza (km)'
  },
  'health.walks.form.distance_placeholder': {
    'pt-BR': 'Ex: 2.5',
    'en': 'Ex: 2.5',
    'es': 'Ej: 2.5',
    'fr': 'Ex : 2.5',
    'it': 'Es: 2.5'
  },
  'health.walks.form.activity_type': {
    'pt-BR': 'Tipo de Atividade',
    'en': 'Activity type',
    'es': 'Tipo de actividad',
    'fr': 'Type d’activité',
    'it': 'Tipo di attività'
  },
  'health.walks.form.activity.walk': {
    'pt-BR': '🚶 Caminhada',
    'en': '🚶 Walk',
    'es': '🚶 Caminata',
    'fr': '🚶 Marche',
    'it': '🚶 Passeggiata'
  },
  'health.walks.form.activity.run': {
    'pt-BR': '🏃 Corrida',
    'en': '🏃 Run',
    'es': '🏃 Carrera',
    'fr': '🏃 Course',
    'it': '🏃 Corsa'
  },
  'health.walks.form.activity.play': {
    'pt-BR': '🎾 Brincadeira',
    'en': '🎾 Play',
    'es': '🎾 Juego',
    'fr': '🎾 Jeu',
    'it': '🎾 Gioco'
  },
  'health.walks.form.activity.training': {
    'pt-BR': '🎓 Treino',
    'en': '🎓 Training',
    'es': '🎓 Entrenamiento',
    'fr': '🎓 Entraînement',
    'it': '🎓 Allenamento'
  },
  'health.walks.form.activity.other': {
    'pt-BR': '🐾 Outro',
    'en': '🐾 Other',
    'es': '🐾 Otro',
    'fr': '🐾 Autre',
    'it': '🐾 Altro'
  },
  'health.walks.form.intensity': {
    'pt-BR': 'Intensidade',
    'en': 'Intensity',
    'es': 'Intensidad',
    'fr': 'Intensité',
    'it': 'Intensità'
  },
  'health.walks.form.intensity.light': {
    'pt-BR': '😌 Leve',
    'en': '😌 Light',
    'es': '😌 Leve',
    'fr': '😌 Légère',
    'it': '😌 Leggera'
  },
  'health.walks.form.intensity.moderate': {
    'pt-BR': '😊 Moderada',
    'en': '😊 Moderate',
    'es': '😊 Moderada',
    'fr': '😊 Modérée',
    'it': '😊 Moderata'
  },
  'health.walks.form.intensity.intense': {
    'pt-BR': '💪 Intensa',
    'en': '💪 Intense',
    'es': '💪 Intensa',
    'fr': '💪 Intense',
    'it': '💪 Intensa'
  },
  'health.walks.form.location': {
    'pt-BR': 'Local',
    'en': 'Location',
    'es': 'Lugar',
    'fr': 'Lieu',
    'it': 'Luogo'
  },
  'health.walks.form.location_placeholder': {
    'pt-BR': 'Ex: Parque Central',
    'en': 'Ex: Central Park',
    'es': 'Ej: Parque Central',
    'fr': 'Ex : Parc Central',
    'it': 'Es: Parco Centrale'
  },
  'health.walks.form.weather': {
    'pt-BR': 'Clima',
    'en': 'Weather',
    'es': 'Clima',
    'fr': 'Météo',
    'it': 'Meteo'
  },
  'health.walks.form.weather_placeholder': {
    'pt-BR': 'Ex: Ensolarado, Chuvoso',
    'en': 'Ex: Sunny, Rainy',
    'es': 'Ej: Soleado, Lluvioso',
    'fr': 'Ex : Ensoleillé, Pluvieux',
    'it': 'Es: Soleggiato, Piovoso'
  },
  'health.walks.form.behavior': {
    'pt-BR': 'Comportamento',
    'en': 'Behavior',
    'es': 'Comportamiento',
    'fr': 'Comportement',
    'it': 'Comportamento'
  },
  'health.walks.form.behavior_placeholder': {
    'pt-BR': 'Como o pet se comportou? Energia, obediência, etc.',
    'en': 'How did the pet behave? Energy, obedience, etc.',
    'es': '¿Cómo se comportó la mascota? Energía, obediencia, etc.',
    'fr': 'Comment l’animal s’est-il comporté ? Énergie, obéissance, etc.',
    'it': 'Come si è comportato l’animale? Energia, obbedienza, ecc.'
  },
  'health.walks.form.incidents': {
    'pt-BR': 'Incidentes',
    'en': 'Incidents',
    'es': 'Incidentes',
    'fr': 'Incidents',
    'it': 'Incidenti'
  },
  'health.walks.form.incidents_placeholder': {
    'pt-BR': 'Algum problema? Brigas, machucados, etc.',
    'en': 'Any issues? Fights, injuries, etc.',
    'es': '¿Algún problema? Peleas, lesiones, etc.',
    'fr': 'Des soucis ? Bagarres, blessures, etc.',
    'it': 'Problemi? Risse, ferite, ecc.'
  },
  'health.walks.form.poop': {
    'pt-BR': '💩 Fez cocô',
    'en': '💩 Pooped',
    'es': '💩 Hizo popó',
    'fr': '💩 A fait ses besoins',
    'it': '💩 Ha fatto la cacca'
  },
  'health.walks.form.pee': {
    'pt-BR': '💧 Fez xixi',
    'en': '💧 Peed',
    'es': '💧 Hizo pipí',
    'fr': '💧 A fait pipi',
    'it': '💧 Ha fatto pipì'
  },
  'health.walks.form.save': {
    'pt-BR': 'Salvar Alterações',
    'en': 'Save changes',
    'es': 'Guardar cambios',
    'fr': 'Enregistrer les modifications',
    'it': 'Salva modifiche'
  },
  'health.walks.form.add': {
    'pt-BR': 'Registrar Passeio',
    'en': 'Log walk',
    'es': 'Registrar paseo',
    'fr': 'Enregistrer une promenade',
    'it': 'Registra passeggiata'
  },
  'health.walks.form.cancel': {
    'pt-BR': 'Cancelar',
    'en': 'Cancel',
    'es': 'Cancelar',
    'fr': 'Annuler',
    'it': 'Annulla'
  },
  'health.walks.history.title': {
    'pt-BR': '📅 Histórico de Passeios',
    'en': '📅 Walk history',
    'es': '📅 Historial de paseos',
    'fr': '📅 Historique des promenades',
    'it': '📅 Storico passeggiate'
  },
  'health.walks.history.empty_title': {
    'pt-BR': 'Nenhum passeio registrado',
    'en': 'No walks recorded',
    'es': 'No hay paseos registrados',
    'fr': 'Aucune promenade enregistrée',
    'it': 'Nessuna passeggiata registrata'
  },
  'health.walks.history.empty_subtitle': {
    'pt-BR': 'Registre o primeiro passeio do dia!',
    'en': 'Log the first walk of the day!',
    'es': '¡Registra el primer paseo del día!',
    'fr': 'Enregistrez la première promenade du jour !',
    'it': 'Registra la prima passeggiata del giorno!'
  },
  'health.walks.history.at': {
    'pt-BR': 'às',
    'en': 'at',
    'es': 'a las',
    'fr': 'à',
    'it': 'alle'
  },
  'health.walks.history.intensity.light': {
    'pt-BR': 'Leve',
    'en': 'Light',
    'es': 'Leve',
    'fr': 'Légère',
    'it': 'Leggera'
  },
  'health.walks.history.intensity.moderate': {
    'pt-BR': 'Moderada',
    'en': 'Moderate',
    'es': 'Moderada',
    'fr': 'Modérée',
    'it': 'Moderata'
  },
  'health.walks.history.intensity.intense': {
    'pt-BR': 'Intensa',
    'en': 'Intense',
    'es': 'Intensa',
    'fr': 'Intense',
    'it': 'Intensa'
  },
  'health.walks.history.minutes': {
    'pt-BR': 'min',
    'en': 'min',
    'es': 'min',
    'fr': 'min',
    'it': 'min'
  },
  'health.walks.history.km': {
    'pt-BR': 'km',
    'en': 'km',
    'es': 'km',
    'fr': 'km',
    'it': 'km'
  },
  'health.walks.history.behavior': {
    'pt-BR': 'Comportamento',
    'en': 'Behavior',
    'es': 'Comportamiento',
    'fr': 'Comportement',
    'it': 'Comportamento'
  },
  'health.walks.history.incidents': {
    'pt-BR': 'Incidentes',
    'en': 'Incidents',
    'es': 'Incidentes',
    'fr': 'Incidents',
    'it': 'Incidenti'
  },
  'health.walks.confirm_delete': {
    'pt-BR': 'Excluir este passeio?',
    'en': 'Delete this walk?',
    'es': '¿Eliminar este paseo?',
    'fr': 'Supprimer cette promenade ?',
    'it': 'Eliminare questa passeggiata?'
  },

  // Pet Form
  'pet_form.step': {
    'pt-BR': 'Passo {step} de {total}', 'en': 'Step {step} of {total}',
    'es': 'Paso {step} de {total}', 'fr': 'Étape {step} sur {total}',
    'it': 'Passo {step} di {total}'
  },
  'pet_form.photo_optional': {
    'pt-BR': 'Foto (opcional)', 'en': 'Photo (optional)',
    'es': 'Foto (opcional)', 'fr': 'Photo (optionnel)',
    'it': 'Foto (opzionale)'
  },
  'pet_form.add_photo': {
    'pt-BR': '📸 Adicionar foto', 'en': '📸 Add photo',
    'es': '📸 Añadir foto', 'fr': '📸 Ajouter photo',
    'it': '📸 Aggiungi foto'
  },
  'pet_form.change_photo': {
    'pt-BR': '🔄 Trocar foto', 'en': '🔄 Change photo',
    'es': '🔄 Cambiar foto', 'fr': '🔄 Changer photo',
    'it': '🔄 Cambia foto'
  },
  'pet_form.name_label': {
    'pt-BR': 'Nome do pet', 'en': 'Pet name',
    'es': 'Nombre de la mascota', 'fr': 'Nom de l\'animal',
    'it': 'Nome dell\'animale'
  },
  'pet_form.name_placeholder': {
    'pt-BR': 'Ex: Bolt, Luna, Thor...', 'en': 'Ex: Max, Bella, Charlie...',
    'es': 'Ej: Max, Luna, Thor...', 'fr': 'Ex: Max, Luna, Thor...',
    'it': 'Es: Max, Luna, Thor...'
  },
  'pet_form.species_label': {
    'pt-BR': 'Espécie', 'en': 'Species',
    'es': 'Especie', 'fr': 'Espèce',
    'it': 'Specie'
  },
  'pet_form.species_dog': {
    'pt-BR': '🐕 Cão', 'en': '🐕 Dog',
    'es': '🐕 Perro', 'fr': '🐕 Chien',
    'it': '🐕 Cane'
  },
  'pet_form.species_cat': {
    'pt-BR': '🐱 Gato', 'en': '🐱 Cat',
    'es': '🐱 Gato', 'fr': '🐱 Chat',
    'it': '🐱 Gatto'
  },
  'pet_form.species_bird': {
    'pt-BR': '🐦 Pássaro', 'en': '🐦 Bird',
    'es': '🐦 Pájaro', 'fr': '🐦 Oiseau',
    'it': '🐦 Uccello'
  },
  'pet_form.species_fish': {
    'pt-BR': '🐠 Peixe', 'en': '🐠 Fish',
    'es': '🐠 Pez', 'fr': '🐠 Poisson',
    'it': '🐠 Pesce'
  },
  'pet_form.species_rabbit': {
    'pt-BR': '🐰 Coelho', 'en': '🐰 Rabbit',
    'es': '🐰 Conejo', 'fr': '🐰 Lapin',
    'it': '🐰 Coniglio'
  },
  'pet_form.species_hamster': {
    'pt-BR': '🐹 Hamster', 'en': '🐹 Hamster',
    'es': '🐹 Hámster', 'fr': '🐹 Hamster',
    'it': '🐹 Criceto'
  },
  'pet_form.species_other': {
    'pt-BR': '🐾 Outro', 'en': '🐾 Other',
    'es': '🐾 Otro', 'fr': '🐾 Autre',
    'it': '🐾 Altro'
  },
  'pet_form.continue': {
    'pt-BR': 'Continuar', 'en': 'Continue',
    'es': 'Continuar', 'fr': 'Continuer',
    'it': 'Continua'
  },
  'pet_form.back': {
    'pt-BR': '← Voltar', 'en': '← Back',
    'es': '← Volver', 'fr': '← Retour',
    'it': '← Indietro'
  },
  'pet_form.finish': {
    'pt-BR': '✓ Concluir', 'en': '✓ Finish',
    'es': '✓ Finalizar', 'fr': '✓ Terminer',
    'it': '✓ Completa'
  },
  'pet_form.sex_label': {
    'pt-BR': 'Sexo', 'en': 'Sex',
    'es': 'Sexo', 'fr': 'Sexe',
    'it': 'Sesso'
  },
  'pet_form.sex_male': {
    'pt-BR': 'Macho', 'en': 'Male',
    'es': 'Macho', 'fr': 'Mâle',
    'it': 'Maschio'
  },
  'pet_form.sex_female': {
    'pt-BR': 'Fêmea', 'en': 'Female',
    'es': 'Hembra', 'fr': 'Femelle',
    'it': 'Femmina'
  },
  'pet_form.neutered_label': {
    'pt-BR': 'Castrado', 'en': 'Neutered',
    'es': 'Castrado', 'fr': 'Stérilisé',
    'it': 'Sterilizzato'
  },
  'pet_form.neutered_hint': {
    'pt-BR': 'Ative se o pet é castrado', 'en': 'Check if pet is neutered',
    'es': 'Activar si la mascota está castrada', 'fr': 'Cochez si l\'animal est stérilisé',
    'it': 'Attiva se l\'animale è sterilizzato'
  },
  'onboarding.validation.photo_too_large': {
    'pt-BR': 'Foto muito grande! Max 5MB.',
    'en': 'Photo too large! Max 5MB.',
    'es': '¡Foto demasiado grande! Máx 5MB.',
    'fr': 'Photo trop grande ! Max 5 Mo.',
    'it': 'Foto troppo grande! Max 5MB.'
  },
  'onboarding.validation.invalid_email': {
    'pt-BR': 'E-mail inválido',
    'en': 'Invalid email',
    'es': 'Email inválido',
    'fr': 'Email invalide',
    'it': 'Email non valida'
  },
  'onboarding.validation.invalid_phone': {
    'pt-BR': 'Telefone inválido',
    'en': 'Invalid phone',
    'es': 'Teléfono inválido',
    'fr': 'Téléphone invalide',
    'it': 'Telefono non valido'
  },
  'onboarding.welcome.title': {
    'pt-BR': 'Bem-vindo ao PETMOL!',
    'en': 'Welcome to PETMOL!',
    'es': '¡Bienvenido a PETMOL!',
    'fr': 'Bienvenue sur PETMOL !',
    'it': 'Benvenuto su PETMOL!'
  },
  'onboarding.welcome.subtitle': {
    'pt-BR': 'Vamos começar com seus dados básicos',
    'en': 'Let’s start with your basic info',
    'es': 'Comencemos con tus datos básicos',
    'fr': 'Commençons par vos informations de base',
    'it': 'Iniziamo con le tue informazioni di base'
  },
  'onboarding.owner.name_label': {
    'pt-BR': 'Seu nome',
    'en': 'Your name',
    'es': 'Tu nombre',
    'fr': 'Votre nom',
    'it': 'Il tuo nome'
  },
  'onboarding.owner.name_placeholder': {
    'pt-BR': 'Ex: Maria Silva',
    'en': 'E.g. John Doe',
    'es': 'Ej: María Silva',
    'fr': 'Ex : Marie Dupont',
    'it': 'Es: Mario Rossi'
  },
  'onboarding.owner.phone_label': {
    'pt-BR': 'Seu telefone',
    'en': 'Your phone',
    'es': 'Tu teléfono',
    'fr': 'Votre téléphone',
    'it': 'Il tuo telefono'
  },
  'onboarding.owner.whatsapp_label': {
    'pt-BR': 'WhatsApp',
    'en': 'WhatsApp',
    'es': 'WhatsApp',
    'fr': 'WhatsApp',
    'it': 'WhatsApp'
  },
  'onboarding.owner.whatsapp_hint': {
    'pt-BR': 'Usar este número para mensagens',
    'en': 'Use this number for messages',
    'es': 'Usar este número para mensajes',
    'fr': 'Utiliser ce numéro pour les messages',
    'it': 'Usa questo numero per i messaggi'
  },
  'onboarding.owner.email_label': {
    'pt-BR': 'E-mail (opcional)',
    'en': 'Email (optional)',
    'es': 'Email (opcional)',
    'fr': 'Email (optionnel)',
    'it': 'Email (opzionale)'
  },
  'onboarding.owner.email_placeholder': {
    'pt-BR': 'seu@email.com',
    'en': 'you@email.com',
    'es': 'tu@email.com',
    'fr': 'vous@email.com',
    'it': 'tu@email.com'
  },
  'onboarding.owner.cep_label': {
    'pt-BR': 'CEP',
    'en': 'ZIP code',
    'es': 'Código postal',
    'fr': 'Code postal',
    'it': 'CAP'
  },
  'onboarding.owner.cep_placeholder': {
    'pt-BR': '00000-000',
    'en': 'ZIP code',
    'es': 'Código postal',
    'fr': 'Code postal',
    'it': 'CAP'
  },
  'onboarding.owner.cep_lookup': {
    'pt-BR': 'Buscar CEP',
    'en': 'Lookup',
    'es': 'Buscar',
    'fr': 'Rechercher',
    'it': 'Cerca'
  },
  'onboarding.owner.cep_loading': {
    'pt-BR': 'Buscando...',
    'en': 'Searching...',
    'es': 'Buscando...',
    'fr': 'Recherche...',
    'it': 'Ricerca...'
  },
  'onboarding.owner.cep_invalid': {
    'pt-BR': 'CEP inválido',
    'en': 'Invalid ZIP code',
    'es': 'Código postal inválido',
    'fr': 'Code postal invalide',
    'it': 'CAP non valido'
  },
  'onboarding.owner.cep_not_found': {
    'pt-BR': 'CEP não encontrado',
    'en': 'ZIP code not found',
    'es': 'Código postal no encontrado',
    'fr': 'Code postal introuvable',
    'it': 'CAP non trovato'
  },
  'onboarding.owner.cep_error': {
    'pt-BR': 'Erro ao buscar CEP',
    'en': 'Failed to lookup ZIP code',
    'es': 'Error al buscar código postal',
    'fr': 'Erreur lors de la recherche du code postal',
    'it': 'Errore nella ricerca del CAP'
  },
  'onboarding.owner.street_label': {
    'pt-BR': 'Rua',
    'en': 'Street',
    'es': 'Calle',
    'fr': 'Rue',
    'it': 'Via'
  },
  'onboarding.owner.street_placeholder': {
    'pt-BR': 'Ex: Rua das Flores',
    'en': 'E.g. Main St',
    'es': 'Ej: Calle Principal',
    'fr': 'Ex : Rue Principale',
    'it': 'Es: Via Principale'
  },
  'onboarding.owner.number_label': {
    'pt-BR': 'Número',
    'en': 'Number',
    'es': 'Número',
    'fr': 'Numéro',
    'it': 'Numero'
  },
  'onboarding.owner.number_placeholder': {
    'pt-BR': 'Ex: 123',
    'en': 'E.g. 123',
    'es': 'Ej: 123',
    'fr': 'Ex : 123',
    'it': 'Es: 123'
  },
  'onboarding.owner.complement_label': {
    'pt-BR': 'Complemento',
    'en': 'Complement',
    'es': 'Complemento',
    'fr': 'Complément',
    'it': 'Complemento'
  },
  'onboarding.owner.complement_placeholder': {
    'pt-BR': 'Apto, bloco, etc. (opcional)',
    'en': 'Apartment, suite (optional)',
    'es': 'Apto, bloque (opcional)',
    'fr': 'Appartement (optionnel)',
    'it': 'Appartamento (opzionale)'
  },
  'onboarding.owner.neighborhood_label': {
    'pt-BR': 'Bairro',
    'en': 'Neighborhood',
    'es': 'Barrio',
    'fr': 'Quartier',
    'it': 'Quartiere'
  },
  'onboarding.owner.neighborhood_placeholder': {
    'pt-BR': 'Ex: Centro',
    'en': 'E.g. Downtown',
    'es': 'Ej: Centro',
    'fr': 'Ex : Centre',
    'it': 'Es: Centro'
  },
  'onboarding.owner.city_label': {
    'pt-BR': 'Cidade',
    'en': 'City',
    'es': 'Ciudad',
    'fr': 'Ville',
    'it': 'Città'
  },
  'onboarding.owner.city_placeholder': {
    'pt-BR': 'Ex: Belo Horizonte',
    'en': 'E.g. New York',
    'es': 'Ej: Ciudad de México',
    'fr': 'Ex : Paris',
    'it': 'Es: Milano'
  },
  'onboarding.owner.state_label': {
    'pt-BR': 'Estado',
    'en': 'State',
    'es': 'Estado',
    'fr': 'État',
    'it': 'Stato'
  },
  'onboarding.owner.state_placeholder': {
    'pt-BR': 'Ex: MG',
    'en': 'E.g. NY',
    'es': 'Ej: DF',
    'fr': 'Ex : IDF',
    'it': 'Es: MI'
  },
  'onboarding.owner.country_label': {
    'pt-BR': 'País',
    'en': 'Country',
    'es': 'País',
    'fr': 'Pays',
    'it': 'Paese'
  },
  'onboarding.owner.country_placeholder': {
    'pt-BR': 'Ex: Brasil',
    'en': 'E.g. Brazil',
    'es': 'Ej: Brasil',
    'fr': 'Ex : Brésil',
    'it': 'Es: Brasile'
  },
  'onboarding.actions.continue': {
    'pt-BR': 'Continuar →',
    'en': 'Continue →',
    'es': 'Continuar →',
    'fr': 'Continuer →',
    'it': 'Continua →'
  },
  'onboarding.pet.title': {
    'pt-BR': 'Agora, seu PET!',
    'en': 'Now, your PET!',
    'es': '¡Ahora, tu PET!',
    'fr': 'Maintenant, votre PET !',
    'it': 'Ora, il tuo PET!'
  },
  'onboarding.pet.subtitle': {
    'pt-BR': 'Conte-nos sobre seu melhor amigo',
    'en': 'Tell us about your best friend',
    'es': 'Cuéntanos sobre tu mejor amigo',
    'fr': 'Parlez-nous de votre meilleur ami',
    'it': 'Raccontaci del tuo migliore amico'
  },
  'onboarding.pet.add_photo': {
    'pt-BR': 'Adicionar foto',
    'en': 'Add photo',
    'es': 'Añadir foto',
    'fr': 'Ajouter une photo',
    'it': 'Aggiungi foto'
  },
  'onboarding.pet.photo_optional': {
    'pt-BR': 'Opcional • Max 5MB',
    'en': 'Optional • Max 5MB',
    'es': 'Opcional • Máx 5MB',
    'fr': 'Optionnel • Max 5 Mo',
    'it': 'Opzionale • Max 5MB'
  },
  'onboarding.pet.sex_label': {
    'pt-BR': 'Sexo',
    'en': 'Sex',
    'es': 'Sexo',
    'fr': 'Sexe',
    'it': 'Sesso'
  },
  'onboarding.pet.sex_male': {
    'pt-BR': '♂️ Macho',
    'en': '♂️ Male',
    'es': '♂️ Macho',
    'fr': '♂️ Mâle',
    'it': '♂️ Maschio'
  },
  'onboarding.pet.sex_female': {
    'pt-BR': '♀️ Fêmea',
    'en': '♀️ Female',
    'es': '♀️ Hembra',
    'fr': '♀️ Femelle',
    'it': '♀️ Femmina'
  },
  'onboarding.pet.breed_select': {
    'pt-BR': 'Selecione uma raça',
    'en': 'Select a breed',
    'es': 'Selecciona una raza',
    'fr': 'Sélectionnez une race',
    'it': 'Seleziona una razza'
  },
  'onboarding.pet.breed_other_placeholder': {
    'pt-BR': 'Ex: Calopsita, Papagaio...',
    'en': 'E.g. Cockatiel, Parrot...',
    'es': 'Ej: Calopsita, Loro...',
    'fr': 'Ex : Calopsitte, Perroquet...',
    'it': 'Es: Calopsitta, Pappagallo...'
  },

  // Pet Information Display
  'pet.species.dog': {
    'pt-BR': 'Cachorro',
    'en': 'Dog',
    'es': 'Perro',
    'fr': 'Chien',
    'it': 'Cane'
  },
  'pet.species.cat': {
    'pt-BR': 'Gato',
    'en': 'Cat',
    'es': 'Gato',
    'fr': 'Chat',
    'it': 'Gatto'
  },
  'pet.species.generic': {
    'pt-BR': 'Pet',
    'en': 'Pet',
    'es': 'Mascota',
    'fr': 'Animal',
    'it': 'Animale'
  },
  'pet.sex.male': {
    'pt-BR': 'Macho',
    'en': 'Male',
    'es': 'Macho',
    'fr': 'Mâle',
    'it': 'Maschio'
  },
  'pet.sex.female': {
    'pt-BR': 'Fêmea',
    'en': 'Female',
    'es': 'Hembra',
    'fr': 'Femelle',
    'it': 'Femmina'
  },
  'pet.neutered.yes': {
    'pt-BR': 'Castrado',
    'en': 'Neutered',
    'es': 'Castrado',
    'fr': 'Castré',
    'it': 'Castrato'
  },
  'pet.neutered.no': {
    'pt-BR': 'Não castrado',
    'en': 'Not neutered',
    'es': 'No castrado',
    'fr': 'Non castré',
    'it': 'Non castrato'
  },
  'pet.error_save': {
    'pt-BR': 'Erro ao salvar pet. Tente novamente.',
    'en': 'Error saving pet. Please try again.',
    'es': 'Error al guardar mascota. Intente de nuevo.',
    'fr': 'Erreur lors de l\'enregistrement. Réessayez.',
    'it': 'Errore nel salvare l\'animale. Riprova.'
  },

  // Common Age Units
  'common.age.month': {
    'pt-BR': 'mês',
    'en': 'month',
    'es': 'mes',
    'fr': 'mois',
    'it': 'mese'
  },
  'common.age.months': {
    'pt-BR': 'meses',
    'en': 'months',
    'es': 'meses',
    'fr': 'mois',
    'it': 'mesi'
  },
  'common.age.year': {
    'pt-BR': 'ano',
    'en': 'year',
    'es': 'año',
    'fr': 'an',
    'it': 'anno'
  },
  'common.age.years': {
    'pt-BR': 'anos',
    'en': 'years',
    'es': 'años',
    'fr': 'ans',
    'it': 'anni'
  },

  // Upload
  'upload.preview': {
    'pt-BR': 'Pré-visualização', 'en': 'Preview',
    'es': 'Vista previa', 'fr': 'Aperçu', 'it': 'Anteprima'
  },
  'upload.what_is_this': {
    'pt-BR': 'O que é este documento?', 'en': 'What is this document?',
    'es': '¿Qué es este documento?', 'fr': 'Qu\'est-ce que ce document?',
    'it': 'Cos\'è questo documento?'
  },
  'upload.type_exam': {
    'pt-BR': 'Exame', 'en': 'Exam',
    'es': 'Examen', 'fr': 'Examen', 'it': 'Esame'
  },
  'upload.type_vaccine': {
    'pt-BR': 'Vacina', 'en': 'Vaccine',
    'es': 'Vacuna', 'fr': 'Vaccin', 'it': 'Vaccino'
  },
  'upload.type_diagnosis': {
    'pt-BR': 'Diagnóstico', 'en': 'Diagnosis',
    'es': 'Diagnóstico', 'fr': 'Diagnostic', 'it': 'Diagnosi'
  },
  'upload.type_prescription': {
    'pt-BR': 'Receita', 'en': 'Prescription',
    'es': 'Receta', 'fr': 'Ordonnance', 'it': 'Prescrizione'
  },
  'upload.type_other': {
    'pt-BR': 'Outro', 'en': 'Other',
    'es': 'Otro', 'fr': 'Autre', 'it': 'Altro'
  },
  'upload.title_optional': {
    'pt-BR': 'Título (opcional)', 'en': 'Title (optional)',
    'es': 'Título (opcional)', 'fr': 'Titre (optionnel)',
    'it': 'Titolo (opzionale)'
  },
  'upload.title_placeholder': {
    'pt-BR': 'Ex: Hemograma completo', 'en': 'E.g. Complete blood count',
    'es': 'Ej: Hemograma completo', 'fr': 'Ex: Hémogramme complet',
    'it': 'Es: Emocromo completo'
  },
  'upload.date': {
    'pt-BR': 'Data', 'en': 'Date',
    'es': 'Fecha', 'fr': 'Date', 'it': 'Data'
  },
  'upload.uploading': {
    'pt-BR': 'Enviando...', 'en': 'Uploading...',
    'es': 'Subiendo...', 'fr': 'Téléchargement...',
    'it': 'Caricamento...'
  },
  'upload.cancel': {
    'pt-BR': 'Cancelar', 'en': 'Cancel',
    'es': 'Cancelar', 'fr': 'Annuler', 'it': 'Annulla'
  },
  'upload.confirm': {
    'pt-BR': 'Enviar', 'en': 'Upload',
    'es': 'Subir', 'fr': 'Télécharger', 'it': 'Carica'
  },
  'upload.drop_or_click': {
    'pt-BR': 'Arraste ou clique', 'en': 'Drop or click',
    'es': 'Arrastra o haz clic', 'fr': 'Déposer ou cliquer',
    'it': 'Trascina o fai clic'
  },
  'upload.accepted_formats': {
    'pt-BR': 'JPG, PNG, PDF (máx 10MB)', 'en': 'JPG, PNG, PDF (max 10MB)',
    'es': 'JPG, PNG, PDF (máx 10MB)', 'fr': 'JPG, PNG, PDF (max 10Mo)',
    'it': 'JPG, PNG, PDF (max 10MB)'
  },
  'upload.select_file': {
    'pt-BR': 'Selecionar arquivo', 'en': 'Select file',
    'es': 'Seleccionar archivo', 'fr': 'Sélectionner fichier',
    'it': 'Seleziona file'
  },
  'pet_form.breed_label': {
    'pt-BR': 'Raça (opcional)', 'en': 'Breed (optional)',
    'es': 'Raza (opcional)', 'fr': 'Race (optionnel)',
    'it': 'Razza (opzionale)'
  },
  'pet_form.breed_search': {
    'pt-BR': 'Buscar raça...', 'en': 'Search breed...',
    'es': 'Buscar raza...', 'fr': 'Rechercher race...',
    'it': 'Cerca razza...'
  },
  'pet_form.breed_unknown': {
    'pt-BR': 'Não sei', 'en': 'I don\'t know',
    'es': 'No sé', 'fr': 'Je ne sais pas',
    'it': 'Non so'
  },
  'pet_form.breed_mixed': {
    'pt-BR': 'Mestiço (SRD)', 'en': 'Mixed breed',
    'es': 'Mestizo', 'fr': 'Race mixte',
    'it': 'Meticcio'
  },
  'pet_form.breed_other': {
    'pt-BR': 'Outros...', 'en': 'Other...',
    'es': 'Otros...', 'fr': 'Autre...',
    'it': 'Altro...'
  },
  'pet_form.breed_custom': {
    'pt-BR': 'Digite a raça', 'en': 'Enter breed',
    'es': 'Ingrese raza', 'fr': 'Entrez la race',
    'it': 'Inserisci razza'
  },
  // Removed duplicate pet_form.weight_label, neutered_hint, birth_label - already defined above
  'pet_form.details_optional': {
    'pt-BR': 'Todos os campos são opcionais', 'en': 'All fields are optional',
    'es': 'Todos los campos son opcionales', 'fr': 'Tous les champs sont optionnels',
    'it': 'Tutti i campi sono opzionali'
  },
  'pet_form.skip_for_now': {
    'pt-BR': 'Pular por enquanto', 'en': 'Skip for now',
    'es': 'Omitir por ahora', 'fr': 'Passer pour l\'instant',
    'it': 'Salta per ora'
  },

  // ── Cards "Em Breve" da Home ─────────────────────────────────────────────────
  'home.health_plans': {
    'pt-BR': 'Planos de Saúde', 'en': 'Health Plans', 'es': 'Planes de Salud',
    'fr': 'Plans de Santé', 'it': 'Piani Sanitari'
  },
  'home.health_plans.desc': {
    'pt-BR': 'Encontre planos de saúde', 'en': 'Find health plans', 'es': 'Encuentra planes de salud',
    'fr': 'Trouvez des plans de santé', 'it': 'Trova piani sanitari'
  },
  'home.history_docs': {
    'pt-BR': 'Histórico & Docs', 'en': 'History & Docs', 'es': 'Historial & Docs',
    'fr': 'Historique & Docs', 'it': 'Storico & Doc'
  },
  'home.history_docs.desc': {
    'pt-BR': 'Timeline · exames · laudos · docs', 'en': 'Timeline · exams · reports · docs', 'es': 'Línea de tiempo · exámenes · informes · docs',
    'fr': 'Chronologie · examens · rapports · docs', 'it': 'Cronologia · esami · referti · doc'
  },

  // ── Tipos de Evento ──────────────────────────────────────────────────────────
  'event.type.dewormer': {
    'pt-BR': 'Vermífugo', 'en': 'Dewormer', 'es': 'Vermífugo',
    'fr': 'Vermifuge', 'it': 'Vermifugo'
  },
  'event.type.flea_tick': {
    'pt-BR': 'Antipulgas', 'en': 'Flea/Tick', 'es': 'Antipulgas',
    'fr': 'Anti-puces', 'it': 'Antipulci'
  },
  'event.type.vet_appointment': {
    'pt-BR': 'Consulta', 'en': 'Vet Visit', 'es': 'Consulta',
    'fr': 'Consultation', 'it': 'Visita'
  },
  'event.type.medication': {
    'pt-BR': 'Medicação', 'en': 'Medication', 'es': 'Medicación',
    'fr': 'Médicament', 'it': 'Medicinale'
  },
  'event.type.other': {
    'pt-BR': 'Outro', 'en': 'Other', 'es': 'Otro',
    'fr': 'Autre', 'it': 'Altro'
  },
  'event.type.parasite_control': {
    'pt-BR': 'Controle Parasitário', 'en': 'Parasite Control', 'es': 'Control Parasitario',
    'fr': 'Contrôle Parasitaire', 'it': 'Controllo Parassiti'
  },

  // ── Histórico & Documentos panel ─────────────────────────────────────────────
  'hist.title': {
    'pt-BR': 'Histórico & Documentos', 'en': 'History & Documents', 'es': 'Historial & Documentos',
    'fr': 'Historique & Documents', 'it': 'Storico & Documenti'
  },
  'hist.tab_summary': {
    'pt-BR': 'Resumo', 'en': 'Summary', 'es': 'Resumen',
    'fr': 'Résumé', 'it': 'Riepilogo'
  },
  'hist.tab_detailed': {
    'pt-BR': 'Detalhado', 'en': 'Detailed', 'es': 'Detallado',
    'fr': 'Détaillé', 'it': 'Dettagliato'
  },
  'hist.send_document': {
    'pt-BR': 'Enviar Documento', 'en': 'Send Document', 'es': 'Enviar Documento',
    'fr': 'Envoyer Document', 'it': 'Invia Documento'
  },
  'home.next_reminder': {
    'pt-BR': 'Próx. lembrete:', 'en': 'Next reminder:', 'es': 'Próx. recordatorio:',
    'fr': 'Prochain rappel :', 'it': 'Prossimo promemoria:'
  },

  // ── Shopping & Services modals ───────────────────────────────────────────────
  'shopping.modal_title': {
    'pt-BR': 'Compras para o pet', 'en': 'Pet Shopping', 'es': 'Compras para tu mascota',
    'fr': 'Achats pour animaux', 'it': 'Acquisti per animali'
  },
  'services.find_nearby': {
    'pt-BR': 'Buscar serviços próximos', 'en': 'Find Nearby Services', 'es': 'Buscar servicios cercanos',
    'fr': 'Trouver des services à proximité', 'it': 'Trova servizi vicini'
  },

  // ── Parasite types (history detail) ──────────────────────────────────────────
  'parasite.heartworm': {
    'pt-BR': 'Prevenção Dirofilária', 'en': 'Heartworm Prevention', 'es': 'Prevención Dirofilaria',
    'fr': 'Prévention Dirofilariose', 'it': 'Prevenzione Dirofilaria'
  },
  'parasite.leishmaniasis': {
    'pt-BR': 'Prevenção Leishmaniose', 'en': 'Leishmaniasis Prevention', 'es': 'Prevención Leishmaniasis',
    'fr': 'Prévention Leishmaniose', 'it': 'Prevenzione Leishmaniosi'
  },

  // ── Categorias de Documentos (Document Vault tabs) ───────────────────────────
  'doc.cat.all': {
    'pt-BR': 'Todos', 'en': 'All', 'es': 'Todos',
    'fr': 'Tous', 'it': 'Tutti'
  },
  'doc.cat.health': {
    'pt-BR': 'Saúde', 'en': 'Health', 'es': 'Salud',
    'fr': 'Santé', 'it': 'Salute'
  },
  'doc.cat.exams': {
    'pt-BR': 'Exames', 'en': 'Exams', 'es': 'Exámenes',
    'fr': 'Examens', 'it': 'Esami'
  },
  'doc.cat.prescriptions': {
    'pt-BR': 'Receitas', 'en': 'Prescriptions', 'es': 'Recetas',
    'fr': 'Ordonnances', 'it': 'Ricette'
  },
  'doc.cat.reports': {
    'pt-BR': 'Laudos', 'en': 'Reports', 'es': 'Informes',
    'fr': 'Rapports', 'it': 'Referti'
  },
  'doc.cat.vouchers': {
    'pt-BR': 'Comprovantes', 'en': 'Receipts', 'es': 'Comprobantes',
    'fr': 'Justificatifs', 'it': 'Ricevute'
  },
  'doc.cat.photos': {
    'pt-BR': 'Fotos', 'en': 'Photos', 'es': 'Fotos',
    'fr': 'Photos', 'it': 'Foto'
  },
  'doc.cat.others': {
    'pt-BR': 'Outros', 'en': 'Others', 'es': 'Otros',
    'fr': 'Autres', 'it': 'Altri'
  },

  // ── Upload type labels (adicionais) ──────────────────────────────────────────
  'upload.type_report': {
    'pt-BR': 'Laudo', 'en': 'Report', 'es': 'Informe',
    'fr': 'Rapport', 'it': 'Referto'
  },
  'upload.type_comprovante': {
    'pt-BR': 'Comprovante', 'en': 'Receipt', 'es': 'Comprobante',
    'fr': 'Justificatif', 'it': 'Ricevuta'
  },
  'upload.type_photo': {
    'pt-BR': 'Foto', 'en': 'Photo', 'es': 'Foto',
    'fr': 'Photo', 'it': 'Foto'
  },

  // ── Food Control (FoodControlTab) ────────────────────────────────────────────
  'food.title': { 'pt-BR': 'Alimentação', 'en': 'Feeding', 'es': 'Alimentación', 'fr': 'Alimentation', 'it': 'Alimentazione' },
  'food.enabled_off': { 'pt-BR': 'Ative o controle para monitorar estoque de ração e receber alertas.', 'en': 'Enable control to monitor food stock and receive alerts.', 'es': 'Active el control para supervisar el stock y recibir alertas.', 'fr': 'Activez le contrôle pour surveiller le stock et recevoir des alertes.', 'it': "Abilita il controllo per monitorare le scorte e ricevere avvisi." },
  'food.activate_aria': { 'pt-BR': 'Ativar controle de alimentação', 'en': 'Enable feeding control', 'es': 'Activar control de alimentación', 'fr': "Activer le contrôle de l'alimentation", 'it': 'Attiva controllo alimentazione' },
  'food.type_label': { 'pt-BR': 'Tipo de alimentação', 'en': 'Food type', 'es': 'Tipo de alimentación', 'fr': "Type d'alimentation", 'it': 'Tipo di alimentazione' },
  'food.mode.kibble': { 'pt-BR': 'Ração seca', 'en': 'Dry food', 'es': 'Pienso seco', 'fr': 'Croquettes', 'it': 'Crocchette' },
  'food.mode.wet': { 'pt-BR': 'Ração úmida', 'en': 'Wet food', 'es': 'Comida húmeda', 'fr': 'Nourriture humide', 'it': 'Cibo umido' },
  'food.mode.homemade': { 'pt-BR': 'Comida caseira', 'en': 'Homemade food', 'es': 'Comida casera', 'fr': 'Nourriture maison', 'it': 'Cibo fatto in casa' },
  'food.mode.prescribed': { 'pt-BR': 'Dieta prescrita', 'en': 'Prescribed diet', 'es': 'Dieta prescrita', 'fr': 'Régime prescrit', 'it': 'Dieta prescritta' },
  'food.mode.mixed': { 'pt-BR': 'Misto', 'en': 'Mixed', 'es': 'Mixto', 'fr': 'Mixte', 'it': 'Misto' },
  'food.details_title': { 'pt-BR': 'Detalhes da ração', 'en': 'Food details', 'es': 'Detalles del alimento', 'fr': 'Détails de l\'alimentation', 'it': 'Dettagli del cibo' },
  'food.auto': { 'pt-BR': '📦 Automático', 'en': '📦 Automatic', 'es': '📦 Automático', 'fr': '📦 Automatique', 'it': '📦 Automatico' },
  'food.auto_desc': { 'pt-BR': 'estima estoque', 'en': 'estimates stock', 'es': 'estima stock', 'fr': 'estime le stock', 'it': 'stima scorte' },
  'food.manual': { 'pt-BR': '🔔 Manual', 'en': '🔔 Manual', 'es': '🔔 Manual', 'fr': '🔔 Manuel', 'it': '🔔 Manuale' },
  'food.manual_desc': { 'pt-BR': 'só lembrete', 'en': 'reminder only', 'es': 'solo recordatorio', 'fr': 'rappel seulement', 'it': 'solo promemoria' },
  'food.brand': { 'pt-BR': 'Marca / Produto', 'en': 'Brand / Product', 'es': 'Marca / Producto', 'fr': 'Marque / Produit', 'it': 'Marca / Prodotto' },
  'food.package_size': { 'pt-BR': 'Tamanho do pacote (kg)', 'en': 'Package size (kg)', 'es': 'Tamaño del paquete (kg)', 'fr': 'Taille du paquet (kg)', 'it': 'Dimensione confezione (kg)' },
  'food.daily_amount': { 'pt-BR': 'Consumo diário (g/dia)', 'en': 'Daily amount (g/day)', 'es': 'Consumo diario (g/día)', 'fr': 'Quantité journalière (g/jour)', 'it': 'Quantità giornaliera (g/giorno)' },
  'food.start_date': { 'pt-BR': 'Data de início do pacote', 'en': 'Package start date', 'es': 'Fecha de inicio del paquete', 'fr': 'Date de début du paquet', 'it': 'Data inizio confezione' },
  'food.stock_out': { 'pt-BR': 'Estimativa: ração esgotada.', 'en': 'Estimate: food depleted.', 'es': 'Estimación: alimento agotado.', 'fr': 'Estimation : nourriture épuisée.', 'it': 'Stima: cibo esaurito.' },
  'food.stock_days': { 'pt-BR': 'Estimativa: acaba em {n} dia{s}.', 'en': 'Estimate: runs out in {n} day{s}.', 'es': 'Estimación: se acaba en {n} día{s}.', 'fr': 'Estimation : finit dans {n} jour{s}.', 'it': 'Stima: finisce tra {n} giorno{s}.' },
  'food.alert_days_label': { 'pt-BR': 'Avisar quantos dias antes de acabar o estoque (estimado)?', 'en': 'How many days before estimated stock-out to alert?', 'es': '¿Cuántos días antes del agotamiento estimado avisar?', 'fr': "Combien de jours avant l'épuisement estimé pour alerter ?", 'it': "Quanti giorni prima dell'esaurimento stimato per avvisare?" },
  'food.days_before': { 'pt-BR': 'dias antes', 'en': 'days before', 'es': 'días antes', 'fr': 'jours avant', 'it': 'giorni prima' },
  'food.will_alert_stock': { 'pt-BR': 'Avisaremos {n} dia{s} antes da data estimada de término do estoque.', 'en': "We'll alert you {n} day{s} before the estimated stock-out date.", 'es': "Le avisaremos {n} día{s} antes de la fecha estimada de agotamiento.", 'fr': "Nous vous alerterons {n} jour{s} avant la date d'épuisement estimée.", 'it': "Ti avviseremo {n} giorno{s} prima della data di esaurimento stimata." },
  'food.next_purchase': { 'pt-BR': 'Próxima compra (data)', 'en': 'Next purchase (date)', 'es': 'Próxima compra (fecha)', 'fr': 'Prochain achat (date)', 'it': 'Prossimo acquisto (data)' },
  'food.alert_days_manual_label': { 'pt-BR': 'Avisar quantos dias antes da data escolhida?', 'en': 'How many days before the chosen date to alert?', 'es': '¿Cuántos días antes de la fecha elegida avisar?', 'fr': 'Combien de jours avant la date choisie pour alerter ?', 'it': 'Quanti giorni prima della data scelta per avvisare?' },
  'food.will_alert_reminder': { 'pt-BR': 'Avisaremos {n} dia{s} antes da data do lembrete.', 'en': "We'll alert you {n} day{s} before the reminder date.", 'es': "Le avisaremos {n} día{s} antes de la fecha del recordatorio.", 'fr': "Nous vous alerterons {n} jour{s} avant la date du rappel.", 'it': "Ti avviseremo {n} giorno{s} prima della data del promemoria." },
  'food.recurring_reminder': { 'pt-BR': 'Lembrete recorrente de compra', 'en': 'Recurring purchase reminder', 'es': 'Recordatorio recurrente de compra', 'fr': "Rappel d'achat récurrent", 'it': 'Promemoria acquisto ricorrente' },
  'food.repeat_every_days': { 'pt-BR': 'Repetir a cada (dias)', 'en': 'Repeat every (days)', 'es': 'Repetir cada (días)', 'fr': 'Répéter tous les (jours)', 'it': 'Ripeti ogni (giorni)' },
  'food.alert_days_before': { 'pt-BR': 'Avisar quantos dias antes?', 'en': 'How many days before to alert?', 'es': '¿Cuántos días antes avisar?', 'fr': 'Combien de jours avant pour alerter ?', 'it': 'Quanti giorni prima per avvisare?' },
  'food.homemade_desc': { 'pt-BR': 'Sem cálculo de pacote. Configure lembretes de rotina abaixo.', 'en': 'No package calculation. Set up routine reminders below.', 'es': 'Sin cálculo de paquete. Configure recordatorios de rutina a continuación.', 'fr': 'Pas de calcul de paquet. Configurez des rappels de routine ci-dessous.', 'it': 'Nessun calcolo di confezione. Configura promemoria di routine qui sotto.' },
  'food.prep_reminder': { 'pt-BR': 'Lembrete de preparo / compra de ingredientes', 'en': 'Preparation / ingredient purchase reminder', 'es': 'Recordatorio de preparación / compra de ingredientes', 'fr': "Rappel de préparation / achat d'ingrédients", 'it': 'Promemoria preparazione / acquisto ingredienti' },
  'food.prescribed_desc': { 'pt-BR': 'Apenas registro. Siga sempre as orientações do veterinário.', 'en': "Record only. Always follow your vet's instructions.", 'es': 'Solo registro. Siga siempre las instrucciones del veterinario.', 'fr': 'Enregistrement uniquement. Suivez toujours les instructions de votre vétérinaire.', 'it': "Solo registrazione. Segui sempre le istruzioni del tuo veterinario." },
  'food.optional': { 'pt-BR': 'Opcional', 'en': 'Optional', 'es': 'Opcional', 'fr': 'Facultatif', 'it': 'Opzionale' },
  'food.meals_per_day': { 'pt-BR': 'Refeições por dia', 'en': 'Meals per day', 'es': 'Comidas por día', 'fr': 'Repas par jour', 'it': 'Pasti al giorno' },
  'food.notes': { 'pt-BR': 'Observações', 'en': 'Notes', 'es': 'Observaciones', 'fr': 'Remarques', 'it': 'Note' },
  'food.notes_general': { 'pt-BR': 'Observações gerais', 'en': 'General notes', 'es': 'Observaciones generales', 'fr': 'Remarques générales', 'it': 'Note generali' },
  'food.saved': { 'pt-BR': 'Preferências salvas!', 'en': 'Preferences saved!', 'es': '¡Preferencias guardadas!', 'fr': 'Préférences sauvegardées !', 'it': 'Preferenze salvate!' },
  'food.sync_error': { 'pt-BR': 'Salvo localmente. Sincronização com servidor falhou — tente novamente mais tarde.', 'en': 'Saved locally. Server sync failed — please try again later.', 'es': 'Guardado localmente. La sincronización falló — inténtelo de nuevo más tarde.', 'fr': 'Enregistré localement. La synchronisation a échoué — réessayez plus tard.', 'it': "Salvato localmente. Sincronizzazione fallita — riprova più tardi." },
  'food.stock_banner_zero': { 'pt-BR': 'Ração acabou!', 'en': 'Food is out!', 'es': '¡Se acabó el alimento!', 'fr': 'La nourriture est épuisée !', 'it': 'Il cibo è esaurito!' },
  'food.stock_banner_low': { 'pt-BR': 'Ração acaba em {n} dia{s}!', 'en': 'Food runs out in {n} day{s}!', 'es': '¡El alimento se acaba en {n} día{s}!', 'fr': 'La nourriture finit dans {n} jour{s} !', 'it': 'Il cibo finisce tra {n} giorno{s}!' },
  'food.restock_soon': { 'pt-BR': 'Considere reabastecer em breve.', 'en': 'Consider restocking soon.', 'es': 'Considera reabastecer pronto.', 'fr': 'Pensez à vous réapprovisionner bientôt.', 'it': 'Considera di rifornirti presto.' },

  // ── Home card alert popups (AppleControlButtons / home/page.tsx) ─────────────
  'home.vet_online.alert': { 'pt-BR': '👨‍⚕️ Veterinário Online\n\nEm breve você poderá fazer consultas com veterinários diretamente pelo app!\n\n💡 Marque "⭐ Tenho interesse" para ser avisado.', 'en': '👨‍⚕️ Online Vet\n\nSoon you\'ll be able to consult vets directly in the app!\n\n💡 Tap "⭐ I\'m interested" to be notified.', 'es': '👨‍⚕️ Veterinario Online\n\n¡Pronto podrás consultar veterinarios directamente en la app!\n\n💡 Toca "⭐ Me interesa" para ser notificado.', 'fr': '👨‍⚕️ Vétérinaire en Ligne\n\nBientôt, vous pourrez consulter des vétérinaires directement dans l\'app !\n\n💡 Appuyez sur "⭐ Je suis intéressé" pour être informé.', 'it': '👨‍⚕️ Veterinario Online\n\nPresto potrai consultare veterinari direttamente nell\'app!\n\n💡 Tocca "⭐ Sono interessato" per essere avvisato.' },
  'home.vet_online.registered': { 'pt-BR': '✅ Interesse registrado!\n\n📧 Você será avisado quando o Veterinário Online estiver disponível.\n\n💡 Usuários que demonstrarem interesse terão prioridade no acesso.', 'en': '✅ Interest registered!\n\n📧 You\'ll be notified when Online Vet is available.\n\n💡 Users who show interest will have early access priority.', 'es': '✅ ¡Interés registrado!\n\n📧 Serás notificado cuando el Veterinario Online esté disponible.\n\n💡 Los usuarios que demuestren interés tendrán prioridad de acceso.', 'fr': '✅ Intérêt enregistré !\n\n📧 Vous serez informé lorsque le Vétérinaire en Ligne sera disponible.\n\n💡 Les utilisateurs intéressés auront un accès prioritaire.', 'it': '✅ Interesse registrato!\n\n📧 Sarai avvisato quando il Veterinario Online sarà disponibile.\n\n💡 Gli utenti interessati avranno accesso prioritario.' },
  'home.training.registered': { 'pt-BR': '✅ Interesse registrado!\n\n📧 Você será avisado quando as Dicas de Adestramento estiverem disponíveis.\n\n💡 Usuários que demonstrarem interesse terão prioridade no acesso.', 'en': '✅ Interest registered!\n\n📧 You\'ll be notified when Training Tips are available.\n\n💡 Users who show interest will have early access priority.', 'es': '✅ ¡Interés registrado!\n\n📧 Serás notificado cuando los Consejos de Adiestramiento estén disponibles.\n\n💡 Los usuarios que demuestren interés tendrán prioridad de acceso.', 'fr': '✅ Intérêt enregistré !\n\n📧 Vous serez informé lorsque les Conseils de Dressage seront disponibles.\n\n💡 Les utilisateurs intéressés auront un accès prioritaire.', 'it': '✅ Interesse registrato!\n\n📧 Sarai avvisato quando i Consigli di Addestramento saranno disponibili.\n\n💡 Gli utenti interessati avranno accesso prioritario.' },
  'home.training.alert': { 'pt-BR': '🎯 Dicas de Adestramento\n\nRecurso em desenvolvimento!\n\n✨ Em breve:\n• Vídeos tutoriais por raça\n• Planos de treino personalizados\n• Análise de comportamento\n\n💡 Marque "⭐ Tenho interesse" para ser avisado quando estiver pronto!', 'en': '🎯 Training Tips\n\nFeature in development!\n\n✨ Coming soon:\n• Breed-specific tutorial videos\n• Personalised training plans\n• Behaviour analysis\n\n💡 Tap "⭐ I\'m interested" to be notified when ready!', 'es': '🎯 Consejos de Adiestramiento\n\n¡Función en desarrollo!\n\n✨ Próximamente:\n• Videos tutoriales por raza\n• Planes de entrenamiento personalizados\n• Análisis de comportamiento\n\n💡 Marca "⭐ Me interesa" para ser avisado cuando esté listo!', 'fr': '🎯 Conseils de Dressage\n\nFonctionnalité en développement !\n\n✨ Bientôt :\n• Vidéos tutorielles par race\n• Plans d\'entraînement personnalisés\n• Analyse comportementale\n\n💡 Appuyez sur "⭐ Je suis intéressé" pour être informé !', 'it': '🎯 Consigli di Addestramento\n\nFunzionalità in sviluppo!\n\n✨ Presto:\n• Video tutorial per razza\n• Piani di addestramento personalizzati\n• Analisi del comportamento\n\n💡 Tocca "⭐ Sono interessato" per essere avvisato!' },
  'home.health_plans.alert': { 'pt-BR': '🩺 Planos de Saúde\n\nEm breve você poderá contratar e gerenciar planos de saúde para o seu pet diretamente pelo PETMOL!\n\n💡 Marque interesse para ser notificado quando disponível.', 'en': '🩺 Health Plans\n\nSoon you\'ll be able to take out and manage health plans for your pet directly in PETMOL!\n\n💡 Show interest to be notified when available.', 'es': '🩺 Planes de Salud\n\n¡Pronto podrás contratar y gestionar planes de salud para tu mascota en PETMOL!\n\n💡 Demuestra interés para ser notificado cuando esté disponible.', 'fr': '🩺 Plans de Santé\n\nBientôt, vous pourrez souscrire et gérer des plans de santé pour votre animal dans PETMOL !\n\n💡 Montrez votre intérêt pour être notifié.', 'it': '🩺 Piani Sanitari\n\nPresto potrai sottoscrivere e gestire piani sanitari per il tuo animale in PETMOL!\n\n💡 Mostra interesse per essere avvisato.' }
};

/**
 * Get translation for a key with fallback to 'en' then key
 */
export function t(key: string, locale: Locale = 'en', params?: Record<string, string | number>): string {
  const entry = translations[key];
  if (!entry) return key;
  
  // Try requested locale, then 'en' as fallback, then key
  let text = entry[locale] || entry['en'] || key;
  
  // Replace params like {minutes}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  
  return text;
}
