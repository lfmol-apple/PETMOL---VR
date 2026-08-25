"""Auth routes for local user accounts."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Cookie, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..rate_limit import rate_limiter
from .models import EmailVerificationToken, PasswordResetToken, User
from .schemas import (
    CompleteGuestAccountRequest,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetResponse,
    TokenData,
    UserCreate,
    UserOut,
)
from .security import create_access_token, decode_token, hash_password, verify_password

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "petmol_session"
PASSWORD_RESET_TTL_MINUTES = 30
EMAIL_VERIFY_TTL_MINUTES = 60 * 24  # 24 horas


def _cookie_settings():
    # Em dev (localhost), lax funciona sem https
    # Em prod com HTTPS, usar Lax (same-origin já funciona)
    # Se frontend e backend estiverem no mesmo domínio (via proxy nginx)
    is_prod = settings.env == "prod"
    return {
        "httponly": True,
        "secure": is_prod,
        "samesite": "lax",  # Lax funciona quando frontend e backend estão no mesmo domínio
        "max_age": settings.jwt_access_token_expire_minutes * 60,
        "path": "/",
        "domain": None,  # Deixar None para usar o domínio atual automaticamente
    }


@router.post("/signup", response_model=UserOut)
def signup(payload: UserCreate, response: Response, request: Request, db: Session = Depends(get_db)):
    allowed, _, _ = rate_limiter.check_rate_limit(request, max_requests=10, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde um momento.")
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já cadastrado")

    # Validar terms_accepted
    if not payload.terms_accepted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Você deve aceitar os termos de uso")

    from datetime import datetime
    
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        terms_accepted=payload.terms_accepted,
        terms_version="2026-02-03",
        terms_accepted_at=datetime.now(timezone.utc) if payload.terms_accepted else None,
        postal_code=payload.postal_code,
        street=payload.street,
        number=str(payload.number) if payload.number else None,
        complement=payload.complement,
        neighborhood=payload.neighborhood,
        city=payload.city,
        state=payload.state,
        country=payload.country or 'Brasil',
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Envia email de verificação (best-effort, não bloqueia o cadastro)
    _send_verification_for_user(user, db)

    token = create_access_token(user_id=str(user.id))
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())

    return user


# Alias para compatibilidade com frontend existente
@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, response: Response, request: Request, db: Session = Depends(get_db)):
    """Alias para /signup - mantém compatibilidade com frontend existente"""
    allowed, _, _ = rate_limiter.check_rate_limit(request, max_requests=10, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde um momento.")
    return signup(payload, response, request, db)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    allowed, _, _ = rate_limiter.check_rate_limit(request, max_requests=10, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde um momento.")
    from ..utils.logging_utils import setup_logger, hash_email

    logger = setup_logger(__name__)
    logger.info(f"Login attempt - User: {hash_email(payload.email)}")

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user:
        logger.warning(f"Login failed - User not found: {hash_email(payload.email)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    if not verify_password(payload.password, user.password_hash):
        logger.warning(f"Login failed - Wrong password: {hash_email(payload.email)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(user_id=str(user.id))
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())
    logger.info(f"Login success - User: {hash_email(payload.email)}")
    return LoginResponse(id=user.id, email=user.email, created_at=user.created_at, access_token=token, email_verified=user.email_verified)


def _password_reset_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _password_reset_url(token: str) -> str:
    base = settings.frontend_url.rstrip("/")
    return f"{base}/auth/forgot?{urlencode({'token': token})}"


@router.post("/password-reset/request", response_model=PasswordResetResponse)
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a password reset link if the account exists.

    Always returns success to avoid leaking which e-mails are registered.
    """
    # Unauthenticated + triggers a real outbound email — without this an
    # attacker can email-bomb any address for free (no rate limit existed).
    allowed, _, _ = rate_limiter.check_rate_limit(request, max_requests=5, window_seconds=300)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde um momento.")

    email = payload.email.lower()
    if settings.env == "prod" and not all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS")):
        raise HTTPException(status_code=503, detail="Envio de e-mail não configurado. Configure SMTP e tente novamente.")

    user = db.query(User).filter(User.email == email).first()
    generic = PasswordResetResponse(
        ok=True,
        message="Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
    )
    if not user:
        return generic

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    reset_token = PasswordResetToken(
        user_id=str(user.id),
        token_hash=_password_reset_hash(token),
        expires_at=now + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
    )
    db.add(reset_token)
    db.commit()

    from ..email_otp import send_password_reset_email

    sent = send_password_reset_email(user.email, _password_reset_url(token), PASSWORD_RESET_TTL_MINUTES)
    if not sent:
        raise HTTPException(status_code=503, detail="Falha ao enviar e-mail. Tente novamente.")

    return generic


@router.post("/password-reset/confirm", response_model=PasswordResetResponse)
def confirm_password_reset(
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    token_hash = _password_reset_hash(payload.token)
    reset_token = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    now = datetime.now(timezone.utc)

    # SQLite (local dev) drops tzinfo on read even though the column is
    # DateTime(timezone=True) — normalize before comparing, same as
    # family/router.py's invite-expiry check, or this raises TypeError on
    # SQLite instead of the intended 400.
    expires_at = reset_token.expires_at if reset_token else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not reset_token or reset_token.used_at is not None or expires_at < now:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Solicite um novo e-mail.")

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Solicite um novo e-mail.")

    user.password_hash = hash_password(payload.password)
    user.email_verified = True  # acesso ao email já foi provado pelo link
    reset_token.used_at = now
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.id != reset_token.id,
    ).update({"used_at": now}, synchronize_session=False)
    db.commit()

    return PasswordResetResponse(ok=True, message="Senha redefinida com sucesso.")


def _email_verify_url(token: str) -> str:
    base = settings.frontend_url.rstrip("/")
    return f"{base}/auth/verify-email?{urlencode({'token': token})}"


def _send_verification_for_user(user: "User", db: Session) -> None:
    """Issue a fresh verification token and send the email (best-effort, non-blocking)."""
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(EmailVerificationToken(
        user_id=str(user.id),
        token_hash=_password_reset_hash(token),
        expires_at=now + timedelta(minutes=EMAIL_VERIFY_TTL_MINUTES),
    ))
    db.commit()
    from ..email_otp import send_verification_email
    try:
        send_verification_email(user.email, _email_verify_url(token), EMAIL_VERIFY_TTL_MINUTES)
    except Exception:
        pass  # non-blocking — email failure never breaks the request


@router.post("/verify-email/send", response_model=PasswordResetResponse)
def send_email_verification(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    """Re-send the email verification link for the currently authenticated user."""
    allowed, _, _ = rate_limiter.check_rate_limit(request, max_requests=5, window_seconds=300)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde um momento.")

    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization[7:]
    elif token:
        auth_token = token
    if not auth_token:
        raise HTTPException(status_code=401, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if user.email_verified:
        return PasswordResetResponse(ok=True, message="E-mail já verificado.")

    _send_verification_for_user(user, db)
    return PasswordResetResponse(ok=True, message="Link de verificação enviado para o seu e-mail.")


@router.get("/verify-email/confirm", response_model=PasswordResetResponse)
def confirm_email_verification(
    token: str,
    db: Session = Depends(get_db),
):
    """Validate the email verification token from the link click."""
    token_hash = _password_reset_hash(token)
    ev_token = db.query(EmailVerificationToken).filter(
        EmailVerificationToken.token_hash == token_hash
    ).first()
    now = datetime.now(timezone.utc)

    # See confirm_password_reset above — SQLite drops tzinfo on read.
    expires_at = ev_token.expires_at if ev_token else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not ev_token or ev_token.used_at is not None or expires_at < now:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Solicite um novo e-mail.")

    user = db.query(User).filter(User.id == ev_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado.")

    user.email_verified = True
    ev_token.used_at = now
    db.commit()

    return PasswordResetResponse(ok=True, message="E-mail confirmado com sucesso!")


@router.get("/me", response_model=UserOut)
def me(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    # Aceita token do header Authorization (Bearer token) ou do cookie
    auth_token = None
    if authorization and authorization.startswith('Bearer '):
        auth_token = authorization[7:]  # Remove "Bearer " prefix
    elif token:
        auth_token = token
    
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    
    return user


@router.post("/complete-guest", response_model=UserOut)
def complete_guest_account(
    payload: CompleteGuestAccountRequest,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    auth_token = None
    if authorization and authorization.startswith('Bearer '):
        auth_token = authorization[7:]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    if not user.email.endswith("@petmol.guest"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta conta já está cadastrada.")

    email = payload.email.lower()
    existing = db.query(User).filter(User.email == email, User.id != user.id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este e-mail já está cadastrado.")

    user.email = email
    user.password_hash = hash_password(payload.password)
    user.name = payload.name.strip() if payload.name and payload.name.strip() else user.name
    user.email_verified = False
    user.terms_accepted = True
    user.terms_version = user.terms_version or "2026-02-03"
    user.terms_accepted_at = user.terms_accepted_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    _send_verification_for_user(user, db)
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: dict,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    # Aceita token do header Authorization (Bearer token) ou do cookie
    auth_token = None
    if authorization and authorization.startswith('Bearer '):
        auth_token = authorization[7:]  # Remove "Bearer " prefix
    elif token:
        auth_token = token
    
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    
    # Atualiza apenas os campos permitidos
    allowed_fields = ['name', 'phone', 'whatsapp', 'postal_code', 'street', 'number',
                      'complement', 'neighborhood', 'city', 'state', 'country',
                      'monthly_checkin_day', 'monthly_checkin_hour', 'monthly_checkin_minute']

    for field in allowed_fields:
        if field not in payload:
            continue
        # Validação especial para dia do lembrete mensal
        if field == 'monthly_checkin_day':
            try:
                day = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_day deve ser um inteiro")
            if day not in range(0, 29):  # 0 = último dia, 1–28 = dia fixo
                raise HTTPException(status_code=422, detail="monthly_checkin_day deve ser 0 (último dia) ou 1–28")
            setattr(user, field, day)
        elif field == 'monthly_checkin_hour':
            try:
                hour = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_hour deve ser um inteiro")
            if hour not in range(0, 24):
                raise HTTPException(status_code=422, detail="monthly_checkin_hour deve ser 0–23")
            setattr(user, field, hour)
        elif field == 'monthly_checkin_minute':
            try:
                minute = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_minute deve ser um inteiro")
            if minute not in range(0, 60):
                raise HTTPException(status_code=422, detail="monthly_checkin_minute deve ser 0–59")
            setattr(user, field, minute)
        else:
            setattr(user, field, payload[field])
    
    db.commit()
    db.refresh(user)
    
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


class DeleteAccountRequest(BaseModel):
    password: str


@router.delete("/me")
def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    """Deleta a conta do usuario autenticado e todos os dados relacionados."""
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization[7:]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(status_code=401, detail="Nao autenticado")

    token_data = decode_token(auth_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Token invalido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha incorreta")

    # Deleta dados relacionados via SQL direto para evitar problemas de relacionamento
    from sqlalchemy import text
    uid = str(user.id)

    # Arquivos em disco (documentos enviados) nao sao apagados so por remover
    # a linha do banco — sem isso o "direito ao apagamento" (LGPD) nao vale
    # de verdade, o arquivo fica orfao em uploads/pet_documents. Coleta os
    # caminhos antes do DELETE para poder remover os arquivos depois do commit.
    storage_keys = [
        row[0]
        for row in db.execute(
            text(
                "SELECT storage_key FROM pet_documents "
                "WHERE pet_id IN (SELECT id FROM pets WHERE user_id = :uid) "
                "AND storage_key IS NOT NULL"
            ),
            {"uid": uid},
        ).fetchall()
    ]

    # Tabelas com pet_id (ordem importa: filhas antes de pets)
    # 'care_plans' nao existe no schema real (41 tabelas, nenhuma com esse
    # nome — confirmado inspecionando Base.metadata.tables) e derrubava esse
    # endpoint inteiro com 500 antes de chegar em qualquer outra tabela,
    # inclusive vaccine_records/pet_documents mais abaixo na lista.
    pet_child_tables = [
        'analytics_events',
        'events',
        'feeding_plans',
        'grooming_records',
        'parasite_control_records',
        'pet_document_imports',
        'pet_documents',
        'rg_public',
        'user_monthly_checkins',
        'vaccine_records',
    ]
    for t in pet_child_tables:
        db.execute(text(f"DELETE FROM {t} WHERE pet_id IN (SELECT id FROM pets WHERE user_id = :uid)"), {"uid": uid})

    # These tables key on user_id directly (not pet_id) and have no FK/cascade
    # to the users table — without this they're left orphaned after deletion:
    # push subscriptions (device + endpoint), pending reminders, and any Pet
    # Sumido reports/follows this user created or was helping with.
    db.execute(text("DELETE FROM push_subscriptions WHERE user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM native_push_tokens WHERE user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM reminders WHERE user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM user_consents WHERE user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM missing_pets WHERE user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM missing_pet_followers WHERE finder_user_id = :uid"), {"uid": uid})
    db.execute(text("DELETE FROM found_reports WHERE finder_user_id = :uid"), {"uid": uid})
    # support_feedback: anonimizar em vez de apagar — a mensagem em si já é
    # minimizada por design (sem foto/dado de saúde/documento), e continua
    # sendo sinal de produto válido depois que o autor sai; só o vínculo
    # com a identidade precisa sumir.
    db.execute(text("UPDATE support_feedback SET user_id = NULL WHERE user_id = :uid"), {"uid": uid})

    db.execute(text("DELETE FROM pets WHERE user_id = :uid"), {"uid": uid})
    db.delete(user)
    db.commit()

    if storage_keys:
        from ..pets.document_router import DOCS_UPLOAD_DIR
        for key in storage_keys:
            candidate = Path(key)
            fpath = candidate if (candidate.is_absolute() and candidate.is_file()) else DOCS_UPLOAD_DIR / candidate.name
            try:
                fpath.unlink(missing_ok=True)
            except OSError:
                pass  # best-effort — DB rows are already gone either way

    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
