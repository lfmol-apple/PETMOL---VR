"""
RG (Pet ID Card) API routes.
SLICE 2 - Viral sharing feature
"""
import secrets
import string
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..pets.models import Pet
from ..services.models import RGPublic, AnalyticsClick
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .schemas import (
    RGCreateRequest,
    RGCreateResponse,
    RGPublicOut,
    RGUpdateRequest,
    RGStatsResponse
)

router = APIRouter(prefix="/rg", tags=["RG"])


def generate_short_id(length: int = 8) -> str:
    """Gera ID curto alfanumérico amigável (sem caracteres ambíguos)."""
    # Remove caracteres ambíguos: 0, O, I, l, 1
    alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.post("/create", response_model=RGCreateResponse, status_code=status.HTTP_201_CREATED)
def create_rg(
    request: RGCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cria RG público para um pet.
    
    **Requisitos:**
    - Pet deve pertencer ao usuário logado
    - Cada pet pode ter apenas 1 RG público
    
    **Retorna:**
    - pet_public_id: ID curto e amigável
    - public_url: Link compartilhável petmol.com/p/<id>
    
    **Analytics:**
    - Registra evento 'rg_created'
    """
    # Verificar se pet pertence ao usuário
    pet = db.query(Pet).filter(
        Pet.id == request.pet_id,
        Pet.user_id == current_user.id
    ).first()
    
    if not pet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet não encontrado"
        )
    
    # Verificar se já existe RG para este pet
    existing_rg = db.query(RGPublic).filter(
        RGPublic.pet_id == request.pet_id
    ).first()
    
    if existing_rg:
        # Atualizar existente
        existing_rg.is_public = request.is_public
        existing_rg.contact_mode = request.contact_mode
        existing_rg.template = request.template
        existing_rg.updated_at = datetime.utcnow()
        db.commit()
        
        public_url = f"https://petmol.com/p/{existing_rg.pet_public_id}"
        
        return RGCreateResponse(
            pet_public_id=existing_rg.pet_public_id,
            public_url=public_url
        )
    
    # Gerar ID único
    while True:
        pet_public_id = generate_short_id(8)
        exists = db.query(RGPublic).filter(
            RGPublic.pet_public_id == pet_public_id
        ).first()
        if not exists:
            break
    
    # Criar RG
    rg = RGPublic(
        pet_public_id=pet_public_id,
        owner_user_id=current_user.id,
        pet_id=request.pet_id,
        is_public=request.is_public,
        contact_mode=request.contact_mode,
        template=request.template,
        pet_name=pet.name,
        pet_species=pet.species,
        pet_photo_url=pet.photo  # Base64 ou URL
    )
    
    db.add(rg)
    db.commit()
    db.refresh(rg)
    
    # Analytics (evento rg_created)
    try:
        lead_id = secrets.token_hex(32)
        analytics = AnalyticsClick(
            lead_id=lead_id,
            action="rg_created",
            source="web",
            platform="web"
        )
        db.add(analytics)
        db.commit()
    except Exception:
        pass  # Não falhar se analytics der erro
    
    public_url = f"https://petmol.com/p/{pet_public_id}"
    
    return RGCreateResponse(
        pet_public_id=pet_public_id,
        public_url=public_url
    )


@router.get("/{pet_public_id}", response_model=RGPublicOut)
def get_rg_public(
    pet_public_id: str,
    db: Session = Depends(get_db)
):
    """
    Busca RG público por ID.
    
    **Público:** Não requer autenticação.
    
    **Analytics:**
    - Incrementa view_count
    - Atualiza last_viewed_at
    - Registra evento 'rg_viewed'
    """
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id,
        RGPublic.is_public == True
    ).first()
    
    if not rg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RG não encontrado ou privado"
        )
    
    # Incrementar views
    rg.view_count += 1
    rg.last_viewed_at = datetime.utcnow()
    db.commit()
    
    # Analytics (evento rg_viewed)
    try:
        lead_id = secrets.token_hex(32)
        analytics = AnalyticsClick(
            lead_id=lead_id,
            place_name=f"RG:{pet_public_id}",
            action="rg_viewed",
            source="web",
            platform="web"
        )
        db.add(analytics)
        db.commit()
    except Exception:
        pass
    
    return rg


@router.patch("/{pet_public_id}", response_model=RGPublicOut)
def update_rg(
    pet_public_id: str,
    request: RGUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Atualiza configurações do RG.
    
    **Apenas o dono pode atualizar.**
    """
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id,
        RGPublic.owner_user_id == current_user.id
    ).first()
    
    if not rg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RG não encontrado"
        )
    
    # Atualizar campos
    if request.is_public is not None:
        rg.is_public = request.is_public
    
    if request.contact_mode is not None:
        rg.contact_mode = request.contact_mode
    
    if request.template is not None:
        rg.template = request.template
    
    rg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rg)
    
    return rg


@router.post("/{pet_public_id}/revoke", response_model=RGPublicOut)
def revoke_rg(
    pet_public_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoga o QR/RG público sem apagar o histórico interno do pet."""
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id,
        RGPublic.owner_user_id == current_user.id
    ).first()

    if not rg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RG não encontrado"
        )

    rg.is_public = False
    rg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rg)
    return rg


@router.post("/{pet_public_id}/regenerate", response_model=RGCreateResponse)
def regenerate_rg(
    pet_public_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Gera novo pet_public_id e invalida a URL antiga."""
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id,
        RGPublic.owner_user_id == current_user.id
    ).first()

    if not rg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RG não encontrado"
        )

    while True:
        new_public_id = generate_short_id(8)
        exists = db.query(RGPublic).filter(
            RGPublic.pet_public_id == new_public_id
        ).first()
        if not exists:
            break

    rg.pet_public_id = new_public_id
    rg.is_public = True
    rg.updated_at = datetime.utcnow()
    db.commit()

    public_url = f"https://petmol.com/p/{new_public_id}"
    return RGCreateResponse(
        pet_public_id=new_public_id,
        public_url=public_url
    )


@router.get("/{pet_public_id}/stats", response_model=RGStatsResponse)
def get_rg_stats(
    pet_public_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Estatísticas do RG (apenas para o dono).
    
    **Métricas:**
    - view_count: Visualizações totais
    - share_count: Compartilhamentos
    - last_viewed_at: Última visualização
    """
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id,
        RGPublic.owner_user_id == current_user.id
    ).first()
    
    if not rg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RG não encontrado"
        )
    
    return RGStatsResponse(
        pet_public_id=rg.pet_public_id,
        view_count=rg.view_count,
        share_count=rg.share_count,
        last_viewed_at=rg.last_viewed_at,
        created_at=rg.created_at
    )


@router.post("/{pet_public_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def track_rg_share(
    pet_public_id: str,
    platform: str,  # instagram_story, instagram_feed, whatsapp, etc
    db: Session = Depends(get_db)
):
    """
    Registra compartilhamento do RG.
    
    **Analytics:**
    - Incrementa share_count
    - Registra evento 'rg_shared_{platform}'
    
    **Público:** Não requer autenticação (pode ser chamado após criar RG).
    """
    rg = db.query(RGPublic).filter(
        RGPublic.pet_public_id == pet_public_id
    ).first()
    
    if rg:
        rg.share_count += 1
        db.commit()
    
    # Analytics
    try:
        lead_id = secrets.token_hex(32)
        analytics = AnalyticsClick(
            lead_id=lead_id,
            place_name=f"RG:{pet_public_id}",
            action=f"rg_shared_{platform}",
            source="web",
            platform="web"
        )
        db.add(analytics)
        db.commit()
    except Exception:
        pass
    
    return None
