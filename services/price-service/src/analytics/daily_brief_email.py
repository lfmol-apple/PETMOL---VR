"""Boletim diário por e-mail ao admin — substitui o relatório só de
downloads/acessos por cidade (`install_report.py`, que segue disponível).

Mesma fonte da aba "Hoje" do Mission Control (`briefing_bi.build_brief`):
o que aparece na tela e o que chega no e-mail nunca divergem. Sai às 8h de
Brasília com o dia ANTERIOR fechado (00:00–24:00 BRT).
"""
from __future__ import annotations

import html as _html
import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
_BR = ZoneInfo("America/Sao_Paulo")

_SEVERITY_ICON = {"critical": "🔴", "attention": "🟠", "info": "🔵"}


def _fmt_delta(pct: Optional[float], versus: str) -> str:
    if pct is None:
        return f"<span style='color:#9ca3af'>sem base {versus}</span>"
    if pct == 0:
        return f"<span style='color:#6b7280'>= {versus}</span>"
    up = pct > 0
    color = "#059669" if up else "#dc2626"
    return f"<span style='color:{color}'>{'▲' if up else '▼'} {abs(pct):g}% {versus}</span>"


def _delta_text(pct: Optional[float]) -> str:
    return "sem base" if pct is None else f"{'+' if pct > 0 else ''}{pct:g}%"


def _metric_rows_html(brief: dict[str, Any]) -> str:
    rows = []
    for key in ("downloads", "acessos", "cadastros", "pets_novos", "ativos"):
        m = brief["metrics"][key]
        rows.append(
            "<tr>"
            f"<td style='padding:8px 0;border-bottom:1px solid #eee'>{_html.escape(m['label'])}</td>"
            f"<td style='padding:8px 8px;border-bottom:1px solid #eee;text-align:right;font-size:20px;font-weight:800'>{m['value']}</td>"
            f"<td style='padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:11px;line-height:1.5'>"
            f"{_fmt_delta(m['delta_prev_pct'], 'vs dia anterior')}<br>{_fmt_delta(m['delta_avg7_pct'], 'vs média 7d')}</td>"
            "</tr>"
        )
    return "".join(rows)


def _block(title: str, body: str) -> str:
    return (f"<h3 style='margin:22px 0 6px;font-size:14px;color:#0056D2'>{title}</h3>{body}")


def render(brief: dict[str, Any], *, app_url: str) -> tuple[str, str, str]:
    m = brief["metrics"]
    attention = [a for a in brief["attention"] if a["severity"] != "info"]
    subject = (
        f"PETMOL {brief['label'][:5]}: {m['downloads']['value']} downloads · "
        f"{m['cadastros']['value']} cadastros · {m['ativos']['value']} ativos"
        + (f" · ⚠ {len(attention)} atenção" if attention else "")
    )

    # ── HTML ──
    parts = [
        f"<h2 style='color:#0056D2;margin:0 0 2px'>📊 PETMOL — {brief['label']}</h2>",
        "<p style='margin:0 0 8px;color:#6b7280;font-size:12px'>Dia fechado (00:00–24:00, horário de Brasília)</p>",
        f"<table style='width:100%;border-collapse:collapse;font-size:14px'>{_metric_rows_html(brief)}</table>",
    ]

    funnel = brief["funnel"]
    parts.append(_block("Funil do dia", "<p style='margin:0;font-size:14px'>" + " → ".join(
        f"<b>{f['n']}</b> {_html.escape(f['label'].lower())}" for f in funnel) + "</p>"))

    if brief["campaigns"]:
        rows = "".join(
            f"<tr><td style='padding:4px 0'>{_html.escape(c['utm_campaign'])}"
            f"<span style='color:#9ca3af'> · {_html.escape(c['utm_source'])}</span></td>"
            f"<td style='text-align:right'>{c['downloads']} downloads</td>"
            f"<td style='text-align:right'>{c['acessos']} acessos</td></tr>"
            for c in brief["campaigns"]
        )
        note = "" if brief["has_campaign_attribution"] else (
            "<p style='margin:4px 0 0;font-size:11px;color:#b45309'>Nenhum tráfego com UTM ontem — "
            "todo o movimento caiu em direto/orgânico.</p>")
        parts.append(_block("Campanhas (top 3)", f"<table style='width:100%;font-size:13px'>{rows}</table>{note}"))

    if brief["cities"]:
        rows = "".join(
            f"<tr><td style='padding:3px 0'>{_html.escape(c['city'])}{(' · ' + _html.escape(c['region'])) if c['region'] else ''}</td>"
            f"<td style='text-align:right'>{c['downloads']} downloads</td>"
            f"<td style='text-align:right'>{c['acessos']} acessos</td></tr>"
            for c in brief["cities"]
        )
        parts.append(_block("Onde (top 5 cidades, por IP)", f"<table style='width:100%;font-size:13px'>{rows}</table>"))

    loja, sumido = m["loja_aberturas"], m["sumido_novos"]
    parts.append(_block("Loja e Pet Sumido", (
        f"<p style='margin:0;font-size:13px'>Loja: <b>{loja['value']}</b> aberturas · <b>{m['loja_cliques']['value']}</b> cliques em ofertas<br>"
        f"Pet Sumido: <b>{sumido['value']}</b> novo(s) alerta(s) · <b>{m['sumido_encontrados']['value']}</b> encontrado(s)</p>")))

    if brief["attention"]:
        items = "".join(
            f"<li style='margin:3px 0'>{_SEVERITY_ICON.get(a['severity'], '•')} {_html.escape(a['message'])}</li>"
            for a in brief["attention"])
        parts.append(_block("Precisa de você", f"<ul style='margin:0;padding-left:18px;font-size:13px'>{items}</ul>"))

    if brief["suggestion"]:
        s = brief["suggestion"]
        parts.append(_block("Sugestão do dia", (
            f"<p style='margin:0;font-size:13px'><b>{_html.escape(s['title'])}</b><br>"
            f"<span style='color:#4b5563'>{_html.escape(s['body'])}</span></p>")))

    parts.append(
        f"<p style='margin:24px 0 0'><a href='{_html.escape(app_url)}/admin/dashboard' "
        "style='background:#0056D2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700'>"
        "Abrir o Mission Control</a></p>"
        f"<p style='margin:14px 0 0;font-size:11px;color:#9ca3af'>{_html.escape(brief['note'])}</p>"
    )
    html_body = ("<div style='font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;"
                 "padding:20px;color:#111827'>" + "".join(parts) + "</div>")

    # ── texto puro ──
    lines = [f"PETMOL — {brief['label']} (dia fechado, horário de Brasília)", ""]
    for key in ("downloads", "acessos", "cadastros", "pets_novos", "ativos"):
        x = m[key]
        lines.append(f"{x['label']}: {x['value']}  (dia anterior {_delta_text(x['delta_prev_pct'])}, média 7d {_delta_text(x['delta_avg7_pct'])})")
    lines += ["", "Funil: " + " → ".join(f"{f['n']} {f['label'].lower()}" for f in funnel)]
    if brief["campaigns"]:
        lines += ["", "Campanhas:"] + [f"  {c['utm_campaign']} ({c['utm_source']}): {c['downloads']} downloads, {c['acessos']} acessos" for c in brief["campaigns"]]
    if brief["cities"]:
        lines += ["", "Top cidades:"] + [f"  {c['city']}{' · ' + c['region'] if c['region'] else ''}: {c['downloads']} downloads, {c['acessos']} acessos" for c in brief["cities"]]
    lines += ["", f"Loja: {loja['value']} aberturas, {m['loja_cliques']['value']} cliques. "
                  f"Pet Sumido: {sumido['value']} novos, {m['sumido_encontrados']['value']} encontrados."]
    if brief["attention"]:
        lines += ["", "Precisa de você:"] + [f"  - {a['message']}" for a in brief["attention"]]
    if brief["suggestion"]:
        lines += ["", f"Sugestão: {brief['suggestion']['title']}", f"  {brief['suggestion']['body']}"]
    lines += ["", f"{app_url}/admin/dashboard", "", brief["note"]]
    return subject, "\n".join(lines), html_body


def send_daily_brief(day: Optional[date] = None) -> bool:
    """Boletim do dia anterior (ou de `day`), enviado ao admin_master_email."""
    from ..admin.analytics import briefing_bi
    from ..config import get_settings
    from ..db import SessionLocal
    from ..mailer import send_mail

    settings = get_settings()
    day = day or (datetime.now(_BR) - timedelta(days=1)).date()
    db = SessionLocal()
    try:
        brief = briefing_bi.build_brief(db, day)
    finally:
        db.close()
    subject, text, html_body = render(brief, app_url=settings.frontend_url.rstrip("/"))
    ok = send_mail(to=settings.admin_master_email, subject=subject, body_text=text, body_html=html_body)
    logger.info("[daily-brief] %s → %s (enviado=%s)", subject, settings.admin_master_email, ok)
    return ok
