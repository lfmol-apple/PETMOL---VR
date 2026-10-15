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
    for key in ("downloads", "cadastros_completos", "racao_primeira", "notificacao_primeira", "cadastros", "ativos"):
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


def _insights_html(ins: dict[str, Any]) -> str:
    g = ins["goal"]
    head = (f"<p style='margin:0 0 6px;font-size:13px'>Meta completa (pet + ração + notificação + localização): "
            f"<b>{g['complete']} de {g['total']}</b> tutores"
            + (f" ({round(g['pct'] * 100)}%)" if g["pct"] is not None else "") + ".</p>")
    items = "".join(
        f"<li style='margin:8px 0'><b>{_html.escape(r['title'])}</b><br>"
        f"<span style='color:#4b5563'>{_html.escape(r['evidence'])}</span><br>"
        f"<span style='color:#0056D2'>→ {_html.escape(r['action'])}</span> "
        f"<span style='color:#9ca3af;font-size:11px'>(confiança {r['confidence']})</span></li>"
        for r in ins["recommendations"]
    ) or "<li style='color:#6b7280'>Sem recomendação com dados suficientes hoje.</li>"
    m = ins.get("model") or {}
    foot = ("" if m.get("usable") else
            f"<p style='margin:6px 0 0;font-size:11px;color:#9ca3af'>Modelo de previsão ainda não ativo: {_html.escape(m.get('reason', 'dados insuficientes'))}.</p>")
    return _block("O que fazer hoje", head + f"<ol style='margin:0;padding-left:18px;font-size:13px'>{items}</ol>" + foot)


def render(brief: dict[str, Any], *, app_url: str, audience: str = "admin") -> tuple[str, str, str]:
    """audience="admin": boletim completo (atenção, sugestão, link do painel).
    audience="partner": só os números e o ranking — quem recebe não tem acesso ao painel."""
    admin = audience == "admin"
    m = brief["metrics"]
    attention = [a for a in brief["attention"] if a["severity"] != "info"]
    subject = (
        f"PETMOL {brief['label'][:5]}: {m['downloads']['value']} downloads · "
        f"{m['cadastros_completos']['value']} cadastros completos · "
        f"{m['racao_primeira']['value']} ração · {m['notificacao_primeira']['value']} notificações"
        + (f" · ⚠ {len(attention)} atenção" if attention and admin else "")
    )

    # ── HTML ──
    parts = [
        f"<h2 style='color:#0056D2;margin:0 0 2px'>📊 PETMOL — {brief['label']}</h2>",
        "<p style='margin:0 0 8px;color:#6b7280;font-size:12px'>Dia fechado (00:00–24:00, horário de Brasília)</p>",
        f"<table style='width:100%;border-collapse:collapse;font-size:14px'>{_metric_rows_html(brief)}</table>",
    ]

    insights = brief.get("insights")
    if insights:
        parts.append(_insights_html(insights))
    comms = brief.get("comms")
    if comms:
        done = comms["last24h"]
        total = sum(done.values())
        parts.append(_block("Comunicação automática", (
            f"<p style='margin:0;font-size:13px'>Piloto automático <b>{'ligado' if comms['autopilot'] else 'desligado'}</b>. "
            f"Nas últimas 24h foram enviadas <b>{total}</b> mensagem(ns) de ativação "
            f"(ração: {done.get('food', 0)}, notificação: {done.get('push_second_chance', 0) + done.get('push_location', 0)}).</p>")))

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

    ranking = brief.get("cities_downloads") or []
    if ranking:
        rows = "".join(
            f"<tr><td style='padding:3px 0;color:#9ca3af;width:24px'>{i}.</td>"
            f"<td style='padding:3px 0'>{_html.escape(c['city'])}{(' · ' + _html.escape(c['region'])) if c['region'] else ''}</td>"
            f"<td style='text-align:right;font-weight:700'>{c['downloads']}</td></tr>"
            for i, c in enumerate(ranking, 1)
        )
        parts.append(_block("Ranking de downloads por cidade", f"<table style='width:100%;font-size:13px'>{rows}</table>"))

    if brief["cities"] and admin:
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

    if brief["attention"] and admin:
        items = "".join(
            f"<li style='margin:3px 0'>{_SEVERITY_ICON.get(a['severity'], '•')} {_html.escape(a['message'])}</li>"
            for a in brief["attention"])
        parts.append(_block("Precisa de você", f"<ul style='margin:0;padding-left:18px;font-size:13px'>{items}</ul>"))

    if brief["suggestion"] and admin:
        s = brief["suggestion"]
        parts.append(_block("Sugestão do dia", (
            f"<p style='margin:0;font-size:13px'><b>{_html.escape(s['title'])}</b><br>"
            f"<span style='color:#4b5563'>{_html.escape(s['body'])}</span></p>")))

    if admin:
        parts.append(
            f"<p style='margin:24px 0 0'><a href='{_html.escape(app_url)}/admin/dashboard' "
            "style='background:#0056D2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700'>"
            "Abrir o Mission Control</a></p>"
        )
    parts.append(
        "<p style='margin:14px 0 0;font-size:11px;color:#9ca3af'>"
        "Cadastro completo = conta com pet. Alimentação e notificações contam a primeira vez de cada tutor. "
        f"{_html.escape(brief['note'])}</p>"
    )
    html_body = ("<div style='font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;"
                 "padding:20px;color:#111827'>" + "".join(parts) + "</div>")

    # ── texto puro ──
    lines = [f"PETMOL — {brief['label']} (dia fechado, horário de Brasília)", ""]
    for key in ("downloads", "cadastros_completos", "racao_primeira", "notificacao_primeira", "cadastros", "ativos"):
        x = m[key]
        lines.append(f"{x['label']}: {x['value']}  (dia anterior {_delta_text(x['delta_prev_pct'])}, média 7d {_delta_text(x['delta_avg7_pct'])})")
    comms = brief.get("comms")
    if comms:
        d = comms["last24h"]
        lines += ["", f"Comunicação automática: piloto {'ligado' if comms['autopilot'] else 'desligado'}; "
                      f"{sum(d.values())} mensagem(ns) de ativação nas últimas 24h."]
    ins = brief.get("insights")
    if ins:
        g = ins["goal"]
        lines += ["", f"O QUE FAZER HOJE — meta completa: {g['complete']} de {g['total']} tutores"
                  + (f" ({round(g['pct'] * 100)}%)" if g["pct"] is not None else "")]
        for i, r in enumerate(ins["recommendations"], 1):
            lines += [f"  {i}. {r['title']}", f"     {r['evidence']}", f"     -> {r['action']} (confiança {r['confidence']})"]
        if not ins["recommendations"]:
            lines.append("  Sem recomendação com dados suficientes hoje.")
    lines += ["", "Funil: " + " → ".join(f"{f['n']} {f['label'].lower()}" for f in funnel)]
    if brief["campaigns"]:
        lines += ["", "Campanhas:"] + [f"  {c['utm_campaign']} ({c['utm_source']}): {c['downloads']} downloads, {c['acessos']} acessos" for c in brief["campaigns"]]
    if ranking:
        lines += ["", "Ranking de downloads por cidade:"] + [
            f"  {i}. {c['city']}{' · ' + c['region'] if c['region'] else ''}: {c['downloads']}" for i, c in enumerate(ranking, 1)]
    if brief["cities"] and admin:
        lines += ["", "Top cidades:"] + [f"  {c['city']}{' · ' + c['region'] if c['region'] else ''}: {c['downloads']} downloads, {c['acessos']} acessos" for c in brief["cities"]]
    lines += ["", f"Loja: {loja['value']} aberturas, {m['loja_cliques']['value']} cliques. "
                  f"Pet Sumido: {sumido['value']} novos, {m['sumido_encontrados']['value']} encontrados."]
    if brief["attention"] and admin:
        lines += ["", "Precisa de você:"] + [f"  - {a['message']}" for a in brief["attention"]]
    if brief["suggestion"] and admin:
        lines += ["", f"Sugestão: {brief['suggestion']['title']}", f"  {brief['suggestion']['body']}"]
    lines += [""] + ([f"{app_url}/admin/dashboard", ""] if admin else []) + [brief["note"]]
    return subject, "\n".join(lines), html_body


def _partner_emails(settings) -> list[str]:
    """Quem recebe o boletim além do admin master: SECONDARY_INSTALL_PUSH_EMAIL + EXTRA_INSTALL_PUSH_EMAILS
    (os mesmos destinatários do aviso de download). Minúsculo, sem repetir, sem o admin."""
    raw = ",".join(x for x in (settings.secondary_install_push_email, settings.extra_install_push_emails) if x)
    out: list[str] = []
    seen = {(settings.admin_master_email or "").strip().lower()}
    for e in raw.split(","):
        e = e.strip().lower()
        if e and e not in seen:
            seen.add(e)
            out.append(e)
    return out


def send_daily_brief(day: Optional[date] = None) -> bool:
    """Boletim do dia anterior (ou de `day`): completo ao admin master, versão enxuta (números e ranking
    de cidades, sem painel) aos demais destinatários. Retorna True se o do admin foi enviado."""
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
    # "O que fazer hoje": leitura dos dados + modelo. Se falhar, o boletim sai igual, sem o bloco.
    try:
        from ..admin.analytics import insights_bi
        db = SessionLocal()
        try:
            brief["insights"] = insights_bi.recommendations(db)
        finally:
            db.close()
    except Exception:
        logger.exception("[daily-brief] insights falhou; boletim sai sem o bloco")
    # "Comunicação automática": o que o piloto (e as campanhas) enviaram nas últimas 24h — transparência.
    try:
        from datetime import timezone as _tz
        from sqlalchemy import func as _f
        from ..admin import activation_campaign_router as _ac
        db = SessionLocal()
        try:
            since = datetime.now(_tz.utc) - timedelta(hours=24)
            rows = (db.query(_ac.ActivationCampaignContact.campaign, _f.count())
                    .filter(_ac.ActivationCampaignContact.sent_at >= since)
                    .group_by(_ac.ActivationCampaignContact.campaign).all())
            brief["comms"] = {"last24h": {c: int(n) for c, n in rows}, "autopilot": _ac.autopilot_enabled(db)}
        finally:
            db.close()
    except Exception:
        logger.exception("[daily-brief] resumo de comunicação falhou")
    app_url = settings.frontend_url.rstrip("/")
    subject, text, html_body = render(brief, app_url=app_url)
    ok = send_mail(to=settings.admin_master_email, subject=subject, body_text=text, body_html=html_body)
    logger.info("[daily-brief] %s → %s (enviado=%s)", subject, settings.admin_master_email, ok)

    for email in _partner_emails(settings):
        try:
            p_subject, p_text, p_html = render(brief, app_url=app_url, audience="partner")
            sent = send_mail(to=email, subject=p_subject, body_text=p_text, body_html=p_html)
            logger.info("[daily-brief] %s → %s (enviado=%s)", p_subject, email, sent)
        except Exception:  # um destinatário falhar nunca derruba o do admin
            logger.exception("[daily-brief] falha ao enviar para %s", email)
    return ok
