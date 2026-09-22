"""Avisos ao admin sobre cadastros: conta criada e 1º pet cadastrado.

Tudo best-effort e fora do request: nunca atrapalha o cadastro do tutor.
"""
import threading
import unicodedata
from typing import Optional

from sqlalchemy import func

from .utils.logging_utils import setup_logger

logger = setup_logger(__name__)

# Nomes terminados em "a" que são masculinos (o resto termina em vogal/consoante
# e cai na regra geral). Lista curta de propósito: é uma pista, não um cadastro.
_MASC_ENDING_A = {"luca", "joshua", "nokia", "elia", "jonata", "mica", "isaias", }
_FEM_NOT_ENDING_A = {
    "beatriz", "raquel", "isabel", "ester", "esther", "ruth", "rute", "carmen", "miriam",
    "nazare", "dulce", "jaqueline", "eliane", "viviane", "simone", "michele", "nicole",
    "rachel", "abigail", "lais", "thais", "ines", "liz", "alice", "aline", "adriane",
    "luciane", "daniele", "danielle", "gisele", "giselle", "mirele", "rosane", "suelen",
    "kelly", "kelli", "jessica", "mayara", "marli", "lilian", "lillian", "cristiane",
    "fabiane", "franciele", "mariane", 
}
_MASC_NOT_ENDING_O = {
    "luiz", "luis", "davi", "david", "daniel", "rafael", "gabriel", "miguel", "samuel",
    "joel", "manuel", "emanuel", "israel", "abel", "noel", "ariel", "raul", 
    "carlos", "marcos", "lucas", "mateus", "matheus", "tomas", "thomas", "jose", "joao",
    "felipe", "jorge", "alexandre", "andre", "guilherme", "igor",
    "victor", "vitor", "renan", "ruan", "ivan", "juan", "adrian", "elias",
    "jonas", "nicolas", "cristian", "christian", "kevin", "erick", "eric", 
    "henrique", "jair", "wagner", "walter", "peter", "jefferson", "anderson", "washington",
    "wesley", "william", "willian", "caue", "kaue", "davi", 
    "vinicius", 
}


def _norm(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    ).lower().strip()


def first_name(full_name: Optional[str]) -> str:
    parts = (full_name or "").strip().split()
    return parts[0].capitalize() if parts else ""


def guess_gender(first: str) -> Optional[str]:
    """'masculino' | 'feminino' | None (não dá pra saber). Só pelo 1º nome."""
    n = _norm(first)
    if not n:
        return None
    if n in _FEM_NOT_ENDING_A:
        return "feminino"
    if n in _MASC_NOT_ENDING_O:
        return "masculino"
    if n in _MASC_ENDING_A:
        return "masculino"
    if n.endswith("a"):
        return "feminino"
    if n.endswith("o"):
        return "masculino"
    return None


_GENDER_LABEL = {"masculino": "tutor (masculino)", "feminino": "tutora (feminino)"}


def _admin_user_id(db) -> Optional[str]:
    from .config import get_settings
    from .user_auth.models import User

    admin = (
        db.query(User)
        .filter(func.lower(User.email) == get_settings().admin_master_email.lower())
        .first()
    )
    return str(admin.id) if admin else None


def _send(admin_id: str, title: str, body: str, tag: str) -> None:
    from .notifications import push_to_user

    push_to_user(admin_id, {
        "title": title,
        "body": body,
        "tag": tag,
        "data": {"url": "/admin/accounts"},
    })


def _where(user, ip: Optional[str]) -> str:
    """Cidade do cadastro; se o tutor não informou, cidade aproximada pelo IP."""
    parts = [p for p in (user.city, user.state) if p]
    if parts:
        return ", ".join(parts)
    from .geoip import geoip_lookup

    geo = geoip_lookup(ip or "") or {}
    return ", ".join(p for p in (geo.get("city"), geo.get("region")) if p) or "local desconhecido"


def _notify_account_created(user_id: str, ip: Optional[str]) -> None:
    from .db import SessionLocal
    from .user_auth.models import User
    from .pets.models import Pet

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        admin_id = _admin_user_id(db)
        if not user or not admin_id or admin_id == user_id:
            return
        name = first_name(user.name) or (user.email.split("@")[0] if user.email else "Novo tutor")
        gender = _GENDER_LABEL.get(guess_gender(name) or "", "gênero não identificado")
        has_pet = db.query(Pet.id).filter(Pet.user_id == user_id).first() is not None
        pet_txt = "já cadastrou pet" if has_pet else "ainda sem pet"
        _send(
            admin_id,
            f"👤 Conta criada: {name}",
            f"Criada em {_where(user, ip)} · {gender} · {pet_txt}",
            "petmol-account-created",
        )
    except Exception:
        logger.exception("admin_alerts: falha ao avisar conta criada")
        db.rollback()
    finally:
        db.close()


def _notify_first_pet(user_id: str, species: Optional[str]) -> None:
    from .db import SessionLocal
    from .user_auth.models import User
    from .pets.models import Pet

    db = SessionLocal()
    try:
        # só o 1º pet da conta interessa
        if db.query(func.count(Pet.id)).filter(Pet.user_id == user_id).scalar() != 1:
            return
        user = db.query(User).filter(User.id == user_id).first()
        admin_id = _admin_user_id(db)
        if not user or not admin_id or admin_id == user_id:
            return
        name = first_name(user.name) or "Um tutor"
        kind = {"dog": "cão", "cat": "gato"}.get((species or "").lower(), "pet")
        _send(admin_id, f"🐾 {name} cadastrou o 1º pet", f"Um {kind} foi cadastrado na conta de {name}.", "petmol-first-pet")
    except Exception:
        logger.exception("admin_alerts: falha ao avisar 1º pet")
        db.rollback()
    finally:
        db.close()


def notify_account_created(user_id: str, ip: Optional[str]) -> None:
    threading.Thread(target=_notify_account_created, args=(user_id, ip), daemon=True).start()


def notify_first_pet(user_id: str, species: Optional[str]) -> None:
    threading.Thread(target=_notify_first_pet, args=(user_id, species), daemon=True).start()
