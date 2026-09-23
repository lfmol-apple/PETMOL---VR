"""Registro rápido de vacina: a data de aplicação escolhida pelo tutor é a que fica
gravada (e volta ao reabrir o histórico), e a próxima dose sai DELA — nunca de "hoje"."""
from datetime import date, timedelta

import pytest


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_pet(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123",
                                      "terms_accepted": True}, headers=_headers(cid))
    token = client.post("/auth/login", json={"email": email, "password": "senha123"},
                        headers=_headers(cid)).json()["access_token"]
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def _quick_add(client, cid, token, pet_id, name, applied_on):
    # mesmo corpo que o app manda no registro rápido (useVaccineManagement.handleQuickAddVaccine)
    return client.post(
        f"/health/pets/{pet_id}/vaccines/bulk-confirm",
        json={
            "country_code": "BR",
            "species": "dog",
            "vaccines": [{
                "display_name": name,
                "applied_on": applied_on,
                "source": "quick_add",
                "confirmed_by_user": True,
                "notes": "Adicionada via registro rápido",
                "record_type": "confirmed_application",
            }],
        },
        headers=_headers(cid, token),
    )


def _iso(d: date) -> str:
    return d.isoformat()


@pytest.mark.parametrize("label,days_ago", [("hoje", 0), ("ontem", 1), ("6 meses", 182), ("1 ano", 365)])
def test_quick_add_keeps_chosen_date_after_reopen_and_computes_next_dose_from_it(client, label, days_ago):
    cid, email = f"cid-qa-{days_ago}", f"qa{days_ago}@example.com"
    token, pet_id = _signup_pet(client, cid, email)
    applied = date.today() - timedelta(days=days_ago)

    r = _quick_add(client, cid, token, pet_id, "Antirrábica", _iso(applied))
    assert r.status_code == 200, r.text
    saved = r.json()["vaccines"][0]
    assert saved["applied_on"] == _iso(applied), label

    # a próxima dose nasce da data informada (anual): 1 ano depois dela, não 1 ano depois de hoje
    next_due = date.fromisoformat(saved["next_due_on"][:10])
    assert next_due > applied, label
    assert (next_due - applied).days in (365, 366), (label, saved["next_due_on"])
    if days_ago:
        assert next_due != date.today() + timedelta(days=365), label

    # "fechar e reabrir o histórico": o registro volta do banco com a mesma data
    listed = client.get(f"/pets/{pet_id}/vaccines", headers=_headers(cid, token))
    assert listed.status_code == 200, listed.text
    records = [v for v in listed.json() if v.get("id") == saved["id"]]
    assert len(records) == 1, label
    # o app lê só a parte de data do texto (loadVaccines/toDateStr), então ela tem que ser a escolhida
    assert str(records[0]["applied_date"])[:10] == _iso(applied), (label, records[0]["applied_date"])
