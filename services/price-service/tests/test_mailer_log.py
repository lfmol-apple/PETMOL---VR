"""mailer-log — diagnóstico temporário (03/10/2026, sem SSH pro servidor)
pra investigar uma falha em massa real (111 de 136 e-mails) numa campanha.
Mesmo padrão já usado pra APNs/FCM: guarda o erro REAL do SMTP em memória,
lido via GET /v1/admin/debug/mailer-log (admin-gated, read-only)."""
from src.config import get_settings
from src.mailer import _RECENT_ATTEMPTS, get_recent_mailer_attempts, send_mail

READONLY_KEY = "mailer-log-teste-readonly"


def _enable_readonly(monkeypatch) -> None:
    monkeypatch.setenv("ADMIN_OPS_API_KEY", READONLY_KEY)
    get_settings.cache_clear()


def test_send_mail_sem_smtp_configurado_nao_registra_tentativa(monkeypatch):
    """Dev sem SMTP: devolve False antes de tentar conectar — não é um erro
    real de envio, não deve virar linha no log."""
    monkeypatch.delenv("SMTP_HOST", raising=False)
    _RECENT_ATTEMPTS.clear()
    ok = send_mail(to="qualquer@example.com", subject="x", body_text="y")
    assert ok is False
    assert get_recent_mailer_attempts() == []


def test_send_mail_falha_real_fica_registrada_com_o_erro(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.exemplo.com")
    monkeypatch.setenv("SMTP_USER", "user@exemplo.com")
    monkeypatch.setenv("SMTP_PASS", "senha")
    _RECENT_ATTEMPTS.clear()

    class _BoomSMTP:
        def __init__(self, *a, **kw):
            raise TimeoutError("connection timed out")

    monkeypatch.setattr("smtplib.SMTP", _BoomSMTP)

    ok = send_mail(to="falhou@example.com", subject="assunto", body_text="corpo")
    assert ok is False

    attempts = get_recent_mailer_attempts()
    assert len(attempts) == 1
    assert attempts[0]["to"] == "falhou@example.com"
    assert attempts[0]["ok"] is False
    assert "timed out" in attempts[0]["error"]


def test_mailer_log_endpoint_exige_chave_admin(client):
    r = client.get("/v1/admin/debug/mailer-log")
    assert r.status_code == 401


def test_mailer_log_endpoint_devolve_as_tentativas_recentes(monkeypatch, client):
    _enable_readonly(monkeypatch)
    monkeypatch.setenv("SMTP_HOST", "smtp.exemplo.com")
    monkeypatch.setenv("SMTP_USER", "user@exemplo.com")
    monkeypatch.setenv("SMTP_PASS", "senha")
    _RECENT_ATTEMPTS.clear()

    class _BoomSMTP:
        def __init__(self, *a, **kw):
            raise OSError("rede inacessível")

    monkeypatch.setattr("smtplib.SMTP", _BoomSMTP)
    send_mail(to="teste@example.com", subject="x", body_text="y")

    r = client.get("/v1/admin/debug/mailer-log", headers={"X-Admin-Api-Key": READONLY_KEY})
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["attempts"]) == 1
    assert data["attempts"][0]["to"] == "teste@example.com"
    assert "rede inacessível" in data["attempts"][0]["error"]


class _FakeSendGridResponse:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


def test_send_mail_usa_sendgrid_quando_configurado_em_vez_do_smtp(monkeypatch):
    """Achado real 03-04/10/2026: SMTP da Hostinger bloqueou envio em lote
    por mais de 24h sem reset. SendGrid vira o caminho padrão quando a
    chave está configurada — SMTP nem é tentado."""
    monkeypatch.setenv("SENDGRID_API_KEY", "fake-key")
    # SMTP também configurado só pra provar que NÃO é usado quando SendGrid está.
    monkeypatch.setenv("SMTP_HOST", "smtp.exemplo.com")
    monkeypatch.setenv("SMTP_USER", "user@exemplo.com")
    monkeypatch.setenv("SMTP_PASS", "senha")
    _RECENT_ATTEMPTS.clear()

    calls = []
    monkeypatch.setattr(
        "httpx.post",
        lambda url, **kw: calls.append((url, kw)) or _FakeSendGridResponse(202),
    )

    def _boom_smtp(*a, **kw):
        raise AssertionError("SMTP não deveria ser chamado quando SendGrid está configurado")
    monkeypatch.setattr("smtplib.SMTP", _boom_smtp)

    ok = send_mail(to="tutor@example.com", subject="Assunto", body_text="Corpo", body_html="<p>Corpo</p>")
    assert ok is True
    assert len(calls) == 1
    url, kw = calls[0]
    assert url == "https://api.sendgrid.com/v3/mail/send"
    assert kw["headers"]["Authorization"] == "Bearer fake-key"
    payload = kw["json"]
    assert payload["personalizations"][0]["to"] == [{"email": "tutor@example.com"}]
    assert payload["subject"] == "Assunto"
    assert {"type": "text/plain", "value": "Corpo"} in payload["content"]
    assert {"type": "text/html", "value": "<p>Corpo</p>"} in payload["content"]

    attempts = get_recent_mailer_attempts()
    assert len(attempts) == 1
    assert attempts[0]["ok"] is True


def test_send_mail_sendgrid_falha_fica_registrada_sem_cair_pro_smtp(monkeypatch):
    monkeypatch.setenv("SENDGRID_API_KEY", "fake-key")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    _RECENT_ATTEMPTS.clear()

    monkeypatch.setattr("httpx.post", lambda url, **kw: _FakeSendGridResponse(401, "Unauthorized"))

    ok = send_mail(to="tutor@example.com", subject="x", body_text="y")
    assert ok is False
    attempts = get_recent_mailer_attempts()
    assert len(attempts) == 1
    assert attempts[0]["ok"] is False
    assert "SendGrid" in attempts[0]["error"]
    assert "401" in attempts[0]["error"]


def test_parse_from_address_com_e_sem_nome():
    from src.mailer import _parse_from_address
    assert _parse_from_address("PETMOL <noreply@petmol.com.br>") == {"email": "noreply@petmol.com.br", "name": "PETMOL"}
    assert _parse_from_address("noreply@petmol.com.br") == {"email": "noreply@petmol.com.br"}
