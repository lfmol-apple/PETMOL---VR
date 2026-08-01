#!/usr/bin/env python3
"""
Fase 1 do plano de base de produtos PETMOL: matriz estruturada de
marca/linha/espécie/categoria para as principais rações do mercado
brasileiro, compilada a partir de conhecimento geral (não verificada
contra fonte viva ainda — isso é Fase 2/3 do plano).

Campos deixados em branco (barcode, image_url, official_url) são
propositalmente None: não devem ser inventados, só preenchidos com
dados reais coletados/verificados depois.
"""
import json
import re

# Cada entrada: (brand, manufacturer, line, variant, species, life_stage,
#   port, category, indication, weight_options_kg)
# port: mini/pequeno, medio, grande, gigante, all, None
# category: super_premium, premium, premium_especial, standard, veterinary
# indication: None para rações normais; string curta para terapêuticas

ENTRIES = []

def add(brand, manufacturer, line, variant, species, life_stage, port, category,
        indication, weights, confidence="high"):
    # One item per weight = one real SKU (matches how barcodes actually work —
    # each pack size has its own EAN). confidence flags how sure we are about
    # this brand/line's naming: "high" for major brands we know well, "low"
    # for smaller/regional brands where we're only confident the brand exists
    # and roughly what it offers, not the exact current line names.
    for w in weights:
        ENTRIES.append({
            "brand": brand,
            "manufacturer": manufacturer,
            "line": line,
            "variant": variant,
            "species": species,
            "life_stage": life_stage,
            "port": port,
            "category": category,
            "indication": indication,
            "weight_kg": w,
            "barcode": None,
            "image_url": None,
            "official_url": None,
            "source": "ai_compiled_phase1",
            "confidence": confidence,
            "verified": False,
        })

# ============================================================
# CÃES
# ============================================================

# --- Royal Canin (Size Health Nutrition) ---
rc_size = [
    ("X-Small Adult", "mini", "adult", [0.5, 1.5, 3]),
    ("X-Small Puppy", "mini", "puppy", [0.5, 1.5]),
    ("Mini Adult", "pequeno", "adult", [1, 2.5, 7.5]),
    ("Mini Puppy", "pequeno", "puppy", [1, 2.5, 7.5]),
    ("Mini Indoor Adult", "pequeno", "adult", [1, 2.5, 7.5]),
    ("Mini Light Weight Care", "pequeno", "adult", [1, 2.5, 7.5]),
    ("Medium Adult", "medio", "adult", [3, 7.5, 15]),
    ("Medium Puppy", "medio", "puppy", [3, 10, 15]),
    ("Maxi Adult", "grande", "adult", [3, 7.5, 15]),
    ("Maxi Puppy", "grande", "puppy", [3, 15]),
    ("Giant Adult", "gigante", "adult", [15]),
]
for variant, port, stage, w in rc_size:
    add("Royal Canin", "Royal Canin do Brasil", "Size Health Nutrition", variant,
        "dog", stage, port, "super_premium", None, w)

# --- Royal Canin (Breed Health Nutrition) ---
rc_breed = ["Poodle Adult", "Yorkshire Terrier Adult", "Labrador Retriever Adult",
            "Golden Retriever Adult", "Bulldog Francês Adult", "Shih Tzu Adult",
            "Dachshund Adult", "Beagle Adult", "Chihuahua Adult"]
for variant in rc_breed:
    add("Royal Canin", "Royal Canin do Brasil", "Breed Health Nutrition", variant,
        "dog", "adult", None, "super_premium", None, [1, 2.5, 7.5])

# --- Royal Canin Veterinary Diet (cão) ---
rc_vet = [("Urinary S/O", "urinary"), ("Renal", "renal"),
          ("Gastrointestinal", "gastrointestinal"), ("Hepatic", "hepatic"),
          ("Satiety Weight Management", "obesity"),
          ("Hypoallergenic", "hipoalergenico"), ("Skin Care", "dermatologico")]
for variant, ind in rc_vet:
    add("Royal Canin", "Royal Canin do Brasil", "Veterinary Diet", variant,
        "dog", "adult", None, "veterinary", ind, [2, 7.5, 10.1])

# --- Premier Pet ---
premier_formula = [
    ("Fórmula Raças Grandes e Gigantes Adultos", "grande_gigante", "adult", [15, 20]),
    ("Fórmula Raças Médias Adultos", "medio", "adult", [10.1, 15]),
    ("Fórmula Raças Pequenas Adultos", "pequeno", "adult", [1, 3, 10.1]),
    ("Fórmula Filhotes Raças Grandes", "grande", "puppy", [15]),
    ("Fórmula Filhotes Raças Pequenas", "pequeno", "puppy", [1, 3, 10.1]),
]
for variant, port, stage, w in premier_formula:
    add("Premier Pet", "Premier Pet", "Fórmula", variant, "dog", stage, port,
        "super_premium", None, w)

premier_racas = ["Labrador Adultos", "Golden Retriever Adultos", "Poodle Adultos",
                 "Yorkshire Adultos", "Buldogue Francês Adultos", "Shih Tzu Adultos",
                 "Spitz Alemão Adultos"]
for variant in premier_racas:
    add("Premier Pet", "Premier Pet", "Raças Específicas", variant, "dog", "adult",
        None, "super_premium", None, [1, 2.5, 12])

add("Premier Pet", "Premier Pet", "Golden Fórmula", "Cães Adultos Raças Médias e Grandes",
    "dog", "adult", "medio_grande", "premium", None, [3, 12, 15])
add("Premier Pet", "Premier Pet", "Nattu", "Cães Adultos", "dog", "adult", None,
    "premium", None, [2.5, 10.1, 12])

premier_clinica = [("Renal", "renal"), ("Obesidade", "obesity"),
                    ("Gastrointestinal", "gastrointestinal"),
                    ("Hepático", "hepatic"), ("Hipoalergênico", "hipoalergenico")]
for variant, ind in premier_clinica:
    add("Premier Pet", "Premier Pet", "Nutrição Clínica", variant, "dog", "adult",
        None, "veterinary", ind, [2, 10.1])

# --- Golden ---
golden_variants = [
    ("Fórmula Adulto Carne", "adult", [3, 15, 20]),
    ("Fórmula Adulto Frango e Carne", "adult", [3, 15, 20]),
    ("Fórmula Filhotes", "puppy", [1, 3, 15]),
    ("Fórmula Light", "adult", [3, 15]),
    ("Fórmula Sênior", "senior", [3, 15]),
    ("Fórmula Mini Bits Adulto", "adult", [1, 3, 15]),
    ("Fórmula Raças Grandes Adulto", "adult", [15, 20]),
]
for variant, stage, w in golden_variants:
    add("Golden", "Premier Pet", "Fórmula", variant, "dog", stage, None,
        "premium_especial", None, w)

# --- Purina Pro Plan ---
proplan = [
    ("Adult Sensitive Skin", "adult", None, [3, 15]),
    ("Adult Complete", "adult", None, [3, 15]),
    ("Adult Small Breed", "adult", "pequeno", [3, 7.5]),
    ("Puppy Complete", "puppy", None, [3, 15]),
    ("Performance", "adult", None, [15]),
]
for variant, stage, port, w in proplan:
    add("Purina Pro Plan", "Nestlé Purina", "Pro Plan", variant, "dog", stage, port,
        "super_premium", None, w)
proplan_vet = [("OM Overweight Management", "obesity"), ("EN Gastroenteric", "gastrointestinal"),
               ("NF Renal Function", "renal"), ("HA Hypoallergenic", "hipoalergenico")]
for variant, ind in proplan_vet:
    add("Purina Pro Plan", "Nestlé Purina", "Veterinary Diets", variant, "dog", "adult",
        None, "veterinary", ind, [2, 10])

# --- Dog Chow ---
dogchow = [("Adulto Carne", "adult", None, [1, 3, 15]),
           ("Filhote", "puppy", None, [1, 3, 15]),
           ("Sênior", "senior", None, [1, 3, 15]),
           ("Light", "adult", None, [1, 3, 15]),
           ("Raças Pequenas Adulto", "adult", "pequeno", [1, 3]),
           ("Raças Pequenas Filhote", "puppy", "pequeno", [1, 3])]
for variant, stage, port, w in dogchow:
    add("Dog Chow", "Nestlé Purina", None, variant, "dog", stage, port,
        "standard", None, w)

# --- Pedigree ---
pedigree = [("Adulto Carne", "adult", None, [1, 3, 15]),
            ("Filhote", "puppy", None, [1, 3, 15]),
            ("Sênior", "senior", None, [1, 3, 15]),
            ("Raças Pequenas Adulto", "adult", "pequeno", [1, 3]),
            ("Raças Grandes Adulto", "adult", "grande", [15])]
for variant, stage, port, w in pedigree:
    add("Pedigree", "Mars Petcare", None, variant, "dog", stage, port,
        "standard", None, w)

# --- Farmina N&D (cão) ---
farmina = ["Ancestral Grain Boar & Apple Adult", "Ancestral Grain Chicken & Pomegranate Adult",
           "Pumpkin Grain Free Boar Adult", "Pumpkin Grain Free Lamb Adult",
           "Low Grain Chicken & Pomegranate Puppy Mini"]
for variant in farmina:
    add("Farmina N&D", "Farmina Pet Foods", "N&D", variant, "dog",
        "puppy" if "Puppy" in variant else "adult", None, "super_premium", None, [2.5, 7, 10.1])

# --- Biofresh ---
biofresh = [("Adulto", "adult", [1, 3, 10.1, 15]), ("Filhote", "puppy", [1, 3, 10.1]),
            ("Sênior", "senior", [1, 3, 10.1]), ("Light", "adult", [1, 3, 10.1])]
for variant, stage, w in biofresh:
    add("Biofresh", "Biofresh", None, variant, "dog", stage, None, "premium", None, w)

# --- Guabi Natural ---
guabi = [("Adulto Frango", "adult", [1, 3, 10.1, 15]),
         ("Adulto Salmão", "adult", [1, 3, 10.1]),
         ("Filhotes", "puppy", [1, 3, 10.1]),
         ("Sênior", "senior", [1, 3, 10.1]),
         ("Raças Pequenas Adulto", "adult", [1, 3])]
for variant, stage, w in guabi:
    add("Guabi Natural", "Guabi", None, variant, "dog", stage, None, "premium", None, w)

# --- Fórmula Natural ---
formula_natural = [("Super Premium Fresh Meat Adulto", "adult", [1, 7, 15]),
                    ("Super Premium Gold Filhotes", "puppy", [1, 7, 15]),
                    ("Light", "adult", [1, 7, 15]),
                    ("Sênior Mini e Pequeno", "senior", [1, 7])]
for variant, stage, w in formula_natural:
    add("Fórmula Natural", "Fórmula Natural", None, variant, "dog", stage, None,
        "super_premium", None, w)

# --- GranPlus ---
granplus = [("Choice Adulto", "adult", [1, 3, 15, 20]),
            ("Choice Filhote", "puppy", [1, 3, 15]),
            ("Special Adulto", "adult", [1, 3, 15]),
            ("Special Filhote", "puppy", [1, 3, 15])]
for variant, stage, w in granplus:
    add("GranPlus", "GranPlus", None, variant, "dog", stage, None, "standard", None, w)

# --- Quatree ---
quatree = [("Gourmet Adulto", "adult", [1, 3, 10.1, 15]),
           ("Gourmet Filhote", "puppy", [1, 3, 10.1]),
           ("Premium Indoor Fórmula Filhote", "puppy", [1, 3]),
           ("Premium Sênior", "senior", [1, 3, 10.1])]
for variant, stage, w in quatree:
    add("Quatree", "Quatree", None, variant, "dog", stage, None, "premium", None, w)

# --- Magnus ---
magnus = [("Excellent Adulto", "adult", [1, 3, 15]), ("Classic Adulto", "adult", [1, 3, 15]),
          ("Excellent Filhote", "puppy", [1, 3, 15])]
for variant, stage, w in magnus:
    add("Magnus", "Magnus", None, variant, "dog", stage, None, "standard", None, w)

# --- Origens ---
origens = [("Adulto Raças Pequenas", "adult", [1, 3]),
           ("Adulto Raças Médias e Grandes", "adult", [3, 15]),
           ("Filhote", "puppy", [1, 3, 15])]
for variant, stage, w in origens:
    add("Origens", "Origens", None, variant, "dog", stage, None, "premium", None, w)

# --- Special Dog ---
specialdog = [("Premium Adulto", "adult", [1, 3, 15, 20]),
              ("Every Adulto", "adult", [1, 3, 15]),
              ("Sensitive Adulto", "adult", [1, 3, 15])]
for variant, stage, w in specialdog:
    add("Special Dog", "Special Dog", None, variant, "dog", stage, None, "standard", None, w)

# --- Hill's Science Diet (cão) ---
hills_dog = [("Adult", "adult", [3.5, 7.5, 12]), ("Adult Small Bites", "adult", [3.5, 7.5]),
             ("Puppy", "puppy", [3.5, 7.5, 12]), ("Adult 7+", "senior", [3.5, 7.5, 12]),
             ("Adult Sensitive Stomach & Skin", "adult", [3.5, 10.5])]
for variant, stage, w in hills_dog:
    add("Hill's Science Diet", "Hill's Pet Nutrition", "Science Diet", variant, "dog", stage,
        None, "super_premium", None, w)
hills_vet_dog = [("i/d Digestive Care", "gastrointestinal"), ("w/d Weight Management", "obesity"),
                  ("k/d Kidney Care", "renal"), ("u/d Urinary Care", "urinary"),
                  ("z/d Skin & Food Sensitivities", "hipoalergenico")]
for variant, ind in hills_vet_dog:
    add("Hill's Prescription Diet", "Hill's Pet Nutrition", "Prescription Diet", variant,
        "dog", "adult", None, "veterinary", ind, [1.5, 3.85, 7.98])

# --- Eukanuba ---
eukanuba = [("Adult Medium Breed", "adult", [2, 7.5, 15]), ("Puppy Medium Breed", "puppy", [2, 7.5]),
            ("Adult Small Breed", "adult", [2, 7.5])]
for variant, stage, w in eukanuba:
    add("Eukanuba", "Mars Petcare", None, variant, "dog", stage, None, "super_premium", None, w)

# --- Iams ---
iams = [("Adult Original", "adult", [3, 7.5, 15]), ("Puppy Original", "puppy", [3, 7.5])]
for variant, stage, w in iams:
    add("Iams", "Mars Petcare", None, variant, "dog", stage, None, "premium", None, w)

# --- Orijen ---
orijen = [("Original", "adult", [2, 6, 11.4]), ("Puppy", "puppy", [2, 6, 11.4]),
          ("Regional Red", "adult", [2, 6, 11.4]), ("Six Fish", "adult", [2, 6, 11.4])]
for variant, stage, w in orijen:
    add("Orijen", "Champion Petfoods", None, variant, "dog", stage, None, "super_premium", None, w)

# --- Acana ---
acana = [("Heritage Freshwater Fish", "adult", [2, 6, 11.4]),
         ("Heritage Puppy & Junior", "puppy", [2, 6, 11.4]),
         ("Regionals Wild Prairie", "adult", [2, 6, 11.4])]
for variant, stage, w in acana:
    add("Acana", "Champion Petfoods", None, variant, "dog", stage, None, "super_premium", None, w)

# --- Blue Buffalo ---
bluebuffalo = [("Life Protection Adult Chicken", "adult", [3.6, 15]),
               ("Wilderness Adult", "adult", [3.6, 12.9])]
for variant, stage, w in bluebuffalo:
    add("Blue Buffalo", "Blue Buffalo Co.", None, variant, "dog", stage, None,
        "super_premium", None, w)

# --- Marcas regionais/menores (confidence=low: marca confirmada, nomes de
#     linha e pesos sao estimativa generica, precisam verificacao Fase 2/3) ---
regional_dog_brands = [
    "Three Dogs", "Foster", "Baw Waw", "Max", "Champ", "Fino Trato", "Nero",
    "Qualiday", "Excellence", "Chronos", "Finotrato Prime", "Nature Fórmula", "Birbo",
]
for brand in regional_dog_brands:
    for variant, stage in [("Adulto", "adult"), ("Filhote", "puppy"), ("Sênior", "senior")]:
        add(brand, brand, None, variant, "dog", stage, None, "standard", None,
            [1, 3, 15], confidence="low")

# ============================================================
# GATOS
# ============================================================

# Orijen / Acana / Eukanuba / Iams tambem tem linhas para gatos
add("Orijen", "Champion Petfoods", None, "Cat & Kitten", "cat", "all", None,
    "super_premium", None, [1.8, 5.4])
add("Orijen", "Champion Petfoods", None, "Regional Red Cat", "cat", "adult", None,
    "super_premium", None, [1.8, 5.4])
add("Acana", "Champion Petfoods", None, "Grasslands Cat", "cat", "adult", None,
    "super_premium", None, [1.8, 5.4])
add("Eukanuba", "Mars Petcare", None, "Adult Cat", "cat", "adult", None,
    "super_premium", None, [1.5, 3])
add("Iams", "Mars Petcare", None, "Adult Cat", "cat", "adult", None,
    "premium", None, [1.5, 3])
add("Origens", "Origens", None, "Adulto Gatos", "cat", "adult", None,
    "premium", None, [1, 3])

regional_cat_brands = ["Magnus Cat", "MaxCat", "Bionatural", "Excellence", "Chanin",
                        "Fino Trato", "Qualiday"]
for brand in regional_cat_brands:
    for variant, stage in [("Adulto", "adult"), ("Castrados", "adult"), ("Filhote", "puppy")]:
        add(brand, brand, None, variant, "cat", stage, None, "standard", None,
            [1, 3, 10.1], confidence="low")

rc_cat = [("Indoor Adult", "adult", [1.5, 4, 7.5]), ("Sterilised Adult", "adult", [1.5, 4, 7.5]),
          ("Kitten", "puppy", [0.4, 2, 4]), ("Persian Adult", "adult", [2, 4]),
          ("Siamese Adult", "adult", [2, 4]), ("Fit 32 Adult", "adult", [1.5, 4]),
          ("Hairball Care Adult", "adult", [1.5, 4])]
for variant, stage, w in rc_cat:
    add("Royal Canin", "Royal Canin do Brasil", "Feline Health Nutrition", variant,
        "cat", stage, None, "super_premium", None, w)
rc_cat_vet = [("Urinary S/O", "urinary"), ("Renal", "renal"), ("Satiety Weight Management", "obesity")]
for variant, ind in rc_cat_vet:
    add("Royal Canin", "Royal Canin do Brasil", "Veterinary Diet", variant, "cat", "adult",
        None, "veterinary", ind, [0.4, 1.5, 3.5])

premier_cat = [("Seleção Natural Adultos", "adult"), ("Seleção Natural Castrados", "adult"),
               ("Seleção Natural Filhotes", "puppy")]
for variant, stage in premier_cat:
    add("Premier Pet", "Premier Pet", "Seleção Natural", variant, "cat", stage, None,
        "super_premium", None, [1, 3, 7.5])

golden_cat = [("Fórmula Gatos Adultos", "adult"), ("Fórmula Gatos Castrados", "adult"),
              ("Fórmula Gatos Filhotes", "puppy")]
for variant, stage in golden_cat:
    add("Golden", "Premier Pet", "Fórmula Gatos", variant, "cat", stage, None,
        "premium_especial", None, [1, 3, 10.1])

whiskas_cat = [("Adulto Carne", "adult"), ("Adulto Peixe", "adult"), ("Filhote", "puppy"),
               ("1+ Castrados", "adult")]
for variant, stage in whiskas_cat:
    add("Whiskas", "Mars Petcare", None, variant, "cat", stage, None, "standard", None, [1, 3, 10.1])

proplan_cat = [("Adult Complete", "adult"), ("Sterilised Adult", "adult"), ("Kitten", "puppy")]
for variant, stage in proplan_cat:
    add("Purina Pro Plan", "Nestlé Purina", "Pro Plan", variant, "cat", stage, None,
        "super_premium", None, [1.5, 3, 7.5])

catchow_cat = [("Adulto", "adult"), ("Castrados", "adult"), ("Filhote", "puppy")]
for variant, stage in catchow_cat:
    add("Cat Chow", "Nestlé Purina", None, variant, "cat", stage, None, "standard", None, [1, 3, 10.1])

friskies_cat = [("Adulto Carnes", "adult"), ("Filhote", "puppy")]
for variant, stage in friskies_cat:
    add("Friskies", "Nestlé Purina", None, variant, "cat", stage, None, "standard", None, [1, 3, 10.1])

granplus_cat = [("Menu Cat Adulto", "adult"), ("Menu Cat Castrados", "adult")]
for variant, stage in granplus_cat:
    add("GranPlus", "GranPlus", "Menu Cat", variant, "cat", stage, None, "standard", None, [1, 3, 10.1])

guabi_cat = [("Adulto", "adult"), ("Castrados", "adult")]
for variant, stage in guabi_cat:
    add("Guabi Natural", "Guabi", None, variant, "cat", stage, None, "premium", None, [1, 3, 10.1])

biofresh_cat = [("Adulto", "adult"), ("Castrados", "adult")]
for variant, stage in biofresh_cat:
    add("Biofresh", "Biofresh", None, variant, "cat", stage, None, "premium", None, [1, 3, 10.1])

formula_natural_cat = [("Adulto", "adult"), ("Castrados", "adult")]
for variant, stage in formula_natural_cat:
    add("Fórmula Natural", "Fórmula Natural", None, variant, "cat", stage, None,
        "super_premium", None, [1, 7])

farmina_cat = ["Chicken & Pomegranate Adult", "Ocean Fish & Orange Adult",
               "Chicken & Pomegranate Kitten"]
for variant in farmina_cat:
    add("Farmina N&D", "Farmina Pet Foods", "N&D", variant, "cat",
        "puppy" if "Kitten" in variant else "adult", None, "super_premium", None, [1.5, 5])

specialcat = [("Premium Adulto", "adult"), ("Premium Castrados", "adult")]
for variant, stage in specialcat:
    add("Special Cat", "Special Dog", None, variant, "cat", stage, None, "standard", None, [1, 3, 10.1])

hills_cat = [("Adult", "adult"), ("Indoor Adult", "adult"), ("Kitten", "puppy")]
for variant, stage in hills_cat:
    add("Hill's Science Diet", "Hill's Pet Nutrition", "Science Diet", variant, "cat", stage,
        None, "super_premium", None, [1.5, 3.5, 7])
hills_vet_cat = [("c/d Urinary Care", "urinary"), ("k/d Kidney Care", "renal")]
for variant, ind in hills_vet_cat:
    add("Hill's Prescription Diet", "Hill's Pet Nutrition", "Prescription Diet", variant,
        "cat", "adult", None, "veterinary", ind, [1.5, 3.85])

quatree_cat = [("Gourmet Cat Adulto", "adult")]
for variant, stage in quatree_cat:
    add("Quatree", "Quatree", None, variant, "cat", stage, None, "premium", None, [1, 3, 10.1])

# ============================================================

def slugify(*parts):
    text = " ".join(p for p in parts if p)
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", "-", text.strip())
    return text[:80]

def fmt_weight(w):
    return (f"{w:g}kg").replace(".", "-")

seen_ids = {}
for e in ENTRIES:
    base = slugify(e["brand"], e["line"], e["variant"], fmt_weight(e["weight_kg"]))
    slug = base
    n = 2
    while slug in seen_ids:
        slug = f"{base}-{n}"
        n += 1
    seen_ids[slug] = True
    e["id"] = slug

out = {
    "schema_version": "2.0",
    "phase": "phase1_ai_compiled",
    "note": (
        "Matriz de marca/linha/especie/categoria/peso (1 item = 1 SKU real) "
        "compilada por IA a partir de conhecimento geral do mercado "
        "brasileiro de racoes. NAO contem codigo de barras, foto oficial ou "
        "peso/preco verificados linha a linha -- esses campos ficam null "
        "ate a Fase 2/3 (coleta e verificacao contra fontes reais). Ver "
        "campo confidence: 'low' = marca regional/menos conhecida, nomes de "
        "linha nao confirmados, tratar como esqueleto a verificar antes de "
        "usar para reconhecimento automatico."
    ),
    "total": len(ENTRIES),
    "items": ENTRIES,
}

import os
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "src", "catalogs", "food_database", "foods_br_phase1.json"
)
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"Gerado: {len(ENTRIES)} entradas")
brands = sorted(set(e["brand"] for e in ENTRIES))
print(f"Marcas ({len(brands)}): {', '.join(brands)}")
