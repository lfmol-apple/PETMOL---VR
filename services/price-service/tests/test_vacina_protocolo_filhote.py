"""Caso real (nov/2026): filhote que teve as vacinas registradas depois do fato via 'Quick Add' ficava com TUDO vencido, embora em dia.
A regra de filhote (série de 3 em 3 semanas / reforço de 26 semanas) gerava datas já no passado e era aplicada até à antirrábica."""
from datetime import date, datetime

from src.health.router import _puppy_protocol_next_dose, _vaccine_follows_puppy_series

NASC = date(2026, 3, 15)            # Zara
HOJE = date(2026, 11, 17)


def test_antirrabica_e_vacinas_fora_da_serie_nao_usam_o_protocolo_de_filhote():
    assert _puppy_protocol_next_dose(NASC, datetime(2026, 7, 17), "Antirrábica Canina", today=date(2026, 7, 18)) is None
    for nome in ("Antirrabica", "Tosse dos Canis (Bordetella)", "Gripe canina", "Giárdia", "Leishmaniose", "FeLV"):
        assert _vaccine_follows_puppy_series(nome) is False, nome
    assert _vaccine_follows_puppy_series("Polivalente V8/V10") is True
    assert _vaccine_follows_puppy_series("Leptospirose") is True


def test_sugestao_ja_no_passado_nao_vale_dose_antiga_registrada_depois():
    # V8 dada em 29/06 (15 semanas) e registrada só em nov: a "próxima em 20/07" já passou -> não pode virar vencida no mesmo dia
    assert _puppy_protocol_next_dose(NASC, datetime(2026, 6, 29), "Polivalente V8/V10", today=HOJE) is None
    assert _puppy_protocol_next_dose(NASC, datetime(2026, 5, 4), "Polivalente V8/V10", today=HOJE) is None


def test_filhote_vacinado_agora_continua_com_a_serie_de_tres_semanas():
    nasc = date(2026, 10, 1)
    got = _puppy_protocol_next_dose(nasc, datetime(2026, 11, 15), "Polivalente V8/V10", today=date(2026, 11, 15))
    assert got == datetime(2026, 12, 6)                      # +21 dias, no futuro: sugestão válida


def test_sem_data_de_nascimento_ou_adulto_nao_usa_protocolo():
    assert _puppy_protocol_next_dose(None, datetime(2026, 6, 1), "V10", today=HOJE) is None
    assert _puppy_protocol_next_dose(date(2024, 1, 1), datetime(2026, 6, 1), "V10", today=HOJE) is None
