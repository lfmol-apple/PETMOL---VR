"""
Testes de shopee_offer_matcher — a única linha de defesa contra publicar
uma oferta Shopee errada no grid de preços (busca por palavra-chave, sem
GTIN exato). Marca e peso divergentes têm que desqualificar SEMPRE, não
importa quão parecido o nome pareça.
"""
from src.shopee_offer_matcher import (
    extract_pack_count,
    extract_volume_ml,
    extract_weight_kg,
    extract_weight_range_kg,
    find_best_match,
    score_candidate,
)

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


class TestExtractWeightRangeKg:
    def test_extrai_faixa_de_peso_do_animal(self):
        assert extract_weight_range_kg("NexGard Antipulgas de 4,1 a 10kg para Cães") == (4.1, 10.0)

    def test_faixa_diferente_nao_confunde_so_pelo_limite_superior(self):
        # extract_weight_kg sozinho pegaria só "10kg" nos dois — a faixa
        # completa é o que distingue as duas variantes de fato.
        assert extract_weight_range_kg("NexGard de 10,1 a 25kg para Cães") == (10.1, 25.0)
        assert extract_weight_range_kg("NexGard de 4,1 a 10kg para Cães") == (4.1, 10.0)

    def test_sem_faixa_no_texto_retorna_none(self):
        assert extract_weight_range_kg("Ração Soma Nutrição 15kg Carne Adulto") is None


# Nós reais, capturados em 21/08/2026 pra "Pet Society Shampoo Hydra
# Pelos Claros Pet Society" — o caso real que motivou o desempate por
# preço: sem volume no nome PETMOL, a versão de 5L profissional e a de
# 300ml de varejo empatavam em score (sobreposição de tokens idêntica).
SHAMPOO_SEARCH_NODES = [
    {
        "itemId": 23121518406,
        "productName": "Shampoo Pet Society Hydra Groomers Pelos Claros Cachorro Gato 5L Diluição 1:10",
        "price": "554.31",
        "offerLink": "https://s.shopee.com.br/8AVT8yFEv1",
        "productLink": "https://shopee.com.br/product/688030691/23121518406",
    },
    {
        "itemId": 58201216624,
        "productName": "Shampoo Pet Society Hydra Pelos Claros para Caes e Gatos - 300ml",
        "price": "65.99",
        "offerLink": "https://s.shopee.com.br/8AVT8yFEv2",
        "productLink": "https://shopee.com.br/product/1/58201216624",
    },
]


class TestExtractVolumeMl:
    def test_extrai_ml(self):
        assert extract_volume_ml("Shampoo Pelos Claros 300ml") == 300.0

    def test_extrai_litros_convertendo_pra_ml(self):
        assert extract_volume_ml("Shampoo Hydra Groomers Pelos Claros 5L") == 5000.0

    def test_extrai_palavra_litro_por_extenso(self):
        assert extract_volume_ml("Shampoo Hydra Groomers Pelos Claros 1 Litro") == 1000.0

    def test_sem_volume_no_texto_retorna_none(self):
        assert extract_volume_ml("Shampoo Hydra Pelos Claros Pet Society") is None


class TestExtractPackCount:
    def test_extrai_comprimidos_e_tabletes(self):
        assert extract_pack_count("Nexgard para cães 3 comprimidos") == 3
        assert extract_pack_count("Nexgard 1 Tablete") == 1

    def test_extrai_pipetas(self):
        assert extract_pack_count("Advantage Max3 1 pipeta") == 1
        assert extract_pack_count("Advantage Max3 3 Pipetas") == 3

    def test_sem_quantidade_explicita_retorna_none(self):
        assert extract_pack_count("Frontline Spray para Cães e Gatos 250ml") is None


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

    def test_quantidade_de_comprimidos_diferente_desqualifica(self):
        score = score_candidate(
            "Antipulgas e Carrapatos Nexgard para Cães de 2kg a 4kg 3 comprimidos",
            "Nexgard de 2kg a 50kg 1 Tablete Antipulgas e Carrapatos Para Cachorro",
            expected_brand="NexGard",
            expected_weight_kg=2.0,
        )
        assert score is None

    def test_quantidade_de_pipetas_diferente_desqualifica(self):
        score = score_candidate(
            "Antipulgas e Carrapatos Advantage Max3 0,4ml para Cães até 4kg 1 pipeta",
            "Antipulgas Combo Advantage Max3 para Cães entre 3 até 4Kg 0,4mL - 3 Pipetas",
            expected_volume_ml=0.4,
        )
        assert score is None

    def test_quantidade_equivalente_comprimido_tablete_pode_casar(self):
        score = score_candidate(
            "Nexgard para Cães de 10,1kg a 25kg 1 comprimido",
            "Nexgard 10,1kg a 25kg com 1 Tablete Antipulgas e Carrapatos",
            expected_brand="NexGard",
            expected_weight_kg=10.1,
        )
        assert score is not None

    def test_racao_mesma_marca_e_peso_mas_porte_diferente_desqualifica(self):
        score = score_candidate(
            "Ração Royal Canin Mini Adult Cães Adultos Raças Pequenas 15kg",
            "Ração Royal Canin Maxi Adult Cães Adultos Raças Grandes 15kg",
            expected_brand="Royal Canin",
            expected_weight_kg=15.0,
        )
        assert score is None

    def test_racao_esperada_com_porte_nao_casa_com_anuncio_generico(self):
        score = score_candidate(
            "Ração Royal Canin Mini Adult Cães Adultos Raças Pequenas 15kg",
            "Ração Royal Canin Adult Cães Adultos 15kg",
            expected_brand="Royal Canin",
            expected_weight_kg=15.0,
        )
        assert score is None

    def test_racao_veterinaria_nao_casa_com_racao_comum_mesmo_peso(self):
        score = score_candidate(
            "Ração Royal Canin Veterinary Diet Urinary S/O Small Dog 7,5kg",
            "Ração Royal Canin Mini Adult Cães Adultos Raças Pequenas 7,5kg",
            expected_brand="Royal Canin",
            expected_weight_kg=7.5,
        )
        assert score is None

    def test_racao_equivalente_com_termos_distintivos_casa(self):
        score = score_candidate(
            "Ração Royal Canin Mini Adult Cães Adultos Raças Pequenas 15kg",
            "Ração Royal Canin Mini Adult para Cães Adultos de Raças Pequenas 15kg",
            expected_brand="Royal Canin",
            expected_weight_kg=15.0,
        )
        assert score is not None
        assert score >= 0.7


class TestFindBestMatch:
    def test_empate_de_score_sem_tamanho_no_nome_pega_o_de_menor_preco(self):
        # Caso real (21/08/2026): "Shampoo Hydra Pelos Claros Pet Society"
        # não tem volume no nome PETMOL — as duas versões (5L profissional
        # e 300ml varejo) empatam em sobreposição de tokens. Nunca pode
        # escolher a de R$554 só por ter aparecido primeiro na busca.
        best = find_best_match(
            SHAMPOO_SEARCH_NODES,
            "Shampoo Hydra Pelos Claros Pet Society",
            expected_brand="Pet Society",
        )
        assert best is not None
        assert best["itemId"] == 58201216624
        assert best["price"] == "65.99"

    def test_com_volume_no_nome_desqualifica_o_tamanho_errado_mesmo_sem_empate_ajudar(self):
        best = find_best_match(
            SHAMPOO_SEARCH_NODES,
            "Shampoo Hydra Pelos Claros Pet Society 300ml",
            expected_brand="Pet Society",
            expected_volume_ml=300.0,
        )
        assert best is not None
        assert best["itemId"] == 58201216624

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
