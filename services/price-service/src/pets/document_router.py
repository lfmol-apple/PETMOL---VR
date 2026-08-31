"""Endpoints de documentos de pet — SOMENTE LEITURA de acervo legado.

Decisão de produto (pré-lançamento): o PETMOL NÃO é um repositório de
documentos. Não há mais upload, importação por URL, importação em lote nem
classificação por IA de documentos — esses caminhos foram removidos.

O que resta aqui serve apenas para não quebrar o acervo já existente de
usuários antigos: listar, visualizar e excluir documentos que já estão no
banco. Nenhuma rota abaixo cria ou altera um `PetDocument`. As tabelas
`pet_documents` / `pet_document_imports` permanecem no schema como legado
inerte (ver docs / migrations) — a eventual limpeza definitiva de schema e
arquivos antigos é tratada separadamente.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .document_models import PetDocument
from .document_schemas import PetDocumentOut
from .models import Pet
from .access import get_accessible_pet_or_404

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Pet Documents"])


# ── Storage (acervo legado) ──────────────────────────────────────────────────
# Absolute path: resolve relative to project root (2 levels up from src/pets/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_UPLOAD_DIR = _PROJECT_ROOT / "uploads" / "pet_documents"

# mime_type on a legacy document is whatever Content-Type the uploader's
# client declared — never verified against the actual bytes. Gating "serve
# inline" on a bare mime.startswith("image/") trusts that value: a file
# declared as image/svg+xml passes the prefix check, and SVG can carry a
# <script> that executes when the browser opens it inline. Serve inline only
# for types with no known script-execution behavior; anything else is forced
# to download instead (see serve_document_file below).
INLINE_SAFE_MIMES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
    "application/pdf",
}


def _get_pet_or_404(db: Session, user_id: str, pet_id: str) -> Pet:
    return get_accessible_pet_or_404(db, user_id, pet_id)


# ── Endpoints (leitura + exclusão do acervo legado) ──────────────────────────

@router.get("/pets/{pet_id}/documents", response_model=list[PetDocumentOut])
def list_documents(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_pet_or_404(db, user.id, pet_id)
    from sqlalchemy import nulls_last
    return (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None))
        .order_by(
            nulls_last(PetDocument.document_date.desc()),
            PetDocument.created_at.desc(),
        )
        .all()
    )


@router.get("/pets/{pet_id}/documents/{doc_id}/file")
def serve_document_file(
    pet_id: str,
    doc_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    dl: int = Query(0, description="1 = forçar download, 0 = exibir inline"),
    db: Session = Depends(get_db),
):
    """Serve um arquivo do acervo legado. Aceita JWT via query param OU
    Authorization header. Por padrão serve inline (para visualização); use
    ?dl=1 para forçar download."""
    import urllib.parse as _urlparse
    from ..user_auth.security import decode_token

    # Aceitar token via query param OU Authorization: Bearer header
    raw_token = token or ""
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]

    if not raw_token:
        raise HTTPException(status_code=401, detail="Token não fornecido")

    token_data = decode_token(raw_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    _get_pet_or_404(db, user.id, pet_id)
    doc = (
        db.query(PetDocument)
        .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None))
        .first()
    )
    if not doc or not doc.storage_key:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    # Suporta: (1) só filename, (2) path absoluto correto, (3) path absoluto errado (outro env)
    candidate = Path(doc.storage_key)
    if candidate.is_absolute() and candidate.is_file():
        fpath = candidate
    else:
        fpath = DOCS_UPLOAD_DIR / candidate.name

    if not fpath.is_file():
        raise HTTPException(status_code=404, detail="Arquivo removido do disco")

    filename = doc.title or fpath.name
    ext = fpath.suffix
    if ext and not filename.endswith(ext):
        filename = filename + ext

    mime = doc.mime_type or "application/octet-stream"
    viewable = mime in INLINE_SAFE_MIMES

    if dl or not viewable:
        return FileResponse(path=str(fpath), media_type=mime, filename=filename)

    safe_name = _urlparse.quote(filename)
    return FileResponse(
        path=str(fpath),
        media_type=mime,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{safe_name}"},
    )


class BulkDeleteRequest(BaseModel):
    ids: list[str]


@router.delete("/pets/{pet_id}/documents/bulk", status_code=200)
def delete_documents_bulk(
    pet_id: str,
    body: BulkDeleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exclui uma lista de documentos legados pelo ID."""
    _get_pet_or_404(db, user.id, pet_id)
    docs = (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet_id, PetDocument.id.in_(body.ids), PetDocument.deleted_at.is_(None))
        .all()
    )
    deleted = 0
    for doc in docs:
        doc.deleted_at = datetime.utcnow()
        deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.delete("/pets/{pet_id}/documents/{doc_id}", status_code=204)
def delete_document(
    pet_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_pet_or_404(db, user.id, pet_id)
    doc = (
        db.query(PetDocument)
        .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None))
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    doc.deleted_at = datetime.utcnow()
    db.commit()


@router.delete("/pets/{pet_id}/documents", status_code=200)
def delete_all_documents(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exclui todos os documentos legados do pet de uma vez."""
    _get_pet_or_404(db, user.id, pet_id)
    docs = db.query(PetDocument).filter(PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None)).all()
    deleted = 0
    for doc in docs:
        doc.deleted_at = datetime.utcnow()
        deleted += 1
    db.commit()
    return {"deleted": deleted}
