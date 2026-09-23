"""Validação real do arquivo + remoção de metadados — roda ANTES de
qualquer classificação por IA, pra toda foto que entra pelos fluxos
públicos do app.

Por que decodificar e reescrever a imagem (não só checar a extensão):
- Um arquivo malicioso disfarçado de ".jpg" (polyglot, exploit de parser,
  zip bomb de imagem) nunca é uma imagem de verdade pro Pillow — decode
  falha e o upload é rejeitado antes de tocar em disco/nuvem ou na IA.
- Reescrever do zero (Image.open + save) descarta qualquer bloco de dados
  que não seja pixel de verdade, inclusive payloads escondidos em chunks
  que o Pillow não interpreta.
- EXIF (principalmente GPS) nunca sobrevive à reescrita — a imagem final
  não carrega coordenada nenhuma do tutor, mesmo que o celular tenha
  gravado a localização exata de onde a foto foi tirada.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status

MAX_UPLOAD_BYTES = 8 * 1024 * 1024          # 8MB — teto do que aceitamos receber
MAX_DIMENSION = 4000                        # lado maior, em px, antes de recusar (evita zip-bomb de imagem)
OUTPUT_MAX_DIMENSION = 1600                 # a foto final nunca precisa ser maior que isso
OUTPUT_QUALITY = 88
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


@dataclass
class SanitizedImage:
    bytes_: bytes
    content_type: str
    width: int
    height: int


def sanitize_image(raw: bytes, *, max_bytes: int = MAX_UPLOAD_BYTES) -> SanitizedImage:
    """Decodifica de verdade, remove metadados, reencoda. Levanta
    HTTPException (400/413) pra qualquer coisa que não seja uma foto
    real e razoável — nunca deixa passar bytes crus pro disco/IA."""
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nenhuma imagem recebida.")
    if len(raw) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Imagem muito grande. Máximo: {mb}MB.")

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
    except ImportError as exc:  # pragma: no cover — Pillow é dependência declarada
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Processamento de imagem indisponível.") from exc

    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()  # detecta corrupção/arquivo disfarçado sem decodificar tudo
    except (UnidentifiedImageError, Exception):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Não foi possível ler essa imagem. Envie um JPG, PNG ou WebP válido.")

    try:
        image = Image.open(io.BytesIO(raw))
        # exif_transpose ANTES de descartar o EXIF: preserva a orientação
        # visual correta (senão fotos tiradas com o celular de lado saem
        # deitadas depois que o EXIF de rotação some).
        image = ImageOps.exif_transpose(image)
        if image is None:
            raise ValueError("decode falhou após transpose")
        image = image.convert("RGB")
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Não foi possível processar essa imagem.")

    width, height = image.size
    if width < 40 or height < 40:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem pequena demais.")
    if max(width, height) > MAX_DIMENSION:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem com dimensões grandes demais.")

    if max(width, height) > OUTPUT_MAX_DIMENSION:
        image.thumbnail((OUTPUT_MAX_DIMENSION, OUTPUT_MAX_DIMENSION), Image.LANCZOS)

    # Reescrever do zero — sem exif=..., sem nenhum bloco de metadado do
    # arquivo original. Isso é a remoção de EXIF/GPS: não existe API "tira
    # o GPS só"; a garantia real é nunca copiar metadado nenhum pro output.
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=OUTPUT_QUALITY, optimize=True)
    clean_bytes = out.getvalue()

    return SanitizedImage(
        bytes_=clean_bytes,
        content_type="image/jpeg",
        width=image.width,
        height=image.height,
    )


def looks_like_supported_upload(content_type: Optional[str]) -> bool:
    """Filtro barato antes de gastar CPU decodificando — não substitui
    `sanitize_image`, só evita processar algo que nem alega ser imagem."""
    if not content_type:
        return True  # alguns clientes não mandam content-type; a decodificação real decide
    return content_type.lower() in {"image/jpeg", "image/jpg", "image/png", "image/webp"}
