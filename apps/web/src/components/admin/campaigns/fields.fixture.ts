// Gerado a partir de describe_fields() do backend (21 filtros da Etapa 2). Só para testes.
const fixture = {
 "fields": [
  {
   "field": "tutor_created_at",
   "label": "Data de cadastro do tutor",
   "group": "Tutor",
   "scope": "tutor",
   "ops": [
    "gte",
    "lte",
    "between"
   ],
   "values": null,
   "approximate": false,
   "origin": "Cadastro do tutor",
   "precision": "exata"
  },
  {
   "field": "tutor_pet_count",
   "label": "Quantidade de pets",
   "group": "Tutor",
   "scope": "tutor",
   "ops": [
    "eq",
    "gte",
    "lte",
    "between"
   ],
   "values": null,
   "approximate": false,
   "origin": "Pets cadastrados",
   "precision": "exata"
  },
  {
   "field": "tutor_species_mix",
   "label": "Tipos de pet do tutor",
   "group": "Tutor",
   "scope": "tutor",
   "ops": [
    "in"
   ],
   "values": [
    "dog_only",
    "cat_only",
    "dog_and_cat",
    "has_dog",
    "has_cat"
   ],
   "approximate": false,
   "origin": "Pets cadastrados",
   "precision": "exata"
  },
  {
   "field": "tutor_activity",
   "label": "Atividade registrada no app (não é login)",
   "group": "Engajamento",
   "scope": "tutor",
   "ops": [
    "eq"
   ],
   "values": [
    "last_7d",
    "d8_30",
    "over_30d",
    "no_events"
   ],
   "approximate": false,
   "origin": "Eventos registrados no app (não é login)",
   "precision": "registro de eventos"
  },
  {
   "field": "platform",
   "label": "Aparelho com push ativo",
   "group": "Engajamento",
   "scope": "tutor",
   "ops": [
    "in"
   ],
   "values": [
    "ios",
    "android",
    "web"
   ],
   "approximate": false,
   "origin": "Aparelho com push ativo",
   "precision": "exata"
  },
  {
   "field": "pet_species",
   "label": "Espécie",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "in"
   ],
   "values": [
    "dog",
    "cat",
    "other"
   ],
   "approximate": false,
   "origin": "Cadastro do pet",
   "precision": "exata"
  },
  {
   "field": "pet_sex",
   "label": "Sexo do pet",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    "male",
    "female"
   ],
   "approximate": false,
   "origin": "Cadastro do pet",
   "precision": "declarada"
  },
  {
   "field": "pet_breed_contains",
   "label": "Raça contém (texto)",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "contains"
   ],
   "values": null,
   "approximate": false,
   "origin": "Cadastro do pet (texto livre)",
   "precision": "declarada"
  },
  {
   "field": "pet_age_months",
   "label": "Idade do pet (meses)",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "gte",
    "lte",
    "between"
   ],
   "values": null,
   "approximate": false,
   "origin": "Data de nascimento cadastrada",
   "precision": "declarada"
  },
  {
   "field": "pet_weight_kg",
   "label": "Peso do pet (kg)",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "gte",
    "lte",
    "between"
   ],
   "values": null,
   "approximate": false,
   "origin": "Peso cadastrado (kg ou lb)",
   "precision": "declarada"
  },
  {
   "field": "pet_neutered_yes",
   "label": "Castrado (só 'sim' é confiável)",
   "group": "Pet",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Cadastro do pet (só 'sim' é confiável)",
   "precision": "declarada"
  },
  {
   "field": "location_registered_state",
   "label": "Estado cadastrado pelo tutor",
   "group": "Localização",
   "scope": "tutor",
   "ops": [
    "in"
   ],
   "values": null,
   "approximate": false,
   "origin": "cadastro",
   "precision": "declarada pelo tutor"
  },
  {
   "field": "location_registered_city",
   "label": "Cidade cadastrada pelo tutor",
   "group": "Localização",
   "scope": "tutor",
   "ops": [
    "in"
   ],
   "values": null,
   "approximate": false,
   "origin": "cadastro",
   "precision": "declarada pelo tutor"
  },
  {
   "field": "location_gps_radius",
   "label": "Perto de um ponto (GPS do aparelho)",
   "group": "Localização",
   "scope": "tutor",
   "ops": [
    "within_km"
   ],
   "values": null,
   "approximate": true,
   "origin": "gps",
   "precision": "aproximada (última posição do GPS)"
  },
  {
   "field": "location_geoip_region",
   "label": "Região aproximada pelo IP (não é residência)",
   "group": "Localização",
   "scope": "tutor",
   "ops": [
    "in"
   ],
   "values": null,
   "approximate": true,
   "origin": "geoip",
   "precision": "aproximada (IP, não é residência)"
  },
  {
   "field": "feeding_registered",
   "label": "Ração cadastrada",
   "group": "Alimentação",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Ração cadastrada (definição do produto)",
   "precision": "declarada"
  },
  {
   "field": "feeding_brand_contains",
   "label": "Marca/produto da ração contém (texto)",
   "group": "Alimentação",
   "scope": "pet",
   "ops": [
    "contains"
   ],
   "values": null,
   "approximate": false,
   "origin": "Campo 'marca' da ração (texto livre: marca + produto)",
   "precision": "declarada"
  },
  {
   "field": "care_vaccine",
   "label": "Tem registro de vacina",
   "group": "Cuidados",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Registros de vacina",
   "precision": "declarada"
  },
  {
   "field": "care_parasite",
   "label": "Tem registro de vermífugo/antipulgas/coleira",
   "group": "Cuidados",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Registros de vermífugo/antipulgas/coleira",
   "precision": "declarada"
  },
  {
   "field": "care_grooming",
   "label": "Tem registro de banho e tosa",
   "group": "Cuidados",
   "scope": "pet",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Registros de banho e tosa",
   "precision": "declarada"
  },
  {
   "field": "care_medication",
   "label": "Tem medicação cadastrada",
   "group": "Cuidados",
   "scope": "tutor",
   "ops": [
    "eq"
   ],
   "values": [
    true
   ],
   "approximate": false,
   "origin": "Medicações cadastradas",
   "precision": "declarada"
  }
 ],
 "activity_note": "x",
 "location_origins": {
  "cadastro": "cidade/estado digitados pelo tutor",
  "gps": "GPS do aparelho (última posição enviada)",
  "geoip": "região aproximada pelo IP da última sessão"
 }
};
export default fixture;
