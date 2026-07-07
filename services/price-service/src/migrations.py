"""Lightweight DB migrations for PETMOL.

This project uses `Base.metadata.create_all()` on startup but does not have a full
migration framework. For SQLite, we apply small, additive migrations using
`ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info` checks.

Keep migrations minimal, idempotent, and additive only.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


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
        _pg_add_column_if_missing(conn, "pet_documents", "deleted_at", "TIMESTAMPTZ")
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

        # found_reports: dismiss flag (Jul 2026)
        _pg_add_column_if_missing(conn, "found_reports", "dismissed", "INTEGER DEFAULT 0")


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
        changed |= _sqlite_add_column_if_missing(conn, "pet_documents", "deleted_at", "DATETIME")
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

        # pet_documents: cofre documental por pet
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_documents (
                id                TEXT PRIMARY KEY,
                pet_id            TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
                kind              TEXT NOT NULL DEFAULT 'file',
                category          TEXT,
                title             TEXT,
                document_date     DATE,
                notes             TEXT,
                source            TEXT NOT NULL DEFAULT 'upload',
                url_masked        TEXT,
                url_raw           TEXT,
                storage_key       TEXT,
                mime_type         TEXT,
                size_bytes        INTEGER,
                establishment_name TEXT,
                created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Add establishment_name to existing tables (idempotent)
        try:
            conn.execute(text("ALTER TABLE pet_documents ADD COLUMN establishment_name TEXT"))
        except Exception:
            pass  # column already exists
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_pet_documents_pet_id ON pet_documents (pet_id)"
        ))

        # pet_document_imports: audit trail por sessão de importação
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_document_imports (
                id               TEXT PRIMARY KEY,
                pet_id           TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
                provider         TEXT NOT NULL DEFAULT 'generic',
                status           TEXT NOT NULL DEFAULT 'queued',
                url_masked       TEXT,
                url_raw          TEXT,
                discovered_count INTEGER,
                imported_count   INTEGER,
                last_error       TEXT,
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_pet_doc_imports_pet_id ON pet_document_imports (pet_id)"
        ))

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

        # ── pet_documents.event_id ─────────────────────────────────────────
        changed |= _sqlite_add_column_if_missing(conn, "pet_documents", "event_id", "TEXT")

        # ── pet_documents.subcategory ──────────────────────────────────────
        changed |= _sqlite_add_column_if_missing(conn, "pet_documents", "subcategory", "TEXT")

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
