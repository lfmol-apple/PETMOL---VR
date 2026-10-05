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

from ...analytics.models import AnalyticsProductEvent
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


def _classify_device_local(os_: Optional[str], device_class: Optional[str]) -> Optional[str]:
    """Cópia deliberada de `_classify_device` (admin/analytics/queries.py) —
    `queries.py` importa este módulo (`from . import permissions_bi`), então
    importar de lá pra cá criaria ciclo. Mesma lógica, mantida em sincronia
    manualmente (função pequena, pura, estável)."""
    if not os_:
        return None
    os_ = os_.lower()
    if os_ == "ios":
        return "ipad" if device_class == "tablet" else "iphone"
    if os_ == "android":
        return "android"
    if os_ in ("macos", "windows", "linux"):
        return "desktop"
    return "outros"


def device_breakdown(db: Session) -> dict:
    """iPhone/iPad/Android/Desktop/outros/sem-dado de TODO tutor cadastrado,
    pelo evento de analytics mais recente dele — diferente do breakdown de
    push (abaixo), que só conta quem tem token ATIVO. Esse aqui cobre
    qualquer um que já abriu o app alguma vez, com ou sem notificação."""
    user_ids = [uid for (uid,) in db.query(User.id).all()]
    last_seen = dict(
        db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id.in_(user_ids or ["__none__"]))
        .group_by(AnalyticsProductEvent.user_id)
        .all()
    )
    pairs = [(uid, ts) for uid, ts in last_seen.items() if ts is not None]
    latest_meta: dict[str, dict] = {}
    if pairs:
        cond = or_(*[
            and_(AnalyticsProductEvent.user_id == uid, AnalyticsProductEvent.received_at == ts)
            for uid, ts in pairs
        ])
        for uid, os_, dclass in (
            db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.os, AnalyticsProductEvent.device_class)
            .filter(cond)
            .all()
        ):
            latest_meta.setdefault(uid, {"os": os_, "device_class": dclass})

    counts = {"iphone": 0, "ipad": 0, "android": 0, "desktop": 0, "outros": 0, "sem_dado": 0}
    for uid in user_ids:
        meta = latest_meta.get(uid)
        device_type = _classify_device_local(
            meta.get("os") if meta else None, meta.get("device_class") if meta else None
        )
        counts[device_type or "sem_dado"] += 1
    return counts


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

    today_start_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    uninstalls_today = (
        db.query(func.count(NativePushToken.id))
        .filter(NativePushToken.disabled_reason == "push_invalid_token", NativePushToken.disabled_at >= today_start_utc)
        .scalar() or 0
    )
    # Sem corte de data — linhas desativadas ANTES desta coluna existir
    # (Out/2026) têm disabled_reason NULL por definição (motivo nunca foi
    # guardado), então contar só os não-nulos já é "desde que começamos a
    # rastrear", sem precisar de uma constante de data separada.
    uninstalls_since_tracking = (
        db.query(func.count(NativePushToken.id))
        .filter(NativePushToken.disabled_reason == "push_invalid_token")
        .scalar() or 0
    )

    return {
        "total_users": total,
        "uninstalls_proxy": {
            "today": uninstalls_today,
            "since_tracking": uninstalls_since_tracking,
            "note": (
                "Proxy aproximado, não é o dado real da App Store/Google Play (ainda não integrado): conta "
                "tokens de push nativo que a Apple/Google recusaram como inválidos — forte indício de "
                "desinstalação, mas pode incluir troca de aparelho ou rotação de token sem desinstalar de "
                "verdade. Só conta a partir de quando esse motivo passou a ser registrado (Out/2026); "
                "desativações anteriores não entram, mesmo motivo nunca tendo sido guardado antes."
            ),
        },
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
        "devices": device_breakdown(db),
    }
