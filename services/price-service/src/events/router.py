"""
Events router - CRUD completo para eventos de pets
"""
import json
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .models import Event
from .schemas import EventCreate, EventUpdate, EventOut

router = APIRouter(prefix="/events", tags=["Events"])


def _get_accessible_owner_ids(user_id: str, db: Session) -> List[str]:
    """Retorna user_ids acessíveis.
    SILENCIADO: compartilhamento familiar desativado — retorna apenas o próprio usuário.
    Para reativar acesso familiar, restaurar o bloco de FamilyMember abaixo.
    """
    # SILENCIADO — family lookup removido temporariamente
    # from ..family.models import FamilyGroup, FamilyMember
    # owner_ids = {user_id}
    # memberships = db.query(FamilyMember).filter(FamilyMember.user_id == user_id).all()
    # for m in memberships:
    #     group = db.query(FamilyGroup).filter(FamilyGroup.id == m.group_id).first()
    #     if group:
    #         owner_ids.add(group.owner_id)
    # return list(owner_ids)
    return [user_id]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Criar novo evento"""
    
    # next_due_date: usa o valor direto se fornecido, senão calcula por frequency_days
    next_due_date = payload.next_due_date
    if next_due_date is None and payload.frequency_days and payload.frequency_days > 0:
        next_due_date = payload.scheduled_at + timedelta(days=payload.frequency_days)
    
    event = Event(
        user_id=str(current_user.id),
        pet_id=payload.pet_id,
        type=payload.type,
        scheduled_at=payload.scheduled_at,
        title=payload.title,
        description=payload.description,
        notes=payload.notes,
        location_name=payload.location_name,
        location_address=payload.location_address,
        location_phone=payload.location_phone,
        location_place_id=payload.location_place_id,
        professional_name=payload.professional_name,
        cost=payload.cost,
        frequency_days=payload.frequency_days,
        next_due_date=next_due_date,
        reminder_days_before=payload.reminder_days_before,
        extra_data=payload.extra_data,
        source=payload.source,
        status=payload.status or 'pending',
        reminder_sent=False,
        # Canonicalization fields
        provider_name_raw=payload.provider_name_raw,
        provider_name_canonical=payload.provider_name_canonical,
        provider_confidence=payload.provider_confidence,
        item_name_raw=payload.item_name_raw,
        item_name_canonical=payload.item_name_canonical,
        item_confidence=payload.item_confidence,
    )
    
    db.add(event)
    db.commit()
    db.refresh(event)
    
    return event


@router.get("", response_model=List[EventOut])
def list_events(
    pet_id: Optional[str] = Query(None, description="Filtrar por pet_id"),
    status: Optional[str] = Query(None, description="Filtrar por status"),
    type: Optional[str] = Query(None, description="Filtrar por tipo"),
    upcoming: Optional[bool] = Query(None, description="Somente futuros/pendentes"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Listar eventos do usuário (inclui acesso familiar)"""
    owner_ids = _get_accessible_owner_ids(str(current_user.id), db)
    query = db.query(Event).filter(Event.user_id.in_(owner_ids), Event.deleted_at.is_(None))
    
    if pet_id:
        query = query.filter(Event.pet_id == pet_id)
    
    if status:
        query = query.filter(Event.status == status)
    
    if type:
        query = query.filter(Event.type == type)
    
    if upcoming:
        # Eventos futuros ou pendentes
        query = query.filter(
            and_(
                Event.status == "pending",
                Event.scheduled_at >= datetime.utcnow()
            )
        )
    
    events = query.order_by(Event.scheduled_at.desc()).all()
    return events


@router.get("/{event_id}", response_model=EventOut)
def get_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obter evento por ID"""
    
    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id),
        Event.deleted_at.is_(None),
    ).first()
    
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado"
        )
    
    return event


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: str,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualizar evento"""
    
    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id),
        Event.deleted_at.is_(None),
    ).first()
    
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado"
        )
    
    # Atualizar campos fornecidos
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)
    
    # Recalcular next_due_date: se enviado diretamente, usa o valor; caso contrário calcula por frequency_days
    if "next_due_date" not in update_data:
        if event.status == "completed" and event.completed_at and event.frequency_days:
            event.next_due_date = event.completed_at + timedelta(days=event.frequency_days)
    
    event.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(event)
    
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deletar evento"""
    
    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()
    
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado"
        )
    
    event.deleted_at = datetime.utcnow()
    event.updated_at = datetime.utcnow()
    db.commit()
    
    return None


@router.post("/{event_id}/complete", response_model=EventOut)
def complete_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marcar evento como concluído e criar próximo se recorrente"""
    
    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()
    
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado"
        )
    
    # Marcar como completo
    event.status = "completed"
    event.completed_at = datetime.utcnow()
    
    # Criar próximo evento se recorrente
    if event.frequency_days and event.frequency_days > 0:
        # Base off original scheduled_at (not completed_at) so late completions
        # don't artificially push the next cycle further into the future.
        base_date = event.scheduled_at or event.completed_at
        next_scheduled = base_date + timedelta(days=event.frequency_days)
        # next_due_date is the date the reminder fires — same as the new scheduled date.
        next_due = next_scheduled
        
        next_event = Event(
            user_id=event.user_id,
            pet_id=event.pet_id,
            type=event.type,
            scheduled_at=next_scheduled,
            title=event.title,
            description=event.description,
            location_name=event.location_name,
            location_address=event.location_address,
            location_phone=event.location_phone,
            location_place_id=event.location_place_id,
            professional_name=event.professional_name,
            cost=event.cost,
            frequency_days=event.frequency_days,
            next_due_date=next_due,
            reminder_days_before=event.reminder_days_before,
            metadata=event.metadata,
            source="recurring",
            status="pending",
            reminder_sent=False,
        )
        
        db.add(next_event)
    
    db.commit()
    db.refresh(event)
    
    return event


class ApplyDoseIn(BaseModel):
    date: str          # YYYY-MM-DD
    scheduled_time: Optional[str] = None  # HH:MM (opcional para controle por horário)
    notes: Optional[str] = None


@router.post("/{event_id}/apply-dose", response_model=EventOut)
def apply_dose(
    event_id: str,
    payload: ApplyDoseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Registrar uma dose administrada no tratamento"""

    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento n\u00e3o encontrado")

    extra = json.loads(event.extra_data or '{}')
    applied_dates = extra.get('applied_dates', [])
    dose_notes    = extra.get('dose_notes', {})
    skipped_dates = extra.get('skipped_dates', [])
    skip_notes    = extra.get('skip_notes', {})
    applied_slots = extra.get('applied_slots', {})
    skipped_slots = extra.get('skipped_slots', {})

    date_str = payload.date  # YYYY-MM-DD
    slot = (payload.scheduled_time or '').strip()
    if date_str not in applied_dates:
        applied_dates.append(date_str)
        applied_dates.sort()
    if date_str in skipped_dates:
        skipped_dates.remove(date_str)
        skip_notes.pop(date_str, None)

    if slot:
        day_slots = list(applied_slots.get(date_str) or [])
        if slot not in day_slots:
            day_slots.append(slot)
            day_slots.sort()
        applied_slots[date_str] = day_slots

        skipped_day_slots = list(skipped_slots.get(date_str) or [])
        if slot in skipped_day_slots:
            skipped_day_slots.remove(slot)
            if skipped_day_slots:
                skipped_slots[date_str] = skipped_day_slots
            else:
                skipped_slots.pop(date_str, None)

    if payload.notes:
        notes_key = f"{date_str} {slot}" if slot else date_str
        dose_notes[notes_key] = payload.notes

    extra['applied_dates'] = applied_dates
    extra['skipped_dates'] = skipped_dates
    if applied_slots:
        extra['applied_slots'] = applied_slots
    if skipped_slots:
        extra['skipped_slots'] = skipped_slots
    if dose_notes:
        extra['dose_notes'] = dose_notes
    if skip_notes:
        extra['skip_notes'] = skip_notes
    event.extra_data = json.dumps(extra)

    # Se todas as doses foram aplicadas, marca como conclu\u00eddo
    treatment_days = extra.get('treatment_days')
    if treatment_days and len(applied_dates) >= int(treatment_days):
        event.status = 'completed'
        event.completed_at = datetime.utcnow()
    else:
        # Garante que o evento continua ativo durante o tratamento
        event.status = 'active'

    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/remove-dose", response_model=EventOut)
def remove_dose(
    event_id: str,
    payload: ApplyDoseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remover uma dose registrada incorretamente"""

    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento não encontrado")

    extra = json.loads(event.extra_data or '{}')
    applied_dates = extra.get('applied_dates', [])
    dose_notes    = extra.get('dose_notes', {})
    skipped_dates = extra.get('skipped_dates', [])
    skip_notes    = extra.get('skip_notes', {})
    applied_slots = extra.get('applied_slots', {})
    skipped_slots = extra.get('skipped_slots', {})

    date_str = payload.date
    slot = (payload.scheduled_time or '').strip()
    if date_str in applied_dates:
        if not slot:
            applied_dates.remove(date_str)
        else:
            remaining = [s for s in (applied_slots.get(date_str) or []) if s != slot]
            if remaining:
                applied_slots[date_str] = remaining
            else:
                applied_slots.pop(date_str, None)
                if date_str in applied_dates:
                    applied_dates.remove(date_str)
    dose_notes.pop(f"{date_str} {slot}" if slot else date_str, None)

    extra['applied_dates'] = applied_dates
    extra['skipped_dates'] = skipped_dates
    if applied_slots:
        extra['applied_slots'] = applied_slots
    else:
        extra.pop('applied_slots', None)
    if skipped_slots:
        extra['skipped_slots'] = skipped_slots
    extra['dose_notes'] = dose_notes
    extra['skip_notes'] = skip_notes
    event.extra_data = json.dumps(extra)

    # Reativa o evento se estava completed
    treatment_days = extra.get('treatment_days')
    if treatment_days and len(applied_dates) < int(treatment_days):
        event.status = 'active'
        event.completed_at = None

    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/skip-dose", response_model=EventOut)
def skip_dose(
    event_id: str,
    payload: ApplyDoseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marcar um dia como pulado no tratamento (não penaliza score de aderência)"""

    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento não encontrado")

    extra = json.loads(event.extra_data or '{}')
    applied_dates = extra.get('applied_dates', [])
    skipped_dates = extra.get('skipped_dates', [])
    skip_notes    = extra.get('skip_notes', {})
    applied_slots = extra.get('applied_slots', {})
    skipped_slots = extra.get('skipped_slots', {})

    date_str = payload.date
    slot = (payload.scheduled_time or '').strip()
    if date_str in applied_dates:
        if not slot:
            applied_dates.remove(date_str)
        else:
            remaining = [s for s in (applied_slots.get(date_str) or []) if s != slot]
            if remaining:
                applied_slots[date_str] = remaining
            else:
                applied_slots.pop(date_str, None)

    if date_str not in skipped_dates and not slot:
        skipped_dates.append(date_str)
        skipped_dates.sort()
    if slot:
        day_slots = list(skipped_slots.get(date_str) or [])
        if slot not in day_slots:
            day_slots.append(slot)
            day_slots.sort()
        skipped_slots[date_str] = day_slots

    if payload.notes:
        skip_key = f"{date_str} {slot}" if slot else date_str
        skip_notes[skip_key] = payload.notes

    extra['applied_dates'] = applied_dates
    extra['skipped_dates'] = skipped_dates
    if applied_slots:
        extra['applied_slots'] = applied_slots
    else:
        extra.pop('applied_slots', None)
    if skipped_slots:
        extra['skipped_slots'] = skipped_slots
    if skip_notes:
        extra['skip_notes'] = skip_notes
    event.extra_data = json.dumps(extra)

    event.status = 'active'
    event.completed_at = None
    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/unskip-dose", response_model=EventOut)
def unskip_dose(
    event_id: str,
    payload: ApplyDoseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remover marcação de dia pulado"""

    event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == str(current_user.id)
    ).first()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento não encontrado")

    extra = json.loads(event.extra_data or '{}')
    skipped_dates = extra.get('skipped_dates', [])
    skip_notes    = extra.get('skip_notes', {})
    skipped_slots = extra.get('skipped_slots', {})

    date_str = payload.date
    slot = (payload.scheduled_time or '').strip()
    if date_str in skipped_dates and not slot:
        skipped_dates.remove(date_str)
    if slot:
        remaining = [s for s in (skipped_slots.get(date_str) or []) if s != slot]
        if remaining:
            skipped_slots[date_str] = remaining
        else:
            skipped_slots.pop(date_str, None)
    skip_notes.pop(f"{date_str} {slot}" if slot else date_str, None)

    extra['skipped_dates'] = skipped_dates
    if skipped_slots:
        extra['skipped_slots'] = skipped_slots
    else:
        extra.pop('skipped_slots', None)
    extra['skip_notes'] = skip_notes
    event.extra_data = json.dumps(extra)

    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


@router.get("/upcoming/summary", response_model=List[EventOut])
def get_upcoming_summary(
    days: int = Query(7, ge=1, le=30, description="Próximos N dias"),
    limit: int = Query(10, ge=1, le=50, description="Limite de eventos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obter resumo de eventos próximos (para dashboard)"""
    
    end_date = datetime.utcnow() + timedelta(days=days)
    
    events = db.query(Event).filter(
        Event.user_id == str(current_user.id),
        Event.status == "pending",
        Event.scheduled_at <= end_date
    ).order_by(Event.scheduled_at.asc()).limit(limit).all()
    
    return events
