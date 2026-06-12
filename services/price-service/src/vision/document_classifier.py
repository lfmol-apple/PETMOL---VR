import google.generativeai as genai
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class DocumentClassifier:
    """Classificador de documentos com OCR focado em saúde pet."""

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-pro') # Usando pro para tarefas de raciocínio mais complexas

    async def classify_document(self, image_bytes: bytes) -> Dict[str, Any]:
        """Classifica e extrai metadados do documento enviado."""
        prompt = """
Você é um Especialista em Inteligência Documental Veterinária.
Sua missão é realizar OCR e analisar esta imagem para entender do que se trata o documento e classificá-lo corretamente.

Leia o documento, identifique sobre o que ele trata, e extraia as seguintes informações de forma estruturada:

{
  "tipo_documento": "exame_sangue | receita_simples | receita_controle_especial | laudo_cirurgico | comprovante_banho_tosa | nota_fiscal | carteira_vacinacao | rg_pet | foto_pet",
  "categoria_aba": "exames | receitas | laudos | comprovantes | fotos | vacinas",
  "titulo_identificado": "Título ou nome principal do documento",
  "data_documento": "YYYY-MM-DD (se houver, caso contrário, null)",
  "clinica_laboratorio": {
    "nome": "Nome do local",
    "endereco": "Endereço completo",
    "telefone": "Telefone",
    "cnpj": "CNPJ se visível"
  },
  "medico_veterinario": {
    "nome": "Nome do Vet",
    "crmv": "Número do CRMV e Estado (ex: CRMV-SP 12345)"
  },
  "conteudo_resumo": "Um breve parágrafo resumindo os principais pontos (ex: Exame de sangue indicando plaquetas normais, presença de leve anemia. / Prescrição de antibiótico X por 7 dias.)",
  "contem_selo_vacina": true ou false,
  "contem_assinatura": true ou false,
  "confianca_leitura": de 0.0 a 1.0 (onde 1.0 é certeza absoluta)
}

Diretrizes de Classificação (categoria_aba):
- "exames": Exames de sangue, fezes, urina, raio-x, ultrassom, ecocardiograma, etc.
- "receitas": Prescrições médicas, receituários simples ou de controle especial, orientação de uso de medicamentos.
- "laudos": Laudos neurológicos, cirúrgicos, atestados de saúde, termos de consentimento, histórico clínico, prontuários.
- "comprovantes": Recibos, notas fiscais, cupons fiscais, comprovantes de pagamento (veterinário, banho e tosa, petshop).
- "fotos": Fotos exclusivas do pet, selfie com o pet, ou documentos mistos não médicos como "RG de Pet" lúdicos de petshops.
- "vacinas": Qualquer página ou trecho de carteirinha de vacinação, especialmente se contiver selos de vacina (contem_selo_vacina=true).

Responda APENAS com um JSON válido, sem comentários adicionais ou formatadores markdown fora do bloco.
"""
        # Call Gemini
        try:
            mime = "application/pdf" if image_bytes.startswith(b"%PDF") else "image/jpeg"
            response = self.model.generate_content([
                prompt,
                {"mime_type": mime, "data": image_bytes}
            ])
            text = response.text
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            
            return json.loads(text.strip())
        except Exception as e:
            logger.error(f"Erro ao classificar documento: {str(e)}")
            return {
                "categoria_aba": "desconhecido",
                "titulo_identificado": "Documento Ilegível",
                "erro": str(e),
                "confianca_leitura": 0.0
            }
