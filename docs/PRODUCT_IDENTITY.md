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

### Serve-time identity gate (`_marketplace_offer_identity_verdict`)

Every active `MarketplaceOffer` row is classified **before any price
comparison** (identity first, price later). Cheapest row first; the first
`ACCEPT` wins.

| Row state | Verdict |
|---|---|
| `merchant_gtin` == canonical GTIN | `ACCEPT` (EXACT) |
| `merchant_gtin` present, != canonical GTIN | `REJECT` |
| `merchant_title` present, live `evaluate_identity` = CONFLICT | `REJECT` (always — objective discriminator diverges) |
| `merchant_title` present, live = EXACT/HIGH_CONFIDENCE | `ACCEPT` |
| `merchant_title` present, live = NO_MATCH/AMBIGUOUS, stored `match_decision` was EXACT/HIGH_CONFIDENCE | `ACCEPT` (weak title this pass — e.g. manufacturer brand absent from listing — but a prior sync validated the unchanged title; not a conflict) |
| `merchant_title` present, live weak, no good stored decision | `REJECT` |
| no title, stored `match_decision` EXACT/HIGH_CONFIDENCE | `ACCEPT` |
| no title, stored `match_decision` CONFLICT/NO_MATCH/AMBIGUOUS | `REJECT` |
| no title, no stored decision (legacy row, pre-identity-engine) | `UNVERIFIED` |

`UNVERIFIED` rows are served **only** when the canonical product carries no
structured SKU discriminator (nothing that could be a wrong variant), and
only as a last resort; a background re-sync is scheduled so the next view
is validated. A structured product with only `UNVERIFIED` rows shows **no
Shopee offer** until re-sync populates the evidence.

### Winner = MIN(price) among proven-same-SKU rows only

Not the cheapest of all results, not the cheapest of the same name/brand/
family — only the cheapest row that passed the gate above. Multiple
`MarketplaceOffer` rows per product (different sellers) are all kept; the
provider re-picks the cheapest valid one on every request, so the next
refresh can naturally change the winner.

### Sibling GTIN reuse (`_find_alias_shopee_offers`)

A re-issued barcode may point at an existing sibling's Shopee offer, but
**only with deterministic structural proof** (`_proven_same_physical_sku`):
same normalized brand + same family + every present structural
discriminator equal + at least one present. **Price is never identity
evidence** — two SKUs can share a price and one SKU can have different feed
prices. No proof → normal Shopee search.

### Refresh job

The refresh job only refreshes existing validated `MarketplaceOffer` rows.
It never creates a new row and never swaps `external_listing_id`. If Shopee
returns another accepted listing but not the currently linked listing, the
row is marked `identity_conflict` and becomes unavailable instead of
silently changing SKU. Re-validation runs `evaluate_identity` on the
current listing; a fresh CONFLICT blocks the row. The refresh queue is
prioritized: tutor-scanned GTINs → rows missing `merchant_title` (identity
backfill) → oldest.

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
