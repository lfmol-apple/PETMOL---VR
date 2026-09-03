from src.product_identity import (
    AttributeStatus,
    IdentityDecision,
    MerchantCandidate,
    ProductIdentity,
    evaluate_identity,
)


def _statuses(result):
    return {item.attribute: item.status for item in result.attributes}


def test_gtin_exact_accepts_identity_but_keeps_canonical_truth():
    expected = ProductIdentity.build(
        gtin="7891234567890",
        canonical_name="PETMOL Canonical Collar 48cm",
        brand="Scalibor",
        species="dog",
        length_cm=48.0,
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="cobasi",
            gtin="7891234567890",
            title="Scalibor coleira antiparasitaria para caes 48 cm",
            brand="Scalibor",
        ),
    )

    assert result.decision == IdentityDecision.EXACT
    assert result.confidence == 1.0
    assert "GTIN_EXACT" in result.reasons


def test_gtin_same_does_not_override_objective_species_conflict():
    expected = ProductIdentity.build(gtin="7891234567890", canonical_name="Racao Canina 10kg", brand="Marca", species="dog")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="merchant",
            gtin="7891234567890",
            title="Racao Marca para gatos 10kg",
            brand="Marca",
        ),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "SPECIES_CONFLICT" in result.reasons


def test_weight_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Royal Canin Urinary Small Dog 7,5kg", brand="Royal Canin")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Royal Canin Urinary Small Dog 1,5kg", brand="Royal Canin"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert _statuses(result)["weight_kg"] == AttributeStatus.CONFLICT


def test_veterinary_diet_vs_regular_food_same_brand_size_is_conflict():
    # Ração do Baby: "Veterinary Diet Urinary Small Dog 7,5kg". Anúncio
    # "Royal Canin Mini Indoro Porte Pequeno 7,5kg" partilha marca + peso +
    # porte, mas é ração COMUM, não dieta veterinária — SKU e preço
    # diferentes. Sem o marcador terapêutico no anúncio => CONFLITO.
    expected = ProductIdentity.build(
        canonical_name="Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno 7,5kg",
        brand="Royal Canin",
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="shopee",
            title="RAÇÃO ROYAL CANIN MINI INDOOR CÃES ADULTOS PORTE PEQUENO 7.5KG",
            brand="Royal Canin",
        ),
    )
    assert result.accepted is False
    assert "THERAPEUTIC_ATTRIBUTES_CONFLICT" in result.reasons


def test_veterinary_diet_matches_listing_that_names_the_line():
    expected = ProductIdentity.build(
        canonical_name="Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno 7,5kg",
        brand="Royal Canin",
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="shopee",
            title="Royal Canin Veterinary Canine Urinary S/O Small 7,5kg",
            brand="Royal Canin",
        ),
    )
    assert result.accepted is True
    assert _statuses(result)["therapeutic_attributes"] == AttributeStatus.MATCH


def test_therapeutic_line_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Royal Canin Veterinary Urinary S/O Small Dog 7,5kg", brand="Royal Canin")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Royal Canin Veterinary Renal Small Dog 7,5kg", brand="Royal Canin"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "THERAPEUTIC_ATTRIBUTES_CONFLICT" in result.reasons


def test_breed_size_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Royal Canin Mini Adult Caes Adultos 15kg", brand="Royal Canin")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Royal Canin Maxi Adult Caes Adultos 15kg", brand="Royal Canin"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "BREED_SIZE_CONFLICT" in result.reasons


def test_breed_size_pm_product_matches_p_only_listing():
    # Produto "Pequenos e Médios" (P/M) x anúncio que diz só "TAM P" — mesma
    # coleira. Faixa P/M cobre P; não é conflito. (Era o que fazia o sync
    # recusar a Scalibor 48cm certa: feed "Pequenos e Médios" -> small_medium,
    # anúncio "48CM TAM P" -> small, e o _compare_exact tratava como conflito.)
    expected = ProductIdentity.build(
        canonical_name="Coleira Antiparasitaria Scalibor Caes Pequenos e Medios", brand="Scalibor"
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="shopee",
            title="COLEIRA SCALIBOR 48CM LEISHMANIOSE ANTIPULGA CARRAPATO TAM P",
            brand="Scalibor",
        ),
    )
    assert result.accepted is True
    assert _statuses(result)["breed_size"] == AttributeStatus.MATCH
    assert "BREED_SIZE_CONFLICT" not in result.reasons


def test_breed_size_pm_product_still_conflicts_with_large_listing():
    expected = ProductIdentity.build(
        canonical_name="Coleira Antiparasitaria Scalibor Caes Pequenos e Medios", brand="Scalibor"
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="shopee",
            title="Coleira Scalibor Antipulgas Carrapatos Caes Porte Grande",
            brand="Scalibor",
        ),
    )
    assert result.decision == IdentityDecision.CONFLICT
    assert "BREED_SIZE_CONFLICT" in result.reasons


def test_life_stage_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Royal Canin Mini Adult Caes 15kg", brand="Royal Canin")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Royal Canin Mini Puppy Caes 15kg", brand="Royal Canin"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "LIFE_STAGE_CONFLICT" in result.reasons


def test_scalibor_length_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitaria Scalibor 48cm", brand="Scalibor")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Coleira Scalibor Antiparasitaria para Caes 65cm", brand="Scalibor"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "LENGTH_KG_CONFLICT" not in result.reasons
    assert "LENGTH_CM_CONFLICT" in result.reasons


def test_scalibor_size_words_resolve_to_length_cm_and_match():
    # I4/I6: "Scalibor pequenos e médios" e "Scalibor 48cm" são a mesma coleira —
    # a letra/porte vira length_cm no Identity Engine (tabela fechada).
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitaria Scalibor 48cm", brand="Scalibor")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Coleira Scalibor para caes pequenos e medios", brand="Scalibor"),
    )

    assert result.accepted is True
    assert _statuses(result)["length_cm"] == AttributeStatus.MATCH
    assert _statuses(result)["breed_size"] == AttributeStatus.MATCH


def test_scalibor_48_vs_65_is_length_conflict_via_size_words():
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitaria Scalibor M", brand="MSD")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Coleira Scalibor Caes Grandes 65cm", brand="Scalibor"),
    )
    assert result.decision == IdentityDecision.CONFLICT
    assert "LENGTH_CM_CONFLICT" in result.reasons


def test_multipack_listing_conflicts_with_single_unit_product():
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitaria Scalibor 48cm", brand="Scalibor")
    kit = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Kit 3 Coleiras Scalibor 48cm Antiparasitaria", brand="Scalibor"),
    )
    assert kit.decision == IdentityDecision.CONFLICT
    assert "MULTIPACK_CONFLICT" in kit.reasons
    single = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Coleira Scalibor 48cm Antiparasitaria", brand="Scalibor"),
    )
    assert single.accepted is True


def test_animal_weight_range_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Revolution Caes 5,1kg a 10kg 1 pipeta", brand="Revolution")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Revolution Caes 10,1kg a 20kg 1 pipeta", brand="Revolution"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "ANIMAL_WEIGHT_RANGE_CONFLICT" in result.reasons


def test_volume_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Glicopan Pet 30ml", brand="Vetnil")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Glicopan Pet Vetnil 250ml", brand="Vetnil"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "VOLUME_ML_CONFLICT" in result.reasons


def test_pack_count_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Drontal Plus Caes 2 comprimidos", brand="Drontal")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Drontal Plus Caes 4 comprimidos", brand="Drontal"),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "PACK_COUNT_CONFLICT" in result.reasons


def test_flavor_variation_is_conflict():
    expected = ProductIdentity.build(canonical_name="Biscoito Pedigree Biscrok Carne 500g", brand="Pedigree")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="shopee",
            title="Biscoito Pedigree Biscrok Multisabor 500g",
            brand="Pedigree",
        ),
    )

    assert result.decision == IdentityDecision.CONFLICT
    assert "FLAVOR_CONFLICT" in result.reasons


def test_same_product_with_different_merchant_title_is_high_confidence():
    expected = ProductIdentity.build(
        canonical_name="Royal Canin Veterinary Diet Urinary S/O Small Dog 7,5kg",
        brand="Royal Canin",
    )
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="RC Veterinary Urinary SO Small Dog 7,5 kg", brand="Royal Canin"),
    )

    assert result.accepted is True
    assert result.decision == IdentityDecision.HIGH_CONFIDENCE
    assert "WEIGHT_KG_MATCH" in result.reasons


def test_missing_size_is_unknown_not_conflict_and_not_enough_for_structured_sku():
    expected = ProductIdentity.build(canonical_name="Shampoo Pet Society Hydra Pelos Claros 300ml", brand="Pet Society")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Shampoo Pet Society Hydra Pelos Claros", brand="Pet Society"),
    )

    assert result.decision == IdentityDecision.NO_MATCH
    assert _statuses(result)["volume_ml"] == AttributeStatus.UNKNOWN
    assert "MISSING_VOLUME_ML" in result.reasons


def test_price_is_not_identity_evidence():
    expected = ProductIdentity.build(canonical_name="Shampoo Pet Society Hydra Pelos Claros 300ml", brand="Pet Society")
    cheap_wrong = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Shampoo Pet Society Hydra Pelos Claros 5L", brand="Pet Society", price=65.99),
    )
    expensive_right = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Shampoo Pet Society Hydra Pelos Claros 300ml", brand="Pet Society", price=554.31),
    )

    assert cheap_wrong.decision == IdentityDecision.CONFLICT
    assert expensive_right.accepted is True


def test_manufacturer_name_is_normalized_to_shelf_brand_from_product_name():
    from src.product_identity import normalize_brand

    # feed põe o fabricante no lugar da marca; o nome do produto tem a marca
    assert normalize_brand("MSD", name_hint="Coleira Antiparasitária Scalibor M") == "Scalibor"
    assert normalize_brand("Boehringer Ingelheim", name_hint="Antipulgas NexGard Cães 4,1 a 10kg") == "Nexgard"
    # sem a marca no nome, ou marca que não é fabricante: intocado
    assert normalize_brand("MSD", name_hint="Produto Genérico") == "MSD"
    assert normalize_brand("Golden", name_hint="Ração Golden Fórmula") == "Golden"


def test_manufacturer_brand_does_not_conflict_with_shelf_brand_of_same_product():
    # catálogo com "MSD" (fabricante) vs oferta "Scalibor" (prateleira) —
    # mesma coleira, não pode ser CONFLICT de marca
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitária Scalibor M", brand="MSD", species="dog")
    assert expected.brand == "Scalibor"
    same = evaluate_identity(
        expected,
        MerchantCandidate.build(
            merchant="cobasi",
            title="Coleira Antiparasitária Scalibor Cães Pequenos e Médios - 48 cm",
            brand="Scalibor",
        ),
    )
    assert same.decision != IdentityDecision.CONFLICT
    assert same.accepted is True


def test_gtin14_leading_zero_collapses_to_gtin13():
    from src.product_catalog_lookup import normalize_gtin
    assert normalize_gtin("07896185908001") == "7896185908001"
    assert normalize_gtin("7896185908001") == "7896185908001"
    # GTIN-14 real (dígito indicador != 0) é preservado
    assert normalize_gtin("17896185908008") == "17896185908008"


def test_animal_weight_range_covers_mais_de_and_e_phrasings():
    from src.product_identity import extract_animal_weight_range_kg as awr
    assert awr("Advocate Cães mais de 25kg") == (25.0, 75.0)
    assert awr("Advocate Gatos entre 4 e 8kg") == (4.0, 8.0)
    assert awr("Antipulgas para Cães acima de 40kg") == (40.0, 120.0)


def test_light_only_tags_obesity_with_food_context():
    from src.product_identity import _infer_therapeutics
    assert "obesity" not in _infer_therapeutics("Roupa Pós-Cirúrgica Dry Light para Cães")
    assert "obesity" in _infer_therapeutics("Ração Golden Light Cães Adultos")


def test_manufacturer_to_brands_map_is_well_formed():
    from src.product_identity import _MANUFACTURER_TO_BRANDS, normalize_brand
    for maker, brands in _MANUFACTURER_TO_BRANDS.items():
        assert maker == maker.lower(), f"chave de fabricante deve ser minúscula: {maker!r}"
        assert len(brands) == len(set(brands)), f"marcas duplicadas em {maker!r}"
    # a substituição só acontece com correspondência ÚNICA no nome — dois
    # brands do mesmo fabricante no título → não troca (fica o original).
    assert normalize_brand("Elanco", name_hint="Drontal e Credelio combo") == "Elanco"
    assert normalize_brand("Elanco", name_hint="Drontal Plus Cães") == "Drontal"
