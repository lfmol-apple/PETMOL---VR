"""Permissões dos tutores (Tutores e Pets): quem está com notificação ativa e quem compartilha localização.

Só LÊ o que o servidor já guarda — nada é coletado a mais:
- Notificação: aparelhos com aviso ativo (`push_subscriptions` = navegador/PWA, `native_push_tokens` =
  app iPhone/Android), `disabled_at` nulo. O sistema desativa sozinho o token que o push rejeita.
- Localização: `users.location_source` — "gps" = o tutor compartilhou a posição; "city" = centro da cidade
  do cadastro; "ip" = aproximada. Só "gps" conta como compartilhou.

Limites (o painel avisa): "sem notificação" mistura nunca perguntado / negou / desativou depois, porque o
servidor só vê que não há aparelho ativo; a localização é a ÚLTIMA gravada (pode estar velha — por isso a data).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from ...notifications import NativePushToken, PushSubscription
from ...user_auth.models import User

FRESH_LOCATION_DAYS = 30
WEB, IOS, ANDROID = "web", "ios", "android"


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def has_web_push(user_id_col):
    return exists().where(and_(PushSubscription.user_id == user_id_col, PushSubscription.disabled_at.is_(None)))


def has_native(user_id_col, platform: Optional[str] = None):
    cond = [NativePushToken.user_id == user_id_col, NativePushToken.disabled_at.is_(None)]
    if platform:
        cond.append(NativePushToken.platform == platform)
    return exists().where(and_(*cond))


def has_any_push(user_id_col):
    return or_(has_web_push(user_id_col), has_native(user_id_col))


def shares_location():
    return and_(User.location_source == "gps", User.lat.is_not(None), User.lng.is_not(None))


def devices_by_user(db: Session, user_ids: list[str]) -> dict[str, list[dict]]:
    """Aparelhos ativos por tutor: [{platform, last_seen_at}] — só dos tutores da página."""
    out: dict[str, list[dict]] = {uid: [] for uid in user_ids}
    if not user_ids:
        return out
    for uid, seen in db.execute(
        select(PushSubscription.user_id, PushSubscription.last_seen_at)
        .where(PushSubscription.user_id.in_(user_ids), PushSubscription.disabled_at.is_(None))
    ).all():
        out[uid].append({"platform": WEB, "last_seen_at": _iso(seen)})
    for uid, platform, seen in db.execute(
        select(NativePushToken.user_id, NativePushToken.platform, NativePushToken.last_seen_at)
        .where(NativePushToken.user_id.in_(user_ids), NativePushToken.disabled_at.is_(None))
    ).all():
        out[uid].append({"platform": platform if platform in (IOS, ANDROID) else WEB, "last_seen_at": _iso(seen)})
    return out


def summary(db: Session) -> dict:
    total = db.query(func.count(User.id)).scalar() or 0
    fresh_cutoff = datetime.now(timezone.utc) - timedelta(days=FRESH_LOCATION_DAYS)

    def count(*conds) -> int:
        return db.query(func.count(User.id)).filter(*conds).scalar() or 0

    push_any = count(has_any_push(User.id))
    gps = count(shares_location())
    both = count(has_any_push(User.id), shares_location())
    only_push = count(has_any_push(User.id), ~shares_location())
    only_gps = count(~has_any_push(User.id), shares_location())
    neither = total - both - only_push - only_gps
    gps_fresh = count(shares_location(), User.location_updated_at >= fresh_cutoff)
    city = count(User.location_source == "city")
    ip = count(User.location_source == "ip")

    return {
        "total_users": total,
        "push": {
            "active": push_any,
            "none": total - push_any,
            "ios": count(has_native(User.id, IOS)),
            "android": count(has_native(User.id, ANDROID)),
            "web": count(has_web_push(User.id)),
        },
        "location": {
            "gps": gps,
            "gps_fresh": gps_fresh,
            "city_only": city,
            "ip_only": ip,
            "none": total - gps - city - ip,
            "fresh_days": FRESH_LOCATION_DAYS,
        },
        "combined": {"both": both, "only_push": only_push, "only_location": only_gps, "neither": neither},
    }
