"""Apagamento completo de um usuário e de tudo que depende dele.

Usado pela exclusão de conta do app (DELETE /auth/me) e pela exclusão pelo
painel admin — as duas precisam apagar o mesmo conjunto (pets, eventos,
lembretes, tokens de push, alertas...), senão sobram linhas órfãs ou a
exclusão falha por FK.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect as _sa_inspect, text
from sqlalchemy.orm import Session


def purge_user_data(db: Session, user) -> list[str]:
    """Apaga o usuário e os dados relacionados (sem commit). Devolve os
    caminhos de arquivos legados para o chamador apagar do disco após o commit."""
    uid = str(user.id)

    # Nome de tabela varia entre ambientes (prod Postgres x sqlite de teste);
    # só executa DELETE nas que existem, em vez de derrubar o endpoint com 500.
    _existing_tables = set(_sa_inspect(db.get_bind()).get_table_names())

    # Arquivos em disco (documentos enviados) nao sao apagados so por remover
    # a linha do banco — sem isso o "direito ao apagamento" (LGPD) nao vale
    # de verdade, o arquivo fica orfao em uploads/pet_documents. Coleta os
    # caminhos antes do DELETE para poder remover os arquivos depois do commit.
    # pet_documents foi removido (o PETMOL não guarda arquivos de tutor —
    # ver PR de remoção). A tabela some via migração; até lá, ainda coletamos
    # os caminhos dos arquivos legados para apagar do disco na exclusão.
    storage_keys: list[str] = []
    if "pet_documents" in _existing_tables:
        storage_keys = [
            row[0]
            for row in db.execute(
                text(
                    "SELECT storage_key FROM pet_documents "
                    "WHERE pet_id IN (SELECT id FROM pets WHERE user_id = :uid) "
                    "AND storage_key IS NOT NULL"
                ),
                {"uid": uid},
            ).fetchall()
        ]

    # Tabelas com pet_id (ordem importa: filhas antes de pets).
    pet_child_tables = [
        'analytics_events',
        'care_plans',
        'events',
        'feeding_plans',
        'grooming_records',
        'notification_pendencies',
        'parasite_control_records',
        'product_correction_events',
        'product_learning_events',
        'user_monthly_checkins',
        'vaccine_records',
    ]
    for t in pet_child_tables:
        if t not in _existing_tables:
            continue
        db.execute(text(f"DELETE FROM {t} WHERE pet_id IN (SELECT id FROM pets WHERE user_id = :uid)"), {"uid": uid})

    # These tables key on user_id directly (not pet_id) and have no FK/cascade
    # to the users table — without this they're left orphaned after deletion:
    # push subscriptions (device + endpoint), pending reminders, notificações
    # pendentes/entregues e qualquer alerta de Pet Sumido que o usuário criou
    # ou estava ajudando.
    _user_keyed_deletes = [
        ("push_subscriptions", "user_id"),
        ("native_push_tokens", "user_id"),
        ("push_delivery_logs", "user_id"),
        ("notification_pendencies", "user_id"),
        ("reminders", "user_id"),
        ("user_consents", "user_id"),
        ("missing_pets", "user_id"),
        ("missing_pet_followers", "finder_user_id"),
        ("found_reports", "finder_user_id"),
    ]
    for tbl, col in _user_keyed_deletes:
        if tbl not in _existing_tables:
            continue
        db.execute(text(f"DELETE FROM {tbl} WHERE {col} = :uid"), {"uid": uid})
    # support_feedback: anonimizar em vez de apagar — a mensagem em si já é
    # minimizada por design (sem foto/dado de saúde/documento), e continua
    # sendo sinal de produto válido depois que o autor sai; só o vínculo
    # com a identidade precisa sumir.
    db.execute(text("UPDATE support_feedback SET user_id = NULL WHERE user_id = :uid"), {"uid": uid})

    db.execute(text("DELETE FROM pets WHERE user_id = :uid"), {"uid": uid})
    db.delete(user)
    return storage_keys


def remove_storage_files(storage_keys: list[str]) -> None:
    _docs_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "pet_documents"
    for key in storage_keys:
        candidate = Path(key)
        fpath = candidate if (candidate.is_absolute() and candidate.is_file()) else _docs_dir / candidate.name
        try:
            fpath.unlink(missing_ok=True)
        except OSError:
            pass  # best-effort — as linhas do banco já foram apagadas
