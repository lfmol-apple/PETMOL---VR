"""Cio: ritmo por espécie, previsão e lembretes por push.

Tudo é ESTIMATIVA para o tutor se organizar (nunca "dias férteis", nunca diagnóstico).
Espelho de apps/web/src/lib/heatCycles.ts — se mudar um, mude o outro.

- Cadela: cio a cada 5 ou 6 meses (padrão 6), dura 1, 2 ou 3 semanas (padrão 3).
  Lembretes: fim do cio + um por semana nos 15 dias antes do próximo (15, 8 e 1 dia antes).
- Gata: poliéstrica sazonal — na estação reprodutiva o cio volta a cada ~2–4 semanas (padrão 3) e dura
  ~4–10 dias (padrão 7). Lembretes: fim do cio + um aviso 3 dias antes do próximo.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..db import SessionLocal
from .heat_models import HeatCycle, HeatSettings
from .models import Pet

logger = logging.getLogger(__name__)

PROFILES = {
    "dog": {"intervals": (150, 180), "interval_default": 180, "durations": (7, 15, 21), "duration_default": 21,
            "reminders_before": (15, 8, 1)},
    "cat": {"intervals": (14, 21, 28), "interval_default": 21, "durations": (4, 7, 10), "duration_default": 7,
            "reminders_before": (3,)},
}
# Gata sem cio há mais que isto = pausa do ano (entressafra): não prevê nem lembra.
CAT_SEASON_PAUSE_DAYS = 90
# Cadela: média real só entra com intervalos plausíveis.
MIN_INTERVAL, MAX_INTERVAL, IN_AVERAGE = 90, 540, 3


def applies(pet: Pet) -> bool:
    return pet.sex == "female" and not pet.neutered and pet.species in PROFILES


def validate_settings(species: str, interval_days: int, duration_days: int) -> None:
    prof = PROFILES.get(species)
    if not prof:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O acompanhamento do cio é só para cadelas e gatas.")
    if interval_days not in prof["intervals"] or duration_days not in prof["durations"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha uma das opções oferecidas.")


def average_interval(cycles: list) -> Optional[int]:
    s = sorted(cycles, key=lambda c: c.started_on)
    gaps = [(s[i].started_on - s[i - 1].started_on).days for i in range(1, len(s))]
    gaps = [g for g in gaps if MIN_INTERVAL <= g <= MAX_INTERVAL][-IN_AVERAGE:]
    return round(sum(gaps) / len(gaps)) if gaps else None


def next_heat_on(species: str, settings: HeatSettings, cycles: list, today: date) -> Optional[date]:
    """Data estimada do início do próximo cio. None se não dá para estimar."""
    if not cycles or any(c.ended_on is None for c in cycles):
        return None
    last = max(cycles, key=lambda c: c.started_on)
    interval = settings.interval_days
    if species == "dog":
        avg = average_interval(cycles)  # com 2+ cios registrados, o ritmo real da cadela manda
        if avg:
            interval = avg
    elif (today - last.started_on).days > CAT_SEASON_PAUSE_DAYS:
        return None
    return last.started_on + timedelta(days=interval)


def _today_brt() -> date:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def _first(name: str) -> str:
    return (name or "Sua pet").strip().split(" ")[0] or "Sua pet"


def send_heat_reminders(today: Optional[date] = None) -> int:
    """Push diário (9h10 BRT) para quem ativou o cio. Um aviso por (pet, momento): AdminEventLog impede repetir."""
    from ..admin_alerts import _claim
    from ..notifications import push_to_user

    today = today or _today_brt()
    db: Session = SessionLocal()
    sent = 0
    try:
        rows = (db.query(HeatSettings, Pet).join(Pet, Pet.id == HeatSettings.pet_id)
                .filter(HeatSettings.enabled.is_(True)).all())
        for st, pet in rows:
            if not applies(pet):
                continue
            cycles = db.query(HeatCycle).filter(HeatCycle.pet_id == pet.id).all()
            name = _first(pet.name)
            msgs: list[tuple[str, str, str]] = []  # (momento, título, corpo)

            open_c = next((c for c in cycles if c.ended_on is None), None)
            if open_c:
                end_est = open_c.started_on + timedelta(days=st.duration_days - 1)
                if today == end_est + timedelta(days=1):
                    msgs.append((f"end{open_c.started_on:%y%m%d}", f"O cio de {name} deve ter terminado",
                                 "Pela sua configuração, já passou da duração. Confirme no app se acabou — é só um toque."))
            else:
                nxt = next_heat_on(pet.species, st, cycles, today)
                if nxt:
                    for d in PROFILES[pet.species]["reminders_before"]:
                        if today == nxt - timedelta(days=d):
                            when = "amanhã" if d == 1 else f"em cerca de {d} dias"
                            msgs.append((f"nx{nxt:%y%m%d}-{d}", f"O próximo cio de {name} é provável {when}",
                                         "É só uma estimativa para você se organizar. Abra o app para ver os detalhes."))
            for moment, title, body in msgs:
                if not _claim(db, str(pet.user_id), f"ht:{str(pet.id)[:8]}:{moment}"):
                    continue
                try:
                    push_to_user(pet.user_id, {
                        "title": title, "body": body, "tag": f"petmol-heat-{pet.id}",
                        "data": {"url": "/home"},
                    })
                    sent += 1
                except Exception:
                    logger.exception("heat: falha ao avisar sobre o cio do pet %s", pet.id)
        return sent
    finally:
        db.close()
