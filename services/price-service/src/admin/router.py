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
from ..user_auth.security import hash_password
from ..user_auth.router import COOKIE_NAME
from ..pets.models import Pet
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .models import AdminUser
from .schemas import (
    AdminBootstrapPromoteRequest,
    AdminMeOut,
    GlobalStatsOut,
    AccountOut,
    AccountsListOut,
    OkOut,
    TutorOut,
    PetOut,
    AdminMeData,
    GlobalStatsData,
    UserCreateRequest,
    UserUpdateRequest,
    UserDetailOut,
    UsersListOut,
    UserOut,
    PetCreateRequest,
    PetUpdateRequest,
    PetDetailOut,
    PetsListOut,
    DeletedOut,
)

router = APIRouter(prefix="/v1/admin", tags=["Admin"])

settings = get_settings()


@router.post("/bootstrap/promote", response_model=AdminMeOut)
def bootstrap_promote_admin(
    payload: AdminBootstrapPromoteRequest,
    db: Session = Depends(get_db),
    x_admin_bootstrap: Optional[str] = Header(default=None, alias="X-Admin-Bootstrap"),
):
    # Only the hardcoded master email may ever be promoted — this endpoint
    # exists purely to create the AdminUser row for that one account, not
    # as a general "become admin" mechanism.
    if payload.email.strip().lower() != settings.admin_master_email.strip().lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas o e-mail master pode ser promovido")

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
def admin_stats(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
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
    current=Depends(get_current_admin_or_readonly_key),
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
    current=Depends(get_current_admin_or_readonly_key),
    limit: int = 100,
    offset: int = 0,
    email: Optional[str] = None,
):
    q = db.query(User)
    if email:
        q = q.filter(User.email.ilike(f"%{email}%"))
    users = q.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    user_data = []
    for user in users:
        user_data.append(UserOut(
            id=str(user.id), email=user.email, created_at=user.created_at,
            email_verified=bool(user.email_verified),
        ))

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
    current=Depends(get_current_admin_or_readonly_key),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at,
                     email_verified=bool(user.email_verified)),
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

    if payload.email_verified is not None:
        user.email_verified = payload.email_verified

    db.commit()
    db.refresh(user)

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at,
                     email_verified=bool(user.email_verified)),
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


# Nota: não há mais endpoints /tutors/* aqui — o modelo Tutor foi
# absorvido por User (ver user_auth/models.py); dados de tutor são
# editados via /v1/admin/users/{id}. As rotas antigas referenciavam um
# `Tutor` que não existe mais e sempre quebravam com NameError.

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
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    birth_date = None
    if payload.birth_date:
        try:
            birth_date = date.fromisoformat(payload.birth_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de nascimento inválida")

    pet = Pet(
        user_id=payload.user_id,
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

