"""
Testes de shopee_offer_matcher — a única linha de defesa contra publicar
uma oferta Shopee errada no grid de preços (busca por palavra-chave, sem
GTIN exato). Marca e peso divergentes têm que desqualificar SEMPRE, não
importa quão parecido o nome pareça.
"""
from src.shopee_offer_matcher import extract_weight_kg, find_best_match, score_candidate

# Nós reais, capturados de uma busca de verdade contra a API Shopee em
# 21/08/2026 (keyword="racao para cachorro") — usados como fixture porque
# representam o tipo de ruído real que a busca devolve (marcas/pesos
# diferentes misturados no mesmo resultado).
REAL_SEARCH_NODES = [
    {
        "itemId": 23493725087,
        "productName": "Kit 3 Pacotes de Ração para Cães de Raças Pequenas Premium Especial 3,6kg + Brinde",
        "shopName": "Brincalhão Pet",
        "price": "110.67",
        "offerLink": "https://s.shopee.com.br/80C2uZsucM",
        "productLink": "https://shopee.com.br/product/954438718/23493725087",
    },
    {
        "itemId": 58204606553,
        "productName": "Ração Soma Nutrição 15kg Carne Adulto Cão Standard Com Yucca",
        "shopName": "Shopping|Rural",
        "price": "75.9",
        "offerLink": "https://s.shopee.com.br/8AVT6ssHHP",
        "productLink": "https://shopee.com.br/product/1681698080/58204606553",
    },
    {
        "itemId": 21799066797,
        "productName": "Ração Premium Especial 22% de Proteína Carne e Arroz Brincalhão 15kg",
        "shopName": "Brincalhão Pet",
        "price": "132.85",
        "offerLink": "https://s.shopee.com.br/904a6Pp6aa",
        "productLink": "https://shopee.com.br/product/954438718/21799066797",
    },
]


class TestExtractWeightKg:
    def test_extrai_kg(self):
        assert extract_weight_kg("Ração Soma Nutrição 15kg Carne Adulto") == 15.0

    def test_extrai_gramas_convertendo_pra_kg(self):
        assert extract_weight_kg("Petisco 500g") == 0.5

    def test_extrai_peso_com_virgula_decimal(self):
        assert extract_weight_kg("Kit 3,6kg + Brinde") == 3.6

    def test_sem_peso_no_texto_retorna_none(self):
        assert extract_weight_kg("Ração Premium Sabor Carne") is None


class TestScoreCandidate:
    def test_marca_diferente_desqualifica_mesmo_com_nome_parecido(self):
        score = score_candidate(
            "Ração Golden Fórmula Adulto Raças Pequenas 15kg",
            "Ração Premium Especial 22% de Proteína Carne e Arroz Brincalhão 15kg",
            expected_brand="Golden",
            expected_weight_kg=15.0,
        )
        assert score is None

    def test_peso_diferente_desqualifica_mesmo_com_marca_e_nome_batendo(self):
        score = score_candidate(
            "Ração Soma Nutrição Carne Adulto Cão 15kg",
            "Ração Soma Nutrição 1kg Carne Adulto Cão Standard",
            expected_brand="Soma",
            expected_weight_kg=15.0,
        )
        assert score is None

    def test_candidato_sem_peso_reconhecivel_desqualifica_quando_peso_esperado(self):
        score = score_candidate(
            "Ração Soma Nutrição Carne Adulto Cão 15kg",
            "Ração Soma Nutrição Carne Adulto Cão Standard Com Yucca",
            expected_brand="Soma",
            expected_weight_kg=15.0,
        )
        assert score is None

    def test_marca_e_peso_batendo_com_nome_parecido_da_score_alto(self):
        score = score_candidate(
            "Ração Soma Nutrição Carne Adulto Cão 15kg",
            "Ração Soma Nutrição 15kg Carne Adulto Cão Standard Com Yucca",
            expected_brand="Soma",
            expected_weight_kg=15.0,
        )
        assert score is not None
        assert score >= 0.7

    def test_sem_marca_nem_peso_esperados_so_avalia_sobreposicao_de_nome(self):
        score = score_candidate(
            "Ração Premium Adulto Cão Raças Pequenas",
            "Ração Premium Adulto Cão Raças Pequenas 15kg",
        )
        assert score is not None
        assert score > 0.8

    def test_nome_esperado_vazio_retorna_none(self):
        assert score_candidate("", "Qualquer Produto 15kg", expected_weight_kg=15.0) is None

    def test_tolerancia_de_peso_aceita_pequena_diferenca_de_arredondamento(self):
        # 15kg esperado, candidato com peso "14.9kg" (arredondamento de embalagem)
        score = score_candidate(
            "Ração Soma Nutrição Carne Adulto Cão 15kg",
            "Ração Soma Nutrição 14.9kg Carne Adulto Cão",
            expected_brand="Soma",
            expected_weight_kg=15.0,
        )
        assert score is not None


class TestFindBestMatch:
    def test_acha_o_candidato_certo_ignorando_marca_e_peso_errados_no_mesmo_resultado(self):
        best = find_best_match(
            REAL_SEARCH_NODES,
            "Ração Soma Nutrição Carne Adulto Cão 15kg",
            expected_brand="Soma",
            expected_weight_kg=15.0,
        )
        assert best is not None
        assert best["itemId"] == 58204606553

    def test_sem_candidato_confiavel_retorna_none_em_vez_de_apostar(self):
        best = find_best_match(
            REAL_SEARCH_NODES,
            "Ração Royal Canin Veterinary Renal Cão 10.1kg",
            expected_brand="Royal Canin",
            expected_weight_kg=10.1,
        )
        assert best is None

    def test_lista_vazia_retorna_none(self):
        assert find_best_match([], "Qualquer Produto", expected_brand="Marca") is None

    def test_min_confidence_mais_alto_pode_rejeitar_match_fraco(self):
        best = find_best_match(
            [{"itemId": 1, "productName": "Ração Golden Carne 15kg"}],
            "Ração Golden Fórmula Especial Filhotes Raças Grandes 15kg",
            expected_brand="Golden",
            expected_weight_kg=15.0,
            min_confidence=0.9,
        )
        assert best is None
