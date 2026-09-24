"""Armazenamento da foto ENQUANTO ela não está aprovada.

Importante: `uploads/` (local) é montado inteiro como estático em
`/uploads` (ver main.py) — qualquer arquivo salvo ali embaixo, mesmo numa
subpasta com nome "privado", fica alcançável por URL direta pra quem
souber o nome do arquivo. Por isso a área de revisão fica FORA da árvore
`uploads/` no disco local, e num prefixo à parte no bucket (nunca com URL
pública construída, só uma URL assinada e expirável gerada dentro de um
endpoint autenticado de admin).

Depois de aprovada, a foto é promovida pro caminho público de verdade
(mesma função que os fluxos existentes já usavam) e o arquivo de revisão
é apagado.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from ..config import get_settings

# Sibling de `uploads/`, nunca dentro dela — nunca montada como estático.
_REVIEW_DIR = Path("moderation_review")
_R2_REVIEW_PREFIX = "_moderation_review"


def _backend() -> str:
    return getattr(get_settings(), "storage_backend", "local").lower()


def save_pending(key: str, data: bytes, content_type: str = "image/jpeg") -> None:
    """Salva a foto fora do caminho público, pelo `key` (mesmo nome que
    vira a chave pública se/quando for aprovada)."""
    if _backend() == "r2":
        from ..storage.factory import get_storage_provider

        storage = get_storage_provider()
        storage.save(f"{_R2_REVIEW_PREFIX}/{key}", data, content_type=content_type)
        return

    path = _REVIEW_DIR / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def read_pending(key: str) -> Optional[bytes]:
    """Só pra streaming autenticado de admin — nunca gera URL pública."""
    if _backend() == "r2":
        # R2 não expõe leitura direta pela abstração atual (só save/get_url/
        # delete) — quem quiser ver a foto usa `signed_review_url`, que
        # devolve uma URL assinada e expirável em vez de bytes.
        return None

    path = _REVIEW_DIR / key
    if not path.exists():
        return None
    return path.read_bytes()


def read_any(key: str) -> Optional[bytes]:
    """Bytes da foto em revisão em QUALQUER backend (local: disco; R2: baixa pela URL assinada
    no servidor). Usado onde o servidor precisa entregar a foto e depois apagá-la."""
    data = read_pending(key)
    if data is not None:
        return data
    url = signed_review_url(key, expires_in=60)
    if not url:
        return None
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=15) as resp:  # noqa: S310 — URL assinada gerada por nós
            return resp.read()
    except Exception:  # noqa: BLE001 — objeto já apagado / indisponível
        return None


def signed_review_url(key: str, expires_in: int = 300) -> Optional[str]:
    """URL assinada e expirável (R2) pra um admin ver a foto pendente/
    rejeitada sem que ela nunca tenha tido uma URL pública permanente."""
    if _backend() != "r2":
        return None
    from ..storage.factory import get_storage_provider

    storage = get_storage_provider()
    return storage.get_url(f"{_R2_REVIEW_PREFIX}/{key}", expires_in=expires_in)


def discard_pending(key: str) -> None:
    """Apaga o arquivo em revisão — usado tanto após rejeição quanto após
    promoção (o arquivo final já foi copiado pro caminho público)."""
    if _backend() == "r2":
        from ..storage.factory import get_storage_provider

        storage = get_storage_provider()
        try:
            storage.delete(f"{_R2_REVIEW_PREFIX}/{key}")
        except Exception:
            pass
        return

    path = _REVIEW_DIR / key
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass


def promote_to_public(key: str, public_key: str, *, content_type: str = "image/jpeg") -> None:
    """Move a foto aprovada da área de revisão pro caminho público
    definitivo (mesma convenção de `pets/upload.py::save_pet_photo` —
    `uploads/<public_key>` local, ou o bucket sem prefixo privado no R2)."""
    if _backend() == "r2":
        from ..storage.factory import get_storage_provider

        storage = get_storage_provider()
        data = _r2_read_review_bytes(key)
        if data is None:
            raise FileNotFoundError(f"Foto em revisão não encontrada no R2: {key}")
        storage.save(public_key, data, content_type=content_type)
        discard_pending(key)
        return

    src = _REVIEW_DIR / key
    if not src.exists():
        raise FileNotFoundError(f"Foto em revisão não encontrada: {src}")
    dest = Path("uploads") / public_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(src.read_bytes())
    discard_pending(key)


def _r2_read_review_bytes(key: str) -> Optional[bytes]:
    """R2 não tem `get()` na abstração — busca via boto3 direto, só usado
    aqui (promoção) e não em nenhum caminho de leitura pública."""
    from ..storage.factory import get_storage_provider

    storage = get_storage_provider()
    s3 = getattr(storage, "_s3", None)
    bucket = getattr(storage, "bucket", None)
    if s3 is None or bucket is None:
        return None
    try:
        obj = s3.get_object(Bucket=bucket, Key=f"{_R2_REVIEW_PREFIX}/{key}")
        return obj["Body"].read()
    except Exception:
        return None
