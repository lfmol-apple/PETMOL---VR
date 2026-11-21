"""Aba E-mails: campanhas, envio SEM limite semanal, opt-out respeitado, remoção e histórico antigo."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import src.admin.email_campaigns as ec
from src.admin.activation_campaign_router import ActivationCampaignContact, ActivationOptOut
from src.admin.deps import get_current_admin
from src.db import SessionLocal
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def _user(db, name, email=None):
    u = User(id=str(uuid.uuid4()), email=email or f"{uuid.uuid4().hex[:8]}@example.com", name=name, password_hash=hash_password("x"))
    db.add(u); db.commit()
    return u


@pytest.fixture
def admin(client):
    db = SessionLocal()
    try:
        a = _user(db, "Dono Admin", "dono@example.com")
        admin = SimpleNamespace(id=a.id, name=a.name, email=a.email)
    finally:
        db.close()
    client.app.dependency_overrides[get_current_admin] = lambda: (admin, None)
    yield admin
    client.app.dependency_overrides.pop(get_current_admin, None)


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    import src.mailer as mailer
    monkeypatch.setattr(mailer, "send_mail", lambda **kw: sent.append(kw) or True)
    monkeypatch.setattr(ec, "_run", ec._run)          # roda de verdade…
    monkeypatch.setattr(ec, "PAUSE_SECONDS", 0)       # …sem esperar
    monkeypatch.setattr(ec.threading, "Thread", lambda target, args, daemon: SimpleNamespace(start=lambda: target(*args)))
    return sent


def _new(client, name="Black Friday"):
    r = client.post("/v1/admin/email-campaigns", json={"name": name, "subject": "{nome}, novidade para {pets}", "body": "Oi {nome}!\n\nVeja o que há de novo para {pets}."})
    assert r.status_code == 200
    return r.json()["id"]


def test_lista_traz_o_historico_antigo_e_remover_tira_da_lista(client, admin):
    data = client.get("/v1/admin/email-campaigns").json()
    templates = {c["template"] for c in data["campaigns"]}
    assert {"recado", "foto"} <= templates
    antiga = next(c for c in data["campaigns"] if c["template"] == "recado")
    assert client.delete(f"/v1/admin/email-campaigns/{antiga['id']}").status_code == 200
    assert all(c["id"] != antiga["id"] for c in client.get("/v1/admin/email-campaigns").json()["campaigns"])
    # histórico antigo não dispara
    foto = next(c for c in client.get("/v1/admin/email-campaigns").json()["campaigns"] if c["template"] == "foto")
    assert client.post(f"/v1/admin/email-campaigns/{foto['id']}/send", json={"confirm_count": 1}).status_code == 409


def test_envia_para_todos_sem_limite_semanal_e_personaliza(client, admin, outbox):
    db = SessionLocal()
    try:
        ontem = _user(db, "Ana Souza")                       # já recebeu OUTRA campanha ontem: não conta
        db.add(Pet(id=str(uuid.uuid4()), user_id=ontem.id, name="Baby", species="dog")); db.commit()
        db.add(ActivationCampaignContact(campaign="email_racao__nofood", user_id=ontem.id, sent_at=datetime.now(timezone.utc))); db.commit()
        parou = _user(db, "Parou")
        db.add(ActivationOptOut(user_id=parou.id)); db.commit()
        _user(db, "Visitante", "x@petmol.guest")
        _user(db, "Bia")
    finally:
        db.close()
    cid = _new(client)
    prev = client.post(f"/v1/admin/email-campaigns/{cid}/preview", json={"segment": "todos", "audience": {"kind": "all"}}).json()
    assert prev["will_send"] == 3                              # admin + Ana + Bia; Parou e @petmol.guest ficam de fora
    assert prev["sample"]["subject"].startswith("Ana, novidade para Baby") or prev["sample"]["subject"].endswith("seu pet")
    r = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={"segment": "todos", "audience": {"kind": "all"}, "confirm_count": 3})
    assert r.status_code == 200
    assert len(outbox) == 3
    ana = next(m for m in outbox if m["to"] != "dono@example.com" and "Baby" in m["subject"])
    assert "Ana, novidade para Baby" == ana["subject"] and "Parar de receber" in ana["body_html"]
    st = client.get("/v1/admin/email-campaigns").json()["campaigns"]
    assert next(c for c in st if c["id"] == cid)["sent"] == 3


def test_reenviar_so_alcanca_quem_faltou_e_contagem_errada_e_recusada(client, admin, outbox):
    db = SessionLocal()
    try:
        _user(db, "Bia")
    finally:
        db.close()
    cid = _new(client)
    body = {"segment": "todos", "audience": {"kind": "all"}}
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 99}).status_code == 409
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 2}).status_code == 200
    assert len(outbox) == 2
    again = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 0})
    assert again.status_code == 422                            # ninguém novo: nada duplicado
    db = SessionLocal()
    try:
        _user(db, "Caio")
    finally:
        db.close()
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 1}).status_code == 200
    assert len(outbox) == 3


def test_teste_so_para_o_admin_e_nao_registra(client, admin, outbox):
    cid = _new(client)
    assert client.post(f"/v1/admin/email-campaigns/{cid}/test").status_code == 200
    assert [m["to"] for m in outbox] == ["dono@example.com"]
    r = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={"audience": {"kind": "test"}})
    assert r.status_code == 200 and len(outbox) == 2
    assert next(c for c in client.get("/v1/admin/email-campaigns").json()["campaigns"] if c["id"] == cid)["sent"] == 0


def test_segmento_sem_pet(client, admin):
    db = SessionLocal()
    try:
        com = _user(db, "Com Pet")
        db.add(Pet(id=str(uuid.uuid4()), user_id=com.id, name="Rex", species="dog")); db.commit()
        _user(db, "Sem Pet")
    finally:
        db.close()
    cid = _new(client)
    prev = client.post(f"/v1/admin/email-campaigns/{cid}/preview", json={"segment": "sem_pet", "audience": {"kind": "all"}}).json()
    assert prev["will_send"] == 2                              # admin (sem pet) + "Sem Pet"


def test_sem_admin_nao_acessa(client):
    assert client.get("/v1/admin/email-campaigns").status_code in (401, 403)
    assert client.get("/v1/admin/missing-pets").status_code in (401, 403)


def test_pets_sumidos_lista_com_contagens(client, admin):
    from src.missing_pets import MissingPet, MissingPetNotification
    db = SessionLocal()
    try:
        tutor = _user(db, "Tutor Triste", "triste@example.com")
        mp = MissingPet(id=str(uuid.uuid4()), user_id=tutor.id, pet_name="Mel", species="dog", contact="x", status="active")
        db.add(mp); db.commit()
        db.add(MissingPetNotification(missing_pet_id=mp.id, user_id=admin.id, reason="nearby")); db.commit()
    finally:
        db.close()
    d = client.get("/v1/admin/missing-pets?status=active").json()
    assert d["active"] == 1 and d["items"][0]["pet_name"] == "Mel"
    assert d["items"][0]["tutor_email"] == "triste@example.com" and d["items"][0]["notified"] == 1


def test_desempenho_conta_cada_coisa_na_data_em_que_aconteceu(client, admin):
    from datetime import timedelta
    from src.health.models import FeedingPlan
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        u = _user(db, "Nova")
        u.created_at = now - timedelta(days=2)               # conta criada anteontem…
        db.add(Pet(id="p-desemp", user_id=u.id, name="Rex", species="dog", created_at=now)); db.commit()   # …pet hoje
        db.add(FeedingPlan(pet_id="p-desemp", species="dog", country_code="BR", food_brand="Premier", created_at=now)); db.commit()
        _user(db, "Visitante", "g@petmol.guest")
    finally:
        db.close()
    hoje = client.get("/v1/admin/performance", params={"since": (now - timedelta(hours=6)).isoformat()}).json()["totals"]
    assert hoje["pets"] == 1 and hoje["alimentacao"] == 1       # pet e ração contam hoje
    assert hoje["cadastros"] == 1                               # só a conta do admin criada agora; "Nova" é de anteontem, guest nunca conta
    tudo = client.get("/v1/admin/performance").json()
    assert tudo["totals"]["cadastros"] == 2 and tudo["series"]


def test_desempenho_separa_iphone_e_android(client, admin):
    from datetime import timedelta
    from src.analytics.install_models import AppInstall
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.add(AppInstall(platform="ios", created_at=now))
        db.add(AppInstall(platform="android", created_at=now))
        db.add(AppInstall(platform="android", created_at=now))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    d = client.get("/v1/admin/performance", params={"since": (now - timedelta(hours=6)).isoformat()}).json()
    assert set(d["platforms"]) == {"ios", "android"}
    assert d["platforms"]["android"]["totals"]["downloads"] == 2 and d["platforms"]["ios"]["totals"]["downloads"] == 1
    assert d["totals"]["downloads"] == 3


# ── E-mail "Você continua com o PETMOL gratuito" ────────────────────────────

def _gratuito(client):
    """O e-mail "gratuito" vive na aba Gratuito (não na lista de E-mails): o resumo traz o id e os números."""
    e = client.get("/v1/admin/gratuito/summary").json()["email"]
    return {"id": e["campaign_id"], "subject": e["subject"], "sent": e["sent"], "tracking": e["tracking"]}


def test_gratuito_nao_aparece_na_lista_de_emails_mas_sim_na_aba_gratuito(client, admin):
    assert all(c["template"] != "gratuito" for c in client.get("/v1/admin/email-campaigns").json()["campaigns"])
    assert _gratuito(client)["id"]


def test_gratuito_aparece_na_lista_e_sem_prometer_sem_anuncios(client, admin):
    g = _gratuito(client)
    assert g["subject"].startswith("Uma conversa sincera sobre a sua conta gratuita")
    assert g["sent"] == 0 and g["tracking"]["clicks"] == 0
    html = client.get(f"/v1/admin/email-campaigns/{g['id']}/html").json()["html"]
    assert "versão Pró" in html and "Loja do Pet" in html and "/email/loja-do-pet.jpg" in html
    assert "sem anúncios" not in html.lower()                  # decisão #850: não prometer


def test_gratuito_envio_tem_link_rastreado_descadastro_e_nao_repete(client, admin, outbox):
    db = SessionLocal()
    try:
        _user(db, "Bia Lima")
        parou = _user(db, "Parou"); db.add(ActivationOptOut(user_id=parou.id)); db.commit()
    finally:
        db.close()
    g = _gratuito(client)
    body = {"segment": "gratuito_dia0", "audience": {"kind": "all"}}
    assert client.post(f"/v1/admin/email-campaigns/{g['id']}/send", json={**body, "confirm_count": 2}).status_code == 200
    assert len(outbox) == 2                                    # admin + Bia; quem pediu para parar fica de fora
    bia = next(m for m in outbox if m["to"] != "dono@example.com")
    assert "Olá, Bia!" in bia["body_html"] and "/api/v1/email/click/ec_" in bia["body_html"]
    assert "unsubscribe-reminders" in bia["body_html"] and "unsubscribe-reminders" in bia["body_text"]
    assert client.post(f"/v1/admin/email-campaigns/{g['id']}/send", json={**body, "confirm_count": 0}).status_code == 422


def test_clique_registra_redireciona_e_o_painel_conta_so_quem_recebeu(client, admin, outbox):
    import re
    from src.admin.email_clicks import EmailClick
    db = SessionLocal()
    try:
        bia = _user(db, "Bia Lima")
        db.add(Pet(id=str(uuid.uuid4()), user_id=bia.id, name="Mel", species="dog")); db.commit()
        bia_id = str(bia.id)
    finally:
        db.close()
    g = _gratuito(client)
    client.post(f"/v1/admin/email-campaigns/{g['id']}/send", json={"segment": "gratuito_dia0", "audience": {"kind": "all"}, "confirm_count": 2})
    html = next(m for m in outbox if m["to"] != "dono@example.com")["body_html"]
    url = re.search(r'href="https://www\.petmol\.com\.br(/api/v1/email/click/[^"]+l=botao)"', html).group(1)
    r = client.get(url.replace("/api", "", 1), follow_redirects=False)
    assert r.status_code == 302 and "utm_campaign=gratuito_permanece" in r.headers["location"] and "utm_content=botao" in r.headers["location"]
    client.get(url.replace("/api", "", 1), follow_redirects=False)          # 2º clique da mesma pessoa
    # alguém que NÃO recebeu (ex.: assinatura copiada de outra campanha) não entra na conta
    db = SessionLocal()
    try:
        db.add(EmailClick(campaign=ec._tag(g["id"]), user_id=str(uuid.uuid4()), link="botao")); db.commit()
    finally:
        db.close()
    t = _gratuito(client)["tracking"]
    assert t["recipients"] == 2 and t["clicks"] == 2 and t["clickers"] == 1 and t["by_link"] == {"botao": 2}
    assert t["with_pet"] == 1 and bia_id


def test_clique_com_assinatura_errada_nao_registra_nem_redireciona(client, admin):
    r = client.get("/v1/email/click/ec_abc/uid/assinatura-falsa", follow_redirects=False)
    assert r.status_code == 404


def test_gratuito_teste_so_para_o_admin_nao_registra(client, admin, outbox):
    g = _gratuito(client)
    assert client.post(f"/v1/admin/email-campaigns/{g['id']}/test").status_code == 200
    assert [m["to"] for m in outbox] == ["dono@example.com"]
    assert _gratuito(client)["sent"] == 0
    assert client.put(f"/v1/admin/email-campaigns/{g['id']}", json={"name": "xx", "subject": "xx", "body": "xxxxx"}).status_code == 409


# ── Cautelas jurídicas do e-mail "gratuito" ─────────────────────────────────

def _build(**kw):
    from src.admin import email_gratuito as g
    base = dict(unsubscribe_url="https://x/u", deadline=None, pet_of="do Baby", company_line="Empresa Ltda · CNPJ 00.000.000/0001-00")
    return g.build_email("Ana", "u1", **{**base, **kw})


def test_gratuito_nao_promete_preco_igual_nem_garantia_absoluta():
    for progress in (None, {"pet": True, "food": True, "push": False, "location": False}, {"pet": False}):
        _s, text, html = _build(progress=progress)
        for t in (text, html):
            assert "preço para você é o mesmo" not in t and "O preço é o mesmo" not in t   # não podemos garantir preço igual em toda loja
            assert "sem anúncios" not in t.lower()
        assert "Você não paga nada a mais" in html
        assert "Imagem ilustrativa" in html                                                 # o print mostra ofertas que mudam
        pede_racao = (progress is None) or (progress.get("pet", True) and not progress.get("food", False))
        assert ("estima quando ela acaba" in html) == bool(pede_racao)                        # estimativa, não garantia (só aparece se pede ração)
        assert "Nenhuma conta ou cadastro será excluído ou removido sem o seu consentimento" in html and "sem o seu consentimento" in text
        assert "É opcional, e você desativa quando quiser" in html


def test_gratuito_identifica_a_empresa_e_trava_o_envio_sem_ela():
    from src.admin import email_gratuito as g
    _s, text, html = _build()
    assert "CNPJ 00.000.000/0001-00" in html and "CNPJ 00.000.000/0001-00" in text
    assert g.ready_problems(None) and g.ready_problems(" ")
    assert g.ready_problems("Empresa Ltda · CNPJ 1") == []
    _s, _t, sem_prazo = _build(deadline=None)
    assert "A partir de" not in sem_prazo and "Cadastre até" not in sem_prazo and "continue como está" not in sem_prazo   # sem data, nenhuma escassez
    assert "entraremos em contato para saber se você quer continuar" in sem_prazo



def test_gratuito_reavaliacao_clara_sem_contradicao_e_com_links_legais():
    _s, text, html = _build()
    for t in (text, html):
        assert ("entraremos em contato para saber se você quer continuar" in t) or ("vamos entrar em contato com quem não tiver nenhum destes cadastros" in t)
        assert "30 dias" not in t and "descontinua" not in t.lower()          # sem prazo inventado e sem ameaça de encerramento
        assert "/privacy" in t and "/terms" in t
    assert "Nada muda na sua conta agora" in html and "o que acontece com contas sem nenhum cadastro" in html


def test_gratuito_e_um_modelo_so_que_se_adapta_ao_que_falta():
    base = {"pet": True, "food": False, "push": False, "location": False}
    # linha 2: tem pet, sem ração, sem notificação → 3 passos, botão principal é a ração
    _s, text, html = _build(progress=base)
    assert "São três passos" in html and "Cadastrar a ração do Baby" in html and "Ative as notificações" in html and "Ative a localização" in html
    # linha 4: tem ração, sem notificação → não pede ração de novo; agradece
    _s, text, html = _build(progress={**base, "food": True})
    assert "Cadastre a ração" not in html and "Obrigado por já ter cadastrado a ração" in html and "Ativar as notificações" in html
    # linha 1: sem pet → pede o pet primeiro
    _s, text, html = _build(progress={**base, "pet": False})
    assert "Cadastre o seu pet" in html and "Cadastrar o meu pet" in html and "addPet=1" in html
    assert "Cadastre a ração" not in html                                               # sem pet, ração não faz sentido ainda
    # 2º contato (linha 3): já tem notificação → agradece e não pede notificação
    _s, text, html = _build(progress={**base, "push": True})
    assert "Obrigado por já ter ativado as notificações" in html and "Ative as notificações" not in html
    # linha 5: só falta localização → um passo
    _s, text, html = _build(progress={"pet": True, "food": True, "push": True, "location": False})
    assert "É um passo" in html and "Falta <strong" in html


def test_identificacao_da_empresa_do_rodape_e_valida_e_libera_o_envio():
    from src.admin import email_gratuito as g
    assert "65.625.299/0001-15" in g.COMPANY_LINE and "PETMOL NEGOCIOS DIGITAIS LTDA" in g.COMPANY_LINE
    assert "yahoo" not in g.COMPANY_LINE.lower() and "ramalhete" not in g.COMPANY_LINE.lower()     # sem e-mail pessoal nem endereço residencial
    digits = [int(c) for c in "65625299000115"]
    for n in (12, 13):                                                                                # dígitos verificadores do CNPJ
        w = ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if n == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
        r = sum(d * x for d, x in zip(digits[:n], w)) % 11
        assert digits[n] == (0 if r < 2 else 11 - r)
    assert g.ready_problems(g.COMPANY_LINE) == []


def test_gratuito_reenvio_so_com_include_already_e_preview_conta_quem_ja_recebeu(client, admin, outbox):
    db = SessionLocal()
    try:
        _user(db, "Bia Lima")
    finally:
        db.close()
    g = _gratuito(client)
    body = {"segment": "gratuito_dia0", "audience": {"kind": "all"}}
    assert client.post(f"/v1/admin/email-campaigns/{g['id']}/send", json={**body, "confirm_count": 2}).status_code == 200
    n = len(outbox)
    prev = client.post(f"/v1/admin/email-campaigns/{g['id']}/preview", json=body).json()
    assert prev["will_send"] == 0 and prev["already_received"] == 2 and prev["audience_total"] == 2
    re = client.post(f"/v1/admin/email-campaigns/{g['id']}/preview", json={**body, "include_already": True}).json()
    assert re["will_send"] == 2 and re["already_received"] == 2
    assert client.post(f"/v1/admin/email-campaigns/{g['id']}/send", json={**body, "include_already": True, "confirm_count": 2}).status_code == 200
    assert len(outbox) == n + 2
