"""Router for vaccine sync endpoints."""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .access import get_accessible_pet_or_404
from .models import Pet
from .vaccine_models import VaccineRecord
from .vaccine_schemas import (
    VaccineSyncRequest,
    VaccineSyncResponse,
    VaccineRecordOut,
    VaccineRecordSync,
)

router = APIRouter(prefix="/sync/vaccines", tags=["Vaccine Sync"])


@router.get("/{pet_id}", response_model=VaccineSyncResponse)
def get_vaccines_for_sync(
    pet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca todas as vacinas de um pet para sincronização.
    
    Retorna todas as vacinas (incluindo deletadas) com updated_at para Last-Write-Wins.
    Dono e cuidadores do pet podem acessar.
    """
    try:
        get_accessible_pet_or_404(db, str(current_user.id), pet_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet não encontrado ou você não tem permissão para acessá-lo"
        )
    
    # Buscar todas as vacinas (incluindo deletadas para sincronização completa)
    vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id
    ).all()
    
    return VaccineSyncResponse(
        vaccines=[VaccineRecordOut.model_validate(v) for v in vaccines],
        synced_count=len(vaccines),
        message="Vacinas recuperadas com sucesso"
    )


@router.post("/{pet_id}", response_model=VaccineSyncResponse)
def sync_vaccines(
    pet_id: str,
    sync_request: VaccineSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sincroniza vacinas de um pet usando estratégia Last-Write-Wins.
    
    - Compara updated_at para decidir qual versão manter
    - Cria novas vacinas se não existirem
    - Atualiza vacinas existentes se a versão recebida for mais recente
    - Dono e cuidadores do pet podem sincronizar
    """
    try:
        get_accessible_pet_or_404(db, str(current_user.id), pet_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet não encontrado ou você não tem permissão para acessá-lo"
        )
    
    # Buscar todas as vacinas existentes no banco
    existing_vaccines = {
        v.id: v for v in db.query(VaccineRecord).filter(
            VaccineRecord.pet_id == pet_id
        ).all()
    }
    
    synced_count = 0
    updated_vaccines: List[VaccineRecord] = []
    
    # Processar cada vacina recebida
    for vaccine_data in sync_request.vaccines:
        # Garantir que o pet_id está correto
        if vaccine_data.pet_id != pet_id:
            continue
        
        existing = existing_vaccines.get(vaccine_data.id)
        
        if existing:
            # Vacina já existe: comparar updated_at (Last-Write-Wins)
            if vaccine_data.updated_at > existing.updated_at:
                # Versão recebida é mais recente: atualizar
                existing.vaccine_name = vaccine_data.vaccine_name
                existing.vaccine_type = vaccine_data.vaccine_type
                existing.dose_number = vaccine_data.dose_number
                existing.applied_date = vaccine_data.applied_date
                existing.next_dose_date = vaccine_data.next_dose_date
                existing.clinic_name = vaccine_data.clinic_name
                existing.veterinarian_name = vaccine_data.veterinarian_name
                existing.batch_number = vaccine_data.batch_number
                existing.notes = vaccine_data.notes
                existing.deleted = vaccine_data.deleted
                existing.updated_at = vaccine_data.updated_at
                
                synced_count += 1
                updated_vaccines.append(existing)
            else:
                # Versão local é mais recente ou igual: manter
                updated_vaccines.append(existing)
        else:
            # Vacina nova: criar
            new_vaccine = VaccineRecord(
                id=vaccine_data.id,
                pet_id=pet_id,
                vaccine_name=vaccine_data.vaccine_name,
                vaccine_type=vaccine_data.vaccine_type,
                dose_number=vaccine_data.dose_number,
                applied_date=vaccine_data.applied_date,
                next_dose_date=vaccine_data.next_dose_date,
                clinic_name=vaccine_data.clinic_name,
                veterinarian_name=vaccine_data.veterinarian_name,
                batch_number=vaccine_data.batch_number,
                notes=vaccine_data.notes,
                deleted=vaccine_data.deleted,
                created_at=vaccine_data.created_at,
                updated_at=vaccine_data.updated_at,
            )
            db.add(new_vaccine)
            synced_count += 1
            updated_vaccines.append(new_vaccine)
    
    # Commit das mudanças
    db.commit()
    
    # Refresh dos objetos para pegar valores do banco
    for vaccine in updated_vaccines:
        db.refresh(vaccine)
    
    # Retornar TODAS as vacinas atualizadas (merge completo)
    all_vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id
    ).all()
    
    return VaccineSyncResponse(
        vaccines=[VaccineRecordOut.model_validate(v) for v in all_vaccines],
        synced_count=synced_count,
        message=f"Sincronização concluída: {synced_count} vacina(s) processada(s)"
    )
