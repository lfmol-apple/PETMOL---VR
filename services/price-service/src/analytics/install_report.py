"""Relatório diário de downloads (1ª abertura do app) por e-mail ao admin: só downloads — do dia e acumulado, por local."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_BR = ZoneInfo("America/Sao_Paulo")
_PLATFORM = {"ios": "iPhone", "android": "Android", "pwa": "App instalado", "web": "Navegador"}


def _place_label(city: str, region: str, country: str) -> str:
    return f"{city}{(' · ' + region) if region else ''}{(' · ' + country) if country else ''}"


def send_daily_install_report() -> bool:
    """Downloads de ONTEM (00:00–24:00 BRT) e ACUMULADO, por local. Só isso:
    nada de acessos nem de outros avisos. Enviado ao admin_master_email."""
    from sqlalchemy import func

    from ..db import SessionLocal
    from ..config import get_settings
    from ..mailer import send_mail
    from .install_models import AppInstall

    now_br = datetime.now(_BR)
    start_br = (now_br - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end_br = start_br + timedelta(days=1)
    start_utc = start_br.astimezone(timezone.utc)
    end_utc = end_br.astimezone(timezone.utc)
    dia = start_br.strftime("%d/%m/%Y")

    db = SessionLocal()
    try:
        rows = (
            db.query(AppInstall)
            .filter(AppInstall.created_at >= start_utc, AppInstall.created_at < end_utc)
            .order_by(AppInstall.created_at)
            .all()
        )
        total = len(rows)
        acumulado = db.query(func.count(AppInstall.id)).scalar() or 0

        cum_by_place: dict[tuple, int] = {}
        for city, region, country, n in (
            db.query(AppInstall.city, AppInstall.region, AppInstall.country, func.count(AppInstall.id))
            .group_by(AppInstall.city, AppInstall.region, AppInstall.country)
            .all()
        ):
            cum_by_place[(city or "—", region or "", country or "")] = int(n)

        settings = get_settings()
        to_email = settings.admin_master_email
        subject = (
            f"PETMOL — {total} download{'s' if total != 1 else ''} em {dia} · {acumulado} no total"
        )

        by_place: dict[tuple, int] = {}
        by_platform: dict[str, int] = {}
        for r in rows:
            key = (r.city or "—", r.region or "", r.country or "")
            by_place[key] = by_place.get(key, 0) + 1
            by_platform[r.platform] = by_platform.get(r.platform, 0) + 1

        # Todos os locais que já tiveram download (acumulado), com a coluna do dia.
        places = sorted(cum_by_place, key=lambda k: (-by_place.get(k, 0), -cum_by_place[k]))

        place_rows = "".join(
            f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee'>{_place_label(*k)}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700'>{by_place.get(k, 0)}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right'>{cum_by_place[k]}</td></tr>"
            for k in places
        ) or "<tr><td style='padding:12px;color:#999' colspan='3'>Nenhum download ainda.</td></tr>"

        plat_line = " · ".join(f"{_PLATFORM.get(p, p)}: {n}" for p, n in sorted(by_platform.items(), key=lambda kv: -kv[1]))

        html = f"""
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <h2 style="color:#0056D2;margin:0 0 4px">📲 Downloads do PETMOL — {dia}</h2>
  <p style="margin:0 0 16px;color:#6b7280">{plat_line or '—'}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0056D2">Local (por IP — cidade/estado/país)</th>
      <th style="text-align:right;padding:6px 12px;border-bottom:2px solid #0056D2">Dia</th>
      <th style="text-align:right;padding:6px 12px;border-bottom:2px solid #0056D2">Acumulado</th>
    </tr></thead>
    <tbody>{place_rows}</tbody>
  </table>
  <p style="margin:18px 0 0;font-size:16px;font-weight:800">Total do dia: {total} · Acumulado: {acumulado}</p>
  <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">
    Localização vem do IP — só cidade, sem rua/bairro (nenhum geo-IP dá isso).
  </p>
</div>"""
        text = f"Downloads PETMOL {dia} (dia / acumulado)\n" + "\n".join(
            f"  {_place_label(*k)}: {by_place.get(k, 0)} / {cum_by_place[k]}" for k in places
        ) + f"\n\nTotal do dia: {total}\nAcumulado: {acumulado}"

        ok = send_mail(to=to_email, subject=subject, body_text=text, body_html=html)
        logger.info("[install-report] %s → %s (enviado=%s)", subject, to_email, ok)
        return ok
    except Exception as exc:
        logger.warning("[install-report] falhou: %s", exc)
        return False
    finally:
        db.close()
