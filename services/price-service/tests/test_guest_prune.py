"""Prune de contas guest órfãs."""
import uuid
from datetime import datetime, timedelta, timezone

from src.db import SessionLocal, Base, engine
from src.user_auth.models import User
from src.pets.caretaker_models import PetCaretaker
from src.user_auth.security import hash_password
from src.user_auth.maintenance import prune_orphan_guest_accounts


def _guest(db, days_old, linked=False):
    uid = str(uuid.uuid4())
    u = User(id=uid, email=f"guest_{uid}@petmol.guest", password_hash=hash_password("x"),
             name="Cuidador", email_verified=True, terms_accepted=True)
    u.created_at = datetime.now(timezone.utc) - timedelta(days=days_old)
    db.add(u)
    db.flush()
    if linked:
        db.add(PetCaretaker(id=str(uuid.uuid4()), pet_id=str(uuid.uuid4()), user_id=uid))
    db.commit()
    return uid


def test_prunes_old_orphan_guest():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        old_orphan = _guest(db, days_old=30)
        fresh_orphan = _guest(db, days_old=1)
        old_linked = _guest(db, days_old=30, linked=True)

        n = prune_orphan_guest_accounts()
        assert n >= 1

        assert db.query(User).filter(User.id == old_orphan).first() is None
        assert db.query(User).filter(User.id == fresh_orphan).first() is not None   # novo demais
        assert db.query(User).filter(User.id == old_linked).first() is not None     # ainda cuida de um pet
    finally:
        db.query(PetCaretaker).delete()
        db.query(User).filter(User.email.like("%@petmol.guest")).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_never_touches_real_accounts():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        uid = str(uuid.uuid4())
        u = User(id=uid, email=f"{uid}@example.com", password_hash=hash_password("x"), name="Real")
        u.created_at = datetime.now(timezone.utc) - timedelta(days=365)
        db.add(u); db.commit()
        prune_orphan_guest_accounts()
        assert db.query(User).filter(User.id == uid).first() is not None
    finally:
        db.query(User).filter(User.id == uid).delete()
        db.commit()
        db.close()
