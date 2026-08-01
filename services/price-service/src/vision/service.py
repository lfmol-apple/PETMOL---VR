"""
Vision AI Service - Gemini Integration
Handles communication with Google Gemini AI for image analysis
"""

import google.generativeai as genai
from typing import List, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime
import re
import os

logger = logging.getLogger(__name__)


class VisionService:
    """Serviço de visão AI usando Gemini"""

    DEFAULT_MODEL_NAME = "gemini-2.5-flash"
    FALLBACK_MODEL_NAMES = (
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-2.0-flash",
        "gemini-2.0-flash-001",
    )
    PRODUCT_PHOTO_GENERATION_CONFIG = {
        "temperature": 0,
        "response_mime_type": "application/json",
    }
    OCR_GENERATION_CONFIG = {
        "temperature": 0,
        "response_mime_type": "application/json",
    }
    OCR_ONLY_PROMPT = """Transcreva literalmente todo texto legível nesta imagem.

Isto é uma tarefa de OCR pura — NÃO identifique produto, marca, categoria ou
qualquer outra informação. Apenas transcreva o que está fisicamente escrito
na imagem, exatamente como aparece.

Regras:
- Liste cada bloco de texto legível como um item separado do array.
- Transcreva exatamente como está escrito, incluindo maiúsculas/minúsculas,
  acentos e números. NÃO corrija erros de grafia nem complete palavras cortadas.
- Inclua texto de qualquer tamanho: título principal, subtítulos, selos,
  ícones com texto, tabelas, letras miúdas.
- NÃO infira ou complete texto que não esteja legível — omita-o.
- Se não houver texto legível, retorne uma lista vazia.

Responda APENAS com JSON válido neste formato:
{"text_blocks": ["texto 1", "texto 2", ...]}
"""

    def __init__(self, api_key: str):
        """
        Inicializa o serviço com a chave API do Google
        
        Args:
            api_key: Chave da Google AI (GOOGLE_API_KEY)
        """
        genai.configure(api_key=api_key)
        configured_model = (os.getenv("GEMINI_MODEL") or os.getenv("VISION_GEMINI_MODEL") or self.DEFAULT_MODEL_NAME).strip()
        self.model_name = configured_model or self.DEFAULT_MODEL_NAME
        self.model = genai.GenerativeModel(self.model_name)

    def _candidate_model_names(self) -> List[str]:
        names = [self.model_name, *self.FALLBACK_MODEL_NAMES]
        unique_names: List[str] = []
        for name in names:
            normalized = str(name).strip()
            if normalized and normalized not in unique_names:
                unique_names.append(normalized)
        return unique_names

    async def _generate_content_with_model_fallback(
        self,
        prompt: str,
        image_part: Dict[str, Any],
        generation_config: Optional[Dict[str, Any]] = None,
    ):
        last_error: Optional[Exception] = None
        for model_name in self._candidate_model_names():
            try:
                if model_name != self.model_name:
                    logger.warning("Gemini fallback: trocando modelo de %s para %s", self.model_name, model_name)
                self.model_name = model_name
                self.model = genai.GenerativeModel(model_name)
                return await self.model.generate_content_async(
                    [prompt, image_part],
                    generation_config=generation_config,
                    request_options={"timeout": 20},
                )
            except Exception as exc:
                err_str = str(exc).lower()
                retryable_model_error = (
                    "is not found for api version" in err_str or
                    "not supported for generatecontent" in err_str or
                    "404 models/" in err_str
                )
                if not retryable_model_error:
                    raise
                last_error = exc
                continue
        if last_error:
            raise last_error
        raise RuntimeError("Nenhum modelo Gemini disponível para generateContent")

    @staticmethod
    def _detect_mime_type(image_bytes: bytes) -> str:
        if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            return "image/png"
        if image_bytes.startswith(b'\xff\xd8\xff'):
            return "image/jpeg"
        if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
            return "image/webp"
        return "image/jpeg"

    @staticmethod
    def _strip_json_fences(response_text: str) -> str:
        text = response_text.strip()
        if text.startswith("```json"):
            return text.replace("```json", "").replace("```", "").strip()
        if text.startswith("```"):
            return text.replace("```", "").strip()
        return text

    async def _extract_independent_text(self, image_bytes: bytes) -> tuple[List[str], Optional[str]]:
        """OCR-only pass, isolated from product identification.

        This call has no framing about brands, products, or pet items at all —
        it only ever sees a transcription task. That independence is the whole
        point: the product-identification call's own `raw_text_blobs` field is
        produced by the same call that infers brand/product_name, so at
        temperature=0 a confident wrong guess reliably reproduces "supporting"
        blobs that agree with itself. Cross-checking against text extracted by
        a call that was never asked to identify anything closes that loophole.

        Returns (blobs, raw_response_text) — the raw text is kept for the
        temporary diagnostic dump (VisionService debug monitor) and is not
        otherwise used.
        """
        try:
            image_part = {
                "mime_type": self._detect_mime_type(image_bytes),
                "data": image_bytes,
            }
            response = await self._generate_content_with_model_fallback(
                self.OCR_ONLY_PROMPT,
                image_part,
                generation_config=self.OCR_GENERATION_CONFIG,
            )
            raw_text = response.text
            payload = json.loads(self._strip_json_fences(raw_text))
            blocks = payload.get("text_blocks") if isinstance(payload, dict) else None
            if not isinstance(blocks, list):
                return [], raw_text
            # Unlike the identification call's self-curated raw_text_blobs (which
            # the prompt asks to prioritize brand/name first), this OCR pass has
            # no such ordering — it transcribes in whatever order the model reads
            # the image, so packaging with a lot of marketing copy or an
            # overlapping shipping label can easily push the brand/name past a
            # tight cap. Keep a much larger window; this is the trusted grounding
            # corpus, cost of a few extra short strings is worth not losing it.
            return self._normalize_text_blobs(blocks, limit=40), raw_text
        except Exception as exc:
            logger.info("[Independent OCR] failed, guard will skip cross-check: %s", exc)
            return [], f"ERROR: {exc}"

    @staticmethod
    def _normalize_optional_str(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _normalize_weight_value(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        if isinstance(value, (int, float)):
            numeric = float(value)
            return numeric if numeric > 0 else None
        text = str(value).strip().replace(",", ".")
        try:
            numeric = float(text)
            return numeric if numeric > 0 else None
        except ValueError:
            return None

    @staticmethod
    def _normalize_weight_unit(value: Any) -> Optional[str]:
        text = VisionService._normalize_optional_str(value)
        if not text:
            return None
        normalized = text.lower().replace("grams", "g").replace("gram", "g").replace("kgs", "kg")
        return normalized if normalized in {"g", "kg"} else None

    @staticmethod
    def _compose_weight(weight_value: Optional[float], weight_unit: Optional[str]) -> Optional[str]:
        if weight_value is None or not weight_unit:
            return None
        if float(weight_value).is_integer():
            value_text = str(int(weight_value))
        else:
            value_text = f"{weight_value:.2f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"{value_text} {weight_unit}"

    @staticmethod
    def _extract_weight_parts(*values: Any) -> tuple[Optional[float], Optional[str]]:
        for value in values:
            text = VisionService._normalize_optional_str(value)
            if not text:
                continue
            match = re.search(r"(\d+(?:[\.,]\d+)?)\s*(kg|g)\b", text, re.IGNORECASE)
            if not match:
                continue
            numeric = VisionService._normalize_weight_value(match.group(1))
            unit = VisionService._normalize_weight_unit(match.group(2))
            if numeric is not None and unit:
                return numeric, unit
        return None, None

    _KNOWN_BRANDS_ORDERED = [
        "hill's science diet", "hills science diet", "hill's",
        "royal canin",
        "pro plan", "purina pro plan",
        "premier pet", "premier",
        "farmina n&d", "farmina",
        "golden special", "golden",
        "guabi natural", "guabi",
        "formula natural",
        "quatree", "special dog", "special cat",
        "pedigree", "whiskas", "friskies",
        "purina", "eukanuba", "iams",
        "orijen", "acana",
        "biofresh", "naturalys", "magnus",
        "taste of the wild", "blue buffalo", "wellness",
    ]

    @staticmethod
    def _ocr_brand_override(ai_brand: Optional[str], blobs: List[str]) -> tuple[Optional[str], bool]:
        """Return (brand, grounded) — grounded=True when the brand was matched
        against the OCR'd _KNOWN_BRANDS_ORDERED whitelist (either the AI's own
        guess agreed with a brand actually present in the blobs, or it was
        overridden to one that is). Callers should treat grounded=True brands
        as already validated and skip any further exact-substring coverage
        check against them — that check is a fragile match against a single
        specific OCR spelling (e.g. AI says "PremierR", blobs say "PremierPet"
        elsewhere — same brand, different transcription noise on a stylized
        logo, but no exact substring in common) whereas the whitelist match
        here is corpus-wide and tolerant of exactly that kind of noise.
        """
        if not blobs:
            return ai_brand, False
        blob_text = " ".join(blobs).lower()
        found_brands = [known for known in VisionService._KNOWN_BRANDS_ORDERED if known in blob_text]
        if not found_brands:
            return ai_brand, False
        ai_norm = (ai_brand or "").lower()
        # If ai_brand agrees with ANY brand actually present in the blobs, trust it —
        # don't override just because a different known brand also appears earlier
        # in the priority list (e.g. from a neighboring product's text). An empty
        # ai_norm never "agrees" — that would otherwise vacuously match every
        # found brand (since "" is a substring of everything) and discard a
        # legitimate OCR-detected brand whenever the AI simply didn't provide one.
        if ai_norm and any(known in ai_norm or ai_norm in known for known in found_brands):
            return ai_brand, True
        # Prefer the most specific (longest) match rather than whichever known
        # brand happens to sit first in the priority list.
        override = max(found_brands, key=len)
        logger.info("[OCR Brand Override] AI said %r but OCR blobs have %r — using OCR brand", ai_brand, override)
        return override, True

    @staticmethod
    def _normalize_text_blobs(value: Any, limit: int = 12) -> List[str]:
        if value is None:
            return []
        raw_items = value if isinstance(value, list) else [value]
        normalized: List[str] = []
        for item in raw_items:
            if item is None:
                continue
            if isinstance(item, list):
                raw_items.extend(item)
                continue
            text = str(item).strip()
            if not text:
                continue
            text = re.sub(r"\s+", " ", text)
            if text not in normalized:
                normalized.append(text)
        return normalized[:limit]

    @staticmethod
    def _normalize_species(value: Any) -> Optional[str]:
        text = VisionService._normalize_optional_str(value)
        if not text:
            return None
        normalized = text.lower()
        aliases = {
            "dog": "dog",
            "dogs": "dog",
            "cao": "dog",
            "cão": "dog",
            "canine": "dog",
            "cat": "cat",
            "cats": "cat",
            "gato": "cat",
            "gatos": "cat",
            "feline": "cat",
            "other": "other",
            "pet": "other",
        }
        return aliases.get(normalized)

    @staticmethod
    def _normalize_life_stage(value: Any) -> Optional[str]:
        text = VisionService._normalize_optional_str(value)
        if not text:
            return None
        normalized = text.lower()
        aliases = {
            "puppy": "puppy",
            "kitten": "puppy",
            "filhote": "puppy",
            "adult": "adult",
            "adulto": "adult",
            "senior": "senior",
            "sênior": "senior",
            "all": "all",
            "all ages": "all",
            "todas as idades": "all",
        }
        return aliases.get(normalized)

    @staticmethod
    def _normalize_port(value: Any) -> Optional[str]:
        text = VisionService._normalize_optional_str(value)
        if not text:
            return None
        normalized = text.lower()
        aliases = {
            "mini": "mini",
            "toy": "mini",
            "x-small": "mini",
            "xsmall": "mini",
            "pequeno": "pequeno",
            "pequena": "pequeno",
            "pequenas": "pequeno",
            "pequenos": "pequeno",
            "small": "pequeno",
            "mini e pequeno": "pequeno",
            "medio": "medio",
            "médio": "medio",
            "media": "medio",
            "média": "medio",
            "medias": "medio",
            "médias": "medio",
            "medium": "medio",
            "grande": "grande",
            "grandes": "grande",
            "large": "grande",
            "gigante": "gigante",
            "gigantes": "gigante",
            "giant": "gigante",
            "all": "all",
            "todos os portes": "all",
        }
        return aliases.get(normalized)

    @staticmethod
    def _build_probable_name(
        brand: Optional[str],
        product_name: Optional[str],
        line: Optional[str],
        variant: Optional[str],
        flavor: Optional[str],
        species: Optional[str],
        life_stage: Optional[str],
        weight: Optional[str],
    ) -> Optional[str]:
        species_map = {"dog": "Cão", "cat": "Gato", "other": "Pet"}
        stage_map = {"puppy": "Filhote", "adult": "Adulto", "senior": "Sênior", "all": "Todas as idades"}
        parts = [
            brand,
            product_name,
            line,
            variant,
            flavor,
            species_map.get(species),
            stage_map.get(life_stage),
            weight,
        ]
        compact = [str(part).strip() for part in parts if part and str(part).strip()]
        # The AI often fills product_name and line with the same value (e.g. a
        # sub-brand printed once on the pack ends up in both fields) — dedupe
        # by normalized text so "PremierPet Formula Formula ..." doesn't happen.
        seen_normalized = set()
        deduped = []
        for part in compact:
            key = re.sub(r"\s+", " ", part).strip().lower()
            if key in seen_normalized:
                continue
            seen_normalized.add(key)
            deduped.append(part)
        return " ".join(deduped) or None

    async def identify_product_from_image(
        self,
        image_bytes: bytes,
        pet_id: str,
        hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Identifica um produto pet a partir de uma foto da embalagem.

        Retorna um payload estruturado para o frontend preencher o sheet atual.
        """
        category_hint = (hint or "other").strip().lower()
        category_guidance = {
            "food": "Para ração/alimento: trate a embalagem como CAMPOS VISUAIS. Extraia marca, nome principal do produto, linha, variante, sabor, espécie, faixa etária e peso separadamente. Não dependa da ordem linear do texto.",
            "medication": "Para medicamento, procure nome comercial, princípio ativo, concentração, laboratório/fabricante e apresentação. Exemplos: Apoquel, Prediderm, Amoxicilina, Simparic, Otomax, Dermotrat.",
            "antiparasite": "Para antiparasitário, procure marca comercial, faixa de peso e apresentação. Exemplos: Bravecto, NexGard, Simparica, Frontline, Revolution.",
            "dewormer": "Para vermífugo, procure nome comercial e apresentação. Exemplos: Drontal, Milbemax, Canex, Panacur.",
            "collar": "Para coleira, procure marca e tamanho/faixa de peso. Exemplos: Seresto, Scalibor, Foresto.",
            "hygiene": "Para higiene, procure nome do produto, marca e volume/peso. Exemplos: shampoo, tapete higiênico, areia, lenço umedecido.",
            "other": "Se não houver categoria clara, identifique o produto pet mais provável lendo marca, nome e apresentação.",
        }.get(category_hint, "Se houver categoria esperada, use-a para desempatar o produto mais provável.")

        prompt = f"""
Você é um especialista em identificar produtos pet por imagem de embalagem.

Objetivo:
- Ler visualmente a foto da embalagem como HIERARQUIA VISUAL + CAMPOS ESTRUTURADOS.
- Extrair campos utilizáveis mesmo quando o nome completo não estiver legível.
- Priorizar produtos pet reais, especialmente ração, antipulgas, vermífugo, coleira, medicamento e higiene.
- Se a imagem estiver ambígua ou ilegível, diga que não encontrou.

Contexto:
- Pet ID: {pet_id}
- Categoria esperada: {hint or 'não informada'}
- Diretriz específica: {category_guidance}

Regras:
1. PRIORIDADE MÁXIMA: retorne um candidato utilizável sempre que possível. Se conseguir ler qualquer combinação de marca + espécie + fase + peso + nome parcial, isso já é suficiente.
2. NÃO trate a embalagem como string linear. Pense em campos independentes: marca, nome principal, linha, variante, sabor, espécie, fase e peso.
3. NÃO priorize `name` como saída principal. O campo principal é `product_name`.
4. Para ração, `product_name` deve refletir apenas o nome principal visível do produto; `line`, `variant`, `flavor`, `species`, `life_stage` e peso devem ir separados.
5. A categoria deve ser uma destas: food, medication, antiparasite, dewormer, collar, hygiene, other.
6. Extraia o peso separadamente em `weight_value` e `weight_unit`.
7. `raw_text_blobs` deve listar LITERALMENTE todos os blocos de texto legíveis na embalagem — em especial o nome da marca EXATAMENTE como impresso no rótulo. NUNCA omita texto visível por achar que é redundante com `brand` ou `product_name`. O objetivo é registrar o que está ESCRITO na embalagem, não o que você interpreta. Se você lê "ROYAL CANIN" na embalagem, "ROYAL CANIN" DEVE aparecer em raw_text_blobs, mesmo que você tenha colocado outra marca em `brand`.
8. Se a categoria esperada estiver informada, use isso para priorizar candidatos e evitar cair em other.
9. Para medication: retorne nome comercial OU princípio ativo + concentração se legível.
10. Só retorne found=false e todos os campos relevantes null/vazios quando a imagem estiver realmente ilegível ou sem embalagem.
11. Responda APENAS JSON válido, sem texto extra.
12. Se houver MAIS DE UM produto/embalagem visível na foto (ex: prateleira com vários sacos lado a lado), identifique e extraia campos APENAS do produto em PRIMEIRO PLANO / MAIS CENTRALIZADO / MAIOR NA IMAGEM. NUNCA combine texto de embalagens diferentes no mesmo resultado — cada campo (especialmente `flavor`) deve vir EXCLUSIVAMENTE da embalagem principal. Se não conseguir determinar com certeza a qual embalagem um texto de sabor pertence, deixe `flavor` como null em vez de adivinhar — errar o sabor é pior do que omiti-lo.
13. Defina `multiple_products_detected: true` sempre que houver mais de uma embalagem de produto claramente visível na foto (mesmo que você tenha conseguido identificar a principal corretamente). Isso é usado para sugerir ao usuário que tire uma foto mais próxima/isolada da próxima vez — não afeta os outros campos, que devem continuar refletindo o produto principal.
14. Extraia `port` (porte do animal a que a ração se destina — mini/pequeno/médio/grande/gigante) SEMPRE que a embalagem indicar isso, seja no nome da linha ("Raças Pequenas"), em texto solto ("PEQUENO", "PORTES MÉDIO E GRANDE") ou em ícones/selos. Isso é uma informação crítica para dosagem — não deixe de capturar só porque não está no nome principal do produto.
15. Extraia `neutered` (true/false/null) quando a embalagem indicar claramente que é uma fórmula para animais castrados ("CASTRADOS", "STERILISED", "NEUTERED") — true se indicado, false se a embalagem indicar explicitamente "não castrado" (raro), null se não houver informação sobre isso.

Formato JSON obrigatório:
{{
  "found": true,
  "brand": "Marca",
    "product_name": "Nome principal visível do produto",
  "category": "food",
  "species": "dog",
  "life_stage": "adult",
  "port": "pequeno",
  "neutered": true,
    "weight_value": 15,
    "weight_unit": "kg",
    "variant": "Raças Pequenas",
  "flavor": "Sabor (ex: Frango e Arroz)",
    "line": "Linha específica (ex: Veterinary Diet, Natural)",
    "raw_text_blobs": ["Royal Canin", "Mini Adult", "Cães Adultos", "1,5 kg"],
  "confidence": 0.92,
  "multiple_products_detected": false,
    "reason": "Resumo curto do que foi lido na embalagem"
}}

Valores válidos para species: "dog", "cat", "other", null
Valores válidos para life_stage: "puppy", "adult", "senior", "all", null
Valores válidos para port: "mini", "pequeno", "medio", "grande", "gigante", "all", null
Valores válidos para neutered: true, false, null
Se não souber um campo, use null. NÃO invente.

Se a imagem for realmente ilegível:
{{
  "found": false,
  "brand": null,
    "product_name": null,
  "category": null,
    "species": null,
    "life_stage": null,
    "weight_value": null,
    "weight_unit": null,
    "variant": null,
    "flavor": null,
  "line": null,
    "raw_text_blobs": [],
  "confidence": 0.0,
  "reason": "Imagem ilegível ou sem embalagem identificável"
}}
"""

        try:
            logger.info("Enviando imagem de produto para Gemini AI (pet_id=%s, hint=%s)", pet_id, hint)

            image_part = {
                "mime_type": self._detect_mime_type(image_bytes),
                "data": image_bytes,
            }

            # Run product identification and independent OCR concurrently — the
            # OCR call never sees any product/brand framing, so it can't
            # self-consistently hallucinate "evidence" for the identification
            # call's guess the way a single call's own raw_text_blobs can.
            response, (independent_blobs, independent_raw_text) = await asyncio.gather(
                self._generate_content_with_model_fallback(
                    prompt,
                    image_part,
                    generation_config=self.PRODUCT_PHOTO_GENERATION_CONFIG,
                ),
                self._extract_independent_text(image_bytes),
            )
            response_text = self._strip_json_fences(response.text)
            result = json.loads(response_text)
            # Temporary diagnostic fields — surfaced via the token-gated debug
            # dump endpoint only, not exposed to the client response model.
            # TODO: remove once the brand-hallucination investigation is closed.
            result["_debug_identification_raw"] = response_text
            result["_debug_ocr_raw"] = independent_raw_text
            result["_debug_ocr_blobs"] = independent_blobs

            allowed_categories = {"food", "medication", "antiparasite", "dewormer", "collar", "hygiene", "other"}
            category = result.get("category")
            if category not in allowed_categories:
                result["category"] = hint if hint in allowed_categories else "other"

            brand = self._normalize_optional_str(result.get("brand"))
            product_name = self._normalize_optional_str(result.get("product_name"))
            line = self._normalize_optional_str(result.get("line"))
            variant = self._normalize_optional_str(result.get("variant"))
            flavor = self._normalize_optional_str(result.get("flavor"))
            self_reported_blobs = self._normalize_text_blobs(result.get("raw_text_blobs"))
            visible_text = self._normalize_optional_str(result.get("visible_text"))
            if visible_text and visible_text not in self_reported_blobs:
                self_reported_blobs.append(visible_text)
            self_reported_blobs = self_reported_blobs[:12]

            # Two different jobs need two different corpora here, confirmed by a
            # real shelf photo with neighboring Premier bags (Renal, Obesidade)
            # next to the actual Gastrointestinal product in frame:
            #
            # - Grounding brand/product_name (guard below) wants the INDEPENDENT
            #   OCR pass: it has no product framing, so it can't self-confirm a
            #   hallucination — completeness matters more than precision here,
            #   since we're only asking "does this text appear ANYWHERE".
            # - Everything downstream that reasons about what THIS product is
            #   (dominant-terms/therapeutic-conflict detection on the client,
            #   result["raw_text_blobs"]) wants the IDENTIFICATION call's own
            #   blobs instead: prompt rule 12 tells that call to only report
            #   fields for the foreground/primary package, so on a multi-bag
            #   shelf photo it correctly omits "RENAL"/"OBESIDADE" from
            #   neighboring bags — the independent OCR pass has no such
            #   filtering by design and picks up neighboring text indiscriminately,
            #   which was making the client see contradictory therapeutic terms
            #   (renal AND gastrointestinal at once) and reject the correct
            #   catalog match in favor of a generic fallback.
            trusted_corpus_blobs = independent_blobs if independent_blobs else self_reported_blobs
            raw_text_blobs = self_reported_blobs if self_reported_blobs else independent_blobs
            brand, brand_grounded = self._ocr_brand_override(brand, trusted_corpus_blobs)

            if trusted_corpus_blobs:
                blob_corpus = " ".join(trusted_corpus_blobs).lower()

                if product_name:
                    name_tokens = [t for t in product_name.lower().split() if len(t) >= 4]
                    if len(name_tokens) >= 2:
                        coverage = sum(1 for t in name_tokens if t in blob_corpus) / len(name_tokens)
                        if coverage < 0.3:
                            logger.info(
                                "[Hallucination Guard] product_name=%r coverage=%.0f%% vs independent OCR — clearing",
                                product_name, coverage * 100,
                            )
                            product_name = None
                            result["confidence"] = float(result.get("confidence") or 0.0) * 0.5

                # Brands already grounded via the known-brand whitelist match
                # above went through a corpus-wide, noise-tolerant check — an
                # exact-substring recheck here would only catch OCR spelling
                # drift on the SAME brand (e.g. AI says "PremierR", blobs say
                # "PremierPet" — no literal substring in common) and wrongly
                # clear a correct answer. Only run this backstop for brands
                # that were never matched against the whitelist at all.
                if brand and not brand_grounded:
                    brand_tokens = [t for t in brand.lower().split() if len(t) >= 4]
                    if brand_tokens:
                        coverage = sum(1 for t in brand_tokens if t in blob_corpus) / len(brand_tokens)
                        if coverage < 0.3:
                            logger.info(
                                "[Hallucination Guard] brand=%r coverage=%.0f%% vs independent OCR — clearing",
                                brand, coverage * 100,
                            )
                            brand = None
                            result["confidence"] = float(result.get("confidence") or 0.0) * 0.5

            species = self._normalize_species(result.get("species"))
            life_stage = self._normalize_life_stage(result.get("life_stage"))
            port = self._normalize_port(result.get("port"))
            neutered = result.get("neutered") if isinstance(result.get("neutered"), bool) else None

            weight_value = self._normalize_weight_value(result.get("weight_value"))
            weight_unit = self._normalize_weight_unit(result.get("weight_unit"))
            legacy_weight_value, legacy_weight_unit = self._extract_weight_parts(
                result.get("weight"),
                result.get("presentation"),
                result.get("visible_text"),
                raw_text_blobs,
            )
            if weight_value is None:
                weight_value = legacy_weight_value
            if not weight_unit:
                weight_unit = legacy_weight_unit
            weight = self._compose_weight(weight_value, weight_unit) or self._normalize_optional_str(result.get("weight"))

            manufacturer = self._normalize_optional_str(result.get("manufacturer"))
            presentation = self._normalize_optional_str(result.get("presentation"))
            reason = self._normalize_optional_str(result.get("reason"))
            name = self._normalize_optional_str(result.get("name"))
            probable_name = self._normalize_optional_str(result.get("probable_name"))

            useful_partial = bool(
                brand or
                product_name or
                species or
                life_stage or
                weight or
                line or
                variant or
                flavor or
                raw_text_blobs
            )

            if not probable_name and useful_partial:
                probable_name = self._build_probable_name(
                    brand=brand,
                    product_name=product_name,
                    line=line,
                    variant=variant,
                    flavor=flavor,
                    species=species,
                    life_stage=life_stage,
                    weight=weight,
                )

            result["found"] = bool(result.get("found") or product_name or name or useful_partial)
            result["confidence"] = float(result.get("confidence") or 0.0)
            result["multiple_products_detected"] = bool(result.get("multiple_products_detected"))
            result["product_name"] = product_name
            result["name"] = name
            result["probable_name"] = probable_name
            result["brand"] = brand
            result["weight"] = weight
            result["weight_value"] = weight_value
            result["weight_unit"] = weight_unit
            result["variant"] = variant
            result["visible_text"] = "\n".join(raw_text_blobs) if raw_text_blobs else visible_text
            result["raw_text_blobs"] = raw_text_blobs
            result["size"] = variant
            result["manufacturer"] = manufacturer or brand or None
            result["presentation"] = presentation or weight or None
            result["reason"] = reason

            result["species"] = species
            result["life_stage"] = life_stage
            result["port"] = port
            result["neutered"] = neutered

            result["line"] = line
            result["flavor"] = flavor

            if not result["name"] and result["probable_name"] and result["confidence"] >= 0.82:
                result["name"] = result["probable_name"]

            if not result["confidence"] and (result["product_name"] or result["name"] or useful_partial):
                result["confidence"] = 0.65

            if hint in allowed_categories and (result.get("category") == "other" or not result.get("category")):
                result["category"] = hint

            return_type = "complete" if result.get("name") else "partial" if useful_partial else "empty"
            logger.info(
                "Gemini produto return_type=%s found=%s category=%s confidence=%.2f brand=%s product_name=%s",
                return_type,
                bool(result["found"]),
                result.get("category"),
                result["confidence"],
                result.get("brand"),
                result.get("product_name"),
            )
            return result
        except json.JSONDecodeError as e:
            logger.warning("Gemini produto return_type=empty reason=json_parse_error detail=%s", e)
            return {
                "found": False,
                "product_name": None,
                "name": None,
                "probable_name": None,
                "brand": None,
                "category": hint or "other",
                "weight": None,
                "weight_value": None,
                "weight_unit": None,
                "variant": None,
                "size": None,
                "manufacturer": None,
                "presentation": None,
                "visible_text": None,
                "raw_text_blobs": [],
                "species": None,
                "life_stage": None,
                "line": None,
                "flavor": None,
                "confidence": 0.0,
                "reason": "Resposta inválida da IA",
            }
        except Exception as e:
            err_str = str(e)
            if "timeout" in err_str.lower() or "deadline" in err_str.lower():
                logger.warning("Gemini produto return_type=timeout pet_id=%s detail=%s", pet_id, err_str)
                return {
                    "found": False,
                    "product_name": None,
                    "name": None,
                    "probable_name": None,
                    "brand": None,
                    "category": hint or "other",
                    "weight": None,
                    "weight_value": None,
                    "weight_unit": None,
                    "variant": None,
                    "size": None,
                    "manufacturer": None,
                    "presentation": None,
                    "visible_text": None,
                    "raw_text_blobs": [],
                    "species": None,
                    "life_stage": None,
                    "line": None,
                    "flavor": None,
                    "confidence": 0.0,
                    "reason": "Tempo limite da IA esgotado",
                }
            logger.error("Gemini produto return_type=exception pet_id=%s detail=%s", pet_id, err_str, exc_info=True)
            raise
    
    async def extract_vaccine_data(self, image_bytes: bytes, pet_id: str) -> Dict[str, Any]:
        """
        Extrai dados de vacinas de uma imagem de carteirinha com precisão global.
        
        Args:
            image_bytes: Imagem em bytes
            pet_id: ID do pet (para contexto)
        
        Returns:
            Dict com: vaccines (lista), confidence (float), raw_text (str)
        """
        
        # Prompt refatorado com lógica de ancoragem e PRIORIDADE NOBIVAC
        prompt = """
Você é um Especialista Veterinário Global em OCR de Carteirinhas de Vacinação.

🎯 MISSÃO: Extrair TODAS as vacinas desta imagem com precisão de 100%.

🌟 PRIORIDADE MÁXIMA NOBIVAC:
- Se encontrar texto "NOBIVAC" em QUALQUER adesivo, marca = "NOBIVAC"
- NUNCA substituir "Nobivac" por "Vanguard", "Duramune" ou outras marcas
- Variações Nobivac: "Nobivac Raiva", "Nobivac 1-Cv", "Nobivac DAPPv+L4", "Nobivac Canine"
- Se há adesivo com "NOBIVAC" e texto ilegível, ainda reportar com confiança 0.7

⚓ ETAPA 1 - LÓGICA DE ANCORAGEM (Conte Primeiro):
Antes de extrair qualquer dado, faça uma VARREDURA COMPLETA da imagem e conte:
- Quantos adesivos/etiquetas de vacina você vê? (conte visualmente)
- Quantos números de série/lote você detecta?
- Quantas marcas comerciais diferentes identifica?
- Liste as coordenadas aproximadas (topo-esquerda, topo-centro, topo-direita, meio-esquerda, etc.)

Se você contar 8 adesivos, deve retornar EXATAMENTE 8 registros no JSON.

📋 ETAPA 2 - CLASSIFICAÇÃO SEMÂNTICA GLOBAL:
Em vez de apenas buscar marcas fixas, CLASSIFIQUE a vacina pelos COMPONENTES visíveis:

CÓDIGOS DE COMPONENTES:
- "D" ou "Distemper" ou "Cinomose" → Distemper (Cinomose)
- "H" ou "Hepatitis" ou "Hepatite" → Hepatite/Adenovírus
- "P" ou "Parvo" → Parvovirose  
- "Pi" ou "Parainfluenza" → Parainfluenza
- "L" ou "Lepto" → Leptospirose
- "R" ou "Rabies" ou "Raiva" ou "Antirrábica" → Raiva (Antirrábica)
- "C" ou "Corona" → Coronavírus
- "B" ou "Bordetella" → Bordetelose (Tosse dos Canis)
- "G" ou "Giardia" → Giárdia
- "Leish" → Leishmaniose

EXEMPLOS DE CLASSIFICAÇÃO:
- Se ler "DHPPI + L" → "Vacina Múltipla (V8) - Cinomose, Hepatite, Parvo, Parainfluenza, Leptospirose"
- Se ler "Nobivac Lepto" → "Leptospirose (Nobivac)"
- Se ler "Nobivac DAPPv+L4" → "Vacina Múltipla (V10) - Nobivac DAPPv+L4"
- Se ler "Nobivac Canine 1-DAPPv+L4" → "Vacina Múltipla (V10) - Nobivac Canine"
- Se ler "Nobivac 1-Cv" → "Coronavírus (Nobivac 1-Cv)"
- Se ler "Nobivac Raiva" → "Raiva (Nobivac Raiva)"
- Se ler "Duramune Max" → "Vacina Múltipla (V10) - Duramune"
- Se ler apenas "R" no selo → "Raiva (Antirrábica)"

⚠️ REGRA CRÍTICA NOBIVAC: Se encontrar QUALQUER texto com "NOBIVAC", preserve na marca comercial EXATA, mesmo se difícil de ler.

📅 ETAPA 3 - LEITURA DE DATAS MANUSCRITAS:

FORMATOS ACEITOS:
- dd/mm/aa ou dd/mm/aaaa (Brasil: 15/03/24)
- dd.mm.aa ou dd-mm-aa (Europa: 15.03.24)
- ddmmaa ou ddmmaaaa SEM separadores (150324)
- dd Mon aa (15 Mar 24, 15 Marzo 24, 15 March 24)
- Mon dd aa (Mar 15 24, Marzo 15 24)

CORREÇÃO DE ANOS AMBÍGUOS:
⚠️ REGRA CRÍTICA: Se você ler um ano MAIOR que 2027 em uma data de aplicação:
  - Verifique se o segundo dígito pode ser um "1" mal escrito
  - Exemplo: "2026" → pode ser "2016" (dígito "2" confundido com "1")
  - Exemplo: "2029" → pode ser "2019" 
  - Exemplo: "2030" → pode ser "2010"
  - Use o contexto: vacinas antigas (5+ anos) provavelmente têm ano mal lido

CORREÇÃO DE CARACTERES MANUSCRITOS:
- "l" ou "I" ou "|" → número "1"
- "O" ou "o" → número "0" (zero)
- "S" → número "5" (quando em contexto de data)
- "G" → número "6"
- "g" minúsculo → número "9"
- "Z" → número "2"
- "B" → número "8"

🌍 MESES MULTILÍNGUE:
Português: Janeiro, Fevereiro, Março, Abril, Maio, Junho, Julho, Agosto, Setembro, Outubro, Novembro, Dezembro
Espanhol: Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre  
Inglês: January, February, March, April, May, June, July, August, September, October, November, December
Abreviações: Jan, Feb/Fev, Mar, Apr/Abr, May/Mai, Jun, Jul, Aug/Ago, Sep/Set, Oct/Out, Nov, Dec/Dez

✅ ETAPA 4 - FORMATO DE SAÍDA (JSON Estrito):

{
  "total_encontrado": 8,  // DEVE bater com número de adesivos contados
  "vaccines": [
    {
      "name": "Leptospirose (Nobivac Lepto)",  // Nome classificado semanticamente
      "commercial_brand": "Nobivac Lepto",  // Marca exata do adesivo
      "components": ["Leptospirose"],  // Componentes identificados
      "date": "2024-03-15",  // YYYY-MM-DD (null se ilegível)
      "next_date": "2025-03-15",  // YYYY-MM-DD (null se não houver)
      "veterinarian": "Dr. João Silva",  // Nome do carimbo (null se ilegível)
      "notes": "Lote ABC123",  // Opcional
      "field_confidence": {  // NOVO: Confiança por campo
        "name": 0.95,
        "date": 0.80,  // Baixa se manuscrito ilegível
        "next_date": 0.90,
        "veterinarian": 0.70
      }
    }
  ],
  "overall_confidence": 0.85,
  "raw_text": "Texto OCR bruto detectado"
}

🚫 REGRAS DE SANIDADE:
1. Se total_encontrado != len(vaccines), REVISE a imagem
2. NUNCA invente datas - use null se ilegível
3. NUNCA pule colunas - varra linha por linha, esquerda→direita
4. Se data_aplicacao > data_revacina, INVERTA (erro de leitura)
5. Datas de aplicação não podem ser futuro (>hoje + 7 dias)
6. field_confidence < 0.7 em qualquer campo = marcar para revisão humana

Retorne APENAS o JSON, sem texto adicional.
"""
        
        try:
            # Enviar para Gemini
            logger.info(f"Enviando imagem para Gemini AI (pet_id={pet_id})")
            
            # Preparar imagem
            image_part = {
                "mime_type": self._detect_mime_type(image_bytes),
                "data": image_bytes
            }
            
            # Gerar resposta
            response = self.model.generate_content([prompt, image_part])
            
            # Parse da resposta
            response_text = self._strip_json_fences(response.text)
            
            # Parse JSON
            result = json.loads(response_text)
            
            # Validar estrutura
            if "vaccines" not in result:
                result["vaccines"] = []
            if "confidence" not in result:
                result["confidence"] = 0.5
            
            # Normalizar datas
            for vaccine in result["vaccines"]:
                # Garantir que datas estejam no formato correto
                if vaccine.get("date"):
                    vaccine["date"] = self._normalize_date(vaccine["date"])
                if vaccine.get("next_date"):
                    vaccine["next_date"] = self._normalize_date(vaccine["next_date"])
            
            logger.info(f"Gemini retornou {len(result['vaccines'])} vacinas com confiança {result['confidence']}")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Erro ao fazer parse da resposta do Gemini: {response_text[:200]}")
            # Retornar resposta vazia mas válida
            return {
                "vaccines": [],
                "confidence": 0.0,
                "raw_text": f"Erro ao processar resposta da IA: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Erro ao chamar Gemini AI: {str(e)}", exc_info=True)
            raise
    
    def _normalize_date(self, date_str: str, kind: str = "unknown") -> str:
        """
        Normaliza diferentes formatos de data para YYYY-MM-DD (suporte global).
        
        Args:
            date_str: Data em string (vários formatos possíveis)
            kind: "aplicacao" ou "revacina" (para validação de ano ambíguo)
        
        Returns:
            Data no formato YYYY-MM-DD ou None se inválida
        """
        import re
        from datetime import date, timedelta
        
        if not date_str:
            return None
        
        s = str(date_str).strip()
        if not s:
            return None
        
        # Correção de caracteres manuscritos mal lidos
        char_fixes = {
            'l': '1', 'I': '1', '|': '1',  # l, I, pipe → 1
            'O': '0', 'o': '0',             # O → 0
            'S': '5', 's': '5',             # S → 5
            'G': '6', 'g': '9',             # G→6, g→9
            'Z': '2', 'z': '2',             # Z → 2
            'B': '8',                       # B → 8
        }
        
        # Aplicar correções se houver separadores ou números
        if any(sep in s for sep in ['/', '.', '-']) or any(c.isdigit() for c in s):
            for old_char, new_char in char_fixes.items():
                s = s.replace(old_char, new_char)
        
        today = date.today()
        current_year = today.year
        
        # Já está no formato ISO
        if len(s) == 10 and s[4] == '-' and s[7] == '-':
            try:
                y, m, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
                y = self._adjust_ambiguous_year(y, kind, current_year)
                return date(y, m, d).strftime("%Y-%m-%d")
            except ValueError:
                pass
        
        # Meses por extenso (português, espanhol, inglês)
        months = {
            # Português
            "jan": 1, "janeiro": 1,
            "fev": 2, "fevereiro": 2,
            "mar": 3, "março": 3, "marco": 3,
            "abr": 4, "abril": 4,
            "mai": 5, "maio": 5,
            "jun": 6, "junho": 6,
            "jul": 7, "julho": 7,
            "ago": 8, "agosto": 8,
            "set": 9, "setembro": 9,
            "out": 10, "outubro": 10,
            "nov": 11, "novembro": 11,
            "dez": 12, "dezembro": 12,
            # Espanhol
            "ene": 1, "enero": 1,
            "feb": 2, "febrero": 2,
            "marzo": 3,
            "mayo": 5,
            "junio": 6,
            "julio": 7,
            "septiembre": 9,
            "octubre": 10,
            "noviembre": 11,
            "diciembre": 12,
            # Inglês
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        
        s_lower = s.lower().replace('.', ' ').replace(',', ' ')
        
        # Formato: dd Mon aa (15 Mar 24)
        m_dmy = re.search(r'\b(\d{1,2})\s+(\w{3,})\s+(\d{2,4})\b', s_lower)
        if m_dmy:
            d = int(m_dmy.group(1))
            mon = m_dmy.group(2).strip()
            y_raw = int(m_dmy.group(3))
            if mon in months:
                y = self._adjust_year(y_raw, kind, current_year)
                try:
                    return date(y, months[mon], d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato: Mon dd aa (Mar 15 24)
        m_mdy = re.search(r'\b(\w{3,})\s+(\d{1,2})\s+(\d{2,4})\b', s_lower)
        if m_mdy:
            mon = m_mdy.group(1).strip()
            d = int(m_mdy.group(2))
            y_raw = int(m_mdy.group(3))
            if mon in months:
                y = self._adjust_year(y_raw, kind, current_year)
                try:
                    return date(y, months[mon], d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato: dd/mm/aa ou dd.mm.aa ou dd-mm-aa
        m = re.search(r'\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})\b', s)
        if m:
            a = int(m.group(1))
            b = int(m.group(2))
            y_raw = int(m.group(3))
            y = self._adjust_year(y_raw, kind, current_year)
            
            # Tentar dd/mm (brasileiro) primeiro
            try:
                return date(y, b, a).strftime("%Y-%m-%d")
            except ValueError:
                # Tentar mm/dd (americano)
                try:
                    return date(y, a, b).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato compacto SEM separadores: ddmmaa ou ddmmaaaa
        m_compact = re.search(r'\b(\d{6}|\d{8})\b', s)
        if m_compact:
            compact = m_compact.group(1)
            if len(compact) == 6:  # ddmmaa
                try:
                    d = int(compact[0:2])
                    m = int(compact[2:4])
                    y_raw = int(compact[4:6])
                    y = self._adjust_year(y_raw, kind, current_year)
                    return date(y, m, d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
            elif len(compact) == 8:  # ddmmaaaa
                try:
                    d = int(compact[0:2])
                    m = int(compact[2:4])
                    y_raw = int(compact[4:8])
                    y = self._adjust_ambiguous_year(y_raw, kind, current_year)
                    return date(y, m, d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        logger.warning(f"Não foi possível normalizar data: {date_str}")
        return None
    
    def _adjust_year(self, y: int, kind: str, current_year: int) -> int:
        """Ajusta ano de 2 dígitos para 4 dígitos."""
        if y < 100:
            y = 2000 + y
        return self._adjust_ambiguous_year(y, kind, current_year)
    
    def _adjust_ambiguous_year(self, y: int, kind: str, current_year: int) -> int:
        """Corrige anos ambíguos (ex: 2026→2016, 2029→2019)."""
        # Regra de sanidade: se ano for muito futuro e for data de aplicação, corrigir
        if kind == "aplicacao" and y > current_year + 1:
            # Tenta subtrair 10, 20, 30 anos para ver se faz sentido
            for delta in [10, 20, 30]:
                candidate = y - delta
                if 2000 <= candidate <= current_year:
                    logger.info(f"Ano ambíguo corrigido: {y} → {candidate} (contexto: {kind})")
                    return candidate
        
        # Para revacina, permitir até +5 anos no futuro
        if kind == "revacina" and y > current_year + 5:
            for delta in [10, 20]:
                candidate = y - delta
                if 2000 <= candidate <= current_year + 5:
                    logger.info(f"Ano ambíguo corrigido: {y} → {candidate} (contexto: {kind})")
                    return candidate
        
        return y
