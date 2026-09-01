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


def test_scalibor_without_length_can_still_match_by_size_words():
    expected = ProductIdentity.build(canonical_name="Coleira Antiparasitaria Scalibor 48cm", brand="Scalibor")
    result = evaluate_identity(
        expected,
        MerchantCandidate.build(merchant="shopee", title="Coleira Scalibor para caes pequenos e medios", brand="Scalibor"),
    )

    assert result.accepted is True
    assert _statuses(result)["length_cm"] == AttributeStatus.UNKNOWN
    assert _statuses(result)["breed_size"] == AttributeStatus.MATCH


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
