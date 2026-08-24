"""
Sistema de Validação Cruzada para Leitura de Cartões de Vacina
Combina múltiplas IAs e tecnologias para máxima confiabilidade

Estratégia:
1. Processamento com múltiplas IAs (Gemini + OpenAI GPT-4 Vision)
2. Comparação e consenso entre resultados
3. Score de confiança baseado em concordância
4. Detecção de inconsistências automáticas
"""

import google.generativeai as genai
from openai import AsyncOpenAI
from typing import List, Dict, Any, Optional, Tuple
import json
import logging
from datetime import datetime, timedelta
import base64
import asyncio
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class CrossValidationService:
    """Serviço de validação cruzada usando múltiplas IAs"""
    
    def __init__(self, google_api_key: str, openai_api_key: Optional[str] = None):
        """
        Inicializa o serviço com chaves de API
        
        Args:
            google_api_key: Chave da Google AI (GOOGLE_API_KEY)
            openai_api_key: Chave da OpenAI (OPENAI_API_KEY) - opcional
        """
        # Configurar Gemini
        genai.configure(api_key=google_api_key)
        self.gemini_model = genai.GenerativeModel('gemini-2.5-flash')  # Modelo atualizado
        
        # Configurar OpenAI GPT-4 Vision (se disponível)
        self.openai_client = None
        self.has_openai = False
        if openai_api_key:
            try:
                self.openai_client = AsyncOpenAI(api_key=openai_api_key)
                self.has_openai = True
                logger.info("✅ OpenAI GPT-4 Vision ativado para validação cruzada")
            except Exception as e:
                logger.warning(f"⚠️ OpenAI não disponível: {e}")
        
        self.current_year = datetime.now().year
    
    async def extract_with_cross_validation(
        self, 
        image_bytes: bytes, 
        pet_id: str,
        use_cross_validation: bool = True
    ) -> Dict[str, Any]:
        """
        Extrai dados usando validação cruzada entre múltiplas IAs
        
        Args:
            image_bytes: Imagem em bytes
            pet_id: ID do pet
            use_cross_validation: Se True, usa múltiplas IAs e valida resultados
        
        Returns:
            Dict com resultados validados e score de confiança
        """
        
        if not use_cross_validation or not self.has_openai:
            # Fallback para Gemini apenas
            logger.info("🔄 Usando apenas Gemini (validação cruzada desabilitada)")
            return await self._extract_gemini_only(image_bytes, pet_id)
        
        # Processar com ambas as IAs em paralelo
        logger.info("🔄 Iniciando validação cruzada (Gemini + GPT-4 Vision)...")
        
        try:
            gemini_task = self._extract_with_gemini(image_bytes, pet_id)
            gpt4_task = self._extract_with_gpt4(image_bytes, pet_id)
            
            gemini_result, gpt4_result = await asyncio.gather(
                gemini_task, 
                gpt4_task,
                return_exceptions=True
            )
            
            # Verificar erros
            if isinstance(gemini_result, Exception):
                logger.error(f"❌ Erro no Gemini: {gemini_result}")
                if not isinstance(gpt4_result, Exception):
                    logger.info("✅ Usando resultado do GPT-4 apenas")
                    return self._format_result(gpt4_result, "gpt-4-vision", 0.80)
                raise gemini_result
                
            if isinstance(gpt4_result, Exception):
                logger.warning(f"⚠️ Erro no GPT-4: {gpt4_result}")
                logger.info("✅ Usando resultado do Gemini apenas")
                return self._format_result(gemini_result, "gemini", 0.85)
            
            # Comparar e validar resultados
            validated_result = self._compare_and_validate(gemini_result, gpt4_result, pet_id)
            
            return validated_result
            
        except Exception as e:
            logger.error(f"❌ Erro na validação cruzada: {e}", exc_info=True)
            # Fallback para Gemini apenas
            return await self._extract_gemini_only(image_bytes, pet_id)
    
    async def _extract_with_gemini(self, image_bytes: bytes, pet_id: str, pass_number: int = 1) -> Dict[str, Any]:
        """Extrai dados usando Gemini"""
        
        prompt = self._get_extraction_prompt(pass_number)
        
        try:
            # Preparar imagem para Gemini
            import PIL.Image
            import io
            image = PIL.Image.open(io.BytesIO(image_bytes))
            
            # Enviar para Gemini — sem bound aqui, um hang do provedor
            # prendia a tela "Analisando com IA..." indefinidamente (achado
            # em auditoria pré-lançamento; identify-product-photo já usava
            # esse mesmo padrão de timeout, carteirinha de vacina não).
            response = await asyncio.to_thread(
                self.gemini_model.generate_content,
                [prompt, image],
                request_options={"timeout": 30},
            )
            
            # Parsear resposta JSON
            response_text = response.text.strip()
            
            # Remover markdown code blocks se presentes
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            response_text = response_text.strip()
            
            # Tentar parsear diretamente
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ JSON inválido do Gemini, tentando limpar: {e}")
                
                # Tentar extrair apenas o JSON usando regex
                import re
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    try:
                        result = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        # Se ainda falhar, tentar remover comentários e trailing commas
                        cleaned_text = re.sub(r',\s*}', '}', json_match.group(0))  # Remove trailing commas
                        cleaned_text = re.sub(r',\s*]', ']', cleaned_text)  # Remove trailing commas in arrays
                        result = json.loads(cleaned_text)
                else:
                    logger.error(f"❌ Resposta do Gemini não contém JSON válido: {response_text[:200]}")
                    raise e
            
            logger.info(
                f"✅ Gemini: {len(result.get('vaccines', []))} vacinas encontradas"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erro ao processar com Gemini: {e}")
            raise
    
    async def _extract_with_gpt4(self, image_bytes: bytes, pet_id: str) -> Dict[str, Any]:
        """Extrai dados usando GPT-4 Vision"""
        
        if not self.openai_client:
            raise Exception("OpenAI client não disponível")
        
        prompt = self._get_extraction_prompt()
        
        try:
            # Converter imagem para base64
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            
            # Chamar GPT-4 Vision
            response = await self.openai_client.chat.completions.create(
                model="gpt-4-turbo",  # ou gpt-4-vision-preview
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4000,
                temperature=0.1  # Baixa temperatura para consistência
            )
            
            # Parsear resposta
            content = response.choices[0].message.content
            
            # Remover markdown se presente
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            content = content.strip()
            
            # Tentar parsear diretamente
            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ JSON inválido do GPT-4, tentando limpar: {e}")
                
                # Tentar extrair apenas o JSON usando regex
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    try:
                        result = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        # Se ainda falhar, tentar remover comentários e trailing commas
                        cleaned_text = re.sub(r',\s*}', '}', json_match.group(0))
                        cleaned_text = re.sub(r',\s*]', ']', cleaned_text)
                        result = json.loads(cleaned_text)
                else:
                    logger.error(f"❌ Resposta do GPT-4 não contém JSON válido: {content[:200]}")
                    raise e
            
            logger.info(
                f"✅ GPT-4: {len(result.get('vaccines', []))} vacinas encontradas"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erro ao processar com GPT-4: {e}")
            raise
    
    def _post_process_and_fix(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pós-processamento: valida e corrige automaticamente erros comuns
        """
        vaccines = result.get("vaccines", [])
        fixed_count = 0
        
        for vaccine in vaccines:
            original_name = vaccine.get("name", "")
            commercial_brand = vaccine.get("commercial_brand", "")
            
            # CORREÇÃO 1: Tipo igual ao nome comercial (erro comum)
            if original_name == commercial_brand and commercial_brand:
                # Tentar classificar pela marca
                fixed_type = self._classify_vaccine_type(commercial_brand)
                if fixed_type != original_name:
                    logger.warning(f"🔧 Corrigido tipo: '{original_name}' → '{fixed_type}'")
                    vaccine["name"] = fixed_type
                    fixed_count += 1
            
            # CORREÇÃO 2: Validar datas
            date_app = vaccine.get("date")
            date_rev = vaccine.get("next_date")
            
            if date_app and date_rev:
                try:
                    from datetime import datetime
                    dt_app = datetime.fromisoformat(date_app)
                    dt_rev = datetime.fromisoformat(date_rev)
                    
                    # Se data de aplicação > revacina, inverter
                    if dt_app > dt_rev:
                        logger.warning(f"🔧 Datas invertidas para {commercial_brand}: {date_app} ↔ {date_rev}")
                        vaccine["date"], vaccine["next_date"] = date_rev, date_app
                        fixed_count += 1
                        
                    # Se revacina é muito próxima da aplicação (< 15 dias), provavelmente erro
                    days_diff = (dt_rev - dt_app).days
                    if 0 < days_diff < 15:
                        logger.warning(f"⚠️ Revacina muito próxima da aplicação ({days_diff} dias) para {commercial_brand}")
                        # Adicionar 1 ano à revacina (aproximadamente 365 dias)
                        new_rev = dt_app + timedelta(days=365)
                        vaccine["next_date"] = new_rev.strftime("%Y-%m-%d")
                        logger.warning(f"🔧 Ajustado revacina para: {vaccine['next_date']}")
                        fixed_count += 1
                        
                except (ValueError, TypeError) as e:
                    logger.warning(f"⚠️ Erro ao validar datas: {e}")
        
        if fixed_count > 0:
            logger.info(f"✅ Pós-processamento: {fixed_count} correções aplicadas")
        
        return result
    
    def _classify_vaccine_type(self, commercial_brand: str) -> str:
        """
        Classifica o tipo de vacina baseado na marca comercial
        """
        brand_lower = commercial_brand.lower()
        
        # Antirrábicas
        if any(word in brand_lower for word in ['raiva', 'rabies', 'rabisin', 'canigen b', 'anti-rábica', 'antirrábica']):
            return "Raiva (Antirrábica)"
        
        # Leptospirose
        if 'lepto' in brand_lower and 'plus' not in brand_lower:
            return "Leptospirose"
        
        # Múltiplas (V5, V8, V10)
        if any(word in brand_lower for word in ['vanguard', 'duramune', 'dhpp', 'nobivac canine', 'nobivac dh', 'canigen m']):
            # Tentar identificar o número de valências
            if any(word in brand_lower for word in ['10', 'cvk/4l', 'max 5']):
                return "Vacina Múltipla (V10)"
            elif any(word in brand_lower for word in ['8', 'cvk/ml', 'plus 5']):
                return "Vacina Múltipla (V8)"
            else:
                return "Vacina Múltipla (V5)"
        
        # Gripe canina
        if any(word in brand_lower for word in ['gripe', 'bordetella', 'parainfluenza', 'kc']):
            return "Gripe Canina"
        
        # Giardíase
        if 'giardia' in brand_lower or 'giardi' in brand_lower:
            return "Giardíase"
        
        # Leishmaniose
        if 'leish' in brand_lower:
            return "Leishmaniose"
        
        # Se não conseguir classificar, retornar genérico
        return f"Vacina ({commercial_brand})"
    
    async def _extract_gemini_only(self, image_bytes: bytes, pet_id: str) -> Dict[str, Any]:
        """Extração usando apenas Gemini com prompt otimizado"""
        
        result = await self._extract_with_gemini(image_bytes, pet_id, pass_number=1)
        
        # Aplicar validação e correção automática
        result = self._post_process_and_fix(result)
        
        return self._format_result(result, "gemini", 0.85)
    
    def _compare_and_validate(
        self, 
        gemini_result: Dict[str, Any], 
        gpt4_result: Dict[str, Any],
        pet_id: str
    ) -> Dict[str, Any]:
        """
        Compara resultados de ambas IAs e gera consenso validado
        
        Returns:
            Resultado consolidado com score de confiança baseado em concordância
        """
        
        gemini_vaccines = gemini_result.get("vaccines", [])
        gpt4_vaccines = gpt4_result.get("vaccines", [])
        
        logger.info(f"🔍 Comparando: Gemini={len(gemini_vaccines)} vs GPT-4={len(gpt4_vaccines)}")
        
        # Se contagens diferentes, priorizar quem encontrou mais
        if len(gemini_vaccines) != len(gpt4_vaccines):
            diff = abs(len(gemini_vaccines) - len(gpt4_vaccines))
            logger.warning(
                f"⚠️ Divergência na contagem: diferença de {diff} vacinas"
            )
        
        # Mesclar resultados priorizando consenso
        validated_vaccines = self._merge_vaccine_records(
            gemini_vaccines, 
            gpt4_vaccines
        )
        
        # Calcular score de concordância
        agreement_score = self._calculate_agreement_score(
            gemini_vaccines,
            gpt4_vaccines,
            validated_vaccines
        )
        
        # Aplicar validações de sanidade
        validated_vaccines = self._apply_sanity_checks(validated_vaccines)
        
        logger.info(
            f"✅ Validação cruzada completa: {len(validated_vaccines)} vacinas "
            f"(concordância: {agreement_score:.1%})"
        )
        
        return {
            "vaccines": validated_vaccines,
            "overall_confidence": agreement_score,
            "cross_validation_used": True,
            "engines_compared": ["gemini-1.5-flash", "gpt-4-vision"],
            "gemini_count": len(gemini_vaccines),
            "gpt4_count": len(gpt4_vaccines),
            "consensus_count": len(validated_vaccines),
            "raw_gemini": gemini_result,
            "raw_gpt4": gpt4_result
        }
    
    def _merge_vaccine_records(
        self, 
        gemini_vaccines: List[Dict],
        gpt4_vaccines: List[Dict]
    ) -> List[Dict]:
        """
        Mescla registros de vacinas de ambas as IAs
        Prioriza consenso e usa "melhor" valor quando há divergência
        """
        
        merged = []
        
        # Criar índice GPT-4 por similaridade de nome
        gpt4_by_name = {}
        for v in gpt4_vaccines:
            name = v.get("name", "").lower().strip()
            if name:
                gpt4_by_name[name] = v
        
        used_gpt4_indices = set()
        
        # Para cada vacina do Gemini, tentar encontrar match no GPT-4
        for gemini_vac in gemini_vaccines:
            gemini_name = gemini_vac.get("name", "").lower().strip()
            
            # Buscar match por similaridade de nome
            best_match = None
            best_similarity = 0.0
            best_gpt4_name = None
            
            for gpt4_name, gpt4_vac in gpt4_by_name.items():
                if gpt4_name in used_gpt4_indices:
                    continue
                    
                # Calcular similaridade
                similarity = SequenceMatcher(
                    None, 
                    gemini_name, 
                    gpt4_name
                ).ratio()
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = gpt4_vac
                    best_gpt4_name = gpt4_name
            
            # Se encontrou match razoável (>60% similaridade)
            if best_match and best_similarity > 0.6:
                used_gpt4_indices.add(best_gpt4_name)
                # Mesclar dados priorizando consenso
                merged_record = self._merge_single_record(
                    gemini_vac, 
                    best_match,
                    best_similarity
                )
                merged.append(merged_record)
            else:
                # Sem match - adicionar Gemini com confiança reduzida
                gemini_vac_copy = gemini_vac.copy()
                if "field_confidence" not in gemini_vac_copy:
                    gemini_vac_copy["field_confidence"] = {}
                gemini_vac_copy["field_confidence"]["source"] = "gemini_only"
                gemini_vac_copy["cross_validation_agreement"] = 0.5  # Baixa - só uma IA viu
                merged.append(gemini_vac_copy)
        
        # Adicionar vacinas do GPT-4 que não tiveram match
        for gpt4_name, gpt4_vac in gpt4_by_name.items():
            if gpt4_name not in used_gpt4_indices:
                gpt4_vac_copy = gpt4_vac.copy()
                if "field_confidence" not in gpt4_vac_copy:
                    gpt4_vac_copy["field_confidence"] = {}
                gpt4_vac_copy["field_confidence"]["source"] = "gpt4_only"
                gpt4_vac_copy["cross_validation_agreement"] = 0.5  # Baixa
                merged.append(gpt4_vac_copy)
        
        return merged
    
    def _merge_single_record(
        self,
        gemini_rec: Dict,
        gpt4_rec: Dict,
        similarity: float
    ) -> Dict:
        """Mescla um único registro escolhendo os melhores valores"""
        
        merged = {}
        
        # Nome: usar o mais completo
        gemini_name = gemini_rec.get("name", "")
        gpt4_name = gpt4_rec.get("name", "")
        merged["name"] = gemini_name if len(gemini_name) > len(gpt4_name) else gpt4_name
        
        # Marca comercial
        gemini_brand = gemini_rec.get("commercial_brand", "")
        gpt4_brand = gpt4_rec.get("commercial_brand", "")
        if gemini_brand and gpt4_brand:
            # Se ambos concordam (similaridade alta)
            brand_similarity = SequenceMatcher(None, gemini_brand, gpt4_brand).ratio()
            if brand_similarity > 0.8:
                merged["commercial_brand"] = gemini_brand
                merged["brand_agreement"] = True
            else:
                merged["commercial_brand"] = f"{gemini_brand} ou {gpt4_brand}"
                merged["brand_agreement"] = False
        else:
            merged["commercial_brand"] = gemini_brand or gpt4_brand
            merged["brand_agreement"] = False
        
        # Datas: priorizar consenso
        merged["date"] = self._resolve_date_field(
            gemini_rec.get("date"),
            gpt4_rec.get("date"),
            "date"
        )
        
        merged["next_date"] = self._resolve_date_field(
            gemini_rec.get("next_date"),
            gpt4_rec.get("next_date"),
            "next_date"
        )
        
        # Veterinário
        gemini_vet = gemini_rec.get("veterinarian", "")
        gpt4_vet = gpt4_rec.get("veterinarian", "")
        merged["veterinarian"] = gemini_vet or gpt4_vet
        
        # Componentes
        gemini_comp = gemini_rec.get("components", [])
        gpt4_comp = gpt4_rec.get("components", [])
        merged["components"] = list(set(gemini_comp + gpt4_comp))  # União sem duplicatas
        
        # Notas
        merged["notes"] = gemini_rec.get("notes") or gpt4_rec.get("notes")
        
        # Confiança por campo
        gemini_conf = gemini_rec.get("field_confidence", {})
        gpt4_conf = gpt4_rec.get("field_confidence", {})
        
        merged["field_confidence"] = {
            "name": (gemini_conf.get("name", 0.8) + gpt4_conf.get("name", 0.8)) / 2,
            "date": (gemini_conf.get("date", 0.8) + gpt4_conf.get("date", 0.8)) / 2,
            "next_date": (gemini_conf.get("next_date", 0.8) + gpt4_conf.get("next_date", 0.8)) / 2,
            "veterinarian": (gemini_conf.get("veterinarian", 0.7) + gpt4_conf.get("veterinarian", 0.7)) / 2,
            "source": "consensus"
        }
        
        # Score de concordância individual
        merged["cross_validation_agreement"] = similarity
        
        return merged
    
    def _resolve_date_field(
        self,
        gemini_date: Optional[str],
        gpt4_date: Optional[str],
        field_name: str
    ) -> Optional[str]:
        """
        Resolve data entre 2 fontes priorizando consenso
        
        Returns:
            Data escolhida ou None
        """
        
        # Se ambas None, retornar None
        if not gemini_date and not gpt4_date:
            return None
        
        # Se só uma tem valor, usar essa
        if not gemini_date:
            return gpt4_date
        if not gpt4_date:
            return gemini_date
        
        # Se ambas têm valor, verificar se concordam (mesmo dia/mês/ano ou próximo)
        try:
            gemini_dt = datetime.fromisoformat(gemini_date)
            gpt4_dt = datetime.fromisoformat(gpt4_date)
            
            # Se exatamente iguais
            if gemini_date == gpt4_date:
                return gemini_date
            
            # Se diferença pequena (até 3 dias) - provável erro de leitura
            diff_days = abs((gemini_dt - gpt4_dt).days)
            if diff_days <= 3:
                # Retornar a mais recente (para data de aplicação) ou mais antiga (revacina)
                if field_name == "date":
                    return max(gemini_date, gpt4_date)  # Mais recente
                else:
                    return min(gemini_date, gpt4_date)  # Mais antiga
            
            # Divergência significativa - retornar None para revisão manual
            logger.warning(
                f"⚠️ Divergência em {field_name}: Gemini={gemini_date} vs GPT-4={gpt4_date}"
            )
            return None
            
        except (ValueError, TypeError):
            # Formato inválido - retornar primeira válida
            return gemini_date if gemini_date else gpt4_date
    
    def _calculate_agreement_score(
        self,
        gemini_vaccines: List[Dict],
        gpt4_vaccines: List[Dict],
        merged_vaccines: List[Dict]
    ) -> float:
        """
        Calcula score de concordância entre IAs
        
        Returns:
            Float entre 0.0 e 1.0
        """
        
        # Componentes do score:
        # 1. Concordância na contagem (30%)
        count_agreement = 1.0 - abs(len(gemini_vaccines) - len(gpt4_vaccines)) / max(
            len(gemini_vaccines), len(gpt4_vaccines), 1
        )
        count_score = count_agreement * 0.3
        
        # 2. Concordância individual dos registros (70%)
        if not merged_vaccines:
            return count_score
        
        individual_agreements = [
            v.get("cross_validation_agreement", 0.5) 
            for v in merged_vaccines
        ]
        avg_individual = sum(individual_agreements) / len(individual_agreements)
        individual_score = avg_individual * 0.7
        
        total_score = count_score + individual_score
        
        return total_score
    
    def _apply_sanity_checks(self, vaccines: List[Dict]) -> List[Dict]:
        """
        Aplica validações de sanidade aos dados extraídos
        
        Verificações:
        - Datas de aplicação não podem ser futuras (> hoje + 7 dias)
        - Data de revacina deve ser > data de aplicação
        - Anos ambíguos (2026+ para aplicações antigas)
        """
        
        validated = []
        today = datetime.now().date()
        max_future = today + timedelta(days=7)
        
        for vac in vaccines:
            vac_copy = vac.copy()
            issues = []
            
            # Verificar data de aplicação
            date_str = vac.get("date")
            if date_str:
                try:
                    date_obj = datetime.fromisoformat(date_str).date()
                    
                    # Data no futuro?
                    if date_obj > max_future:
                        issues.append(f"aplicacao_futura: {date_str}")
                        logger.warning(f"⚠️ Data de aplicação futura: {date_str}")
                        
                        # Tentar corrigir anos ambíguos (2026 → 2016, etc)
                        if date_obj.year > self.current_year + 1:
                            corrected_year = self._try_fix_ambiguous_year(date_obj.year)
                            if corrected_year != date_obj.year:
                                corrected_date = date_obj.replace(year=corrected_year)
                                vac_copy["date"] = corrected_date.isoformat()
                                vac_copy["date_corrected"] = True
                                logger.info(
                                    f"✅ Ano corrigido: {date_obj.year} → {corrected_year}"
                                )
                    
                except (ValueError, TypeError):
                    issues.append(f"data_invalida: {date_str}")
            
            # Verificar data de revacina
            next_date_str = vac.get("next_date")
            if next_date_str and date_str:
                try:
                    next_date_obj = datetime.fromisoformat(next_date_str).date()
                    date_obj = datetime.fromisoformat(date_str).date()
                    
                    # Revacina antes de aplicação?
                    if next_date_obj < date_obj:
                        issues.append("revacina_antes_aplicacao")
                        logger.warning(
                            f"⚠️ Data revacina < aplicação: {next_date_str} < {date_str}"
                        )
                        # Inverter
                        vac_copy["date"] = next_date_str
                        vac_copy["next_date"] = date_str
                        vac_copy["dates_swapped"] = True
                    
                except (ValueError, TypeError):
                    pass
            
            # Adicionar flags de issues
            if issues:
                if "validation_issues" not in vac_copy:
                    vac_copy["validation_issues"] = []
                vac_copy["validation_issues"].extend(issues)
                vac_copy["needs_review"] = True
            
            validated.append(vac_copy)
        
        return validated
    
    def _try_fix_ambiguous_year(self, year: int) -> int:
        """Tenta corrigir anos ambíguos (2026→2016, 2029→2019)"""
        
        if year <= self.current_year + 1:
            return year
        
        # Tentar subtrair 10, 20, 30 anos
        for delta in [10, 20, 30]:
            candidate = year - delta
            if 2000 <= candidate <= self.current_year:
                return candidate
        
        return year
    
    def _format_result(
        self,
        raw_result: Dict[str, Any],
        engine: str,
        confidence: float
    ) -> Dict[str, Any]:
        """Formata resultado de uma única engine"""
        
        return {
            "vaccines": raw_result.get("vaccines", []),
            "overall_confidence": confidence,
            "cross_validation_used": False,
            "engine": engine,
            "raw_text": raw_result.get("raw_text", "")
        }
    
    def _merge_vaccine_results(self, vaccines1: List[Dict], vaccines2: List[Dict]) -> List[Dict]:
        """Mescla resultados de múltiplas passadas removendo duplicatas"""
        
        merged = list(vaccines1)  # Começar com todas da passada 1
        
        for vac2 in vaccines2:
            is_duplicate = False
            
            # Verificar se é duplicata comparando nome, data e veterinário
            for vac1 in vaccines1:
                # Comparação fuzzy de nomes
                name1 = (vac1.get('name') or vac1.get('commercial_brand') or '').lower()
                name2 = (vac2.get('name') or vac2.get('commercial_brand') or '').lower()
                
                date1 = vac1.get('date', '')
                date2 = vac2.get('date', '')
                
                vet1 = (vac1.get('veterinarian') or '').lower()[:20]
                vet2 = (vac2.get('veterinarian') or '').lower()[:20]
                
                # É duplicata se nome similar E mesma data
                if date1 == date2 and date1:  # Mesma data
                    # Verificar similaridade de nome
                    if name1 in name2 or name2 in name1 or self._similar_strings(name1, name2):
                        is_duplicate = True
                        logger.debug(f"🔄 Duplicata: {name2} em {date2}")
                        break
            
            # Se não é duplicata, adicionar
            if not is_duplicate:
                merged.append(vac2)
                logger.info(f"➕ Nova vacina: {vac2.get('commercial_brand')} em {vac2.get('date')}")
        
        return merged
    
    def _similar_strings(self, s1: str, s2: str, threshold: float = 0.7) -> bool:
        """Verifica se duas strings são similares (fuzzy match simples)"""
        if not s1 or not s2:
            return False
        
        # Similaridade simples por palavras comuns
        words1 = set(s1.split())
        words2 = set(s2.split())
        
        if not words1 or not words2:
            return False
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        similarity = len(intersection) / len(union) if union else 0
        return similarity >= threshold
    
    def _get_extraction_prompt(self, pass_number: int = 1) -> str:
        """Retorna prompt otimizado para extração de vacinas (varia por passada)"""
        
        if pass_number == 2:
            # PASSADA 2: Foco em adesivos difíceis
            return self._get_difficult_vaccines_prompt()
        
        # PASSADA 1: Prompt padrão completo
        
        return """
Você é um Especialista Veterinário Global em OCR de Carteirinhas de Vacinação.

🎯 MISSÃO: Extrair TODAS as vacinas desta imagem com precisão máxima.

⚓ ETAPA 1 - VARREDURA SISTEMÁTICA (LINHA POR LINHA):

🔬 MÉTODO DE VARREDURA OBRIGATÓRIO:
1. Divida a imagem mentalmente em uma GRADE
2. Varra cada LINHA da imagem de cima para baixo
3. Em cada linha, varra da ESQUERDA para DIREITA
4. Para cada adesivo/etiqueta que encontrar, anote:
   - Nome da marca (Vanguard, Nobivac, Canigen, Duramune, etc.)
   - Data de aplicação
   - Data de revacina
   - Veterinário

📊 CHECKLIST DE MARCAS (marque ✓ quando encontrar):
- [ ] Vanguard Plus (quantos? ____)
- [ ] Nobivac Rabies/Raiva (quantos? ____)
- [ ] Nobivac Canine (quantos? ____)
- [ ] Canigen (B, L, DHPPi, etc - quantos? ____)
- [ ] Duramune (quantos? ____)
- [ ] Rabisin (quantos? ____)
- [ ] Outras marcas (quantas? ____)

🔍 ATENÇÃO ESPECIAL - CANIGEN É MUITO IMPORTANTE:

🔴 **CANIGEN vs NOBIVAC** (NÃO CONFUNDIR - SÃO MARCAS DIFERENTES!):

**CANIGEN** (marca francesa):
- Procure especificamente por texto "CANIGEN" ou "Canigen"
- Variações: "Canigen B", "Canigen R", "Canigen L", "Canigen DHPPi"
- Canigen B ou Canigen R = Raiva/Antirrábica (logos similares)
- Canigen L = Leptospirose
- Logo: geralmente azul/branco com texto "Canigen"
- **SE VÊ "CANIGEN" ESCRITO** → commercial_brand DEVE incluir "Canigen"!

**NOBIVAC** (marca diferente):
- "Nobivac Rabies", "Nobivac Canine", "Nobivac Lepto"
- Logo diferente de Canigen!

⚠️ **ERRO CRÍTICO A EVITAR:**
❌ NÃO confundir "Canigen R" com "Nobivac Canine 1-Dx"
❌ São marcas COMPLETAMENTE DIFERENTES com logos diferentes!
✅ Se lê "C-A-N-I-G-E-N" → É Canigen, não Nobivac!

🔍 **MÚLTIPLAS VACINAS NA MESMA DATA:**
- Data 05/11/2021: Procure 2 vacinas (ex: Vanguard + Canigen R)
- Data 16/11/2022: Procure 2-3 vacinas (ex: Vanguard + Canigen B + Canigen R)
- Se você vê data "05/11/2021" aparecer 2 vezes = 2 vacinas diferentes
- Se você vê data "16/11/2022" aparecer 3 vezes = 3 vacinas diferentes
- **NUNCA ignore a 2ª ou 3ª vacina de uma mesma data!**

⚠️ REGRA CRÍTICA: Se você encontrar a MESMA DATA mais de uma vez, são vacinas DIFERENTES!
Exemplo: Se "05/11/2021" aparece 2 vezes → detectar AMBAS (ex: Vanguard + Canigen)

Se você contar 15 adesivos, deve retornar EXATAMENTE 15 registros no JSON.

📋 ETAPA 2 - CLASSIFICAÇÃO CORRETA:

⚠️ IMPORTANTE: "name" é o TIPO/CATEGORIA da vacina, NÃO a marca comercial!

TIPOS DE VACINA:
1. "Vacina Múltipla (V5)" - Para DHPPi
2. "Vacina Múltipla (V8)" - Para DHPPi + Lepto
3. "Vacina Múltipla (V10)" - Para DHPPi + Lepto + Corona
4. "Raiva (Antirrábica)" - Para todas as antirrábicas
5. "Leptospirose" - Para Lepto isolada
6. "Gripe Canina" - Para Parainfluenza/Bordetella
7. "Giardíase" - Para Giardia
8. "Leishmaniose" - Para Leishmania

MARCAS COMERCIAIS (vai em "commercial_brand"):
- Vanguard Plus 5, Duramune, Nobivac, Rabisin, Canigen, etc.

EXEMPLOS CORRETOS:
✅ Vanguard Plus 5 → name: "Vacina Múltipla (V5)", commercial_brand: "Vanguard Plus 5"
✅ Nobivac Lepto → name: "Leptospirose", commercial_brand: "Nobivac Lepto"
✅ Rabisin → name: "Raiva (Antirrábica)", commercial_brand: "Rabisin"
✅ Nobivac Rabies → name: "Raiva (Antirrábica)", commercial_brand: "Nobivac Rabies"
✅ Canigen B → name: "Raiva (Antirrábica)", commercial_brand: "Canigen B"
✅ Canigen R → name: "Raiva (Antirrábica)", commercial_brand: "Canigen R"
✅ Canigen L → name: "Leptospirose", commercial_brand: "Canigen L"
✅ Nobivac Canine 1-Dx → name: "Vacina Múltipla (V5)", commercial_brand: "Nobivac Canine 1-Dx"

❌ ERRADO: Confundir Canigen com Nobivac
❌ Se o adesivo tem escrito "CANIGEN" → NÃO pode retornar "Nobivac" no commercial_brand!

❌ ERRADO: name: "Nobivac Canine 1-Dx" (não deve repetir a marca no tipo!)

CÓDIGOS NOS ADESIVOS:
- D/Distemper → Cinomose
- H/Hepatitis → Hepatite/Adenovírus
- P/Parvo → Parvovirose
- Pi/Parainfluenza → Parainfluenza
- L/Lepto → Leptospirose
- R/Rabies/Raiva → Raiva
- C/Corona → Coronavírus
- B/Bordetella → Bordetelose
- G/Giardia → Giárdia

📅 ETAPA 3 - LEITURA PRECISA DE DATAS:

⚠️ CUIDADO: Leia devagar linha por linha!

FORMATO: Sempre retornar YYYY-MM-DD

FORMATOS DE ENTRADA:
- 15/03/2024 → "2024-03-15"
- 15.03.24 → "2024-03-15"
- 15 Mar 24 → "2024-03-15"
- 150324 → "2024-03-15"

CORREÇÃO OCR COMUM:
- l, I, | → 1
- O, o → 0
- S → 5
- G → 6
- Z → 2
- B → 8

VALIDAÇÃO DE ANOS:
- Se ler "2026" mas a data parece antiga (foto amarelada), provavelmente é 2016 ou 2019
- Anos futuros (> hoje + 30 dias) na aplicação = ERRO, revisar leitura
- Se data_aplicacao > data_revacina = ERRO lógico, corrigir

ORDEM DAS COLUNAS:
Geralmente: [Data Aplicação] [Nome Vacina] [Lote] [Data Revacina] [Veterinário]
Mas SEMPRE verificar visualmente a posição das datas!

✅ FORMATO JSON:

{
  "total_encontrado": 8,
  "vaccines": [
    {
      "name": "Leptospirose",
      "commercial_brand": "Nobivac Lepto",
      "components": ["Leptospirose"],
      "date": "2024-03-15",
      "next_date": "2025-03-15",
      "veterinarian": "Dr. João Silva",
      "notes": "Lote ABC123",
      "field_confidence": {
        "name": 0.95,
        "date": 0.90,
        "next_date": 0.85,
        "veterinarian": 0.80
      }
    }
  ],
  "overall_confidence": 0.88,
  "raw_text": "Texto detectado"
}

🚫 REGRAS CRÍTICAS:
1. total_encontrado DEVE = len(vaccines) - conte antes de extrair!
2. "name" = TIPO da vacina, "commercial_brand" = marca (nunca misturar!)
3. NUNCA inventar datas - use null se ilegível
4. NUNCA pular registros - varrer imagem completa
5. Se data_aplicacao > data_revacina = ERRO, revisar
6. Datas futuras na aplicação (> hoje + 30 dias) = provavelmente erro OCR
7. Verificar DUAS VEZES as datas antes de retornar

Retorne APENAS o JSON, sem texto adicional.
"""
    
    def _get_difficult_vaccines_prompt(self) -> str:
        """Prompt específico para segunda passada focando em vacinas difíceis"""
        
        return """
Você é um Especialista em OCR de Vacinas - SEGUNDA PASSADA (Foco em Adesivos Difíceis)

🎯 MISSÃO: Encontrar vacinas que podem ter sido PERDIDAS na primeira análise

🔍 PROCURE ESPECIFICAMENTE POR:

1. **ADESIVOS PEQUENOS ou SOBREPOSTOS**
   - Adesivos parcialmente cobertos por outros
   - Adesivos nas bordas da imagem
   - Adesivos com baixo contraste
   - Texto pequeno ou borrado

2. **MÚLTIPLAS VACINAS NA MESMA DATA**
   ⚠️ CRÍTICO: É MUITO COMUM aplicar 2-3 vacinas no mesmo dia!
   
   Exemplos comuns:
   - 05/11/2021: Vanguard Plus + Canigen (2 vacinas)
   - 16/11/2022: Vanguard Plus + Canigen B (2 vacinas)
   - 30/11/2023: Nobivac Raiva + Vanguard Plus (2 vacinas)
   
   ⚠️ Se você vê a MESMA DATA aparecer múltiplas vezes, são vacinas DIFERENTES!

3. **MARCAS ESPECÍFICAS A PROCURAR:**
   - **Canigen** (B, L, DHPPi, etc) - frequentemente perdida!
   - **Nobivac Lepto** - pode estar junto com outra vacina
   - **Duramune** - pode estar sobreposto
   - Qualquer adesivo que pareça "escondido"

4. **PADRÕES VISUAIS:**
   - Linhas da tabela com múltiplos adesivos
   - Adesivos colados um em cima do outro
   - Áreas com escrita manuscrita
   - Cantos e bordas da imagem

📋 CLASSIFICAÇÃO:

TIPOS DE VACINA:
- "Vacina Múltipla (V5/V8/V10)" - Para DHPPi, DHPPi+Lepto, etc
- "Raiva (Antirrábica)" - Para TODAS antirrábicas (Nobivac Rabies, Canigen B, Rabisin, etc)
- "Leptospirose" - Para Canigen L, Nobivac Lepto, etc
- "Gripe Canina", "Giardíase", "Leishmaniose"

MARCAS COMERCIAIS (campo "commercial_brand"):
- Canigen B → name: "Raiva (Antirrábica)", commercial_brand: "Canigen B"
- Canigen L → name: "Leptospirose", commercial_brand: "Canigen L"
- Nobivac Canine 1-Dx → name: "Vacina Múltipla (V5)", commercial_brand: "Nobivac Canine 1-Dx"

✅ FORMATO JSON:

{
  "total_encontrado": X,
  "vaccines": [
    {
      "name": "Raiva (Antirrábica)",
      "commercial_brand": "Canigen B",
      "date": "2022-11-16",
      "next_date": "2023-11-16",
      "veterinarian": "Nome do Vet",
      "field_confidence": {
        "name": 0.90,
        "date": 0.85
      }
    }
  ],
  "overall_confidence": 0.85
}

🚨 REGRAS CRÍTICAS:
1. IGNORAR vacinas que claramente JÁ foram detectadas na primeira passada
2. FOCAR em adesivos pequenos, sobrepostos, difíceis
3. PROCURAR especificamente por "Canigen" em todas as suas variações
4. Se vê mesma data 2x → são 2 vacinas diferentes!
5. NÃO inventar - só reportar o que VÊ

Retorne APENAS o JSON com as vacinas ADICIONAIS encontradas.
"""

