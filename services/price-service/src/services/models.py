"""
SQLAlchemy models for services (partners, places cache, handoff analytics).

SLICE 1 - NEW MODELS (não modifica modelos existentes)
"""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Partner(Base):
    """
    Estabelecimentos parceiros priorizados na busca.
    Geohash para busca geográfica eficiente.
    """
    __tablename__ = "partners"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Dados básicos
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Nome para exibição
    
    # Localização
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    geohash: Mapped[str] = mapped_column(String(12), nullable=False, index=True)  # Precision 6-8
    
    # Tipo de serviço
    service_type: Mapped[str] = mapped_column(
        String(50), 
        nullable=False,
        index=True
    )  # banho_tosa, vet_clinic, emergencia, petshop
    
    # Nível de parceria (maior = melhor)
    partner_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1, index=True)  # 1 ou 2
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Verificado no portal
    
    # Integração com Google Places
    google_place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    
    # Contatos
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Endereço
    formatted_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Metadados
    rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    user_rating_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Índice composto para busca eficiente
    __table_args__ = (
        Index('idx_partners_geohash_service_active', 'geohash', 'service_type', 'is_active'),
        Index('idx_partners_service_level', 'service_type', 'partner_level', 'is_active'),
    )


class PlacesCache(Base):
    """
    Cache de resultados do Google Places API por célula geohash + tier de raio.
    TTL de 30 dias para economizar chamadas.
    """
    __tablename__ = "places_cache"

    # Chave composta: service:tier:geohash
    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # Ex: "vet_clinic:near:9q5ctr"
    
    # Metadados da busca
    service: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    tier: Mapped[str] = mapped_column(String(10), nullable=False)  # near, mid, far
    geohash: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    
    # Centro da busca
    center_lat: Mapped[float] = mapped_column(Float, nullable=False)
    center_lng: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Parâmetros da busca
    radius_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Resultados (JSON array)
    places: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: [{id, name, lat, lng, rating, ...}]
    
    # Metadata
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="google")
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # TTL
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class PlaceContactCache(Base):
    """
    Cache de contatos (phone, website) de lugares específicos.
    Separado para buscar on-demand apenas quando usuário clicar.
    """
    __tablename__ = "place_contacts_cache"

    place_id: Mapped[str] = mapped_column(String(255), primary_key=True)  # Google Place ID
    
    # Contatos
    national_phone_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    formatted_phone_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website_uri: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Status
    business_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    # TTL
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class AnalyticsClick(Base):
    """
    Rastreamento de handoffs (cliques em ações) SEM PII.
    Para medir ativação e conversão sem expor dados pessoais.
    """
    __tablename__ = "analytics_clicks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Lead ID anônimo (gerado por handoff)
    lead_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    
    # Lugar acessado
    place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    place_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Para analytics
    
    # Ação realizada
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # whatsapp, call, directions, share_rg, qr_scan
    
    # Origem
    source: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # partner, google, qr
    service: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    
    # Contexto geográfico (sem precisão exata)
    country_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    
    # Metadados técnicos
    app_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    platform: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # web, ios, android
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Índices para analytics
    __table_args__ = (
        Index('idx_analytics_action_date', 'action', 'created_at'),
        Index('idx_analytics_service_date', 'service', 'created_at'),
        Index('idx_analytics_source_date', 'source', 'created_at'),
    )


class Establishment(Base):
    """
    Estabelecimentos que se cadastraram no portal self-serve.
    Para gerar QR codes e acompanhar métricas.
    """
    __tablename__ = "establishments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Claim do lugar (via Google Places)
    claimed_place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    
    # Dados básicos
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Termos / aceite (obrigatório no cadastro; mantido opcional para compatibilidade com dados antigos)
    terms_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    terms_accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    terms_accepted_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    terms_accepted_user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Verificação
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    claim_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, verified
    
    # Plano
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free")  # free, verified
    plan_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # QR Code único
    qr_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QRScan(Base):
    """
    Registros de scans de QR code do balcão.
    Para medir engajamento dos estabelecimentos.
    """
    __tablename__ = "qr_scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # QR escaneado
    qr_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    establishment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    
    # Analytics
    attributed_install: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lead_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    
    # Contexto
    platform: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    __table_args__ = (
        Index('idx_qr_scans_establishment_date', 'establishment_id', 'created_at'),
    )
