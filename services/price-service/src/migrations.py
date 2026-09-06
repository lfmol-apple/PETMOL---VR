"""Lightweight DB migrations for PETMOL.

This project uses `Base.metadata.create_all()` on startup but does not have a full
migration framework. For SQLite, we apply small, additive migrations using
`ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info` checks.

Keep migrations minimal, idempotent, and additive only.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine


def _wipe_pet_documents_dir() -> None:
    """Apaga a pasta de arquivos do 'cofre de documentos' descontinuado.
    Best-effort e idempotente: depois da 1ª execução a pasta não existe
    mais e vira no-op."""
    docs_dir = Path(__file__).resolve().parent.parent / "uploads" / "pet_documents"
    if docs_dir.is_dir():
        shutil.rmtree(docs_dir, ignore_errors=True)


def _sqlite_column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    return any(r[1] == column for r in rows)


def _sqlite_add_column_if_missing(conn, table: str, column: str, ddl_type: str) -> bool:
    if _sqlite_column_exists(conn, table, column):
        return False
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
    return True


def _pg_add_column_if_missing(conn, table: str, column: str, ddl_type: str) -> bool:
    """Add column to a PostgreSQL table if it doesn't exist yet."""
    row = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).fetchone()
    if row:
        return False
    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}" {ddl_type}'))
    return True


def _pg_column_type(conn, table: str, column: str) -> str | None:
    row = conn.execute(text(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).fetchone()
    return str(row[0]).lower() if row and row[0] is not None else None


def run_pg_migrations(engine: Engine) -> None:
    """Run additive, idempotent migrations for PostgreSQL."""
    if engine.dialect.name not in ("postgresql", "postgres"):
        return

    with engine.begin() as conn:
        # users: email verification (Jul 2026)
        _pg_add_column_if_missing(conn, "users", "email_verified", "BOOLEAN DEFAULT FALSE NOT NULL")

        # pets: insurance plan (Mar 2026)
        _pg_add_column_if_missing(conn, "pets", "insurance_provider", "TEXT")

        # vaccine_records: country catalog fields (Fev 2026)
        _pg_add_column_if_missing(conn, "vaccine_records", "vaccine_code", "TEXT")
        _pg_add_column_if_missing(conn, "vaccine_records", "country_code", "TEXT")
        _pg_add_column_if_missing(conn, "vaccine_records", "next_due_source", "TEXT DEFAULT 'unknown'")
        _pg_add_column_if_missing(conn, "vaccine_records", "deleted_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "vaccine_records", "record_type", "TEXT DEFAULT 'confirmed_application'")
        _pg_add_column_if_missing(conn, "vaccine_records", "alert_days_before", "INTEGER")
        _pg_add_column_if_missing(conn, "vaccine_records", "reminder_date", "DATE")
        _pg_add_column_if_missing(conn, "vaccine_records", "reminder_time", "TEXT")
        _pg_add_column_if_missing(conn, "vaccine_records", "reminder_enabled", "BOOLEAN DEFAULT FALSE")
        _pg_add_column_if_missing(conn, "parasite_control_records", "reminder_date", "DATE")
        _pg_add_column_if_missing(conn, "parasite_control_records", "reminder_time", "TEXT")
        _pg_add_column_if_missing(conn, "events", "deleted_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "feeding_plans", "deleted_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "feeding_plans", "items_json", "TEXT DEFAULT '[]'")
        _pg_add_column_if_missing(conn, "feeding_plans", "last_food_push_date", "DATE")
        _pg_add_column_if_missing(conn, "feeding_plans", "duration_days", "INTEGER")
        _pg_add_column_if_missing(conn, "feeding_plans", "reminder_time", "TEXT")
        _pg_add_column_if_missing(conn, "feeding_plans", "reminder_source", "TEXT DEFAULT 'calculated'")

        # users: terms / monthly-checkin
        _pg_add_column_if_missing(conn, "users", "terms_accepted", "BOOLEAN DEFAULT FALSE")
        _pg_add_column_if_missing(conn, "users", "terms_version", "TEXT")
        _pg_add_column_if_missing(conn, "users", "terms_accepted_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "users", "monthly_checkin_day", "INTEGER DEFAULT 5")
        _pg_add_column_if_missing(conn, "users", "monthly_checkin_hour", "INTEGER DEFAULT 9")
        _pg_add_column_if_missing(conn, "users", "monthly_checkin_minute", "INTEGER DEFAULT 0")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                token_hash  TEXT UNIQUE NOT NULL,
                expires_at  TIMESTAMPTZ NOT NULL,
                used_at     TIMESTAMPTZ,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)"))

        # Consentimentos explícitos por usuário para processamento de fotos por IA.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_consents (
                id              TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                provider        TEXT NOT NULL,
                consent_type    TEXT NOT NULL,
                policy_version  TEXT NOT NULL,
                granted_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                revoked_at      TIMESTAMPTZ,
                CONSTRAINT uq_user_consents_active_scope
                    UNIQUE (user_id, provider, consent_type, policy_version)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_consents_provider ON user_consents (provider)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents (consent_type)"))

        # establishments: CNPJ + terms
        _pg_add_column_if_missing(conn, "establishments", "cnpj", "TEXT")
        _pg_add_column_if_missing(conn, "establishments", "terms_version", "TEXT")
        _pg_add_column_if_missing(conn, "establishments", "terms_accepted_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "establishments", "terms_accepted_ip", "TEXT")
        _pg_add_column_if_missing(conn, "establishments", "terms_accepted_user_agent", "TEXT")

        # notification_pendencies: persistent in-app alerts (Apr 2026)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notification_pendencies (
                id           TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                pet_id       TEXT,
                type         TEXT NOT NULL,
                event_id     TEXT,
                title        TEXT NOT NULL,
                message      TEXT NOT NULL,
                deep_link    TEXT NOT NULL,
                priority     INTEGER DEFAULT 50,
                status       TEXT DEFAULT 'active',
                snoozed_until TIMESTAMPTZ,
                created_at   TIMESTAMPTZ DEFAULT NOW(),
                expires_at   TIMESTAMPTZ,
                updated_at   TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_notif_pend_user ON notification_pendencies (user_id)"
        ))
        if _pg_column_type(conn, "notification_pendencies", "user_id") in {"integer", "bigint", "smallint"}:
            conn.execute(text(
                'ALTER TABLE "notification_pendencies" '
                'ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::text'
            ))
        if _pg_column_type(conn, "notification_pendencies", "pet_id") in {"integer", "bigint", "smallint"}:
            conn.execute(text(
                'ALTER TABLE "notification_pendencies" '
                'ALTER COLUMN "pet_id" TYPE TEXT USING "pet_id"::text'
            ))

        # Product learning memory (Apr 2026)
        _pg_add_column_if_missing(conn, "product_correction_events", "brand", "TEXT")
        _pg_add_column_if_missing(conn, "product_correction_events", "weight", "TEXT")
        _pg_add_column_if_missing(conn, "product_correction_events", "probable_name", "TEXT")
        _pg_add_column_if_missing(conn, "product_correction_events", "visible_text", "TEXT")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_learning_events (
                id BIGSERIAL PRIMARY KEY,
                barcode_normalized TEXT,
                ocr_raw_text TEXT,
                visible_text TEXT,
                probable_name TEXT,
                detected_brand TEXT,
                detected_species TEXT,
                detected_life_stage TEXT,
                detected_weight TEXT,
                resolved_name TEXT NOT NULL,
                resolved_category TEXT,
                decision_source TEXT,
                decision_score DOUBLE PRECISION,
                decision_result TEXT,
                tutor_confirmed BOOLEAN DEFAULT TRUE,
                tutor_corrected BOOLEAN DEFAULT FALSE,
                corrected_name TEXT,
                ai_suggested_name TEXT,
                pet_id TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_learning_events_barcode ON product_learning_events (barcode_normalized)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_learning_events_created_at ON product_learning_events (created_at)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_reliable_catalog (
                id BIGSERIAL PRIMARY KEY,
                canonical_key TEXT UNIQUE NOT NULL,
                canonical_name TEXT NOT NULL,
                aliases_json TEXT NOT NULL DEFAULT '[]',
                gtins_json TEXT NOT NULL DEFAULT '[]',
                brand TEXT,
                category TEXT,
                species TEXT,
                life_stage TEXT,
                weight TEXT,
                confirmation_count INTEGER NOT NULL DEFAULT 0,
                correction_count INTEGER NOT NULL DEFAULT 0,
                last_confirmed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_reliable_catalog_key ON product_reliable_catalog (canonical_key)"))

        # product_reliable_catalog: flavor (Aug 2026) — real corrections were
        # folding flavor into canonical_name only, with no structured field to
        # match/promote against
        _pg_add_column_if_missing(conn, "product_reliable_catalog", "flavor", "TEXT")

        # product_reliable_catalog: port + neutered (Aug 2026) — confirmed
        # scans already carry these (vision extraction + scoring), but
        # nothing persisted them into the promoted catalog
        _pg_add_column_if_missing(conn, "product_reliable_catalog", "port", "TEXT")
        _pg_add_column_if_missing(conn, "product_reliable_catalog", "neutered", "BOOLEAN")

        # product_reliable_catalog: image_phashes_json (Aug 2026) — hash
        # perceptual (pHash) das fotos já confirmadas para esse produto, pra
        # pular a chamada de IA num scan novo cuja foto seja visualmente
        # quase idêntica a uma já resolvida (nunca guarda a imagem em si)
        _pg_add_column_if_missing(conn, "product_reliable_catalog", "image_phashes_json", "TEXT DEFAULT '[]'")

        # found_reports: dismiss flag + finder identity (Jul 2026)
        _pg_add_column_if_missing(conn, "found_reports", "dismissed", "INTEGER DEFAULT 0")
        _pg_add_column_if_missing(conn, "found_reports", "finder_user_id", "TEXT")
        _pg_add_column_if_missing(conn, "found_reports", "finder_video_url", "TEXT")
        _pg_add_column_if_missing(conn, "found_reports", "proof_challenge", "TEXT")
        _pg_add_column_if_missing(conn, "found_reports", "proof_challenge_id", "TEXT")
        _pg_add_column_if_missing(conn, "found_reports", "proof_verified", "INTEGER DEFAULT 0")
        _pg_add_column_if_missing(conn, "found_reports", "risk_level", "TEXT")
        _pg_add_column_if_missing(conn, "found_reports", "risk_flags", "TEXT")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS found_report_photo_fingerprints (
                id              TEXT PRIMARY KEY,
                found_report_id TEXT NOT NULL,
                missing_pet_id  TEXT NOT NULL,
                finder_contact  TEXT,
                dhash           TEXT NOT NULL,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_report ON found_report_photo_fingerprints (found_report_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_missing_pet ON found_report_photo_fingerprints (missing_pet_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_dhash ON found_report_photo_fingerprints (dhash)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_contact ON found_report_photo_fingerprints (finder_contact)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS missing_pet_proof_challenges (
                id             TEXT PRIMARY KEY,
                missing_pet_id TEXT NOT NULL,
                phrase         TEXT NOT NULL,
                expires_at     TIMESTAMPTZ NOT NULL,
                used_at        TIMESTAMPTZ,
                created_at     TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_missing_pet_proof_challenges_pet ON missing_pet_proof_challenges (missing_pet_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_missing_pet_proof_challenges_expires ON missing_pet_proof_challenges (expires_at)"))

        # missing_pets: public third-party reports + SEO pages (Jul 2026)
        _pg_add_column_if_missing(conn, "missing_pets", "reporter_type", "TEXT DEFAULT 'tutor_app'")
        _pg_add_column_if_missing(conn, "missing_pets", "reporter_contact", "TEXT")
        _pg_add_column_if_missing(conn, "missing_pets", "access_token", "TEXT")
        _pg_add_column_if_missing(conn, "missing_pets", "public_slug", "TEXT")
        conn.execute(text('ALTER TABLE "missing_pets" ALTER COLUMN "user_id" DROP NOT NULL'))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_missing_pets_access_token ON missing_pets (access_token) WHERE access_token IS NOT NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_missing_pets_public_slug ON missing_pets (public_slug) WHERE public_slug IS NOT NULL"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public_missing_pet_submissions (
                id             TEXT PRIMARY KEY,
                missing_pet_id TEXT,
                ip_address     TEXT NOT NULL,
                user_agent     TEXT,
                created_at     TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_public_missing_pet_submissions_ip ON public_missing_pet_submissions (ip_address)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_public_missing_pet_submissions_created ON public_missing_pet_submissions (created_at)"))

        # pets: invite token for caretaker sharing (Jul 2026)
        _pg_add_column_if_missing(conn, "pets", "invite_token", "VARCHAR(64)")
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_pets_invite_token ON pets (invite_token)"))

        # pet_caretakers: users who co-care for a pet (Jul 2026)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_caretakers (
                id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
                pet_id     VARCHAR(36) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
                user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(pet_id, user_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pet_caretakers_pet_id ON pet_caretakers (pet_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pet_caretakers_user_id ON pet_caretakers (user_id)"))

        # push_subscriptions: replaces shared/persistent/push_subscriptions.json
        # (Aug 2026). Created here via raw SQL (not just left to
        # notifications.py's Base.metadata.create_all) because run_pg_migrations
        # runs before that module is imported in main.py — the table must
        # already exist by the time the JSON import below runs. Column types
        # are a superset-compatible match for the SQLAlchemy model in
        # notifications/__init__.py; create_all() no-ops once the table exists.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL,
                endpoint      TEXT NOT NULL,
                p256dh        TEXT NOT NULL,
                auth          TEXT NOT NULL,
                lat           DOUBLE PRECISION,
                lng           DOUBLE PRECISION,
                device_id     TEXT,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
                disabled_at   TIMESTAMPTZ
            )
        """))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_user_endpoint "
            "ON push_subscriptions (user_id, endpoint)"
        ))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_disabled_at ON push_subscriptions (disabled_at)"))
        # device_id: identifica o aparelho para deduplicar subscriptions do mesmo
        # dispositivo (endpoint rotaciona no iOS/FCM e deixava linha órfã ativa →
        # push duplicado). Defensivo p/ tabelas criadas antes desta coluna.
        _pg_add_column_if_missing(conn, "push_subscriptions", "device_id", "TEXT")
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id "
            "ON push_subscriptions (user_id, device_id)"
        ))

        _migrate_push_subscriptions_from_json(conn)

        # analytics_events: distinguish monetized vs unmonetized clicks (Aug 2026)
        _pg_add_column_if_missing(conn, "analytics_events", "link_type", "VARCHAR(32)")

        # Product Identity Engine (Sep 2026): PETMOL-owned canonical product
        # identity, separate from merchant offer, monetization and price.
        # Additive only; existing name/brand remain fallback truth.
        _pg_add_column_if_missing(conn, "products_catalog", "canonical_name", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "canonical_brand", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "species", "VARCHAR(16)")
        _pg_add_column_if_missing(conn, "products_catalog", "product_family", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "product_line", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "weight_kg", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "products_catalog", "volume_ml", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "products_catalog", "length_cm", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "products_catalog", "pack_count", "INTEGER")
        _pg_add_column_if_missing(conn, "products_catalog", "animal_weight_min_kg", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "products_catalog", "animal_weight_max_kg", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "products_catalog", "breed_size", "VARCHAR(32)")
        _pg_add_column_if_missing(conn, "products_catalog", "breed", "VARCHAR(64)")
        _pg_add_column_if_missing(conn, "products_catalog", "identity_aliases_json", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "therapeutic_attributes_json", "TEXT")
        _pg_add_column_if_missing(conn, "products_catalog", "identity_evidence_json", "TEXT")
        # Catalog master enrichment (feat/catalog-master-architecture) — additive, nullable.
        _pg_add_column_if_missing(conn, "products_catalog", "flavor", "VARCHAR(64)")
        _pg_add_column_if_missing(conn, "products_catalog", "identity_enriched_at", "TIMESTAMPTZ")
        _pg_add_column_if_missing(conn, "affiliate_feed_offers", "description", "TEXT")
        _pg_add_column_if_missing(conn, "affiliate_feed_offers", "mpn", "VARCHAR(64)")

        _pg_add_column_if_missing(conn, "marketplace_offers", "merchant_title", "TEXT")
        _pg_add_column_if_missing(conn, "marketplace_offers", "merchant_gtin", "VARCHAR(32)")
        _pg_add_column_if_missing(conn, "marketplace_offers", "match_decision", "VARCHAR(32)")
        _pg_add_column_if_missing(conn, "marketplace_offers", "match_confidence", "DOUBLE PRECISION")
        _pg_add_column_if_missing(conn, "marketplace_offers", "match_reasons_json", "TEXT")
        _pg_add_column_if_missing(conn, "marketplace_offers", "match_attributes_json", "TEXT")
        _pg_add_column_if_missing(conn, "marketplace_offers", "price_refresh_status", "VARCHAR(32)")
        _pg_add_column_if_missing(conn, "marketplace_offers", "price_refresh_error", "VARCHAR(160)")
        # Taxa de comissão do anúncio (Shopee productOfferV2.commissionRate):
        # base da rede + comissão do vendedor, 0..1. Usada como desempate
        # entre ofertas válidas de preço parecido (ver marketplace_offer_provider).
        _pg_add_column_if_missing(conn, "marketplace_offers", "commission_rate", "DOUBLE PRECISION")
        # Miniatura do produto na tela /admin/shopee-coverage (catálogo ou
        # feed Cobasi) — a tabela em si já existe via Base.metadata.create_all
        # (shopee_coverage_gaps.py), só a coluna nova precisa de ALTER.
        _pg_add_column_if_missing(conn, "shopee_coverage_gaps", "cobasi_image_url", "TEXT")
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_marketplace_offers_match_decision ON marketplace_offers (match_decision)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_marketplace_offers_price_refresh ON marketplace_offers (price_refresh_status, last_checked_at)"))

        # Catálogo mestre — grupos de SKU cross-GTIN (Fase 1-A). Uma linha por
        # associação; group_key determinístico; proveniência por membro.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_sku_group_members (
                id              SERIAL PRIMARY KEY,
                group_key       TEXT NOT NULL,
                member_gtin     VARCHAR(32) NOT NULL,
                canonical_gtin  VARCHAR(32),
                match_basis     VARCHAR(32) NOT NULL,
                status          VARCHAR(16) NOT NULL DEFAULT 'active',
                confidence      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                evidence_json   TEXT NOT NULL DEFAULT '{}',
                source          VARCHAR(32) NOT NULL DEFAULT 'SKU_GROUPER',
                confirmed_by    VARCHAR(128),
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_group_member ON product_sku_group_members (group_key, member_gtin)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sku_group_member_gtin ON product_sku_group_members (member_gtin, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sku_group_key ON product_sku_group_members (group_key)"))

        # Cache persistente de preço por merchant (Fase 1-D) — sobrevive a
        # restart, dá histórico e fallback "visto por R$X em <data>".
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS merchant_price_cache (
                id              SERIAL PRIMARY KEY,
                merchant        VARCHAR(32) NOT NULL,
                gtin            VARCHAR(32) NOT NULL,
                price           DOUBLE PRECISION,
                list_price      DOUBLE PRECISION,
                currency        VARCHAR(8) DEFAULT 'BRL',
                source          VARCHAR(32) NOT NULL DEFAULT 'live',
                product_name    TEXT,
                url             TEXT,
                checked_at      TIMESTAMPTZ DEFAULT NOW(),
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_price_cache ON merchant_price_cache (merchant, gtin)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_merchant_price_cache_checked ON merchant_price_cache (merchant, checked_at)"))

        # Mission Control phase 1: first-party product analytics, additive and
        # pseudonymous. No raw IP, GPS, email, phone, names or sensitive payloads.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analytics_product_events (
                id              TEXT PRIMARY KEY,
                event_id        TEXT UNIQUE NOT NULL,
                event_name      TEXT NOT NULL,
                user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
                anonymous_id    TEXT,
                session_id      TEXT,
                screen          TEXT,
                route           TEXT,
                occurred_at     TIMESTAMPTZ,
                received_at     TIMESTAMPTZ DEFAULT NOW(),
                platform        TEXT,
                app_version     TEXT,
                os              TEXT,
                browser         TEXT,
                device_class    TEXT,
                locale          TEXT,
                timezone        TEXT,
                properties_json TEXT
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_ape_event_id ON analytics_product_events (event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_event_received ON analytics_product_events (event_name, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_user_received ON analytics_product_events (user_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_anon_received ON analytics_product_events (anonymous_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_session_received ON analytics_product_events (session_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_app_version ON analytics_product_events (app_version)"))

        # Mission Control BI (admin analytics): time-range scans on signup /
        # pet-creation dates. Additive, read-path only.
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pets_created_at ON pets (created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_state_city ON users (state, city)"))

        # GET /commerce/awin-search: busca de produto ignorando acento
        # ("racao" precisa achar "Ração" — teclado de celular raramente
        # acentua). unaccent() é extensão contrib nativa do Postgres, não
        # instalada por padrão em todo banco novo (Ago 2026).
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))

        # parasite_control_records: GTIN/EAN escaneado (Ago 2026) — antes só
        # existia pra ração (feeding_plans); sem isto, AwinFeedProvider nunca
        # conseguia resolver oferta de antiparasitário por GTIN exato, só
        # MAIS/busca textual (ver docs/AFFILIATES.md e commerce_provider.py).
        _pg_add_column_if_missing(conn, "parasite_control_records", "barcode", "VARCHAR(64)")

        # parasite_control_records: FK real pro catálogo (Ago 2026) — até
        # aqui só o `barcode` cru era salvo; nenhum cruzamento (comparação de
        # preço, matching de afiliado) tinha um product_id pra usar direto,
        # tinha que re-normalizar/re-buscar o texto cru toda vez. Resolvido
        # automaticamente no backend a partir de `barcode` (ver
        # parasite_router.py), nunca aceito do cliente. Rode
        # scripts/backfill_product_id.py --apply depois do deploy pra
        # preencher os registros que já existiam antes desta coluna.
        _pg_add_column_if_missing(conn, "parasite_control_records", "product_id", "INTEGER REFERENCES products_catalog(id)")

        # affiliate_feed_sync_runs: observabilidade segura do sync Awin.
        # Contadores apenas; nunca GTINs específicos, URLs de feed ou secrets.
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_with_gtin", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_with_affiliate_url", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_in_stock", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_gtin_corrected", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_gtin_invalid", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "duplicate_gtin_groups", "INTEGER DEFAULT 0 NOT NULL")
        _pg_add_column_if_missing(conn, "affiliate_feed_sync_runs", "ambiguous_gtin_groups", "INTEGER DEFAULT 0 NOT NULL")

        # 2026-09: PETMOL não guarda mais arquivos de tutor. O "cofre de
        # documentos" (upload já removido antes) foi descontinuado por
        # completo — router, models e schemas apagados. Dropar as tabelas
        # apaga os registros; _wipe_pet_documents_dir() apaga os arquivos
        # órfãos no disco (LGPD: erasure de verdade, não só a linha).
        conn.execute(text("DROP TABLE IF EXISTS pet_document_imports CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS pet_documents CASCADE"))
        _wipe_pet_documents_dir()

        # 2026-09: "RG do pet" (página pública compartilhável) descontinuado
        # junto com o compartilhamento de histórico — rg/ router + RGPublic
        # apagados. A página pública /p/[id] e /v/[token] também.
        conn.execute(text("DROP TABLE IF EXISTS rg_public CASCADE"))


def _migrate_push_subscriptions_from_json(conn) -> None:
    """One-time import of the legacy push_subscriptions.json (file-based,
    single device per user) into push_subscriptions. Safe to run on every
    deploy: ON CONFLICT (user_id, endpoint) DO NOTHING makes it a no-op once
    a given subscription has been imported. Reads the same env-var-resolved
    path the old notifications.py code used, so it picks up whatever file is
    actually configured in production rather than a guessed default.
    """
    import json as _json
    import os as _os
    import uuid as _uuid

    path = _os.environ.get(
        "PUSH_SUBSCRIPTIONS_FILE",
        _os.path.join(_os.path.dirname(__file__), "notifications", "push_subscriptions.json"),
    )
    try:
        with open(path, "r") as f:
            data = _json.load(f)
    except (FileNotFoundError, ValueError):
        return
    if not isinstance(data, dict):
        return

    for user_id, entry in data.items():
        if not isinstance(entry, dict):
            continue
        endpoint = entry.get("endpoint")
        keys = entry.get("keys") or {}
        p256dh = keys.get("p256dh") or entry.get("p256dh")
        auth = keys.get("auth") or entry.get("auth")
        if not endpoint or not p256dh or not auth:
            continue
        conn.execute(text("""
            INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, lat, lng, created_at, last_seen_at)
            VALUES (:id, :user_id, :endpoint, :p256dh, :auth, :lat, :lng, NOW(), NOW())
            ON CONFLICT (user_id, endpoint) DO NOTHING
        """), {
            "id": str(_uuid.uuid4()),
            "user_id": str(user_id),
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth,
            "lat": entry.get("lat"),
            "lng": entry.get("lng"),
        })


def run_sqlite_migrations(engine: Engine) -> None:
    """Run idempotent migrations.

    Only applies to SQLite engines.
    """

    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        changed = False

        # Users: terms acceptance metadata
        changed |= _sqlite_add_column_if_missing(conn, "users", "terms_accepted", "BOOLEAN DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "users", "terms_version", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "users", "terms_accepted_at", "DATETIME")
        changed |= _sqlite_add_column_if_missing(conn, "users", "monthly_checkin_day", "INTEGER DEFAULT 5")
        changed |= _sqlite_add_column_if_missing(conn, "users", "monthly_checkin_hour", "INTEGER DEFAULT 9")
        changed |= _sqlite_add_column_if_missing(conn, "users", "monthly_checkin_minute", "INTEGER DEFAULT 0")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                token_hash  TEXT UNIQUE NOT NULL,
                expires_at  DATETIME NOT NULL,
                used_at     DATETIME,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)"))

        # Establishments: CNPJ + terms acceptance metadata
        changed |= _sqlite_add_column_if_missing(conn, "establishments", "cnpj", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "establishments", "terms_version", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "establishments", "terms_accepted_at", "DATETIME")
        changed |= _sqlite_add_column_if_missing(conn, "establishments", "terms_accepted_ip", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "establishments", "terms_accepted_user_agent", "TEXT")

        # Helpful indexes (safe no-op if already exists)
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_establishments_cnpj ON establishments (cnpj)"))

        # pets: insurance plan (Mar 2026)
        changed |= _sqlite_add_column_if_missing(conn, "pets", "insurance_provider", "TEXT")

        # vaccine_records: country catalog fields (Fev 2026)
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "vaccine_code", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "country_code", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "next_due_source", "TEXT DEFAULT 'unknown'")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "deleted_at", "DATETIME")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "record_type", "TEXT DEFAULT 'confirmed_application'")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "alert_days_before", "INTEGER")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "reminder_date", "DATE")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "reminder_time", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "reminder_enabled", "BOOLEAN DEFAULT FALSE")
        changed |= _sqlite_add_column_if_missing(conn, "parasite_control_records", "reminder_date", "DATE")
        changed |= _sqlite_add_column_if_missing(conn, "parasite_control_records", "reminder_time", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "events", "deleted_at", "DATETIME")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "deleted_at", "DATETIME")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "items_json", "TEXT DEFAULT '[]'")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "last_food_push_date", "DATE")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "duration_days", "INTEGER")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "reminder_time", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "feeding_plans", "reminder_source", "TEXT DEFAULT 'calculated'")
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_vaccine_records_code ON vaccine_records (vaccine_code)"))

        # ── World-health architecture (Mar 2026) ────────────────────────────

        # countries: coverage tiers for global protocol fallback
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS countries (
                country_code   TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                region         TEXT,
                default_language TEXT,
                coverage_level TEXT DEFAULT 'GLOBAL'
            )
        """))

        # vaccine_protocols: per-country species-specific schedules
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS vaccine_protocols (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                country_code    TEXT NOT NULL,
                species         TEXT NOT NULL,
                vaccine_code    TEXT NOT NULL,
                min_age_weeks   INTEGER,
                max_age_weeks   INTEGER,
                interval_days   INTEGER,
                doses_total     INTEGER DEFAULT 1,
                notes           TEXT,
                FOREIGN KEY (country_code) REFERENCES countries (country_code)
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_vax_proto_unique
            ON vaccine_protocols (country_code, species, vaccine_code)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vax_proto_country ON vaccine_protocols (country_code)
        """))

        # parasite_protocols: per-country antiparasitic schedules
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS parasite_protocols (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                country_code    TEXT NOT NULL,
                species         TEXT NOT NULL,
                parasite_type   TEXT NOT NULL,
                product_class   TEXT,
                interval_days   INTEGER,
                notes           TEXT,
                FOREIGN KEY (country_code) REFERENCES countries (country_code)
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_parasite_proto_unique
            ON parasite_protocols (country_code, species, parasite_type)
        """))

        # product_name_mappings: local trade names → canonical vaccine_code
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_name_mappings (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                country_code    TEXT NOT NULL,
                local_name      TEXT NOT NULL,
                vaccine_code    TEXT NOT NULL,
                species         TEXT,
                FOREIGN KEY (country_code) REFERENCES countries (country_code)
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_product_name_unique
            ON product_name_mappings (country_code, local_name)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_product_name_code ON product_name_mappings (vaccine_code)
        """))

        # ── pet_places: locais pet do OSM (offline, sem Google) ─────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_places (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                source       TEXT NOT NULL,
                external_id  TEXT NOT NULL,
                name         TEXT NOT NULL,
                category     TEXT NOT NULL,
                confidence   TEXT NOT NULL DEFAULT 'MEDIUM',
                lat          REAL NOT NULL,
                lng          REAL NOT NULL,
                address      TEXT,
                city         TEXT,
                state        TEXT,
                country_code TEXT DEFAULT 'BR',
                tags_json    TEXT,
                created_at   DATETIME,
                updated_at   DATETIME
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_pet_places_source_eid
            ON pet_places (source, external_id)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_pet_places_lat_lng
            ON pet_places (lat, lng)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_pet_places_city_category
            ON pet_places (city, category)
        """))

        # ── user_monthly_checkins: lembrete mensal ─────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_monthly_checkins (
                id           TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                pet_id       TEXT,
                month_ref    TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'nothing',
                snooze_until DATE,
                created_at   DATETIME,
                updated_at   DATETIME
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_checkins_user_month
            ON user_monthly_checkins (user_id, month_ref)
        """))

        # ── canonicalization fields: vaccine_records ────────────────────────
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "vaccine_name_raw", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "vaccine_name_canonical", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "vaccine_confidence", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "provider_name_raw", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "provider_name_canonical", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "vaccine_records", "provider_confidence", "REAL")

        # ── canonicalization fields: events ────────────────────────────────
        changed |= _sqlite_add_column_if_missing(conn, "events", "provider_name_raw", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "events", "provider_name_canonical", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "events", "provider_confidence", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "events", "item_name_raw", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "events", "item_name_canonical", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "events", "item_confidence", "REAL")

        # ── Seed: countries ─────────────────────────────────────────────────
        _seed_countries(conn)

        # ── Seed: vaccine_protocols (BR + US core vaccines) ─────────────────
        _seed_vaccine_protocols(conn)

        # ── Seed: product_name_mappings (BR trade names) ────────────────────
        _seed_product_name_mappings(conn)

        # ── notification_pendencies: persistent in-app alerts (Apr 2026) ────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notification_pendencies (
                id           TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                pet_id       TEXT,
                type         TEXT NOT NULL,
                event_id     TEXT,
                title        TEXT NOT NULL,
                message      TEXT NOT NULL,
                deep_link    TEXT NOT NULL,
                priority     INTEGER DEFAULT 50,
                status       TEXT DEFAULT 'active',
                snoozed_until DATETIME,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at   DATETIME,
                updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_notif_pend_user ON notification_pendencies (user_id)"
        ))

        # Product learning memory (Apr 2026)
        changed |= _sqlite_add_column_if_missing(conn, "product_correction_events", "brand", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "product_correction_events", "weight", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "product_correction_events", "probable_name", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "product_correction_events", "visible_text", "TEXT")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_learning_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                barcode_normalized TEXT,
                ocr_raw_text TEXT,
                visible_text TEXT,
                probable_name TEXT,
                detected_brand TEXT,
                detected_species TEXT,
                detected_life_stage TEXT,
                detected_weight TEXT,
                resolved_name TEXT NOT NULL,
                resolved_category TEXT,
                decision_source TEXT,
                decision_score REAL,
                decision_result TEXT,
                tutor_confirmed BOOLEAN DEFAULT 1,
                tutor_corrected BOOLEAN DEFAULT 0,
                corrected_name TEXT,
                ai_suggested_name TEXT,
                pet_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_learning_events_barcode ON product_learning_events (barcode_normalized)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_learning_events_created_at ON product_learning_events (created_at)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_reliable_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                canonical_key TEXT NOT NULL UNIQUE,
                canonical_name TEXT NOT NULL,
                aliases_json TEXT NOT NULL DEFAULT '[]',
                gtins_json TEXT NOT NULL DEFAULT '[]',
                brand TEXT,
                category TEXT,
                species TEXT,
                life_stage TEXT,
                weight TEXT,
                confirmation_count INTEGER NOT NULL DEFAULT 0,
                correction_count INTEGER NOT NULL DEFAULT 0,
                last_confirmed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_product_reliable_catalog_key ON product_reliable_catalog (canonical_key)"))

        # product_reliable_catalog: flavor (Aug 2026)
        changed |= _sqlite_add_column_if_missing(conn, "product_reliable_catalog", "flavor", "TEXT")

        # product_reliable_catalog: port + neutered (Aug 2026)
        changed |= _sqlite_add_column_if_missing(conn, "product_reliable_catalog", "port", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "product_reliable_catalog", "neutered", "BOOLEAN")

        # product_reliable_catalog: image_phashes_json (Aug 2026)
        changed |= _sqlite_add_column_if_missing(conn, "product_reliable_catalog", "image_phashes_json", "TEXT DEFAULT '[]'")

        # missing_pets: public third-party reports + SEO pages (Jul 2026)
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "finder_video_url", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "proof_challenge", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "proof_challenge_id", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "proof_verified", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "risk_level", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "found_reports", "risk_flags", "TEXT")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS found_report_photo_fingerprints (
                id              TEXT PRIMARY KEY,
                found_report_id TEXT NOT NULL,
                missing_pet_id  TEXT NOT NULL,
                finder_contact  TEXT,
                dhash           TEXT NOT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_report ON found_report_photo_fingerprints (found_report_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_missing_pet ON found_report_photo_fingerprints (missing_pet_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_dhash ON found_report_photo_fingerprints (dhash)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_found_report_photo_fingerprints_contact ON found_report_photo_fingerprints (finder_contact)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS missing_pet_proof_challenges (
                id             TEXT PRIMARY KEY,
                missing_pet_id TEXT NOT NULL,
                phrase         TEXT NOT NULL,
                expires_at     DATETIME NOT NULL,
                used_at        DATETIME,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_missing_pet_proof_challenges_pet ON missing_pet_proof_challenges (missing_pet_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_missing_pet_proof_challenges_expires ON missing_pet_proof_challenges (expires_at)"))

        # missing_pets: public third-party reports + SEO pages (Jul 2026)
        changed |= _sqlite_add_column_if_missing(conn, "missing_pets", "reporter_type", "TEXT DEFAULT 'tutor_app'")
        changed |= _sqlite_add_column_if_missing(conn, "missing_pets", "reporter_contact", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "missing_pets", "access_token", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "missing_pets", "public_slug", "TEXT")
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_missing_pets_access_token ON missing_pets (access_token)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_missing_pets_public_slug ON missing_pets (public_slug)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public_missing_pet_submissions (
                id             TEXT PRIMARY KEY,
                missing_pet_id TEXT,
                ip_address     TEXT NOT NULL,
                user_agent     TEXT,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_public_missing_pet_submissions_ip ON public_missing_pet_submissions (ip_address)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_public_missing_pet_submissions_created ON public_missing_pet_submissions (created_at)"))

        # analytics_events: distinguish monetized vs unmonetized clicks (Aug 2026)
        changed |= _sqlite_add_column_if_missing(conn, "analytics_events", "link_type", "TEXT")

        # Product Identity Engine (Sep 2026): PETMOL-owned canonical product
        # identity, separate from merchant offer, monetization and price.
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "canonical_name", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "canonical_brand", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "species", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "product_family", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "product_line", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "weight_kg", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "volume_ml", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "length_cm", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "pack_count", "INTEGER")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "animal_weight_min_kg", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "animal_weight_max_kg", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "breed_size", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "breed", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "identity_aliases_json", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "therapeutic_attributes_json", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "identity_evidence_json", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "flavor", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "products_catalog", "identity_enriched_at", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_offers", "description", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_offers", "mpn", "TEXT")

        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "merchant_title", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "merchant_gtin", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "match_decision", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "match_confidence", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "match_reasons_json", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "match_attributes_json", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "price_refresh_status", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "price_refresh_error", "TEXT")
        changed |= _sqlite_add_column_if_missing(conn, "marketplace_offers", "commission_rate", "REAL")
        changed |= _sqlite_add_column_if_missing(conn, "shopee_coverage_gaps", "cobasi_image_url", "TEXT")
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_marketplace_offers_match_decision ON marketplace_offers (match_decision)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_marketplace_offers_price_refresh ON marketplace_offers (price_refresh_status, last_checked_at)"))

        # Catálogo mestre — grupos de SKU cross-GTIN (Fase 1-A) + cache de preço (1-D).
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_sku_group_members (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                group_key       TEXT NOT NULL,
                member_gtin     TEXT NOT NULL,
                canonical_gtin  TEXT,
                match_basis     TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'active',
                confidence      REAL NOT NULL DEFAULT 0.0,
                evidence_json   TEXT NOT NULL DEFAULT '{}',
                source          TEXT NOT NULL DEFAULT 'SKU_GROUPER',
                confirmed_by    TEXT,
                created_at      TEXT,
                updated_at      TEXT
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_group_member ON product_sku_group_members (group_key, member_gtin)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sku_group_member_gtin ON product_sku_group_members (member_gtin, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sku_group_key ON product_sku_group_members (group_key)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS merchant_price_cache (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                merchant        TEXT NOT NULL,
                gtin            TEXT NOT NULL,
                price           REAL,
                list_price      REAL,
                currency        TEXT DEFAULT 'BRL',
                source          TEXT NOT NULL DEFAULT 'live',
                product_name    TEXT,
                url             TEXT,
                checked_at      TEXT,
                created_at      TEXT
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_price_cache ON merchant_price_cache (merchant, gtin)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_merchant_price_cache_checked ON merchant_price_cache (merchant, checked_at)"))

        # Mission Control phase 1: first-party product analytics, additive and
        # pseudonymous. No raw IP, GPS, email, phone, names or sensitive payloads.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analytics_product_events (
                id              TEXT PRIMARY KEY,
                event_id        TEXT UNIQUE NOT NULL,
                event_name      TEXT NOT NULL,
                user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
                anonymous_id    TEXT,
                session_id      TEXT,
                screen          TEXT,
                route           TEXT,
                occurred_at     DATETIME,
                received_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                platform        TEXT,
                app_version     TEXT,
                os              TEXT,
                browser         TEXT,
                device_class    TEXT,
                locale          TEXT,
                timezone        TEXT,
                properties_json TEXT
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_ape_event_id ON analytics_product_events (event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_event_received ON analytics_product_events (event_name, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_user_received ON analytics_product_events (user_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_anon_received ON analytics_product_events (anonymous_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_session_received ON analytics_product_events (session_id, received_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ape_app_version ON analytics_product_events (app_version)"))

        # Mission Control BI (admin analytics) — ver run_pg_migrations.
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pets_created_at ON pets (created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_state_city ON users (state, city)"))

        # parasite_control_records: GTIN/EAN escaneado (Ago 2026) — ver
        # comentário equivalente em run_pg_migrations.
        changed |= _sqlite_add_column_if_missing(conn, "parasite_control_records", "barcode", "TEXT")

        # parasite_control_records: FK real pro catálogo (Ago 2026) — ver
        # comentário equivalente em run_pg_migrations. SQLite não aplica a
        # FK de fato sem PRAGMA foreign_keys=ON, mas a coluna precisa
        # existir do mesmo jeito.
        changed |= _sqlite_add_column_if_missing(conn, "parasite_control_records", "product_id", "INTEGER")

        # affiliate_feed_sync_runs: observabilidade segura do sync Awin.
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_with_gtin", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_with_affiliate_url", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_in_stock", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_gtin_corrected", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "rows_gtin_invalid", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "duplicate_gtin_groups", "INTEGER DEFAULT 0")
        changed |= _sqlite_add_column_if_missing(conn, "affiliate_feed_sync_runs", "ambiguous_gtin_groups", "INTEGER DEFAULT 0")

        # 2026-09: "cofre de documentos" + "RG do pet" descontinuados —
        # ver run_pg_migrations.
        conn.execute(text("DROP TABLE IF EXISTS pet_document_imports"))
        conn.execute(text("DROP TABLE IF EXISTS pet_documents"))
        _wipe_pet_documents_dir()
        conn.execute(text("DROP TABLE IF EXISTS rg_public"))

        # `changed` is intentionally unused; kept for potential logging later.
        _ = changed


def _seed_countries(conn) -> None:
    """Idempotent seed for countries table."""
    rows = [
        ("BR", "Brasil",        "South America", "pt-BR", "BETA"),
        ("US", "United States", "North America", "en",    "BETA"),
        ("CA", "Canada",        "North America", "en",    "BETA"),
        ("PT", "Portugal",      "Europe",        "pt-PT", "GLOBAL"),
        ("ES", "España",        "Europe",        "es",    "GLOBAL"),
        ("FR", "France",        "Europe",        "fr",    "GLOBAL"),
        ("DE", "Deutschland",   "Europe",        "de",    "GLOBAL"),
        ("GLOBAL", "Global Fallback", None,      "en",    "GLOBAL"),
    ]
    for code, name, region, lang, level in rows:
        conn.execute(text("""
            INSERT OR IGNORE INTO countries (country_code, name, region, default_language, coverage_level)
            VALUES (:code, :name, :region, :lang, :level)
        """), {"code": code, "name": name, "region": region, "lang": lang, "level": level})


def _seed_vaccine_protocols(conn) -> None:
    """Idempotent seed for vaccine_protocols. Core vaccines for BR and US."""
    protocols = [
        # (country, species, vaccine_code, min_age_weeks, max_age_weeks, interval_days, doses_total, notes)

        # ── BR DOG ──────────────────────────────────────────────────────────
        ("BR", "dog", "CORE_DOG_V10",    6, None, 21, 3, "V10 — série inicial 3 doses q21d; reforço anual"),
        ("BR", "dog", "CORE_DOG_RABIES", 12, None, 365, 1, "Antirrábica — obrigatória; reforço anual"),
        ("BR", "dog", "DOG_LEPTO",       8, None, 21, 2, "Leptospirose — 2 doses q21d; reforço anual"),
        ("BR", "dog", "DOG_BORDETELLA",  8, None, 365, 1, "Gripe canina — anual; optativa"),

        # ── BR CAT ──────────────────────────────────────────────────────────
        ("BR", "cat", "CORE_CAT_V3",     8, None, 21, 3, "V3 — série 3 doses; reforço anual ou trienal"),
        ("BR", "cat", "CORE_CAT_RABIES", 12, None, 365, 1, "Antirrábica — obrigatória; anual"),
        ("BR", "cat", "CAT_FeLV",        8, None, 21, 2, "FeLV — 2 doses; reforço anual"),

        # ── US DOG ──────────────────────────────────────────────────────────
        ("US", "dog", "CORE_DOG_DHPPI",  6, None, 21, 3, "DA2PP — AVMA core; booster q1-3y"),
        ("US", "dog", "CORE_DOG_RABIES", 12, None, 365, 1, "Rabies — state-mandated annually or triennially"),
        ("US", "dog", "DOG_BORDETELLA",  8, None, 365, 1, "Bordetella — annual; recommended for social dogs"),
        ("US", "dog", "DOG_LEPTO",       8, None, 365, 2, "Leptospirosis — 2 doses, annual booster"),
        ("US", "dog", "DOG_LYME",        8, None, 365, 2, "Lyme — 2 doses; endemic areas"),

        # ── US CAT ──────────────────────────────────────────────────────────
        ("US", "cat", "CORE_CAT_FVRCP",  6, None, 21, 3, "FVRCP — AAFP core; booster q1-3y"),
        ("US", "cat", "CORE_CAT_RABIES", 12, None, 365, 1, "Rabies — legally required in most states"),
        ("US", "cat", "CAT_FeLV",        8, None, 365, 2, "FeLV — AAFP non-core for at-risk cats"),

        # ── GLOBAL fallbacks ────────────────────────────────────────────────
        ("GLOBAL", "dog", "CORE_DOG_DHPPI",  6,  None, 21,  3, "Core — OIE/WSAVA global minimum"),
        ("GLOBAL", "dog", "CORE_DOG_RABIES", 12, None, 365, 1, "Rabies — WHO essential"),
        ("GLOBAL", "cat", "CORE_CAT_FVRCP",  6,  None, 21,  3, "Core — WSAVA global minimum"),
        ("GLOBAL", "cat", "CORE_CAT_RABIES", 12, None, 365, 1, "Rabies — WHO essential"),
    ]
    for (country, species, code, min_w, max_w, interval, doses, notes) in protocols:
        conn.execute(text("""
            INSERT OR IGNORE INTO vaccine_protocols
                (country_code, species, vaccine_code, min_age_weeks, max_age_weeks,
                 interval_days, doses_total, notes)
            VALUES
                (:country, :species, :code, :min_w, :max_w, :interval, :doses, :notes)
        """), {
            "country": country, "species": species, "code": code,
            "min_w": min_w, "max_w": max_w, "interval": interval,
            "doses": doses, "notes": notes,
        })


def _seed_product_name_mappings(conn) -> None:
    """Maps common Brazilian trade names to canonical vaccine codes."""
    mappings = [
        # (country, local_name, vaccine_code, species)
        ("BR", "V10",            "CORE_DOG_V10",    "dog"),
        ("BR", "V8",             "CORE_DOG_V10",    "dog"),
        ("BR", "Hexadog",        "CORE_DOG_V10",    "dog"),
        ("BR", "Vanguard Plus5", "CORE_DOG_V10",    "dog"),
        ("BR", "Nobivac DHPPi",  "CORE_DOG_V10",    "dog"),
        ("BR", "Antirrábica",    "CORE_DOG_RABIES", "dog"),
        ("BR", "Imrab 3",        "CORE_DOG_RABIES", "dog"),
        ("BR", "Defensor",       "CORE_DOG_RABIES", "dog"),
        ("BR", "V3",             "CORE_CAT_V3",     "cat"),
        ("BR", "V4",             "CORE_CAT_V3",     "cat"),
        ("BR", "V5",             "CORE_CAT_V3",     "cat"),
        ("BR", "Feligen",        "CORE_CAT_V3",     "cat"),
        ("BR", "Nobivac Tricat", "CORE_CAT_V3",     "cat"),
        ("BR", "Leucofeligen",   "CAT_FeLV",        "cat"),
        ("BR", "Purevax FeLV",   "CAT_FeLV",        "cat"),
        ("US", "DA2PP",          "CORE_DOG_DHPPI",  "dog"),
        ("US", "DHPP",           "CORE_DOG_DHPPI",  "dog"),
        ("US", "Nobivac DHP",    "CORE_DOG_DHPPI",  "dog"),
        ("US", "Vanguard Plus5", "CORE_DOG_DHPPI",  "dog"),
        ("US", "FVRCP",          "CORE_CAT_FVRCP",  "cat"),
        ("US", "Purevax FVRCP",  "CORE_CAT_FVRCP",  "cat"),
    ]
    for (country, local, code, species) in mappings:
        conn.execute(text("""
            INSERT OR IGNORE INTO product_name_mappings
                (country_code, local_name, vaccine_code, species)
            VALUES (:country, :local, :code, :species)
        """), {"country": country, "local": local, "code": code, "species": species})
