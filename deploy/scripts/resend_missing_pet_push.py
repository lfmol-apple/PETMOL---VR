#!/usr/bin/env python3
"""Reenvia o push de "pet sumido" pra uma pessoa específica (cuidador/família
do pet), independente de ela já ter sido notificada antes.

O broadcast normal (_broadcast_missing_pet, chamado pelo "Editar e
reenviar" do app) só notifica gente NOVA no raio — quem já foi notificado
uma vez fica marcado e nunca recebe de novo por esse caminho. Esse script
existe pra cobrir o caso "a pessoa X precisa receber esse aviso de novo",
sem mexer no dedup geral do alerta.

Modo descoberta (padrão): lista o alerta ativo do pet e os cuidadores/
família que batem com --target-name, mostrando se cada um tem push
inscrito. Nada é enviado.

Modo --commit: envia o push real pra quem foi encontrado com assinatura
ativa.

Uso:
  python resend_missing_pet_push.py --pet-name Baby --target-name juju
  python resend_missing_pet_push.py --pet-name Baby --target-name juju --commit
"""
import argparse
import json
import sys
from pathlib import Path

PRICE_SERVICE_DIR = Path.cwd()
sys.path.insert(0, str(PRICE_SERVICE_DIR))

env_file = PRICE_SERVICE_DIR / ".env"
if env_file.exists():
    import os
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

import src.main  # noqa: F401 — força registro completo dos models SQLAlchemy
from src.db import SessionLocal
from src.pets.models import Pet
from src.pets.caretaker_models import PetCaretaker
from src.family.models import FamilyGroup, FamilyMember
from src.user_auth.models import User
from src.missing_pets import MissingPet
from src.notifications import _load_subscriptions, _send_push


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pet-name", default="Baby")
    ap.add_argument("--target-name", required=True, help="Nome/e-mail (parcial, case-insensitive) de quem deve receber o push de novo")
    ap.add_argument("--commit", action="store_true", help="Sem essa flag, só mostra o que seria feito")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        pet = (
            db.query(Pet)
            .filter(Pet.name.ilike(f"%{args.pet_name}%"))
            .order_by(Pet.id.desc())
            .first()
        )
        if not pet:
            print(f"Pet '{args.pet_name}' não encontrado.")
            return
        print(f"Pet: {pet.name} (id={pet.id}, owner={pet.user_id})")

        mp = (
            db.query(MissingPet)
            .filter(MissingPet.pet_id == pet.id, MissingPet.status == "active")
            .order_by(MissingPet.created_at.desc())
            .first()
        )
        if not mp:
            print("Nenhum alerta de pet sumido ATIVO encontrado pra esse pet.")
            return
        print(f"Alerta ativo: id={mp.id} criado_em={mp.created_at} raio={mp.current_radius_km}km local='{mp.last_seen_location}'")

        # Candidatos: cuidadores diretos do pet + membros da família do dono
        caretakers = db.query(PetCaretaker).filter(PetCaretaker.pet_id == pet.id).all()
        candidate_ids = {c.user_id for c in caretakers}

        group = db.query(FamilyGroup).filter(FamilyGroup.owner_id == pet.user_id).first()
        if group:
            members = db.query(FamilyMember).filter(FamilyMember.group_id == group.id).all()
            candidate_ids.update(m.user_id for m in members)

        if not candidate_ids:
            print("Esse pet não tem cuidadores nem família cadastrada.")
            return

        users = db.query(User).filter(User.id.in_(candidate_ids)).all()
        needle = args.target_name.strip().lower()
        matches = [
            u for u in users
            if needle in (u.name or "").lower() or needle in (u.email or "").lower()
        ]

        if not matches:
            print(f"\nNinguém em cuidadores/família bate com '{args.target_name}'. Cadastrados:")
            for u in users:
                print(f"  - {u.name or '(sem nome)'} <{u.email}> id={u.id}")
            return

        subs = _load_subscriptions()
        payload = {
            "title": f"🚨 {mp.pet_name} pode estar na sua região!",
            "body": (
                (f"Visto em: {mp.last_seen_location}. " if mp.last_seen_location else "")
                + f"Desaparecido desde {mp.missing_date or 'hoje'} às {mp.missing_time or '??:??'}. Toque para ajudar."
            ),
            "tag": f"missing-pet-{mp.id}",
            "renotify": True,
            "requireInteraction": True,
            "vibrate": [300, 150, 300, 150, 300],
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/icon-72x72.png",
            "data": {"url": f"/achei-um-pet?id={mp.id}"},
        }

        for u in matches:
            sub = subs.get(u.id)
            if not sub:
                print(f"\n{u.name or '(sem nome)'} <{u.email}> — SEM push inscrito nesse navegador/aparelho. Não dá pra reenviar.")
                continue
            print(f"\n{u.name or '(sem nome)'} <{u.email}> id={u.id} — tem push inscrito.")
            if args.commit:
                ok, invalid = _send_push(sub, payload)
                if ok:
                    print("  -> Push reenviado com sucesso.")
                elif invalid:
                    print("  -> Inscrição expirada/inválida — a pessoa precisa abrir o app de novo pra reativar notificações.")
                else:
                    print("  -> Falha ao enviar (erro temporário, tente de novo).")
            else:
                print("  -> (modo descoberta — rode de novo com --commit pra enviar de fato)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
