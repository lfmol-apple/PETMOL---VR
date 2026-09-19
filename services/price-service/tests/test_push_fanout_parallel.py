"""Fan-out de push do Pet Sumido em paralelo (19/09/2026: o dono relatou
"vários segundos" até a notificação chegar em quem está perto — o envio era
um usuário por vez, cada um uma ida e volta de rede)."""
import time

import src.missing_pets as mp_mod


def test_parallel_push_runs_concurrently(monkeypatch):
    def slow_push(uid, payload, subs=None):
        time.sleep(0.25)
        return 1

    monkeypatch.setattr(mp_mod, "push_to_user", slow_push)
    users = [f"u{i}" for i in range(16)]

    t0 = time.perf_counter()
    result = mp_mod._parallel_push(users, {"title": "x"}, {})
    elapsed = time.perf_counter() - t0

    assert sorted(uid for uid, _ in result) == sorted(users)
    assert all(ok == 1 for _, ok in result)
    # serial seriam 16 × 0.25 = 4s; com 8 workers ≈ 0.5s
    assert elapsed < 1.5


def test_parallel_push_isolates_failures(monkeypatch):
    def flaky(uid, payload, subs=None):
        if uid == "bad":
            raise RuntimeError("boom")
        return 1

    monkeypatch.setattr(mp_mod, "push_to_user", flaky)
    result = dict(mp_mod._parallel_push(["a", "bad", "b"], {}, {}))
    assert result == {"a": 1, "bad": 0, "b": 1}


def test_push_case_counts_only_successes(monkeypatch):
    monkeypatch.setattr(mp_mod, "_load_subscriptions_by_user", lambda: {})
    monkeypatch.setattr(mp_mod, "push_to_user", lambda uid, p, s=None: 1 if uid != "x" else 0)
    assert mp_mod._push_case(["a", "b", "x", "me"], {}, exclude={"me"}) == 2
