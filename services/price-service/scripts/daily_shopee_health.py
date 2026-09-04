#!/usr/bin/env python3
"""
Relatório diário de saúde da Loja (Cobasi + Shopee).

Roda 1x/dia depois de todos os jobs noturnos (timer
petmol-shopee-health, 09:00 UTC ≈ 06:00 BRT). Confere:
  - os jobs noturnos rodaram e saíram com sucesso nas últimas 26h;
  - contadores de oferta Shopee não caíram de forma anômala vs ontem;
  - conversões Shopee nas últimas 24h (conversionReport da API);
  - cliques de compra nas últimas 24h.

Manda um e-mail curto pra OPS_DAILY_REPORT_EMAIL (fallback
leonardofmol@gmail.com) com veredito ✅ / ⚠️ / 🔴, e sempre grava em
/opt/petmol/logs/shopee_health.log. Read-only no banco — nunca altera
nada. Nenhuma checagem é fatal: o que falhar entra no relatório.

Uso: python scripts/daily_shopee_health.py [--print] [--to EMAIL]
"""
from __future__ import annotations

import argparse
import json
import os
import smtplib
import subprocess
import sys
import time
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

STATE_PATH = Path(os.environ.get("SHOPEE_HEALTH_STATE", "/opt/petmol/shared/state/shopee_health.json"))
LOG_PATH = Path(os.environ.get("SHOPEE_HEALTH_LOG", "/opt/petmol/logs/shopee_health.log"))
DEFAULT_TO = "leonardofmol@gmail.com"

NIGHTLY_UNITS = (
    "petmol-shopee-sync.service",
    "petmol-awin-sync.service",
    "petmol-commerce-quality.service",
    "petmol-commerce-identity.service",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def check_nightly_jobs() -> list[dict]:
    out = []
    for unit in NIGHTLY_UNITS:
        row = {"unit": unit, "ok": False, "detail": ""}
        try:
            res = subprocess.run(
                ["systemctl", "show", unit,
                 "-p", "ExecMainStatus", "-p", "Result",
                 "-p", "ExecMainExitTimestamp", "-p", "InactiveEnterTimestamp",
                 "-p", "ActiveEnterTimestamp"],
                capture_output=True, text=True, timeout=15,
            )
            props = dict(
                line.split("=", 1) for line in res.stdout.strip().splitlines() if "=" in line
            )
            status = props.get("ExecMainStatus", "")
            result = props.get("Result", "")
            # oneshot: ActiveEnterTimestamp fica vazio; usa a hora que saiu.
            ts_raw = (props.get("ExecMainExitTimestamp") or props.get("InactiveEnterTimestamp")
                      or props.get("ActiveEnterTimestamp") or "").strip()
            age_h = None
            if ts_raw and ts_raw != "n/a":
                try:
                    # formato: "Thu 2026-09-04 05:02:16 UTC"
                    parts = ts_raw.split()
                    dt = datetime.strptime(" ".join(parts[1:3]), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    age_h = round((_now() - dt).total_seconds() / 3600, 1)
                except Exception:
                    pass
            fresh = age_h is not None and age_h <= 26
            row["ok"] = (status in ("0", "")) and result in ("success", "") and fresh
            row["detail"] = f"status={status or '-'} result={result or '-'} ha {age_h}h"
        except Exception as exc:  # noqa: BLE001
            row["detail"] = f"erro ao checar: {exc}"
        out.append(row)
    return out


def db_counters() -> dict:
    from src.db import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        r = db.execute(text("""
            select
              count(*) filter (where merchant='shopee' and active) as shopee_ativas,
              count(*) filter (where merchant='shopee' and active and match_decision in ('EXACT','HIGH_CONFIDENCE')) as validadas,
              count(distinct product_id) filter (where merchant='shopee' and active and match_decision in ('EXACT','HIGH_CONFIDENCE')) as produtos_validados,
              count(*) filter (where merchant='shopee' and active and match_decision is null) as sem_decisao,
              count(*) filter (where merchant='shopee' and match_decision='CONFLICT') as conflitos
            from marketplace_offers
        """)).one()
        clicks = db.execute(text("""
            select count(*) from analytics_product_events
            where event_name='commerce_click' and occurred_at > now() - interval '24 hours'
              and properties_json::text ilike '%shopee%'
        """)).scalar() or 0
        return {
            "shopee_ativas": r[0], "validadas": r[1], "produtos_validados": r[2],
            "sem_decisao": r[3], "conflitos": r[4], "clicks_24h": int(clicks),
        }
    finally:
        db.close()


def shopee_conversions_24h() -> dict:
    try:
        from src.shopee_affiliate_client import _post
        end = int(time.time())
        start = end - 24 * 3600
        q = f"""query {{ conversionReport(purchaseTimeStart:{start}, purchaseTimeEnd:{end}, limit:100) {{
          nodes {{ conversionStatus netCommission }} }} }}"""
        data = _post(q, {})
        nodes = (data.get("conversionReport") or {}).get("nodes") or []
        net = sum(float(n.get("netCommission") or 0) for n in nodes)
        by_status: dict[str, int] = {}
        for n in nodes:
            s = n.get("conversionStatus") or "?"
            by_status[s] = by_status.get(s, 0) + 1
        return {"ok": True, "count": len(nodes), "net_commission": round(net, 2), "by_status": by_status}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:180]}


def build_report() -> tuple[str, str, str]:
    jobs = check_nightly_jobs()
    try:
        counters = db_counters()
        counters_err = None
    except Exception as exc:  # noqa: BLE001
        counters, counters_err = {}, str(exc)[:180]
    conv = shopee_conversions_24h()

    prev = {}
    try:
        prev = json.loads(STATE_PATH.read_text())
    except Exception:
        pass
    prev_c = prev.get("counters", {})

    warnings: list[str] = []
    problems: list[str] = []

    for j in jobs:
        if not j["ok"]:
            problems.append(f"job {j['unit']}: {j['detail']}")

    if counters_err:
        problems.append(f"não consegui ler o banco: {counters_err}")
    elif prev_c:
        pv = prev_c.get("produtos_validados", 0)
        cv = counters.get("produtos_validados", 0)
        if pv and cv < pv * 0.95:
            problems.append(f"produtos com Shopee validada caiu {pv} → {cv} (>5%)")
        pa = prev_c.get("shopee_ativas", 0)
        ca = counters.get("shopee_ativas", 0)
        if pa and ca < pa * 0.85:
            warnings.append(f"ofertas Shopee ativas caíram {pa} → {ca} (>15%)")
        if counters.get("conflitos", 0) > prev_c.get("conflitos", 0) + 200:
            warnings.append(f"conflitos subiram {prev_c.get('conflitos',0)} → {counters.get('conflitos',0)}")

    if not conv["ok"]:
        warnings.append(f"não consegui ler conversões da Shopee: {conv.get('error')}")

    if problems:
        verdict, emoji = "PROBLEMA", "🔴"
    elif warnings:
        verdict, emoji = "ATENÇÃO", "⚠️"
    else:
        verdict, emoji = "TUDO BEM", "✅"

    today = _now().strftime("%d/%m/%Y")
    subject = f"{emoji} Loja PETMOL {verdict} — {today}"

    lines = [f"{emoji} {verdict} — {today} (relatório automático 06:00 BRT)", ""]
    lines.append("JOBS NOTURNOS")
    for j in jobs:
        lines.append(f"  {'ok ' if j['ok'] else 'FALHOU '} {j['unit']:38} {j['detail']}")
    lines.append("")
    lines.append("OFERTAS SHOPEE (banco)")
    if counters:
        d_pv = counters.get("produtos_validados", 0) - prev_c.get("produtos_validados", 0)
        lines.append(f"  produtos com Shopee validada : {counters.get('produtos_validados','?')}  ({d_pv:+d} vs ontem)")
        lines.append(f"  ofertas validadas            : {counters.get('validadas','?')}")
        lines.append(f"  ofertas ativas (total)       : {counters.get('shopee_ativas','?')}")
        lines.append(f"  ofertas sem decisão          : {counters.get('sem_decisao','?')}")
        lines.append(f"  cliques de compra (24h)      : {counters.get('clicks_24h','?')}")
    else:
        lines.append(f"  (falha ao ler: {counters_err})")
    lines.append("")
    lines.append("CONVERSÕES SHOPEE (24h, API oficial)")
    if conv["ok"]:
        lines.append(f"  {conv['count']} conversões · comissão líquida R$ {conv['net_commission']} · {conv['by_status']}")
    else:
        lines.append(f"  (falha ao ler: {conv.get('error')})")
    if warnings:
        lines += ["", "AVISOS:"] + [f"  - {w}" for w in warnings]
    if problems:
        lines += ["", "PROBLEMAS:"] + [f"  - {p}" for p in problems]
    lines += ["", "—", "Detalhes: docs/SHOPEE_IDENTITY_CONVERGENCE.md · painel /admin/dashboard"]
    body = "\n".join(lines)

    # snapshot pro diff de amanhã
    try:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(json.dumps({
            "at": _now().isoformat(), "counters": counters, "verdict": verdict,
        }))
    except Exception:
        pass
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a") as fh:
            fh.write(f"{_now().isoformat()} {verdict} {json.dumps(counters)}\n")
    except Exception:
        pass

    return subject, body, verdict


def send_email(to_addr: str, subject: str, body: str) -> bool:
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    from_addr = os.environ.get("SMTP_FROM", f"PETMOL <{user}>") if user else ""
    if not (host and user and password):
        print("[health] SMTP não configurado — só log/print", file=sys.stderr)
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(body, "plain", "utf-8"))
    try:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(user, password)
            smtp.sendmail(from_addr or user, [to_addr], msg.as_string())
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[health] falha ao enviar e-mail: {exc}", file=sys.stderr)
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true", help="só imprime, não manda e-mail")
    ap.add_argument("--to", default=os.environ.get("OPS_DAILY_REPORT_EMAIL", DEFAULT_TO))
    args = ap.parse_args()

    subject, body, verdict = build_report()
    print(subject)
    print(body)
    if not args.print:
        sent = send_email(args.to, subject, body)
        print(f"[health] e-mail para {args.to}: {'enviado' if sent else 'NÃO enviado'}", file=sys.stderr)
    # exit 0 sempre — é relatório, não gate. O verdito vai no assunto/corpo.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
