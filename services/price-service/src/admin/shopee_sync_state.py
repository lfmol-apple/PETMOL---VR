"""
Estado em memória do progresso do sync da Shopee disparado via admin
(shopee_sync_router.py) — reseta se o processo reiniciar. Aceitável pra
essa ferramenta operacional pontual: não é um log durável, é só o "onde
estamos agora" consultado por GET /v1/admin/shopee-sync/status.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ShopeeSyncState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    running: bool = False
    total: int = 0
    processed: int = 0
    matched: int = 0
    phase: str = "idle"
    audit_total: int = 0
    audit_invalid: int = 0
    audit_deactivated: int = 0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None


STATE = ShopeeSyncState()
