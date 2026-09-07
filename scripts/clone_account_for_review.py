#!/usr/bin/env python3
"""
clone_account_for_review.py — cria a conta de revisor da App Store/Google Play
copiando os dados de uma conta PETMOL de origem (pets + vacinas + antiparasitários
+ medicações + plano de alimentação + banho/tosa).

Uso:

    SOURCE_EMAIL=voce@exemplo.com \
    SOURCE_PASSWORD='...' \
    REVIEW_EMAIL=gerenciamento@petmol.com.br \
    REVIEW_PASSWORD='...' \
    python3 scripts/clone_account_for_review.py

Opções:
    --dry-run          só lê a conta de origem e mostra o que copiaria
    --delete-review    apaga a conta de revisor (DELETE /auth/me) e sai
    --api URL          base da API (padrão https://www.petmol.com.br/api)

Nada é gravado no repositório. As senhas vêm só das variáveis de ambiente e
nunca são impressas. A conta de revisor NÃO é admin (só leonardofmol@gmail.com
é admin), então é um tutor comum — exatamente o que a Apple/Google querem ver.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("PETMOL_API", "https://www.petmol.com.br/api")
REVIEW_NAME = os.environ.get("REVIEW_NAME", "Tutor PETMOL")

DRY_RUN = "--dry-run" in sys.argv
DELETE_REVIEW = "--delete-review" in sys.argv
if "--api" in sys.argv:
    API = sys.argv[sys.argv.index("--api") + 1]
API = API.rstrip("/")


def _req(method: str, path: str, token: str | None = None, body: dict | None = None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
        return e.code, payload


def login(email: str, password: str) -> str:
    status, data = _req("POST", "/auth/login", body={"email": email, "password": password})
    if status != 200 or not isinstance(data, dict) or "access_token" not in data:
        sys.exit(f"[erro] login falhou para {email}: {status} {data}")
    return data["access_token"]


def ensure_review_account(email: str, password: str) -> str:
    status, data = _req(
        "POST", "/auth/register",
        body={"name": REVIEW_NAME, "email": email, "password": password, "terms_accepted": True},
    )
    if status in (200, 201):
        print(f"[ok] conta de revisor criada: {email}")
    elif status == 409:
        print(f"[ok] conta de revisor já existe: {email} (vou só completar os dados)")
    else:
        sys.exit(f"[erro] não consegui criar a conta de revisor: {status} {data}")
    return login(email, password)


PICK_PET = ("name", "species", "breed", "birth_date", "sex",
            "weight_value", "weight_unit", "photo", "neutered", "insurance_provider")
PICK_VACCINE = ("vaccine_name", "applied_date", "next_dose_date", "dose_number", "notes",
                "alert_days_before", "reminder_date", "reminder_time", "reminder_enabled")
PICK_PARASITE = ("type", "product_name", "active_ingredient", "date_applied", "next_due_date",
                 "frequency_days", "pet_weight_kg", "dosage", "application_form", "veterinarian",
                 "clinic_name", "batch_number", "cost", "purchase_location", "collar_expiry_date",
                 "reminder_enabled", "reminder_date", "reminder_days", "alert_days_before",
                 "reminder_time", "notes", "barcode")
PICK_EVENT = ("type", "scheduled_at", "title", "status", "description", "notes",
              "professional_name", "cost", "frequency_days", "next_due_date",
              "reminder_days_before", "extra_data", "source")
PICK_GROOMING = ("type", "date", "scheduled_time", "location", "groomer", "cost", "notes",
                 "next_recommended_date", "frequency_days", "reminder_enabled")
PICK_FEEDING = ("species", "country_code", "food_brand", "package_size_kg", "daily_amount_g",
                "duration_days", "last_refill_date", "safety_buffer_days", "meals_per_day",
                "mode", "notes", "enabled", "no_consumption_control", "next_purchase_date",
                "manual_reminder_days_before", "reminder_time")


def pick(d: dict, keys) -> dict:
    return {k: d[k] for k in keys if d.get(k) is not None}


def main() -> None:
    src_email = os.environ.get("SOURCE_EMAIL")
    src_pw = os.environ.get("SOURCE_PASSWORD")
    rev_email = os.environ.get("REVIEW_EMAIL", "gerenciamento@petmol.com.br")
    rev_pw = os.environ.get("REVIEW_PASSWORD")

    print(f"API: {API}")

    if DELETE_REVIEW:
        if not rev_pw:
            sys.exit("[erro] REVIEW_PASSWORD é obrigatório para --delete-review")
        tok = login(rev_email, rev_pw)
        status, data = _req("DELETE", "/auth/me", token=tok)
        print(f"[{'ok' if status in (200, 204) else 'erro'}] DELETE /auth/me → {status} {data or ''}")
        return

    if not (src_email and src_pw):
        sys.exit("[erro] defina SOURCE_EMAIL e SOURCE_PASSWORD")
    if not DRY_RUN and not rev_pw:
        sys.exit("[erro] defina REVIEW_PASSWORD (ou use --dry-run)")

    src_tok = login(src_email, src_pw)
    print(f"[ok] logado na conta de origem: {src_email}")

    _, pets = _req("GET", "/pets", token=src_tok)
    if not isinstance(pets, list) or not pets:
        sys.exit(f"[erro] a conta de origem não tem pets: {pets}")

    plan = []  # [(pet, vaccines, parasites, events, grooming, feeding)]
    for p in pets:
        pid = p["id"]
        _, vaccines = _req("GET", f"/pets/{pid}/vaccines", token=src_tok)
        _, parasites = _req("GET", f"/pets/{pid}/parasites", token=src_tok)
        _, events = _req("GET", f"/events?pet_id={pid}", token=src_tok)
        _, grooming = _req("GET", f"/pets/{pid}/grooming", token=src_tok)
        fstatus, fresp = _req("GET", f"/health/pets/{pid}/feeding/plan", token=src_tok)
        fplan = fresp.get("plan") if (fstatus == 200 and isinstance(fresp, dict)) else None
        has_feeding = bool(fplan and (fplan.get("food_brand") or fplan.get("items")
                                      or fplan.get("no_consumption_control")))
        meds = [e for e in (events or []) if e.get("type") in ("medication", "medicacao")]
        plan.append((p, vaccines or [], parasites or [], meds, grooming or [],
                     fplan if has_feeding else None))
        print(f"  • {p.get('name')}: {len(vaccines or [])} vacina(s), "
              f"{len(parasites or [])} antiparasitário(s), {len(meds)} medicação(ões), "
              f"{len(grooming or [])} banho/tosa, plano de ração: "
              f"{'sim' if has_feeding else 'não'}")

    if DRY_RUN:
        print("\n[dry-run] nada foi gravado.")
        return

    rev_tok = ensure_review_account(rev_email, rev_pw)

    total = {"pets": 0, "vaccines": 0, "parasites": 0, "meds": 0, "grooming": 0, "feeding": 0}
    for (p, vaccines, parasites, meds, grooming, feeding) in plan:
        st, new_pet = _req("POST", "/pets", token=rev_tok, body=pick(p, PICK_PET))
        if st not in (200, 201) or not isinstance(new_pet, dict):
            print(f"  [erro] criar pet {p.get('name')}: {st} {new_pet}")
            continue
        npid = new_pet["id"]
        total["pets"] += 1
        print(f"  [ok] pet {new_pet.get('name')} criado")

        for v in vaccines:
            st, r = _req("POST", f"/pets/{npid}/vaccines", token=rev_tok, body=pick(v, PICK_VACCINE))
            total["vaccines"] += st in (200, 201)
            if st not in (200, 201):
                print(f"    [erro] vacina: {st} {r}")

        for pc in parasites:
            st, r = _req("POST", f"/pets/{npid}/parasites", token=rev_tok, body=pick(pc, PICK_PARASITE))
            total["parasites"] += st in (200, 201)
            if st not in (200, 201):
                print(f"    [erro] antiparasitário: {st} {r}")

        for m in meds:
            body = pick(m, PICK_EVENT)
            body["pet_id"] = npid
            body.setdefault("title", "Medicação")
            st, r = _req("POST", "/events", token=rev_tok, body=body)
            total["meds"] += st in (200, 201)
            if st not in (200, 201):
                print(f"    [erro] medicação: {st} {r}")

        for g in grooming:
            st, r = _req("POST", f"/pets/{npid}/grooming", token=rev_tok, body=pick(g, PICK_GROOMING))
            total["grooming"] += st in (200, 201)

        if feeding:
            body = pick(feeding, PICK_FEEDING)
            body.setdefault("species", p.get("species", "dog"))
            body.setdefault("mode", feeding.get("mode") or "kibble")
            st, r = _req("POST", f"/health/pets/{npid}/feeding/plan", token=rev_tok, body=body)
            total["feeding"] += st in (200, 201)
            if st not in (200, 201):
                print(f"    [erro] plano de ração: {st} {r}")

    print("\n=== resumo ===")
    print(f"  pets: {total['pets']}  vacinas: {total['vaccines']}  "
          f"antiparasitários: {total['parasites']}  medicações: {total['meds']}  "
          f"banho/tosa: {total['grooming']}  plano de ração: {total['feeding']}")
    print(f"\nConta de revisor pronta: {rev_email}")
    print("Coloque e-mail + senha no App Store Connect → App Information → Sign-In Information.")


if __name__ == "__main__":
    main()
