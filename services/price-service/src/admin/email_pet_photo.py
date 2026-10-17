"""Foto do pet para e-mail: endereço público ASSINADO que entrega a foto já redimensionada.

Por que não usar o arquivo da foto direto: (1) o original pode ter até 5 MB — pesado demais para e-mail;
(2) cadastros antigos guardam a foto como imagem embutida no banco (data:), que o Gmail não exibe;
(3) o endereço assinado (HMAC por pet) não pode ser adivinhado nem varrido. Sem foto, devolve uma
ilustração padrão com a pata do PETMOL.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from PIL import Image, ImageDraw, ImageOps

from ..config import get_settings
from ..db import SessionLocal
from ..pets.models import Pet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/email", tags=["Email assets"])

PUBLIC_BASE = "https://www.petmol.com.br"   # sem www redireciona (308) — ruim para imagem de e-mail
SIZES = {"hero": (1120, 560), "sq": (480, 480)}  # 2x do tamanho exibido (telas de alta densidade)


def photo_sig(pet_id: str) -> str:
    key = (get_settings().jwt_secret or "").encode()
    return hmac.new(key, f"email-pet-photo:{pet_id}".encode(), hashlib.sha256).hexdigest()[:24]


def photo_url(pet_id: str, kind: str = "hero") -> str:
    return f"{PUBLIC_BASE}/api/v1/email/pet-photo/{pet_id}/{photo_sig(pet_id)}.jpg?k={kind}"


def _load_photo_bytes(photo: str | None) -> bytes | None:
    if not photo:
        return None
    try:
        if photo.startswith("data:"):
            return base64.b64decode(photo.split(",", 1)[1])
        if photo.startswith("http"):
            import httpx
            r = httpx.get(photo, timeout=6, follow_redirects=True)
            return r.content if r.status_code == 200 else None
        key = photo.lstrip("/")
        if key.startswith("uploads/"):
            key = key[len("uploads/"):]
        backend = (getattr(get_settings(), "storage_backend", "local") or "local").lower()
        if backend == "r2":
            import httpx
            from ..storage.factory import get_storage_provider
            r = httpx.get(get_storage_provider().get_url(key, 120), timeout=6)
            return r.content if r.status_code == 200 else None
        path = Path("uploads") / key
        return path.read_bytes() if path.exists() else None
    except Exception:  # noqa: BLE001
        logger.warning("email_pet_photo: não consegui ler a foto", exc_info=True)
        return None


def _placeholder(size: tuple[int, int]) -> Image.Image:
    """Fundo azul claro com uma patinha azul — para pet sem foto."""
    w, h = size
    img = Image.new("RGB", size, (232, 240, 254))
    d = ImageDraw.Draw(img)
    blue = (0, 86, 210)
    r = min(w, h) // 15   # patinha discreta, centralizada
    cx, cy = w // 2, int(h * 0.56)
    d.ellipse((cx - r * 2, cy - r * 1.3, cx + r * 2, cy + r * 1.9), fill=blue)      # almofada
    for dx, dy, rr in ((-2.3, -2.4, 0.9), (-0.8, -3.3, 0.9), (0.8, -3.3, 0.9), (2.3, -2.4, 0.9)):  # dedos
        d.ellipse((cx + dx * r - rr * r, cy + dy * r - rr * r, cx + dx * r + rr * r, cy + dy * r + rr * r), fill=blue)
    return img


def render_photo(photo: str | None, kind: str = "hero") -> bytes:
    size = SIZES.get(kind, SIZES["hero"])
    img: Image.Image | None = None
    raw = _load_photo_bytes(photo)
    if raw:
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
            img = ImageOps.fit(img, size, method=Image.LANCZOS, centering=(0.5, 0.4))
        except Exception:  # noqa: BLE001
            img = None
    if img is None:
        img = _placeholder(size)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return out.getvalue()


@router.get("/pet-photo/{pet_id}/{sig}.jpg")
def pet_photo(pet_id: str, sig: str, k: str = "hero"):
    if not hmac.compare_digest(sig, photo_sig(pet_id)):
        raise HTTPException(status_code=404)
    db = SessionLocal()
    try:
        pet = db.get(Pet, pet_id)
        photo = pet.photo if pet else None
    finally:
        db.close()
    return Response(content=render_photo(photo, k if k in SIZES else "hero"), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})
