"""Relatório diário de downloads (1ª abertura do app) por e-mail ao admin."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_BR = ZoneInfo("America/Sao_Paulo")
_PLATFORM = {"ios": "iPhone", "android": "Android", "pwa": "App instalado", "web": "Navegador"}


def send_daily_install_report() -> bool:
    """Downloads de ONTEM (00:00–24:00 BRT), agrupados por cidade. Total no
    assunto e no fim do corpo. Enviado ao admin_master_email."""
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

        settings = get_settings()
        to_email = settings.admin_master_email
        subject = f"PETMOL — {total} download{'s' if total != 1 else ''} em {dia}"

        by_place: dict[tuple, int] = {}
        by_platform: dict[str, int] = {}
        for r in rows:
            key = (r.city or "—", r.region or "", r.country or "")
            by_place[key] = by_place.get(key, 0) + 1
            by_platform[r.platform] = by_platform.get(r.platform, 0) + 1

        place_rows = "".join(
            f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee'>{city}"
            f"{(' · ' + region) if region else ''}{(' · ' + country) if country else ''}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700'>{n}</td></tr>"
            for (city, region, country), n in sorted(by_place.items(), key=lambda kv: -kv[1])
        ) or "<tr><td style='padding:12px;color:#999' colspan='2'>Nenhum download ontem.</td></tr>"

        plat_line = " · ".join(f"{_PLATFORM.get(p, p)}: {n}" for p, n in sorted(by_platform.items(), key=lambda kv: -kv[1]))

        html = f"""
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <h2 style="color:#0056D2;margin:0 0 4px">📲 Downloads do PETMOL — {dia}</h2>
  <p style="margin:0 0 16px;color:#6b7280">{plat_line or '—'}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0056D2">Onde (por IP — cidade/estado/país)</th>
      <th style="text-align:right;padding:6px 12px;border-bottom:2px solid #0056D2">Qtd</th>
    </tr></thead>
    <tbody>{place_rows}</tbody>
  </table>
  <p style="margin:18px 0 0;font-size:16px;font-weight:800">Total do dia: {total}</p>
  <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">
    Localização vem do IP — só cidade, sem rua/bairro (nenhum geo-IP dá isso).
  </p>
</div>"""
        text = f"Downloads PETMOL {dia}\n" + "\n".join(
            f"  {c} {r} {co}: {n}" for (c, r, co), n in sorted(by_place.items(), key=lambda kv: -kv[1])
        ) + f"\n\nTotal: {total}"

        ok = send_mail(to=to_email, subject=subject, body_text=text, body_html=html)
        logger.info("[install-report] %s → %s (enviado=%s)", subject, to_email, ok)
        return ok
    except Exception as exc:
        logger.warning("[install-report] falhou: %s", exc)
        return False
    finally:
        db.close()
