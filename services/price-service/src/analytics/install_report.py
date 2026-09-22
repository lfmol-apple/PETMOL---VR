"""Relatório diário por e-mail ao admin: downloads DE VERDADE (app nativo ou
instalado na tela de início) separados de acessos só pelo navegador — do
dia e acumulado, por local. Nada de outros avisos."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_BR = ZoneInfo("America/Sao_Paulo")
_PLATFORM = {"ios": "iPhone", "android": "Android", "pwa": "App instalado", "web": "Navegador"}


def _place_label(city: str, region: str, country: str) -> str:
    return f"{city}{(' · ' + region) if region else ''}{(' · ' + country) if country else ''}"


def _place_table(rows_today: dict, cum: dict, empty_label: str) -> str:
    places = sorted(cum, key=lambda k: (-rows_today.get(k, 0), -cum[k]))
    body = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee'>{_place_label(*k)}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700'>{rows_today.get(k, 0)}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right'>{cum[k]}</td></tr>"
        for k in places
    )
    return body or f"<tr><td style='padding:12px;color:#999' colspan='3'>{empty_label}</td></tr>"


def send_daily_install_report() -> bool:
    """Downloads (app nativo/PWA) e acessos (navegador) de ONTEM (00:00–24:00
    BRT) + acumulado, por local, tratados como duas coisas separadas — não
    soma navegador em cima de instalação de verdade. Enviado ao
    admin_master_email."""
    from sqlalchemy import func

    from ..db import SessionLocal
    from ..config import get_settings
    from ..mailer import send_mail
    from .install_models import AppInstall, DOWNLOAD_PLATFORMS, campaign_total, install_count_cutoff

    now_br = datetime.now(_BR)
    start_br = (now_br - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end_br = start_br + timedelta(days=1)
    start_utc = start_br.astimezone(timezone.utc)
    end_utc = end_br.astimezone(timezone.utc)
    dia = start_br.strftime("%d/%m/%Y")

    db = SessionLocal()
    try:
        cutoff = install_count_cutoff()
        # Só conta a partir do corte da campanha (o que veio antes é teste).
        rows = (
            db.query(AppInstall)
            .filter(AppInstall.created_at >= max(start_utc, cutoff), AppInstall.created_at < end_utc)
            .order_by(AppInstall.created_at)
            .all()
        )
        download_rows = [r for r in rows if r.platform in DOWNLOAD_PLATFORMS]
        acesso_rows = [r for r in rows if r.platform not in DOWNLOAD_PLATFORMS]

        # "Acumulado" que já existia (mistura tudo) continua igual — é o
        # mesmo número mostrado no push e no painel, pra não divergir. Além
        # dele, dois acumulados novos, cada um só da sua categoria.
        acumulado, base, camp = campaign_total(db)
        downloads_acumulado = int(
            db.query(func.count(AppInstall.id))
            .filter(AppInstall.created_at >= cutoff, AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
            .scalar() or 0
        )
        acessos_acumulado = int(
            db.query(func.count(AppInstall.id))
            .filter(AppInstall.created_at >= cutoff, ~AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
            .scalar() or 0
        )

        def _cum_by_place(platforms: tuple[str, ...] | None) -> dict[tuple, int]:
            q = db.query(AppInstall.city, AppInstall.region, AppInstall.country, func.count(AppInstall.id)) \
                .filter(AppInstall.created_at >= cutoff)
            if platforms is not None:
                q = q.filter(AppInstall.platform.in_(platforms))
            else:
                q = q.filter(~AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
            return {
                (city or "—", region or "", country or ""): int(n)
                for city, region, country, n in q.group_by(AppInstall.city, AppInstall.region, AppInstall.country).all()
            }

        cum_downloads = _cum_by_place(DOWNLOAD_PLATFORMS)
        cum_acessos = _cum_by_place(None)

        settings = get_settings()
        to_email = settings.admin_master_email
        n_down, n_acc = len(download_rows), len(acesso_rows)
        subject = (
            f"PETMOL — {n_down} download{'s' if n_down != 1 else ''} + {n_acc} acesso{'s' if n_acc != 1 else ''} "
            f"em {dia} · {downloads_acumulado} downloads no total"
        )

        def _by_place(subset) -> dict[tuple, int]:
            out: dict[tuple, int] = {}
            for r in subset:
                key = (r.city or "—", r.region or "", r.country or "")
                out[key] = out.get(key, 0) + 1
            return out

        by_place_downloads = _by_place(download_rows)
        by_place_acessos = _by_place(acesso_rows)

        by_platform: dict[str, int] = {}
        for r in rows:
            by_platform[r.platform] = by_platform.get(r.platform, 0) + 1
        plat_line = " · ".join(f"{_PLATFORM.get(p, p)}: {n}" for p, n in sorted(by_platform.items(), key=lambda kv: -kv[1]))

        downloads_table = _place_table(by_place_downloads, cum_downloads, "Nenhum download ainda.")
        acessos_table = _place_table(by_place_acessos, cum_acessos, "Nenhum acesso ainda.")

        def _table_html(title: str, rows_html: str) -> str:
            return f"""
  <h3 style="margin:18px 0 6px;font-size:14px">{title}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0056D2">Local (por IP — cidade/estado/país)</th>
      <th style="text-align:right;padding:6px 12px;border-bottom:2px solid #0056D2">Dia</th>
      <th style="text-align:right;padding:6px 12px;border-bottom:2px solid #0056D2">Campanha</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>"""

        html = f"""
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <h2 style="color:#0056D2;margin:0 0 4px">📲 Downloads e acessos do PETMOL — {dia}</h2>
  <p style="margin:0 0 4px;color:#6b7280">{plat_line or '—'}</p>
  <p style="margin:0 0 16px;color:#9ca3af;font-size:11px">Download = instalou o app (iPhone/Android) ou adicionou à tela de início (PWA). Acesso = só abriu o site no navegador, sem instalar nada.</p>
  {_table_html("📲 Downloads (instalação de verdade)", downloads_table)}
  {_table_html("🌐 Acessos (só navegador)", acessos_table)}
  <p style="margin:18px 0 0;font-size:16px;font-weight:800">Downloads — dia: {n_down} · acumulado: {downloads_acumulado}</p>
  <p style="margin:2px 0 0;font-size:16px;font-weight:800">Acessos — dia: {n_acc} · acumulado: {acessos_acumulado}</p>
  <p style="margin:8px 0 0;font-size:12px;color:#6b7280">Contador da campanha (todas as plataformas somadas, como antes): {acumulado} = {base} usuários já existentes + {camp} desde o corte</p>
  <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">
    Localização vem do IP — só cidade, sem rua/bairro (nenhum geo-IP dá isso).
  </p>
</div>"""
        text = (
            f"PETMOL {dia}\n\nDownloads (dia / acumulado):\n" +
            "\n".join(f"  {_place_label(*k)}: {by_place_downloads.get(k, 0)} / {cum_downloads[k]}" for k in cum_downloads) +
            f"\n\nAcessos (dia / acumulado):\n" +
            "\n".join(f"  {_place_label(*k)}: {by_place_acessos.get(k, 0)} / {cum_acessos[k]}" for k in cum_acessos) +
            f"\n\nDownloads — dia: {n_down} · acumulado: {downloads_acumulado}"
            f"\nAcessos — dia: {n_acc} · acumulado: {acessos_acumulado}"
            f"\nContador da campanha (tudo somado, como antes): {acumulado} ({base} já existentes + {camp} desde o corte)"
        )

        ok = send_mail(to=to_email, subject=subject, body_text=text, body_html=html)
        logger.info("[install-report] %s → %s (enviado=%s)", subject, to_email, ok)
        return ok
    except Exception as exc:
        logger.warning("[install-report] falhou: %s", exc)
        return False
    finally:
        db.close()
