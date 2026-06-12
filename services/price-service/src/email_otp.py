"""
email_otp.py — Envia OTP por e-mail usando smtplib (stdlib Python).
Funciona com Gmail (App Password), Outlook, qualquer SMTP.
Em dev, sem configuração, imprime o código no console.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

OTP_TTL_MINUTES = 5


def mask_email(email: str) -> str:
    """l***@gmail.com"""
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            return f"{'*' * len(local)}@{domain}"
        return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{domain}"
    except Exception:
        return email


def send_email_otp(to_email: str, code: str) -> bool:
    """
    Envia OTP para o e-mail do usuário.
    Configura via variáveis de ambiente:
      SMTP_HOST   — ex: smtp.gmail.com
      SMTP_PORT   — ex: 587
      SMTP_USER   — ex: seuemail@gmail.com
      SMTP_PASS   — App Password do Gmail (não a senha normal)
      SMTP_FROM   — ex: PETMOL <noreply@petmol.app>  (opcional, usa SMTP_USER)
    """
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    from_addr = os.environ.get("SMTP_FROM", f"PETMOL <{user}>") if user else ""

    if not (host and user and password):
        # Dev fallback — código visível no console
        logger.warning("[OTP DEV] Email não configurado. Código disponível abaixo.")
        print(f"\n{'='*50}")
        print(f"[PETMOL OTP] Para: {to_email}")
        print(f"[PETMOL OTP] Código: {code}  (válido {OTP_TTL_MINUTES} min)")
        print(f"{'='*50}\n")
        return True

    subject = "Seu código de verificação PETMOL"

    html = f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0056D2,#1a73e8);padding:32px;text-align:center;">
            <div style="font-size:40px;">🐾</div>
            <h1 style="color:#fff;margin:8px 0 4px;font-size:22px;letter-spacing:-0.5px;">PETMOL</h1>
            <p style="color:#b3d0ff;margin:0;font-size:13px;">Verificação em duas etapas</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;text-align:center;">
            <p style="color:#374151;font-size:15px;margin:0 0 24px;">
              Use o código abaixo para confirmar seu acesso.<br>
              Válido por <strong>{OTP_TTL_MINUTES} minutos</strong>.
            </p>
            <div style="background:#f0f6ff;border:2px solid #dbeafe;border-radius:12px;
                        padding:20px 40px;display:inline-block;margin-bottom:24px;">
              <span style="font-size:38px;font-weight:900;letter-spacing:10px;
                           color:#0056D2;font-family:'Courier New',monospace;">{code}</span>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              Se você não solicitou este código, ignore este e-mail.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="color:#d1d5db;font-size:11px;margin:0;">© 2026 PETMOL — petmol.app</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    text = f"Seu código PETMOL: {code}\nVálido por {OTP_TTL_MINUTES} minutos."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(user, password)
            smtp.sendmail(from_addr or user, to_email, msg.as_string())
        logger.info(f"Email OTP enviado para {mask_email(to_email)}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email OTP: {e}")
        return False


def send_password_reset_email(to_email: str, reset_url: str, ttl_minutes: int) -> bool:
    """
    Envia link de redefinicao de senha por e-mail.
    Usa as mesmas variaveis SMTP do OTP. Em dev, sem SMTP, imprime o link.
    """
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    from_addr = os.environ.get("SMTP_FROM", f"PETMOL <{user}>") if user else ""

    if not (host and user and password):
        logger.warning("[PASSWORD RESET DEV] Email não configurado. Link disponível abaixo.")
        print(f"\n{'='*50}")
        print(f"[PETMOL PASSWORD RESET] Para: {to_email}")
        print(f"[PETMOL PASSWORD RESET] Link: {reset_url}")
        print(f"[PETMOL PASSWORD RESET] Válido {ttl_minutes} min")
        print(f"{'='*50}\n")
        return True

    subject = "Redefina sua senha PETMOL"
    html = f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0056D2,#1a73e8);padding:32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.5px;">PETMOL</h1>
            <p style="color:#b3d0ff;margin:8px 0 0;font-size:13px;">Recuperação de senha</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;text-align:center;">
            <p style="color:#374151;font-size:15px;margin:0 0 24px;">
              Recebemos uma solicitação para redefinir sua senha.<br>
              O link é válido por <strong>{ttl_minutes} minutos</strong>.
            </p>
            <a href="{reset_url}"
               style="background:#0056D2;color:#ffffff;text-decoration:none;border-radius:12px;
                      display:inline-block;padding:14px 24px;font-weight:700;font-size:14px;">
              Redefinir senha
            </a>
            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">
              Se você não solicitou isso, ignore este e-mail.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    text = (
        "Redefina sua senha PETMOL:\n"
        f"{reset_url}\n\n"
        f"Link válido por {ttl_minutes} minutos. Se você não solicitou isso, ignore este e-mail."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(user, password)
            smtp.sendmail(from_addr or user, to_email, msg.as_string())
        logger.info(f"Email de redefinicao de senha enviado para {mask_email(to_email)}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email de redefinicao de senha: {e}")
        return False
