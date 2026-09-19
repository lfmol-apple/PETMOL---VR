"""Bug real (18/09/2026, relatado ao vivo): tratamento com mais de uma dose
por dia (ex.: "a cada 8 horas" = 3x/dia) marcava o tratamento como concluído
assim que UMA dose de cada dia era registrada — o total configurado
(treatment_days) conta DIAS, não doses reais, e a checagem antiga comparava
direto com len(applied_dates). _medication_treatment_complete agora
multiplica por doses/dia quando a frequência é 'vezes_dia'/'intervalo' e há
applied_slots (doses fracionadas por horário)."""


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_login_and_pet(client, cid: str, email: str) -> tuple[str, str]:
    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_headers(cid))
    token = login.json()["access_token"]
    pet = client.post("/pets", json={"name": "Baby", "species": "dog"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def _create_medication_event(client, headers, pet_id, extra_data):
    import json
    r = client.post(
        "/events",
        json={
            "pet_id": pet_id,
            "type": "medicacao",
            "scheduled_at": "2026-09-18T08:00:00Z",
            "title": "Anti-inflamatório",
            "extra_data": json.dumps(extra_data),
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_treatment_with_multiple_daily_doses_only_completes_after_all_slots(client):
    token, pet_id = _signup_login_and_pet(client, "cid-meddose", "tutor.meddose@example.com")
    headers = _headers("cid-meddose", token)

    # "A cada 8 horas" por 2 dias = 2 dias configurados, mas 3 doses reais/dia (6 no total)
    event_id = _create_medication_event(client, headers, pet_id, {
        "frequency_mode": "intervalo",
        "interval_minutes": 480,
        "treatment_days": 2,
    })

    # 1ª dose do dia 18: NÃO deve completar o tratamento (faltam mais 2 do mesmo dia + o dia 19)
    r = client.post(f"/events/{event_id}/apply-dose", json={"date": "2026-09-18", "scheduled_time": "08:00"}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"

    # 2ª e 3ª dose do dia 18: ainda não completou (falta o dia 19 inteiro)
    for slot in ("16:00", "00:00"):
        r = client.post(f"/events/{event_id}/apply-dose", json={"date": "2026-09-18", "scheduled_time": slot}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active", f"não deveria completar só com o dia 18 inteiro ({slot})"

    # As 3 doses do dia 19: só agora completa (2 dias x 3 doses = 6 no total)
    for slot in ("08:00", "16:00", "00:00"):
        r = client.post(f"/events/{event_id}/apply-dose", json={"date": "2026-09-19", "scheduled_time": slot}, headers=headers)
        assert r.status_code == 200, r.text

    assert r.json()["status"] == "completed"

    # Remover a última dose reabre o tratamento
    r = client.post(f"/events/{event_id}/remove-dose", json={"date": "2026-09-19", "scheduled_time": "00:00"}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"


def test_single_dose_per_day_treatment_keeps_old_day_based_completion(client):
    token, pet_id = _signup_login_and_pet(client, "cid-meddose2", "tutor.meddose2@example.com")
    headers = _headers("cid-meddose2", token)

    event_id = _create_medication_event(client, headers, pet_id, {
        "frequency_mode": "vezes_dia",
        "times_per_day": 1,
        "treatment_days": 2,
    })

    r = client.post(f"/events/{event_id}/apply-dose", json={"date": "2026-09-18"}, headers=headers)
    assert r.json()["status"] == "active"

    r = client.post(f"/events/{event_id}/apply-dose", json={"date": "2026-09-19"}, headers=headers)
    assert r.json()["status"] == "completed"
