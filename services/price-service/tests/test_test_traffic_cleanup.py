"""Limpeza pontual de eventos de teste automatizado (vídeo 'concluído' <3s depois de 'começado') —
nunca deve tocar em visitante real."""
from datetime import timedelta

from src.admin.analytics.test_traffic_cleanup import run
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal

from test_landing_intro import _ev


def test_apaga_so_a_sessao_com_a_assinatura_de_teste_automatizado(client):
    db = SessionLocal()
    try:
        # limpa o que outros testes já deixaram, pra não cruzar assinatura de teste
        db.query(AnalyticsProductEvent).delete()
        db.commit()

        _ev(client, "landing_intro_video_start", "bot1", props={"commercial": "pet-sumido"})
        _ev(client, "landing_intro_video_complete", "bot1", props={"commercial": "pet-sumido"})  # mesmo instante (fake)
        _ev(client, "landing_intro_video_start", "real1", props={"commercial": "pet-sumido"})
        _ev(client, "landing_intro_video_complete", "real1", props={"commercial": "pet-sumido"})

        # "visitante real": empurra a conclusão pra 44s depois do início (o teste grava tudo no mesmo instante)
        row = db.query(AnalyticsProductEvent).filter(
            AnalyticsProductEvent.anonymous_id == "real1", AnalyticsProductEvent.event_name == "landing_intro_video_complete"
        ).first()
        row.occurred_at = row.occurred_at + timedelta(seconds=44)
        db.commit()

        preview = run(db, dry_run=True)
        assert preview["bot_anonymous_ids"] == 1
        assert preview["deleted"] is False
        assert db.query(AnalyticsProductEvent).count() == 4  # nada apagado ainda

        result = run(db, dry_run=False)
        assert result["bot_anonymous_ids"] == 1 and result["deleted"] is True

        remaining = db.query(AnalyticsProductEvent).all()
        assert {r.anonymous_id for r in remaining} == {"real1"}
        assert len(remaining) == 2
    finally:
        db.close()


def test_nada_a_apagar_e_um_no_op_seguro():
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.commit()
        assert run(db, dry_run=True) == {"bot_anonymous_ids": 0, "matched_rows": 0, "deleted": False, "sample": []}
    finally:
        db.close()
