#!/usr/bin/env python3
"""
Cleanup script: keep only a small allowlist of real test users.

Behavior:
1) Resolve allowed users by exact email + fuzzy identity labels.
2) DRY RUN by default (prints what would be deleted).
3) On --execute, deletes dependent rows first, then pets, then users.

Usage:
  PYTHONPATH=src python3 scripts/cleanup_keep_users.py
  PYTHONPATH=src python3 scripts/cleanup_keep_users.py --execute
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

from sqlalchemy import MetaData, Table, create_engine, delete, func, select, update
from sqlalchemy.engine import Engine

from src.config import get_settings


ALLOWED_EMAILS = {
    # Requested (may have typo)
    "leonardofmoral@gmail.com",
    # Real identifier found in DB
    "leonardofmol@gmail.com",
}

# Identity labels requested by user (resolved against real DB rows)
ALLOWED_IDENTITY_RULES = {
    "juliana_aline": ("juliana", "aline"),
    "eduardo": ("eduardo",),
}

USER_ID_COLUMNS_DELETE = ("user_id", "owner_user_id", "owner_id", "invited_by")
USER_ID_COLUMNS_NULLIFY = ("used_by",)
PET_ID_COLUMNS_DELETE = ("pet_id",)

SKIP_TABLES = {"users", "pets", "alembic_version"}


@dataclass(frozen=True)
class UserRow:
    id: str
    email: str
    name: str | None


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def load_users(engine: Engine) -> List[UserRow]:
    users = Table("users", MetaData(), autoload_with=engine)
    with engine.connect() as conn:
        rows = conn.execute(
            select(users.c.id, users.c.email, users.c.name)
        ).fetchall()
    return [UserRow(id=str(r[0]), email=str(r[1]), name=r[2]) for r in rows]


def resolve_allowed_users(users: Sequence[UserRow]) -> Tuple[Set[str], Dict[str, UserRow], List[str]]:
    by_id: Dict[str, UserRow] = {u.id: u for u in users}
    allowed_ids: Set[str] = set()
    unresolved: List[str] = []

    # 1) Exact emails
    for user in users:
        if _normalize(user.email) in {_normalize(e) for e in ALLOWED_EMAILS}:
            allowed_ids.add(user.id)

    # 2) Fuzzy identities (name/email contains all tokens)
    for label, tokens in ALLOWED_IDENTITY_RULES.items():
        matched = [
            user
            for user in users
            if all(token in f"{_normalize(user.name)} {_normalize(user.email)}" for token in tokens)
        ]
        if len(matched) == 1:
            allowed_ids.add(matched[0].id)
        elif len(matched) == 0:
            unresolved.append(f"{label}: not found")
        else:
            unresolved.append(f"{label}: ambiguous ({len(matched)} matches)")

    return allowed_ids, by_id, unresolved


def get_pet_ids_for_users(engine: Engine, user_ids: Sequence[str]) -> List[str]:
    if not user_ids:
        return []
    pets = Table("pets", MetaData(), autoload_with=engine)
    with engine.connect() as conn:
        rows = conn.execute(
            select(pets.c.id).where(pets.c.user_id.in_(list(user_ids)))
        ).fetchall()
    return [str(r[0]) for r in rows]


def build_deletion_plan(
    engine: Engine,
    remove_user_ids: Sequence[str],
    remove_pet_ids: Sequence[str],
) -> List[Tuple[str, str, str, int]]:
    """
    Returns tuples: (action, table, column, count)
    action in {"delete", "nullify"}.
    """
    metadata = MetaData()
    metadata.reflect(bind=engine)
    plan: List[Tuple[str, str, str, int]] = []

    with engine.connect() as conn:
        for table_name, table in metadata.tables.items():
            if table_name in SKIP_TABLES:
                continue

            for column_name in USER_ID_COLUMNS_DELETE:
                if column_name in table.c and remove_user_ids:
                    count = conn.execute(
                        select(func.count()).select_from(table).where(table.c[column_name].in_(list(remove_user_ids)))
                    ).scalar_one()
                    if count:
                        plan.append(("delete", table_name, column_name, int(count)))

            for column_name in USER_ID_COLUMNS_NULLIFY:
                if column_name in table.c and remove_user_ids:
                    count = conn.execute(
                        select(func.count()).select_from(table).where(table.c[column_name].in_(list(remove_user_ids)))
                    ).scalar_one()
                    if count:
                        plan.append(("nullify", table_name, column_name, int(count)))

            for column_name in PET_ID_COLUMNS_DELETE:
                if column_name in table.c and remove_pet_ids:
                    count = conn.execute(
                        select(func.count()).select_from(table).where(table.c[column_name].in_(list(remove_pet_ids)))
                    ).scalar_one()
                    if count:
                        plan.append(("delete", table_name, column_name, int(count)))

    return plan


def apply_deletion_plan(
    engine: Engine,
    plan: Sequence[Tuple[str, str, str, int]],
    remove_user_ids: Sequence[str],
    remove_pet_ids: Sequence[str],
) -> Dict[str, int]:
    metadata = MetaData()
    metadata.reflect(bind=engine)
    affected: Dict[str, int] = {}

    with engine.begin() as conn:
        # Dependents first
        for action, table_name, column_name, _ in plan:
            table: Table = metadata.tables[table_name]
            values = remove_user_ids if column_name in USER_ID_COLUMNS_DELETE + USER_ID_COLUMNS_NULLIFY else remove_pet_ids
            if not values:
                continue

            if action == "delete":
                stmt = delete(table).where(table.c[column_name].in_(list(values)))
            else:
                stmt = update(table).where(table.c[column_name].in_(list(values))).values({column_name: None})
            result = conn.execute(stmt)
            affected[f"{action}:{table_name}.{column_name}"] = affected.get(f"{action}:{table_name}.{column_name}", 0) + int(result.rowcount or 0)

        # Pets
        if remove_user_ids:
            pets = metadata.tables["pets"]
            pet_result = conn.execute(delete(pets).where(pets.c.user_id.in_(list(remove_user_ids))))
            affected["delete:pets.user_id"] = int(pet_result.rowcount or 0)

        # Users
        if remove_user_ids:
            users = metadata.tables["users"]
            user_result = conn.execute(delete(users).where(users.c.id.in_(list(remove_user_ids))))
            affected["delete:users.id"] = int(user_result.rowcount or 0)

    return affected


def cleanup_push_subscription_file(remove_user_ids: Iterable[str], dry_run: bool) -> Tuple[int, Path | None]:
    settings = get_settings()
    custom_raw = str(settings.__dict__.get("push_subscriptions_file") or "").strip()
    custom_path = Path(custom_raw).expanduser() if custom_raw else None
    candidates = [
        custom_path,
        Path(__file__).resolve().parents[1] / "push_subscriptions.json",
    ]
    target = next((p for p in candidates if p and p.exists() and p.is_file()), None)
    if not target:
        return 0, None

    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return 0, target

    if not isinstance(payload, dict):
        return 0, target

    removed = 0
    for uid in remove_user_ids:
        if uid in payload:
            removed += 1
            if not dry_run:
                payload.pop(uid, None)

    if removed and not dry_run:
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return removed, target


def main() -> int:
    parser = argparse.ArgumentParser(description="Keep allowlisted users and remove all others.")
    parser.add_argument("--execute", action="store_true", help="Execute deletion (default is DRY RUN).")
    args = parser.parse_args()

    dry_run = not args.execute
    settings = get_settings()
    engine = create_engine(settings.database_url)

    print(f"[INFO] database_url={settings.database_url}")
    print(f"[INFO] DRY_RUN={dry_run}")

    users = load_users(engine)
    allowed_ids, by_id, unresolved = resolve_allowed_users(users)

    print("\n[USERS] current:")
    for u in users:
        print(f"  - {u.id} | {u.email} | {u.name or ''}")

    print("\n[ALLOWLIST] resolved keep users:")
    for uid in sorted(allowed_ids):
        u = by_id[uid]
        print(f"  - {u.id} | {u.email} | {u.name or ''}")

    if unresolved:
        print("\n[ERROR] could not resolve all required keep identities:")
        for item in unresolved:
            print(f"  - {item}")
        print("[ABORT] Refine allowlist before executing.")
        return 2

    remove_users = [u for u in users if u.id not in allowed_ids]
    remove_user_ids = [u.id for u in remove_users]
    remove_pet_ids = get_pet_ids_for_users(engine, remove_user_ids)

    print("\n[PLAN] users to remove:")
    for u in remove_users:
        print(f"  - {u.id} | {u.email} | {u.name or ''}")
    print(f"[PLAN] pet_ids linked to removed users: {len(remove_pet_ids)}")

    plan = build_deletion_plan(engine, remove_user_ids, remove_pet_ids)
    print("\n[PLAN] dependent cleanup steps:")
    if not plan:
        print("  - none")
    else:
        for action, table, column, count in sorted(plan):
            print(f"  - {action.upper():7} {table}.{column} -> {count} row(s)")

    subs_removed, subs_file = cleanup_push_subscription_file(remove_user_ids, dry_run=dry_run)
    if subs_file:
        mode = "would remove" if dry_run else "removed"
        print(f"\n[PLAN] push_subscriptions file: {subs_file} ({mode} {subs_removed} key(s))")

    if dry_run:
        print("\n[DONE] Dry run completed. Re-run with --execute to apply.")
        return 0

    affected = apply_deletion_plan(engine, plan, remove_user_ids, remove_pet_ids)
    subs_removed_exec, subs_file_exec = cleanup_push_subscription_file(remove_user_ids, dry_run=False)
    if subs_file_exec and subs_removed_exec:
        affected[f"delete:{subs_file_exec.name}"] = subs_removed_exec

    print("\n[RESULT] rows affected:")
    if not affected:
        print("  - none")
    else:
        for key in sorted(affected):
            print(f"  - {key} -> {affected[key]}")

    with engine.connect() as conn:
        users_table = Table("users", MetaData(), autoload_with=engine)
        pets_table = Table("pets", MetaData(), autoload_with=engine)
        users_left = conn.execute(select(func.count()).select_from(users_table)).scalar_one()
        pets_left = conn.execute(select(func.count()).select_from(pets_table)).scalar_one()

    print(f"\n[RESULT] users remaining={users_left} | pets remaining={pets_left}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
