"""Upload de fotos de pets."""
import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from ..storage.factory import get_storage_provider
from ..config import get_settings


UPLOAD_DIR = Path("uploads/pets")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def ensure_upload_dir():
    """Cria diretório de uploads se não existir."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_image(file: UploadFile) -> None:
    """Valida se o arquivo é uma imagem válida."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nome do arquivo não fornecido"
        )
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extensão não permitida. Use: {', '.join(ALLOWED_EXTENSIONS)}"
        )


async def save_pet_photo(file: UploadFile) -> str:
    """
    Salva foto do pet e retorna o caminho relativo.
    
    Returns:
        str: Caminho relativo da foto (ex: "pets/abc123.jpg")
    """
    validate_image(file)
    # Gerar nome único
    ext = Path(file.filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    relative_key = f"pets/{filename}"

    content = await file.read()

    # Validar tamanho
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo muito grande. Máximo: {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    settings = get_settings()
    backend = getattr(settings, "storage_backend", "local").lower()

    if backend == "r2":
        storage = get_storage_provider()
        # Store in bucket under key `pets/<filename>` (LocalDiskStorage expects keys without a leading '/').
        storage.save(relative_key, content, content_type=(file.content_type or "application/octet-stream"))
        return relative_key

    # Local: write to disk as before
    ensure_upload_dir()
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(content)

    return relative_key


def delete_pet_photo(photo_path: Optional[str]) -> None:
    """Remove foto do pet do disco."""
    if not photo_path:
        return
    if photo_path.startswith("data:"):
        return
    settings = get_settings()
    backend = getattr(settings, "storage_backend", "local").lower()

    if backend == "r2":
        storage = get_storage_provider()
        try:
            storage.delete(photo_path)
        except Exception:
            # Don't raise for delete errors; best-effort cleanup
            return

    else:
        filepath = Path("uploads") / photo_path
        if filepath.exists():
            filepath.unlink()
