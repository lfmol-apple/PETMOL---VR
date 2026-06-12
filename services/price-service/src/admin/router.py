"""Admin API routes.

NOTE on URLs in production:
- Nginx proxies `/api/*` to backend and strips the `/api` prefix.
- Therefore frontend should call `/api/v1/admin/...` and backend must expose `/v1/admin/...`.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..user_auth.models import User
from ..user_auth.security import create_access_token, verify_password, hash_password
from ..user_auth.router import COOKIE_NAME
from ..pets.models import Pet
from .deps import get_current_admin
from .models import AdminUser
from .schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminBootstrapPromoteRequest,
    AdminMeOut,
    GlobalStatsOut,
    AccountOut,
    AccountsListOut,
    OkOut,
    TutorOut,
    PetOut,
    AdminLoginData,
    AdminMeData,
    GlobalStatsData,
    UserCreateRequest,
    UserUpdateRequest,
    UserDetailOut,
    UsersListOut,
    UserOut,
    TutorCreateRequest,
    TutorUpdateRequest,
    TutorDetailOut,
    PetCreateRequest,
    PetUpdateRequest,
    PetDetailOut,
    PetsListOut,
    DeletedOut,
)

router = APIRouter(prefix="/v1/admin", tags=["Admin"])

settings = get_settings()


def _cookie_settings():
    return {
        "httponly": True,
        "secure": settings.env == "prod",
        "samesite": "lax",
        "max_age": settings.jwt_access_token_expire_minutes * 60,
        "path": "/",
    }


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest, response: Response, db: Session = Depends(get_db)):
    # username can be either email or 'admin'
    username = payload.username.strip().lower()
    email = "admin@petmol.com" if username == "admin" else username

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso admin negado")

    token = create_access_token(user_id=str(user.id))
    # Set cookie as well (optional; frontend currently uses Bearer)
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())

    return AdminLoginResponse(
        success=True,
        data=AdminLoginData(
            admin_id=admin.id,
            username=payload.username,
            email=user.email,
            role=admin.role,
            session_token=token,
        ),
    )


@router.post("/bootstrap/promote", response_model=AdminMeOut)
def bootstrap_promote_admin(
    payload: AdminBootstrapPromoteRequest,
    db: Session = Depends(get_db),
    x_admin_bootstrap: Optional[str] = Header(default=None, alias="X-Admin-Bootstrap"),
):
    # If a secret is configured (especially in prod), require it.
    if settings.env == "prod" and not settings.admin_bootstrap_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_BOOTSTRAP_SECRET não configurado",
        )
    if settings.admin_bootstrap_secret:
        if x_admin_bootstrap != settings.admin_bootstrap_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bootstrap secret inválido")

    # Safety: only allow bootstrapping if there are no admins yet.
    existing_admins = db.query(AdminUser).count()
    if existing_admins > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bootstrap já foi realizado")

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    admin = AdminUser(user_id=str(user.id), role=payload.role)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    return AdminMeOut(
        success=True,
        data=AdminMeData(
            admin_id=admin.id,
            user_id=str(user.id),
            email=user.email,
            role=admin.role,
            created_at=admin.created_at,
        ),
    )


@router.get("/me", response_model=AdminMeOut)
def admin_me(current=Depends(get_current_admin)):
    user, admin = current
    return AdminMeOut(
        success=True,
        data=AdminMeData(
            admin_id=admin.id,
            user_id=str(user.id),
            email=user.email,
            role=admin.role,
            created_at=admin.created_at,
        ),
    )


@router.get("/stats", response_model=GlobalStatsOut)
def admin_stats(db: Session = Depends(get_db), current=Depends(get_current_admin)):
    total_users = db.query(User).count()
    total_owners = total_users  # Agora users = owners
    total_pets = db.query(Pet).count()

    countries_count = (
        db.query(func.count(func.distinct(User.country)))
        .filter(User.country.isnot(None))
        .scalar()
        or 0
    )
    cities_count = (
        db.query(func.count(func.distinct(User.city)))
        .filter(User.city.isnot(None))
        .scalar()
        or 0
    )

    return GlobalStatsOut(
        success=True,
        data=GlobalStatsData(
            total_users=total_users,
            total_owners=total_owners,
            total_pets=total_pets,
            total_vaccines=0,
            total_appointments=0,
            countries_count=int(countries_count),
            cities_count=int(cities_count),
        ),
    )


@router.get("/all-accounts", response_model=AccountsListOut)
def admin_all_accounts(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
    limit: int = 200,
    offset: int = 0,
):
    # users
    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    out: list[AccountOut] = []
    for u in users:
        pets = db.query(Pet).filter(Pet.user_id == u.id).all()

        out.append(
            AccountOut(
                user_id=str(u.id),
                email=u.email,
                created_at=u.created_at,
                tutor=(
                    TutorOut(
                        id=str(u.id),  # Agora user.id é o mesmo que tutor.id
                        name=u.name,
                        phone=u.phone,
                        email=u.email,
                        city=u.city,
                        state=u.state,
                        country=u.country,
                    )
                    if u.name
                    else None
                ),
                pets=[
                    PetOut(
                        id=str(p.id),
                        name=p.name,
                        species=p.species,
                        breed=p.breed,
                    )
                    for p in pets
                ],
            )
        )

    return AccountsListOut(success=True, data=out)


@router.post("/logout", response_model=OkOut)
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return OkOut(success=True)


# === USER MANAGEMENT ===

@router.get("/users", response_model=UsersListOut)
def admin_list_users(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
    limit: int = 100,
    offset: int = 0,
):
    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    user_data = []
    for user in users:
        user_data.append(UserOut(id=str(user.id), email=user.email, created_at=user.created_at))

    return UsersListOut(success=True, data=user_data)


@router.post("/users", response_model=UserDetailOut)
def admin_create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já existe")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at),
    )


@router.get("/users/{user_id}", response_model=UserDetailOut)
def admin_get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at),
    )


@router.put("/users/{user_id}", response_model=UserDetailOut)
def admin_update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    if payload.email and payload.email.lower() != user.email:
        existing = db.query(User).filter(User.email == payload.email.lower()).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já existe")
        user.email = payload.email.lower()

    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at),
    )


@router.delete("/users/{user_id}", response_model=DeletedOut)
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    # Check if user is an admin (prevent self-deletion)
    admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    current_user, current_admin = current
    if admin and admin.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é possível excluir seu próprio usuário")

    db.delete(user)
    db.commit()

    return DeletedOut(success=True, message=f"Usuário {user.email} excluído com sucesso")


# === TUTOR MANAGEMENT ===

@router.post("/tutors", response_model=TutorDetailOut)
def admin_create_tutor(
    payload: TutorCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    existing = db.query(Tutor).filter(Tutor.user_id == payload.user_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Usuário já possui tutor")

    tutor = Tutor(
        user_id=payload.user_id,
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        whatsapp=payload.whatsapp,
        postal_code=payload.postal_code,
        street=payload.street,
        number=payload.number,
        complement=payload.complement,
        neighborhood=payload.neighborhood,
        city=payload.city,
        state=payload.state,
        country=payload.country,
    )
    db.add(tutor)
    db.commit()
    db.refresh(tutor)

    return TutorDetailOut(
        success=True,
        data=TutorOut(
            id=str(tutor.id),
            name=tutor.name,
            phone=tutor.phone,
            email=tutor.email,
            city=tutor.city,
            state=tutor.state,
            country=tutor.country,
        ),
    )


@router.get("/tutors/{tutor_id}", response_model=TutorDetailOut)
def admin_get_tutor(
    tutor_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor não encontrado")

    return TutorDetailOut(
        success=True,
        data=TutorOut(
            id=str(tutor.id),
            name=tutor.name,
            phone=tutor.phone,
            email=tutor.email,
            city=tutor.city,
            state=tutor.state,
            country=tutor.country,
        ),
    )


@router.put("/tutors/{tutor_id}", response_model=TutorDetailOut)
def admin_update_tutor(
    tutor_id: str,
    payload: TutorUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor não encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tutor, field, value)

    db.commit()
    db.refresh(tutor)

    return TutorDetailOut(
        success=True,
        data=TutorOut(
            id=str(tutor.id),
            name=tutor.name,
            phone=tutor.phone,
            email=tutor.email,
            city=tutor.city,
            state=tutor.state,
            country=tutor.country,
        ),
    )


@router.delete("/tutors/{tutor_id}", response_model=DeletedOut)
def admin_delete_tutor(
    tutor_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor não encontrado")

    db.delete(tutor)
    db.commit()

    return DeletedOut(success=True, message=f"Tutor {tutor.name} excluído com sucesso")


# === PET MANAGEMENT ===

@router.get("/pets", response_model=PetsListOut)
def admin_list_pets(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
    limit: int = 100,
    offset: int = 0,
):
    pets = (
        db.query(Pet)
        .order_by(Pet.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    pets_data = []
    for pet in pets:
        pets_data.append(PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ))

    return PetsListOut(success=True, data=pets_data)


@router.post("/pets", response_model=PetDetailOut)
def admin_create_pet(
    payload: PetCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    tutor = db.query(Tutor).filter(Tutor.id == payload.tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor não encontrado")

    birth_date = None
    if payload.birth_date:
        try:
            birth_date = date.fromisoformat(payload.birth_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de nascimento inválida")

    pet = Pet(
        tutor_id=payload.tutor_id,
        name=payload.name,
        species=payload.species,
        breed=payload.breed,
        birth_date=birth_date,
        weight_value=payload.weight_value,
        weight_unit=payload.weight_unit,
        photo=payload.photo,
        neutered=payload.neutered,
    )
    db.add(pet)
    db.commit()
    db.refresh(pet)

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.get("/pets/{pet_id}", response_model=PetDetailOut)
def admin_get_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.put("/pets/{pet_id}", response_model=PetDetailOut)
def admin_update_pet(
    pet_id: str,
    payload: PetUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    data = payload.model_dump(exclude_unset=True)
    
    if "birth_date" in data and data["birth_date"]:
        try:
            data["birth_date"] = date.fromisoformat(data["birth_date"])
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de nascimento inválida")

    for field, value in data.items():
        setattr(pet, field, value)

    db.commit()
    db.refresh(pet)

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.delete("/pets/{pet_id}", response_model=DeletedOut)
def admin_delete_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    db.delete(pet)
    db.commit()

    return DeletedOut(success=True, message=f"Pet {pet.name} excluído com sucesso")


# ── Document Reclassification ─────────────────────────────────────────────────

from pydantic import BaseModel as _BM

class ReclassifyResult(_BM):
    total: int
    updated: int
    skipped_no_file: int
    skipped_link: int
    errors: int
    details: list[dict]


@router.post("/documents/reclassify", response_model=ReclassifyResult)
async def admin_reclassify_documents(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    """
    Re-runs the Gemini classifier on every stored document (kind='file')
    and updates category, title, establishment_name and document_date.
    Safe: never deletes files or records.
    """
    import asyncio
    import logging
    from pathlib import Path

    from ..pets.document_models import PetDocument
    from ..pets.document_router import (
        DOCS_UPLOAD_DIR,
        _classify_from_content,
        _mime_from_ext,
    )

    logger = logging.getLogger("admin.reclassify")

    docs = db.query(PetDocument).filter(PetDocument.kind == "file").all()

    total = len(docs)
    updated = 0
    skipped_no_file = 0
    skipped_link = 0
    errors = 0
    details: list[dict] = []

    for doc in docs:
        if not doc.storage_key:
            skipped_no_file += 1
            details.append({"id": doc.id, "status": "skip_no_key"})
            continue

        # Resolve file path (storage_key can be absolute or just filename)
        candidate = Path(doc.storage_key)
        fpath = candidate if candidate.is_absolute() else DOCS_UPLOAD_DIR / candidate.name
        if not fpath.exists():
            # Last-resort: search by filename stem in upload dir
            matches = list(DOCS_UPLOAD_DIR.glob(candidate.name))
            if matches:
                fpath = matches[0]
            else:
                skipped_no_file += 1
                details.append({"id": doc.id, "status": "skip_file_missing", "key": doc.storage_key})
                continue

        try:
            content = fpath.read_bytes()
            mime = doc.mime_type or _mime_from_ext(fpath.suffix.lower())

            cat, doc_date, establishment, titulo = await _classify_from_content(
                content, mime, fpath.name
            )

            doc.category = cat
            if doc_date is not None:
                doc.document_date = doc_date
            if establishment:
                doc.establishment_name = establishment
            if titulo and not doc.title:
                doc.title = titulo

            db.add(doc)
            updated += 1
            details.append({
                "id": doc.id,
                "status": "updated",
                "category": cat,
                "date": str(doc_date) if doc_date else None,
                "establishment": establishment,
                "titulo": titulo,
            })
            logger.info("[reclassify] doc=%s → cat=%s", doc.id, cat)

        except Exception as exc:
            errors += 1
            details.append({"id": doc.id, "status": "error", "error": str(exc)})
            logger.warning("[reclassify] doc=%s error: %s", doc.id, exc)

    db.commit()

    return ReclassifyResult(
        total=total,
        updated=updated,
        skipped_no_file=skipped_no_file,
        skipped_link=skipped_link,
        errors=errors,
        details=details,
    )
