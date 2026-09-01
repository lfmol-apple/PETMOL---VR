# Product Identity / Merchant Match / Price

PETMOL commerce has three separate layers:

1. **Product Identity**: the canonical PETMOL product. Source of truth is
   `products_catalog`: GTIN/barcode, canonical name, brand, species,
   package size, collar length, pack count, animal weight range, life
   stage, breed size and therapeutic line. Merchant text never overwrites
   this truth.
2. **Merchant Match**: an auditable decision that a retailer/marketplace
   offer is the same product. Results are `EXACT`, `HIGH_CONFIDENCE`,
   `AMBIGUOUS`, `CONFLICT` or `NO_MATCH`, with per-attribute
   `MATCH`/`UNKNOWN`/`CONFLICT` evidence.
3. **Price**: a volatile value attached to a matched offer. Price is never
   identity evidence and never chooses between SKU variations.

Implementation:

- `services/price-service/src/product_identity.py` is the pure engine.
  It has no DB, HTTP, credentials or frontend behavior.
- `ProductCatalog` stores canonical identity fields.
- `MarketplaceOffer` stores merchant title/GTIN, match decision, match
  reasons/attributes and price refresh status.
- `CommerceEngine` exposes canonical PETMOL name/brand to the frontend
  and keeps `merchant_product_name` only for audit.

## Catalog master enrichment

```
RAW CATALOG SOURCES (Awin feeds: Cobasi / Zee Now / Zee Dog; scanner; admin)
        ↓  normalize (product_identity, deterministic — no LLM)
CatalogEvidence  (one per feed row, with source/merchant/feed/confidence)
        ↓  merge_product_catalog_identity(db, gtin)   ← catalog_enrichment.py
PRODUCT CATALOG PETMOL  (one row per GTIN = one SKU)
        ↓
PRODUCT IDENTITY  →  COBASI (exact EAN) + SHOPEE (candidate search) → lowest valid price
```

**Awin is a data source, not a store.** `AWIN_SELLABLE_MERCHANTS` is empty;
no Awin link/price ever reaches the tutor. The feed only feeds
`ProductCatalog` identity and images.

`catalog_enrichment.merge_product_catalog_identity(db, gtin)`:

- Reads every active `AffiliateFeedOffer` for that GTIN across all feed
  merchants and turns each into a `CatalogEvidence` via
  `ProductIdentity.build(title + category + description)`. Species also
  comes from the `category` breadcrumb ("Cachorro >…" / "Gatos >…").
- Merges per field with a provenance policy, logged in
  `ProductCatalog.identity_evidence_json` (`{field: {value, source,
  confidence, sources, at}}`):
  - **name / brand / image**: the feed with the most specific title (one
    that already carries the SKU size) wins; ties broken by feed trust
    (Cobasi > Zee Now/Dog for presentation).
  - **structured discriminators** (`weight_kg`, `volume_ml`, `length_cm`,
    `pack_count`, `animal_weight_range`, `species`): written **only when
    the feeds agree** (or only one reports it). Disagreement → left NULL
    and logged as `ambiguous` — never a guess.
  - **therapeutic attributes**: union across feeds. **aliases**: every
    distinct feed title.
- **Never downgrades**: a `canonical_*` field is written only when it is
  NULL, or when this same pipeline last wrote it (`source == "AWIN_FEED"`)
  and the new confidence ≥ the logged one. A value from a protected source
  (`MANUAL` / `ADMIN` / `PETMOL_VALIDATED`) is never touched.
- Idempotent. Never touches `MarketplaceOffer`, `ProductAffiliateLink`,
  monetized URLs or price.

Wired at:

- `commerce_offers._resolve_catalog_product` — on-demand when a viewed
  product has never been enriched (or is >7 days stale). DB-only, no
  network, never fails the request.
- `scripts/optimize_commerce_quality.py --catalog-enrich-limit N` — the
  nightly `petmol-commerce-quality` job, tutor-scanned GTINs first.
- `scripts/backfill_catalog_identity.py` — one-shot / manual catch-up.
- `GET /v1/admin/commerce-identity/product/{gtin}` — per-GTIN
  observability: canonical identity, per-field evidence, feed sources,
  merchant offers/matches. No secrets, no affiliate URLs.

**Adding a future catalog source** (Petlove/Petz/ML feed): add one
`evidence_from_<source>()` returning `CatalogEvidence` and let it flow
through the same `merge_product_catalog_identity`. No new identity engine,
no per-store matching.

## GTIN Rule

If a GTIN exists on both sides and matches, identity is resolved as
`EXACT`, unless another objective attribute proves corruption. Examples:
same GTIN but cat vs dog, 48cm vs 65cm, urinary vs renal, 2 tablets vs 4
tablets, 300ml vs 5L.

If the merchant has no GTIN, text can only produce `HIGH_CONFIDENCE` when
brand/family and structured SKU evidence agree. Missing size is
`UNKNOWN`, not `CONFLICT`, but a structured product with missing merchant
size can still be rejected as `NO_MATCH`.

## Cobasi

Cobasi price lookup is by exact EAN/GTIN. Manual `ProductAffiliateLink`
continues to control monetization, but the price shown beside that link is
accepted only when the EAN result passes Product Identity. If Cobasi cannot
prove the exact product, the link may still be served without a price, but
PETMOL does not publish a number from a different SKU.

## Shopee

Shopee has no exact GTIN lookup in the affiliate API. The sync searches GTIN
first, then canonical keyword variants, and every candidate must pass
Product Identity before it is upserted into `MarketplaceOffer`.

The refresh job only refreshes existing validated `MarketplaceOffer` rows.
It never creates a new row and never swaps `external_listing_id`. If Shopee
returns another accepted listing but not the currently linked listing, the
row is marked `identity_conflict` and becomes unavailable instead of
silently changing SKU.

## Frontend Contract

Search flows and pre-registered products use the same backend path:
`/commerce/offers` resolves the canonical product by product_id/GTIN and
builds one `ProductContext`. The UI displays `canonical_name`/PETMOL
`product_name`; merchant titles are not user-facing truth.

## Audit

Admin report:

- `GET /v1/admin/commerce-identity/product-report`

It returns counts by merchant for exact/high-confidence/ambiguous/conflict,
fresh/stale prices, refresh errors and common mismatch reasons. It does not
return affiliate URLs or secrets.
