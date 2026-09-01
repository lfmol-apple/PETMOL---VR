"""
mailer.py — envio de e-mail transacional via SMTP (stdlib).

Reaproveita as mesmas variáveis de ambiente já usadas pelo OTP em produção:
  SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM (opcional)

Sem SMTP configurado (dev), imprime no console e devolve False — o chamador
decide o que fazer (normalmente: seguir em frente, já tendo persistido o dado).
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(
        os.environ.get("SMTP_HOST")
        and os.environ.get("SMTP_USER")
        and os.environ.get("SMTP_PASS")
    )


def send_mail(
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    reply_to: str | None = None,
) -> bool:
    """Entrega 1 e-mail. Retorna True se o SMTP aceitou, False caso contrário."""
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    from_addr = os.environ.get("SMTP_FROM", f"PETMOL <{user}>") if user else ""

    if not (host and user and password):
        logger.warning("[MAILER DEV] SMTP não configurado — e-mail não enviado (%s / %s)", to, subject)
        print(f"\n{'='*50}\n[MAILER] Para: {to}\nAssunto: {subject}\n"
              f"{('Reply-To: ' + reply_to) if reply_to else ''}\n\n{body_text}\n{'='*50}\n")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(user, password)
            smtp.sendmail(from_addr or user, [to], msg.as_string())
        logger.info("mailer: e-mail entregue em %s (%s)", to, subject)
        return True
    except Exception as exc:
        logger.error("mailer: falha ao enviar para %s: %s", to, exc)
        return False
