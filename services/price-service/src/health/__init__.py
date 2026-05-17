"""
Health Events Router for PETMOL
Gerencia eventos de saúde pendentes e confirmações
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, date
import json
import logging

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..pets.models import Pet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["Health"])


class PendingEvent(BaseModel):
    """Evento pendente de confirmação"""
    id: str
    pet_id: str
    pet_name: str
    event_type: str  # 'vaccine', 'parasite_control', 'medication'
    event_subtype: Optional[str] = None  # tipo específico (ex: 'bath', 'dewormer')
    title: str
    description: str
    due_date: str  # ISO format
    days_overdue: int  # negativo = futuro, 0 = hoje, positivo = atrasado
    location: Optional[str] = None
    cost: Optional[float] = None
    frequency_days: Optional[int] = None
    # Campos específicos para controle parasitário (2 etapas)
    is_purchase_reminder: Optional[bool] = None  # True = lembrete de compra, False = lembrete de aplicação
    purchase_date: Optional[str] = None  # Data que comprou
    application_date: Optional[str] = None  # Data prevista de aplicação


class ConfirmEventRequest(BaseModel):
    """Request para confirmar evento"""
    pet_id: str  # UUID do pet
    event_id: str
    event_type: str
    confirmed: bool  # True = fez, False = não fez
    reschedule_days: Optional[int] = None  # Se não fez, quantos dias para lembrar
    reminder_days_before: Optional[int] = None  # Quantos dias antes quer ser lembrado
    new_frequency_days: Optional[int] = None  # Nova frequência (se quiser mudar permanentemente)
    scheduled_time: Optional[str] = None  # Hora agendada (formato HH:MM) - para petshop
    completed_date: Optional[str] = None  # Data real de conclusão (formato YYYY-MM-DD)
    # Para controle parasitário
    action_type: Optional[str] = None  # 'purchase' = comprou, 'apply' = aplicou, 'reschedule' = remarcar


class ConfirmEventResponse(BaseModel):
    """Response da confirmação"""
    success: bool
    message: str
    next_due_date: Optional[str] = None


def calculate_days_overdue(due_date_str: str) -> int:
    """Calcula quantos dias está atrasado (ou faltando)"""
    try:
        due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00')).date()
        today = date.today()
        delta = (today - due_date).days
        return delta
    except:
        return 0


def parse_health_data(pet: Pet) -> Dict[str, Any]:
    """Parse health_data de string JSON para dict"""
    if isinstance(pet.health_data, str):
        try:
            return json.loads(pet.health_data)
        except (json.JSONDecodeError, TypeError):
            return {}
    elif isinstance(pet.health_data, dict):
        return pet.health_data
    else:
        return {}


def get_pending_vaccines(pet: Pet) -> List[PendingEvent]:
    """Busca vacinas pendentes do pet"""
    events = []
    health_data = parse_health_data(pet)
    vaccines = health_data.get('vaccines', [])
    
    # Agrupar por tipo e pegar a mais recente de cada
    vaccines_by_type: Dict[str, Any] = {}
    for vaccine in vaccines:
        vtype = vaccine.get('type')
        if not vtype:
            continue
        
        if vtype not in vaccines_by_type or vaccine.get('date', '') > vaccines_by_type[vtype].get('date', ''):
            vaccines_by_type[vtype] = vaccine
    
    # Verificar quais estão vencidas ou vencendo
    today = date.today()
    
    for vtype, vaccine in vaccines_by_type.items():
        next_due = vaccine.get('next_due_date')
        if not next_due:
            continue
        
        days_overdue = calculate_days_overdue(next_due)
        
        # Considerar pendente se venceu ou vence nos próximos 7 dias
        if days_overdue >= -7:
            events.append(PendingEvent(
                id=vaccine.get('id', ''),
                pet_id=pet.id,
                pet_name=pet.name,
                event_type='vaccine',
                event_subtype=vtype,
                title=f"Vacina: {vaccine.get('name', vtype)}",
                description=f"Revacinação {'atrasada' if days_overdue > 0 else 'programada'}",
                due_date=next_due,
                days_overdue=days_overdue,
                location=vaccine.get('location'),
                cost=vaccine.get('cost'),
                frequency_days=vaccine.get('frequency_days')
            ))
    
    return events


def get_pending_grooming(pet: Pet) -> List[PendingEvent]:
    """Busca serviços de banho/tosa pendentes"""
    events = []
    health_data = parse_health_data(pet)
    grooming_records = health_data.get('grooming_records', [])
    
    # Agrupar por tipo e pegar o mais recente
    grooming_by_type: Dict[str, Any] = {}
    for record in grooming_records:
        gtype = record.get('type')
        if not gtype:
            continue
        
        if gtype not in grooming_by_type or record.get('date', '') > grooming_by_type[gtype].get('date', ''):
            grooming_by_type[gtype] = record
    
    # Mapear tipos para nomes
    type_names = {
        'bath': '🛁 Banho',
        'grooming': '✂️ Tosa',
        'bath_grooming': '🛁✂️ Banho + Tosa'
    }
    
    for gtype, record in grooming_by_type.items():
        next_due = record.get('next_recommended_date')
        if not next_due:
            continue
        
        # Pegar hora se disponível
        scheduled_time = record.get('scheduled_time')
        
        days_overdue = calculate_days_overdue(next_due)
        
        # Considerar pendente se venceu ou vence nos próximos 3 dias
        if days_overdue >= -3:
            # Descrição incluindo hora se disponível
            status = 'atrasado' if days_overdue > 0 else 'programado'
            description = f"Serviço {status}"
            if scheduled_time:
                description += f" para {scheduled_time}"
            
            events.append(PendingEvent(
                id=record.get('id', ''),
                pet_id=pet.id,
                pet_name=pet.name,
                event_type='grooming',
                event_subtype=gtype,
                title=type_names.get(gtype, 'Banho/Tosa'),
                description=description,
                due_date=next_due,
                due_time=scheduled_time,
                days_overdue=days_overdue,
                location=record.get('location'),
                cost=record.get('cost'),
                frequency_days=record.get('frequency_days')
            ))
    
    return events


def get_pending_parasite_control(pet: Pet) -> List[PendingEvent]:
    """Busca controles parasitários pendentes"""
    events = []
    health_data = parse_health_data(pet)
    parasite_controls = health_data.get('parasite_controls', [])
    
    # Agrupar por tipo
    controls_by_type: Dict[str, Any] = {}
    for control in parasite_controls:
        ctype = control.get('type')
        if not ctype:
            continue
        
        if ctype not in controls_by_type or control.get('date', '') > controls_by_type[ctype].get('date', ''):
            controls_by_type[ctype] = control
    
    # Mapear tipos
    type_names = {
        'dewormer': '💊 Vermífugo',
        'flea_tick': '🦟 Antipulgas/Carrapatos',
        'heartworm': '❤️ Dirofilariose',
        'collar': '🎀 Coleira',
        'leishmaniasis': '🦟 Leishmaniose'
    }
    
    for ctype, control in controls_by_type.items():
        next_due = control.get('next_due_date')
        if not next_due:
            continue
        
        days_overdue = calculate_days_overdue(next_due)
        
        # Considerar pendente se venceu ou vence nos próximos 7 dias
        if days_overdue >= -7:
            events.append(PendingEvent(
                id=control.get('id', ''),
                pet_id=pet.id,
                pet_name=pet.name,
                event_type='parasite_control',
                event_subtype=ctype,
                title=type_names.get(ctype, 'Controle Parasitário'),
                description=f"Aplicação {'atrasada' if days_overdue > 0 else 'programada'}",
                due_date=next_due,
                days_overdue=days_overdue,
                location=control.get('location'),
                cost=control.get('cost'),
                frequency_days=control.get('frequency_days')
            ))
    
    return events


def get_pending_medications(pet: Pet) -> List[PendingEvent]:
    """Busca medicamentos pendentes"""
    events = []
    health_data = parse_health_data(pet)
    medications = health_data.get('medications', [])
    
    today = date.today()
    
    for medication in medications:
        # Apenas medicações ativas
        if not medication.get('active', True):
            continue
        
        start_date_str = medication.get('start_date')
        end_date_str = medication.get('end_date')
        
        if not start_date_str:
            continue
        
        try:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00')).date()
            
            # Se tem data final e já passou, não é pendente
            if end_date_str:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00')).date()
                if today > end_date:
                    continue
            
            # Se está no período de tratamento
            if today >= start_date:
                # Verificar última dose confirmada
                last_confirmed = medication.get('last_confirmed_date')
                if last_confirmed:
                    last_date = datetime.fromisoformat(last_confirmed.replace('Z', '+00:00')).date()
                    # Se já confirmou hoje, não precisa notificar
                    if last_date == today:
                        continue
                
                events.append(PendingEvent(
                    id=medication.get('id', ''),
                    pet_id=pet.id,
                    pet_name=pet.name,
                    event_type='medication',
                    event_subtype=None,
                    title=f"💊 Medicamento: {medication.get('name', 'Sem nome')}",
                    description=f"Dose: {medication.get('dosage', 'N/A')} - {medication.get('frequency', 'N/A')}",
                    due_date=today.isoformat(),
                    days_overdue=0,
                    location=None,
                    cost=medication.get('cost'),
                    frequency_days=None
                ))
        except:
            continue
    
    return events


@router.get("/pending-events", response_model=List[PendingEvent])
async def get_pending_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retorna todos eventos pendentes de confirmação para os pets do usuário.
    Inclui: vacinas, controle parasitário e medicamentos.
    """
    try:
        # Buscar pets do usuário
        pets = db.query(Pet).filter(Pet.user_id == current_user.id).all()
        
        all_events = []
        
        for pet in pets:
            # Coletar eventos de cada tipo
            all_events.extend(get_pending_vaccines(pet))
            all_events.extend(get_pending_parasite_control(pet))
            all_events.extend(get_pending_medications(pet))
        
        # Ordenar por dias de atraso (mais atrasados primeiro)
        all_events.sort(key=lambda x: x.days_overdue, reverse=True)
        
        logger.info(f"[Health] Encontrados {len(all_events)} eventos pendentes para usuário {current_user.id}")
        
        return all_events
        
    except Exception as e:
        logger.error(f"[Health] Erro ao buscar eventos pendentes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm-event", response_model=ConfirmEventResponse)
async def confirm_event(
    request: ConfirmEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Confirma ou reagenda um evento de saúde.
    
    - Se confirmed=True: marca como feito, calcula próxima data
    - Se confirmed=False: reagenda para daqui a N dias
    """
    try:
        logger.info(f"[Health] 🔵 INÍCIO - Confirmando evento")
        logger.info(f"[Health] Request recebido: pet_id={request.pet_id} (type={type(request.pet_id).__name__}), event_id={request.event_id}, type={request.event_type}")
        logger.info(f"[Health] User: {current_user.id}, confirmed={request.confirmed}, reschedule_days={request.reschedule_days}")
        
        # SILENCIADO: acesso familiar removido temporariamente — apenas dono do pet é aceito.
        # Para reativar acesso familiar, restaurar o bloco FamilyMember abaixo.
        # from ..family.models import FamilyGroup, FamilyMember
        logger.info(f"[Confirm] Buscando pet {request.pet_id} do user {current_user.id}")
        pet = db.query(Pet).filter(Pet.id == request.pet_id, Pet.user_id == current_user.id).first()
        
        if not pet:
            logger.error(f"[Health] ❌ Pet {request.pet_id} não encontrado ou não pertence ao usuário {current_user.id}")
            raise HTTPException(status_code=404, detail="Pet não encontrado ou você não tem permissão para acessá-lo")
        
        logger.info(f"[Health] ✅ Pet encontrado: {pet.name} (id={pet.id})")
        
        # Parse health_data JSON string para dict
        logger.info(f"[Health] Parsing health_data (type={type(pet.health_data).__name__})")
        if isinstance(pet.health_data, str):
            try:
                health_data = json.loads(pet.health_data)
                logger.info(f"[Health] health_data parseado com sucesso. Keys: {list(health_data.keys())}")
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"[Health] Erro ao parsear health_data: {e}")
                health_data = {}
        elif isinstance(pet.health_data, dict):
            health_data = pet.health_data
            logger.info(f"[Health] health_data já é dict. Keys: {list(health_data.keys())}")
        else:
            health_data = {}
            logger.warning(f"[Health] health_data é None ou tipo desconhecido")
        
        today = date.today()
        
        # Usar completed_date se fornecido, senão usar hoje
        if request.completed_date:
            try:
                completed_date = datetime.strptime(request.completed_date, '%Y-%m-%d').date()
                logger.info(f"[Health] Usando data de conclusão fornecida: {completed_date}")
            except ValueError:
                logger.warning(f"[Health] Data inválida fornecida: {request.completed_date}, usando hoje")
                completed_date = today
        else:
            completed_date = today
        
        logger.info(f"[Health] Processando evento tipo: {request.event_type}")
        
        # Processar baseado no tipo de evento
        if request.event_type == 'vaccine':
            vaccines = health_data.get('vaccines', [])
            logger.info(f"[Health] Encontradas {len(vaccines)} vacinas no health_data")
            vaccine_idx = next((i for i, v in enumerate(vaccines) if v.get('id') == request.event_id), None)
            
            if vaccine_idx is None:
                logger.error(f"[Health] ❌ Vacina com id={request.event_id} não encontrada. IDs disponíveis: {[v.get('id') for v in vaccines]}")
                raise HTTPException(status_code=404, detail="Vacina não encontrada")
                raise HTTPException(status_code=404, detail="Vacina não encontrada")
            
            vaccine = vaccines[vaccine_idx]
            
            # Garantir que temos a frequência original salva
            if 'original_frequency_days' not in vaccine:
                vaccine['original_frequency_days'] = vaccine.get('frequency_days', 365)
            
            if 'reschedule_history' not in vaccine:
                vaccine['reschedule_history'] = []
            
            if request.confirmed:
                # FOI FEITO - usar data real de conclusão
                vaccine['last_completed_date'] = completed_date.isoformat()
                original_freq = vaccine['original_frequency_days']
                next_date = (completed_date + timedelta(days=original_freq)).isoformat()
                vaccine['next_due_date'] = next_date
                vaccine['rescheduled_count'] = 0  # Resetar contador
                message = f"✅ Vacina confirmada! Próxima dose em {original_freq} dias ({(completed_date + timedelta(days=original_freq)).strftime('%d/%m/%Y')})"
                
                # Aplicar reminder_days_before se fornecido
                if request.reminder_days_before:
                    vaccine['reminder_days_before'] = request.reminder_days_before
                    
            else:
                # NÃO FOI FEITO - remarcar mantendo frequência original
                days = request.reschedule_days or 7
                next_date = (today + timedelta(days=days)).isoformat()
                vaccine['next_due_date'] = next_date
                vaccine['rescheduled_count'] = vaccine.get('rescheduled_count', 0) + 1
                
                # Registrar no histórico
                vaccine['reschedule_history'].append({
                    'date': today.isoformat(),
                    'original_due': vaccine.get('next_due_date'),
                    'rescheduled_to': next_date,
                    'days_postponed': days,
                    'reason': 'Tutor não cumpriu na data prevista'
                })
                
                # Aplicar reminder_days_before se fornecido
                if request.reminder_days_before:
                    vaccine['reminder_days_before'] = request.reminder_days_before
                    message = f"📅 Vacina reagendada para {(today + timedelta(days=days)).strftime('%d/%m/%Y')}. Você será lembrado {request.reminder_days_before} dias antes."
                else:
                    message = f"📅 Vacina reagendada para daqui a {days} dias ({(today + timedelta(days=days)).strftime('%d/%m/%Y')})"
                
            # Permitir mudança permanente de frequência (se solicitado)
            if request.new_frequency_days:
                vaccine['original_frequency_days'] = request.new_frequency_days
                vaccine['frequency_days'] = request.new_frequency_days
                message += f" | Nova frequência: a cada {request.new_frequency_days} dias"
            
            vaccines[vaccine_idx] = vaccine
            health_data['vaccines'] = vaccines
            
        elif request.event_type == 'grooming':
            records = health_data.get('grooming_records', [])
            record_idx = next((i for i, r in enumerate(records) if r.get('id') == request.event_id), None)
            
            if record_idx is None:
                raise HTTPException(status_code=404, detail="Registro não encontrado")
            
            record = records[record_idx]
            
            # Garantir campos inteligentes
            if 'original_frequency_days' not in record:
                record['original_frequency_days'] = record.get('frequency_days', 14)
            if 'reschedule_history' not in record:
                record['reschedule_history'] = []
            
            if request.confirmed:
                # FOI FEITO - usar data real de conclusão
                record['last_completed_date'] = completed_date.isoformat()
                original_freq = record['original_frequency_days']
                next_date = (completed_date + timedelta(days=original_freq)).isoformat()
                record['next_recommended_date'] = next_date
                record['rescheduled_count'] = 0
                
                # Salvar hora se fornecida
                if request.scheduled_time:
                    record['scheduled_time'] = request.scheduled_time
                    message = f"✅ Serviço confirmado! Próximo em {original_freq} dias ({(completed_date + timedelta(days=original_freq)).strftime('%d/%m/%Y')} às {request.scheduled_time})"
                else:
                    message = f"✅ Serviço confirmado! Próximo em {original_freq} dias ({(completed_date + timedelta(days=original_freq)).strftime('%d/%m/%Y')})"
                
                if request.reminder_days_before:
                    record['reminder_days_before'] = request.reminder_days_before
            else:
                # REAGENDAR
                days = request.reschedule_days or 3
                next_date = (today + timedelta(days=days)).isoformat()
                record['next_recommended_date'] = next_date
                record['rescheduled_count'] = record.get('rescheduled_count', 0) + 1
                
                # Manter hora se já existia
                if request.scheduled_time:
                    record['scheduled_time'] = request.scheduled_time
                
                record['reschedule_history'].append({
                    'date': today.isoformat(),
                    'rescheduled_to': next_date,
                    'days_postponed': days
                })
                
                if request.reminder_days_before:
                    record['reminder_days_before'] = request.reminder_days_before
                    message = f"📅 Serviço reagendado para {(today + timedelta(days=days)).strftime('%d/%m/%Y')}. Lembrete {request.reminder_days_before} dias antes."
                else:
                    message = f"📅 Serviço reagendado para daqui a {days} dias"
                
            if request.new_frequency_days:
                record['original_frequency_days'] = request.new_frequency_days
                record['frequency_days'] = request.new_frequency_days
            
            records[record_idx] = record
            health_data['grooming_records'] = records
            
        elif request.event_type == 'parasite_control':
            controls = health_data.get('parasite_controls', [])
            control_idx = next((i for i, c in enumerate(controls) if c.get('id') == request.event_id), None)
            
            if control_idx is None:
                raise HTTPException(status_code=404, detail="Controle não encontrado")
            
            control = controls[control_idx]
            
            # Campos inteligentes
            if 'original_frequency_days' not in control:
                control['original_frequency_days'] = control.get('frequency_days', 30)
            if 'reschedule_history' not in control:
                control['reschedule_history'] = []
            
            if request.confirmed:
                # FOI APLICADO - usar data real de conclusão
                control['last_completed_date'] = completed_date.isoformat()
                original_freq = control['original_frequency_days']
                next_date = (completed_date + timedelta(days=original_freq)).isoformat()
                control['next_due_date'] = next_date
                control['rescheduled_count'] = 0
                message = f"✅ Aplicação confirmada! Próxima em {original_freq} dias ({(completed_date + timedelta(days=original_freq)).strftime('%d/%m/%Y')})"
                
                if request.reminder_days_before:
                    control['reminder_days_before'] = request.reminder_days_before
            else:
                # REAGENDAR
                days = request.reschedule_days or 7
                next_date = (today + timedelta(days=days)).isoformat()
                control['next_due_date'] = next_date
                control['rescheduled_count'] = control.get('rescheduled_count', 0) + 1
                
                control['reschedule_history'].append({
                    'date': today.isoformat(),
                    'rescheduled_to': next_date,
                    'days_postponed': days
                })
                
                if request.reminder_days_before:
                    control['reminder_days_before'] = request.reminder_days_before
                    message = f"📅 Aplicação reagendada para {(today + timedelta(days=days)).strftime('%d/%m/%Y')}. Lembrete {request.reminder_days_before} dias antes."
                else:
                    message = f"📅 Aplicação reagendada para daqui a {days} dias"
            
            if request.new_frequency_days:
                control['original_frequency_days'] = request.new_frequency_days
                control['frequency_days'] = request.new_frequency_days
            
            controls[control_idx] = control
            health_data['parasite_controls'] = controls
            
        elif request.event_type == 'medication':
            medications = health_data.get('medications', [])
            med_idx = next((i for i, m in enumerate(medications) if m.get('id') == request.event_id), None)
            
            if med_idx is None:
                raise HTTPException(status_code=404, detail="Medicamento não encontrado")
            
            medication = medications[med_idx]
            
            if request.confirmed:
                medication['last_confirmed_date'] = today.isoformat()
                message = "Dose confirmada!"
                next_date = today.isoformat()
            else:
                # Para medicamento, apenas marcar para lembrar mais tarde
                days = request.reschedule_days or 1
                message = f"Lembrete reagendado para daqui a {days} dia(s)"
                next_date = (today + timedelta(days=days)).isoformat()
            
            medications[med_idx] = medication
            health_data['medications'] = medications
        else:
            logger.error(f"[Health] Tipo de evento inválido: {request.event_type}")
            raise HTTPException(status_code=400, detail=f"Tipo de evento inválido: {request.event_type}. Tipos válidos: vaccine, grooming, parasite_control, medication")
        
        # Atualizar pet no banco - converter dict para JSON string
        pet.health_data = json.dumps(health_data, ensure_ascii=False)
        db.commit()
        
        logger.info(f"[Health] ✅ Evento {request.event_type} confirmado/reagendado para pet {request.pet_id}: {message}")
        
        # Push família por confirmação desativado: fluxo oficial é centralizado no scheduler de 4 camadas.
        
        return ConfirmEventResponse(
            success=True,
            message=message,
            next_due_date=next_date
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Health] ❌ Erro ao confirmar evento: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar evento: {str(e)}")
