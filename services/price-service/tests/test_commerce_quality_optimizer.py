import json
from datetime import datetime, timezone

from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.commerce_quality_optimizer import (
    collect_pet_commerce_items,
    compute_status,
    optimize_commerce_quality,
    suggest_gtins_for_item,
)
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.product_catalog_lookup import ProductCatalog, ProductLearningEvent, ProductReliableCatalog
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord
from src.events.models import Event


def _pet(db, pet_id="pet-1"):
    pet = Pet(id=pet_id, user_id="user-1", name="Baby", species="dog")
    db.add(pet)
    db.flush()
    return pet


def test_collect_pet_commerce_items_finds_missing_barcodes():
    with SessionLocal() as db:
        _pet(db)
        db.add(FeedingPlan(
            id="food-plan",
            pet_id="pet-1",
            species="dog",
            country_code="BR",
            food_brand="Royal Canin Mini Adult",
            enabled=True,
            items_json=json.dumps([
                {"id": "food-1", "label": "Royal Canin Mini Adult", "barcode": "", "is_primary": True},
                {"id": "food-2", "label": "Scalibor Coleira", "barcode": "7896185957009", "is_primary": False},
            ]),
        ))
        db.add(ParasiteControlRecord(
            id="parasite-1",
            pet_id="pet-1",
            type="collar",
            product_name="Scalibor Coleira",
            barcode=None,
            date_applied=datetime(2026, 8, 1, tzinfo=timezone.utc),
        ))
        db.add(Event(
            id="med-1",
            user_id="user-1",
            pet_id="pet-1",
            type="medication",
            status="pending",
            scheduled_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            title="Drontal",
            notes="Dose: 1 comprimido",
        ))
        db.commit()

        items = collect_pet_commerce_items(db)
        without_barcode = [item for item in items if not item.gtin]

        assert len(items) == 4
        assert {item.source for item in without_barcode} == {"feeding", "parasite", "medication"}


def test_optimizer_enriches_catalog_image_from_awin_feed_without_external_api():
    gtin = "7896185957009"
    with SessionLocal() as db:
        _pet(db)
        db.add(FeedingPlan(
            id="food-plan",
            pet_id="pet-1",
            species="dog",
            country_code="BR",
            enabled=True,
            items_json=json.dumps([
                {"id": "food-1", "label": "Scalibor Coleira", "barcode": gtin, "is_primary": True},
            ]),
        ))
        db.add(AffiliateFeedOffer(
            network="awin",
            merchant="cobasi",
            advertiser_id="17870",
            external_product_id="sku-scalibor",
            gtin=gtin,
            title="SCALIBOR COLEIRA SCALIBOR ANTIPARASITÁRIA PARA CÃES",
            brand="Scalibor",
            category="collar",
            price=80.90,
            in_stock=True,
            affiliate_url="https://www.awin1.com/pclick.php?p=1&a=3032803&m=17870",
            image_url="https://img.example/scalibor.jpg",
            active=True,
        ))
        db.commit()

        before = compute_status(db, collect_pet_commerce_items(db)[0])
        result = optimize_commerce_quality(db, dry_run=False, limit=10, sync_shopee=False, resolve_gtin=False)
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin))

        assert "catalog_product" in before.missing
        assert result.enriched_from_feed == 1
        assert product is not None
        assert product.name.startswith("SCALIBOR COLEIRA")
        assert product.thumbnail_url == "https://img.example/scalibor.jpg"


def test_missing_barcode_gets_learning_suggestion_but_is_not_autofilled():
    gtin = "7891000100103"
    with SessionLocal() as db:
        _pet(db)
        db.add(FeedingPlan(
            id="food-plan",
            pet_id="pet-1",
            species="dog",
            country_code="BR",
            enabled=True,
            items_json=json.dumps([
                {"id": "food-1", "label": "Royal Canin Mini Adult 7,5kg", "barcode": "", "is_primary": True},
            ]),
        ))
        db.add(ProductReliableCatalog(
            canonical_key="royal-canin-mini-adult",
            canonical_name="Royal Canin Mini Adult 7,5kg",
            aliases_json=json.dumps(["Royal Canin Mini Adult"]),
            gtins_json=json.dumps([gtin]),
            brand="Royal Canin",
            category="food",
            confirmation_count=3,
            correction_count=0,
        ))
        db.commit()

        item = collect_pet_commerce_items(db)[0]
        suggestions = suggest_gtins_for_item(db, item)
        result = optimize_commerce_quality(db, dry_run=False, limit=10)

        assert item.gtin is None
        assert suggestions[0].gtin == gtin
        assert result.suggestions == 1
        assert db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin)) is None


def test_optimizer_autofills_only_safe_unambiguous_gtin():
    gtin = "7898201802485"
    with SessionLocal() as db:
        _pet(db)
        db.add(FeedingPlan(
            id="food-plan",
            pet_id="pet-1",
            species="dog",
            country_code="BR",
            enabled=True,
            items_json=json.dumps([
                {"id": "food-1", "label": "Produto 1", "barcode": "", "is_primary": True},
                {"id": "food-2", "label": "Vermífugo Vermivet Composto 600 mg Biovet", "barcode": "", "is_primary": False},
            ]),
        ))
        db.add(AffiliateFeedOffer(
            network="awin",
            merchant="cobasi",
            advertiser_id="17870",
            external_product_id="vermivet",
            gtin=gtin,
            title="Vermífugo Vermivet Composto 600 mg Biovet - 4 comprimidos",
            brand="Vermivet",
            category="dewormer",
            price=14.9,
            in_stock=True,
            affiliate_url="https://www.awin1.com/pclick.php?p=1&a=3032803&m=17870",
            image_url="https://img.example/vermivet.jpg",
            active=True,
        ))
        db.commit()

        result = optimize_commerce_quality(
            db,
            dry_run=False,
            limit=10,
            autofill_safe_gtin=True,
        )
        plan = db.get(FeedingPlan, "food-plan")
        items = json.loads(plan.items_json)

        assert result.gtin_autofilled == 1
        assert items[0]["barcode"] == ""
        assert items[1]["barcode"] == gtin


def test_optimizer_autofills_from_confirmed_pet_learning_event():
    gtin = "7896112410010"
    with SessionLocal() as db:
        _pet(db)
        db.add(Event(
            id="med-1",
            user_id="user-1",
            pet_id="pet-1",
            type="medication",
            status="pending",
            scheduled_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            title="Cistimicin Vet",
            notes="Uso conforme prescrição",
        ))
        db.add(ProductLearningEvent(
            barcode_normalized=gtin,
            resolved_name="Cistimicin Vet 30g cães 30 comprimidos",
            probable_name="Cistimicin Vet",
            detected_brand="Avert",
            resolved_category="medication",
            tutor_confirmed=True,
            tutor_corrected=False,
            pet_id="pet-1",
        ))
        db.commit()

        item = collect_pet_commerce_items(db)[0]
        suggestions = suggest_gtins_for_item(db, item)
        result = optimize_commerce_quality(
            db,
            dry_run=False,
            limit=10,
            autofill_safe_gtin=True,
        )
        event = db.get(Event, "med-1")

        assert suggestions[0].source == "pet_learning"
        assert suggestions[0].gtin == gtin
        assert result.gtin_autofilled == 1
        assert "Código de barras: 7896112410010" in (event.notes or "")


def test_optimizer_propagates_same_pet_sheet_barcode_to_generic_item():
    gtin = "7896185907004"
    with SessionLocal() as db:
        _pet(db)
        db.add(ParasiteControlRecord(
            id="parasite-coded",
            pet_id="pet-1",
            type="collar",
            product_name="SCALIBOR COLEIRA SCALIBOR ANTIPARASITÁRIA PARA CÃES",
            barcode=gtin,
            date_applied=datetime(2026, 8, 1, tzinfo=timezone.utc),
        ))
        db.add(ParasiteControlRecord(
            id="parasite-generic",
            pet_id="pet-1",
            type="collar",
            product_name="Scalibor",
            barcode=None,
            date_applied=datetime(2026, 8, 2, tzinfo=timezone.utc),
        ))
        db.add(AffiliateFeedOffer(
            network="awin",
            merchant="cobasi",
            advertiser_id="17870",
            external_product_id="scalibor-small",
            gtin="7896185957009",
            title="Coleira Antiparasitária Scalibor Cães Pequenos e Médios - 48 cm",
            brand="Scalibor",
            category="collar",
            price=80.9,
            in_stock=True,
            affiliate_url="https://www.awin1.com/pclick.php?p=1&a=3032803&m=17870",
            active=True,
        ))
        db.commit()

        result = optimize_commerce_quality(
            db,
            dry_run=False,
            limit=10,
            autofill_safe_gtin=True,
        )
        generic = db.get(ParasiteControlRecord, "parasite-generic")

        assert result.gtin_autofilled == 1
        assert generic.barcode == gtin


def test_collect_pet_commerce_items_ignores_commerce_excluded_medication():
    with SessionLocal() as db:
        _pet(db)
        db.add(Event(
            id="med-excluded",
            user_id="user-1",
            pet_id="pet-1",
            type="medication",
            status="pending",
            scheduled_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            title="Receita manipulada",
            notes="Dose: 1 ml",
            extra_data=json.dumps({"commerce_excluded": True, "commerce_excluded_reason": "no_barcode_non_commercial"}),
        ))
        db.add(Event(
            id="med-buyable",
            user_id="user-1",
            pet_id="pet-1",
            type="medication",
            status="pending",
            scheduled_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            title="Cistimicin Vet",
            notes="Código de barras: 7896112410010",
        ))
        db.commit()

        items = collect_pet_commerce_items(db)

        assert [item.record_id for item in items] == ["med-buyable"]


def test_commerce_excluded_medication_returns_when_barcode_is_added():
    with SessionLocal() as db:
        _pet(db)
        db.add(Event(
            id="med-excluded-with-barcode",
            user_id="user-1",
            pet_id="pet-1",
            type="medication",
            status="pending",
            scheduled_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            title="Meloxicam 2mg",
            notes="Dose: 0,5 comprimido\nCódigo de barras: 7891234500000",
            extra_data=json.dumps({"commerce_excluded": True, "commerce_excluded_reason": "no_barcode_non_commercial"}),
        ))
        db.commit()

        items = collect_pet_commerce_items(db)

        assert len(items) == 1
        assert items[0].record_id == "med-excluded-with-barcode"
        assert items[0].gtin == "7891234500000"
