"""Regressão: _migrate_push_subscriptions_from_json referenciava `engine`
(não é parâmetro da função) → NameError → derrubava run_pg_migrations
inteira em produção. O caminho SQLite dos testes nunca chama essa função,
por isso a CI ficava verde enquanto o deploy quebrava."""
from __future__ import annotations

import json

from src.migrations import _migrate_push_subscriptions_from_json


class _FakeConn:
    def __init__(self):
        self.statements: list[str] = []

    def execute(self, statement, params=None):
        self.statements.append(str(statement))
        return None


def test_push_subscription_migration_reaches_vaccine_cleanup_without_nameerror(tmp_path, monkeypatch):
    empty = tmp_path / "push_subscriptions.json"
    empty.write_text(json.dumps({}))
    monkeypatch.setenv("PUSH_SUBSCRIPTIONS_FILE", str(empty))

    conn = _FakeConn()
    # Não deve levantar NameError('engine') nem qualquer outra coisa.
    _migrate_push_subscriptions_from_json(conn)

    assert any("vaccine_records" in s and "deleted" in s.lower() for s in conn.statements)


def test_push_subscription_migration_noop_when_file_absent(tmp_path, monkeypatch):
    monkeypatch.setenv("PUSH_SUBSCRIPTIONS_FILE", str(tmp_path / "nope.json"))
    _migrate_push_subscriptions_from_json(_FakeConn())  # retorna limpo
