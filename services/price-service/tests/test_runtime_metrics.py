"""request_metrics_by_path — achado real, 29/09/2026: o alerta "API lenta"
do Mission Control é um p95 agregado de TODAS as rotas, não diz qual
endpoint é o culpado. Isto quebra por rota pra achar o problema de verdade."""
from src.runtime_metrics import _metrics, record_request_metric, request_metrics_by_path


def setup_function():
    _metrics.clear()


def test_ordena_do_pior_p95_pro_melhor():
    for _ in range(5):
        record_request_metric("GET", "/events", 200, 50.0)
    for _ in range(5):
        record_request_metric("GET", "/slow-thing", 200, 2000.0)

    routes = request_metrics_by_path()
    assert routes[0]["path"] == "/slow-thing"
    assert routes[0]["p95_ms"] >= 1900
    assert routes[-1]["path"] == "/events"


def test_ignora_rota_com_poucas_amostras():
    record_request_metric("GET", "/rota-rara", 200, 9999.0)
    record_request_metric("GET", "/rota-rara", 200, 9999.0)
    for _ in range(5):
        record_request_metric("GET", "/rota-normal", 200, 100.0)

    routes = request_metrics_by_path(min_requests=3)
    paths = [r["path"] for r in routes]
    assert "/rota-rara" not in paths
    assert "/rota-normal" in paths


def test_conta_erros_5xx_por_rota():
    record_request_metric("GET", "/com-erro", 500, 100.0)
    record_request_metric("GET", "/com-erro", 500, 100.0)
    record_request_metric("GET", "/com-erro", 200, 100.0)

    routes = request_metrics_by_path(min_requests=1)
    row = next(r for r in routes if r["path"] == "/com-erro")
    assert row["errors_5xx"] == 2
    assert row["requests"] == 3


def test_metodo_diferente_e_rota_separada():
    for _ in range(3):
        record_request_metric("GET", "/pets", 200, 50.0)
    for _ in range(3):
        record_request_metric("POST", "/pets", 200, 800.0)

    routes = request_metrics_by_path(min_requests=1)
    by_key = {(r["method"], r["path"]): r for r in routes}
    assert ("GET", "/pets") in by_key
    assert ("POST", "/pets") in by_key
    assert by_key[("POST", "/pets")]["p95_ms"] > by_key[("GET", "/pets")]["p95_ms"]
